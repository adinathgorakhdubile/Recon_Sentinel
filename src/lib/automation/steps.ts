import { db } from "@/lib/db";
import { logActivity } from "@/lib/repo/activity";
import { runImport, autoDetectImporter } from "@/lib/recon/pipeline";
import { evaluateScope } from "@/lib/recon/scope";
import { upsertIntelBatch } from "@/lib/assets/repo";
import { correlateAssets } from "@/lib/assets/correlation";
import { enrichAsset } from "@/lib/assets/intel";
import { uid } from "@/lib/seed";
import type { Asset, Finding, Program } from "@/types";
import type { StepDefinition, StepExecCtx, StepExecResult, WhenExpr } from "./types";

async function loadProgram(programId: string | null): Promise<Program | null> {
  if (!programId) return null;
  return (await db.programs.get(programId)) ?? null;
}

async function assetsFor(programId: string | null): Promise<Asset[]> {
  if (!programId) return [];
  return db.assets.where("programId").equals(programId).toArray();
}

// ---------------------------------------------------------------------------
// Predicate evaluation (for `when` and `branch` gating)
// ---------------------------------------------------------------------------

function readPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

export function evaluateWhen(expr: WhenExpr, output: Record<string, unknown>): boolean {
  const actual = readPath(output, expr.path);
  switch (expr.op) {
    case "exists": return actual !== undefined && actual !== null;
    case "eq": return actual === expr.value;
    case "neq": return actual !== expr.value;
    case "gt": return Number(actual) > Number(expr.value);
    case "gte": return Number(actual) >= Number(expr.value);
    case "lt": return Number(actual) < Number(expr.value);
    case "lte": return Number(actual) <= Number(expr.value);
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

const importStep: StepDefinition = {
  kind: "import",
  label: "Import",
  description: "Run an importer over provided text and normalize into assets.",
  defaults: () => ({ importerId: "generic-txt-hosts", format: "txt", filename: "input.txt", strictScope: false }),
  async execute({ run, step, log }: StepExecCtx): Promise<StepExecResult> {
    const cfg = step.config as {
      importerId?: string; format?: "json" | "jsonl" | "csv" | "txt" | "xml";
      filename?: string; strictScope?: boolean; content?: string; contentFromInput?: string;
    };
    const program = await loadProgram(run.programId);
    if (!program) { log("error", "No active program"); throw new Error("no program"); }

    const content =
      cfg.content ??
      (cfg.contentFromInput ? String(run.input?.[cfg.contentFromInput] ?? "") : "");
    if (!content) {
      log("warn", "No content — skipping import");
      return { status: "skipped" };
    }

    let importerId = cfg.importerId;
    let format = cfg.format ?? "txt";
    if (!importerId || importerId === "auto") {
      const auto = autoDetectImporter(cfg.filename ?? "input.txt", content);
      if (!auto) throw new Error("Could not auto-detect importer");
      importerId = auto.importer.id;
      format = auto.format;
      log("info", `Auto-detected importer: ${auto.importer.name} (${auto.reason})`);
    }

    const r = await runImport(program, content, {
      importerId,
      format,
      filename: cfg.filename ?? "input.txt",
      strictScope: cfg.strictScope,
    });
    log("success", `Imported ${r.stats.imported} · dup ${r.stats.duplicates} · oos ${r.stats.outOfScope}`);
    return {
      output: {
        runId: r.id,
        imported: r.stats.imported,
        duplicates: r.stats.duplicates,
        outOfScope: r.stats.outOfScope,
        parsed: r.stats.parsed,
      },
    };
  },
};

const normalizeStep: StepDefinition = {
  kind: "normalize",
  label: "Normalize",
  description: "Deduplicate tags and lower-case asset names across the workspace.",
  defaults: () => ({}),
  async execute({ run, log }) {
    const assets = await assetsFor(run.programId);
    let touched = 0;
    for (const a of assets) {
      const tags = Array.from(new Set((a.tags ?? []).map((t) => t.trim()).filter(Boolean)));
      const name = a.name.trim();
      if (tags.length !== a.tags.length || name !== a.name) {
        await db.assets.put({ ...a, tags, name });
        touched++;
      }
    }
    log("success", `Normalized ${touched}/${assets.length} assets`);
    return { output: { normalized: touched, total: assets.length } };
  },
};

const correlateStep: StepDefinition = {
  kind: "correlate",
  label: "Correlate",
  description: "Rebuild asset relationships (derived-from, hosts, relates-to).",
  defaults: () => ({}),
  async execute({ run, log }) {
    if (!run.programId) return { status: "skipped" };
    const assets = await assetsFor(run.programId);
    const intel = await upsertIntelBatch(assets);
    await correlateAssets(run.programId, intel);
    log("success", `Correlated ${intel.length} assets`);
    return { output: { correlated: intel.length } };
  },
};

const validateScopeStep: StepDefinition = {
  kind: "validate-scope",
  label: "Validate Scope",
  description: "Re-evaluate every asset against the current scope rules.",
  defaults: () => ({}),
  async execute({ run, log }) {
    const program = await loadProgram(run.programId);
    if (!program) return { status: "skipped" };
    const assets = await assetsFor(run.programId);
    let changed = 0, inScope = 0, oos = 0, unknown = 0;
    for (const a of assets) {
      const verdict = evaluateScope(program, a.name);
      const nextStatus =
        verdict === "in-scope" ? (a.status === "new" ? "new" : a.status) :
        verdict === "out-of-scope" ? "out-of-scope" :
        a.status;
      if (verdict === "in-scope") inScope++;
      else if (verdict === "out-of-scope") oos++;
      else unknown++;
      if (nextStatus !== a.status) {
        await db.assets.put({ ...a, status: nextStatus });
        changed++;
      }
    }
    log("success", `Scope: ${inScope} in · ${oos} out · ${unknown} unknown (${changed} updated)`);
    return { output: { inScope, outOfScope: oos, unknown, changed } };
  },
};

const enrichStep: StepDefinition = {
  kind: "enrich",
  label: "Enrich Assets",
  description: "Recompute intel: risk score, health, technology fingerprint.",
  defaults: () => ({}),
  async execute({ run, log }) {
    if (!run.programId) return { status: "skipped" };
    const assets = await assetsFor(run.programId);
    const rows = assets.map((a) => enrichAsset(a));
    await db.assetIntel.bulkPut(rows);
    const high = rows.filter((r) => r.riskScore >= 70).length;
    log("success", `Enriched ${rows.length} · ${high} high-risk`);
    return { output: { enriched: rows.length, highRisk: high } };
  },
};

const generateFindingsStep: StepDefinition = {
  kind: "generate-findings",
  label: "Generate Findings",
  description: "Draft findings for high-risk assets that don't already have one.",
  defaults: () => ({ minRisk: 70, maxDrafts: 10 }),
  async execute({ run, step, log }) {
    if (!run.programId) return { status: "skipped" };
    const cfg = step.config as { minRisk?: number; maxDrafts?: number };
    const minRisk = cfg.minRisk ?? 70;
    const maxDrafts = cfg.maxDrafts ?? 10;
    const intel = await db.assetIntel.where("programId").equals(run.programId).toArray();
    const existing = await db.findings.where("programId").equals(run.programId).toArray();
    const seen = new Set(existing.map((f) => f.affectedAsset.toLowerCase()));
    const targets = intel
      .filter((i) => i.riskScore >= minRisk)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, maxDrafts);
    let drafted = 0;
    for (const t of targets) {
      const asset = await db.assets.get(t.assetId);
      if (!asset) continue;
      if (seen.has(asset.name.toLowerCase())) continue;
      const finding: Omit<Finding, "pocAttachments"> & { pocAttachmentIds: string[] } = {
        id: uid("fnd"),
        programId: run.programId,
        title: `Automated: elevated risk on ${asset.name}`,
        severity: t.riskScore >= 85 ? "high" : "medium",
        affectedAsset: asset.name,
        evidence: `Risk score ${t.riskScore}. Technologies: ${(t.technologies ?? []).join(", ") || "n/a"}.`,
        reproductionSteps: "Auto-generated from recon intelligence. Validate manually.",
        impact: "Pending analyst review.",
        status: "draft",
        tags: ["auto", "automation"],
        pocAttachmentIds: [],
        createdAt: Date.now(),
      };
      await db.findings.put(finding);
      drafted++;
    }
    log("success", `Drafted ${drafted} finding(s) from ${targets.length} candidate(s)`);
    return { output: { drafted, candidates: targets.length } };
  },
};

const updateDashboardStep: StepDefinition = {
  kind: "update-dashboard",
  label: "Update Dashboard",
  description: "Bump the dashboard refresh marker so widgets recompute.",
  defaults: () => ({}),
  async execute({ log }) {
    await db.meta.put({ key: "dashboardRefreshAt", value: Date.now() });
    log("success", "Dashboard marker refreshed");
    return { output: { at: Date.now() } };
  },
};

const delayStep: StepDefinition = {
  kind: "delay",
  label: "Delay",
  description: "Wait a fixed number of milliseconds (scheduling hook).",
  defaults: () => ({ ms: 1000 }),
  async execute({ step, signal, log }) {
    const ms = Number((step.config as { ms?: number }).ms ?? 1000);
    log("info", `Waiting ${ms}ms`);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
    });
    return { output: { waitedMs: ms } };
  },
};

const approvalStep: StepDefinition = {
  kind: "approval",
  label: "Manual Approval",
  description: "Pause the run until an operator approves in the UI.",
  defaults: () => ({ message: "Awaiting operator approval" }),
  async execute({ step, log }) {
    const message = String((step.config as { message?: string }).message ?? "Awaiting approval");
    log("warn", `Pausing for approval: ${message}`);
    return { status: "waiting", waiting: { message } };
  },
};

const branchStep: StepDefinition = {
  kind: "branch",
  label: "Branch",
  description: "Evaluate a predicate; downstream branches are gated in the executor.",
  defaults: () => ({ when: { path: "import.imported", op: "gt", value: 0 } }),
  async execute({ run, step, log }) {
    const expr = (step.config as { when?: WhenExpr }).when;
    if (!expr) return { output: { verdict: true } };
    const verdict = evaluateWhen(expr, run.output);
    log("info", `Branch verdict: ${verdict}`);
    return { output: { verdict } };
  },
};

const notifyStep: StepDefinition = {
  kind: "notify",
  label: "Notify",
  description: "Emit a workspace activity event (visible in Timeline).",
  defaults: () => ({ summary: "Workflow milestone reached" }),
  async execute({ run, step, log }) {
    const summary = String((step.config as { summary?: string }).summary ?? "Workflow notification");
    await logActivity({
      programId: run.programId,
      entityType: "recon",
      entityId: run.id,
      action: "ai",
      summary,
      meta: { workflowId: run.workflowId, output: run.output },
    });
    log("success", `Notified: ${summary}`);
    return { output: { summary } };
  },
};

const customStep: StepDefinition = {
  kind: "custom",
  label: "Custom (plug-in)",
  description: "Placeholder for future tool-runner and AI-decision plug-ins.",
  defaults: () => ({}),
  async execute({ log }) {
    log("info", "Custom step reserved for future plug-ins — no-op.");
    return { output: { noop: true } };
  },
};

const REGISTRY: Record<string, StepDefinition> = {};
function register(def: StepDefinition) { REGISTRY[def.kind] = def; }
[
  importStep, normalizeStep, correlateStep, validateScopeStep,
  enrichStep, generateFindingsStep, updateDashboardStep,
  delayStep, approvalStep, branchStep, notifyStep, customStep,
].forEach(register);

export function getStepDefinition(kind: string): StepDefinition | undefined {
  return REGISTRY[kind];
}

export function listStepDefinitions(): StepDefinition[] {
  return Object.values(REGISTRY);
}

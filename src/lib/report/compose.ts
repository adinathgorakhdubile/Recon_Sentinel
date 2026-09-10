/**
 * Auto-compose engine. Given a ReportDoc and the workspace it lives in,
 * resolves each section's sources into rendered markdown. Sections whose
 * `auto` flag is false are left alone so hand edits survive.
 */

import { db } from "@/lib/db";
import { listEvidence } from "@/lib/evidence/repo";
import type { Asset, Finding, Note, Program } from "@/types";
import type { HttpItem } from "@/lib/http/types";
import type { EvidenceItem } from "@/lib/evidence/types";
import type { PocDoc } from "@/lib/poc/types";
import { pocToMarkdown } from "@/lib/poc/export";
import type { ReportDoc, ReportSection } from "./types";

export interface ReportContext {
  program: Program | null;
  findings: Finding[];
  assets: Asset[];
  notes: Note[];
  http: HttpItem[];
  evidence: EvidenceItem[];
  pocs: PocDoc[];
}

export async function loadReportContext(programId: string | null): Promise<ReportContext> {
  const [program, findings, assets, notes, http, evidence, pocs] = await Promise.all([
    programId ? db.programs.get(programId) : Promise.resolve(null),
    db.findings.where("programId").equals(programId as string).toArray(),
    db.assets.where("programId").equals(programId as string).toArray(),
    db.notes.where("programId").equals(programId as string).toArray(),
    db.http.where("programId").equals(programId as string).toArray(),
    listEvidence(programId),
    db.pocs.where("programId").equals(programId as string).toArray(),
  ]);
  return {
    program: (program as Program | undefined) ?? null,
    findings: findings as unknown as Finding[],
    assets,
    notes,
    http: http as HttpItem[],
    evidence,
    pocs: (pocs as PocDoc[]).filter((p) => !p.isTemplate),
  };
}

function severityCounts(findings: Finding[]): Record<string, number> {
  const acc: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) acc[f.severity] = (acc[f.severity] ?? 0) + 1;
  return acc;
}

function findingById(ctx: ReportContext, id: string): Finding | undefined {
  return ctx.findings.find((f) => f.id === id);
}
function assetById(ctx: ReportContext, id: string): Asset | undefined {
  return ctx.assets.find((a) => a.id === id);
}
function noteById(ctx: ReportContext, id: string): Note | undefined {
  return ctx.notes.find((n) => n.id === id);
}
function httpById(ctx: ReportContext, id: string): HttpItem | undefined {
  return ctx.http.find((h) => h.id === id);
}
function evidenceById(ctx: ReportContext, id: string): EvidenceItem | undefined {
  return ctx.evidence.find((e) => e.id === id);
}
function pocById(ctx: ReportContext, id: string): PocDoc | undefined {
  return ctx.pocs.find((p) => p.id === id);
}

function fmtHttp(h: HttpItem): string {
  const lines: string[] = [];
  lines.push(`\`\`\`http`);
  lines.push(`${h.request.method} ${h.request.url}`);
  for (const hdr of h.request.headers ?? []) lines.push(`${hdr.name}: ${hdr.value}`);
  if (h.request.body?.text) {
    lines.push("");
    lines.push(h.request.body.text);
  }
  lines.push(`\`\`\``);
  if (h.response) {
    lines.push("");
    lines.push(`_Response: ${h.response.status ?? "?"} ${h.response.statusText ?? ""}_`);
  }
  return lines.join("\n");
}

function scopeMarkdown(p: Program | null): string {
  if (!p) return "_No program context._";
  return [
    `- **Target root:** ${p.targetRoot || "_not set_"}`,
    `- **In-scope:** ${p.inScope.join(", ") || "_none_"}`,
    `- **Out-of-scope:** ${p.outScope.join(", ") || "_none_"}`,
    "",
    "### Rules of engagement",
    p.rules || "_not documented_",
    "",
    "### Rate limits",
    p.rateLimits || "_not documented_",
    "",
    "### Safe harbor",
    p.safeHarbor || "_not documented_",
  ].join("\n");
}

async function timelineMarkdown(programId: string | null, limit = 30): Promise<string> {
  const rows = await db.activity
    .where("programId")
    .equals(programId as string)
    .reverse()
    .sortBy("ts");
  const slice = rows.slice(0, limit);
  if (!slice.length) return "_No activity recorded._";
  return slice
    .map((r) => `- \`${new Date(r.ts).toISOString()}\` **${r.entityType}** — ${r.action}: ${r.summary}`)
    .join("\n");
}

function findingDetailMarkdown(ctx: ReportContext, f: Finding): string {
  const lines: string[] = [];
  lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
  lines.push("");
  const meta: string[] = [];
  meta.push(`**Severity:** ${f.severity.toUpperCase()}`);
  if (f.cvss) meta.push(`**CVSS:** \`${f.cvss}\``);
  if (f.cwe) meta.push(`**CWE:** ${f.cwe}`);
  if (f.owaspRefs?.length) meta.push(`**OWASP:** ${f.owaspRefs.join(", ")}`);
  meta.push(`**Status:** ${f.status}`);
  meta.push(`**Affected asset:** \`${f.affectedAsset || "unspecified"}\``);
  lines.push(meta.join("  \n"));
  lines.push("");

  if (f.impact) { lines.push("**Impact**", "", f.impact, ""); }
  if (f.evidence) { lines.push("**Evidence**", "", f.evidence, ""); }
  if (f.reproductionSteps) { lines.push("**Reproduction**", "", f.reproductionSteps, ""); }
  if (f.remediation) { lines.push("**Remediation**", "", f.remediation, ""); }

  // Cross-linked artifacts
  const linkedPocs = ctx.pocs.filter((p) => p.findingId === f.id);
  if (linkedPocs.length) {
    lines.push("**Linked PoCs**");
    for (const p of linkedPocs) lines.push(`- ${p.title} (v${p.version})`);
    lines.push("");
  }
  return lines.join("\n");
}

async function composeSection(section: ReportSection, ctx: ReportContext, doc: ReportDoc): Promise<string> {
  const explicitFindings = section.sources
    .filter((s) => s.refType === "finding")
    .map((s) => findingById(ctx, s.refId))
    .filter((f): f is Finding => !!f);

  const explicitAssets = section.sources
    .filter((s) => s.refType === "asset")
    .map((s) => assetById(ctx, s.refId))
    .filter((a): a is Asset => !!a);

  const explicitHttp = section.sources
    .filter((s) => s.refType === "http")
    .map((s) => httpById(ctx, s.refId))
    .filter((h): h is HttpItem => !!h);

  const explicitEv = section.sources
    .filter((s) => s.refType === "evidence")
    .map((s) => evidenceById(ctx, s.refId))
    .filter((e): e is EvidenceItem => !!e);

  const explicitPocs = section.sources
    .filter((s) => s.refType === "poc")
    .map((s) => pocById(ctx, s.refId))
    .filter((p): p is PocDoc => !!p);

  const explicitNotes = section.sources
    .filter((s) => s.refType === "note")
    .map((s) => noteById(ctx, s.refId))
    .filter((n): n is Note => !!n);

  const scopedFindings = doc.findingIds.length
    ? ctx.findings.filter((f) => doc.findingIds.includes(f.id))
    : ctx.findings;

  switch (section.kind) {
    case "cover": {
      const p = ctx.program;
      const rows = [
        `# ${doc.title}`,
        "",
        p ? `**Program:** ${p.name}  ` : "",
        doc.meta.client ? `**Client:** ${doc.meta.client}  ` : "",
        doc.meta.engagement ? `**Engagement:** ${doc.meta.engagement}  ` : "",
        `**Format:** ${doc.format}  `,
        `**Version:** ${doc.meta.version ?? `v${doc.version}`}  `,
        doc.meta.classification ? `**Classification:** ${doc.meta.classification}  ` : "",
        doc.meta.authors.length ? `**Authors:** ${doc.meta.authors.join(", ")}  ` : "",
        `**Generated:** ${new Date().toISOString()}`,
      ];
      return rows.filter(Boolean).join("\n");
    }
    case "executive-summary": {
      const c = severityCounts(scopedFindings);
      return [
        `A total of **${scopedFindings.length} finding${scopedFindings.length === 1 ? "" : "s"}** were identified during this engagement.`,
        "",
        `- Critical: ${c.critical}`,
        `- High: ${c.high}`,
        `- Medium: ${c.medium}`,
        `- Low: ${c.low}`,
        `- Informational: ${c.info}`,
        "",
        "> Fill this section with a plain-language summary tailored to the reader.",
      ].join("\n");
    }
    case "scope":
      return scopeMarkdown(ctx.program);
    case "methodology":
      return [
        "Testing followed a phased approach aligned with PTES / NIST SP 800-115:",
        "",
        "1. **Scope intelligence** — target enumeration and rules of engagement review.",
        "2. **Passive reconnaissance** — open-source and non-intrusive data gathering.",
        "3. **Active discovery** — controlled probing of exposed assets.",
        "4. **Enumeration** — service, endpoint, and technology fingerprinting.",
        "5. **Vulnerability analysis** — validation of candidate issues against real behaviour.",
        "6. **Exploitation** — proof-of-concept development within authorized limits.",
        "7. **Evidence & reporting** — artifact capture, correlation, and communication.",
      ].join("\n");
    case "asset-inventory": {
      const list = explicitAssets.length ? explicitAssets : ctx.assets;
      if (!list.length) return "_No assets recorded._";
      const rows = ["| Asset | Type | Status | Confidence | Source |", "|---|---|---|---|---|"];
      for (const a of list) rows.push(`| \`${a.name}\` | ${a.type} | ${a.status} | ${a.confidence} | ${a.source || "—"} |`);
      return rows.join("\n");
    }
    case "findings-summary": {
      if (!scopedFindings.length) return "_No findings drafted._";
      const rows = ["| # | Severity | Title | Status | Affected |", "|---|---|---|---|---|"];
      scopedFindings.forEach((f, i) =>
        rows.push(`| ${i + 1} | ${f.severity.toUpperCase()} | ${f.title} | ${f.status} | \`${f.affectedAsset || "?"}\` |`),
      );
      return rows.join("\n");
    }
    case "finding-detail": {
      const list = explicitFindings.length ? explicitFindings : scopedFindings;
      if (!list.length) return "_No findings selected._";
      return list.map((f) => findingDetailMarkdown(ctx, f)).join("\n\n---\n\n");
    }
    case "http-evidence": {
      if (!explicitHttp.length) return "_Attach HTTP requests to this section to render them here._";
      return explicitHttp
        .map((h) => `#### ${h.title ?? `${h.request.method} ${h.request.url}`}\n\n${fmtHttp(h)}`)
        .join("\n\n");
    }
    case "poc": {
      const list = explicitPocs.length
        ? explicitPocs
        : doc.findingIds.length
          ? ctx.pocs.filter((p) => p.findingId && doc.findingIds.includes(p.findingId))
          : [];
      if (!list.length) return "_No PoCs linked. Attach one from the PoC Builder._";
      return list.map((p) => pocToMarkdown(p)).join("\n\n---\n\n");
    }
    case "media-gallery": {
      const list = explicitEv.length ? explicitEv : ctx.evidence.filter((e) => e.mime.startsWith("image/") || e.kind === "screenshot");
      if (!list.length) return "_No screenshots attached._";
      return list
        .map((e) => `- 🖼 **${e.title}** — \`${e.filename ?? e.id}\` (${e.mime}, sha256 \`${e.sha256.slice(0, 12)}…\`)`)
        .join("\n");
    }
    case "timeline":
      return await timelineMarkdown(doc.programId);
    case "remediation": {
      const list = explicitFindings.length ? explicitFindings : scopedFindings;
      if (!list.length) return "_No findings — nothing to remediate._";
      return list
        .map((f) => `### ${f.title}\n\n${f.remediation || "_Remediation not documented._"}`)
        .join("\n\n");
    }
    case "references": {
      const refs = new Set<string>();
      const list = explicitFindings.length ? explicitFindings : scopedFindings;
      for (const f of list) {
        for (const r of f.owaspRefs ?? []) refs.add(r);
      }
      for (const p of explicitPocs) for (const r of p.references) refs.add(r);
      if (!refs.size) return "_No references recorded._";
      return Array.from(refs).map((r) => `- ${r}`).join("\n");
    }
    case "appendix": {
      const parts: string[] = [];
      if (ctx.evidence.length) {
        parts.push("### Evidence artifacts");
        parts.push(
          ctx.evidence
            .map((e) => `- \`${e.filename ?? e.id}\` — ${e.kind} · ${e.mime} · sha256 \`${e.sha256.slice(0, 16)}…\``)
            .join("\n"),
        );
      }
      if (explicitNotes.length) {
        parts.push("### Notes");
        parts.push(explicitNotes.map((n) => `#### ${n.title}\n\n${n.body}`).join("\n\n"));
      }
      return parts.join("\n\n") || "_No appendix content._";
    }
    case "markdown":
      return section.body || "_Add markdown content._";
  }
}

/**
 * Regenerate `body` for every section with `auto === true`. Returns a new
 * ReportDoc — caller decides whether to persist it.
 */
export async function autoComposeReport(doc: ReportDoc): Promise<ReportDoc> {
  const ctx = await loadReportContext(doc.programId);
  const sections: ReportSection[] = [];
  for (const s of doc.sections) {
    if (!s.auto) { sections.push(s); continue; }
    const body = await composeSection(s, ctx, doc);
    sections.push({ ...s, body });
  }
  return { ...doc, sections };
}

/** Render a report to a single markdown document (respects `included`). */
export async function reportToMarkdown(doc: ReportDoc): Promise<string> {
  const ctx = await loadReportContext(doc.programId);
  const parts: string[] = [];
  for (const s of doc.sections) {
    if (!s.included) continue;
    const body = s.auto ? await composeSection(s, ctx, doc) : s.body;
    if (s.kind !== "cover") parts.push(`## ${s.title}`);
    parts.push("");
    parts.push(body);
    parts.push("");
  }
  return parts.join("\n");
}

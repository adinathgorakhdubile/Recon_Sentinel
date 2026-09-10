import { db } from "@/lib/db";
import { logActivity } from "@/lib/repo/activity";
import { searchService } from "@/lib/search";
import { uid } from "@/lib/seed";
import type { Asset, Program } from "@/types";
import { importerById, listImporters } from "./importers";
import { evaluateScope, extractHost } from "./scope";
import { upsertIntelBatch } from "@/lib/assets/repo";
import { correlateAssets } from "@/lib/assets/correlation";
import { detectFormat } from "./parsers";
import {
  toParseResult,
  type AssetCandidate,
  type ImportFormat,
  type ImportOptions,
  type Importer,
  type ParseResult,
  type ReconRun,
  type ReconRunStats,
} from "./types";

/**
 * Run a recon import: parse → normalize → dedup → scope-validate → persist →
 * activity + search. Tool-execution modules added later should call this same
 * entry point after producing an `AssetCandidate[]`.
 */
export async function runImport(
  program: Program,
  rawInput: string,
  opts: ImportOptions,
): Promise<ReconRun> {
  const importer = importerById(opts.importerId);
  if (!importer) throw new Error(`Unknown importer: ${opts.importerId}`);

  const result = safeParse(importer, rawInput, opts.format);
  return persistCandidates(program, result, {
    stage: importer.stage,
    importerId: importer.id,
    format: opts.format,
    filename: opts.filename,
    strictScope: opts.strictScope ?? false,
  });
}

// ---------------------------------------------------------------------------
// Preview + batch
// ---------------------------------------------------------------------------

export interface PreviewRow {
  candidate: AssetCandidate;
  verdict: "in-scope" | "out-of-scope" | "unknown";
  duplicate: boolean;
}

export interface PreviewOutcome {
  importerId: string;
  format: ImportFormat;
  filename: string;
  parsed: number;
  imported: number;
  duplicates: number;
  outOfScope: number;
  errors: string[];
  warnings: string[];
  rows: PreviewRow[];
  /** First N candidates for the preview table. */
}

/** Parse-only preview so the UI can show counts + samples before committing. */
export async function previewImport(
  program: Program,
  rawInput: string,
  opts: ImportOptions,
  limit = 100,
): Promise<PreviewOutcome> {
  const importer = importerById(opts.importerId);
  if (!importer) throw new Error(`Unknown importer: ${opts.importerId}`);

  const result = safeParse(importer, rawInput, opts.format);
  const existing = await db.assets.where("programId").equals(program.id).toArray();
  const existingNames = new Set(existing.map((a) => a.name.toLowerCase()));
  const seen = new Set<string>();

  let imported = 0, duplicates = 0, oos = 0;
  const rows: PreviewRow[] = [];
  for (const c of result.candidates) {
    const key = c.name.trim().toLowerCase();
    if (!key) continue;
    const dup = existingNames.has(key) || seen.has(key);
    if (!dup) seen.add(key);
    const verdict = evaluateScope(program, c.name);
    if (dup) duplicates++;
    else if (verdict === "out-of-scope") {
      oos++;
      if (!opts.strictScope) imported++;
    } else imported++;
    if (rows.length < limit) rows.push({ candidate: c, verdict, duplicate: dup });
  }

  return {
    importerId: importer.id,
    format: opts.format,
    filename: opts.filename,
    parsed: result.candidates.length,
    imported,
    duplicates,
    outOfScope: oos,
    errors: result.errors,
    warnings: result.warnings,
    rows,
  };
}

export interface BatchItem {
  filename: string;
  content: string;
  importerId: string;
  format: ImportFormat;
}

export interface BatchProgress {
  index: number;
  total: number;
  item: BatchItem;
  run?: ReconRun;
  error?: string;
}

/** Sequentially run a set of imports; reports progress via callback. */
export async function runImportBatch(
  program: Program,
  items: BatchItem[],
  strictScope: boolean,
  onProgress?: (p: BatchProgress) => void,
): Promise<ReconRun[]> {
  const out: ReconRun[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const run = await runImport(program, item.content, {
        importerId: item.importerId,
        format: item.format,
        filename: item.filename,
        strictScope,
      });
      out.push(run);
      onProgress?.({ index: i, total: items.length, item, run });
    } catch (e) {
      onProgress?.({ index: i, total: items.length, item, error: (e as Error).message });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auto-detection: pick the best importer for a dropped file.
// ---------------------------------------------------------------------------

export interface AutoDetectResult {
  importer: Importer;
  format: ImportFormat;
  score: number;
  reason: string;
}

export function autoDetectImporter(filename: string, content: string): AutoDetectResult | null {
  const fmt = detectFormat(filename, content);
  const fnl = filename.toLowerCase();
  const sample = content.slice(0, 4000).toLowerCase();
  let best: AutoDetectResult | null = null;

  for (const imp of listImporters()) {
    if (!imp.accepts.includes(fmt)) continue;
    let score = 1;
    const reasons: string[] = [`accepts ${fmt}`];
    for (const h of imp.detectHints?.filename ?? []) {
      if (fnl.includes(h.toLowerCase())) { score += 5; reasons.push(`filename~${h}`); }
    }
    for (const h of imp.detectHints?.content ?? []) {
      if (sample.includes(h.toLowerCase())) { score += 3; reasons.push(`content~${h}`); }
    }
    if (!best || score > best.score) {
      best = { importer: imp, format: fmt, score, reason: reasons.join(", ") };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function safeParse(importer: Importer, input: string, format: ImportFormat): ParseResult {
  try {
    return toParseResult(importer.parse(input, format));
  } catch (e) {
    return { candidates: [], errors: [(e as Error).message], warnings: [] };
  }
}

interface PersistCtx {
  stage: ReconRun["stage"];
  importerId: string;
  format: ReconRun["format"];
  filename: string;
  strictScope: boolean;
}

async function persistCandidates(
  program: Program,
  parsed: ParseResult,
  ctx: PersistCtx,
): Promise<ReconRun> {
  const candidates = parsed.candidates;
  const stats: ReconRunStats = {
    parsed: candidates.length,
    imported: 0,
    duplicates: 0,
    outOfScope: 0,
    invalid: 0,
    errors: parsed.errors.length ? parsed.errors.slice(0, 25) : undefined,
    warnings: parsed.warnings.length ? parsed.warnings.slice(0, 25) : undefined,
  };
  const sample: string[] = [];

  // Preload existing asset names for O(1) dedup within the program.
  const existing = await db.assets.where("programId").equals(program.id).toArray();
  const seenNames = new Set<string>(existing.map((a) => a.name.toLowerCase()));
  const byName = new Map(existing.map((a) => [a.name.toLowerCase(), a] as const));

  const toInsert: Asset[] = [];
  const toTouch: Asset[] = [];
  for (const c of candidates) {
    const name = c.name?.trim();
    if (!name) { stats.invalid++; continue; }

    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      // Preserve source attribution across re-imports so provenance history
      // reflects every tool that surfaced this asset.
      stats.duplicates++;
      const existingAsset = byName.get(key);
      if (existingAsset) {
        const merged = mergeSourceInto(existingAsset, c, ctx);
        if (merged) toTouch.push(merged);
      }
      continue;
    }
    seenNames.add(key);

    const verdict = evaluateScope(program, name);
    if (verdict === "out-of-scope") {
      stats.outOfScope++;
      if (ctx.strictScope) continue;
    }

    const asset: Asset = {
      id: uid("ast"),
      programId: program.id,
      name,
      type: c.type,
      source: c.source || ctx.importerId,
      confidence: c.confidence ?? "medium",
      status: verdict === "in-scope" ? "new" : verdict === "out-of-scope" ? "out-of-scope" : "triaging",
      tags: uniqueTags([...(c.tags ?? []), `stage:${ctx.stage}`, `via:${ctx.importerId}`]),
      notes: c.notes ?? "",
      createdAt: Date.now(),
    };
    toInsert.push(asset);
    stats.imported++;
    if (sample.length < 5) sample.push(name);
  }

  const runId = uid("run");

  if (toInsert.length) {
    await db.assets.bulkPut(toInsert);
    for (let i = 0; i < toInsert.length; i++) {
      const cand = candidates.find((c) => c.name.trim() === toInsert[i].name);
      if (cand?.meta) (toInsert[i] as any).meta = cand.meta;
    }
    const intel = await upsertIntelBatch(toInsert, runId);
    await correlateAssets(program.id, intel);
    for (const a of toInsert) await searchService.indexAsset(a);
  }
  if (toTouch.length) {
    await db.assets.bulkPut(toTouch);
    for (const a of toTouch) await searchService.indexAsset(a);
  }

  const run: ReconRun = {
    id: runId,
    programId: program.id,
    stage: ctx.stage,
    importerId: ctx.importerId,
    filename: ctx.filename,
    format: ctx.format,
    createdAt: Date.now(),
    stats,
    sample,
  };
  await db.reconRuns.put(run);

  await logActivity({
    programId: program.id,
    entityType: "recon",
    entityId: run.id,
    action: "imported",
    summary: `Recon import (${ctx.stage}) · ${stats.imported} new, ${stats.duplicates} dup, ${stats.outOfScope} oos`,
    meta: { importerId: ctx.importerId, filename: ctx.filename, stats },
  });

  return run;
}

/** Merge tags + source attribution when an existing asset is re-observed. */
function mergeSourceInto(existing: Asset, c: AssetCandidate, ctx: PersistCtx): Asset | null {
  const nextTags = uniqueTags([
    ...(existing.tags ?? []),
    ...(c.tags ?? []),
    `via:${ctx.importerId}`,
  ]);
  const nextSource = existing.source.includes(c.source)
    ? existing.source
    : `${existing.source}, ${c.source || ctx.importerId}`;
  const changed =
    nextSource !== existing.source ||
    nextTags.length !== (existing.tags ?? []).length;
  if (!changed) return null;
  return { ...existing, source: nextSource, tags: nextTags };
}

function uniqueTags(tags: string[]): string[] {
  const set = new Set<string>();
  for (const t of tags) {
    const v = t.trim();
    if (v) set.add(v);
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

export interface StageStats {
  imported: number;
  runs: number;
  lastRunAt: number | null;
  duplicates: number;
  outOfScope: number;
}

export async function stageStatsForProgram(programId: string): Promise<Record<string, StageStats>> {
  const runs = await db.reconRuns.where("programId").equals(programId).toArray();
  const out: Record<string, StageStats> = {};
  for (const r of runs) {
    const cur = out[r.stage] ?? { imported: 0, runs: 0, lastRunAt: null, duplicates: 0, outOfScope: 0 };
    cur.imported += r.stats.imported;
    cur.duplicates += r.stats.duplicates;
    cur.outOfScope += r.stats.outOfScope;
    cur.runs += 1;
    cur.lastRunAt = Math.max(cur.lastRunAt ?? 0, r.createdAt);
    out[r.stage] = cur;
  }
  return out;
}

export interface CoverageSummary {
  totalAssets: number;
  inScope: number;
  outOfScope: number;
  unknown: number;
  subdomains: number;
  endpoints: number;
  ips: number;
}

export function summarizeCoverage(program: Program, assets: Asset[]): CoverageSummary {
  const out: CoverageSummary = {
    totalAssets: assets.length,
    inScope: 0,
    outOfScope: 0,
    unknown: 0,
    subdomains: 0,
    endpoints: 0,
    ips: 0,
  };
  for (const a of assets) {
    const v = evaluateScope(program, a.name);
    if (v === "in-scope") out.inScope++;
    else if (v === "out-of-scope") out.outOfScope++;
    else out.unknown++;
    if (a.type === "subdomain") out.subdomains++;
    else if (a.type === "endpoint") out.endpoints++;
    else if (a.type === "ip") out.ips++;
  }
  return out;
}

export { extractHost };

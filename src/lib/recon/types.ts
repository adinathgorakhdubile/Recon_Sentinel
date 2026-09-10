import type { AssetType, Confidence, ID } from "@/types";

/**
 * A pipeline stage is a phase of reconnaissance. Every importer belongs to
 * exactly one stage; execution modules (subfinder, amass, httpx, naabu, katana,
 * nuclei, ffuf, gau, waybackurls, …) added later plug into the same stage
 * registry without touching the core pipeline.
 */
export type ReconStageId =
  | "passive"
  | "dns"
  | "http"
  | "port"
  | "crawl"
  | "content"
  | "vuln";

export interface ReconStage {
  id: ReconStageId;
  name: string;
  description: string;
  /** Which asset types this stage typically produces. */
  produces: AssetType[];
}

/** File formats an importer can consume. */
export type ImportFormat = "json" | "jsonl" | "csv" | "txt" | "xml";

/**
 * A parse result carries not just the normalized candidates but also
 * per-record errors and warnings surfaced by the tool-specific parser. Every
 * importer's `parse()` may return this or the legacy `AssetCandidate[]`.
 */
export interface ParseResult {
  candidates: AssetCandidate[];
  errors: string[];
  warnings: string[];
}

export function toParseResult(x: AssetCandidate[] | ParseResult): ParseResult {
  return Array.isArray(x)
    ? { candidates: x, errors: [], warnings: [] }
    : { candidates: x.candidates ?? [], errors: x.errors ?? [], warnings: x.warnings ?? [] };
}

/**
 * A normalized candidate emitted by an importer. The pipeline handles
 * deduplication, scope validation, activity logging and persistence — the
 * importer only converts raw tool output into these records.
 */
export interface AssetCandidate {
  name: string;
  type: AssetType;
  source: string;
  confidence?: Confidence;
  tags?: string[];
  notes?: string;
  /** Free-form metadata (status code, tech, ports, …) preserved for later graph work. */
  meta?: Record<string, unknown>;
}

export interface Importer {
  id: string;
  name: string;
  stage: ReconStageId;
  description: string;
  accepts: ImportFormat[];
  /**
   * Parse a raw text payload into normalized candidates (or a ParseResult
   * carrying per-record errors and warnings). Importers must be pure — no
   * persistence, no scope decisions, no activity logging.
   */
  parse(input: string, format: ImportFormat): AssetCandidate[] | ParseResult;
  /**
   * Optional. Filename/content hints used by the batch importer to auto-pick
   * the best importer for each dropped file. All hints are lower-cased and
   * matched with `includes`.
   */
  detectHints?: {
    filename?: string[];
    content?: string[];
  };
}

export interface ReconRunStats {
  parsed: number;
  imported: number;
  duplicates: number;
  outOfScope: number;
  invalid: number;
  /** Parser-level errors surfaced by the tool adapter. */
  errors?: string[];
  /** Non-fatal notes surfaced by the tool adapter. */
  warnings?: string[];
}

export interface ReconRun {
  id: ID;
  programId: ID;
  stage: ReconStageId;
  importerId: string;
  filename: string;
  format: ImportFormat;
  createdAt: number;
  stats: ReconRunStats;
  /** First few names imported, for the timeline / dashboard preview. */
  sample: string[];
  notes?: string;
}

export interface ImportOptions {
  importerId: string;
  format: ImportFormat;
  filename: string;
  /** When true, out-of-scope assets are dropped instead of imported as `out-of-scope`. */
  strictScope?: boolean;
}

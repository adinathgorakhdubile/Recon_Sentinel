/**
 * Report Engine — composable, evidence-backed pentest reports.
 *
 * A ReportDoc is a first-class workspace record: an ordered list of
 * sections, each with its own markdown body and a list of typed
 * "sources" pointing at Findings, Assets, Evidence, HTTP items, PoCs
 * and Notes. Every section can be regenerated from its sources
 * (auto-compose) or hand-edited while keeping the trace back to the
 * underlying artifacts. This split — sources + body + trace — is the
 * foundation future AI-assisted authoring, collaborative review,
 * digital signing, version diffing, and platform-specific exporters
 * can build on without redesigning the core.
 */

export type ReportFormatId =
  | "custom"
  | "detailed"
  | "executive"
  | "bug-bounty"
  | "hackerone"
  | "bugcrowd"
  | "intigriti";

export type ReportSectionKind =
  | "cover"
  | "executive-summary"
  | "scope"
  | "methodology"
  | "asset-inventory"
  | "findings-summary"
  | "finding-detail"
  | "http-evidence"
  | "poc"
  | "media-gallery"
  | "timeline"
  | "remediation"
  | "references"
  | "appendix"
  | "markdown";

export type ReportSourceType =
  | "finding"
  | "asset"
  | "evidence"
  | "http"
  | "poc"
  | "note"
  | "program";

export interface ReportSource {
  id: string;
  refType: ReportSourceType;
  refId: string;
  caption?: string;
  /** For finding-detail sections: pins this source to the primary finding. */
  role?: "primary" | "supporting";
}

export interface ReportSection {
  id: string;
  order: number;
  kind: ReportSectionKind;
  title: string;
  /** Rendered markdown body. Users can override auto-composed content. */
  body: string;
  sources: ReportSource[];
  /** Content was produced by auto-compose (false once the user edits). */
  auto: boolean;
  /** Include in the exported document / TOC. */
  included: boolean;
  meta?: Record<string, unknown>;
}

export interface ReportMeta {
  client?: string;
  engagement?: string;
  authors: string[];
  distribution?: string;
  classification?: string;
  version?: string;
  cvssScheme?: "3.1" | "4.0";
  reportedAt?: string;
}

export interface ReportVersion {
  version: number;
  createdAt: number;
  note?: string;
  snapshot: Omit<ReportDoc, "history">;
}

export interface ReportDoc {
  id: string;
  programId: string | null;
  title: string;
  format: ReportFormatId;
  meta: ReportMeta;
  sections: ReportSection[];
  /** Findings scoped into this report. Used by "finding-detail" sections. */
  findingIds: string[];
  history: ReportVersion[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReportValidationIssue {
  level: "error" | "warn";
  message: string;
  sectionId?: string;
  findingId?: string;
}

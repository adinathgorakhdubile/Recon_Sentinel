import type { LinkableType } from "@/types";

export type EvidenceKind =
  | "screenshot"
  | "recording"
  | "http-request"
  | "http-response"
  | "har"
  | "log"
  | "scan-result"
  | "code"
  | "payload"
  | "terminal"
  | "pdf"
  | "document"
  | "archive"
  | "other";

/** Metadata-only row. The binary payload lives in `evidenceBlobs`. */
export interface EvidenceItem {
  id: string;
  programId: string | null;
  /** Current version's blob id (points into evidenceBlobs). */
  blobId: string;
  /** Sha256 of the current version's blob. Hex, lowercase. */
  sha256: string;
  title: string;
  description?: string;
  kind: EvidenceKind;
  mime: string;
  sizeBytes: number;
  /** Original filename at upload time. */
  filename?: string;
  /** Optional collection / folder path, e.g. "recon/httpx". */
  folder: string;
  tags: string[];
  /** Free-form structured metadata (e.g. HTTP status, URL, tool source). */
  meta: Record<string, unknown>;
  /** Version index — 1 for the initial upload. */
  version: number;
  /** Ids of superseded versions (blob rows). Most recent last. */
  history: EvidenceVersion[];
  createdAt: number;
  updatedAt: number;
}

export interface EvidenceVersion {
  blobId: string;
  sha256: string;
  sizeBytes: number;
  mime: string;
  version: number;
  createdAt: number;
  note?: string;
}

export interface EvidenceBlob {
  id: string;
  evidenceId: string;
  data: Blob;
  createdAt: number;
}

export type AnnotationKind = "comment" | "annotation" | "box" | "arrow" | "highlight" | "blur" | "text";

export interface AnnotationRegion {
  /** Percentage coordinates (0..100) so shapes scale with the image. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Second point for arrows / lines (also percentage). */
  x2?: number;
  y2?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
}

export interface EvidenceAnnotation {
  id: string;
  evidenceId: string;
  kind: AnnotationKind;
  body: string;
  region?: AnnotationRegion;
  author?: string;
  createdAt: number;
}

/** Entities that evidence can be linked to. Mirrors LinkableType. */
export type EvidenceLinkTarget = LinkableType;

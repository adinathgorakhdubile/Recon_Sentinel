/**
 * Proof-of-Concept Builder — core types.
 *
 * Designed as a first-class, reusable document that ties together the
 * Recon Sentinel workspace (Findings, Assets, HTTP Library, Evidence
 * Vault, Media Library, Timeline). The shape is intentionally forward-
 * looking so future AI-assisted authoring, automated replay, browser
 * automation, vulnerability verification, and report generation can plug
 * into the builder without redesigning the core schema.
 */

import type { LinkableType, Severity } from "@/types";

export type PocStepKind =
  | "instruction"
  | "http"
  | "screenshot"
  | "media"
  | "payload"
  | "terminal"
  | "code"
  | "note";

export type PocStatus = "draft" | "in-review" | "validated" | "archived";

/**
 * A reference to another workspace record. Uses the same LinkableType
 * enum as EntityLink so a step attachment can point at anything we can
 * already link to elsewhere.
 */
export interface PocAttachmentRef {
  id: string;
  /** Type of the referenced workspace record. */
  refType: Extract<LinkableType, "evidence" | "http" | "asset" | "finding" | "note">;
  refId: string;
  caption?: string;
  createdAt: number;
}

export interface PocStep {
  id: string;
  order: number;
  title: string;
  kind: PocStepKind;
  /** Markdown-rich body describing what to do at this step. */
  body: string;
  /** Optional language hint for code / terminal blocks (bash, http, js…). */
  language?: string;
  /** What the tester should observe if the step succeeds. */
  expected?: string;
  /** Inline snippet for code / terminal / payload steps. */
  snippet?: string;
  attachments: PocAttachmentRef[];
  /** Reserved for future automation runners (Playwright, replay engines). */
  runner?: {
    kind: "manual" | "http-replay" | "browser" | "shell";
    /** Serialized runner config — free-form until an engine is wired up. */
    config?: Record<string, unknown>;
  };
  createdAt: number;
  updatedAt: number;
}

export interface PocComment {
  id: string;
  author?: string;
  body: string;
  resolved?: boolean;
  /** Optional step id the comment is anchored to. */
  stepId?: string;
  createdAt: number;
}

/** Snapshot of a PoC at a point in time (excluding self-referential fields). */
export interface PocVersion {
  version: number;
  createdAt: number;
  note?: string;
  snapshot: Omit<PocDoc, "history" | "comments">;
}

/**
 * A Proof-of-Concept document. `isTemplate === true` marks a reusable
 * template row (lives in the same table for a single source of truth).
 */
export interface PocDoc {
  id: string;
  programId: string | null;
  title: string;
  summary: string;
  severity: Severity;
  status: PocStatus;
  impact: string;
  remediation: string;
  prerequisites: string;
  references: string[];
  tags: string[];
  /** Primary finding this PoC proves. */
  findingId?: string;
  /** Assets involved in the reproduction. */
  assetIds: string[];
  steps: PocStep[];
  comments: PocComment[];
  history: PocVersion[];
  version: number;
  isTemplate: boolean;
  templateSourceId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PocValidationIssue {
  level: "error" | "warn";
  message: string;
  stepId?: string;
}

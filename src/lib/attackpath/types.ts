/**
 * Attack Path modeling — types.
 *
 * Attack paths compose Knowledge-Graph nodes into ordered, human-authored
 * scenarios that describe how an operator might traverse a target from an
 * entry point to one or more objectives. Steps may reference any workspace
 * artifact (asset, finding, HTTP request, PoC, evidence, note) and carry
 * metadata about trust boundaries, privilege changes, and pivots.
 *
 * We deliberately DO NOT claim exploitability — a path is a hypothesis
 * grounded in observed evidence. Validation workflows and AI-assisted
 * chain simulation will plug in later without altering this schema.
 */

import type { LinkableType, Severity } from "@/types";

export type AttackStepKind =
  | "entry"          // initial foothold / access surface
  | "recon"          // information gathering
  | "vuln"           // vulnerability observation
  | "exploit"        // action that changes state (candidate, unvalidated)
  | "pivot"          // move between hosts / networks / services
  | "privilege"      // privilege change (auth, sudo, role, token)
  | "lateral"        // lateral movement inside a trust zone
  | "exfil"          // data extraction
  | "objective"      // goal reached
  | "note";          // free-form annotation

export type TrustLevel = "public" | "authenticated" | "privileged" | "admin" | "internal" | "root";

export type PathStatus = "draft" | "hypothesis" | "validated" | "invalidated" | "archived";

export type AttachRefType = Extract<
  LinkableType,
  "asset" | "finding" | "evidence" | "http" | "poc" | "note" | "report"
>;

export interface AttackAttachment {
  id: string;
  refType: AttachRefType;
  refId: string;
  caption?: string;
}

export interface AttackStep {
  id: string;
  order: number;
  kind: AttackStepKind;
  title: string;
  /** Markdown body — what the operator does / observes at this step. */
  body: string;
  /** Optional graph node the step is anchored to (from the Knowledge Graph). */
  nodeId?: string;
  /** Trust level BEFORE the step executes. */
  trustBefore?: TrustLevel;
  /** Trust level AFTER the step executes. */
  trustAfter?: TrustLevel;
  /** Prerequisites — step ids that must complete first. Enables DAGs later. */
  prerequisites: string[];
  /** Expected/observed result. */
  expected?: string;
  /** Technologies / CVEs / CWE tags relevant to this step. */
  tags: string[];
  /** Confidence in the step's feasibility (0..1). */
  confidence?: number;
  /** Workflow stage bucket for filtering. */
  stage?: "scope" | "recon" | "enum" | "vuln" | "exploit" | "post" | "report";
  attachments: AttackAttachment[];
  createdAt: number;
}

export interface AttackObjective {
  id: string;
  title: string;
  description?: string;
  impact?: Severity;
  achieved?: boolean;
}

export interface TrustBoundary {
  id: string;
  label: string;
  /** Step ids that sit inside this boundary. */
  stepIds: string[];
  color?: string;
  note?: string;
}

export interface AttackAnnotation {
  id: string;
  stepId?: string;
  body: string;
  author?: string;
  createdAt: number;
}

export interface AttackPath {
  id: string;
  programId: string | null;
  name: string;
  summary?: string;
  status: PathStatus;
  severity?: Severity;
  /** Free-form ordered list — DAG semantics live in step.prerequisites. */
  steps: AttackStep[];
  objectives: AttackObjective[];
  boundaries: TrustBoundary[];
  annotations: AttackAnnotation[];
  tags: string[];
  /** Snapshot of the source graph that seeded the path (optional). */
  seedNodeId?: string;
  /** Auto-generated flag — false once the user edits. */
  auto: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AttackPathFilters {
  query: string;
  severities: Severity[];
  stages: NonNullable<AttackStep["stage"]>[];
  tags: string[];
  technologies: string[];
  status: PathStatus[];
}

export const DEFAULT_PATH_FILTERS: AttackPathFilters = {
  query: "",
  severities: [],
  stages: [],
  tags: [],
  technologies: [],
  status: [],
};

export const STEP_KIND_LABELS: Record<AttackStepKind, string> = {
  entry: "Entry",
  recon: "Recon",
  vuln: "Vulnerability",
  exploit: "Exploit",
  pivot: "Pivot",
  privilege: "Privilege Change",
  lateral: "Lateral Movement",
  exfil: "Exfiltration",
  objective: "Objective",
  note: "Note",
};

export const STEP_KIND_COLORS: Record<AttackStepKind, string> = {
  entry: "rgb(56,189,248)",
  recon: "rgb(148,163,184)",
  vuln: "rgb(251,191,36)",
  exploit: "rgb(244,63,94)",
  pivot: "rgb(168,85,247)",
  privilege: "rgb(236,72,153)",
  lateral: "rgb(139,92,246)",
  exfil: "rgb(248,113,113)",
  objective: "rgb(52,211,153)",
  note: "rgb(203,213,225)",
};

export const TRUST_ORDER: TrustLevel[] = ["public", "authenticated", "privileged", "admin", "internal", "root"];

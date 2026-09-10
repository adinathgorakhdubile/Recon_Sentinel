import type { ID } from "@/types";
import type { ImportFormat, ReconStageId } from "@/lib/recon/types";

/**
 * The automation engine is a modular workflow runner. It orchestrates recon
 * work by chaining discrete steps — Import → Normalize → Correlate → Validate
 * Scope → Enrich → Generate Findings → Update Dashboard — without embedding
 * any external tool execution. Future tool runners, AI decision nodes and
 * continuous-monitoring triggers plug into the same `StepDefinition` registry.
 */

export type StepKind =
  // I/O
  | "import"          // Run an importer over provided content
  | "normalize"       // Dedup / tag-normalize existing assets
  | "correlate"       // Rebuild relationship graph for touched assets
  | "validate-scope"  // Re-evaluate scope for existing assets
  | "enrich"          // Recompute asset intel (risk, health, kind)
  | "generate-findings" // Draft findings from high-risk intel
  | "update-dashboard"  // Refresh dashboard config / analytics timestamp
  // control
  | "delay"           // Wait for N milliseconds (scheduling hook)
  | "approval"        // Pause until a user approves
  | "branch"          // Conditional branching on prior step output
  | "notify"          // Emit a workspace notification (activity)
  | "custom";         // Future: AI / local tool runner plug-in

export type StepStatus =
  | "pending"
  | "running"
  | "waiting"      // waiting for approval / external event
  | "succeeded"
  | "skipped"
  | "failed"
  | "cancelled";

export type RunStatus =
  | "queued"
  | "running"
  | "paused"        // manually paused OR waiting on approval
  | "succeeded"
  | "failed"
  | "cancelled";

export interface RetryPolicy {
  maxAttempts: number;
  /** ms between retries; multiplied by attempt when `backoff` is `exponential`. */
  delayMs: number;
  backoff: "fixed" | "exponential";
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 1, delayMs: 500, backoff: "fixed" };

/** A single node in a workflow. Config shape depends on `kind`. */
export interface WorkflowStep {
  id: ID;
  kind: StepKind;
  name: string;
  /** Free-form config — validated by the executor for its kind. */
  config: Record<string, unknown>;
  retry?: RetryPolicy;
  /** When true, failure does not fail the whole run. */
  continueOnError?: boolean;
  /**
   * Conditional gating. When present, this step is skipped unless the
   * expression evaluates truthy against the run context.
   */
  when?: WhenExpr;
  /** For `branch` kind: which step ids to run if condition truthy / falsy. */
  branches?: { onTrue: ID[]; onFalse: ID[] };
}

/**
 * Tiny declarative predicate used for conditional branching. Kept declarative
 * (no eval) so workflows can be serialized safely and reasoned about by the UI.
 */
export interface WhenExpr {
  path: string;           // dot path into ctx.output, e.g. "import.imported"
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "exists";
  value?: number | string | boolean;
}

export interface Workflow {
  id: ID;
  name: string;
  description?: string;
  programId: ID | null;   // null = template / cross-program
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  /** Template it originated from, if any. */
  templateId?: string;
  tags?: string[];
}

export interface StepLog {
  ts: number;
  level: "info" | "warn" | "error" | "success";
  message: string;
  data?: Record<string, unknown>;
}

export interface StepRun {
  stepId: ID;
  name: string;
  kind: StepKind;
  status: StepStatus;
  startedAt: number | null;
  endedAt: number | null;
  attempts: number;
  logs: StepLog[];
  /** Structured output keyed by step id — visible to later steps via `WhenExpr`. */
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowRun {
  id: ID;
  workflowId: ID;
  workflowName: string;
  programId: ID | null;
  status: RunStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Step ids in the order they will (or did) execute. */
  order: ID[];
  steps: Record<ID, StepRun>;
  /** Currently-executing step id, when `status === "running"`. */
  currentStepId: ID | null;
  /** Aggregate output written by each step under its id. */
  output: Record<string, unknown>;
  /** Any input payload the run was launched with. */
  input?: Record<string, unknown>;
  /** True when a step is `waiting` on approval. */
  awaitingApproval?: { stepId: ID; message: string } | null;
  trigger: "manual" | "scheduled" | "chained" | "resumed";
}

// ---------------------------------------------------------------------------
// Step registry
// ---------------------------------------------------------------------------

export interface StepExecCtx {
  run: WorkflowRun;
  step: WorkflowStep;
  /** Append a structured log entry. */
  log: (level: StepLog["level"], message: string, data?: Record<string, unknown>) => void;
  /** Cooperative-cancellation signal — executors should check periodically. */
  signal: AbortSignal;
}

export interface StepExecResult {
  output?: Record<string, unknown>;
  /**
   * `waiting` — pauses the run pending external resolution (approval).
   * `skipped` — the step decided to skip itself.
   * `succeeded` — normal completion.
   */
  status?: Extract<StepStatus, "succeeded" | "waiting" | "skipped">;
  waiting?: { message: string };
}

export interface StepDefinition {
  kind: StepKind;
  label: string;
  description: string;
  /** Default config used by the visual builder. */
  defaults: () => Record<string, unknown>;
  /** Pure executor — no DOM, no toasts. */
  execute: (ctx: StepExecCtx) => Promise<StepExecResult>;
}

// ---------------------------------------------------------------------------
// Import step config (shape only — the executor lives in steps.ts)
// ---------------------------------------------------------------------------

export interface ImportStepConfig {
  importerId: string;
  format: ImportFormat;
  filename: string;
  strictScope?: boolean;
  content?: string;         // when set, used directly
  contentFromInput?: string; // otherwise read from run.input[<key>]
  stage?: ReconStageId;
}

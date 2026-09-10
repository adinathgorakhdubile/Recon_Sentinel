import { db } from "@/lib/db";
import { logActivity } from "@/lib/repo/activity";
import { uid } from "@/lib/seed";
import { getStepDefinition, evaluateWhen } from "./steps";
import type {
  StepLog,
  StepRun,
  Workflow,
  WorkflowRun,
  WorkflowStep,
} from "./types";
import { DEFAULT_RETRY } from "./types";

/**
 * A minimal, in-memory workflow engine. It's intentionally simple:
 *
 * - One active controller per run (queue below serializes launches).
 * - Executors are pure `StepDefinition.execute()` calls — retries, gating,
 *   branching and approval pauses are handled here.
 * - Pause/resume is cooperative: the current step aborts, its state persists,
 *   and `resumeRun()` picks up from the next pending step.
 *
 * Future tool runners and AI decision nodes plug in through the `steps`
 * registry without touching this file.
 */

type Listener = (run: WorkflowRun) => void;
const listeners = new Set<Listener>();
export function subscribeRuns(l: Listener) { listeners.add(l); return () => listeners.delete(l); }
function emit(run: WorkflowRun) { listeners.forEach((l) => l(run)); }

/** Track live abort controllers so pause/cancel can interrupt work in flight. */
const controllers = new Map<string, AbortController>();

// Sequential queue — one run at a time keeps Dexie writes predictable.
let queueTail: Promise<void> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueTail.then(fn, fn);
  queueTail = next.then(() => undefined, () => undefined);
  return next;
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export interface StartOptions {
  input?: Record<string, unknown>;
  trigger?: WorkflowRun["trigger"];
}

export async function startWorkflow(workflow: Workflow, opts: StartOptions = {}): Promise<WorkflowRun> {
  const run: WorkflowRun = {
    id: uid("wfr"),
    workflowId: workflow.id,
    workflowName: workflow.name,
    programId: workflow.programId,
    status: "queued",
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    order: workflow.steps.map((s) => s.id),
    steps: Object.fromEntries(
      workflow.steps.map((s) => [s.id, blankStepRun(s)] as const),
    ),
    currentStepId: null,
    output: {},
    input: opts.input,
    awaitingApproval: null,
    trigger: opts.trigger ?? "manual",
  };
  await persist(run);
  await logActivity({
    programId: run.programId,
    entityType: "recon",
    entityId: run.id,
    action: "created",
    summary: `Workflow queued: ${workflow.name}`,
    meta: { workflowId: workflow.id, trigger: run.trigger },
  });
  emit(run);
  enqueue(() => execute(run, workflow));
  return run;
}

function blankStepRun(step: WorkflowStep): StepRun {
  return {
    stepId: step.id,
    name: step.name,
    kind: step.kind,
    status: "pending",
    startedAt: null,
    endedAt: null,
    attempts: 0,
    logs: [],
  };
}

async function execute(run: WorkflowRun, workflow: Workflow): Promise<void> {
  const controller = new AbortController();
  controllers.set(run.id, controller);
  run.status = "running";
  run.startedAt = run.startedAt ?? Date.now();
  await persist(run);
  emit(run);

  try {
    for (const stepId of run.order) {
      if (controller.signal.aborted) break;
      const step = workflow.steps.find((s) => s.id === stepId);
      if (!step) continue;
      const stepRun = run.steps[stepId];
      if (stepRun.status === "succeeded" || stepRun.status === "skipped") continue;

      // Skipped by prior branch verdict?
      if (stepRun.status === "cancelled") continue;

      // `when` gate
      if (step.when && !evaluateWhen(step.when, run.output)) {
        markSkipped(stepRun, "Gated by `when` predicate");
        await persist(run);
        emit(run);
        continue;
      }

      run.currentStepId = stepId;
      await runStep(run, step, controller.signal);
      await persist(run);
      emit(run);

      if (run.steps[stepId].status === "waiting") {
        run.status = "paused";
        run.awaitingApproval = {
          stepId,
          message: String(run.steps[stepId].logs.at(-1)?.message ?? "Awaiting approval"),
        };
        await persist(run);
        emit(run);
        controllers.delete(run.id);
        return;
      }

      if (run.steps[stepId].status === "failed" && !step.continueOnError) {
        run.status = "failed";
        run.endedAt = Date.now();
        run.currentStepId = null;
        await persist(run);
        emit(run);
        controllers.delete(run.id);
        await logActivity({
          programId: run.programId,
          entityType: "recon",
          entityId: run.id,
          action: "updated",
          summary: `Workflow failed: ${run.workflowName}`,
          meta: { stepId, error: run.steps[stepId].error },
        });
        return;
      }

      // Branch gating: cascade skip to the branch NOT taken.
      if (step.kind === "branch" && step.branches) {
        const verdict = Boolean((run.output[step.id] as { verdict?: boolean } | undefined)?.verdict);
        const toSkip = verdict ? step.branches.onFalse : step.branches.onTrue;
        for (const skipId of toSkip) {
          const sr = run.steps[skipId];
          if (sr && sr.status === "pending") markSkipped(sr, "Skipped by branch");
        }
        await persist(run);
        emit(run);
      }
    }

    if (controller.signal.aborted) {
      run.status = "cancelled";
    } else {
      const anyFailed = Object.values(run.steps).some((s) => s.status === "failed");
      run.status = anyFailed ? "failed" : "succeeded";
    }
  } catch (e) {
    run.status = "failed";
    const cur = run.currentStepId ? run.steps[run.currentStepId] : undefined;
    if (cur) cur.error = (e as Error).message;
  }

  run.endedAt = Date.now();
  run.currentStepId = null;
  await persist(run);
  emit(run);
  controllers.delete(run.id);
  await logActivity({
    programId: run.programId,
    entityType: "recon",
    entityId: run.id,
    action: run.status === "succeeded" ? "completed" : "updated",
    summary: `Workflow ${run.status}: ${run.workflowName}`,
    meta: { workflowId: workflow.id, status: run.status, output: run.output },
  });
}

async function runStep(run: WorkflowRun, step: WorkflowStep, parentSignal: AbortSignal): Promise<void> {
  const def = getStepDefinition(step.kind);
  const stepRun = run.steps[step.id];
  stepRun.status = "running";
  stepRun.startedAt = stepRun.startedAt ?? Date.now();
  pushLog(stepRun, "info", `Starting ${step.name}`);
  emit(run);

  if (!def) {
    stepRun.status = "failed";
    stepRun.error = `No executor registered for kind: ${step.kind}`;
    stepRun.endedAt = Date.now();
    pushLog(stepRun, "error", stepRun.error);
    return;
  }

  const retry = step.retry ?? DEFAULT_RETRY;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= Math.max(1, retry.maxAttempts); attempt++) {
    stepRun.attempts = attempt;
    if (parentSignal.aborted) { stepRun.status = "cancelled"; stepRun.endedAt = Date.now(); return; }

    try {
      const result = await def.execute({
        run,
        step,
        signal: parentSignal,
        log: (level, message, data) => pushLog(stepRun, level, message, data),
      });
      stepRun.output = result.output ?? {};
      run.output[step.id] = { ...(result.output ?? {}), _kind: step.kind };
      // The generic step-kind alias makes `WhenExpr` paths ergonomic
      // (e.g. `import.imported` regardless of stepId).
      run.output[step.kind] = { ...(run.output[step.kind] as object ?? {}), ...(result.output ?? {}) };

      if (result.status === "waiting") {
        stepRun.status = "waiting";
        pushLog(stepRun, "warn", result.waiting?.message ?? "Waiting for external event");
      } else if (result.status === "skipped") {
        stepRun.status = "skipped";
        pushLog(stepRun, "info", "Step skipped by executor");
      } else {
        stepRun.status = "succeeded";
        pushLog(stepRun, "success", `Completed ${step.name}`);
      }
      stepRun.endedAt = Date.now();
      return;
    } catch (e) {
      lastErr = e;
      pushLog(stepRun, "error", `Attempt ${attempt} failed: ${(e as Error).message}`);
      if (attempt < retry.maxAttempts) {
        const wait = retry.backoff === "exponential" ? retry.delayMs * attempt : retry.delayMs;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  stepRun.status = "failed";
  stepRun.error = (lastErr as Error | undefined)?.message ?? "unknown error";
  stepRun.endedAt = Date.now();
}

function pushLog(sr: StepRun, level: StepLog["level"], message: string, data?: Record<string, unknown>) {
  sr.logs.push({ ts: Date.now(), level, message, data });
  if (sr.logs.length > 200) sr.logs.splice(0, sr.logs.length - 200);
}

function markSkipped(sr: StepRun, reason: string) {
  sr.status = "skipped";
  sr.startedAt = sr.startedAt ?? Date.now();
  sr.endedAt = Date.now();
  pushLog(sr, "info", reason);
}

// ---------------------------------------------------------------------------
// Pause / resume / cancel / approve
// ---------------------------------------------------------------------------

export async function pauseRun(runId: string): Promise<void> {
  const run = await db.workflowRuns.get(runId);
  if (!run || run.status !== "running") return;
  controllers.get(runId)?.abort();
  run.status = "paused";
  await db.workflowRuns.put(run);
  emit(run);
}

export async function cancelRun(runId: string): Promise<void> {
  const run = await db.workflowRuns.get(runId);
  if (!run) return;
  controllers.get(runId)?.abort();
  run.status = "cancelled";
  run.endedAt = Date.now();
  await db.workflowRuns.put(run);
  emit(run);
}

export async function resumeRun(runId: string): Promise<void> {
  const run = await db.workflowRuns.get(runId);
  if (!run) return;
  if (run.status !== "paused") return;
  const workflow = await db.workflows.get(run.workflowId);
  if (!workflow) return;
  // Convert any `waiting` step to `succeeded` so we move on.
  if (run.awaitingApproval) {
    const sr = run.steps[run.awaitingApproval.stepId];
    if (sr && sr.status === "waiting") {
      sr.status = "succeeded";
      sr.endedAt = Date.now();
      pushLog(sr, "success", "Approved by operator");
    }
    run.awaitingApproval = null;
  }
  run.trigger = "resumed";
  await db.workflowRuns.put(run);
  emit(run);
  enqueue(() => execute(run, workflow));
}

export async function rejectApproval(runId: string, reason?: string): Promise<void> {
  const run = await db.workflowRuns.get(runId);
  if (!run || !run.awaitingApproval) return;
  const sr = run.steps[run.awaitingApproval.stepId];
  if (sr) {
    sr.status = "failed";
    sr.error = reason ?? "Rejected by operator";
    sr.endedAt = Date.now();
    pushLog(sr, "error", sr.error);
  }
  run.awaitingApproval = null;
  run.status = "failed";
  run.endedAt = Date.now();
  await db.workflowRuns.put(run);
  emit(run);
}

async function persist(run: WorkflowRun): Promise<void> {
  await db.workflowRuns.put(run);
}

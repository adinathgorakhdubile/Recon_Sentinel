import { CheckCircle2, CircleDashed, Clock, Loader2, Pause, Play, StopCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelRun, pauseRun, rejectApproval, resumeRun } from "@/lib/automation/engine";
import type { StepRun, WorkflowRun } from "@/lib/automation/types";

const STATUS_STYLES: Record<string, string> = {
  queued: "border-muted-foreground/40 text-muted-foreground",
  running: "border-primary/60 text-primary",
  paused: "border-warning/60 text-warning",
  succeeded: "border-success/60 text-success",
  failed: "border-destructive/60 text-destructive",
  cancelled: "border-muted-foreground/40 text-muted-foreground",
};

export function RunMonitor({ run }: { run: WorkflowRun }) {
  const duration =
    run.startedAt && run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` :
    run.startedAt ? `${((Date.now() - run.startedAt) / 1000).toFixed(0)}s live` : "—";
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] text-muted-foreground">RUN</span>
            <span className="font-medium">{run.workflowName}</span>
            <span className={`mono text-[10px] rounded border px-1.5 py-0.5 uppercase ${STATUS_STYLES[run.status]}`}>
              {run.status}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mono">
            id={run.id.slice(0, 12)} · {new Date(run.createdAt).toLocaleString()} · {duration} · via {run.trigger}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {run.status === "running" && (
            <Button size="sm" variant="outline" onClick={() => pauseRun(run.id)}>
              <Pause className="h-3.5 w-3.5 mr-1" /> Pause
            </Button>
          )}
          {run.status === "paused" && (
            <>
              <Button size="sm" onClick={() => resumeRun(run.id)}>
                <Play className="h-3.5 w-3.5 mr-1" /> Resume
              </Button>
              {run.awaitingApproval && (
                <Button size="sm" variant="ghost" onClick={() => rejectApproval(run.id, "Rejected by operator")}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              )}
            </>
          )}
          {(run.status === "running" || run.status === "paused" || run.status === "queued") && (
            <Button size="sm" variant="ghost" onClick={() => cancelRun(run.id)}>
              <StopCircle className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {run.awaitingApproval && (
        <div className="rounded-md border border-warning/40 bg-warning/10 text-warning px-3 py-2 text-xs">
          <strong className="mono">APPROVAL REQUIRED.</strong> {run.awaitingApproval.message}
        </div>
      )}

      <div className="space-y-1.5">
        {run.order.map((sid) => {
          const s = run.steps[sid];
          if (!s) return null;
          return <StepRow key={sid} step={s} isCurrent={run.currentStepId === sid} />;
        })}
      </div>
    </div>
  );
}

function StepRow({ step, isCurrent }: { step: StepRun; isCurrent: boolean }) {
  const Icon = statusIcon(step.status);
  return (
    <div className={`rounded-md border px-3 py-2 ${isCurrent ? "border-primary/50 bg-primary/5" : "border-border/60"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor(step.status)}`} />
        <span className="mono text-[10px] rounded bg-muted/40 px-1.5 py-0.5">{step.kind}</span>
        <span className="text-sm">{step.name}</span>
        <span className="ml-auto mono text-[10px] text-muted-foreground uppercase">{step.status}</span>
        {step.attempts > 1 && <span className="mono text-[10px] text-warning">×{step.attempts}</span>}
      </div>
      {step.logs.length > 0 && (
        <details className="mt-1.5">
          <summary className="text-[11px] text-muted-foreground cursor-pointer">
            {step.logs.length} log entries {step.error ? `· error: ${step.error}` : ""}
          </summary>
          <div className="mt-1 space-y-0.5 max-h-56 overflow-auto font-mono text-[11px]">
            {step.logs.map((l, i) => (
              <div key={i} className={logColor(l.level)}>
                [{new Date(l.ts).toLocaleTimeString()}] {l.level.toUpperCase()} · {l.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function statusIcon(s: string) {
  switch (s) {
    case "running": return Loader2;
    case "waiting": return Clock;
    case "succeeded": return CheckCircle2;
    case "failed": return XCircle;
    case "skipped": return CircleDashed;
    case "cancelled": return StopCircle;
    default: return CircleDashed;
  }
}

function iconColor(s: string): string {
  switch (s) {
    case "running": return "text-primary animate-spin";
    case "waiting": return "text-warning";
    case "succeeded": return "text-success";
    case "failed": return "text-destructive";
    case "cancelled": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

function logColor(l: string): string {
  switch (l) {
    case "error": return "text-destructive";
    case "warn": return "text-warning";
    case "success": return "text-success";
    default: return "text-muted-foreground";
  }
}

import type { Severity, FindingStatus, AssetStatus, Confidence } from "@/types";
import type { Priority } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const SEVERITY: Record<Severity, string> = {
  info: "bg-muted text-muted-foreground border-border",
  low: "bg-success/10 text-success border-success/40",
  medium: "bg-warning/10 text-warning border-warning/40",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/40",
  critical: "bg-destructive/15 text-destructive border-destructive/50",
};

const PRIORITY: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-accent/10 text-accent border-accent/40",
  high: "bg-warning/10 text-warning border-warning/40",
  critical: "bg-destructive/15 text-destructive border-destructive/50",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn("chip uppercase tracking-wider", SEVERITY[severity])}>
      {severity}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn("chip uppercase tracking-wider", PRIORITY[priority])}>
      {priority}
    </span>
  );
}

const STATUS: Record<FindingStatus | AssetStatus, string> = {
  draft: "text-muted-foreground border-border bg-muted/40",
  validating: "text-warning border-warning/40 bg-warning/10",
  ready: "text-primary border-primary/40 bg-primary/10",
  submitted: "text-accent border-accent/40 bg-accent/10",
  closed: "text-muted-foreground border-border bg-muted/40",
  new: "text-accent border-accent/40 bg-accent/10",
  triaging: "text-warning border-warning/40 bg-warning/10",
  "in-scope": "text-primary border-primary/40 bg-primary/10",
  "out-of-scope": "text-destructive border-destructive/40 bg-destructive/10",
  archived: "text-muted-foreground border-border bg-muted/40",
};

export function StatusChip({ status }: { status: FindingStatus | AssetStatus }) {
  return <span className={cn("chip uppercase tracking-wider", STATUS[status])}>{status}</span>;
}

const CONFIDENCE: Record<Confidence, string> = {
  low: "text-muted-foreground",
  medium: "text-warning",
  high: "text-primary",
};

export function ConfidenceDots({ confidence }: { confidence: Confidence }) {
  const filled = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className={cn("inline-flex items-center gap-0.5", CONFIDENCE[confidence])}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < filled ? "bg-current" : "bg-current/20",
          )}
        />
      ))}
    </span>
  );
}

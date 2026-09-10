import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { PriorityBadge } from "@/components/Badges";
import type { Recommendation } from "@/lib/assistant";

export function NextActionsWidget({ recs }: { recs: Recommendation[] }) {
  return (
    <div className="panel p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="display text-lg font-semibold">Next best actions</h3>
        </div>
        <Link to="/assistant" className="text-xs mono text-primary hover:underline">Open assistant →</Link>
      </div>
      <ul className="space-y-3">
        {recs.length === 0 && <li className="text-sm text-muted-foreground">No recommendations right now. Nice work.</li>}
        {recs.map((r) => (
          <li key={r.id} className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-medium text-sm">{r.title}</div>
              <PriorityBadge priority={r.priority} />
            </div>
            <div className="text-xs text-muted-foreground">{r.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

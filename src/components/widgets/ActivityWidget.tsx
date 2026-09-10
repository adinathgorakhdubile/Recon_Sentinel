import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { db, type ActivityEvent } from "@/lib/db";

export function ActivityWidget({ programId }: { programId: string | null }) {
  const events = useLiveQuery(async () => {
    const rows = await db.activity.orderBy("ts").reverse().limit(50).toArray();
    return programId ? rows.filter((r) => r.programId === programId || r.programId === null) : rows;
  }, [programId], [] as ActivityEvent[]) ?? [];
  const items = events.slice(0, 8);
  return (
    <div className="panel p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h3 className="display text-lg font-semibold">Recent activity</h3>
        </div>
        <Link to="/history" className="text-xs mono text-primary hover:underline">Full timeline →</Link>
      </div>
      <ul className="space-y-3 text-sm">
        {items.length === 0 && <li className="text-muted-foreground text-xs">No activity yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="flex items-start gap-3">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase mono text-muted-foreground tracking-widest">{e.entityType} · {e.action}</div>
              <div className="truncate">{e.summary}</div>
              <div className="text-[10px] mono text-muted-foreground/70">{formatDistanceToNow(e.ts, { addSuffix: true })}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

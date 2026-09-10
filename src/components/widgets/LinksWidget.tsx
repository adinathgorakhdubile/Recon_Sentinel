import { useLiveQuery } from "dexie-react-hooks";
import { GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import type { EntityLink } from "@/types";

export function LinksWidget({ programId }: { programId: string | null }) {
  const links = useLiveQuery(async () => {
    const rows = await db.links.orderBy("createdAt").reverse().limit(30).toArray();
    return programId ? rows.filter((r) => r.programId === programId || r.programId === null) : rows;
  }, [programId], [] as EntityLink[]) ?? [];
  const items = links.slice(0, 8);
  return (
    <div className="panel p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="h-4 w-4 text-primary" />
        <h3 className="display text-lg font-semibold">Recent links</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No cross-entity links yet. Use the Related panel on notes and findings.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((l) => (
            <li key={l.id} className="rounded border border-border/50 bg-muted/10 p-2">
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {l.fromType} → {l.toType} · {l.kind}
              </div>
              {l.note && <div className="text-xs mt-0.5 truncate">{l.note}</div>}
              <div className="text-[10px] mono text-muted-foreground/70">{formatDistanceToNow(l.createdAt, { addSuffix: true })}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

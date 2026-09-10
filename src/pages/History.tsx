import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import {
  ArrowLeft, Bug, ListChecks, Network, NotebookPen, Radar, ShieldCheck, Search, X,
  FileText, GitBranch, Sparkles, ImageIcon, Layers, Waves, Globe, FlaskConical,
} from "lucide-react";
import { db, type ActivityAction, type ActivityEntity, type ActivityEvent } from "@/lib/db";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ActivityEntity, any> = {
  program: ShieldCheck,
  task: ListChecks,
  asset: Network,
  note: NotebookPen,
  finding: Bug,
  evidence: ImageIcon,
  report: FileText,
  link: GitBranch,
  template: Layers,
  ai: Sparkles,
  recon: Waves,
  http: Globe,
  poc: FlaskConical,
};
const KIND_COLOR: Record<ActivityEntity, string> = {
  program: "text-primary border-primary/40 bg-primary/10",
  task: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  asset: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  note: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  finding: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  evidence: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  report: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  link: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10",
  template: "text-teal-300 border-teal-500/40 bg-teal-500/10",
  ai: "text-primary border-primary/40 bg-primary/10",
  recon: "text-indigo-300 border-indigo-500/40 bg-indigo-500/10",
  http: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  poc: "text-orange-300 border-orange-500/40 bg-orange-500/10",
};
const ACTION_LABEL: Record<ActivityAction, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  completed: "completed",
  uncompleted: "reopened",
  imported: "imported",
  exported: "exported",
  ai: "AI action",
  linked: "linked",
  unlinked: "unlinked",
  reset: "reset",
};

const ENTITY_TYPES: ActivityEntity[] = ["program", "task", "asset", "note", "finding", "evidence", "report", "link", "template", "ai", "recon"];

export default function HistoryPage() {
  const { state, activeProgram } = useWorkspace();
  const [programScope, setProgramScope] = useState<"active" | "all">("active");
  const [types, setTypes] = useState<Set<ActivityEntity>>(new Set(ENTITY_TYPES));
  const [q, setQ] = useState("");

  const scopeProgramId = programScope === "active" ? activeProgram?.id ?? null : null;

  const events = useLiveQuery(async () => {
    const rows = await db.activity.orderBy("ts").reverse().limit(500).toArray();
    return rows;
  }, [], [] as ActivityEvent[]) ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (!types.has(e.entityType)) return false;
      if (scopeProgramId && e.programId !== scopeProgramId) return false;
      if (needle && !e.summary.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [events, types, scopeProgramId, q]);

  const grouped = useMemo(() => {
    const g: { day: string; items: ActivityEvent[] }[] = [];
    let currentDay = "";
    for (const e of filtered) {
      const day = format(e.ts, "EEEE, MMM d yyyy");
      if (day !== currentDay) { g.push({ day, items: [] }); currentDay = day; }
      g[g.length - 1].items.push(e);
    }
    return g;
  }, [filtered]);

  function toggleType(t: ActivityEntity) {
    setTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  const stats = {
    total: events.length,
    programs: state.programs.length,
    findings: state.findings.length,
    assets: state.assets.length,
    notes: state.notes.length,
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-primary/80 mb-1">// activity timeline</div>
          <h1 className="display text-3xl font-semibold">Workspace History</h1>
          <p className="text-sm text-muted-foreground mt-1">Every change captured locally — {stats.total.toLocaleString()} events on record.</p>
        </div>
        <Link to="/" className="chip hover:border-primary/50 hover:text-primary transition-colors">
          <ArrowLeft className="h-3 w-3" /> Command Deck
        </Link>
      </div>

      <div className="panel p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter events…" className="pl-8" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {(["active", "all"] as const).map((k) => (
            <button key={k} onClick={() => setProgramScope(k)}
              className={cn("text-xs px-2.5 py-1 rounded", programScope === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              {k === "active" ? "Active program" : "All programs"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ENTITY_TYPES.map((t) => {
            const Icon = KIND_ICON[t];
            const on = types.has(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                className={cn(
                  "text-xs px-2 py-1 rounded border flex items-center gap-1.5 transition-colors",
                  on ? KIND_COLOR[t] : "border-border/50 text-muted-foreground hover:border-border",
                )}>
                <Icon className="h-3 w-3" />
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel p-6">
        {grouped.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">
            <Radar className="h-8 w-8 mx-auto mb-3 text-primary/60" />
            No activity matches these filters.
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.day}>
                <div className="mono text-[11px] uppercase tracking-widest text-primary/70 mb-3">{group.day}</div>
                <ol className="relative border-l border-border/60 pl-6 space-y-3">
                  {group.items.map((e) => {
                    const Icon = KIND_ICON[e.entityType];
                    return (
                      <li key={e.id} className="relative">
                        <span className={cn(
                          "absolute -left-[31px] top-1 h-6 w-6 rounded-full border grid place-items-center",
                          KIND_COLOR[e.entityType],
                        )}>
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm">
                              <span className="text-muted-foreground">{ACTION_LABEL[e.action]}</span>
                              <span className="mx-1">·</span>
                              <span>{e.summary}</span>
                            </div>
                            <div className="mono text-[10px] uppercase text-muted-foreground/70 mt-0.5">
                              {e.entityType} · {e.entityId.slice(0, 12)}
                            </div>
                          </div>
                          <div className="mono text-[10px] text-muted-foreground shrink-0">{format(e.ts, "HH:mm:ss")}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

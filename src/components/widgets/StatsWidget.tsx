import { Link } from "react-router-dom";
import { ArrowRight, Bug, ListChecks, Network, NotebookPen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Asset, ChecklistTask, Finding, Note } from "@/types";

export function StatsWidget({ tasks, assets, notes, findings }: {
  tasks: ChecklistTask[]; assets: Asset[]; notes: Note[]; findings: Finding[];
}) {
  const done = tasks.filter((t) => t.completed).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Checklist" value={`${pct}%`} sub={`${done}/${tasks.length} tasks`} icon={ListChecks} to="/checklist">
        <Progress value={pct} className="h-1.5 mt-3" />
      </StatCard>
      <StatCard label="Assets" value={assets.length} sub={`${assets.filter(a => a.status === "in-scope").length} in-scope`} icon={Network} to="/assets" />
      <StatCard label="Notes" value={notes.length} sub="notebook entries" icon={NotebookPen} to="/notebook" />
      <StatCard label="Findings" value={findings.length} sub={`${findings.filter(f => f.status === "draft").length} draft`} icon={Bug} to="/findings" />
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, to, children }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ComponentType<{ className?: string }>; to: string; children?: React.ReactNode;
}) {
  return (
    <Link to={to} className="panel p-5 group hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
      </div>
      <div className="display text-3xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      {children}
      <div className="mt-3 flex items-center text-[11px] mono text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity">
        Open <ArrowRight className="h-3 w-3 ml-1" />
      </div>
    </Link>
  );
}

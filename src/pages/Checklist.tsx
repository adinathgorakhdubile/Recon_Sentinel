import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { CATEGORIES, PHASES } from "@/lib/seed";
import type { ChecklistCategory, ChecklistPhase, ChecklistTask } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CommandBlock } from "@/components/CommandBlock";
import { Search, Sparkles, ChevronDown, ChevronRight, Globe, Server, Cloud, Wrench, RefreshCw, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CAT_META: Record<ChecklistCategory, { icon: React.ComponentType<{ className?: string }>; blurb: string; color: string }> = {
  General: { icon: Wrench, blurb: "Scope lockdown, evidence & reporting hygiene.", color: "text-primary" },
  Web:     { icon: Globe,  blurb: "Full-stack recon → exploit path for web apps.", color: "text-accent" },
  API:     { icon: Server, blurb: "REST & GraphQL enumeration, BOLA, auth abuse.", color: "text-warning" },
  Cloud:   { icon: Cloud,  blurb: "Buckets, IMDS pivots, IAM audit (with scope).", color: "text-success" },
  AI:      { icon: Brain,  blurb: "LLM / RAG / agent red-teaming — OWASP LLM Top 10.", color: "text-fuchsia-300" },
};

export default function ChecklistPage() {
  return (
    <EmptyProgramGate>
      <ChecklistInner />
    </EmptyProgramGate>
  );
}

function ChecklistInner() {
  const { tasks, toggleTask, activeProgram, regenerateTasks } = useWorkspace();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ChecklistCategory | "All">("All");

  // Backfill category defensively for older localStorage records
  const normalized: ChecklistTask[] = useMemo(
    () => tasks.map((t) => ({ ...t, category: (t.category ?? "General") as ChecklistCategory })),
    [tasks],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return normalized.filter((t) => {
      if (tab !== "All" && t.category !== tab) return false;
      if (!query) return true;
      const hay = `${t.title} ${t.detail} ${t.commands?.map((c) => c.label + " " + c.cmd).join(" ") ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [normalized, q, tab]);

  const overall = normalized.length
    ? Math.round((normalized.filter((t) => t.completed).length / normalized.length) * 100)
    : 0;

  const regenerate = () => {
    if (!activeProgram) return;
    if (!confirm("Regenerate the checklist for this program with the latest Web / API / Cloud playbooks? Existing completion state will be lost.")) return;
    regenerateTasks(activeProgram.id);
    toast.success("Checklist regenerated with the latest playbooks");
  };

  return (
    <>
      <PageHeader
        eyebrow="Playbook · Recon → Exploit"
        title="Stage-wise Checklist"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tasks & commands..."
                className="pl-8 w-64"
              />
            </div>
            <Button variant="outline" size="sm" onClick={regenerate} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          </div>
        }
      />

      <div className="panel p-5 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Overall progress</div>
              <div className="text-xs text-muted-foreground">
                {normalized.filter((t) => t.completed).length} / {normalized.length} tasks completed across {CATEGORIES.length} playbooks
              </div>
            </div>
          </div>
          <div className="display text-3xl font-bold gradient-text">{overall}%</div>
        </div>
        <Progress value={overall} className="h-2" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {CATEGORIES.map((cat) => {
            const cTasks = normalized.filter((t) => t.category === cat);
            const done = cTasks.filter((t) => t.completed).length;
            const pct = cTasks.length ? Math.round((done / cTasks.length) * 100) : 0;
            const Meta = CAT_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setTab(cat)}
                className={cn(
                  "rounded-md border p-3 text-left transition-all hover-lift",
                  tab === cat ? "border-primary/60 bg-primary/5" : "border-border/60 bg-muted/20 hover:border-primary/30",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Meta.icon className={cn("h-3.5 w-3.5", Meta.color)} />
                  <span className="mono text-[10px] uppercase tracking-widest">{cat}</span>
                </div>
                <div className="text-lg display font-semibold">{pct}%</div>
                <div className="text-[10px] text-muted-foreground">{done}/{cTasks.length}</div>
              </button>
            );
          })}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ChecklistCategory | "All")}>
        <TabsList className="mb-4">
          <TabsTrigger value="All">All</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="space-y-6 mt-0">
          {tab !== "All" && (
            <div className="panel p-4 flex items-start gap-3 animate-fade-in">
              {(() => {
                const Icon = CAT_META[tab as ChecklistCategory].icon;
                return <Icon className={cn("h-5 w-5 mt-0.5", CAT_META[tab as ChecklistCategory].color)} />;
              })()}
              <div>
                <div className="display font-semibold">{tab} playbook</div>
                <div className="text-sm text-muted-foreground">{CAT_META[tab as ChecklistCategory].blurb}</div>
              </div>
            </div>
          )}

          {PHASES.map((phase) => {
            const inPhase = filtered.filter((t) => t.phase === phase);
            if (inPhase.length === 0) return null;
            return (
              <PhaseSection
                key={phase}
                phase={phase}
                tasks={inPhase}
                onToggle={toggleTask}
                showCategory={tab === "All"}
              />
            );
          })}

          {filtered.length === 0 && (
            <div className="panel p-10 text-center text-muted-foreground">
              No tasks match your search.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function PhaseSection({
  phase,
  tasks,
  onToggle,
  showCategory,
}: {
  phase: ChecklistPhase;
  tasks: ChecklistTask[];
  onToggle: (id: string) => void;
  showCategory: boolean;
}) {
  const done = tasks.filter((t) => t.completed).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <div className="panel p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-primary/70">Phase</div>
          <h3 className="display text-lg font-semibold">{phase}</h3>
        </div>
        <div className="text-right">
          <div className="mono text-xs text-muted-foreground">{done}/{tasks.length}</div>
          <div className="display text-sm font-semibold text-primary">{pct}%</div>
        </div>
      </div>
      <Progress value={pct} className="h-1 mb-4" />
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} showCategory={showCategory} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  showCategory,
}: {
  task: ChecklistTask;
  onToggle: (id: string) => void;
  showCategory: boolean;
}) {
  const hasCommands = (task.commands?.length ?? 0) > 0;
  const [open, setOpen] = useState(false);
  const Meta = CAT_META[task.category];
  return (
    <li
      className={cn(
        "rounded-md border border-border/60 bg-muted/20 transition-colors hover:border-primary/30",
        task.completed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={task.completed}
          onCheckedChange={() => onToggle(task.id)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("font-medium text-sm", task.completed && "line-through")}>
              {task.title}
            </span>
            {showCategory && (
              <span className={cn("chip", Meta.color)}>
                <Meta.icon className="h-3 w-3" />
                {task.category}
              </span>
            )}
            {hasCommands && (
              <span className="chip text-primary/80 border-primary/30 bg-primary/5">
                {task.commands!.length} cmd{task.commands!.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{task.detail}</div>
        </div>
        {hasCommands && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground hover:text-primary transition-colors self-center"
            aria-label={open ? "Collapse commands" : "Expand commands"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hasCommands && open && (
        <div className="border-t border-border/50 p-3 space-y-2 bg-black/20 animate-fade-in">
          {task.commands!.map((c, i) => (
            <CommandBlock key={i} command={c} />
          ))}
          <div className="text-[10px] mono uppercase tracking-widest text-warning/80 pt-1">
            ⚠ Run only against targets you are explicitly authorized to test.
          </div>
        </div>
      )}
    </li>
  );
}

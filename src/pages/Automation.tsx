import { useEffect, useMemo, useState } from "react";
import { Play, Plus, Save, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { WorkflowBuilder } from "@/components/automation/WorkflowBuilder";
import { RunMonitor } from "@/components/automation/RunMonitor";
import { blankWorkflow, newWorkflowFromTemplate, TEMPLATES } from "@/lib/automation/templates";
import { deleteWorkflow, listRuns, listWorkflows, saveWorkflow } from "@/lib/automation/repo";
import { startWorkflow, subscribeRuns } from "@/lib/automation/engine";
import type { Workflow, WorkflowRun } from "@/lib/automation/types";

export default function Automation() {
  return (
    <EmptyProgramGate>
      <AutomationInner />
    </EmptyProgramGate>
  );
}

function AutomationInner() {
  const { activeProgram } = useWorkspace();
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const active = useMemo(() => workflows.find((w) => w.id === activeId) ?? null, [workflows, activeId]);

  const reload = async () => {
    if (!activeProgram) return;
    const [ws, rs] = await Promise.all([
      listWorkflows(activeProgram.id),
      listRuns(activeProgram.id, 30),
    ]);
    setWorkflows(ws);
    setRuns(rs);
    if (!activeId && ws.length) setActiveId(ws[0].id);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProgram?.id]);
  useEffect(() => {
    const unsub = subscribeRuns(() => { reload(); });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProgram?.id]);

  const createBlank = async () => {
    if (!activeProgram) return;
    const w = blankWorkflow(activeProgram.id);
    await saveWorkflow(w);
    await reload();
    setActiveId(w.id);
  };
  const createFromTemplate = async (templateId: string) => {
    if (!activeProgram) return;
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    const w = newWorkflowFromTemplate(t, activeProgram.id);
    await saveWorkflow(w);
    await reload();
    setActiveId(w.id);
    toast({ title: "Workflow created", description: `${t.name} added to workspace.` });
  };
  const save = async (w: Workflow) => {
    await saveWorkflow(w);
    setWorkflows((cur) => cur.map((x) => (x.id === w.id ? w : x)));
    toast({ title: "Saved" });
  };
  const remove = async (id: string) => {
    await deleteWorkflow(id);
    await reload();
    if (activeId === id) setActiveId(null);
  };
  const run = async (w: Workflow) => {
    await startWorkflow(w, { input: { content: input }, trigger: "manual" });
    toast({ title: "Workflow started", description: w.name });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation Engine"
        title="Workflow Orchestration"
      />
      <p className="text-sm text-muted-foreground -mt-6">
        Chain recon stages into reusable workflows. Import → Normalize → Correlate → Enrich → Findings — with retries, branching, approvals and pause/resume.
      </p>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel p-3 space-y-2">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={createBlank}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Blank
            </Button>
            <Select onValueChange={createFromTemplate}>
              <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="From template…" /></SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => setActiveId(w.id)}
                className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${
                  activeId === w.id ? "border-primary/50 bg-primary/5" : "border-border/60 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate flex-1">{w.name}</span>
                  <span className="mono text-[10px] text-muted-foreground">{w.steps.length} steps</span>
                </div>
                {w.description && <div className="text-[11px] text-muted-foreground truncate">{w.description}</div>}
              </button>
            ))}
            {workflows.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                No workflows yet. Start from a template or create a blank one.
              </p>
            )}
          </div>
        </aside>

        <section className="space-y-4">
          {active ? (
            <>
              <div className="panel p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{active.name}</div>
                  <div className="text-[11px] text-muted-foreground mono">
                    {active.steps.length} steps · updated {new Date(active.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => save(active)}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
                <Button size="sm" onClick={() => run(active)} disabled={active.steps.length === 0}>
                  <Play className="h-3.5 w-3.5 mr-1" /> Run
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(active.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Delete
                </Button>
              </div>

              <Tabs defaultValue="builder">
                <TabsList>
                  <TabsTrigger value="builder">Builder</TabsTrigger>
                  <TabsTrigger value="input">Input</TabsTrigger>
                  <TabsTrigger value="runs">Runs ({runs.filter((r) => r.workflowId === active.id).length})</TabsTrigger>
                </TabsList>
                <TabsContent value="builder">
                  <WorkflowBuilder workflow={active} onChange={(w) => setWorkflows((cur) => cur.map((x) => x.id === w.id ? w : x))} />
                </TabsContent>
                <TabsContent value="input">
                  <div className="panel p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Optional text payload for the run. Available to Import steps via the <code className="mono">content</code> input key.
                    </p>
                    <Textarea rows={10} value={input} onChange={(e) => setInput(e.target.value)}
                      placeholder="Paste tool output (host list, JSON, XML, …) here." />
                  </div>
                </TabsContent>
                <TabsContent value="runs">
                  <div className="space-y-3">
                    {runs.filter((r) => r.workflowId === active.id).map((r) => <RunMonitor key={r.id} run={r} />)}
                    {runs.filter((r) => r.workflowId === active.id).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">No runs yet.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="panel p-8 text-center text-muted-foreground text-sm">
              Select or create a workflow to begin.
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs mono uppercase text-muted-foreground">Recent runs (all workflows)</h3>
            {runs.slice(0, 5).map((r) => <RunMonitor key={r.id} run={r} />)}
            {runs.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

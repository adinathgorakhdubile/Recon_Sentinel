import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listStepDefinitions, getStepDefinition } from "@/lib/automation/steps";
import type { Workflow, WorkflowStep } from "@/lib/automation/types";
import { uid } from "@/lib/seed";
import { listImporters } from "@/lib/recon/importers";

interface Props {
  workflow: Workflow;
  onChange: (w: Workflow) => void;
}

/**
 * Lightweight drag-and-drop / arrow-reorder pipeline builder. Kept as a
 * flat list because the engine already handles branch gating declaratively;
 * a node-graph UI can be layered on later without changing storage.
 */
export function WorkflowBuilder({ workflow, onChange }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(workflow.steps[0]?.id ?? null);
  const defs = listStepDefinitions();

  useEffect(() => {
    if (!selected && workflow.steps.length) setSelected(workflow.steps[0].id);
  }, [selected, workflow.steps]);

  const update = (next: Partial<Workflow>) => onChange({ ...workflow, ...next, updatedAt: Date.now() });
  const updateStep = (idx: number, patch: Partial<WorkflowStep>) => {
    const steps = workflow.steps.slice();
    steps[idx] = { ...steps[idx], ...patch };
    update({ steps });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= workflow.steps.length) return;
    const steps = workflow.steps.slice();
    const [item] = steps.splice(from, 1);
    steps.splice(to, 0, item);
    update({ steps });
  };
  const remove = (idx: number) => update({ steps: workflow.steps.filter((_, i) => i !== idx) });
  const add = (kind: string) => {
    const def = getStepDefinition(kind);
    if (!def) return;
    const step: WorkflowStep = {
      id: uid("stp"),
      kind: def.kind,
      name: def.label,
      config: def.defaults(),
    };
    update({ steps: [...workflow.steps, step] });
    setSelected(step.id);
  };

  const activeStep = workflow.steps.find((s) => s.id === selected) ?? null;
  const activeIdx = activeStep ? workflow.steps.findIndex((s) => s.id === activeStep.id) : -1;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="panel p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={workflow.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={(workflow.tags ?? []).join(", ")}
              onChange={(e) => update({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea value={workflow.description ?? ""} onChange={(e) => update({ description: e.target.value })} rows={2} />
        </div>

        <div className="border-t border-border/60 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs mono uppercase text-muted-foreground">Pipeline</span>
            <Select onValueChange={add}>
              <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Add step…" /></SelectTrigger>
              <SelectContent>
                {defs.map((d) => (
                  <SelectItem key={d.kind} value={d.kind}>
                    <Plus className="inline h-3 w-3 mr-1" /> {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ol className="space-y-1.5">
            {workflow.steps.map((step, idx) => {
              const isSel = step.id === selected;
              return (
                <li
                  key={step.id}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null) move(dragIndex, idx); setDragIndex(null); }}
                  onClick={() => setSelected(step.id)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${
                    isSel ? "border-primary/50 bg-primary/5" : "border-border/60 hover:border-primary/30"
                  }`}
                >
                  <span className="mono text-[10px] text-muted-foreground w-6">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="mono text-[10px] rounded bg-muted/50 px-1.5 py-0.5">{step.kind}</span>
                  <span className="flex-1 text-sm truncate">{step.name}</span>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); move(idx, idx - 1); }}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); move(idx, idx + 1); }}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(idx); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              );
            })}
            {workflow.steps.length === 0 && (
              <li className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-md p-4 text-center">
                No steps yet — add one above to start.
              </li>
            )}
          </ol>
        </div>
      </div>

      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <span className="mono text-xs uppercase text-muted-foreground">Step Settings</span>
        </div>
        {activeStep ? (
          <StepInspector step={activeStep} onChange={(p) => updateStep(activeIdx, p)} allSteps={workflow.steps} />
        ) : (
          <p className="text-xs text-muted-foreground">Select a step to edit.</p>
        )}
      </div>
    </div>
  );
}

function StepInspector({
  step, onChange, allSteps,
}: { step: WorkflowStep; onChange: (patch: Partial<WorkflowStep>) => void; allSteps: WorkflowStep[] }) {
  const def = getStepDefinition(step.kind);
  const setCfg = (patch: Record<string, unknown>) => onChange({ config: { ...step.config, ...patch } });
  const cfg = step.config as Record<string, unknown>;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{def?.description}</p>
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={step.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>

      {step.kind === "import" && (
        <>
          <div>
            <Label className="text-xs">Importer</Label>
            <Select value={String(cfg.importerId ?? "auto")} onValueChange={(v) => setCfg({ importerId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                {listImporters().map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Input key (from run input)</Label>
            <Input placeholder="content" value={String(cfg.contentFromInput ?? "")} onChange={(e) => setCfg({ contentFromInput: e.target.value })} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={Boolean(cfg.strictScope)} onChange={(e) => setCfg({ strictScope: e.target.checked })} />
            Strict scope (drop out-of-scope)
          </div>
        </>
      )}

      {step.kind === "generate-findings" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Min risk</Label>
            <Input type="number" value={Number(cfg.minRisk ?? 70)} onChange={(e) => setCfg({ minRisk: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Max drafts</Label>
            <Input type="number" value={Number(cfg.maxDrafts ?? 10)} onChange={(e) => setCfg({ maxDrafts: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {step.kind === "delay" && (
        <div>
          <Label className="text-xs">Wait (ms)</Label>
          <Input type="number" value={Number(cfg.ms ?? 1000)} onChange={(e) => setCfg({ ms: Number(e.target.value) })} />
        </div>
      )}

      {step.kind === "approval" && (
        <div>
          <Label className="text-xs">Message</Label>
          <Textarea rows={2} value={String(cfg.message ?? "")} onChange={(e) => setCfg({ message: e.target.value })} />
        </div>
      )}

      {step.kind === "notify" && (
        <div>
          <Label className="text-xs">Summary</Label>
          <Input value={String(cfg.summary ?? "")} onChange={(e) => setCfg({ summary: e.target.value })} />
        </div>
      )}

      {step.kind === "branch" && (
        <BranchEditor step={step} onChange={onChange} allSteps={allSteps} />
      )}

      <div className="border-t border-border/60 pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Retry attempts</Label>
            <Input type="number" min={1}
              value={step.retry?.maxAttempts ?? 1}
              onChange={(e) => onChange({ retry: { ...(step.retry ?? { delayMs: 500, backoff: "fixed" }), maxAttempts: Math.max(1, Number(e.target.value)) } })}
            />
          </div>
          <div>
            <Label className="text-xs">Retry delay (ms)</Label>
            <Input type="number" min={0}
              value={step.retry?.delayMs ?? 500}
              onChange={(e) => onChange({ retry: { ...(step.retry ?? { maxAttempts: 1, backoff: "fixed" }), delayMs: Math.max(0, Number(e.target.value)) } })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={Boolean(step.continueOnError)} onChange={(e) => onChange({ continueOnError: e.target.checked })} />
          Continue on error
        </label>
      </div>
    </div>
  );
}

function BranchEditor({
  step, onChange, allSteps,
}: { step: WorkflowStep; onChange: (patch: Partial<WorkflowStep>) => void; allSteps: WorkflowStep[] }) {
  const cfg = step.config as { when?: { path: string; op: string; value: unknown } };
  const when = cfg.when ?? { path: "import.imported", op: "gt", value: 0 };
  const branches = step.branches ?? { onTrue: [], onFalse: [] };
  const candidates = allSteps.filter((s) => s.id !== step.id);
  const toggle = (list: "onTrue" | "onFalse", id: string) => {
    const cur = new Set(branches[list]);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    onChange({ branches: { ...branches, [list]: Array.from(cur) } });
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1">
        <Input placeholder="path" value={when.path} onChange={(e) => onChange({ config: { ...step.config, when: { ...when, path: e.target.value } } })} />
        <Select value={when.op} onValueChange={(v) => onChange({ config: { ...step.config, when: { ...when, op: v } } })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["gt","gte","lt","lte","eq","neq","exists"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="value" value={String(when.value ?? "")} onChange={(e) => onChange({ config: { ...step.config, when: { ...when, value: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) } } })} />
      </div>
      {(["onTrue","onFalse"] as const).map((k) => (
        <div key={k}>
          <Label className="text-xs">{k === "onTrue" ? "If true → run" : "If false → run"}</Label>
          <div className="flex flex-wrap gap-1">
            {candidates.map((c) => (
              <button key={c.id} type="button"
                onClick={() => toggle(k, c.id)}
                className={`text-[11px] rounded border px-2 py-0.5 mono ${branches[k].includes(c.id) ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

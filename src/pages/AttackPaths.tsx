/**
 * Attack Paths — first-class scenarios composed on top of the Knowledge Graph.
 *
 * This page hosts:
 *   • List of saved paths for the active program
 *   • Path editor with steps, prerequisites, trust boundaries, objectives
 *   • Interactive canvas view (see AttackPathCanvas)
 *   • Auto-suggestions seeded by any graph node
 *   • Comparison view between two paths
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GitBranch, Plus, Trash2, Sparkles, GitCompare, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AttackPathCanvas } from "@/components/attackpath/AttackPathCanvas";
import {
  createPath,
  deletePath,
  listPaths,
  makeAttachment,
  makeBoundary,
  makeObjective,
  makeStep,
  normalizeSteps,
  savePath,
} from "@/lib/attackpath/repo";
import {
  DEFAULT_PATH_FILTERS,
  STEP_KIND_COLORS,
  STEP_KIND_LABELS,
  TRUST_ORDER,
  type AttackPath,
  type AttackPathFilters,
  type AttackStep,
  type AttackStepKind,
  type PathStatus,
  type TrustLevel,
} from "@/lib/attackpath/types";
import { analyze } from "@/lib/attackpath/analyze";
import { buildGraph } from "@/lib/graph/build";
import type { GraphSnapshot } from "@/lib/graph/types";
import { diffPaths, suggestPaths, type PathSuggestion } from "@/lib/attackpath/suggest";
import type { Severity } from "@/types";

const SEVERITIES: Severity[] = ["info", "low", "medium", "high", "critical"];
const STATUSES: PathStatus[] = ["draft", "hypothesis", "validated", "invalidated", "archived"];
const STAGES: Array<NonNullable<AttackStep["stage"]>> = ["scope", "recon", "enum", "vuln", "exploit", "post", "report"];

export default function AttackPathsPage() {
  return <EmptyProgramGate><AttackPathsInner /></EmptyProgramGate>;
}

function AttackPathsInner() {
  const { activeProgram } = useWorkspace();
  const programId = activeProgram?.id ?? null;
  const { toast } = useToast();

  const [paths, setPaths] = useState<AttackPath[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [graph, setGraph] = useState<GraphSnapshot>({ nodes: [], edges: [], builtAt: 0, programId });
  const [filters, setFilters] = useState<AttackPathFilters>(DEFAULT_PATH_FILTERS);
  const [compareId, setCompareId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [suggestSeed, setSuggestSeed] = useState<string | undefined>();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const [p, g] = await Promise.all([listPaths(programId), buildGraph({ programId })]);
    setPaths(p);
    setGraph(g);
    if (!activeId && p[0]) setActiveId(p[0].id);
  }, [programId, activeId]);
  useEffect(() => { refresh(); }, [refresh]);

  const active = useMemo(() => paths.find((p) => p.id === activeId), [paths, activeId]);
  const compareTo = useMemo(() => paths.find((p) => p.id === compareId), [paths, compareId]);
  const stats = useMemo(() => (active ? analyze(active) : null), [active]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return paths.filter((p) => {
      if (q && !`${p.name} ${p.summary ?? ""}`.toLowerCase().includes(q)) return false;
      if (filters.severities.length && (!p.severity || !filters.severities.includes(p.severity))) return false;
      if (filters.status.length && !filters.status.includes(p.status)) return false;
      if (filters.tags.length && !filters.tags.some((t) => p.tags.includes(t))) return false;
      if (filters.stages.length && !p.steps.some((s) => s.stage && filters.stages.includes(s.stage))) return false;
      if (filters.technologies.length && !filters.technologies.some((t) => p.steps.some((s) => s.tags.includes(t)))) return false;
      return true;
    });
  }, [paths, filters]);

  const allTags = useMemo(() => [...new Set(paths.flatMap((p) => p.tags))].sort(), [paths]);
  const allTechs = useMemo(() => [...new Set(paths.flatMap((p) => p.steps.flatMap((s) => s.tags)))].sort(), [paths]);

  const onCreate = async () => {
    const p = await createPath({ programId, name: "New attack path", status: "draft" });
    setPaths((prev) => [p, ...prev]);
    setActiveId(p.id);
  };

  const onSave = async (next: AttackPath) => {
    const saved = await savePath({ ...next, steps: normalizeSteps(next.steps) });
    setPaths((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
  };

  const onDelete = async (id: string) => {
    await deletePath(id);
    setPaths((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(undefined);
  };

  const onSuggest = () => {
    if (!suggestSeed) return;
    const s = suggestPaths(graph, { seedId: suggestSeed, maxDepth: 5, maxSuggestions: 8 });
    setSuggestions(s);
    toast({ title: "Suggestions ready", description: `${s.length} candidate paths from ${graph.nodes.find((n) => n.id === suggestSeed)?.label ?? "seed"}` });
  };

  const onAdoptSuggestion = async (sug: PathSuggestion) => {
    const seed = graph.nodes.find((n) => n.id === sug.seedId)?.label ?? "seed";
    const target = graph.nodes.find((n) => n.id === sug.targetId)?.label ?? "target";
    const p = await createPath({
      programId,
      name: `${seed} → ${target}`,
      summary: sug.reason,
      status: "hypothesis",
      auto: true,
      seedNodeId: sug.seedId,
      steps: sug.steps,
    });
    setPaths((prev) => [p, ...prev]);
    setActiveId(p.id);
    toast({ title: "Path adopted", description: `${sug.steps.length} steps imported (unvalidated)` });
  };

  return (
    <>
      <PageHeader
        eyebrow="Attack Modeling"
        title="Attack Paths"
        actions={
          <div className="flex items-center gap-2">
            <div className="chip border-primary/40 text-primary bg-primary/10">
              <GitBranch className="h-3 w-3" />
              {paths.length} paths
            </div>
            <Button size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5 mr-1" /> New path</Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Left column — list + filters + suggest */}
        <aside className="panel p-4 space-y-4">
          <Input
            placeholder="Search paths…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            className="h-8 text-sm"
          />

          <div className="space-y-1">
            {filtered.length === 0 && <div className="text-xs text-muted-foreground">No paths match.</div>}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm border ${activeId === p.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.status}</Badge>
                </div>
                <div className="text-[10px] mono text-muted-foreground">
                  {p.steps.length} steps · {p.severity ?? "n/a"}
                </div>
              </button>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs uppercase mono text-muted-foreground">Filter</Label>
            <MultiToggle
              label="Severity"
              values={SEVERITIES}
              selected={filters.severities}
              onChange={(next) => setFilters((f) => ({ ...f, severities: next as Severity[] }))}
            />
            <MultiToggle
              label="Status"
              values={STATUSES}
              selected={filters.status}
              onChange={(next) => setFilters((f) => ({ ...f, status: next as PathStatus[] }))}
            />
            <MultiToggle
              label="Stage"
              values={STAGES}
              selected={filters.stages}
              onChange={(next) => setFilters((f) => ({ ...f, stages: next as AttackPathFilters["stages"] }))}
            />
            {allTags.length > 0 && (
              <MultiToggle
                label="Tags"
                values={allTags}
                selected={filters.tags}
                onChange={(next) => setFilters((f) => ({ ...f, tags: next }))}
              />
            )}
            {allTechs.length > 0 && (
              <MultiToggle
                label="Technology"
                values={allTechs}
                selected={filters.technologies}
                onChange={(next) => setFilters((f) => ({ ...f, technologies: next }))}
              />
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs uppercase mono text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Suggest from graph
            </Label>
            <Select value={suggestSeed} onValueChange={setSuggestSeed}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick seed node…" /></SelectTrigger>
              <SelectContent>
                {graph.nodes.slice(0, 200).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span className="mono text-[10px] mr-1 text-muted-foreground">{n.kind}</span>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="w-full h-8" disabled={!suggestSeed} onClick={onSuggest}>
              Generate suggestions
            </Button>
            {suggestions.length > 0 && (
              <div className="space-y-1 max-h-56 overflow-auto">
                {suggestions.map((s, i) => (
                  <div key={i} className="text-xs border border-border/60 rounded px-2 py-1">
                    <div className="font-medium truncate">{s.reason}</div>
                    <div className="text-[10px] mono text-muted-foreground">score {s.score.toFixed(1)} · {s.steps.length} steps</div>
                    <Button size="sm" variant="ghost" className="h-6 text-[11px] mt-0.5 px-1" onClick={() => onAdoptSuggestion(s)}>
                      Adopt →
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Editor / viewer */}
        <section className="space-y-4">
          {!active ? (
            <div className="panel p-8 text-sm text-muted-foreground text-center">
              Select a path from the sidebar or create a new one to begin modeling.
            </div>
          ) : (
            <PathEditor
              path={active}
              compare={compareTo}
              graph={graph}
              paths={paths}
              stats={stats!}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onChange={onSave}
              onDelete={() => onDelete(active.id)}
              onCompare={setCompareId}
            />
          )}
        </section>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function MultiToggle<T extends string>({
  label, values, selected, onChange,
}: {
  label: string;
  values: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div>
      <div className="text-[10px] mono uppercase text-muted-foreground mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              onClick={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])}
              className={`text-[10px] mono px-1.5 py-0.5 rounded border ${on ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EditorProps {
  path: AttackPath;
  compare?: AttackPath;
  graph: GraphSnapshot;
  paths: AttackPath[];
  stats: ReturnType<typeof analyze>;
  selectedStepId?: string;
  onSelectStep: (id: string | undefined) => void;
  onChange: (path: AttackPath) => void;
  onDelete: () => void;
  onCompare: (id: string | undefined) => void;
}

function PathEditor({ path, compare, graph, paths, stats, selectedStepId, onSelectStep, onChange, onDelete, onCompare }: EditorProps) {
  const update = (patch: Partial<AttackPath>) => onChange({ ...path, ...patch });

  const addStep = () => {
    const s = makeStep({ order: path.steps.length, title: `Step ${path.steps.length + 1}`, kind: "recon" });
    update({ steps: [...path.steps, s] });
  };

  const updateStep = (id: string, patch: Partial<AttackStep>) => {
    update({ steps: path.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };
  const removeStep = (id: string) => {
    update({ steps: path.steps.filter((s) => s.id !== id).map((s) => ({ ...s, prerequisites: s.prerequisites.filter((p) => p !== id) })) });
  };
  const move = (id: string, dir: -1 | 1) => {
    const sorted = [...path.steps].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx], b = sorted[swap];
    update({ steps: path.steps.map((s) => s.id === a.id ? { ...s, order: b.order } : s.id === b.id ? { ...s, order: a.order } : s) });
  };

  const addObjective = () => update({ objectives: [...path.objectives, makeObjective("New objective")] });
  const addBoundary = () => update({ boundaries: [...path.boundaries, makeBoundary("New trust boundary")] });

  const selectedStep = path.steps.find((s) => s.id === selectedStepId);

  return (
    <>
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={path.name} onChange={(e) => update({ name: e.target.value })} className="text-lg font-semibold flex-1 min-w-64" />
          <Select value={path.status} onValueChange={(v) => update({ status: v as PathStatus })}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={path.severity ?? "none"} onValueChange={(v) => update({ severity: v === "none" ? undefined : v as Severity })}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">none</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
        <Textarea
          placeholder="Summary…"
          value={path.summary ?? ""}
          onChange={(e) => update({ summary: e.target.value })}
          className="text-sm min-h-16"
        />
        <div className="flex flex-wrap gap-3 text-[11px] mono text-muted-foreground">
          <span>{stats.steps} steps</span>
          <span>· priv esc {stats.privilegeEscalations}</span>
          <span>· pivots {stats.pivots}</span>
          <span>· highest trust {stats.highestTrust ?? "n/a"}</span>
          <span>· confidence {(stats.cumulativeConfidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      <Tabs defaultValue="flow">
        <TabsList>
          <TabsTrigger value="flow">Flow</TabsTrigger>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
          <TabsTrigger value="boundaries">Boundaries</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="space-y-3">
          <div className="panel p-2">
            <AttackPathCanvas path={path} selectedStepId={selectedStepId} onSelectStep={onSelectStep} height={520} />
          </div>
          {selectedStep && (
            <div className="panel p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STEP_KIND_COLORS[selectedStep.kind] }} />
                <span className="text-[10px] mono uppercase text-muted-foreground">{STEP_KIND_LABELS[selectedStep.kind]}</span>
                <span className="font-semibold">{selectedStep.title}</span>
              </div>
              {selectedStep.body && <div className="text-xs whitespace-pre-wrap">{selectedStep.body}</div>}
              {selectedStep.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedStep.attachments.map((a) => (
                    <Badge key={a.id} variant="outline" className="text-[10px]">{a.refType}:{a.caption ?? a.refId.slice(0, 8)}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="steps" className="space-y-2">
          <Button size="sm" onClick={addStep}><Plus className="h-3.5 w-3.5 mr-1" /> Add step</Button>
          <div className="space-y-2">
            {[...path.steps].sort((a, b) => a.order - b.order).map((s) => (
              <StepRow
                key={s.id}
                step={s}
                allSteps={path.steps}
                graph={graph}
                onChange={(patch) => updateStep(s.id, patch)}
                onRemove={() => removeStep(s.id)}
                onMove={(dir) => move(s.id, dir)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="objectives" className="space-y-2">
          <Button size="sm" onClick={addObjective}><Plus className="h-3.5 w-3.5 mr-1" /> Add objective</Button>
          {path.objectives.map((o) => (
            <div key={o.id} className="panel p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input value={o.title} onChange={(e) => update({ objectives: path.objectives.map((x) => x.id === o.id ? { ...x, title: e.target.value } : x) })} className="h-8 text-sm" />
                <Select value={o.impact ?? "none"} onValueChange={(v) => update({ objectives: path.objectives.map((x) => x.id === o.id ? { ...x, impact: v === "none" ? undefined : v as Severity } : x) })}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Impact" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8" onClick={() => update({ objectives: path.objectives.map((x) => x.id === o.id ? { ...x, achieved: !x.achieved } : x) })}>
                  {o.achieved ? "Achieved" : "Pending"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update({ objectives: path.objectives.filter((x) => x.id !== o.id) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea value={o.description ?? ""} placeholder="Description" onChange={(e) => update({ objectives: path.objectives.map((x) => x.id === o.id ? { ...x, description: e.target.value } : x) })} className="text-xs min-h-16" />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="boundaries" className="space-y-2">
          <Button size="sm" onClick={addBoundary}><Plus className="h-3.5 w-3.5 mr-1" /> Add boundary</Button>
          {path.boundaries.map((b) => (
            <div key={b.id} className="panel p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input value={b.label} onChange={(e) => update({ boundaries: path.boundaries.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x) })} className="h-8 text-sm" />
                <Button size="sm" variant="ghost" onClick={() => update({ boundaries: path.boundaries.filter((x) => x.id !== b.id) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {path.steps.map((s) => {
                  const inside = b.stepIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => update({ boundaries: path.boundaries.map((x) => x.id === b.id ? { ...x, stepIds: inside ? x.stepIds.filter((i) => i !== s.id) : [...x.stepIds, s.id] } : x) })}
                      className={`text-[10px] mono px-1.5 py-0.5 rounded border ${inside ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                    >
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="compare" className="space-y-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <Select value={compare?.id ?? "none"} onValueChange={(v) => onCompare(v === "none" ? undefined : v)}>
              <SelectTrigger className="h-8 w-72 text-xs"><SelectValue placeholder="Pick a path to compare" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {paths.filter((p) => p.id !== path.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {compare && (
            <div className="panel p-3 space-y-1 text-xs">
              {diffPaths(path.steps, compare.steps).map((d, i) => (
                <div key={i} className={`grid grid-cols-[80px_1fr_1fr] gap-2 py-1 border-b border-border/40 last:border-b-0`}>
                  <span className={`mono text-[10px] uppercase ${d.state === "same" ? "text-muted-foreground" : d.state === "added" ? "text-emerald-400" : d.state === "removed" ? "text-rose-400" : "text-amber-400"}`}>
                    {d.state}
                  </span>
                  <span className="truncate">{d.a?.title ?? "—"}</span>
                  <span className="truncate">{d.b?.title ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

interface StepRowProps {
  step: AttackStep;
  allSteps: AttackStep[];
  graph: GraphSnapshot;
  onChange: (patch: Partial<AttackStep>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}
function StepRow({ step, allSteps, graph, onChange, onRemove, onMove }: StepRowProps) {
  const KINDS: AttackStepKind[] = ["entry", "recon", "vuln", "exploit", "pivot", "privilege", "lateral", "exfil", "objective", "note"];
  return (
    <div className="panel p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: STEP_KIND_COLORS[step.kind] }} />
        <Input value={step.title} onChange={(e) => onChange({ title: e.target.value })} className="h-8 text-sm flex-1 min-w-48" />
        <Select value={step.kind} onValueChange={(v) => onChange({ kind: v as AttackStepKind })}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{STEP_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={step.stage ?? "none"} onValueChange={(v) => onChange({ stage: v === "none" ? undefined : v as AttackStep["stage"] })}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">none</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
      <Textarea value={step.body} onChange={(e) => onChange({ body: e.target.value })} placeholder="What happens at this step (markdown)…" className="text-xs min-h-16" />
      <div className="grid md:grid-cols-3 gap-2">
        <TrustSelect label="Trust before" value={step.trustBefore} onChange={(v) => onChange({ trustBefore: v })} />
        <TrustSelect label="Trust after" value={step.trustAfter} onChange={(v) => onChange({ trustAfter: v })} />
        <div>
          <div className="text-[10px] mono uppercase text-muted-foreground mb-1">Anchor to graph node</div>
          <Select value={step.nodeId ?? "none"} onValueChange={(v) => {
            if (v === "none") { onChange({ nodeId: undefined }); return; }
            const n = graph.nodes.find((x) => x.id === v);
            if (!n) return;
            const attach = n.ref ? [makeAttachment((n.ref.type as never) === "task" ? "note" : (n.ref.type as never), n.ref.id, n.label)] : step.attachments;
            onChange({ nodeId: v, attachments: attach });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              {graph.nodes.slice(0, 200).map((n) => <SelectItem key={n.id} value={n.id}>{n.kind} · {n.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <div className="text-[10px] mono uppercase text-muted-foreground mb-1">Prerequisites</div>
        <div className="flex flex-wrap gap-1">
          {allSteps.filter((s) => s.id !== step.id).map((s) => {
            const on = step.prerequisites.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => onChange({ prerequisites: on ? step.prerequisites.filter((p) => p !== s.id) : [...step.prerequisites, s.id] })}
                className={`text-[10px] mono px-1.5 py-0.5 rounded border ${on ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
              >
                {s.title}
              </button>
            );
          })}
          {allSteps.length <= 1 && <span className="text-[10px] text-muted-foreground">Add more steps to define prerequisites.</span>}
        </div>
      </div>
      <div>
        <div className="text-[10px] mono uppercase text-muted-foreground mb-1">Tags (comma-separated technologies/CVEs)</div>
        <Input
          className="h-8 text-xs"
          value={step.tags.join(", ")}
          onChange={(e) => onChange({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
        />
      </div>
    </div>
  );
}

function TrustSelect({ label, value, onChange }: { label: string; value?: TrustLevel; onChange: (v: TrustLevel | undefined) => void }) {
  return (
    <div>
      <div className="text-[10px] mono uppercase text-muted-foreground mb-1">{label}</div>
      <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v as TrustLevel)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {TRUST_ORDER.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

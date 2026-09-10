/**
 * Knowledge Graph page — the operator-facing entry into the graph engine.
 *
 * Responsibilities are intentionally thin: wire the workspace context to the
 * graph builder, expose filter/grouping controls, and render the interactive
 * explorer + a node detail panel. All heavy logic lives in `@/lib/graph/*`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GitBranch, Save, Camera, Trash2, Focus, X } from "lucide-react";
import { GraphExplorer } from "@/components/graph/GraphExplorer";
import { buildGraph, summarize } from "@/lib/graph/build";
import { impactScore, neighbors } from "@/lib/graph/query";
import {
  DEFAULT_FILTERS,
  NODE_KIND_COLORS,
  NODE_KIND_LABELS,
  type GraphFilters,
  type GraphNodeKind,
  type GraphSnapshot,
  type SavedGraphView,
  type StoredGraphSnapshot,
} from "@/lib/graph/types";
import { deleteSnapshot, deleteView, listSnapshots, listViews, saveSnapshot, saveView } from "@/lib/graph/repo";
import { useToast } from "@/hooks/use-toast";

export default function KnowledgeGraphPage() {
  return (
    <EmptyProgramGate>
      <KnowledgeGraphInner />
    </EmptyProgramGate>
  );
}

function KnowledgeGraphInner() {
  const { activeProgram } = useWorkspace();
  const programId = activeProgram?.id ?? null;
  const { toast } = useToast();

  const [graph, setGraph] = useState<GraphSnapshot>({ nodes: [], edges: [], builtAt: 0, programId });
  const [filters, setFilters] = useState<GraphFilters>({ ...DEFAULT_FILTERS });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [views, setViews] = useState<SavedGraphView[]>([]);
  const [snapshots, setSnapshots] = useState<StoredGraphSnapshot[]>([]);
  const [viewName, setViewName] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [camera, setCamera] = useState<{ x: number; y: number; scale: number } | undefined>();

  const rebuild = useCallback(async () => {
    const g = await buildGraph({ programId });
    setGraph(g);
  }, [programId]);

  useEffect(() => { rebuild(); }, [rebuild]);
  useEffect(() => {
    listViews(programId).then(setViews);
    listSnapshots(programId).then(setSnapshots);
  }, [programId]);

  const stats = useMemo(() => summarize(graph), [graph]);
  const allTags = useMemo(() => {
    const t = new Set<string>();
    for (const n of graph.nodes) for (const tag of n.tags ?? []) t.add(tag);
    return [...t].sort();
  }, [graph]);

  const selectedNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) : undefined;
  const selectedNeighbors = useMemo(() => (selectedId ? neighbors(graph, selectedId) : []), [graph, selectedId]);
  const impact = useMemo(() => (selectedId ? impactScore(graph, selectedId) : new Map<string, number>()), [graph, selectedId]);

  const toggleKind = (k: GraphNodeKind) =>
    setFilters((f) => ({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] }));

  const onSaveView = async () => {
    const name = viewName.trim() || "Untitled view";
    const v = await saveView({ programId, name, filters, camera });
    setViews((prev) => [v, ...prev.filter((p) => p.id !== v.id)]);
    setViewName("");
    toast({ title: "Graph view saved", description: name });
  };
  const onApplyView = (v: SavedGraphView) => {
    setFilters({ ...DEFAULT_FILTERS, ...v.filters });
    if (v.camera) setCamera(v.camera);
  };
  const onDeleteView = async (id: string) => {
    await deleteView(id);
    setViews((prev) => prev.filter((v) => v.id !== id));
  };
  const onSaveSnapshot = async () => {
    const s = await saveSnapshot({ programId, name: snapshotName.trim() || `Snapshot ${new Date().toLocaleString()}`, snapshot: graph });
    setSnapshots((prev) => [s, ...prev]);
    setSnapshotName("");
    toast({ title: "Snapshot stored", description: `${graph.nodes.length} nodes captured` });
  };
  const onDeleteSnapshot = async (id: string) => {
    await deleteSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <>
      <PageHeader
        eyebrow="Knowledge Graph"
        title="Attack & Asset Graph"
        actions={
          <div className="flex items-center gap-2">
            <div className="chip border-primary/40 text-primary bg-primary/10">
              <GitBranch className="h-3 w-3" />
              {stats.nodes} nodes · {stats.edges} edges
            </div>
            <Button size="sm" variant="outline" onClick={rebuild}>Rebuild</Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[260px_1fr_340px] gap-4">
        {/* Filters */}
        <aside className="panel p-4 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Search</Label>
            <Input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Filter nodes…"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Group by</Label>
            <Select value={filters.groupBy} onValueChange={(v) => setFilters((f) => ({ ...f, groupBy: v as GraphFilters["groupBy"] }))}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="kind">Kind</SelectItem>
                <SelectItem value="program">Program</SelectItem>
                <SelectItem value="tag">Tag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Node kinds</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(NODE_KIND_LABELS) as GraphNodeKind[]).map((k) => {
                const active = filters.kinds.length === 0 || filters.kinds.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleKind(k)}
                    className="text-[10px] mono px-1.5 py-0.5 rounded border transition-colors"
                    style={{
                      borderColor: NODE_KIND_COLORS[k],
                      color: active ? NODE_KIND_COLORS[k] : "hsl(var(--muted-foreground))",
                      background: active ? `${NODE_KIND_COLORS[k]}22` : "transparent",
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {NODE_KIND_LABELS[k]} {stats.byKind[k] ? `· ${stats.byKind[k]}` : ""}
                  </button>
                );
              })}
            </div>
            {filters.kinds.length > 0 && (
              <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setFilters((f) => ({ ...f, kinds: [] }))}>
                Clear kind filter
              </Button>
            )}
          </div>

          {allTags.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Tags</Label>
              <div className="mt-2 flex flex-wrap gap-1">
                {allTags.slice(0, 40).map((t) => {
                  const on = filters.tags.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => setFilters((f) => ({ ...f, tags: on ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))}
                      className={`text-[10px] mono px-1.5 py-0.5 rounded border ${on ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                    >
                      #{t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Saved views</Label>
            <div className="flex gap-1">
              <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View name" className="h-8 text-sm" />
              <Button size="sm" onClick={onSaveView} className="h-8 px-2"><Save className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-auto">
              {views.length === 0 && <div className="text-[11px] text-muted-foreground">No saved views yet.</div>}
              {views.map((v) => (
                <div key={v.id} className="flex items-center gap-1 text-xs">
                  <button className="flex-1 text-left truncate hover:text-primary" onClick={() => onApplyView(v)}>{v.name}</button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => onDeleteView(v.id)}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Snapshots</Label>
            <div className="flex gap-1">
              <Input value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} placeholder="Snapshot label" className="h-8 text-sm" />
              <Button size="sm" onClick={onSaveSnapshot} className="h-8 px-2"><Camera className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-auto">
              {snapshots.length === 0 && <div className="text-[11px] text-muted-foreground">No snapshots yet.</div>}
              {snapshots.map((s) => (
                <div key={s.id} className="flex items-center gap-1 text-xs">
                  <span className="flex-1 truncate" title={new Date(s.createdAt).toLocaleString()}>
                    {s.name} <span className="text-muted-foreground">({s.snapshot.nodes.length})</span>
                  </span>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => onDeleteSnapshot(s.id)}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Explorer */}
        <div className="panel p-3">
          {filters.focusId && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              <Focus className="h-3.5 w-3.5 text-primary" />
              <span className="mono text-muted-foreground">Focused on</span>
              <Badge variant="outline">{graph.nodes.find((n) => n.id === filters.focusId)?.label ?? filters.focusId}</Badge>
              <Select value={String(filters.focusDepth ?? 2)} onValueChange={(v) => setFilters((f) => ({ ...f, focusDepth: Number(v) }))}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} hop{n > 1 ? "s" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setFilters((f) => ({ ...f, focusId: undefined }))}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          )}
          <GraphExplorer
            graph={graph}
            filters={filters}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCameraChange={setCamera}
            initialCamera={camera}
            height={640}
          />
        </div>

        {/* Detail panel */}
        <aside className="panel p-4 space-y-3">
          <Label className="text-xs uppercase tracking-widest mono text-muted-foreground">Node inspector</Label>
          {!selectedNode ? (
            <p className="text-sm text-muted-foreground">
              Select a node to view its metadata, direct neighbors, and impact analysis.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: NODE_KIND_COLORS[selectedNode.kind] }}
                  />
                  <span className="text-[10px] mono uppercase text-muted-foreground">{NODE_KIND_LABELS[selectedNode.kind]}</span>
                </div>
                <div className="mt-1 text-sm font-semibold break-words">{selectedNode.label}</div>
                {selectedNode.sublabel && <div className="text-xs text-muted-foreground">{selectedNode.sublabel}</div>}
              </div>

              <div className="flex flex-wrap gap-1">
                {(selectedNode.tags ?? []).map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFilters((f) => ({ ...f, focusId: selectedNode.id, focusDepth: f.focusDepth ?? 2 }))}>
                  <Focus className="h-3 w-3 mr-1" /> Focus
                </Button>
              </div>

              {selectedNode.meta && Object.keys(selectedNode.meta).length > 0 && (
                <div>
                  <Label className="text-[10px] uppercase mono text-muted-foreground">Metadata</Label>
                  <Textarea
                    readOnly
                    value={JSON.stringify(selectedNode.meta, null, 2)}
                    className="mt-1 h-24 text-[11px] mono resize-none"
                  />
                </div>
              )}

              <div>
                <Label className="text-[10px] uppercase mono text-muted-foreground">
                  Neighbors ({selectedNeighbors.length})
                </Label>
                <div className="mt-1 space-y-1 max-h-40 overflow-auto">
                  {selectedNeighbors.map((e) => {
                    const otherId = e.from === selectedNode.id ? e.to : e.from;
                    const other = graph.nodes.find((n) => n.id === otherId);
                    if (!other) return null;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelectedId(other.id)}
                        className="w-full text-left text-xs flex items-center gap-2 hover:bg-muted/40 rounded px-1 py-0.5"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: NODE_KIND_COLORS[other.kind] }} />
                        <span className="flex-1 truncate">{other.label}</span>
                        <span className="text-[10px] mono text-muted-foreground">{e.kind}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-[10px] uppercase mono text-muted-foreground">Impact reach</Label>
                <div className="mt-1 space-y-0.5 max-h-40 overflow-auto">
                  {[...impact.entries()]
                    .filter(([id]) => id !== selectedNode.id)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([id, score]) => {
                      const n = graph.nodes.find((x) => x.id === id);
                      if (!n) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => setSelectedId(id)}
                          className="w-full text-left text-xs flex items-center gap-2 hover:bg-muted/40 rounded px-1 py-0.5"
                        >
                          <span className="flex-1 truncate">{n.label}</span>
                          <span className="text-[10px] mono text-primary">{score.toFixed(2)}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

/**
 * Vulnerability Correlation dashboard.
 *
 * Surfaces likely duplicates, recurring issues, common root causes, and
 * evidence reuse opportunities. Analysts can approve, reject, queue, and
 * materialize correlations as EntityLinks while preserving originals and
 * full audit history.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GitMerge, RefreshCw, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CorrelationCard } from "@/components/correlation/CorrelationCard";
import { listClusters, runCorrelation } from "@/lib/correlation/repo";
import {
  CLUSTER_KIND_LABELS,
  DEFAULT_CORR_FILTERS,
  STATUS_LABELS,
  type CorrelationCluster,
  type CorrelationClusterKind,
  type CorrelationFilters,
  type CorrelationStatus,
} from "@/lib/correlation/types";

const KINDS: CorrelationClusterKind[] = [
  "duplicate", "recurring", "root-cause", "evidence-reuse", "endpoint-group", "asset-group",
];
const STATUSES: CorrelationStatus[] = ["open", "queued", "approved", "rejected", "merged", "resolved"];

export default function CorrelationPage() {
  return <EmptyProgramGate><CorrelationInner /></EmptyProgramGate>;
}

function CorrelationInner() {
  const { activeProgram } = useWorkspace();
  const programId = activeProgram?.id ?? null;
  const { toast } = useToast();

  const [clusters, setClusters] = useState<CorrelationCluster[]>([]);
  const [filters, setFilters] = useState<CorrelationFilters>(DEFAULT_CORR_FILTERS);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"all" | CorrelationClusterKind | "queue">("all");

  const refresh = useCallback(async () => {
    setClusters(await listClusters(programId));
  }, [programId]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async () => {
    setRunning(true);
    try {
      const s = await runCorrelation(programId);
      toast({
        title: "Correlation run complete",
        description: `+${s.clustersCreated} new · ~${s.clustersUpdated} updated · scanned ${s.scanned.findings} findings, ${s.scanned.assets} assets`,
      });
      await refresh();
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return clusters.filter((c) => {
      if (tab === "queue" && c.status !== "queued") return false;
      if (tab !== "all" && tab !== "queue" && c.kind !== tab) return false;
      if (filters.kinds.length && !filters.kinds.includes(c.kind)) return false;
      if (filters.status.length && !filters.status.includes(c.status)) return false;
      if (c.score < filters.minScore) return false;
      if (filters.tags.length && !filters.tags.some((t) => c.tags.includes(t))) return false;
      if (q && !`${c.title} ${c.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clusters, filters, tab]);

  const stats = useMemo(() => {
    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const c of clusters) {
      byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }
    return { byKind, byStatus, total: clusters.length };
  }, [clusters]);

  const onChange = (next: CorrelationCluster) => {
    setClusters((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  };

  const allTags = useMemo(() => [...new Set(clusters.flatMap((c) => c.tags))].sort(), [clusters]);

  return (
    <>
      <PageHeader
        eyebrow="Triage"
        title="Vulnerability Correlation"
        actions={
          <div className="flex items-center gap-2">
            <div className="chip border-primary/40 text-primary bg-primary/10">
              <GitMerge className="h-3 w-3" />
              {stats.total} clusters
            </div>
            <Button size="sm" onClick={run} disabled={running}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${running ? "animate-spin" : ""}`} />
              {running ? "Correlating…" : "Run correlation"}
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Left column — dashboards + filters */}
        <aside className="panel p-4 space-y-4">
          <div>
            <Label className="text-xs uppercase mono text-muted-foreground">Dashboards</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded border p-2 text-left ${tab === k ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}
                >
                  <div className="font-medium">{CLUSTER_KIND_LABELS[k]}</div>
                  <div className="mono text-[10px] text-muted-foreground">{stats.byKind[k] ?? 0} clusters</div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-xs uppercase mono text-muted-foreground">Investigation Queue</Label>
            <button
              onClick={() => setTab("queue")}
              className={`mt-2 w-full rounded border p-2 text-left text-xs ${tab === "queue" ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}
            >
              <div className="font-medium">Queued</div>
              <div className="mono text-[10px] text-muted-foreground">{stats.byStatus.queued ?? 0} awaiting review</div>
            </button>
            <button
              onClick={() => setTab("all")}
              className={`mt-2 w-full rounded border p-2 text-left text-xs ${tab === "all" ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}
            >
              <div className="font-medium">All correlations</div>
              <div className="mono text-[10px] text-muted-foreground">{stats.total} total</div>
            </button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs uppercase mono text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter
            </Label>
            <Input
              placeholder="Search…"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              className="h-8 text-sm"
            />
            <div>
              <Label className="text-[10px] mono text-muted-foreground">Min score: {(filters.minScore * 100).toFixed(0)}%</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={filters.minScore}
                onChange={(e) => setFilters((f) => ({ ...f, minScore: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <div className="text-[10px] mono text-muted-foreground mb-1">Status</div>
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((s) => {
                  const on = filters.status.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          status: on ? f.status.filter((x) => x !== s) : [...f.status, s],
                        }))
                      }
                      className={`chip text-[10px] ${on ? "border-primary/50 text-primary bg-primary/10" : ""}`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>
            {allTags.length > 0 && (
              <div>
                <div className="text-[10px] mono text-muted-foreground mb-1">Tags</div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                  {allTags.slice(0, 40).map((t) => {
                    const on = filters.tags.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            tags: on ? f.tags.filter((x) => x !== t) : [...f.tags, t],
                          }))
                        }
                        className={`chip text-[10px] ${on ? "border-primary/50 text-primary bg-primary/10" : ""}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <section className="space-y-3 min-w-0">
          <Tabs value={tab === "queue" ? "queue" : tab === "all" ? "all" : tab}>
            <TabsList>
              <TabsTrigger value="all" onClick={() => setTab("all")}>All</TabsTrigger>
              <TabsTrigger value="queue" onClick={() => setTab("queue")}>Queue</TabsTrigger>
              {KINDS.map((k) => (
                <TabsTrigger key={k} value={k} onClick={() => setTab(k)}>
                  {CLUSTER_KIND_LABELS[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filtered.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              {clusters.length === 0
                ? "No correlations yet. Click Run correlation to scan the workspace."
                : "No clusters match the current filters."}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((c) => (
              <CorrelationCard key={c.id} cluster={c} onChange={onChange} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

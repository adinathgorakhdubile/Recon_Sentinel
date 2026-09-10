import { useEffect, useMemo, useState } from "react";
import { Images, Search, Download, Trash2, GitCompare, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/TagInput";
import { RelatedPanel } from "@/components/RelatedPanel";
import { useWorkspace } from "@/context/WorkspaceContext";
import { EvidenceUpload } from "@/components/evidence/EvidenceUpload";
import { MediaThumb } from "@/components/media/MediaThumb";
import { MediaAnnotator } from "@/components/media/MediaAnnotator";
import { MediaZoom } from "@/components/media/MediaZoom";
import { MediaCompare } from "@/components/media/MediaCompare";
import { listMedia, groupByHost, hostOf, endpointOf, extractImageDimensions } from "@/lib/media/repo";
import { addEvidenceVersion, deleteEvidence, getBlob, updateEvidence, verifyIntegrity } from "@/lib/evidence/repo";
import { formatSize } from "@/lib/evidence/detect";
import type { EvidenceItem } from "@/lib/evidence/types";
import { useToast } from "@/hooks/use-toast";

export default function MediaLibraryPage() {
  return (
    <EmptyProgramGate>
      <MediaInner />
    </EmptyProgramGate>
  );
}

type Mode = "zoom" | "annotate";
type Grouping = "flat" | "host" | "folder";

function MediaInner() {
  const { activeProgram } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [query, setQuery] = useState("");
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [mode, setMode] = useState<Mode>("zoom");
  const [grouping, setGrouping] = useState<Grouping>("host");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  const reload = async () => {
    if (!activeProgram) return;
    const rows = await listMedia(activeProgram.id);
    setItems(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProgram?.id]);

  const hosts = useMemo(() => Array.from(new Set(items.map(hostOf))).sort(), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (hostFilter !== "all" && hostOf(i) !== hostFilter) return false;
      if (tagFilter && !i.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        (i.filename ?? "").toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        hostOf(i).toLowerCase().includes(q)
      );
    });
  }, [items, query, hostFilter, tagFilter]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const groups = useMemo(() => {
    if (grouping === "flat") return [{ key: "All", items: filtered }];
    if (grouping === "host") {
      const map = groupByHost(filtered);
      return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
    }
    const map = new Map<string, EvidenceItem[]>();
    for (const i of filtered) {
      const k = i.folder || "(root)";
      const arr = map.get(k) ?? []; arr.push(i); map.set(k, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
  }, [filtered, grouping]);

  // Extract dimensions when a still image is selected.
  useEffect(() => {
    setDims(null);
    if (!selected || !selected.mime.startsWith("image/")) return;
    (async () => {
      const blob = await getBlob(selected.blobId);
      if (!blob) return;
      const d = await extractImageDimensions(blob);
      setDims(d);
    })();
  }, [selected]);

  const stats = useMemo(() => ({
    items: items.length,
    hosts: hosts.length,
    bytes: items.reduce((n, i) => n + i.sizeBytes, 0),
    videos: items.filter((i) => i.mime.startsWith("video/")).length,
  }), [items, hosts]);

  const runVerify = async (item: EvidenceItem) => {
    const r = await verifyIntegrity(item.id);
    toast({
      title: r.ok ? "Integrity verified" : "Integrity mismatch",
      description: r.ok ? `SHA-256 matches (${r.expected.slice(0, 12)}…)` : `Expected ${r.expected.slice(0, 8)}… got ${r.actual?.slice(0, 8) ?? "n/a"}`,
      variant: r.ok ? "default" : "destructive",
    });
  };

  const download = async (item: EvidenceItem) => {
    const blob = await getBlob(item.blobId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = item.filename || item.title;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const remove = async (item: EvidenceItem) => {
    if (!confirm(`Delete "${item.title}"? Media, annotations and links will be removed.`)) return;
    await deleteEvidence(item.id);
    toast({ title: "Media deleted" });
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 3 · Media"
        title="Screenshot & Media Library"
      />
      <p className="text-sm text-muted-foreground -mt-4">
        Screenshots, recordings, GIFs, diagrams — organized by host, annotated, compared, and hashed for integrity.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Media" value={String(stats.items)} />
        <StatCard label="Hosts" value={String(stats.hosts)} />
        <StatCard label="Total size" value={formatSize(stats.bytes)} />
        <StatCard label="Videos" value={String(stats.videos)} />
      </div>

      <EvidenceUpload programId={activeProgram?.id ?? null} onUploaded={reload} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
        <section className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, host, tag…" className="pl-8" />
            </div>
            <Select value={hostFilter} onValueChange={setHostFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hosts</SelectItem>
                {hosts.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">No grouping</SelectItem>
                <SelectItem value="host">Group by host</SelectItem>
                <SelectItem value="folder">Group by folder</SelectItem>
              </SelectContent>
            </Select>
            <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Tag…" className="w-[140px]" />
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-md">
              <Images className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              Drop screenshots or recordings above to start building your visual evidence.
            </div>
          ) : (
            <div className="space-y-4 max-h-[720px] overflow-y-auto pr-1">
              {groups.map(({ key, items }) => (
                <div key={key}>
                  {grouping !== "flat" && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{key}</span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {items.map((i) => (
                      <MediaThumb key={i.id} item={i} selected={selectedId === i.id} onClick={() => setSelectedId(i.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {selected ? (
            <MediaDetail
              item={selected}
              mode={mode}
              onModeChange={setMode}
              programId={activeProgram?.id ?? null}
              dims={dims}
              onCompare={() => setCompareOpen(true)}
              onDownload={() => download(selected)}
              onVerify={() => runVerify(selected)}
              onDelete={() => remove(selected)}
              onNewVersion={async (f) => { await addEvidenceVersion(selected.id, f); toast({ title: "New version stored" }); reload(); }}
              onMetaUpdated={reload}
            />
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">
              <Images className="h-6 w-6 text-primary mb-2" />
              Select a screenshot or recording to inspect, annotate, or compare.
            </div>
          )}
        </aside>
      </div>

      {selected && (
        <MediaCompare open={compareOpen} onOpenChange={setCompareOpen} base={selected} candidates={items.filter((i) => i.mime.startsWith("image/"))} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <div className="text-[11px] uppercase mono text-muted-foreground">{label}</div>
      <div className="text-2xl display font-semibold">{value}</div>
    </div>
  );
}

interface DetailProps {
  item: EvidenceItem;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  programId: string | null;
  dims: { width: number; height: number } | null;
  onCompare: () => void;
  onDownload: () => void;
  onVerify: () => void;
  onDelete: () => void;
  onNewVersion: (f: File) => void;
  onMetaUpdated: () => void;
}

function MediaDetail({
  item, mode, onModeChange, programId, dims, onCompare, onDownload, onVerify, onDelete, onNewVersion, onMetaUpdated,
}: DetailProps) {
  const isImage = item.mime.startsWith("image/");
  const isVideo = item.mime.startsWith("video/");
  const [host, setHost] = useState<string>((item.meta?.host as string) ?? "");
  const [url, setUrl] = useState<string>((item.meta?.url as string) ?? "");
  const [tags, setTags] = useState<string[]>(item.tags);
  const endpoint = endpointOf(item);

  useEffect(() => {
    setHost((item.meta?.host as string) ?? "");
    setUrl((item.meta?.url as string) ?? "");
    setTags(item.tags);
  }, [item.id, item.meta, item.tags]);

  const saveMeta = async () => {
    await updateEvidence(item.id, {
      tags,
      meta: { ...(item.meta ?? {}), host: host || undefined, url: url || undefined },
    });
    onMetaUpdated();
  };

  return (
    <div className="panel p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{isVideo ? "recording" : "screenshot"}</Badge>
            <Badge variant="secondary">v{item.version}</Badge>
            {dims && <Badge variant="outline" className="text-[10px]">{dims.width}×{dims.height}</Badge>}
          </div>
          <h3 className="display text-lg font-semibold mt-1 truncate">{item.title}</h3>
          <div className="mono text-[10px] text-muted-foreground break-all">{item.sha256}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatSize(item.sizeBytes)} · {item.mime}
            {endpoint && <> · <span className="mono">{endpoint}</span></>}
          </div>
        </div>
        <RelatedPanel entityType="evidence" entityId={item.id} programId={programId} compact />
      </div>

      {isImage ? (
        <>
          <div className="flex gap-1">
            <button
              className={`text-[11px] rounded border px-2 py-1 ${mode === "zoom" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
              onClick={() => onModeChange("zoom")}
            >Zoom</button>
            <button
              className={`text-[11px] rounded border px-2 py-1 ${mode === "annotate" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
              onClick={() => onModeChange("annotate")}
            >Annotate</button>
          </div>
          {mode === "zoom" ? <MediaZoom item={item} /> : <MediaAnnotator item={item} />}
        </>
      ) : isVideo ? (
        <MediaZoom item={item} />
      ) : (
        <div className="text-xs text-muted-foreground">Non-visual evidence — open in the Evidence Vault for a full preview.</div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onDownload}><Download className="h-3.5 w-3.5 mr-1.5" />Download</Button>
        <Button size="sm" variant="outline" onClick={onVerify}><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Verify</Button>
        <Button size="sm" variant="outline" onClick={onCompare} disabled={!isImage}><GitCompare className="h-3.5 w-3.5 mr-1.5" />Compare</Button>
        <label className="inline-flex">
          <input type="file" className="hidden" accept="image/*,video/*" onChange={(e) => e.target.files?.[0] && onNewVersion(e.target.files[0])} />
          <Button size="sm" variant="outline" asChild>
            <span><RefreshCw className="h-3.5 w-3.5 mr-1.5" />New version</span>
          </Button>
        </label>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
        </Button>
      </div>

      <div className="border-t border-border/60 pt-3 space-y-2">
        <h4 className="text-xs uppercase mono text-muted-foreground">Media metadata</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Host</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="target.com" />
          </div>
          <div>
            <Label className="text-[10px]">URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://target.com/path" />
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Tags</Label>
          <TagInput value={tags} onChange={setTags} placeholder="Add tag…" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveMeta}>Save metadata</Button>
        </div>
      </div>
    </div>
  );
}

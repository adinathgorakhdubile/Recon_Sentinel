import { useEffect, useMemo, useState } from "react";
import {
  Globe, Search, Star, StarOff, Upload, Trash2, GitCompare, Plus, Copy,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/TagInput";
import { RelatedPanel } from "@/components/RelatedPanel";
import { useWorkspace } from "@/context/WorkspaceContext";
import { HttpImportDialog } from "@/components/http/HttpImportDialog";
import { HttpMessageView } from "@/components/http/HttpMessageView";
import { HttpDiffDialog } from "@/components/http/HttpDiffDialog";
import {
  createHttpCollection, createHttpItem, deleteHttpCollection, deleteHttpItem,
  distinctEndpoints, listHttpCollections, listHttpItems, updateHttpItem,
} from "@/lib/http/repo";
import { parseCurl } from "@/lib/http/parsers";
import type { HttpCollection, HttpItem, HttpSource } from "@/lib/http/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<HttpSource, string> = {
  manual: "Manual", raw: "Raw", curl: "cURL", har: "HAR",
  postman: "Postman", burp: "Burp", proxy: "Proxy", import: "Import",
};

export default function HttpLibraryPage() {
  return (
    <EmptyProgramGate>
      <HttpLibraryInner />
    </EmptyProgramGate>
  );
}

function HttpLibraryInner() {
  const { activeProgram } = useWorkspace();
  const [items, setItems] = useState<HttpItem[]>([]);
  const [collections, setCollections] = useState<HttpCollection[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<HttpSource | "all">("all");
  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [quickCurl, setQuickCurl] = useState("");

  const reload = async () => {
    if (!activeProgram) return;
    const [i, c] = await Promise.all([
      listHttpItems(activeProgram.id),
      listHttpCollections(activeProgram.id),
    ]);
    setItems(i); setCollections(c);
    if (!selectedId && i.length) setSelectedId(i[0].id);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProgram?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (favOnly && !i.favorite) return false;
      if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
      if (collectionFilter !== "all") {
        if (collectionFilter === "__none__" && i.collectionId) return false;
        if (collectionFilter !== "__none__" && i.collectionId !== collectionFilter) return false;
      }
      if (statusFilter !== "all") {
        const s = i.response?.status ?? 0;
        const bucket = Math.floor(s / 100);
        if (String(bucket) !== statusFilter) return false;
      }
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.request.url.toLowerCase().includes(q) ||
        i.request.method.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        (i.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, sourceFilter, collectionFilter, statusFilter, favOnly]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const stats = useMemo(() => ({
    total: items.length,
    endpoints: distinctEndpoints(items).length,
    withResponse: items.filter((i) => i.response).length,
    favorites: items.filter((i) => i.favorite).length,
  }), [items]);

  const addCurl = async () => {
    if (!quickCurl.trim()) return;
    try {
      const req = parseCurl(quickCurl.trim());
      await createHttpItem({ programId: activeProgram?.id ?? null, source: "curl", request: req });
      toast.success("Request added");
      setQuickCurl("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const addCollection = async () => {
    const name = window.prompt("Collection name");
    if (!name?.trim()) return;
    await createHttpCollection({ programId: activeProgram?.id ?? null, name: name.trim() });
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 3 · Traffic Library"
        title="HTTP Traffic & Requests"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={addCollection}><Plus className="h-3.5 w-3.5 mr-1.5" />Collection</Button>
            <Button size="sm" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5 mr-1.5" />Import</Button>
          </>
        }
      />
      <p className="text-sm text-muted-foreground -mt-4">
        Store, tag, and analyze HTTP requests from manual paste, cURL, HAR, Postman, and Burp exports.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Requests" value={String(stats.total)} />
        <StatCard label="Unique endpoints" value={String(stats.endpoints)} />
        <StatCard label="With responses" value={String(stats.withResponse)} />
        <StatCard label="Favorites" value={String(stats.favorites)} />
      </div>

      <div className="panel p-4 space-y-2">
        <Label className="text-xs mono uppercase text-muted-foreground">Quick-add cURL</Label>
        <div className="flex gap-2">
          <Textarea rows={2} value={quickCurl} onChange={(e) => setQuickCurl(e.target.value)}
            placeholder="curl -X POST https://example.com/api -H 'Content-Type: application/json' -d '{}'"
            className="mono text-xs flex-1" />
          <Button onClick={addCurl} disabled={!quickCurl.trim()}>Add</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
        <section className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="method, URL, tag, note…" className="pl-8" />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as HttpSource | "all")}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(SOURCE_LABELS) as HttpSource[]).map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={collectionFilter} onValueChange={setCollectionFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collections</SelectItem>
                <SelectItem value="__none__">Uncollected</SelectItem>
                {collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="2">2xx</SelectItem>
                <SelectItem value="3">3xx</SelectItem>
                <SelectItem value="4">4xx</SelectItem>
                <SelectItem value="5">5xx</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant={favOnly ? "default" : "outline"} onClick={() => setFavOnly((v) => !v)}>
              <Star className="h-3.5 w-3.5 mr-1.5" />Favorites
            </Button>
          </div>

          <div className="border border-border/60 rounded-md overflow-hidden max-h-[640px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No requests match these filters.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((i) => <RequestRow key={i.id} item={i} selected={selectedId === i.id} onSelect={() => setSelectedId(i.id)} />)}
              </ul>
            )}
          </div>

          {collections.length > 0 && (
            <div>
              <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mb-1">Collections</div>
              <div className="flex flex-wrap gap-1">
                {collections.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-[11px]">
                    {c.name}
                    <button className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteHttpCollection(c.id); reload(); }}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {selected ? (
            <RequestDetail
              item={selected}
              collections={collections}
              onChanged={reload}
              onDiff={() => setDiffOpen(true)}
              programId={activeProgram?.id ?? null}
            />
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">
              <Globe className="h-6 w-6 text-primary mb-2" />
              Select a request or import a HAR/Postman/Burp export.
            </div>
          )}
        </aside>
      </div>

      <HttpImportDialog
        open={importOpen} onOpenChange={setImportOpen}
        programId={activeProgram?.id ?? null}
        onImported={reload}
      />
      {selected && (
        <HttpDiffDialog open={diffOpen} onOpenChange={setDiffOpen} base={selected} candidates={items} />
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

function RequestRow({ item, selected, onSelect }: { item: HttpItem; selected: boolean; onSelect: () => void }) {
  const status = item.response?.status;
  const statusCls =
    !status ? "text-muted-foreground" :
    status >= 500 ? "text-destructive" :
    status >= 400 ? "text-warning" :
    status >= 300 ? "text-primary/80" :
    "text-success";
  return (
    <li
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors",
        selected && "bg-primary/5 border-l-2 border-primary",
      )}
    >
      <span className={cn("mono text-[10px] font-semibold w-14 shrink-0", methodClass(item.request.method))}>{item.request.method}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm truncate">{item.request.path ?? item.request.url}</span>
          {item.favorite && <Star className="h-3 w-3 text-warning fill-warning" />}
          <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[item.source]}</Badge>
        </div>
        <div className="text-[11px] text-muted-foreground mono truncate">{item.request.host ?? new URL(item.request.url || "http://x").host}</div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>)}
          </div>
        )}
      </div>
      {status !== undefined && (
        <span className={cn("mono text-xs shrink-0", statusCls)}>{status}</span>
      )}
    </li>
  );
}

function methodClass(m: string): string {
  switch (m.toUpperCase()) {
    case "GET": return "text-success";
    case "POST": return "text-primary";
    case "PUT": return "text-warning";
    case "PATCH": return "text-warning";
    case "DELETE": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

function RequestDetail({
  item, collections, onChanged, onDiff, programId,
}: { item: HttpItem; collections: HttpCollection[]; onChanged: () => void; onDiff: () => void; programId: string | null }) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [tags, setTags] = useState<string[]>(item.tags);
  const [collectionId, setCollectionId] = useState<string>(item.collectionId ?? "__none__");

  useEffect(() => {
    setTitle(item.title); setNotes(item.notes ?? ""); setTags(item.tags);
    setCollectionId(item.collectionId ?? "__none__");
  }, [item.id, item.title, item.notes, item.tags, item.collectionId]);

  const save = async () => {
    await updateHttpItem(item.id, {
      title, notes, tags,
      collectionId: collectionId === "__none__" ? null : collectionId,
    });
    toast.success("Saved");
    onChanged();
  };

  const toggleFav = async () => {
    await updateHttpItem(item.id, { favorite: !item.favorite });
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    await deleteHttpItem(item.id);
    toast.success("Deleted");
    onChanged();
  };

  const copyCurl = () => {
    const lines = [
      `curl -X ${item.request.method}`,
      ...item.request.headers.map((h) => `  -H '${h.name}: ${h.value.replace(/'/g, "'\\''")}'`),
      item.request.body?.text ? `  --data-raw '${item.request.body.text.replace(/'/g, "'\\''")}'` : "",
      `  '${item.request.url}'`,
    ].filter(Boolean).join(" \\\n");
    navigator.clipboard.writeText(lines);
    toast.success("cURL copied");
  };

  return (
    <div className="panel p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{SOURCE_LABELS[item.source]}</Badge>
            {item.response && <Badge variant="secondary">{item.response.status}</Badge>}
            {item.timing?.totalMs != null && <Badge variant="outline" className="text-[10px]">{Math.round(item.timing.totalMs)}ms</Badge>}
          </div>
          <h3 className="display text-lg font-semibold mt-1 truncate">{item.title}</h3>
          <div className="mono text-[11px] text-muted-foreground break-all">{item.request.method} {item.request.url}</div>
          <div className="mono text-[10px] text-muted-foreground mt-0.5">fp: {item.fingerprint}</div>
        </div>
        <div className="flex flex-col gap-1">
          <Button size="sm" variant="ghost" onClick={toggleFav}>
            {item.favorite ? <Star className="h-4 w-4 text-warning fill-warning" /> : <StarOff className="h-4 w-4" />}
          </Button>
          <RelatedPanel entityType={"http" as never} entityId={item.id} programId={programId} compact />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copyCurl}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy cURL</Button>
        <Button size="sm" variant="outline" onClick={onDiff}><GitCompare className="h-3.5 w-3.5 mr-1.5" />Compare</Button>
        <Button size="sm" variant="ghost" onClick={remove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
        </Button>
      </div>

      <HttpMessageView request={item.request} response={item.response} />

      <div className="space-y-2 border-t border-border/60 pt-3">
        <h4 className="text-xs uppercase mono text-muted-foreground">Metadata</h4>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Collection</Label>
            <Select value={collectionId} onValueChange={setCollectionId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(none)</SelectItem>
                {collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Tags</Label>
            <TagInput value={tags} onChange={setTags} placeholder="Add tag…" />
          </div>
        </div>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / observations" rows={3} />
        <div className="flex justify-end">
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

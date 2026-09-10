import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Download,
  History as HistoryIcon,
  MessageSquare,
  Link2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TagInput } from "@/components/TagInput";
import { RelatedPanel } from "@/components/RelatedPanel";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { EvidenceUpload } from "@/components/evidence/EvidenceUpload";
import { EvidencePreview } from "@/components/evidence/EvidencePreview";
import {
  listEvidence,
  deleteEvidence,
  updateEvidence,
  verifyIntegrity,
  getBlob,
  addAnnotation,
  listAnnotations,
  deleteAnnotation,
  addEvidenceVersion,
} from "@/lib/evidence/repo";
import { EVIDENCE_KINDS, formatSize, kindLabel } from "@/lib/evidence/detect";
import type { EvidenceAnnotation, EvidenceItem, EvidenceKind } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

export default function EvidenceVaultPage() {
  return (
    <EmptyProgramGate>
      <EvidenceVaultInner />
    </EmptyProgramGate>
  );
}

function EvidenceVaultInner() {
  const { activeProgram } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<EvidenceKind | "all">("all");
  const [folderFilter, setFolderFilter] = useState<string>("*");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<Record<string, boolean>>({});

  const reload = async () => {
    if (!activeProgram) return;
    const rows = await listEvidence(activeProgram.id);
    setItems(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProgram?.id]);

  const folders = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.folder) s.add(i.folder);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kindFilter !== "all" && i.kind !== kindFilter) return false;
      if (folderFilter !== "*" && (i.folder || "") !== (folderFilter === "__root__" ? "" : folderFilter)) return false;
      if (tagFilter && !i.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        i.sha256.includes(q) ||
        (i.filename ?? "").toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, query, kindFilter, folderFilter, tagFilter]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const stats = useMemo(() => {
    const total = items.length;
    const bytes = items.reduce((n, i) => n + i.sizeBytes, 0);
    const byKind = new Map<EvidenceKind, number>();
    for (const i of items) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
    return { total, bytes, byKind };
  }, [items]);

  const runVerify = async (id: string) => {
    setVerifying(id);
    const r = await verifyIntegrity(id);
    setIntegrity((prev) => ({ ...prev, [id]: r.ok }));
    setVerifying(null);
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
    a.href = url;
    a.download = item.filename || item.title;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 3 · Evidence Engine"
        title="Evidence Vault"
      />
      <p className="text-sm text-muted-foreground -mt-4">
        Central, hashed, verifiable store for screenshots, HAR, logs, PDFs, payloads, and scan artifacts.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Items" value={String(stats.total)} />
        <StatCard label="Total size" value={formatSize(stats.bytes)} />
        <StatCard label="Folders" value={String(folders.length)} />
        <StatCard label="Kinds" value={String(stats.byKind.size)} />
      </div>

      <EvidenceUpload programId={activeProgram?.id ?? null} onUploaded={reload} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, filename, hash, tag…"
                className="pl-8"
              />
            </div>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as EvidenceKind | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {EVIDENCE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={folderFilter} onValueChange={setFolderFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*">All folders</SelectItem>
                <SelectItem value="__root__">(root)</SelectItem>
                {folders.map((f) => <SelectItem key={f} value={f}>/{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Tag…"
              className="w-[140px]"
            />
          </div>

          <div className="border border-border/60 rounded-md overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No evidence matches these filters.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((i) => (
                  <li
                    key={i.id}
                    onClick={() => setSelectedId(i.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                      selectedId === i.id && "bg-primary/5 border-l-2 border-primary",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{i.title}</span>
                        <Badge variant="outline" className="text-[10px]">{kindLabel(i.kind)}</Badge>
                        {i.folder && (
                          <span className="text-[11px] mono text-muted-foreground">/{i.folder}</span>
                        )}
                        {i.version > 1 && <Badge variant="secondary" className="text-[10px]">v{i.version}</Badge>}
                        {integrity[i.id] !== undefined && (
                          integrity[i.id]
                            ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            : <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mono truncate">
                        {i.sha256.slice(0, 16)}… · {formatSize(i.sizeBytes)} · {new Date(i.createdAt).toLocaleString()}
                      </div>
                      {i.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {i.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          {selected ? (
            <EvidenceDetail
              item={selected}
              onChanged={reload}
              onDownload={() => download(selected)}
              onVerify={() => runVerify(selected.id)}
              verifying={verifying === selected.id}
            />
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">Select an item to inspect.</div>
          )}
        </aside>
      </div>
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
  onChanged: () => void;
  onDownload: () => void;
  onVerify: () => void;
  verifying: boolean;
}

function EvidenceDetail({ item, onChanged, onDownload, onVerify, verifying }: DetailProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [folder, setFolder] = useState(item.folder);
  const [tags, setTags] = useState<string[]>(item.tags);
  const [kind, setKind] = useState<EvidenceKind>(item.kind);
  const [annotations, setAnnotations] = useState<EvidenceAnnotation[]>([]);
  const [comment, setComment] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description ?? "");
    setFolder(item.folder);
    setTags(item.tags);
    setKind(item.kind);
    listAnnotations(item.id).then(setAnnotations);
  }, [item.id, item.title, item.description, item.folder, item.tags, item.kind]);

  const save = async () => {
    await updateEvidence(item.id, { title, description, folder, tags, kind });
    setEditing(false);
    toast({ title: "Saved" });
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Delete "${item.title}"? Blob, versions, annotations and links will be removed.`)) return;
    await deleteEvidence(item.id);
    toast({ title: "Evidence deleted" });
    onChanged();
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await addAnnotation({ evidenceId: item.id, kind: "comment", body: comment.trim() });
    setComment("");
    setAnnotations(await listAnnotations(item.id));
  };

  const uploadNewVersion = async (file: File) => {
    await addEvidenceVersion(item.id, file);
    toast({ title: "New version stored" });
    onChanged();
  };

  return (
    <div className="panel p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{kindLabel(item.kind)}</Badge>
            <Badge variant="secondary">v{item.version}</Badge>
          </div>
          <h3 className="display text-lg font-semibold mt-1 truncate">{item.title}</h3>
          <div className="mono text-[11px] text-muted-foreground break-all">{item.sha256}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatSize(item.sizeBytes)} · {item.mime || "binary"} · {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <EvidencePreview item={item} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onDownload}><Download className="h-3.5 w-3.5 mr-1.5" />Download</Button>
        <Button size="sm" variant="outline" onClick={onVerify} disabled={verifying}>
          <ShieldCheck className={cn("h-3.5 w-3.5 mr-1.5", verifying && "animate-pulse")} />
          {verifying ? "Verifying…" : "Verify SHA-256"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} disabled={item.history.length === 0}>
          <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />History ({item.history.length})
        </Button>
        <label className="inline-flex">
          <input
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadNewVersion(e.target.files[0])}
          />
          <Button size="sm" variant="outline" asChild>
            <span><RefreshCw className="h-3.5 w-3.5 mr-1.5" />New version</span>
          </Button>
        </label>
        <Button size="sm" variant="ghost" onClick={remove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase mono text-muted-foreground">Metadata</h4>
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={save}>Save</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
            <div className="grid grid-cols-2 gap-2">
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder (e.g. recon/httpx)" />
              <Select value={kind} onValueChange={(v) => setKind(v as EvidenceKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVIDENCE_KINDS.map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <TagInput value={tags} onChange={setTags} placeholder="Add tag…" />
          </div>
        ) : (
          <div className="text-sm space-y-1">
            {item.description && <p className="text-muted-foreground whitespace-pre-wrap">{item.description}</p>}
            <div className="text-xs text-muted-foreground">
              Folder: <span className="mono">{item.folder ? `/${item.folder}` : "(root)"}</span>
            </div>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs uppercase mono text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Comments ({annotations.length})
        </h4>
        <div className="space-y-2 max-h-[180px] overflow-auto">
          {annotations.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          {annotations.map((a) => (
            <div key={a.id} className="rounded border border-border/60 bg-muted/20 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground mono">{new Date(a.createdAt).toLocaleString()}</span>
                <button
                  onClick={async () => { await deleteAnnotation(a.id); setAnnotations(await listAnnotations(item.id)); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="whitespace-pre-wrap mt-1">{a.body}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add a comment…" />
          <Button size="sm" onClick={addComment} disabled={!comment.trim()}>Post</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs uppercase mono text-muted-foreground flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />Linked entities
        </h4>
        <RelatedPanel entityType="evidence" entityId={item.id} programId={item.programId} />
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Version history · {item.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            <div className="rounded border border-primary/40 bg-primary/5 p-2 text-xs">
              <div className="flex justify-between"><span>v{item.version} (current)</span><span className="mono">{formatSize(item.sizeBytes)}</span></div>
              <div className="mono text-[10px] break-all text-muted-foreground">{item.sha256}</div>
            </div>
            {[...item.history].reverse().map((h) => (
              <div key={h.blobId} className="rounded border border-border/60 p-2 text-xs">
                <div className="flex justify-between">
                  <span>v{h.version}</span>
                  <span className="mono">{formatSize(h.sizeBytes)} · {new Date(h.createdAt).toLocaleString()}</span>
                </div>
                <div className="mono text-[10px] break-all text-muted-foreground">{h.sha256}</div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

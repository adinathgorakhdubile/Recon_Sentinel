import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfidenceDots, StatusChip } from "@/components/Badges";
import { Plus, Search, Trash2, Network } from "lucide-react";
import type { Asset, AssetStatus, AssetType, Confidence } from "@/types";
import { toast } from "sonner";

const TYPES: AssetType[] = ["subdomain", "endpoint", "ip", "cloud", "repository", "other"];
const STATUSES: AssetStatus[] = ["new", "triaging", "in-scope", "out-of-scope", "archived"];
const CONFIDENCES: Confidence[] = ["low", "medium", "high"];

export default function AssetsPage() {
  return (
    <EmptyProgramGate>
      <AssetsInner />
    </EmptyProgramGate>
  );
}

function AssetsInner() {
  const { assets, notes, findings, addAsset, updateAsset, deleteAsset } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const [draft, setDraft] = useState<Omit<Asset, "id" | "createdAt" | "programId">>({
    name: "", type: "subdomain", source: "", confidence: "medium", status: "new", tags: [], notes: "",
  });
  const [tagsStr, setTagsStr] = useState("");

  const filtered = useMemo(
    () =>
      assets.filter(
        (a) =>
          (filterType === "all" || a.type === filterType) &&
          (!q.trim() ||
            a.name.toLowerCase().includes(q.toLowerCase()) ||
            a.notes.toLowerCase().includes(q.toLowerCase()) ||
            a.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))),
      ),
    [assets, q, filterType],
  );

  function submit() {
    if (!draft.name.trim()) { toast.error("Name required"); return; }
    addAsset({ ...draft, name: draft.name.trim(), tags: tagsStr.split(",").map(t => t.trim()).filter(Boolean) });
    toast.success("Asset added");
    setDraft({ name: "", type: "subdomain", source: "", confidence: "medium", status: "new", tags: [], notes: "" });
    setTagsStr("");
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Assets"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add asset</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add asset</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name / identifier</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mono" placeholder="api.acme.example" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as AssetType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as AssetStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Confidence</Label>
                    <Select value={draft.confidence} onValueChange={(v) => setDraft({ ...draft, confidence: v as Confidence })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONFIDENCES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Source</Label>
                  <Input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="crt.sh, js-bundle, dns..." />
                </div>
                <div>
                  <Label>Tags (comma-separated)</Label>
                  <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="mono" placeholder="prod, api" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, tag, note..." className="pl-8" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <Network className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="display text-lg font-semibold mb-1">No assets recorded</h3>
          <p className="text-sm text-muted-foreground">Add discovered subdomains, endpoints, IPs, cloud resources, and repos as you find them.</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1.2fr_auto] gap-3 px-4 py-2.5 mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/60 bg-muted/20">
            <div>Name</div><div>Type</div><div>Status</div><div>Confidence</div><div>Source / notes</div><div /> 
          </div>
          <ul>
            {filtered.map((a) => (
              <li key={a.id} className="grid grid-cols-1 md:grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1.2fr_auto] gap-3 px-4 py-3 border-b border-border/40 hover:bg-muted/20 items-center">
                <div className="min-w-0">
                  <div className="mono text-sm truncate">{a.name}</div>
                  {a.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {a.tags.map(t => <span key={t} className="chip text-[10px]">#{t}</span>)}
                    </div>
                  )}
                </div>
                <div>
                  <Select value={a.type} onValueChange={(v) => updateAsset(a.id, { type: v as AssetType })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={a.status} onValueChange={(v) => updateAsset(a.id, { status: v as AssetStatus })}>
                    <SelectTrigger className="h-8 text-xs"><StatusChip status={a.status} /></SelectTrigger>
                    <SelectContent>{STATUSES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <ConfidenceDots confidence={a.confidence} />
                  <span className="text-xs text-muted-foreground capitalize">{a.confidence}</span>
                </div>
                <div className="text-xs text-muted-foreground min-w-0">
                  <div className="mono text-[11px] truncate">{a.source || "—"}</div>
                  {a.notes && <div className="truncate">{a.notes}</div>}
                  {(() => {
                    const nc = notes.filter(n => n.relatedAssetId === a.id).length;
                    const fc = findings.filter(f => f.affectedAsset === a.name).length;
                    if (nc + fc === 0) return null;
                    return (
                      <div className="flex gap-1.5 mt-1">
                        {nc > 0 && <span className="chip text-[10px] text-amber-300 border-amber-500/30">📝 {nc}</span>}
                        {fc > 0 && <span className="chip text-[10px] text-rose-300 border-rose-500/30">🐞 {fc}</span>}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <button
                    onClick={() => { if (confirm("Delete asset?")) { deleteAsset(a.id); toast.success("Deleted"); } }}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

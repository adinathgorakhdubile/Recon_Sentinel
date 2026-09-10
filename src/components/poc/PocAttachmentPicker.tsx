import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { listEvidence } from "@/lib/evidence/repo";
import type { EvidenceItem } from "@/lib/evidence/types";
import type { HttpItem } from "@/lib/http/types";
import type { Asset, Finding, Note } from "@/types";
import type { PocAttachmentRef } from "@/lib/poc/types";

type PickerType = PocAttachmentRef["refType"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programId: string | null;
  onPick: (ref: Omit<PocAttachmentRef, "id" | "createdAt">) => void;
  initialTab?: PickerType;
}

export function PocAttachmentPicker({ open, onOpenChange, programId, onPick, initialTab }: Props) {
  const [tab, setTab] = useState<PickerType>(initialTab ?? "evidence");
  const [q, setQ] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [http, setHttp] = useState<HttpItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [ev, ht, as, fi, no] = await Promise.all([
        listEvidence(programId),
        db.http.where("programId").equals(programId as string).toArray(),
        db.assets.where("programId").equals(programId as string).toArray(),
        db.findings.where("programId").equals(programId as string).toArray(),
        db.notes.where("programId").equals(programId as string).toArray(),
      ]);
      if (!alive) return;
      setEvidence(ev);
      setHttp(ht as HttpItem[]);
      setAssets(as);
      setFindings(fi as unknown as Finding[]);
      setNotes(no);
    })();
    return () => { alive = false; };
  }, [open, programId]);

  const term = q.trim().toLowerCase();
  const match = (s: string) => !term || s.toLowerCase().includes(term);

  const filtered = useMemo(() => ({
    evidence: evidence.filter((r) => match(`${r.title} ${r.filename ?? ""} ${r.folder} ${(r.tags ?? []).join(" ")}`)),
    http: http.filter((r) => match(`${r.title ?? ""} ${r.request.url ?? ""} ${r.request.method} ${(r.tags ?? []).join(" ")}`)),
    asset: assets.filter((r) => match(`${r.name} ${r.type} ${(r.tags ?? []).join(" ")}`)),
    finding: findings.filter((r) => match(`${r.title} ${r.severity} ${r.status}`)),
    note: notes.filter((r) => match(`${r.title} ${r.body}`)),
  }), [term, evidence, http, assets, findings, notes]);

  function pick(type: PickerType, id: string, caption?: string) {
    onPick({ refType: type, refId: id, caption });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach evidence to step</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as PickerType)}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="http">HTTP</TabsTrigger>
              <TabsTrigger value="asset">Assets</TabsTrigger>
              <TabsTrigger value="finding">Findings</TabsTrigger>
              <TabsTrigger value="note">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="evidence" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.evidence.map((r) => (
                <button key={r.id} onClick={() => pick("evidence", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.folder} · {r.kind}</div>
                  </div>
                  <Badge variant="outline">{r.mime.split("/")[0]}</Badge>
                </button>
              ))}
              {filtered.evidence.length === 0 && <p className="text-sm text-muted-foreground p-3">No evidence found.</p>}
            </TabsContent>

            <TabsContent value="http" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.http.map((r) => (
                <button key={r.id} onClick={() => pick("http", r.id, r.title ?? r.request.url)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40">
                  <div className="text-sm font-mono truncate">
                    <span className="text-primary">{r.request.method}</span> {r.request.url}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.title ?? r.source}</div>
                </button>
              ))}
              {filtered.http.length === 0 && <p className="text-sm text-muted-foreground p-3">No HTTP items found.</p>}
            </TabsContent>

            <TabsContent value="asset" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.asset.map((r) => (
                <button key={r.id} onClick={() => pick("asset", r.id, r.name)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="truncate text-sm">{r.name}</div>
                  <Badge variant="outline">{r.type}</Badge>
                </button>
              ))}
              {filtered.asset.length === 0 && <p className="text-sm text-muted-foreground p-3">No assets found.</p>}
            </TabsContent>

            <TabsContent value="finding" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.finding.map((r) => (
                <button key={r.id} onClick={() => pick("finding", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="truncate text-sm">{r.title}</div>
                  <Badge variant="outline">{r.severity}</Badge>
                </button>
              ))}
              {filtered.finding.length === 0 && <p className="text-sm text-muted-foreground p-3">No findings found.</p>}
            </TabsContent>

            <TabsContent value="note" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.note.map((r) => (
                <button key={r.id} onClick={() => pick("note", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40">
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{r.body}</div>
                </button>
              ))}
              {filtered.note.length === 0 && <p className="text-sm text-muted-foreground p-3">No notes found.</p>}
            </TabsContent>
          </Tabs>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

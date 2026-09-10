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
import type { PocDoc } from "@/lib/poc/types";
import type { Asset, Finding, Note } from "@/types";
import type { ReportSource, ReportSourceType } from "@/lib/report/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programId: string | null;
  onPick: (src: Omit<ReportSource, "id">) => void;
  initialTab?: ReportSourceType;
}

export function ReportSourcePicker({ open, onOpenChange, programId, onPick, initialTab }: Props) {
  const [tab, setTab] = useState<ReportSourceType>(initialTab ?? "finding");
  const [q, setQ] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [http, setHttp] = useState<HttpItem[]>([]);
  const [pocs, setPocs] = useState<PocDoc[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [f, a, e, h, p, n] = await Promise.all([
        db.findings.where("programId").equals(programId as string).toArray(),
        db.assets.where("programId").equals(programId as string).toArray(),
        listEvidence(programId),
        db.http.where("programId").equals(programId as string).toArray(),
        db.pocs.where("programId").equals(programId as string).toArray(),
        db.notes.where("programId").equals(programId as string).toArray(),
      ]);
      if (!alive) return;
      setFindings(f as unknown as Finding[]);
      setAssets(a);
      setEvidence(e);
      setHttp(h as HttpItem[]);
      setPocs((p as PocDoc[]).filter((r) => !r.isTemplate));
      setNotes(n);
    })();
    return () => { alive = false; };
  }, [open, programId]);

  const term = q.trim().toLowerCase();
  const match = (s: string) => !term || s.toLowerCase().includes(term);
  const filtered = useMemo(() => ({
    finding: findings.filter((r) => match(`${r.title} ${r.severity} ${r.affectedAsset}`)),
    asset: assets.filter((r) => match(`${r.name} ${r.type} ${(r.tags ?? []).join(" ")}`)),
    evidence: evidence.filter((r) => match(`${r.title} ${r.filename ?? ""} ${r.folder}`)),
    http: http.filter((r) => match(`${r.title ?? ""} ${r.request.url ?? ""} ${r.request.method}`)),
    poc: pocs.filter((r) => match(`${r.title} ${r.summary} ${(r.tags ?? []).join(" ")}`)),
    note: notes.filter((r) => match(`${r.title} ${r.body}`)),
  }), [term, findings, assets, evidence, http, pocs, notes]);

  function pick(refType: ReportSourceType, refId: string, caption?: string) {
    onPick({ refType, refId, caption });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach source to section</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as ReportSourceType)}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="finding">Findings</TabsTrigger>
              <TabsTrigger value="asset">Assets</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="http">HTTP</TabsTrigger>
              <TabsTrigger value="poc">PoCs</TabsTrigger>
              <TabsTrigger value="note">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="finding" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.finding.map((r) => (
                <button key={r.id} onClick={() => pick("finding", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="truncate text-sm">{r.title}</div>
                  <Badge variant="outline" className="uppercase">{r.severity}</Badge>
                </button>
              ))}
              {filtered.finding.length === 0 && <p className="text-sm text-muted-foreground p-3">No findings.</p>}
            </TabsContent>

            <TabsContent value="asset" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.asset.map((r) => (
                <button key={r.id} onClick={() => pick("asset", r.id, r.name)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="truncate text-sm">{r.name}</div>
                  <Badge variant="outline">{r.type}</Badge>
                </button>
              ))}
              {filtered.asset.length === 0 && <p className="text-sm text-muted-foreground p-3">No assets.</p>}
            </TabsContent>

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
              {filtered.evidence.length === 0 && <p className="text-sm text-muted-foreground p-3">No evidence.</p>}
            </TabsContent>

            <TabsContent value="http" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.http.map((r) => (
                <button key={r.id} onClick={() => pick("http", r.id, r.title ?? r.request.url)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40">
                  <div className="text-sm font-mono truncate">
                    <span className="text-primary">{r.request.method}</span> {r.request.url}
                  </div>
                </button>
              ))}
              {filtered.http.length === 0 && <p className="text-sm text-muted-foreground p-3">No HTTP items.</p>}
            </TabsContent>

            <TabsContent value="poc" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.poc.map((r) => (
                <button key={r.id} onClick={() => pick("poc", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40 flex items-center justify-between">
                  <div className="truncate text-sm">{r.title}</div>
                  <Badge variant="outline" className="uppercase">{r.severity}</Badge>
                </button>
              ))}
              {filtered.poc.length === 0 && <p className="text-sm text-muted-foreground p-3">No PoCs.</p>}
            </TabsContent>

            <TabsContent value="note" className="max-h-80 overflow-auto space-y-1 mt-3">
              {filtered.note.map((r) => (
                <button key={r.id} onClick={() => pick("note", r.id, r.title)}
                        className="w-full text-left px-3 py-2 rounded border border-border/60 hover:bg-muted/40">
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{r.body}</div>
                </button>
              ))}
              {filtered.note.length === 0 && <p className="text-sm text-muted-foreground p-3">No notes.</p>}
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

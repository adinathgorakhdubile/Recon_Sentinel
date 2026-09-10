import { useState } from "react";
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
import { SeverityBadge, StatusChip } from "@/components/Badges";
import { Bug, Plus, Trash2, Sparkles, Loader2, Terminal, ShieldCheck, Camera } from "lucide-react";
import type { Finding, FindingStatus, Severity, PocAttachment } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { callCustomLLM, loadSettings, NIGHTWATCH_SYSTEM } from "@/lib/settings";
import { matchEncyclopedia } from "@/lib/reports";
import { PocCapture } from "@/components/PocCapture";
import { PocWizard } from "@/components/PocWizard";
import { cn } from "@/lib/utils";

const SEVS: Severity[] = ["info", "low", "medium", "high", "critical"];
const STATUSES: FindingStatus[] = ["draft", "validating", "ready", "submitted", "closed"];

export default function FindingsPage() {
  return (
    <EmptyProgramGate>
      <FindingsInner />
    </EmptyProgramGate>
  );
}

function FindingsInner() {
  const { findings, assets, notes, activeProgram, tasks, addFinding, updateFinding, deleteFinding } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<Finding | null>(null);
  const [draft, setDraft] = useState<Omit<Finding, "id" | "createdAt" | "programId">>({
    title: "", severity: "medium", affectedAsset: "", evidence: "", reproductionSteps: "", impact: "", status: "draft",
    reconOutput: "", cvss: "", cwe: "", remediation: "", pocAttachments: [],
  });

  function submit() {
    if (!draft.title.trim()) { toast.error("Title required"); return; }
    addFinding({ ...draft, title: draft.title.trim() });
    toast.success("Finding drafted");
    setDraft({ title: "", severity: "medium", affectedAsset: "", evidence: "", reproductionSteps: "", impact: "", status: "draft", reconOutput: "", cvss: "", cwe: "", remediation: "", pocAttachments: [] });
    setOpen(false);
  }

  async function analyze(f: Finding) {
    if (analyzing) return;
    setAnalyzing(f.id);
    try {
      const relatedNotes = notes.filter(n =>
        (f.affectedAsset && assets.find(a => a.id === n.relatedAssetId)?.name === f.affectedAsset) ||
        n.tags.some(t => f.title.toLowerCase().includes(t.toLowerCase()))
      ).slice(0, 6);
      const relatedAsset = assets.find(a => a.name === f.affectedAsset);
      const openTasks = tasks.filter(t => !t.completed).slice(0, 12).map(t => `[${t.category}/${t.phase}] ${t.title}`);

      const userPrompt = `Analyze this finding and its recon context. Return concise markdown with:
1. **Signal read** — what the evidence + recon output actually prove.
2. **Gaps** — what's missing before this can be submitted.
3. **Next 3 steps** — precise actions, safest first. Use \`Next step:\` prefix on the top one.
4. **Related vulns to chain** — from OWASP Web/API/LLM Top 10 that this could combine with.

FINDING
Title: ${f.title}
Severity: ${f.severity} | Status: ${f.status}
Affected: ${f.affectedAsset || "—"}
Impact: ${f.impact || "—"}
Evidence: ${f.evidence || "—"}
Reproduction: ${f.reproductionSteps || "—"}
Recon output attached:
${(f.reconOutput || "(none)").slice(0, 4000)}

CONTEXT
Related asset: ${relatedAsset ? `${relatedAsset.name} (${relatedAsset.type}, ${relatedAsset.status})` : "—"}
Related notes: ${relatedNotes.map(n => `- ${n.title}: ${n.body.slice(0, 200)}`).join("\n") || "—"}
Open playbook tasks: ${openTasks.join(", ") || "—"}`;

      const settings = loadSettings();
      let reply = "";

      if (settings.provider === "custom") {
        reply = await callCustomLLM(settings, [
          { role: "system", content: NIGHTWATCH_SYSTEM + (settings.systemAugment ? "\n\n" + settings.systemAugment : "") },
          { role: "user", content: userPrompt },
        ]);
      } else {
        const workspace = {
          program: activeProgram,
          asset: relatedAsset,
          notes: relatedNotes.map(n => ({ title: n.title, body: n.body, tags: n.tags })),
          finding: f,
        };
        const { data, error } = await supabase.functions.invoke("assistant-chat", {
          body: { messages: [{ role: "user", content: userPrompt }], workspace },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        reply = data.reply || "";
      }

      updateFinding(f.id, { nextSteps: reply.trim() });
      toast.success("AI next-steps generated");
    } catch (e: any) {
      toast.error(e?.message ?? "AI analysis failed");
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Evidence & impact"
        title="Findings"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New finding</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Draft a finding</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Severity</Label>
                    <Select value={draft.severity} onValueChange={(v) => setDraft({ ...draft, severity: v as Severity })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SEVS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Affected asset</Label>
                    <Input value={draft.affectedAsset} onChange={(e) => setDraft({ ...draft, affectedAsset: e.target.value })} className="mono" list="asset-list" />
                    <datalist id="asset-list">
                      {assets.map(a => <option key={a.id} value={a.name} />)}
                    </datalist>
                  </div>
                </div>
                <div>
                  <Label>Impact hypothesis</Label>
                  <Textarea rows={2} value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value })} placeholder="What can an attacker do? Who is affected?" />
                </div>
                <div>
                  <Label>Evidence</Label>
                  <Textarea rows={3} value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} placeholder="Request/response snippets, screenshots (redacted), timestamps." />
                </div>
                <div>
                  <Label>Reproduction steps</Label>
                  <Textarea rows={3} value={draft.reproductionSteps} onChange={(e) => setDraft({ ...draft, reproductionSteps: e.target.value })} placeholder="Numbered, deterministic steps." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CVSSv3.1 vector</Label>
                    <Input value={draft.cvss ?? ""} onChange={(e) => setDraft({ ...draft, cvss: e.target.value })}
                      className="mono text-xs" placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" />
                  </div>
                  <div>
                    <Label>CWE</Label>
                    <Input value={draft.cwe ?? ""} onChange={(e) => setDraft({ ...draft, cwe: e.target.value })}
                      className="mono text-xs" placeholder="CWE-639" />
                  </div>
                </div>
                <div>
                  <Label>Recommended remediation</Label>
                  <Textarea rows={2} value={draft.remediation ?? ""} onChange={(e) => setDraft({ ...draft, remediation: e.target.value })}
                    placeholder="How the vendor should fix this. Auto-suggested from OWASP mapping if left blank." />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Terminal className="h-3.5 w-3.5" /> Recon output (paste tool stdout)</Label>
                  <Textarea rows={5} value={draft.reconOutput ?? ""} onChange={(e) => setDraft({ ...draft, reconOutput: e.target.value })}
                    placeholder="Paste subfinder / httpx / nuclei / ffuf / burp output here — the AI will read it when suggesting next steps."
                    className="mono text-xs" />
                </div>
                <PocCapture
                  attachments={draft.pocAttachments ?? []}
                  onChange={(next) => setDraft({ ...draft, pocAttachments: next })}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>Save draft</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {findings.length === 0 ? (
        <div className="panel p-12 text-center">
          <Bug className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="display text-lg font-semibold mb-1">No findings yet</h3>
          <p className="text-sm text-muted-foreground">Draft findings as hypotheses solidify. Impact + evidence + repro make a submittable report.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {findings.map((f) => (
            <article key={f.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={f.severity} />
                    <StatusChip status={f.status} />
                    <span className="text-[11px] mono text-muted-foreground">
                      {formatDistanceToNow(f.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                  <h3 className="display text-xl font-semibold">{f.title}</h3>
                  <div className="mono text-xs text-primary/80 mt-0.5">{f.affectedAsset || "no asset linked"}</div>
                  <FindingMeta f={f} />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => analyze(f)} disabled={analyzing === f.id}
                    className="border-primary/40 text-primary hover:bg-primary/10">
                    {analyzing === f.id
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing…</>
                      : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI next steps</>}
                  </Button>
                  <Select value={f.status} onValueChange={(v) => updateFinding(f.id, { status: v as FindingStatus })}>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <button
                    onClick={() => { if (confirm("Delete finding?")) { deleteFinding(f.id); toast.success("Deleted"); } }}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4 text-sm mb-3">
                <Block label="Impact" body={f.impact} />
                <Block label="Evidence" body={f.evidence} />
                <Block label="Reproduction" body={f.reproductionSteps} />
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <Block label="Recon output" body={f.reconOutput || ""} mono
                  edit={(v) => updateFinding(f.id, { reconOutput: v })}
                  placeholder="Paste tool stdout (subfinder, httpx, nuclei, ffuf…) — the AI analyzer uses it directly." />
                <NextSteps text={f.nextSteps} />
              </div>

              <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="mono text-[10px] uppercase tracking-widest text-primary/70 mb-0.5">PoC evidence</div>
                  <div className="text-xs text-muted-foreground">
                    {(f.pocAttachments?.length ?? 0) === 0
                      ? "No captures yet. The wizard walks you through scope + authorization before recording."
                      : `${f.pocAttachments!.length} attachment(s) · ${Math.round(f.pocAttachments!.reduce((n, a) => n + a.sizeBytes, 0) / 1024)} KB`}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setWizardFor(f)}
                  className="border-primary/40 text-primary hover:bg-primary/10">
                  <Camera className="h-3.5 w-3.5 mr-1.5" /> Guided PoC
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {wizardFor && (
        <PocWizard
          open={!!wizardFor}
          onOpenChange={(v) => !v && setWizardFor(null)}
          program={activeProgram}
          finding={wizardFor}
          attachments={findings.find((x) => x.id === wizardFor.id)?.pocAttachments ?? []}
          onChange={(next) => updateFinding(wizardFor.id, { pocAttachments: next })}
        />
      )}
    </>
  );
}

function FindingMeta({ f }: { f: Finding }) {
  const cards = matchEncyclopedia(f);
  if (!cards.length && !f.cvss && !f.cwe) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {f.cvss && (
        <span className="mono text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary">
          {f.cvss.length > 40 ? f.cvss.slice(0, 40) + "…" : f.cvss}
        </span>
      )}
      {f.cwe && (
        <span className="mono text-[10px] px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-accent">
          {f.cwe}
        </span>
      )}
      {cards.map((c) => (
        <span key={c.id} className="mono text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-2.5 w-2.5" /> {c.code} {c.title}
        </span>
      ))}
    </div>
  );
}

function Block({ label, body, mono, edit, placeholder }: {
  label: string; body: string; mono?: boolean;
  edit?: (v: string) => void; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(body);
  if (editing && edit) {
    return (
      <div className="rounded-md border border-primary/40 bg-muted/20 p-3 space-y-2">
        <div className="mono text-[10px] uppercase tracking-widest text-primary/70">{label}</div>
        <Textarea rows={5} value={val} onChange={(e) => setVal(e.target.value)} className={cn(mono && "mono text-xs")} placeholder={placeholder} />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setVal(body); setEditing(false); }}>Cancel</Button>
          <Button size="sm" onClick={() => { edit(val); setEditing(false); }}>Save</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="mono text-[10px] uppercase tracking-widest text-primary/70">{label}</div>
        {edit && (
          <button onClick={() => { setVal(body); setEditing(true); }}
            className="mono text-[10px] uppercase text-muted-foreground hover:text-primary">edit</button>
        )}
      </div>
      <div className={cn("whitespace-pre-wrap text-foreground/85", mono ? "mono text-[11px] max-h-40 overflow-auto" : "text-sm")}>
        {body || <span className="text-muted-foreground italic">{placeholder ?? "not documented"}</span>}
      </div>
    </div>
  );
}

function NextSteps({ text }: { text?: string }) {
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="mono text-[10px] uppercase tracking-widest text-primary mb-1 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" /> AI next steps
      </div>
      {text ? (
        <div className="text-sm text-foreground/90 whitespace-pre-wrap max-h-64 overflow-auto">{text}</div>
      ) : (
        <div className="text-xs text-muted-foreground italic">
          Click <strong>AI next steps</strong> to have Nightwatch read the finding, notes, and recon output → suggest the next 3 moves.
        </div>
      )}
    </div>
  );
}

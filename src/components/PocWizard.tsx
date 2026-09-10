import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PocCapture } from "@/components/PocCapture";
import { ShieldCheck, ShieldAlert, ChevronRight, ChevronLeft, Camera, Video, Upload, CheckCircle2 } from "lucide-react";
import type { PocAttachment, Program, Finding } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  program: Program | null;
  finding: Pick<Finding, "title" | "affectedAsset">;
  attachments: PocAttachment[];
  onChange: (next: PocAttachment[]) => void;
}

type Mode = "screenshot" | "recording" | "upload";
type Step = 0 | 1 | 2 | 3;

const AUTH_CHECKS = [
  { id: "authorized", label: "I have written authorization to test this target (program invite, contract, or safe-harbor)." },
  { id: "scope", label: "The asset I'm about to capture is inside the program's in-scope list." },
  { id: "rate", label: "My activity respects the program's rate limits and rules of engagement." },
  { id: "pii", label: "I will redact any third-party PII, secrets, or session tokens before saving." },
  { id: "own", label: "Only my own test account / data will appear in the capture." },
];

export function PocWizard({ open, onOpenChange, program, finding, attachments, onChange }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [mode, setMode] = useState<Mode>("screenshot");
  const [plan, setPlan] = useState("");
  const [assetUrl, setAssetUrl] = useState(finding.affectedAsset || "");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [scopeAck, setScopeAck] = useState(false);
  const startCount = useMemo(() => attachments.length, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const allChecked = AUTH_CHECKS.every((c) => checks[c.id]);
  const inScopeText = program?.inScope?.join(", ") || "—";
  const outScopeText = program?.outScope?.join(", ") || "—";

  // Best-effort scope validation
  const scopeVerdict = useMemo(() => {
    if (!program || !assetUrl.trim()) return { ok: false, reason: "Enter the exact URL / host you'll capture." };
    const host = assetUrl.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    const inList = program.inScope.map((s) => s.toLowerCase());
    const outList = program.outScope.map((s) => s.toLowerCase());
    const matches = (patterns: string[]) => patterns.some((p) => {
      const clean = p.replace(/^https?:\/\//, "").replace(/^\*\./, "").split("/")[0];
      return host === clean || host.endsWith("." + clean);
    });
    if (matches(outList)) return { ok: false, reason: `\`${host}\` matches an OUT-OF-SCOPE entry. Do not capture.` };
    if (matches(inList)) return { ok: true, reason: `\`${host}\` matches an in-scope entry.` };
    if (!program.inScope.length) return { ok: false, reason: "No in-scope entries defined. Fill Scope & Rules first." };
    return { ok: false, reason: `\`${host}\` does not match any in-scope entry. Add it to scope or reconsider.` };
  }, [assetUrl, program]);

  function reset() {
    setStep(0); setMode("screenshot"); setPlan(""); setChecks({}); setScopeAck(false);
    setAssetUrl(finding.affectedAsset || "");
  }
  function close(v: boolean) { if (!v) reset(); onOpenChange(v); }

  const captured = attachments.length - startCount;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Guided PoC capture
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            Finding: <span className="mono text-primary/80">{finding.title || "untitled"}</span>
          </div>
        </DialogHeader>

        <Stepper step={step} />

        {step === 0 && (
          <section className="space-y-4">
            <div>
              <Label className="mb-2 block">What are you capturing?</Label>
              <div className="grid grid-cols-3 gap-2">
                <ModeCard active={mode === "screenshot"} onClick={() => setMode("screenshot")} icon={Camera} label="Screenshot" hint="Single frame proof" />
                <ModeCard active={mode === "recording"} onClick={() => setMode("recording")} icon={Video} label="Recording" hint="Full repro clip" />
                <ModeCard active={mode === "upload"} onClick={() => setMode("upload")} icon={Upload} label="Upload" hint="Existing media" />
              </div>
            </div>
            <div>
              <Label>Target asset / URL you will show</Label>
              <Input value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="https://api.example.com/v1/users/42" className="mono text-xs" />
            </div>
            <div>
              <Label>Capture plan (what will viewer see, in order)</Label>
              <Textarea rows={4} value={plan} onChange={(e) => setPlan(e.target.value)}
                placeholder="1. Log in as test user A&#10;2. Open the vulnerable request in Burp&#10;3. Modify user_id → 43, resend, show victim data returned&#10;4. Highlight the leaked field" />
              <p className="text-[11px] text-muted-foreground mt-1">Writing the plan up front makes the recording tight and the evidence unambiguous.</p>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 text-accent" /> Authorization checklist</div>
            <p className="text-xs text-muted-foreground">Every box must be checked. This log is enforced client-side — the honesty is on you.</p>
            <div className="space-y-2">
              {AUTH_CHECKS.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm p-2 rounded-md border border-border/60 hover:border-primary/40 cursor-pointer">
                  <Checkbox checked={!!checks[c.id]} onCheckedChange={(v) => setChecks((s) => ({ ...s, [c.id]: !!v }))} className="mt-0.5" />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Scope confirmation</div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1.5">
              <div><span className="mono text-muted-foreground uppercase text-[10px]">Program</span> · {program?.name || "—"}</div>
              <div><span className="mono text-muted-foreground uppercase text-[10px]">Target root</span> · <span className="mono">{program?.targetRoot || "—"}</span></div>
              <div><span className="mono text-muted-foreground uppercase text-[10px]">In-scope</span> · <span className="mono">{inScopeText}</span></div>
              <div><span className="mono text-muted-foreground uppercase text-[10px]">Out-of-scope</span> · <span className="mono">{outScopeText}</span></div>
              <div><span className="mono text-muted-foreground uppercase text-[10px]">Capturing</span> · <span className="mono">{assetUrl || "—"}</span></div>
            </div>
            <div className={cn("rounded-md p-3 text-sm border",
              scopeVerdict.ok ? "border-primary/40 bg-primary/5 text-primary" : "border-destructive/40 bg-destructive/5 text-destructive")}>
              {scopeVerdict.ok ? "✓ " : "⚠ "}{scopeVerdict.reason}
            </div>
            <label className="flex items-start gap-2 text-sm p-2 rounded-md border border-border/60 cursor-pointer">
              <Checkbox checked={scopeAck} onCheckedChange={(v) => setScopeAck(!!v)} className="mt-0.5" disabled={!scopeVerdict.ok} />
              <span>I confirm this capture is within the authorized scope shown above.</span>
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-3">
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
              <div className="font-medium text-primary flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Cleared to capture</div>
              <div className="text-muted-foreground mt-1">
                Mode: <span className="mono text-primary/80">{mode}</span> · Target: <span className="mono text-primary/80">{assetUrl}</span>
              </div>
              {plan && <details className="mt-2"><summary className="cursor-pointer text-primary/80">Show plan</summary>
                <pre className="mono text-[11px] mt-1 whitespace-pre-wrap">{plan}</pre>
              </details>}
            </div>
            <PocCapture attachments={attachments} onChange={onChange} />
            {captured > 0 && (
              <div className="text-xs text-primary">✓ {captured} new capture(s) attached this session.</div>
            )}
          </section>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => step === 0 ? close(false) : setStep((s) => (s - 1) as Step)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={
                (step === 0 && (!assetUrl.trim() || !plan.trim())) ||
                (step === 1 && !allChecked) ||
                (step === 2 && (!scopeVerdict.ok || !scopeAck))
              }
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => close(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Plan", "Authorization", "Scope", "Capture"];
  return (
    <div className="flex items-center gap-2 mb-2">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2 flex-1">
          <div className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[11px] mono border shrink-0",
            i < step ? "bg-primary/20 border-primary/60 text-primary"
              : i === step ? "bg-primary text-primary-foreground border-primary"
              : "border-border/60 text-muted-foreground")}>{i + 1}</div>
          <div className={cn("text-[11px] mono uppercase tracking-wider truncate",
            i === step ? "text-primary" : "text-muted-foreground")}>{l}</div>
          {i < labels.length - 1 && <div className="h-px bg-border/60 flex-1" />}
        </div>
      ))}
    </div>
  );
}

function ModeCard({ active, onClick, icon: Icon, label, hint }: {
  active: boolean; onClick: () => void; icon: any; label: string; hint: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-md border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40")}>
      <Icon className={cn("h-4 w-4 mb-1.5", active ? "text-primary" : "text-muted-foreground")} />
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}

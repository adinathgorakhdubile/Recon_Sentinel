import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export default function ScopePage() {
  return (
    <EmptyProgramGate>
      <ScopeInner />
    </EmptyProgramGate>
  );
}

function ScopeInner() {
  const { activeProgram, updateProgram } = useWorkspace();
  const p = activeProgram!;
  const [form, setForm] = useState({
    name: p.name,
    targetRoot: p.targetRoot,
    rules: p.rules,
    rateLimits: p.rateLimits,
    safeHarbor: p.safeHarbor,
    inScope: p.inScope,
    outScope: p.outScope,
  });
  const [inNew, setInNew] = useState("");
  const [outNew, setOutNew] = useState("");

  useEffect(() => {
    setForm({
      name: p.name,
      targetRoot: p.targetRoot,
      rules: p.rules,
      rateLimits: p.rateLimits,
      safeHarbor: p.safeHarbor,
      inScope: p.inScope,
      outScope: p.outScope,
    });
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    updateProgram(p.id, form);
    toast.success("Scope saved");
  }

  return (
    <>
      <PageHeader
        eyebrow="Authorization boundary"
        title="Scope & Rules"
        actions={<Button onClick={save}>Save changes</Button>}
      />

      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 mb-6 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm">
          <div className="font-medium mb-1">Confirm authorization before every session.</div>
          <p className="text-muted-foreground">
            Only test assets explicitly listed as in-scope by the program. Out-of-scope activity may be
            illegal and will void any safe-harbor protection.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-6 space-y-4">
          <Field label="Program name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Target root">
            <Input
              value={form.targetRoot}
              onChange={(e) => setForm({ ...form, targetRoot: e.target.value })}
              className="mono"
              placeholder="acme.example"
            />
          </Field>

          <ListEditor
            label="In-scope assets"
            items={form.inScope}
            onAdd={(v) => setForm({ ...form, inScope: [...form.inScope, v] })}
            onRemove={(i) => setForm({ ...form, inScope: form.inScope.filter((_, x) => x !== i) })}
            input={inNew}
            setInput={setInNew}
            placeholder="*.acme.example"
            tone="primary"
          />

          <ListEditor
            label="Out-of-scope assets"
            items={form.outScope}
            onAdd={(v) => setForm({ ...form, outScope: [...form.outScope, v] })}
            onRemove={(i) => setForm({ ...form, outScope: form.outScope.filter((_, x) => x !== i) })}
            input={outNew}
            setInput={setOutNew}
            placeholder="blog.acme.example"
            tone="destructive"
          />
        </div>

        <div className="panel p-6 space-y-4">
          <Field label="Rules of engagement">
            <Textarea
              rows={5}
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
              placeholder="Manual only. No DoS. No social engineering. Disclosure timeline..."
            />
          </Field>
          <Field label="Rate limits">
            <Textarea
              rows={3}
              value={form.rateLimits}
              onChange={(e) => setForm({ ...form, rateLimits: e.target.value })}
              placeholder="e.g. Max 5 req/sec per host. Respect 429."
            />
          </Field>
          <Field label="Safe-harbor language">
            <Textarea
              rows={4}
              value={form.safeHarbor}
              onChange={(e) => setForm({ ...form, safeHarbor: e.target.value })}
              placeholder="Paste the program's safe-harbor clause verbatim."
            />
          </Field>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ListEditor({
  label,
  items,
  onAdd,
  onRemove,
  input,
  setInput,
  placeholder,
  tone,
}: {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  input: string;
  setInput: (v: string) => void;
  placeholder: string;
  tone: "primary" | "destructive";
}) {
  const toneClass = tone === "primary"
    ? "border-primary/40 bg-primary/10 text-primary"
    : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div>
      <Label className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2 mt-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              onAdd(input.trim());
              setInput("");
            }
          }}
          className="mono"
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
        >
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2 min-h-6">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground italic">None yet.</span>
        )}
        {items.map((it, i) => (
          <span key={i} className={`chip ${toneClass}`}>
            {it}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="hover:opacity-70"
              aria-label={`Remove ${it}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { ArrowDown, ArrowUp, Paperclip, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PocAttachmentPicker } from "./PocAttachmentPicker";
import type { PocAttachmentRef, PocStep, PocStepKind } from "@/lib/poc/types";

const STEP_KINDS: { value: PocStepKind; label: string }[] = [
  { value: "instruction", label: "Instruction" },
  { value: "http", label: "HTTP request" },
  { value: "screenshot", label: "Screenshot" },
  { value: "media", label: "Media" },
  { value: "payload", label: "Payload" },
  { value: "terminal", label: "Terminal" },
  { value: "code", label: "Code" },
  { value: "note", label: "Note" },
];

const STEP_KIND_LANG: Partial<Record<PocStepKind, string>> = {
  http: "http",
  terminal: "bash",
  code: "javascript",
  payload: "text",
};

interface Props {
  step: PocStep;
  index: number;
  total: number;
  programId: string | null;
  onChange: (patch: Partial<PocStep>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onAttach: (ref: Omit<PocAttachmentRef, "id" | "createdAt">) => void;
  onDetach: (attachmentId: string) => void;
}

export function PocStepEditor({ step, index, total, programId, onChange, onMove, onRemove, onAttach, onDetach }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const showSnippet = step.kind === "http" || step.kind === "code" || step.kind === "terminal" || step.kind === "payload";

  return (
    <div className="border border-border/60 rounded-lg bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="mono text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
          Step {index + 1}
        </div>
        <Input
          className="flex-1"
          placeholder="Step title"
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Select value={step.kind} onValueChange={(v) => onChange({ kind: v as PocStepKind, language: STEP_KIND_LANG[v as PocStepKind] ?? step.language })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STEP_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)} title="Move up">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={index === total - 1} onClick={() => onMove(1)} title="Move down">
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} title="Delete step">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        rows={3}
        placeholder="Describe this step (markdown supported)…"
        value={step.body}
        onChange={(e) => onChange({ body: e.target.value })}
      />

      {showSnippet && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mono">Snippet</span>
            <Input
              className="h-7 w-32"
              placeholder="language"
              value={step.language ?? ""}
              onChange={(e) => onChange({ language: e.target.value })}
            />
          </div>
          <Textarea
            rows={6}
            className="font-mono text-xs"
            placeholder={
              step.kind === "http"
                ? "GET /path HTTP/1.1\nHost: target\n"
                : step.kind === "terminal"
                  ? "$ curl -s https://…"
                  : "// snippet"
            }
            value={step.snippet ?? ""}
            onChange={(e) => onChange({ snippet: e.target.value })}
          />
        </div>
      )}

      <Input
        placeholder="Expected result (optional)"
        value={step.expected ?? ""}
        onChange={(e) => onChange({ expected: e.target.value })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mono">Attachments</span>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Paperclip className="h-3 w-3 mr-1" /> Attach evidence
          </Button>
        </div>
        {step.attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attachments yet. Link screenshots, HTTP requests, assets, or findings.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {step.attachments.map((a) => (
              <Badge key={a.id} variant="outline" className="pl-2 pr-1 py-1 gap-1">
                <span className="mono text-[10px] uppercase">{a.refType}</span>
                <span className="truncate max-w-40">{a.caption ?? a.refId}</span>
                <button onClick={() => onDetach(a.id)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <PocAttachmentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        programId={programId}
        onPick={onAttach}
        initialTab={step.kind === "http" ? "http" : step.kind === "screenshot" || step.kind === "media" ? "evidence" : "evidence"}
      />
    </div>
  );
}

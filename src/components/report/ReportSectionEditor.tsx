import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Paperclip, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportSourcePicker } from "./ReportSourcePicker";
import type { ReportSection, ReportSectionKind, ReportSource } from "@/lib/report/types";

const KIND_LABELS: { value: ReportSectionKind; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "executive-summary", label: "Executive summary" },
  { value: "scope", label: "Scope" },
  { value: "methodology", label: "Methodology" },
  { value: "asset-inventory", label: "Asset inventory" },
  { value: "findings-summary", label: "Findings summary" },
  { value: "finding-detail", label: "Finding details" },
  { value: "http-evidence", label: "HTTP evidence" },
  { value: "poc", label: "Proof of concept" },
  { value: "media-gallery", label: "Screenshots" },
  { value: "timeline", label: "Timeline" },
  { value: "remediation", label: "Remediation" },
  { value: "references", label: "References" },
  { value: "appendix", label: "Appendix" },
  { value: "markdown", label: "Markdown" },
];

interface Props {
  section: ReportSection;
  index: number;
  total: number;
  programId: string | null;
  onChange: (patch: Partial<ReportSection>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onAttach: (src: Omit<ReportSource, "id">) => void;
  onDetach: (sourceId: string) => void;
  onRecompose: () => void;
}

export function ReportSectionEditor({ section, index, total, programId, onChange, onMove, onRemove, onAttach, onDetach, onRecompose }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="border border-border/60 rounded-lg bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="mono text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
          §{index + 1}
        </div>
        <Input
          className="flex-1"
          placeholder="Section title"
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Select value={section.kind} onValueChange={(v) => onChange({ kind: v as ReportSectionKind, auto: true })}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_LABELS.map((k) => (
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
        <Button variant="ghost" size="icon" onClick={() => onChange({ included: !section.included })} title={section.included ? "Exclude from export" : "Include in export"}>
          {section.included ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-50" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} title="Delete section">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={section.auto ? "secondary" : "outline"} className="uppercase text-[10px]">
            {section.auto ? "Auto" : "Manual"}
          </Badge>
          <span>{section.sources.length} source{section.sources.length === 1 ? "" : "s"}</span>
          {!section.included && <Badge variant="outline">Excluded</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRecompose}>
            <RefreshCw className="h-3 w-3 mr-1" /> Recompose
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Paperclip className="h-3 w-3 mr-1" /> Attach source
          </Button>
        </div>
      </div>

      {section.sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {section.sources.map((s) => (
            <Badge key={s.id} variant="outline" className="pl-2 pr-1 py-1 gap-1">
              <span className="mono text-[10px] uppercase">{s.refType}</span>
              <span className="truncate max-w-48">{s.caption ?? s.refId}</span>
              <button onClick={() => onDetach(s.id)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Textarea
        rows={section.kind === "markdown" ? 8 : 6}
        className="font-mono text-xs"
        placeholder={section.auto ? "Auto-composed from sources. Edit to override." : "Write section markdown…"}
        value={section.body}
        onChange={(e) => onChange({ body: e.target.value, auto: false })}
      />

      <ReportSourcePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        programId={programId}
        onPick={onAttach}
        initialTab={
          section.kind === "finding-detail" || section.kind === "findings-summary" || section.kind === "remediation" ? "finding"
          : section.kind === "http-evidence" ? "http"
          : section.kind === "poc" ? "poc"
          : section.kind === "asset-inventory" ? "asset"
          : section.kind === "media-gallery" ? "evidence"
          : "finding"
        }
      />
    </div>
  );
}

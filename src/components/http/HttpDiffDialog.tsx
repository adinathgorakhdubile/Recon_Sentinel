import { useMemo, useState } from "react";
import { diffLines } from "@/lib/http/diff";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { HttpItem } from "@/lib/http/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  base: HttpItem;
  candidates: HttpItem[];
}

export function HttpDiffDialog({ open, onOpenChange, base, candidates }: Props) {
  const [otherId, setOtherId] = useState(candidates.find((c) => c.id !== base.id)?.id ?? "");
  const other = candidates.find((c) => c.id === otherId);

  const [reqDiff, resDiff] = useMemo(() => {
    if (!other) return [[] as ReturnType<typeof diffLines>, [] as ReturnType<typeof diffLines>];
    return [
      diffLines(serialize(base, "req"), serialize(other, "req")),
      diffLines(serialize(base, "res"), serialize(other, "res")),
    ];
  }, [base, other]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare requests</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <Label className="text-xs">Base</Label>
            <div className="mono text-xs truncate">{base.title}</div>
          </div>
          <div>
            <Label className="text-xs">Compare with</Label>
            <Select value={otherId} onValueChange={setOtherId}>
              <SelectTrigger><SelectValue placeholder="Pick a request…" /></SelectTrigger>
              <SelectContent>
                {candidates.filter((c) => c.id !== base.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {other && (
          <div className="grid gap-3 md:grid-cols-2">
            <DiffPane label="Request" lines={reqDiff} />
            <DiffPane label="Response" lines={resDiff} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiffPane({ label, lines }: { label: string; lines: ReturnType<typeof diffLines> }) {
  return (
    <div className="panel p-0 overflow-hidden">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-1.5 mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xs mono max-h-[420px] overflow-auto">
        {lines.map((l, i) => (
          <div key={i} className={cn(
            "px-3 py-0.5 whitespace-pre-wrap break-all",
            l.op === "add" && "bg-success/10 text-success",
            l.op === "del" && "bg-destructive/10 text-destructive",
          )}>
            <span className="opacity-60 mr-2">{l.op === "add" ? "+" : l.op === "del" ? "−" : " "}</span>
            {l.op === "add" ? l.right : l.op === "del" ? l.left : l.left}
          </div>
        ))}
      </div>
    </div>
  );
}

function serialize(item: HttpItem, part: "req" | "res"): string {
  if (part === "req") {
    const lines = [
      `${item.request.method} ${item.request.path ?? item.request.url} HTTP/${item.request.httpVersion ?? "1.1"}`,
      ...item.request.headers.map((h) => `${h.name}: ${h.value}`),
      "",
      item.request.body?.text ?? "",
    ];
    return lines.join("\n");
  }
  const r = item.response;
  if (!r) return "(no response)";
  const lines = [
    `HTTP/${r.httpVersion ?? "1.1"} ${r.status} ${r.statusText ?? ""}`,
    ...r.headers.map((h) => `${h.name}: ${h.value}`),
    "",
    r.body?.text ?? "",
  ];
  return lines.join("\n");
}

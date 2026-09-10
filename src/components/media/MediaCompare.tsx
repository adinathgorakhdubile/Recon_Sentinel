import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MediaZoom } from "./MediaZoom";
import type { EvidenceItem } from "@/lib/evidence/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  base: EvidenceItem;
  candidates: EvidenceItem[];
}

/** Side-by-side comparison of two media items with synced zoom controls each. */
export function MediaCompare({ open, onOpenChange, base, candidates }: Props) {
  const [otherId, setOtherId] = useState<string>(candidates.find((c) => c.id !== base.id)?.id ?? "");
  const other = useMemo(() => candidates.find((c) => c.id === otherId), [candidates, otherId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Compare media</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Base · {base.title}</Label>
            <MediaZoom item={base} />
            <div className="mono text-[10px] text-muted-foreground mt-1 break-all">{base.sha256}</div>
          </div>
          <div>
            <Label className="text-xs">Compare with</Label>
            <Select value={otherId} onValueChange={setOtherId}>
              <SelectTrigger><SelectValue placeholder="Pick a media…" /></SelectTrigger>
              <SelectContent>
                {candidates.filter((c) => c.id !== base.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {other ? (
              <>
                <div className="mt-2"><MediaZoom item={other} /></div>
                <div className="mono text-[10px] text-muted-foreground mt-1 break-all">
                  {other.sha256}
                  {other.sha256 === base.sha256 && <span className="ml-2 text-success">· identical</span>}
                </div>
              </>
            ) : (
              <div className="mt-2 h-[420px] grid place-items-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground">
                Pick a media to compare
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

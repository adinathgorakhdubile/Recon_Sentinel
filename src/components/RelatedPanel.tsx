import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { GitBranch, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { createLink, deleteLink } from "@/lib/repo/links";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { EntityLink, LinkKind, LinkableType } from "@/types";
import { toast } from "sonner";

const KINDS: LinkKind[] = ["relates-to", "supports", "supersedes", "duplicates", "blocks", "derived-from"];
const LINK_TYPES: LinkableType[] = ["asset", "note", "finding", "task"];

interface Props {
  entityType: LinkableType;
  entityId: string;
  programId: string | null;
  compact?: boolean;
}

export function RelatedPanel({ entityType, entityId, programId, compact }: Props) {
  const { assets, notes, findings, tasks } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [toType, setToType] = useState<LinkableType>("finding");
  const [toId, setToId] = useState<string>("");
  const [kind, setKind] = useState<LinkKind>("relates-to");
  const [note, setNote] = useState("");

  const links = useLiveQuery(async () => {
    const [from, to] = await Promise.all([
      db.links.where("[fromType+fromId]").equals([entityType, entityId]).toArray(),
      db.links.where("[toType+toId]").equals([entityType, entityId]).toArray(),
    ]);
    return [...from, ...to].sort((a, b) => b.createdAt - a.createdAt);
  }, [entityType, entityId], [] as EntityLink[]) ?? [];

  const options = optionsForType(toType, { assets, notes, findings, tasks }).filter((o) => !(o.id === entityId && toType === entityType));

  async function submit() {
    if (!toId) { toast.error("Pick a target entity"); return; }
    await createLink({ programId, fromType: entityType, fromId: entityId, toType, toId, kind, note: note.trim() || undefined });
    setToId(""); setNote("");
    toast.success("Linked");
  }

  async function remove(id: string) {
    await deleteLink(id);
    toast.success("Unlinked");
  }

  function labelFor(t: LinkableType, id: string): string {
    const opt = optionsForType(t, { assets, notes, findings, tasks }).find((o) => o.id === id);
    return opt?.label ?? id.slice(0, 12);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={compact ? "sm" : "sm"} className="gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          {compact ? links.length : `Related · ${links.length}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3" align="end">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Cross-entity links</div>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-3">No links yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-3 max-h-52 overflow-auto">
            {links.map((l) => {
              const otherType = l.fromType === entityType && l.fromId === entityId ? l.toType : l.fromType;
              const otherId = l.fromType === entityType && l.fromId === entityId ? l.toId : l.fromId;
              return (
                <li key={l.id} className="flex items-start justify-between gap-2 rounded border border-border/60 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="mono text-[10px] uppercase text-muted-foreground">{otherType} · {l.kind}</div>
                    <div className="text-xs truncate">{labelFor(otherType, otherId)}</div>
                    {l.note && <div className="text-[11px] text-muted-foreground mt-0.5">{l.note}</div>}
                  </div>
                  <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-destructive" aria-label="Unlink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-border/60 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Target type</Label>
              <Select value={toType} onValueChange={(v) => { setToType(v as LinkableType); setToId(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LINK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as LinkKind)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Target</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick entity…" /></SelectTrigger>
              <SelectContent>
                {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No candidates.</div>}
                {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" placeholder="Why is this related?" />
          </div>
          <Button size="sm" onClick={submit} className="w-full"><Plus className="h-3.5 w-3.5 mr-1" />Add link</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function optionsForType(
  t: LinkableType,
  pools: { assets: any[]; notes: any[]; findings: any[]; tasks: any[] },
): { id: string; label: string }[] {
  switch (t) {
    case "asset": return pools.assets.map((a) => ({ id: a.id, label: a.name }));
    case "note": return pools.notes.map((n) => ({ id: n.id, label: n.title }));
    case "finding": return pools.findings.map((f) => ({ id: f.id, label: f.title }));
    case "task": return pools.tasks.map((tk) => ({ id: tk.id, label: tk.title }));
    default: return [];
  }
}

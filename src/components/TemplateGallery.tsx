import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEMPLATES, type WorkspaceTemplate } from "@/lib/templates";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel?: string;
}

export function TemplateGallery({ open, onOpenChange }: Props) {
  const { createFromTemplate } = useWorkspace();
  const [selected, setSelected] = useState<WorkspaceTemplate>(TEMPLATES[0]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  function handleCreate() {
    const n = name.trim() || selected.name;
    const t = target.trim() || selected.targetPlaceholder;
    createFromTemplate(selected.id, n, t);
    toast.success(`Workspace "${n}" created from ${selected.name}`);
    setName(""); setTarget("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Start from a template</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className={cn(
                "text-left rounded-md border p-3 transition-colors",
                selected.id === t.id ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-border",
              )}
            >
              <div className="display font-semibold text-sm mb-1">{t.name}</div>
              <div className="text-xs text-muted-foreground mb-2">{t.description}</div>
              <div className="flex flex-wrap gap-1">
                {t.focusCategories.map((c) => <span key={c} className="chip text-[10px]">{c}</span>)}
              </div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Workspace name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={selected.name} />
          </div>
          <div>
            <Label>Target root</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={selected.targetPlaceholder} className="mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create workspace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

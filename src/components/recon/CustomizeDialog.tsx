import { useState } from "react";
import { Sliders, Save, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  RECON_WIDGETS, toggleWidget, useReconDashboardConfig,
} from "@/lib/recon/dashboardConfig";

export function ReconCustomizeDialog() {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const { config, active, setActive, updateActive, saveAs, removeLayout, reset } = useReconDashboardConfig();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sliders className="h-3.5 w-3.5 mr-2" /> Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recon dashboard layout</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Layout</div>
            <div className="flex flex-wrap gap-1.5">
              {config.layouts.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setActive(l.id)}
                  className={`chip text-xs ${l.id === active.id ? "border-primary/50 text-primary" : ""}`}
                >
                  {l.name}
                  {l.id !== "default" && (
                    <button
                      type="button"
                      aria-label="delete layout"
                      onClick={(e) => { e.stopPropagation(); removeLayout(l.id); }}
                      className="ml-1.5 opacity-60 hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Widgets</div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {RECON_WIDGETS.map((w) => (
                <label key={w.id} className="flex items-start gap-3 rounded border border-border/50 bg-muted/10 p-2.5 cursor-pointer">
                  <Switch
                    checked={active.enabled[w.id]}
                    onCheckedChange={() => updateActive(toggleWidget(active, w.id))}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{w.label}</div>
                    <div className="text-[11px] text-muted-foreground">{w.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Save as new layout…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!newName.trim()}
              onClick={() => { saveAs(newName.trim()); setNewName(""); }}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save
            </Button>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>Reset all</Button>
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

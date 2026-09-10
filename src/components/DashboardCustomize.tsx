import { useState } from "react";
import { Settings2, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { WIDGETS, type WidgetId } from "@/lib/dashboard";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";

export function DashboardCustomize() {
  const [config, update, reset] = useDashboardConfig();
  const [open, setOpen] = useState(false);

  function move(id: WidgetId, dir: -1 | 1) {
    const order = [...config.order];
    const i = order.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ order });
  }

  function toggle(id: WidgetId) {
    update({ enabled: { ...config.enabled, [id]: !config.enabled[id] } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Settings2 className="h-3.5 w-3.5 mr-2" />Customize</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize dashboard</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
          {config.order.map((id, i) => {
            const meta = WIDGETS.find((w) => w.id === id);
            if (!meta) return null;
            return (
              <li key={id} className="flex items-center gap-3 rounded border border-border/60 p-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(id, -1)} disabled={i === 0} className="disabled:opacity-30 text-muted-foreground hover:text-foreground">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(id, 1)} disabled={i === config.order.length - 1} className="disabled:opacity-30 text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.description}</div>
                </div>
                <Switch checked={config.enabled[id]} onCheckedChange={() => toggle(id)} />
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={reset}><RotateCcw className="h-3.5 w-3.5 mr-2" />Reset</Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

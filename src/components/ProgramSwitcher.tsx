import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProgramSwitcher({ compact = false }: { compact?: boolean }) {
  const { state, activeProgram, setActiveProgram, createProgram, deleteProgram } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  function handleCreate() {
    if (!name.trim() || !target.trim()) {
      toast.error("Name and target root are required");
      return;
    }
    createProgram(name.trim(), target.trim());
    toast.success(`Program "${name.trim()}" created`);
    setName("");
    setTarget("");
    setCreateOpen(false);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn(
              "justify-between border-border/70 bg-muted/30 hover:bg-muted/60",
              compact ? "h-9 px-2 max-w-[180px]" : "w-full",
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="glow-dot shrink-0" />
              <span className="truncate text-left">
                {activeProgram?.name ?? "Select program"}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search programs..." />
            <CommandList>
              <CommandEmpty>No program found.</CommandEmpty>
              <CommandGroup heading="Programs">
                {state.programs.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      setActiveProgram(p.id);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          activeProgram?.id === p.id ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm">{p.name}</div>
                        <div className="truncate text-[10px] mono text-muted-foreground">
                          {p.targetRoot}
                        </div>
                      </div>
                    </div>
                    {state.programs.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete program "${p.name}"? This removes all its data.`)) {
                            deleteProgram(p.id);
                            toast.success("Program deleted");
                          }
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Delete program"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="text-primary"
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  New program
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New program workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              Only create workspaces for programs you have written authorization to test.
            </div>
            <div>
              <Label htmlFor="p-name">Program name</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Public Bug Bounty"
              />
            </div>
            <div>
              <Label htmlFor="p-target">Target root</Label>
              <Input
                id="p-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="acme.example"
                className="mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TaskCommand } from "@/types";

export function CommandBlock({ command }: { command: TaskCommand }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command.cmd);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="group rounded-md border border-border/60 bg-black/40 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-2 text-[10px] mono uppercase tracking-widest text-muted-foreground">
          <Terminal className="h-3 w-3 text-primary" />
          {command.label}
        </div>
        <button
          onClick={copy}
          className={cn(
            "flex items-center gap-1 text-[10px] mono uppercase tracking-widest px-2 py-0.5 rounded transition-colors",
            copied
              ? "text-success"
              : "text-muted-foreground hover:text-primary hover:bg-primary/10",
          )}
          aria-label="Copy command"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3 py-2 text-xs mono text-primary/90 overflow-x-auto whitespace-pre">
        <code>{command.cmd}</code>
      </pre>
      {command.note && (
        <div className="px-3 pb-2 text-[11px] text-muted-foreground italic">{command.note}</div>
      )}
    </div>
  );
}

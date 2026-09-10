import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadEvidence } from "@/lib/evidence/repo";
import { useToast } from "@/hooks/use-toast";

interface Props {
  programId: string | null;
  folder?: string;
  onUploaded?: () => void;
  compact?: boolean;
}

export function EvidenceUpload({ programId, folder, onUploaded, compact }: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const f of list) {
        await uploadEvidence({ programId, file: f, folder });
      }
      toast({ title: "Evidence stored", description: `${list.length} file${list.length === 1 ? "" : "s"} hashed and saved.` });
      onUploaded?.();
    } catch (err) {
      toast({ title: "Upload failed", description: String((err as Error).message ?? err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [programId, folder, onUploaded, toast]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-md border border-dashed transition-colors flex items-center justify-center text-center",
        compact ? "p-3 gap-2 text-xs" : "p-6 flex-col gap-2 text-sm",
        dragging ? "border-primary/60 bg-primary/5" : "border-border/60 bg-muted/20",
      )}
    >
      <Upload className={cn("text-muted-foreground", compact ? "h-4 w-4" : "h-6 w-6")} />
      <div className={cn("text-muted-foreground", compact ? "flex-1 text-left" : "")}>
        {busy ? "Hashing & storing…" : (
          <>
            Drop files here{folder ? <> · <span className="mono">/{folder}</span></> : null} or{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              browse
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {!compact && (
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose files
        </Button>
      )}
    </div>
  );
}

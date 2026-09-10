import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
  Eye,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  listImporters,
  importerById,
  acceptsFormat,
} from "@/lib/recon/importers";
import { detectFormat } from "@/lib/recon/parsers";
import {
  autoDetectImporter,
  previewImport,
  runImportBatch,
  type BatchItem,
  type PreviewOutcome,
} from "@/lib/recon/pipeline";
import type { ImportFormat, ReconStageId } from "@/lib/recon/types";

const FORMATS: ImportFormat[] = ["txt", "csv", "json", "jsonl", "xml"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per file

interface QueueItem {
  key: string;
  filename: string;
  content: string;
  size: number;
  importerId: string;
  format: ImportFormat;
  detectReason: string;
  preview?: PreviewOutcome;
  previewing?: boolean;
  runResult?: { imported: number; duplicates: number; outOfScope: number; runId: string };
  error?: string;
}

export function ScanImportDialog({
  open,
  onOpenChange,
  presetStage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetStage: ReconStageId | null;
}) {
  const { activeProgram } = useWorkspace();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [strict, setStrict] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQueue([]);
      setProgress(null);
      setBusy(false);
    }
  }, [open]);

  const importers = useMemo(() => listImporters(), []);

  const addFiles = useCallback(async (files: File[]) => {
    const additions: QueueItem[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: exceeds 20 MB limit`);
        continue;
      }
      let text: string;
      try { text = await file.text(); }
      catch { toast.error(`${file.name}: could not read`); continue; }
      const detected = autoDetectImporter(file.name, text);
      const fmt = detectFormat(file.name, text);
      let importerId = detected?.importer.id ?? "";
      let importerFmt: ImportFormat = detected?.format ?? fmt;
      let reason = detected?.reason ?? "no match";
      if (!importerId && presetStage) {
        // Fallback to first importer on the preset stage accepting the guessed format
        const fallback = listImporters().find((i) => i.stage === presetStage && i.accepts.includes(fmt));
        if (fallback) { importerId = fallback.id; importerFmt = fmt; reason = "stage fallback"; }
      }
      if (!importerId) {
        const anyImp = listImporters().find((i) => i.accepts.includes(fmt));
        importerId = anyImp?.id ?? "generic.hosts.txt";
        reason = anyImp ? "format fallback" : "default";
      }
      additions.push({
        key: `${file.name}:${file.lastModified}:${file.size}:${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        content: text,
        size: file.size,
        importerId,
        format: importerFmt,
        detectReason: reason,
      });
    }
    if (additions.length) setQueue((q) => [...q, ...additions]);
  }, [presetStage]);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) await addFiles(files);
  }, [addFiles]);

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  async function previewOne(item: QueueItem) {
    if (!activeProgram) return;
    updateItem(item.key, { previewing: true, error: undefined });
    try {
      const p = await previewImport(activeProgram, item.content, {
        importerId: item.importerId,
        format: item.format,
        filename: item.filename,
        strictScope: strict,
      }, 25);
      updateItem(item.key, { preview: p, previewing: false });
    } catch (e) {
      updateItem(item.key, { previewing: false, error: (e as Error).message });
    }
  }

  async function previewAll() {
    for (const it of queue) if (!it.preview) await previewOne(it);
  }

  async function importAll() {
    if (!activeProgram) return;
    const items: BatchItem[] = queue.map((q) => ({
      filename: q.filename,
      content: q.content,
      importerId: q.importerId,
      format: q.format,
    }));
    if (!items.length) { toast.error("Nothing to import"); return; }
    setBusy(true);
    setProgress({ current: 0, total: items.length });
    try {
      await runImportBatch(activeProgram, items, strict, (p) => {
        setProgress({ current: p.index + 1, total: p.total });
        setQueue((q) => q.map((it) => {
          if (it.filename !== p.item.filename) return it;
          if (p.run) {
            return {
              ...it,
              runResult: {
                imported: p.run.stats.imported,
                duplicates: p.run.stats.duplicates,
                outOfScope: p.run.stats.outOfScope,
                runId: p.run.id,
              },
            };
          }
          if (p.error) return { ...it, error: p.error };
          return it;
        }));
      });
      const totalImported = queue.reduce((sum, it) => sum + (it.runResult?.imported ?? 0), 0);
      toast.success(`Batch imported · ${items.length} file(s)`);
      if (totalImported === 0) toast.info("No new assets — everything was duplicate or filtered.");
    } catch (e) {
      toast.error(`Batch import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const anyImported = queue.some((q) => q.runResult);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import scan results</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`panel border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : ""
            }`}
          >
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm">
              Drop files here or{" "}
              <button
                type="button"
                className="underline hover:text-primary"
                onClick={() => fileRef.current?.click()}
              >
                browse
              </button>
              . Supports Nmap XML, Nuclei / httpx / naabu / dnsx / subfinder / amass / katana JSONL,
              ffuf JSON, Burp XML, gau / waybackurls TXT, and generic CSV / TXT / JSON.
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".txt,.csv,.tsv,.json,.jsonl,.ndjson,.xml,text/plain,application/json,application/xml"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) addFiles(files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.4fr_1.2fr_0.6fr_1.6fr_auto] gap-2 px-3 py-2 mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/60 bg-muted/20">
                <div>File</div><div>Parser</div><div>Format</div><div>Status</div><div />
              </div>
              <ul>
                {queue.map((it) => {
                  const imp = importerById(it.importerId);
                  const compat = imp ? acceptsFormat(imp, it.format) : false;
                  return (
                    <li key={it.key} className="grid grid-cols-1 md:grid-cols-[1.4fr_1.2fr_0.6fr_1.6fr_auto] gap-2 px-3 py-3 border-b border-border/40 items-center text-sm">
                      <div className="min-w-0">
                        <div className="mono truncate">{it.filename}</div>
                        <div className="text-[10px] text-muted-foreground mono">
                          {(it.size / 1024).toFixed(1)} KB · {it.detectReason}
                        </div>
                      </div>
                      <Select
                        value={it.importerId}
                        onValueChange={(v) => {
                          const nextImp = importerById(v);
                          const nextFmt = nextImp && !nextImp.accepts.includes(it.format) ? nextImp.accepts[0] : it.format;
                          updateItem(it.key, { importerId: v, format: nextFmt, preview: undefined });
                        }}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {importers.map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={it.format}
                        onValueChange={(v) => updateItem(it.key, { format: v as ImportFormat, preview: undefined })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FORMATS.map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="text-[11px] flex flex-wrap gap-1">
                        {!compat && (
                          <span className="chip text-amber-300 border-amber-500/40 inline-flex items-center gap-1">
                            <FileWarning className="h-3 w-3" /> parser doesn't accept {it.format}
                          </span>
                        )}
                        {it.previewing && (
                          <span className="chip inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> previewing</span>
                        )}
                        {it.preview && !it.runResult && (
                          <>
                            <span className="chip text-emerald-300 border-emerald-500/30">+{it.preview.imported}</span>
                            <span className="chip">parsed {it.preview.parsed}</span>
                            <span className="chip">dup {it.preview.duplicates}</span>
                            <span className="chip text-rose-300 border-rose-500/30">oos {it.preview.outOfScope}</span>
                            {it.preview.errors.length > 0 && (
                              <span className="chip text-amber-300 border-amber-500/40 inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> {it.preview.errors.length} err
                              </span>
                            )}
                          </>
                        )}
                        {it.runResult && (
                          <>
                            <span className="chip text-emerald-300 border-emerald-500/30 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> imported {it.runResult.imported}
                            </span>
                            <span className="chip">dup {it.runResult.duplicates}</span>
                            <span className="chip">oos {it.runResult.outOfScope}</span>
                          </>
                        )}
                        {it.error && (
                          <span className="chip text-rose-300 border-rose-500/30 inline-flex items-center gap-1" title={it.error}>
                            <ShieldAlert className="h-3 w-3" /> {it.error.slice(0, 40)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => previewOne(it)}
                          disabled={it.previewing || busy}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setQueue((q) => q.filter((x) => x.key !== it.key))}
                          disabled={busy}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Preview sample */}
          {queue.some((q) => q.preview && q.preview.rows.length > 0) && (
            <PreviewPanel queue={queue} />
          )}

          {/* Progress */}
          {progress && (
            <div className="panel p-3 space-y-2">
              <div className="flex items-center justify-between text-xs mono">
                <span>Importing {progress.current} / {progress.total}</span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={strict} onCheckedChange={(v) => setStrict(!!v)} disabled={busy} />
            <span>
              Strict scope — drop out-of-scope hosts instead of importing them as <span className="mono">out-of-scope</span>.
            </span>
          </label>
        </div>

        <DialogFooter className="pt-2 border-t border-border/40">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {anyImported ? "Close" : "Cancel"}
          </Button>
          <Button variant="outline" onClick={previewAll} disabled={busy || queue.length === 0}>
            <Eye className="h-4 w-4 mr-2" /> Preview all
          </Button>
          <Button onClick={importAll} disabled={busy || queue.length === 0}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</> : <><Play className="h-4 w-4 mr-2" /> Import {queue.length} file{queue.length === 1 ? "" : "s"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewPanel({ queue }: { queue: QueueItem[] }) {
  const items = queue.filter((q) => q.preview && q.preview.rows.length > 0);
  return (
    <div className="panel p-3 space-y-3">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Preview</div>
      {items.map((q) => {
        const p = q.preview!;
        return (
          <div key={q.key} className="space-y-1">
            <div className="text-xs mono truncate">{q.filename}</div>
            <div className="rounded border border-border/50 divide-y divide-border/40 max-h-40 overflow-y-auto">
              {p.rows.slice(0, 10).map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1 text-[11px] items-center">
                  <span className="mono truncate">{r.candidate.name}</span>
                  <span className="chip text-[9px]">{r.candidate.type}</span>
                  <span
                    className={`chip text-[9px] ${
                      r.duplicate ? "text-muted-foreground"
                      : r.verdict === "in-scope" ? "text-emerald-300 border-emerald-500/30"
                      : r.verdict === "out-of-scope" ? "text-rose-300 border-rose-500/30"
                      : ""
                    }`}
                  >
                    {r.duplicate ? "dup" : r.verdict}
                  </span>
                </div>
              ))}
              {p.rows.length > 10 && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground text-center">
                  … {p.rows.length - 10} more shown truncated
                </div>
              )}
            </div>
            {(p.errors.length > 0 || p.warnings.length > 0) && (
              <div className="space-y-0.5">
                {p.errors.slice(0, 3).map((e, i) => (
                  <div key={`e${i}`} className="text-[10px] text-rose-300 mono">⚠ {e}</div>
                ))}
                {p.warnings.slice(0, 3).map((w, i) => (
                  <div key={`w${i}`} className="text-[10px] text-amber-300 mono">! {w}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

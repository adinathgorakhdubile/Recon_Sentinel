import { useState } from "react";
import { Upload, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { detectHttpParser, listHttpParsers, parseHttp } from "@/lib/http/parsers";
import { importHttpText } from "@/lib/http/repo";
import type { HttpParseResult } from "@/lib/http/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programId: string | null;
  collectionId?: string | null;
  onImported: (count: number) => void;
}

export function HttpImportDialog({ open, onOpenChange, programId, collectionId, onImported }: Props) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [forceParser, setForceParser] = useState<string>("auto");
  const [preview, setPreview] = useState<HttpParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [tagStr, setTagStr] = useState("");

  const parsers = listHttpParsers();
  const detected = filename || text ? detectHttpParser(text, filename) : null;

  const runPreview = () => {
    const p = parseHttp(text, filename, forceParser === "auto" ? undefined : forceParser);
    setPreview(p);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const tags = tagStr.split(",").map((t) => t.trim()).filter(Boolean);
      const r = await importHttpText(text, filename, {
        programId,
        collectionId: collectionId ?? null,
        tags,
        forceParser: forceParser === "auto" ? undefined : forceParser,
      });
      toast.success(`Imported ${r.created.length} requests · ${r.duplicates} duplicates skipped`);
      if (r.parsed.errors.length) {
        toast.warning(`${r.parsed.errors.length} parse errors — see preview`);
      }
      onImported(r.created.length);
      onOpenChange(false);
      setText(""); setFilename(undefined); setPreview(null); setTagStr("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import HTTP traffic</DialogTitle>
        </DialogHeader>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-border/60 rounded-md p-6 text-center hover:border-primary/40 transition-colors"
        >
          <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm">Drop a HAR, Postman JSON, Burp XML, cURL, or raw .http file here</p>
          <label className="inline-block mt-3">
            <input type="file" className="hidden" onChange={onPick} accept=".har,.json,.xml,.http,.txt,.sh,.curl,.req" />
            <Button size="sm" variant="outline" asChild>
              <span><Upload className="h-3.5 w-3.5 mr-1.5" />Choose file</span>
            </Button>
          </label>
          {filename && <div className="mono text-[11px] text-muted-foreground mt-2">{filename}</div>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Parser</Label>
            <Select value={forceParser} onValueChange={setForceParser}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect {detected ? `· ${detected.label}` : ""}</SelectItem>
                {parsers.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input value={tagStr} onChange={(e) => setTagStr(e.target.value)} placeholder="e.g. auth, session-x" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Or paste content</Label>
          <Textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder="GET / HTTP/1.1&#10;Host: example.com" className="mono text-xs" />
        </div>

        {preview && (
          <div className="border border-border/60 rounded-md p-3 text-xs space-y-1 max-h-40 overflow-auto">
            <div className="mono uppercase text-[10px] text-muted-foreground">Preview · {preview.format}</div>
            <div>Parsed {preview.items.length} requests · {preview.errors.length} errors</div>
            <ul className="space-y-0.5">
              {preview.items.slice(0, 12).map((i, k) => (
                <li key={k} className="mono text-[11px] truncate">{i.request.method} {i.request.url}</li>
              ))}
              {preview.items.length > 12 && <li className="text-muted-foreground">…and {preview.items.length - 12} more</li>}
            </ul>
            {preview.errors.length > 0 && (
              <div className="text-destructive mt-1">
                {preview.errors.slice(0, 3).map((e, i) => <div key={i}>#{e.index}: {e.message}</div>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={runPreview} disabled={!text.trim() || busy}>Preview</Button>
          <Button onClick={doImport} disabled={!text.trim() || busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

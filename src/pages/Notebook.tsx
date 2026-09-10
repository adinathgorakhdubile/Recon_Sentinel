import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { TagInput } from "@/components/TagInput";
import { TagFilter } from "@/components/TagFilter";
import { RelatedPanel } from "@/components/RelatedPanel";
import { normalizeTag } from "@/lib/tags";

export default function NotebookPage() {
  return (
    <EmptyProgramGate>
      <NotebookInner />
    </EmptyProgramGate>
  );
}

function NotebookInner() {
  const { activeProgram, notes, assets, addNote, deleteNote } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [relatedAssetId, setRelatedAssetId] = useState<string>("__none");
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  function submit() {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body required");
      return;
    }
    addNote({
      title: title.trim(),
      body: body.trim(),
      tags,
      relatedAssetId: relatedAssetId === "__none" ? undefined : relatedAssetId,
    });
    toast.success("Note saved");
    setTitle(""); setBody(""); setTags([]); setRelatedAssetId("__none");
    setOpen(false);
  }

  const filtered = tagFilters.length === 0
    ? notes
    : notes.filter((n) => tagFilters.every((t) => n.tags.map(normalizeTag).includes(normalizeTag(t))));

  return (
    <>
      <PageHeader
        eyebrow="Field notes"
        title="Notebook"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New notebook entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tags</Label>
                    <TagInput value={tags} onChange={setTags} programId={activeProgram?.id} />
                  </div>
                  <div>
                    <Label>Related asset</Label>
                    <Select value={relatedAssetId} onValueChange={setRelatedAssetId}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>Save note</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="panel p-3 mb-4">
        <TagFilter
          programId={activeProgram?.id}
          selected={tagFilters}
          onToggle={(t) => setTagFilters((prev) =>
            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
          )}
          onClear={() => setTagFilters([])}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((n) => {
            const related = assets.find(a => a.id === n.relatedAssetId);
            return (
              <article key={n.id} className="panel p-5 flex flex-col">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="display text-lg font-semibold">{n.title}</h3>
                  <div className="flex items-center gap-1.5">
                    <RelatedPanel entityType="note" entityId={n.id} programId={n.programId} compact />
                    <button
                      onClick={() => { if (confirm("Delete note?")) { deleteNote(n.id); toast.success("Note deleted"); } }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  {related && <> · linked to <span className="text-primary">{related.name}</span></>}
                </div>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap flex-1">{n.body}</p>
                {n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/60">
                    {n.tags.map(t => <span key={t} className="chip">#{normalizeTag(t)}</span>)}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="panel p-12 text-center">
      <NotebookPen className="h-8 w-8 text-primary mx-auto mb-3" />
      <h3 className="display text-lg font-semibold mb-1">No notes match</h3>
      <p className="text-sm text-muted-foreground">
        Capture observations as you work — auth flows, quirks, hypotheses. Notes anchor evidence later.
      </p>
    </div>
  );
}

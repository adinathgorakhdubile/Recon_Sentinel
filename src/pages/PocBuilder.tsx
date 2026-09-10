import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookTemplate,
  Copy,
  Download,
  Eye,
  FileText,
  History as HistoryIcon,
  MessageSquare,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TagInput } from "@/components/TagInput";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PocStepEditor } from "@/components/poc/PocStepEditor";
import { PocPreview } from "@/components/poc/PocPreview";
import {
  addComment,
  addStep,
  applyTemplate,
  attachToStep,
  createPoc,
  deletePoc,
  detachFromStep,
  duplicatePoc,
  listPocs,
  listTemplates,
  removeComment,
  removeStep,
  reorderStep,
  restoreVersion,
  saveAsTemplate,
  saveVersion,
  updatePoc,
  updateStep,
} from "@/lib/poc/repo";
import { BUILTIN_POC_TEMPLATES } from "@/lib/poc/templates";
import { pocToMarkdown } from "@/lib/poc/export";
import { summarizeIssues, validatePoc } from "@/lib/poc/validate";
import { downloadMarkdown } from "@/lib/export";
import type { PocDoc } from "@/lib/poc/types";
import type { Severity } from "@/types";
import { cn } from "@/lib/utils";

const SEVERITIES: Severity[] = ["info", "low", "medium", "high", "critical"];
const STATUSES: PocDoc["status"][] = ["draft", "in-review", "validated", "archived"];

export default function PocBuilderPage() {
  return (
    <EmptyProgramGate>
      <PocBuilderInner />
    </EmptyProgramGate>
  );
}

function PocBuilderInner() {
  const { activeProgram } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<PocDoc[]>([]);
  const [templates, setTemplates] = useState<PocDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [comment, setComment] = useState("");

  async function reload(preferId?: string | null) {
    if (!activeProgram) return;
    const [pocs, tpls] = await Promise.all([
      listPocs(activeProgram.id),
      listTemplates(activeProgram.id),
    ]);
    setItems(pocs);
    setTemplates(tpls);
    const pick = preferId ?? selectedId;
    if (!pick || !pocs.find((p) => p.id === pick)) {
      setSelectedId(pocs[0]?.id ?? null);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProgram?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) =>
      `${p.title} ${p.summary} ${p.severity} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const selected = useMemo(() => items.find((p) => p.id === selectedId) ?? null, [items, selectedId]);

  const issues = useMemo(() => (selected ? validatePoc(selected) : []), [selected]);
  const issueCounts = summarizeIssues(issues);

  async function handleCreate() {
    if (!activeProgram) return;
    const doc = await createPoc(activeProgram.id);
    await reload(doc.id);
    setSelectedId(doc.id);
    toast({ title: "New PoC created" });
  }

  async function handleApplyTemplate(id: string) {
    if (!activeProgram) return;
    const doc = await applyTemplate(activeProgram.id, id);
    setTemplatesOpen(false);
    await reload(doc.id);
    setSelectedId(doc.id);
    toast({ title: "Template applied", description: doc.title });
  }

  async function patch(p: Partial<PocDoc>) {
    if (!selected) return;
    await updatePoc(selected.id, p);
    await reload(selected.id);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete PoC "${selected.title}"?`)) return;
    await deletePoc(selected.id);
    await reload(null);
    toast({ title: "PoC deleted" });
  }

  async function handleDuplicate() {
    if (!selected) return;
    const copy = await duplicatePoc(selected.id);
    if (copy) {
      await reload(copy.id);
      setSelectedId(copy.id);
    }
  }

  async function handleSaveAsTemplate() {
    if (!selected) return;
    const tpl = await saveAsTemplate(selected.id);
    if (tpl) {
      await reload(selected.id);
      toast({ title: "Saved as template", description: tpl.title });
    }
  }

  async function handleSaveVersion() {
    if (!selected) return;
    const note = window.prompt("Version note (optional)") ?? undefined;
    await saveVersion(selected.id, note || undefined);
    await reload(selected.id);
    toast({ title: "Version snapshot saved" });
  }

  async function handleExportMd() {
    if (!selected) return;
    downloadMarkdown(`poc-${selected.title.replace(/\s+/g, "-").toLowerCase()}.md`, pocToMarkdown(selected));
  }

  async function handleAddStep() {
    if (!selected) return;
    await addStep(selected.id);
    await reload(selected.id);
  }

  async function handleAddComment() {
    if (!selected || !comment.trim()) return;
    await addComment(selected.id, comment.trim());
    setComment("");
    await reload(selected.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="PoC Builder"
        eyebrow="Reproduce · document · export"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
              <BookTemplate className="h-4 w-4 mr-2" /> Templates
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" /> New PoC
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {/* List */}
        <aside className="col-span-12 lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PoCs…" className="pl-8" />
          </div>
          <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-[70vh] overflow-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No PoCs yet. Create one or apply a template.
              </div>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "w-full text-left p-3 hover:bg-muted/40 transition-colors",
                  selectedId === p.id && "bg-primary/10 border-l-2 border-primary",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{p.title || "Untitled"}</div>
                  <Badge variant="outline" className="uppercase text-[10px]">{p.severity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.summary || "No summary"}</div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                  <span>v{p.version}</span>
                  <span>·</span>
                  <span>{p.steps.length} steps</span>
                  <span>·</span>
                  <span>{p.status}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Editor */}
        <section className="col-span-12 lg:col-span-9 space-y-4">
          {!selected ? (
            <div className="rounded-lg border border-border/60 border-dashed p-12 text-center space-y-3">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Select a PoC or create a new one to get started.</div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setTemplatesOpen(true)}><BookTemplate className="h-4 w-4 mr-2" /> Browse templates</Button>
                <Button onClick={handleCreate}><Plus className="h-4 w-4 mr-2" /> New PoC</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="text-lg font-semibold"
                    value={selected.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="PoC title"
                  />
                  <Select value={selected.severity} onValueChange={(v) => patch({ severity: v as Severity })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={selected.status} onValueChange={(v) => patch({ status: v as PocDoc["status"] })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">Actions</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>PoC actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleSaveVersion}><Save className="h-4 w-4 mr-2" /> Save version</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHistoryOpen(true)}><HistoryIcon className="h-4 w-4 mr-2" /> Version history</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDuplicate}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSaveAsTemplate}><BookTemplate className="h-4 w-4 mr-2" /> Save as template</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportMd}><Download className="h-4 w-4 mr-2" /> Export markdown</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleDelete} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {issues.length > 0 && (
                  <div className={cn(
                    "text-xs rounded-md border p-3 flex items-start gap-2",
                    issueCounts.errors > 0
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
                  )}>
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-medium">
                        {issueCounts.errors} error{issueCounts.errors === 1 ? "" : "s"} · {issueCounts.warnings} warning{issueCounts.warnings === 1 ? "" : "s"}
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {issues.slice(0, 5).map((i, idx) => <li key={idx}>{i.message}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")}>
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview"><Eye className="h-3 w-3 mr-1" /> Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Summary">
                      <Textarea rows={3} value={selected.summary} onChange={(e) => patch({ summary: e.target.value })} />
                    </Field>
                    <Field label="Prerequisites">
                      <Textarea rows={3} value={selected.prerequisites} onChange={(e) => patch({ prerequisites: e.target.value })} />
                    </Field>
                    <Field label="Impact">
                      <Textarea rows={3} value={selected.impact} onChange={(e) => patch({ impact: e.target.value })} />
                    </Field>
                    <Field label="Remediation">
                      <Textarea rows={3} value={selected.remediation} onChange={(e) => patch({ remediation: e.target.value })} />
                    </Field>
                    <Field label="Tags">
                      <TagInput value={selected.tags} onChange={(v) => patch({ tags: v })} />
                    </Field>
                    <Field label="References (one per line)">
                      <Textarea
                        rows={3}
                        value={selected.references.join("\n")}
                        onChange={(e) => patch({ references: e.target.value.split(/\n+/).map((s) => s.trim()).filter(Boolean) })}
                      />
                    </Field>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider mono text-muted-foreground">
                      Reproduction steps
                    </h3>
                    <Button size="sm" variant="outline" onClick={handleAddStep}>
                      <Plus className="h-4 w-4 mr-1" /> Add step
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {selected.steps.length === 0 && (
                      <p className="text-sm text-muted-foreground p-6 border border-dashed border-border/60 rounded-lg text-center">
                        No steps yet. Add one to describe how to reproduce this finding.
                      </p>
                    )}
                    {selected.steps.map((s, i) => (
                      <PocStepEditor
                        key={s.id}
                        step={s}
                        index={i}
                        total={selected.steps.length}
                        programId={activeProgram?.id ?? null}
                        onChange={async (p) => { await updateStep(selected.id, s.id, p); await reload(selected.id); }}
                        onMove={async (d) => { await reorderStep(selected.id, s.id, d); await reload(selected.id); }}
                        onRemove={async () => { await removeStep(selected.id, s.id); await reload(selected.id); }}
                        onAttach={async (ref) => { await attachToStep(selected.id, s.id, ref); await reload(selected.id); }}
                        onDetach={async (aid) => { await detachFromStep(selected.id, s.id, aid); await reload(selected.id); }}
                      />
                    ))}
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Comments</h3>
                      <span className="text-xs text-muted-foreground">({selected.comments.length})</span>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-auto">
                      {selected.comments.map((c) => (
                        <div key={c.id} className="text-sm border border-border/40 rounded p-2 flex justify-between items-start gap-2">
                          <div>
                            <div className="text-xs text-muted-foreground mono">{new Date(c.createdAt).toLocaleString()}</div>
                            <div>{c.body}</div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={async () => { await removeComment(selected.id, c.id); await reload(selected.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {selected.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                    </div>
                    <div className="flex gap-2">
                      <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a collaboration comment…" />
                      <Button onClick={handleAddComment}>Post</Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <PocPreview doc={selected} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </section>
      </div>

      {/* Templates dialog */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>PoC templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-xs uppercase tracking-wider mono text-muted-foreground mb-2">Built-in</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {BUILTIN_POC_TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => handleApplyTemplate(t.id)}
                          className="text-left p-3 rounded border border-border/60 hover:bg-muted/40">
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-medium">{t.name}</div>
                      <Badge variant="outline">{t.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            {templates.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wider mono text-muted-foreground mb-2">Saved</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => handleApplyTemplate(t.id)}
                            className="text-left p-3 rounded border border-border/60 hover:bg-muted/40">
                      <div className="text-sm font-medium">{t.title}</div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.summary}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-auto">
            {(selected?.history ?? []).length === 0 && <p className="text-sm text-muted-foreground">No versions snapshotted yet.</p>}
            {(selected?.history ?? []).slice().reverse().map((v) => (
              <div key={v.version} className="flex items-center justify-between border border-border/60 rounded p-2">
                <div>
                  <div className="text-sm font-medium">v{v.version} — {v.snapshot.title}</div>
                  <div className="text-xs text-muted-foreground mono">{new Date(v.createdAt).toLocaleString()}</div>
                  {v.note && <div className="text-xs mt-1">{v.note}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!selected) return;
                  await restoreVersion(selected.id, v.version);
                  await reload(selected.id);
                  setHistoryOpen(false);
                  toast({ title: `Restored to v${v.version}` });
                }}>Restore</Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider mono text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

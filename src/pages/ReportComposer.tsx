import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookTemplate,
  Copy,
  Download,
  Eye,
  FileText,
  History as HistoryIcon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ReportSectionEditor } from "@/components/report/ReportSectionEditor";
import { ReportPreviewPane } from "@/components/report/ReportPreviewPane";
import {
  addSection,
  applyTemplate,
  attachSource,
  createReport,
  deleteReport,
  detachSource,
  duplicateReport,
  listReports,
  removeSection,
  reorderSection,
  restoreVersion,
  saveVersion,
  updateReport,
  updateSection,
} from "@/lib/report/repo";
import {
  autoComposeReport,
  loadReportContext,
  reportToMarkdown,
} from "@/lib/report/compose";
import { REPORT_TEMPLATES } from "@/lib/report/templates";
import { summarizeIssues, validateReport } from "@/lib/report/validate";
import { downloadMarkdown } from "@/lib/export";
import type { ReportDoc, ReportFormatId, ReportSectionKind, ReportValidationIssue } from "@/lib/report/types";
import { cn } from "@/lib/utils";

const SECTION_KINDS: { value: ReportSectionKind; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "executive-summary", label: "Executive summary" },
  { value: "scope", label: "Scope" },
  { value: "methodology", label: "Methodology" },
  { value: "asset-inventory", label: "Asset inventory" },
  { value: "findings-summary", label: "Findings summary" },
  { value: "finding-detail", label: "Finding details" },
  { value: "http-evidence", label: "HTTP evidence" },
  { value: "poc", label: "Proof of concept" },
  { value: "media-gallery", label: "Screenshots" },
  { value: "timeline", label: "Timeline" },
  { value: "remediation", label: "Remediation" },
  { value: "references", label: "References" },
  { value: "appendix", label: "Appendix" },
  { value: "markdown", label: "Free markdown" },
];

export default function ReportComposerPage() {
  return (
    <EmptyProgramGate>
      <ReportComposerInner />
    </EmptyProgramGate>
  );
}

function ReportComposerInner() {
  const { activeProgram, findings } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<ReportDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addKind, setAddKind] = useState<ReportSectionKind>("markdown");
  const [issues, setIssues] = useState<ReportValidationIssue[]>([]);

  async function reload(preferId?: string | null) {
    if (!activeProgram) return;
    const rows = await listReports(activeProgram.id);
    setItems(rows);
    const pick = preferId ?? selectedId;
    if (!pick || !rows.find((r) => r.id === pick)) {
      setSelectedId(rows[0]?.id ?? null);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProgram?.id]);

  const selected = useMemo(() => items.find((r) => r.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    let alive = true;
    if (!selected || !activeProgram) { setIssues([]); return; }
    (async () => {
      const ctx = await loadReportContext(activeProgram.id);
      if (!alive) return;
      setIssues(validateReport(selected, ctx));
    })();
    return () => { alive = false; };
  }, [selected, activeProgram?.id]);

  const issueCounts = summarizeIssues(issues);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => `${r.title} ${r.format} ${r.meta.client ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  async function handleCreate(format: ReportFormatId = "detailed") {
    if (!activeProgram) return;
    const doc = await createReport(activeProgram.id, format);
    await reload(doc.id);
    setSelectedId(doc.id);
    setTemplatesOpen(false);
    toast({ title: "Report created", description: doc.title });
  }

  async function patch(p: Partial<ReportDoc>) {
    if (!selected) return;
    await updateReport(selected.id, p);
    await reload(selected.id);
  }

  async function handleRecomposeAll() {
    if (!selected) return;
    const next = await autoComposeReport({ ...selected, sections: selected.sections.map((s) => ({ ...s, auto: true })) });
    await updateReport(selected.id, { sections: next.sections });
    await reload(selected.id);
    toast({ title: "All sections recomposed" });
  }

  async function handleRecomposeSection(sectionId: string) {
    if (!selected) return;
    const patched = { ...selected, sections: selected.sections.map((s) => s.id === sectionId ? { ...s, auto: true } : s) };
    const next = await autoComposeReport(patched);
    const section = next.sections.find((s) => s.id === sectionId);
    if (!section) return;
    await updateSection(selected.id, sectionId, { body: section.body, auto: true });
    await reload(selected.id);
  }

  async function handleExport() {
    if (!selected) return;
    const md = await reportToMarkdown(selected);
    downloadMarkdown(`report-${selected.title.replace(/\s+/g, "-").toLowerCase()}.md`, md);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete report "${selected.title}"?`)) return;
    await deleteReport(selected.id);
    await reload(null);
    toast({ title: "Report deleted" });
  }

  async function handleDuplicate() {
    if (!selected) return;
    const copy = await duplicateReport(selected.id);
    if (copy) { await reload(copy.id); setSelectedId(copy.id); }
  }

  async function handleSaveVersion() {
    if (!selected) return;
    const note = window.prompt("Version note (optional)") ?? undefined;
    await saveVersion(selected.id, note || undefined);
    await reload(selected.id);
    toast({ title: "Version snapshot saved" });
  }

  async function handleAddSection() {
    if (!selected) return;
    await addSection(selected.id, addKind);
    await reload(selected.id);
  }

  const findingLookup = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Composer"
        eyebrow="Evidence · trace · export"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
              <BookTemplate className="h-4 w-4 mr-2" /> Templates
            </Button>
            <Button onClick={() => handleCreate("detailed")}>
              <Plus className="h-4 w-4 mr-2" /> New report
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports…" className="pl-8" />
          </div>
          <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-[70vh] overflow-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No reports yet. Create one from a template.
              </div>
            )}
            {filtered.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                      className={cn("w-full text-left p-3 hover:bg-muted/40", selectedId === r.id && "bg-primary/10 border-l-2 border-primary")}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <Badge variant="outline" className="text-[10px]">{r.format}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.sections.length} sections · v{r.version}
                </div>
                <div className="text-[10px] text-muted-foreground mono mt-1">{new Date(r.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-9 space-y-4">
          {!selected ? (
            <div className="rounded-lg border border-border/60 border-dashed p-12 text-center space-y-3">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Select a report or create a new one to get started.</div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setTemplatesOpen(true)}><BookTemplate className="h-4 w-4 mr-2" /> Browse templates</Button>
                <Button onClick={() => handleCreate("detailed")}><Plus className="h-4 w-4 mr-2" /> New report</Button>
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
                    placeholder="Report title"
                  />
                  <Select value={selected.format} onValueChange={(v) => patch({ format: v as ReportFormatId })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Report actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleRecomposeAll}><Wand2 className="h-4 w-4 mr-2" /> Recompose all</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSaveVersion}><Save className="h-4 w-4 mr-2" /> Save version</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHistoryOpen(true)}><HistoryIcon className="h-4 w-4 mr-2" /> Version history</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDuplicate}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Export markdown</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleDelete} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Client"><Input value={selected.meta.client ?? ""} onChange={(e) => patch({ meta: { ...selected.meta, client: e.target.value } })} /></Field>
                  <Field label="Engagement"><Input value={selected.meta.engagement ?? ""} onChange={(e) => patch({ meta: { ...selected.meta, engagement: e.target.value } })} /></Field>
                  <Field label="Classification"><Input value={selected.meta.classification ?? ""} onChange={(e) => patch({ meta: { ...selected.meta, classification: e.target.value } })} /></Field>
                  <Field label="Authors"><TagInput value={selected.meta.authors} onChange={(v) => patch({ meta: { ...selected.meta, authors: v } })} /></Field>
                  <Field label="Version"><Input value={selected.meta.version ?? ""} onChange={(e) => patch({ meta: { ...selected.meta, version: e.target.value } })} placeholder={`v${selected.version}`} /></Field>
                  <Field label="CVSS scheme">
                    <Select value={selected.meta.cvssScheme ?? "3.1"} onValueChange={(v) => patch({ meta: { ...selected.meta, cvssScheme: v as "3.1" | "4.0" } })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3.1">CVSS 3.1</SelectItem>
                        <SelectItem value="4.0">CVSS 4.0</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider mono text-muted-foreground mb-1">Findings scoped into this report</div>
                  <div className="flex flex-wrap gap-2">
                    {findings.length === 0 && <span className="text-xs text-muted-foreground">No findings drafted yet.</span>}
                    {findings.map((f) => {
                      const on = selected.findingIds.includes(f.id);
                      return (
                        <button key={f.id}
                                onClick={() => patch({ findingIds: on ? selected.findingIds.filter((x) => x !== f.id) : [...selected.findingIds, f.id] })}
                                className={cn("text-xs px-2 py-1 rounded border", on ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted/40")}>
                          [{f.severity.toUpperCase()}] {f.title}
                        </button>
                      );
                    })}
                    {selected.findingIds.length === 0 && findings.length > 0 && (
                      <span className="text-xs text-muted-foreground">No filter — all {findings.length} findings included.</span>
                    )}
                  </div>
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
                      <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-auto">
                        {issues.slice(0, 12).map((i, idx) => (
                          <li key={idx}>
                            {i.message}
                            {i.findingId && findingLookup.get(i.findingId) && <span className="opacity-70"> — {findingLookup.get(i.findingId)!.title}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")}>
                <TabsList>
                  <TabsTrigger value="edit">Sections</TabsTrigger>
                  <TabsTrigger value="preview"><Eye className="h-3 w-3 mr-1" /> Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider mono text-muted-foreground">Sections</h3>
                    <div className="flex items-center gap-2">
                      <Select value={addKind} onValueChange={(v) => setAddKind(v as ReportSectionKind)}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SECTION_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={handleAddSection}>
                        <Plus className="h-4 w-4 mr-1" /> Add section
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleRecomposeAll}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Recompose
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selected.sections.length === 0 && (
                      <p className="text-sm text-muted-foreground p-6 border border-dashed border-border/60 rounded-lg text-center">
                        No sections yet. Add one from the picker above or apply a template.
                      </p>
                    )}
                    {selected.sections.map((s, i) => (
                      <ReportSectionEditor
                        key={s.id}
                        section={s}
                        index={i}
                        total={selected.sections.length}
                        programId={activeProgram?.id ?? null}
                        onChange={async (p) => { await updateSection(selected.id, s.id, p); await reload(selected.id); }}
                        onMove={async (d) => { await reorderSection(selected.id, s.id, d); await reload(selected.id); }}
                        onRemove={async () => { await removeSection(selected.id, s.id); await reload(selected.id); }}
                        onAttach={async (src) => { await attachSource(selected.id, s.id, src); await reload(selected.id); }}
                        onDetach={async (sid) => { await detachSource(selected.id, s.id, sid); await reload(selected.id); }}
                        onRecompose={() => handleRecomposeSection(s.id)}
                      />
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <ReportPreviewPane doc={selected} />
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
            <DialogTitle>Report templates</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {REPORT_TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => handleCreate(t.id)}
                      className="text-left p-3 rounded border border-border/60 hover:bg-muted/40">
                <div className="text-sm font-medium">{t.label}</div>
                <p className="text-xs text-muted-foreground mt-1">{t.hint}</p>
              </button>
            ))}
          </div>
          {selected && (
            <div className="border-t border-border/60 pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Or replace the current report's sections with a template (destructive):</p>
              <div className="flex flex-wrap gap-2">
                {REPORT_TEMPLATES.map((t) => (
                  <Button key={t.id} size="sm" variant="ghost" onClick={async () => {
                    await applyTemplate(selected.id, t.id);
                    await reload(selected.id);
                    setTemplatesOpen(false);
                    toast({ title: `Applied ${t.label}` });
                  }}>{t.label}</Button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplatesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
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

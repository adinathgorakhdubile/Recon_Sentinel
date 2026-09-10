import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { createLink, deleteLink, linksFor } from "@/lib/repo/links";
import type { LinkableType } from "@/types";
import type {
  ReportDoc,
  ReportFormatId,
  ReportSection,
  ReportSectionKind,
  ReportSource,
  ReportVersion,
} from "./types";
import { buildTemplateSections, emptyReport } from "./templates";

const now = () => Date.now();

export async function listReports(programId: string | null): Promise<ReportDoc[]> {
  const rows = await db.reports.where("programId").equals(programId as string).toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getReport(id: string): Promise<ReportDoc | undefined> {
  return db.reports.get(id);
}

export async function createReport(
  programId: string | null,
  format: ReportFormatId = "detailed",
  patch: Partial<ReportDoc> = {},
): Promise<ReportDoc> {
  const doc: ReportDoc = { ...emptyReport(programId, format), ...patch };
  doc.updatedAt = now();
  await db.reports.put(doc);
  await logActivity({
    programId,
    entityType: "report",
    entityId: doc.id,
    action: "created",
    summary: `Report created: ${doc.title}`,
    meta: { format: doc.format },
  });
  return doc;
}

export async function updateReport(id: string, patch: Partial<ReportDoc>): Promise<ReportDoc | undefined> {
  const existing = await db.reports.get(id);
  if (!existing) return undefined;
  const next: ReportDoc = { ...existing, ...patch, id: existing.id, updatedAt: now() };
  await db.reports.put(next);
  await logActivity({
    programId: next.programId,
    entityType: "report",
    entityId: next.id,
    action: "updated",
    summary: `Report updated: ${next.title}`,
  });
  return next;
}

export async function deleteReport(id: string): Promise<void> {
  const doc = await db.reports.get(id);
  await db.reports.delete(id);
  if (doc) {
    await logActivity({
      programId: doc.programId,
      entityType: "report",
      entityId: id,
      action: "deleted",
      summary: `Report deleted: ${doc.title}`,
    });
  }
}

export async function duplicateReport(id: string): Promise<ReportDoc | undefined> {
  const src = await db.reports.get(id);
  if (!src) return undefined;
  const copy: ReportDoc = {
    ...src,
    id: uid("rep"),
    title: `${src.title} (copy)`,
    history: [],
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.reports.put(copy);
  return copy;
}

export async function applyTemplate(id: string, format: ReportFormatId): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const sections = buildTemplateSections(format);
  return updateReport(id, { format, sections });
}

// ---------- Versioning ----------

export async function saveVersion(id: string, note?: string): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const { history: _h, ...rest } = doc;
  const version: ReportVersion = {
    version: (doc.history?.length ?? 0) + 1,
    createdAt: now(),
    note,
    snapshot: rest,
  };
  const next: ReportDoc = {
    ...doc,
    history: [...(doc.history ?? []), version],
    version: (doc.version ?? 1) + 1,
    updatedAt: now(),
  };
  await db.reports.put(next);
  return next;
}

export async function restoreVersion(id: string, version: number): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const entry = (doc.history ?? []).find((v) => v.version === version);
  if (!entry) return doc;
  const snap = entry.snapshot;
  const next: ReportDoc = { ...doc, ...snap, id: doc.id, history: doc.history, updatedAt: now() };
  await db.reports.put(next);
  return next;
}

// ---------- Sections ----------

export function makeSection(kind: ReportSectionKind, order = 1, title?: string): ReportSection {
  return {
    id: uid("rs"),
    order,
    kind,
    title: title ?? kind.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    body: "",
    sources: [],
    auto: true,
    included: true,
  };
}

export async function addSection(id: string, kind: ReportSectionKind): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const s = makeSection(kind, doc.sections.length + 1);
  return updateReport(id, { sections: [...doc.sections, s] });
}

export async function updateSection(id: string, sectionId: string, patch: Partial<ReportSection>): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const sections = doc.sections.map((s) =>
    s.id === sectionId ? { ...s, ...patch, id: s.id } : s,
  );
  return updateReport(id, { sections });
}

export async function removeSection(id: string, sectionId: string): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const sections = doc.sections
    .filter((s) => s.id !== sectionId)
    .map((s, i) => ({ ...s, order: i + 1 }));
  return updateReport(id, { sections });
}

export async function reorderSection(id: string, sectionId: string, delta: number): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const idx = doc.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return doc;
  const j = idx + delta;
  if (j < 0 || j >= doc.sections.length) return doc;
  const next = [...doc.sections];
  [next[idx], next[j]] = [next[j], next[idx]];
  return updateReport(id, { sections: next.map((s, i) => ({ ...s, order: i + 1 })) });
}

export async function moveSection(id: string, sectionId: string, toIndex: number): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const idx = doc.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return doc;
  const clamped = Math.max(0, Math.min(doc.sections.length - 1, toIndex));
  const next = [...doc.sections];
  const [row] = next.splice(idx, 1);
  next.splice(clamped, 0, row);
  return updateReport(id, { sections: next.map((s, i) => ({ ...s, order: i + 1 })) });
}

// ---------- Sources ----------

export async function attachSource(
  id: string,
  sectionId: string,
  src: Omit<ReportSource, "id">,
): Promise<ReportDoc | undefined> {
  const source: ReportSource = { id: uid("rsrc"), ...src };
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  const sections = doc.sections.map((s) =>
    s.id === sectionId ? { ...s, sources: [...s.sources, source] } : s,
  );
  const next = await updateReport(id, { sections });
  await createLink({
    programId: doc.programId,
    fromType: "report" as LinkableType,
    fromId: id,
    toType: src.refType as LinkableType,
    toId: src.refId,
    kind: "supports",
  });
  return next;
}

export async function detachSource(
  id: string,
  sectionId: string,
  sourceId: string,
): Promise<ReportDoc | undefined> {
  const doc = await db.reports.get(id);
  if (!doc) return undefined;
  let removed: ReportSource | undefined;
  const sections = doc.sections.map((s) => {
    if (s.id !== sectionId) return s;
    const keep: ReportSource[] = [];
    for (const src of s.sources) {
      if (src.id === sourceId) removed = src;
      else keep.push(src);
    }
    return { ...s, sources: keep };
  });
  const next = await updateReport(id, { sections });
  if (removed) {
    // Remove the mirrored EntityLink if no other section still references it.
    const stillUsed = sections.some((s) =>
      s.sources.some((v) => v.refType === removed!.refType && v.refId === removed!.refId),
    );
    if (!stillUsed) {
      const links = await linksFor("report" as LinkableType, id);
      const match = links.find((l) => l.toType === removed!.refType && l.toId === removed!.refId);
      if (match) await deleteLink(match.id);
    }
  }
  return next;
}

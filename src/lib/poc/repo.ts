import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { createLink, deleteLink, linksFor } from "@/lib/repo/links";
import type { LinkKind, LinkableType } from "@/types";
import type {
  PocAttachmentRef,
  PocComment,
  PocDoc,
  PocStep,
  PocVersion,
} from "./types";
import { BUILTIN_POC_TEMPLATES } from "./templates";

function now(): number {
  return Date.now();
}

function emptyPoc(programId: string | null): PocDoc {
  const ts = now();
  return {
    id: uid("poc"),
    programId,
    title: "Untitled PoC",
    summary: "",
    severity: "medium",
    status: "draft",
    impact: "",
    remediation: "",
    prerequisites: "",
    references: [],
    tags: [],
    assetIds: [],
    steps: [],
    comments: [],
    history: [],
    version: 1,
    isTemplate: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function listPocs(programId: string | null): Promise<PocDoc[]> {
  const rows = await db.pocs
    .where("programId")
    .equals(programId as string)
    .toArray();
  return rows
    .filter((r) => !r.isTemplate)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listTemplates(programId: string | null): Promise<PocDoc[]> {
  const rows = await db.pocs
    .where("programId")
    .equals(programId as string)
    .toArray();
  return rows.filter((r) => r.isTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPoc(id: string): Promise<PocDoc | undefined> {
  return db.pocs.get(id);
}

export async function createPoc(
  programId: string | null,
  patch: Partial<PocDoc> = {},
): Promise<PocDoc> {
  const doc: PocDoc = { ...emptyPoc(programId), ...patch };
  doc.updatedAt = now();
  await db.pocs.put(doc);
  await logActivity({
    programId,
    entityType: "poc",
    entityId: doc.id,
    action: "created",
    summary: `PoC created: ${doc.title}`,
  });
  return doc;
}

export async function updatePoc(id: string, patch: Partial<PocDoc>): Promise<PocDoc | undefined> {
  const existing = await db.pocs.get(id);
  if (!existing) return undefined;
  const next: PocDoc = { ...existing, ...patch, id: existing.id, updatedAt: now() };
  await db.pocs.put(next);
  await logActivity({
    programId: next.programId,
    entityType: "poc",
    entityId: next.id,
    action: "updated",
    summary: `PoC updated: ${next.title}`,
  });
  return next;
}

export async function deletePoc(id: string): Promise<void> {
  const doc = await db.pocs.get(id);
  await db.pocs.delete(id);
  if (doc) {
    await logActivity({
      programId: doc.programId,
      entityType: "poc",
      entityId: id,
      action: "deleted",
      summary: `PoC deleted: ${doc.title}`,
    });
  }
}

/** Save the current state as a new version snapshot. */
export async function saveVersion(id: string, note?: string): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const { history: _h, comments: _c, ...rest } = doc;
  const version: PocVersion = {
    version: (doc.history?.length ?? 0) + 1,
    createdAt: now(),
    note,
    snapshot: rest,
  };
  const next: PocDoc = {
    ...doc,
    history: [...(doc.history ?? []), version],
    version: (doc.version ?? 1) + 1,
    updatedAt: now(),
  };
  await db.pocs.put(next);
  return next;
}

export async function restoreVersion(id: string, version: number): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const entry = (doc.history ?? []).find((v) => v.version === version);
  if (!entry) return doc;
  const snap = entry.snapshot;
  const restored: PocDoc = {
    ...doc,
    ...snap,
    id: doc.id,
    history: doc.history,
    comments: doc.comments,
    updatedAt: now(),
  };
  await db.pocs.put(restored);
  await logActivity({
    programId: doc.programId,
    entityType: "poc",
    entityId: id,
    action: "updated",
    summary: `PoC restored to version ${version}`,
  });
  return restored;
}

export async function duplicatePoc(id: string): Promise<PocDoc | undefined> {
  const src = await db.pocs.get(id);
  if (!src) return undefined;
  const copy: PocDoc = {
    ...src,
    id: uid("poc"),
    title: `${src.title} (copy)`,
    version: 1,
    history: [],
    comments: [],
    isTemplate: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.pocs.put(copy);
  await logActivity({
    programId: copy.programId,
    entityType: "poc",
    entityId: copy.id,
    action: "created",
    summary: `PoC duplicated from ${src.title}`,
  });
  return copy;
}

export async function saveAsTemplate(id: string, name?: string): Promise<PocDoc | undefined> {
  const src = await db.pocs.get(id);
  if (!src) return undefined;
  const tpl: PocDoc = {
    ...src,
    id: uid("poc-tpl"),
    title: name ?? `${src.title} (template)`,
    isTemplate: true,
    templateSourceId: src.id,
    findingId: undefined,
    assetIds: [],
    history: [],
    comments: [],
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.pocs.put(tpl);
  await logActivity({
    programId: tpl.programId,
    entityType: "poc",
    entityId: tpl.id,
    action: "created",
    summary: `PoC template saved: ${tpl.title}`,
  });
  return tpl;
}

/** Instantiate a saved template or a built-in template into a new PoC. */
export async function applyTemplate(
  programId: string | null,
  templateId: string,
): Promise<PocDoc> {
  const stored = await db.pocs.get(templateId);
  if (stored) {
    const copy: PocDoc = {
      ...stored,
      id: uid("poc"),
      isTemplate: false,
      templateSourceId: stored.id,
      programId,
      history: [],
      comments: [],
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.pocs.put(copy);
    return copy;
  }
  const builtin = BUILTIN_POC_TEMPLATES.find((t) => t.id === templateId);
  if (!builtin) return createPoc(programId);
  const body = builtin.build();
  return createPoc(programId, { ...body, templateSourceId: builtin.id });
}

// ---------- Steps ----------

export function makeStep(kind: PocStep["kind"] = "instruction", order = 1): PocStep {
  return {
    id: uid("pstep"),
    order,
    title: "",
    kind,
    body: "",
    attachments: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

export async function addStep(id: string, kind: PocStep["kind"] = "instruction"): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const step = makeStep(kind, doc.steps.length + 1);
  return updatePoc(id, { steps: [...doc.steps, step] });
}

export async function updateStep(id: string, stepId: string, patch: Partial<PocStep>): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const steps = doc.steps.map((s) => (s.id === stepId ? { ...s, ...patch, id: s.id, updatedAt: now() } : s));
  return updatePoc(id, { steps });
}

export async function removeStep(id: string, stepId: string): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const steps = doc.steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i + 1 }));
  return updatePoc(id, { steps });
}

export async function reorderStep(id: string, stepId: string, delta: number): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const idx = doc.steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return doc;
  const j = idx + delta;
  if (j < 0 || j >= doc.steps.length) return doc;
  const next = [...doc.steps];
  [next[idx], next[j]] = [next[j], next[idx]];
  return updatePoc(id, { steps: next.map((s, i) => ({ ...s, order: i + 1 })) });
}

export async function moveStep(id: string, stepId: string, toIndex: number): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const idx = doc.steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return doc;
  const clamped = Math.max(0, Math.min(doc.steps.length - 1, toIndex));
  const next = [...doc.steps];
  const [row] = next.splice(idx, 1);
  next.splice(clamped, 0, row);
  return updatePoc(id, { steps: next.map((s, i) => ({ ...s, order: i + 1 })) });
}

// ---------- Attachments ----------

export async function attachToStep(
  id: string,
  stepId: string,
  ref: Omit<PocAttachmentRef, "id" | "createdAt">,
): Promise<PocDoc | undefined> {
  const attachment: PocAttachmentRef = { id: uid("patt"), createdAt: now(), ...ref };
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const steps = doc.steps.map((s) =>
    s.id === stepId ? { ...s, attachments: [...s.attachments, attachment], updatedAt: now() } : s,
  );
  const next = await updatePoc(id, { steps });
  // Mirror as an EntityLink so the RelatedPanel / search discovery pick it up.
  await createLink({
    programId: doc.programId,
    fromType: "poc" as LinkableType,
    fromId: id,
    toType: ref.refType as LinkableType,
    toId: ref.refId,
    kind: "supports",
  });
  return next;
}

export async function detachFromStep(
  id: string,
  stepId: string,
  attachmentId: string,
): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  let removed: PocAttachmentRef | undefined;
  const steps = doc.steps.map((s) => {
    if (s.id !== stepId) return s;
    const keep: PocAttachmentRef[] = [];
    for (const a of s.attachments) {
      if (a.id === attachmentId) removed = a;
      else keep.push(a);
    }
    return { ...s, attachments: keep, updatedAt: now() };
  });
  const next = await updatePoc(id, { steps });
  if (removed) {
    const links = await linksFor("poc" as LinkableType, id);
    const match = links.find(
      (l) => l.toType === removed!.refType && l.toId === removed!.refId,
    );
    if (match) await deleteLink(match.id);
  }
  return next;
}

// ---------- Comments ----------

export async function addComment(id: string, body: string, stepId?: string, author?: string): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  const c: PocComment = { id: uid("pcm"), body, stepId, author, createdAt: now() };
  return updatePoc(id, { comments: [...doc.comments, c] });
}

export async function removeComment(id: string, commentId: string): Promise<PocDoc | undefined> {
  const doc = await db.pocs.get(id);
  if (!doc) return undefined;
  return updatePoc(id, { comments: doc.comments.filter((c) => c.id !== commentId) });
}

// ---------- Linking helpers ----------

export async function linkPoc(id: string, target: { type: LinkableType; id: string; kind?: LinkKind }): Promise<void> {
  const doc = await db.pocs.get(id);
  if (!doc) return;
  await createLink({
    programId: doc.programId,
    fromType: "poc" as LinkableType,
    fromId: id,
    toType: target.type,
    toId: target.id,
    kind: target.kind ?? "relates-to",
  });
}

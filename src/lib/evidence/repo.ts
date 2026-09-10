import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { createLink, deleteLink, linksFor } from "@/lib/repo/links";
import type { EntityLink, LinkKind, LinkableType } from "@/types";
import { sha256OfBlob } from "./hash";
import { detectKind } from "./detect";
import type {
  EvidenceAnnotation,
  EvidenceBlob,
  EvidenceItem,
  EvidenceKind,
  EvidenceVersion,
} from "./types";

export interface UploadEvidenceInput {
  programId: string | null;
  file: File | Blob;
  filename?: string;
  title?: string;
  description?: string;
  kind?: EvidenceKind;
  folder?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  /** Optional immediate link back to another workspace entity. */
  linkTo?: { type: LinkableType; id: string; kind?: LinkKind };
}

export async function uploadEvidence(input: UploadEvidenceInput): Promise<EvidenceItem> {
  const blob = input.file;
  const asFile = blob instanceof File ? blob : null;
  const filename = input.filename ?? asFile?.name ?? "evidence.bin";
  const mime = (asFile?.type || (blob as Blob).type || "application/octet-stream").toLowerCase();
  const sha = await sha256OfBlob(blob);

  const id = uid("ev");
  const blobId = uid("evb");
  const blobRow: EvidenceBlob = { id: blobId, evidenceId: id, data: blob as Blob, createdAt: Date.now() };
  const kind = input.kind ?? (asFile ? detectKind(asFile) : "other");

  const item: EvidenceItem = {
    id,
    programId: input.programId,
    blobId,
    sha256: sha,
    title: input.title ?? filename,
    description: input.description,
    kind,
    mime,
    sizeBytes: (blob as Blob).size,
    filename,
    folder: (input.folder ?? "").replace(/^\/+|\/+$/g, ""),
    tags: input.tags ?? [],
    meta: input.meta ?? {},
    version: 1,
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.transaction("rw", db.evidence, db.evidenceBlobs, async () => {
    await db.evidenceBlobs.put(blobRow);
    await db.evidence.put(item);
  });

  await logActivity({
    programId: input.programId,
    entityType: "evidence",
    entityId: id,
    action: "imported",
    summary: `Evidence uploaded · ${item.title}`,
    meta: { kind, sha256: sha, sizeBytes: item.sizeBytes },
  });

  if (input.linkTo) {
    await createLink({
      programId: input.programId,
      fromType: "evidence",
      fromId: id,
      toType: input.linkTo.type,
      toId: input.linkTo.id,
      kind: input.linkTo.kind ?? "supports",
    });
  }

  return item;
}

export async function getEvidence(id: string): Promise<EvidenceItem | undefined> {
  return db.evidence.get(id);
}

export async function listEvidence(programId: string | null): Promise<EvidenceItem[]> {
  const rows = programId
    ? await db.evidence.where("programId").equals(programId).toArray()
    : await db.evidence.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBlob(blobId: string): Promise<Blob | undefined> {
  const row = await db.evidenceBlobs.get(blobId);
  return row?.data;
}

/** Returns an object URL for the current blob; caller must revoke. */
export async function objectUrlFor(item: EvidenceItem): Promise<string | null> {
  const blob = await getBlob(item.blobId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function updateEvidence(
  id: string,
  patch: Partial<Pick<EvidenceItem, "title" | "description" | "kind" | "folder" | "tags" | "meta">>,
): Promise<void> {
  const cur = await db.evidence.get(id);
  if (!cur) return;
  const next: EvidenceItem = { ...cur, ...patch, updatedAt: Date.now() };
  await db.evidence.put(next);
  await logActivity({
    programId: next.programId,
    entityType: "evidence",
    entityId: id,
    action: "updated",
    summary: `Evidence updated · ${next.title}`,
  });
}

export async function deleteEvidence(id: string): Promise<void> {
  const item = await db.evidence.get(id);
  if (!item) return;
  const blobIds = [item.blobId, ...item.history.map((h) => h.blobId)];
  await db.transaction(
    "rw",
    db.evidence,
    db.evidenceBlobs,
    db.evidenceAnnotations,
    db.links,
    async () => {
      await db.evidenceBlobs.bulkDelete(blobIds);
      await db.evidenceAnnotations.where("evidenceId").equals(id).delete();
      await db.evidence.delete(id);
      // Cascade cross-entity links
      await db.links.where("[fromType+fromId]").equals(["evidence", id]).delete();
      await db.links.where("[toType+toId]").equals(["evidence", id]).delete();
    },
  );
  await logActivity({
    programId: item.programId,
    entityType: "evidence",
    entityId: id,
    action: "deleted",
    summary: `Evidence removed · ${item.title}`,
  });
}

/** Uploads a new binary as v+1 of an existing item, keeping metadata. */
export async function addEvidenceVersion(id: string, file: File | Blob, note?: string): Promise<EvidenceItem | undefined> {
  const cur = await db.evidence.get(id);
  if (!cur) return undefined;
  const sha = await sha256OfBlob(file);
  const blobId = uid("evb");
  const mime = ((file as File).type || cur.mime).toLowerCase();
  const size = (file as Blob).size;

  const prevVersion: EvidenceVersion = {
    blobId: cur.blobId,
    sha256: cur.sha256,
    sizeBytes: cur.sizeBytes,
    mime: cur.mime,
    version: cur.version,
    createdAt: cur.updatedAt,
  };

  const next: EvidenceItem = {
    ...cur,
    blobId,
    sha256: sha,
    mime,
    sizeBytes: size,
    version: cur.version + 1,
    history: [...cur.history, prevVersion],
    updatedAt: Date.now(),
  };

  await db.transaction("rw", db.evidence, db.evidenceBlobs, async () => {
    await db.evidenceBlobs.put({ id: blobId, evidenceId: id, data: file as Blob, createdAt: Date.now() });
    await db.evidence.put(next);
  });

  await logActivity({
    programId: cur.programId,
    entityType: "evidence",
    entityId: id,
    action: "updated",
    summary: `Evidence v${next.version} uploaded${note ? ` · ${note}` : ""}`,
    meta: { sha256: sha, sizeBytes: size },
  });
  return next;
}

/** Recomputes SHA-256 of the current blob and compares to stored hash. */
export async function verifyIntegrity(id: string): Promise<{ ok: boolean; expected: string; actual: string | null }> {
  const cur = await db.evidence.get(id);
  if (!cur) return { ok: false, expected: "", actual: null };
  const blob = await getBlob(cur.blobId);
  if (!blob) return { ok: false, expected: cur.sha256, actual: null };
  const actual = await sha256OfBlob(blob);
  return { ok: actual === cur.sha256, expected: cur.sha256, actual };
}

// ------------------- Annotations / comments -------------------

export async function addAnnotation(input: Omit<EvidenceAnnotation, "id" | "createdAt">): Promise<EvidenceAnnotation> {
  const row: EvidenceAnnotation = { ...input, id: uid("evn"), createdAt: Date.now() };
  await db.evidenceAnnotations.put(row);
  return row;
}

export async function listAnnotations(evidenceId: string): Promise<EvidenceAnnotation[]> {
  const rows = await db.evidenceAnnotations.where("evidenceId").equals(evidenceId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAnnotation(id: string): Promise<void> {
  await db.evidenceAnnotations.delete(id);
}

// ------------------- Linking helpers -------------------

export function linkEvidence(
  programId: string | null,
  evidenceId: string,
  target: { type: LinkableType; id: string },
  kind: LinkKind = "supports",
): Promise<EntityLink> {
  return createLink({
    programId,
    fromType: "evidence",
    fromId: evidenceId,
    toType: target.type,
    toId: target.id,
    kind,
  });
}

export function unlinkEvidence(linkId: string): Promise<void> {
  return deleteLink(linkId);
}

export function linksForEvidence(id: string): Promise<EntityLink[]> {
  return linksFor("evidence", id);
}

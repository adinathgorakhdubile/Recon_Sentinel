import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { createLink, deleteLink, linksFor } from "@/lib/repo/links";
import type { EntityLink, LinkKind, LinkableType } from "@/types";
import { fingerprintRequest } from "./fingerprint";
import { endpointOf, parseHttp } from "./parsers";
import type { HttpCollection, HttpItem, HttpParseResult, HttpSource } from "./types";

export interface CreateHttpInput {
  programId: string | null;
  source?: HttpSource;
  title?: string;
  notes?: string;
  tags?: string[];
  collectionId?: string | null;
  request: HttpItem["request"];
  response?: HttpItem["response"];
  timing?: HttpItem["timing"];
  capturedAt?: string;
  origin?: string;
  linkTo?: { type: LinkableType; id: string; kind?: LinkKind };
}

export async function createHttpItem(input: CreateHttpInput): Promise<HttpItem> {
  const fingerprint = fingerprintRequest(input.request);
  const now = Date.now();
  const item: HttpItem = {
    id: uid("htp"),
    programId: input.programId,
    source: input.source ?? "manual",
    collectionId: input.collectionId ?? null,
    title: input.title ?? `${input.request.method} ${input.request.path ?? input.request.url}`,
    notes: input.notes,
    tags: input.tags ?? [],
    fingerprint,
    request: input.request,
    response: input.response,
    timing: input.timing,
    capturedAt: input.capturedAt,
    origin: input.origin,
    createdAt: now,
    updatedAt: now,
  };
  await db.http.put(item);
  await logActivity({
    programId: input.programId,
    entityType: "http",
    entityId: item.id,
    action: "created",
    summary: `HTTP · ${item.title}`,
    meta: { source: item.source, fingerprint },
  });
  if (input.linkTo) {
    await createLink({
      programId: input.programId,
      fromType: "http",
      fromId: item.id,
      toType: input.linkTo.type,
      toId: input.linkTo.id,
      kind: input.linkTo.kind ?? "supports",
    });
  }
  return item;
}

export async function listHttpItems(programId: string | null): Promise<HttpItem[]> {
  const rows = programId
    ? await db.http.where("programId").equals(programId).toArray()
    : await db.http.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getHttpItem(id: string): Promise<HttpItem | undefined> {
  return db.http.get(id);
}

export async function updateHttpItem(
  id: string,
  patch: Partial<Pick<HttpItem, "title" | "notes" | "tags" | "collectionId" | "favorite" | "response" | "timing">>,
): Promise<void> {
  const cur = await db.http.get(id);
  if (!cur) return;
  const next: HttpItem = { ...cur, ...patch, updatedAt: Date.now() };
  await db.http.put(next);
  await logActivity({
    programId: next.programId,
    entityType: "http",
    entityId: id,
    action: "updated",
    summary: `HTTP updated · ${next.title}`,
  });
}

export async function deleteHttpItem(id: string): Promise<void> {
  const item = await db.http.get(id);
  if (!item) return;
  await db.transaction("rw", db.http, db.links, async () => {
    await db.http.delete(id);
    await db.links.where("[fromType+fromId]").equals(["http", id]).delete();
    await db.links.where("[toType+toId]").equals(["http", id]).delete();
  });
  await logActivity({
    programId: item.programId,
    entityType: "http",
    entityId: id,
    action: "deleted",
    summary: `HTTP removed · ${item.title}`,
  });
}

export interface ImportOptions {
  programId: string | null;
  collectionId?: string | null;
  tags?: string[];
  skipDuplicates?: boolean;
  forceParser?: string;
}

export interface ImportResult {
  parsed: HttpParseResult;
  created: HttpItem[];
  duplicates: number;
}

/**
 * Parse a text payload with the plugin registry then persist normalized
 * items. Duplicates are detected by fingerprint within the same program.
 */
export async function importHttpText(
  text: string,
  filename: string | undefined,
  opts: ImportOptions,
): Promise<ImportResult> {
  const parsed = parseHttp(text, filename, opts.forceParser);
  const existing = await listHttpItems(opts.programId);
  const existingByFp = new Map(existing.map((e) => [e.fingerprint, e]));
  const created: HttpItem[] = [];
  let duplicates = 0;
  for (const raw of parsed.items) {
    const fp = fingerprintRequest(raw.request);
    if (opts.skipDuplicates !== false && existingByFp.has(fp)) {
      duplicates++;
      continue;
    }
    const item = await createHttpItem({
      programId: opts.programId,
      source: raw.source,
      title: raw.title,
      request: raw.request,
      response: raw.response,
      timing: raw.timing,
      capturedAt: raw.capturedAt,
      collectionId: opts.collectionId ?? null,
      tags: opts.tags,
      origin: raw.origin ?? filename,
    });
    existingByFp.set(fp, item);
    created.push(item);
  }
  await logActivity({
    programId: opts.programId,
    entityType: "http",
    entityId: filename ?? "batch",
    action: "imported",
    summary: `HTTP import · ${created.length} added · ${duplicates} duplicates`,
    meta: { format: parsed.format, errors: parsed.errors.length },
  });
  return { parsed, created, duplicates };
}

// -------- Collections --------

export async function listHttpCollections(programId: string | null): Promise<HttpCollection[]> {
  const rows = programId
    ? await db.httpCollections.where("programId").equals(programId).toArray()
    : await db.httpCollections.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createHttpCollection(input: Omit<HttpCollection, "id" | "createdAt" | "updatedAt">): Promise<HttpCollection> {
  const now = Date.now();
  const row: HttpCollection = { ...input, id: uid("hcl"), createdAt: now, updatedAt: now };
  await db.httpCollections.put(row);
  return row;
}

export async function deleteHttpCollection(id: string): Promise<void> {
  await db.transaction("rw", db.httpCollections, db.http, async () => {
    await db.httpCollections.delete(id);
    const items = await db.http.where("collectionId").equals(id).toArray();
    for (const i of items) await db.http.put({ ...i, collectionId: null, updatedAt: Date.now() });
  });
}

// -------- Links --------

export function linkHttp(
  programId: string | null,
  httpId: string,
  target: { type: LinkableType; id: string },
  kind: LinkKind = "supports",
): Promise<EntityLink> {
  return createLink({ programId, fromType: "http", fromId: httpId, toType: target.type, toId: target.id, kind });
}

export function unlinkHttp(linkId: string): Promise<void> {
  return deleteLink(linkId);
}

export function linksForHttp(id: string): Promise<EntityLink[]> {
  return linksFor("http", id);
}

// -------- Endpoint extraction --------

export function distinctEndpoints(items: HttpItem[]): string[] {
  const s = new Set<string>();
  for (const i of items) s.add(endpointOf(i));
  return Array.from(s).sort();
}

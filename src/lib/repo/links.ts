import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import type { EntityLink, LinkKind, LinkableType } from "@/types";

export interface CreateLinkInput {
  programId: string | null;
  fromType: LinkableType;
  fromId: string;
  toType: LinkableType;
  toId: string;
  kind?: LinkKind;
  note?: string;
}

export async function createLink(input: CreateLinkInput): Promise<EntityLink> {
  const link: EntityLink = {
    id: uid("lnk"),
    programId: input.programId,
    fromType: input.fromType,
    fromId: input.fromId,
    toType: input.toType,
    toId: input.toId,
    kind: input.kind ?? "relates-to",
    note: input.note,
    createdAt: Date.now(),
  };
  await db.links.put(link);
  await logActivity({
    programId: input.programId,
    entityType: "link",
    entityId: link.id,
    action: "linked",
    summary: `${input.fromType} → ${input.toType} (${link.kind})`,
    meta: { fromType: input.fromType, fromId: input.fromId, toType: input.toType, toId: input.toId },
  });
  return link;
}

export async function deleteLink(id: string): Promise<void> {
  const l = await db.links.get(id);
  await db.links.delete(id);
  if (l) {
    await logActivity({
      programId: l.programId,
      entityType: "link",
      entityId: l.id,
      action: "unlinked",
      summary: `${l.fromType} ↮ ${l.toType}`,
    });
  }
}

export async function linksFor(entityType: LinkableType, entityId: string): Promise<EntityLink[]> {
  const [from, to] = await Promise.all([
    db.links.where("[fromType+fromId]").equals([entityType, entityId]).toArray(),
    db.links.where("[toType+toId]").equals([entityType, entityId]).toArray(),
  ]);
  return [...from, ...to];
}

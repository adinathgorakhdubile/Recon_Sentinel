/**
 * Attack Path persistence — Dexie CRUD + activity logging.
 */

import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import type {
  AttackAnnotation,
  AttackAttachment,
  AttackObjective,
  AttackPath,
  AttackStep,
  TrustBoundary,
} from "./types";

export async function listPaths(programId: string | null): Promise<AttackPath[]> {
  const all = await db.attackPaths.toArray();
  return all
    .filter((p) => !programId || !p.programId || p.programId === programId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPath(id: string): Promise<AttackPath | undefined> {
  return db.attackPaths.get(id);
}

export async function createPath(input: Partial<AttackPath> & { name: string; programId: string | null }): Promise<AttackPath> {
  const now = Date.now();
  const p: AttackPath = {
    id: uid("ap"),
    programId: input.programId,
    name: input.name.trim() || "Untitled attack path",
    summary: input.summary,
    status: input.status ?? "draft",
    severity: input.severity,
    steps: input.steps ?? [],
    objectives: input.objectives ?? [],
    boundaries: input.boundaries ?? [],
    annotations: input.annotations ?? [],
    tags: input.tags ?? [],
    seedNodeId: input.seedNodeId,
    auto: input.auto ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await db.attackPaths.put(p);
  await logActivity({
    programId: p.programId,
    entityType: "link",
    entityId: p.id,
    action: "created",
    summary: `Attack path: ${p.name} (${p.steps.length} steps)`,
  });
  return p;
}

export async function savePath(path: AttackPath): Promise<AttackPath> {
  const next = { ...path, updatedAt: Date.now() };
  await db.attackPaths.put(next);
  return next;
}

export async function deletePath(id: string): Promise<void> {
  const p = await db.attackPaths.get(id);
  await db.attackPaths.delete(id);
  if (p) {
    await logActivity({
      programId: p.programId,
      entityType: "link",
      entityId: p.id,
      action: "deleted",
      summary: `Attack path removed: ${p.name}`,
    });
  }
}

// ── step / objective / boundary helpers ────────────────────────────────────

export function makeStep(input: Partial<AttackStep>): AttackStep {
  return {
    id: uid("as"),
    order: input.order ?? 0,
    kind: input.kind ?? "recon",
    title: input.title ?? "New step",
    body: input.body ?? "",
    nodeId: input.nodeId,
    trustBefore: input.trustBefore,
    trustAfter: input.trustAfter,
    prerequisites: input.prerequisites ?? [],
    expected: input.expected,
    tags: input.tags ?? [],
    confidence: input.confidence,
    stage: input.stage,
    attachments: input.attachments ?? [],
    createdAt: Date.now(),
  };
}

export function makeObjective(title: string): AttackObjective {
  return { id: uid("ao"), title, achieved: false };
}

export function makeBoundary(label: string): TrustBoundary {
  return { id: uid("ab"), label, stepIds: [] };
}

export function makeAnnotation(body: string, stepId?: string): AttackAnnotation {
  return { id: uid("an"), body, stepId, createdAt: Date.now() };
}

export function makeAttachment(refType: AttackAttachment["refType"], refId: string, caption?: string): AttackAttachment {
  return { id: uid("at"), refType, refId, caption };
}

/** Reorder steps by their `order` fields, normalizing to 0..n-1. */
export function normalizeSteps(steps: AttackStep[]): AttackStep[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }));
}

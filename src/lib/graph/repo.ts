/**
 * Persistence for saved graph views and immutable graph snapshots.
 */

import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import type { GraphFilters, GraphSnapshot, SavedGraphView, StoredGraphSnapshot } from "./types";

export async function listViews(programId: string | null): Promise<SavedGraphView[]> {
  const all = await db.graphViews.toArray();
  return all.filter((v) => !programId || !v.programId || v.programId === programId).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveView(input: {
  id?: string;
  programId: string | null;
  name: string;
  description?: string;
  filters: GraphFilters;
  camera?: SavedGraphView["camera"];
}): Promise<SavedGraphView> {
  const now = Date.now();
  const existing = input.id ? await db.graphViews.get(input.id) : undefined;
  const view: SavedGraphView = {
    id: existing?.id ?? uid("gv"),
    programId: input.programId,
    name: input.name.trim() || "Untitled view",
    description: input.description,
    filters: input.filters,
    camera: input.camera,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.graphViews.put(view);
  return view;
}

export async function deleteView(id: string): Promise<void> {
  await db.graphViews.delete(id);
}

export async function listSnapshots(programId: string | null): Promise<StoredGraphSnapshot[]> {
  const all = await db.graphSnapshots.toArray();
  return all.filter((s) => !programId || !s.programId || s.programId === programId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSnapshot(input: {
  programId: string | null;
  name: string;
  note?: string;
  snapshot: GraphSnapshot;
}): Promise<StoredGraphSnapshot> {
  const rec: StoredGraphSnapshot = {
    id: uid("gs"),
    programId: input.programId,
    name: input.name.trim() || `Snapshot ${new Date().toLocaleString()}`,
    note: input.note,
    snapshot: input.snapshot,
    createdAt: Date.now(),
  };
  await db.graphSnapshots.put(rec);
  await logActivity({
    programId: input.programId,
    entityType: "link",
    entityId: rec.id,
    action: "created",
    summary: `Graph snapshot: ${rec.name} (${input.snapshot.nodes.length} nodes)`,
  });
  return rec;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await db.graphSnapshots.delete(id);
}

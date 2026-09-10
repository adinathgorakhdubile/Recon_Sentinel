/**
 * Repository helpers for `AssetIntel` — write-through enrichment + backfill.
 */

import { db } from "@/lib/db";
import type { Asset } from "@/types";
import { enrichAsset, type AssetIntel } from "./intel";

export async function upsertIntel(asset: Asset, runId?: string): Promise<AssetIntel> {
  const previous = await db.assetIntel.get(asset.id);
  const next = enrichAsset(asset, { runId, previous: previous ?? null });
  await db.assetIntel.put(next);
  return next;
}

export async function upsertIntelBatch(assets: Asset[], runId?: string): Promise<AssetIntel[]> {
  if (assets.length === 0) return [];
  const prev = await db.assetIntel.bulkGet(assets.map((a) => a.id));
  const out: AssetIntel[] = assets.map((a, i) => enrichAsset(a, { runId, previous: prev[i] ?? null }));
  await db.assetIntel.bulkPut(out);
  return out;
}

export async function deleteIntel(assetId: string): Promise<void> {
  await db.assetIntel.delete(assetId);
}

export async function backfillProgram(programId: string): Promise<number> {
  const assets = await db.assets.where("programId").equals(programId).toArray();
  const missing: Asset[] = [];
  for (const a of assets) {
    const has = await db.assetIntel.get(a.id);
    if (!has) missing.push(a);
  }
  if (missing.length) await upsertIntelBatch(missing);
  return missing.length;
}

export async function backfillAll(): Promise<number> {
  const assets = await db.assets.toArray();
  if (!assets.length) return 0;
  const existing = new Set((await db.assetIntel.toArray()).map((i) => i.assetId));
  const missing = assets.filter((a) => !existing.has(a.id));
  if (missing.length) await upsertIntelBatch(missing);
  return missing.length;
}

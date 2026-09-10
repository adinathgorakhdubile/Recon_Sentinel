/**
 * Automatic relationship discovery between assets.
 *
 * Runs after the recon pipeline persists new assets. Uses intel fingerprints
 * (host + port + kind) to discover:
 *   - subdomain → parent domain / subdomain (`derived-from`)
 *   - endpoint / url → host asset (`hosts`)
 *   - port / endpoint (ip:port) → ip asset (`hosts`)
 *   - shared-technology sibling links (`relates-to`)
 *
 * Correlation writes directly to the `links` table (bypassing per-link
 * activity noise) and emits one summary activity event per run.
 */

import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import type { EntityLink } from "@/types";
import type { AssetIntel } from "./intel";

interface CorrelationResult {
  createdLinks: number;
  matchedTech: number;
}

export async function correlateAssets(
  programId: string,
  newIntel: AssetIntel[],
): Promise<CorrelationResult> {
  if (newIntel.length === 0) return { createdLinks: 0, matchedTech: 0 };

  const allIntel = await db.assetIntel.where("programId").equals(programId).toArray();
  const byHost = new Map<string, AssetIntel[]>();
  const byId = new Map<string, AssetIntel>();
  for (const i of allIntel) {
    byId.set(i.assetId, i);
    const list = byHost.get(i.host) ?? [];
    list.push(i);
    byHost.set(i.host, list);
  }

  const now = Date.now();
  const links: EntityLink[] = [];
  const pushed = new Set<string>();
  const push = (fromId: string, toId: string, kind: EntityLink["kind"]) => {
    if (fromId === toId) return;
    const sig = `${fromId}→${toId}:${kind}`;
    if (pushed.has(sig)) return;
    pushed.add(sig);
    links.push({
      id: uid("lnk"),
      programId,
      fromType: "asset",
      fromId,
      toType: "asset",
      toId,
      kind,
      createdAt: now,
    });
  };

  // Fast lookup of pre-existing links so we don't duplicate.
  const existing = await db.links
    .where("programId").equals(programId)
    .and((l) => l.fromType === "asset" && l.toType === "asset")
    .toArray();
  const existingSig = new Set(existing.map((l) => `${l.fromId}→${l.toId}:${l.kind}`));

  let techMatches = 0;
  for (const intel of newIntel) {
    // Parent host relation
    if (intel.parentHost) {
      const parents = byHost.get(intel.parentHost);
      if (parents?.length) {
        push(intel.assetId, parents[0].assetId, "derived-from");
      }
    }
    // Endpoint/url/port → host asset
    if (intel.kind === "endpoint" || intel.kind === "url" || intel.kind === "port") {
      const hosts = byHost.get(intel.host)?.filter(
        (h) => h.kind === "subdomain" || h.kind === "domain" || h.kind === "ip",
      );
      if (hosts?.length) push(hosts[0].assetId, intel.assetId, "hosts");
    }
    // Shared-technology siblings (cap per intel to avoid combinatorial explosion)
    if (intel.technologies.length) {
      const siblings = allIntel.filter(
        (o) => o.assetId !== intel.assetId &&
               o.technologies.some((t) => intel.technologies.includes(t)),
      ).slice(0, 3);
      for (const s of siblings) {
        push(intel.assetId, s.assetId, "relates-to");
        techMatches++;
      }
    }
  }

  const fresh = links.filter((l) => !existingSig.has(`${l.fromId}→${l.toId}:${l.kind}`));
  if (fresh.length) await db.links.bulkPut(fresh);

  if (fresh.length) {
    await logActivity({
      programId,
      entityType: "link",
      entityId: uid("corr"),
      action: "linked",
      summary: `Correlated ${fresh.length} asset relationships (${techMatches} tech matches)`,
      meta: { total: fresh.length, techMatches },
    });
  }

  return { createdLinks: fresh.length, matchedTech: techMatches };
}

/**
 * Correlation persistence + audit trail.
 *
 * Reconciles freshly-detected clusters with stored ones so analyst decisions
 * (approve, reject, merge, queue) survive re-runs. Original records
 * (findings/assets/etc.) are never modified — merges are logical.
 */

import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { createLink } from "@/lib/repo/links";
import type { LinkKind } from "@/types";
import { detectCorrelations } from "./engine";
import type {
  CorrelationAuditAction,
  CorrelationCluster,
  CorrelationRunSummary,
  CorrelationStatus,
} from "./types";

export async function listClusters(programId: string | null): Promise<CorrelationCluster[]> {
  const all = await db.correlationClusters.toArray();
  return all
    .filter((c) => !programId || !c.programId || c.programId === programId)
    .sort((a, b) => b.score - a.score);
}

export async function getCluster(id: string): Promise<CorrelationCluster | undefined> {
  return db.correlationClusters.get(id);
}

export async function saveCluster(c: CorrelationCluster): Promise<CorrelationCluster> {
  const next = { ...c, updatedAt: Date.now() };
  await db.correlationClusters.put(next);
  return next;
}

export async function deleteCluster(id: string): Promise<void> {
  await db.correlationClusters.delete(id);
}

/** Rebuild clusters for a program, preserving analyst decisions. */
export async function runCorrelation(programId: string | null): Promise<CorrelationRunSummary> {
  const { clusters, summary } = await detectCorrelations(programId);
  const existing = await listClusters(programId);
  const bySig = new Map<string, CorrelationCluster>();
  for (const c of existing) bySig.set(signature(c), c);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const now = Date.now();

  for (const fresh of clusters) {
    const sig = signature(fresh);
    const prev = bySig.get(sig);
    if (!prev) {
      await db.correlationClusters.put(fresh);
      created++;
      continue;
    }
    // Preserve analyst state, refresh score/signals/tags.
    const merged: CorrelationCluster = {
      ...prev,
      score: Math.max(prev.score, fresh.score),
      signals: fresh.signals.length ? fresh.signals : prev.signals,
      tags: [...new Set([...prev.tags, ...fresh.tags])],
      summary: fresh.summary,
      updatedAt: now,
    };
    if (JSON.stringify(merged) !== JSON.stringify(prev)) {
      await db.correlationClusters.put(merged);
      updated++;
    } else {
      unchanged++;
    }
    bySig.delete(sig);
  }

  // Anything left in `bySig` is stale — if it's still open, leave for review
  // but stamp it as resolved when analyst decided or membership vanished.
  for (const stale of bySig.values()) {
    if (stale.status === "open") {
      const next: CorrelationCluster = {
        ...stale,
        status: "resolved",
        updatedAt: now,
        history: [...stale.history, { id: uid("ah"), action: "resolved", ts: now, note: "No longer detected on latest run." }],
      };
      await db.correlationClusters.put(next);
      updated++;
    }
  }

  const finalSummary: CorrelationRunSummary = {
    ...summary,
    clustersCreated: created,
    clustersUpdated: updated,
    clustersUnchanged: unchanged,
  };

  await logActivity({
    programId,
    entityType: "link",
    entityId: uid("cor"),
    action: "linked",
    summary: `Correlation run: +${created} new, ~${updated} updated, ${unchanged} unchanged`,
    meta: finalSummary as unknown as Record<string, unknown>,
  });

  return finalSummary;
}

// ── Analyst actions (all preserve original records) ───────────────────────

export async function setStatus(id: string, status: CorrelationStatus, note?: string): Promise<CorrelationCluster | undefined> {
  const c = await db.correlationClusters.get(id);
  if (!c) return;
  const action: CorrelationAuditAction =
    status === "approved" ? "approved" :
    status === "rejected" ? "rejected" :
    status === "queued" ? "queued" :
    status === "merged" ? "merged" :
    status === "resolved" ? "resolved" : "linked";
  const next: CorrelationCluster = {
    ...c,
    status,
    updatedAt: Date.now(),
    history: [...c.history, { id: uid("ah"), action, ts: Date.now(), note }],
  };
  await db.correlationClusters.put(next);
  await logActivity({
    programId: c.programId,
    entityType: "link",
    entityId: c.id,
    action: status === "rejected" ? "unlinked" : "linked",
    summary: `Correlation ${status}: ${c.title}`,
  });
  return next;
}

export async function setPrimary(id: string, memberId: string, note?: string): Promise<CorrelationCluster | undefined> {
  const c = await db.correlationClusters.get(id);
  if (!c) return;
  const next: CorrelationCluster = {
    ...c,
    primaryId: memberId,
    updatedAt: Date.now(),
    history: [...c.history, { id: uid("ah"), action: "primary-changed", ts: Date.now(), note, meta: { primaryId: memberId } }],
  };
  await db.correlationClusters.put(next);
  return next;
}

export async function addNote(id: string, note: string): Promise<CorrelationCluster | undefined> {
  const c = await db.correlationClusters.get(id);
  if (!c || !note.trim()) return;
  const next: CorrelationCluster = {
    ...c,
    updatedAt: Date.now(),
    history: [...c.history, { id: uid("ah"), action: "note-added", ts: Date.now(), note: note.trim() }],
  };
  await db.correlationClusters.put(next);
  return next;
}

/** Materialize the cluster as authored EntityLinks so it's visible in the graph. */
export async function approveAsLinks(id: string, kind: LinkKind = "relates-to"): Promise<number> {
  const c = await db.correlationClusters.get(id);
  if (!c) return 0;
  const linkable = c.members.filter((m) => ["asset", "finding", "http", "evidence", "poc", "report", "note"].includes(m.type));
  if (linkable.length < 2) return 0;
  const primary = linkable.find((m) => m.id === c.primaryId) ?? linkable[0];
  let count = 0;
  for (const m of linkable) {
    if (m.id === primary.id) continue;
    await createLink({
      programId: c.programId,
      fromType: primary.type as never,
      fromId: primary.id,
      toType: m.type as never,
      toId: m.id,
      kind,
      note: `Correlation: ${c.title}`,
    });
    count++;
  }
  await setStatus(id, "approved", `Materialized ${count} links (kind=${kind})`);
  return count;
}

function signature(c: CorrelationCluster): string {
  return `${c.kind}|${c.members.map((m) => `${m.type}:${m.id}`).sort().join(",")}`;
}

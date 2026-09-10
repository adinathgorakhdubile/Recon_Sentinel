import { db, getMeta, setMeta, META_KEYS, type StoredFinding, type StoredPocAttachment } from "@/lib/db";
import type { WorkspaceState, Finding } from "@/types";
import { seedWorkspace, uid } from "@/lib/seed";
import { logActivity } from "@/lib/repo/activity";
import { searchService } from "@/lib/search";

import { backfillAll } from "@/lib/assets/repo";

const LEGACY_KEY = "recon-workbench:v1";
const BACKUP_KEY = "recon-workbench:v1.backup";
const CURRENT_VERSION = 5;

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return new Blob([], { type: "application/octet-stream" });
  }
}

function readLegacyBlob(): WorkspaceState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

async function importSnapshot(state: WorkspaceState, opts: { fromSeed: boolean }): Promise<void> {
  await db.transaction(
    "rw",
    [db.programs, db.tasks, db.assets, db.notes, db.findings, db.pocAttachments, db.activity, db.meta],
    async () => {
      await db.programs.bulkPut(state.programs);
      await db.tasks.bulkPut(state.tasks);
      await db.assets.bulkPut(state.assets);
      await db.notes.bulkPut(state.notes);

      const storedFindings: StoredFinding[] = [];
      const storedPocs: StoredPocAttachment[] = [];
      for (const f of state.findings) {
        const attachments = f.pocAttachments ?? [];
        const pocIds: string[] = [];
        for (const p of attachments) {
          const blob = await dataUrlToBlob(p.dataUrl);
          const id = p.id ?? uid("poc");
          storedPocs.push({
            id,
            findingId: f.id,
            kind: p.kind,
            mime: p.mime,
            caption: p.caption,
            createdAt: p.createdAt,
            sizeBytes: p.sizeBytes,
            blob,
          });
          pocIds.push(id);
        }
        const { pocAttachments: _drop, ...rest } = f;
        storedFindings.push({ ...(rest as Finding), pocAttachmentIds: pocIds });
      }
      await db.findings.bulkPut(storedFindings);
      await db.pocAttachments.bulkPut(storedPocs);

      if (state.activeProgramId) {
        await setMeta(META_KEYS.activeProgramId, state.activeProgramId);
      }

      for (const p of state.programs) {
        await logActivity({
          programId: p.id,
          entityType: "program",
          entityId: p.id,
          action: opts.fromSeed ? "created" : "imported",
          summary: opts.fromSeed ? `Seeded program "${p.name}"` : `Imported program "${p.name}" from local backup`,
        });
      }
    },
  );
}

/**
 * Ensures the Dexie store is populated and the search index is warm.
 * Idempotent — safe to call on every boot.
 */
export async function ensureDbReady(): Promise<void> {
  const version = await getMeta<number>(META_KEYS.schemaVersion);
  if (version === CURRENT_VERSION) {
    const count = await db.searchDocs.count();
    if (count === 0) await searchService.reindexAll();
    await backfillAll();
    return;
  }

  const legacy = readLegacyBlob();
  if (legacy && legacy.programs?.length) {
    await importSnapshot(legacy, { fromSeed: false });
    try {
      window.localStorage.setItem(BACKUP_KEY, window.localStorage.getItem(LEGACY_KEY) ?? "");
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  } else if (!version) {
    await importSnapshot(seedWorkspace(), { fromSeed: true });
  }

  await searchService.reindexAll();
  await backfillAll();
  await setMeta(META_KEYS.schemaVersion, CURRENT_VERSION);
  await setMeta(META_KEYS.migratedAt, Date.now());
}

export async function resetDb(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await importSnapshot(seedWorkspace(), { fromSeed: true });
  await searchService.reindexAll();
  await setMeta(META_KEYS.schemaVersion, CURRENT_VERSION);
  await setMeta(META_KEYS.migratedAt, Date.now());
}

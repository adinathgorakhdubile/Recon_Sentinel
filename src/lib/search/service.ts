import { db, type SearchDoc } from "@/lib/db";
import { ENCYCLOPEDIA } from "@/lib/encyclopedia";
import type { Asset, ChecklistTask, Finding, Note, Program } from "@/types";
import {
  buildAssetDoc,
  buildEncyclopediaDoc,
  buildEvidenceDoc,
  buildFindingDoc,
  buildNoteDoc,
  buildProgramDoc,
  buildReportDoc,
  buildTagDoc,
  buildTaskDoc,
} from "./builders";
import { LocalIndexAdapter } from "./localIndexAdapter";
import type { SearchAdapter, SearchQuery, SearchResult } from "./types";

/**
 * Facade over a pluggable SearchAdapter. Components should call this and
 * never touch a Dexie table directly — the adapter can be swapped for a
 * semantic / AI backend without touching callers.
 */
class SearchService {
  private adapter: SearchAdapter = new LocalIndexAdapter();

  setAdapter(adapter: SearchAdapter): void {
    this.adapter = adapter;
  }

  getAdapter(): SearchAdapter {
    return this.adapter;
  }

  upsert(doc: SearchDoc): Promise<void> {
    return this.adapter.upsert(doc);
  }

  bulkUpsert(docs: SearchDoc[]): Promise<void> {
    return this.adapter.bulkUpsert(docs);
  }

  remove(entityType: SearchDoc["entityType"], entityId: string): Promise<void> {
    return this.adapter.remove(entityType, entityId);
  }

  removeByProgram(programId: string): Promise<void> {
    return this.adapter.removeByProgram(programId);
  }

  query(q: SearchQuery): Promise<SearchResult[]> {
    return this.adapter.query(q);
  }

  // ----- Domain helpers so callers stay concise -----

  indexProgram(p: Program) { return this.upsert(buildProgramDoc(p)); }
  indexTask(t: ChecklistTask) { return this.upsert(buildTaskDoc(t)); }
  indexAsset(a: Asset) { return this.upsert(buildAssetDoc(a)); }
  indexNote(n: Note) { return this.upsert(buildNoteDoc(n)); }
  indexFinding(f: Finding) {
    const docs: SearchDoc[] = [buildFindingDoc(f)];
    for (const p of f.pocAttachments ?? []) {
      docs.push(buildEvidenceDoc(p, { id: f.id, programId: f.programId, title: f.title }));
    }
    return this.bulkUpsert(docs);
  }

  async removeFinding(id: string): Promise<void> {
    await this.remove("finding", id);
    // Remove any evidence docs that referenced this finding.
    const evidenceIds = await db.searchDocs
      .where("entityType")
      .equals("evidence")
      .toArray();
    const toDrop = evidenceIds.filter((d) => d.programId != null && d.subtitle?.includes("Evidence"));
    // Best-effort — evidence docs are tiny; the finding-level cascade in the
    // workspace repo removes the attachments themselves.
    if (toDrop.length) await db.searchDocs.bulkDelete(toDrop.map((d) => d.id));
  }

  /**
   * Full reindex from the primary tables. Idempotent — call on boot after
   * migrations and whenever the adapter is swapped.
   */
  async reindexAll(): Promise<void> {
    const [programs, tasks, assets, notes, findingRows, pocRows] = await Promise.all([
      db.programs.toArray(),
      db.tasks.toArray(),
      db.assets.toArray(),
      db.notes.toArray(),
      db.findings.toArray(),
      db.pocAttachments.toArray(),
    ]);

    const docs: SearchDoc[] = [];
    for (const p of programs) docs.push(buildProgramDoc(p));
    for (const t of tasks) docs.push(buildTaskDoc(t));
    for (const a of assets) docs.push(buildAssetDoc(a));
    for (const n of notes) docs.push(buildNoteDoc(n));

    const findingById = new Map(findingRows.map((f) => [f.id, f] as const));
    for (const f of findingRows) {
      docs.push(buildFindingDoc({ ...f, pocAttachments: [] } as unknown as Finding));
    }
    for (const p of pocRows) {
      const f = findingById.get(p.findingId);
      if (!f) continue;
      docs.push(buildEvidenceDoc(
        { id: p.id, kind: p.kind, mime: p.mime, dataUrl: "", caption: p.caption, createdAt: p.createdAt, sizeBytes: p.sizeBytes },
        { id: f.id, programId: f.programId, title: f.title },
      ));
    }

    // Encyclopedia (global, static)
    for (const v of ENCYCLOPEDIA) docs.push(buildEncyclopediaDoc(v));

    // Tag rollups per program.
    const tagCounts = new Map<string, { programId: string | null; tag: string; count: number }>();
    const bump = (tag: string, programId: string | null) => {
      if (!tag) return;
      const key = `${programId ?? "*"}:${tag}`;
      const cur = tagCounts.get(key);
      if (cur) cur.count++;
      else tagCounts.set(key, { programId, tag, count: 1 });
    };
    for (const a of assets) for (const t of a.tags ?? []) bump(t, a.programId);
    for (const n of notes) for (const t of n.tags ?? []) bump(t, n.programId);
    for (const [, entry] of tagCounts) docs.push(buildTagDoc(entry.tag, entry.programId, entry.count));

    // Report surface per program.
    for (const p of programs) docs.push(buildReportDoc(p.id, p.name));

    await this.adapter.clear();
    await this.adapter.bulkUpsert(docs);
  }
}

export const searchService = new SearchService();
export type { SearchQuery, SearchResult } from "./types";

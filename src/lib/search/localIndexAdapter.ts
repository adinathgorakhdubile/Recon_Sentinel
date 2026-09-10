import { db, type SearchDoc, type SearchEntityType } from "@/lib/db";
import { fuzzyScore } from "./fuzzy";
import { queryTerms, tokenize } from "./tokenize";
import type { SearchAdapter, SearchQuery, SearchResult } from "./types";

/**
 * Dexie-backed inverted index. Uses the `*tokens` multi-entry index to
 * pre-filter, then applies fuzzy scoring in memory. Small enough to keep
 * the whole ranking pipeline swappable behind SearchAdapter.
 */
export class LocalIndexAdapter implements SearchAdapter {
  readonly name = "local";

  async upsert(doc: SearchDoc): Promise<void> {
    await db.searchDocs.put(doc);
  }

  async bulkUpsert(docs: SearchDoc[]): Promise<void> {
    if (!docs.length) return;
    await db.searchDocs.bulkPut(docs);
  }

  async remove(entityType: SearchEntityType, entityId: string): Promise<void> {
    await db.searchDocs.delete(`${entityType}:${entityId}`);
  }

  async removeByProgram(programId: string): Promise<void> {
    await db.searchDocs.where("programId").equals(programId).delete();
  }

  async clear(): Promise<void> {
    await db.searchDocs.clear();
  }

  async query({ q, limit = 20, programId, entityTypes }: SearchQuery): Promise<SearchResult[]> {
    const terms = queryTerms(q);

    // Empty query → recency-ordered pinned surface (still respects filters).
    if (!terms.length) {
      let coll = db.searchDocs.orderBy("updatedAt").reverse();
      const docs = await coll.limit(limit * 3).toArray();
      return this.filter(docs, { programId, entityTypes })
        .slice(0, limit)
        .map((doc) => ({ doc, score: 0.5, matchedField: "title" as const, positions: [] }));
    }

    // Expand each term into token variants (subword splits).
    const expanded = new Set<string>();
    for (const t of terms) for (const tok of tokenize(t)) expanded.add(tok);

    let candidates: SearchDoc[] = [];
    if (expanded.size) {
      candidates = await db.searchDocs.where("tokens").anyOf(Array.from(expanded)).toArray();
    }
    // Fallback: scan a bounded slice for very short queries.
    if (candidates.length < 3) {
      const extra = await db.searchDocs.orderBy("updatedAt").reverse().limit(500).toArray();
      const seen = new Set(candidates.map((d) => d.id));
      for (const d of extra) if (!seen.has(d.id)) candidates.push(d);
    }

    const filtered = this.filter(candidates, { programId, entityTypes });
    const scored: SearchResult[] = [];
    for (const doc of filtered) {
      const scoredHit = scoreDoc(doc, terms);
      if (scoredHit) scored.push({ doc, ...scoredHit });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private filter(
    docs: SearchDoc[],
    { programId, entityTypes }: { programId?: string | null; entityTypes?: SearchEntityType[] },
  ): SearchDoc[] {
    return docs.filter((d) => {
      if (entityTypes && entityTypes.length && !entityTypes.includes(d.entityType)) return false;
      if (programId === undefined) return true;
      if (programId === null) return true; // no active program → show all
      // Encyclopedia is global; always allow. Otherwise scope to program.
      if (d.entityType === "encyclopedia") return true;
      return d.programId === programId || d.programId === null;
    });
  }
}

function scoreDoc(
  doc: SearchDoc,
  terms: string[],
): { score: number; matchedField: SearchResult["matchedField"]; positions: number[] } | null {
  const fields: { name: SearchResult["matchedField"]; text: string; weight: number }[] = [
    { name: "title", text: doc.title, weight: 1.0 },
    { name: "subtitle", text: doc.subtitle ?? "", weight: 0.7 },
    { name: "tags", text: doc.tags.join(" "), weight: 0.6 },
    { name: "body", text: doc.body, weight: 0.35 },
  ];

  let best: { score: number; matchedField: SearchResult["matchedField"]; positions: number[] } | null = null;
  let combined = 0;
  let hits = 0;

  for (const term of terms) {
    let termBest = 0;
    for (const f of fields) {
      const m = fuzzyScore(term, f.text);
      if (!m) continue;
      const s = m.score * f.weight;
      if (s > termBest) termBest = s;
      if (!best || s > best.score) best = { score: s, matchedField: f.name, positions: m.positions };
    }
    if (termBest > 0) {
      hits++;
      combined += termBest;
    }
  }

  if (!best || hits === 0) return null;
  // Require ALL query terms to match somewhere.
  if (hits < terms.length) return null;

  // Recency boost (very small, so relevance dominates).
  const ageDays = Math.max(0, (Date.now() - doc.updatedAt) / 86_400_000);
  const recency = 1 / (1 + ageDays / 30);
  const finalScore = (combined / terms.length) * 0.9 + recency * 0.1;
  return { score: finalScore, matchedField: best.matchedField, positions: best.positions };
}

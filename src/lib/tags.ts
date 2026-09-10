import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export interface TagRollup {
  tag: string;
  total: number;
  byEntity: { assets: number; notes: number; findings: number };
}

/**
 * Aggregated tag rollup across assets, notes and findings.
 * Optionally scoped to a single program.
 */
export function useAllTags(programId?: string | null): TagRollup[] {
  const rollup = useLiveQuery(async () => {
    const [assets, notes, findings] = await Promise.all([
      programId ? db.assets.where("programId").equals(programId).toArray() : db.assets.toArray(),
      programId ? db.notes.where("programId").equals(programId).toArray() : db.notes.toArray(),
      programId ? db.findings.where("programId").equals(programId).toArray() : db.findings.toArray(),
    ]);
    const map = new Map<string, TagRollup>();
    const bump = (tag: string, key: "assets" | "notes" | "findings") => {
      if (!tag) return;
      const norm = tag.trim().toLowerCase();
      if (!norm) return;
      let r = map.get(norm);
      if (!r) {
        r = { tag: norm, total: 0, byEntity: { assets: 0, notes: 0, findings: 0 } };
        map.set(norm, r);
      }
      r.total++;
      r.byEntity[key]++;
    };
    for (const a of assets) for (const t of a.tags ?? []) bump(t, "assets");
    for (const n of notes) for (const t of n.tags ?? []) bump(t, "notes");
    for (const f of findings) for (const t of f.tags ?? []) bump(t, "findings");
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [programId ?? null], [] as TagRollup[]);
  return rollup ?? [];
}

export function normalizeTag(input: string): string {
  return input.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
}

export function parseTagList(csv: string): string[] {
  return csv
    .split(",")
    .map((t) => normalizeTag(t))
    .filter(Boolean);
}

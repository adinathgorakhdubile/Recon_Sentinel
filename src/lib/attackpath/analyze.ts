/**
 * Attack-path analytics: dependency ordering, severity/stage stats,
 * technology coverage, and trust-boundary transitions.
 */

import type { AttackPath, AttackStep, TrustLevel } from "./types";
import { TRUST_ORDER } from "./types";

export interface PathStats {
  steps: number;
  byKind: Record<string, number>;
  byStage: Record<string, number>;
  technologies: string[];
  privilegeEscalations: number;
  pivots: number;
  highestTrust?: TrustLevel;
  cumulativeConfidence: number;
}

export function analyze(path: AttackPath): PathStats {
  const byKind: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const techs = new Set<string>();
  let priv = 0, pivots = 0;
  let highest: TrustLevel | undefined;
  let conf = 1;
  for (const s of path.steps) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    if (s.stage) byStage[s.stage] = (byStage[s.stage] ?? 0) + 1;
    for (const t of s.tags) techs.add(t);
    if (s.kind === "privilege") priv++;
    if (s.kind === "pivot" || s.kind === "lateral") pivots++;
    if (s.trustAfter) {
      const rankNew = TRUST_ORDER.indexOf(s.trustAfter);
      const rankCur = highest ? TRUST_ORDER.indexOf(highest) : -1;
      if (rankNew > rankCur) highest = s.trustAfter;
    }
    conf *= s.confidence ?? 0.7;
  }
  return {
    steps: path.steps.length,
    byKind,
    byStage,
    technologies: [...techs].sort(),
    privilegeEscalations: priv,
    pivots,
    highestTrust: highest,
    cumulativeConfidence: conf,
  };
}

/**
 * Topological order honoring step.prerequisites (a DAG). Falls back to the
 * authored order when prerequisites form a cycle or reference missing ids.
 */
export function topoOrder(steps: AttackStep[]): AttackStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indeg = new Map<string, number>();
  for (const s of steps) indeg.set(s.id, 0);
  for (const s of steps) for (const p of s.prerequisites) if (byId.has(p)) indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
  const q: string[] = [];
  for (const [id, d] of indeg) if (d === 0) q.push(id);
  q.sort((a, b) => (byId.get(a)!.order - byId.get(b)!.order));
  const seen = new Set<string>();
  const out: AttackStep[] = [];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = byId.get(id)!;
    out.push(s);
    for (const other of steps) {
      if (other.prerequisites.includes(id)) {
        indeg.set(other.id, (indeg.get(other.id) ?? 1) - 1);
        if ((indeg.get(other.id) ?? 0) <= 0) q.push(other.id);
      }
    }
    q.sort((a, b) => (byId.get(a)!.order - byId.get(b)!.order));
  }
  if (out.length !== steps.length) return [...steps].sort((a, b) => a.order - b.order);
  return out;
}

/** Build a dependency adjacency list (prereq → dependants). Useful for graph views. */
export function dependencyEdges(steps: AttackStep[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) for (const p of s.prerequisites) if (ids.has(p)) edges.push({ from: p, to: s.id });
  // Fallback: sequential edges when no explicit prereqs.
  if (!edges.length) {
    const ordered = [...steps].sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) edges.push({ from: ordered[i - 1].id, to: ordered[i].id });
  }
  return edges;
}

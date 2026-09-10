/**
 * Read-only graph queries: neighbors, traversal, backlinks, impact scoring.
 * These operate on a materialized GraphSnapshot and are safe to call from
 * the UI, AI reasoners, and report generators alike.
 */

import type { GraphEdge, GraphNode, GraphSnapshot } from "./types";

export function indexEdges(g: GraphSnapshot) {
  const outAdj = new Map<string, GraphEdge[]>();
  const inAdj = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    (outAdj.get(e.from) ?? outAdj.set(e.from, []).get(e.from)!)!.push(e);
    (inAdj.get(e.to) ?? inAdj.set(e.to, []).get(e.to)!)!.push(e);
  }
  return { outAdj, inAdj };
}

/** All directly connected node ids, ignoring direction. */
export function neighbors(g: GraphSnapshot, nodeId: string): GraphEdge[] {
  return g.edges.filter((e) => e.from === nodeId || e.to === nodeId);
}

/** BFS traversal up to `depth` hops; returns visited node ids. */
export function traverse(g: GraphSnapshot, start: string, depth: number): Set<string> {
  const seen = new Set<string>([start]);
  const { outAdj, inAdj } = indexEdges(g);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of outAdj.get(id) ?? []) if (!seen.has(e.to)) (seen.add(e.to), next.push(e.to));
      for (const e of inAdj.get(id) ?? []) if (!seen.has(e.from)) (seen.add(e.from), next.push(e.from));
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return seen;
}

/** Restrict a snapshot to a node's N-hop neighborhood. */
export function subgraph(g: GraphSnapshot, focusId: string, depth: number): GraphSnapshot {
  const keep = traverse(g, focusId, Math.max(0, depth));
  return {
    ...g,
    nodes: g.nodes.filter((n) => keep.has(n.id)),
    edges: g.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

/** Everything pointing at this node (incoming edges). */
export function backlinks(g: GraphSnapshot, nodeId: string): GraphEdge[] {
  return g.edges.filter((e) => e.to === nodeId);
}

/**
 * Impact analysis — propagate a node's weight along outgoing edges with a
 * decay factor. Useful for "what depends on this asset?" style questions.
 */
export function impactScore(g: GraphSnapshot, start: string, decay = 0.5, depth = 4): Map<string, number> {
  const scores = new Map<string, number>();
  const { outAdj, inAdj } = indexEdges(g);
  const startNode = g.nodes.find((n) => n.id === start);
  const seed = startNode?.weight ?? 1;
  scores.set(start, seed);
  const q: Array<{ id: string; score: number; d: number }> = [{ id: start, score: seed, d: 0 }];
  while (q.length) {
    const { id, score, d } = q.shift()!;
    if (d >= depth) continue;
    const step = score * decay;
    if (step < 0.01) continue;
    const nexts = [
      ...(outAdj.get(id) ?? []).map((e) => e.to),
      ...(inAdj.get(id) ?? []).map((e) => e.from),
    ];
    for (const nb of nexts) {
      const prev = scores.get(nb) ?? 0;
      if (step > prev) {
        scores.set(nb, step);
        q.push({ id: nb, score: step, d: d + 1 });
      }
    }
  }
  return scores;
}

export function findNode(g: GraphSnapshot, nodeId: string): GraphNode | undefined {
  return g.nodes.find((n) => n.id === nodeId);
}

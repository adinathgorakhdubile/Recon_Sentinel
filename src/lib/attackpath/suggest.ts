/**
 * Automatic attack-path suggestions derived from the Knowledge Graph.
 *
 * The suggester walks the graph from a chosen seed node and proposes ordered
 * step sequences that pass through security-relevant node kinds (findings,
 * vulnerabilities, HTTP endpoints, evidence). It ranks candidates by cumulative
 * severity, path length, and connectivity. It never claims exploitability —
 * every suggestion is a hypothesis grounded in observed graph structure.
 *
 * Future AI-assisted suggesters, cloud identity walkers, and exploit-chain
 * simulators plug into this module through the same PathSuggestion shape.
 */

import { indexEdges, neighbors } from "@/lib/graph/query";
import type { GraphNode, GraphSnapshot } from "@/lib/graph/types";
import { makeAttachment, makeStep } from "./repo";
import type { AttackAttachment, AttackStep, AttackStepKind } from "./types";

export interface PathSuggestion {
  seedId: string;
  targetId: string;
  score: number;
  reason: string;
  steps: AttackStep[];
}

interface SuggestOptions {
  seedId: string;
  maxDepth?: number;
  maxSuggestions?: number;
  /** Node kinds that terminate a path (default: findings + objectives). */
  targetKinds?: GraphNode["kind"][];
}

const KIND_TO_STEP: Partial<Record<GraphNode["kind"], AttackStepKind>> = {
  program: "entry",
  scope: "entry",
  domain: "recon",
  subdomain: "recon",
  ip: "recon",
  url: "recon",
  endpoint: "recon",
  technology: "recon",
  service: "recon",
  dns: "recon",
  certificate: "recon",
  port: "recon",
  asset: "recon",
  http: "recon",
  finding: "vuln",
  poc: "exploit",
  evidence: "note",
  report: "note",
  note: "note",
  task: "note",
  timeline: "note",
};

export function suggestPaths(g: GraphSnapshot, opts: SuggestOptions): PathSuggestion[] {
  const maxDepth = opts.maxDepth ?? 5;
  const maxSuggestions = opts.maxSuggestions ?? 10;
  const targetKinds = new Set(opts.targetKinds ?? (["finding"] as GraphNode["kind"][]));

  const seed = g.nodes.find((n) => n.id === opts.seedId);
  if (!seed) return [];

  const { outAdj, inAdj } = indexEdges(g);
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));

  interface Walk { path: string[]; visited: Set<string>; score: number }
  const results: PathSuggestion[] = [];
  const queue: Walk[] = [{ path: [seed.id], visited: new Set([seed.id]), score: 0 }];

  while (queue.length && results.length < maxSuggestions * 3) {
    const w = queue.shift()!;
    const tail = w.path[w.path.length - 1];
    const tailNode = nodeById.get(tail)!;
    if (w.path.length > 1 && targetKinds.has(tailNode.kind)) {
      results.push(materialize(w, nodeById));
      continue;
    }
    if (w.path.length >= maxDepth) continue;
    const nexts = [
      ...(outAdj.get(tail) ?? []).map((e) => e.to),
      ...(inAdj.get(tail) ?? []).map((e) => e.from),
    ];
    for (const nb of nexts) {
      if (w.visited.has(nb)) continue;
      const nbNode = nodeById.get(nb);
      if (!nbNode) continue;
      const step = (nbNode.weight ?? 1) + (targetKinds.has(nbNode.kind) ? 5 : 0);
      queue.push({
        path: [...w.path, nb],
        visited: new Set([...w.visited, nb]),
        score: w.score + step,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

function materialize(w: { path: string[]; score: number }, nodeById: Map<string, GraphNode>): PathSuggestion {
  const steps: AttackStep[] = w.path.map((id, i) => {
    const n = nodeById.get(id)!;
    const kind = KIND_TO_STEP[n.kind] ?? "recon";
    const attachments: AttackAttachment[] = n.ref
      ? [makeAttachment(mapAttach(n.ref.type as string) ?? "asset", n.ref.id, n.label)]
      : [];
    return makeStep({
      order: i,
      kind: i === 0 ? "entry" : i === w.path.length - 1 ? (kind === "vuln" ? "vuln" : "objective") : kind,
      title: n.label,
      body: n.sublabel ? `_${n.sublabel}_` : "",
      nodeId: n.id,
      tags: n.tags ?? [],
      attachments,
      confidence: 0.4,
    });
  });
  const target = nodeById.get(w.path[w.path.length - 1])!;
  const seed = nodeById.get(w.path[0])!;
  return {
    seedId: seed.id,
    targetId: target.id,
    score: w.score,
    reason: `${w.path.length}-hop path from ${seed.label} to ${target.label}`,
    steps,
  };
}

function mapAttach(t: string): AttackAttachment["refType"] | null {
  const known: AttackAttachment["refType"][] = ["asset", "finding", "evidence", "http", "poc", "note", "report"];
  return (known as string[]).includes(t) ? (t as AttackAttachment["refType"]) : "asset";
}

/** Compare two paths, returning per-step diff labels for the comparison view. */
export function diffPaths(a: AttackStep[], b: AttackStep[]): Array<{ a?: AttackStep; b?: AttackStep; state: "same" | "added" | "removed" | "changed" }> {
  const out: Array<{ a?: AttackStep; b?: AttackStep; state: "same" | "added" | "removed" | "changed" }> = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const sa = a[i]; const sb = b[i];
    if (sa && !sb) out.push({ a: sa, state: "removed" });
    else if (!sa && sb) out.push({ b: sb, state: "added" });
    else if (sa && sb) out.push({ a: sa, b: sb, state: sa.title === sb.title && sa.kind === sb.kind ? "same" : "changed" });
  }
  return out;
}

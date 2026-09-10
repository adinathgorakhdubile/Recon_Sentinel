/**
 * Minimal force-directed layout. Deterministic when `seed` is provided so
 * saved views can restore a consistent camera without persisting per-node
 * coordinates. Runs synchronously — good for graphs up to a few thousand
 * nodes; heavier graphs should be virtualized or paginated by the caller.
 */

import type { GraphEdge, GraphNode } from "./types";

export interface LayoutPoint { id: string; x: number; y: number }

export function layout(nodes: GraphNode[], edges: GraphEdge[], opts: { iterations?: number; width?: number; height?: number } = {}): LayoutPoint[] {
  const width = opts.width ?? 1400;
  const height = opts.height ?? 900;
  const iterations = opts.iterations ?? 220;
  const n = nodes.length;
  if (!n) return [];

  const k = Math.sqrt((width * height) / n) * 0.9;
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  // Deterministic seed based on id.
  for (const node of nodes) {
    const h = hash(node.id);
    pos.set(node.id, {
      x: width / 2 + Math.cos(h) * (width / 3) * fract(h),
      y: height / 2 + Math.sin(h * 1.7) * (height / 3) * fract(h * 3),
      vx: 0,
      vy: 0,
    });
  }

  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, new Set()).get(e.from)!)!.add(e.to);
    (adj.get(e.to) ?? adj.set(e.to, new Set()).get(e.to)!)!.add(e.from);
  }

  let temp = width / 10;
  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion
    for (const a of nodes) {
      const pa = pos.get(a.id)!;
      pa.vx = 0; pa.vy = 0;
      for (const b of nodes) {
        if (a.id === b.id) continue;
        const pb = pos.get(b.id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (k * k) / dist;
        pa.vx += (dx / dist) * f;
        pa.vy += (dy / dist) * f;
      }
    }
    // Attraction
    for (const e of edges) {
      const pa = pos.get(e.from); const pb = pos.get(e.to);
      if (!pa || !pb) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (dist * dist) / k;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      pa.vx -= fx; pa.vy -= fy;
      pb.vx += fx; pb.vy += fy;
    }
    // Integrate
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 0.01;
      p.x += (p.vx / speed) * Math.min(speed, temp);
      p.y += (p.vy / speed) * Math.min(speed, temp);
      // Contain roughly to canvas
      p.x = Math.max(40, Math.min(width - 40, p.x));
      p.y = Math.max(40, Math.min(height - 40, p.y));
    }
    temp *= 0.96;
  }

  return nodes.map((n) => ({ id: n.id, x: pos.get(n.id)!.x, y: pos.get(n.id)!.y }));
}

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff * 6.283;
}
function fract(x: number): number { return x - Math.floor(x); }

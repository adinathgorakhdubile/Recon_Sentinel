/**
 * Interactive knowledge-graph explorer.
 *
 * Pure SVG so it renders inside the existing Recon Sentinel shell without a
 * heavy graph library. Supports pan/zoom, drag-to-reposition, hover/select,
 * filter, group, search highlight, and focus-mode neighborhood restriction.
 * Layout is computed once per graph via the force simulation in ./layout.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { NODE_KIND_COLORS, NODE_KIND_LABELS, type GraphFilters, type GraphNode, type GraphSnapshot } from "@/lib/graph/types";
import { layout, type LayoutPoint } from "@/lib/graph/layout";
import { neighbors, subgraph } from "@/lib/graph/query";
import { cn } from "@/lib/utils";

interface Props {
  graph: GraphSnapshot;
  filters: GraphFilters;
  selectedId?: string;
  onSelect: (nodeId: string | undefined) => void;
  onCameraChange?: (cam: { x: number; y: number; scale: number }) => void;
  initialCamera?: { x: number; y: number; scale: number };
  height?: number;
}

const CANVAS_W = 1600;
const CANVAS_H = 1000;

export function GraphExplorer({ graph, filters, selectedId, onSelect, onCameraChange, initialCamera, height = 640 }: Props) {
  // Restrict to focus neighborhood if requested.
  const restricted = useMemo<GraphSnapshot>(() => {
    if (filters.focusId) return subgraph(graph, filters.focusId, filters.focusDepth ?? 2);
    return graph;
  }, [graph, filters.focusId, filters.focusDepth]);

  // Filter nodes by kind / tag / query.
  const filtered = useMemo<GraphSnapshot>(() => {
    const q = filters.query.trim().toLowerCase();
    const kindSet = new Set(filters.kinds);
    const edgeKindSet = new Set(filters.edgeKinds);
    const tagSet = new Set(filters.tags);
    const nodes = restricted.nodes.filter((n) => {
      if (kindSet.size && !kindSet.has(n.kind)) return false;
      if (tagSet.size && !(n.tags ?? []).some((t) => tagSet.has(t))) return false;
      if (q && !`${n.label} ${n.sublabel ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const keep = new Set(nodes.map((n) => n.id));
    const edges = restricted.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && (!edgeKindSet.size || edgeKindSet.has(e.kind)));
    return { ...restricted, nodes, edges };
  }, [restricted, filters]);

  // Layout — recomputed only when the topology changes.
  const [points, setPoints] = useState<Map<string, LayoutPoint>>(new Map());
  const topoKey = useMemo(() => {
    return filtered.nodes.map((n) => n.id).sort().join("|") + "#" + filtered.edges.length;
  }, [filtered]);
  useEffect(() => {
    const laid = layout(filtered.nodes, filtered.edges, { width: CANVAS_W, height: CANVAS_H });
    setPoints(new Map(laid.map((p) => [p.id, p])));
  }, [topoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Camera + interaction.
  const [cam, setCam] = useState(initialCamera ?? { x: 0, y: 0, scale: 0.7 });
  useEffect(() => { if (initialCamera) setCam(initialCamera); }, [initialCamera]);
  useEffect(() => { onCameraChange?.(cam); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ kind: "pan" | "node"; id?: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setCam((c) => ({ ...c, scale: Math.max(0.15, Math.min(3, c.scale * factor)) }));
  };
  const onMouseDown = (e: React.MouseEvent, nodeId?: string) => {
    if (nodeId) {
      const p = points.get(nodeId);
      if (!p) return;
      dragRef.current = { kind: "node", id: nodeId, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
    } else {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, origX: cam.x, origY: cam.y };
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const dx = (e.clientX - d.startX) / cam.scale;
    const dy = (e.clientY - d.startY) / cam.scale;
    if (d.kind === "pan") {
      setCam((c) => ({ ...c, x: d.origX + dx * cam.scale, y: d.origY + dy * cam.scale }));
    } else if (d.id) {
      setPoints((prev) => {
        const next = new Map(prev);
        next.set(d.id!, { id: d.id!, x: d.origX + dx, y: d.origY + dy });
        return next;
      });
    }
  };
  const onMouseUp = () => { dragRef.current = null; };

  // Grouping — render translucent hulls behind nodes sharing a group value.
  const groups = useMemo(() => {
    if (filters.groupBy === "none") return [];
    const map = new Map<string, GraphNode[]>();
    for (const n of filtered.nodes) {
      const keys =
        filters.groupBy === "kind" ? [n.kind]
        : filters.groupBy === "program" ? [n.programId ?? "unassigned"]
        : filters.groupBy === "tag" ? (n.tags?.length ? n.tags : ["untagged"])
        : [];
      for (const k of keys) {
        (map.get(k) ?? map.set(k, []).get(k)!)!.push(n);
      }
    }
    return [...map.entries()].map(([key, ns]) => {
      const pts = ns.map((n) => points.get(n.id)).filter(Boolean) as LayoutPoint[];
      if (pts.length < 2) return null;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { key, minX: Math.min(...xs) - 40, minY: Math.min(...ys) - 40, maxX: Math.max(...xs) + 40, maxY: Math.max(...ys) + 40 };
    }).filter(Boolean) as Array<{ key: string; minX: number; minY: number; maxX: number; maxY: number }>;
  }, [filtered.nodes, filters.groupBy, points]);

  const selectedNeighbors = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const set = new Set<string>([selectedId]);
    for (const e of neighbors(filtered, selectedId)) { set.add(e.from); set.add(e.to); }
    return set;
  }, [filtered, selectedId]);

  const transform = `translate(${cam.x} ${cam.y}) scale(${cam.scale})`;

  return (
    <div
      className="relative w-full rounded-lg border border-border/60 bg-background/50 overflow-hidden"
      style={{ height }}
      onWheel={onWheel as unknown as React.WheelEventHandler}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        onMouseDown={(e) => onMouseDown(e)}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={(e) => { if (e.target === svgRef.current) onSelect(undefined); }}
      >
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>
        <g transform={transform}>
          {groups.map((g) => (
            <rect
              key={g.key}
              x={g.minX} y={g.minY}
              width={g.maxX - g.minX} height={g.maxY - g.minY}
              rx={20} ry={20}
              fill="hsl(var(--muted) / 0.15)"
              stroke="hsl(var(--border))"
              strokeDasharray="4 4"
            />
          ))}
          {filtered.edges.map((e) => {
            const a = points.get(e.from); const b = points.get(e.to);
            if (!a || !b) return null;
            const dim = selectedId && !(selectedNeighbors.has(e.from) && selectedNeighbors.has(e.to));
            return (
              <g key={e.id} opacity={dim ? 0.2 : 0.7}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.auto ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--primary) / 0.6)"}
                  strokeWidth={1.4}
                  markerEnd="url(#arr)"
                />
              </g>
            );
          })}
          {filtered.nodes.map((n) => {
            const p = points.get(n.id); if (!p) return null;
            const isSelected = selectedId === n.id;
            const isDim = selectedId && !selectedNeighbors.has(n.id);
            const color = NODE_KIND_COLORS[n.kind];
            const r = 10 + Math.min(10, (n.weight ?? 1) * 0.8);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                opacity={isDim ? 0.25 : 1}
                style={{ cursor: "grab" }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, n.id); }}
                onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
              >
                <circle r={r + 4} fill={color} opacity={isSelected ? 0.35 : 0.15} />
                <circle r={r} fill={color} stroke={isSelected ? "hsl(var(--foreground))" : color} strokeWidth={isSelected ? 2 : 1} />
                <text
                  y={r + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                  style={{ pointerEvents: "none", fontFamily: "ui-monospace, monospace" }}
                >
                  {truncate(n.label, 30)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px] mono text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded border border-border/60">
        <span>{filtered.nodes.length} nodes</span>
        <span>·</span>
        <span>{filtered.edges.length} edges</span>
        <span>·</span>
        <span>{Math.round(cam.scale * 100)}%</span>
      </div>
      <div className="absolute top-3 right-3 flex gap-1">
        <ZoomBtn onClick={() => setCam((c) => ({ ...c, scale: Math.min(3, c.scale * 1.2) }))}>+</ZoomBtn>
        <ZoomBtn onClick={() => setCam((c) => ({ ...c, scale: Math.max(0.15, c.scale / 1.2) }))}>−</ZoomBtn>
        <ZoomBtn onClick={() => setCam({ x: 0, y: 0, scale: 0.7 })}>⌂</ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 w-7 rounded border border-border/60 bg-background/80 backdrop-blur mono text-sm",
        "hover:bg-muted/40 hover:border-primary/40 transition-colors",
      )}
    >
      {children}
    </button>
  );
}

function truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + "…"; }

export { NODE_KIND_LABELS };

/**
 * Attack Path canvas — renders steps in dependency order as a linked flow.
 * Pure SVG, no external graph libs. Each step is a card; edges reflect
 * step.prerequisites (or authored order as a fallback).
 */

import { useMemo } from "react";
import type { AttackPath, AttackStep } from "@/lib/attackpath/types";
import { STEP_KIND_COLORS, STEP_KIND_LABELS } from "@/lib/attackpath/types";
import { dependencyEdges, topoOrder } from "@/lib/attackpath/analyze";

interface Props {
  path: AttackPath;
  selectedStepId?: string;
  onSelectStep: (id: string | undefined) => void;
  height?: number;
}

const COL_W = 260;
const ROW_H = 140;
const PAD_X = 30;
const PAD_Y = 30;

export function AttackPathCanvas({ path, selectedStepId, onSelectStep, height = 520 }: Props) {
  const ordered = useMemo(() => topoOrder(path.steps), [path.steps]);
  const edges = useMemo(() => dependencyEdges(path.steps), [path.steps]);

  // Assign a lane per branch: BFS from roots, breaking rows when a step
  // depends on multiple predecessors.
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const byRow = new Map<number, number>();
    const rowOf = new Map<string, number>();
    ordered.forEach((s, i) => {
      // Row: max(pred rows) + 1
      const preds = s.prerequisites.filter((p) => rowOf.has(p));
      const row = preds.length ? Math.max(...preds.map((p) => rowOf.get(p)!)) + 1 : 0;
      const col = byRow.get(row) ?? 0;
      byRow.set(row, col + 1);
      rowOf.set(s.id, row);
      pos.set(s.id, { x: PAD_X + col * COL_W, y: PAD_Y + row * ROW_H });
      // Sequential fallback: ensure step i has row >= i's linear index for readability
      if (preds.length === 0 && i > 0 && !s.prerequisites.length) {
        // keep default
      }
    });
    return pos;
  }, [ordered]);

  const width = Math.max(
    600,
    PAD_X * 2 + COL_W * (Math.max(1, ...[...(new Map<number, number>()).values()])),
  );
  const canvasW = Math.max(
    900,
    PAD_X * 2 + COL_W * countMaxCol(positions),
  );
  const canvasH = Math.max(height, PAD_Y * 2 + ROW_H * countMaxRow(positions));

  return (
    <div className="relative w-full rounded-lg border border-border/60 bg-background/50 overflow-auto" style={{ height }}>
      <svg width={canvasW} height={canvasH} className="block">
        <defs>
          <marker id="ap-arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = positions.get(e.from); const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + COL_W / 2 - 20; const y1 = a.y + ROW_H - 30;
          const x2 = b.x + COL_W / 2 - 20; const y2 = b.y + 10;
          const mx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
          return <path key={i} d={d} stroke="hsl(var(--muted-foreground) / 0.55)" strokeWidth={1.5} fill="none" markerEnd="url(#ap-arr)" />;
        })}

        {ordered.map((s) => {
          const p = positions.get(s.id); if (!p) return null;
          const color = STEP_KIND_COLORS[s.kind];
          const selected = selectedStepId === s.id;
          return (
            <g key={s.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: "pointer" }} onClick={() => onSelectStep(s.id)}>
              <rect
                width={COL_W - 40} height={ROW_H - 40}
                rx={10} ry={10}
                fill="hsl(var(--card))"
                stroke={selected ? "hsl(var(--foreground))" : color}
                strokeWidth={selected ? 2 : 1.2}
              />
              <rect width={COL_W - 40} height={4} rx={2} ry={2} fill={color} />
              <text x={12} y={26} fontSize={10} fill={color} style={{ fontFamily: "ui-monospace, monospace", textTransform: "uppercase", letterSpacing: 1 }}>
                {STEP_KIND_LABELS[s.kind]}
              </text>
              <text x={12} y={46} fontSize={13} fill="hsl(var(--foreground))" style={{ fontWeight: 600 }}>
                {truncate(s.title, 28)}
              </text>
              {s.trustBefore || s.trustAfter ? (
                <text x={12} y={64} fontSize={10} fill="hsl(var(--muted-foreground))" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {(s.trustBefore ?? "—")} → {(s.trustAfter ?? "—")}
                </text>
              ) : null}
              <text x={12} y={82} fontSize={10} fill="hsl(var(--muted-foreground))">
                {s.attachments.length} attach · {s.tags.length} tag
              </text>
            </g>
          );
        })}

        {ordered.length === 0 && (
          <text x={PAD_X} y={PAD_Y + 20} fontSize={12} fill="hsl(var(--muted-foreground))">
            No steps yet — add one from the sidebar or import a suggestion.
          </text>
        )}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n - 1) + "…"; }
function countMaxRow(pos: Map<string, { x: number; y: number }>) {
  let m = 1; for (const p of pos.values()) m = Math.max(m, Math.round((p.y - PAD_Y) / ROW_H) + 1); return m;
}
function countMaxCol(pos: Map<string, { x: number; y: number }>) {
  let m = 1; for (const p of pos.values()) m = Math.max(m, Math.round((p.x - PAD_X) / COL_W) + 1); return m;
}

export function inlineStepPreview(s: AttackStep) { return s.title; }

/**
 * Tiny presentation-only chart primitives (inline SVG). Kept in one file so
 * widgets stay lightweight and no chart dependency is added.
 */

import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  count: number;
  label?: string;
  hint?: string;
  onClick?: () => void;
}

export function HBarChart({ data, tone = "primary", max, className }: {
  data: BarDatum[];
  tone?: "primary" | "warning" | "danger" | "accent";
  max?: number;
  className?: string;
}) {
  if (!data.length) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No data</div>;
  }
  const peak = max ?? Math.max(...data.map((d) => d.count), 1);
  const toneCls =
    tone === "warning" ? "bg-amber-500/70 group-hover:bg-amber-400" :
    tone === "danger" ? "bg-rose-500/70 group-hover:bg-rose-400" :
    tone === "accent" ? "bg-accent/70 group-hover:bg-accent" :
    "bg-primary/70 group-hover:bg-primary";
  return (
    <div className={cn("space-y-1.5", className)}>
      {data.map((d) => {
        const w = Math.max(4, Math.round((d.count / peak) * 100));
        const Row = (
          <div className="group flex items-center gap-2 text-xs">
            <div className="w-28 truncate mono text-muted-foreground" title={d.label ?? d.key}>
              {d.label ?? d.key}
            </div>
            <div className="flex-1 h-4 bg-muted/20 rounded-sm overflow-hidden">
              <div
                className={cn("h-full rounded-sm transition-all", toneCls)}
                style={{ width: `${w}%` }}
              />
            </div>
            <div className="w-8 text-right mono text-[11px]">{d.count}</div>
          </div>
        );
        return d.onClick ? (
          <button key={d.key} type="button" onClick={d.onClick}
            title={d.hint} className="w-full text-left hover:opacity-90">
            {Row}
          </button>
        ) : (
          <div key={d.key} title={d.hint}>{Row}</div>
        );
      })}
    </div>
  );
}

export interface DonutSlice { key: string; value: number; color: string; label?: string }

export function Donut({ slices, size = 128, thickness = 14, centerLabel, centerValue }: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={thickness} fill="none" opacity={0.4} />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * c;
          const seg = (
            <circle
              key={s.key} cx={size / 2} cy={size / 2} r={r}
              stroke={s.color} strokeWidth={thickness} fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
        {total > 0 && (
          <text
            x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            className="fill-foreground display"
            style={{ fontSize: 18, fontWeight: 600, transform: "rotate(90deg)", transformOrigin: "50% 50%" }}
          >
            {centerValue ?? total}
          </text>
        )}
      </svg>
      <ul className="text-xs space-y-1 flex-1 min-w-0">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="capitalize truncate flex-1">{s.label ?? s.key}</span>
            <span className="mono text-muted-foreground">{s.value}</span>
          </li>
        ))}
        {centerLabel && <li className="text-[10px] mono uppercase tracking-widest text-muted-foreground pt-1">{centerLabel}</li>}
      </ul>
    </div>
  );
}

export function Sparkline({
  values, height = 44, color = "hsl(var(--primary))", fill = "hsl(var(--primary) / 0.15)",
}: { values: number[]; height?: number; color?: string; fill?: string }) {
  const w = 240;
  if (!values.length) return <div className="text-xs text-muted-foreground">No trend data.</div>;
  const max = Math.max(...values, 1);
  const stepX = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${height - (v / max) * (height - 6) - 3}`);
  const path = `M${points.join(" L")}`;
  const area = `${path} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type WidgetId =
  | "readiness"
  | "stats"
  | "nextActions"
  | "activity"
  | "topTags"
  | "links";

export interface WidgetMeta {
  id: WidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  span: "sm" | "md" | "lg";
}

export const WIDGETS: WidgetMeta[] = [
  { id: "readiness", label: "Readiness score", description: "Composite score + scope shortcuts", defaultEnabled: true, span: "lg" },
  { id: "stats", label: "Stat cards", description: "Checklist, assets, notes, findings", defaultEnabled: true, span: "lg" },
  { id: "nextActions", label: "Next best actions", description: "AI-derived recommendations", defaultEnabled: true, span: "md" },
  { id: "activity", label: "Recent activity", description: "Live workspace event stream", defaultEnabled: true, span: "sm" },
  { id: "topTags", label: "Top tags", description: "Cross-entity tag rollup", defaultEnabled: false, span: "sm" },
  { id: "links", label: "Recent links", description: "Latest cross-entity relationships", defaultEnabled: false, span: "sm" },
];

export interface DashboardConfig {
  order: WidgetId[];
  enabled: Record<WidgetId, boolean>;
}

export function defaultDashboardConfig(): DashboardConfig {
  const order = WIDGETS.map((w) => w.id);
  const enabled = Object.fromEntries(WIDGETS.map((w) => [w.id, w.defaultEnabled])) as Record<WidgetId, boolean>;
  return { order, enabled };
}

export function mergeDashboardConfig(cfg: Partial<DashboardConfig> | undefined | null): DashboardConfig {
  const base = defaultDashboardConfig();
  if (!cfg) return base;
  const order: WidgetId[] = [];
  const seen = new Set<WidgetId>();
  for (const id of cfg.order ?? []) {
    if (base.enabled[id] !== undefined && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of base.order) if (!seen.has(id)) order.push(id);
  return {
    order,
    enabled: { ...base.enabled, ...(cfg.enabled ?? {}) },
  };
}

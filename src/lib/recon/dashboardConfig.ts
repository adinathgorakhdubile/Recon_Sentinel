import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setMeta } from "@/lib/db";

export type ReconWidgetId =
  | "completeness"
  | "totals"
  | "stages"
  | "coverage"
  | "risk"
  | "health"
  | "growth"
  | "technologies"
  | "ports"
  | "services"
  | "topHosts"
  | "dns"
  | "vuln"
  | "runs"
  | "activity";

export interface ReconWidgetMeta {
  id: ReconWidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const RECON_WIDGETS: ReconWidgetMeta[] = [
  { id: "completeness", label: "Completeness score", description: "Composite recon depth score", defaultEnabled: true },
  { id: "totals", label: "Headline metrics", description: "Assets, intel, runs, ports", defaultEnabled: true },
  { id: "stages", label: "Pipeline stages", description: "Per-stage progress and last activity", defaultEnabled: true },
  { id: "coverage", label: "Scope coverage", description: "In / out / unknown scope split", defaultEnabled: true },
  { id: "risk", label: "Risk distribution", description: "Assets bucketed by risk band", defaultEnabled: true },
  { id: "health", label: "Asset health", description: "HTTP live/auth/error/dead", defaultEnabled: true },
  { id: "growth", label: "Asset growth", description: "14-day intake trend", defaultEnabled: true },
  { id: "technologies", label: "Technology distribution", description: "Top detected technologies", defaultEnabled: true },
  { id: "ports", label: "Exposed ports", description: "Top open ports across surface", defaultEnabled: true },
  { id: "services", label: "Services", description: "Detected service products", defaultEnabled: false },
  { id: "topHosts", label: "Busiest hosts", description: "Hosts with the most endpoints", defaultEnabled: true },
  { id: "dns", label: "DNS insights", description: "Parent domains, records, certs", defaultEnabled: true },
  { id: "vuln", label: "Vulnerability summary", description: "Findings + nuclei severities", defaultEnabled: true },
  { id: "runs", label: "Import history", description: "Recent recon runs", defaultEnabled: true },
  { id: "activity", label: "Activity timeline", description: "Latest workspace events", defaultEnabled: true },
];

export interface ReconDashboardLayout {
  id: string;
  name: string;
  order: ReconWidgetId[];
  enabled: Record<ReconWidgetId, boolean>;
}

export interface ReconDashboardConfig {
  activeLayoutId: string;
  layouts: ReconDashboardLayout[];
}

const META_KEY = "reconDashboardConfig";

export function defaultLayout(id = "default", name = "Default"): ReconDashboardLayout {
  const order = RECON_WIDGETS.map((w) => w.id);
  const enabled = Object.fromEntries(RECON_WIDGETS.map((w) => [w.id, w.defaultEnabled])) as Record<ReconWidgetId, boolean>;
  return { id, name, order, enabled };
}

function defaultConfig(): ReconDashboardConfig {
  return { activeLayoutId: "default", layouts: [defaultLayout()] };
}

function merge(cfg: Partial<ReconDashboardConfig> | undefined | null): ReconDashboardConfig {
  const base = defaultConfig();
  if (!cfg?.layouts?.length) return base;
  const layouts = cfg.layouts.map((l) => {
    const baseL = defaultLayout(l.id, l.name);
    const order: ReconWidgetId[] = [];
    const seen = new Set<ReconWidgetId>();
    for (const id of l.order ?? []) {
      if (baseL.enabled[id] !== undefined && !seen.has(id)) { order.push(id); seen.add(id); }
    }
    for (const id of baseL.order) if (!seen.has(id)) order.push(id);
    return {
      id: l.id,
      name: l.name,
      order,
      enabled: { ...baseL.enabled, ...(l.enabled ?? {}) },
    };
  });
  const activeLayoutId = layouts.find((l) => l.id === cfg.activeLayoutId)?.id ?? layouts[0].id;
  return { activeLayoutId, layouts };
}

export function useReconDashboardConfig(): {
  config: ReconDashboardConfig;
  active: ReconDashboardLayout;
  setActive: (id: string) => void;
  updateActive: (patch: Partial<ReconDashboardLayout>) => void;
  saveAs: (name: string) => void;
  removeLayout: (id: string) => void;
  reset: () => void;
} {
  const row = useLiveQuery(() => db.meta.get(META_KEY), [], undefined);
  const config = useMemo(() => merge(row?.value as Partial<ReconDashboardConfig> | undefined), [row]);
  const active = config.layouts.find((l) => l.id === config.activeLayoutId) ?? config.layouts[0];

  const persist = (next: ReconDashboardConfig) => { setMeta(META_KEY, next); };

  return {
    config,
    active,
    setActive: (id) => persist({ ...config, activeLayoutId: id }),
    updateActive: (patch) => {
      const layouts = config.layouts.map((l) => l.id === active.id ? { ...l, ...patch } : l);
      persist({ ...config, layouts });
    },
    saveAs: (name) => {
      const id = `layout_${Date.now().toString(36)}`;
      const layouts = [...config.layouts, { ...active, id, name }];
      persist({ activeLayoutId: id, layouts });
    },
    removeLayout: (id) => {
      if (id === "default") return;
      const layouts = config.layouts.filter((l) => l.id !== id);
      const activeLayoutId = config.activeLayoutId === id ? "default" : config.activeLayoutId;
      persist({ activeLayoutId, layouts: layouts.length ? layouts : [defaultLayout()] });
    },
    reset: () => persist(defaultConfig()),
  };
}

export function toggleWidget(layout: ReconDashboardLayout, id: ReconWidgetId): ReconDashboardLayout {
  return { ...layout, enabled: { ...layout.enabled, [id]: !layout.enabled[id] } };
}

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, META_KEYS, setMeta } from "@/lib/db";
import { defaultDashboardConfig, mergeDashboardConfig, type DashboardConfig, type WidgetId } from "@/lib/dashboard";

export function useDashboardConfig(): [DashboardConfig, (patch: Partial<DashboardConfig>) => void, () => void] {
  const row = useLiveQuery(() => db.meta.get(META_KEYS.dashboardConfig), [], undefined);
  const config = useMemo(
    () => mergeDashboardConfig(row?.value as Partial<DashboardConfig> | undefined),
    [row],
  );

  const update = (patch: Partial<DashboardConfig>) => {
    const next = mergeDashboardConfig({ ...config, ...patch });
    setMeta(META_KEYS.dashboardConfig, next);
  };
  const reset = () => {
    setMeta(META_KEYS.dashboardConfig, defaultDashboardConfig());
  };
  return [config, update, reset];
}

export function toggleWidget(cfg: DashboardConfig, id: WidgetId): DashboardConfig {
  return { ...cfg, enabled: { ...cfg.enabled, [id]: !cfg.enabled[id] } };
}

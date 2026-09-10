import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Upload, RefreshCw, Radar, Play, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context/WorkspaceContext";
import { db } from "@/lib/db";
import { buildReconAnalytics } from "@/lib/recon/analytics";
import type { AssetIntel } from "@/lib/assets/intel";
import type { ReconRun } from "@/lib/recon/types";
import { ScanImportDialog } from "@/components/ScanImportDialog";
import { ReconCustomizeDialog } from "@/components/recon/CustomizeDialog";
import { useReconDashboardConfig, type ReconWidgetId } from "@/lib/recon/dashboardConfig";
import {
  CompletenessWidget, TotalsWidget, StagesWidget, CoverageWidget, RiskWidget,
  HealthWidget, GrowthWidget, TechnologiesWidget, PortsWidget, ServicesWidget,
  TopHostsWidget, DnsWidget, VulnWidget, RunsWidget, ActivityTimelineWidget,
} from "@/components/recon/widgets";
import { Link } from "react-router-dom";

const SPAN: Record<ReconWidgetId, string> = {
  completeness: "md:col-span-6",
  totals: "md:col-span-6",
  stages: "md:col-span-12",
  coverage: "md:col-span-4",
  risk: "md:col-span-4",
  health: "md:col-span-4",
  growth: "md:col-span-6",
  vuln: "md:col-span-6",
  technologies: "md:col-span-4",
  ports: "md:col-span-4",
  services: "md:col-span-4",
  topHosts: "md:col-span-6",
  dns: "md:col-span-6",
  runs: "md:col-span-6",
  activity: "md:col-span-6",
};

export default function ReconCenterPage() {
  return (
    <EmptyProgramGate>
      <ReconCenterInner />
    </EmptyProgramGate>
  );
}

function ReconCenterInner() {
  const { activeProgram, assets, findings } = useWorkspace();
  const program = activeProgram!;
  const [openImport, setOpenImport] = useState(false);

  const intels = useLiveQuery(
    () => db.assetIntel.where("programId").equals(program.id).toArray(),
    [program.id],
    [] as AssetIntel[],
  ) ?? [];

  const runs = useLiveQuery(
    () => db.reconRuns.where("programId").equals(program.id).toArray(),
    [program.id],
    [] as ReconRun[],
  ) ?? [];

  const analytics = useMemo(
    () => buildReconAnalytics(program, assets, intels, runs, findings),
    [program, assets, intels, runs, findings],
  );

  const { active } = useReconDashboardConfig();
  const enabledOrder = active.order.filter((id) => active.enabled[id]);

  const scopeReady = program.inScope.length > 0 || !!program.targetRoot;

  const renderWidget = (id: ReconWidgetId) => {
    switch (id) {
      case "completeness": return <CompletenessWidget a={analytics} />;
      case "totals": return <TotalsWidget a={analytics} />;
      case "stages": return <StagesWidget a={analytics} />;
      case "coverage": return <CoverageWidget a={analytics} />;
      case "risk": return <RiskWidget a={analytics} />;
      case "health": return <HealthWidget a={analytics} />;
      case "growth": return <GrowthWidget a={analytics} />;
      case "technologies": return <TechnologiesWidget a={analytics} />;
      case "ports": return <PortsWidget a={analytics} />;
      case "services": return <ServicesWidget a={analytics} />;
      case "topHosts": return <TopHostsWidget a={analytics} />;
      case "dns": return <DnsWidget a={analytics} />;
      case "vuln": return <VulnWidget a={analytics} />;
      case "runs": return <RunsWidget a={analytics} />;
      case "activity": return <ActivityTimelineWidget programId={program.id} />;
      default: return null;
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="Recon Center"
        actions={
          <div className="flex items-center gap-2">
            <ReconCustomizeDialog />
            <Link to="/recon">
              <Button variant="outline" size="sm">
                <Play className="h-3.5 w-3.5 mr-2" /> Pipeline
              </Button>
            </Link>
            <Button size="sm" onClick={() => setOpenImport(true)}>
              <Upload className="h-3.5 w-3.5 mr-2" /> Import
            </Button>
          </div>
        }
      />

      {!scopeReady && (
        <div className="panel p-3 mb-4 border-warning/40 bg-warning/10 flex items-start gap-3 text-xs">
          <ShieldAlert className="h-4 w-4 text-warning mt-0.5" />
          <div>
            Configure scope so pipeline imports can be validated. The dashboard renders anyway using
            best-effort classification.
          </div>
        </div>
      )}

      {analytics.totals.assets === 0 ? (
        <EmptyState onImport={() => setOpenImport(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-min">
          {enabledOrder.map((id) => (
            <div key={id} className={SPAN[id]}>
              {renderWidget(id)}
            </div>
          ))}
        </div>
      )}

      <ScanImportDialog open={openImport} onOpenChange={setOpenImport} presetStage={null} />
    </>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="panel p-12 text-center">
      <Radar className="h-10 w-10 text-primary mx-auto mb-4" />
      <div className="display text-xl font-semibold mb-1">Recon Center is ready</div>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
        Import reconnaissance output (subfinder, httpx, nuclei, nmap, katana, ffuf…) to seed
        the workspace. Widgets, coverage, risk and technology analytics come online automatically.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={onImport}><Upload className="h-4 w-4 mr-2" /> Import output</Button>
        <Link to="/recon"><Button variant="outline"><RefreshCw className="h-4 w-4 mr-2" /> Open pipeline</Button></Link>
      </div>
    </div>
  );
}

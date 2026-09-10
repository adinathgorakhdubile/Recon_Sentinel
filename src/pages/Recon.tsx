import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Waves, Upload, Play, ShieldAlert, ShieldCheck, HelpCircle, Radar, Layers, Activity, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import { STAGES, importersForStage, importerById } from "@/lib/recon/importers";
import { stageStatsForProgram, summarizeCoverage } from "@/lib/recon/pipeline";
import type { ReconRun, ReconStageId } from "@/lib/recon/types";
import { ScanImportDialog } from "@/components/ScanImportDialog";

export default function ReconPage() {
  return (
    <EmptyProgramGate>
      <ReconInner />
    </EmptyProgramGate>
  );
}

function ReconInner() {
  const { activeProgram, assets } = useWorkspace();
  const program = activeProgram!;
  const [openImport, setOpenImport] = useState(false);
  const [presetStage, setPresetStage] = useState<ReconStageId | null>(null);

  const runs = useLiveQuery(
    () => db.reconRuns.where("programId").equals(program.id).reverse().sortBy("createdAt"),
    [program.id],
    [] as ReconRun[],
  ) ?? [];

  const stageStats = useLiveQuery(
    () => stageStatsForProgram(program.id),
    [program.id, runs.length],
    {} as Record<string, Awaited<ReturnType<typeof stageStatsForProgram>>[string]>,
  ) ?? {};

  const coverage = useMemo(() => summarizeCoverage(program, assets), [program, assets]);

  const scopeReady = program.inScope.length > 0 || !!program.targetRoot;

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Recon Pipeline"
        actions={
          <Button onClick={() => { setPresetStage(null); setOpenImport(true); }}>
            <Upload className="h-4 w-4 mr-2" /> Import output
          </Button>
        }
      />

      {!scopeReady && (
        <div className="panel p-4 mb-6 border-warning/40 bg-warning/10 flex items-start gap-3 text-sm">
          <ShieldAlert className="h-5 w-5 text-warning mt-0.5" />
          <div>
            <div className="font-medium mb-0.5">Scope not configured</div>
            <p className="text-muted-foreground">
              Add in-scope and out-of-scope patterns before importing so the pipeline can validate each asset.
              Imports still run; unknown-scope items land as <span className="mono">triaging</span>.
            </p>
          </div>
        </div>
      )}

      {/* Coverage summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total assets" value={coverage.totalAssets} icon={Layers} />
        <StatCard label="In-scope" value={coverage.inScope} tone="primary" icon={ShieldCheck} />
        <StatCard label="Out-of-scope" value={coverage.outOfScope} tone="destructive" icon={ShieldAlert} />
        <StatCard label="Unknown" value={coverage.unknown} tone="muted" icon={HelpCircle} />
        <StatCard label="Subdomains" value={coverage.subdomains} icon={Radar} />
        <StatCard label="Endpoints" value={coverage.endpoints} icon={Waves} />
      </div>

      {/* Stage grid */}
      <div className="mb-6">
        <SectionHeader title="Stages" subtitle="Modular reconnaissance phases. Each stage accepts importers; tool execution modules plug into the same registry." />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STAGES.map((s) => {
            const stats = stageStats[s.id];
            return (
              <div key={s.id} className="panel p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.id}</div>
                    <div className="display text-base font-semibold">{s.name}</div>
                  </div>
                  <StageStatusDot lastRunAt={stats?.lastRunAt ?? null} imported={stats?.imported ?? 0} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed min-h-[3rem]">{s.description}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Runs" value={stats?.runs ?? 0} />
                  <MiniStat label="Imported" value={stats?.imported ?? 0} />
                  <MiniStat label="Dup" value={stats?.duplicates ?? 0} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {importersForStage(s.id).map((imp) => (
                    <span key={imp.id} className="chip text-[10px] mono">{imp.id}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[10px] mono text-muted-foreground">
                    {stats?.lastRunAt ? `last · ${formatDistanceToNow(stats.lastRunAt, { addSuffix: true })}` : "no runs yet"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setPresetStage(s.id); setOpenImport(true); }}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" /> Import
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Runs */}
      <div>
        <SectionHeader title="Recent runs" subtitle="Every import is recorded with parse / dedup / scope stats. Deleting a run keeps the assets it imported." />
        {runs.length === 0 ? (
          <div className="panel p-10 text-center">
            <Activity className="h-8 w-8 text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No runs yet. Import a subfinder/httpx/naabu file, a hostlist txt, or an assets CSV to seed the pipeline.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_0.9fr_0.7fr_2fr_auto] gap-3 px-4 py-2.5 mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/60 bg-muted/20">
              <div>File</div><div>Importer</div><div>Stage</div><div>Stats</div><div>When</div>
            </div>
            <ul>
              {runs.map((r) => {
                const imp = importerById(r.importerId);
                return (
                  <li key={r.id} className="grid grid-cols-1 md:grid-cols-[1fr_0.9fr_0.7fr_2fr_auto] gap-3 px-4 py-3 border-b border-border/40 items-center text-sm">
                    <div className="min-w-0">
                      <div className="mono truncate">{r.filename}</div>
                      {r.sample.length > 0 && (
                        <div className="text-[11px] text-muted-foreground truncate mono">{r.sample.join(" · ")}</div>
                      )}
                    </div>
                    <div className="text-xs">{imp?.name ?? r.importerId}</div>
                    <div className="chip text-[10px] w-fit">{r.stage}</div>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      <span className="chip text-emerald-300 border-emerald-500/30">+{r.stats.imported}</span>
                      <span className="chip">parsed {r.stats.parsed}</span>
                      <span className="chip">dup {r.stats.duplicates}</span>
                      <span className="chip text-rose-300 border-rose-500/30">oos {r.stats.outOfScope}</span>
                      {r.stats.invalid > 0 && <span className="chip">invalid {r.stats.invalid}</span>}
                      {r.stats.errors && r.stats.errors.length > 0 && (
                        <span
                          className="chip text-amber-300 border-amber-500/40 inline-flex items-center gap-1"
                          title={r.stats.errors.slice(0, 5).join("\n")}
                        >
                          <AlertTriangle className="h-3 w-3" /> {r.stats.errors.length} parser
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mono whitespace-nowrap">
                      {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <ScanImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        presetStage={presetStage}
      />
    </>
  );
}


function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="display text-lg font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function StatCard({
  label, value, tone, icon: Icon,
}: { label: string; value: number; tone?: "primary"|"destructive"|"muted"; icon: any }) {
  const toneClass =
    tone === "primary" ? "text-primary border-primary/30 bg-primary/5"
    : tone === "destructive" ? "text-rose-300 border-rose-500/30 bg-rose-500/5"
    : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className={`panel p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
      <div className="display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border/50 bg-muted/10 py-1">
      <div className="text-sm font-semibold">{value}</div>
      <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function StageStatusDot({ lastRunAt, imported }: { lastRunAt: number | null; imported: number }) {
  if (!lastRunAt) return <span className="chip text-[10px]">idle</span>;
  const fresh = Date.now() - lastRunAt < 1000 * 60 * 60 * 24 * 7;
  return (
    <span className={`chip text-[10px] ${fresh ? "text-emerald-300 border-emerald-500/40" : "text-muted-foreground"}`}>
      {imported > 0 ? "active" : "ran"}
    </span>
  );
}

/**
 * Recon Intelligence Center widgets. Every widget is a small, self-contained
 * card that consumes a slice of `ReconAnalytics` and links back to the
 * underlying pipeline stage, asset explorer filter, or findings page.
 */

import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, AlertTriangle, ArrowRight, Bug, Database, Globe, Layers,
  Network, Radar, ServerCog, ShieldAlert, ShieldCheck, Waves,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ActivityEvent } from "@/lib/db";
import { importerById } from "@/lib/recon/importers";
import type { ReconAnalytics } from "@/lib/recon/analytics";
import { HBarChart, Donut, Sparkline } from "./charts";

// -----------------------------------------------------------------------
// Shared card shell
// -----------------------------------------------------------------------

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  children: React.ReactNode;
}

function Card({ title, subtitle, icon: Icon, actionHref, actionLabel, className, children }: CardProps) {
  return (
    <div className={`panel p-5 h-full flex flex-col ${className ?? ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-primary" />}
            <h3 className="display text-base font-semibold">{title}</h3>
          </div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {actionHref && (
          <Link
            to={actionHref}
            className="text-[11px] mono text-primary hover:underline flex items-center gap-1"
          >
            {actionLabel ?? "Open"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone?: "primary" | "warning" | "danger" | "muted" }) {
  const cls =
    tone === "primary" ? "text-primary" :
    tone === "warning" ? "text-amber-300" :
    tone === "danger" ? "text-rose-300" :
    tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="rounded border border-border/50 bg-muted/10 p-2 text-center">
      <div className={`display text-lg font-semibold ${cls}`}>{value}</div>
      <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Widgets
// -----------------------------------------------------------------------

export function CompletenessWidget({ a }: { a: ReconAnalytics }) {
  const { score, label, reasons } = a.completeness;
  const size = 128;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <Card title="Recon completeness" subtitle="Composite depth across scope, stages and enrichment" icon={Radar}>
      <div className="grid grid-cols-[auto_1fr] gap-5 items-center">
        <div className="relative">
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }} />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
              className="fill-foreground display"
              style={{ fontSize: 26, fontWeight: 600, transform: "rotate(90deg)", transformOrigin: "50% 50%" }}>
              {score}
            </text>
          </svg>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-primary/80 mb-0.5">Depth tier</div>
          <div className="display text-xl font-semibold mb-2">{label}</div>
          <ul className="text-[11px] text-muted-foreground space-y-0.5">
            {reasons.slice(0, 5).map((r) => <li key={r}>· {r}</li>)}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function TotalsWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="Headline metrics" icon={Layers}>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Assets" value={a.totals.assets} tone="primary" />
        <MiniStat label="Endpoints" value={a.totals.endpoints} />
        <MiniStat label="Subdomains" value={a.coverage.subdomains} />
        <MiniStat label="Ports" value={a.totals.exposedPorts} />
        <MiniStat label="Tech" value={a.totals.technologies} />
        <MiniStat label="Runs" value={a.totals.runs} tone="muted" />
      </div>
    </Card>
  );
}

export function StagesWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="Pipeline stages" subtitle="Click a stage to jump to the pipeline" icon={Waves} actionHref="/recon" actionLabel="Pipeline">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {a.stages.map((s) => {
          const tone =
            s.status === "active" ? "border-emerald-500/40 bg-emerald-500/5" :
            s.status === "seeded" ? "border-primary/30 bg-primary/5" :
            "border-border/50 bg-muted/10";
          const dot =
            s.status === "active" ? "bg-emerald-400" :
            s.status === "seeded" ? "bg-primary" : "bg-muted-foreground/60";
          return (
            <Link to="/recon" key={s.id} className={`rounded border p-2.5 hover:border-primary/40 transition-colors ${tone}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.id}</div>
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              </div>
              <div className="text-xs font-medium truncate">{s.name}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] mono text-muted-foreground">
                <span>{s.runs} run{s.runs === 1 ? "" : "s"} · +{s.imported}</span>
                <span>{s.lastRunAt ? formatDistanceToNow(s.lastRunAt, { addSuffix: true }) : "idle"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export function CoverageWidget({ a }: { a: ReconAnalytics }) {
  const total = a.coverage.totalAssets || 1;
  const slices = [
    { key: "inScope", value: a.coverage.inScope, color: "hsl(var(--primary))", label: "In-scope" },
    { key: "outOfScope", value: a.coverage.outOfScope, color: "hsl(0 75% 60%)", label: "Out-of-scope" },
    { key: "unknown", value: a.coverage.unknown, color: "hsl(var(--muted-foreground))", label: "Unknown" },
  ];
  const pct = Math.round((a.coverage.inScope / total) * 100);
  return (
    <Card title="Scope coverage" subtitle={`${pct}% in-scope`} icon={ShieldCheck} actionHref="/scope" actionLabel="Scope">
      <Donut slices={slices} centerValue={total} centerLabel="assets" />
    </Card>
  );
}

export function RiskWidget({ a }: { a: ReconAnalytics }) {
  const nav = useNavigate();
  const rows = [
    { key: "critical", count: a.risk.critical, hint: "risk ≥ 75" },
    { key: "high", count: a.risk.high, hint: "risk 50–74" },
    { key: "medium", count: a.risk.medium, hint: "risk 25–49" },
    { key: "low", count: a.risk.low, hint: "risk 10–24" },
    { key: "info", count: a.risk.info, hint: "risk < 10" },
  ];
  return (
    <Card title="Risk distribution" subtitle="Derived per-asset risk score" icon={ShieldAlert} actionHref="/asset-intel" actionLabel="Explore">
      <HBarChart tone="danger" data={rows.map((r) => ({
        key: r.key, count: r.count, hint: r.hint,
        onClick: () => nav(`/asset-intel?risk=${r.key}`),
      }))} />
    </Card>
  );
}

export function HealthWidget({ a }: { a: ReconAnalytics }) {
  const nav = useNavigate();
  const rows = [
    { key: "live", count: a.health.live },
    { key: "redirect", count: a.health.redirect },
    { key: "auth", count: a.health.auth },
    { key: "error", count: a.health.error },
    { key: "dead", count: a.health.dead },
    { key: "unknown", count: a.health.unknown },
  ];
  return (
    <Card title="Asset health" subtitle="HTTP + service reachability" icon={Activity} actionHref="/asset-intel" actionLabel="Explore">
      <HBarChart tone="accent" data={rows.map((r) => ({
        key: r.key, count: r.count,
        onClick: () => nav(`/asset-intel?health=${r.key}`),
      }))} />
    </Card>
  );
}

export function GrowthWidget({ a }: { a: ReconAnalytics }) {
  const last = a.growth[a.growth.length - 1];
  const delta = a.growth.reduce((sum, p) => sum + p.assets, 0);
  return (
    <Card title="Asset growth" subtitle={`+${delta} in 14d · ${last?.cumulative ?? 0} total`} icon={Network}>
      <Sparkline values={a.growth.map((p) => p.cumulative)} />
      <div className="mt-2 flex items-center justify-between text-[10px] mono text-muted-foreground">
        <span>{a.growth[0]?.day}</span>
        <span>{last?.day}</span>
      </div>
    </Card>
  );
}

export function TechnologiesWidget({ a }: { a: ReconAnalytics }) {
  const nav = useNavigate();
  return (
    <Card title="Technology distribution" subtitle="Fingerprints across enriched assets" icon={ServerCog} actionHref="/asset-intel" actionLabel="Filter">
      <HBarChart data={a.technologies.slice(0, 8).map((b) => ({
        key: b.key, count: b.count,
        onClick: () => nav(`/asset-intel?tech=${encodeURIComponent(b.key)}`),
      }))} />
    </Card>
  );
}

export function PortsWidget({ a }: { a: ReconAnalytics }) {
  const nav = useNavigate();
  return (
    <Card title="Exposed ports" subtitle="Ports observed across services" icon={Network} actionHref="/asset-intel" actionLabel="Filter">
      <HBarChart tone="warning" data={a.ports.slice(0, 8).map((b) => ({
        key: b.key, label: `port ${b.key}`, count: b.count,
        onClick: () => nav(`/asset-intel?port=${b.key}`),
      }))} />
    </Card>
  );
}

export function ServicesWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="Services" subtitle="Detected product / service banners" icon={Database} actionHref="/asset-intel">
      <HBarChart tone="accent" data={a.services.map((b) => ({ key: b.key, count: b.count }))} />
    </Card>
  );
}

export function TopHostsWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="Busiest hosts" subtitle="Hosts with the most endpoints" icon={Globe} actionHref="/asset-intel">
      <HBarChart data={a.topHosts.map((b) => ({ key: b.key, count: b.count }))} />
    </Card>
  );
}

export function DnsWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="DNS insights" subtitle="Parent domains and record depth" icon={Globe} actionHref="/asset-intel">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label="Parents" value={a.dns.parents.length} tone="primary" />
        <MiniStat label="Records" value={a.dns.totalDnsRecords} />
        <MiniStat label="Certs" value={a.dns.certificates} />
      </div>
      <HBarChart data={a.dns.parents.map((b) => ({ key: b.key, count: b.count }))} />
    </Card>
  );
}

export function VulnWidget({ a }: { a: ReconAnalytics }) {
  const nav = useNavigate();
  const s = a.vuln.bySeverity;
  const slices = [
    { key: "critical", value: s.critical, color: "hsl(0 80% 55%)" },
    { key: "high", value: s.high, color: "hsl(20 85% 55%)" },
    { key: "medium", value: s.medium, color: "hsl(40 90% 55%)" },
    { key: "low", value: s.low, color: "hsl(200 70% 55%)" },
    { key: "info", value: s.info, color: "hsl(var(--muted-foreground))" },
  ];
  return (
    <Card title="Vulnerability summary" subtitle={`${a.vuln.open} open · ${a.vuln.total} tracked`} icon={Bug} actionHref="/findings" actionLabel="Findings">
      <Donut slices={slices} centerValue={a.vuln.total} centerLabel="total" />
      <div className="mt-3 text-[11px] text-muted-foreground mono">
        {a.vuln.fromFindings} findings · {a.vuln.fromTags} tagged assets
      </div>
      <button
        type="button"
        onClick={() => nav("/findings")}
        className="mt-2 text-[11px] mono text-primary hover:underline"
      >
        Drill into findings →
      </button>
    </Card>
  );
}

export function RunsWidget({ a }: { a: ReconAnalytics }) {
  return (
    <Card title="Import history" subtitle="Latest recon pipeline runs" icon={Waves} actionHref="/recon" actionLabel="All runs">
      {a.recentRuns.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No imports yet. Drop a subfinder/httpx/nuclei output on the pipeline to seed the workspace.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {a.recentRuns.slice(0, 6).map((r) => {
            const imp = importerById(r.importerId);
            const hasErrors = (r.stats.errors?.length ?? 0) > 0;
            return (
              <li key={r.id} className="py-2 flex items-center gap-2 text-xs">
                <span className="chip text-[10px]">{r.stage}</span>
                <div className="flex-1 min-w-0">
                  <div className="mono truncate">{r.filename}</div>
                  <div className="text-[10px] text-muted-foreground mono">
                    {imp?.name ?? r.importerId} · {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                  </div>
                </div>
                <span className="chip text-[10px] text-emerald-300 border-emerald-500/30">+{r.stats.imported}</span>
                {hasErrors && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-label="parser warnings" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ActivityTimelineWidget({ programId }: { programId: string | null }) {
  const events = useLiveQuery(async () => {
    const rows = await db.activity.orderBy("ts").reverse().limit(60).toArray();
    return programId ? rows.filter((r) => r.programId === programId || r.programId === null) : rows;
  }, [programId], [] as ActivityEvent[]) ?? [];
  const items = events.slice(0, 8);
  return (
    <Card title="Activity timeline" subtitle="Latest workspace events" icon={Activity} actionHref="/history" actionLabel="Full history">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">No activity yet.</div>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase mono text-muted-foreground tracking-widest">
                  {e.entityType} · {e.action}
                </div>
                <div className="truncate text-xs">{e.summary}</div>
                <div className="text-[10px] mono text-muted-foreground/70">
                  {formatDistanceToNow(e.ts, { addSuffix: true })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

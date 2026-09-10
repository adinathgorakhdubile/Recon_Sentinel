/**
 * Recon analytics — pure functions that turn raw workspace state into
 * dashboard-ready aggregations. Kept UI-agnostic so widgets can be reshuffled
 * or future AI features can consume the same shapes.
 */

import type { Asset, Finding, Program } from "@/types";
import type { AssetIntel, AssetHealth } from "@/lib/assets/intel";
import type { ReconRun, ReconStageId } from "./types";
import { STAGES } from "./importers";
import { summarizeCoverage, type CoverageSummary } from "./pipeline";

export interface Bucket {
  key: string;
  count: number;
  meta?: Record<string, unknown>;
}

export interface HealthBreakdown {
  live: number;
  redirect: number;
  auth: number;
  error: number;
  dead: number;
  unknown: number;
}

export interface RiskBreakdown {
  info: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface StageProgress {
  id: ReconStageId;
  name: string;
  description: string;
  runs: number;
  imported: number;
  lastRunAt: number | null;
  status: "idle" | "seeded" | "active";
}

export interface GrowthPoint {
  day: string; // YYYY-MM-DD
  ts: number;
  assets: number;
  cumulative: number;
}

export interface VulnSummary {
  bySeverity: RiskBreakdown;
  total: number;
  open: number;
  fromFindings: number;
  fromTags: number;
}

export interface DnsInsights {
  parents: Bucket[];
  totalSubdomains: number;
  totalDnsRecords: number;
  certificates: number;
}

export interface ReconAnalytics {
  coverage: CoverageSummary;
  completeness: { score: number; label: string; reasons: string[] };
  stages: StageProgress[];
  health: HealthBreakdown;
  risk: RiskBreakdown;
  technologies: Bucket[];
  ports: Bucket[];
  services: Bucket[];
  topHosts: Bucket[];
  dns: DnsInsights;
  vuln: VulnSummary;
  growth: GrowthPoint[];
  recentRuns: ReconRun[];
  totals: {
    assets: number;
    intel: number;
    runs: number;
    exposedPorts: number;
    endpoints: number;
    technologies: number;
  };
}

const RISK_BANDS: (keyof RiskBreakdown)[] = ["info", "low", "medium", "high", "critical"];

function bandOf(score: number): keyof RiskBreakdown {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  if (score >= 10) return "low";
  return "info";
}

function severityOf(tag: string): keyof RiskBreakdown | null {
  const m = tag.toLowerCase().match(/^sev:(.+)$/);
  if (!m) return null;
  const s = m[1];
  return (RISK_BANDS as string[]).includes(s) ? (s as keyof RiskBreakdown) : null;
}

function bucketize(values: Iterable<string>, limit = 12): Bucket[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function stageStatusOf(runs: number, lastRunAt: number | null): StageProgress["status"] {
  if (!runs || !lastRunAt) return "idle";
  const fresh = Date.now() - lastRunAt < 1000 * 60 * 60 * 24 * 14;
  return fresh ? "active" : "seeded";
}

export function buildReconAnalytics(
  program: Program,
  assets: Asset[],
  intels: AssetIntel[],
  runs: ReconRun[],
  findings: Finding[],
): ReconAnalytics {
  const coverage = summarizeCoverage(program, assets);
  const intelByAsset = new Map(intels.map((i) => [i.assetId, i] as const));

  // Stages
  const stageAgg: Record<string, { runs: number; imported: number; lastRunAt: number | null }> = {};
  for (const r of runs) {
    const s = (stageAgg[r.stage] ??= { runs: 0, imported: 0, lastRunAt: null });
    s.runs += 1;
    s.imported += r.stats.imported;
    s.lastRunAt = Math.max(s.lastRunAt ?? 0, r.createdAt);
  }
  const stages: StageProgress[] = STAGES.map((meta) => {
    const s = stageAgg[meta.id] ?? { runs: 0, imported: 0, lastRunAt: null };
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      runs: s.runs,
      imported: s.imported,
      lastRunAt: s.lastRunAt,
      status: stageStatusOf(s.runs, s.lastRunAt),
    };
  });

  // Health + risk
  const health: HealthBreakdown = { live: 0, redirect: 0, auth: 0, error: 0, dead: 0, unknown: 0 };
  const risk: RiskBreakdown = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const techs: string[] = [];
  const ports: string[] = [];
  const services: string[] = [];
  const hosts: string[] = [];
  const parents = new Map<string, number>();
  let dnsRecordCount = 0;
  let certCount = 0;
  let exposedPorts = 0;

  for (const it of intels) {
    health[(it.health ?? "unknown") as AssetHealth]++;
    risk[bandOf(it.riskScore)]++;
    for (const t of it.technologies) techs.push(t);
    for (const s of it.services) services.push(s);
    if (it.port) {
      ports.push(String(it.port));
      exposedPorts++;
    }
    if (it.kind === "endpoint" || it.kind === "url" || it.kind === "subdomain") {
      if (it.host) hosts.push(it.host);
    }
    if (it.parentHost) parents.set(it.parentHost, (parents.get(it.parentHost) ?? 0) + 1);
    dnsRecordCount += it.dnsRecords.length;
    certCount += it.certificates.length;
  }

  const technologies = bucketize(techs, 12);
  const portBuckets = bucketize(ports, 12).map((b) => ({ ...b, meta: { port: Number(b.key) } }));
  const serviceBuckets = bucketize(services, 10);
  const topHosts = bucketize(hosts, 10);

  const parentsBuckets: Bucket[] = [...parents.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Vuln summary (findings + nuclei sev tags on intel)
  const bySeverity: RiskBreakdown = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  let fromFindings = 0;
  let open = 0;
  for (const f of findings) {
    const sev = (f.severity ?? "info").toLowerCase() as keyof RiskBreakdown;
    if ((RISK_BANDS as string[]).includes(sev)) bySeverity[sev]++;
    fromFindings++;
    if (f.status !== "submitted") open++;
  }
  let fromTags = 0;
  for (const a of assets) {
    for (const t of a.tags ?? []) {
      const sev = severityOf(t);
      if (sev) { bySeverity[sev]++; fromTags++; break; }
    }
  }
  const vuln: VulnSummary = {
    bySeverity,
    total: fromFindings + fromTags,
    open,
    fromFindings,
    fromTags,
  };

  // Growth trend — last 14 days
  const growth = buildGrowth(assets, 14);

  // Completeness
  const completeness = scoreCompleteness({
    program, coverage, stages, intelCount: intels.length,
    endpoints: coverage.endpoints, subdomains: coverage.subdomains,
    technologies: technologies.length, exposedPorts,
  });

  const recentRuns = [...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  return {
    coverage,
    completeness,
    stages,
    health,
    risk,
    technologies,
    ports: portBuckets,
    services: serviceBuckets,
    topHosts,
    dns: {
      parents: parentsBuckets,
      totalSubdomains: coverage.subdomains,
      totalDnsRecords: dnsRecordCount,
      certificates: certCount,
    },
    vuln,
    growth,
    recentRuns,
    totals: {
      assets: assets.length,
      intel: intels.length,
      runs: runs.length,
      exposedPorts,
      endpoints: coverage.endpoints,
      technologies: technologies.length,
    },
  };
}

function buildGrowth(assets: Asset[], days: number): GrowthPoint[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const buckets: GrowthPoint[] = [];
  const idx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    idx.set(day, buckets.length);
    buckets.push({ day, ts: d.getTime(), assets: 0, cumulative: 0 });
  }
  const start = buckets[0]?.ts ?? 0;
  let priorCumulative = 0;
  for (const a of assets) if (a.createdAt < start) priorCumulative++;
  for (const a of assets) {
    if (a.createdAt < start) continue;
    const d = new Date(a.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const b = idx.get(key);
    if (b !== undefined) buckets[b].assets++;
  }
  let running = priorCumulative;
  for (const p of buckets) {
    running += p.assets;
    p.cumulative = running;
  }
  return buckets;
}

function scoreCompleteness(i: {
  program: Program;
  coverage: CoverageSummary;
  stages: StageProgress[];
  intelCount: number;
  endpoints: number;
  subdomains: number;
  technologies: number;
  exposedPorts: number;
}): { score: number; label: string; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Scope defined (10)
  if (i.program.inScope.length > 0 || i.program.targetRoot) { score += 10; reasons.push("scope defined"); }
  else reasons.push("scope missing");

  // Stage coverage — 5 per active stage, cap 35
  const active = i.stages.filter((s) => s.status !== "idle").length;
  const stagePts = Math.min(35, active * 5);
  score += stagePts;
  reasons.push(`${active}/${i.stages.length} stages seeded`);

  // Subdomain breadth (up to 15)
  if (i.subdomains > 0) {
    const pts = Math.min(15, Math.round(Math.log2(i.subdomains + 1) * 3));
    score += pts;
    reasons.push(`${i.subdomains} subdomains`);
  }
  // Endpoint depth (up to 15)
  if (i.endpoints > 0) {
    const pts = Math.min(15, Math.round(Math.log2(i.endpoints + 1) * 2));
    score += pts;
    reasons.push(`${i.endpoints} endpoints`);
  }
  // Tech fingerprints (up to 10)
  if (i.technologies > 0) {
    score += Math.min(10, i.technologies);
    reasons.push(`${i.technologies} tech signals`);
  }
  // Port surface (up to 10)
  if (i.exposedPorts > 0) {
    score += Math.min(10, Math.round(Math.log2(i.exposedPorts + 1) * 3));
    reasons.push(`${i.exposedPorts} ports mapped`);
  }
  // Intel enrichment ratio (up to 5)
  if (i.coverage.totalAssets && i.intelCount / i.coverage.totalAssets > 0.9) {
    score += 5;
    reasons.push("intel fully enriched");
  }

  score = Math.min(100, score);
  const label =
    score >= 80 ? "Deep recon" :
    score >= 55 ? "Broad recon" :
    score >= 30 ? "Early recon" :
    score >= 10 ? "Seeded" : "Not started";
  return { score, label, reasons };
}

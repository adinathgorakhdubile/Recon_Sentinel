/**
 * Asset Intelligence sidecar.
 *
 * Every workspace Asset can have a companion `AssetIntel` record that stores
 * derived / enriched information: semantic kind, host/port/scheme parts,
 * detected technologies, services, DNS records, certificate details,
 * fingerprint (for dedup), risk score, and health status.
 *
 * Intel is kept *out* of the core `Asset` shape so that existing pages keep
 * working unchanged — the Asset Explorer and correlation engine layer on top.
 */

import type { Asset, ID } from "@/types";

export type AssetKind =
  | "domain"
  | "subdomain"
  | "ip"
  | "url"
  | "endpoint"
  | "port"
  | "technology"
  | "service"
  | "dns"
  | "certificate"
  | "screenshot"
  | "cloud"
  | "repository"
  | "other";

export type AssetHealth = "unknown" | "live" | "redirect" | "auth" | "error" | "dead";

export interface AssetFingerprint {
  /** Canonical identifier used for dedup: `${kind}:${host}[:${port}][${path}]`. */
  key: string;
  host: string;
  port?: number;
  scheme?: "http" | "https" | "tcp" | "udp";
  path?: string;
}

export interface AssetIntel {
  assetId: ID;
  programId: ID;
  kind: AssetKind;
  fingerprint: AssetFingerprint;
  host: string;
  parentHost?: string;
  port?: number;
  scheme?: string;
  path?: string;
  statusCode?: number;
  title?: string;
  technologies: string[];
  services: string[];
  dnsRecords: string[];
  certificates: string[];
  screenshots: string[];
  riskScore: number; // 0-100
  riskReasons: string[];
  health: AssetHealth;
  ownership?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  updatedAt: number;
  sourceRuns: string[]; // recon run ids
  meta?: Record<string, unknown>;
}

const HIGH_VALUE_PORTS = new Set([22, 23, 25, 53, 445, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 9200, 27017]);
const ADMIN_PATH_HINTS = ["admin", "manage", "console", "actuator", "phpmyadmin", "wp-admin", ".git", ".env", "graphql", "swagger", "api-docs"];
const RISKY_TECH = ["jenkins", "gitlab", "kubernetes", "elasticsearch", "kibana", "mongo", "redis", "wordpress", "phpmyadmin"];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IP_PORT_RE = /^((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})$/;
const HOST_PORT_RE = /^([a-z0-9][a-z0-9.-]*):(\d{1,5})$/i;

export function parseIdentifier(input: string): {
  kind: AssetKind;
  host: string;
  port?: number;
  scheme?: "http" | "https" | "tcp";
  path?: string;
} {
  const raw = input.trim();
  if (!raw) return { kind: "other", host: "" };

  // URL
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const scheme = u.protocol.replace(":", "") as "http" | "https";
      const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
      const path = u.pathname && u.pathname !== "/" ? u.pathname : undefined;
      const host = u.hostname.toLowerCase();
      return { kind: path ? "endpoint" : "url", host, port, scheme, path };
    } catch { /* fall through */ }
  }

  // ip:port
  const ipPort = raw.match(IP_PORT_RE);
  if (ipPort) return { kind: "port", host: ipPort[1], port: Number(ipPort[2]), scheme: "tcp" };

  // host:port
  const hp = raw.match(HOST_PORT_RE);
  if (hp && !IP_RE.test(hp[1])) return { kind: "port", host: hp[1].toLowerCase(), port: Number(hp[2]), scheme: "tcp" };

  // bare IP
  if (IP_RE.test(raw)) return { kind: "ip", host: raw };

  // bare host
  const host = raw.toLowerCase();
  const dots = host.split(".").length;
  return { kind: dots > 2 ? "subdomain" : "domain", host };
}

export function parentHostOf(host: string): string | undefined {
  const parts = host.split(".");
  if (parts.length <= 2) return undefined;
  return parts.slice(1).join(".");
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

function pickString(row: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!row) return undefined;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickArray(row: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!row) return [];
  for (const k of keys) {
    const v = row[k];
    if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export interface EnrichContext {
  runId?: string;
  now?: number;
  previous?: AssetIntel | null;
}

export function enrichAsset(asset: Asset, ctx: EnrichContext = {}): AssetIntel {
  const now = ctx.now ?? Date.now();
  const meta = (asset as any).meta as Record<string, unknown> | undefined;

  const parsed = parseIdentifier(asset.name);
  const host = parsed.host || asset.name.toLowerCase();

  // Kind override: respect the asset's declared type when it's more specific
  // (e.g. cloud / repository / dns / certificate / screenshot).
  const declaredOverride: AssetKind | null =
    asset.type === "cloud" || asset.type === "repository" ||
    asset.type === "dns" || asset.type === "certificate" ||
    asset.type === "screenshot" || asset.type === "technology" ||
    asset.type === "service"
      ? (asset.type as AssetKind)
      : null;
  const kind: AssetKind = declaredOverride ?? parsed.kind;

  // Tech / status from tags + meta
  const tagTech: string[] = [];
  const ports = new Set<number>();
  let status: number | undefined;
  for (const t of asset.tags ?? []) {
    if (/^port:(\d+)$/.test(t)) ports.add(Number(t.split(":")[1]));
    else if (/^\d{3}$/.test(t)) status = Number(t);
    else if (/^sev:/.test(t)) { /* handled in risk */ }
    else if (!/^(stage|via|http|crawl|content-discovery|nuclei|port):?/i.test(t)) tagTech.push(t);
  }
  if (parsed.port) ports.add(parsed.port);
  const metaPort = meta ? Number(pickString(meta, ["port"])) : NaN;
  if (Number.isFinite(metaPort)) ports.add(metaPort);
  const metaStatus = meta ? Number(pickString(meta, ["status_code", "status-code", "status"])) : NaN;
  if (Number.isFinite(metaStatus)) status = metaStatus;

  const metaTech = pickArray(meta, ["tech", "technologies"]);
  const technologies = Array.from(new Set([...tagTech, ...metaTech].map((t) => t.toLowerCase()))).slice(0, 20);
  const title = pickString(meta, ["title"]);
  const service = pickString(meta, ["service", "product"]);
  const services = service ? [service.toLowerCase()] : [];

  // Fingerprint
  const port = parsed.port ?? (ports.size ? Math.min(...ports) : undefined);
  const fingerprint: AssetFingerprint = {
    key: buildFingerprint(kind, host, port, parsed.path),
    host,
    port,
    scheme: parsed.scheme,
    path: parsed.path,
  };

  const health = deriveHealth(status, kind);
  const { score, reasons } = scoreRisk({
    kind, host, port, path: parsed.path, technologies, tags: asset.tags ?? [], status,
  });

  const firstSeenAt = ctx.previous?.firstSeenAt ?? asset.createdAt ?? now;
  const sourceRuns = ctx.runId
    ? Array.from(new Set([...(ctx.previous?.sourceRuns ?? []), ctx.runId]))
    : ctx.previous?.sourceRuns ?? [];

  return {
    assetId: asset.id,
    programId: asset.programId,
    kind,
    fingerprint,
    host,
    parentHost: parentHostOf(host),
    port,
    scheme: parsed.scheme,
    path: parsed.path,
    statusCode: status,
    title,
    technologies,
    services,
    dnsRecords: ctx.previous?.dnsRecords ?? [],
    certificates: ctx.previous?.certificates ?? [],
    screenshots: ctx.previous?.screenshots ?? [],
    riskScore: score,
    riskReasons: reasons,
    health,
    ownership: ctx.previous?.ownership,
    firstSeenAt,
    lastSeenAt: now,
    updatedAt: now,
    sourceRuns,
    meta,
  };
}

function buildFingerprint(kind: AssetKind, host: string, port?: number, path?: string): string {
  const base = `${kind}:${host}`;
  const withPort = port ? `${base}:${port}` : base;
  return path ? `${withPort}${path}` : withPort;
}

function deriveHealth(status: number | undefined, kind: AssetKind): AssetHealth {
  if (status === undefined) return kind === "endpoint" || kind === "url" ? "unknown" : "unknown";
  if (status >= 200 && status < 300) return "live";
  if (status >= 300 && status < 400) return "redirect";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "error";
  if (status === 0 || status === 404) return "dead";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

interface RiskInput {
  kind: AssetKind;
  host: string;
  port?: number;
  path?: string;
  technologies: string[];
  tags: string[];
  status?: number;
}

export function scoreRisk(i: RiskInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Nuclei severity tag mapping
  const sevTag = i.tags.find((t) => t.startsWith("sev:"));
  if (sevTag) {
    const sev = sevTag.slice(4);
    const bump = sev === "critical" ? 55 : sev === "high" ? 40 : sev === "medium" ? 25 : sev === "low" ? 10 : 5;
    score += bump;
    reasons.push(`nuclei ${sev}`);
  }

  if (i.port && HIGH_VALUE_PORTS.has(i.port)) {
    score += 15;
    reasons.push(`sensitive port ${i.port}`);
  }

  const pathLc = (i.path ?? "").toLowerCase();
  const hostLc = i.host.toLowerCase();
  for (const hint of ADMIN_PATH_HINTS) {
    if (pathLc.includes(hint) || hostLc.includes(hint)) {
      score += 15;
      reasons.push(`admin surface (${hint})`);
      break;
    }
  }

  const risky = i.technologies.find((t) => RISKY_TECH.some((r) => t.includes(r)));
  if (risky) {
    score += 12;
    reasons.push(`high-attack-surface tech (${risky})`);
  }

  if (i.status === 401 || i.status === 403) {
    score += 8;
    reasons.push(`auth-gated (${i.status})`);
  }
  if (i.status && i.status >= 500) {
    score += 6;
    reasons.push(`server error (${i.status})`);
  }
  if (i.tags.some((t) => /staging|dev|test|preprod|uat/.test(t.toLowerCase())) ||
      /staging|dev|qa|uat/.test(hostLc)) {
    score += 10;
    reasons.push("non-production host");
  }

  return { score: Math.min(100, score), reasons };
}

export function riskBand(score: number): "info" | "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  if (score >= 10) return "low";
  return "info";
}

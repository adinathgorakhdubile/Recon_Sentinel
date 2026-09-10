/**
 * Vulnerability Correlation Engine.
 *
 * Reads the workspace (Findings, Assets, HTTP, Evidence, PoCs, Reports) and
 * emits explainable `CorrelationCluster` records without asserting
 * exploitability or validity — the engine only surfaces relationships and
 * lets analysts approve, reject, queue, or merge.
 *
 * The engine intentionally rebuilds clusters from scratch each run and
 * reconciles with any existing persisted cluster (preserving analyst
 * decisions + audit history) so that data added later is picked up
 * naturally without needing an incremental algorithm.
 */

import { db } from "@/lib/db";
import { uid } from "@/lib/seed";
import type { AssetIntel } from "@/lib/assets/intel";
import type { HttpItem } from "@/lib/http/types";
import type { EvidenceItem } from "@/lib/evidence/types";
import type { PocDoc } from "@/lib/poc/types";
import type { Finding, Asset } from "@/types";
import type { StoredFinding } from "@/lib/db";
import {
  extractHost,
  jaccard,
  normalizeEndpoint,
  stringSim,
  tokenize,
} from "./similarity";
import type {
  CorrelationCluster,
  CorrelationClusterKind,
  CorrelationEntityRef,
  CorrelationRuleId,
  CorrelationRunSummary,
  CorrelationSignal,
} from "./types";

interface EngineInput {
  programId: string | null;
  findings: StoredFinding[];
  assets: Asset[];
  intel: AssetIntel[];
  http: HttpItem[];
  evidence: EvidenceItem[];
  pocs: PocDoc[];
}

interface DetectionResult {
  clusters: CorrelationCluster[];
  summary: CorrelationRunSummary;
}

/** Load all inputs for the given program and run detection. */
export async function detectCorrelations(programId: string | null): Promise<DetectionResult> {
  const inProgram = <T extends { programId?: string | null }>(rows: T[]): T[] =>
    !programId ? rows : rows.filter((r) => !r.programId || r.programId === programId);

  const [findings, assets, intel, http, evidence, pocs] = await Promise.all([
    db.findings.toArray().then(inProgram),
    db.assets.toArray().then(inProgram),
    db.assetIntel.toArray().then(inProgram),
    db.http.toArray().then(inProgram),
    db.evidence.toArray().then(inProgram),
    db.pocs.toArray().then(inProgram),
  ]);

  const clusters = runDetection({ programId, findings, assets, intel, http, evidence, pocs });
  return {
    clusters,
    summary: {
      programId,
      ranAt: Date.now(),
      clustersCreated: 0,
      clustersUpdated: 0,
      clustersUnchanged: 0,
      scanned: {
        findings: findings.length,
        assets: assets.length,
        http: http.length,
        evidence: evidence.length,
        pocs: pocs.length,
      },
    },
  };
}

// ── Detection ─────────────────────────────────────────────────────────────

function runDetection(input: EngineInput): CorrelationCluster[] {
  const clusters: CorrelationCluster[] = [];
  const now = Date.now();

  // Precompute finding features.
  const fFeat = input.findings.map((f) => ({
    row: f,
    tokens: tokenize(`${f.title} ${f.evidence} ${f.impact}`),
    endpoint: normalizeEndpoint(f.affectedAsset),
    host: extractHost(f.affectedAsset),
  }));

  // 1. Duplicate finding pairs → duplicate clusters
  const duplicateGroups = groupByThreshold(fFeat, (a, b) => {
    if (a.row.programId !== b.row.programId) return 0;
    const titleSim = stringSim(a.row.title, b.row.title);
    const bodySim = jaccard(a.tokens, b.tokens);
    const cweBoost = a.row.cwe && a.row.cwe === b.row.cwe ? 0.15 : 0;
    const sevBoost = a.row.severity === b.row.severity ? 0.05 : 0;
    const score = 0.55 * titleSim + 0.3 * bodySim + cweBoost + sevBoost;
    return score;
  }, 0.62);

  for (const group of duplicateGroups) {
    if (group.members.length < 2) continue;
    const memberRefs: CorrelationEntityRef[] = group.members.map((m) => ({
      type: "finding",
      id: m.row.id,
      label: m.row.title,
      severity: m.row.severity,
    }));
    const signals: CorrelationSignal[] = [
      { ruleId: "duplicate-finding", weight: group.avgScore, reason: `Titles and evidence overlap across ${group.members.length} findings.` },
    ];
    if (group.members.every((m) => m.row.cwe && m.row.cwe === group.members[0].row.cwe)) {
      signals.push({ ruleId: "shared-cwe", weight: 0.2, reason: `All members share ${group.members[0].row.cwe}.`, meta: { cwe: group.members[0].row.cwe } });
    }
    clusters.push(makeCluster({
      programId: group.members[0].row.programId,
      kind: "duplicate",
      score: clamp(group.avgScore),
      title: `Likely duplicates: ${truncate(group.members[0].row.title, 60)}`,
      summary: `${group.members.length} findings appear to describe the same issue.`,
      members: memberRefs,
      signals,
      tags: uniq([
        ...group.members.map((m) => m.row.cwe || "").filter(Boolean),
        ...group.members.flatMap((m) => m.row.tags ?? []),
      ]),
      now,
    }));
  }

  // 2. Recurring — same CWE across ≥2 distinct assets/hosts.
  const cweBuckets = new Map<string, typeof fFeat>();
  for (const f of fFeat) {
    if (!f.row.cwe) continue;
    const arr = cweBuckets.get(f.row.cwe) ?? [];
    arr.push(f);
    cweBuckets.set(f.row.cwe, arr);
  }
  for (const [cwe, group] of cweBuckets) {
    const hosts = uniq(group.map((g) => g.host || g.endpoint).filter(Boolean));
    if (group.length < 2 || hosts.length < 2) continue;
    const already = duplicateGroups.some((dg) => dg.members.length === group.length && dg.members.every((m) => group.includes(m)));
    if (already) continue;
    clusters.push(makeCluster({
      programId: group[0].row.programId,
      kind: "recurring",
      score: clamp(0.55 + Math.min(0.3, hosts.length * 0.05)),
      title: `Recurring ${cwe} across ${hosts.length} assets`,
      summary: `${group.length} findings tagged ${cwe} affect ${hosts.length} distinct hosts/endpoints.`,
      members: group.map((g) => ({ type: "finding", id: g.row.id, label: g.row.title, severity: g.row.severity })),
      signals: [
        { ruleId: "shared-cwe", weight: 0.6, reason: `Shared ${cwe}.`, meta: { cwe } },
        { ruleId: "recurring-across-assets", weight: 0.4, reason: `Observed on ${hosts.length} hosts.`, meta: { hosts } },
      ],
      tags: uniq([cwe, ...group.flatMap((g) => g.row.tags ?? [])]),
      now,
    }));
  }

  // 3. Common root cause — shared technology across findings via asset intel.
  const techToFindings = new Map<string, Set<string>>();
  const assetHostById = new Map(input.assets.map((a) => [a.id, a.name.toLowerCase()] as const));
  const intelByHost = new Map<string, AssetIntel>();
  for (const i of input.intel) intelByHost.set(i.host.toLowerCase(), i);
  for (const f of fFeat) {
    const host = f.host || assetHostById.get(f.row.affectedAsset);
    if (!host) continue;
    const info = intelByHost.get(host);
    if (!info) continue;
    for (const tech of info.technologies) {
      const set = techToFindings.get(tech) ?? new Set<string>();
      set.add(f.row.id);
      techToFindings.set(tech, set);
    }
  }
  for (const [tech, fidSet] of techToFindings) {
    if (fidSet.size < 2) continue;
    const members: CorrelationEntityRef[] = [];
    for (const id of fidSet) {
      const f = input.findings.find((x) => x.id === id);
      if (f) members.push({ type: "finding", id: f.id, label: f.title, severity: f.severity });
    }
    clusters.push(makeCluster({
      programId: members[0] ? input.findings.find((f) => f.id === members[0].id)!.programId : null,
      kind: "root-cause",
      score: clamp(0.4 + Math.min(0.4, fidSet.size * 0.06)),
      title: `Shared technology: ${tech}`,
      summary: `${fidSet.size} findings affect assets running ${tech}.`,
      members,
      signals: [
        { ruleId: "shared-technology", weight: 0.7, reason: `All findings target assets running ${tech}.`, meta: { technology: tech } },
        { ruleId: "common-root-cause", weight: 0.3, reason: "Possible shared root cause via technology stack." },
      ],
      tags: [tech],
      now,
    }));
  }

  // 4. Endpoint groups — findings targeting the same normalized endpoint.
  const endpointBuckets = new Map<string, typeof fFeat>();
  for (const f of fFeat) {
    if (!f.endpoint) continue;
    const arr = endpointBuckets.get(f.endpoint) ?? [];
    arr.push(f);
    endpointBuckets.set(f.endpoint, arr);
  }
  for (const [endpoint, group] of endpointBuckets) {
    if (group.length < 2) continue;
    clusters.push(makeCluster({
      programId: group[0].row.programId,
      kind: "endpoint-group",
      score: clamp(0.5 + Math.min(0.3, group.length * 0.05)),
      title: `Endpoint hotspot: ${endpoint}`,
      summary: `${group.length} findings target ${endpoint}.`,
      members: group.map((g) => ({ type: "finding", id: g.row.id, label: g.row.title, severity: g.row.severity })),
      signals: [
        { ruleId: "same-endpoint", weight: 0.7, reason: `Endpoint ${endpoint} reused.`, meta: { endpoint } },
      ],
      tags: [endpoint],
      now,
    }));
  }

  // 5. Evidence reuse opportunities — findings sharing sha256 evidence.
  const evBySha = new Map<string, EvidenceItem[]>();
  for (const e of input.evidence) {
    if (!e.sha256) continue;
    const arr = evBySha.get(e.sha256) ?? [];
    arr.push(e);
    evBySha.set(e.sha256, arr);
  }
  for (const [sha, ev] of evBySha) {
    if (ev.length < 2) continue;
    clusters.push(makeCluster({
      programId: ev[0].programId ?? null,
      kind: "evidence-reuse",
      score: 0.9,
      title: `Duplicate evidence (${sha.slice(0, 10)}…)`,
      summary: `${ev.length} evidence items share the same SHA-256 — consider consolidating.`,
      members: ev.map((e) => ({ type: "evidence", id: e.id, label: e.title })),
      signals: [
        { ruleId: "shared-evidence", weight: 0.9, reason: "Identical SHA-256 across evidence records.", meta: { sha256: sha } },
        { ruleId: "evidence-reuse", weight: 0.1, reason: "Consolidation would reduce report noise." },
      ],
      tags: [`sha:${sha.slice(0, 8)}`],
      now,
    }));
  }

  // 6. HTTP fingerprint clusters (same request pattern across many entries).
  const fpBuckets = new Map<string, HttpItem[]>();
  for (const h of input.http) {
    if (!h.fingerprint) continue;
    const arr = fpBuckets.get(h.fingerprint) ?? [];
    arr.push(h);
    fpBuckets.set(h.fingerprint, arr);
  }
  for (const [fp, items] of fpBuckets) {
    if (items.length < 3) continue;
    clusters.push(makeCluster({
      programId: items[0].programId ?? null,
      kind: "endpoint-group",
      score: 0.65,
      title: `Repeated HTTP pattern (${items.length}×)`,
      summary: `${items.length} HTTP entries share fingerprint ${fp.slice(0, 12)}…`,
      members: items.map((h) => ({ type: "http", id: h.id, label: `${h.request?.method ?? "?"} ${h.request?.url ?? ""}` })),
      signals: [
        { ruleId: "http-fingerprint", weight: 0.7, reason: "Matching normalized request signature.", meta: { fingerprint: fp } },
      ],
      tags: [`fp:${fp.slice(0, 8)}`],
      now,
    }));
  }

  // 7. PoC / Finding evidence reuse — findings that could share existing PoCs.
  const pocByCwe = new Map<string, PocDoc[]>();
  for (const p of input.pocs) {
    const cwe = (p as unknown as { cwe?: string }).cwe;
    if (!cwe) continue;
    const arr = pocByCwe.get(cwe) ?? [];
    arr.push(p);
    pocByCwe.set(cwe, arr);
  }
  for (const [cwe, plist] of pocByCwe) {
    const fs = input.findings.filter((f) => f.cwe === cwe);
    if (plist.length && fs.length >= 2) {
      clusters.push(makeCluster({
        programId: fs[0].programId,
        kind: "evidence-reuse",
        score: 0.55,
        title: `PoC reuse candidate for ${cwe}`,
        summary: `${plist.length} PoC(s) exist for ${cwe}; ${fs.length} findings could reference them.`,
        members: [
          ...fs.map<CorrelationEntityRef>((f) => ({ type: "finding", id: f.id, label: f.title, severity: f.severity })),
          ...plist.map<CorrelationEntityRef>((p) => ({ type: "poc", id: p.id, label: p.title || "PoC" })),
        ],
        signals: [
          { ruleId: "shared-poc", weight: 0.6, reason: `PoC already exists for ${cwe}.`, meta: { cwe } },
          { ruleId: "evidence-reuse", weight: 0.4, reason: "Reusing existing PoCs speeds triage." },
        ],
        tags: [cwe],
        now,
      }));
    }
  }

  return dedupeClusters(clusters);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function groupByThreshold<T>(items: T[], sim: (a: T, b: T) => number, threshold: number) {
  const parent = new Map<number, number>();
  const find = (i: number): number => (parent.get(i) === i ? i : (parent.set(i, find(parent.get(i)!)), parent.get(i)!));
  const scores: number[][] = items.map(() => []);
  for (let i = 0; i < items.length; i++) parent.set(i, i);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = sim(items[i], items[j]);
      if (s >= threshold) {
        parent.set(find(i), find(j));
        scores[i].push(s);
        scores[j].push(s);
      }
    }
  }
  const groups = new Map<number, { members: T[]; scores: number[] }>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const g = groups.get(root) ?? { members: [], scores: [] };
    g.members.push(items[i]);
    g.scores.push(...scores[i]);
    groups.set(root, g);
  }
  return [...groups.values()]
    .filter((g) => g.members.length > 1)
    .map((g) => ({ members: g.members, avgScore: g.scores.length ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : threshold }));
}

function makeCluster(input: {
  programId: string | null;
  kind: CorrelationClusterKind;
  score: number;
  title: string;
  summary: string;
  members: CorrelationEntityRef[];
  signals: CorrelationSignal[];
  tags: string[];
  now: number;
}): CorrelationCluster {
  const id = uid("cc");
  return {
    id,
    programId: input.programId,
    kind: input.kind,
    score: input.score,
    title: input.title,
    summary: input.summary,
    members: input.members,
    signals: input.signals,
    tags: input.tags.filter(Boolean).slice(0, 12),
    status: "open",
    createdAt: input.now,
    updatedAt: input.now,
    history: [
      { id: uid("ah"), action: "detected", ts: input.now, note: `Detected via ${input.signals.map((s) => s.ruleId).join(", ")}` },
    ],
  };
}

function dedupeClusters(clusters: CorrelationCluster[]): CorrelationCluster[] {
  // Merge clusters that share the same kind and identical member id-set.
  const bucket = new Map<string, CorrelationCluster>();
  for (const c of clusters) {
    const key = `${c.kind}|${c.members.map((m) => `${m.type}:${m.id}`).sort().join(",")}`;
    const prev = bucket.get(key);
    if (!prev) {
      bucket.set(key, c);
    } else {
      prev.signals = uniqSignals([...prev.signals, ...c.signals]);
      prev.score = Math.max(prev.score, c.score);
      prev.tags = uniq([...prev.tags, ...c.tags]);
    }
  }
  return [...bucket.values()].sort((a, b) => b.score - a.score);
}

function uniqSignals(list: CorrelationSignal[]): CorrelationSignal[] {
  const seen = new Set<CorrelationRuleId>();
  const out: CorrelationSignal[] = [];
  for (const s of list) {
    if (seen.has(s.ruleId)) continue;
    seen.add(s.ruleId);
    out.push(s);
  }
  return out;
}

function uniq<T>(arr: T[]): T[] { return [...new Set(arr)]; }
function clamp(n: number): number { return Math.max(0, Math.min(1, n)); }
function truncate(s: string, n: number): string { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

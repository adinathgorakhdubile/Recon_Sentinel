/**
 * Materialize a knowledge graph from the workspace.
 *
 * The builder reads every domain table for the given program and produces a
 * self-consistent GraphSnapshot. It performs two kinds of edge derivation:
 *
 *   1. Authored edges — from the EntityLink table (user- or workflow-created).
 *   2. Inferred edges — from cross-references baked into the underlying rows
 *      (Finding.affectedAsset, Note.relatedAssetId, PoC/Report attachments,
 *      HTTP url→asset match, hostname hierarchies, etc.).
 *
 * The builder is intentionally UI-free and stateless: rerun it any time the
 * workspace changes to get a fresh snapshot.
 */

import { db } from "@/lib/db";
import type { Asset, EntityLink, Finding, Note, Program } from "@/types";
import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  GraphSnapshot,
} from "./types";

interface BuildOptions {
  programId: string | null;
  /** Cap output size for very large workspaces; 0 disables. */
  maxNodes?: number;
}

export async function buildGraph({ programId, maxNodes = 0 }: BuildOptions): Promise<GraphSnapshot> {
  const [
    programs,
    allAssets,
    allFindings,
    allNotes,
    allTasks,
    allEvidence,
    allHttp,
    allPocs,
    allReports,
    links,
  ] = await Promise.all([
    db.programs.toArray(),
    db.assets.toArray(),
    db.findings.toArray(),
    db.notes.toArray(),
    db.tasks.toArray(),
    db.evidence.toArray(),
    db.http.toArray(),
    db.pocs.toArray(),
    db.reports.toArray(),
    db.links.toArray(),
  ]);

  const inProgram = <T extends { programId?: string | null }>(rows: T[]): T[] =>
    !programId ? rows : rows.filter((r) => !r.programId || r.programId === programId);

  const assets = inProgram(allAssets);
  const findings = inProgram(allFindings);
  const notes = inProgram(allNotes);
  const tasks = inProgram(allTasks);
  const evidence = inProgram(allEvidence);
  const httpItems = inProgram(allHttp);
  const pocs = inProgram(allPocs);
  const reports = inProgram(allReports);

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const addNode = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return nodes.get(n.id)!;
  };
  const addEdge = (from: string, to: string, kind: GraphEdgeKind, auto = true, meta?: Record<string, unknown>) => {
    if (from === to) return;
    if (!nodes.has(from) || !nodes.has(to)) return;
    const id = `${from}→${to}:${kind}`;
    if (edges.has(id)) return;
    edges.set(id, { id, from, to, kind, auto, meta });
  };

  // ── Programs ────────────────────────────────────────────────────────────
  for (const p of programs) {
    if (programId && p.id !== programId) continue;
    addNode(programNode(p));
  }

  // ── Assets + derived host/tech/service nodes ────────────────────────────
  const assetIdByName = new Map<string, string>();
  for (const a of assets) {
    const n = assetNode(a);
    addNode(n);
    assetIdByName.set(a.name.toLowerCase(), n.id);
    addEdge(`program:${a.programId}`, n.id, "contains");

    // Hostname hierarchy: subdomain → parent domain.
    if (a.type === "subdomain" || a.type === "domain") {
      const parent = parentDomain(a.name);
      if (parent && parent !== a.name.toLowerCase()) {
        const parentId = `derived:domain:${parent}`;
        addNode({
          id: parentId,
          kind: "domain",
          label: parent,
          programId: a.programId,
          meta: { derived: true },
        });
        addEdge(parentId, n.id, "hosts");
      }
    }

    // Endpoint / URL → subdomain host inference.
    if (a.type === "endpoint" || a.type === "url") {
      const host = extractHost(a.name);
      if (host) {
        const hostAsset = assetIdByName.get(host);
        if (hostAsset) addEdge(hostAsset, n.id, "hosts");
        else {
          const derived = `derived:subdomain:${host}`;
          addNode({ id: derived, kind: "subdomain", label: host, programId: a.programId, meta: { derived: true } });
          addEdge(derived, n.id, "hosts");
        }
      }
    }
  }

  // ── Findings ────────────────────────────────────────────────────────────
  for (const f of findings) {
    const n: GraphNode = {
      id: `finding:${f.id}`,
      kind: "finding",
      label: f.title,
      sublabel: `${f.severity} · ${f.status}`,
      ref: { type: "finding", id: f.id },
      programId: f.programId,
      tags: f.tags,
      weight: severityWeight(f.severity),
      meta: { severity: f.severity, status: f.status, cwe: f.cwe, cvss: f.cvss },
    };
    addNode(n);
    addEdge(`program:${f.programId}`, n.id, "contains");

    // Finding.affectedAsset → asset (best-effort by name match).
    const target = assetIdByName.get((f.affectedAsset ?? "").toLowerCase());
    if (target) addEdge(n.id, target, "affects");
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  for (const n of notes) addNoteNode(n, addNode, addEdge);

  // ── Tasks ───────────────────────────────────────────────────────────────
  for (const t of tasks) {
    const id = `task:${t.id}`;
    addNode({
      id,
      kind: "task",
      label: t.title,
      sublabel: `${t.phase} · ${t.category}`,
      ref: { type: "task", id: t.id },
      programId: t.programId,
      meta: { completed: t.completed, phase: t.phase },
    });
    addEdge(`program:${t.programId}`, id, "contains");
  }

  // ── Evidence ────────────────────────────────────────────────────────────
  for (const e of evidence) {
    const id = `evidence:${e.id}`;
    addNode({
      id,
      kind: "evidence",
      label: e.title,
      sublabel: `${e.kind} · ${humanBytes(e.sizeBytes)}`,
      ref: { type: "evidence", id: e.id },
      programId: e.programId,
      tags: e.tags,
      meta: { sha256: e.sha256, folder: e.folder, mime: e.mime, version: e.version },
    });
    if (e.programId) addEdge(`program:${e.programId}`, id, "contains");
  }

  // ── HTTP items ──────────────────────────────────────────────────────────
  for (const h of httpItems) {
    const id = `http:${h.id}`;
    const url = h.request?.url ?? "";
    addNode({
      id,
      kind: "http",
      label: `${h.request?.method ?? "?"} ${shortUrl(url)}`,
      sublabel: `${h.response?.status ?? "-"} · ${h.source}`,
      ref: { type: "http", id: h.id },
      programId: h.programId,
      tags: h.tags,
      meta: { url, method: h.request?.method, status: h.response?.status, fingerprint: h.fingerprint },
    });
    if (h.programId) addEdge(`program:${h.programId}`, id, "contains");

    // URL → host asset inference.
    const host = extractHost(url);
    if (host) {
      const hostAsset = assetIdByName.get(host);
      if (hostAsset) addEdge(hostAsset, id, "serves");
    }
  }

  // ── PoCs ────────────────────────────────────────────────────────────────
  for (const p of pocs) {
    const id = `poc:${p.id}`;
    addNode({
      id,
      kind: "poc",
      label: p.title || "Untitled PoC",
      sublabel: `${p.severity ?? "n/a"} · ${p.status}`,
      ref: { type: "poc", id: p.id },
      programId: p.programId,
      tags: p.tags,
      meta: { severity: p.severity, status: p.status, steps: p.steps?.length ?? 0 },
    });
    if (p.programId) addEdge(`program:${p.programId}`, id, "contains");
    if (p.findingId) addEdge(id, `finding:${p.findingId}`, "supports");

    // Attachments → typed edges into the referenced entity.
    for (const step of p.steps ?? []) {
      for (const att of step.attachments ?? []) {
        const to = attachmentNodeId(att.refType, att.refId);
        if (to) addEdge(id, to, "attaches");
      }
    }
  }

  // ── Reports ─────────────────────────────────────────────────────────────
  for (const r of reports) {
    const id = `report:${r.id}`;
    addNode({
      id,
      kind: "report",
      label: r.title || "Untitled Report",
      sublabel: `${r.format} · ${r.sections?.length ?? 0} sections`,
      ref: { type: "report", id: r.id },
      programId: r.programId,
      meta: { format: r.format, sections: r.sections?.length ?? 0 },
    });
    if (r.programId) addEdge(`program:${r.programId}`, id, "contains");
    for (const fid of r.findingIds ?? []) addEdge(id, `finding:${fid}`, "references");
    for (const s of r.sections ?? []) {
      for (const src of s.sources ?? []) {
        const to = attachmentNodeId(src.refType, src.refId);
        if (to) addEdge(id, to, "references");
      }
    }
  }

  // ── Authored EntityLink edges ───────────────────────────────────────────
  for (const l of links) {
    if (programId && l.programId && l.programId !== programId) continue;
    const from = linkNodeId(l.fromType, l.fromId);
    const to = linkNodeId(l.toType, l.toId);
    if (!nodes.has(from) || !nodes.has(to)) continue;
    addEdge(from, to, l.kind, false, { note: l.note, linkId: l.id });
  }

  // Cap output if requested — drop least-connected nodes first.
  let outNodes = [...nodes.values()];
  let outEdges = [...edges.values()];
  if (maxNodes > 0 && outNodes.length > maxNodes) {
    const degree = new Map<string, number>();
    for (const e of outEdges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    outNodes = outNodes
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, maxNodes);
    const keep = new Set(outNodes.map((n) => n.id));
    outEdges = outEdges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }

  return { nodes: outNodes, edges: outEdges, builtAt: Date.now(), programId };
}

// ── helpers ────────────────────────────────────────────────────────────────



function programNode(p: Program): GraphNode {
  return {
    id: `program:${p.id}`,
    kind: "program",
    label: p.name,
    sublabel: p.targetRoot,
    ref: { type: "program", id: p.id },
    programId: p.id,
    meta: { inScope: p.inScope.length, outScope: p.outScope.length },
  };
}

function assetNode(a: Asset): GraphNode {
  const kind = mapAssetKind(a.type);
  return {
    id: `asset:${a.id}`,
    kind,
    label: a.name,
    sublabel: `${a.type} · ${a.status}`,
    ref: { type: "asset", id: a.id },
    programId: a.programId,
    tags: a.tags,
    meta: { type: a.type, status: a.status, confidence: a.confidence, source: a.source },
  };
}

function addNoteNode(
  n: Note,
  addNode: (node: GraphNode) => void,
  addEdge: (a: string, b: string, k: GraphEdgeKind, auto?: boolean, meta?: Record<string, unknown>) => void,
) {
  const id = `note:${n.id}`;
  addNode({
    id,
    kind: "note",
    label: n.title || "Untitled note",
    ref: { type: "note", id: n.id },
    programId: n.programId,
    tags: n.tags,
    meta: { hasBody: !!n.body?.trim() },
  });
  addEdge(`program:${n.programId}`, id, "contains");
  if (n.relatedAssetId) addEdge(id, `asset:${n.relatedAssetId}`, "references");
}

function mapAssetKind(t: Asset["type"]): GraphNodeKind {
  const table: Partial<Record<Asset["type"], GraphNodeKind>> = {
    subdomain: "subdomain",
    endpoint: "endpoint",
    ip: "ip",
    domain: "domain",
    url: "url",
    port: "port",
    technology: "technology",
    service: "service",
    dns: "dns",
    certificate: "certificate",
  };
  return table[t] ?? "asset";
}

function linkNodeId(type: string, id: string): string {
  // EntityLink types map 1:1 to graph node ids for workspace entities.
  const t = type === "asset" ? "asset" : type;
  return `${t}:${id}`;
}

function attachmentNodeId(type: string, id: string): string | null {
  // Accepts PoC/Report source references and resolves to a graph node id.
  const known = ["evidence", "http", "asset", "finding", "note", "poc", "report", "task"];
  if (known.includes(type)) return `${type}:${id}`;
  return null;
}

function parentDomain(host: string): string | null {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return null;
  return parts.slice(1).join(".");
}

function extractHost(url: string): string | null {
  if (!url) return null;
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function severityWeight(s: Finding["severity"]): number {
  return { info: 1, low: 2, medium: 4, high: 7, critical: 10 }[s] ?? 1;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function shortUrl(url: string): string {
  if (!url) return "";
  return url.length > 60 ? `${url.slice(0, 57)}…` : url;
}

/** For tests / debugging. */
export function summarize(g: GraphSnapshot) {
  const byKind: Record<string, number> = {};
  for (const n of g.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  return { nodes: g.nodes.length, edges: g.edges.length, byKind };
}


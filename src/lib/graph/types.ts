/**
 * Knowledge Graph type surface.
 *
 * The graph engine models the entire workspace as a set of typed nodes and
 * typed edges. It is deliberately independent of any UI: the builder produces
 * plain data structures that can be consumed by an explorer, an AI reasoner,
 * an exploit-chain planner, or a report generator without redesign.
 */

import type { LinkKind, LinkableType } from "@/types";

export type GraphNodeKind =
  | "program"
  | "scope"
  | "domain"
  | "subdomain"
  | "ip"
  | "url"
  | "endpoint"
  | "technology"
  | "service"
  | "dns"
  | "certificate"
  | "port"
  | "asset" // catch-all for asset types that don't map above
  | "finding"
  | "evidence"
  | "http"
  | "poc"
  | "report"
  | "note"
  | "task"
  | "timeline";

export type GraphEdgeKind =
  | LinkKind
  | "contains"
  | "belongs-to"
  | "affects"
  | "attaches"
  | "references"
  | "resolves-to"
  | "hosts"
  | "runs"
  | "serves"
  | "issued-for"
  | "chained-with"
  | "derived-from"
  | "auto";

export interface GraphNode {
  /** Stable id: `${kind}:${sourceId}` for workspace entities, or synthesized for derived nodes. */
  id: string;
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  /** Reference back to the underlying workspace record when one exists. */
  ref?: { type: LinkableType | GraphNodeKind; id: string };
  programId?: string | null;
  tags?: string[];
  /** Free-form structured metadata for detail panels + AI. */
  meta?: Record<string, unknown>;
  /** Optional risk / severity weight used for impact scoring. */
  weight?: number;
}

export interface GraphEdge {
  id: string;
  from: string; // node id
  to: string; // node id
  kind: GraphEdgeKind;
  /** True when the edge was inferred by build.ts rather than authored via EntityLink. */
  auto?: boolean;
  meta?: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  builtAt: number;
  programId: string | null;
}

/** Persisted, user-authored graph view (filters + camera). */
export interface SavedGraphView {
  id: string;
  programId: string | null;
  name: string;
  description?: string;
  filters: GraphFilters;
  camera?: { x: number; y: number; scale: number };
  createdAt: number;
  updatedAt: number;
}

/** Persisted, immutable graph snapshot for point-in-time comparison. */
export interface StoredGraphSnapshot {
  id: string;
  programId: string | null;
  name: string;
  note?: string;
  snapshot: GraphSnapshot;
  createdAt: number;
}

export interface GraphFilters {
  /** Empty array means "all". */
  kinds: GraphNodeKind[];
  edgeKinds: GraphEdgeKind[];
  query: string;
  tags: string[];
  /** Grouping strategy for the explorer. */
  groupBy: "none" | "kind" | "program" | "tag";
  /** Focus a specific node id — the explorer restricts to its N-hop neighborhood. */
  focusId?: string;
  focusDepth?: number;
}

export const DEFAULT_FILTERS: GraphFilters = {
  kinds: [],
  edgeKinds: [],
  query: "",
  tags: [],
  groupBy: "kind",
  focusDepth: 2,
};

export const NODE_KIND_LABELS: Record<GraphNodeKind, string> = {
  program: "Program",
  scope: "Scope",
  domain: "Domain",
  subdomain: "Subdomain",
  ip: "IP",
  url: "URL",
  endpoint: "Endpoint",
  technology: "Technology",
  service: "Service",
  dns: "DNS Record",
  certificate: "Certificate",
  port: "Port",
  asset: "Asset",
  finding: "Finding",
  evidence: "Evidence",
  http: "HTTP",
  poc: "PoC",
  report: "Report",
  note: "Note",
  task: "Task",
  timeline: "Timeline",
};

export const NODE_KIND_COLORS: Record<GraphNodeKind, string> = {
  program: "hsl(var(--primary))",
  scope: "hsl(var(--primary))",
  domain: "rgb(59,130,246)",
  subdomain: "rgb(34,211,238)",
  ip: "rgb(147,197,253)",
  url: "rgb(96,165,250)",
  endpoint: "rgb(56,189,248)",
  technology: "rgb(168,85,247)",
  service: "rgb(217,70,239)",
  dns: "rgb(139,92,246)",
  certificate: "rgb(236,72,153)",
  port: "rgb(20,184,166)",
  asset: "rgb(148,163,184)",
  finding: "rgb(244,63,94)",
  evidence: "rgb(251,191,36)",
  http: "rgb(52,211,153)",
  poc: "rgb(248,113,113)",
  report: "rgb(250,204,21)",
  note: "rgb(253,224,71)",
  task: "rgb(163,230,53)",
  timeline: "rgb(148,163,184)",
};

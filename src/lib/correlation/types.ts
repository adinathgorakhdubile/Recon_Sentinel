/**
 * Vulnerability Correlation Engine — core types.
 *
 * The correlation engine connects related workspace entities (Findings,
 * Assets, HTTP traffic, Evidence, PoCs, Reports, imported scan results)
 * through explainable relationships built on top of the Knowledge Graph
 * and shared fingerprints (CWE, technology, endpoint, host, payload).
 *
 * Design goals:
 *   • Score every correlation with human-readable reasons.
 *   • Preserve all original records — merges are logical, never destructive.
 *   • Full audit history for every analyst action (approve, reject, merge).
 *   • Composable: future AI-assisted triage, risk prioritization, exposure
 *     analysis, and external scanner integrations plug in as new
 *     `CorrelationRuleId` values and `CorrelationSourceKind`s.
 */

import type { LinkableType, Severity } from "@/types";

export type CorrelationEntityType = Extract<
  LinkableType,
  "finding" | "asset" | "http" | "evidence" | "poc" | "report" | "note"
> | "technology" | "endpoint";

export type CorrelationRuleId =
  | "duplicate-finding"
  | "shared-cwe"
  | "shared-technology"
  | "same-endpoint"
  | "same-host"
  | "shared-evidence"
  | "shared-poc"
  | "recurring-across-assets"
  | "common-root-cause"
  | "evidence-reuse"
  | "http-fingerprint"
  | "title-similarity";

export type CorrelationClusterKind =
  | "duplicate"        // likely same finding surfaced multiple times
  | "recurring"        // same issue across multiple assets
  | "root-cause"       // shared technology / component
  | "evidence-reuse"   // finding could reuse existing evidence/PoC
  | "endpoint-group"   // findings hitting the same endpoint
  | "asset-group";     // findings on the same host / asset

export type CorrelationStatus =
  | "open"        // detected, awaiting analyst review
  | "queued"      // pushed to investigation queue
  | "approved"    // analyst approved the link/merge
  | "rejected"    // analyst dismissed as false positive
  | "merged"      // analyst merged into a canonical record
  | "resolved";   // relationship resolved (e.g. finding closed)

export interface CorrelationEntityRef {
  type: CorrelationEntityType;
  id: string;
  /** Display label captured at detection time (records may drift). */
  label?: string;
  /** Optional severity captured at detection time. */
  severity?: Severity;
}

export interface CorrelationSignal {
  ruleId: CorrelationRuleId;
  /** 0..1 partial score contribution for this signal. */
  weight: number;
  /** Human-readable explanation. */
  reason: string;
  /** Free-form structured metadata (matched CWE, technology, etc). */
  meta?: Record<string, unknown>;
}

export interface CorrelationCluster {
  id: string;
  programId: string | null;
  kind: CorrelationClusterKind;
  /** Aggregate correlation score 0..1 with 1.0 = near-certain match. */
  score: number;
  title: string;
  summary: string;
  /** All entities participating in the cluster. */
  members: CorrelationEntityRef[];
  /** Rules & explanations that produced this cluster. */
  signals: CorrelationSignal[];
  /** Canonical / primary member (analyst-chosen or engine-picked). */
  primaryId?: string;
  status: CorrelationStatus;
  /** Tags surfaced from members (CWE, technology, host). */
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Non-destructive audit trail. */
  history: CorrelationAuditEntry[];
}

export type CorrelationAuditAction =
  | "detected"
  | "approved"
  | "rejected"
  | "queued"
  | "merged"
  | "unmerged"
  | "primary-changed"
  | "linked"
  | "note-added"
  | "resolved";

export interface CorrelationAuditEntry {
  id: string;
  action: CorrelationAuditAction;
  ts: number;
  actor?: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface CorrelationRunSummary {
  programId: string | null;
  ranAt: number;
  clustersCreated: number;
  clustersUpdated: number;
  clustersUnchanged: number;
  scanned: {
    findings: number;
    assets: number;
    http: number;
    evidence: number;
    pocs: number;
  };
}

export interface CorrelationFilters {
  kinds: CorrelationClusterKind[];
  status: CorrelationStatus[];
  minScore: number;
  query: string;
  tags: string[];
}

export const DEFAULT_CORR_FILTERS: CorrelationFilters = {
  kinds: [],
  status: ["open", "queued"],
  minScore: 0.35,
  query: "",
  tags: [],
};

export const CLUSTER_KIND_LABELS: Record<CorrelationClusterKind, string> = {
  duplicate: "Likely Duplicate",
  recurring: "Recurring Issue",
  "root-cause": "Common Root Cause",
  "evidence-reuse": "Evidence Reuse",
  "endpoint-group": "Endpoint Group",
  "asset-group": "Asset Group",
};

export const STATUS_LABELS: Record<CorrelationStatus, string> = {
  open: "Open",
  queued: "In Queue",
  approved: "Approved",
  rejected: "Rejected",
  merged: "Merged",
  resolved: "Resolved",
};

export const RULE_LABELS: Record<CorrelationRuleId, string> = {
  "duplicate-finding": "Duplicate finding",
  "shared-cwe": "Shared CWE",
  "shared-technology": "Shared technology",
  "same-endpoint": "Same endpoint",
  "same-host": "Same host",
  "shared-evidence": "Shared evidence",
  "shared-poc": "Shared PoC",
  "recurring-across-assets": "Recurring across assets",
  "common-root-cause": "Common root cause",
  "evidence-reuse": "Evidence reuse opportunity",
  "http-fingerprint": "Matching HTTP fingerprint",
  "title-similarity": "Similar title / description",
};

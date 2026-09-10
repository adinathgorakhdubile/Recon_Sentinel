export type ID = string;

export interface Program {
  id: ID;
  name: string;
  targetRoot: string;
  inScope: string[];
  outScope: string[];
  rules: string;
  rateLimits: string;
  safeHarbor: string;
  createdAt: number;
}

export type ChecklistPhase =
  | "Scope Intelligence"
  | "Passive Reconnaissance"
  | "Active Discovery"
  | "Enumeration"
  | "Vulnerability Analysis"
  | "Exploitation"
  | "Evidence & Reporting";

export type ChecklistCategory = "General" | "Web" | "API" | "Cloud" | "AI";

export interface TaskCommand {
  label: string;
  cmd: string;
  note?: string;
}

export interface ChecklistTask {
  id: ID;
  programId: ID;
  phase: ChecklistPhase;
  category: ChecklistCategory;
  title: string;
  detail: string;
  completed: boolean;
  commands?: TaskCommand[];
}

export type AssetType =
  | "subdomain"
  | "endpoint"
  | "ip"
  | "cloud"
  | "repository"
  | "domain"
  | "url"
  | "port"
  | "technology"
  | "service"
  | "dns"
  | "certificate"
  | "screenshot"
  | "other";
export type AssetStatus = "new" | "triaging" | "in-scope" | "out-of-scope" | "archived";
export type Confidence = "low" | "medium" | "high";

export interface Asset {
  id: ID;
  programId: ID;
  name: string;
  type: AssetType;
  source: string;
  confidence: Confidence;
  status: AssetStatus;
  tags: string[];
  notes: string;
  createdAt: number;
}

export interface Note {
  id: ID;
  programId: ID;
  title: string;
  body: string;
  tags: string[];
  relatedAssetId?: ID;
  createdAt: number;
}

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus = "draft" | "validating" | "ready" | "submitted" | "closed";

export interface PocAttachment {
  id: ID;
  kind: "screenshot" | "recording";
  mime: string;
  dataUrl: string;
  caption?: string;
  createdAt: number;
  sizeBytes: number;
}

export interface Finding {
  id: ID;
  programId: ID;
  title: string;
  severity: Severity;
  affectedAsset: string;
  evidence: string;
  reproductionSteps: string;
  impact: string;
  status: FindingStatus;
  reconOutput?: string;
  nextSteps?: string;
  cvss?: string;
  owaspRefs?: string[];
  cwe?: string;
  remediation?: string;
  tags?: string[];
  pocAttachments?: PocAttachment[];
  createdAt: number;
}

/** Cross-entity relationship linking any two workspace records. */
export type LinkableType =
  | "program"
  | "task"
  | "asset"
  | "note"
  | "finding"
  | "evidence"
  | "report"
  | "http"
  | "poc";

export type LinkKind =
  | "relates-to"
  | "supports"
  | "supersedes"
  | "duplicates"
  | "blocks"
  | "derived-from"
  | "hosts"
  | "resolves-to";

export interface EntityLink {
  id: ID;
  programId: ID | null;
  fromType: LinkableType;
  fromId: ID;
  toType: LinkableType;
  toId: ID;
  kind: LinkKind;
  note?: string;
  createdAt: number;
}

export interface WorkspaceState {
  programs: Program[];
  tasks: ChecklistTask[];
  assets: Asset[];
  notes: Note[];
  findings: Finding[];
  activeProgramId: ID | null;
}

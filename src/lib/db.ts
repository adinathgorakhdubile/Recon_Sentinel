import Dexie, { type Table } from "dexie";
import type {
  Asset,
  ChecklistTask,
  EntityLink,
  Finding,
  Note,
  PocAttachment,
  Program,
} from "@/types";
import type { ReconRun } from "@/lib/recon/types";
import type { AssetIntel } from "@/lib/assets/intel";

export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "completed"
  | "uncompleted"
  | "imported"
  | "exported"
  | "ai"
  | "linked"
  | "unlinked"
  | "reset";

export type ActivityEntity =
  | "program"
  | "task"
  | "asset"
  | "note"
  | "finding"
  | "evidence"
  | "report"
  | "link"
  | "template"
  | "ai"
  | "recon"
  | "http"
  | "poc";

export interface ActivityEvent {
  id: string;
  ts: number;
  programId: string | null;
  entityType: ActivityEntity;
  entityId: string;
  action: ActivityAction;
  summary: string;
  meta?: Record<string, unknown>;
}

export type SearchEntityType =
  | "program"
  | "task"
  | "asset"
  | "note"
  | "finding"
  | "evidence"
  | "report"
  | "tag"
  | "encyclopedia";

export interface SearchDoc {
  /** `${entityType}:${entityId}` */
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  programId: string | null;
  title: string;
  subtitle?: string;
  body: string;
  tags: string[];
  tokens: string[];
  route: string;
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

// PoC attachments live in a separate table; the finding row keeps only ids.
export interface StoredPocAttachment extends Omit<PocAttachment, "dataUrl"> {
  findingId: string;
  blob: Blob;
}

// Stored shape strips the (potentially large) embedded arrays; commands stay on
// task rows because they're small and always fetched together.
export type StoredFinding = Omit<Finding, "pocAttachments"> & {
  pocAttachmentIds: string[];
};

export class WorkbenchDB extends Dexie {
  programs!: Table<Program, string>;
  tasks!: Table<ChecklistTask, string>;
  assets!: Table<Asset, string>;
  notes!: Table<Note, string>;
  findings!: Table<StoredFinding, string>;
  pocAttachments!: Table<StoredPocAttachment, string>;
  activity!: Table<ActivityEvent, string>;
  searchDocs!: Table<SearchDoc, string>;
  links!: Table<EntityLink, string>;
  reconRuns!: Table<ReconRun, string>;
  assetIntel!: Table<AssetIntel, string>;
  workflows!: Table<import("@/lib/automation/types").Workflow, string>;
  workflowRuns!: Table<import("@/lib/automation/types").WorkflowRun, string>;
  evidence!: Table<import("@/lib/evidence/types").EvidenceItem, string>;
  evidenceBlobs!: Table<import("@/lib/evidence/types").EvidenceBlob, string>;
  evidenceAnnotations!: Table<import("@/lib/evidence/types").EvidenceAnnotation, string>;
  http!: Table<import("@/lib/http/types").HttpItem, string>;
  httpCollections!: Table<import("@/lib/http/types").HttpCollection, string>;
  pocs!: Table<import("@/lib/poc/types").PocDoc, string>;
  reports!: Table<import("@/lib/report/types").ReportDoc, string>;
  graphViews!: Table<import("@/lib/graph/types").SavedGraphView, string>;
  graphSnapshots!: Table<import("@/lib/graph/types").StoredGraphSnapshot, string>;
  attackPaths!: Table<import("@/lib/attackpath/types").AttackPath, string>;
  correlationClusters!: Table<import("@/lib/correlation/types").CorrelationCluster, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("recon-workbench");
    this.version(1).stores({
      programs: "&id, createdAt, name",
      tasks: "&id, programId, phase, category, completed, [programId+phase]",
      assets: "&id, programId, type, status, createdAt, *tags",
      notes: "&id, programId, createdAt, relatedAssetId, *tags",
      findings: "&id, programId, status, severity, createdAt",
      pocAttachments: "&id, findingId, kind, createdAt",
      activity: "&id, ts, programId, entityType, entityId, action",
      meta: "&key",
    });
    this.version(2).stores({
      searchDocs: "&id, entityType, entityId, programId, updatedAt, *tokens, *tags",
    });
    this.version(3).stores({
      links: "&id, programId, createdAt, [fromType+fromId], [toType+toId], kind",
      findings: "&id, programId, status, severity, createdAt, *tags",
    });
    this.version(4).stores({
      reconRuns: "&id, programId, stage, importerId, createdAt, [programId+stage]",
    });
    this.version(5).stores({
      assetIntel: "&assetId, programId, kind, riskScore, health, updatedAt, *technologies, *ports",
    });
    this.version(6).stores({
      workflows: "&id, programId, updatedAt, createdAt, *tags",
      workflowRuns: "&id, workflowId, programId, status, createdAt, [programId+status]",
    });
    this.version(7).stores({
      evidence: "&id, programId, kind, folder, sha256, createdAt, updatedAt, *tags",
      evidenceBlobs: "&id, evidenceId, createdAt",
      evidenceAnnotations: "&id, evidenceId, kind, createdAt",
    });
    this.version(8).stores({
      http: "&id, programId, source, collectionId, fingerprint, favorite, createdAt, updatedAt, *tags",
      httpCollections: "&id, programId, name, updatedAt",
    });
    this.version(9).stores({
      pocs: "&id, programId, status, severity, isTemplate, findingId, createdAt, updatedAt, *tags",
    });
    this.version(10).stores({
      reports: "&id, programId, format, updatedAt, createdAt",
    });
    this.version(11).stores({
      graphViews: "&id, programId, updatedAt, createdAt",
      graphSnapshots: "&id, programId, createdAt",
    });
    this.version(12).stores({
      attackPaths: "&id, programId, status, updatedAt, createdAt, *tags",
    });
    this.version(13).stores({
      correlationClusters: "&id, programId, kind, status, score, updatedAt, createdAt, *tags",
    });
  }
}

export const db = new WorkbenchDB();

export const META_KEYS = {
  schemaVersion: "schemaVersion",
  migratedAt: "migratedAt",
  activeProgramId: "activeProgramId",
  dashboardConfig: "dashboardConfig",
} as const;

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

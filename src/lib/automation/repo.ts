import { db } from "@/lib/db";
import type { Workflow, WorkflowRun } from "./types";

export async function listWorkflows(programId: string | null): Promise<Workflow[]> {
  if (programId) {
    return db.workflows.where("programId").equals(programId).reverse().sortBy("updatedAt");
  }
  return db.workflows.orderBy("updatedAt").reverse().toArray();
}

export async function saveWorkflow(w: Workflow): Promise<void> {
  w.updatedAt = Date.now();
  await db.workflows.put(w);
}

export async function deleteWorkflow(id: string): Promise<void> {
  await db.workflows.delete(id);
  // orphan runs are kept for audit trail
}

export async function listRuns(programId: string | null, limit = 50): Promise<WorkflowRun[]> {
  const q = programId
    ? db.workflowRuns.where("programId").equals(programId)
    : db.workflowRuns.toCollection();
  const rows = await q.reverse().sortBy("createdAt");
  return rows.slice(0, limit);
}

export async function getRun(id: string): Promise<WorkflowRun | undefined> {
  return db.workflowRuns.get(id);
}

import { db, type ActivityAction, type ActivityEntity, type ActivityEvent } from "@/lib/db";
import { uid } from "@/lib/seed";

export async function logActivity(input: {
  programId: string | null;
  entityType: ActivityEntity;
  entityId: string;
  action: ActivityAction;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const row: ActivityEvent = {
    id: uid("act"),
    ts: Date.now(),
    ...input,
  };
  await db.activity.put(row);
}

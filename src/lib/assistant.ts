import type { Asset, ChecklistTask, Finding, Note, Program } from "@/types";

export type Priority = "critical" | "high" | "medium" | "low";

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  category: "safety" | "scope" | "recon" | "evidence" | "reporting";
}

export function computeRecommendations(
  program: Program | null,
  tasks: ChecklistTask[],
  assets: Asset[],
  notes: Note[],
  findings: Finding[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  if (!program) {
    recs.push({
      id: "no-program",
      title: "Create a program workspace",
      detail: "Start by defining the authorized program you're testing. Scope comes before any recon activity.",
      priority: "critical",
      category: "scope",
    });
    return recs;
  }

  const scopeMissing = !program.targetRoot || program.inScope.length === 0 || !program.rules.trim();
  if (scopeMissing) {
    recs.push({
      id: "lock-scope",
      title: "Lock scope before testing",
      detail: "Target root, in-scope assets, and rules of engagement must be captured before you touch any live system.",
      priority: "critical",
      category: "safety",
    });
  }
  if (!program.safeHarbor.trim()) {
    recs.push({
      id: "safe-harbor",
      title: "Record the safe-harbor language",
      detail: "Paste the program's safe-harbor / authorization language into Scope & Rules so you always have it on hand.",
      priority: "high",
      category: "safety",
    });
  }
  if (!program.rateLimits.trim()) {
    recs.push({
      id: "rate-limits",
      title: "Document rate limits",
      detail: "Capture explicit rate limits before any active discovery. If unspecified, default to conservative manual testing.",
      priority: "high",
      category: "safety",
    });
  }

  const untaggedAssets = assets.filter((a) => !a.source || a.source.trim() === "");
  if (untaggedAssets.length > 0) {
    recs.push({
      id: "asset-sources",
      title: "Add source notes to assets",
      detail: `${untaggedAssets.length} asset(s) are missing a source. Record where each was discovered for defensibility.`,
      priority: "medium",
      category: "recon",
    });
  }

  const draftFindings = findings.filter((f) => f.status === "draft");
  const weakFindings = findings.filter((f) => !f.reproductionSteps.trim() || !f.evidence.trim());
  if (weakFindings.length > 0) {
    recs.push({
      id: "weak-findings",
      title: "Strengthen finding evidence",
      detail: `${weakFindings.length} finding(s) are missing evidence or reproduction steps. Capture request/response pairs and timestamps.`,
      priority: "high",
      category: "evidence",
    });
  }
  if (draftFindings.length > 0) {
    recs.push({
      id: "advance-drafts",
      title: "Advance draft findings",
      detail: `Move ${draftFindings.length} draft finding(s) into validation once you have reproducible evidence.`,
      priority: "medium",
      category: "reporting",
    });
  }

  const triagingAssets = assets.filter((a) => a.status === "triaging" || a.status === "new");
  const hypothesisNotes = notes.filter((n) => /hypothesis|maybe|worth testing|suspect|idor|ssrf|auth/i.test(n.title + " " + n.body));
  if (hypothesisNotes.length > 0 && draftFindings.length === 0 && findings.length === 0) {
    recs.push({
      id: "convert-hypothesis",
      title: "Convert a hypothesis into a finding draft",
      detail: "You have notes that look like security hypotheses. Promote the strongest one to a Finding draft so it can be validated.",
      priority: "medium",
      category: "reporting",
    });
  }

  const totalTasks = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pct = totalTasks === 0 ? 0 : Math.round((done / totalTasks) * 100);
  if (pct < 40 && assets.length === 0) {
    recs.push({
      id: "start-passive",
      title: "Start with passive reconnaissance",
      detail: "Populate assets from public sources first (CT logs, DNS aggregators) before touching live targets.",
      priority: "medium",
      category: "recon",
    });
  }

  if (triagingAssets.length > 3) {
    recs.push({
      id: "triage",
      title: "Triage new assets",
      detail: `${triagingAssets.length} assets are still new/triaging. Confirm scope status before further work.`,
      priority: "low",
      category: "recon",
    });
  }

  recs.push({
    id: "reminder-safety",
    title: "Reminder: authorized testing only",
    detail: "If you drift outside stated scope or find sensitive data, stop and report immediately per the program's rules.",
    priority: "low",
    category: "safety",
  });

  const order: Priority[] = ["critical", "high", "medium", "low"];
  return recs.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
}

export function computeReadiness(
  program: Program | null,
  tasks: ChecklistTask[],
  assets: Asset[],
  notes: Note[],
  findings: Finding[],
): { score: number; label: string } {
  if (!program) return { score: 0, label: "No program" };
  let score = 0;
  if (program.targetRoot) score += 10;
  if (program.inScope.length > 0) score += 15;
  if (program.outScope.length > 0) score += 5;
  if (program.rules.trim()) score += 15;
  if (program.rateLimits.trim()) score += 5;
  if (program.safeHarbor.trim()) score += 5;
  const taskPct = tasks.length ? tasks.filter((t) => t.completed).length / tasks.length : 0;
  score += Math.round(taskPct * 25);
  if (assets.length > 0) score += Math.min(10, assets.length * 2);
  if (notes.length > 0) score += Math.min(5, notes.length);
  if (findings.length > 0) score += Math.min(5, findings.length * 2);
  score = Math.min(100, score);
  const label = score >= 80 ? "Combat ready" : score >= 55 ? "Operational" : score >= 30 ? "Warming up" : "Cold start";
  return { score, label };
}

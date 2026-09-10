import type { PocDoc, PocValidationIssue } from "./types";

/**
 * Lightweight structural validator. Returns an ordered list of issues so
 * the UI can surface actionable warnings before a PoC is submitted or
 * exported. This is intentionally conservative — anything a future
 * AI/automation pass wants to enforce can layer on top.
 */
export function validatePoc(doc: PocDoc): PocValidationIssue[] {
  const issues: PocValidationIssue[] = [];

  if (!doc.title.trim() || doc.title.trim() === "Untitled PoC") {
    issues.push({ level: "error", message: "Give the PoC a descriptive title." });
  }
  if (!doc.summary.trim()) {
    issues.push({ level: "warn", message: "Add a short summary describing the vulnerability." });
  }
  if (!doc.impact.trim()) {
    issues.push({ level: "warn", message: "Describe the impact of the finding." });
  }
  if (!doc.remediation.trim()) {
    issues.push({ level: "warn", message: "Suggest a remediation." });
  }
  if (doc.steps.length === 0) {
    issues.push({ level: "error", message: "Add at least one reproduction step." });
  }

  const evidenceStepKinds = new Set(["screenshot", "media", "http"]);
  const hasEvidenceStep = doc.steps.some((s) => evidenceStepKinds.has(s.kind));
  const hasAttachment = doc.steps.some((s) => s.attachments.length > 0);
  if (!hasEvidenceStep && !hasAttachment) {
    issues.push({
      level: "warn",
      message: "No evidence attached. Link a screenshot, HTTP request, or artifact.",
    });
  }

  doc.steps.forEach((s) => {
    if (!s.title.trim() && !s.body.trim() && !s.snippet?.trim()) {
      issues.push({ level: "warn", message: `Step ${s.order} is empty.`, stepId: s.id });
    }
    if ((s.kind === "http" || s.kind === "code" || s.kind === "terminal" || s.kind === "payload") && !s.snippet?.trim()) {
      issues.push({
        level: "warn",
        message: `Step ${s.order} (${s.kind}) is missing a snippet.`,
        stepId: s.id,
      });
    }
  });

  return issues;
}

export function summarizeIssues(issues: PocValidationIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warn").length,
  };
}

import type { Finding } from "@/types";
import type { ReportContext } from "./compose";
import type { ReportDoc, ReportValidationIssue } from "./types";

/**
 * Report-level completeness checks. Warns for missing evidence, PoCs,
 * remediation, CVSS/CWE and structural gaps. Future rule engines and
 * AI reviewers can layer additional validators on top of this list.
 */
export function validateReport(doc: ReportDoc, ctx: ReportContext): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];

  if (!doc.title.trim() || doc.title === "Untitled report") {
    issues.push({ level: "error", message: "Give the report a descriptive title." });
  }
  if (!doc.sections.some((s) => s.included)) {
    issues.push({ level: "error", message: "No sections are included in export." });
  }
  const kinds = new Set(doc.sections.filter((s) => s.included).map((s) => s.kind));
  if (!kinds.has("executive-summary")) {
    issues.push({ level: "warn", message: "No executive summary section." });
  }
  if (!kinds.has("finding-detail")) {
    issues.push({ level: "warn", message: "No detailed findings section." });
  }
  if (!kinds.has("remediation")) {
    issues.push({ level: "warn", message: "No remediation section." });
  }

  const scoped: Finding[] = doc.findingIds.length
    ? ctx.findings.filter((f) => doc.findingIds.includes(f.id))
    : ctx.findings;

  scoped.forEach((f) => {
    if (!f.impact?.trim()) {
      issues.push({ level: "warn", message: `Finding "${f.title}" is missing impact.`, findingId: f.id });
    }
    if (!f.remediation?.trim()) {
      issues.push({ level: "warn", message: `Finding "${f.title}" is missing remediation.`, findingId: f.id });
    }
    if (!f.reproductionSteps?.trim()) {
      issues.push({ level: "warn", message: `Finding "${f.title}" is missing reproduction steps.`, findingId: f.id });
    }
    if (!f.cvss) {
      issues.push({ level: "warn", message: `Finding "${f.title}" has no CVSS vector.`, findingId: f.id });
    }
    if (!f.cwe) {
      issues.push({ level: "warn", message: `Finding "${f.title}" has no CWE mapping.`, findingId: f.id });
    }
    const hasPoc = ctx.pocs.some((p) => p.findingId === f.id);
    if (!hasPoc) {
      issues.push({ level: "warn", message: `Finding "${f.title}" has no linked PoC.`, findingId: f.id });
    }
    const hasScreenshot = ctx.evidence.some(
      (e) => (e.mime.startsWith("image/") || e.kind === "screenshot"),
    );
    if (!hasScreenshot) {
      issues.push({ level: "warn", message: `Finding "${f.title}" has no linked screenshot evidence.`, findingId: f.id });
    }
  });

  return issues;
}

export function summarizeIssues(issues: ReportValidationIssue[]) {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warn").length,
  };
}

import type { PocDoc } from "./types";

function fence(lang: string | undefined, body: string): string {
  const l = lang ?? "";
  return `\`\`\`${l}\n${body.trim()}\n\`\`\``;
}

/** Render a PoC to markdown suitable for reports, GitHub issues, or export. */
export function pocToMarkdown(doc: PocDoc): string {
  const lines: string[] = [];
  lines.push(`# ${doc.title || "Untitled PoC"}`);
  lines.push("");
  lines.push(`**Severity:** ${doc.severity.toUpperCase()}  |  **Status:** ${doc.status}`);
  if (doc.tags.length) lines.push(`**Tags:** ${doc.tags.join(", ")}`);
  lines.push("");

  if (doc.summary.trim()) {
    lines.push("## Summary", "", doc.summary.trim(), "");
  }
  if (doc.prerequisites.trim()) {
    lines.push("## Prerequisites", "", doc.prerequisites.trim(), "");
  }

  if (doc.steps.length) {
    lines.push("## Reproduction Steps", "");
    doc.steps.forEach((s, i) => {
      lines.push(`### Step ${i + 1}${s.title ? ` — ${s.title}` : ""}`);
      lines.push("");
      if (s.body.trim()) lines.push(s.body.trim(), "");
      if (s.snippet?.trim()) {
        lines.push(fence(s.language, s.snippet), "");
      }
      if (s.expected?.trim()) {
        lines.push(`**Expected:** ${s.expected.trim()}`, "");
      }
      if (s.attachments.length) {
        lines.push("**Attached evidence:**");
        s.attachments.forEach((a) => {
          lines.push(`- ${a.refType}:${a.refId}${a.caption ? ` — ${a.caption}` : ""}`);
        });
        lines.push("");
      }
    });
  }

  if (doc.impact.trim()) lines.push("## Impact", "", doc.impact.trim(), "");
  if (doc.remediation.trim()) lines.push("## Remediation", "", doc.remediation.trim(), "");
  if (doc.references.length) {
    lines.push("## References", "");
    doc.references.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  return lines.join("\n");
}

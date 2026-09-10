import type { Asset, ChecklistTask, Finding, Note, Program } from "@/types";

export function buildMarkdownReport(
  program: Program,
  tasks: ChecklistTask[],
  assets: Asset[],
  notes: Note[],
  findings: Finding[],
): string {
  const lines: string[] = [];
  lines.push(`# Recon Report — ${program.name}`);
  lines.push("");
  lines.push(`_Generated ${new Date().toLocaleString()} · Authorized testing only._`);
  lines.push("");
  lines.push("## Scope");
  lines.push(`- **Target root:** ${program.targetRoot || "_not set_"}`);
  lines.push(`- **In-scope:** ${program.inScope.join(", ") || "_none listed_"}`);
  lines.push(`- **Out-of-scope:** ${program.outScope.join(", ") || "_none listed_"}`);
  lines.push("");
  lines.push("### Rules of engagement");
  lines.push(program.rules || "_not documented_");
  lines.push("");
  lines.push("### Rate limits");
  lines.push(program.rateLimits || "_not documented_");
  lines.push("");
  lines.push("### Safe harbor");
  lines.push(program.safeHarbor || "_not documented_");
  lines.push("");
  lines.push("## Checklist progress");
  const grouped = tasks.reduce<Record<string, ChecklistTask[]>>((acc, t) => {
    (acc[t.phase] ||= []).push(t);
    return acc;
  }, {});
  for (const phase of Object.keys(grouped)) {
    lines.push(`### ${phase}`);
    for (const t of grouped[phase]) {
      lines.push(`- [${t.completed ? "x" : " "}] ${t.title}`);
    }
    lines.push("");
  }
  lines.push("## Assets");
  if (assets.length === 0) lines.push("_No assets recorded._");
  for (const a of assets) {
    lines.push(`- **${a.name}** _(${a.type} · ${a.status} · ${a.confidence} confidence)_ — source: ${a.source || "?"}`);
    if (a.notes) lines.push(`  - ${a.notes}`);
  }
  lines.push("");
  lines.push("## Notebook");
  if (notes.length === 0) lines.push("_No notes recorded._");
  for (const n of notes) {
    lines.push(`### ${n.title}`);
    lines.push(`_${new Date(n.createdAt).toLocaleString()} · tags: ${n.tags.join(", ") || "—"}_`);
    lines.push("");
    lines.push(n.body);
    lines.push("");
  }
  lines.push("## Findings");
  if (findings.length === 0) lines.push("_No findings drafted._");
  for (const f of findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`_Status: ${f.status} · Affected: ${f.affectedAsset}_`);
    lines.push("");
    lines.push("**Impact**");
    lines.push(f.impact || "_not documented_");
    lines.push("");
    lines.push("**Evidence**");
    lines.push(f.evidence || "_not documented_");
    lines.push("");
    lines.push("**Reproduction steps**");
    lines.push(f.reproductionSteps || "_not documented_");
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

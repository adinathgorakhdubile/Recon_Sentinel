// Industry-grade report builders: detailed pentest template + platform-specific
// (HackerOne, Bugcrowd, Intigriti) submission drafts. Also encyclopedia matcher.
import type { Asset, ChecklistTask, Finding, Note, Program } from "@/types";
import { ENCYCLOPEDIA, type VulnCard } from "./encyclopedia";

export type ReportFormat = "standard" | "detailed" | "hackerone" | "bugcrowd" | "intigriti";

export const REPORT_FORMATS: { id: ReportFormat; label: string; hint: string }[] = [
  { id: "standard", label: "Standard summary", hint: "Original concise workspace report." },
  { id: "detailed", label: "Detailed pentest report", hint: "Executive summary, methodology, CVSS, remediation, refs (PTES / NIST SP 800-115 style)." },
  { id: "hackerone", label: "HackerOne submission draft", hint: "Per-finding drafts using the HackerOne report template." },
  { id: "bugcrowd", label: "Bugcrowd submission draft", hint: "Per-finding drafts with VRT hints." },
  { id: "intigriti", label: "Intigriti submission draft", hint: "Per-finding drafts using Intigriti's structured template." },
];

export function matchEncyclopedia(f: Pick<Finding, "title" | "impact" | "evidence" | "owaspRefs">): VulnCard[] {
  const explicit = (f.owaspRefs ?? []).map((r) => r.toLowerCase());
  const explicitHits = ENCYCLOPEDIA.filter((c) =>
    explicit.some((r) => c.id.toLowerCase() === r || c.code.toLowerCase() === r),
  );
  if (explicitHits.length) return explicitHits;
  const hay = `${f.title} ${f.impact} ${f.evidence}`.toLowerCase();
  const scored = ENCYCLOPEDIA.map((c) => {
    const kws = [c.title, ...(c.cwe ? [c.cwe] : []), c.code, ...c.signals]
      .join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const uniq = Array.from(new Set(kws));
    const score = uniq.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= 3).slice(0, 2).map((s) => s.c);
}

export function buildAttackChain(findings: Finding[], assets: Asset[], notes: Note[]): string[] {
  const lines: string[] = [];
  for (const f of findings) {
    const asset = assets.find((a) => a.name === f.affectedAsset);
    const linkedNotes = notes.filter((n) => asset && n.relatedAssetId === asset.id);
    const chain = [
      asset ? `Asset \`${asset.name}\` (${asset.type})` : "Unmapped asset",
      linkedNotes.length ? `${linkedNotes.length} recon note(s)` : null,
      f.reconOutput ? "tool output captured" : null,
      `Finding: **${f.title}** [${f.severity.toUpperCase()}]`,
      f.nextSteps ? "AI next-step plan drafted" : null,
    ].filter(Boolean);
    lines.push("- " + chain.join(" → "));
  }
  return lines.length ? lines : ["- _No linked chains yet._"];
}

function scopeBlock(p: Program): string {
  return [
    "## Scope",
    `- **Target root:** ${p.targetRoot || "_not set_"}`,
    `- **In-scope:** ${p.inScope.join(", ") || "_none listed_"}`,
    `- **Out-of-scope:** ${p.outScope.join(", ") || "_none listed_"}`,
    "",
    "### Rules of engagement",
    p.rules || "_not documented_",
    "",
    "### Rate limits",
    p.rateLimits || "_not documented_",
    "",
    "### Safe harbor / authorization",
    p.safeHarbor || "_not documented_",
    "",
  ].join("\n");
}

function pocBlock(f: Finding, indent = ""): string {
  if (!f.pocAttachments?.length) return "";
  const rows = f.pocAttachments.map((a) => {
    const size = (a.sizeBytes / 1024).toFixed(1);
    return `${indent}- ${a.kind === "screenshot" ? "🖼" : "🎥"} ${a.caption || a.kind} — ${a.mime}, ${size} KB (embedded in workspace)`;
  });
  return `\n${indent}**PoC attachments**\n${rows.join("\n")}\n`;
}

function findingHeaderMeta(f: Finding, cards: VulnCard[]): string[] {
  const lines: string[] = [];
  lines.push(`- **Severity:** ${f.severity.toUpperCase()}`);
  if (f.cvss) lines.push(`- **CVSS:** \`${f.cvss}\``);
  if (f.cwe) lines.push(`- **CWE:** ${f.cwe}`);
  if (cards.length) lines.push(`- **OWASP mapping:** ${cards.map((c) => `${c.code} ${c.title}`).join("; ")}`);
  lines.push(`- **Status:** ${f.status}`);
  lines.push(`- **Affected asset:** \`${f.affectedAsset || "unspecified"}\``);
  return lines;
}

export function buildDetailedReport(
  program: Program,
  tasks: ChecklistTask[],
  assets: Asset[],
  notes: Note[],
  findings: Finding[],
): string {
  const now = new Date();
  const bySev = (s: string) => findings.filter((f) => f.severity === s).length;
  const doneTasks = tasks.filter((t) => t.completed).length;
  const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const lines: string[] = [];
  lines.push(`# Security Assessment Report — ${program.name}`);
  lines.push("");
  lines.push(`_Generated ${now.toLocaleString()} · Classification: **CONFIDENTIAL** · Authorized testing only._`);
  lines.push("");
  lines.push("## 1. Executive Summary");
  lines.push(
    `This document summarizes the security assessment of **${program.name}** (target root \`${program.targetRoot || "n/a"}\`). ` +
    `The engagement produced **${findings.length}** finding(s) across **${assets.length}** in-scope asset(s), ` +
    `completing **${pct}%** of the planned playbook.`,
  );
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|---|---|");
  ["critical", "high", "medium", "low", "info"].forEach((s) => lines.push(`| ${s} | ${bySev(s)} |`));
  lines.push("");

  lines.push("## 2. Scope & Rules of Engagement");
  lines.push(scopeBlock(program));

  lines.push("## 3. Methodology");
  lines.push("Assessment follows a hybrid of PTES, OWASP WSTG/ASVS, and NIST SP 800-115:");
  lines.push("1. Scope intelligence & authorization confirmation");
  lines.push("2. Passive reconnaissance (OSINT, CT logs, DNS, code search)");
  lines.push("3. Active discovery within permitted rate limits");
  lines.push("4. Service / endpoint / parameter / auth enumeration");
  lines.push("5. Vulnerability analysis mapped to OWASP Web/API/LLM Top 10");
  lines.push("6. Controlled exploitation & impact validation");
  lines.push("7. Evidence capture & reporting");
  lines.push("");

  lines.push("## 4. Playbook Coverage");
  const grouped = tasks.reduce<Record<string, ChecklistTask[]>>((acc, t) => {
    const k = `${t.category} · ${t.phase}`;
    (acc[k] ||= []).push(t);
    return acc;
  }, {});
  for (const k of Object.keys(grouped)) {
    const g = grouped[k];
    const d = g.filter((t) => t.completed).length;
    lines.push(`### ${k} — ${d}/${g.length}`);
    for (const t of g) lines.push(`- [${t.completed ? "x" : " "}] ${t.title}`);
    lines.push("");
  }

  lines.push("## 5. Asset Inventory");
  if (!assets.length) lines.push("_No assets recorded._");
  else {
    lines.push("| Asset | Type | Status | Confidence | Source |");
    lines.push("|---|---|---|---|---|");
    for (const a of assets) lines.push(`| \`${a.name}\` | ${a.type} | ${a.status} | ${a.confidence} | ${a.source || "?"} |`);
  }
  lines.push("");

  lines.push("## 6. Attack Chain Map");
  lines.push(...buildAttackChain(findings, assets, notes));
  lines.push("");

  lines.push("## 7. Findings");
  if (!findings.length) lines.push("_No findings drafted._");
  findings.forEach((f, i) => {
    const cards = matchEncyclopedia(f);
    lines.push(`### 7.${i + 1} [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(...findingHeaderMeta(f, cards));
    lines.push("");
    lines.push("**Description / Impact**");
    lines.push(f.impact || "_not documented_");
    lines.push("");
    lines.push("**Evidence**");
    lines.push(f.evidence || "_not documented_");
    lines.push("");
    lines.push("**Reproduction Steps**");
    lines.push(f.reproductionSteps || "_not documented_");
    lines.push("");
    if (f.reconOutput) {
      lines.push("**Recon / Tool Output**");
      lines.push("```");
      lines.push(f.reconOutput.slice(0, 4000));
      lines.push("```");
      lines.push("");
    }
    lines.push("**Remediation**");
    lines.push(f.remediation || cards[0]?.fix || "_pending — see references below_");
    lines.push("");
    if (cards.length) {
      lines.push("**References**");
      cards.forEach((c) => c.refs.forEach((r) => lines.push(`- [${r.label}](${r.url})`)));
      lines.push("");
    }
    if (f.nextSteps) {
      lines.push("**AI-suggested next steps**");
      lines.push("> " + f.nextSteps.split("\n").join("\n> "));
      lines.push("");
    }
    lines.push(pocBlock(f));
  });

  lines.push("## 8. Researcher Notebook");
  if (!notes.length) lines.push("_No notes recorded._");
  for (const n of notes) {
    lines.push(`### ${n.title}`);
    lines.push(`_${new Date(n.createdAt).toLocaleString()} · tags: ${n.tags.join(", ") || "—"}_`);
    lines.push("");
    lines.push(n.body);
    lines.push("");
  }

  lines.push("## 9. Appendix — OWASP / Encyclopedia References");
  const usedCards = new Map<string, VulnCard>();
  findings.forEach((f) => matchEncyclopedia(f).forEach((c) => usedCards.set(c.id, c)));
  if (!usedCards.size) lines.push("_No mapped OWASP references._");
  else usedCards.forEach((c) => {
    lines.push(`- **${c.code} — ${c.title}** (${c.family}${c.cwe ? `, ${c.cwe}` : ""}): ${c.summary}`);
  });
  lines.push("");
  lines.push("---");
  lines.push("_Prepared with Recon Workbench. Redact PII before external sharing._");
  return lines.join("\n");
}

function h1Draft(f: Finding, cards: VulnCard[]): string {
  return [
    `# ${f.title}`,
    "",
    "## Summary",
    f.impact || "_Describe the vulnerability and its business impact in 2–3 sentences._",
    "",
    "## Affected asset(s)",
    `- \`${f.affectedAsset || "specify URL / endpoint"}\``,
    "",
    "## Steps to Reproduce",
    f.reproductionSteps || "1. …\n2. …\n3. …",
    "",
    "## Supporting Material / References",
    ...(cards.length ? cards.flatMap((c) => c.refs.map((r) => `- [${r.label}](${r.url})`)) : ["- _Attach PoC screenshots, HAR file, video._"]),
    "",
    "## Impact",
    f.impact || "_What can an attacker do? What data/systems are exposed?_",
    "",
    f.cvss ? `**CVSS:** \`${f.cvss}\`` : "**CVSS:** _score via https://www.first.org/cvss/calculator/3.1_",
    cards.length ? `\n**Weakness:** ${cards[0].code} — ${cards[0].title}${cards[0].cwe ? ` (${cards[0].cwe})` : ""}` : "",
    pocBlock(f),
    "",
    "> H1 tip: use Markdown, attach media via the attachment tray (not inline base64), pick the closest CWE from the dropdown, set severity via CVSSv3.1.",
  ].filter(Boolean).join("\n");
}

function bugcrowdDraft(f: Finding, cards: VulnCard[]): string {
  return [
    `# ${f.title}`,
    "",
    "**VRT category:** _pick from https://bugcrowd.com/vulnerability-rating-taxonomy — suggestion below_",
    cards.length ? `- Suggested: ${cards[0].code} → ${cards[0].title}` : "- _Suggest a VRT node before submitting._",
    "",
    "## Description",
    f.impact || "_2–3 sentence overview._",
    "",
    "## Target",
    `- \`${f.affectedAsset || "target URL"}\``,
    "",
    "## Steps to Reproduce",
    f.reproductionSteps || "1. …",
    "",
    "## Proof of Concept",
    f.evidence || "_Paste request/response, screenshots, or link to video._",
    pocBlock(f),
    "",
    "## Impact",
    f.impact || "_Business impact, data exposure, affected users._",
    "",
    "## Remediation",
    f.remediation || cards[0]?.fix || "_Recommended fix._",
    "",
    f.cvss ? `**CVSS:** \`${f.cvss}\`` : "",
    "",
    "> Bugcrowd tip: use the VRT selector honestly — inflated severity gets downgraded. Attach media via the submission form.",
  ].filter(Boolean).join("\n");
}

function intigritiDraft(f: Finding, cards: VulnCard[]): string {
  return [
    `# ${f.title}`,
    "",
    "## Domain / endpoint",
    `- \`${f.affectedAsset || "https://…"}\``,
    "",
    "## Vulnerability type",
    cards.length ? `${cards[0].code} — ${cards[0].title}${cards[0].cwe ? ` (${cards[0].cwe})` : ""}` : "_Select CWE / OWASP category._",
    "",
    "## Description",
    f.impact || "_Short explanation._",
    "",
    "## Proof of concept",
    f.evidence || "_Include requests, responses, and screenshots._",
    "",
    "## Steps to reproduce",
    f.reproductionSteps || "1. …",
    "",
    "## Impact",
    f.impact || "_Business impact._",
    "",
    "## Recommended fix",
    f.remediation || cards[0]?.fix || "_Suggested remediation._",
    "",
    f.cvss ? `**CVSSv3.1:** \`${f.cvss}\`` : "",
    pocBlock(f),
    "",
    "> Intigriti tip: fill every field — reports missing repro or impact are auto-rejected. Attach media via the platform.",
  ].filter(Boolean).join("\n");
}

export function buildPlatformReport(
  format: "hackerone" | "bugcrowd" | "intigriti",
  program: Program,
  findings: Finding[],
): string {
  const lines: string[] = [];
  const platform = format === "hackerone" ? "HackerOne" : format === "bugcrowd" ? "Bugcrowd" : "Intigriti";
  lines.push(`# ${platform} submission drafts — ${program.name}`);
  lines.push("");
  lines.push(`_Generated ${new Date().toLocaleString()} · ${findings.length} draft(s). Review before submitting._`);
  lines.push("");
  if (!findings.length) {
    lines.push("_No findings to submit yet._");
    return lines.join("\n");
  }
  findings.forEach((f, i) => {
    const cards = matchEncyclopedia(f);
    lines.push(`---`);
    lines.push(`## Draft ${i + 1} of ${findings.length}`);
    lines.push("");
    lines.push(format === "hackerone" ? h1Draft(f, cards)
      : format === "bugcrowd" ? bugcrowdDraft(f, cards)
      : intigritiDraft(f, cards));
    lines.push("");
  });
  return lines.join("\n");
}

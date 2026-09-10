import type { Asset, ChecklistTask, Finding, Note, PocAttachment, Program } from "@/types";
import type { VulnCard } from "@/lib/encyclopedia";
import type { SearchDoc } from "@/lib/db";
import { tokenize } from "./tokenize";

function docId(entityType: SearchDoc["entityType"], entityId: string): string {
  return `${entityType}:${entityId}`;
}

function baseTokens(parts: (string | undefined | null)[], tags: string[] = []): string[] {
  const source = parts.filter(Boolean).join(" ");
  const set = new Set<string>([...tokenize(source), ...tags.flatMap((t) => tokenize(t))]);
  return Array.from(set);
}

export function buildProgramDoc(p: Program): SearchDoc {
  return {
    id: docId("program", p.id),
    entityType: "program",
    entityId: p.id,
    programId: p.id,
    title: p.name,
    subtitle: p.targetRoot,
    body: [p.rules, p.rateLimits, p.safeHarbor, p.inScope.join(" "), p.outScope.join(" ")].join(" "),
    tags: [],
    tokens: baseTokens([p.name, p.targetRoot, p.rules, p.inScope.join(" "), p.outScope.join(" ")]),
    route: "/scope",
    updatedAt: Date.now(),
  };
}

export function buildTaskDoc(t: ChecklistTask): SearchDoc {
  const commandText = (t.commands ?? []).map((c) => `${c.label} ${c.cmd} ${c.note ?? ""}`).join(" ");
  return {
    id: docId("task", t.id),
    entityType: "task",
    entityId: t.id,
    programId: t.programId,
    title: t.title,
    subtitle: `${t.phase} · ${t.category}${t.completed ? " · done" : ""}`,
    body: [t.detail, commandText].join(" "),
    tags: [t.phase, t.category],
    tokens: baseTokens([t.title, t.detail, t.phase, t.category, commandText]),
    route: "/checklist",
    updatedAt: Date.now(),
  };
}

export function buildAssetDoc(a: Asset): SearchDoc {
  return {
    id: docId("asset", a.id),
    entityType: "asset",
    entityId: a.id,
    programId: a.programId,
    title: a.name,
    subtitle: `${a.type} · ${a.status}`,
    body: [a.notes, a.source, a.tags.join(" ")].join(" "),
    tags: a.tags ?? [],
    tokens: baseTokens([a.name, a.notes, a.source, a.type, a.status], a.tags),
    route: "/assets",
    updatedAt: Date.now(),
  };
}

export function buildNoteDoc(n: Note): SearchDoc {
  return {
    id: docId("note", n.id),
    entityType: "note",
    entityId: n.id,
    programId: n.programId,
    title: n.title,
    subtitle: (n.tags ?? []).join(", "),
    body: n.body,
    tags: n.tags ?? [],
    tokens: baseTokens([n.title, n.body], n.tags),
    route: "/notebook",
    updatedAt: Date.now(),
  };
}

export function buildFindingDoc(f: Finding): SearchDoc {
  return {
    id: docId("finding", f.id),
    entityType: "finding",
    entityId: f.id,
    programId: f.programId,
    title: f.title,
    subtitle: `${f.severity} · ${f.status}${f.cwe ? ` · ${f.cwe}` : ""}`,
    body: [f.evidence, f.impact, f.reproductionSteps, f.remediation, f.affectedAsset, (f.owaspRefs ?? []).join(" ")].join(" "),
    tags: [f.severity, f.status, ...(f.owaspRefs ?? [])],
    tokens: baseTokens(
      [f.title, f.evidence, f.impact, f.reproductionSteps, f.remediation, f.affectedAsset, f.cvss, f.cwe],
      [f.severity, f.status, ...(f.owaspRefs ?? [])],
    ),
    route: "/findings",
    updatedAt: Date.now(),
  };
}

/** Evidence docs point back at their finding so activation opens the finding. */
export function buildEvidenceDoc(
  p: PocAttachment,
  finding: Pick<Finding, "id" | "programId" | "title">,
): SearchDoc {
  const label = p.caption || `${p.kind} evidence`;
  return {
    id: `evidence:${p.id}`,
    entityType: "evidence",
    entityId: p.id,
    programId: finding.programId,
    title: label,
    subtitle: `Evidence · ${finding.title}`,
    body: [p.kind, p.mime, finding.title].join(" "),
    tags: [p.kind],
    tokens: baseTokens([label, p.kind, p.mime, finding.title]),
    route: "/findings",
    updatedAt: Date.now(),
  };
}

/** Encyclopedia entries are read-only reference docs. */
export function buildEncyclopediaDoc(v: VulnCard): SearchDoc {
  return {
    id: `encyclopedia:${v.id}`,
    entityType: "encyclopedia",
    entityId: v.id,
    programId: null,
    title: `${v.code} · ${v.title}`,
    subtitle: `${v.family}${v.cwe ? ` · ${v.cwe}` : ""}`,
    body: [v.summary, v.signals.join(" "), v.tests.join(" "), v.fix].join(" "),
    tags: [v.family, ...(v.cwe ? [v.cwe] : [])],
    tokens: baseTokens([v.title, v.code, v.summary, v.signals.join(" "), v.tests.join(" "), v.fix, v.family, v.cwe]),
    route: "/encyclopedia",
    updatedAt: Date.now(),
  };
}

/** Synthetic tag docs let users jump straight to a tag facet. */
export function buildTagDoc(tag: string, programId: string | null, count: number): SearchDoc {
  return {
    id: `tag:${programId ?? "*"}:${tag}`,
    entityType: "tag",
    entityId: `${programId ?? "*"}:${tag}`,
    programId,
    title: `#${tag}`,
    subtitle: `${count} item${count === 1 ? "" : "s"}`,
    body: tag,
    tags: [tag],
    tokens: baseTokens([tag]),
    route: "/assets",
    updatedAt: Date.now(),
  };
}

/** Static entry for the report/export surface. */
export function buildReportDoc(programId: string, programName: string): SearchDoc {
  return {
    id: `report:${programId}`,
    entityType: "report",
    entityId: programId,
    programId,
    title: `Report · ${programName}`,
    subtitle: "Export detailed pentest / platform drafts",
    body: "report export markdown pdf hackerone bugcrowd intigriti pentest",
    tags: ["report", "export"],
    tokens: baseTokens(["report", "export", "markdown", "pdf", "hackerone", "bugcrowd", "intigriti", programName]),
    route: "/",
    updatedAt: Date.now(),
  };
}

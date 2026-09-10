import { uid } from "@/lib/seed";
import type {
  ReportDoc,
  ReportFormatId,
  ReportSection,
  ReportSectionKind,
} from "./types";

const now = () => Date.now();

function section(
  kind: ReportSectionKind,
  title: string,
  order: number,
  extra: Partial<ReportSection> = {},
): ReportSection {
  return {
    id: uid("rs"),
    order,
    kind,
    title,
    body: "",
    sources: [],
    auto: true,
    included: true,
    ...extra,
  };
}

export interface ReportTemplate {
  id: ReportFormatId;
  label: string;
  hint: string;
  build: () => ReportSection[];
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "detailed",
    label: "Detailed pentest report",
    hint: "Executive summary, methodology, findings, remediation, appendix (PTES / NIST SP 800-115).",
    build: () => [
      section("cover", "Cover page", 1),
      section("executive-summary", "Executive summary", 2),
      section("scope", "Scope & rules of engagement", 3),
      section("methodology", "Methodology", 4),
      section("asset-inventory", "Asset inventory", 5),
      section("findings-summary", "Findings summary", 6),
      section("finding-detail", "Detailed findings", 7),
      section("remediation", "Remediation roadmap", 8),
      section("timeline", "Engagement timeline", 9),
      section("references", "References", 10),
      section("appendix", "Appendix — evidence & artifacts", 11),
    ],
  },
  {
    id: "executive",
    label: "Executive brief",
    hint: "Two-page overview for leadership: exec summary + severity distribution + remediation.",
    build: () => [
      section("cover", "Cover page", 1),
      section("executive-summary", "Executive summary", 2),
      section("findings-summary", "Findings at a glance", 3),
      section("remediation", "Priority remediation", 4),
    ],
  },
  {
    id: "bug-bounty",
    label: "Bug bounty submission",
    hint: "Per-finding submission with PoC, HTTP evidence, impact, references.",
    build: () => [
      section("finding-detail", "Vulnerability details", 1),
      section("poc", "Proof of concept", 2),
      section("http-evidence", "HTTP evidence", 3),
      section("media-gallery", "Screenshots", 4),
      section("remediation", "Suggested remediation", 5),
      section("references", "References", 6),
    ],
  },
  {
    id: "hackerone",
    label: "HackerOne draft",
    hint: "Structured to match the HackerOne report template.",
    build: () => [
      section("markdown", "Summary", 1, { body: "_A brief description of what the vulnerability is._" }),
      section("finding-detail", "Details", 2),
      section("poc", "Steps to reproduce", 3),
      section("http-evidence", "Supporting requests", 4),
      section("media-gallery", "Attachments", 5),
      section("markdown", "Impact", 6),
      section("remediation", "Remediation", 7),
      section("references", "References", 8),
    ],
  },
  {
    id: "bugcrowd",
    label: "Bugcrowd draft",
    hint: "Bugcrowd VRT-friendly submission.",
    build: () => [
      section("markdown", "Title", 1),
      section("finding-detail", "Bug URL & description", 2),
      section("poc", "Steps to reproduce", 3),
      section("http-evidence", "Requests / responses", 4),
      section("markdown", "Impact & risk", 5),
      section("remediation", "Remediation", 6),
      section("references", "References", 7),
    ],
  },
  {
    id: "intigriti",
    label: "Intigriti draft",
    hint: "Intigriti's structured submission template.",
    build: () => [
      section("markdown", "Domain / endpoint", 1),
      section("finding-detail", "Vulnerability description", 2),
      section("poc", "PoC", 3),
      section("markdown", "Impact", 4),
      section("remediation", "Mitigation", 5),
      section("references", "References", 6),
    ],
  },
  {
    id: "custom",
    label: "Blank canvas",
    hint: "Start empty and drag in sections as you go.",
    build: () => [],
  },
];

export function buildTemplateSections(format: ReportFormatId): ReportSection[] {
  const tpl = REPORT_TEMPLATES.find((t) => t.id === format) ?? REPORT_TEMPLATES[0];
  return tpl.build();
}

export function emptyReport(programId: string | null, format: ReportFormatId = "detailed"): ReportDoc {
  const ts = now();
  return {
    id: uid("rep"),
    programId,
    title: "Untitled report",
    format,
    meta: { authors: [], cvssScheme: "3.1" },
    sections: buildTemplateSections(format),
    findingIds: [],
    history: [],
    version: 1,
    createdAt: ts,
    updatedAt: ts,
  };
}

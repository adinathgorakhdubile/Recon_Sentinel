import { uid } from "@/lib/seed";
import type { Workflow, WorkflowStep } from "./types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  build: () => WorkflowStep[];
}

function step(partial: Partial<WorkflowStep> & Pick<WorkflowStep, "kind" | "name">): WorkflowStep {
  return {
    id: uid("stp"),
    config: {},
    ...partial,
  } as WorkflowStep;
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "full-recon-loop",
    name: "Full Recon Loop",
    description: "Import → Normalize → Correlate → Validate Scope → Enrich → Findings → Dashboard.",
    tags: ["recon", "full-pipeline"],
    build: () => [
      step({ kind: "import", name: "Import assets", config: { importerId: "auto", format: "txt", filename: "input.txt", contentFromInput: "content" } }),
      step({ kind: "normalize", name: "Normalize" }),
      step({ kind: "correlate", name: "Correlate relationships" }),
      step({ kind: "validate-scope", name: "Validate scope" }),
      step({ kind: "enrich", name: "Enrich intel" }),
      step({ kind: "generate-findings", name: "Draft findings", config: { minRisk: 70, maxDrafts: 10 } }),
      step({ kind: "update-dashboard", name: "Update dashboard" }),
      step({ kind: "notify", name: "Notify", config: { summary: "Recon loop completed" } }),
    ],
  },
  {
    id: "post-import-enrichment",
    name: "Post-Import Enrichment",
    description: "Enrich existing assets and refresh the dashboard without re-importing.",
    tags: ["recon", "enrichment"],
    build: () => [
      step({ kind: "normalize", name: "Normalize" }),
      step({ kind: "validate-scope", name: "Validate scope" }),
      step({ kind: "enrich", name: "Enrich intel" }),
      step({ kind: "correlate", name: "Correlate relationships" }),
      step({ kind: "update-dashboard", name: "Update dashboard" }),
    ],
  },
  {
    id: "guarded-findings",
    name: "Guarded Findings Draft",
    description: "Enrich, wait for approval, then auto-draft findings for high-risk assets.",
    tags: ["findings", "approval"],
    build: () => {
      const enrich = step({ kind: "enrich", name: "Enrich intel" });
      const approve = step({ kind: "approval", name: "Analyst approval", config: { message: "Review enrichment before drafting findings" } });
      const draft = step({ kind: "generate-findings", name: "Draft findings", config: { minRisk: 80, maxDrafts: 5 } });
      const notify = step({ kind: "notify", name: "Notify", config: { summary: "Findings drafted post-approval" } });
      return [enrich, approve, draft, notify];
    },
  },
  {
    id: "conditional-drafting",
    name: "Conditional Drafting",
    description: "Only draft findings when enrichment surfaces high-risk assets.",
    tags: ["conditional", "branching"],
    build: () => {
      const enrich = step({ kind: "enrich", name: "Enrich intel" });
      const branch = step({
        kind: "branch",
        name: "High-risk present?",
        config: { when: { path: "enrich.highRisk", op: "gt", value: 0 } },
      });
      const draftTrue = step({ kind: "generate-findings", name: "Draft findings", config: { minRisk: 70, maxDrafts: 10 } });
      const notifyFalse = step({ kind: "notify", name: "Notify no drafts", config: { summary: "No high-risk assets — skipped drafting" } });
      branch.branches = { onTrue: [draftTrue.id], onFalse: [notifyFalse.id] };
      return [enrich, branch, draftTrue, notifyFalse];
    },
  },
];

export function newWorkflowFromTemplate(t: WorkflowTemplate, programId: string | null): Workflow {
  return {
    id: uid("wf"),
    name: t.name,
    description: t.description,
    programId,
    steps: t.build(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    templateId: t.id,
    tags: t.tags,
  };
}

export function blankWorkflow(programId: string | null): Workflow {
  return {
    id: uid("wf"),
    name: "New Workflow",
    description: "",
    programId,
    steps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
  };
}

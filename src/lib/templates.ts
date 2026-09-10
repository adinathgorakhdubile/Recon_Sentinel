import type { Asset, Note } from "@/types";

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  targetPlaceholder: string;
  focusCategories: ("Web" | "API" | "Cloud" | "AI" | "General")[];
  starterAssets: Omit<Asset, "id" | "programId" | "createdAt">[];
  starterNotes: Omit<Note, "id" | "programId" | "createdAt">[];
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "web-app",
    name: "Web Application",
    description: "Classic web target — OWASP Web Top 10, subdomain enum, JS bundle analysis, auth flows.",
    targetPlaceholder: "acme.example",
    focusCategories: ["General", "Web"],
    starterAssets: [
      { name: "www.acme.example", type: "subdomain", source: "seed", confidence: "high", status: "in-scope", tags: ["prod", "web"], notes: "Primary marketing/app entry." },
    ],
    starterNotes: [
      { title: "Auth flow map", body: "Login → MFA → session cookie. Capture request/response for each step and note token shapes.", tags: ["auth", "recon"] },
    ],
  },
  {
    id: "api-first",
    name: "API-First Product",
    description: "REST/GraphQL surface — OWASP API Top 10, BOLA/BFLA, mass-assignment, rate-limit abuse.",
    targetPlaceholder: "api.acme.example",
    focusCategories: ["General", "API"],
    starterAssets: [
      { name: "api.acme.example", type: "endpoint", source: "seed", confidence: "high", status: "in-scope", tags: ["api", "prod"], notes: "Base API host. Enumerate /v1, /v2, /internal." },
    ],
    starterNotes: [
      { title: "API auth model", body: "Bearer JWT? Session? Compare response diffs across roles for every collection endpoint.", tags: ["api", "auth"] },
    ],
  },
  {
    id: "ai-redteam",
    name: "AI / LLM Red Team",
    description: "Chatbots, RAG, agents — OWASP LLM Top 10, prompt injection, tool abuse, data exfil.",
    targetPlaceholder: "chat.acme.example",
    focusCategories: ["General", "AI"],
    starterAssets: [
      { name: "chat.acme.example", type: "endpoint", source: "seed", confidence: "high", status: "in-scope", tags: ["llm", "ai"], notes: "Consumer chatbot endpoint." },
    ],
    starterNotes: [
      { title: "System prompt probe", body: "Try obfuscated jailbreaks (base64, unicode, image OCR). Check tool-call outputs for exfil vectors.", tags: ["llm", "prompt-injection"] },
    ],
  },
  {
    id: "cloud-review",
    name: "Cloud / SaaS Review",
    description: "IAM, storage, secrets, metadata SSRF, misconfig hunting across AWS/GCP/Azure surfaces.",
    targetPlaceholder: "cloud.acme.example",
    focusCategories: ["General", "Cloud"],
    starterAssets: [
      { name: "s3-public-audit", type: "cloud", source: "seed", confidence: "medium", status: "triaging", tags: ["s3", "aws"], notes: "Enumerate public buckets under org." },
    ],
    starterNotes: [
      { title: "Cloud recon checklist", body: "ASN → CIDR → cert transparency → SaaS tenants. Look for exposed metadata endpoints via SSRF surfaces.", tags: ["cloud", "recon"] },
    ],
  },
];

export function templateById(id: string): WorkspaceTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

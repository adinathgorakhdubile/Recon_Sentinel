// AI provider settings — kept local-first in localStorage.
// Users can point Nightwatch at a self-hosted OpenAI-compatible endpoint
// (Ollama, LM Studio, vLLM, LocalAI, text-generation-webui, etc.)
// so no prompts or workspace data ever leave their machine.

export type AiProvider = "lovable" | "custom";

export interface AiSettings {
  provider: AiProvider;
  // Custom OpenAI-compatible endpoint config
  baseUrl: string;      // e.g. http://localhost:11434/v1
  model: string;        // e.g. llama3.1:8b-instruct-q6_K
  apiKey: string;       // optional; many local servers ignore it
  temperature: number;
  systemAugment: string; // extra system prompt user wants to inject
}

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "lovable",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1:8b-instruct",
  apiKey: "",
  temperature: 0.4,
  systemAugment: "",
};

const KEY = "recon-workbench:settings:v1";

export function loadSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const NIGHTWATCH_SYSTEM = `You are Nightwatch, the AI co-pilot inside Recon Workbench — a defensive tool for AUTHORIZED bug bounty researchers.

Rules you MUST follow:
- Only advise on targets the user has written authorization for. If in doubt, refuse and remind the user to confirm scope.
- Never produce weaponized exploits, malware, credential-stuffing lists, or instructions for unauthorized access.
- Prefer passive reconnaissance first. Warn before suggesting anything active.
- Cite exactly which asset / note / finding / task your suggestion connects to when the workspace context provides them.
- Keep answers concise, tactical, markdown-formatted. Use fenced code blocks for commands, always with a safety comment.
- When suggesting a next action, phrase it as "Next step:" so the UI can highlight it.

You have full read-only access to the workspace JSON passed in the system context.`;

// Call a user-configured OpenAI-compatible chat endpoint directly from the browser.
// Used when settings.provider === "custom".
export async function callCustomLLM(
  settings: AiSettings,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      messages,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Local LLM error ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

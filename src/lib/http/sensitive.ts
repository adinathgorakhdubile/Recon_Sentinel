/**
 * Sensitive-data highlighting patterns. These run on rendered request/response
 * text to visually flag secrets, tokens, and PII. Kept intentionally
 * conservative — false positives are noisy in a security tool.
 */

export interface SensitiveMatch {
  kind: string;
  index: number;
  length: number;
  preview: string;
}

interface Rule {
  kind: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { kind: "jwt", pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi },
  { kind: "basic-auth", pattern: /\bBasic\s+[A-Za-z0-9+/=]{8,}\b/gi },
  { kind: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "google-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { kind: "slack-token", pattern: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "ipv4", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: "credit-card", pattern: /\b(?:\d[ -]*?){13,16}\b/g },
  { kind: "session-cookie", pattern: /\b(?:PHPSESSID|JSESSIONID|ASP\.NET_SessionId|connect\.sid)=[^;\s]+/gi },
];

export function scanSensitive(text: string): SensitiveMatch[] {
  if (!text) return [];
  const out: SensitiveMatch[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      out.push({
        kind: rule.kind,
        index: m.index,
        length: m[0].length,
        preview: m[0].slice(0, 24) + (m[0].length > 24 ? "…" : ""),
      });
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  // Sort + drop nested matches so we can render safely.
  out.sort((a, b) => a.index - b.index || b.length - a.length);
  const pruned: SensitiveMatch[] = [];
  let cursor = -1;
  for (const m of out) {
    if (m.index >= cursor) {
      pruned.push(m);
      cursor = m.index + m.length;
    }
  }
  return pruned;
}

export function highlightSensitive(text: string): Array<{ text: string; kind?: string }> {
  const matches = scanSensitive(text);
  if (matches.length === 0) return [{ text }];
  const out: Array<{ text: string; kind?: string }> = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index > cursor) out.push({ text: text.slice(cursor, m.index) });
    out.push({ text: text.slice(m.index, m.index + m.length), kind: m.kind });
    cursor = m.index + m.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

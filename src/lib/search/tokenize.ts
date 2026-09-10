/**
 * Normalize a string to lowercase, strip punctuation, collapse whitespace.
 * Keeps unicode letters/digits and dots/hyphens (useful for hostnames).
 */
export function normalize(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.\-_/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize by whitespace and by dot/slash/hyphen splits so `api.example.com`
 * also indexes as `api`, `example`, `com`.
 */
export function tokenize(input: string): string[] {
  const norm = normalize(input);
  if (!norm) return [];
  const parts = new Set<string>();
  for (const raw of norm.split(" ")) {
    if (!raw) continue;
    parts.add(raw);
    for (const sub of raw.split(/[./\-_]/)) {
      if (sub && sub.length >= 2) parts.add(sub);
    }
  }
  return Array.from(parts);
}

/** Split a query into individual search terms (no dedupe — order matters). */
export function queryTerms(q: string): string[] {
  return normalize(q).split(" ").filter(Boolean);
}

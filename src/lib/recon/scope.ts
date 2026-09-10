import type { Program } from "@/types";

/**
 * Extract a hostname from an arbitrary identifier: full URL, host:port, or
 * bare host. Returns the input lowercased if nothing better can be extracted.
 */
export function extractHost(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return raw;
  try {
    if (/^https?:\/\//.test(raw)) return new URL(raw).hostname;
  } catch { /* fall through */ }
  // strip protocol-less schemes, paths, ports
  const noScheme = raw.replace(/^[a-z0-9+.-]+:\/\//, "");
  const hostPart = noScheme.split("/")[0].split("?")[0];
  return hostPart.split(":")[0];
}

/**
 * Match a hostname against a scope pattern. Supported patterns:
 *   - `example.com`              → exact host
 *   - `*.example.com`            → any subdomain (not the apex)
 *   - `**.example.com`           → apex + any subdomain
 *   - `https://api.example.com`  → hostname is compared
 */
export function matchesPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = extractHost(pattern) || pattern.trim().toLowerCase();
  if (!p) return false;
  if (p === h) return true;
  if (p.startsWith("**.")) {
    const base = p.slice(3);
    return h === base || h.endsWith(`.${base}`);
  }
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h.endsWith(`.${base}`);
  }
  return false;
}

export type ScopeVerdict = "in-scope" | "out-of-scope" | "unknown";

/**
 * Decide whether a candidate identifier falls inside the program's scope.
 * Explicit `outScope` matches always win. If no scope lists are configured
 * the verdict is `unknown` and the caller decides what to do.
 */
export function evaluateScope(program: Program, identifier: string): ScopeVerdict {
  const host = extractHost(identifier);
  if (!host) return "unknown";
  if (program.outScope.some((pat) => matchesPattern(host, pat))) return "out-of-scope";
  if (program.inScope.length === 0 && !program.targetRoot) return "unknown";
  if (program.inScope.some((pat) => matchesPattern(host, pat))) return "in-scope";
  if (program.targetRoot && matchesPattern(host, `**.${extractHost(program.targetRoot)}`)) {
    return "in-scope";
  }
  return "unknown";
}

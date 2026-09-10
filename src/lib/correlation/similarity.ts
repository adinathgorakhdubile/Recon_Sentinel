/**
 * Similarity metrics used by the correlation engine.
 *
 * Kept intentionally small and dependency-free so the engine can run
 * synchronously against thousands of records inside the browser.
 */

export function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  small.forEach((v) => big.has(v) && inter++);
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Normalized Levenshtein similarity (0..1) for short strings. */
export function stringSim(a: string, b: string): number {
  const s1 = (a || "").toLowerCase().trim();
  const s2 = (b || "").toLowerCase().trim();
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

/** Normalize a URL / endpoint for endpoint-equality checks. */
export function normalizeEndpoint(url: string): string {
  if (!url) return "";
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    // Strip query strings and trailing slashes; keep host+path.
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url.toLowerCase().split("?")[0].replace(/\/+$/, "");
  }
}

export function extractHost(url: string): string | null {
  if (!url) return null;
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

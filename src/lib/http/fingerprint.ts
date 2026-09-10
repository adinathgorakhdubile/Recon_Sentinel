import type { HttpRequest } from "./types";

/**
 * Deterministic short fingerprint for a request. We intentionally normalize
 * away transient bits (Cookie header, per-request tokens, order) so the same
 * logical endpoint hit under different sessions dedupes correctly, while
 * still distinguishing method/host/path/param-shape/body-shape.
 */
export function fingerprintRequest(req: HttpRequest): string {
  const method = (req.method || "GET").toUpperCase();
  const url = (() => {
    try {
      const u = new URL(req.url);
      // Keep host + path; sort query keys, drop values (they usually change).
      const keys = Array.from(u.searchParams.keys()).sort();
      return `${u.protocol}//${u.host}${u.pathname}?${keys.join(",")}`;
    } catch {
      return req.url;
    }
  })();
  const headerKeys = req.headers
    .map((h) => h.name.toLowerCase())
    .filter((n) => n !== "cookie" && n !== "authorization" && !n.startsWith("x-csrf") && !n.startsWith("x-request-id"))
    .sort()
    .join(",");
  const bodyShape = req.body?.text
    ? bodyShapeOf(req.body.text, req.body.contentType)
    : "-";
  return djb2(`${method}|${url}|${headerKeys}|${bodyShape}`);
}

function bodyShapeOf(text: string, ct?: string): string {
  const t = text.slice(0, 4096);
  if (ct && ct.includes("json")) {
    try {
      return `json:${sortKeys(JSON.parse(t))}`;
    } catch {
      /* fall through */
    }
  }
  if (ct && ct.includes("form-urlencoded")) {
    return `form:${Array.from(new URLSearchParams(t).keys()).sort().join(",")}`;
  }
  return `raw:${t.length}`;
}

function sortKeys(v: unknown, depth = 0): string {
  if (v === null || typeof v !== "object" || depth > 6) return typeof v;
  if (Array.isArray(v)) return `[${v.length && sortKeys(v[0], depth + 1)}]`;
  const keys = Object.keys(v as object).sort();
  return `{${keys.map((k) => `${k}:${sortKeys((v as Record<string, unknown>)[k], depth + 1)}`).join(",")}}`;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

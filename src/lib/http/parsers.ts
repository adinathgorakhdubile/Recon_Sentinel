import type {
  HttpBody,
  HttpCookie,
  HttpHeader,
  HttpItem,
  HttpParser,
  HttpParseResult,
  HttpQueryParam,
  HttpRequest,
  HttpResponse,
} from "./types";

// -------------- shared helpers --------------

export function splitUrl(url: string): Pick<HttpRequest, "scheme" | "host" | "path" | "query"> {
  try {
    const u = new URL(url);
    return {
      scheme: u.protocol.replace(":", ""),
      host: u.host,
      path: u.pathname + (u.hash || ""),
      query: Array.from(u.searchParams.entries()).map(([name, value]) => ({ name, value })),
    };
  } catch {
    return { query: [] };
  }
}

export function parseCookieHeader(v: string): HttpCookie[] {
  return v.split(/;\s*/).filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return { name: pair, value: "" };
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
  });
}

export function parseSetCookie(v: string): HttpCookie {
  const parts = v.split(/;\s*/);
  const [nameEq, ...attrs] = parts;
  const eq = nameEq.indexOf("=");
  const cookie: HttpCookie = {
    name: eq >= 0 ? nameEq.slice(0, eq) : nameEq,
    value: eq >= 0 ? nameEq.slice(eq + 1) : "",
  };
  for (const attr of attrs) {
    const [k, val] = attr.split("=");
    const key = k.toLowerCase();
    if (key === "domain") cookie.domain = val;
    else if (key === "path") cookie.path = val;
    else if (key === "secure") cookie.secure = true;
    else if (key === "httponly") cookie.httpOnly = true;
  }
  return cookie;
}

export function contentTypeFromHeaders(h: HttpHeader[]): string | undefined {
  const found = h.find((x) => x.name.toLowerCase() === "content-type");
  return found?.value;
}

function cookiesFromHeaders(h: HttpHeader[]): HttpCookie[] {
  const out: HttpCookie[] = [];
  for (const header of h) {
    const n = header.name.toLowerCase();
    if (n === "cookie") out.push(...parseCookieHeader(header.value));
    else if (n === "set-cookie") out.push(parseSetCookie(header.value));
  }
  return out;
}

// -------------- Raw HTTP parser --------------
// Handles pasted request text like: "GET /path HTTP/1.1\nHost: x\n\nbody"

const RAW_LINE = /^([A-Z]+)\s+(\S+)\s+HTTP\/([\d.]+)\s*$/i;

export const rawHttpParser: HttpParser = {
  id: "raw",
  label: "Raw HTTP",
  extensions: [".http", ".req", ".txt"],
  detect(text) {
    return RAW_LINE.test(text.split("\n")[0] ?? "") ? 0.9 : 0;
  },
  parse(text, filename) {
    const items: HttpParseResult["items"] = [];
    const errors: HttpParseResult["errors"] = [];
    // Support multiple requests separated by "###" or "---".
    const chunks = text.split(/^\s*(?:###|---)\s*$/m).map((c) => c.trim()).filter(Boolean);
    chunks.forEach((chunk, idx) => {
      try {
        const [head, ...bodyLines] = chunk.split(/\r?\n\r?\n/);
        const headLines = head.split(/\r?\n/);
        const line = headLines.shift() ?? "";
        const m = RAW_LINE.exec(line);
        if (!m) throw new Error(`Not an HTTP request start-line: ${line.slice(0, 80)}`);
        const [, method, target, httpVersion] = m;
        const headers: HttpHeader[] = [];
        for (const l of headLines) {
          const c = l.indexOf(":");
          if (c > 0) headers.push({ name: l.slice(0, c).trim(), value: l.slice(c + 1).trim() });
        }
        const hostHeader = headers.find((h) => h.name.toLowerCase() === "host")?.value ?? "";
        const url = target.startsWith("http") ? target : `https://${hostHeader}${target}`;
        const bodyText = bodyLines.join("\n\n");
        const request: HttpRequest = {
          method: method.toUpperCase(),
          url,
          httpVersion,
          headers,
          cookies: cookiesFromHeaders(headers),
          ...splitUrl(url),
          body: bodyText
            ? { contentType: contentTypeFromHeaders(headers), text: bodyText, sizeBytes: bodyText.length }
            : undefined,
        };
        items.push({
          source: "raw",
          title: `${method.toUpperCase()} ${request.path ?? target}`,
          request,
          origin: filename,
        });
      } catch (err) {
        errors.push({ index: idx, message: err instanceof Error ? err.message : String(err) });
      }
    });
    return { items, errors, format: "raw" };
  },
};

// -------------- cURL parser --------------

export const curlParser: HttpParser = {
  id: "curl",
  label: "cURL",
  extensions: [".sh", ".curl"],
  detect(text) {
    return /(^|\n)\s*curl\s/i.test(text) ? 0.85 : 0;
  },
  parse(text, filename) {
    const items: HttpParseResult["items"] = [];
    const errors: HttpParseResult["errors"] = [];
    const commands = text
      .replace(/\\\r?\n/g, " ") // join line-continuations
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => /^curl\b/i.test(l));
    commands.forEach((cmd, idx) => {
      try {
        items.push({
          source: "curl",
          title: `cURL #${idx + 1}`,
          request: parseCurl(cmd),
          origin: filename,
        });
      } catch (err) {
        errors.push({ index: idx, message: err instanceof Error ? err.message : String(err) });
      }
    });
    return { items, errors, format: "curl" };
  },
};

function tokenizeShell(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === "\\" && i + 1 < cmd.length) { cur += cmd[++i]; continue; }
      if (ch === quote) { quote = null; continue; }
      cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function parseCurl(cmd: string): HttpRequest {
  const tokens = tokenizeShell(cmd);
  if (tokens[0]?.toLowerCase() !== "curl") throw new Error("Not a curl command");
  let method: string | undefined;
  let url: string | undefined;
  const headers: HttpHeader[] = [];
  let bodyText: string | undefined;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") method = tokens[++i]?.toUpperCase();
    else if (t === "-H" || t === "--header") {
      const raw = tokens[++i] ?? "";
      const c = raw.indexOf(":");
      if (c > 0) headers.push({ name: raw.slice(0, c).trim(), value: raw.slice(c + 1).trim() });
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary" || t === "--data-urlencode") {
      bodyText = (bodyText ?? "") + (bodyText ? "&" : "") + (tokens[++i] ?? "");
    } else if (t === "-b" || t === "--cookie") {
      headers.push({ name: "Cookie", value: tokens[++i] ?? "" });
    } else if (t === "-u" || t === "--user") {
      const cred = tokens[++i] ?? "";
      headers.push({ name: "Authorization", value: `Basic ${btoa(cred)}` });
    } else if (t === "--url") {
      url = tokens[++i];
    } else if (t.startsWith("--")) {
      // consume value if it looks like it takes one
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i++;
    } else if (t.startsWith("-") && t.length > 1) {
      // short-opt cluster we don't handle explicitly — try to skip a value
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) i++;
    } else if (!url) {
      url = t;
    }
  }
  if (!url) throw new Error("cURL command has no URL");
  method = method ?? (bodyText ? "POST" : "GET");
  const req: HttpRequest = {
    method,
    url,
    headers,
    cookies: cookiesFromHeaders(headers),
    ...splitUrl(url),
    body: bodyText != null
      ? { contentType: contentTypeFromHeaders(headers), text: bodyText, sizeBytes: bodyText.length }
      : undefined,
  };
  return req;
}

// -------------- HAR parser --------------

export const harParser: HttpParser = {
  id: "har",
  label: "HAR",
  extensions: [".har", ".json"],
  detect(text, filename) {
    if (filename?.toLowerCase().endsWith(".har")) return 0.95;
    if (text.includes('"log"') && text.includes('"entries"') && text.includes('"request"')) return 0.7;
    return 0;
  },
  parse(text, filename) {
    const items: HttpParseResult["items"] = [];
    const errors: HttpParseResult["errors"] = [];
    try {
      const har = JSON.parse(text);
      const entries: unknown[] = har?.log?.entries ?? [];
      entries.forEach((raw, idx) => {
        try {
          const e = raw as Record<string, unknown>;
          const req = e.request as Record<string, unknown>;
          const res = e.response as Record<string, unknown> | undefined;
          const headers = (req.headers as Array<{ name: string; value: string }> ?? []).map((h) => ({ name: h.name, value: h.value }));
          const body: HttpBody | undefined = (() => {
            const pd = req.postData as { mimeType?: string; text?: string } | undefined;
            if (!pd?.text) return undefined;
            return { contentType: pd.mimeType, text: pd.text, sizeBytes: pd.text.length };
          })();
          const request: HttpRequest = {
            method: String(req.method ?? "GET").toUpperCase(),
            url: String(req.url ?? ""),
            httpVersion: req.httpVersion as string | undefined,
            headers,
            cookies: cookiesFromHeaders(headers),
            ...splitUrl(String(req.url ?? "")),
            body,
          };
          let response: HttpResponse | undefined;
          if (res) {
            const rh = (res.headers as Array<{ name: string; value: string }> ?? []).map((h) => ({ name: h.name, value: h.value }));
            const rc = res.content as { mimeType?: string; text?: string; size?: number } | undefined;
            response = {
              status: Number(res.status ?? 0),
              statusText: res.statusText as string | undefined,
              httpVersion: res.httpVersion as string | undefined,
              headers: rh,
              cookies: cookiesFromHeaders(rh),
              body: rc?.text
                ? { contentType: rc.mimeType, text: rc.text, sizeBytes: rc.size ?? rc.text.length }
                : undefined,
              sizeBytes: rc?.size,
            };
          }
          const timings = e.timings as Record<string, number> | undefined;
          items.push({
            source: "har",
            title: `${request.method} ${request.path ?? request.url}`,
            request,
            response,
            timing: timings ? {
              totalMs: Number(e.time ?? 0) || undefined,
              dnsMs: timings.dns > 0 ? timings.dns : undefined,
              connectMs: timings.connect > 0 ? timings.connect : undefined,
              sslMs: timings.ssl > 0 ? timings.ssl : undefined,
              sendMs: timings.send > 0 ? timings.send : undefined,
              waitMs: timings.wait > 0 ? timings.wait : undefined,
              receiveMs: timings.receive > 0 ? timings.receive : undefined,
            } : undefined,
            capturedAt: e.startedDateTime as string | undefined,
            origin: filename,
          });
        } catch (err) {
          errors.push({ index: idx, message: err instanceof Error ? err.message : String(err) });
        }
      });
    } catch (err) {
      errors.push({ index: -1, message: `HAR JSON parse failed: ${err instanceof Error ? err.message : err}` });
    }
    return { items, errors, format: "har" };
  },
};

// -------------- Postman v2.1 collection parser --------------

export const postmanParser: HttpParser = {
  id: "postman",
  label: "Postman",
  extensions: [".json"],
  detect(text) {
    return text.includes('"info"') && text.includes('"_postman_id"') ? 0.9 : (text.includes('"item"') && text.includes('"request"') ? 0.4 : 0);
  },
  parse(text, filename) {
    const items: HttpParseResult["items"] = [];
    const errors: HttpParseResult["errors"] = [];
    try {
      const doc = JSON.parse(text);
      walkPostmanItems(doc.item ?? [], "", (entry, idx) => {
        try {
          items.push({ ...entry, origin: filename });
        } catch (err) {
          errors.push({ index: idx, message: err instanceof Error ? err.message : String(err) });
        }
      });
    } catch (err) {
      errors.push({ index: -1, message: `Postman JSON parse failed: ${err instanceof Error ? err.message : err}` });
    }
    return { items, errors, format: "postman" };
  },
};

function walkPostmanItems(
  items: unknown[],
  path: string,
  emit: (entry: HttpParseResult["items"][number], idx: number) => void,
  counter = { i: 0 },
) {
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    if (Array.isArray(it.item)) {
      walkPostmanItems(it.item as unknown[], path ? `${path}/${it.name}` : String(it.name ?? ""), emit, counter);
      continue;
    }
    const r = it.request as Record<string, unknown> | undefined;
    if (!r) continue;
    const url = (() => {
      const u = r.url;
      if (typeof u === "string") return u;
      const obj = u as Record<string, unknown> | undefined;
      if (!obj) return "";
      if (typeof obj.raw === "string") return obj.raw;
      const host = Array.isArray(obj.host) ? obj.host.join(".") : "";
      const p = Array.isArray(obj.path) ? "/" + (obj.path as string[]).join("/") : "";
      return `https://${host}${p}`;
    })();
    const headers = (r.header as Array<{ key: string; value: string; disabled?: boolean }> ?? [])
      .filter((h) => !h.disabled)
      .map((h) => ({ name: h.key, value: h.value }));
    const body = (() => {
      const b = r.body as Record<string, unknown> | undefined;
      if (!b) return undefined;
      if (b.mode === "raw" && typeof b.raw === "string") {
        return { contentType: contentTypeFromHeaders(headers), text: b.raw, sizeBytes: b.raw.length };
      }
      if (b.mode === "urlencoded" && Array.isArray(b.urlencoded)) {
        const text = (b.urlencoded as Array<{ key: string; value: string }>)
          .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? "")}`)
          .join("&");
        return { contentType: "application/x-www-form-urlencoded", text, sizeBytes: text.length };
      }
      return undefined;
    })();
    const method = String(r.method ?? "GET").toUpperCase();
    const request: HttpRequest = {
      method,
      url,
      headers,
      cookies: cookiesFromHeaders(headers),
      ...splitUrl(url),
      body,
    };
    emit({
      source: "postman",
      title: `${path ? path + " / " : ""}${it.name ?? `${method} ${url}`}`,
      request,
    }, counter.i++);
  }
}

// -------------- Burp Suite XML parser --------------

export const burpParser: HttpParser = {
  id: "burp",
  label: "Burp Suite",
  extensions: [".xml"],
  detect(text) {
    return /<items[\s>]/.test(text) && /<request/.test(text) ? 0.9 : 0;
  },
  parse(text, filename) {
    const items: HttpParseResult["items"] = [];
    const errors: HttpParseResult["errors"] = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "application/xml");
      const perr = doc.querySelector("parsererror");
      if (perr) throw new Error(perr.textContent ?? "XML parse error");
      const nodes = Array.from(doc.querySelectorAll("item"));
      nodes.forEach((node, idx) => {
        try {
          const method = node.querySelector("method")?.textContent ?? "GET";
          const url = node.querySelector("url")?.textContent ?? "";
          const host = node.querySelector("host")?.textContent ?? "";
          const status = Number(node.querySelector("status")?.textContent ?? 0);
          const reqEl = node.querySelector("request");
          const resEl = node.querySelector("response");
          const decode = (el: Element | null): string => {
            if (!el) return "";
            const raw = el.textContent ?? "";
            if (el.getAttribute("base64") === "true") {
              try { return atob(raw); } catch { return raw; }
            }
            return raw;
          };
          const rawReq = decode(reqEl);
          const rawRes = decode(resEl);
          const request = parseHttpMessage(rawReq, method, url || host);
          const response = rawRes ? parseHttpResponseMessage(rawRes, status) : undefined;
          items.push({
            source: "burp",
            title: `${request.method} ${request.path ?? url}`,
            request,
            response,
            origin: filename,
          });
        } catch (err) {
          errors.push({ index: idx, message: err instanceof Error ? err.message : String(err) });
        }
      });
    } catch (err) {
      errors.push({ index: -1, message: `Burp XML parse failed: ${err instanceof Error ? err.message : err}` });
    }
    return { items, errors, format: "burp" };
  },
};

function parseHttpMessage(raw: string, fallbackMethod: string, fallbackUrl: string): HttpRequest {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const bodyText = rest.join("\n\n");
  const [startLine, ...headerLines] = head.split(/\r?\n/);
  const m = RAW_LINE.exec(startLine ?? "");
  const method = m ? m[1].toUpperCase() : fallbackMethod.toUpperCase();
  const target = m ? m[2] : fallbackUrl;
  const httpVersion = m ? m[3] : undefined;
  const headers: HttpHeader[] = [];
  for (const l of headerLines) {
    const c = l.indexOf(":");
    if (c > 0) headers.push({ name: l.slice(0, c).trim(), value: l.slice(c + 1).trim() });
  }
  const hostHeader = headers.find((h) => h.name.toLowerCase() === "host")?.value ?? "";
  const url = target.startsWith("http") ? target : `https://${hostHeader}${target}`;
  return {
    method,
    url,
    httpVersion,
    headers,
    cookies: cookiesFromHeaders(headers),
    ...splitUrl(url),
    body: bodyText ? { contentType: contentTypeFromHeaders(headers), text: bodyText, sizeBytes: bodyText.length } : undefined,
  };
}

function parseHttpResponseMessage(raw: string, fallbackStatus: number): HttpResponse {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const bodyText = rest.join("\n\n");
  const [startLine, ...headerLines] = head.split(/\r?\n/);
  const m = /^HTTP\/([\d.]+)\s+(\d{3})\s*(.*)$/.exec(startLine ?? "");
  const status = m ? Number(m[2]) : fallbackStatus;
  const statusText = m ? m[3] : undefined;
  const httpVersion = m ? m[1] : undefined;
  const headers: HttpHeader[] = [];
  for (const l of headerLines) {
    const c = l.indexOf(":");
    if (c > 0) headers.push({ name: l.slice(0, c).trim(), value: l.slice(c + 1).trim() });
  }
  return {
    status,
    statusText,
    httpVersion,
    headers,
    cookies: cookiesFromHeaders(headers),
    body: bodyText ? { contentType: contentTypeFromHeaders(headers), text: bodyText, sizeBytes: bodyText.length } : undefined,
  };
}

// -------------- registry --------------

const PARSERS: HttpParser[] = [harParser, postmanParser, burpParser, curlParser, rawHttpParser];

export function listHttpParsers(): HttpParser[] {
  return PARSERS.slice();
}

export function detectHttpParser(text: string, filename?: string): HttpParser | null {
  let best: { p: HttpParser; s: number } | null = null;
  for (const p of PARSERS) {
    const s = p.detect(text, filename);
    if (s > 0 && (!best || s > best.s)) best = { p, s };
  }
  return best?.p ?? null;
}

export function parseHttp(text: string, filename?: string, forceId?: string): HttpParseResult {
  const parser = forceId ? PARSERS.find((p) => p.id === forceId) : detectHttpParser(text, filename);
  if (!parser) {
    return { items: [], errors: [{ index: -1, message: "No suitable HTTP parser found." }], format: "import" };
  }
  return parser.parse(text, filename);
}

/** Endpoint fingerprint used for automatic extraction into the Asset model. */
export function endpointOf(item: HttpItem | HttpRequest): string {
  const req = "request" in item ? item.request : item;
  try {
    const u = new URL(req.url);
    return `${req.method.toUpperCase()} ${u.origin}${u.pathname}`;
  } catch {
    return `${req.method.toUpperCase()} ${req.url}`;
  }
}

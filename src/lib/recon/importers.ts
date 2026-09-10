import type { AssetType } from "@/types";
import type { AssetCandidate, ImportFormat, Importer, ParseResult, ReconStage } from "./types";
import { attr, parseCsv, parseJsonFlexible, parseJsonlLines, parseXml, splitLines } from "./parsers";

/** Stage registry. Adding a new stage here surfaces it in the dashboard. */
export const STAGES: ReconStage[] = [
  {
    id: "passive",
    name: "Passive Recon",
    description: "OSINT sources: CT logs, archives, search dorking. Reads existing data without touching the target.",
    produces: ["subdomain", "endpoint"],
  },
  {
    id: "dns",
    name: "DNS Recon",
    description: "Resolution, brute-forcing and permutation of subdomains.",
    produces: ["subdomain", "ip"],
  },
  {
    id: "http",
    name: "HTTP Probing",
    description: "Which hosts respond over HTTP/S, what tech, what status.",
    produces: ["endpoint"],
  },
  {
    id: "port",
    name: "Port Scanning",
    description: "Open ports and service fingerprints.",
    produces: ["ip", "endpoint"],
  },
  {
    id: "crawl",
    name: "Web Crawling",
    description: "Spidered URLs, JS-linked endpoints and archived paths.",
    produces: ["endpoint"],
  },
  {
    id: "content",
    name: "Content Discovery",
    description: "Directory / file brute-forcing results.",
    produces: ["endpoint"],
  },
  {
    id: "vuln",
    name: "Vulnerability Scanning",
    description: "Template-driven scan output surfaced as affected endpoints.",
    produces: ["endpoint"],
  },
];

export function stageById(id: string): ReconStage | undefined {
  return STAGES.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Helpers used by multiple importers
// ---------------------------------------------------------------------------

function pick<T = string>(row: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const hit = row[k];
    if (hit !== undefined && hit !== null && hit !== "") return hit as T;
  }
  return undefined;
}

function normalizeHostList(lines: string[], source: string, tags: string[] = []): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  for (const raw of lines) {
    const name = raw.trim();
    if (!name) continue;
    const isUrl = /^https?:\/\//i.test(name) || name.includes("/");
    out.push({
      name,
      type: isUrl ? "endpoint" : "subdomain",
      source,
      tags,
    });
  }
  return out;
}

// Iterate a parsed JSON/JSONL stream and collect per-row errors so the
// caller can surface parser diagnostics to the user.
function collectRows(input: string, format: ImportFormat): { rows: Record<string, unknown>[]; strings: string[]; errors: string[] } {
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const strings: string[] = [];
  let items: unknown[] = [];
  try {
    items = format === "jsonl" ? parseJsonlLines(input) : parseJsonFlexible(input);
  } catch (e) {
    errors.push(`parse: ${(e as Error).message}`);
    return { rows, strings, errors };
  }
  for (const it of items) {
    if (typeof it === "string") strings.push(it);
    else if (it && typeof it === "object") rows.push(it as Record<string, unknown>);
    else errors.push(`skipped non-object row: ${JSON.stringify(it).slice(0, 80)}`);
  }
  return { rows, strings, errors };
}

// ---------------------------------------------------------------------------
// Importer registry — each is a small pure adapter. Tool-execution modules
// added later plug in by registering another Importer here.
// ---------------------------------------------------------------------------

const IMPORTERS: Importer[] = [
  {
    id: "generic.hosts.txt",
    name: "Host list (TXT)",
    stage: "passive",
    description: "One host or URL per line. Works with subfinder -o, assetfinder, gau, waybackurls, findomain.",
    accepts: ["txt"],
    parse: (input) => normalizeHostList(splitLines(input), "txt-import"),
  },
  {
    id: "generic.assets.csv",
    name: "Assets CSV",
    stage: "passive",
    description: "CSV with a `name`/`host`/`url` column. Optional `type`, `source`, `tags`, `notes`.",
    accepts: ["csv"],
    detectHints: { content: ["name,", "host,", "url,"] },
    parse: (input) => {
      const rows = parseCsv(input);
      const errors: string[] = [];
      const candidates: AssetCandidate[] = [];
      rows.forEach((r, i) => {
        const name = pick<string>(r, ["name", "host", "hostname", "url", "target", "asset"]);
        if (!name) { errors.push(`row ${i + 2}: no name/host/url column`); return; }
        const type = (pick<string>(r, ["type", "asset_type"]) ?? "subdomain").toLowerCase();
        const validType = ["subdomain", "endpoint", "ip", "cloud", "repository", "other"].includes(type)
          ? (type as AssetType)
          : /^https?:\/\//i.test(name) ? "endpoint" : "subdomain";
        const tags = (pick<string>(r, ["tags"]) ?? "")
          .split(/[|,]/).map((t) => t.trim()).filter(Boolean);
        candidates.push({
          name,
          type: validType,
          source: pick<string>(r, ["source"]) ?? "csv-import",
          tags,
          notes: pick<string>(r, ["notes", "note", "description"]),
        });
      });
      return { candidates, errors, warnings: [] } satisfies ParseResult;
    },
  },
  {
    id: "generic.subdomains.json",
    name: "Subdomain JSON / JSONL",
    stage: "passive",
    description: "Array of strings, or JSON objects with a `host`/`name`/`subdomain` field.",
    accepts: ["json", "jsonl"],
    parse: (input, fmt) => {
      const { rows, strings, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const s of strings) out.push(...normalizeHostList([s], "json-import"));
      for (const row of rows) {
        const name = pick<string>(row, ["host", "name", "subdomain", "domain", "input", "url"]);
        if (!name) continue;
        out.push({
          name,
          type: /^https?:\/\//i.test(name) ? "endpoint" : "subdomain",
          source: pick<string>(row, ["source"]) ?? "json-import",
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "subfinder.jsonl",
    name: "Subfinder (JSONL / TXT)",
    stage: "passive",
    description: "Subfinder `-oJ` JSONL (`host`, `source`) or `-o` bare host list.",
    accepts: ["json", "jsonl", "txt"],
    detectHints: { filename: ["subfinder"], content: ['"source":"crtsh"', '"source":"anubis"'] },
    parse: (input, fmt) => {
      if (fmt === "txt") return normalizeHostList(splitLines(input), "subfinder", ["tool:subfinder"]);
      const { rows, strings, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = strings.map((s) => ({
        name: s, type: "subdomain", source: "subfinder", tags: ["tool:subfinder"],
      }));
      for (const row of rows) {
        const name = pick<string>(row, ["host", "name", "input"]);
        if (!name) continue;
        const src = pick<string>(row, ["source", "sources"]);
        out.push({
          name,
          type: "subdomain",
          source: "subfinder",
          tags: ["tool:subfinder", ...(src ? [`src:${src}`] : [])],
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "amass.jsonl",
    name: "Amass (JSONL / TXT)",
    stage: "passive",
    description: "Amass `-json` output (`name`, `addresses[]`) or plain host list.",
    accepts: ["json", "jsonl", "txt"],
    detectHints: { filename: ["amass"], content: ['"addresses"', '"cidr"'] },
    parse: (input, fmt) => {
      if (fmt === "txt") return normalizeHostList(splitLines(input), "amass", ["tool:amass"]);
      const { rows, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const row of rows) {
        const name = pick<string>(row, ["name", "domain", "host"]);
        if (!name) continue;
        const tag = pick<string>(row, ["tag"]);
        out.push({
          name,
          type: "subdomain",
          source: "amass",
          tags: ["tool:amass", ...(tag ? [`amass:${tag}`] : [])],
          meta: row,
        });
        const addrs = row.addresses as Array<{ ip?: string; asn?: number; desc?: string }> | undefined;
        for (const a of addrs ?? []) {
          if (!a?.ip) continue;
          out.push({
            name: a.ip,
            type: "ip",
            source: "amass",
            tags: ["tool:amass", ...(a.asn ? [`asn:${a.asn}`] : []), ...(a.desc ? [`org:${a.desc}`] : [])],
            meta: { of: name, ...a },
          });
        }
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "dnsx.jsonl",
    name: "dnsx (JSONL)",
    stage: "dns",
    description: "Output of `dnsx -json`. Emits the host plus resolved A/CNAME records.",
    accepts: ["json", "jsonl"],
    detectHints: { filename: ["dnsx"], content: ['"a":[', '"cname":['] },
    parse: (input, fmt) => {
      const { rows, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const row of rows) {
        const host = pick<string>(row, ["host", "name"]);
        if (!host) continue;
        out.push({
          name: host,
          type: "subdomain",
          source: "dnsx",
          tags: ["tool:dnsx", "dns"],
          meta: row,
        });
        const a = (row.a as string[] | undefined) ?? [];
        for (const ip of a) out.push({ name: ip, type: "ip", source: "dnsx", tags: ["tool:dnsx", `resolves:${host}`], meta: { of: host } });
        const cn = (row.cname as string[] | undefined) ?? [];
        for (const c of cn) out.push({ name: c, type: "subdomain", source: "dnsx", tags: ["tool:dnsx", "cname", `alias-of:${host}`] });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "httpx.jsonl",
    name: "httpx (JSONL)",
    stage: "http",
    description: "Output of `httpx -json`. Extracts URL, status, tech and title.",
    accepts: ["json", "jsonl"],
    detectHints: { filename: ["httpx"], content: ['"status_code"', '"webserver"'] },
    parse: (input, fmt) => {
      const { rows, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const row of rows) {
        const url = pick<string>(row, ["url", "input", "host"]);
        if (!url) continue;
        const status = pick<number>(row, ["status_code", "status-code", "status"]);
        const title = pick<string>(row, ["title"]);
        const tech = (row.tech ?? row.technologies) as string[] | undefined;
        const tags = ["tool:httpx", "http", ...(status ? [`${status}`] : []), ...(tech ?? [])].map(String);
        out.push({
          name: url,
          type: "endpoint",
          source: "httpx",
          tags,
          notes: [title, tech?.join(", ")].filter(Boolean).join(" · "),
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "naabu.jsonl",
    name: "naabu (JSONL)",
    stage: "port",
    description: "Output of `naabu -json`. Emits `host:port` endpoints.",
    accepts: ["json", "jsonl"],
    detectHints: { filename: ["naabu"], content: ['"port":'] },
    parse: (input, fmt) => {
      const { rows, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const row of rows) {
        const host = pick<string>(row, ["host", "ip"]);
        const port = pick<number | string>(row, ["port"]);
        if (!host || !port) continue;
        out.push({
          name: `${host}:${port}`,
          type: "endpoint",
          source: "naabu",
          tags: ["tool:naabu", "port", `port:${port}`],
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "nmap.xml",
    name: "Nmap (XML)",
    stage: "port",
    description: "Nmap `-oX` XML. Emits host IPs and every open port as an endpoint with service tags.",
    accepts: ["xml"],
    detectHints: { filename: ["nmap"], content: ["<nmaprun", "<host>", "<host "] },
    parse: (input) => {
      const errors: string[] = [];
      let doc: Document;
      try { doc = parseXml(input); } catch (e) { return { candidates: [], errors: [(e as Error).message], warnings: [] }; }
      const out: AssetCandidate[] = [];
      const hosts = Array.from(doc.getElementsByTagName("host"));
      for (const host of hosts) {
        const stateEl = host.getElementsByTagName("status")[0];
        if (stateEl && attr(stateEl, "state") === "down") continue;
        const addrs = Array.from(host.getElementsByTagName("address"));
        const ip = addrs.find((a) => attr(a, "addrtype")?.startsWith("ipv"))?.getAttribute("addr") ?? undefined;
        const mac = addrs.find((a) => attr(a, "addrtype") === "mac")?.getAttribute("addr") ?? undefined;
        const hostnames = Array.from(host.getElementsByTagName("hostname")).map((h) => attr(h, "name")).filter(Boolean) as string[];
        const primary = hostnames[0] ?? ip;
        if (!primary) { errors.push("host with no address/hostname skipped"); continue; }
        if (ip) {
          out.push({
            name: ip,
            type: "ip",
            source: "nmap",
            tags: ["tool:nmap", ...(mac ? [`mac:${mac}`] : []), ...hostnames.map((h) => `resolves:${h}`)],
            meta: { hostnames },
          });
        }
        for (const hn of hostnames) {
          out.push({ name: hn, type: "subdomain", source: "nmap", tags: ["tool:nmap", ...(ip ? [`resolves:${ip}`] : [])] });
        }
        const ports = Array.from(host.getElementsByTagName("port"));
        for (const p of ports) {
          const state = p.getElementsByTagName("state")[0];
          if (attr(state, "state") !== "open") continue;
          const port = attr(p, "portid");
          const proto = attr(p, "protocol") ?? "tcp";
          const svc = p.getElementsByTagName("service")[0];
          const svcName = attr(svc, "name");
          const product = attr(svc, "product");
          const version = attr(svc, "version");
          const tags = [
            "tool:nmap",
            `proto:${proto}`,
            `port:${port}`,
            ...(svcName ? [`svc:${svcName}`] : []),
            ...(product ? [`product:${product}`] : []),
            ...(version ? [`ver:${version}`] : []),
          ];
          out.push({
            name: `${primary}:${port}`,
            type: "endpoint",
            source: "nmap",
            tags,
            notes: [svcName, product, version].filter(Boolean).join(" "),
            meta: { proto, port, service: svcName, product, version },
          });
        }
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "katana.jsonl",
    name: "katana / crawl (JSONL / TXT)",
    stage: "crawl",
    description: "Crawler JSONL where each row has a `url` (or `endpoint`) field, or a plain URL list.",
    accepts: ["json", "jsonl", "txt"],
    detectHints: { filename: ["katana", "crawl"], content: ['"endpoint":', '"request":'] },
    parse: (input, fmt) => {
      if (fmt === "txt") return normalizeHostList(splitLines(input), "crawl", ["crawl", "tool:katana"]);
      const { rows, strings, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = strings.map((s) => ({ name: s, type: "endpoint", source: "crawl", tags: ["crawl", "tool:katana"] }));
      for (const row of rows) {
        const url = pick<string>(row, ["url", "endpoint", "request", "input"]);
        if (!url) continue;
        out.push({ name: url, type: "endpoint", source: "crawl", tags: ["crawl", "tool:katana"], meta: row });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "gau.txt",
    name: "gau (TXT)",
    stage: "crawl",
    description: "`gau` archived URLs (one per line). Tagged with `archive`.",
    accepts: ["txt"],
    detectHints: { filename: ["gau"] },
    parse: (input) => normalizeHostList(splitLines(input), "gau", ["tool:gau", "archive"]),
  },
  {
    id: "waybackurls.txt",
    name: "waybackurls (TXT)",
    stage: "crawl",
    description: "`waybackurls` output. One URL per line.",
    accepts: ["txt"],
    detectHints: { filename: ["wayback"] },
    parse: (input) => normalizeHostList(splitLines(input), "waybackurls", ["tool:waybackurls", "archive"]),
  },
  {
    id: "ffuf.json",
    name: "ffuf (JSON)",
    stage: "content",
    description: "ffuf `-o results.json`. Reads `results[].url` and status codes.",
    accepts: ["json"],
    detectHints: { filename: ["ffuf"], content: ['"results":[', '"commandline":"ffuf'] },
    parse: (input) => {
      const errors: string[] = [];
      let root: unknown[] = [];
      try { root = parseJsonFlexible(input); } catch (e) { errors.push((e as Error).message); }
      const arr = root
        .flatMap((r) => (r && typeof r === "object" && Array.isArray((r as any).results) ? (r as any).results : [r]))
        .filter(Boolean) as Record<string, unknown>[];
      const out: AssetCandidate[] = [];
      for (const row of arr) {
        const url = pick<string>(row, ["url", "input", "host"]);
        if (!url) continue;
        const status = pick<number>(row, ["status", "status_code"]);
        out.push({
          name: url,
          type: "endpoint",
          source: "ffuf",
          tags: ["tool:ffuf", "content-discovery", ...(status ? [`${status}`] : [])],
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "nuclei.jsonl",
    name: "nuclei (JSONL)",
    stage: "vuln",
    description: "Nuclei `-jsonl` output. Imports matched endpoints tagged with template severity.",
    accepts: ["json", "jsonl"],
    detectHints: { filename: ["nuclei"], content: ['"template-id"', '"matched-at"'] },
    parse: (input, fmt) => {
      const { rows, errors } = collectRows(input, fmt);
      const out: AssetCandidate[] = [];
      for (const row of rows) {
        const url = pick<string>(row, ["matched-at", "host", "url"]);
        if (!url) continue;
        const info = (row.info ?? {}) as Record<string, unknown>;
        const severity = pick<string>(info, ["severity"]);
        const name = pick<string>(info, ["name"]);
        out.push({
          name: url,
          type: "endpoint",
          source: "nuclei",
          tags: ["tool:nuclei", "nuclei", ...(severity ? [`sev:${severity}`] : [])],
          notes: name,
          meta: row,
        });
      }
      return { candidates: out, errors, warnings: [] };
    },
  },
  {
    id: "burp.xml",
    name: "Burp Suite (XML)",
    stage: "vuln",
    description: "Burp Suite issue export or site map XML. Emits affected URLs; issues carry severity tags.",
    accepts: ["xml"],
    detectHints: { filename: ["burp"], content: ["<issues", "<issue>", "<items ", "burpVersion"] },
    parse: (input) => {
      const errors: string[] = [];
      let doc: Document;
      try { doc = parseXml(input); } catch (e) { return { candidates: [], errors: [(e as Error).message], warnings: [] }; }
      const out: AssetCandidate[] = [];

      // Issue export
      const issues = Array.from(doc.getElementsByTagName("issue"));
      for (const iss of issues) {
        const url = iss.getElementsByTagName("host")[0]?.textContent?.trim()
          ?? iss.getElementsByTagName("url")[0]?.textContent?.trim();
        const path = iss.getElementsByTagName("path")[0]?.textContent?.trim();
        const full = path && url ? `${url.replace(/\/$/, "")}${path}` : url;
        if (!full) { errors.push("issue with no host/url"); continue; }
        const severity = iss.getElementsByTagName("severity")[0]?.textContent?.trim().toLowerCase();
        const name = iss.getElementsByTagName("name")[0]?.textContent?.trim();
        const type = iss.getElementsByTagName("type")[0]?.textContent?.trim();
        out.push({
          name: full,
          type: "endpoint",
          source: "burp",
          tags: ["tool:burp", ...(severity ? [`sev:${severity}`] : []), ...(type ? [`burp:${type}`] : [])],
          notes: name,
        });
      }

      // Site map export (<items><item><url>…)
      const items = Array.from(doc.getElementsByTagName("item"));
      for (const it of items) {
        const url = it.getElementsByTagName("url")[0]?.textContent?.trim();
        if (!url) continue;
        const status = it.getElementsByTagName("status")[0]?.textContent?.trim();
        out.push({
          name: url,
          type: "endpoint",
          source: "burp",
          tags: ["tool:burp", "sitemap", ...(status ? [status] : [])],
        });
      }

      return { candidates: out, errors, warnings: [] };
    },
  },
];

export function listImporters(): Importer[] {
  return IMPORTERS;
}

export function importersForStage(stage: string): Importer[] {
  return IMPORTERS.filter((i) => i.stage === stage);
}

export function importerById(id: string): Importer | undefined {
  return IMPORTERS.find((i) => i.id === id);
}

/**
 * Public registration hook so future tool-execution modules can add importers
 * (or synthetic ones) without editing this file.
 */
export function registerImporter(importer: Importer): void {
  const existing = IMPORTERS.findIndex((i) => i.id === importer.id);
  if (existing >= 0) IMPORTERS[existing] = importer;
  else IMPORTERS.push(importer);
}

export function acceptsFormat(importer: Importer, fmt: ImportFormat): boolean {
  return importer.accepts.includes(fmt);
}

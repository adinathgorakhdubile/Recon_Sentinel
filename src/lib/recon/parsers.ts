/** Low-level format helpers reused by importers. */

export function splitLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

export function parseJsonlLines<T = unknown>(input: string): T[] {
  const out: T[] = [];
  for (const line of splitLines(input)) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* ignore malformed line */
    }
  }
  return out;
}

export function parseJsonFlexible<T = unknown>(input: string): T[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  try {
    const value = JSON.parse(trimmed);
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") return [value as T];
  } catch {
    // fall back to JSONL — many recon tools emit newline-delimited JSON.
    return parseJsonlLines<T>(input);
  }
  return [];
}

/** Minimal CSV parser: handles quoted fields, embedded commas, escaped quotes. */
export function parseCsv(input: string): Record<string, string>[] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return [];
  const header = splitCsvRow(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]);
    if (cells.every((c) => c === "")) continue;
    const row: Record<string, string> = {};
    header.forEach((key, idx) => { row[key] = (cells[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Guess a format from filename + payload. */
export function detectFormat(filename: string, sample: string): "json" | "jsonl" | "csv" | "txt" | "xml" {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") return "json";
  if (ext === "jsonl" || ext === "ndjson") return "jsonl";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "xml") return "xml";
  const trimmed = sample.trim();
  if (trimmed.startsWith("<?xml") || /^<[a-z!]/i.test(trimmed)) return "xml";
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  if (trimmed.split(/\r?\n/).slice(0, 3).every((l) => l.trim().startsWith("{"))) return "jsonl";
  if (trimmed.split("\n")[0]?.includes(",") && /,/.test(trimmed)) return "csv";
  return "txt";
}

/** Parse XML into a DOM. Throws with a helpful message on malformed input. */
export function parseXml(input: string): Document {
  const dom = new DOMParser().parseFromString(input, "application/xml");
  const err = dom.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(err.textContent?.split("\n")[0] ?? "malformed XML");
  return dom;
}

/** Convenience: attribute → string | undefined. */
export function attr(el: Element | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v == null ? undefined : v;
}

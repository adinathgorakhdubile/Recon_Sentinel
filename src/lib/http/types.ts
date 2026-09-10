/**
 * HTTP Traffic & Request Library — core types.
 *
 * Designed as a normalized in-browser repository for HTTP messages sourced
 * from raw text, cURL commands, HAR files, Postman collections, and Burp
 * Suite exports. The shape is intentionally verbose so future live proxy
 * capture, replay/fuzzing engines, and AI analyzers can plug in without
 * schema migrations.
 */

export type HttpSource =
  | "manual"
  | "raw"
  | "curl"
  | "har"
  | "postman"
  | "burp"
  | "proxy"
  | "import";

export interface HttpHeader {
  name: string;
  value: string;
}

export interface HttpQueryParam {
  name: string;
  value: string;
}

export interface HttpCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface HttpBody {
  /** Best-effort content type (may be redundant with headers). */
  contentType?: string;
  /** Text body if decodable; otherwise base64. */
  text?: string;
  /** True when `text` is a base64-encoded binary payload. */
  base64?: boolean;
  sizeBytes: number;
}

export interface HttpRequest {
  method: string;
  url: string;
  httpVersion?: string;
  host?: string;
  path?: string;
  scheme?: string;
  headers: HttpHeader[];
  query: HttpQueryParam[];
  cookies: HttpCookie[];
  body?: HttpBody;
}

export interface HttpResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers: HttpHeader[];
  cookies: HttpCookie[];
  body?: HttpBody;
  /** Wire size when known (from HAR / captures). */
  sizeBytes?: number;
}

export interface HttpTiming {
  /** Total round-trip in ms when known. */
  totalMs?: number;
  /** Server-side processing time when reported (Server-Timing / HAR wait). */
  waitMs?: number;
  dnsMs?: number;
  connectMs?: number;
  sslMs?: number;
  sendMs?: number;
  receiveMs?: number;
}

/**
 * One captured/imported HTTP exchange. Requests are always present; responses
 * may be missing (e.g. a raw request pasted for later replay).
 */
export interface HttpItem {
  id: string;
  programId: string | null;
  source: HttpSource;
  /** Optional grouping (Postman folder, Burp target, user collection). */
  collectionId?: string | null;
  title: string;
  notes?: string;
  tags: string[];
  favorite?: boolean;
  /** Stable hash of method+url+headers+body sketch — used for deduplication. */
  fingerprint: string;
  request: HttpRequest;
  response?: HttpResponse;
  timing?: HttpTiming;
  /** ISO string of original capture time if known (HAR startedDateTime). */
  capturedAt?: string;
  createdAt: number;
  updatedAt: number;
  /** Origin filename / import batch — helps trace provenance. */
  origin?: string;
}

export interface HttpCollection {
  id: string;
  programId: string | null;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

/** Result of parsing one input source. Parsers never touch storage themselves. */
export interface HttpParseResult {
  items: Array<Omit<HttpItem, "id" | "createdAt" | "updatedAt" | "programId" | "fingerprint" | "tags"> & { tags?: string[] }>;
  errors: Array<{ index: number; message: string }>;
  format: HttpSource;
}

/** Minimal descriptor for a pluggable parser. */
export interface HttpParser {
  id: HttpSource;
  label: string;
  extensions: string[];
  /** Cheap probe on the raw text; parsers with the highest score win. */
  detect: (text: string, filename?: string) => number;
  parse: (text: string, filename?: string) => HttpParseResult;
}

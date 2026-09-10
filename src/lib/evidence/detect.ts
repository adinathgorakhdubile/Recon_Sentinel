import type { EvidenceKind } from "./types";

/** Best-effort classification of a File into an EvidenceKind. */
export function detectKind(file: File): EvidenceKind {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith("image/")) return "screenshot";
  if (mime.startsWith("video/")) return "recording";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".har")) return "har";
  if (name.endsWith(".log") || name.endsWith(".txt") && /log|out|stderr|stdout/.test(name)) return "log";
  if (/\.(json|jsonl|xml|csv)$/.test(name)) return "scan-result";
  if (/\.(js|ts|tsx|jsx|py|go|rb|php|java|c|cpp|rs|sh|bash|zsh|yml|yaml|toml)$/.test(name)) return "code";
  if (/\.(zip|tar|gz|tgz|7z|rar)$/.test(name)) return "archive";
  if (mime.startsWith("text/")) return "log";
  if (mime.includes("word") || mime.includes("officedocument") || /\.(docx?|pptx?|xlsx?)$/.test(name)) return "document";
  return "other";
}

const KIND_LABELS: Record<EvidenceKind, string> = {
  screenshot: "Screenshot",
  recording: "Recording",
  "http-request": "HTTP Request",
  "http-response": "HTTP Response",
  har: "HAR",
  log: "Log",
  "scan-result": "Scan Result",
  code: "Code",
  payload: "Payload",
  terminal: "Terminal",
  pdf: "PDF",
  document: "Document",
  archive: "Archive",
  other: "Other",
};

export function kindLabel(k: EvidenceKind): string {
  return KIND_LABELS[k] ?? k;
}

export const EVIDENCE_KINDS: EvidenceKind[] = Object.keys(KIND_LABELS) as EvidenceKind[];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isPreviewable(mime: string): "image" | "video" | "pdf" | "text" | null {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/") || /json|xml|javascript|yaml|toml|csv/.test(m)) return "text";
  return null;
}

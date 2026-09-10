import { db } from "@/lib/db";
import { listEvidence } from "@/lib/evidence/repo";
import type { EvidenceItem, EvidenceKind } from "@/lib/evidence/types";

/**
 * Media = the visual subset of evidence. This module reuses the Evidence
 * Engine end-to-end (storage, hashing, versions, links) and adds media-only
 * organization such as host/endpoint grouping and enriched metadata.
 */

export const MEDIA_KINDS: EvidenceKind[] = ["screenshot", "recording"];

export function isMediaMime(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return m.startsWith("image/") || m.startsWith("video/");
}

export function isMediaItem(item: EvidenceItem): boolean {
  return MEDIA_KINDS.includes(item.kind) || isMediaMime(item.mime);
}

export async function listMedia(programId: string | null): Promise<EvidenceItem[]> {
  const rows = await listEvidence(programId);
  return rows.filter(isMediaItem);
}

/** Group items by resolved host. Reads meta.host first, falls back to
 *  parsing meta.url. Unknown hosts fall into "(unknown)". */
export function groupByHost(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const out = new Map<string, EvidenceItem[]>();
  for (const i of items) {
    const host = hostOf(i);
    const arr = out.get(host) ?? [];
    arr.push(i);
    out.set(host, arr);
  }
  return out;
}

export function hostOf(item: EvidenceItem): string {
  const meta = item.meta ?? {};
  if (typeof meta.host === "string" && meta.host) return meta.host;
  const url = typeof meta.url === "string" ? meta.url : undefined;
  if (url) {
    try { return new URL(url).host; } catch { /* ignore */ }
  }
  return "(unknown)";
}

export function endpointOf(item: EvidenceItem): string | null {
  const meta = item.meta ?? {};
  if (typeof meta.endpoint === "string") return meta.endpoint;
  const url = typeof meta.url === "string" ? meta.url : undefined;
  if (url) {
    try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { /* ignore */ }
  }
  return null;
}

/** Simple client-side metadata extraction for an image blob. */
export async function extractImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

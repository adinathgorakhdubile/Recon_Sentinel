import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Video, FileWarning } from "lucide-react";
import type { EvidenceItem } from "@/lib/evidence/types";
import { getBlob, objectUrlFor } from "@/lib/evidence/repo";
import { isPreviewable, formatSize } from "@/lib/evidence/detect";

interface Props {
  item: EvidenceItem;
  maxTextChars?: number;
}

/** Best-effort inline preview for the current evidence blob. */
export function EvidencePreview({ item, maxTextChars = 4000 }: Props) {
  const kind = isPreviewable(item.mime);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objUrl: string | null = null;

    (async () => {
      try {
        if (kind === "image" || kind === "video" || kind === "pdf") {
          objUrl = await objectUrlFor(item);
          if (!revoked) setUrl(objUrl);
        } else if (kind === "text") {
          const blob = await getBlob(item.blobId);
          if (blob) {
            const t = await blob.text();
            if (!revoked) setText(t.slice(0, maxTextChars) + (t.length > maxTextChars ? "\n\n… truncated" : ""));
          }
        }
      } catch (e) {
        if (!revoked) setErr(String((e as Error).message ?? e));
      }
    })();

    return () => {
      revoked = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [item.blobId, kind, item, maxTextChars]);

  if (err) {
    return <PreviewShell icon={<FileWarning className="h-6 w-6" />} label={`Preview failed: ${err}`} />;
  }
  if (!kind) {
    return (
      <PreviewShell
        icon={<FileText className="h-6 w-6" />}
        label={`${item.mime || "binary"} · ${formatSize(item.sizeBytes)} · no inline preview`}
      />
    );
  }
  if (kind === "image") {
    return url ? (
      <img src={url} alt={item.title} className="max-h-[420px] w-full object-contain rounded-md bg-muted/20 border border-border/60" />
    ) : <PreviewShell icon={<ImageIcon className="h-6 w-6" />} label="Loading image…" />;
  }
  if (kind === "video") {
    return url ? (
      <video src={url} controls className="max-h-[420px] w-full rounded-md bg-black" />
    ) : <PreviewShell icon={<Video className="h-6 w-6" />} label="Loading video…" />;
  }
  if (kind === "pdf") {
    return url ? (
      <iframe title={item.title} src={url} className="w-full h-[420px] rounded-md border border-border/60 bg-background" />
    ) : <PreviewShell icon={<FileText className="h-6 w-6" />} label="Loading PDF…" />;
  }
  if (kind === "text") {
    return (
      <pre className="mono text-xs whitespace-pre-wrap max-h-[420px] overflow-auto p-3 rounded-md border border-border/60 bg-muted/20">
        {text ?? "Loading…"}
      </pre>
    );
  }
  return null;
}

function PreviewShell({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-6 flex items-center gap-3 text-sm text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Play, Image as ImageIcon } from "lucide-react";
import { objectUrlFor } from "@/lib/evidence/repo";
import type { EvidenceItem } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

interface Props {
  item: EvidenceItem;
  selected?: boolean;
  onClick?: () => void;
}

/** Thumbnail tile used by the media gallery grid. */
export function MediaThumb({ item, selected, onClick }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = (item.mime || "").startsWith("video/");
  useEffect(() => {
    let u: string | null = null; let cancelled = false;
    objectUrlFor(item).then((r) => { if (!cancelled) { u = r; setUrl(r); } });
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u); };
  }, [item.blobId, item]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative aspect-video overflow-hidden rounded-md border bg-muted/20 text-left transition-all",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-primary/40",
      )}
    >
      {url ? (
        isVideo ? (
          <video src={url} className="h-full w-full object-cover" muted />
        ) : (
          <img src={url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        )
      ) : (
        <div className="grid place-items-center h-full w-full text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 grid place-items-center bg-black/25">
          <Play className="h-7 w-7 text-white/90" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="text-[11px] text-white truncate">{item.title}</div>
      </div>
    </button>
  );
}

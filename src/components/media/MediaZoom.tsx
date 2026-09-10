import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { objectUrlFor } from "@/lib/evidence/repo";
import type { EvidenceItem } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

interface Props {
  item: EvidenceItem;
  className?: string;
}

/** Pan + zoom viewer for image evidence. Wheel to zoom, drag to pan. */
export function MediaZoom({ item, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let u: string | null = null; let cancelled = false;
    objectUrlFor(item).then((r) => { if (!cancelled) { u = r; setUrl(r); } });
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u); };
  }, [item.blobId, item]);

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div className={cn("relative rounded-md border border-border/60 overflow-hidden bg-black/60", className)} style={{ height: 420 }}>
      <div
        className="absolute inset-0 grid place-items-center cursor-grab active:cursor-grabbing"
        onWheel={(e) => {
          e.preventDefault();
          const next = Math.max(0.2, Math.min(8, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
          setScale(next);
        }}
        onPointerDown={(e) => { dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }; }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
        }}
        onPointerUp={() => { dragging.current = null; }}
      >
        {url && (
          <img
            src={url}
            alt={item.title}
            draggable={false}
            className="max-h-full max-w-full object-contain select-none pointer-events-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "center center", transition: dragging.current ? "none" : "transform 60ms linear" }}
          />
        )}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1 bg-background/80 backdrop-blur rounded-md border border-border/60 p-1">
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.2, s / 1.2))}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="mono text-[10px] w-10 text-center self-center">{(scale * 100).toFixed(0)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(8, s * 1.2))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={reset}><Maximize2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

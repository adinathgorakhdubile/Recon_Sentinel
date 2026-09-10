import { useEffect, useMemo, useRef, useState } from "react";
import { Square, ArrowUpRight, Highlighter, EyeOff, Type, Trash2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addAnnotation, deleteAnnotation, listAnnotations, objectUrlFor } from "@/lib/evidence/repo";
import type { AnnotationKind, AnnotationRegion, EvidenceAnnotation, EvidenceItem } from "@/lib/evidence/types";

type Tool = "box" | "arrow" | "highlight" | "blur" | "text";

const TOOL_META: Record<Tool, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  box:       { label: "Box",       color: "#f43f5e", icon: Square },
  arrow:     { label: "Arrow",     color: "#38bdf8", icon: ArrowUpRight },
  highlight: { label: "Highlight", color: "#facc15", icon: Highlighter },
  blur:      { label: "Redact",    color: "#000000", icon: EyeOff },
  text:      { label: "Text",      color: "#22d3ee", icon: Type },
};

interface Props {
  item: EvidenceItem;
  className?: string;
}

/**
 * SVG-overlay annotator for images. Annotations persist through the shared
 * Evidence Engine so the report generator and AI analysis pipelines see the
 * same data. Coordinates are percentages so annotations survive re-scaling.
 */
export function MediaAnnotator({ item, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("box");
  const [annotations, setAnnotations] = useState<EvidenceAnnotation[]>([]);
  const [draft, setDraft] = useState<AnnotationRegion | null>(null);
  const [pendingText, setPendingText] = useState<{ region: AnnotationRegion; value: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let objUrl: string | null = null;
    let revoked = false;
    (async () => {
      objUrl = await objectUrlFor(item);
      if (!revoked) setUrl(objUrl);
    })();
    return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [item.blobId, item]);

  const reload = () => listAnnotations(item.id).then(setAnnotations);
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item.id]);

  const shapes = useMemo(() => annotations.filter((a) => a.region), [annotations]);

  const localPoint = (ev: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp(((ev.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((ev.clientY - r.top) / r.height) * 100, 0, 100),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!url) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = localPoint(e);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0, x2: p.x, y2: p.y, color: TOOL_META[tool].color });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = localPoint(e);
    setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y, x2: p.x, y2: p.y });
  };
  const onUp = async () => {
    if (!draft) return;
    const region = normalize(draft);
    setDraft(null);
    if (region.w < 0.5 && region.h < 0.5) return; // ignore taps
    if (tool === "text") {
      setPendingText({ region, value: "" });
      return;
    }
    await addAnnotation({ evidenceId: item.id, kind: tool, body: "", region });
    reload();
  };

  const saveText = async () => {
    if (!pendingText) return;
    await addAnnotation({ evidenceId: item.id, kind: "text", body: pendingText.value, region: pendingText.region });
    setPendingText(null);
    reload();
  };

  const remove = async (id: string) => { await deleteAnnotation(id); reload(); };
  const undo = async () => {
    const last = [...shapes].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last) { await deleteAnnotation(last.id); reload(); }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(TOOL_META) as Tool[]).map((t) => {
          const Icon = TOOL_META[t].icon;
          return (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
                tool === t ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/30",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {TOOL_META[t].label}
            </button>
          );
        })}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={undo} disabled={shapes.length === 0}>
          <Undo2 className="h-3.5 w-3.5 mr-1" />Undo
        </Button>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative rounded-md border border-border/60 bg-muted/20 overflow-hidden select-none touch-none"
        style={{ aspectRatio: "16/10" }}
      >
        {url ? (
          <img src={url} alt={item.title} className="absolute inset-0 h-full w-full object-contain pointer-events-none" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading…</div>
        )}
        <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#38bdf8" />
            </marker>
            <filter id="blur">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
          </defs>
          {shapes.map((a) => a.region && <Shape key={a.id} ann={a} region={a.region} onRemove={() => remove(a.id)} />)}
          {draft && <Shape draft ann={{ kind: tool, body: "" } as EvidenceAnnotation} region={normalize(draft)} />}
        </svg>
      </div>

      {pendingText && (
        <div className="flex gap-2 items-center">
          <Input
            autoFocus
            value={pendingText.value}
            onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
            placeholder="Annotation text"
            onKeyDown={(e) => e.key === "Enter" && saveText()}
          />
          <Button size="sm" onClick={saveText}><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingText(null)}>Cancel</Button>
        </div>
      )}

      {shapes.length > 0 && (
        <ul className="text-xs mono space-y-1 max-h-32 overflow-auto border border-border/60 rounded-md p-2">
          {shapes.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: a.region?.color ?? "#888" }} />
              <span className="uppercase text-[10px] text-muted-foreground w-14">{a.kind}</span>
              <span className="flex-1 truncate">{a.body || "(no label)"}</span>
              <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Shape({ ann, region, draft, onRemove }: { ann: EvidenceAnnotation; region: AnnotationRegion; draft?: boolean; onRemove?: () => void }) {
  const color = region.color ?? TOOL_META[(ann.kind as Tool) ?? "box"]?.color ?? "#f43f5e";
  const opacity = draft ? 0.6 : 1;
  if (ann.kind === "arrow") {
    return (
      <line
        x1={region.x} y1={region.y}
        x2={region.x2 ?? region.x + region.w} y2={region.y2 ?? region.y + region.h}
        stroke={color} strokeWidth={0.6} markerEnd="url(#arr)" opacity={opacity}
      />
    );
  }
  const commonRect = {
    x: region.x, y: region.y, width: region.w, height: region.h,
    onClick: onRemove, style: { cursor: onRemove ? "pointer" : "default" } as React.CSSProperties,
  };
  if (ann.kind === "highlight") {
    return <rect {...commonRect} fill={color} opacity={0.25 * opacity} />;
  }
  if (ann.kind === "blur") {
    return <rect {...commonRect} fill="#000" opacity={0.85 * opacity} filter="url(#blur)" />;
  }
  if (ann.kind === "text") {
    return (
      <>
        <rect {...commonRect} fill="none" stroke={color} strokeWidth={0.4} strokeDasharray="1 0.6" opacity={opacity} />
        <text x={region.x + 0.5} y={region.y + 2.5} fontSize={2.5} fill={color} opacity={opacity}>{ann.body}</text>
      </>
    );
  }
  // box
  return <rect {...commonRect} fill="none" stroke={color} strokeWidth={0.6} opacity={opacity} />;
}

function normalize(r: AnnotationRegion): AnnotationRegion {
  const x = Math.min(r.x, r.x + r.w);
  const y = Math.min(r.y, r.y + r.h);
  const w = Math.abs(r.w);
  const h = Math.abs(r.h);
  return { ...r, x, y, w, h };
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

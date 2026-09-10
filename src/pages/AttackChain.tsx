import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { SeverityBadge, StatusChip } from "@/components/Badges";
import { Network, NotebookPen, Bug, ShieldCheck, X, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset, Finding, Note, Program } from "@/types";

type NodeKind = "program" | "asset" | "note" | "finding";
interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  data: Program | Asset | Note | Finding;
}
interface GEdge { from: string; to: string; kind: "asset" | "note" | "finding" | "cross" }

const COLORS: Record<NodeKind, { fill: string; stroke: string; text: string }> = {
  program: { fill: "hsl(var(--primary) / 0.2)", stroke: "hsl(var(--primary))", text: "hsl(var(--primary))" },
  asset:   { fill: "rgba(34,211,238,0.15)",     stroke: "rgb(34,211,238)",    text: "rgb(103,232,249)" },
  note:    { fill: "rgba(251,191,36,0.15)",     stroke: "rgb(251,191,36)",    text: "rgb(253,224,71)" },
  finding: { fill: "rgba(244,63,94,0.15)",      stroke: "rgb(244,63,94)",     text: "rgb(253,164,175)" },
};

export default function AttackChainPage() {
  return <EmptyProgramGate><AttackChainInner /></EmptyProgramGate>;
}

function AttackChainInner() {
  const { activeProgram, assets, notes, findings } = useWorkspace();
  const [selected, setSelected] = useState<GNode | null>(null);

  const { nodes, edges, size } = useMemo(() => buildGraph(activeProgram!, assets, notes, findings), [activeProgram, assets, notes, findings]);

  return (
    <>
      <PageHeader
        eyebrow="Cross-link visualization"
        title="Attack Chain Graph"
        actions={
          <div className="chip border-primary/40 text-primary bg-primary/10">
            <GitBranch className="h-3 w-3" />
            {assets.length} assets · {notes.length} notes · {findings.length} findings
          </div>
        }
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="panel p-0 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="absolute top-10 left-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl animate-pulse" />
            <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
          </div>
          <div className="relative overflow-auto" style={{ maxHeight: "78vh" }}>
            <svg width={size.w} height={size.h} className="block">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--primary) / 0.7)" />
                </marker>
              </defs>

              {edges.map((e, i) => {
                const a = nodes.find(n => n.id === e.from)!;
                const b = nodes.find(n => n.id === e.to)!;
                const stroke =
                  e.kind === "finding" ? "rgba(244,63,94,0.55)" :
                  e.kind === "note"    ? "rgba(251,191,36,0.5)" :
                  e.kind === "cross"   ? "rgba(168,85,247,0.55)" :
                                          "hsl(var(--primary) / 0.5)";
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2 - 30;
                const d = `M ${a.x} ${a.y} Q ${mx} ${my}, ${b.x} ${b.y}`;
                return (
                  <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={1.5} markerEnd="url(#arr)"
                        strokeDasharray={e.kind === "cross" ? "4 4" : undefined}
                        style={{ animation: `dash 3s linear infinite`, strokeDashoffset: 0 }} />
                );
              })}

              {nodes.map((n, i) => {
                const c = COLORS[n.kind];
                const r = n.kind === "program" ? 34 : n.kind === "asset" ? 26 : 20;
                const isSel = selected?.id === n.id;
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`}
                     className="cursor-pointer" onClick={() => setSelected(n)}
                     style={{ animation: `fade-in 0.5s ease-out both`, animationDelay: `${i * 40}ms` }}>
                    <circle r={r + 8} fill={c.stroke} opacity={isSel ? 0.35 : 0.12} className={isSel ? "animate-pulse" : ""} />
                    <circle r={r} fill={c.fill} stroke={c.stroke} strokeWidth={isSel ? 2.5 : 1.5} />
                    <text y={r + 14} textAnchor="middle" fill={c.text} className="mono" style={{ fontSize: 10 }}>
                      {truncate(n.label, 22)}
                    </text>
                    <text y={4} textAnchor="middle" fill={c.text} style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {n.kind}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="absolute bottom-3 left-3 panel p-2 flex flex-wrap gap-2 text-[10px] mono uppercase">
            <Legend color="hsl(var(--primary))" label="Program" />
            <Legend color="rgb(34,211,238)" label="Asset" />
            <Legend color="rgb(251,191,36)" label="Note" />
            <Legend color="rgb(244,63,94)" label="Finding" />
            <Legend color="rgb(168,85,247)" label="Cross-link" dashed />
          </div>
        </div>

        <aside className="panel p-5 lg:sticky lg:top-4 h-fit max-h-[80vh] overflow-y-auto">
          {selected ? <Detail node={selected} onClose={() => setSelected(null)} /> : (
            <div className="text-sm text-muted-foreground text-center py-12">
              <GitBranch className="h-8 w-8 mx-auto mb-3 text-primary/60" />
              Click any node to inspect its data and cross-links.
            </div>
          )}
        </aside>
      </div>

      <style>{`@keyframes dash { to { stroke-dashoffset: -20; } }`}</style>
    </>
  );
}

function buildGraph(program: Program, assets: Asset[], notes: Note[], findings: Finding[]) {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  const centerX = 480;
  const centerY = 90;
  nodes.push({ id: `p:${program.id}`, kind: "program", label: program.name, x: centerX, y: centerY, data: program });

  const cols = Math.max(1, assets.length);
  const colW = Math.max(220, 900 / cols);
  const totalW = Math.max(960, colW * cols);
  const assetY = 260;

  assets.forEach((a, i) => {
    const x = (i + 0.5) * colW;
    nodes.push({ id: `a:${a.id}`, kind: "asset", label: a.name, x, y: assetY, data: a });
    edges.push({ from: `p:${program.id}`, to: `a:${a.id}`, kind: "asset" });
  });

  const assetX = (id: string) => nodes.find(n => n.id === `a:${id}`)?.x;

  const notesByAsset = new Map<string, Note[]>();
  const orphanNotes: Note[] = [];
  notes.forEach(n => {
    if (n.relatedAssetId && assets.find(a => a.id === n.relatedAssetId)) {
      const arr = notesByAsset.get(n.relatedAssetId) ?? [];
      arr.push(n); notesByAsset.set(n.relatedAssetId, arr);
    } else orphanNotes.push(n);
  });

  const noteY = 430;
  notesByAsset.forEach((arr, aid) => {
    const baseX = assetX(aid)!;
    arr.forEach((n, i) => {
      const x = baseX + (i - (arr.length - 1) / 2) * 100;
      nodes.push({ id: `n:${n.id}`, kind: "note", label: n.title, x, y: noteY, data: n });
      edges.push({ from: `a:${aid}`, to: `n:${n.id}`, kind: "note" });
    });
  });
  orphanNotes.forEach((n, i) => {
    nodes.push({ id: `n:${n.id}`, kind: "note", label: n.title, x: 60 + i * 140, y: noteY + 90, data: n });
  });

  const findY = 610;
  const findingsByAsset = new Map<string, Finding[]>();
  const orphanFindings: Finding[] = [];
  findings.forEach(f => {
    const a = assets.find(x => x.name === f.affectedAsset);
    if (a) {
      const arr = findingsByAsset.get(a.id) ?? [];
      arr.push(f); findingsByAsset.set(a.id, arr);
    } else orphanFindings.push(f);
  });
  findingsByAsset.forEach((arr, aid) => {
    const baseX = assetX(aid)!;
    arr.forEach((f, i) => {
      const x = baseX + (i - (arr.length - 1) / 2) * 100;
      nodes.push({ id: `f:${f.id}`, kind: "finding", label: f.title, x, y: findY, data: f });
      edges.push({ from: `a:${aid}`, to: `f:${f.id}`, kind: "finding" });
      // cross-link note ↔ finding if tags/keywords overlap
      const relatedNotes = notes.filter(n =>
        n.relatedAssetId === aid ||
        n.tags.some(t => f.title.toLowerCase().includes(t.toLowerCase()))
      );
      relatedNotes.slice(0, 2).forEach(n => {
        edges.push({ from: `n:${n.id}`, to: `f:${f.id}`, kind: "cross" });
      });
    });
  });
  orphanFindings.forEach((f, i) => {
    nodes.push({ id: `f:${f.id}`, kind: "finding", label: f.title, x: 60 + i * 140, y: findY + 80, data: f });
  });

  return {
    nodes, edges,
    size: { w: Math.max(totalW, 960), h: 760 },
  };
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "3 3" : undefined} /></svg>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Detail({ node, onClose }: { node: GNode; onClose: () => void }) {
  const kindIcon = { program: ShieldCheck, asset: Network, note: NotebookPen, finding: Bug }[node.kind];
  const Icon = kindIcon;
  const d: any = node.data;
  const c = COLORS[node.kind];
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded border grid place-items-center shrink-0"
               style={{ background: c.fill, borderColor: c.stroke, color: c.text }}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{node.kind}</div>
            <div className="display font-semibold truncate">{node.label}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {node.kind === "finding" && (
        <div className="space-y-3 text-sm">
          <div className="flex gap-2"><SeverityBadge severity={d.severity} /><StatusChip status={d.status} /></div>
          <F label="Affected" v={d.affectedAsset} mono />
          <F label="Impact" v={d.impact} />
          <F label="Evidence" v={d.evidence} />
          <F label="Reproduction" v={d.reproductionSteps} />
          {d.reconOutput && <F label="Recon output" v={d.reconOutput} mono />}
          {d.nextSteps && <F label="AI next steps" v={d.nextSteps} />}
        </div>
      )}
      {node.kind === "asset" && (
        <div className="space-y-3 text-sm">
          <F label="Type" v={d.type} />
          <F label="Status" v={<StatusChip status={d.status} />} />
          <F label="Source" v={d.source} mono />
          <F label="Notes" v={d.notes || "—"} />
        </div>
      )}
      {node.kind === "note" && (
        <div className="space-y-3 text-sm">
          <F label="Tags" v={(d.tags || []).map((t: string) => `#${t}`).join(" ") || "—"} mono />
          <F label="Body" v={d.body} />
        </div>
      )}
      {node.kind === "program" && (
        <div className="space-y-3 text-sm">
          <F label="Target" v={d.targetRoot} mono />
          <F label="In scope" v={d.inScope.join("\n")} mono />
          <F label="Rules" v={d.rules} />
        </div>
      )}
    </div>
  );
}

function F({ label, v, mono }: { label: string; v: any; mono?: boolean }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-primary/70 mb-1">{label}</div>
      <div className={cn("rounded-md border border-border/60 bg-muted/20 p-2.5 whitespace-pre-wrap", mono ? "mono text-[12px]" : "text-sm")}>
        {v || <span className="text-muted-foreground italic">—</span>}
      </div>
    </div>
  );
}

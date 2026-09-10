import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip } from "@/components/Badges";
import { RelatedPanel } from "@/components/RelatedPanel";
import { riskBand, type AssetHealth, type AssetIntel, type AssetKind } from "@/lib/assets/intel";
import { formatDistanceToNow } from "date-fns";
import type { Asset, AssetStatus, EntityLink } from "@/types";
import {
  Search, Radar, Shield, AlertTriangle, Trash2, Tag, Cpu, Globe, Server,
  Network as NetworkIcon, Link2, Activity, Layers, Zap,
} from "lucide-react";
import { toast } from "sonner";

const KINDS: AssetKind[] = [
  "domain", "subdomain", "ip", "url", "endpoint", "port",
  "technology", "service", "dns", "certificate", "screenshot", "cloud", "repository", "other",
];

const KIND_ICON: Record<AssetKind, any> = {
  domain: Globe, subdomain: Globe, ip: Server, url: Link2, endpoint: Zap, port: NetworkIcon,
  technology: Cpu, service: Layers, dns: Radar, certificate: Shield, screenshot: Radar,
  cloud: Server, repository: Layers, other: Radar,
};

const HEALTH_TONE: Record<AssetHealth, string> = {
  unknown: "text-muted-foreground border-border",
  live: "text-emerald-300 border-emerald-500/40 bg-emerald-500/5",
  redirect: "text-sky-300 border-sky-500/40 bg-sky-500/5",
  auth: "text-amber-300 border-amber-500/40 bg-amber-500/5",
  error: "text-rose-300 border-rose-500/40 bg-rose-500/5",
  dead: "text-muted-foreground border-border/50",
};

const RISK_TONE: Record<string, string> = {
  info: "text-muted-foreground border-border",
  low: "text-emerald-300 border-emerald-500/40 bg-emerald-500/5",
  medium: "text-amber-300 border-amber-500/40 bg-amber-500/5",
  high: "text-orange-300 border-orange-500/40 bg-orange-500/5",
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/5",
};

export default function AssetExplorerPage() {
  return (
    <EmptyProgramGate>
      <AssetExplorerInner />
    </EmptyProgramGate>
  );
}

function AssetExplorerInner() {
  const { activeProgram, assets, updateAsset, deleteAsset } = useWorkspace();
  const program = activeProgram!;

  const intel = useLiveQuery(
    () => db.assetIntel.where("programId").equals(program.id).toArray(),
    [program.id],
    [] as AssetIntel[],
  ) ?? [];

  const intelById = useMemo(() => new Map(intel.map((i) => [i.assetId, i])), [intel]);

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [health, setHealth] = useState<string>("all");
  const [tech, setTech] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const allTech = useMemo(() => {
    const s = new Set<string>();
    for (const i of intel) for (const t of i.technologies) s.add(t);
    return Array.from(s).sort();
  }, [intel]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return assets
      .map((a) => ({ asset: a, intel: intelById.get(a.id) }))
      .filter(({ asset, intel: i }) => {
        if (!i) return kind === "all"; // pre-enrichment fallback
        if (kind !== "all" && i.kind !== kind) return false;
        if (status !== "all" && asset.status !== status) return false;
        if (health !== "all" && i.health !== health) return false;
        if (risk !== "all" && riskBand(i.riskScore) !== risk) return false;
        if (tech !== "all" && !i.technologies.includes(tech)) return false;
        if (query) {
          const hay = [asset.name, i.host, i.title ?? "", ...i.technologies, ...asset.tags].join(" ").toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });
  }, [assets, intelById, q, kind, status, risk, health, tech]);

  const stats = useMemo(() => {
    const totals = { total: intel.length, critical: 0, high: 0, live: 0, tech: allTech.length };
    for (const i of intel) {
      const band = riskBand(i.riskScore);
      if (band === "critical") totals.critical++;
      if (band === "high") totals.high++;
      if (i.health === "live") totals.live++;
    }
    return totals;
  }, [intel, allTech]);

  const toggleRow = (id: string, on?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const active = on ?? !next.has(id);
      if (active) next.add(id); else next.delete(id);
      return next;
    });
  };
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.asset.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.asset.id)));
  };

  const bulkStatus = (s: AssetStatus) => {
    for (const id of selected) updateAsset(id, { status: s });
    toast.success(`Updated ${selected.size} asset${selected.size === 1 ? "" : "s"} → ${s}`);
    setSelected(new Set());
  };
  const bulkTag = () => {
    const t = prompt("Tag to add to selected assets:");
    if (!t) return;
    for (const id of selected) {
      const a = assets.find((x) => x.id === id);
      if (!a) continue;
      if (a.tags.includes(t)) continue;
      updateAsset(id, { tags: [...a.tags, t] });
    }
    toast.success(`Tagged ${selected.size} asset${selected.size === 1 ? "" : "s"} with #${t}`);
    setSelected(new Set());
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.size} assets?`)) return;
    for (const id of selected) deleteAsset(id);
    toast.success(`Deleted ${selected.size}`);
    setSelected(new Set());
  };

  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="Asset Explorer"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="Enriched" value={stats.total} icon={Layers} />
        <StatCard label="Critical" value={stats.critical} tone="destructive" icon={AlertTriangle} />
        <StatCard label="High risk" value={stats.high} tone="warning" icon={Shield} />
        <StatCard label="Live" value={stats.live} tone="primary" icon={Activity} />
        <StatCard label="Technologies" value={stats.tech} icon={Cpu} />
      </div>

      <div className="panel p-3 mb-4 flex flex-wrap gap-2 items-end">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search host, title, tech, tag…" className="pl-8" />
        </div>
        <FilterSelect label="Kind" value={kind} onChange={setKind} options={[["all", "All kinds"], ...KINDS.map((k) => [k, k] as [string, string])]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[["all", "All"], ["new", "new"], ["triaging", "triaging"], ["in-scope", "in-scope"], ["out-of-scope", "out-of-scope"], ["archived", "archived"]]} />
        <FilterSelect label="Risk" value={risk} onChange={setRisk} options={[["all", "Any risk"], ["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"], ["info", "Info"]]} />
        <FilterSelect label="Health" value={health} onChange={setHealth} options={[["all", "Any"], ["live", "Live"], ["redirect", "Redirect"], ["auth", "Auth-gated"], ["error", "Error"], ["dead", "Dead"], ["unknown", "Unknown"]]} />
        <FilterSelect
          label="Tech"
          value={tech}
          onChange={setTech}
          options={[["all", "Any tech"], ...allTech.slice(0, 60).map((t) => [t, t] as [string, string])]}
        />
      </div>

      {selected.size > 0 && (
        <div className="panel p-3 mb-3 flex flex-wrap items-center gap-2 text-sm border-primary/40">
          <span className="mono text-xs text-muted-foreground">{selected.size} selected</span>
          <div className="flex-1" />
          <Select onValueChange={(v) => bulkStatus(v as AssetStatus)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Set status" /></SelectTrigger>
            <SelectContent>
              {["new", "triaging", "in-scope", "out-of-scope", "archived"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={bulkTag}><Tag className="h-3.5 w-3.5 mr-1.5" />Tag</Button>
          <Button variant="outline" size="sm" onClick={bulkDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel p-10 text-center">
          <Radar className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No assets match the current filters. Try clearing filters, or import recon output from the pipeline.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="hidden md:grid grid-cols-[auto_1.5fr_0.8fr_0.8fr_0.8fr_1.2fr_0.9fr_auto] gap-3 px-4 py-2.5 mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/60 bg-muted/20">
            <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
            <div>Asset</div><div>Kind</div><div>Risk</div><div>Health</div><div>Tech</div><div>Status</div><div>Seen</div>
          </div>
          <ul>
            {rows.map(({ asset, intel: i }) => (
              <li
                key={asset.id}
                className="grid grid-cols-1 md:grid-cols-[auto_1.5fr_0.8fr_0.8fr_0.8fr_1.2fr_0.9fr_auto] gap-3 px-4 py-3 border-b border-border/40 hover:bg-muted/20 items-center cursor-pointer"
                onClick={() => setOpenId(asset.id)}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(asset.id)} onCheckedChange={(v) => toggleRow(asset.id, !!v)} />
                </div>
                <div className="min-w-0">
                  <div className="mono text-sm truncate">{asset.name}</div>
                  {i?.title && <div className="text-[11px] text-muted-foreground truncate">{i.title}</div>}
                  {asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {asset.tags.slice(0, 4).map((t) => <span key={t} className="chip text-[10px]">#{t}</span>)}
                      {asset.tags.length > 4 && <span className="chip text-[10px]">+{asset.tags.length - 4}</span>}
                    </div>
                  )}
                </div>
                <KindBadge kind={i?.kind ?? (asset.type as AssetKind)} />
                <RiskBadge score={i?.riskScore ?? 0} />
                <HealthBadge health={i?.health ?? "unknown"} />
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(i?.technologies ?? []).slice(0, 3).map((t) => (
                    <span key={t} className="chip text-[10px] text-primary border-primary/30">{t}</span>
                  ))}
                  {(i?.technologies.length ?? 0) > 3 && <span className="chip text-[10px]">+{(i!.technologies.length - 3)}</span>}
                </div>
                <div><StatusChip status={asset.status} /></div>
                <div className="text-[11px] text-muted-foreground mono whitespace-nowrap">
                  {formatDistanceToNow(i?.lastSeenAt ?? asset.createdAt, { addSuffix: true })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AssetProfile
        assetId={openId}
        onOpenChange={(v) => !v && setOpenId(null)}
      />
    </>
  );
}

function AssetProfile({ assetId, onOpenChange }: { assetId: string | null; onOpenChange: (v: boolean) => void }) {
  const open = !!assetId;
  const asset = useLiveQuery(
    () => assetId ? db.assets.get(assetId) : Promise.resolve(undefined),
    [assetId],
  );
  const intel = useLiveQuery(
    () => assetId ? db.assetIntel.get(assetId) : Promise.resolve(undefined),
    [assetId],
  );
  const links = useLiveQuery(async () => {
    if (!assetId) return [] as EntityLink[];
    const [a, b] = await Promise.all([
      db.links.where("[fromType+fromId]").equals(["asset", assetId]).toArray(),
      db.links.where("[toType+toId]").equals(["asset", assetId]).toArray(),
    ]);
    return [...a, ...b];
  }, [assetId], [] as EntityLink[]) ?? [];

  const relatedIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of links) {
      if (l.fromType === "asset" && l.fromId !== assetId) s.add(l.fromId);
      if (l.toType === "asset" && l.toId !== assetId) s.add(l.toId);
    }
    return Array.from(s);
  }, [links, assetId]);

  const related = useLiveQuery(
    () => relatedIds.length ? db.assets.bulkGet(relatedIds) : Promise.resolve([]),
    [relatedIds.join(",")],
    [] as (Asset | undefined)[],
  ) ?? [];

  const activity = useLiveQuery(async () => {
    if (!assetId) return [];
    const all = await db.activity.where("entityId").equals(assetId).reverse().sortBy("ts");
    return all.slice(0, 20);
  }, [assetId], []) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="mono text-sm break-all">{asset?.name ?? "Asset"}</SheetTitle>
        </SheetHeader>

        {asset && (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap gap-2">
              <KindBadge kind={(intel?.kind ?? asset.type) as AssetKind} />
              <StatusChip status={asset.status} />
              {intel && <RiskBadge score={intel.riskScore} />}
              {intel && <HealthBadge health={intel.health} />}
            </div>

            {intel && (
              <Section title="Fingerprint">
                <Field label="Host" value={intel.host} mono />
                {intel.port && <Field label="Port" value={String(intel.port)} mono />}
                {intel.scheme && <Field label="Scheme" value={intel.scheme} mono />}
                {intel.path && <Field label="Path" value={intel.path} mono />}
                {intel.parentHost && <Field label="Parent" value={intel.parentHost} mono />}
                {intel.statusCode !== undefined && <Field label="HTTP" value={String(intel.statusCode)} mono />}
                <Field label="Fingerprint" value={intel.fingerprint.key} mono />
              </Section>
            )}

            {intel && intel.technologies.length > 0 && (
              <Section title="Technologies">
                <div className="flex flex-wrap gap-1">
                  {intel.technologies.map((t) => (
                    <span key={t} className="chip text-[11px] text-primary border-primary/30">{t}</span>
                  ))}
                </div>
              </Section>
            )}

            {intel && intel.riskReasons.length > 0 && (
              <Section title={`Risk · ${intel.riskScore}/100`}>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {intel.riskReasons.map((r) => (
                    <li key={r} className="flex items-start gap-2"><AlertTriangle className="h-3 w-3 mt-0.5 text-warning" />{r}</li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title={`Related assets (${related.filter(Boolean).length})`}>
              {related.filter(Boolean).length === 0 ? (
                <p className="text-xs text-muted-foreground">No correlations yet.</p>
              ) : (
                <ul className="space-y-1">
                  {(related.filter(Boolean) as Asset[]).map((r) => {
                    const link = links.find(
                      (l) => (l.fromId === r.id && l.toId === assetId) || (l.toId === r.id && l.fromId === assetId),
                    );
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                        <button
                          className="mono truncate hover:text-primary text-left flex-1"
                          onClick={() => onOpenChange(false)}
                          title={r.name}
                        >
                          {r.name}
                        </button>
                        <span className="chip text-[10px]">{link?.kind ?? "relates-to"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-2">
                <RelatedPanel entityType="asset" entityId={asset.id} programId={asset.programId} />
              </div>
            </Section>

            <Section title="Timeline">
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-xs">
                      <span className="chip text-[10px] w-16 justify-center">{a.action}</span>
                      <span className="flex-1 truncate">{a.summary}</span>
                      <span className="mono text-[10px] text-muted-foreground">
                        {formatDistanceToNow(a.ts, { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {intel && (
              <Section title="Provenance">
                <Field label="First seen" value={new Date(intel.firstSeenAt).toLocaleString()} />
                <Field label="Last seen" value={new Date(intel.lastSeenAt).toLocaleString()} />
                <Field label="Recon runs" value={intel.sourceRuns.length ? String(intel.sourceRuns.length) : "manual"} />
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function KindBadge({ kind }: { kind: AssetKind }) {
  const Icon = KIND_ICON[kind] ?? Radar;
  return (
    <span className="chip inline-flex items-center gap-1 text-[10px] uppercase tracking-wider">
      <Icon className="h-3 w-3" /> {kind}
    </span>
  );
}

function RiskBadge({ score }: { score: number }) {
  const band = riskBand(score);
  return (
    <span className={`chip text-[10px] uppercase tracking-wider ${RISK_TONE[band]}`}>
      {band} · {score}
    </span>
  );
}

function HealthBadge({ health }: { health: AssetHealth }) {
  return <span className={`chip text-[10px] uppercase tracking-wider ${HEALTH_TONE[health]}`}>{health}</span>;
}

function StatCard({
  label, value, tone, icon: Icon,
}: { label: string; value: number; tone?: "primary" | "destructive" | "warning"; icon: any }) {
  const toneClass =
    tone === "primary" ? "text-primary border-primary/30 bg-primary/5"
    : tone === "destructive" ? "text-rose-300 border-rose-500/30 bg-rose-500/5"
    : tone === "warning" ? "text-amber-300 border-amber-500/30 bg-amber-500/5"
    : "";
  return (
    <div className={`panel p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
      <div className="display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "mono truncate" : "truncate"}>{value}</span>
    </div>
  );
}

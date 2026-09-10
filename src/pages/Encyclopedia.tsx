import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ENCYCLOPEDIA, FAMILIES, type VulnCard } from "@/lib/encyclopedia";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ExternalLink, BookOpen, Globe, Server, Brain, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

const FAMILY_META: Record<VulnCard["family"], { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  Web:   { icon: Globe,  color: "text-accent border-accent/40 bg-accent/10" },
  API:   { icon: Server, color: "text-warning border-warning/40 bg-warning/10" },
  LLM:   { icon: Brain,  color: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10" },
  Cloud: { icon: Cloud,  color: "text-success border-success/40 bg-success/10" },
};

export default function EncyclopediaPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"All" | VulnCard["family"]>("All");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ENCYCLOPEDIA.filter((c) => {
      if (tab !== "All" && c.family !== tab) return false;
      if (!query) return true;
      return [c.code, c.title, c.summary, c.cwe, ...c.signals, ...c.tests, c.fix]
        .join(" ").toLowerCase().includes(query);
    });
  }, [q, tab]);

  return (
    <>
      <PageHeader
        eyebrow="Reference · OWASP-aligned"
        title="Vulnerability Encyclopedia"
        actions={
          <div className="chip border-primary/40 text-primary bg-primary/10">
            <BookOpen className="h-3 w-3" />
            {ENCYCLOPEDIA.length} cards
          </div>
        }
      />

      <div className="panel p-4 mb-6 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search codes, symptoms, tests…" className="pl-9" />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="All">All</TabsTrigger>
            {FAMILIES.map((f) => (
              <TabsTrigger key={f} value={f}>{f}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-12 text-center text-muted-foreground">No entries match that filter.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((c, i) => {
            const Icon = FAMILY_META[c.family].icon;
            return (
              <article
                key={c.id}
                className="panel p-5 hover-lift animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("h-9 w-9 rounded-md border grid place-items-center shrink-0", FAMILY_META[c.family].color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="mono text-[10px] uppercase tracking-widest text-primary/70">
                        {c.code}{c.cwe ? ` · ${c.cwe}` : ""}
                      </div>
                      <h3 className="display text-lg font-semibold leading-tight truncate">{c.title}</h3>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-foreground/85 mb-4">{c.summary}</p>

                <Section label="Signals" items={c.signals} tone="warning" />
                <Section label="How to test" items={c.tests} tone="primary" />

                <div className="mt-3 rounded-md border border-success/30 bg-success/5 p-3">
                  <div className="mono text-[10px] uppercase tracking-widest text-success mb-1">Fix</div>
                  <div className="text-xs text-foreground/85">{c.fix}</div>
                </div>

                {c.refs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.refs.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                         className="chip hover:border-primary/50 hover:text-primary transition-colors">
                        <ExternalLink className="h-3 w-3" /> {r.label}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Section({ label, items, tone }: { label: string; items: string[]; tone: "primary" | "warning" }) {
  const color = tone === "primary" ? "text-primary/70" : "text-warning";
  return (
    <div className="mb-2">
      <div className={cn("mono text-[10px] uppercase tracking-widest mb-1", color)}>{label}</div>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className="text-xs text-foreground/80 flex gap-2">
            <span className="text-primary shrink-0">›</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

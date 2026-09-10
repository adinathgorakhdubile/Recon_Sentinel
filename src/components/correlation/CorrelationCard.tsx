/**
 * Correlation cluster card — presentation only. Wires analyst actions
 * (approve, reject, queue, set primary, materialize links) to the repo.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, ListPlus, Link2, Crown, MessageSquarePlus } from "lucide-react";
import {
  CLUSTER_KIND_LABELS,
  RULE_LABELS,
  STATUS_LABELS,
  type CorrelationCluster,
} from "@/lib/correlation/types";
import { addNote, approveAsLinks, setPrimary, setStatus } from "@/lib/correlation/repo";
import { useToast } from "@/hooks/use-toast";

interface Props {
  cluster: CorrelationCluster;
  onChange: (next: CorrelationCluster) => void;
}

export function CorrelationCard({ cluster, onChange }: Props) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const wrap = async (label: string, fn: () => Promise<CorrelationCluster | undefined | number>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (typeof r === "object" && r) onChange(r);
      toast({ title: label });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{CLUSTER_KIND_LABELS[cluster.kind]}</Badge>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[cluster.status]}</Badge>
            <span className="mono text-[10px] text-muted-foreground">score {(cluster.score * 100).toFixed(0)}%</span>
          </div>
          <h3 className="text-sm font-semibold mt-1 truncate">{cluster.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{cluster.summary}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => wrap("Queued", () => setStatus(cluster.id, "queued"))}>
            <ListPlus className="h-3.5 w-3.5 mr-1" /> Queue
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => wrap("Rejected", () => setStatus(cluster.id, "rejected"))}>
            <X className="h-3.5 w-3.5 mr-1" /> Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={() => wrap("Approved", () => setStatus(cluster.id, "approved"))}>
            <Check className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase mono text-muted-foreground mb-1">Signals</div>
        <div className="flex flex-wrap gap-1.5">
          {cluster.signals.map((s, i) => (
            <div key={i} className="text-[11px] rounded border border-border/60 px-2 py-0.5 bg-muted/20">
              <span className="mono text-primary">{RULE_LABELS[s.ruleId]}</span>
              <span className="text-muted-foreground"> · {(s.weight * 100).toFixed(0)}% — {s.reason}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase mono text-muted-foreground mb-1">Members ({cluster.members.length})</div>
        <div className="space-y-1">
          {cluster.members.map((m) => (
            <div key={`${m.type}:${m.id}`} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="mono text-[10px] text-muted-foreground">{m.type}</span>
                <span className="truncate">{m.label ?? m.id}</span>
                {m.severity && <Badge variant="outline" className="text-[10px]">{m.severity}</Badge>}
                {cluster.primaryId === m.id && (
                  <Badge className="text-[10px]"><Crown className="h-3 w-3 mr-1" />primary</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={busy || cluster.primaryId === m.id}
                onClick={() => wrap("Primary set", () => setPrimary(cluster.id, m.id))}>
                Set primary
              </Button>
            </div>
          ))}
        </div>
      </div>

      {cluster.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cluster.tags.map((t) => (
            <span key={t} className="chip text-[10px]">{t}</span>
          ))}
        </div>
      )}

      <Separator />

      <div className="flex items-start gap-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Analyst note…"
          className="text-xs min-h-[36px]"
        />
        <div className="flex flex-col gap-1">
          <Button size="sm" variant="outline" disabled={busy || !note.trim()}
            onClick={() => wrap("Note added", async () => { const r = await addNote(cluster.id, note); setNote(""); return r; })}>
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> Note
          </Button>
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => wrap("Links materialized", () => approveAsLinks(cluster.id))}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Materialize links
          </Button>
        </div>
      </div>

      {cluster.history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground text-[11px] uppercase mono">
            Audit history ({cluster.history.length})
          </summary>
          <ol className="mt-1 space-y-0.5">
            {cluster.history.slice().reverse().map((h) => (
              <li key={h.id} className="text-[11px] text-muted-foreground">
                <span className="mono text-primary">{h.action}</span>
                <span className="mono text-[10px] ml-1">{new Date(h.ts).toLocaleString()}</span>
                {h.note && <span> — {h.note}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

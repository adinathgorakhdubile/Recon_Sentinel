import { useState } from "react";
import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { computeReadiness, computeRecommendations } from "@/lib/assistant";
import { Button } from "@/components/ui/button";
import { buildMarkdownReport } from "@/lib/export";
import { buildDetailedReport, buildPlatformReport, REPORT_FORMATS, type ReportFormat } from "@/lib/reports";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { callCustomLLM, loadSettings, NIGHTWATCH_SYSTEM } from "@/lib/settings";
import { toast } from "sonner";
import { ReportPreview } from "@/components/ReportPreview";
import { DashboardCustomize } from "@/components/DashboardCustomize";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";
import { ReadinessWidget } from "@/components/widgets/ReadinessWidget";
import { StatsWidget } from "@/components/widgets/StatsWidget";
import { NextActionsWidget } from "@/components/widgets/NextActionsWidget";
import { ActivityWidget } from "@/components/widgets/ActivityWidget";
import { TopTagsWidget } from "@/components/widgets/TopTagsWidget";
import { LinksWidget } from "@/components/widgets/LinksWidget";
import { logActivity } from "@/lib/repo/activity";

export default function DashboardPage() {
  return (
    <EmptyProgramGate>
      <DashboardInner />
    </EmptyProgramGate>
  );
}

function DashboardInner() {
  const { activeProgram, tasks, assets, notes, findings } = useWorkspace();
  const program = activeProgram!;
  const readiness = computeReadiness(program, tasks, assets, notes, findings);
  const recs = computeRecommendations(program, tasks, assets, notes, findings).slice(0, 4);
  const [config] = useDashboardConfig();

  const [aiBusy, setAiBusy] = useState(false);
  const [preview, setPreview] = useState<{ md: string; title: string; suffix: string; hint?: string; source: "template" | "ai" } | null>(null);
  const slug = program.name.replace(/\s+/g, "_").toLowerCase();

  function openReport(format: ReportFormat) {
    let md = "";
    let suffix = "report";
    let title = "Report preview";
    const meta = REPORT_FORMATS.find((f) => f.id === format);
    if (format === "standard") { md = buildMarkdownReport(program, tasks, assets, notes, findings); title = "Standard summary"; }
    else if (format === "detailed") { md = buildDetailedReport(program, tasks, assets, notes, findings); suffix = "detailed_report"; title = "Detailed pentest report"; }
    else { md = buildPlatformReport(format, program, findings); suffix = `${format}_drafts`; title = `${format} submission drafts`; }
    setPreview({ md, title, suffix, hint: meta?.hint, source: "template" });
    logActivity({
      programId: program.id, entityType: "report", entityId: program.id,
      action: "exported", summary: `Opened ${meta?.label ?? format} report preview`,
      meta: { format },
    });
  }

  async function generateAiReport() {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const seed = buildDetailedReport(program, tasks, assets, notes, findings);
      const prompt = `You are a senior offensive-security consultant. Polish this raw workspace export into a client-ready security assessment report.

Requirements:
- Keep every finding, CVSS, CWE, OWASP mapping, and reference intact.
- Rewrite the Executive Summary for a non-technical exec audience (risk posture, top 3 concerns, recommended priorities).
- Tighten each finding: clarify impact, ensure reproduction is deterministic, propose remediation aligned to OWASP/NIST controls.
- Add a "Risk Heatmap" table (Severity × Likelihood) if findings allow.
- Add a "Recommended Roadmap" section with Immediate / 30-day / 90-day buckets.
- Preserve markdown structure. Do NOT invent findings that aren't in the source.

SOURCE REPORT:
\`\`\`markdown
${seed.slice(0, 18000)}
\`\`\``;
      const settings = loadSettings();
      let reply = "";
      if (settings.provider === "custom") {
        reply = await callCustomLLM(settings, [
          { role: "system", content: NIGHTWATCH_SYSTEM + (settings.systemAugment ? "\n\n" + settings.systemAugment : "") },
          { role: "user", content: prompt },
        ]);
      } else {
        const { data, error } = await supabase.functions.invoke("assistant-chat", {
          body: { messages: [{ role: "user", content: prompt }], workspace: { program, findingCount: findings.length } },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        reply = data.reply || "";
      }
      if (!reply.trim()) throw new Error("AI returned no content");
      setPreview({ md: reply, title: "AI-polished assessment", suffix: "ai_report", hint: "Edit before exporting — the AI draft is a starting point.", source: "ai" });
      await logActivity({
        programId: program.id, entityType: "ai", entityId: program.id,
        action: "ai", summary: "Generated AI-polished assessment report",
        meta: { chars: reply.length },
      });
      toast.success("AI report ready — review before exporting");
    } catch (e: any) {
      toast.error(e?.message ?? "AI report generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={`Program · ${program.targetRoot || "no target set"}`}
        title="Command Deck"
        actions={
          <div className="flex items-center gap-2">
            <DashboardCustomize />
            <Button variant="outline" onClick={generateAiReport} disabled={aiBusy}
              className="border-primary/40 text-primary hover:bg-primary/10">
              {aiBusy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
                : <><Sparkles className="h-4 w-4 mr-2" /> AI report</>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export report</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Choose format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {REPORT_FORMATS.map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => openReport(f.id)} className="flex-col items-start gap-0.5 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium"><FileText className="h-3.5 w-3.5" /> {f.label}</span>
                    <span className="text-[11px] text-muted-foreground pl-5">{f.hint}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="space-y-6">
        {config.order.filter((id) => config.enabled[id]).map((id) => {
          switch (id) {
            case "readiness":
              return <ReadinessWidget key={id} score={readiness.score} label={readiness.label} />;
            case "stats":
              return <StatsWidget key={id} tasks={tasks} assets={assets} notes={notes} findings={findings} />;
            case "nextActions":
              return (
                <div key={id} className="grid lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2"><NextActionsWidget recs={recs} /></div>
                  {config.enabled.activity && <ActivityWidget programId={program.id} />}
                </div>
              );
            case "activity":
              // Rendered alongside nextActions when both enabled; render standalone if nextActions off.
              return config.enabled.nextActions ? null : <ActivityWidget key={id} programId={program.id} />;
            case "topTags":
              return <TopTagsWidget key={id} programId={program.id} />;
            case "links":
              return <LinksWidget key={id} programId={program.id} />;
            default:
              return null;
          }
        })}
      </div>

      {preview && (
        <ReportPreview
          open={!!preview}
          onOpenChange={(v) => !v && setPreview(null)}
          initialMarkdown={preview.md}
          filenameBase={`${slug}_${preview.suffix}`}
          title={preview.title}
          hint={preview.hint}
        />
      )}
    </>
  );
}

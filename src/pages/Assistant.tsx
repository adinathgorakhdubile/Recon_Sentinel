import { useMemo, useRef, useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyProgramGate } from "@/components/AppShell";
import { useWorkspace } from "@/context/WorkspaceContext";
import { computeRecommendations } from "@/lib/assistant";
import { PriorityBadge } from "@/components/Badges";
import { Sparkles, ShieldCheck, Search, Radar, Copy, Download, RotateCcw, Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildMarkdownReport, downloadMarkdown } from "@/lib/export";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callCustomLLM, loadSettings, NIGHTWATCH_SYSTEM } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Server, Cloud } from "lucide-react";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  safety: ShieldCheck, scope: ShieldCheck, recon: Radar, evidence: Search, reporting: Sparkles,
};

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function AssistantPage() {
  return <EmptyProgramGate><AssistantInner /></EmptyProgramGate>;
}

function AssistantInner() {
  const { activeProgram, tasks, assets, notes, findings, resetDemo } = useWorkspace();
  const recs = useMemo(
    () => computeRecommendations(activeProgram, tasks, assets, notes, findings),
    [activeProgram, tasks, assets, notes, findings],
  );
  const [preview, setPreview] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: `**Nightwatch online.** I'm reading your \`${activeProgram?.name}\` workspace — ${assets.length} assets, ${findings.length} findings, ${tasks.filter(t => t.completed).length}/${tasks.length} tasks done.\n\nAsk me things like:\n- *"What should I look at next?"*\n- *"Turn my IDOR note into a finding draft"*\n- *"Any assets I forgot to triage?"*` },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const md = useMemo(
    () => (activeProgram ? buildMarkdownReport(activeProgram, tasks, assets, notes, findings) : ""),
    [activeProgram, tasks, assets, notes, findings],
  );

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const workspace = {
        program: activeProgram,
        assets: assets.map(a => ({ name: a.name, type: a.type, status: a.status, tags: a.tags, notes: a.notes })),
        notes: notes.map(n => ({ title: n.title, body: n.body, tags: n.tags })),
        findings: findings.map(f => ({ title: f.title, severity: f.severity, status: f.status, affected: f.affectedAsset, impact: f.impact })),
        openTasks: tasks.filter(t => !t.completed).slice(0, 20).map(t => `[${t.category}/${t.phase}] ${t.title}`),
      };
      const settings = loadSettings();

      if (settings.provider === "custom") {
        const systemPrompt =
          NIGHTWATCH_SYSTEM +
          (settings.systemAugment ? "\n\n" + settings.systemAugment : "") +
          `\n\nCurrent workspace snapshot (JSON):\n\`\`\`json\n${JSON.stringify(workspace).slice(0, 12000)}\n\`\`\``;
        const reply = await callCustomLLM(settings, [
          { role: "system", content: systemPrompt },
          ...next.map(m => ({ role: m.role, content: m.content })),
        ]);
        setMessages([...next, { role: "assistant", content: reply || "(no reply)" }]);
      } else {
        const { data, error } = await supabase.functions.invoke("assistant-chat", {
          body: { messages: next.map(m => ({ role: m.role, content: m.content })), workspace },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setMessages([...next, { role: "assistant", content: data.reply || "(no reply)" }]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "AI request failed");
      setMessages([...next, { role: "assistant", content: `⚠️ ${e?.message ?? "AI request failed"}` }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const currentProvider = loadSettings().provider;

  const suggestions = [
    "What should I focus on next?",
    "Any gaps in my scope lock?",
    "Suggest 3 tests for my top asset",
    "Draft a report title for my strongest finding",
  ];

  return (
    <>
      <PageHeader
        eyebrow="Nightwatch AI"
        title="Assistant"
        actions={
          <div className="flex gap-2 items-center">
            <Link
              to="/settings"
              className={cn(
                "chip",
                currentProvider === "custom"
                  ? "border-accent/50 text-accent bg-accent/10"
                  : "border-primary/40 text-primary bg-primary/10",
              )}
              title="Change AI provider"
            >
              {currentProvider === "custom" ? <Server className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
              {currentProvider === "custom" ? "Local LLM" : "Lovable AI"}
            </Link>
            <Button variant="outline" onClick={() => setPreview((p) => !p)}>{preview ? "Hide" : "Preview"} report</Button>
            <Button onClick={() => { downloadMarkdown(`${activeProgram!.name.replace(/\s+/g, "_").toLowerCase()}_report.md`, md); toast.success("Report downloaded"); }}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-6">
        {/* Chat */}
        <div className="panel flex flex-col h-[68vh] overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3 animate-fade-in", m.role === "user" && "flex-row-reverse")}>
                <div className={cn("h-8 w-8 shrink-0 rounded-md grid place-items-center border",
                  m.role === "user" ? "border-accent/40 bg-accent/10 text-accent" : "border-primary/40 bg-primary/10 text-primary")}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap border",
                  m.role === "user"
                    ? "bg-accent/10 border-accent/30 text-foreground"
                    : "bg-muted/30 border-border/60 text-foreground/95")}>
                  <MarkdownLite text={m.content} />
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3 animate-fade-in">
                <div className="h-8 w-8 rounded-md border border-primary/40 bg-primary/10 grid place-items-center">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                </div>
                <div className="rounded-lg px-3.5 py-2.5 bg-muted/30 border border-border/60 text-sm text-muted-foreground mono">
                  analyzing workspace<span className="animate-pulse">…</span>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border/60 p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} disabled={sending}
                  className="chip hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask Nightwatch about your recon…"
                rows={2}
                className="resize-none min-h-[52px]"
                disabled={sending}
              />
              <Button onClick={() => send()} disabled={sending || !input.trim()} className="h-[52px]">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Side: recommendations + safety */}
        <aside className="space-y-4">
          <div className="panel p-4">
            <h3 className="display text-sm font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Rule-based signals
            </h3>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {recs.slice(0, 6).map((r) => {
                const Icon = CATEGORY_ICON[r.category] ?? Sparkles;
                return (
                  <button key={r.id} onClick={() => send(`Help me with: ${r.title}`)}
                    className="w-full text-left rounded-md border border-border/60 hover:border-primary/40 bg-background/40 p-2.5 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-xs font-medium flex items-center gap-1.5"><Icon className="h-3 w-3 text-primary" />{r.title}</div>
                      <PriorityBadge priority={r.priority} />
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{r.detail}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="display text-sm font-semibold mb-2">Safety anchors</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2"><span className="glow-dot mt-1" />Stay strictly in-scope.</li>
              <li className="flex gap-2"><span className="glow-dot mt-1" />Respect rate limits; back off on 429.</li>
              <li className="flex gap-2"><span className="glow-dot mt-1" />Never exfiltrate user data.</li>
            </ul>
            <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground hover:text-destructive"
              onClick={() => { if (confirm("Reset demo data?")) { resetDemo(); toast.success("Workspace reset"); } }}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reset demo data
            </Button>
          </div>
        </aside>
      </div>

      {preview && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="display text-lg font-semibold">Report preview (markdown)</h3>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(md); toast.success("Copied"); }}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Copy
            </Button>
          </div>
          <pre className="mono text-xs whitespace-pre-wrap max-h-[500px] overflow-auto rounded-md border border-border/60 bg-background/60 p-4">{md}</pre>
        </div>
      )}
    </>
  );
}

// tiny inline markdown renderer: **bold**, *italic*, `code`, code fences, lists
function MarkdownLite({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("```")) {
          const body = p.replace(/^```(\w+)?\n?/, "").replace(/```$/, "");
          return (
            <pre key={i} className="mono text-[11px] my-2 p-2.5 rounded-md border border-border/60 bg-black/40 overflow-x-auto text-primary/90">{body}</pre>
          );
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: inline(p) }} />;
      })}
    </>
  );
}

function inline(s: string) {
  const escape = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escape(s)
    .replace(/`([^`]+)`/g, '<code class="mono text-[12px] bg-black/40 px-1 py-0.5 rounded border border-border/60 text-primary/90">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/^- (.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-primary">•</span><span>$1</span></div>')
    .replace(/^Next step:(.*)$/gim, '<div class="mt-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-primary"><strong>Next step:</strong>$1</div>');
}

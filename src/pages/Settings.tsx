import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { CommandBlock } from "@/components/CommandBlock";
import {
  AiSettings,
  DEFAULT_SETTINGS,
  callCustomLLM,
  loadSettings,
  saveSettings,
  NIGHTWATCH_SYSTEM,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Cloud,
  Server,
  ShieldCheck,
  Save,
  RotateCcw,
  Zap,
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
} from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(() => loadSettings());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  useEffect(() => {
    setTestResult(null);
  }, [settings.provider, settings.baseUrl, settings.model, settings.apiKey]);

  const save = () => {
    saveSettings(settings);
    toast.success("Settings saved locally");
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast.success("Settings reset to defaults");
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (settings.provider !== "custom") {
        setTestResult({ ok: true, msg: "Using Lovable AI Gateway — no local test needed." });
        return;
      }
      const reply = await callCustomLLM(settings, [
        { role: "system", content: "Reply with exactly the word: pong" },
        { role: "user", content: "ping" },
      ]);
      setTestResult({
        ok: true,
        msg: `Connected. Model responded: "${reply.trim().slice(0, 80)}"`,
      });
      toast.success("Local LLM reachable");
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message ?? "Connection failed" });
      toast.error("Local LLM test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={save}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Provider */}
          <div className="panel p-5">
            <h3 className="display text-lg font-semibold mb-1 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Nightwatch AI Provider
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose where the assistant runs. Local providers keep every prompt on your
              device — nothing about your recon leaves your network.
            </p>

            <div className="grid md:grid-cols-2 gap-3">
              <ProviderCard
                active={settings.provider === "lovable"}
                onClick={() => setSettings((s) => ({ ...s, provider: "lovable" }))}
                icon={Cloud}
                title="Lovable AI (cloud)"
                subtitle="Gemini via Lovable Gateway"
                bullets={[
                  "Zero setup, works instantly",
                  "Workspace snapshot sent to Google Gemini",
                  "Uses Lovable credits",
                ]}
              />
              <ProviderCard
                active={settings.provider === "custom"}
                onClick={() => setSettings((s) => ({ ...s, provider: "custom" }))}
                icon={Server}
                title="Local / self-hosted LLM"
                subtitle="OpenAI-compatible endpoint"
                bullets={[
                  "Ollama · LM Studio · vLLM · LocalAI",
                  "100% offline — data never leaves your device",
                  "Bring your own model & hardware",
                ]}
              />
            </div>
          </div>

          {/* Custom config */}
          {settings.provider === "custom" && (
            <div className="panel p-5 animate-fade-in space-y-4">
              <h3 className="display text-lg font-semibold flex items-center gap-2">
                <Server className="h-5 w-5 text-accent" /> Local LLM Endpoint
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Base URL</Label>
                  <Input
                    value={settings.baseUrl}
                    onChange={(e) => setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
                    placeholder="http://localhost:11434/v1"
                  />
                  <p className="text-[11px] text-muted-foreground mono">
                    OpenAI-compatible <code>/chat/completions</code> is appended.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Input
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                    placeholder="llama3.1:8b-instruct"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Any model your server exposes (e.g. <code>qwen2.5-coder:7b</code>,{" "}
                    <code>llama3.1:8b</code>, <code>mistral-nemo</code>).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>API Key (optional)</Label>
                  <Input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
                    placeholder="Leave blank for Ollama / LM Studio"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Temperature{" "}
                    <span className="mono text-xs text-muted-foreground">
                      {settings.temperature.toFixed(2)}
                    </span>
                  </Label>
                  <Slider
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={[settings.temperature]}
                    onValueChange={(v) => setSettings((s) => ({ ...s, temperature: v[0] }))}
                  />
                </div>
              </div>

              <div>
                <Label>System prompt additions</Label>
                <Textarea
                  rows={3}
                  value={settings.systemAugment}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, systemAugment: e.target.value }))
                  }
                  placeholder="e.g. Always suggest low-noise recon first. Prefer PortSwigger references."
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={test} disabled={testing} variant="outline">
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Test connection
                </Button>
                {testResult && (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      testResult.ok ? "text-success" : "text-destructive",
                    )}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <span>{testResult.msg}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Docker recipes */}
          {settings.provider === "custom" && (
            <div className="panel p-5 space-y-3 animate-fade-in">
              <h3 className="display text-lg font-semibold flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" /> Deploy a local LLM in Docker
              </h3>
              <p className="text-sm text-muted-foreground">
                Pick one. Ollama is easiest; LM Studio &amp; vLLM give more control. Because
                Recon Workbench calls your endpoint from the browser, you must allow this
                origin via CORS.
              </p>

              <div className="grid md:grid-cols-2 gap-3">
                <CommandBlock
                  command={{
                    label: "Ollama (Docker, CPU or NVIDIA GPU)",
                    cmd: `docker run -d --name ollama \\
  -p 11434:11434 \\
  -e OLLAMA_ORIGINS='*' \\
  -v ollama:/root/.ollama \\
  --gpus=all \\
  ollama/ollama

docker exec -it ollama ollama pull llama3.1:8b-instruct-q6_K`,
                    note: "OLLAMA_ORIGINS='*' allows the browser to call it. Drop --gpus=all on CPU-only.",
                  }}
                />
                <CommandBlock
                  command={{
                    label: "LM Studio local server",
                    cmd: `# In LM Studio → Developer → Local Server
# Enable CORS, then set Base URL below to:
#   http://localhost:1234/v1`,
                    note: "LM Studio ships an OpenAI-compatible server built in.",
                  }}
                />
                <CommandBlock
                  command={{
                    label: "vLLM (GPU, production)",
                    cmd: `docker run --gpus all -p 8000:8000 --ipc=host \\
  vllm/vllm-openai:latest \\
  --model meta-llama/Meta-Llama-3.1-8B-Instruct \\
  --api-key sk-local-dev`,
                    note: "Set Base URL http://localhost:8000/v1 and paste the api-key above.",
                  }}
                />
                <CommandBlock
                  command={{
                    label: "LocalAI (multi-model, CPU-friendly)",
                    cmd: `docker run -p 8080:8080 --name localai \\
  -v $PWD/models:/models \\
  localai/localai:latest-cpu`,
                    note: "Base URL http://localhost:8080/v1",
                  }}
                />
              </div>

              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <div>
                  <strong className="mono uppercase tracking-widest text-[10px]">
                    CORS reminder
                  </strong>{" "}
                  Browsers block cross-origin requests by default. Ollama needs{" "}
                  <code>OLLAMA_ORIGINS='*'</code> (or your app origin). vLLM/LocalAI need{" "}
                  <code>--allow-credentials --allowed-origins</code> or a reverse proxy that
                  adds <code>Access-Control-Allow-Origin</code>.
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <h3 className="display text-sm font-semibold mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Privacy posture
            </h3>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li className="flex gap-2">
                <span className="glow-dot mt-1" /> Workspace state lives in{" "}
                <code>localStorage</code> only.
              </li>
              <li className="flex gap-2">
                <span className="glow-dot mt-1" /> Local LLM mode → prompts stay on your
                machine.
              </li>
              <li className="flex gap-2">
                <span className="glow-dot mt-1" /> Lovable AI mode → workspace snapshot sent
                to the gateway.
              </li>
            </ul>
          </div>

          <div className="panel p-4">
            <h3 className="display text-sm font-semibold mb-2">System prompt preview</h3>
            <pre className="mono text-[11px] whitespace-pre-wrap text-muted-foreground max-h-64 overflow-auto">
              {NIGHTWATCH_SYSTEM}
              {settings.systemAugment ? "\n\n" + settings.systemAugment : ""}
            </pre>
          </div>
        </aside>
      </div>
    </>
  );
}

function ProviderCard({
  active,
  onClick,
  icon: Icon,
  title,
  subtitle,
  bullets,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  bullets: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-4 transition-all hover-lift",
        active
          ? "border-primary/60 bg-primary/10"
          : "border-border/60 bg-muted/20 hover:border-primary/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-md grid place-items-center border",
            active
              ? "border-primary/50 bg-primary/20 text-primary"
              : "border-border/60 bg-background/40 text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="display font-semibold">{title}</div>
            {active && (
              <span className="chip text-primary border-primary/40 bg-primary/10">Active</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="glow-dot mt-1" />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}

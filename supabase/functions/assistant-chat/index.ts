// Recon Workbench — AI assistant proxy to Lovable AI Gateway.
// Non-streaming for simplicity; returns { reply }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are Nightwatch, the AI co-pilot inside Recon Workbench — a defensive tool for AUTHORIZED bug bounty researchers.

Rules you MUST follow:
- Only advise on targets the user has written authorization for. If in doubt, refuse and remind the user to confirm scope.
- Never produce weaponized exploits, malware, credential-stuffing lists, or instructions for unauthorized access.
- Prefer passive reconnaissance first. Warn before suggesting anything active.
- Cite exactly which asset / note / finding / task your suggestion connects to when the workspace context provides them.
- Keep answers concise, tactical, markdown-formatted. Use fenced code blocks for commands, always with a safety comment.
- When suggesting a next action, phrase it as "Next step:" so the UI can highlight it.

You have full read-only access to the workspace JSON passed in the system context.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages, workspace } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = workspace ? `\n\nCurrent workspace snapshot (JSON):\n\`\`\`json\n${JSON.stringify(workspace).slice(0, 12000)}\n\`\`\`` : "";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM + ctx },
          ...messages,
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Slow down and retry." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in workspace billing." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Gateway error ${res.status}: ${text.slice(0, 400)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

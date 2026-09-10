import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { highlightSensitive, scanSensitive } from "@/lib/http/sensitive";
import { Badge } from "@/components/ui/badge";
import type { HttpBody, HttpHeader, HttpRequest, HttpResponse } from "@/lib/http/types";

interface Props {
  request: HttpRequest;
  response?: HttpResponse;
}

export function HttpMessageView({ request, response }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <MessagePanel
        title="Request"
        head={`${request.method} ${request.path ?? request.url} ${request.httpVersion ? `HTTP/${request.httpVersion}` : ""}`.trim()}
        headers={request.headers}
        body={request.body}
      />
      {response ? (
        <MessagePanel
          title="Response"
          head={`HTTP/${response.httpVersion ?? "1.1"} ${response.status} ${response.statusText ?? ""}`.trim()}
          headers={response.headers}
          body={response.body}
          statusClass={statusClass(response.status)}
        />
      ) : (
        <div className="panel p-3 text-xs text-muted-foreground">No response captured.</div>
      )}
    </div>
  );
}

function MessagePanel({
  title, head, headers, body, statusClass: statusCls,
}: { title: string; head: string; headers: HttpHeader[]; body?: HttpBody; statusClass?: string }) {
  const sensCount = useMemo(() => {
    const parts = [head, headers.map((h) => `${h.name}: ${h.value}`).join("\n"), body?.text ?? ""].join("\n");
    return scanSensitive(parts).length;
  }, [head, headers, body]);
  return (
    <div className="panel p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-1.5">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</span>
        {sensCount > 0 && <Badge variant="outline" className="text-[10px] border-warning/60 text-warning">⚠ {sensCount} sensitive</Badge>}
      </div>
      <pre className={cn("text-xs mono px-3 py-2 border-b border-border/60 whitespace-pre-wrap break-all", statusCls)}>
        <SensitiveText text={head} />
      </pre>
      <div className="text-xs mono px-3 py-2 border-b border-border/60 max-h-[240px] overflow-auto">
        {headers.length === 0 ? (
          <span className="text-muted-foreground">(no headers)</span>
        ) : (
          headers.map((h, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="text-primary/80">{h.name}</span>
              <span className="text-muted-foreground">: </span>
              <SensitiveText text={h.value} />
            </div>
          ))
        )}
      </div>
      <div className="text-xs mono px-3 py-2 max-h-[280px] overflow-auto">
        {body?.text ? (
          <pre className="whitespace-pre-wrap break-all"><SensitiveText text={body.text} /></pre>
        ) : (
          <span className="text-muted-foreground">(no body)</span>
        )}
      </div>
    </div>
  );
}

function SensitiveText({ text }: { text: string }) {
  const parts = useMemo(() => highlightSensitive(text), [text]);
  return (
    <>
      {parts.map((p, i) => p.kind ? (
        <span key={i} title={p.kind} className="rounded bg-warning/20 text-warning px-0.5">{p.text}</span>
      ) : (
        <span key={i}>{p.text}</span>
      ))}
    </>
  );
}

function statusClass(status: number): string {
  if (status >= 500) return "text-destructive";
  if (status >= 400) return "text-warning";
  if (status >= 300) return "text-primary/80";
  if (status >= 200) return "text-success";
  return "text-muted-foreground";
}

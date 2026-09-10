import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { reportToMarkdown } from "@/lib/report/compose";
import type { ReportDoc } from "@/lib/report/types";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  doc: ReportDoc;
}

export function ReportPreviewPane({ doc }: Props) {
  const [md, setMd] = useState<string>("");

  useEffect(() => {
    let alive = true;
    reportToMarkdown(doc).then((s) => { if (alive) setMd(s); });
    return () => { alive = false; };
  }, [doc]);

  const html = useMemo(() => marked.parse(md) as string, [md]);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-6">
      <article
        className="prose prose-invert prose-sm max-w-none prose-headings:mt-6 prose-headings:mb-2 prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border/60 prose-code:text-primary prose-table:text-xs"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

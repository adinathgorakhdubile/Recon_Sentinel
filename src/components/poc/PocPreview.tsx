import { useMemo } from "react";
import { marked } from "marked";
import { Badge } from "@/components/ui/badge";
import { pocToMarkdown } from "@/lib/poc/export";
import type { PocDoc } from "@/lib/poc/types";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  doc: PocDoc;
}

export function PocPreview({ doc }: Props) {
  const html = useMemo(() => marked.parse(pocToMarkdown(doc)) as string, [doc]);
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="uppercase">{doc.severity}</Badge>
        <Badge variant="outline">{doc.status}</Badge>
        {doc.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
      </div>
      <article
        className="prose prose-invert prose-sm max-w-none prose-headings:mt-6 prose-headings:mb-2 prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border/60 prose-code:text-primary"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

import { Tag } from "lucide-react";
import { useAllTags } from "@/lib/tags";

export function TopTagsWidget({ programId }: { programId: string | null }) {
  const tags = useAllTags(programId).slice(0, 12);
  return (
    <div className="panel p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-4 w-4 text-primary" />
        <h3 className="display text-lg font-semibold">Top tags</h3>
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tag assets, notes and findings to build a rollup.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t.tag} className="chip text-[11px]">
              <span className="mono text-primary">#{t.tag}</span>
              <span className="ml-1 text-muted-foreground">{t.total}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

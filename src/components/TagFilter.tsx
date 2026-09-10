import { useAllTags, normalizeTag } from "@/lib/tags";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  programId?: string | null;
  selected: string[];
  onToggle: (tag: string) => void;
  onClear?: () => void;
  limit?: number;
  className?: string;
}

export function TagFilter({ programId, selected, onToggle, onClear, limit = 12, className }: TagFilterProps) {
  const tags = useAllTags(programId).slice(0, limit);
  if (tags.length === 0) return null;
  const sel = new Set(selected.map(normalizeTag));
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((t) => {
        const on = sel.has(t.tag);
        return (
          <button
            key={t.tag}
            type="button"
            onClick={() => onToggle(t.tag)}
            className={cn(
              "chip text-[11px] transition-colors",
              on ? "border-primary/60 text-primary bg-primary/10" : "hover:border-border",
            )}
          >
            #{t.tag} <span className="text-muted-foreground/80 ml-1">{t.total}</span>
          </button>
        );
      })}
      {selected.length > 0 && onClear && (
        <button type="button" onClick={onClear} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
          clear
        </button>
      )}
    </div>
  );
}

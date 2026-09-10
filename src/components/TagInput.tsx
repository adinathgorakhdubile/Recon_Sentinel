import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAllTags, normalizeTag } from "@/lib/tags";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  programId?: string | null;
  placeholder?: string;
  className?: string;
  maxSuggestions?: number;
}

export function TagInput({
  value,
  onChange,
  programId,
  placeholder = "Add tag, press Enter",
  className,
  maxSuggestions = 8,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const all = useAllTags(programId);

  const suggestions = useMemo(() => {
    const cur = new Set(value.map(normalizeTag));
    const q = draft.trim().toLowerCase();
    return all
      .filter((t) => !cur.has(t.tag) && (!q || t.tag.includes(q)))
      .slice(0, maxSuggestions);
  }, [all, draft, value, maxSuggestions]);

  function commit(raw: string) {
    const t = normalizeTag(raw);
    if (!t) return;
    if (value.map(normalizeTag).includes(t)) {
      setDraft("");
      return;
    }
    onChange([...value, t]);
    setDraft("");
  }

  function remove(t: string) {
    const norm = normalizeTag(t);
    onChange(value.filter((x) => normalizeTag(x) !== norm));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-9 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-primary/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span key={t} className="chip text-[11px] flex items-center gap-1">
            #{normalizeTag(t)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder={value.length ? "" : placeholder}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm mono py-0.5"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border/70 bg-popover shadow-md max-h-56 overflow-auto">
          {suggestions.map((s) => (
            <button
              key={s.tag}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s.tag);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/60"
            >
              <span className="mono text-primary">#{s.tag}</span>
              <span className="text-[10px] mono text-muted-foreground">{s.total} use{s.total === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

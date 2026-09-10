import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useHotkey } from "@/hooks/useHotkey";
import { useWorkspace } from "@/context/WorkspaceContext";
import { searchService, loadRecent, pushRecent, clearRecent, type SearchResult } from "@/lib/search";
import type { SearchEntityType } from "@/lib/db";
import {
  Bug,
  BookOpen,
  Camera,
  FileText,
  ListChecks,
  Network,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Tag as TagIcon,
  History as HistoryIcon,
  Search as SearchIcon,
  Plus,
  ArrowRight,
  Clock,
  X,
  LayoutDashboard,
  GitBranch,
  Settings as SettingsIcon,
} from "lucide-react";

const ENTITY_META: Record<SearchEntityType, { label: string; Icon: typeof Bug }> = {
  program: { label: "Program", Icon: ShieldCheck },
  task: { label: "Task", Icon: ListChecks },
  asset: { label: "Asset", Icon: Network },
  note: { label: "Note", Icon: NotebookPen },
  finding: { label: "Finding", Icon: Bug },
  evidence: { label: "Evidence", Icon: Camera },
  report: { label: "Report", Icon: FileText },
  tag: { label: "Tag", Icon: TagIcon },
  encyclopedia: { label: "Encyclopedia", Icon: BookOpen },
};

const ENTITY_ORDER: SearchEntityType[] = [
  "program",
  "finding",
  "asset",
  "note",
  "task",
  "evidence",
  "report",
  "tag",
  "encyclopedia",
];

const NAV_TARGETS = [
  { label: "Command Deck", route: "/", Icon: LayoutDashboard },
  { label: "Scope & Rules", route: "/scope", Icon: ShieldCheck },
  { label: "Recon Checklist", route: "/checklist", Icon: ListChecks },
  { label: "Notebook", route: "/notebook", Icon: NotebookPen },
  { label: "Assets", route: "/assets", Icon: Network },
  { label: "Findings", route: "/findings", Icon: Bug },
  { label: "Encyclopedia", route: "/encyclopedia", Icon: BookOpen },
  { label: "Attack Chain", route: "/attack-chain", Icon: GitBranch },
  { label: "Assistant", route: "/assistant", Icon: Sparkles },
  { label: "History", route: "/history", Icon: HistoryIcon },
  { label: "Settings", route: "/settings", Icon: SettingsIcon },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { activeProgram, state, setActiveProgram } = useWorkspace();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const debounceRef = useRef<number | null>(null);

  // Debounce query
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  // Run search whenever debounced query or context changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await searchService.query({
        q: debouncedQuery,
        limit: 30,
        programId: activeProgram?.id ?? null,
      });
      if (!cancelled) setResults(r);
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, open, activeProgram?.id]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    } else {
      setRecent(loadRecent());
    }
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<SearchEntityType, SearchResult[]>();
    for (const r of results) {
      const list = map.get(r.doc.entityType) ?? [];
      list.push(r);
      map.set(r.doc.entityType, list);
    }
    return map;
  }, [results]);

  function commit(q: string) {
    if (q.trim()) setRecent(pushRecent(q));
  }

  function go(route: string) {
    onOpenChange(false);
    navigate(route);
  }

  function activateResult(r: SearchResult) {
    commit(debouncedQuery);
    // For program docs, also switch the active workspace.
    if (r.doc.entityType === "program" && r.doc.entityId !== activeProgram?.id) {
      setActiveProgram(r.doc.entityId);
    }
    go(r.doc.route);
  }

  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search programs, findings, assets, notes, evidence, tags…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[70vh]">
        <CommandEmpty>
          {hasQuery ? "No matches. Try broader terms or different keywords." : "Start typing to search."}
        </CommandEmpty>

        {!hasQuery && recent.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recent.map((r) => (
              <CommandItem key={`recent:${r}`} value={`recent ${r}`} onSelect={() => setQuery(r)}>
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{r}</span>
                <button
                  type="button"
                  aria-label={`Remove ${r} from recent`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = loadRecent().filter((x) => x !== r);
                    try { window.localStorage.setItem("recon-workbench:recent-searches", JSON.stringify(next)); } catch { /* ignore */ }
                    setRecent(next);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </CommandItem>
            ))}
            <CommandItem value="clear recent" onSelect={() => { clearRecent(); setRecent([]); }}>
              <X className="h-4 w-4 text-muted-foreground" />
              <span>Clear recent searches</span>
            </CommandItem>
          </CommandGroup>
        )}

        {hasQuery && ENTITY_ORDER.map((type) => {
          const hits = grouped.get(type);
          if (!hits || hits.length === 0) return null;
          const meta = ENTITY_META[type];
          return (
            <CommandGroup key={type} heading={`${meta.label}${hits.length > 1 ? "s" : ""}`}>
              {hits.map((r) => (
                <ResultRow key={r.doc.id} result={r} onSelect={activateResult} />
              ))}
            </CommandGroup>
          );
        })}

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem value="new note" onSelect={() => go("/notebook")}>
            <Plus className="h-4 w-4 text-primary" />
            <span>New note</span>
          </CommandItem>
          <CommandItem value="new finding" onSelect={() => go("/findings")}>
            <Plus className="h-4 w-4 text-primary" />
            <span>New finding</span>
          </CommandItem>
          <CommandItem value="new asset" onSelect={() => go("/assets")}>
            <Plus className="h-4 w-4 text-primary" />
            <span>New asset</span>
          </CommandItem>
          <CommandItem value="open assistant ai" onSelect={() => go("/assistant")}>
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Open AI assistant</span>
          </CommandItem>
          <CommandItem value="export report" onSelect={() => go("/")}>
            <FileText className="h-4 w-4 text-primary" />
            <span>Export report</span>
          </CommandItem>
        </CommandGroup>

        {state.programs.length > 1 && (
          <CommandGroup heading="Switch program">
            {state.programs.map((p) => (
              <CommandItem
                key={`switch:${p.id}`}
                value={`switch program ${p.name}`}
                onSelect={() => {
                  setActiveProgram(p.id);
                  onOpenChange(false);
                }}
              >
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{p.name}</span>
                {activeProgram?.id === p.id && (
                  <span className="mono text-[10px] text-primary">active</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Navigate">
          {NAV_TARGETS.map((n) => (
            <CommandItem key={n.route} value={`go ${n.label}`} onSelect={() => go(n.route)}>
              <n.Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{n.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function ResultRow({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: (r: SearchResult) => void;
}) {
  const meta = ENTITY_META[result.doc.entityType];
  const Icon = meta.Icon;
  return (
    <CommandItem
      value={`${result.doc.entityType}:${result.doc.id} ${result.doc.title} ${result.doc.subtitle ?? ""}`}
      onSelect={() => onSelect(result)}
    >
      <Icon className="h-4 w-4 text-primary/80 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{result.doc.title}</div>
        {result.doc.subtitle && (
          <div className="text-[11px] text-muted-foreground truncate">{result.doc.subtitle}</div>
        )}
      </div>
      <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        {meta.label}
      </span>
    </CommandItem>
  );
}

/**
 * Wrapper that owns the open state and keybindings. Mount once at the app root.
 */
export function CommandPaletteRoot() {
  const [open, setOpen] = useState(false);
  useHotkey({ key: "k", ctrlOrMeta: true, allowInInput: true }, (e) => {
    e.preventDefault();
    setOpen((v) => !v);
  });
  useHotkey({ key: "/" }, (e) => {
    e.preventDefault();
    setOpen(true);
  });
  // Expose a global opener so header buttons can trigger it without prop drilling.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-command-palette", handler);
    return () => window.removeEventListener("open-command-palette", handler);
  }, []);
  return <CommandPalette open={open} onOpenChange={setOpen} />;
}

export function openCommandPalette(): void {
  window.dispatchEvent(new Event("open-command-palette"));
}

/** Silence unused-import warning for cmdk re-export used only by types. */
export const _Command = Command;

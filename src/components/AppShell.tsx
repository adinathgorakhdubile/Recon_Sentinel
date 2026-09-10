import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  ListChecks,
  NotebookPen,
  Network,
  Bug,
  Sparkles,
  Radar,
  Settings as SettingsIcon,
  BookOpen,
  GitBranch,
  History as HistoryIcon,
  Search as SearchIcon,
  Waves,
  Radar as RadarIcon,
  Workflow as WorkflowIcon,
  FolderLock,
  Globe,
  Images,
  FlaskConical,
  FileText,
  GitMerge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgramSwitcher } from "./ProgramSwitcher";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "./ui/button";
import { CommandPaletteRoot, openCommandPalette } from "./CommandPalette";
import { TemplateGallery } from "./TemplateGallery";

const nav = [
  { to: "/", label: "Command Deck", icon: LayoutDashboard, end: true },
  { to: "/scope", label: "Scope & Rules", icon: ShieldCheck },
  { to: "/checklist", label: "Recon Checklist", icon: ListChecks },
  { to: "/notebook", label: "Notebook", icon: NotebookPen },
  { to: "/assets", label: "Assets", icon: Network },
  { to: "/recon", label: "Recon Pipeline", icon: Waves },
  { to: "/recon-center", label: "Recon Center", icon: Radar },
  { to: "/automation", label: "Automation", icon: WorkflowIcon },
  { to: "/asset-intel", label: "Asset Explorer", icon: RadarIcon },
  { to: "/findings", label: "Findings", icon: Bug },
  { to: "/evidence", label: "Evidence Vault", icon: FolderLock },
  { to: "/http", label: "HTTP Library", icon: Globe },
  { to: "/media", label: "Media Library", icon: Images },
  { to: "/poc", label: "PoC Builder", icon: FlaskConical },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/encyclopedia", label: "Encyclopedia", icon: BookOpen },
  { to: "/attack-chain", label: "Attack Chain", icon: GitBranch },
  { to: "/graph", label: "Knowledge Graph", icon: Network },
  { to: "/attack-paths", label: "Attack Paths", icon: GitBranch },
  { to: "/correlation", label: "Correlation", icon: GitMerge },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell() {
  const { activeProgram } = useWorkspace();
  const scopeMissing =
    !activeProgram ||
    !activeProgram.targetRoot ||
    activeProgram.inScope.length === 0 ||
    !activeProgram.rules.trim();

  return (
    <div className="min-h-screen w-full flex text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/80 backdrop-blur-md">
        <div className="p-5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="relative h-9 w-9 rounded-md border border-primary/40 bg-primary/10 grid place-items-center overflow-hidden">
              <Radar className="h-5 w-5 text-primary" />
              <div
                className="absolute inset-0 origin-center animate-sweep"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(var(--primary) / 0.35), transparent 30%)",
                }}
              />
            </div>
            <div>
              <div className="display text-base font-semibold leading-none">Recon Workbench</div>
              <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mt-1">
                Authorized ops · v1
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-border/60 space-y-2">
          <ProgramSwitcher />
          <PaletteTrigger />
        </div>



        <nav className="p-3 flex-1 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border/60 text-[11px] text-muted-foreground mono leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <span className="glow-dot" />
            <span>Local-first · no data leaves your browser</span>
          </div>
          <p>Use only for testing you have explicit written authorization to perform.</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />
            <span className="display font-semibold">Recon Workbench</span>
          </div>
          <div className="flex items-center gap-2">
            <PaletteTrigger compact />
            <ProgramSwitcher compact />
          </div>

        </div>

        {scopeMissing && (
          <div className="border-b border-warning/40 bg-warning/10 px-4 md:px-8 py-2.5 text-xs md:text-sm text-warning flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong className="mono">SCOPE LOCK REQUIRED.</strong>{" "}
              Confirm target, in-scope assets, and rules of engagement before any active work.{" "}
              <NavLink to="/scope" className="underline underline-offset-2 hover:text-warning-foreground">
                Open Scope & Rules
              </NavLink>
            </div>
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </div>

        <MobileNav />
      </main>
      <CommandPaletteRoot />
    </div>
  );
}

function PaletteTrigger({ compact }: { compact?: boolean }) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  if (compact) {
    return (
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Open command palette"
        className="h-8 w-8 grid place-items-center rounded-md border border-border/60 hover:border-primary/40 hover:text-primary transition-colors"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search & commands…</span>
      <kbd className="mono text-[10px] rounded border border-border/60 px-1.5 py-0.5">{isMac ? "⌘" : "Ctrl"}K</kbd>
    </button>
  );
}



function MobileNav() {
  return (
    <div className="md:hidden sticky bottom-0 border-t border-border/60 bg-background/95 backdrop-blur grid grid-cols-5 overflow-x-auto">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center py-2 text-[10px] gap-0.5",
              isActive ? "text-primary" : "text-muted-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          <span className="truncate max-w-full px-1">{item.label.split(" ")[0]}</span>
        </NavLink>
      ))}
    </div>
  );
}

export function EmptyProgramGate({ children }: { children: React.ReactNode }) {
  const { activeProgram, createProgram } = useWorkspace();
  const [templateOpen, setTemplateOpen] = useState(false);
  if (activeProgram) return <>{children}</>;
  return (
    <>
      <div className="panel p-8 md:p-12 max-w-xl mx-auto text-center">
        <Radar className="h-10 w-10 text-primary mx-auto mb-4" />
        <h2 className="display text-2xl font-semibold mb-2">No active program</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          Create a workspace for an authorized bug bounty program to begin. Nothing leaves your browser.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => setTemplateOpen(true)} variant="outline">
            <Sparkles className="h-4 w-4 mr-2" /> Start from template
          </Button>
          <Button onClick={() => createProgram("New Program", "example.com")}>Blank workspace</Button>
        </div>
      </div>
      <TemplateGallery open={templateOpen} onOpenChange={setTemplateOpen} />
    </>
  );
}

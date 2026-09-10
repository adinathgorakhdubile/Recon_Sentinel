import { Link } from "react-router-dom";
import { ShieldAlert, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReadinessWidget({ score, label }: { score: number; label: string }) {
  const size = 160;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="panel panel-glow p-6 md:p-8 relative overflow-hidden">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)), transparent 70%)" }} />
      <div className="grid md:grid-cols-[auto_1fr] gap-8 items-center relative">
        <div className="relative w-40 h-40">
          <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease", filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.6))" }} />
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-foreground display"
              style={{ fontSize: 32, fontWeight: 600, transform: "rotate(90deg)", transformOrigin: "50% 50%" }}>
              {score}
            </text>
          </svg>
        </div>
        <div>
          <div className="mono text-xs uppercase tracking-widest text-primary/80 mb-1">Readiness score</div>
          <h2 className="display text-3xl font-semibold mb-2">{label}</h2>
          <p className="text-muted-foreground max-w-lg text-sm mb-4">
            Composite score across scope completeness, checklist progress, asset coverage, notebook activity, and finding maturity.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/scope"><Button size="sm" variant="outline"><ShieldAlert className="h-3.5 w-3.5 mr-2" />Review scope</Button></Link>
            <Link to="/checklist"><Button size="sm" variant="outline"><ListChecks className="h-3.5 w-3.5 mr-2" />Continue checklist</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

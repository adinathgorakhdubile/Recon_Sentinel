import { cn } from "@/lib/utils";

interface Props {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}
export function PageHeader({ title, eyebrow, actions, className }: Props) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8", className)}>
      <div>
        {eyebrow && (
          <div className="mono text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="display text-3xl md:text-4xl font-semibold">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

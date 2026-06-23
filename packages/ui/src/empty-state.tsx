import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Contextual placeholder used while a module has no data (or is not built yet). */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-card">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

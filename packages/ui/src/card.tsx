import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-slate-200 bg-white shadow-card", className)}
      {...props}
    />
  );
}

export interface SectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A titled content surface with an optional action slot in the header. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-card", className)}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

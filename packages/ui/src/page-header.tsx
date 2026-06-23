import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** Baslik uzerinde gosterilen kucuk baglam etiketi (ornegin bolum adi). */
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, breadcrumb, eyebrow }: PageHeaderProps) {
  return (
    <div className="mb-7 border-b border-slate-200/70 pb-5">
      {breadcrumb ? <div className="mb-2 text-sm text-slate-400">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tightish text-slate-900">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

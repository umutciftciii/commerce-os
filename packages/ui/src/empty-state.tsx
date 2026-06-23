import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Modulun ne zaman canliya baglanacagini belirten kucuk faz etiketi. */
  tag?: string;
  className?: string;
}

/**
 * Bir modulde henuz veri yokken (veya modul henuz kurulmamisken) kullanilan
 * baglamsal yer tutucu. "Bos ekran" hissi yerine urunlesmis bir panel verir:
 * istege bagli faz etiketi + ikon kutusu + net aciklama.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  tag,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-6 py-12 text-center",
        className,
      )}
    >
      {/* Cok hafif izgara dokusu: bos wireframe yerine urunlesmis yuzey hissi. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(circle_at_1px_1px,rgb(15_23_42_/_0.04)_1px,transparent_0)] [background-size:18px_18px]"
      />
      <div className="relative flex flex-col items-center">
        {tag ? (
          <span className="mb-3 inline-flex items-center rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
            {tag}
          </span>
        ) : null}
        {icon ? (
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-card">
            {icon}
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

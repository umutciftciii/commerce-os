"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * TODO-156C (ANALIZ-156A §5.1/§6) — Tek bir facet'in collapse/expand accordion sarmalayıcısı.
 *
 * Başlık = <button aria-expanded/aria-controls> (klavye + ekran okuyucu). İçerik gizlense de DOM'da kalır
 * (`hidden`) → aria-controls hedefi hep var; SSR'da içerik erişilebilir. Aktif seçim varsa başlıkta sayı rozeti.
 * Desktop rail + mobil drawer AYNI section'ı kullanır (tek renderer). Hareket reduced-motion'da devre dışı.
 */
export function FacetSection({
  title,
  activeCount = 0,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Bu facet'te URL'deki aktif seçim sayısı (>0 ise başlıkta rozet + varsayılan açık). */
  activeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // Aktif seçimi olan facet ilk açılışta AÇIK (kullanıcı seçimini görsün).
  const [open, setOpen] = useState(defaultOpen || activeCount > 0);
  const panelId = useId();

  return (
    <div className="border-b border-line py-4 first:pt-0">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wideish text-ink">
            {title}
            {activeCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-surface">
                {activeCount}
              </span>
            ) : null}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
            className={`shrink-0 text-ink-subtle transition-transform duration-200 ease-premium motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useSearchTransition } from "./search-transition";

/**
 * TODO-156B (ANALIZ §10/§15.2) — Sonuç grid'ini saran istemci bölgesi. Geçiş sırasında (sort/sayfa
 * değişimi) eski içerik ekranda kalır, hafifçe soluklaşır + `aria-busy` ile ekran okuyucuya bildirilir.
 * Tam ekran spinner YOK. `children` sunucu-render grid'idir (RSC); bu sarmalayıcı yalnız pending durumunu
 * yansıtır. Reduced-motion'da geçiş kapanır.
 */
export function SearchResultsRegion({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const { isPending } = useSearchTransition();
  return (
    <section
      aria-label={label}
      aria-busy={isPending}
      className={
        isPending
          ? "opacity-60 transition-opacity duration-300 motion-reduce:transition-none"
          : "transition-opacity duration-300 motion-reduce:transition-none"
      }
    >
      {children}
    </section>
  );
}

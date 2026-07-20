"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@commerce-os/ui";
import { Container, ProductMedia } from "../ui";
import type { StorefrontHomeFeaturedCategory } from "../../lib/catalog-types";

/**
 * TODO-158C (ADR-088) — Desktop kategori MEGA MENÜ (≥ lg). Header nav'ında "Kategoriler"
 * tetikleyicisi + tam genişlik açılır panel (görsel + başlık kartları). Kaynak: admin-yönetimli
 * FEATURED_CATEGORIES (bkz. lib/server/navigation.ts) — search iş mantığına dokunmaz.
 *
 * Erişilebilirlik: `aria-expanded`/`aria-controls`, hover VE tıklama/klavye ile açılır, Escape
 * kapatır, dış tıklama kapatır, panel içi Tab akışı doğal. Kategori yoksa render EDİLMEZ
 * (header sade nav'a düşer). Tamamen token-tabanlı.
 */
export function CategoryMenu({
  categories,
  label,
  allLabel,
  allHref = "/products",
}: {
  categories: StorefrontHomeFeaturedCategory[];
  label: string;
  allLabel: string;
  allHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (categories.length === 0) return null;

  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    // Konumsal bağlam OLUŞTURMAZ (relative yok) → panel `inset-x-0` ile en yakın konumlu
    // ata olan header'a hizalanır: taşmasız (scrollbar-güvenli) tam header genişliği.
    <div ref={wrapRef} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wideish transition-colors",
          open ? "text-ink" : "text-ink-muted hover:text-ink",
        )}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={cn("transition-transform duration-200 ease-premium", open ? "rotate-180" : "")}
        >
          <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Tam genişlik panel — header'a göre absolute (header relative). */}
      <div
        id={panelId}
        role="region"
        aria-label={label}
        className={cn(
          "absolute inset-x-0 top-full z-40 border-t border-line bg-surface shadow-md transition-all duration-200 ease-premium",
          open ? "visible opacity-100" : "pointer-events-none invisible -translate-y-1 opacity-0",
        )}
      >
        <Container className="py-8">
          <div className="grid grid-cols-3 gap-x-6 gap-y-6 lg:grid-cols-4 xl:grid-cols-6">
            {categories.map((category) => (
              <Link
                key={category.key}
                href={category.href}
                onClick={() => setOpen(false)}
                className="group/cat block"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-surface-muted">
                  <div className="h-full w-full transition-transform duration-500 ease-premium group-hover/cat:scale-[1.05]">
                    <ProductMedia handle={`nav-${category.key}`} title={category.title} imageUrl={category.imageUrl} />
                  </div>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-snug text-ink transition-colors group-hover/cat:text-accent">
                  {category.title}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <Link
              href={allHref}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wideish text-accent hover:text-accent-ink"
            >
              {allLabel}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </Container>
      </div>
    </div>
  );
}

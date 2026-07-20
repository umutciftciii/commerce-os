"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StorefrontHomeFeaturedCategory } from "../../lib/catalog-types";

type NavLink = { href: string; label: string };

/**
 * Mobil gezinme (disclosure). Hamburger → tam genislik acilir panel. Yalnizca
 * kucuk ekranlarda gorunur (lg altinda). Erisilebilir: aria-expanded/controls,
 * Escape ile kapanir, acikken body scroll kilidi.
 *
 * TODO-158C — Kategori bölümü (FEATURED_CATEGORIES) eklendi; panel artık kaydırılabilir
 * ve dil/hesap gibi ikincil linkleri de barındırabilir. Tamamen token-tabanlı.
 */
export function MobileMenu({
  links,
  categories = [],
  categoriesLabel,
  openLabel,
  closeLabel,
}: {
  links: NavLink[];
  categories?: StorefrontHomeFeaturedCategory[];
  categoriesLabel?: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center text-ink transition-colors hover:text-accent"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-line bg-surface shadow-md"
        >
          <nav className="flex flex-col px-5 py-2" aria-label="Mobil gezinme">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-4 text-sm font-medium uppercase tracking-wideish text-ink last:border-b-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {categories.length > 0 ? (
            <div className="border-t border-line px-5 py-5">
              {categoriesLabel ? (
                <p className="mb-3 text-[11px] font-medium uppercase tracking-luxe text-ink-subtle">
                  {categoriesLabel}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {categories.map((category) => (
                  <Link
                    key={category.key}
                    href={category.href}
                    onClick={() => setOpen(false)}
                    className="py-1 text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {category.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

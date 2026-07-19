"use client";

import { useEffect, useRef, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { SearchCombobox } from "../search/autocomplete/search-combobox";

/**
 * TODO-156E (ADR-084) — Mobil arama DRAWER'ı (< md). Header'da arama input'u gizli olduğundan (md:flex),
 * mobilde tek-elle kullanım için tam-ekran sheet: üstte input (autofocus) + combobox paneli inline. Erişilebilir
 * dialog: role=dialog + aria-modal, ESC kapatır, body scroll-lock, açılınca input'a odak, kapanınca tetikleyiciye
 * geri döner. Safe-area (env(safe-area-inset-top)) için padding. Navigasyon sonrası drawer otomatik kapanır.
 */
export function MobileSearch({ t }: { t: StorefrontDictionary }) {
  const labels = t.autocomplete;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      (triggerRef.current ?? previouslyFocused)?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.mobileOpen}
        onClick={() => setOpen(true)}
        className="inline-flex text-ink transition-opacity hover:opacity-60"
      >
        <SearchIcon />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.mobileTitle}
          className="fixed inset-0 z-50 flex flex-col bg-paper"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="flex-1">
              <SearchCombobox
                t={t}
                variant="drawer"
                autoFocus
                onNavigate={() => setOpen(false)}
                inputClassName="h-11 w-full rounded-none border-b border-line bg-transparent px-1 text-base text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none"
              />
            </div>
            <button
              type="button"
              aria-label={labels.mobileClose}
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

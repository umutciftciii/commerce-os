"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@commerce-os/ui";

/**
 * TODO-158C — Sticky header kabuğu. Scroll'da (>8px) yumuşak `shadow-md` + hairline
 * belirginleşir (kondens hissi); tepedeyken düz kalır. Announcement/campaign bandı
 * (üstte, sticky DEĞİL) doğal olarak yukarı kayar; header tepeye yapışır.
 * Tamamen token-tabanlı; JS yalnız scroll durumunu izler (passive listener).
 */
export function StickyHeader({
  children,
  variant = "solid",
}: {
  children: ReactNode;
  // TODO-164 — header slot variant (solid|minimal|floating). CSS `[data-header-variant]` sürer.
  variant?: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "true" : "false"}
      data-header-variant={variant}
      className={cn(
        "site-header relative sticky top-0 z-30 border-b bg-surface transition-shadow duration-300 ease-premium",
        scrolled ? "border-line-strong shadow-md" : "border-line",
      )}
    >
      {children}
    </header>
  );
}

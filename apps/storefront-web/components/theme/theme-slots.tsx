"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * TODO-164 (ADR-218/ADR-222) — Storefront slot variant context.
 *
 * Sunucu (gateway resolver) her slot için ÇÖZÜLMÜŞ + ALLOWLIST'li variant string'i
 * gönderir (`PublicTheme.slots`). Bu context onu client slot bileşenlerine taşır
 * (ProductCard/Hero/MobileNavigation). Slot bileşeni yalnız variant STRING'ini okur;
 * fiyat/stok hesaplamaz, API çağrısı icat etmez, tenant verisi taşımaz (presentation-only).
 *
 * Değer sunucu-otoriter olduğundan client bir variant "uydurup" override YAPAMAZ:
 * context yalnız okuma sağlar; bilinmeyen/eksik slot güvenli default'a düşer.
 */

export type ThemeSlots = Record<string, string>;

const ThemeSlotsContext = createContext<ThemeSlots>({});

export function ThemeSlotsProvider({
  slots,
  children,
}: {
  slots: ThemeSlots;
  children: ReactNode;
}) {
  return <ThemeSlotsContext.Provider value={slots ?? {}}>{children}</ThemeSlotsContext.Provider>;
}

/**
 * Bir slotun etkin variant'ını döndürür. Eksikse `fallback` (slot defaultVariant'ı;
 * çağıran bilir). Sunucu değeri zaten allowlisted olduğundan doğrulama gerekmez.
 */
export function useSlotVariant(slot: string, fallback: string): string {
  const slots = useContext(ThemeSlotsContext);
  const value = slots[slot];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

"use client";

/**
 * TODO-159E (ADR-094) — Kart rating context'i (mock KALDIRILDI).
 *
 * Sayfadaki ürünlerin GERÇEK aggregate özetleri sunucuda TEK batched çağrıyla çözülür
 * (`getRatingSummaries`) ve buraya `summaries` olarak geçer. Kartlar `useRating(productId)`
 * ile okur; yorumu olmayan ürün `null` döner → kart yıldız satırını GİZLER (sahte puan yok).
 * WishlistProvider deseniyle simetrik (provider yoksa güvenli no-op).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface CardRating {
  average: number;
  count: number;
}

const RatingContext = createContext<Map<string, CardRating> | null>(null);

export function RatingProvider({
  summaries,
  children,
}: {
  /** productId → { average, count }. Yalnız yorumu olan ürünler yer alır. */
  summaries: Record<string, CardRating>;
  children: ReactNode;
}) {
  const map = useMemo(() => new Map(Object.entries(summaries)), [summaries]);
  return <RatingContext.Provider value={map}>{children}</RatingContext.Provider>;
}

/** Ürünün gerçek rating özeti; yorumu yoksa (veya provider yoksa) null. */
export function useRating(productId: string): CardRating | null {
  const map = useContext(RatingContext);
  const rating = map?.get(productId);
  if (!rating || rating.count <= 0) return null;
  return rating;
}

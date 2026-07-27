/**
 * TODO-161B (ADR-137/138) — Recently Viewed & Similar istemci erişim yardımcıları (client-only).
 *
 * Görüntüleme kaydı + geçmiş/benzer okuma vitrin BFF proxy'sine (`/api/recently-viewed`, `/api/similar`)
 * gider — gateway'e DOĞRUDAN değil (gateway URL sunucu-yalnız; visitor/customer kimliği BFF'te header'a
 * çevrilir). Kayıt best-effort (keepalive); PDP render'ını bloklamaz. Fiyat/metadata otoritesi SUNUCUDUR.
 */
"use client";

import type { PublicSearchProduct } from "@commerce-os/api-client";

/** Öneri yanıtı: ürünler + favori (wishlist) durumu (TODO-159D initialSavedIds). */
export interface RecommendationResult {
  products: PublicSearchProduct[];
  savedIds: string[];
}

const EMPTY_RESULT: RecommendationResult = { products: [], savedIds: [] };

function parseResult(json: unknown): RecommendationResult {
  const data = (json as { data?: unknown })?.data;
  const savedIds = (json as { savedIds?: unknown })?.savedIds;
  return {
    products: Array.isArray(data) ? (data as PublicSearchProduct[]) : [],
    savedIds: Array.isArray(savedIds) ? (savedIds as string[]) : [],
  };
}

/** PDP mount'ta bir görüntüleme kaydeder (best-effort; hata yutulur). */
export function recordProductView(productId: string): void {
  if (!productId) return;
  const payload = JSON.stringify({ productId });
  try {
    void fetch("/api/recently-viewed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

/** Kimliğe ait son görüntülenen ürünleri + favori durumunu getirir (boş/hata → boş sonuç). */
export async function fetchRecentlyViewed(limit?: number): Promise<RecommendationResult> {
  try {
    const q = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    const res = await fetch(`/api/recently-viewed${q}`, { method: "GET", cache: "no-store" });
    if (!res.ok) return EMPTY_RESULT;
    return parseResult(await res.json().catch(() => null));
  } catch {
    return EMPTY_RESULT;
  }
}

/** Geçmişi temizler; silinen sayı (hata → 0). */
export async function clearRecentlyViewed(): Promise<number> {
  try {
    const res = await fetch("/api/recently-viewed", { method: "DELETE", cache: "no-store" });
    if (!res.ok) return 0;
    const json = (await res.json().catch(() => null)) as { data?: { cleared?: number } } | null;
    return typeof json?.data?.cleared === "number" ? json.data.cleared : 0;
  } catch {
    return 0;
  }
}

/** Bir ürüne benzer ürünleri + favori durumunu getirir (boş/hata → boş sonuç). */
export async function fetchSimilarProducts(productId: string, limit?: number): Promise<RecommendationResult> {
  if (!productId) return EMPTY_RESULT;
  try {
    const params = new URLSearchParams({ productId });
    if (limit) params.set("limit", String(limit));
    const res = await fetch(`/api/similar?${params.toString()}`, { method: "GET", cache: "no-store" });
    if (!res.ok) return EMPTY_RESULT;
    return parseResult(await res.json().catch(() => null));
  } catch {
    return EMPTY_RESULT;
  }
}

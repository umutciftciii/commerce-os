"use client";

/**
 * TODO-161B (ADR-137) — PDP görüntüleme izleyici (client-only, görünmez).
 *
 * PDP hydrate olduktan SONRA bir kez çalışır → görüntülemeyi BFF'e kaydeder (best-effort). SSR'da
 * ÇALIŞMAZ (bot/prefetch elenir; sunucu render'ı bloklanmaz). Aynı ürün için tekrar mount'ta sunucu
 * lastViewedAt+viewCount günceller (idempotent). Görünür çıktı YOK.
 */
import { useEffect } from "react";
import { recordProductView } from "../../lib/recently-viewed/track";

export function RecentlyViewedTracker({ productId }: { productId: string }) {
  useEffect(() => {
    recordProductView(productId);
  }, [productId]);
  return null;
}

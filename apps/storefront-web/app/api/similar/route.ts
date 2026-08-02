/**
 * TODO-161B (ADR-140…143) — Similar Products PROXY route handler (read-only, kimlik gerekmez).
 *
 * Vitrin client bileşeni BURAYA fetch eder — gateway URL sunucu-yalnız kalır. Öneri kartları gateway'de
 * read-model snapshot'ından üretilir (sponsored/organik ranking'e DOKUNMAZ). Best-effort: hata → boş.
 */
import { NextResponse } from "next/server";
import { gatewayBaseUrl } from "../../../lib/server/gateway";
import { demoStoreSlug } from "../../../lib/server/env";
import { getWishlistStatus } from "../../../lib/server/wishlist";
import { getCardRatings } from "../../../lib/server/reviews";
import type { CardRating } from "../../../components/reviews/rating-provider";

export const dynamic = "force-dynamic";

/**
 * Öneri ürünlerine favori durumunu (TODO-159D) VE rating özetini (FP-3 — SUNUCU
 * projection reuse) ekler; böylece benzer-ürün rail'i RatingProvider'ı besleyip
 * yıldızları gösterir (client tahmin üretmez).
 */
async function withSavedIds(
  json: unknown,
): Promise<{ data: unknown[]; savedIds: string[]; ratings: Record<string, CardRating> }> {
  const data = Array.isArray((json as { data?: unknown[] })?.data) ? (json as { data: unknown[] }).data : [];
  const productIds = data
    .map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string");
  const [saved, ratings] = await Promise.all([
    productIds.length > 0 ? getWishlistStatus(productIds) : Promise.resolve(new Set<string>()),
    productIds.length > 0 ? getCardRatings(productIds) : Promise.resolve<Record<string, CardRating>>({}),
  ]);
  return { data, savedIds: [...saved], ratings };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  const limit = url.searchParams.get("limit");
  if (!productId) {
    return NextResponse.json({ data: [], savedIds: [], ratings: {} }, { status: 200 });
  }
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  try {
    const res = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(demoStoreSlug())}/products/${encodeURIComponent(productId)}/similar${query}`,
      { method: "GET", cache: "no-store" },
    );
    const json = res.ok ? await res.json().catch(() => ({ data: [] })) : { data: [] };
    const enriched = await withSavedIds(json);
    return NextResponse.json(enriched, { status: 200 });
  } catch {
    return NextResponse.json({ data: [], savedIds: [], ratings: {} }, { status: 200 });
  }
}

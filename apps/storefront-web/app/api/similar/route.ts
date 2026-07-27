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

export const dynamic = "force-dynamic";

/** Öneri ürünlerinin favori durumunu (TODO-159D) ekler (auth→gateway, guest→cookie). */
async function withSavedIds(json: unknown): Promise<{ data: unknown[]; savedIds: string[] }> {
  const data = Array.isArray((json as { data?: unknown[] })?.data) ? (json as { data: unknown[] }).data : [];
  const productIds = data
    .map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string");
  const saved = productIds.length > 0 ? await getWishlistStatus(productIds) : new Set<string>();
  return { data, savedIds: [...saved] };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  const limit = url.searchParams.get("limit");
  if (!productId) {
    return NextResponse.json({ data: [], savedIds: [] }, { status: 200 });
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
    return NextResponse.json({ data: [], savedIds: [] }, { status: 200 });
  }
}

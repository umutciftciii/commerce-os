/**
 * TODO-156B (ANALIZ-156A §7.1) — Storefront arama BFF (sunucu-yalniz).
 *
 * `GET /public/stores/:slug/search` public ucunu (AUTH YOK, `no-store`) cagirir; yaniti
 * `publicSearchResponseSchema` ALLOWLIST'iyle DOGRULAR (schema parse hatasi → kontrollu error). URL-state
 * codec'in urettigi kanonik query string GATEWAY sorgusuyla AYNIDIR (gateway varsayilanlari yeniden uygular).
 *
 * Bu modul NEXT_PUBLIC degildir; client bundle'a girmez (mevcut gateway BFF deseniyle simetrik). Bir
 * hidrasyon turu YOK: kart ticari zenginligi + kapak/hover/swatch read-model listing snapshot'indan gelir.
 */
import type { PublicSearchResponse } from "@commerce-os/api-client";
import { publicSearchResponseSchema } from "@commerce-os/api-client";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";
import { serializeSearchState, type SearchState } from "../search/url-state";

/** BFF hata sinifi (kullaniciya farkli UX gosterilir; internal mesaj TASINMAZ). */
export type SearchFailure =
  | "no-store" // 404 STORE_NOT_FOUND
  | "category-not-found" // 404 CATEGORY_NOT_FOUND
  | "bad-request" // 400 (gecersiz sort/filtre/pagination) — genelde codec bunu onler
  | "error"; // 5xx / ag / schema parse

export type SearchResult =
  | { ok: true; data: PublicSearchResponse }
  | { ok: false; reason: SearchFailure };

/**
 * Kanonik SearchState → public search yaniti. Codec `page`/`sort`/`pageSize` gibi varsayilanlari atsa da
 * gateway bunlari yeniden uygular; yani state.page ne olursa olsun dogru sayfa gelir.
 */
export async function getStorefrontSearch(state: SearchState): Promise<SearchResult> {
  const query = serializeSearchState(state);
  const path = `/public/stores/${encodeURIComponent(demoStoreSlug())}/search${query ? `?${query}` : ""}`;

  let outcome;
  try {
    outcome = await getPublic<unknown>(path);
  } catch {
    return { ok: false, reason: "error" };
  }

  if (!outcome.ok) {
    if (outcome.status === 404) {
      return { ok: false, reason: outcome.code === "CATEGORY_NOT_FOUND" ? "category-not-found" : "no-store" };
    }
    if (outcome.status === 400) return { ok: false, reason: "bad-request" };
    return { ok: false, reason: "error" };
  }

  // ALLOWLIST dogrulama: internal alan sizmaz + bozuk yanit sessizce UI'yi kirmaz (§15 schema parse failure).
  const parsed = publicSearchResponseSchema.safeParse(outcome.data);
  if (!parsed.success) return { ok: false, reason: "error" };

  return { ok: true, data: parsed.data };
}

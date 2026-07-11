/**
 * ADR-065 — Site-geneli gorsel yonetimi (Faz 1).
 *
 * "Storage key sakla, URL turet" ilkesinin tek uygulama noktasi: DB'de yalniz
 * goreli `storageKey` (or. "stores/{storeId}/products/{uuid}.webp") saklanir;
 * public URL runtime'da bu fonksiyonla uretilir.
 *
 * - `baseUrl` verilirse (MEDIA_PUBLIC_BASE_URL): `{baseUrl}/{storageKey}` — ileride
 *   CDN kokune isaret edebilir; ayni storageKey CDN'den servis edilir (migration YOK).
 * - `baseUrl` bos/undefined ise: `/media/{storageKey}` goreli yolu — ayni origin'den
 *   @fastify/static ile sunulur.
 *
 * Sondaki `/` karakterleri normalize edilir; cift slash uretilmez.
 */
export function resolveMediaUrl(baseUrl: string | undefined, storageKey: string): string {
  const prefix = (baseUrl ?? "").replace(/\/+$/, "");
  return prefix ? `${prefix}/${storageKey}` : `/media/${storageKey}`;
}

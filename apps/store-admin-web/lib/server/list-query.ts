/**
 * TODO-159A (ADR-089) — BFF liste query aktarımı.
 *
 * İstemci query string'inden YALNIZ bilinen anahtarlar seçilip gateway'e taşınır
 * (allowlist). Böylece BFF beklenmeyen parametre enjekte etmez; nihai doğrulama
 * (enum, üst sınır, sıralama allowlist'i) gateway contract şemasındadır.
 *
 * Store-admin web katmanı `@commerce-os/contracts`'a doğrudan bağlanmaz; sınır
 * api-client üzerinden korunur — bu yüzden anahtar listeleri burada düz metindir.
 */

/** Her admin liste ucunun paylaştığı ortak anahtarlar. */
const COMMON_KEYS = ["page", "pageSize", "limit", "offset", "search", "sortBy", "sortOrder"];

export const PRODUCT_LIST_KEYS = [
  ...COMMON_KEYS,
  "status",
  "salesMode",
  "purchasable",
  "categoryId",
  "brand",
  "vendor",
  "stockStatus",
  "priceMin",
  "priceMax",
];

export const CATEGORY_LIST_KEYS = [...COMMON_KEYS, "status"];

export const CUSTOMER_LIST_KEYS = [...COMMON_KEYS, "status", "hasCredential"];

/**
 * Allowlist'teki anahtarları `Record<string,string>` olarak toplar. Boş değerler
 * atlanır (gateway varsayılanı devreye girsin).
 */
export function pickListQuery(
  params: URLSearchParams,
  allowedKeys: readonly string[],
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") query[key] = value.trim();
  }
  return query;
}

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
 * TODO-159C (ADR-092) — Envanter matrisi liste anahtarları. `warehouseId` matrisin
 * BAKILAN deposunu seçer; `stockStatus`/`reserved`/`variantStatus`/`productStatus`
 * sunucu-otoriter filtrelerdir. Doğrulama gateway contract şemasındadır.
 */
export const INVENTORY_MATRIX_LIST_KEYS = [
  ...COMMON_KEYS,
  "warehouseId",
  "stockStatus",
  "reserved",
  "variantStatus",
  "productStatus",
];

/**
 * TODO-159B (ADR-090) — Seçici uçlarının ortak anahtarları. `ids` CSV'dir ve
 * verildiğinde uç "seçili kaydı çöz" moduna geçer (bkz. ADR-090); BFF yalnız
 * taşır, anlamlandırma gateway'dedir.
 */
const SELECTOR_KEYS = [...COMMON_KEYS, "ids"];

export const PRODUCT_SELECTOR_KEYS = [...SELECTOR_KEYS, "status", "categoryId"];

export const CATEGORY_SELECTOR_KEYS = [...SELECTOR_KEYS, "status"];

/** TODO-159B — Medya kütüphanesi (TD-095): gerçek sayfalama + arama + context. */
export const MEDIA_LIST_KEYS = [...SELECTOR_KEYS, "context"];

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

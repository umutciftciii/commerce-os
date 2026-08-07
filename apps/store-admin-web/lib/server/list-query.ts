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

/**
 * TODO-165A (ADR-165A) Task 15/16 — Marka (Brand) liste/seçici/ürün listesi anahtarları.
 * Kategori deseniyle aynı (yalnız `status` filtresi); ürün listesinde filtre yok, yalnız
 * arama/sayfalama.
 */
export const BRAND_LIST_KEYS = [...COMMON_KEYS, "status"];
export const BRAND_PRODUCTS_LIST_KEYS = [...COMMON_KEYS];

export const CUSTOMER_LIST_KEYS = [...COMMON_KEYS, "status", "hasCredential"];

/**
 * TODO-166 (ADR-265) — Admin Slug & Redirect Management liste anahtarları. Tümü sunucu-otoriter
 * filtrelerdir (origin/type/enabled/entityType, status/hasRedirects); doğrulama gateway contract
 * şemasındadır.
 */
export const REDIRECT_LIST_KEYS = [...COMMON_KEYS, "origin", "type", "enabled", "entityType"];
export const SLUG_LIST_KEYS = [...COMMON_KEYS, "entityType", "status", "hasRedirects"];

/**
 * TODO-159E (ADR-094) — Ürün yorumu moderasyon liste anahtarları. Tümü sunucu-otoriter
 * filtrelerdir (durum/rating/verified/ürün/tarih); doğrulama gateway contract şemasındadır.
 */
export const REVIEW_LIST_KEYS = [
  ...COMMON_KEYS,
  "status",
  "rating",
  "verifiedPurchase",
  "productId",
  "dateFrom",
  "dateTo",
];

/**
 * TODO-160 — Influencer izleme & atıf liste anahtarları. Tümü sunucu-otoriter
 * filtrelerdir; doğrulama gateway contract şemasındadır.
 */
export const INFLUENCER_LIST_KEYS = [...COMMON_KEYS, "status"];

// TODO-161 — Sponsored Product Management: liste + performans dashboard filtre anahtarları.
export const SPONSORED_CAMPAIGN_LIST_KEYS = [...COMMON_KEYS, "status", "placement"];
export const SPONSORED_ANALYTICS_KEYS = ["dateFrom", "dateTo", "campaignId", "placement", "productId"];

// TODO-161A — Sponsorship Agreements, Billing & Settlement: liste + dashboard filtre anahtarları.
export const SPONSOR_LIST_KEYS = [...COMMON_KEYS, "status"];
export const SPONSORSHIP_AGREEMENT_LIST_KEYS = [...COMMON_KEYS, "status", "sponsorAccountId", "pricingModel"];
export const SPONSORSHIP_SETTLEMENT_LIST_KEYS = [...COMMON_KEYS, "status", "agreementId"];
export const SPONSORSHIP_CHARGE_LIST_KEYS = [
  ...COMMON_KEYS,
  "status",
  "agreementId",
  "sponsorAccountId",
  "chargeType",
  "overdueOnly",
  "dateFrom",
  "dateTo",
];
export const SPONSORSHIP_PAYMENT_LIST_KEYS = [
  ...COMMON_KEYS,
  "agreementId",
  "sponsorAccountId",
  "chargeId",
  "method",
  "dateFrom",
  "dateTo",
];
export const SPONSORSHIP_DASHBOARD_KEYS = ["dateFrom", "dateTo", "sponsorAccountId", "agreementId"];

// TODO-161A.2 (ADR-128/129) — Birleşik ticari akış: avans + açık tahakkuk filtre anahtarları.
export const SPONSORSHIP_ADVANCE_LIST_KEYS = ["agreementId", "sponsorAccountId"];
export const SPONSORSHIP_OPEN_CHARGE_LIST_KEYS = ["agreementId"];

export const INFLUENCER_CAMPAIGN_LIST_KEYS = [...COMMON_KEYS, "status", "influencerId"];

export const TRACKING_LINK_LIST_KEYS = [
  ...COMMON_KEYS,
  "status",
  "influencerId",
  "campaignId",
  "targetType",
];

/**
 * TODO-160 — Atıf analitiği query anahtarları (tarih aralığı + varlık kırılımı).
 * Liste sayfalama anahtarları yoktur; tümü filtre.
 */
export const INFLUENCER_ANALYTICS_KEYS = [
  "dateFrom",
  "dateTo",
  "influencerId",
  "campaignId",
  "trackingLinkId",
  // TD-144/146 — kampanya zaman serisi link/UTM filtreleri.
  "utmSource",
  "utmMedium",
  "utmCampaign",
];

/**
 * ADR-268 — Financial Reporting (Finans > Raporlar) sorgu anahtarları. `period` hazır
 * dönemi (today/last30/…), dateFrom/dateTo custom aralığı taşır. Filtreler URL'de
 * korunur (§9); doğrulama (enum/format) gateway contract şemasındadır.
 */
export const FINANCE_REPORT_KEYS = [
  "period",
  "dateFrom",
  "dateTo",
  "currency",
  "status",
  "paymentStatus",
  "productId",
  "variantId",
  "categoryId",
  "brandId",
  "campaignId",
  "paymentMethod",
];

/**
 * TODO-174 (ADR-275) — İptal raporu sorgu anahtarları (Store Admin; yalnız görüntüleme).
 * `period`/tarih finans deseniyle aynı; `reasonCategory`/`reasonCode` taksonomi kırılımı,
 * `paymentMethod`/`shippingProvider`/`productId`/`categoryId` boyut filtreleri. Doğrulama
 * (enum/format) gateway contract şemasındadır (cancellationReportQuerySchema).
 */
export const CANCELLATION_REPORT_KEYS = [
  "period",
  "dateFrom",
  "dateTo",
  "currency",
  "reasonCategory",
  "reasonCode",
  "productId",
  "categoryId",
  "paymentMethod",
  "shippingProvider",
];

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

/** TODO-165A (ADR-165A) Task 17 — Marka seçici anahtarları (kategori seçicisiyle simetrik). */
export const BRAND_SELECTOR_KEYS = [...SELECTOR_KEYS, "status"];

/** TODO-165A Tasks 25/26 — Beden tablosu seçici anahtarları (kategori/marka seçicisiyle simetrik). */
export const SIZE_CHART_SELECTOR_KEYS = [...SELECTOR_KEYS, "status"];

/** TODO-159B — Medya kütüphanesi (TD-095): gerçek sayfalama + arama + context. */
export const MEDIA_LIST_KEYS = [...SELECTOR_KEYS, "context"];

/**
 * TODO-165A (ADR-165A) Task 24 — "Ürün Sözlükleri" (governed Product Taxonomy) liste
 * anahtarları. `type` sekme seçimini taşır (SEASON/MATERIAL/…); doğrulama (enum, tanınmayan
 * tip) gateway contract şemasındadır.
 */
export const PRODUCT_TAXONOMY_LIST_KEYS = [...COMMON_KEYS, "type", "status"];

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

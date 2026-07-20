/**
 * Enterprise Demo Dataset — sabitler ve DEMO SCOPE tanımı.
 *
 * BÜTÜN yazma işlemleri YALNIZCA bu store scope'una (STORE_SLUG / STORE_ID) hedeflenir.
 * Üretim/müşteri verisi veya `demo-store` (mevcut production seed) ASLA bu script'ten
 * etkilenmez. ID'ler deterministik önek şemasıyla üretilir → tekrar çalıştırmada birebir
 * aynı satırlara denk gelir (idempotent upsert; slug/SKU çakışması yok).
 */

/** Demo tenant/store scope — izolasyonun tek kaynağı. */
export const STORE_SLUG = "enterprise-demo";
export const STORE_ID = "edm-store";
export const STORE_NAME = "Enterprise Demo Mağazası";
export const STORE_DOMAIN = "enterprise-demo.localhost";
export const PLAN_CODE = "enterprise-demo";

/**
 * Bu store'un mevcut `demo-store` production seed'inden AYRI olduğunu doğrulayan guard.
 * `demo-store` slug'ına yazma girişimi HATA verir (yanlış-scope koruması).
 */
export const PROTECTED_STORE_SLUGS = new Set(["demo-store"]);

/** Para birimi + KDV. Fiyatlar minor unit (kuruş). */
export const CURRENCY = "TRY";

/**
 * Kampanya/tarih ANKARLARI — determinizm İÇİN mutlak sabit tarihler (Date.now YOK).
 * Geniş pencere: aktif kampanyalar gerçek "şimdi" hangi güne denk gelirse gelsin (2021–2098)
 * daima ACTIVE + pencere-içi kalır → backfill rozet snapshot'ı deterministik ve doğru sınıflanır.
 */
export const DATE_ANCHORS = {
  // Aktif kampanya penceresi (geçmiş → uzak gelecek).
  activeStart: new Date("2020-01-01T00:00:00.000Z"),
  activeEnd: new Date("2099-12-31T23:59:59.000Z"),
  // Yaklaşan (henüz başlamadı).
  upcomingStart: new Date("2099-06-01T00:00:00.000Z"),
  upcomingEnd: new Date("2099-12-31T23:59:59.000Z"),
  // Sona ermiş (geçmişte bitti).
  endedStart: new Date("2020-01-01T00:00:00.000Z"),
  endedEnd: new Date("2021-01-01T00:00:00.000Z"),
  // Ürün createdAt dağılımı için taban (yeni ↔ eski ürün ayrımı). Deterministik.
  catalogEpochStart: new Date("2023-01-01T00:00:00.000Z"),
  catalogEpochEnd: new Date("2026-06-30T00:00:00.000Z"),
  // "Yeni ürün" eşiği referansı (createdAt bu tarihten sonraysa yeni).
  newProductSince: new Date("2026-04-01T00:00:00.000Z"),
};

/** ID önek şeması (deterministik, scope-okunur). */
export const ID = {
  category: (slug) => `edm-cat-${slug}`,
  attr: (code) => `edm-attr-${code}`,
  attrOption: (code, value) => `edm-opt-${code}-${value}`,
  categoryAttr: (catSlug, code) => `edm-catattr-${catSlug}-${code}`,
  product: (n) => `edm-prod-${String(n).padStart(4, "0")}`,
  variant: (productN, comboN) => `edm-var-${String(productN).padStart(4, "0")}-${String(comboN).padStart(2, "0")}`,
  warehouse: (code) => `edm-wh-${code}`,
  campaign: (n) => `edm-camp-${String(n).padStart(2, "0")}`,
  coupon: (n) => `edm-coupon-${String(n).padStart(2, "0")}`,
  media: (slug) => `edm-media-${slug}`,
  shippingPlan: () => `edm-shipping-default`,
};

/** Hedef ölçek (üst sınır/hedef; üretici bunlara göre boyutlanır). */
export const SCALE = {
  targetProducts: 470,
  maxVariantsPerProduct: 14,
};

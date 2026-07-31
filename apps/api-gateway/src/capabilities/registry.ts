// TODO-163 (ADR-208/ADR-209 · Faz 2 ADR-211) — Tenant Module & Capability Management.
//
// TIPLI MODUL REGISTRY = "WHAT-var" tek otorite (source of truth). Hangi modullerin VAR
// OLDUGU, hangilerinin CORE (kapatilamaz) oldugu, core olmayanlarin baseline default'u ve
// dependency zincirleri YALNIZ burada tanimlidir. StoreModule.moduleKey serbest string DEGIL
// — bu registry'nin anahtarina karsi dogrulanir (bilinmeyen key reddedilir/fail-closed).
//
// GERIYE UYUMLULUK: Tum non-core moduller baseline ENABLED. Override/plan yokken effective
// davranis MEVCUT davranisin AYNISI → regresyon yok. Bir modul ancak ACIK override ya da plan
// default ile KAPATILIR. Effective capability YALNIZ sunucuda turetilir (resolver.ts).
//
// Faz 2 taksonomisi (uppercase-snake key'ler; prompt sozlesmesiyle birebir). Core icinde
// urun/musteri adina gore kosul YOK — yalniz modul anahtarlarina bakilir.

export type StoreModuleGroup = "catalog" | "sales" | "sponsorship" | "appearance" | "system";

export type StoreModuleKey =
  // ── CORE (kapatilamaz) ──────────────────────────────────────────────────────
  | "AUTH"
  | "STORE"
  | "CATALOG"
  | "CATEGORIES"
  | "BASIC_INVENTORY"
  | "CUSTOMERS"
  | "CART"
  | "CHECKOUT"
  | "ORDERS"
  | "PAYMENTS"
  | "SHIPPING"
  | "AUDIT_SECURITY"
  // ── OPTIONAL ────────────────────────────────────────────────────────────────
  | "REVIEWS"
  | "WISHLIST"
  | "CUSTOMER_LISTS"
  | "RECENTLY_VIEWED"
  | "RECOMMENDATIONS"
  | "RECOMMENDATION_ANALYTICS"
  | "HOME_EXPERIENCE"
  | "THEME_STUDIO"
  | "CAMPAIGNS"
  | "INFLUENCER_TRACKING"
  | "SPONSORED_PRODUCTS"
  | "SPONSORSHIP_FINANCE"
  | "PAYMENT_RECOVERY"
  | "MULTI_WAREHOUSE"
  | "CUSTOMER_DATA_ERASURE"
  | "OPERATIONS_ADVANCED"
  | "FASHION_VERTICAL";

export interface StoreModuleDefinition {
  key: StoreModuleKey;
  group: StoreModuleGroup;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  /** core=true → daima aktif, KAPATILAMAZ (urun cekirdegi). Override/plan etkilemez. */
  core: boolean;
  /** core olmayanlar icin baseline default (override VE plan yoksa). Geriye uyumluluk icin true. */
  baselineEnabled: boolean;
  /**
   * Bu modulun ENABLED olabilmesi icin ENABLED olmasi gereken diger moduller. Gereken bir
   * modul effective KAPALIysa bu modul de effective kapatilir (resolver dependency pass).
   * Tek yonlu; dongu tanimlanmamalidir.
   */
  requires?: StoreModuleKey[];
}

export const STORE_MODULE_REGISTRY: readonly StoreModuleDefinition[] = [
  // ── CORE ────────────────────────────────────────────────────────────────────
  { key: "AUTH", group: "system", labelTr: "Kimlik", labelEn: "Auth", descriptionTr: "Oturum/kimlik. Çekirdek.", core: true, baselineEnabled: true },
  { key: "STORE", group: "system", labelTr: "Mağaza", labelEn: "Store", descriptionTr: "Mağaza ayarları. Çekirdek.", core: true, baselineEnabled: true },
  { key: "CATALOG", group: "catalog", labelTr: "Katalog", labelEn: "Catalogue", descriptionTr: "Ürünler ve öznitelikler. Çekirdek.", core: true, baselineEnabled: true },
  { key: "CATEGORIES", group: "catalog", labelTr: "Kategoriler", labelEn: "Categories", descriptionTr: "Kategori ağacı. Çekirdek.", core: true, baselineEnabled: true },
  { key: "BASIC_INVENTORY", group: "catalog", labelTr: "Temel Stok", labelEn: "Basic Inventory", descriptionTr: "Temel stok izleme. Çekirdek.", core: true, baselineEnabled: true },
  { key: "CUSTOMERS", group: "sales", labelTr: "Müşteriler", labelEn: "Customers", descriptionTr: "Müşteri hesapları. Çekirdek.", core: true, baselineEnabled: true },
  { key: "CART", group: "sales", labelTr: "Sepet", labelEn: "Cart", descriptionTr: "Sepet. Çekirdek.", core: true, baselineEnabled: true },
  { key: "CHECKOUT", group: "sales", labelTr: "Ödeme Akışı", labelEn: "Checkout", descriptionTr: "Checkout. Çekirdek.", core: true, baselineEnabled: true },
  { key: "ORDERS", group: "sales", labelTr: "Siparişler", labelEn: "Orders", descriptionTr: "Sipariş yönetimi. Çekirdek.", core: true, baselineEnabled: true },
  { key: "PAYMENTS", group: "sales", labelTr: "Ödeme Sağlayıcılar", labelEn: "Payments", descriptionTr: "Ödeme sağlayıcı yapılandırması. Çekirdek.", core: true, baselineEnabled: true },
  { key: "SHIPPING", group: "sales", labelTr: "Kargo", labelEn: "Shipping", descriptionTr: "Kargo sağlayıcı/tarife/gönderi. Çekirdek.", core: true, baselineEnabled: true },
  { key: "AUDIT_SECURITY", group: "system", labelTr: "Denetim & Güvenlik", labelEn: "Audit & Security", descriptionTr: "Denetim kaydı/güvenlik. Çekirdek.", core: true, baselineEnabled: true },
  // ── OPTIONAL ────────────────────────────────────────────────────────────────
  { key: "REVIEWS", group: "sales", labelTr: "Değerlendirmeler", labelEn: "Reviews", descriptionTr: "Ürün değerlendirme ve puanları.", core: false, baselineEnabled: true, requires: ["CATALOG"] },
  { key: "WISHLIST", group: "sales", labelTr: "İstek Listesi", labelEn: "Wishlist", descriptionTr: "Müşteri istek listesi (kalp).", core: false, baselineEnabled: true, requires: ["CUSTOMER_LISTS"] },
  { key: "CUSTOMER_LISTS", group: "sales", labelTr: "Müşteri Listeleri", labelEn: "Customer Lists", descriptionTr: "Ortak müşteri liste altyapısı.", core: false, baselineEnabled: true, requires: ["CUSTOMERS"] },
  { key: "RECENTLY_VIEWED", group: "appearance", labelTr: "Son Görüntülenenler", labelEn: "Recently Viewed", descriptionTr: "Son görüntülenen ürün takibi.", core: false, baselineEnabled: true, requires: ["CATALOG"] },
  { key: "RECOMMENDATIONS", group: "appearance", labelTr: "Öneriler", labelEn: "Recommendations", descriptionTr: "İlgili/benzer/sepet önerileri.", core: false, baselineEnabled: true, requires: ["RECENTLY_VIEWED"] },
  { key: "RECOMMENDATION_ANALYTICS", group: "appearance", labelTr: "Öneri Analitiği", labelEn: "Recommendation Analytics", descriptionTr: "Öneri ölçümü (RecommendationEvent).", core: false, baselineEnabled: true, requires: ["RECOMMENDATIONS"] },
  { key: "HOME_EXPERIENCE", group: "appearance", labelTr: "Ana Sayfa Deneyimi", labelEn: "Home Experience", descriptionTr: "Yönetilebilir ana sayfa + hero + keşif.", core: false, baselineEnabled: true },
  { key: "THEME_STUDIO", group: "appearance", labelTr: "Theme Studio", labelEn: "Theme Studio", descriptionTr: "Tenant tema override'ları.", core: false, baselineEnabled: true, requires: ["HOME_EXPERIENCE"] },
  { key: "CAMPAIGNS", group: "sales", labelTr: "Kampanyalar", labelEn: "Campaigns", descriptionTr: "Kampanya ve kuponlar.", core: false, baselineEnabled: true },
  { key: "INFLUENCER_TRACKING", group: "sales", labelTr: "Influencer Takibi", labelEn: "Influencer Tracking", descriptionTr: "Influencer attribution.", core: false, baselineEnabled: true, requires: ["CAMPAIGNS"] },
  { key: "SPONSORED_PRODUCTS", group: "sponsorship", labelTr: "Sponsorlu Ürünler", labelEn: "Sponsored Products", descriptionTr: "Sponsorlu ürün yerleşimleri.", core: false, baselineEnabled: true, requires: ["CAMPAIGNS"] },
  { key: "SPONSORSHIP_FINANCE", group: "sponsorship", labelTr: "Sponsorluk Finansı", labelEn: "Sponsorship Finance", descriptionTr: "Sponsor anlaşma/tahakkuk/mutabakat.", core: false, baselineEnabled: true, requires: ["SPONSORED_PRODUCTS"] },
  { key: "PAYMENT_RECOVERY", group: "sales", labelTr: "Ödeme Tahsilatı", labelEn: "Payment Recovery", descriptionTr: "UNPAID sipariş tahsilatı.", core: false, baselineEnabled: true, requires: ["PAYMENTS"] },
  { key: "MULTI_WAREHOUSE", group: "catalog", labelTr: "Çoklu Depo", labelEn: "Multi-Warehouse", descriptionTr: "Depo-farkındalıklı stok.", core: false, baselineEnabled: true, requires: ["BASIC_INVENTORY"] },
  { key: "CUSTOMER_DATA_ERASURE", group: "system", labelTr: "Müşteri Verisi Silme", labelEn: "Customer Data Erasure", descriptionTr: "KVKK/GDPR silme/anonimleştirme.", core: false, baselineEnabled: true, requires: ["CUSTOMERS"] },
  { key: "OPERATIONS_ADVANCED", group: "system", labelTr: "Gelişmiş Operasyon", labelEn: "Advanced Operations", descriptionTr: "Zamanlayıcı/retention operasyon ekranı.", core: false, baselineEnabled: true },
  // ── OPT-IN (baseline KAPALI; TODO-165 Fashion Vertical) ──────────────────────
  // Moda/tekstil dikeyi: beden/renk/koleksiyon/sezon + adımlı ürün formu + fashion
  // PDP/PLP davranışları. Yeni capability, geriye-uyum kaygısı YOK → baselineEnabled=false
  // (opt-in). Kapalıyken mevcut commerce davranışı AYNEN korunur; ancak açık override ile
  // (ör. enterprise-demo) etkinleşir. CATALOG/CATEGORIES core olduğundan requires no-op'tur
  // ama niyet belgelenir (fashion domain katalog+kategori şablonuna dayanır).
  { key: "FASHION_VERTICAL", group: "catalog", labelTr: "Moda Dikeyi", labelEn: "Fashion Vertical", descriptionTr: "Moda/tekstil ürün, beden, renk, koleksiyon ve mağaza davranışları.", core: false, baselineEnabled: false, requires: ["CATALOG", "CATEGORIES"] },
] as const;

const REGISTRY_BY_KEY: ReadonlyMap<StoreModuleKey, StoreModuleDefinition> = new Map(
  STORE_MODULE_REGISTRY.map((m) => [m.key, m]),
);

export function isStoreModuleKey(value: unknown): value is StoreModuleKey {
  return typeof value === "string" && REGISTRY_BY_KEY.has(value as StoreModuleKey);
}

export function getStoreModuleDefinition(key: StoreModuleKey): StoreModuleDefinition {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown store module key: ${key}`);
  return def;
}

export function listStoreModuleKeys(): StoreModuleKey[] {
  return STORE_MODULE_REGISTRY.map((m) => m.key);
}

/**
 * Bir modulu (dogrudan) `requires` eden modullerin anahtarlari. Parent-disable guard'i ve
 * dependency preview icin kullanilir (transitive icin resolver'in tam pass'ine bakilir).
 */
export function directDependentsOf(key: StoreModuleKey): StoreModuleKey[] {
  return STORE_MODULE_REGISTRY.filter((m) => (m.requires ?? []).includes(key)).map((m) => m.key);
}

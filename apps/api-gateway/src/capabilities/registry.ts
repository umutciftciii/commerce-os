// TODO-163 (ADR-208/ADR-209) — Tenant Module & Capability Management.
//
// TIPLI MODUL REGISTRY = "WHAT-var" tek otorite (source of truth). Hangi modullerin
// VAR OLDUGU, hangilerinin CORE (kapatilamaz) oldugu ve core olmayanlarin registry
// baseline default'u YALNIZ burada tanimlidir. StoreModule.moduleKey serbest string
// DEGIL — bu registry'nin anahtarina karsi dogrulanir (bilinmeyen key reddedilir).
//
// GERIYE UYUMLULUK: Tum non-core moduller baseline ENABLED. Yani hicbir override/plan
// yokken effective davranis MEVCUT davranisin AYNISIdir (nav'da her sey gorunur, hicbir
// uc kapali degil) → regresyon yok. Bir magaza icin bir modul ancak ACIK override ya da
// plan default ile KAPATILIR.
//
// Effective capability YALNIZ sunucuda (gateway) turetilir; istemci gonderemez (bkz.
// resolver.ts + data.ts). Core icinde urun/musteri adina gore kosul YOK — yalniz modul
// anahtarlarina bakilir.

export type StoreModuleGroup = "catalog" | "sales" | "sponsorship" | "appearance" | "system";

export type StoreModuleKey =
  | "catalog"
  | "inventory"
  | "orders"
  | "customers"
  | "reviews"
  | "payments"
  | "shipping"
  | "campaigns"
  | "influencers"
  | "marketplace"
  | "sponsorship"
  | "home_experience"
  | "theme"
  | "operations";

export interface StoreModuleDefinition {
  key: StoreModuleKey;
  group: StoreModuleGroup;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  /**
   * core=true → modul her zaman aktiftir ve KAPATILAMAZ (urunun calismasi icin
   * zorunlu cekirdek). Override/plan bu modulu etkilemez.
   */
  core: boolean;
  /**
   * core olmayan moduller icin registry baseline default'u (acik override VE plan
   * default yoksa gecerli). Geriye uyumluluk icin tumu true.
   */
  baselineEnabled: boolean;
  /**
   * Bu modulun ACIK olabilmesi icin ENABLED olmasi gereken diger moduller. Gereken
   * bir modul kapaliysa bu modul de effective olarak kapatilir (resolver dependency
   * pass). Tek yonlu bagimlilik; dongu tanimlanmamalidir.
   */
  requires?: StoreModuleKey[];
}

// Sira = varsayilan UI sunum sirasi (StoreNav gruplariyla ayni ritim).
export const STORE_MODULE_REGISTRY: readonly StoreModuleDefinition[] = [
  // ── Katalog ────────────────────────────────────────────────────────────────
  {
    key: "catalog",
    group: "catalog",
    labelTr: "Katalog",
    labelEn: "Catalogue",
    descriptionTr: "Ürünler, kategoriler ve öznitelikler. Çekirdek modül; kapatılamaz.",
    core: true,
    baselineEnabled: true,
  },
  {
    key: "inventory",
    group: "catalog",
    labelTr: "Stok",
    labelEn: "Inventory",
    descriptionTr: "Depo ve stok izleme/düzeltme.",
    core: false,
    baselineEnabled: true,
    requires: ["catalog"],
  },
  // ── Satış ──────────────────────────────────────────────────────────────────
  {
    key: "orders",
    group: "sales",
    labelTr: "Siparişler",
    labelEn: "Orders",
    descriptionTr: "Sipariş yönetimi ve fulfilment. Çekirdek modül; kapatılamaz.",
    core: true,
    baselineEnabled: true,
  },
  {
    key: "customers",
    group: "sales",
    labelTr: "Müşteriler",
    labelEn: "Customers",
    descriptionTr: "Müşteri hesapları ve adres defteri.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "reviews",
    group: "sales",
    labelTr: "Değerlendirmeler",
    labelEn: "Reviews",
    descriptionTr: "Ürün değerlendirmeleri ve puanları.",
    core: false,
    baselineEnabled: true,
    requires: ["catalog"],
  },
  {
    key: "payments",
    group: "sales",
    labelTr: "Ödeme Sağlayıcılar",
    labelEn: "Payment Providers",
    descriptionTr: "Ödeme sağlayıcı yapılandırması.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "shipping",
    group: "sales",
    labelTr: "Kargo",
    labelEn: "Shipping",
    descriptionTr: "Kargo sağlayıcıları, tarifeler ve gönderiler.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "campaigns",
    group: "sales",
    labelTr: "Kampanyalar",
    labelEn: "Campaigns",
    descriptionTr: "Kampanya ve kuponlar.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "influencers",
    group: "sales",
    labelTr: "Influencer",
    labelEn: "Influencers",
    descriptionTr: "Influencer takibi ve attribution.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "marketplace",
    group: "sales",
    labelTr: "Pazaryeri",
    labelEn: "Marketplace",
    descriptionTr: "Pazaryeri entegrasyon yüzeyi.",
    core: false,
    baselineEnabled: true,
  },
  // ── Sponsorluk ─────────────────────────────────────────────────────────────
  {
    key: "sponsorship",
    group: "sponsorship",
    labelTr: "Sponsorluk",
    labelEn: "Sponsorship",
    descriptionTr: "Sponsorlu ürünler, anlaşmalar, tahakkuk ve mutabakat.",
    core: false,
    baselineEnabled: true,
  },
  // ── Görünüm & Ayar ─────────────────────────────────────────────────────────
  {
    key: "home_experience",
    group: "appearance",
    labelTr: "Ana Sayfa Deneyimi",
    labelEn: "Home Experience",
    descriptionTr: "Ana sayfa, hero ve keşif bölümleri.",
    core: false,
    baselineEnabled: true,
  },
  {
    key: "theme",
    group: "appearance",
    labelTr: "Tema",
    labelEn: "Theme",
    descriptionTr: "Theme Studio ve tasarım token'ları.",
    core: false,
    baselineEnabled: true,
  },
  // ── Sistem ─────────────────────────────────────────────────────────────────
  {
    key: "operations",
    group: "system",
    labelTr: "Operasyon",
    labelEn: "Operations",
    descriptionTr: "Ticari otomasyon operasyon ekranı.",
    core: false,
    baselineEnabled: true,
  },
] as const;

const REGISTRY_BY_KEY: ReadonlyMap<StoreModuleKey, StoreModuleDefinition> = new Map(
  STORE_MODULE_REGISTRY.map((m) => [m.key, m]),
);

export function isStoreModuleKey(value: unknown): value is StoreModuleKey {
  return typeof value === "string" && REGISTRY_BY_KEY.has(value as StoreModuleKey);
}

export function getStoreModuleDefinition(key: StoreModuleKey): StoreModuleDefinition {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) {
    // isStoreModuleKey ile korunmalidir; buraya dusmek programlama hatasidir.
    throw new Error(`Unknown store module key: ${key}`);
  }
  return def;
}

export function listStoreModuleKeys(): StoreModuleKey[] {
  return STORE_MODULE_REGISTRY.map((m) => m.key);
}

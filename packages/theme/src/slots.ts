import { z } from "zod";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Slot Contract (TODO-164 · ADR-218)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Storefront **presentation** yüzeyleri sabit bir SLOT kümesine bölünür. Her slot:
 *   - typed variant allowlist + defaultVariant,
 *   - server/client sınırı (render katmanı),
 *   - business data KAYNAĞI = mevcut canonical projeksiyon (yeni fetch icat etmez).
 *
 * İLKELER (presentation-only boundary):
 *   - Slot fiyat/stok HESAPLAMAZ; sunucudan gelen önceden-hesaplı label'ları render eder.
 *   - Slot tenant izolasyonunu bypass edemez (veri hep store-scoped projeksiyondan).
 *   - Slot variant değeri ALLOWLIST'tir; bilinmeyen variant reddedilir (layout preset /
 *     custom package doğrulaması). Arbitrary component/kod ENJEKTE EDİLMEZ.
 *
 * NOT: Yeni slot/variant eklemek DB migration GEREKTİRMEZ — yalnız bu registry büyür
 * (H-1/ADR-087 "migrasyonsuz genişleme" deseninin devamı). Registry TEK otoritedir;
 * gateway (compatibility) ve storefront (slot resolver) bunu paylaşır.
 */

export const THEME_SLOT_KEYS = [
  "header",
  "footer",
  "mobileNavigation",
  "productCard",
  "productDetailLayout",
  "productListingLayout",
  "hero",
  "homeSectionFrame",
] as const;

export type ThemeSlotKey = (typeof THEME_SLOT_KEYS)[number];

export const themeSlotKeySchema = z.enum(THEME_SLOT_KEYS);

/** Slotun render katmanı: RSC (server) mi client island mı? Güvenlik/veri sınırı için belge. */
export type SlotBoundary = "server" | "client";

/** Builder UI'da bir variant için gösterilecek adlandırılmış seçenek. */
export interface SlotBuilderVariant {
  key: string;
  nameTr: string;
  nameEn: string;
}

export interface ThemeSlotDefinition {
  key: ThemeSlotKey;
  nameTr: string;
  nameEn: string;
  /**
   * İzinli variant anahtarları (ALLOWLIST — güvenlik sınırı). İlk eleman
   * defaultVariant'tır (geriye uyum). TODO-164A: her slota adlandırılmış builder
   * variant'ları ADDITIVE eklendi; eski (lowercase) variant'lar KORUNUR — layout
   * preset / custom package / eski config'ler bozulmaz.
   */
  variants: readonly string[];
  defaultVariant: string;
  /**
   * Builder UI'ın SUNDUĞU adlandırılmış variant menüsü (TODO-164A). `variants`
   * allowlist'in bir alt-kümesidir; güvenlik `variants` ile sağlanır, bu yalnız
   * sunum listesidir. İlk eleman "standart/varsayılan görünüm"tür.
   */
  builderVariants: readonly SlotBuilderVariant[];
  boundary: SlotBoundary;
  /** Business data kaynağı (canonical projeksiyon) — belge amaçlı. */
  dataSource: string;
}

/**
 * SLOT REGISTRY — sabit contract. `variants[0]` daima defaultVariant ile aynıdır
 * (BASE_COMMERCE görünümü = tüm slotların defaultVariant'ı → geriye uyumlu).
 */
export const THEME_SLOT_REGISTRY: readonly ThemeSlotDefinition[] = [
  {
    key: "header",
    nameTr: "Başlık",
    nameEn: "Header",
    variants: ["solid", "minimal", "floating", "STANDARD", "CENTERED_BRAND", "EDITORIAL_SPLIT"],
    defaultVariant: "solid",
    builderVariants: [
      { key: "STANDARD", nameTr: "Standart", nameEn: "Standard" },
      { key: "CENTERED_BRAND", nameTr: "Ortalı Marka", nameEn: "Centered Brand" },
      { key: "EDITORIAL_SPLIT", nameTr: "Editoryal Bölünmüş", nameEn: "Editorial Split" },
    ],
    boundary: "server",
    dataSource: "store-info + nav categories",
  },
  {
    key: "footer",
    nameTr: "Alt Bilgi",
    nameEn: "Footer",
    variants: ["expanded", "minimal", "STANDARD", "MINIMAL", "MULTI_COLUMN"],
    defaultVariant: "expanded",
    builderVariants: [
      { key: "STANDARD", nameTr: "Standart", nameEn: "Standard" },
      { key: "MINIMAL", nameTr: "Sade", nameEn: "Minimal" },
      { key: "MULTI_COLUMN", nameTr: "Çok Kolonlu", nameEn: "Multi Column" },
    ],
    boundary: "server",
    dataSource: "i18n dict",
  },
  {
    key: "mobileNavigation",
    nameTr: "Mobil Navigasyon",
    nameEn: "Mobile Navigation",
    variants: ["drawer", "fullscreen", "BOTTOM_BAR", "DRAWER", "COMPACT_HEADER"],
    defaultVariant: "drawer",
    builderVariants: [
      { key: "DRAWER", nameTr: "Çekmece", nameEn: "Drawer" },
      { key: "BOTTOM_BAR", nameTr: "Alt Bar", nameEn: "Bottom Bar" },
      { key: "COMPACT_HEADER", nameTr: "Kompakt Başlık", nameEn: "Compact Header" },
    ],
    boundary: "client",
    dataSource: "nav links + categories",
  },
  {
    key: "productCard",
    nameTr: "Ürün Kartı",
    nameEn: "Product Card",
    variants: [
      "comfortable",
      "compact",
      "premium",
      "STANDARD",
      "MINIMAL",
      "EDITORIAL",
      "DENSE",
    ],
    defaultVariant: "comfortable",
    builderVariants: [
      { key: "STANDARD", nameTr: "Standart", nameEn: "Standard" },
      { key: "MINIMAL", nameTr: "Sade", nameEn: "Minimal" },
      { key: "EDITORIAL", nameTr: "Editoryal", nameEn: "Editorial" },
      { key: "DENSE", nameTr: "Yoğun", nameEn: "Dense" },
    ],
    boundary: "client",
    dataSource: "StorefrontProductSummary / SearchListingCard",
  },
  {
    key: "productDetailLayout",
    nameTr: "Ürün Detay Düzeni",
    nameEn: "Product Detail Layout",
    variants: ["standard", "gallery-left", "editorial", "STANDARD", "GALLERY_FIRST", "EDITORIAL"],
    defaultVariant: "standard",
    builderVariants: [
      { key: "STANDARD", nameTr: "Standart", nameEn: "Standard" },
      { key: "GALLERY_FIRST", nameTr: "Galeri Önce", nameEn: "Gallery First" },
      { key: "EDITORIAL", nameTr: "Editoryal", nameEn: "Editorial" },
    ],
    boundary: "server",
    dataSource: "StorefrontProductDetail",
  },
  {
    key: "productListingLayout",
    nameTr: "Ürün Liste Düzeni",
    nameEn: "Product Listing Layout",
    variants: ["standard", "dense", "STANDARD_GRID", "EDITORIAL_GRID", "DENSE_CATALOG"],
    defaultVariant: "standard",
    builderVariants: [
      { key: "STANDARD_GRID", nameTr: "Standart Izgara", nameEn: "Standard Grid" },
      { key: "EDITORIAL_GRID", nameTr: "Editoryal Izgara", nameEn: "Editorial Grid" },
      { key: "DENSE_CATALOG", nameTr: "Yoğun Katalog", nameEn: "Dense Catalog" },
    ],
    boundary: "server",
    dataSource: "search read-model",
  },
  {
    key: "hero",
    nameTr: "Hero",
    nameEn: "Hero",
    variants: ["full", "editorial", "split", "FULL_WIDTH", "SPLIT_CONTENT", "EDITORIAL_OVERLAY"],
    defaultVariant: "full",
    builderVariants: [
      { key: "FULL_WIDTH", nameTr: "Tam Genişlik", nameEn: "Full Width" },
      { key: "SPLIT_CONTENT", nameTr: "Bölünmüş İçerik", nameEn: "Split Content" },
      { key: "EDITORIAL_OVERLAY", nameTr: "Editoryal Overlay", nameEn: "Editorial Overlay" },
    ],
    boundary: "client",
    dataSource: "StorefrontHomeHeroSlide[]",
  },
  {
    key: "homeSectionFrame",
    nameTr: "Ana Sayfa Bölüm Çerçevesi",
    nameEn: "Home Section Frame",
    variants: ["standard", "boxed", "STANDARD", "FULL_BLEED", "EDITORIAL", "COMPACT"],
    defaultVariant: "standard",
    builderVariants: [
      { key: "STANDARD", nameTr: "Standart", nameEn: "Standard" },
      { key: "FULL_BLEED", nameTr: "Tam Taşma", nameEn: "Full Bleed" },
      { key: "EDITORIAL", nameTr: "Editoryal", nameEn: "Editorial" },
      { key: "COMPACT", nameTr: "Kompakt", nameEn: "Compact" },
    ],
    boundary: "server",
    dataSource: "StorefrontHomeSection[]",
  },
];

const SLOT_BY_KEY: ReadonlyMap<ThemeSlotKey, ThemeSlotDefinition> = new Map(
  THEME_SLOT_REGISTRY.map((s) => [s.key, s]),
);

export function isThemeSlotKey(value: unknown): value is ThemeSlotKey {
  return typeof value === "string" && SLOT_BY_KEY.has(value as ThemeSlotKey);
}

export function getSlotDefinition(key: ThemeSlotKey): ThemeSlotDefinition {
  const def = SLOT_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown theme slot: ${key}`);
  return def;
}

export function listThemeSlotKeys(): ThemeSlotKey[] {
  return THEME_SLOT_REGISTRY.map((s) => s.key);
}

/** Bir slot için variant izinli mi? Bilinmeyen slot/variant → false (fail-closed). */
export function isValidSlotVariant(slot: string, variant: string): boolean {
  if (!isThemeSlotKey(slot)) return false;
  return getSlotDefinition(slot).variants.includes(variant);
}

/** Bir slot için variant döndürür; geçersizse defaultVariant'a düşer (render-safe). */
export function resolveSlotVariant(slot: ThemeSlotKey, variant: string | undefined): string {
  const def = getSlotDefinition(slot);
  if (variant && def.variants.includes(variant)) return variant;
  return def.defaultVariant;
}

/**
 * Tam slot→variant haritası (tüm slotlar için defaultVariant). BASE_COMMERCE
 * çözümü ve storefront fallback bunu kullanır → hiçbir slot boş kalmaz.
 */
export function defaultSlotSelections(): Record<ThemeSlotKey, string> {
  const out = {} as Record<ThemeSlotKey, string>;
  for (const s of THEME_SLOT_REGISTRY) out[s.key] = s.defaultVariant;
  return out;
}

/**
 * Kısmi bir slot seçimini TAM ve GÜVENLİ bir haritaya normalize eder: bilinen +
 * izinli variant'lar korunur, gerisi defaultVariant'a düşer. Bilinmeyen slot
 * anahtarları ATILIR (allowlist). Sonuç render-safe (her slot dolu).
 */
export function normalizeSlotSelections(
  input: Partial<Record<string, string>> | undefined,
): Record<ThemeSlotKey, string> {
  const out = defaultSlotSelections();
  if (!input) return out;
  for (const [slot, variant] of Object.entries(input)) {
    if (!isThemeSlotKey(slot)) continue;
    if (typeof variant === "string" && isValidSlotVariant(slot, variant)) {
      out[slot] = variant;
    }
  }
  return out;
}

/** Slot seçimi şeması (record<slot, string>) — config doğrulaması için. */
export const slotSelectionSchema = z.record(themeSlotKeySchema, z.string());

/**
 * Builder UI menüsü: her slot + sunulan adlandırılmış variant'lar (+ default).
 * Güvenlik `variants` allowlist'iyle sağlanır; bu yalnız sunum içindir.
 */
export interface SlotBuilderMenuEntry {
  key: ThemeSlotKey;
  nameTr: string;
  nameEn: string;
  defaultVariant: string;
  boundary: SlotBoundary;
  variants: readonly SlotBuilderVariant[];
}

export function listSlotBuilderMenu(): SlotBuilderMenuEntry[] {
  return THEME_SLOT_REGISTRY.map((s) => ({
    key: s.key,
    nameTr: s.nameTr,
    nameEn: s.nameEn,
    defaultVariant: s.defaultVariant,
    boundary: s.boundary,
    variants: s.builderVariants,
  }));
}

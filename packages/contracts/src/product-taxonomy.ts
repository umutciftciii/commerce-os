// TODO-165A (ADR-165A) — Product Data Governance: typed Product Taxonomy registry.
//
// Governed urun taksonomisi (Sezon/Koleksiyon/Malzeme/Kalip/Desen/Yaka/Kol/Boy/Bakim/
// Surdurulebilirlik/Renk Ailesi) TEK OTORITESI. Her tip, mevcut fashion attribute
// katalogundaki (`apps/api-gateway/src/fashion/canonical-attributes.ts`) bir
// `fashion.*` AttributeDefinition kodunu "destekler" — YENI paralel bir attribute
// motoru KURULMAZ; bu registry yalniz o kataloğun governance/merchandising sunum
// katmanidir (ProductTaxonomyValue her zaman tek bir AttributeOption'a baglanir).
//
// Kanonik varsayilan degerler `canonical-attributes.ts` icindeki secenek listeleriyle
// BIREBIR (deger/etiket) eslesir — seed + provisioning ayni sozlugu konusur. `COLLECTION`
// gibi sabit secenegi olmayan tipler icin kucuk, ornek bir TR set kullanilir.
//
// SAF: DB/IO yok, zod yok (client-safe; `@commerce-os/contracts/product-taxonomy`
// altpath'i ile client component'ler zod sizmadan tuketebilir). Deterministik.

/** Governed taksonomi TIP'leri (Prisma `ProductTaxonomyType` enum'uyla birebir). */
export type ProductTaxonomyType =
  | "SEASON"
  | "COLLECTION"
  | "MATERIAL"
  | "FIT"
  | "PATTERN"
  | "COLLAR"
  | "SLEEVE"
  | "LENGTH"
  | "CARE_LABEL"
  | "SUSTAINABILITY_LABEL"
  | "COLOR_FAMILY";

/** Governed taksonomi degeri yasam durumu (Prisma `ProductTaxonomyStatus` ile birebir). */
export type ProductTaxonomyStatus = "ACTIVE" | "ARCHIVED";

/** Ordered liste (tek otorite) — zod enum'lar ve UI secim listeleri buradan turer. */
export const PRODUCT_TAXONOMY_STATUSES: ProductTaxonomyStatus[] = ["ACTIVE", "ARCHIVED"];

/** Bagli AttributeOption'in secim davranisi (SELECT=tekli, MULTI_SELECT=coklu). */
export type ProductTaxonomySelectionMode = "SELECT" | "MULTI_SELECT";

export interface ProductTaxonomyCanonicalValue {
  /** Kullaniciya gosterilen etiket (TR). */
  name: string;
  /** Store icinde tekil, degismez anahtar (bkz. `ProductTaxonomyValue.slug`). */
  slug: string;
}

export interface ProductTaxonomyTypeDef {
  /** Desteklenen `fashion.*` AttributeDefinition kodu (canonical-attributes.ts). */
  definitionCode: string;
  labelTr: string;
  labelEn: string;
  selectionMode: ProductTaxonomySelectionMode;
  /** Bootstrap/seed icin kucuk kanonik varsayilan deger seti (bos degil). */
  canonical: ProductTaxonomyCanonicalValue[];
}

/**
 * Her taksonomi tipinin bagli `fashion.*` kodu + kanonik varsayilanlari. Deger/etiket
 * ciftleri `apps/api-gateway/src/fashion/canonical-attributes.ts` ile birebir alinmistir
 * (SEASON/MATERIAL/FIT/PATTERN/COLLAR/SLEEVE/LENGTH/CARE_LABEL/SUSTAINABILITY_LABEL/
 * COLOR_FAMILY); yalniz COLLECTION'un o katalogda sabit secenegi olmadigindan kucuk,
 * ornek bir set kullanilir.
 */
export const TAXONOMY_TYPE_REGISTRY: Record<ProductTaxonomyType, ProductTaxonomyTypeDef> = {
  SEASON: {
    definitionCode: "fashion.season",
    labelTr: "Sezon",
    labelEn: "Season",
    selectionMode: "SELECT",
    canonical: [
      { name: "İlkbahar/Yaz", slug: "ss" },
      { name: "Sonbahar/Kış", slug: "fw" },
      { name: "Dört Mevsim", slug: "all-season" },
    ],
  },
  COLLECTION: {
    definitionCode: "fashion.collection",
    labelTr: "Koleksiyon",
    labelEn: "Collection",
    selectionMode: "SELECT",
    // canonical-attributes.ts bu kod icin sabit secenek tasimaz (mağaza-ozel serbest
    // deger); kucuk, ornek bir baslangic seti.
    canonical: [
      { name: "İlkbahar/Yaz 2025", slug: "ss25" },
      { name: "Sonbahar/Kış 2025", slug: "fw25" },
    ],
  },
  MATERIAL: {
    definitionCode: "fashion.material",
    labelTr: "Materyal / Kompozisyon",
    labelEn: "Material",
    selectionMode: "MULTI_SELECT",
    canonical: [
      { name: "Pamuk", slug: "cotton" },
      { name: "Polyester", slug: "polyester" },
      { name: "Yün", slug: "wool" },
      { name: "Keten", slug: "linen" },
      { name: "Viskon", slug: "viscose" },
      { name: "Elastan", slug: "elastane" },
      { name: "Deri", slug: "leather" },
      { name: "Denim", slug: "denim" },
      { name: "İpek", slug: "silk" },
    ],
  },
  FIT: {
    definitionCode: "fashion.fit",
    labelTr: "Kalıp / Fit",
    labelEn: "Fit",
    selectionMode: "SELECT",
    canonical: [
      { name: "Dar Kalıp", slug: "slim" },
      { name: "Regular", slug: "regular" },
      { name: "Relaxed", slug: "relaxed" },
      { name: "Oversize", slug: "oversize" },
      { name: "Skinny", slug: "skinny" },
      { name: "Straight", slug: "straight" },
    ],
  },
  PATTERN: {
    definitionCode: "fashion.pattern",
    labelTr: "Desen",
    labelEn: "Pattern",
    selectionMode: "SELECT",
    canonical: [
      { name: "Düz", slug: "solid" },
      { name: "Çizgili", slug: "striped" },
      { name: "Ekose", slug: "checked" },
      { name: "Çiçekli", slug: "floral" },
      { name: "Baskılı", slug: "printed" },
      { name: "Puantiyeli", slug: "polka-dot" },
    ],
  },
  COLLAR: {
    definitionCode: "fashion.collar_type",
    labelTr: "Yaka Tipi",
    labelEn: "Collar type",
    selectionMode: "SELECT",
    canonical: [
      { name: "Bisiklet Yaka", slug: "crew" },
      { name: "V Yaka", slug: "v-neck" },
      { name: "Polo Yaka", slug: "polo" },
      { name: "Gömlek Yaka", slug: "shirt" },
      { name: "Balıkçı Yaka", slug: "turtleneck" },
      { name: "Kapüşonlu", slug: "hooded" },
    ],
  },
  SLEEVE: {
    definitionCode: "fashion.sleeve_type",
    labelTr: "Kol Tipi",
    labelEn: "Sleeve type",
    selectionMode: "SELECT",
    canonical: [
      { name: "Kısa Kol", slug: "short" },
      { name: "Uzun Kol", slug: "long" },
      { name: "Kolsuz", slug: "sleeveless" },
      { name: "Truvakar", slug: "three-quarter" },
    ],
  },
  LENGTH: {
    definitionCode: "fashion.length",
    labelTr: "Boy",
    labelEn: "Length",
    selectionMode: "SELECT",
    canonical: [
      { name: "Mini", slug: "mini" },
      { name: "Midi", slug: "midi" },
      { name: "Maksi", slug: "maxi" },
      { name: "Crop", slug: "crop" },
      { name: "Standart", slug: "standard" },
    ],
  },
  CARE_LABEL: {
    definitionCode: "fashion.care",
    labelTr: "Bakım Talimatı",
    labelEn: "Care label",
    selectionMode: "MULTI_SELECT",
    canonical: [
      { name: "30°C Makinede Yıkama", slug: "machine-wash-30" },
      { name: "Elde Yıkama", slug: "hand-wash" },
      { name: "Ağartıcı Kullanmayın", slug: "no-bleach" },
      { name: "Düşük Isıda Ütü", slug: "iron-low" },
      { name: "Kuru Temizleme", slug: "dry-clean" },
      { name: "Kurutucu Kullanmayın", slug: "tumble-dry-no" },
    ],
  },
  SUSTAINABILITY_LABEL: {
    definitionCode: "fashion.sustainability",
    labelTr: "Sürdürülebilirlik Etiketleri",
    labelEn: "Sustainability labels",
    selectionMode: "MULTI_SELECT",
    canonical: [
      { name: "Organik Pamuk", slug: "organic-cotton" },
      { name: "Geri Dönüştürülmüş", slug: "recycled" },
      { name: "Vegan", slug: "vegan" },
      { name: "Adil Ticaret", slug: "fair-trade" },
    ],
  },
  COLOR_FAMILY: {
    definitionCode: "fashion.color_family",
    labelTr: "Renk Ailesi",
    labelEn: "Color family",
    selectionMode: "SELECT",
    canonical: [
      { name: "Siyah", slug: "black" },
      { name: "Beyaz", slug: "white" },
      { name: "Gri", slug: "gray" },
      { name: "Kırmızı", slug: "red" },
      { name: "Pembe", slug: "pink" },
      { name: "Turuncu", slug: "orange" },
      { name: "Sarı", slug: "yellow" },
      { name: "Yeşil", slug: "green" },
      { name: "Mavi", slug: "blue" },
      { name: "Mor", slug: "purple" },
      { name: "Kahverengi", slug: "brown" },
      { name: "Bej", slug: "beige" },
      { name: "Lacivert", slug: "navy" },
      { name: "Çok Renkli", slug: "multicolor" },
    ],
  },
};

/** Ordered liste (registry key sirasi ile birebir; UI secim listeleri icin). */
export const PRODUCT_TAXONOMY_TYPES: ProductTaxonomyType[] = [
  "SEASON",
  "COLLECTION",
  "MATERIAL",
  "FIT",
  "PATTERN",
  "COLLAR",
  "SLEEVE",
  "LENGTH",
  "CARE_LABEL",
  "SUSTAINABILITY_LABEL",
  "COLOR_FAMILY",
];

const TAXONOMY_TYPE_SET: ReadonlySet<string> = new Set(PRODUCT_TAXONOMY_TYPES);

export function isProductTaxonomyType(value: unknown): value is ProductTaxonomyType {
  return typeof value === "string" && TAXONOMY_TYPE_SET.has(value);
}

export function getTaxonomyTypeDef(type: ProductTaxonomyType): ProductTaxonomyTypeDef {
  return TAXONOMY_TYPE_REGISTRY[type];
}

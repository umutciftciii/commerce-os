// TODO-165 Fashion Vertical (ADR-247) — CANONICAL FASHION ATTRIBUTE CATALOG.
//
// Moda dikeyinin kanonik attribute sablonu. Mevcut generic EAV motorunu REUSE eder —
// YENI paralel attribute motoru KURULMAZ. Bu katalog, PLATFORM-scoped AttributeDefinition
// + AttributeOption uretiminin ve fashion kategorilerine CategoryAttribute baglamanin TEK
// OTORITESIDIR (provisioning servisi + seed bundan turer).
//
// Alanlar prompt §3 ile birebir. `variantDefining=true` YALNIZ eksen olabilen alanlarda
// (color/size — COLOR/SELECT). Diger varyant-seviyesi alanlar (waist/inseam/cup…) urun
// formunda varyant metni olarak tutulabilir ama eksen degildir (kombinasyon patlamasini
// onlemek + prompt §7 "renk × beden" sozlesmesi icin). MULTI_SELECT eksen OLAMAZ.
//
// SAF veri (IO yok). dataType değerleri AttributeDataType enum'una birebir eslesir.

export type FashionAttrDataType =
  | "TEXT"
  | "TEXTAREA"
  | "INTEGER"
  | "SELECT"
  | "MULTI_SELECT"
  | "COLOR";

export interface FashionAttributeOption {
  value: string; // normalized (unique per attribute)
  label: string; // display (TR)
  colorHex?: string; // yalniz COLOR (#rrggbb)
  /** COLOR opsiyonlari icin normalized renk ailesi (colorFamily eslemesi). */
  colorFamily?: string;
}

export interface FashionAttributeDefinition {
  code: string; // AttributeDefinition.code (PLATFORM scope, storeId=null)
  name: string; // display (TR)
  dataType: FashionAttrDataType;
  unit?: string;
  /** Kategoriye baglandiğinda CategoryAttribute davranis varsayilanlari. */
  behavior: {
    variantDefining: boolean;
    filterable: boolean;
    searchable: boolean;
    comparable: boolean;
    required: boolean;
    visibleOnListing: boolean;
  };
  /** Sabit opsiyon seti (SELECT/MULTI_SELECT/COLOR). Bos = serbest metin/sayi. */
  options?: FashionAttributeOption[];
  /** true ise urun formunun "renk × beden" ekseni adayidir (color/size). */
  isAxisCandidate?: boolean;
}

// ── Renk ailesi (normalized colorFamily) — swatch gruplama ───────────────────
export const COLOR_FAMILIES: readonly { value: string; label: string }[] = [
  { value: "black", label: "Siyah" },
  { value: "white", label: "Beyaz" },
  { value: "gray", label: "Gri" },
  { value: "red", label: "Kırmızı" },
  { value: "pink", label: "Pembe" },
  { value: "orange", label: "Turuncu" },
  { value: "yellow", label: "Sarı" },
  { value: "green", label: "Yeşil" },
  { value: "blue", label: "Mavi" },
  { value: "purple", label: "Mor" },
  { value: "brown", label: "Kahverengi" },
  { value: "beige", label: "Bej" },
  { value: "navy", label: "Lacivert" },
  { value: "multicolor", label: "Çok Renkli" },
] as const;

const COLOR_OPTIONS: FashionAttributeOption[] = [
  { value: "black", label: "Siyah", colorHex: "#111111", colorFamily: "black" },
  { value: "white", label: "Beyaz", colorHex: "#FFFFFF", colorFamily: "white" },
  { value: "gray", label: "Gri", colorHex: "#808080", colorFamily: "gray" },
  { value: "red", label: "Kırmızı", colorHex: "#D32F2F", colorFamily: "red" },
  { value: "pink", label: "Pembe", colorHex: "#E91E8C", colorFamily: "pink" },
  { value: "orange", label: "Turuncu", colorHex: "#F57C00", colorFamily: "orange" },
  { value: "yellow", label: "Sarı", colorHex: "#FBC02D", colorFamily: "yellow" },
  { value: "green", label: "Yeşil", colorHex: "#388E3C", colorFamily: "green" },
  { value: "blue", label: "Mavi", colorHex: "#1976D2", colorFamily: "blue" },
  { value: "navy", label: "Lacivert", colorHex: "#1A237E", colorFamily: "navy" },
  { value: "purple", label: "Mor", colorHex: "#7B1FA2", colorFamily: "purple" },
  { value: "brown", label: "Kahverengi", colorHex: "#5D4037", colorFamily: "brown" },
  { value: "beige", label: "Bej", colorHex: "#D7CCA3", colorFamily: "beige" },
];

function opts(pairs: readonly [string, string][]): FashionAttributeOption[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

const PRODUCT_BEHAVIOR = {
  variantDefining: false,
  filterable: true,
  searchable: false,
  comparable: false,
  required: false,
  visibleOnListing: false,
};

const AXIS_BEHAVIOR = {
  variantDefining: true,
  filterable: true,
  searchable: false,
  comparable: false,
  required: false,
  visibleOnListing: false,
};

// ── Katalog ──────────────────────────────────────────────────────────────────
// Kodlar `fashion.` prefixli — mevcut generic attribute kodlariyla cakismaz (namespace).

export const FASHION_PRODUCT_ATTRIBUTES: readonly FashionAttributeDefinition[] = [
  {
    code: "fashion.gender",
    name: "Cinsiyet / Hedef Kitle",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: true },
    options: opts([
      ["women", "Kadın"],
      ["men", "Erkek"],
      ["unisex", "Unisex"],
      ["girls", "Kız Çocuk"],
      ["boys", "Erkek Çocuk"],
      ["baby", "Bebek"],
    ]),
  },
  {
    code: "fashion.season",
    name: "Sezon",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR },
    options: opts([
      ["ss", "İlkbahar/Yaz"],
      ["fw", "Sonbahar/Kış"],
      ["all-season", "Dört Mevsim"],
    ]),
  },
  { code: "fashion.collection", name: "Koleksiyon", dataType: "SELECT", behavior: { ...PRODUCT_BEHAVIOR } },
  {
    code: "fashion.material",
    name: "Materyal / Kompozisyon",
    dataType: "MULTI_SELECT",
    behavior: { ...PRODUCT_BEHAVIOR },
    options: opts([
      ["cotton", "Pamuk"],
      ["polyester", "Polyester"],
      ["wool", "Yün"],
      ["linen", "Keten"],
      ["viscose", "Viskon"],
      ["elastane", "Elastan"],
      ["leather", "Deri"],
      ["denim", "Denim"],
      ["silk", "İpek"],
    ]),
  },
  {
    code: "fashion.fit",
    name: "Kalıp / Fit",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR },
    options: opts([
      ["slim", "Dar Kalıp"],
      ["regular", "Regular"],
      ["relaxed", "Relaxed"],
      ["oversize", "Oversize"],
      ["skinny", "Skinny"],
      ["straight", "Straight"],
    ]),
  },
  {
    code: "fashion.pattern",
    name: "Desen",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR },
    options: opts([
      ["solid", "Düz"],
      ["striped", "Çizgili"],
      ["checked", "Ekose"],
      ["floral", "Çiçekli"],
      ["printed", "Baskılı"],
      ["polka-dot", "Puantiyeli"],
    ]),
  },
  {
    code: "fashion.collar_type",
    name: "Yaka Tipi",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    options: opts([
      ["crew", "Bisiklet Yaka"],
      ["v-neck", "V Yaka"],
      ["polo", "Polo Yaka"],
      ["shirt", "Gömlek Yaka"],
      ["turtleneck", "Balıkçı Yaka"],
      ["hooded", "Kapüşonlu"],
    ]),
  },
  {
    code: "fashion.sleeve_type",
    name: "Kol Tipi",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    options: opts([
      ["short", "Kısa Kol"],
      ["long", "Uzun Kol"],
      ["sleeveless", "Kolsuz"],
      ["three-quarter", "Truvakar"],
    ]),
  },
  {
    code: "fashion.length",
    name: "Boy",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    options: opts([
      ["mini", "Mini"],
      ["midi", "Midi"],
      ["maxi", "Maksi"],
      ["crop", "Crop"],
      ["standard", "Standart"],
    ]),
  },
  {
    code: "fashion.care",
    name: "Bakım Talimatı",
    dataType: "MULTI_SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    options: opts([
      ["machine-wash-30", "30°C Makinede Yıkama"],
      ["hand-wash", "Elde Yıkama"],
      ["no-bleach", "Ağartıcı Kullanmayın"],
      ["iron-low", "Düşük Isıda Ütü"],
      ["dry-clean", "Kuru Temizleme"],
      ["tumble-dry-no", "Kurutucu Kullanmayın"],
    ]),
  },
  { code: "fashion.origin", name: "Menşei", dataType: "TEXT", behavior: { ...PRODUCT_BEHAVIOR, filterable: false } },
  {
    code: "fashion.sustainability",
    name: "Sürdürülebilirlik Etiketleri",
    dataType: "MULTI_SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    options: opts([
      ["organic-cotton", "Organik Pamuk"],
      ["recycled", "Geri Dönüştürülmüş"],
      ["vegan", "Vegan"],
      ["fair-trade", "Adil Ticaret"],
    ]),
  },
] as const;

export const FASHION_VARIANT_ATTRIBUTES: readonly FashionAttributeDefinition[] = [
  {
    code: "fashion.color",
    name: "Renk",
    dataType: "COLOR",
    behavior: { ...AXIS_BEHAVIOR, filterable: true },
    options: COLOR_OPTIONS,
    isAxisCandidate: true,
  },
  {
    code: "fashion.color_family",
    name: "Renk Ailesi",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: true },
    options: COLOR_FAMILIES.map((c) => ({ value: c.value, label: c.label })),
  },
  {
    // `size` opsiyonlari urunun beden sistemine gore RUNTIME'da SIZE_SYSTEM_REGISTRY'den
    // uretilir; burada bos birakilir (provisioning secili size-system'e gore doldurur).
    code: "fashion.size",
    name: "Beden",
    dataType: "SELECT",
    behavior: { ...AXIS_BEHAVIOR, filterable: true },
    isAxisCandidate: true,
  },
  {
    code: "fashion.size_system",
    name: "Beden Sistemi",
    dataType: "SELECT",
    behavior: { ...PRODUCT_BEHAVIOR, filterable: false },
    // Opsiyonlar SIZE_SYSTEM_REGISTRY key'leriyle eslesir (provisioning doldurur).
  },
] as const;

export const ALL_FASHION_ATTRIBUTES: readonly FashionAttributeDefinition[] = [
  ...FASHION_PRODUCT_ATTRIBUTES,
  ...FASHION_VARIANT_ATTRIBUTES,
];

/**
 * Katalogda tanimli tum `fashion.*` kod listesi — TODO-165A governance bridge
 * (`apps/api-gateway/src/taxonomy/taxonomy-map.ts`) taksonomi tip registry'sindeki
 * `definitionCode`'larin bu katalogda gercekten var oldugunu dogrulamak icin kullanir.
 */
export const CANONICAL_ATTRIBUTE_CODES: string[] = ALL_FASHION_ATTRIBUTES.map((a) => a.code);

const BY_CODE = new Map(ALL_FASHION_ATTRIBUTES.map((a) => [a.code, a]));

export function isFashionAttributeCode(code: string): boolean {
  return BY_CODE.has(code);
}

export function getFashionAttribute(code: string): FashionAttributeDefinition | undefined {
  return BY_CODE.get(code);
}

/** COLOR opsiyonundan normalized renk ailesini cozer (swatch gruplama / snapshot). */
export function colorFamilyOf(colorValue: string): string | null {
  const color = COLOR_OPTIONS.find((c) => c.value === colorValue);
  return color?.colorFamily ?? null;
}

/** #rrggbb hex swatch dogrulamasi (raw CSS/serbest deger reddedilir — ADR-250). */
export function isValidHexSwatch(value: string): boolean {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

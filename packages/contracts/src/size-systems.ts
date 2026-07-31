// TODO-165 Fashion Vertical (ADR-248) — TYPED SIZE-SYSTEM REGISTRY.
//
// Bu modul, moda dikeyinde beden sistemlerinin TEK OTORITESIDIR. Serbest JSON beden
// listesi KULLANILMAZ (prompt §4). Her sistem: sirali degerler (ordered), normalized
// deger (filtre/eslesme anahtari), display label, opsiyonel locale label, olcum birimi
// ve kategori uyumlulugu (category "kind" etiketleri) tasir.
//
// SAF: DB/IO yok, zod yok (client-safe; `@commerce-os/contracts/size-systems` altpath'i
// ile client component'ler zod sizmadan tuketebilir). Deterministik.
//
// Mağaza-ozel olcu tablosu (SizeChart, ADR-249) bu registry'yi EZMEZ — SizeChart olcu
// tablosudur (santim/inch), bu registry ise beden EKSENI degerleridir. `size`/`sizeSystem`
// attribute opsiyonlari bu registry'den dogrulanir.

/** Desteklenen beden sistemleri (uppercase-snake; prompt §4 sozlesmesiyle birebir). */
export type SizeSystemKey =
  | "INTERNATIONAL" // XXS–4XL (alfa)
  | "EU" // Avrupa numarik (konfeksiyon)
  | "US" // ABD numarik (konfeksiyon)
  | "UK" // Birlesik Krallik numarik (konfeksiyon)
  | "TR" // Turkiye numarik (konfeksiyon)
  | "JEANS" // Bel x boy (waist x inseam)
  | "SHOES_EU" // Ayakkabi Avrupa
  | "SHOES_US" // Ayakkabi ABD
  | "SHOES_UK" // Ayakkabi Birlesik Krallik
  | "BRA"; // Sutyen (band + cup)

/** Kategori uyumluluk etiketleri — bir beden sistemi hangi urun tipine uygundur. */
export type SizeCategoryKind =
  | "apparel-top" // ust giyim (tisort, gomlek, ceket…)
  | "apparel-bottom" // alt giyim (pantolon, etek…)
  | "apparel-dress" // elbise / tulum
  | "apparel-outer" // dis giyim (mont, kaban…)
  | "footwear" // ayakkabi
  | "underwear" // ic giyim
  | "bra" // sutyen
  | "general"; // genel (uyum kisiti yok)

export type SizeMeasurementUnit = "CM" | "IN" | "NONE";

export interface SizeSystemValue {
  /** Filtre/eslesme anahtari (buyuk harf, bosluksuz). Ornek: "M", "42", "32X34". */
  normalized: string;
  /** Kullaniciya gosterilen etiket. Ornek: "M", "42", "32/34". */
  displayLabel: string;
  /** Opsiyonel locale etiketleri (yoksa displayLabel kullanilir). */
  localeLabels?: Record<string, string>;
  /** Sirali gosterim icin artan indeks (kucuk = once). */
  order: number;
}

export interface SizeSystemDefinition {
  key: SizeSystemKey;
  labelTr: string;
  labelEn: string;
  measurementUnit: SizeMeasurementUnit;
  /** Bu sistemin uyumlu oldugu kategori kind'leri. Bos = yalniz "general". */
  categoryCompatibility: readonly SizeCategoryKind[];
  /** Sirali kanonik degerler (order artan). */
  values: readonly SizeSystemValue[];
}

// ── Deger uretim yardimcilari (kod-ici; deterministik) ───────────────────────

function alpha(values: readonly [string, string?][]): SizeSystemValue[] {
  return values.map(([normalized, display], i) => ({
    normalized,
    displayLabel: display ?? normalized,
    order: i,
  }));
}

function numeric(list: readonly number[]): SizeSystemValue[] {
  return list.map((n, i) => ({ normalized: String(n), displayLabel: String(n), order: i }));
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const SIZE_SYSTEM_REGISTRY: readonly SizeSystemDefinition[] = [
  {
    key: "INTERNATIONAL",
    labelTr: "Uluslararası (XXS–4XL)",
    labelEn: "International (XXS–4XL)",
    measurementUnit: "NONE",
    categoryCompatibility: ["apparel-top", "apparel-bottom", "apparel-dress", "apparel-outer", "general"],
    values: alpha([
      ["XXS"],
      ["XS"],
      ["S"],
      ["M"],
      ["L"],
      ["XL"],
      ["XXL", "2XL"],
      ["3XL"],
      ["4XL"],
    ]),
  },
  {
    key: "EU",
    labelTr: "Avrupa (Konfeksiyon)",
    labelEn: "EU (Apparel)",
    measurementUnit: "NONE",
    categoryCompatibility: ["apparel-top", "apparel-bottom", "apparel-dress", "apparel-outer", "general"],
    values: numeric([32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52]),
  },
  {
    key: "US",
    labelTr: "ABD (Konfeksiyon)",
    labelEn: "US (Apparel)",
    measurementUnit: "NONE",
    categoryCompatibility: ["apparel-top", "apparel-bottom", "apparel-dress", "apparel-outer", "general"],
    values: numeric([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]),
  },
  {
    key: "UK",
    labelTr: "Birleşik Krallık (Konfeksiyon)",
    labelEn: "UK (Apparel)",
    measurementUnit: "NONE",
    categoryCompatibility: ["apparel-top", "apparel-bottom", "apparel-dress", "apparel-outer", "general"],
    values: numeric([4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]),
  },
  {
    key: "TR",
    labelTr: "Türkiye (Konfeksiyon)",
    labelEn: "TR (Apparel)",
    measurementUnit: "NONE",
    categoryCompatibility: ["apparel-top", "apparel-bottom", "apparel-dress", "apparel-outer", "general"],
    values: numeric([34, 36, 38, 40, 42, 44, 46, 48, 50, 52]),
  },
  {
    key: "JEANS",
    labelTr: "Kot (Bel × Boy)",
    labelEn: "Jeans (Waist × Inseam)",
    measurementUnit: "IN",
    categoryCompatibility: ["apparel-bottom", "general"],
    // Yaygin bel (28–38) × boy (30/32/34) kombinasyonlari.
    values: (() => {
      const waists = [28, 29, 30, 31, 32, 33, 34, 36, 38];
      const inseams = [30, 32, 34];
      const out: SizeSystemValue[] = [];
      let order = 0;
      for (const w of waists) {
        for (const ins of inseams) {
          out.push({
            normalized: `${w}X${ins}`,
            displayLabel: `${w}/${ins}`,
            order: order++,
          });
        }
      }
      return out;
    })(),
  },
  {
    key: "SHOES_EU",
    labelTr: "Ayakkabı (Avrupa)",
    labelEn: "Shoes (EU)",
    measurementUnit: "NONE",
    categoryCompatibility: ["footwear"],
    values: numeric([35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]),
  },
  {
    key: "SHOES_US",
    labelTr: "Ayakkabı (ABD)",
    labelEn: "Shoes (US)",
    measurementUnit: "NONE",
    categoryCompatibility: ["footwear"],
    values: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12].map((n, i) => ({
      normalized: String(n).replace(".", "_"),
      displayLabel: String(n),
      order: i,
    })),
  },
  {
    key: "SHOES_UK",
    labelTr: "Ayakkabı (Birleşik Krallık)",
    labelEn: "Shoes (UK)",
    measurementUnit: "NONE",
    categoryCompatibility: ["footwear"],
    values: [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10, 11].map((n, i) => ({
      normalized: String(n).replace(".", "_"),
      displayLabel: String(n),
      order: i,
    })),
  },
  {
    key: "BRA",
    labelTr: "Sütyen (Band + Cup)",
    labelEn: "Bra (Band + Cup)",
    measurementUnit: "NONE",
    categoryCompatibility: ["bra", "underwear"],
    values: (() => {
      const bands = [70, 75, 80, 85, 90, 95, 100];
      const cups = ["A", "B", "C", "D", "E", "F"];
      const out: SizeSystemValue[] = [];
      let order = 0;
      for (const band of bands) {
        for (const cup of cups) {
          out.push({ normalized: `${band}${cup}`, displayLabel: `${band}${cup}`, order: order++ });
        }
      }
      return out;
    })(),
  },
] as const;

const REGISTRY_BY_KEY: ReadonlyMap<SizeSystemKey, SizeSystemDefinition> = new Map(
  SIZE_SYSTEM_REGISTRY.map((s) => [s.key, s]),
);

// ── Sorgu / dogrulama API'si (SAF) ───────────────────────────────────────────

export function isSizeSystemKey(value: unknown): value is SizeSystemKey {
  return typeof value === "string" && REGISTRY_BY_KEY.has(value as SizeSystemKey);
}

export function getSizeSystem(key: SizeSystemKey): SizeSystemDefinition {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown size system key: ${key}`);
  return def;
}

export function listSizeSystemKeys(): SizeSystemKey[] {
  return SIZE_SYSTEM_REGISTRY.map((s) => s.key);
}

/** Sirali kanonik degerler (order artan). Bilinmeyen key → bos dizi. */
export function orderedValues(key: SizeSystemKey): readonly SizeSystemValue[] {
  return REGISTRY_BY_KEY.get(key)?.values ?? [];
}

/**
 * Serbest girisi bu sistemin bir normalized degerine cozer (case/bosluk/ayraç toleransli).
 * Bulamazsa null. Ornek: normalizeSizeValue("SHOES_EU","42") → "42";
 * normalizeSizeValue("JEANS","32/34") → "32X34"; normalizeSizeValue("INTERNATIONAL"," m ") → "M".
 */
export function normalizeSizeValue(key: SizeSystemKey, input: string): string | null {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def || typeof input !== "string") return null;
  const cleaned = input.trim().toUpperCase().replace(/[\s./]+/g, "X").replace(/X+/g, "X");
  // 1) Dogrudan normalized eslesme.
  for (const v of def.values) {
    if (v.normalized === cleaned) return v.normalized;
  }
  // 2) Ayraçsiz/nokta-alt-cizgi toleransi (ayakkabi 8_5 vs 8.5 vb.).
  const alt = input.trim().toUpperCase().replace(/[\s]/g, "").replace(/[./]/g, "_");
  for (const v of def.values) {
    if (v.normalized === alt || v.displayLabel.toUpperCase() === input.trim().toUpperCase()) {
      return v.normalized;
    }
  }
  return null;
}

/** Bir sistemde normalized degerin gecerli olup olmadigi. */
export function isValidSizeValue(key: SizeSystemKey, normalized: string): boolean {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) return false;
  return def.values.some((v) => v.normalized === normalized);
}

/** Locale etiketi; yoksa displayLabel; deger yoksa null. */
export function localeLabel(key: SizeSystemKey, normalized: string, locale: string): string | null {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) return null;
  const v = def.values.find((x) => x.normalized === normalized);
  if (!v) return null;
  return v.localeLabels?.[locale] ?? v.displayLabel;
}

/** Bir beden sistemi verilen kategori kind'iyle uyumlu mu. */
export function isCompatibleWithCategory(key: SizeSystemKey, kind: SizeCategoryKind): boolean {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) return false;
  if (kind === "general") return true;
  return def.categoryCompatibility.includes(kind);
}

/** Verilen kategori kind'iyle uyumlu tum beden sistemleri. */
export function sizeSystemsForCategory(kind: SizeCategoryKind): SizeSystemKey[] {
  return SIZE_SYSTEM_REGISTRY.filter((s) => isCompatibleWithCategory(s.key, kind)).map((s) => s.key);
}

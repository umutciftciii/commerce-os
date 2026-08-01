/**
 * TODO-156C (ANALIZ-156A §6-§7) — Facet SUNUM modeli (SAF; React importu YOK).
 *
 * İki katmanlı anahtar: BİRİNCİL `selectionMode` (davranış: MULTI/RANGE/BOOLEAN), İKİNCİL `dataType`
 * (sunum: COLOR → swatch, DATE → tarih aralığı). `resolveFacetKind` bu iki alanı TEK render-türü stringine
 * indirir; renderer registry bu stringe göre component seçer (switch-case dağınıklığı YOK; yeni tip → tek satır).
 * Bilinmeyen `dataType`/`selectionMode` → "checkbox" fallback (asla patlamaz).
 *
 * `deriveActiveChips` aktif filtre çiplerini YALNIZCA URL state'ten türetir (facet meta yalnız ETİKET için);
 * her çip tekil kaldırma href'i taşır (buildSearchHref + saf mutasyon). Yerel filtre kopyası YOKTUR.
 */
import type { PublicSearchFacet } from "@commerce-os/api-client";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { formatMinor } from "../money";
import {
  buildSearchHref,
  removeFilter,
  removeFilterValue,
  toggleFilterValue,
  withBrand,
  withCategory,
  withInStock,
  withPrice,
  withQuery,
  type SearchState,
} from "./url-state";

/** Registry anahtarı: facet'in görsel render türü (selectionMode + dataType/code'dan türetilir). */
export type FacetKind = "checkbox" | "color" | "size" | "boolean" | "range" | "date";

/**
 * TODO-165A (ADR-165A) Task 21 — Sentezlenmiş marka facet'inin (Task 11) SABİT kodu.
 *
 * `category` gibi marka da DEDICATED bir `SearchState.brand` alanıdır (attribute filtre sistemine
 * GİRMEZ — bkz. url-state.ts). Ancak `category`'den farklı olarak marka backend `facets` dizisinde
 * SIRADAN bir MULTI facet gibi GÖRÜNÜR (search-query.ts `synthesizeBrandFacet`) çünkü checkbox listesi
 * + disjunctive count sunumunu paylaşır. Bu sabit, o iki dünyayı (dedicated alan ↔ jenerik facet UI)
 * TEK yerde dikiyor: `facetActiveCount`, `deriveActiveChips` ve renderer (`facet-value-list.tsx`) BUNU
 * kullanır — literal "brand" karşılaştırması dağılmaz.
 */
export const BRAND_FACET_CODE = "brand";

/**
 * (selectionMode, dataType, code) → tek render-türü. Backend kontratı:
 *  - RANGE + DATE → "date"; diğer RANGE → "range"
 *  - BOOLEAN → "boolean"
 *  - MULTI + COLOR → "color"; MULTI + (COLOR değil) + code "size" içerir → "size"; diğer MULTI → "checkbox"
 * Bilinmeyen kombinasyon → "checkbox" (güvenli varsayılan). Yeni bir attribute tipi eklenince YALNIZ burası + registry.
 *
 * TODO-165 Fashion Vertical — "size" dalı: MULTI beden facet'i (kodu "size" içeren, renk OLMAYAN) sıralı
 * buton-ızgarası olarak render edilir (checkbox semantiği korunur; URL codec değişmez). Renk dalı el değmez.
 */
export function resolveFacetKind(
  facet: Pick<PublicSearchFacet, "selectionMode" | "dataType" | "code">,
): FacetKind {
  switch (facet.selectionMode) {
    case "RANGE":
      return facet.dataType === "DATE" ? "date" : "range";
    case "BOOLEAN":
      return "boolean";
    case "MULTI":
      if (facet.dataType === "COLOR") return "color";
      if (/size/i.test(facet.code)) return "size";
      return "checkbox";
    default:
      return "checkbox";
  }
}

/** Bir facet'te URL'de kaç aktif seçim var (rail başlık rozeti). Marka: DEDICATED `state.brand`'den. */
export function facetActiveCount(facet: PublicSearchFacet, state: SearchState): number {
  if (facet.code === BRAND_FACET_CODE) return state.brand !== null ? 1 : 0;
  const filter = state.filters[facet.code];
  if (!filter) return 0;
  if (filter.kind === "values") return filter.values.length;
  // range: min ve/veya max sayılır (tek daralma = 1).
  return filter.min !== null || filter.max !== null ? 1 : 0;
}

/**
 * Bir MULTI/BOOLEAN facet DEĞERİNE tıklanınca sıradaki `SearchState` (kod-duyarlı yazma hedefi).
 * `code === "brand"` → DEDICATED `withBrand` (tek seçim: zaten seçiliyse temizler, değilse değeri set
 * eder — `category` ile aynı desen). Diğer TÜM kodlar jenerik `toggleFilterValue` (filter[code], çoklu
 * OR seçim) ile devam eder. `facet-value-list.tsx` YALNIZ bu fonksiyonu çağırır: write-target ayrımı
 * burada MERKEZİLEŞİR (renderer'da literal "brand" karşılaştırması YOK).
 */
export function nextStateForFacetValueToggle(
  facet: Pick<PublicSearchFacet, "code">,
  state: SearchState,
  value: string,
  selected: boolean,
): SearchState {
  if (facet.code === BRAND_FACET_CODE) {
    return withBrand(state, selected ? null : value);
  }
  return toggleFilterValue(state, facet.code, value);
}

/** Bir facet URL'de herhangi bir daralma taşıyor mu (kesin bilinen aktif). */
export function isFacetActive(facet: PublicSearchFacet, state: SearchState): boolean {
  return facetActiveCount(facet, state) > 0;
}

/** Toplam aktif daralma sayısı (drawer tetikleyici "Filtrele (n)" + toolbar rozeti). */
export function countActiveFilters(state: SearchState): number {
  let n = 0;
  if (state.q !== null) n += 1;
  if (state.category !== null) n += 1;
  if (state.brand !== null) n += 1;
  if (state.minPrice !== null || state.maxPrice !== null) n += 1;
  if (state.inStock) n += 1;
  for (const [code, filter] of Object.entries(state.filters)) {
    // Marka DEDICATED alanla yukarıda sayıldı; olası stale `filter[brand]=` çift saymaz (tek kaynak).
    if (code === BRAND_FACET_CODE) continue;
    if (filter.kind === "values") n += filter.values.length;
    else if (filter.min !== null || filter.max !== null) n += 1;
  }
  return n;
}

// ── Aktif filtre çipleri ─────────────────────────────────────────────────────

/** Grid üstünde tek bir aktif filtre çipi (URL'den türetilir; tekil kaldırma). */
export interface ActiveFilterChip {
  /** Stabil React key. */
  id: string;
  /** Facet/grup adı (ör. "Renk", "Fiyat"); jenerik gruplarda t'den. */
  groupLabel: string;
  /** Görünen değer etiketi (ör. "Siyah", "100 ₺ – 500 ₺"). */
  valueLabel: string;
  /** aria-label: "{group}: {value} filtresini kaldır". */
  removeLabel: string;
  /** Bu çip kaldırılınca gidilecek kanonik href. */
  removeHref: string;
}

/** Epoch-ms → UTC gün (deterministik; tz'den bağımsız — DATE aralığı çipi/etiketi). */
function formatEpochDay(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bir range'in "min – max" etiketini biçimler (fiyat=currency; DATE=gün; diğer=sayı + unit). */
function rangeLabel(
  min: number | null,
  max: number | null,
  opts: { currency?: string; date?: boolean; unit?: string | null; dash: string; open: string },
): string {
  const fmt = (n: number): string => {
    if (opts.currency) return formatMinor(n, opts.currency);
    if (opts.date) return formatEpochDay(n);
    return opts.unit ? `${n} ${opts.unit}` : String(n);
  };
  const lo = min !== null ? fmt(min) : opts.open;
  const hi = max !== null ? fmt(max) : opts.open;
  return `${lo} ${opts.dash} ${hi}`;
}

/**
 * URL state → aktif filtre çipleri (sırayla: arama → kategori → marka → fiyat → stok → dinamik facet'ler).
 * `facets` YALNIZCA etiket zenginleştirmesi için (stale değer facet'te yoksa ham value gösterilir).
 * Her çipin removeHref'i saf mutasyon + buildSearchHref ile üretilir (kanonik; deep-link güvenli).
 */
export function deriveActiveChips(
  state: SearchState,
  facets: PublicSearchFacet[],
  opts: {
    t: StorefrontDictionary;
    currency: string;
    /**
     * TODO-165A (ADR-165A) Task 20 fix — Kaldırma href'lerinin kaldığı ROUTE. Verilmezse `buildSearchHref`
     * varsayılanına (`/products`) düşer (geriye-uyumlu); `/markalar/[slug]`'ta çağıran `usePathname()`'i geçer
     * → çip kaldırma marka sayfasında KALIR (bkz. components/search/search-transition.tsx).
     */
    basePath?: string;
  },
): ActiveFilterChip[] {
  const s = opts.t.search;
  const chips: ActiveFilterChip[] = [];
  const facetByCode = new Map(facets.map((f) => [f.code, f]));
  const dash = s.rangeSeparator;
  const open = s.rangeOpen;

  // Arama terimi
  if (state.q !== null) {
    chips.push({
      id: "q",
      groupLabel: s.chipSearchLabel,
      valueLabel: state.q,
      removeLabel: format(s.chipRemoveLabel, { group: s.chipSearchLabel, value: state.q }),
      removeHref: buildSearchHref(withQuery(state, null), opts.basePath),
    });
  }

  // Kategori
  if (state.category !== null) {
    chips.push({
      id: "category",
      groupLabel: s.chipCategoryLabel,
      valueLabel: state.category,
      removeLabel: format(s.chipRemoveLabel, { group: s.chipCategoryLabel, value: state.category }),
      removeHref: buildSearchHref(withCategory(state, null), opts.basePath),
    });
  }

  // Marka (dedicated `state.brand`; category ile aynı desen — Task 21/ADR-165A).
  // Etiket: sentezlenmiş marka facet'inin değer listesinden (varsa) çözülür; facet henüz yoksa (ör.
  // marka sayfasından gelen deep-link'te facet response'u henüz gelmemişse) ham slug'a düşer.
  if (state.brand !== null) {
    const brandFacet = facetByCode.get(BRAND_FACET_CODE);
    const valueLabel = brandFacet?.values.find((v) => v.value === state.brand)?.label ?? state.brand;
    chips.push({
      id: "brand",
      groupLabel: s.chipBrandLabel,
      valueLabel,
      removeLabel: format(s.chipRemoveLabel, { group: s.chipBrandLabel, value: valueLabel }),
      removeHref: buildSearchHref(withBrand(state, null), opts.basePath),
    });
  }

  // Fiyat (top-level)
  if (state.minPrice !== null || state.maxPrice !== null) {
    const value = rangeLabel(state.minPrice, state.maxPrice, { currency: opts.currency, dash, open });
    chips.push({
      id: "price",
      groupLabel: s.priceFacetLabel,
      valueLabel: value,
      removeLabel: format(s.chipRemoveLabel, { group: s.priceFacetLabel, value }),
      removeHref: buildSearchHref(withPrice(state, null, null), opts.basePath),
    });
  }

  // Stok (top-level)
  if (state.inStock) {
    chips.push({
      id: "inStock",
      groupLabel: s.stockFacetLabel,
      valueLabel: s.stockInStockOnly,
      removeLabel: format(s.chipRemoveLabel, { group: s.stockFacetLabel, value: s.stockInStockOnly }),
      removeHref: buildSearchHref(withInStock(state, false), opts.basePath),
    });
  }

  // Dinamik facet'ler (facet displayOrder → code sırasıyla; stale kodlar sona, ham gösterilir)
  const codes = Object.keys(state.filters).sort((a, b) => {
    const fa = facetByCode.get(a);
    const fb = facetByCode.get(b);
    const oa = fa ? fa.displayOrder : Number.MAX_SAFE_INTEGER;
    const ob = fb ? fb.displayOrder : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, "tr");
  });

  for (const code of codes) {
    // Marka yukarıda DEDICATED çip olarak eklendi; olası stale `filter[brand]=` bu döngüde asla
    // ikinci/çelişen bir çip üretmez (tek gerçek kaynak = state.brand).
    if (code === BRAND_FACET_CODE) continue;
    const filter = state.filters[code];
    const facet = facetByCode.get(code);
    const groupLabel = facet?.name ?? code;
    if (filter.kind === "values") {
      for (const value of filter.values) {
        // value → label: facet.values içinden eşleştir; yoksa ham value (stale/bilinmeyen).
        const valueLabel = facet?.values.find((v) => v.value === value)?.label ?? value;
        chips.push({
          id: `${code}:${value}`,
          groupLabel,
          valueLabel,
          removeLabel: format(s.chipRemoveLabel, { group: groupLabel, value: valueLabel }),
          removeHref: buildSearchHref(removeFilterValue(state, code, value), opts.basePath),
        });
      }
    } else {
      const isDate = facet?.dataType === "DATE";
      const valueLabel = rangeLabel(filter.min, filter.max, {
        date: isDate,
        unit: facet?.unit ?? null,
        dash,
        open,
      });
      chips.push({
        id: `${code}:range`,
        groupLabel,
        valueLabel,
        removeLabel: format(s.chipRemoveLabel, { group: groupLabel, value: valueLabel }),
        removeHref: buildSearchHref(removeFilter(state, code), opts.basePath),
      });
    }
  }

  return chips;
}

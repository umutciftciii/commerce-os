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
  withCategory,
  withInStock,
  withPrice,
  withQuery,
  type SearchState,
} from "./url-state";

/** Registry anahtarı: facet'in görsel render türü (selectionMode + dataType'tan türetilir). */
export type FacetKind = "checkbox" | "color" | "boolean" | "range" | "date";

/**
 * (selectionMode, dataType) → tek render-türü. Backend kontratı:
 *  - RANGE + DATE → "date"; diğer RANGE → "range"
 *  - BOOLEAN → "boolean"
 *  - MULTI + COLOR → "color"; diğer MULTI → "checkbox"
 * Bilinmeyen kombinasyon → "checkbox" (güvenli varsayılan). Yeni bir attribute tipi eklenince YALNIZ burası + registry.
 */
export function resolveFacetKind(facet: Pick<PublicSearchFacet, "selectionMode" | "dataType">): FacetKind {
  switch (facet.selectionMode) {
    case "RANGE":
      return facet.dataType === "DATE" ? "date" : "range";
    case "BOOLEAN":
      return "boolean";
    case "MULTI":
      return facet.dataType === "COLOR" ? "color" : "checkbox";
    default:
      return "checkbox";
  }
}

/** Bir facet'te URL'de kaç aktif seçim var (rail başlık rozeti). */
export function facetActiveCount(facet: PublicSearchFacet, state: SearchState): number {
  const filter = state.filters[facet.code];
  if (!filter) return 0;
  if (filter.kind === "values") return filter.values.length;
  // range: min ve/veya max sayılır (tek daralma = 1).
  return filter.min !== null || filter.max !== null ? 1 : 0;
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
  if (state.minPrice !== null || state.maxPrice !== null) n += 1;
  if (state.inStock) n += 1;
  for (const filter of Object.values(state.filters)) {
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
 * URL state → aktif filtre çipleri (sırayla: arama → kategori → fiyat → stok → dinamik facet'ler).
 * `facets` YALNIZCA etiket zenginleştirmesi için (stale değer facet'te yoksa ham value gösterilir).
 * Her çipin removeHref'i saf mutasyon + buildSearchHref ile üretilir (kanonik; deep-link güvenli).
 */
export function deriveActiveChips(
  state: SearchState,
  facets: PublicSearchFacet[],
  opts: { t: StorefrontDictionary; currency: string },
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
      removeHref: buildSearchHref(withQuery(state, null)),
    });
  }

  // Kategori
  if (state.category !== null) {
    chips.push({
      id: "category",
      groupLabel: s.chipCategoryLabel,
      valueLabel: state.category,
      removeLabel: format(s.chipRemoveLabel, { group: s.chipCategoryLabel, value: state.category }),
      removeHref: buildSearchHref(withCategory(state, null)),
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
      removeHref: buildSearchHref(withPrice(state, null, null)),
    });
  }

  // Stok (top-level)
  if (state.inStock) {
    chips.push({
      id: "inStock",
      groupLabel: s.stockFacetLabel,
      valueLabel: s.stockInStockOnly,
      removeLabel: format(s.chipRemoveLabel, { group: s.stockFacetLabel, value: s.stockInStockOnly }),
      removeHref: buildSearchHref(withInStock(state, false)),
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
          removeHref: buildSearchHref(removeFilterValue(state, code, value)),
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
        removeHref: buildSearchHref(removeFilter(state, code)),
      });
    }
  }

  return chips;
}

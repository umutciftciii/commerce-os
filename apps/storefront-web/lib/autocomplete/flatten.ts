/**
 * TODO-156E — Autocomplete gruplarını KLAVYE gezinme sırasına düzleştirir (SAF).
 *
 * Panel bu düz listeyi render eder (grup değişince başlık ekler) → DOM sırası ile aktif-indeks BİREBİR
 * eşleşir (aria-activedescendant güvenilir). Sıra: suggestions → products → categories → brands. Her öğe
 * kendi hedef URL'ini taşır (href.ts). id, aria-activedescendant için deterministik + benzersizdir.
 */

import type {
  PublicAutocompleteResponse,
  PublicAutocompleteProduct,
  PublicAutocompleteCategory,
  PublicAutocompleteBrand,
} from "@commerce-os/api-client";
import { brandHref, categoryHref, productHref, suggestionHref } from "./href";

export type AutocompleteAction =
  | { kind: "suggestion"; value: string; href: string }
  | { kind: "product"; product: PublicAutocompleteProduct; href: string }
  | { kind: "category"; category: PublicAutocompleteCategory; href: string }
  | { kind: "brand"; brand: PublicAutocompleteBrand; href: string };

export interface FlatItem {
  /** aria-activedescendant için DOM id (idBase'e göre benzersiz). */
  id: string;
  action: AutocompleteAction;
}

/** Grup sırasına göre düz gezinme listesi (idBase her option id'sinin önekidir). */
export function flattenAutocomplete(data: PublicAutocompleteResponse, idBase: string): FlatItem[] {
  const items: FlatItem[] = [];
  let index = 0;
  const push = (action: AutocompleteAction) => {
    items.push({ id: `${idBase}-opt-${index}`, action });
    index += 1;
  };
  for (const value of data.suggestions) push({ kind: "suggestion", value, href: suggestionHref(value) });
  for (const product of data.products) push({ kind: "product", product, href: productHref(product.slug) });
  for (const category of data.categories) push({ kind: "category", category, href: categoryHref(category.slug) });
  for (const brand of data.brands) push({ kind: "brand", brand, href: brandHref(brand.brand) });
  return items;
}

/** Toplam gezinilebilir öğe sayısı (boş grupları atlar). */
export function countAutocompleteItems(data: PublicAutocompleteResponse): number {
  return data.suggestions.length + data.products.length + data.categories.length + data.brands.length;
}

// ── Popup modeli (TÜM modlar: results / empty / zero) — tek klavye-gezinilebilir liste ──

export type PopupGroupKey =
  | "recent"
  | "popular"
  | "suggestions"
  | "products"
  | "categories"
  | "brands";

export interface PopupOption {
  id: string;
  groupKey: PopupGroupKey;
  action: AutocompleteAction;
}

export type PopupMode = "results" | "empty" | "zero";

export interface BuildPopupInput {
  mode: PopupMode;
  data: PublicAutocompleteResponse | null;
  /** empty modda gösterilen son aramalar (localStorage). */
  recents: string[];
  /** empty/zero modda gösterilen popüler arama placeholder'ları (i18n statik). */
  popular: string[];
  idBase: string;
}

/**
 * Aktif moda göre TEK düz popup option listesi (grup etiketli). Global indeks → aria-activedescendant + ok
 * tuşu gezinmesi TÜM modlarda tutarlı çalışır. Sıra deterministik. SAF.
 */
export function buildPopupOptions(input: BuildPopupInput): PopupOption[] {
  const { mode, data, recents, popular, idBase } = input;
  const options: PopupOption[] = [];
  let index = 0;
  const push = (groupKey: PopupGroupKey, action: AutocompleteAction) => {
    options.push({ id: `${idBase}-opt-${index}`, groupKey, action });
    index += 1;
  };

  if (mode === "empty") {
    for (const value of recents) push("recent", { kind: "suggestion", value, href: suggestionHref(value) });
    for (const value of popular) {
      if (recents.some((r) => r.toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"))) continue;
      push("popular", { kind: "suggestion", value, href: suggestionHref(value) });
    }
    return options;
  }

  if (mode === "zero") {
    for (const value of popular) push("popular", { kind: "suggestion", value, href: suggestionHref(value) });
    return options;
  }

  // results — grup sırası (TODO-156E UX): Öneriler → Kategoriler → Markalar → Ürünler.
  // Yalnız veri OLAN gruplar option üretir (boş başlık render edilmez — panel grup-değişiminde başlık ekler).
  if (data) {
    for (const value of data.suggestions) push("suggestions", { kind: "suggestion", value, href: suggestionHref(value) });
    for (const category of data.categories) push("categories", { kind: "category", category, href: categoryHref(category.slug) });
    for (const brand of data.brands) push("brands", { kind: "brand", brand, href: brandHref(brand.brand) });
    for (const product of data.products) push("products", { kind: "product", product, href: productHref(product.slug) });
  }
  return options;
}

/**
 * Klavye ile bir sonraki aktif indeks (wrap'li). count=0 → -1 (aktif yok). "down" -1'den 0'a; sondan başa
 * sarar. "up" -1/0'dan sona sarar. "home"/"end" uçlara.
 */
export function nextActiveIndex(
  current: number,
  key: "down" | "up" | "home" | "end",
  count: number,
): number {
  if (count <= 0) return -1;
  switch (key) {
    case "down":
      return current < 0 ? 0 : (current + 1) % count;
    case "up":
      return current <= 0 ? count - 1 : current - 1;
    case "home":
      return 0;
    case "end":
      return count - 1;
    default:
      return current;
  }
}

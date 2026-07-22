"use client";

/**
 * TODO-159B (ADR-090) — Katalog seçici kaynakları.
 *
 * Ürün ve kategori seçicilerinin `SelectorSource` + `SelectorPresenter`
 * tanımlarını TEK yerde tutar. Kampanya, Home Showcase, Featured Categories,
 * ürün formu ve ürün filtresi aynı tanımı kullanır — "her modalda başka bir
 * ürün satırı" durumu oluşmaz.
 *
 * `fetchPage` ve `resolveByIds` AYNI uca gider; tek fark `ids` parametresidir
 * (çözüm modu). Bu, seçili kaydın arama sonucunda görünmese bile gösterilmesini
 * sağlayan mekanizmadır.
 */

import { useMemo } from "react";
import type {
  AdminCategorySelectorOption,
  AdminProductSelectorOption,
} from "@commerce-os/api-client";
import { getDictionary, format, type Locale } from "@commerce-os/i18n";
import { Badge } from "../ui";
import { storeApi } from "../../lib/client/api";
import { formatMinor } from "../../lib/client/format";
import type { EntitySelectorLabels, SelectorPresenter } from "./entity-selector";
import type { SelectorSource } from "./use-selector-search";

type StoreAdminDictionary = ReturnType<typeof getDictionary>["storeAdmin"];

/**
 * Ortak seçici etiketlerini (arama/boş/hata/sayfalama) i18n sözlüğünden kurar.
 * Sayfalama etiketleri Data Grid ile PAYLAŞILIR — iki ayrı "Sonraki" metni olmaz.
 */
export function buildSelectorLabels(
  dict: StoreAdminDictionary,
  overrides: {
    searchPlaceholder: string;
    listLabel: string;
  },
): EntitySelectorLabels {
  const s = dict.selector;
  const g = dict.dataGrid;
  return {
    searchLabel: s.searchLabel,
    searchPlaceholder: overrides.searchPlaceholder,
    listLabel: overrides.listLabel,
    loading: s.loading,
    errorTitle: s.errorTitle,
    retry: s.retry,
    emptyTitle: s.emptyTitle,
    emptyDescription: s.emptyDescription,
    emptyFilteredTitle: s.emptyFilteredTitle,
    emptyFilteredDescription: s.emptyFilteredDescription,
    selectedTitle: s.selectedTitle,
    selectedEmpty: s.selectedEmpty,
    selectedCount: s.selectedCount,
    removeSelection: s.removeSelection,
    clearAll: s.clearAll,
    openSelector: s.openSelector,
    close: s.close,
    done: s.done,
    selectOption: s.selectOption,
    deselectOption: s.deselectOption,
    resolving: s.resolving,
    unresolvedNotice: s.unresolvedNotice,
    pagination: {
      rangeLabel: g.rangeLabel,
      rangeEmpty: g.rangeEmpty,
      previousPage: g.previousPage,
      nextPage: g.nextPage,
      pageSizeLabel: g.pageSizeLabel,
      goToPage: g.goToPage,
      pageOf: g.pageOf,
    },
  };
}

const PRODUCT_STATUS_TONES = {
  DRAFT: "warning",
  ACTIVE: "success",
  ARCHIVED: "neutral",
} as const;

export interface ProductSelectorBinding {
  source: SelectorSource<AdminProductSelectorOption>;
  presenter: SelectorPresenter<AdminProductSelectorOption>;
  labels: EntitySelectorLabels;
  title: string;
  description: string;
}

/**
 * Ürün seçici bağlaması. `extraQuery` çağıranın daraltması içindir (örn. yalnız
 * ACTIVE ürünler); arama/sayfalama query'si üzerine EKLENİR.
 */
export function useProductSelectorBinding(
  locale: Locale,
  extraQuery?: Record<string, string | number | undefined>,
): ProductSelectorBinding {
  const dict = getDictionary(locale).storeAdmin;
  const statusLabels = dict.products.statusLabels as Record<string, string>;
  const extraKey = JSON.stringify(extraQuery ?? {});

  return useMemo(() => {
    const extra = JSON.parse(extraKey) as Record<string, string | number | undefined>;
    const p = dict.selector.product;
    return {
      title: p.title,
      description: p.description,
      labels: buildSelectorLabels(dict, {
        searchPlaceholder: p.searchPlaceholder,
        listLabel: p.listLabel,
      }),
      source: {
        keyOf: (item) => item.id,
        fetchPage: async ({ search, page, pageSize }) => {
          const result = await storeApi.listProductSelector({
            ...extra,
            page,
            pageSize,
            search: search || undefined,
          });
          return { data: result.data, pagination: result.pagination };
        },
        // Çözüm modu: `ids` verildiğinde uç arama/sayfalama uygulamaz.
        resolveByIds: async (ids) => {
          const result = await storeApi.listProductSelector({ ids: ids.join(",") });
          return result.data;
        },
      },
      presenter: {
        primaryText: (item) => item.title,
        secondaryText: (item) => {
          const parts: string[] = [];
          if (item.sku) parts.push(item.sku);
          else if (item.variantCount > 1) {
            parts.push(format(p.variantCount, { count: item.variantCount }));
          }
          parts.push(item.slug);
          return parts.join(" · ");
        },
        imageUrl: (item) => item.imageUrl,
        meta: (item) => (
          <>
            <span className="tabular-nums">
              {item.priceMinor !== null && item.currency
                ? formatMinor(item.priceMinor, item.currency)
                : p.noPrice}
            </span>
            <span className="tabular-nums">
              {item.stockAvailable === null || item.stockAvailable <= 0
                ? p.noStock
                : format(p.stock, { count: item.stockAvailable })}
            </span>
            <Badge tone={PRODUCT_STATUS_TONES[item.status]}>
              {statusLabels[item.status] ?? item.status}
            </Badge>
          </>
        ),
      },
    };
    // dict/statusLabels locale'e bağlıdır; extraKey içerikten türetilir.
    // Bağımlılık BİLİNÇLİ olarak içerikten türetilmiş anahtardır (idsKey /
    // extraKey): çağıran her render'da yeni dizi/nesne üretse bile efekt tekrarlanmaz.
  }, [locale, extraKey]);
}

export interface CategorySelectorBinding {
  source: SelectorSource<AdminCategorySelectorOption>;
  presenter: SelectorPresenter<AdminCategorySelectorOption>;
  labels: EntitySelectorLabels;
  title: string;
  description: string;
}

/**
 * Kategori seçici bağlaması. Satırın birincil metni HİYERARŞİ YOLUDUR
 * ("Elektronik / Bilgisayar / Ekran Kartı") — aynı adı taşıyan iki kategori
 * karıştırılmasın diye. Yol sunucuda batched çözülür (ADR-090).
 */
export function useCategorySelectorBinding(
  locale: Locale,
  extraQuery?: Record<string, string | number | undefined>,
): CategorySelectorBinding {
  const dict = getDictionary(locale).storeAdmin;
  const statusLabels = dict.categories.statusLabels as Record<string, string>;
  const extraKey = JSON.stringify(extraQuery ?? {});

  return useMemo(() => {
    const extra = JSON.parse(extraKey) as Record<string, string | number | undefined>;
    const c = dict.selector.category;
    return {
      title: c.title,
      description: c.description,
      labels: buildSelectorLabels(dict, {
        searchPlaceholder: c.searchPlaceholder,
        listLabel: c.listLabel,
      }),
      source: {
        keyOf: (item) => item.id,
        fetchPage: async ({ search, page, pageSize }) => {
          const result = await storeApi.listCategorySelector({
            ...extra,
            page,
            pageSize,
            search: search || undefined,
          });
          return { data: result.data, pagination: result.pagination };
        },
        resolveByIds: async (ids) => {
          const result = await storeApi.listCategorySelector({ ids: ids.join(",") });
          return result.data;
        },
      },
      presenter: {
        primaryText: (item) => item.path.join(" / "),
        secondaryText: (item) => item.slug,
        meta: (item) =>
          item.status === "ACTIVE" ? null : (
            <Badge tone="neutral">{statusLabels[item.status] ?? item.status}</Badge>
          ),
      },
    };
    // Bağımlılık BİLİNÇLİ olarak içerikten türetilmiş anahtardır (idsKey /
    // extraKey): çağıran her render'da yeni dizi/nesne üretse bile efekt tekrarlanmaz.
  }, [locale, extraKey]);
}

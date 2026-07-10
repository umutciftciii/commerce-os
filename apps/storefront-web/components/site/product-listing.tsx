"use client";

import { useMemo, useState } from "react";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontProductSummary } from "../../lib/catalog-types";
import { Button, EmptyState, ProductCard, Select } from "../ui";

/**
 * PLP (Adim 3) liste gorunumu — filtre/siralama araci + responsive grid + filtre
 * bos durumu. Sunucu bileseni (page) tum yayinlanabilir urunleri bir kez ceker;
 * filtreleme/siralama backend query ucu OLMADIGI icin (bkz. todo.md) istemcide,
 * ELDEKI GERCEK veriyle yapilir — sahte sonuc/uydurma alan yoktur:
 *  - Kategori filtresi: urunlerin gercek `categoryLabel` degerlerinden turetilir.
 *  - Fiyat siralamasi: gercek `sortPriceMinor` (en ucuz gorunur varyant) ile;
 *    fiyati gizli/talep olanlar sona duser.
 *  - Isim siralamasi: baslik (tr) locale karsilastirmasi.
 * "Yeni gelenler" siralamasi henuz YOK (DTO'da tarih alani yok — bkz. todo.md).
 */

type SortKey = "featured" | "priceAsc" | "priceDesc" | "nameAsc";

const ALL = "__all__";

function sortProducts(list: StorefrontProductSummary[], sort: SortKey): StorefrontProductSummary[] {
  if (sort === "featured") return list;
  const next = [...list];
  if (sort === "nameAsc") {
    next.sort((a, b) => a.title.localeCompare(b.title, "tr"));
    return next;
  }
  // Fiyat siralamasi: gorunur fiyati olmayanlar (null) daima sona.
  const dir = sort === "priceAsc" ? 1 : -1;
  next.sort((a, b) => {
    const pa = a.sortPriceMinor ?? null;
    const pb = b.sortPriceMinor ?? null;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  });
  return next;
}

export function ProductListingView({
  products,
  t,
}: {
  products: StorefrontProductSummary[];
  t: StorefrontDictionary;
}) {
  const [sort, setSort] = useState<SortKey>("featured");
  const [category, setCategory] = useState<string>(ALL);
  const listing = t.listing;

  // Gercek kategoriler (urun `categoryLabel`'larindan, sirali, tekil).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.categoryLabel) set.add(p.categoryLabel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [products]);

  const visible = useMemo(() => {
    const filtered =
      category === ALL ? products : products.filter((p) => p.categoryLabel === category);
    return sortProducts(filtered, sort);
  }, [products, category, sort]);

  const hasFilter = category !== ALL || sort !== "featured";

  const resetFilters = () => {
    setCategory(ALL);
    setSort("featured");
  };

  return (
    <div>
      {/* Arac cubugu: sonuc sayisi + kategori filtresi + siralama. */}
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs uppercase tracking-wideish text-ink-subtle">
          {format(listing.resultCount, { count: visible.length })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {categories.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="sr-only">{listing.categoryLabel}</span>
              <Select
                aria-label={listing.categoryLabel}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 min-w-[10rem] text-xs"
              >
                <option value={ALL}>{listing.categoryAll}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <span className="sr-only">{listing.sortLabel}</span>
            <Select
              aria-label={listing.sortLabel}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-10 min-w-[10rem] text-xs"
            >
              <option value="featured">{listing.sortFeatured}</option>
              <option value="priceAsc">{listing.sortPriceAsc}</option>
              <option value="priceDesc">{listing.sortPriceDesc}</option>
              <option value="nameAsc">{listing.sortNameAsc}</option>
            </Select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={listing.filterEmptyTitle}
          description={listing.filterEmptyDescription}
          action={
            hasFilter ? (
              <Button variant="secondary" onClick={resetFilters}>
                {listing.filterClear}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:mt-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
          {visible.map((product) => (
            <ProductCard key={product.handle} product={product} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

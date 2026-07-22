"use client";

/**
 * TODO-159A (ADR-089) — Admin Data Grid URL state motoru.
 *
 * TEK doğruluk kaynağı URL'dir: arama, filtreler, sıralama, sayfa ve sayfa boyutu
 * query string'de yaşar. Bileşenler kendi kopyalarını tutmaz — böylece sayfa
 * yenilense, link paylaşılsa veya tarayıcı geri tuşuna basılsa da liste AYNI
 * durumla açılır.
 *
 * İki kural motorun içindedir (her sayfada tekrar yazılmaz):
 *  1. Arama/filtre/sıralama/pageSize değişince `page` 1'e döner (aksi halde
 *     kullanıcı boş bir son sayfada kalır).
 *  2. Varsayılan değerler URL'e YAZILMAZ (temiz link; `?page=1&pageSize=25` gibi
 *     gürültü oluşmaz).
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_LIST_DEFAULT_PAGE_SIZE, ADMIN_LIST_PAGE_SIZE_OPTIONS } from "@commerce-os/api-client";

export interface DataGridQueryState<Filters extends Record<string, string>> {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: Filters;
}

export interface DataGridQueryConfig<Filters extends Record<string, string>> {
  /** Sayfanın URL yolu (query'siz), örn. "/products". */
  basePath: string;
  /** Sıralama allowlist'i — URL'den gelen tanınmayan değer varsayılana düşer. */
  sortOptions: readonly string[];
  defaultSortBy: string;
  defaultSortOrder: "asc" | "desc";
  /** Modüle özel filtre anahtarları (URL'de aynı adla taşınır). */
  filterKeys: readonly (keyof Filters & string)[];
  defaultPageSize?: number;
}

export interface DataGridQuery<Filters extends Record<string, string>>
  extends DataGridQueryState<Filters> {
  /** Etkin (varsayılandan farklı) filtre + arama sayısı — "temizle" görünürlüğü buna bağlıdır. */
  activeFilterCount: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSearch: (search: string) => void;
  setSort: (sortBy: string, sortOrder: "asc" | "desc") => void;
  setFilter: (key: keyof Filters & string, value: string) => void;
  setFilters: (next: Partial<Filters>) => void;
  clearFilters: () => void;
  /** Sunucuya gönderilecek query (boş değerler atlanır). */
  toRequestQuery: () => Record<string, string | number | undefined>;
}

function readNumber(raw: string | null, fallback: number, min: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function useDataGridQuery<Filters extends Record<string, string>>(
  config: DataGridQueryConfig<Filters>,
): DataGridQuery<Filters> {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPageSize = config.defaultPageSize ?? ADMIN_LIST_DEFAULT_PAGE_SIZE;

  // config alanları çağıran tarafta inline tanımlanabilir (her render'da yeni dizi);
  // bu yüzden bağımlılıklar İÇERİKLERİNDEN türetilir, referanslarından değil.
  const sortOptionsKey = config.sortOptions.join(",");
  const filterKeysKey = config.filterKeys.join(",");
  const { basePath, defaultSortBy, defaultSortOrder } = config;

  const state = useMemo<DataGridQueryState<Filters>>(() => {
    const rawPageSize = readNumber(searchParams.get("pageSize"), defaultPageSize, 1);
    // Sayfa boyutu seçeneklerden biri OLMALI: elle düzenlenmiş URL sessizce
    // varsayılana düşer (sunucu üst sınırı ayrıca zorlar).
    const pageSize = (ADMIN_LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : defaultPageSize;
    const rawSortBy = searchParams.get("sortBy");
    const sortBy =
      rawSortBy && sortOptionsKey.split(",").includes(rawSortBy) ? rawSortBy : defaultSortBy;
    const rawSortOrder = searchParams.get("sortOrder");
    const sortOrder =
      rawSortOrder === "asc" || rawSortOrder === "desc" ? rawSortOrder : defaultSortOrder;
    const filters = {} as Filters;
    for (const key of filterKeysKey.split(",")) {
      if (!key) continue;
      (filters as Record<string, string>)[key] = searchParams.get(key) ?? "";
    }
    return {
      page: readNumber(searchParams.get("page"), 1, 1),
      pageSize,
      search: searchParams.get("search") ?? "",
      sortBy,
      sortOrder,
      filters,
    };
  }, [searchParams, defaultPageSize, sortOptionsKey, filterKeysKey, defaultSortBy, defaultSortOrder]);

  /**
   * URL'i tek noktadan yazar. `resetPage` true ise page anahtarı düşürülür —
   * filtre/arama/sıralama değişimlerinin tamamı bu yoldan geçer.
   */
  const push = useCallback(
    (patch: Record<string, string | number | undefined>, resetPage: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (resetPage) params.delete("page");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      const serialized = params.toString();
      router.replace(serialized ? `${basePath}?${serialized}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams],
  );

  const activeFilterCount = useMemo(() => {
    let count = state.search.trim() ? 1 : 0;
    for (const key of filterKeysKey.split(",")) {
      if (key && (state.filters as Record<string, string>)[key]) count += 1;
    }
    return count;
  }, [state, filterKeysKey]);

  const setPage = useCallback(
    (page: number) => push({ page: page <= 1 ? undefined : page }, false),
    [push],
  );

  const setPageSize = useCallback(
    (pageSize: number) => push({ pageSize: pageSize === defaultPageSize ? undefined : pageSize }, true),
    [push, defaultPageSize],
  );

  const setSearch = useCallback(
    (search: string) => push({ search: search.trim() || undefined }, true),
    [push],
  );

  const setSort = useCallback(
    (sortBy: string, sortOrder: "asc" | "desc") =>
      push(
        {
          sortBy: sortBy === defaultSortBy ? undefined : sortBy,
          sortOrder: sortOrder === defaultSortOrder ? undefined : sortOrder,
        },
        true,
      ),
    [push, defaultSortBy, defaultSortOrder],
  );

  const setFilter = useCallback(
    (key: keyof Filters & string, value: string) => push({ [key]: value || undefined }, true),
    [push],
  );

  const setFilters = useCallback(
    (next: Partial<Filters>) => {
      const patch: Record<string, string | undefined> = {};
      for (const key of filterKeysKey.split(",")) {
        // Verilmeyen anahtar KORUNUR; boş string temizler.
        if (key && key in next) {
          patch[key] = ((next as Record<string, string | undefined>)[key] || undefined) as
            | string
            | undefined;
        }
      }
      push(patch, true);
    },
    [push, filterKeysKey],
  );

  const clearFilters = useCallback(() => {
    // Sıralama ve sayfa boyutu KORUNUR: "filtreleri temizle" bir görünüm sıfırlaması
    // değil, daraltmanın kaldırılmasıdır.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    params.delete("page");
    for (const key of filterKeysKey.split(",")) {
      if (key) params.delete(key);
    }
    const serialized = params.toString();
    router.replace(serialized ? `${basePath}?${serialized}` : basePath, { scroll: false });
  }, [basePath, router, searchParams, filterKeysKey]);

  const toRequestQuery = useCallback((): Record<string, string | number | undefined> => {
    const query: Record<string, string | number | undefined> = {
      page: state.page,
      pageSize: state.pageSize,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    };
    if (state.search.trim()) query.search = state.search.trim();
    for (const key of filterKeysKey.split(",")) {
      const value = key ? (state.filters as Record<string, string>)[key] : "";
      if (value) query[key] = value;
    }
    return query;
  }, [state, filterKeysKey]);

  return {
    ...state,
    activeFilterCount,
    setPage,
    setPageSize,
    setSearch,
    setSort,
    setFilter,
    setFilters,
    clearFilters,
    toRequestQuery,
  };
}

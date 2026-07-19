import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { formatMinor } from "../../lib/money";
import {
  buildSearchHref,
  clearedSearchState,
  hasActiveNarrowing,
  type SearchState,
} from "../../lib/search/url-state";

/**
 * TODO-156B (brief §14) — Ayrıştırılmış boş durumlar:
 *  - mağazada ürün yok (fresh + 0)
 *  - arama sonucu yok (q var)
 *  - kategori sonucu yok (category var)
 *  - URL filtreleri sonucu yok (fiyat/stok/dinamik filtre var)
 * Facet UI olmadığı için aktif parametrelerin ÖZETİ + "aramayı/filtreleri temizle" + "tüm ürünler" aksiyonları
 * sunulur. Yanıltıcı ürün önerisi ÜRETİLMEZ (yalnız temiz koleksiyona dönüş).
 */
export function SearchEmpty({
  state,
  currency,
  t,
}: {
  state: SearchState;
  /** Aktif filtre özetinde fiyat biçimi için (mağaza para birimi). */
  currency: string;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const narrowed = hasActiveNarrowing(state);

  // Başlık/açıklama seçimi (önceliği: arama > kategori > filtre > katalog boş).
  let title: string;
  let description: string;
  if (state.q) {
    title = format(s.noResultsTitle, { query: state.q });
    description = s.noResultsDescription;
  } else if (state.category) {
    title = s.categoryEmptyTitle;
    description = s.categoryEmptyDescription;
  } else if (narrowed) {
    title = s.filteredEmptyTitle;
    description = s.filteredEmptyDescription;
  } else {
    title = s.emptyCatalogTitle;
    description = s.emptyCatalogDescription;
  }

  const summary = narrowed ? buildActiveSummary(state, currency, t) : [];
  // Temizleme: q/category/filtre/fiyat/stok düşer, sort/pageSize korunur → /products (temiz).
  const clearHref = buildSearchHref(clearedSearchState(state));

  return (
    <div className="mt-10">
      <EmptyState
        title={title}
        description={description}
        action={
          narrowed ? (
            <ButtonLink href={clearHref} variant="secondary">
              {state.q ? s.clearSearch : s.clearFilters}
            </ButtonLink>
          ) : (
            <ButtonLink href="/products" variant="secondary">
              {s.viewAll}
            </ButtonLink>
          )
        }
      />
      {summary.length > 0 ? (
        <div className="mt-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
            {s.activeFiltersSummary}
          </p>
          <ul className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {summary.map((item) => (
              <li
                key={item}
                className="border border-line px-3 py-1 text-xs text-ink-muted"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Aktif URL parametrelerinin insan-okunur özeti (facet UI yok → sadece bilgilendirme). */
function buildActiveSummary(state: SearchState, currency: string, t: StorefrontDictionary): string[] {
  const s = t.search;
  const items: string[] = [];
  if (state.q) items.push(format(s.searchTitle, { query: state.q }));
  if (state.category) items.push(state.category);
  if (state.minPrice !== null || state.maxPrice !== null) {
    const min = state.minPrice !== null ? formatMinor(state.minPrice, currency) : "…";
    const max = state.maxPrice !== null ? formatMinor(state.maxPrice, currency) : "…";
    items.push(`${min} – ${max}`);
  }
  for (const [code, filter] of Object.entries(state.filters)) {
    if (filter.kind === "values") items.push(`${code}: ${filter.values.join(", ")}`);
    else items.push(`${code}: ${filter.min ?? "…"} – ${filter.max ?? "…"}`);
  }
  return items;
}

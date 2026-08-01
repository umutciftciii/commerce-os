import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicSearchFacet } from "@commerce-os/api-client";

/**
 * TODO-165A (ADR-165A) Task 20 fix (coordinator review, TD-165A.1) — shared PLP search components
 * (`FilterRail`/`ActiveFilterChips`/`SearchPagination`/`SortControl`/facet renderers) used to build every
 * interactive href via `buildSearchHref(state)` with the hardcoded default pathname `/products`. That meant
 * pagination/sort/filter interactions on `/markalar/[slug]` fell through to `/products?brand=slug`, losing
 * the brand page's header/canonical/JSON-LD context. Fix: `useSearchBasePath()` (search-transition.tsx)
 * wraps Next's `usePathname()` so each component builds hrefs against the CURRENT route.
 *
 * This file mocks `next/navigation`'s `usePathname` explicitly (module-scoped mock var) to prove both
 * routes behave correctly: `/products` keeps building `/products?...`; `/markalar/<slug>` keeps building
 * `/markalar/<slug>?...` (brand context never lost).
 */
let mockPathname = "/products";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
}));

import { ActiveFilterChips } from "../components/search/active-filter-chips";
import { SearchPagination } from "../components/search/search-pagination";
import {
  emptySearchState,
  toggleFilterValue,
  withBrand,
  withCategory,
  withPrice,
  type SearchState,
} from "../lib/search/url-state";

const t = getDictionary("tr").storefront;

function state(overrides: Partial<SearchState> = {}): SearchState {
  return { ...emptySearchState(), ...overrides };
}

function colorFacet(): PublicSearchFacet {
  return {
    attributeDefinitionId: "def-renk",
    code: "renk",
    name: "Renk",
    dataType: "COLOR",
    unit: null,
    displayOrder: 1,
    selectionMode: "MULTI",
    values: [
      { optionId: "o1", value: "siyah", label: "Siyah", colorHex: "#000000", count: 12, selected: true },
      { optionId: "o2", value: "beyaz", label: "Beyaz", colorHex: "#ffffff", count: 0, selected: false },
    ],
    range: null,
  };
}

describe("ActiveFilterChips — hrefs stay on the current route", () => {
  it("/products route (category-only, no brand) → chip + clear-all hrefs target /products", () => {
    mockPathname = "/products";
    const s = withPrice(toggleFilterValue(withCategory(state(), "erkek"), "renk", "siyah"), 10000, 50000);
    const out = renderToStaticMarkup(<ActiveFilterChips facets={[colorFacet()]} state={s} currency="TRY" t={t} />);
    expect(out).toContain('href="/products?');
    expect(out).not.toContain("/markalar");
  });

  it("/markalar/aurora route (brand-filtered) → chip + clear-all hrefs stay on /markalar/aurora", () => {
    mockPathname = "/markalar/aurora";
    const s = withPrice(toggleFilterValue(withBrand(state(), "aurora"), "renk", "siyah"), 10000, 50000);
    const out = renderToStaticMarkup(<ActiveFilterChips facets={[colorFacet()]} state={s} currency="TRY" t={t} />);
    expect(out).toContain('href="/markalar/aurora?');
    expect(out).not.toContain('href="/products');
  });
});

describe("SearchPagination — page links stay on the current route", () => {
  it("/products route → page links target /products", () => {
    mockPathname = "/products";
    const s = withCategory(state(), "erkek");
    const out = renderToStaticMarkup(
      <SearchPagination state={s} totalPages={3} hasPreviousPage={false} hasNextPage={true} t={t} />,
    );
    expect(out).toContain('href="/products?');
    expect(out).not.toContain("/markalar");
  });

  it("/markalar/aurora route → page links stay on /markalar/aurora (brand context preserved)", () => {
    mockPathname = "/markalar/aurora";
    const s = withBrand(state(), "aurora");
    const out = renderToStaticMarkup(
      <SearchPagination state={s} totalPages={3} hasPreviousPage={false} hasNextPage={true} t={t} />,
    );
    expect(out).toContain('href="/markalar/aurora?');
    expect(out).not.toContain('href="/products');
  });
});

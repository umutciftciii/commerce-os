import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

// SearchCombobox useRouter kullanır (useSearchParams DEĞİL) — statik render için mock'la.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { HeaderSearch, HeaderSearchFallback } from "../components/site/header-search";

const t = getDictionary("tr").storefront;

/**
 * TODO-156E — Header combobox statik iskelet doğrulaması (renderToStaticMarkup; etkileşim değil). Klavye/abort/
 * race/cache/grouping mantığı SAF lib testlerinde (lib/autocomplete/*). Burada: no-JS GET fallback + combobox
 * ARIA iskeleti korunuyor mu.
 */
describe("HeaderSearch (combobox)", () => {
  it("gerçek GET form /products'a gider (JS'siz de çalışır)", () => {
    const html = renderToStaticMarkup(<HeaderSearch t={t} />);
    expect(html).toContain('action="/products"');
    expect(html).toContain('method="get"');
    expect(html).toContain('role="search"');
    expect(html).toContain('name="q"');
  });

  it("input combobox ARIA taşır (aria-autocomplete/aria-controls)", () => {
    const html = renderToStaticMarkup(<HeaderSearch t={t} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("aria-controls");
  });

  it("fallback da gerçek GET form (prefill yok)", () => {
    const html = renderToStaticMarkup(
      <HeaderSearchFallback placeholder={t.shell.searchPlaceholder} submitLabel={t.shell.searchSubmit} />,
    );
    expect(html).toContain('action="/products"');
    expect(html).toContain('name="q"');
  });
});

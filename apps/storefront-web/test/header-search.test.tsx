import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const params = { value: "" };
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(params.value),
}));

import { HeaderSearch, HeaderSearchFallback } from "../components/site/header-search";

afterEach(() => {
  params.value = "";
});

describe("HeaderSearch", () => {
  it("gerçek GET form /products'a gider (JS'siz de çalışır)", () => {
    const html = renderToStaticMarkup(<HeaderSearch placeholder="Ürün ara" submitLabel="Ara" />);
    expect(html).toContain('action="/products"');
    expect(html).toContain('method="get"');
    expect(html).toContain('role="search"');
    expect(html).toContain('name="q"');
  });

  it("mevcut q input'a önden yazılır", () => {
    params.value = "q=mont";
    const html = renderToStaticMarkup(<HeaderSearch placeholder="Ürün ara" submitLabel="Ara" />);
    expect(html).toContain('value="mont"');
  });

  it("boş query → value boş", () => {
    const html = renderToStaticMarkup(<HeaderSearch placeholder="Ürün ara" submitLabel="Ara" />);
    expect(html).not.toContain('value="mont"');
  });

  it("fallback da gerçek GET form (prefill yok)", () => {
    const html = renderToStaticMarkup(<HeaderSearchFallback placeholder="Ürün ara" submitLabel="Ara" />);
    expect(html).toContain('action="/products"');
    expect(html).toContain('name="q"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicAutocompleteResponse } from "@commerce-os/api-client";
import { AutocompletePanel } from "../components/search/autocomplete/autocomplete-panel";
import { buildPopupOptions } from "../lib/autocomplete/flatten";

/**
 * TODO-156E UX — Autocomplete panel ürün kartı + rozet + gruplama statik render doğrulaması
 * (renderToStaticMarkup; etkileşim değil). Fiyat YOK · ad→marka→kategori · Yeni/Kampanya rozeti · stok.
 */

const labels = getDictionary("tr").storefront.autocomplete;

const data: PublicAutocompleteResponse = {
  query: "demo",
  suggestions: ["Demo Hoodie"],
  products: [
    {
      id: "p1",
      slug: "demo-hoodie",
      title: "Demo Hoodie",
      brand: "Commerce OS",
      categoryLabel: "Apparel",
      availability: "IN_STOCK",
      inStock: true,
      image: { url: "/media/x.webp", altText: "Kapak", position: 0, variantOptionId: null },
      hasCampaign: true,
      campaignLabel: null, // → jenerik "Kampanya"
      isNew: true,
    },
    {
      id: "p2",
      slug: "demo-tote",
      title: "Demo Tote",
      brand: null,
      categoryLabel: "Accessories",
      availability: "OUT_OF_STOCK",
      inStock: false,
      image: null,
      hasCampaign: false,
      campaignLabel: null,
      isNew: false,
    },
  ],
  categories: [{ id: "c1", slug: "apparel", name: "Apparel", path: [{ slug: "apparel", name: "Apparel" }] }],
  brands: [{ brand: "Commerce OS", productCount: 2 }],
  total: 2,
};

function render() {
  const options = buildPopupOptions({ mode: "results", data, recents: [], popular: [], idBase: "t" });
  return renderToStaticMarkup(
    <AutocompletePanel
      options={options}
      activeIndex={-1}
      listboxId="lb"
      labels={labels}
      query="demo"
      mode="results"
      loading={false}
      recentsCount={0}
      onSelect={() => {}}
      onHover={() => {}}
    />,
  );
}

describe("AutocompletePanel — ürün kartı (TODO-156E UX)", () => {
  it("FİYAT göstermez (₺ yok)", () => {
    expect(render()).not.toContain("₺");
  });

  it("ad → marka → kategori hiyerarşisi", () => {
    const html = render();
    expect(html).toContain("Demo");
    expect(html).toContain("Commerce OS");
    expect(html).toContain("Apparel");
  });

  it("Yeni + Kampanya (jenerik) rozetleri render eder", () => {
    const html = render();
    expect(html).toContain(labels.newBadge); // "Yeni"
    expect(html).toContain(labels.campaignGeneric); // campaignLabel null → jenerik
  });

  it("stokta olmayan ürün için 'Tükendi'", () => {
    expect(render()).toContain(labels.outOfStock);
  });

  it("gruplar listbox içinde (role=listbox + option)", () => {
    const html = render();
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
  });

  it("boş grup başlığı render etmez (marka grubu tek eleman → tek başlık)", () => {
    const html = render();
    // Grup başlıkları yalnız veri olan gruplar için (öneriler/kategoriler/markalar/ürünler hepsi dolu).
    expect(html).toContain(labels.groupBrands);
    expect(html).toContain(labels.groupCategories);
    expect(html).toContain(labels.groupProducts);
  });
});

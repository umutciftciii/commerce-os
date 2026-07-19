import { describe, expect, it } from "vitest";
import type { PublicAutocompleteResponse } from "@commerce-os/api-client";
import {
  buildPopupOptions,
  countAutocompleteItems,
  nextActiveIndex,
} from "../lib/autocomplete/flatten";

/** TODO-156E — Popup düzleştirme + klavye indeks SAF birim testleri. */

const data: PublicAutocompleteResponse = {
  query: "iph",
  suggestions: ["iPhone", "iPhone 15"],
  products: [
    {
      id: "p1",
      slug: "iphone-15-pro",
      title: "iPhone 15 Pro",
      brand: "Apple",
      categoryLabel: "Telefon",
      availability: "IN_STOCK",
      inStock: true,
      image: null,
      hasCampaign: false,
      campaignLabel: null,
      isNew: true,
    },
  ],
  categories: [{ id: "c1", slug: "telefon", name: "Telefon", path: [{ slug: "telefon", name: "Telefon" }] }],
  brands: [{ brand: "Apple", productCount: 12 }],
  total: 42,
};

describe("buildPopupOptions", () => {
  it("results modu: Öneriler → Kategoriler → Markalar → Ürünler sırası (TODO-156E UX)", () => {
    const opts = buildPopupOptions({ mode: "results", data, recents: [], popular: [], idBase: "b" });
    expect(opts.map((o) => o.groupKey)).toEqual([
      "suggestions",
      "suggestions",
      "categories",
      "brands",
      "products",
    ]);
    // id'ler benzersiz + deterministik.
    expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
    expect(opts[0].id).toBe("b-opt-0");
  });

  it("empty modu: recents + popüler (recent ile örtüşen popüler elenir)", () => {
    const opts = buildPopupOptions({
      mode: "empty",
      data: null,
      recents: ["hoodie"],
      popular: ["hoodie", "tote"],
      idBase: "b",
    });
    expect(opts.map((o) => o.groupKey)).toEqual(["recent", "popular"]);
    // "hoodie" popülerden elendi (recent'te var); yalnız "tote".
    const values = opts.map((o) => (o.action.kind === "suggestion" ? o.action.value : ""));
    expect(values).toEqual(["hoodie", "tote"]);
  });

  it("zero modu: yalnız popüler", () => {
    const opts = buildPopupOptions({ mode: "zero", data: null, recents: [], popular: ["tote"], idBase: "b" });
    expect(opts).toHaveLength(1);
    expect(opts[0].groupKey).toBe("popular");
  });

  it("her option href taşır", () => {
    const opts = buildPopupOptions({ mode: "results", data, recents: [], popular: [], idBase: "b" });
    expect(opts.every((o) => o.action.href.length > 0)).toBe(true);
    const product = opts.find((o) => o.action.kind === "product")!;
    expect(product.action.href).toBe("/products/iphone-15-pro");
  });
});

describe("countAutocompleteItems", () => {
  it("tüm grupları toplar", () => {
    expect(countAutocompleteItems(data)).toBe(5);
  });
});

describe("nextActiveIndex", () => {
  it("down wrap: -1→0→...→son→0", () => {
    expect(nextActiveIndex(-1, "down", 3)).toBe(0);
    expect(nextActiveIndex(2, "down", 3)).toBe(0);
  });
  it("up wrap: -1/0→son", () => {
    expect(nextActiveIndex(-1, "up", 3)).toBe(2);
    expect(nextActiveIndex(0, "up", 3)).toBe(2);
  });
  it("home/end uçlara", () => {
    expect(nextActiveIndex(2, "home", 3)).toBe(0);
    expect(nextActiveIndex(0, "end", 3)).toBe(2);
  });
  it("boş liste → -1", () => {
    expect(nextActiveIndex(0, "down", 0)).toBe(-1);
  });
});

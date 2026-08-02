import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import { facetTitle } from "../components/search/facets/facet-list.js";
import type { PublicSearchFacet } from "@commerce-os/api-client";

const tr = getDictionary("tr").storefront;
const en = getDictionary("en").storefront;

const base = { type: "MULTI", displayOrder: 0, values: [] };
const facet = (over: Partial<PublicSearchFacet>): PublicSearchFacet =>
  ({ code: "x", name: "X", unit: null, ...base, ...over }) as unknown as PublicSearchFacet;

describe("facetTitle — TD-170 brand facet locale", () => {
  it("marka facet'i (code=brand) sunucu adı 'Marka' olsa da locale'den türetir", () => {
    const brandFacet = facet({ code: "brand", name: "Marka" });
    expect(facetTitle(brandFacet, tr)).toBe("Marka");
    // EN locale: server hâlâ 'Marka' gönderse de vitrin 'Brand' gösterir.
    expect(facetTitle(brandFacet, en)).toBe("Brand");
  });

  it("marka dışı facet backend adını (varsa birim ekiyle) kullanır", () => {
    expect(facetTitle(facet({ code: "weight", name: "Ağırlık", unit: "g" }), tr)).toBe("Ağırlık (g)");
    expect(facetTitle(facet({ code: "color", name: "Renk", unit: null }), tr)).toBe("Renk");
  });
});

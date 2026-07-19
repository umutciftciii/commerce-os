import { describe, expect, it } from "vitest";
import { buildSearchDocument, MAX_LISTING_SWATCHES } from "../src/document-builder.js";
import type {
  SearchBuildResult,
  SearchDocumentData,
  SearchSourceImage,
  SearchSourceMediaOption,
  SearchSourceProduct,
  SearchSourceVariant,
} from "../src/types.js";

/**
 * TODO-155.1 (ADR-079) — Faz 2C-9 · Listing Projection (kart ticari + swatch + görsel) SAF builder testleri.
 * §12 senaryoları: promosuz/indirimli, compareAt/discount%, Omnibus var/yok, swatch yok/tek/çoklu, dedupe,
 * sortOrder, archived option yok, inactive variant yok, swatch image binding + fallback, default swatch,
 * media-defining axis, primary/secondary, bounded cap + toplam sayı, fiyat gizli.
 */

const AXIS = "axis_color";

function variant(o: Partial<SearchSourceVariant> = {}): SearchSourceVariant {
  return {
    id: "v1",
    status: "ACTIVE",
    priceMinor: 1000,
    compareAtMinor: null,
    currency: "TRY",
    available: 5,
    lowestRecentPriceMinor: null,
    mediaOptionId: null,
    ...o,
  };
}

function image(o: Partial<SearchSourceImage> = {}): SearchSourceImage {
  return {
    mediaId: "m1",
    storageKey: "store_1/m1.webp",
    altText: null,
    width: 800,
    height: 1000,
    position: 0,
    optionId: null,
    attributeDefinitionId: null,
    ...o,
  };
}

function option(o: Partial<SearchSourceMediaOption> = {}): SearchSourceMediaOption {
  return { id: "opt", value: "v", label: "L", colorHex: null, sortOrder: 0, status: "ACTIVE", ...o };
}

function source(overrides: Partial<SearchSourceProduct> = {}): SearchSourceProduct {
  return {
    id: "prod_1",
    storeId: "store_1",
    title: "Test Ürün",
    slug: "test-urun",
    brand: "Acme",
    description: null,
    status: "ACTIVE",
    priceVisible: true,
    primaryCategoryId: "cat_1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    variants: [variant()],
    categoryAttributes: [],
    productAttributeValues: [],
    variantAttributeValues: [],
    variantOptionValues: [],
    categoryIds: ["cat_1"],
    campaigns: [],
    evaluationNow: new Date("2026-07-15T12:00:00Z"),
    mediaDefiningAttributeId: null,
    images: [],
    mediaAxisOptions: [],
    ...overrides,
  };
}

function doc(result: SearchBuildResult): SearchDocumentData {
  if (result.removed) throw new Error("beklenmedik removed");
  return result.document;
}

// ── Ticari projeksiyon ──

describe("commercial projection", () => {
  it("promosuz ürün: compareAt/discount/omnibus null", () => {
    const d = doc(buildSearchDocument(source({ variants: [variant({ priceMinor: 1000 })] })));
    expect(d.compareAtMinor).toBeNull();
    expect(d.discountPercent).toBeNull();
    expect(d.omnibusPreviousPriceMinor).toBeNull();
  });

  it("indirimli ürün: compareAt + discountPercent (tek formül)", () => {
    const d = doc(
      buildSearchDocument(source({ variants: [variant({ priceMinor: 800, compareAtMinor: 1000 })] })),
    );
    expect(d.compareAtMinor).toBe(1000);
    expect(d.discountPercent).toBe(20); // round((1000-800)/1000*100)
  });

  it("compareAt <= satış fiyatı: indirim yok (null)", () => {
    const d = doc(
      buildSearchDocument(source({ variants: [variant({ priceMinor: 1000, compareAtMinor: 1000 })] })),
    );
    expect(d.compareAtMinor).toBeNull();
    expect(d.discountPercent).toBeNull();
  });

  it("en ucuz görünür varyanttan ticari snapshot alınır", () => {
    const d = doc(
      buildSearchDocument(
        source({
          variants: [
            variant({ id: "v1", priceMinor: 3000, compareAtMinor: 4000 }),
            variant({ id: "v2", priceMinor: 1500, compareAtMinor: 2000 }), // en ucuz
          ],
        }),
      ),
    );
    expect(d.minPriceMinor).toBe(1500);
    expect(d.compareAtMinor).toBe(2000);
    expect(d.discountPercent).toBe(25);
  });

  it("Omnibus: indirim aktif + geçmiş veri varsa yansır", () => {
    const d = doc(
      buildSearchDocument(
        source({ variants: [variant({ priceMinor: 800, compareAtMinor: 1000, lowestRecentPriceMinor: 700 })] }),
      ),
    );
    expect(d.omnibusPreviousPriceMinor).toBe(700);
  });

  it("Omnibus: geçmiş veri yoksa sahte değer üretilmez (null)", () => {
    const d = doc(
      buildSearchDocument(
        source({ variants: [variant({ priceMinor: 800, compareAtMinor: 1000, lowestRecentPriceMinor: null })] }),
      ),
    );
    expect(d.omnibusPreviousPriceMinor).toBeNull();
  });

  it("Omnibus: indirim yokken (compareAt yok) geçmiş veri olsa da gösterilmez", () => {
    const d = doc(
      buildSearchDocument(
        source({ variants: [variant({ priceMinor: 1000, compareAtMinor: null, lowestRecentPriceMinor: 700 })] }),
      ),
    );
    expect(d.omnibusPreviousPriceMinor).toBeNull();
  });

  it("fiyat gizli: tüm ticari alanlar null", () => {
    const d = doc(
      buildSearchDocument(
        source({ priceVisible: false, variants: [variant({ priceMinor: 800, compareAtMinor: 1000 })] }),
      ),
    );
    expect(d.compareAtMinor).toBeNull();
    expect(d.discountPercent).toBeNull();
    expect(d.omnibusPreviousPriceMinor).toBeNull();
  });
});

// ── Görsel projeksiyon ──

describe("image projection", () => {
  it("görsel yok + swatch yok: listing null", () => {
    const d = doc(buildSearchDocument(source({ images: [] })));
    expect(d.listing).toBeNull();
  });

  it("primary = position ASC ilk; secondary = farklı mediaId sonraki", () => {
    const d = doc(
      buildSearchDocument(
        source({
          images: [
            image({ mediaId: "m2", storageKey: "k2", position: 2 }),
            image({ mediaId: "m1", storageKey: "k1", position: 0 }),
            image({ mediaId: "m3", storageKey: "k3", position: 1 }),
          ],
        }),
      ),
    );
    expect(d.listing?.primaryImage?.storageKey).toBe("k1");
    expect(d.listing?.secondaryImage?.storageKey).toBe("k3");
  });

  it("tek görsel: secondary null", () => {
    const d = doc(buildSearchDocument(source({ images: [image({ mediaId: "m1", storageKey: "k1" })] })));
    expect(d.listing?.primaryImage?.storageKey).toBe("k1");
    expect(d.listing?.secondaryImage).toBeNull();
  });

  it("primary görsel boyut (width/height) taşır", () => {
    const d = doc(
      buildSearchDocument(source({ images: [image({ storageKey: "k1", width: 640, height: 800 })] })),
    );
    expect(d.listing?.primaryImage).toMatchObject({ width: 640, height: 800 });
  });
});

// ── Swatch projeksiyon ──

describe("swatch projection", () => {
  const redOpt = option({ id: "o_red", value: "kirmizi", label: "Kırmızı", colorHex: "#ff0000", sortOrder: 1 });
  const blueOpt = option({ id: "o_blue", value: "mavi", label: "Mavi", colorHex: "#0000ff", sortOrder: 2 });

  it("media ekseni yok: swatch üretilmez", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: null,
          variants: [variant({ mediaOptionId: "o_red" })],
          mediaAxisOptions: [redOpt],
          images: [image({ storageKey: "k1" })],
        }),
      ),
    );
    expect(d.listing?.swatches ?? []).toHaveLength(0);
    expect(d.listing?.swatchTotalCount ?? 0).toBe(0);
  });

  it("tek swatch: ACTIVE option + ACTIVE varyant", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [variant({ id: "v1", mediaOptionId: "o_red" })],
          mediaAxisOptions: [redOpt],
          images: [
            image({ mediaId: "m1", storageKey: "kmain", position: 0 }),
            image({ mediaId: "m2", storageKey: "kred", position: 1, optionId: "o_red", attributeDefinitionId: AXIS }),
          ],
        }),
      ),
    );
    expect(d.listing?.swatches).toHaveLength(1);
    expect(d.listing?.swatches[0]).toMatchObject({
      optionId: "o_red",
      label: "Kırmızı",
      colorHex: "#ff0000",
      isDefault: true,
    });
    expect(d.listing?.swatches[0].image?.storageKey).toBe("kred");
  });

  it("çoklu swatch: sortOrder ASC sırası", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [
            variant({ id: "v1", priceMinor: 1500, mediaOptionId: "o_blue" }),
            variant({ id: "v2", priceMinor: 1000, mediaOptionId: "o_red" }),
          ],
          mediaAxisOptions: [blueOpt, redOpt],
          images: [image({ storageKey: "kmain" })],
        }),
      ),
    );
    expect(d.listing?.swatches.map((s) => s.optionId)).toEqual(["o_red", "o_blue"]); // sortOrder 1,2
    expect(d.listing?.swatchTotalCount).toBe(2);
  });

  it("duplicate option (çoklu varyant aynı renk) tekilleştirilir", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [
            variant({ id: "v1", mediaOptionId: "o_red" }),
            variant({ id: "v2", mediaOptionId: "o_red" }),
          ],
          mediaAxisOptions: [redOpt],
          images: [image({ storageKey: "kmain" })],
        }),
      ),
    );
    expect(d.listing?.swatches).toHaveLength(1);
  });

  it("archived option swatch'a girmez", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [variant({ id: "v1", mediaOptionId: "o_red" }), variant({ id: "v2", mediaOptionId: "o_blue" })],
          mediaAxisOptions: [redOpt, option({ ...blueOpt, status: "ARCHIVED" })],
          images: [image({ storageKey: "kmain" })],
        }),
      ),
    );
    expect(d.listing?.swatches.map((s) => s.optionId)).toEqual(["o_red"]);
  });

  it("inactive varyantın rengi swatch'a girmez", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [
            variant({ id: "v1", status: "ACTIVE", mediaOptionId: "o_red" }),
            variant({ id: "v2", status: "DRAFT", mediaOptionId: "o_blue" }),
          ],
          mediaAxisOptions: [redOpt, blueOpt],
          images: [image({ storageKey: "kmain" })],
        }),
      ),
    );
    expect(d.listing?.swatches.map((s) => s.optionId)).toEqual(["o_red"]);
  });

  it("option görseli yoksa ürün ana görseline kontrollü fallback", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [variant({ id: "v1", mediaOptionId: "o_red" })],
          mediaAxisOptions: [redOpt],
          images: [image({ mediaId: "m1", storageKey: "kmain", position: 0 })], // o_red'e etiketli görsel yok
        }),
      ),
    );
    expect(d.listing?.swatches[0].image?.storageKey).toBe("kmain"); // primary'e fallback
  });

  it("default swatch = en ucuz görünür varyantın rengi", () => {
    const d = doc(
      buildSearchDocument(
        source({
          mediaDefiningAttributeId: AXIS,
          variants: [
            variant({ id: "v1", priceMinor: 2000, mediaOptionId: "o_red" }), // sortOrder 1 ama pahalı
            variant({ id: "v2", priceMinor: 1000, mediaOptionId: "o_blue" }), // en ucuz
          ],
          mediaAxisOptions: [redOpt, blueOpt],
          images: [image({ storageKey: "kmain" })],
        }),
      ),
    );
    const def = d.listing?.swatches.find((s) => s.isDefault);
    expect(def?.optionId).toBe("o_blue");
    expect(d.listing?.swatches.filter((s) => s.isDefault)).toHaveLength(1); // tam bir default
  });

  it("bounded: MAX_LISTING_SWATCHES kadar döner, swatchTotalCount tam sayı", () => {
    const total = MAX_LISTING_SWATCHES + 4;
    const opts = Array.from({ length: total }, (_, i) =>
      option({ id: `o${i}`, value: `v${i}`, label: `L${i}`, sortOrder: i }),
    );
    const variants = Array.from({ length: total }, (_, i) =>
      variant({ id: `v${i}`, priceMinor: 1000 + i, mediaOptionId: `o${i}` }),
    );
    const d = doc(
      buildSearchDocument(
        source({ mediaDefiningAttributeId: AXIS, variants, mediaAxisOptions: opts, images: [image({ storageKey: "k" })] }),
      ),
    );
    expect(d.listing?.swatches.length).toBe(MAX_LISTING_SWATCHES);
    expect(d.listing?.swatchTotalCount).toBe(total);
  });
});

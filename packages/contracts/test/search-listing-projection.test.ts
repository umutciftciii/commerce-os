import { describe, expect, it } from "vitest";
import { publicSearchProductSchema } from "../src/index.js";

/**
 * TODO-155.1 (ADR-079) — Faz 2C-9 · Listing projection DTO allowlist + additive geriye-uyum testleri.
 * publicSearchProductSchema zod obje varsayılanı ile bilinmeyen (internal) anahtarları STRIP eder →
 * storageKey/mediaId/costMinor sızsa bile DTO'ya çıkmaz. Yeni alanlar ADDITIVE (yoksa güvenli default).
 */

const base = {
  id: "prod_1",
  slug: "laptop-pro",
  title: "Laptop Pro",
  brand: "Acme",
  categoryLabel: "Laptoplar",
  minPriceMinor: 150000,
  maxPriceMinor: 250000,
  currency: "TRY",
  availability: "IN_STOCK" as const,
  inStock: true,
};

describe("publicSearchProductSchema — allowlist + additive", () => {
  it("internal alanlar (storageKey/mediaId/costMinor/netPriceMinor) STRIP edilir", () => {
    const parsed = publicSearchProductSchema.parse({
      ...base,
      storageKey: "stores/x/a.webp",
      mediaId: "m1",
      costMinor: 999,
      netPriceMinor: 111,
      searchText: "leak",
    });
    for (const leaked of ["storageKey", "mediaId", "costMinor", "netPriceMinor", "searchText"]) {
      expect(parsed).not.toHaveProperty(leaked);
    }
  });

  it("yeni listing alanları yoksa güvenli default'lanır (eski istemci kırılmaz)", () => {
    const parsed = publicSearchProductSchema.parse(base);
    expect(parsed.compareAtMinor).toBeNull();
    expect(parsed.discountPercent).toBeNull();
    expect(parsed.omnibusPreviousPriceMinor).toBeNull();
    expect(parsed.secondaryImage).toBeNull();
    expect(parsed.swatches).toEqual([]);
    expect(parsed.swatchTotalCount).toBe(0);
  });

  it("swatch + ticari alanlar tam projeksiyonu kabul eder (imageUrl; storageKey YOK)", () => {
    const parsed = publicSearchProductSchema.parse({
      ...base,
      compareAtMinor: 200000,
      discountPercent: 25,
      omnibusPreviousPriceMinor: 140000,
      secondaryImage: { url: "/media/b.webp", altText: null, position: 1 },
      swatches: [
        { optionId: "o_black", label: "Siyah", colorHex: "#000000", imageUrl: "/media/black.webp", isDefault: true },
      ],
      swatchTotalCount: 3,
    });
    expect(parsed.compareAtMinor).toBe(200000);
    expect(parsed.discountPercent).toBe(25);
    expect(parsed.swatches[0]).toMatchObject({ optionId: "o_black", imageUrl: "/media/black.webp", isDefault: true });
    expect(parsed.swatchTotalCount).toBe(3);
    // swatch'ta internal alan yok (schema strip'ler).
    expect(parsed.swatches[0]).not.toHaveProperty("storageKey");
  });
});

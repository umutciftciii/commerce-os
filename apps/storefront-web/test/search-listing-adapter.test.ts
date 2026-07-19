import { describe, expect, it } from "vitest";
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { toListingCard, toListingCards } from "../lib/search/listing-adapter";

function product(overrides: Partial<PublicSearchProduct> = {}): PublicSearchProduct {
  return {
    id: "p1",
    slug: "demo-hoodie",
    title: "Demo Hoodie",
    brand: "Marka",
    categoryLabel: "Giyim",
    minPriceMinor: 129900,
    maxPriceMinor: 149900,
    currency: "TRY",
    availability: "IN_STOCK",
    inStock: true,
    image: { url: "/media/a.webp", altText: "Ön", position: 0, variantOptionId: null },
    compareAtMinor: null,
    discountPercent: null,
    omnibusPreviousPriceMinor: null,
    secondaryImage: null,
    swatches: [],
    swatchTotalCount: 0,
    campaign: null,
    ...overrides,
  };
}

/** TODO-155.2 — Otomatik %10 kampanya rozeti fixture'ı (PublicCampaignBadge allowlist). */
function autoBadge(overrides: Record<string, unknown> = {}) {
  return {
    kind: "AUTOMATIC" as const,
    displayKind: "AUTOMATIC_CART_DISCOUNT" as const,
    requiresCouponCode: false,
    discountType: "PERCENT" as const,
    discountValue: 10,
    maxDiscountAmountMinor: null,
    minOrderAmountMinor: null,
    couponCode: null,
    couponAction: "MANUAL_ONLY" as const,
    endsAt: null,
    estimatedDiscountMinor: 14990,
    estimatedFinalUnitPriceMinor: 134910,
    displayTitle: null,
    shortDescription: null,
    badgeLabel: null,
    badgeVariant: null,
    cardStyle: "STANDARD" as const,
    terms: null,
    ...overrides,
  };
}

describe("listing adapter", () => {
  it("temel alanlar + href + fiyat etiketi (tr-TR)", () => {
    const card = toListingCard(product());
    expect(card.href).toBe("/products/demo-hoodie");
    expect(card.title).toBe("Demo Hoodie");
    expect(card.priceLabel).toContain("1.299,00");
    expect(card.primaryImage).toEqual({ url: "/media/a.webp", alt: "Ön" });
  });

  it("compareAt + discountPercent + Omnibus biçimlenir (yeniden hesaplanmaz)", () => {
    const card = toListingCard(
      product({ compareAtMinor: 149900, discountPercent: 13, omnibusPreviousPriceMinor: 139900 }),
    );
    expect(card.compareAtLabel).toContain("1.499,00");
    expect(card.discountPercent).toBe(13);
    expect(card.omnibusLabel).toContain("1.399,00");
  });

  it("indirim yoksa etiketler null (kart kırılmaz)", () => {
    const card = toListingCard(product());
    expect(card.compareAtLabel).toBeNull();
    expect(card.discountPercent).toBeNull();
    expect(card.omnibusLabel).toBeNull();
  });

  it("fiyat yoksa (minPriceMinor null) priceLabel null", () => {
    expect(toListingCard(product({ minPriceMinor: null })).priceLabel).toBeNull();
  });

  it("secondary image fallback (yoksa null → hover değişimi yok)", () => {
    expect(toListingCard(product()).secondaryImage).toBeNull();
    const withSecondary = toListingCard(
      product({ secondaryImage: { url: "/media/b.webp", altText: null, position: 1, variantOptionId: null } }),
    );
    expect(withSecondary.secondaryImage).toEqual({ url: "/media/b.webp", alt: "Demo Hoodie" });
  });

  it("swatch mapping + default seçimi + +N göstergesi", () => {
    const card = toListingCard(
      product({
        swatches: [
          { optionId: "o1", label: "Siyah", colorHex: "#000", imageUrl: "/media/s1.webp", isDefault: false },
          { optionId: "o2", label: "Lacivert", colorHex: "#123", imageUrl: null, isDefault: true },
        ],
        swatchTotalCount: 5,
      }),
    );
    expect(card.swatches).toHaveLength(2);
    expect(card.defaultSwatch?.optionId).toBe("o2");
    expect(card.extraSwatchCount).toBe(3); // 5 - 2
  });

  it("default swatch yoksa ilk swatch; hiç swatch yoksa null", () => {
    const noDefault = toListingCard(
      product({
        swatches: [{ optionId: "o1", label: "Siyah", colorHex: "#000", imageUrl: null, isDefault: false }],
        swatchTotalCount: 1,
      }),
    );
    expect(noDefault.defaultSwatch?.optionId).toBe("o1");
    expect(noDefault.extraSwatchCount).toBe(0);
    expect(toListingCard(product()).defaultSwatch).toBeNull();
  });

  it("primary image yoksa null (kart placeholder'a düşer)", () => {
    expect(toListingCard(product({ image: null })).primaryImage).toBeNull();
  });

  it("currency null → TRY fallback", () => {
    expect(toListingCard(product({ currency: null })).currency).toBe("TRY");
  });

  it("adapter yalnızca allowlist alanlarını taşır (internal alan yok)", () => {
    const card = toListingCard(product());
    // Read-model internal alanları (storageKey/mediaId/searchVector/costMinor) kart modelinde YOK.
    expect(JSON.stringify(card)).not.toMatch(/storageKey|mediaId|searchVector|costMinor|netPriceMinor/);
  });

  it("toListingCards toplu dönüştürür", () => {
    expect(toListingCards([product(), product({ id: "p2", slug: "s2" })])).toHaveLength(2);
  });

  // TODO-155.2 — Kampanya "Sepette" kart görünümü (PDP ile aynı; istemci hesap yapmaz)
  it("kampanya yok → card.campaign null", () => {
    expect(toListingCard(product()).campaign).toBeNull();
  });

  it("otomatik %10 kampanya → Sepette görünümü (final etiket + % + discountText)", () => {
    const card = toListingCard(product({ campaign: autoBadge() }));
    expect(card.campaign).not.toBeNull();
    expect(card.campaign?.isAutomatic).toBe(true);
    expect(card.campaign?.percent).toBe(10);
    expect(card.campaign?.discountText).toBe("%10");
    // 134910 minor → tr-TR "1.349,10".
    expect(card.campaign?.estimatedFinalLabel).toContain("1.349,10");
  });

  it("güvenli tahmin yoksa (FIXED_AMOUNT/estimate null) final etiket null; sahte fiyat yok", () => {
    const card = toListingCard(
      product({
        campaign: autoBadge({ discountType: "FIXED_AMOUNT", discountValue: 5000, estimatedFinalUnitPriceMinor: null, estimatedDiscountMinor: null, percent: undefined }),
      }),
    );
    expect(card.campaign?.estimatedFinalLabel).toBeNull();
    expect(card.campaign?.percent).toBeNull();
  });
});

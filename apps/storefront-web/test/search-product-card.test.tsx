import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { PublicSearchProduct } from "@commerce-os/api-client";
import { SearchProductCard } from "../components/search/search-product-card";
import { toListingCard } from "../lib/search/listing-adapter";

const t = getDictionary("tr").storefront;

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

/** TODO-155.2 — Otomatik %10 kampanya rozeti fixture'ı (search read-model snapshot). */
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

function html(overrides: Partial<PublicSearchProduct> = {}) {
  return renderToStaticMarkup(<SearchProductCard card={toListingCard(product(overrides))} t={t} />);
}

describe("SearchProductCard", () => {
  it("başlık + detay linki + fiyat", () => {
    const out = html();
    expect(out).toContain("Demo Hoodie");
    expect(out).toContain('href="/products/demo-hoodie"');
    expect(out).toContain("1.299,00");
  });

  it("primary görsel src", () => {
    expect(html()).toContain('src="/media/a.webp"');
  });

  it("compareAt üstü çizili + discount rozeti + Omnibus", () => {
    const out = html({ compareAtMinor: 149900, discountPercent: 13, omnibusPreviousPriceMinor: 139900 });
    expect(out).toContain("line-through");
    expect(out).toContain("1.499,00");
    expect(out).toContain("%13");
    expect(out).toContain("1.399,00");
  });

  it("secondary hover görseli render edilir (opacity-0, layout-shift'siz)", () => {
    const out = html({ secondaryImage: { url: "/media/b.webp", altText: null, position: 1, variantOptionId: null } });
    expect(out).toContain('src="/media/b.webp"');
    expect(out).toContain("opacity-0");
  });

  it("swatch butonları erişilebilir label + colorHex", () => {
    const out = html({
      swatches: [
        { optionId: "o1", label: "Siyah", colorHex: "#000000", imageUrl: "/media/s.webp", isDefault: true },
      ],
      swatchTotalCount: 1,
    });
    expect(out).toContain('aria-label="Renk: Siyah"');
    expect(out).toContain("#000000");
  });

  it("+N göstergesi (swatchTotalCount > gösterilen)", () => {
    const out = html({
      swatches: [
        { optionId: "o1", label: "Siyah", colorHex: "#000", imageUrl: null, isDefault: true },
        { optionId: "o2", label: "Beyaz", colorHex: "#fff", imageUrl: null, isDefault: false },
      ],
      swatchTotalCount: 6,
    });
    expect(out).toContain("+4");
  });

  it("görsel yoksa placeholder (monogram) fallback", () => {
    const out = html({ image: null });
    expect(out).toContain('role="img"'); // ProductMedia placeholder
    expect(out).not.toContain('src="/media/a.webp"');
  });

  it("stok dışı rozeti", () => {
    expect(html({ inStock: false, availability: "OUT_OF_STOCK" })).toContain("Tükendi");
  });

  it("kampanya/indirim yoksa kart kırılmaz (rozet yok)", () => {
    const out = html();
    expect(out).not.toContain("line-through");
    expect(out).toContain("Demo Hoodie");
  });

  it("internal read-model alanı render edilmez", () => {
    expect(html()).not.toMatch(/storageKey|mediaId|searchVector|costMinor/);
  });

  // TODO-155.2 — Kampanya "Sepette" kart sunumu (PDP ile tutarlı)
  it("otomatik kampanya → Sepette nihai fiyat + üstü çizili liste + %10 rozeti", () => {
    const out = html({ minPriceMinor: 149900, maxPriceMinor: 149900, campaign: autoBadge() });
    // Nihai (Sepette) fiyat.
    expect(out).toContain("1.349,10");
    // Liste fiyatı üstü çizili.
    expect(out).toContain("line-through");
    expect(out).toContain("1.499,00");
    // "Sepette" etiketi (i18n badges.inCart) + indirim rozeti %10.
    expect(out).toContain(t.badges.inCart);
    expect(out).toContain("%10");
  });

  it("kampanya + compareAt birlikte → kampanya önceliği (Sepette gösterilir, Omnibus gizli)", () => {
    const out = html({
      minPriceMinor: 149900,
      campaign: autoBadge(),
      compareAtMinor: 199900,
      discountPercent: 25,
      omnibusPreviousPriceMinor: 189900,
    });
    // Kampanya bloğu gösterilir.
    expect(out).toContain("1.349,10");
    expect(out).toContain(t.badges.inCart);
    // Omnibus (compareAt semantiği) bu dalda GİZLİ.
    expect(out).not.toContain("1.899,00");
  });
});

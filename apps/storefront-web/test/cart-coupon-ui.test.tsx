import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

// F4A/F4A.3 — Kupon UI'i Server Action'lara bagli; render testinde ag/cookie yok.
vi.mock("../lib/server/cart-actions", () => ({
  applyWalletCouponAction: vi.fn(),
  claimCouponAction: vi.fn(),
  reconcileCartAction: vi.fn(),
  removeCartItemAction: vi.fn(),
  removeCouponAction: vi.fn(),
  updateCartItemAction: vi.fn(),
}));

import { CartView } from "../components/cart-view.js";
import type { CartView as CartViewModel } from "../lib/server/cart.js";
import type { StorefrontWalletCouponView } from "../lib/catalog-types.js";

const t = getDictionary("tr").storefront.cart;

function view(
  summaryOverrides: Partial<CartViewModel["summary"]> = {},
  lineOverrides: Partial<CartViewModel["lines"][number]> = {},
): CartViewModel {
  return {
    currency: "TRY",
    itemCount: 1,
    checkoutReady: true,
    isEmpty: false,
    subtotalLabel: "₺1.299,00",
    shippingOptions: [],
    selectedShippingOptionId: null,
    lines: [
      {
        variantId: "v1",
        productSlug: "demo-hoodie",
        title: "Demo Hoodie",
        variantTitle: "Black / M",
        sku: "SKU-1",
        quantity: 1,
        availableQuantity: 1,
        unitPriceLabel: "₺1.299,00",
        lineTotalLabel: "₺1.299,00",
        minQuantity: 1,
        maxQuantity: null,
        inStock: true,
        status: "OK",
        imageUrl: null,
        selected: true,
        compareAtLabel: null,
        ...lineOverrides,
      },
    ],
    summary: {
      subtotalLabel: "₺1.299,00",
      shippingLabel: "₺49,90",
      shippingIsFree: false,
      shippingStatus: "OK",
      freeShippingThresholdLabel: "₺750,00",
      discountLabel: null,
      taxIncludedLabel: "₺216,50",
      taxRatePercent: 20,
      grandTotalLabel: "₺1.348,90",
      couponCode: null,
      couponStatus: "NONE",
      couponReason: null,
      discountLines: [],
      availableCoupons: [],
      ...summaryOverrides,
    },
  };
}

function walletCoupon(overrides: Partial<StorefrontWalletCouponView> = {}): StorefrontWalletCouponView {
  return {
    code: "TEST250",
    discountText: "₺250",
    minOrderLabel: "₺1.000",
    endsAt: null,
    state: "AVAILABLE",
    source: "PUBLIC",
    ...overrides,
  };
}

function render(model: CartViewModel): string {
  return renderToStaticMarkup(
    <CartView view={model} canonicalItems={[]} reconcileNeeded={false} t={t} />,
  );
}

describe("storefront-web · F4A.3 cart Kuponlar area", () => {
  it("renders the 'Kuponlar' area and the 'Kupon Kodu Ekle' action", () => {
    const html = render(view());
    expect(html).toContain(t.couponsTitle); // "Kuponlar"
    expect(html).toContain(t.couponAdd); // "Kupon Kodu Ekle"
  });

  it("links 'Tüm Kuponlar' to the coupon centre (no dead link)", () => {
    const html = render(view());
    expect(html).toContain(t.couponsAllLink); // "Tüm Kuponlar"
    expect(html).toContain('href="/account?section=coupons"');
  });

  it("renders an eligible coupon card with amount, min order and 'Kullan' action", () => {
    const html = render(view({ availableCoupons: [walletCoupon()] }));
    expect(html).toContain("TEST250");
    expect(html).toContain("₺250");
    expect(html).toContain("₺1.000"); // alt limit
    expect(html).toContain(t.couponUse); // "Kullan"
  });

  it("renders 'Alt limit eksik' state for a min-order-not-met coupon", () => {
    const html = render(
      view({ availableCoupons: [walletCoupon({ state: "MIN_ORDER_NOT_MET" })] }),
    );
    expect(html).toContain(t.couponStateMinOrder);
    expect(html).not.toContain(`>${t.couponUse}<`);
  });

  it("marks an applied coupon card as 'Uygulandı'", () => {
    const html = render(
      view({
        couponCode: "TEST250",
        couponStatus: "APPLIED",
        availableCoupons: [walletCoupon({ state: "APPLIED" })],
      }),
    );
    expect(html).toContain(t.couponStateApplied);
  });

  it("shows an earned badge for an assigned coupon (ticket card)", () => {
    // Dilim 6a-refine — Ticket kartinda kazanilmis (PUBLIC olmayan) kupon "Kazandın"
    // rozeti tasir (eski "Size özel" yerine).
    const html = render(view({ availableCoupons: [walletCoupon({ source: "ASSIGNED" })] }));
    expect(html).toContain(t.couponEarned);
  });

  it("applied coupon shows discount line + remove; server totals not recomputed", () => {
    const html = render(
      view({
        couponCode: "TEST250",
        couponStatus: "APPLIED",
        discountLabel: "₺250,00",
        discountLines: [{ label: "TEST250 Kupon", code: "TEST250", amountLabel: "₺250,00" }],
        grandTotalLabel: "₺1.098,90",
      }),
    );
    expect(html).toContain(t.couponRemove);
    expect(html).toContain("−₺250,00");
    expect(html).toContain("₺1.098,90");
  });

  it("invalid coupon error coexists with an automatic campaign discount line", () => {
    const html = render(
      view({
        couponCode: "BADCODE",
        couponStatus: "INVALID",
        couponReason: "NOT_APPLICABLE",
        discountLabel: "₺129,90",
        // Otomatik kampanya satiri (code yok) gecersiz kupona ragmen kalir.
        discountLines: [{ label: "Sepette %10 İndirim", code: null, amountLabel: "₺129,90" }],
      }),
    );
    expect(html).toContain(t.couponReasonNotApplicable);
    expect(html).toContain("Sepette %10 İndirim");
    expect(html).toContain("−₺129,90");
  });
});

// ADR-065 (Faz 3/Dilim 6a) — Sepet gorsel katmani (thumbnail + mockup detaylari).
// Tumu mevcut DS token'lariyla (ink/surface/line); accent yalniz "Ödemeye geç"te.
describe("storefront-web · Dilim 6a cart görsel katmanı", () => {
  it("renders a real thumbnail <img> when the line has an imageUrl", () => {
    const html = render(view({}, { imageUrl: "/media/stores/store_demo/products/cover.webp" }));
    expect(html).toContain('src="/media/stores/store_demo/products/cover.webp"');
    expect(html).toContain('alt="Demo Hoodie"');
  });

  it("falls back to the deterministic placeholder when imageUrl is null", () => {
    const html = render(view({}, { imageUrl: null }));
    // ProductMedia yer tutucu: <img> yok, role=img + monogram (title ilk harfi).
    expect(html).not.toContain('src="/media');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Demo Hoodie"');
  });

  it("quantity selector is a single box with inner vertical dividers (border-r / border-l)", () => {
    const html = render(view());
    expect(html).toContain("border-r border-line"); // − butonu ayraci
    expect(html).toContain("border-l border-line"); // + butonu ayraci
  });

  it("order summary panel uses the muted surface (mockup gri panel, mevcut token)", () => {
    const html = render(view());
    expect(html).toContain("bg-surface-muted");
  });

  it("expired coupon card is dimmed (opacity); assigned card gets an ink side rail — no accent", () => {
    const expired = render(view({ availableCoupons: [walletCoupon({ state: "EXPIRED" })] }));
    expect(expired).toContain("opacity-60");
    const assigned = render(view({ availableCoupons: [walletCoupon({ source: "ASSIGNED" })] }));
    expect(assigned).toContain("border-l-ink");
    // Tek-accent kurali: kupon kartlari accent (menekse CTA) yuzeyi TASIMAZ.
    expect(assigned).not.toContain("border-l-accent");
  });
});

// Dilim 6a-refine — mockup eksikleri: satir checkbox'i, ustu-cizili fiyat, kargo
// tahmini, kupon "ticket" karti. Tumu mevcut DS token'lariyla (accent yalniz CTA'da).
describe("storefront-web · Dilim 6a-refine cart mockup detayları", () => {
  it("renders a selection checkbox per line; selected line is checked", () => {
    const html = render(view());
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('accent-ink'); // menekse DEGIL → tek-accent korunur
    expect(html).toContain("checked");
  });

  it("dims a deselected line (opacity) and leaves the checkbox unchecked", () => {
    const html = render(view({}, { selected: false }));
    expect(html).toContain("opacity-55");
  });

  it("shows the strikethrough compareAt (list) price when there is a discount", () => {
    const html = render(view({}, { compareAtLabel: "₺1.749,00" }));
    expect(html).toContain("line-through");
    expect(html).toContain("₺1.749,00");
  });

  it("omits the strikethrough when there is no compareAt discount", () => {
    const html = render(view({}, { compareAtLabel: null }));
    expect(html).not.toContain("line-through");
  });

  it("renders the static shipping estimate on a sellable line", () => {
    const html = render(view());
    expect(html).toContain(t.shippingEstimate); // "Tahmini 1-3 iş günü içinde kargoda"
  });

  it("renders the coupon as a ticket: amount + code + Detaylar; earned coupon shows 'Kazandın' (no accent)", () => {
    const html = render(view({ availableCoupons: [walletCoupon({ source: "ASSIGNED" })] }));
    expect(html).toContain("₺250"); // discountText (sol bolme tutari)
    expect(html).toContain("TEST250"); // kod
    expect(html).toContain(t.couponDetails); // "Detaylar"
    expect(html).toContain(t.couponEarned); // "Kazandın" rozeti (kazanilmis)
    expect(html).toContain("border-dashed"); // ticket iki-bolme ayraci
    // Tek-accent: "Kazandın" rozeti dolu-ink (accent DEGIL); ticket serit/yuzey accent tasimaz.
    // (bg-accent yalniz "Ödemeye geç" CTA'sinda — sayfa genelinde beklenir.)
    expect(html).not.toContain("border-l-accent");
    expect(html).not.toContain("bg-accent px-1.5"); // rozet accent olsaydi bu class olurdu
  });

  it("public (unearned) coupon shows no 'Kazandın' badge", () => {
    const html = render(view({ availableCoupons: [walletCoupon({ source: "PUBLIC" })] }));
    expect(html).not.toContain(t.couponEarned);
  });
});

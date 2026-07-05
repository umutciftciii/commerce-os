import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@commerce-os/i18n";

// F4A.5 — Kupon merkezi UI'i Server Action'lara + router'a bagli; render testinde
// ag/cookie/router yok (mock'lanir).
vi.mock("../lib/server/cart-actions", () => ({
  applyWalletCouponAction: vi.fn(),
  claimCouponAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { CouponsSection } from "../components/account/sections/coupons-section.js";
import type { StorefrontCouponCenterView } from "../lib/catalog-types.js";

const t = getDictionary("tr").storefront.account.coupons;

function coupon(overrides: Partial<StorefrontCouponCenterView> = {}): StorefrontCouponCenterView {
  return {
    code: "TEST250",
    discountText: "₺250",
    minOrderLabel: "₺1.000",
    endsAt: null,
    state: "AVAILABLE",
    source: "PUBLIC",
    usedAt: null,
    orderNumber: null,
    displayTitle: null,
    shortDescription: null,
    badgeLabel: null,
    terms: null,
    ...overrides,
  };
}

function render(coupons: StorefrontCouponCenterView[]): string {
  return renderToStaticMarkup(<CouponsSection coupons={coupons} t={t} />);
}

describe("storefront-web · F4A.5 coupon centre", () => {
  it("renders the page title 'Kuponlarım'", () => {
    expect(render([coupon()])).toContain(t.title); // "Kuponlarım"
  });

  it("renders the required tabs", () => {
    const html = render([coupon()]);
    expect(html).toContain(t.tabs.all); // Tüm Kuponlar
    expect(html).toContain(t.tabs.available); // Kullanılabilir
    expect(html).toContain(t.tabs.forYou); // Sana Özel
    expect(html).toContain(t.tabs.used); // Kullanıldı
  });

  it("renders the search input and 'Kupon Kodu Ekle' action", () => {
    const html = render([coupon()]);
    expect(html).toContain(t.searchPlaceholder); // "Kupon ara"
    expect(html).toContain(t.addTitle); // "Kupon Kodu Ekle"
  });

  it("renders a coupon card with amount, min order, validity and status", () => {
    const html = render([coupon({ endsAt: "2026-12-31T00:00:00.000Z" })]);
    expect(html).toContain("TEST250");
    expect(html).toContain("₺250");
    expect(html).toContain("₺1.000"); // alt limit
    expect(html).toContain(t.stateAvailable); // Kullanılabilir
    expect(html).toContain(t.use); // "Kullan"
  });

  it("marks an applied coupon and offers 'Sepete Git' instead of 'Kullan'", () => {
    const html = render([coupon({ state: "APPLIED" })]);
    expect(html).toContain(t.stateApplied); // Uygulandı
    expect(html).toContain(t.goToCart); // Sepete Git
  });

  it("used coupon has no 'Kullan' button and links to its order", () => {
    const html = render([
      coupon({ state: "USED", usedAt: "2026-07-01T09:00:00.000Z", orderNumber: "ORD-1001" }),
    ]);
    expect(html).toContain(t.stateUsed); // Kullanıldı
    expect(html).toContain(t.viewOrder); // Siparişi gör
    expect(html).toContain("/account/orders/ORD-1001");
    expect(html).not.toContain(`>${t.use}<`); // "Kullan" butonu yok
  });

  it("shows the assigned badge for 'Sana Özel' coupons", () => {
    const html = render([coupon({ source: "ASSIGNED" })]);
    expect(html).toContain(t.badgeForYou);
    expect(html).toContain(t.sourceAssigned);
  });

  it("renders an empty state when there are no coupons", () => {
    expect(render([])).toContain(t.empty); // "Henüz kuponunuz yok."
  });

  // F4A.4 — Admin sunum alanları (ADR-061): varsa kullanılır, yoksa üretilmiş
  // etikete düşülür. "Takip et kazan" hiçbir kartta yer almaz.
  it("uses the admin displayTitle / badgeLabel / terms when present", () => {
    const html = render([
      coupon({
        displayTitle: "Hafta sonu 500 TL’ye 100 TL kupon",
        shortDescription: "Tüm indirimlere ek fırsat",
        badgeLabel: "Süper Kupon",
        terms: "Kampanya stoklarla sınırlıdır.",
      }),
    ]);
    expect(html).toContain("Hafta sonu 500 TL’ye 100 TL kupon");
    expect(html).toContain("Tüm indirimlere ek fırsat");
    expect(html).toContain("Süper Kupon");
    expect(html).toContain(t.details); // "Detaylar"
    expect(html).toContain("Kampanya stoklarla sınırlıdır.");
    // İndirim tutarı yine görünür (ikincil satır).
    expect(html).toContain("₺250");
  });

  it("falls back to the generated discount label when displayTitle is absent", () => {
    const html = render([coupon({ displayTitle: null, badgeLabel: null })]);
    expect(html).toContain("₺250"); // üretilmiş tutar etiketi
    expect(html).toContain(t.badgeCoupon); // varsayılan "Kupon" rozeti
    expect(html).not.toContain(t.details); // terms yoksa Detaylar yok
  });

  it("never renders a follow-to-earn hint anywhere", () => {
    const html = render([coupon({ terms: "Geçerli ürünlerde." })]);
    expect(html.toLowerCase()).not.toContain("takip et");
    expect(html.toLowerCase()).not.toContain("follow");
  });
});

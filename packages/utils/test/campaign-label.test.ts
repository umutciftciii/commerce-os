import { describe, expect, it } from "vitest";
import {
  formatCampaignAmount,
  getCampaignBadgeText,
  getCampaignDiscountText,
  getCampaignPublicLabel,
} from "../src/campaign-label.js";

/** tr-TR Intl ciktisindaki NBSP/dar-NBSP boslugu normal bosluga cevirir. */
function n(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

describe("formatCampaignAmount", () => {
  it("tam liralarda ondaliksiz bicimler", () => {
    expect(n(formatCampaignAmount(25000))).toBe("₺250");
  });

  it("kurus iceren tutarda iki hane gosterir", () => {
    expect(n(formatCampaignAmount(25050))).toBe("₺250,50");
  });

  it("binlik ayirici uygular", () => {
    expect(n(formatCampaignAmount(100000))).toBe("₺1.000");
  });
});

describe("getCampaignDiscountText (F4A.3)", () => {
  it("yuzde: %10", () => {
    expect(getCampaignDiscountText({ type: "COUPON_CODE", discountType: "PERCENT", discountValue: 10 })).toBe(
      "%10",
    );
  });
  it("sabit tutar: ₺250", () => {
    expect(
      n(getCampaignDiscountText({ type: "COUPON_CODE", discountType: "FIXED_AMOUNT", discountValue: 25000 })),
    ).toBe("₺250");
  });
});

describe("getCampaignPublicLabel", () => {
  it("otomatik yuzde kampanyasi (tr): Sepette %10 indirim", () => {
    expect(
      getCampaignPublicLabel(
        { type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 10 },
        "tr",
      ),
    ).toBe("Sepette %10 indirim");
  });

  it("sabit tutarli kupon (tr): ₺250 kupon", () => {
    expect(
      n(
        getCampaignPublicLabel(
          { type: "COUPON_CODE", discountType: "FIXED_AMOUNT", discountValue: 25000 },
          "tr",
        ),
      ),
    ).toBe("₺250 kupon");
  });

  it("sabit tutarli otomatik kampanya (tr): Sepette ₺250 indirim", () => {
    expect(
      n(
        getCampaignPublicLabel(
          { type: "AUTOMATIC_CART", discountType: "FIXED_AMOUNT", discountValue: 25000 },
          "tr",
        ),
      ),
    ).toBe("Sepette ₺250 indirim");
  });

  it("urun/kategori kapsamli kampanya da otomatik etiketi alir", () => {
    expect(
      getCampaignPublicLabel(
        { type: "PRODUCT_DISCOUNT", discountType: "PERCENT", discountValue: 20 },
        "tr",
      ),
    ).toBe("Sepette %20 indirim");
  });

  it("ingilizce otomatik etiket", () => {
    expect(
      getCampaignPublicLabel(
        { type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 10 },
        "en",
      ),
    ).toBe("%10 off in cart");
  });
});

describe("getCampaignBadgeText", () => {
  it("kupon kampanyasi kisa rozet doner (tr)", () => {
    expect(
      getCampaignBadgeText(
        { type: "COUPON_CODE", discountType: "PERCENT", discountValue: 10 },
        "tr",
      ),
    ).toBe("Kuponlu ürün");
  });

  it("otomatik kampanya acik indirim rozeti doner", () => {
    expect(
      getCampaignBadgeText(
        { type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 10 },
        "tr",
      ),
    ).toBe("Sepette %10 indirim");
  });
});

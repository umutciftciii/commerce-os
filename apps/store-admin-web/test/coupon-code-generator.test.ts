import { describe, expect, it } from "vitest";
import {
  asciiCouponPrefix,
  COUPON_CODE_PATTERN,
  discountHint,
  generateCouponCode,
} from "../lib/client/coupon-code";

/** Deterministik RNG: sirasiyla verilen degerleri dondurur. */
function seq(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("asciiCouponPrefix", () => {
  it("Turkce karakterleri ASCII'ye cevirir", () => {
    expect(asciiCouponPrefix("İndirim")).toBe("INDIRIM");
    expect(asciiCouponPrefix("Yaz Şöleni")).toBe("YAZSOLENI");
    expect(asciiCouponPrefix("çğıöşü ÇĞİÖŞÜ")).toBe("CGIOSUCGIOSU");
  });

  it("bosluk/ozel karakterleri temizler ve buyuk harfe cevirir", () => {
    expect(asciiCouponPrefix("yaz kampanyası %10!")).toBe("YAZKAMPANYAS");
  });

  it("bos/uygunsuz adda guvenli fallback doner", () => {
    expect(asciiCouponPrefix("")).toBe("KUPON");
    expect(asciiCouponPrefix("!!")).toBe("KUPON");
  });
});

describe("discountHint", () => {
  it("yuzde degerini oldugu gibi kullanir", () => {
    expect(discountHint("PERCENT", 10)).toBe("10");
  });

  it("sabit tutari minor'dan tam liraya cevirir", () => {
    expect(discountHint("FIXED_AMOUNT", 25000)).toBe("250");
  });

  it("gecersiz degerde bos ipucu doner", () => {
    expect(discountHint("PERCENT", null)).toBe("");
    expect(discountHint("FIXED_AMOUNT", -5)).toBe("");
  });
});

describe("generateCouponCode", () => {
  it("yuzde kampanyasi icin AD+YUZDE-SONEK uretir", () => {
    const code = generateCouponCode({
      name: "Yaz",
      discountType: "PERCENT",
      discountValue: 10,
      random: seq([0, 0.5, 0.9, 0.1]),
    });
    expect(code.startsWith("YAZ10-")).toBe(true);
    expect(code).toMatch(COUPON_CODE_PATTERN);
  });

  it("sabit tutarli kampanya icin tam lira ipucu kullanir", () => {
    const code = generateCouponCode({
      name: "İndirim",
      discountType: "FIXED_AMOUNT",
      discountValue: 25000,
      random: seq([0.2, 0.4, 0.6, 0.8]),
    });
    expect(code.startsWith("INDIRIM250-")).toBe(true);
    expect(code).toMatch(COUPON_CODE_PATTERN);
  });

  it("Turkce karakterli uzun adda bile dogrulamaya sigar", () => {
    const code = generateCouponCode({
      name: "Çok Özel Şahane İlkbahar Kampanyası",
      discountType: "PERCENT",
      discountValue: 15,
      random: seq([0.3]),
    });
    expect(code).toMatch(COUPON_CODE_PATTERN);
    expect(code.length).toBeLessThanOrEqual(40);
    expect(code).toBe(code.toUpperCase());
    expect(/^[A-Z0-9-]+$/.test(code)).toBe(true);
  });

  it("ad bos ise fallback onekiyle uretir", () => {
    const code = generateCouponCode({
      name: "",
      discountType: "PERCENT",
      discountValue: 10,
      random: seq([0]),
    });
    expect(code.startsWith("KUPON10-")).toBe(true);
    expect(code).toMatch(COUPON_CODE_PATTERN);
  });

  it("rastgele sonek 4 karakterdir ve alfabe disina cikmaz", () => {
    const code = generateCouponCode({
      name: "Yaz",
      discountType: "PERCENT",
      discountValue: 10,
      random: Math.random,
    });
    const suffix = code.split("-").pop()!;
    expect(suffix).toHaveLength(4);
    expect(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(suffix)).toBe(true);
  });
});

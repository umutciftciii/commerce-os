import { describe, expect, it } from "vitest";
import {
  DEFAULT_VAT_RATE_BPS,
  VAT_RATE_BPS_PRESETS,
  isValidVatRateBps,
  splitGrossByVat,
  vatFromNet,
} from "../src/vat.js";

describe("vatFromNet", () => {
  it("net 1.199,20 TL + %20 → KDV 239,84 / brüt 1.439,04 (vat=round(net*bps/10000))", () => {
    expect(vatFromNet(119920, 2000)).toEqual({ netMinor: 119920, vatMinor: 23984, grossMinor: 143904 });
  });

  it("brüt 1.499,00 hedefi: net 1.249,17 + %20 → KDV 249,83 / brüt 1.499,00", () => {
    expect(vatFromNet(124917, 2000)).toEqual({ netMinor: 124917, vatMinor: 24983, grossMinor: 149900 });
  });

  it("tüm ön-tanımlı oranlar (%0/%1/%10/%20) çalışır", () => {
    expect(vatFromNet(10000, 0)).toEqual({ netMinor: 10000, vatMinor: 0, grossMinor: 10000 });
    expect(vatFromNet(10000, 100)).toEqual({ netMinor: 10000, vatMinor: 100, grossMinor: 10100 });
    expect(vatFromNet(10000, 1000)).toEqual({ netMinor: 10000, vatMinor: 1000, grossMinor: 11000 });
    expect(vatFromNet(10000, 2000)).toEqual({ netMinor: 10000, vatMinor: 2000, grossMinor: 12000 });
  });

  it("yuvarlama deterministiktir (half-up) ve gross = net + vat", () => {
    // 333 * 2000 / 10000 = 66.6 → 67
    expect(vatFromNet(333, 2000)).toEqual({ netMinor: 333, vatMinor: 67, grossMinor: 400 });
    // 25 * 100 / 10000 = 0.25 → 0
    expect(vatFromNet(25, 100)).toEqual({ netMinor: 25, vatMinor: 0, grossMinor: 25 });
    for (const rate of VAT_RATE_BPS_PRESETS) {
      for (const net of [0, 1, 99, 12345, 119920]) {
        const r = vatFromNet(net, rate);
        expect(r.grossMinor).toBe(r.netMinor + r.vatMinor);
      }
    }
  });

  it("negatif/ondalıklı tutar ve geçersiz oran reddedilir", () => {
    expect(() => vatFromNet(-1, 2000)).toThrow(RangeError);
    expect(() => vatFromNet(10.5, 2000)).toThrow(RangeError);
    expect(() => vatFromNet(100, -1)).toThrow(RangeError);
    expect(() => vatFromNet(100, 10001)).toThrow(RangeError);
    expect(() => vatFromNet(100, 19.9)).toThrow(RangeError);
  });
});

describe("splitGrossByVat (backfill / legacy-gross)", () => {
  it("mevcut brüt fiyat KORUNUR: gross === net + vat (Omnibus/backfill garantisi)", () => {
    for (const gross of [0, 1, 99, 100, 149900, 129900, 145000, 2147483600]) {
      for (const rate of VAT_RATE_BPS_PRESETS) {
        const r = splitGrossByVat(gross, rate);
        expect(r.grossMinor).toBe(gross);
        expect(r.netMinor + r.vatMinor).toBe(gross);
      }
    }
  });

  it("brüt 1.499,00 %20 → net 1.249,17 / KDV 249,83 (brüt korunur)", () => {
    // 149900 * 10000 / 12000 = 124916.67 → 124917; vat = brüt - net.
    expect(splitGrossByVat(149900, 2000)).toEqual({ netMinor: 124917, vatMinor: 24983, grossMinor: 149900 });
  });

  it("gidiş-dönüş: vatFromNet sonucu splitGrossByVat ile aynı brütü verir", () => {
    for (const net of [1, 50, 333, 119920, 999999]) {
      const forward = vatFromNet(net, DEFAULT_VAT_RATE_BPS);
      const back = splitGrossByVat(forward.grossMinor, DEFAULT_VAT_RATE_BPS);
      expect(back.grossMinor).toBe(forward.grossMinor);
      expect(back.netMinor + back.vatMinor).toBe(forward.grossMinor);
    }
  });

  it("geçersiz girişler reddedilir", () => {
    expect(() => splitGrossByVat(-5, 2000)).toThrow(RangeError);
    expect(() => splitGrossByVat(100, 20000)).toThrow(RangeError);
  });
});

describe("isValidVatRateBps", () => {
  it("aralık ve tamsayı doğrulaması", () => {
    expect(isValidVatRateBps(0)).toBe(true);
    expect(isValidVatRateBps(10000)).toBe(true);
    expect(isValidVatRateBps(2000)).toBe(true);
    expect(isValidVatRateBps(-1)).toBe(false);
    expect(isValidVatRateBps(10001)).toBe(false);
    expect(isValidVatRateBps(19.5)).toBe(false);
  });
});

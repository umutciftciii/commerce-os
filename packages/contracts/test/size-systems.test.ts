// TODO-165 Fashion Vertical (ADR-248) — size-system registry testleri.
import { describe, it, expect } from "vitest";
import {
  SIZE_SYSTEM_REGISTRY,
  getSizeSystem,
  isSizeSystemKey,
  listSizeSystemKeys,
  orderedValues,
  normalizeSizeValue,
  isValidSizeValue,
  localeLabel,
  isCompatibleWithCategory,
  sizeSystemsForCategory,
} from "../src/size-systems.js";

describe("size-system registry — bütünlük", () => {
  it("prompt §4'teki 10 sistem mevcut ve benzersiz", () => {
    const keys = listSizeSystemKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of [
      "INTERNATIONAL",
      "EU",
      "US",
      "UK",
      "TR",
      "JEANS",
      "SHOES_EU",
      "SHOES_US",
      "SHOES_UK",
      "BRA",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("her sistemin değerleri sıralı (order artan) ve benzersiz normalized", () => {
    for (const def of SIZE_SYSTEM_REGISTRY) {
      expect(def.values.length).toBeGreaterThan(0);
      const norms = def.values.map((v) => v.normalized);
      expect(new Set(norms).size).toBe(norms.length);
      const orders = def.values.map((v) => v.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });
});

describe("isSizeSystemKey / getSizeSystem", () => {
  it("yalnız kayıtlı anahtar", () => {
    expect(isSizeSystemKey("EU")).toBe(true);
    expect(isSizeSystemKey("eu")).toBe(false);
    expect(isSizeSystemKey("XL")).toBe(false);
  });
  it("getSizeSystem bilinmeyen key fırlatır", () => {
    expect(() => getSizeSystem("NOPE" as never)).toThrow();
  });
});

describe("normalizeSizeValue", () => {
  it("INTERNATIONAL alfa toleransı", () => {
    expect(normalizeSizeValue("INTERNATIONAL", " m ")).toBe("M");
    expect(normalizeSizeValue("INTERNATIONAL", "xl")).toBe("XL");
    expect(normalizeSizeValue("INTERNATIONAL", "5XL")).toBeNull();
  });
  it("JEANS ayraç toleransı (32/34 → 32X34)", () => {
    expect(normalizeSizeValue("JEANS", "32/34")).toBe("32X34");
    expect(normalizeSizeValue("JEANS", "32x34")).toBe("32X34");
  });
  it("SHOES_EU numerik", () => {
    expect(normalizeSizeValue("SHOES_EU", "42")).toBe("42");
    expect(normalizeSizeValue("SHOES_EU", "99")).toBeNull();
  });
  it("SHOES_US ondalık (8.5 → 8_5)", () => {
    expect(normalizeSizeValue("SHOES_US", "8.5")).toBe("8_5");
  });
});

describe("isValidSizeValue / orderedValues / localeLabel", () => {
  it("geçerli/geçersiz", () => {
    expect(isValidSizeValue("EU", "42")).toBe(true);
    expect(isValidSizeValue("EU", "99")).toBe(false);
  });
  it("orderedValues sıralı döner", () => {
    const vals = orderedValues("INTERNATIONAL");
    expect(vals[0].normalized).toBe("XXS");
    expect(vals[vals.length - 1].normalized).toBe("4XL");
  });
  it("localeLabel yoksa displayLabel", () => {
    expect(localeLabel("INTERNATIONAL", "XXL", "tr")).toBe("2XL");
    expect(localeLabel("EU", "42", "en")).toBe("42");
    expect(localeLabel("EU", "999", "en")).toBeNull();
  });
});

describe("kategori uyumluluğu", () => {
  it("SHOES_EU yalnız footwear", () => {
    expect(isCompatibleWithCategory("SHOES_EU", "footwear")).toBe(true);
    expect(isCompatibleWithCategory("SHOES_EU", "apparel-top")).toBe(false);
    expect(isCompatibleWithCategory("SHOES_EU", "general")).toBe(true); // general daima uyumlu
  });
  it("INTERNATIONAL üst/alt/elbise uyumlu, footwear değil", () => {
    expect(isCompatibleWithCategory("INTERNATIONAL", "apparel-top")).toBe(true);
    expect(isCompatibleWithCategory("INTERNATIONAL", "footwear")).toBe(false);
  });
  it("sizeSystemsForCategory footwear → SHOES_*", () => {
    const list = sizeSystemsForCategory("footwear");
    expect(list).toEqual(expect.arrayContaining(["SHOES_EU", "SHOES_US", "SHOES_UK"]));
    expect(list).not.toContain("INTERNATIONAL");
  });
  it("BRA → bra/underwear", () => {
    expect(isCompatibleWithCategory("BRA", "bra")).toBe(true);
    expect(isCompatibleWithCategory("BRA", "underwear")).toBe(true);
    expect(isCompatibleWithCategory("BRA", "footwear")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeText } from "../src/normalize.js";

describe("normalizeText", () => {
  it("Türkçe-güvenli lowercase (İ→i, I→ı) + trim + boşluk sadeleştirme", () => {
    expect(normalizeText("  İSTANBUL   Mont ")).toBe("istanbul mont");
    expect(normalizeText("KIRMIZI")).toBe("kırmızı");
  });

  it("null/boş → ''", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("   ")).toBe("");
  });
});

describe("buildSearchText", () => {
  it("parçaları normalize eder, boşları atar, aynı parçayı tekilleştirir", () => {
    // Dedupe PARÇA seviyesindedir (kelime değil): tekrar eden "Kışlık Mont" tekleşir.
    expect(buildSearchText(["Kışlık Mont", null, "kışlık mont", "  ", "North"])).toBe("kışlık mont north");
  });
});

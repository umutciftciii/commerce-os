import { describe, expect, it } from "vitest";
import { paginationRange } from "../lib/search/pagination";

describe("paginationRange", () => {
  it("total 0 → boş", () => {
    expect(paginationRange(1, 0)).toEqual([]);
  });

  it("küçük total → tüm sayfalar, ellipsis yok", () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("başta → sağ ellipsis + son", () => {
    expect(paginationRange(2, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
  });

  it("ortada → iki ellipsis + pencere", () => {
    expect(paginationRange(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });

  it("sonda → ilk + sol ellipsis", () => {
    expect(paginationRange(19, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  it("current sınırların dışında → clamp", () => {
    expect(paginationRange(999, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
    expect(paginationRange(-5, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
  });

  it("her zaman ilk ve son sayfayı içerir (büyük total)", () => {
    const tokens = paginationRange(50, 100);
    expect(tokens[0]).toBe(1);
    expect(tokens[tokens.length - 1]).toBe(100);
    expect(tokens).toContain(50);
  });
});

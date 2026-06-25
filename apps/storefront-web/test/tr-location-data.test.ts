import { describe, expect, it } from "vitest";
import {
  districtsOf,
  isProvince,
  isValidProvinceDistrict,
  trProvinceNames,
  trProvinces,
} from "../lib/tr-location-data";

/**
 * TR il/ilce verisi (F3B.1 UX). Checkout il->ilce bagimli dropdown'larini besler
 * ve sunucu-tarafi adres tutarlilik dogrulamasinda kullanilir.
 */
describe("storefront-web · TR location data", () => {
  it("contains all 81 provinces with unique plate codes 1..81", () => {
    expect(trProvinces).toHaveLength(81);
    const codes = trProvinces.map((p) => p.code).sort((a, b) => a - b);
    expect(codes[0]).toBe(1);
    expect(codes[80]).toBe(81);
    expect(new Set(codes).size).toBe(81);
  });

  it("exposes province names sorted in Turkish locale", () => {
    expect(trProvinceNames).toHaveLength(81);
    expect(trProvinceNames).toContain("İstanbul");
    expect(trProvinceNames).toContain("Ankara");
    const sorted = [...trProvinceNames].sort((a, b) => a.localeCompare(b, "tr"));
    expect(trProvinceNames).toEqual(sorted);
  });

  it("returns districts for a known province and empty for unknown", () => {
    const istanbul = districtsOf("İstanbul");
    expect(istanbul).toContain("Kadıköy");
    expect(istanbul).toContain("Beşiktaş");
    expect(districtsOf("Nowhere")).toEqual([]);
  });

  it("validates province and province/district pairs", () => {
    expect(isProvince("İzmir")).toBe(true);
    expect(isProvince("Atlantis")).toBe(false);
    expect(isValidProvinceDistrict("İzmir", "Konak")).toBe(true);
    expect(isValidProvinceDistrict("İzmir", "Kadıköy")).toBe(false);
    expect(isValidProvinceDistrict("Nowhere", "Konak")).toBe(false);
  });

  it("has no province with an empty district list", () => {
    for (const province of trProvinces) {
      expect(province.districts.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import { highlightSegments } from "../lib/autocomplete/highlight";

/** TODO-156E — Highlight SAF birim testleri (XSS-güvenli, Türkçe-güvenli). */

describe("highlightSegments", () => {
  it("eşleşen kısmı işaretler, geri kalanı düz bırakır", () => {
    expect(highlightSegments("iPhone 15 Pro", "iph")).toEqual([
      { text: "iPh", match: true },
      { text: "one 15 Pro", match: false },
    ]);
  });

  it("çoklu (örtüşmeyen) eşleşmeleri işaretler", () => {
    expect(highlightSegments("ara ara", "ara")).toEqual([
      { text: "ara", match: true },
      { text: " ", match: false },
      { text: "ara", match: true },
    ]);
  });

  it("Türkçe-güvenli case-insensitive (İ/ı)", () => {
    const segs = highlightSegments("İstanbul", "ist");
    expect(segs[0]).toEqual({ text: "İst", match: true });
  });

  it("boş query → tek match'siz segment", () => {
    expect(highlightSegments("Kalem", "  ")).toEqual([{ text: "Kalem", match: false }]);
  });

  it("eşleşme yoksa tek match'siz segment", () => {
    expect(highlightSegments("Kalem", "xyz")).toEqual([{ text: "Kalem", match: false }]);
  });

  it("XSS: HTML metni text olarak korunur (kaçış/enjeksiyon yok — segment düz string)", () => {
    const segs = highlightSegments("<b>iph</b>", "iph");
    // Segmentler ham string; React text node render eder. '<b>' bir segmentte, işaretlenmez.
    expect(segs.map((s) => s.text).join("")).toBe("<b>iph</b>");
    expect(segs.some((s) => s.match && s.text === "iph")).toBe(true);
  });
});

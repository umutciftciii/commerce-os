/**
 * TODO-161B (ADR-137/138) — Recently Viewed SAF çekirdeği unit testleri.
 *
 * Kapsam: isPrefetchRequest · shouldRecordView · mergeViewCount · mostRecent · clampLimit.
 */
import { describe, expect, it } from "vitest";
import {
  clampLimit,
  isPrefetchRequest,
  mergeViewCount,
  mostRecent,
  shouldRecordView,
} from "../src/recently-viewed/recently-viewed-core.js";

describe("isPrefetchRequest", () => {
  it("Sec-Purpose prefetch → true", () => {
    expect(isPrefetchRequest({ secPurpose: "prefetch" })).toBe(true);
  });

  it("Purpose prefetch → true", () => {
    expect(isPrefetchRequest({ purpose: "prefetch" })).toBe(true);
  });

  it("X-Moz prefetch → true", () => {
    expect(isPrefetchRequest({ xMoz: "prefetch" })).toBe(true);
  });

  it("preload / prerender → true", () => {
    expect(isPrefetchRequest({ secPurpose: "preload" })).toBe(true);
    expect(isPrefetchRequest({ secPurpose: "prerender" })).toBe(true);
  });

  it("dizi header değerlerini işler", () => {
    expect(isPrefetchRequest({ secPurpose: ["prefetch", "document"] })).toBe(true);
    expect(isPrefetchRequest({ purpose: ["prefetch"] })).toBe(true);
  });

  it("büyük/küçük harf duyarsız + kısmi eşleşme", () => {
    expect(isPrefetchRequest({ secPurpose: "PreFetch" })).toBe(true);
    expect(isPrefetchRequest({ xMoz: "prefetch;something" })).toBe(true);
  });

  it("normal / boş istek → false", () => {
    expect(isPrefetchRequest({ secPurpose: "document" })).toBe(false);
    expect(isPrefetchRequest({})).toBe(false);
    expect(isPrefetchRequest({ secPurpose: undefined, purpose: undefined })).toBe(false);
    expect(isPrefetchRequest({ secPurpose: [] })).toBe(false);
  });
});

describe("shouldRecordView", () => {
  const base = { isBot: false, isPrefetch: false, hasIdentity: true, hasProductId: true };

  it("tüm koşullar uygun → true", () => {
    expect(shouldRecordView(base)).toBe(true);
  });

  it("bot → false", () => {
    expect(shouldRecordView({ ...base, isBot: true })).toBe(false);
  });

  it("prefetch → false", () => {
    expect(shouldRecordView({ ...base, isPrefetch: true })).toBe(false);
  });

  it("kimlik yok → false", () => {
    expect(shouldRecordView({ ...base, hasIdentity: false })).toBe(false);
  });

  it("ürün yok → false", () => {
    expect(shouldRecordView({ ...base, hasProductId: false })).toBe(false);
  });
});

describe("mergeViewCount", () => {
  it("toplar", () => {
    expect(mergeViewCount(2, 3, 50)).toBe(5);
  });

  it("cap ile sınırlar", () => {
    expect(mergeViewCount(30, 30, 50)).toBe(50);
  });

  it("en az 1 döner", () => {
    expect(mergeViewCount(0, 0, 50)).toBe(1);
  });

  it("negatifleri 0'a sıkıştırır (en az 1)", () => {
    expect(mergeViewCount(-5, -5, 50)).toBe(1);
    expect(mergeViewCount(-5, 4, 50)).toBe(4);
  });
});

describe("mostRecent", () => {
  it("daha geç tarihi döner", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-06-01T00:00:00Z");
    expect(mostRecent(a, b)).toBe(b);
    expect(mostRecent(b, a)).toBe(b);
  });

  it("eşitlikte ilkini döner", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-01-01T00:00:00Z");
    expect(mostRecent(a, b)).toBe(a);
  });
});

describe("clampLimit", () => {
  it("undefined / NaN → fallback", () => {
    expect(clampLimit(undefined, 12, 24)).toBe(12);
    expect(clampLimit(Number.NaN, 12, 24)).toBe(12);
    expect(clampLimit(Number.POSITIVE_INFINITY, 12, 24)).toBe(12);
  });

  it("<1 → fallback", () => {
    expect(clampLimit(0, 12, 24)).toBe(12);
    expect(clampLimit(-5, 12, 24)).toBe(12);
  });

  it("max ile sınırlar", () => {
    expect(clampLimit(100, 12, 24)).toBe(24);
  });

  it("float'ları truncate eder", () => {
    expect(clampLimit(5.9, 12, 24)).toBe(5);
  });

  it("geçerli değeri korur", () => {
    expect(clampLimit(8, 12, 24)).toBe(8);
  });
});

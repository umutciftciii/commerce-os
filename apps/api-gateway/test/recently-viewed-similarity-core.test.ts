/**
 * TODO-161B (ADR-140/142/143) — Similar Products skorlama ÇEKİRDEĞİ SAF unit testleri.
 *
 * Kapsam: priceProximityScore · countSharedAttributes · scoreCandidate (kategori dışlama, brand,
 * salesMode, shared attribute cap) · rankSimilar (deterministik sıra, anchor hariç, dedupe, limit).
 */
import { describe, expect, it } from "vitest";
import {
  SIMILARITY_WEIGHTS,
  countSharedAttributes,
  priceProximityScore,
  rankSimilar,
  scoreCandidate,
  type SimilarityFeatures,
} from "../src/recently-viewed/similarity-core.js";

const W = SIMILARITY_WEIGHTS;

function feat(overrides: Partial<SimilarityFeatures> & { productId: string }): SimilarityFeatures {
  return {
    primaryCategoryId: null,
    parentCategoryId: null,
    brand: null,
    salesMode: null,
    priceMinor: null,
    currency: null,
    attributeKeys: [],
    createdAtMs: 0,
    ...overrides,
  };
}

describe("priceProximityScore", () => {
  it("aynı fiyat → tam puan", () => {
    expect(priceProximityScore(1000, 1000, "TRY", "TRY", W.PRICE_PROXIMITY_MAX)).toBe(W.PRICE_PROXIMITY_MAX);
  });

  it("iki katı fiyat → 0 (lineer azalım sınırı)", () => {
    expect(priceProximityScore(1000, 2000, "TRY", "TRY", W.PRICE_PROXIMITY_MAX)).toBe(0);
  });

  it("farklı currency → 0", () => {
    expect(priceProximityScore(1000, 1000, "TRY", "USD", W.PRICE_PROXIMITY_MAX)).toBe(0);
  });

  it("null fiyat/currency → 0", () => {
    expect(priceProximityScore(null, 1000, "TRY", "TRY", W.PRICE_PROXIMITY_MAX)).toBe(0);
    expect(priceProximityScore(1000, null, "TRY", "TRY", W.PRICE_PROXIMITY_MAX)).toBe(0);
    expect(priceProximityScore(1000, 1000, null, "TRY", W.PRICE_PROXIMITY_MAX)).toBe(0);
    expect(priceProximityScore(1000, 1000, "TRY", null, W.PRICE_PROXIMITY_MAX)).toBe(0);
  });

  it("kısmi yakınlık → lineer ara puan", () => {
    // |1000-1500|/1000 = 0.5 → max*(1-0.5)
    expect(priceProximityScore(1000, 1500, "TRY", "TRY", W.PRICE_PROXIMITY_MAX)).toBe(W.PRICE_PROXIMITY_MAX * 0.5);
  });
});

describe("countSharedAttributes", () => {
  it("doğru ortak sayı", () => {
    expect(countSharedAttributes(["a:1", "b:2", "c:3"], ["b:2", "c:3", "d:4"])).toBe(2);
  });

  it("aday tekrarları çift saymaz", () => {
    expect(countSharedAttributes(["b:2"], ["b:2", "b:2", "b:2"])).toBe(1);
  });

  it("boş taraf → 0", () => {
    expect(countSharedAttributes([], ["a:1"])).toBe(0);
    expect(countSharedAttributes(["a:1"], [])).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("aynı alt kategori → SUBCATEGORY ağırlığı", () => {
    const anchor = feat({ productId: "anchor", primaryCategoryId: "cat1", parentCategoryId: "p1" });
    const candidate = feat({ productId: "c", primaryCategoryId: "cat1", parentCategoryId: "p1" });
    const r = scoreCandidate(anchor, candidate);
    expect(r.signals.subcategory).toBe(W.SUBCATEGORY);
    // alt kategori parent'ı DIŞLAR (double-count yok)
    expect(r.signals.parentCategory).toBe(0);
  });

  it("alt kategori farklı ama parent aynı → PARENT_CATEGORY ağırlığı", () => {
    const anchor = feat({ productId: "anchor", primaryCategoryId: "cat1", parentCategoryId: "p1" });
    const candidate = feat({ productId: "c", primaryCategoryId: "cat2", parentCategoryId: "p1" });
    const r = scoreCandidate(anchor, candidate);
    expect(r.signals.subcategory).toBe(0);
    expect(r.signals.parentCategory).toBe(W.PARENT_CATEGORY);
  });

  it("marka eşleşmesi → BRAND", () => {
    const anchor = feat({ productId: "anchor", brand: "Acme" });
    const candidate = feat({ productId: "c", brand: "Acme" });
    expect(scoreCandidate(anchor, candidate).signals.brand).toBe(W.BRAND);
    // null marka eşleşme sayılmaz
    expect(scoreCandidate(feat({ productId: "a" }), feat({ productId: "c" })).signals.brand).toBe(0);
  });

  it("salesMode eşleşmesi → SALES_MODE", () => {
    const anchor = feat({ productId: "anchor", salesMode: "PHYSICAL" });
    const candidate = feat({ productId: "c", salesMode: "PHYSICAL" });
    expect(scoreCandidate(anchor, candidate).signals.salesMode).toBe(W.SALES_MODE);
  });

  it("ortak attribute SHARED_ATTRIBUTE_MAX ile sınırlı", () => {
    const many = ["a:1", "b:2", "c:3", "d:4", "e:5"]; // 5 * EACH(6) = 30 > MAX(18)
    const anchor = feat({ productId: "anchor", attributeKeys: many });
    const candidate = feat({ productId: "c", attributeKeys: many });
    const r = scoreCandidate(anchor, candidate);
    expect(r.signals.sharedAttributeCount).toBe(5);
    expect(r.signals.sharedAttributes).toBe(W.SHARED_ATTRIBUTE_MAX);
  });

  it("skor tüm sinyallerin toplamı", () => {
    const anchor = feat({
      productId: "anchor",
      primaryCategoryId: "cat1",
      parentCategoryId: "p1",
      brand: "Acme",
      salesMode: "PHYSICAL",
      priceMinor: 1000,
      currency: "TRY",
      attributeKeys: ["a:1"],
    });
    const candidate = feat({
      productId: "c",
      primaryCategoryId: "cat1",
      parentCategoryId: "p1",
      brand: "Acme",
      salesMode: "PHYSICAL",
      priceMinor: 1000,
      currency: "TRY",
      attributeKeys: ["a:1"],
    });
    const r = scoreCandidate(anchor, candidate);
    const expected =
      W.SUBCATEGORY + W.BRAND + W.SALES_MODE + W.PRICE_PROXIMITY_MAX + W.SHARED_ATTRIBUTE_EACH;
    expect(r.score).toBe(expected);
  });
});

describe("rankSimilar", () => {
  const anchor = feat({ productId: "anchor", primaryCategoryId: "cat1", parentCategoryId: "p1" });

  it("deterministik sıra: score DESC → createdAtMs DESC → productId ASC", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "a", primaryCategoryId: "cat1", parentCategoryId: "p1", createdAtMs: 100 }), // 40
      feat({ productId: "b", primaryCategoryId: "cat1", parentCategoryId: "p1", createdAtMs: 200 }), // 40, yeni
      feat({ productId: "c", primaryCategoryId: "cat2", parentCategoryId: "p1", createdAtMs: 300 }), // 18 (parent)
    ];
    const ranked = rankSimilar(anchor, candidates, 10);
    expect(ranked.map((r) => r.productId)).toEqual(["b", "a", "c"]);
  });

  it("skor+createdAt eşitliğinde productId ASC", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "y", primaryCategoryId: "cat1", createdAtMs: 500 }),
      feat({ productId: "x", primaryCategoryId: "cat1", createdAtMs: 500 }),
    ];
    const ranked = rankSimilar(anchor, candidates, 10);
    expect(ranked.map((r) => r.productId)).toEqual(["x", "y"]);
  });

  it("anchor productId elenir", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "anchor", primaryCategoryId: "cat1" }),
      feat({ productId: "a", primaryCategoryId: "cat1" }),
    ];
    const ranked = rankSimilar(anchor, candidates, 10);
    expect(ranked.map((r) => r.productId)).toEqual(["a"]);
  });

  it("aynı aday id'leri dedupe edilir", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "dup", primaryCategoryId: "cat1", createdAtMs: 1 }),
      feat({ productId: "dup", primaryCategoryId: "cat1", createdAtMs: 2 }),
    ];
    const ranked = rankSimilar(anchor, candidates, 10);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].productId).toBe("dup");
  });

  it("limit ile bounded", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "a", primaryCategoryId: "cat1", createdAtMs: 100 }),
      feat({ productId: "b", primaryCategoryId: "cat1", createdAtMs: 200 }),
      feat({ productId: "c", primaryCategoryId: "cat1", createdAtMs: 300 }),
    ];
    expect(rankSimilar(anchor, candidates, 2)).toHaveLength(2);
    expect(rankSimilar(anchor, candidates, 0)).toHaveLength(0);
  });

  it("aynı girdi → aynı çıktı (deterministik; iki kez çalıştır)", () => {
    const candidates: SimilarityFeatures[] = [
      feat({ productId: "c", primaryCategoryId: "cat2", parentCategoryId: "p1", createdAtMs: 300 }),
      feat({ productId: "b", primaryCategoryId: "cat1", parentCategoryId: "p1", createdAtMs: 200 }),
      feat({ productId: "a", primaryCategoryId: "cat1", parentCategoryId: "p1", createdAtMs: 100 }),
      feat({ productId: "z", brand: "None", createdAtMs: 999 }),
    ];
    const first = rankSimilar(anchor, candidates, 10);
    const second = rankSimilar(anchor, candidates, 10);
    expect(second).toEqual(first);
  });
});

import { describe, expect, it } from "vitest";
import { buildQuerySuggestions, buildCategoryPaths } from "../src/suggest-query.js";

/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Autocomplete SAF yardımcı birim testleri (DB YOK).
 * Gerçek SQL semantiği (relevance ORDER BY, prefix ILIKE, recursive CTE) Docker gerçek-PG smoke'ta.
 */

describe("buildQuerySuggestions", () => {
  it("prefix eşleşmelerini öne alır, marka'ları başlıklardan önce dener", () => {
    const out = buildQuerySuggestions({
      normalizedQ: "iph",
      brands: ["iPhone"],
      titles: ["iPhone 15 Pro", "Kılıf iPhone"],
      limit: 6,
    });
    // "iphone" (marka, prefix) → "iphone 15 pro" (başlık, prefix) → "kılıf iphone" (contains)
    expect(out).toEqual(["iPhone", "iPhone 15 Pro", "Kılıf iPhone"]);
  });

  it("normalize ile tekilleştirir (duplicate yok; ilk orijinal biçim korunur)", () => {
    const out = buildQuerySuggestions({
      normalizedQ: "kal",
      brands: [],
      titles: ["Kalem", "KALEM", "kalem "],
      limit: 6,
    });
    expect(out).toEqual(["Kalem"]);
  });

  it("kullanıcının yazdığının birebir aynısını önermez", () => {
    const out = buildQuerySuggestions({
      normalizedQ: "iphone",
      brands: ["iPhone"],
      titles: ["iPhone 15"],
      limit: 6,
    });
    expect(out).toEqual(["iPhone 15"]);
  });

  it("limit'e uyar ve limit<=0'da boş döner", () => {
    expect(
      buildQuerySuggestions({ normalizedQ: "a", brands: ["Adidas", "Apple"], titles: ["Ayakkabı"], limit: 2 }),
    ).toHaveLength(2);
    expect(buildQuerySuggestions({ normalizedQ: "a", brands: ["Adidas"], titles: [], limit: 0 })).toEqual([]);
  });

  it("boş/whitespace adayları atlar", () => {
    const out = buildQuerySuggestions({ normalizedQ: "x", brands: ["", "   "], titles: ["Xbox"], limit: 6 });
    expect(out).toEqual(["Xbox"]);
  });
});

describe("buildCategoryPaths", () => {
  const nodes = [
    { id: "root", slug: "elektronik", name: "Elektronik", parentId: null },
    { id: "mid", slug: "telefon", name: "Telefon", parentId: "root" },
    { id: "leaf", slug: "kilif", name: "Kılıf", parentId: "mid" },
  ];

  it("kök→yaprak breadcrumb kurar (kendisi son eleman)", () => {
    const paths = buildCategoryPaths(nodes, ["leaf"]);
    expect(paths.get("leaf")).toEqual([
      { slug: "elektronik", name: "Elektronik" },
      { slug: "telefon", name: "Telefon" },
      { slug: "kilif", name: "Kılıf" },
    ]);
  });

  it("kök kategori için tek elemanlı yol", () => {
    const paths = buildCategoryPaths(nodes, ["root"]);
    expect(paths.get("root")).toEqual([{ slug: "elektronik", name: "Elektronik" }]);
  });

  it("eksik ata durumunda kısmi yol (yaprağa kadar) döner", () => {
    const orphan = [{ id: "x", slug: "orphan", name: "Yetim", parentId: "missing" }];
    const paths = buildCategoryPaths(orphan, ["x"]);
    expect(paths.get("x")).toEqual([{ slug: "orphan", name: "Yetim" }]);
  });

  it("döngüsel parentId'de sonsuz walk yapmaz (guard)", () => {
    const cyclic = [
      { id: "a", slug: "a", name: "A", parentId: "b" },
      { id: "b", slug: "b", name: "B", parentId: "a" },
    ];
    const paths = buildCategoryPaths(cyclic, ["a"]);
    // Döngü guard'ı: sonlanır (birebir zincir uzunluğu implementasyona bağlı ama sonlu).
    expect(paths.get("a")!.length).toBeGreaterThan(0);
    expect(paths.get("a")!.length).toBeLessThanOrEqual(10);
  });
});

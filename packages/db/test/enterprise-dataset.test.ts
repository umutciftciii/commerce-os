/**
 * Enterprise Demo Dataset — SAF üreticinin (DB'siz) invariant testleri.
 * Determinizm, ölçek, benzersizlik, dağılım, required-attribute kapsamı, fiyat
 * invariant'ları, demo-store izolasyonu ve arama anahtar-kelime kapsamı.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs SAF üretici (tip yok; runtime import).
import { generateDataset } from "../scripts/enterprise/catalog.mjs";
// @ts-expect-error — .mjs özet.
import { summarize } from "../scripts/enterprise/summary.mjs";
// @ts-expect-error — .mjs sabitler.
import { STORE_ID } from "../scripts/enterprise/constants.mjs";

const ds = generateDataset();
const s = summarize(ds);

describe("determinizm & idempotency", () => {
  it("aynı tohum → birebir aynı dataset", () => {
    expect(JSON.stringify(generateDataset())).toEqual(JSON.stringify(ds));
  });
});

describe("ölçek hedefleri", () => {
  it("ürün ≥ 300", () => expect(ds.products.length).toBeGreaterThanOrEqual(300));
  it("kategori ≥ 30 (toplam)", () => expect(ds.categories.length).toBeGreaterThanOrEqual(30));
  it("marka ≥ 50 (kullanılan)", () => expect(s.brandsUsed).toBeGreaterThanOrEqual(50));
  it("varyant ≥ 2000", () => expect(ds.variants.length).toBeGreaterThanOrEqual(2000));
  it("çok varyantlı ve tek varyantlı ürünler birlikte var", () => {
    expect(s.products.singleVariant).toBeGreaterThan(0);
    expect(s.products.multiVariant).toBeGreaterThan(0);
  });
});

describe("benzersizlik", () => {
  const skus = ds.variants.map((v: any) => v.sku);
  const slugs = ds.products.map((p: any) => p.slug);
  const catSlugs = ds.categories.map((c: any) => c.slug);
  const titles = ds.products.map((p: any) => p.title);
  it("SKU benzersiz", () => expect(new Set(skus).size).toEqual(skus.length));
  it("ürün slug benzersiz", () => expect(new Set(slugs).size).toEqual(slugs.length));
  it("kategori slug benzersiz", () => expect(new Set(catSlugs).size).toEqual(catSlugs.length));
  it("ürün başlığı benzersiz", () => expect(new Set(titles).size).toEqual(titles.length));
});

describe("orphan yok / referans bütünlüğü", () => {
  const pids = new Set(ds.products.map((p: any) => p.id));
  const vids = new Set(ds.variants.map((v: any) => v.id));
  const cids = new Set(ds.categories.map((c: any) => c.id));
  it("her varyant geçerli ürüne bağlı", () => expect(ds.variants.every((v: any) => pids.has(v.productId))).toBe(true));
  it("her envanter kalemi geçerli varyanta bağlı", () => expect(ds.inventoryItems.every((i: any) => vids.has(i.variantId))).toBe(true));
  it("her variant-option değeri geçerli varyanta bağlı", () => expect(ds.variantOptionValues.every((v: any) => vids.has(v.variantId))).toBe(true));
  it("her kategori ataması geçerli kategoriye bağlı", () => expect(ds.categoryAssignments.every((a: any) => cids.has(a.categoryId))).toBe(true));
});

describe("envanter dağılımı gerçekçi bantta", () => {
  it("stokta ~%60-78", () => expect(s.inventory.inStockPct).toBeGreaterThanOrEqual(60) && expect(s.inventory.inStockPct).toBeLessThanOrEqual(78));
  it("düşük stok ~%8-18", () => { expect(s.inventory.lowPct).toBeGreaterThanOrEqual(8); expect(s.inventory.lowPct).toBeLessThanOrEqual(18); });
  it("stok yok ~%8-18", () => { expect(s.inventory.outPct).toBeGreaterThanOrEqual(8); expect(s.inventory.outPct).toBeLessThanOrEqual(18); });
  it("yüksek stok küçük oran", () => { expect(s.inventory.highPct).toBeGreaterThan(0); expect(s.inventory.highPct).toBeLessThanOrEqual(10); });
});

describe("kampanya dağılımı", () => {
  it("aktif/yaklaşan/sona ermiş/pasif senaryolar var", () => {
    expect(s.campaigns.byWindow.active).toBeGreaterThanOrEqual(5);
    expect(s.campaigns.byWindow.upcoming).toBeGreaterThanOrEqual(1);
    expect(s.campaigns.byWindow.ended).toBeGreaterThanOrEqual(1);
    expect(s.campaigns.byWindow.inactive).toBeGreaterThanOrEqual(1);
  });
  it("tüm rozet tipleri temsil edilir", () => {
    for (const t of ["AUTOMATIC_CART", "CATEGORY_DISCOUNT", "PRODUCT_DISCOUNT", "COUPON_CODE"]) {
      expect(s.campaigns.byType[t]).toBeGreaterThanOrEqual(1);
    }
  });
  it("yüzde ve sabit indirim birlikte", () => {
    expect(s.campaigns.byDiscount.PERCENT).toBeGreaterThan(0);
    expect(s.campaigns.byDiscount.FIXED_AMOUNT).toBeGreaterThan(0);
  });
  it("isPublic ↔ accessModel tutarlı", () => {
    for (const c of ds.campaigns) {
      const pub = c.accessModel === "AUTO_VISIBLE" || c.accessModel === "PUBLIC_CLAIMABLE";
      expect(c.isPublic).toBe(pub);
    }
  });
});

describe("required attribute kapsamı", () => {
  it("her ürün, birincil kategorisinin required (variant-defining olmayan) attribute'larını taşır", () => {
    const reqByCat = new Map<string, string[]>();
    for (const l of ds.attributes.categoryLinks) {
      if (l.required && !l.variantDefining) {
        if (!reqByCat.has(l.categoryId)) reqByCat.set(l.categoryId, []);
        reqByCat.get(l.categoryId)!.push(l.attributeDefinitionId);
      }
    }
    const pav = new Set(ds.productAttributeValues.map((v: any) => `${v.productId}|${v.attributeDefinitionId}`));
    let missing = 0;
    for (const p of ds.products) {
      for (const defId of reqByCat.get(p.primaryCategoryId) ?? []) {
        if (!pav.has(`${p.id}|${defId}`)) missing += 1;
      }
    }
    expect(missing).toBe(0);
  });
});

describe("variant-defining kombinasyon tutarlılığı", () => {
  it("her ürün içinde combinationKey benzersiz", () => {
    const byProduct = new Map<string, Set<string>>();
    for (const v of ds.variants) {
      if (!v.combinationKey) continue;
      if (!byProduct.has(v.productId)) byProduct.set(v.productId, new Set());
      const set = byProduct.get(v.productId)!;
      expect(set.has(v.combinationKey)).toBe(false);
      set.add(v.combinationKey);
    }
  });
  it("VOV sayısı = combinationKey eksen sayısı", () => {
    const vov = new Map<string, number>();
    for (const r of ds.variantOptionValues) vov.set(r.variantId, (vov.get(r.variantId) ?? 0) + 1);
    for (const v of ds.variants) {
      if (v.generationSource !== "ATTRIBUTE_COMBINATION") continue;
      const axisCount = v.combinationKey ? v.combinationKey.split("|").length - 1 : 0;
      expect(vov.get(v.id) ?? 0).toEqual(axisCount);
    }
  });
});

describe("fiyat invariant'ları", () => {
  it("fiyat > 0, cost ≤ fiyat, compareAt > fiyat, net+kdv = brüt", () => {
    for (const v of ds.variants) {
      expect(v.priceMinor).toBeGreaterThan(0);
      if (v.costMinor !== null) expect(v.costMinor).toBeLessThanOrEqual(v.priceMinor);
      if (v.compareAtMinor !== null) expect(v.compareAtMinor).toBeGreaterThan(v.priceMinor);
      expect(v.netPriceMinor + v.vatAmountMinor).toEqual(v.priceMinor);
    }
  });
});

describe("demo-store izolasyonu", () => {
  it("tüm satırlar STORE_ID scope'unda + edm- önekli id", () => {
    const scoped = [
      ...ds.categories, ...ds.products, ...ds.variants, ...ds.attributes.definitions,
      ...ds.warehouses, ...ds.inventoryItems, ...ds.campaigns,
    ];
    for (const row of scoped) {
      expect(row.storeId).toEqual(STORE_ID);
      expect(String(row.id).startsWith("edm-")).toBe(true);
    }
  });
});

describe("arama/autocomplete anahtar-kelime kapsamı", () => {
  const corpus = [
    ...ds.products.map((p: any) => `${p.title} ${p.description} ${p.brand}`),
    ...ds.attributes.options.map((o: any) => o.label),
  ]
    .join(" \n ")
    .toLowerCase();
  const queries = ["samsung", "apple", "laptop", "gaming", "siyah", "beyaz", "16 gb", "512 gb", "ssd", "ram", "bluetooth", "kadın", "erkek", "sneaker", "kahve makinesi"];
  for (const q of queries) {
    it(`"${q}" için eşleşme üretir`, () => expect(corpus.includes(q)).toBe(true));
  }
  it("zero-result sorgusu için eşleşme YOK", () => expect(corpus.includes("zzzxqwbilinmeyen")).toBe(false));
});

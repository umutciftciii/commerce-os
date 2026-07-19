import { describe, expect, it, vi } from "vitest";

// postgres-provider → data.js → @commerce-os/db (prisma). Testte gerçek prisma init'ini engelle.
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { createPostgresSearchProvider } = await import("../src/postgres-provider.js");
import type { SearchDataAccess } from "../src/data.js";
import type { IndexStatus, SearchBuildResult, SearchSourceProduct } from "../src/types.js";

/**
 * TODO-154 (ADR-079) — Faz 2C-8A · PostgresSearchProvider orkestrasyon testleri.
 * Fake SearchDataAccess ile: cross-tenant remove, idempotent, batch (found/missing/poison), rebuild
 * cursor, backfill alias, status. buildSearchDocument (SAF) gerçek kod yolunda çalışır.
 */

function activeSource(id: string, storeId: string): SearchSourceProduct {
  return {
    id,
    storeId,
    title: `Ürün ${id}`,
    slug: id,
    brand: "Marka",
    description: null,
    status: "ACTIVE",
    priceVisible: true,
    primaryCategoryId: "cat_1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    variants: [
      {
        id: `${id}_v`,
        status: "ACTIVE",
        priceMinor: 1000,
        compareAtMinor: null,
        currency: "TRY",
        available: 4,
        lowestRecentPriceMinor: null,
        mediaOptionId: null,
      },
    ],
    categoryAttributes: [
      {
        attributeDefinitionId: "def_1",
        filterable: true,
        searchable: false,
        variantDefining: false,
        code: "renk",
        name: "Renk",
        dataType: "SELECT",
        definitionStatus: "ACTIVE",
      },
    ],
    productAttributeValues: [
      {
        attributeDefinitionId: "def_1",
        valueText: null,
        valueInteger: null,
        valueDecimal: null,
        valueBoolean: null,
        valueDate: null,
        option: { id: "opt_1", value: "kırmızı", label: "Kırmızı", status: "ACTIVE" },
        multiOptions: [],
      },
    ],
    variantAttributeValues: [],
    mediaDefiningAttributeId: null,
    images: [],
    mediaAxisOptions: [],
  };
}

class FakeDataAccess implements SearchDataAccess {
  sources = new Map<string, SearchSourceProduct>();
  docs = new Map<string, { revision: number; facetCount: number }>();
  removed: string[] = [];
  poison = new Set<string>();

  add(s: SearchSourceProduct) {
    this.sources.set(s.id, s);
  }

  async loadSources(storeId: string, productIds: string[]) {
    const map = new Map<string, SearchSourceProduct>();
    for (const id of productIds) {
      const s = this.sources.get(id);
      if (s && s.storeId === storeId) map.set(id, s); // tenant isolation
    }
    return map;
  }

  async applyBuild(_storeId: string, productId: string, result: SearchBuildResult) {
    if (this.poison.has(productId)) throw new Error("poison product");
    if (result.removed) {
      await this.removeProduct(_storeId, productId);
      return { action: "removed" as const, facetCount: 0 };
    }
    const prev = this.docs.get(productId);
    this.docs.set(productId, {
      revision: prev ? prev.revision + 1 : 0,
      facetCount: result.facets.length,
    });
    return { action: "indexed" as const, facetCount: result.facets.length };
  }

  async removeProduct(_storeId: string, productId: string) {
    this.docs.delete(productId);
    this.removed.push(productId);
  }

  async scanProductIds(storeId: string, afterId: string | null, batchSize: number) {
    const ids = [...this.sources.values()]
      .filter((s) => s.storeId === storeId)
      .map((s) => s.id)
      .sort();
    const start = afterId ? ids.findIndex((id) => id > afterId) : 0;
    if (start === -1) return [];
    return ids.slice(start, start + batchSize);
  }

  async getIndexStatus(storeId: string): Promise<IndexStatus> {
    return {
      storeId,
      documentCount: this.docs.size,
      facetCount: [...this.docs.values()].reduce((a, d) => a + d.facetCount, 0),
      lastIndexedAt: null,
    };
  }
}

function provider(data: FakeDataAccess) {
  return createPostgresSearchProvider({} as never, { dataAccess: data, batchSize: 2 });
}

describe("PostgresSearchProvider · indexProduct", () => {
  it("ACTIVE ürünü indeksler (facetCount döner)", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    const out = await provider(data).indexProduct("store_1", "p1");
    expect(out.action).toBe("indexed");
    expect(out.facetCount).toBe(1);
    expect(data.docs.has("p1")).toBe(true);
  });

  it("başka mağazadan istenirse indekslemez, remove eder (cross-tenant reddi)", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    const out = await provider(data).indexProduct("store_2", "p1");
    expect(out.action).toBe("removed");
    expect(data.docs.has("p1")).toBe(false);
    expect(data.removed).toContain("p1");
  });

  it("ürün yoksa güvenli remove (no-op)", async () => {
    const data = new FakeDataAccess();
    const out = await provider(data).indexProduct("store_1", "ghost");
    expect(out.action).toBe("removed");
  });

  it("DRAFT ürün remove'a düşer", async () => {
    const data = new FakeDataAccess();
    data.add({ ...activeSource("p1", "store_1"), status: "DRAFT" });
    const out = await provider(data).indexProduct("store_1", "p1");
    expect(out.action).toBe("removed");
    expect(data.docs.has("p1")).toBe(false);
  });

  it("idempotent — iki kez indeksleme tek doküman (revision artar)", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    await provider(data).indexProduct("store_1", "p1");
    await provider(data).indexProduct("store_1", "p1");
    expect(data.docs.size).toBe(1);
    expect(data.docs.get("p1")?.revision).toBe(1);
  });
});

describe("PostgresSearchProvider · indexProducts (batch)", () => {
  it("found→indexed, missing→removed sayaçları", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    data.add(activeSource("p2", "store_1"));
    const out = await provider(data).indexProducts("store_1", ["p1", "p2", "ghost"]);
    expect(out.scanned).toBe(3);
    expect(out.indexed).toBe(2);
    expect(out.removed).toBe(1);
    expect(out.failed).toBe(0);
  });

  it("poison ürün batch'i düşürmez (izolasyon; failed sayacı)", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    data.add(activeSource("poison_1", "store_1"));
    data.poison.add("poison_1");
    const out = await provider(data).indexProducts("store_1", ["p1", "poison_1"]);
    expect(out.indexed).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.errors[0].productId).toBe("poison_1");
    expect(out.errors[0].message).toContain("poison");
  });
});

describe("PostgresSearchProvider · rebuild/backfill/status", () => {
  it("rebuildStore cursor ile tüm mağazayı tarar (batchSize=2 → çok chunk)", async () => {
    const data = new FakeDataAccess();
    for (let i = 0; i < 5; i += 1) data.add(activeSource(`p${i}`, "store_1"));
    data.add(activeSource("other", "store_2")); // başka mağaza — dahil edilmemeli
    const report = await provider(data).rebuildStore("store_1");
    expect(report.scanned).toBe(5);
    expect(report.indexed).toBe(5);
    expect(report.batches).toBeGreaterThanOrEqual(3);
    expect(data.docs.has("other")).toBe(false);
  });

  it("productIds verilirse yalnız onları hedefler", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    data.add(activeSource("p2", "store_1"));
    const report = await provider(data).rebuildStore("store_1", { productIds: ["p1"] });
    expect(report.scanned).toBe(1);
    expect(report.indexed).toBe(1);
    expect(data.docs.has("p2")).toBe(false);
  });

  it("backfillStore == rebuildStore (alias)", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    const report = await provider(data).backfillStore("store_1");
    expect(report.indexed).toBe(1);
  });

  it("getIndexStatus data katmanını yansıtır", async () => {
    const data = new FakeDataAccess();
    data.add(activeSource("p1", "store_1"));
    await provider(data).indexProduct("store_1", "p1");
    const status = await provider(data).getIndexStatus("store_1");
    expect(status.documentCount).toBe(1);
    expect(status.facetCount).toBe(1);
  });
});

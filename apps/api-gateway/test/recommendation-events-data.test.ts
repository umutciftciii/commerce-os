/**
 * TD-130 (ADR-146/148) — Recommendation event veri katmanı testleri (fake PrismaClient).
 *
 * Kapsam: ürün store-sahipliği · summarize agregasyon · **KVKK erasure `deleteForCustomer`** (tenant-scoped;
 * guest/diğer müşteri/diğer store event'lerine dokunmaz). deleteForCustomer, ileri hard-deletion akışının
 * çağıracağı erasure primitifidir (customerId FK'siz → DB Cascade kapsamaz).
 */
import { describe, expect, it, vi } from "vitest";
import { createRecommendationEventData } from "../src/recommendation-events/data.js";

interface Row {
  id: string;
  storeId: string;
  customerId: string | null;
  visitorHash: string | null;
  productId: string;
}

function fakeDb(rows: Row[], products: Array<{ id: string; storeId: string }> = []) {
  let store = [...rows];
  const db = {
    product: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string } }) =>
        products.find((p) => p.id === where.id && p.storeId === where.storeId) ?? null,
      ),
    },
    recommendationEvent: {
      deleteMany: vi.fn(async ({ where }: { where: { storeId: string; customerId: string } }) => {
        const before = store.length;
        store = store.filter((r) => !(r.storeId === where.storeId && r.customerId === where.customerId));
        return { count: before - store.length };
      }),
      groupBy: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "x" })),
    },
  };
  return { db, remaining: () => store };
}

describe("recommendation data: productBelongsToStore", () => {
  it("ürün store'a aitse true, değilse false (cross-store guard)", async () => {
    const { db } = fakeDb([], [{ id: "p1", storeId: "s1" }]);
    const data = createRecommendationEventData(db as never);
    expect(await data.productBelongsToStore("s1", "p1")).toBe(true);
    expect(await data.productBelongsToStore("s2", "p1")).toBe(false);
    expect(await data.productBelongsToStore("s1", "nope")).toBe(false);
  });
});

describe("recommendation data: deleteForCustomer (KVKK erasure)", () => {
  const seed = (): Row[] => [
    { id: "e1", storeId: "s1", customerId: "c1", visitorHash: null, productId: "p1" }, // hedef
    { id: "e2", storeId: "s1", customerId: "c1", visitorHash: null, productId: "p2" }, // hedef
    { id: "e3", storeId: "s1", customerId: "c2", visitorHash: null, productId: "p3" }, // başka müşteri
    { id: "e4", storeId: "s1", customerId: null, visitorHash: "vhash", productId: "p4" }, // guest
    { id: "e5", storeId: "s2", customerId: "c1", visitorHash: null, productId: "p5" }, // başka store, aynı customerId
  ];

  it("yalnız (storeId, customerId) event'lerini siler; guest/diğer müşteri/diğer store KORUNUR", async () => {
    const { db, remaining } = fakeDb(seed());
    const data = createRecommendationEventData(db as never);
    const deleted = await data.deleteForCustomer("s1", "c1");
    expect(deleted).toBe(2);
    const left = remaining();
    expect(left.map((r) => r.id).sort()).toEqual(["e3", "e4", "e5"]); // c2 + guest + s2/c1 korunur
    // Guest event (visitorHash-only) silinmedi:
    expect(left.some((r) => r.id === "e4" && r.visitorHash === "vhash")).toBe(true);
    // Cross-store: s2'deki aynı customerId etkilenmedi:
    expect(left.some((r) => r.id === "e5" && r.storeId === "s2")).toBe(true);
    // deleteMany tam olarak {storeId, customerId} ile çağrıldı (tenant-scoped):
    expect(db.recommendationEvent.deleteMany).toHaveBeenCalledWith({ where: { storeId: "s1", customerId: "c1" } });
  });

  it("eşleşme yoksa 0 döner, hiçbir satıra dokunmaz", async () => {
    const { db, remaining } = fakeDb(seed());
    const data = createRecommendationEventData(db as never);
    expect(await data.deleteForCustomer("s1", "unknown")).toBe(0);
    expect(remaining()).toHaveLength(5);
  });
});

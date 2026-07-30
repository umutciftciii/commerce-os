/**
 * TODO-162 (ADR-205) — Home Discovery event veri katmanı testleri (fake PrismaClient).
 *
 * Kapsam: section store-sahipliği (yalnız enabled) · ürün store-sahipliği · summarize agregasyon (5 event tipi
 * + sectionType/eligibilitySource kırılımı) · **KVKK erasure `deleteForCustomer`** (tenant-scoped; guest/diğer
 * müşteri/diğer store event'lerine dokunmaz). RecommendationEvent veri katmanından bağımsız (ayrı tablo).
 */
import { describe, expect, it, vi } from "vitest";
import { createDiscoveryEventData } from "../src/home/discovery-event-data.js";

interface Row {
  id: string;
  storeId: string;
  customerId: string | null;
  visitorHash: string | null;
  sectionId: string;
  sectionType: string;
  eligibilitySource: string;
  eventType: string;
}

function fakeDb(
  rows: Row[],
  opts: {
    products?: Array<{ id: string; storeId: string }>;
    sections?: Array<{ id: string; storeId: string; type: string; enabled: boolean }>;
    groupBy?: Array<{ eventType: string; sectionType: string; eligibilitySource: string; _count: { _all: number } }>;
  } = {},
) {
  let store = [...rows];
  const db = {
    product: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string } }) =>
        (opts.products ?? []).find((p) => p.id === where.id && p.storeId === where.storeId) ?? null,
      ),
    },
    homeSection: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string; enabled: boolean } }) => {
        const s = (opts.sections ?? []).find(
          (x) => x.id === where.id && x.storeId === where.storeId && x.enabled === where.enabled,
        );
        return s ? { type: s.type } : null;
      }),
    },
    homeDiscoveryEvent: {
      deleteMany: vi.fn(async ({ where }: { where: { storeId: string; customerId: string } }) => {
        const before = store.length;
        store = store.filter((r) => !(r.storeId === where.storeId && r.customerId === where.customerId));
        return { count: before - store.length };
      }),
      groupBy: vi.fn(async () => opts.groupBy ?? []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "x" })),
    },
  };
  return { db, remaining: () => store };
}

describe("discovery data: sectionTypeForStore", () => {
  it("enabled + store'a ait section'ın type'ını döner; değilse null", async () => {
    const { db } = fakeDb([], {
      sections: [
        { id: "sec_1", storeId: "s1", type: "CONTINUE_BROWSING", enabled: true },
        { id: "sec_2", storeId: "s1", type: "DAILY_DEALS", enabled: false }, // disabled
      ],
    });
    const data = createDiscoveryEventData(db as never);
    expect(await data.sectionTypeForStore("s1", "sec_1")).toBe("CONTINUE_BROWSING");
    expect(await data.sectionTypeForStore("s1", "sec_2")).toBeNull(); // enabled=false → yok
    expect(await data.sectionTypeForStore("s2", "sec_1")).toBeNull(); // cross-store
    expect(await data.sectionTypeForStore("s1", "nope")).toBeNull();
  });
});

describe("discovery data: productBelongsToStore", () => {
  it("ürün store'a aitse true, değilse false (cross-store guard)", async () => {
    const { db } = fakeDb([], { products: [{ id: "p1", storeId: "s1" }] });
    const data = createDiscoveryEventData(db as never);
    expect(await data.productBelongsToStore("s1", "p1")).toBe(true);
    expect(await data.productBelongsToStore("s2", "p1")).toBe(false);
    expect(await data.productBelongsToStore("s1", "nope")).toBe(false);
  });
});

describe("discovery data: summarize agregasyon", () => {
  it("5 event tipini totals + sectionType/eligibilitySource kovaları halinde toplar", async () => {
    const { db } = fakeDb([], {
      groupBy: [
        { eventType: "SECTION_IMPRESSION", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", _count: { _all: 10 } },
        { eventType: "CARD_IMPRESSION", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", _count: { _all: 40 } },
        { eventType: "PRODUCT_CLICK", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", _count: { _all: 8 } },
        { eventType: "CTA_CLICK", sectionType: "EDITORIAL_CAMPAIGN", eligibilitySource: "EDITORIAL", _count: { _all: 3 } },
        { eventType: "ADD_TO_CART", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", _count: { _all: 2 } },
      ],
    });
    const data = createDiscoveryEventData(db as never);
    const out = await data.summarize({ storeId: "s1", from: new Date(0), to: new Date() });
    expect(out.totals).toEqual({
      key: "__totals__",
      sectionImpressions: 10,
      cardImpressions: 40,
      productClicks: 8,
      ctaClicks: 3,
      addToCart: 2,
    });
    // İki farklı sectionType kovası (alfabetik sıralı).
    expect(out.bySectionType.map((b) => b.key)).toEqual(["CONTINUE_BROWSING", "EDITORIAL_CAMPAIGN"]);
    const cb = out.bySectionType.find((b) => b.key === "CONTINUE_BROWSING")!;
    expect(cb.cardImpressions).toBe(40);
    expect(cb.productClicks).toBe(8);
    const ed = out.byEligibilitySource.find((b) => b.key === "EDITORIAL")!;
    expect(ed.ctaClicks).toBe(3);
  });
});

describe("discovery data: deleteForCustomer (KVKK erasure)", () => {
  const seed = (): Row[] => [
    { id: "e1", storeId: "s1", customerId: "c1", visitorHash: null, sectionId: "sec", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", eventType: "CARD_IMPRESSION" },
    { id: "e2", storeId: "s1", customerId: "c1", visitorHash: null, sectionId: "sec", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", eventType: "PRODUCT_CLICK" },
    { id: "e3", storeId: "s1", customerId: "c2", visitorHash: null, sectionId: "sec", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", eventType: "CARD_IMPRESSION" },
    { id: "e4", storeId: "s1", customerId: null, visitorHash: "vhash", sectionId: "sec", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED", eventType: "SECTION_IMPRESSION" },
    { id: "e5", storeId: "s2", customerId: "c1", visitorHash: null, sectionId: "sec", sectionType: "DAILY_DEALS", eligibilitySource: "DISCOUNTED_CATALOG", eventType: "CARD_IMPRESSION" },
  ];

  it("yalnız (storeId, customerId) event'lerini siler; guest/diğer müşteri/diğer store KORUNUR", async () => {
    const { db, remaining } = fakeDb(seed());
    const data = createDiscoveryEventData(db as never);
    const deleted = await data.deleteForCustomer("s1", "c1");
    expect(deleted).toBe(2);
    const left = remaining();
    expect(left.map((r) => r.id).sort()).toEqual(["e3", "e4", "e5"]);
    expect(left.some((r) => r.id === "e4" && r.visitorHash === "vhash")).toBe(true);
    expect(left.some((r) => r.id === "e5" && r.storeId === "s2")).toBe(true);
    expect(db.homeDiscoveryEvent.deleteMany).toHaveBeenCalledWith({ where: { storeId: "s1", customerId: "c1" } });
  });

  it("eşleşme yoksa 0 döner, hiçbir satıra dokunmaz", async () => {
    const { db, remaining } = fakeDb(seed());
    const data = createDiscoveryEventData(db as never);
    expect(await data.deleteForCustomer("s1", "unknown")).toBe(0);
    expect(remaining()).toHaveLength(5);
  });
});

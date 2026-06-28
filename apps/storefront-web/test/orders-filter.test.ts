import { describe, expect, it } from "vitest";
import type { CustomerOrderSummary } from "@commerce-os/api-client";
import {
  applyOrderFilters,
  canWriteReview,
  filterOrdersByTab,
  resolveOrdersTab,
  returnEligibility,
  searchOrders,
} from "../lib/orders";

/**
 * TODO-079 — Hesabım > Siparişlerim saf yardımcı testleri. Arama/sekme filtreleme
 * ve post-order CTA görünürlük kuralları (iade 15 gün penceresi, yorum teslimat
 * sonrası) deterministik doğrulanır.
 */
function order(overrides: Partial<CustomerOrderSummary> = {}): CustomerOrderSummary {
  return {
    orderNumber: "OS-1",
    status: "PLACED",
    paymentStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    currency: "TRY",
    totalMinor: 1000,
    itemCount: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    lines: [
      { variantId: "v1", productSlug: "hoodie", sku: "HD-M", title: "Hoodie", variantTitle: "M", quantity: 1 },
    ],
    ...overrides,
  };
}

describe("resolveOrdersTab", () => {
  it("falls back to 'all' for unknown values", () => {
    expect(resolveOrdersTab(undefined)).toBe("all");
    expect(resolveOrdersTab("bogus")).toBe("all");
    expect(resolveOrdersTab("buy-again")).toBe("buy-again");
    expect(resolveOrdersTab("not-shipped")).toBe("not-shipped");
  });
});

describe("filterOrdersByTab", () => {
  const cancelled = order({ orderNumber: "C", status: "CANCELLED" });
  const draft = order({ orderNumber: "D", status: "DRAFT" });
  const shipped = order({ orderNumber: "S", status: "FULFILLED", fulfillmentStatus: "FULFILLED" });
  const pending = order({ orderNumber: "P", fulfillmentStatus: "UNFULFILLED" });
  const orders = [cancelled, draft, shipped, pending];

  it("all → returns everything", () => {
    expect(filterOrdersByTab(orders, "all")).toHaveLength(4);
  });

  it("buy-again → excludes cancelled/draft", () => {
    const result = filterOrdersByTab(orders, "buy-again").map((o) => o.orderNumber);
    expect(result).toEqual(["S", "P"]);
  });

  it("not-shipped → unfulfilled/partial, non-cancelled", () => {
    const result = filterOrdersByTab(orders, "not-shipped").map((o) => o.orderNumber);
    expect(result).toEqual(["D", "P"]);
  });
});

describe("searchOrders", () => {
  const orders = [
    order({ orderNumber: "OS-100" }),
    order({
      orderNumber: "OS-200",
      lines: [
        { variantId: "v2", productSlug: "mug", sku: "MUG-RED", title: "Kupa", variantTitle: "Kırmızı", quantity: 1 },
      ],
    }),
  ];

  it("matches by order number", () => {
    expect(searchOrders(orders, "OS-100").map((o) => o.orderNumber)).toEqual(["OS-100"]);
  });

  it("matches by product title", () => {
    expect(searchOrders(orders, "kupa").map((o) => o.orderNumber)).toEqual(["OS-200"]);
  });

  it("matches by SKU", () => {
    expect(searchOrders(orders, "MUG-RED").map((o) => o.orderNumber)).toEqual(["OS-200"]);
  });

  it("empty query returns all", () => {
    expect(searchOrders(orders, "  ")).toHaveLength(2);
  });

  it("no match returns empty", () => {
    expect(searchOrders(orders, "zzz")).toHaveLength(0);
  });
});

describe("applyOrderFilters", () => {
  it("combines tab + search", () => {
    const orders = [
      order({ orderNumber: "A", status: "CANCELLED" }),
      order({ orderNumber: "B", status: "FULFILLED", fulfillmentStatus: "FULFILLED" }),
    ];
    const result = applyOrderFilters(orders, { tab: "buy-again", query: "B" });
    expect(result.map((o) => o.orderNumber)).toEqual(["B"]);
  });
});

describe("returnEligibility", () => {
  const now = new Date("2026-06-20T00:00:00.000Z");

  it("visible within 15 days for fulfilled order", () => {
    const o = order({ fulfillmentStatus: "FULFILLED", createdAt: "2026-06-10T00:00:00.000Z" });
    expect(returnEligibility(o, now)).toEqual({ visible: true, windowExpired: false });
  });

  it("window expired after 15 days", () => {
    const o = order({ fulfillmentStatus: "FULFILLED", createdAt: "2026-05-01T00:00:00.000Z" });
    expect(returnEligibility(o, now)).toEqual({ visible: true, windowExpired: true });
  });

  it("not visible when not shipped yet", () => {
    const o = order({ fulfillmentStatus: "UNFULFILLED", createdAt: "2026-06-19T00:00:00.000Z" });
    expect(returnEligibility(o, now).visible).toBe(false);
  });

  it("not visible when cancelled or refunded", () => {
    expect(returnEligibility(order({ status: "CANCELLED", fulfillmentStatus: "FULFILLED" }), now).visible).toBe(
      false,
    );
    expect(
      returnEligibility(order({ paymentStatus: "REFUNDED", fulfillmentStatus: "FULFILLED" }), now).visible,
    ).toBe(false);
  });
});

describe("canWriteReview", () => {
  it("only when delivered (FULFILLED)", () => {
    expect(canWriteReview(order({ fulfillmentStatus: "FULFILLED" }))).toBe(true);
    expect(canWriteReview(order({ fulfillmentStatus: "PARTIAL" }))).toBe(false);
    expect(canWriteReview(order({ fulfillmentStatus: "UNFULFILLED" }))).toBe(false);
  });
});

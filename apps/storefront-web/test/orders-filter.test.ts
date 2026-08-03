import { describe, expect, it } from "vitest";
import type { CustomerOrderSummary } from "@commerce-os/api-client";
import {
  applyOrderFilters,
  canRequestReturn,
  canWriteReview,
  filterOrdersByTab,
  resolveOrdersTab,
  searchOrders,
} from "../lib/orders";

/**
 * TODO-079 / TODO-169 — Hesabım > Siparişlerim saf yardımcı testleri. Arama/sekme
 * filtreleme ve post-order CTA görünürlük kuralları deterministik doğrulanır. İade
 * CTA'sı artık yalnız GÖRÜNÜRLÜK kapısıdır (15 gün pencere tahmini KALDIRILDI;
 * gerçek uygunluk sunucudan gelir).
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
    shipmentStatus: null,
    lines: [
      {
        variantId: "v1", productSlug: "hoodie", sku: "HD-M", title: "Hoodie", variantTitle: "M", quantity: 1, imageUrl: null,
        // TODO-165 (ADR-252) — moda snapshot; fashion-dışı satırda null (pre-existing PR#158 fixture drift, gate greened).
        selectedColor: null, selectedColorHex: null, selectedSize: null, sizeSystem: null,
        swatchLabel: null, materialSummary: null, variantDisplayName: null,
      },
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
        {
          variantId: "v2", productSlug: "mug", sku: "MUG-RED", title: "Kupa", variantTitle: "Kırmızı", quantity: 1, imageUrl: null,
          selectedColor: null, selectedColorHex: null, selectedSize: null, sizeSystem: null,
          swatchLabel: null, materialSummary: null, variantDisplayName: null,
        },
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

describe("canRequestReturn", () => {
  it("visible for a shipped (FULFILLED/PARTIAL) order regardless of age", () => {
    expect(canRequestReturn(order({ fulfillmentStatus: "FULFILLED" }))).toBe(true);
    expect(canRequestReturn(order({ fulfillmentStatus: "PARTIAL" }))).toBe(true);
    // Yaş artık istemcide değerlendirilmez (pencere kararı sunucuda).
    expect(
      canRequestReturn(order({ fulfillmentStatus: "FULFILLED", createdAt: "2020-01-01T00:00:00.000Z" })),
    ).toBe(true);
  });

  it("not visible when not shipped yet", () => {
    expect(canRequestReturn(order({ fulfillmentStatus: "UNFULFILLED" }))).toBe(false);
  });

  it("not visible when cancelled or refunded", () => {
    expect(canRequestReturn(order({ status: "CANCELLED", fulfillmentStatus: "FULFILLED" }))).toBe(false);
    expect(canRequestReturn(order({ paymentStatus: "REFUNDED", fulfillmentStatus: "FULFILLED" }))).toBe(false);
  });
});

describe("canWriteReview", () => {
  it("only when delivered (FULFILLED)", () => {
    expect(canWriteReview(order({ fulfillmentStatus: "FULFILLED" }))).toBe(true);
    expect(canWriteReview(order({ fulfillmentStatus: "PARTIAL" }))).toBe(false);
    expect(canWriteReview(order({ fulfillmentStatus: "UNFULFILLED" }))).toBe(false);
  });
});

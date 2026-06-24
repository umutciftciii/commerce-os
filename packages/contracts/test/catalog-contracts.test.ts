import { describe, expect, it } from "vitest";
import {
  inventoryAdjustRequestSchema,
  orderCreateRequestSchema,
  orderSchema,
  productCreateRequestSchema,
  productVariantCreateRequestSchema,
} from "../src/index.js";

describe("catalog contracts", () => {
  it("parses product create input with category ids", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      status: "ACTIVE",
      categoryIds: ["cat_1"],
    });
    expect(parsed).toMatchObject({ type: "PHYSICAL", categoryIds: ["cat_1"] });
  });

  it("requires minor-unit integer prices and compare-at not below price", () => {
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Default",
        sku: "SKU-1",
        priceMinor: 1299.5,
      }),
    ).toThrow();
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Default",
        sku: "SKU-1",
        priceMinor: 129900,
        compareAtMinor: 99900,
      }),
    ).toThrow();
  });

  it("accepts positive and negative non-zero inventory adjustments", () => {
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: 5 }).quantityDelta).toBe(5);
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: -2 }).quantityDelta).toBe(-2);
    expect(() => inventoryAdjustRequestSchema.parse({ quantityDelta: 0 })).toThrow();
  });

  it("parses order create input and rejects invalid email or quantity", () => {
    const parsed = orderCreateRequestSchema.parse({
      customerEmail: "buyer@example.com",
      lines: [{ variantId: "variant_1", quantity: 1 }],
    });
    expect(parsed).toMatchObject({ currency: "TRY", lines: [{ quantity: 1 }] });
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "not-an-email",
        lines: [{ variantId: "variant_1", quantity: 1 }],
      }),
    ).toThrow();
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "buyer@example.com",
        lines: [{ variantId: "variant_1", quantity: 0 }],
      }),
    ).toThrow();
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "buyer@example.com",
        lines: [{ variantId: "variant_1", quantity: 10001 }],
      }),
    ).toThrow();
  });

  it("parses order responses with line snapshots and reservations", () => {
    const now = new Date().toISOString();
    const parsed = orderSchema.parse({
      id: "order_1",
      storeId: "store_1",
      orderNumber: "OS-000001",
      customerId: null,
      customerEmail: "buyer@example.com",
      currency: "TRY",
      status: "PLACED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      subtotalAmount: 1000,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: 1000,
      placedAt: now,
      cancelledAt: null,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      lines: [{
        id: "line_1",
        storeId: "store_1",
        orderId: "order_1",
        productId: "product_1",
        variantId: "variant_1",
        sku: "SKU-1",
        title: "Snapshot Product",
        variantTitle: "Default",
        quantity: 1,
        unitPriceAmount: 1000,
        totalAmount: 1000,
        currency: "TRY",
        createdAt: now,
      }],
      reservations: [{
        id: "reservation_1",
        storeId: "store_1",
        orderId: "order_1",
        orderLineId: "line_1",
        variantId: "variant_1",
        quantity: 1,
        status: "ACTIVE",
        expiresAt: null,
        releasedAt: null,
        consumedAt: null,
        createdAt: now,
        updatedAt: now,
      }],
      addresses: [],
      events: [],
    });
    expect(parsed.lines[0]?.sku).toBe("SKU-1");
    expect(parsed.reservations[0]?.status).toBe("ACTIVE");
  });
});

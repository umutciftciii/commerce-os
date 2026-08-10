import { describe, it, expect } from "vitest";
import {
  addMonthsUtc,
  computeWarrantyEligibility,
} from "../src/product-support/warranty";

const ORDER_CREATED = new Date("2026-01-01T00:00:00.000Z");

describe("warranty eligibility (ADR-289 §7, deterministic)", () => {
  it("uses the delivered anchor when a delivery date exists", () => {
    const r = computeWarrantyEligibility({
      warrantyMonths: 12,
      deliveredAt: new Date("2026-02-10T00:00:00.000Z"),
      orderCreatedAt: ORDER_CREATED,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(r.anchorSource).toBe("SHIPMENT_DELIVERED");
    expect(r.warrantyEndsAt?.toISOString()).toBe("2027-02-10T00:00:00.000Z");
    expect(r.inWarranty).toBe(true);
  });

  it("falls back to order.createdAt when there is no delivery date", () => {
    const r = computeWarrantyEligibility({
      warrantyMonths: 6,
      deliveredAt: null,
      orderCreatedAt: ORDER_CREATED,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(r.anchorSource).toBe("ORDER_CREATED");
    expect(r.warrantyEndsAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(r.inWarranty).toBe(true);
  });

  it("returns no gating when warrantyMonths is null (escalation stays open)", () => {
    const r = computeWarrantyEligibility({
      warrantyMonths: null,
      deliveredAt: new Date("2026-02-10T00:00:00.000Z"),
      orderCreatedAt: ORDER_CREATED,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(r).toEqual({ warrantyEndsAt: null, anchorSource: "NONE", inWarranty: null });
  });

  it("reports expired warranty but never blocks (still returns endsAt)", () => {
    const r = computeWarrantyEligibility({
      warrantyMonths: 12,
      deliveredAt: new Date("2024-02-10T00:00:00.000Z"),
      orderCreatedAt: ORDER_CREATED,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(r.anchorSource).toBe("SHIPMENT_DELIVERED");
    expect(r.warrantyEndsAt?.toISOString()).toBe("2025-02-10T00:00:00.000Z");
    expect(r.inWarranty).toBe(false);
  });

  it("clamps calendar-month overflow (Jan 31 + 1 month = Feb 28)", () => {
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    // leap year Feb
    expect(addMonthsUtc(new Date("2028-01-31T00:00:00.000Z"), 1).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("is pure — does not mutate the input dates", () => {
    const delivered = new Date("2026-02-10T00:00:00.000Z");
    computeWarrantyEligibility({
      warrantyMonths: 12,
      deliveredAt: delivered,
      orderCreatedAt: ORDER_CREATED,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(delivered.toISOString()).toBe("2026-02-10T00:00:00.000Z");
    expect(ORDER_CREATED.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

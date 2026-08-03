import { describe, it, expect } from "vitest";
import {
  computeLineEligibility,
  computeReturnWindowEnd,
  isOrderReturnable,
  resolveDeliveryAnchor,
  type ShipmentEligibilityInput,
} from "../src/returns/eligibility";

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(iso);

describe("returns eligibility (ADR-269 §2)", () => {
  it("no delivered shipment → not returnable, null anchor", () => {
    const shipments: ShipmentEligibilityInput[] = [
      { status: "IN_TRANSIT", deliveredAt: null, updatedAt: d("2026-08-01T00:00:00Z") },
    ];
    expect(resolveDeliveryAnchor(shipments)).toBeNull();
    expect(isOrderReturnable(shipments)).toBe(false);
  });

  it("delivery anchor = max deliveredAt across delivered shipments", () => {
    const shipments: ShipmentEligibilityInput[] = [
      { status: "DELIVERED", deliveredAt: d("2026-08-01T00:00:00Z"), updatedAt: d("2026-08-01T10:00:00Z") },
      { status: "DELIVERED", deliveredAt: d("2026-08-03T00:00:00Z"), updatedAt: d("2026-08-03T10:00:00Z") },
      { status: "IN_TRANSIT", deliveredAt: null, updatedAt: d("2026-08-05T00:00:00Z") },
    ];
    expect(resolveDeliveryAnchor(shipments)).toEqual(d("2026-08-03T00:00:00Z"));
  });

  it("falls back to updatedAt when a delivered shipment lacks deliveredAt (legacy)", () => {
    const shipments: ShipmentEligibilityInput[] = [
      { status: "DELIVERED", deliveredAt: null, updatedAt: d("2026-07-20T09:00:00Z") },
    ];
    expect(resolveDeliveryAnchor(shipments)).toEqual(d("2026-07-20T09:00:00Z"));
  });

  it("window end = anchor + windowDays", () => {
    expect(computeReturnWindowEnd(d("2026-08-01T00:00:00Z"), 14)).toEqual(
      new Date(d("2026-08-01T00:00:00Z").getTime() + 14 * DAY),
    );
    expect(computeReturnWindowEnd(null, 14)).toBeNull();
  });

  it("eligible within window with remaining quantity", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 3,
      heldReturnedQty: 1,
      deliveryAnchor: d("2026-08-01T00:00:00Z"),
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
    });
    expect(r.status).toBe("ELIGIBLE");
    expect(r.remainingReturnableQty).toBe(2);
    expect(r.returnWindowEndsAt).toEqual(new Date(d("2026-08-01T00:00:00Z").getTime() + 14 * DAY));
  });

  it("not delivered → NOT_DELIVERED regardless of quantity", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 2,
      heldReturnedQty: 0,
      deliveryAnchor: null,
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
    });
    expect(r.status).toBe("NOT_DELIVERED");
    expect(r.returnWindowEndsAt).toBeNull();
  });

  it("past window → WINDOW_EXPIRED", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 2,
      heldReturnedQty: 0,
      deliveryAnchor: d("2026-07-01T00:00:00Z"),
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
    });
    expect(r.status).toBe("WINDOW_EXPIRED");
  });

  it("prior returns fully consume quantity → FULLY_RETURNED (subtraction)", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 2,
      heldReturnedQty: 2,
      deliveryAnchor: d("2026-08-01T00:00:00Z"),
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
    });
    expect(r.status).toBe("FULLY_RETURNED");
    expect(r.remainingReturnableQty).toBe(0);
  });

  it("remaining never goes negative even if held exceeds quantity (defensive)", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 2,
      heldReturnedQty: 5,
      deliveryAnchor: d("2026-08-01T00:00:00Z"),
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
    });
    expect(r.remainingReturnableQty).toBe(0);
  });

  it("excluded product → NOT_ELIGIBLE", () => {
    const r = computeLineEligibility({
      orderLineQuantity: 2,
      heldReturnedQty: 0,
      deliveryAnchor: d("2026-08-01T00:00:00Z"),
      returnWindowDays: 14,
      now: d("2026-08-05T00:00:00Z"),
      excluded: true,
    });
    expect(r.status).toBe("NOT_ELIGIBLE");
  });

  it("boundary: exactly at window end is still eligible (inclusive)", () => {
    const anchor = d("2026-08-01T00:00:00Z");
    const windowEnd = computeReturnWindowEnd(anchor, 14)!;
    const r = computeLineEligibility({
      orderLineQuantity: 1,
      heldReturnedQty: 0,
      deliveryAnchor: anchor,
      returnWindowDays: 14,
      now: windowEnd, // now == windowEnd → not past → eligible
    });
    expect(r.status).toBe("ELIGIBLE");
  });
});

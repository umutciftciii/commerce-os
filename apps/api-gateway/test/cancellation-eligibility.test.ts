import { describe, it, expect } from "vitest";
import {
  computeCancellationEligibility,
  isCancellationAllowed,
  isCarrierHandedOff,
  isPreHandoffOutbound,
  type CancellationShipmentInput,
} from "../src/orders/cancellation/eligibility";

const out = (status: CancellationShipmentInput["status"]): CancellationShipmentInput => ({
  direction: "OUTBOUND_TO_CUSTOMER",
  status,
});
const reverse = (status: CancellationShipmentInput["status"]): CancellationShipmentInput => ({
  direction: "CUSTOMER_RETURN_TO_STORE",
  status,
});

describe("cancellation eligibility (ADR-275) — carrier handoff boundary", () => {
  it("PLACED + no shipment → ALLOWED", () => {
    expect(computeCancellationEligibility({ orderStatus: "PLACED", shipments: [] })).toBe("ALLOWED");
  });

  it("CONFIRMED + no shipment → ALLOWED", () => {
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [] })).toBe("ALLOWED");
  });

  it("PLACED + DRAFT outbound shipment → ALLOWED (no handoff)", () => {
    expect(computeCancellationEligibility({ orderStatus: "PLACED", shipments: [out("DRAFT")] })).toBe("ALLOWED");
  });

  it("packing but no handoff (ORDER_CREATED / LABEL_CREATED) → ALLOWED", () => {
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out("ORDER_CREATED")] })).toBe(
      "ALLOWED",
    );
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out("LABEL_PENDING")] })).toBe(
      "ALLOWED",
    );
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out("LABEL_CREATED")] })).toBe(
      "ALLOWED",
    );
  });

  it("IN_TRANSIT outbound → BLOCKED_IN_TRANSIT", () => {
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out("IN_TRANSIT")] })).toBe(
      "BLOCKED_IN_TRANSIT",
    );
  });

  it("OUT_FOR_DELIVERY / DELIVERY_FAILED / RETURNED outbound → BLOCKED_IN_TRANSIT", () => {
    for (const s of ["OUT_FOR_DELIVERY", "DELIVERY_FAILED", "RETURNED"] as const) {
      expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out(s)] })).toBe(
        "BLOCKED_IN_TRANSIT",
      );
    }
  });

  it("DELIVERED outbound → BLOCKED_DELIVERED (return flow, not cancel)", () => {
    expect(computeCancellationEligibility({ orderStatus: "CONFIRMED", shipments: [out("DELIVERED")] })).toBe(
      "BLOCKED_DELIVERED",
    );
  });

  it("multiple outbound, none handed off → ALLOWED", () => {
    expect(
      computeCancellationEligibility({
        orderStatus: "PLACED",
        shipments: [out("DRAFT"), out("LABEL_CREATED")],
      }),
    ).toBe("ALLOWED");
  });

  it("multiple outbound, one IN_TRANSIT → BLOCKED_IN_TRANSIT (whole order)", () => {
    expect(
      computeCancellationEligibility({
        orderStatus: "CONFIRMED",
        shipments: [out("DRAFT"), out("IN_TRANSIT")],
      }),
    ).toBe("BLOCKED_IN_TRANSIT");
  });

  it("mixed handed-off: DELIVERED takes precedence over IN_TRANSIT", () => {
    expect(
      computeCancellationEligibility({
        orderStatus: "CONFIRMED",
        shipments: [out("IN_TRANSIT"), out("DELIVERED")],
      }),
    ).toBe("BLOCKED_DELIVERED");
  });

  it("CANCELLED / FAILED outbound shipments do NOT block (dead shipments)", () => {
    expect(computeCancellationEligibility({ orderStatus: "PLACED", shipments: [out("CANCELLED")] })).toBe("ALLOWED");
    expect(computeCancellationEligibility({ orderStatus: "PLACED", shipments: [out("FAILED")] })).toBe("ALLOWED");
  });

  it("reverse-direction shipments are EXCLUDED from eligibility even if IN_TRANSIT/DELIVERED", () => {
    expect(
      computeCancellationEligibility({
        orderStatus: "CONFIRMED",
        shipments: [reverse("IN_TRANSIT"), reverse("DELIVERED")],
      }),
    ).toBe("ALLOWED");
  });

  it("order status gate: DRAFT / CANCELLED / FULFILLED → NOT_CANCELLABLE", () => {
    for (const st of ["DRAFT", "CANCELLED", "FULFILLED"] as const) {
      expect(computeCancellationEligibility({ orderStatus: st, shipments: [] })).toBe("NOT_CANCELLABLE");
    }
  });

  it("NOT_CANCELLABLE wins even if shipments would otherwise be handed off", () => {
    expect(
      computeCancellationEligibility({ orderStatus: "FULFILLED", shipments: [out("DELIVERED")] }),
    ).toBe("NOT_CANCELLABLE");
  });
});

describe("cancellation eligibility helpers", () => {
  it("isCancellationAllowed only true for ALLOWED", () => {
    expect(isCancellationAllowed("ALLOWED")).toBe(true);
    expect(isCancellationAllowed("BLOCKED_IN_TRANSIT")).toBe(false);
    expect(isCancellationAllowed("BLOCKED_DELIVERED")).toBe(false);
    expect(isCancellationAllowed("NOT_CANCELLABLE")).toBe(false);
  });

  it("isCarrierHandedOff classifies handoff statuses", () => {
    expect(isCarrierHandedOff("IN_TRANSIT")).toBe(true);
    expect(isCarrierHandedOff("DELIVERED")).toBe(true);
    expect(isCarrierHandedOff("DRAFT")).toBe(false);
    expect(isCarrierHandedOff("LABEL_CREATED")).toBe(false);
    expect(isCarrierHandedOff("CANCELLED")).toBe(false);
  });

  it("isPreHandoffOutbound: outbound + not handed off", () => {
    expect(isPreHandoffOutbound(out("DRAFT"))).toBe(true);
    expect(isPreHandoffOutbound(out("LABEL_CREATED"))).toBe(true);
    expect(isPreHandoffOutbound(out("IN_TRANSIT"))).toBe(false);
    expect(isPreHandoffOutbound(reverse("DRAFT"))).toBe(false);
  });
});

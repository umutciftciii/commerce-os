import { describe, it, expect } from "vitest";
import {
  evaluateReturnTransition,
  isTerminalReturnStatus,
  RETURN_TERMINAL_STATUSES,
  RETURN_TRANSITIONS,
} from "../src/returns/status-map";

describe("returns state machine (ADR-269 §4)", () => {
  it("admin can take a fresh request under review", () => {
    expect(evaluateReturnTransition("REQUESTED", "UNDER_REVIEW", "ADMIN")).toEqual({ ok: true });
  });

  it("admin full approval then proceed to awaiting shipment", () => {
    expect(evaluateReturnTransition("REQUESTED", "APPROVED", "ADMIN")).toEqual({ ok: true });
    expect(evaluateReturnTransition("APPROVED", "AWAITING_SHIPMENT", "ADMIN")).toEqual({ ok: true });
  });

  it("admin partial approval is a first-class transition", () => {
    expect(evaluateReturnTransition("UNDER_REVIEW", "PARTIALLY_APPROVED", "ADMIN")).toEqual({
      ok: true,
    });
    expect(evaluateReturnTransition("PARTIALLY_APPROVED", "AWAITING_SHIPMENT", "ADMIN")).toEqual({
      ok: true,
    });
  });

  it("customer may cancel only before approval", () => {
    expect(evaluateReturnTransition("REQUESTED", "CANCELLED_BY_CUSTOMER", "CUSTOMER")).toEqual({
      ok: true,
    });
    expect(evaluateReturnTransition("UNDER_REVIEW", "CANCELLED_BY_CUSTOMER", "CUSTOMER")).toEqual({
      ok: true,
    });
  });

  it("customer cannot cancel after approval (no legal transition)", () => {
    const r = evaluateReturnTransition("AWAITING_SHIPMENT", "CANCELLED_BY_CUSTOMER", "CUSTOMER");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ILLEGAL_TRANSITION");
  });

  it("admin cannot masquerade as customer cancellation (actor authority)", () => {
    const r = evaluateReturnTransition("REQUESTED", "CANCELLED_BY_CUSTOMER", "ADMIN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ACTOR_NOT_ALLOWED");
  });

  it("customer provides return tracking (awaiting → shipped)", () => {
    expect(evaluateReturnTransition("AWAITING_SHIPMENT", "RETURN_SHIPPED", "CUSTOMER")).toEqual({
      ok: true,
    });
  });

  it("only system may expire an unshipped/unreviewed request", () => {
    expect(evaluateReturnTransition("REQUESTED", "EXPIRED", "SYSTEM")).toEqual({ ok: true });
    const admin = evaluateReturnTransition("REQUESTED", "EXPIRED", "ADMIN");
    expect(admin.ok).toBe(false);
    if (!admin.ok) expect(admin.reason).toBe("ACTOR_NOT_ALLOWED");
  });

  it("received → inspection → inspected → refund pending chain", () => {
    expect(evaluateReturnTransition("RECEIVED", "INSPECTION_REQUIRED", "ADMIN")).toEqual({ ok: true });
    expect(evaluateReturnTransition("INSPECTION_REQUIRED", "INSPECTED", "ADMIN")).toEqual({
      ok: true,
    });
    expect(evaluateReturnTransition("INSPECTED", "REFUND_PENDING", "ADMIN")).toEqual({ ok: true });
    expect(evaluateReturnTransition("INSPECTED", "REPLACEMENT_PENDING", "ADMIN")).toEqual({
      ok: true,
    });
  });

  it("TD-FR-7 — admin can no longer silently CLOSE a pending refund settle (REFUND_UNSETTLED)", () => {
    const refund = evaluateReturnTransition("REFUND_PENDING", "CLOSED", "ADMIN");
    expect(refund.ok).toBe(false);
    if (!refund.ok) expect(refund.reason).toBe("REFUND_UNSETTLED");
    const completed = evaluateReturnTransition("COMPLETED", "CLOSED", "ADMIN");
    expect(completed.ok).toBe(false);
    if (!completed.ok) expect(completed.reason).toBe("REFUND_UNSETTLED");
  });

  it("TD-FR-7 review fix — admin CAN archive REPLACEMENT_PENDING → CLOSED (no refund-settle guard, avoids dead-end)", () => {
    const replacement = evaluateReturnTransition("REPLACEMENT_PENDING", "CLOSED", "ADMIN");
    expect(replacement.ok).toBe(true);
  });

  it("rejects illegal jumps (fail-closed)", () => {
    const r = evaluateReturnTransition("REQUESTED", "RECEIVED", "ADMIN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ILLEGAL_TRANSITION");
  });

  it("rejects no-op transition", () => {
    const r = evaluateReturnTransition("APPROVED", "APPROVED", "ADMIN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_CHANGE");
  });

  it("terminal statuses are immutable", () => {
    for (const term of RETURN_TERMINAL_STATUSES) {
      expect(isTerminalReturnStatus(term)).toBe(true);
      const r = evaluateReturnTransition(term, "UNDER_REVIEW", "ADMIN");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("TERMINAL");
      // terminal has no outgoing transitions
      expect(RETURN_TRANSITIONS[term]).toEqual([]);
    }
  });

  it("rejection requires INSPECTED or review states (allowed), not shipped", () => {
    expect(evaluateReturnTransition("UNDER_REVIEW", "REJECTED", "ADMIN")).toEqual({ ok: true });
    expect(evaluateReturnTransition("INSPECTED", "REJECTED", "ADMIN")).toEqual({ ok: true });
    const shipped = evaluateReturnTransition("RETURN_SHIPPED", "REJECTED", "ADMIN");
    expect(shipped.ok).toBe(false);
  });
});

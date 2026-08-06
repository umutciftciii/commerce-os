import { describe, it, expect } from "vitest";
import { evaluateReturnTransition } from "../src/returns/status-map";

describe("return flow guards — admin CLOSE blocked (no silent close)", () => {
  it("REFUND_PENDING → CLOSED by ADMIN is blocked with REFUND_UNSETTLED", () => {
    const r = evaluateReturnTransition("REFUND_PENDING", "CLOSED", "ADMIN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("REFUND_UNSETTLED");
  });
  it("COMPLETED → CLOSED by ADMIN is blocked (COMPLETED terminal in new flow)", () => {
    const r = evaluateReturnTransition("COMPLETED", "CLOSED", "ADMIN");
    expect(r.ok).toBe(false);
  });
  it("REFUND_PENDING → COMPLETED by ADMIN still allowed (refund settle path)", () => {
    expect(evaluateReturnTransition("REFUND_PENDING", "COMPLETED", "ADMIN").ok).toBe(true);
  });
  it("REQUESTED → APPROVED by ADMIN still allowed", () => {
    expect(evaluateReturnTransition("REQUESTED", "APPROVED", "ADMIN").ok).toBe(true);
  });
  it("REPLACEMENT_PENDING → CLOSED by ADMIN is ALLOWED (archival, not a refund settle)", () => {
    const r = evaluateReturnTransition("REPLACEMENT_PENDING", "CLOSED", "ADMIN");
    expect(r.ok).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  refundDestinationSchema,
  refundDestinationPreviewSchema,
  returnResolutionTypeSchema,
  customerReturnCreateRequestSchema,
  customerOrderCancelRequestSchema,
} from "../src/index";

describe("TODO-175 refund destination contracts", () => {
  it("accepts both destinations", () => {
    expect(refundDestinationSchema.parse("ORIGINAL_PAYMENT")).toBe("ORIGINAL_PAYMENT");
    expect(refundDestinationSchema.parse("SHOPPING_BALANCE")).toBe("SHOPPING_BALANCE");
    expect(() => refundDestinationSchema.parse("NOPE")).toThrow();
  });

  it("resolution enum keeps legacy + adds neutral REFUND", () => {
    expect(returnResolutionTypeSchema.parse("REFUND")).toBe("REFUND");
    expect(returnResolutionTypeSchema.parse("REFUND_TO_ORIGINAL_PAYMENT")).toBe("REFUND_TO_ORIGINAL_PAYMENT");
    expect(returnResolutionTypeSchema.parse("REPLACEMENT")).toBe("REPLACEMENT");
  });

  it("return create requires destination when resolution is REFUND", () => {
    const base = {
      orderNumber: "OS-1",
      resolutionType: "REFUND" as const,
      items: [{ orderLineId: "l1", quantity: 1, reason: "NO_LONGER_NEEDED" as const }],
    };
    expect(() => customerReturnCreateRequestSchema.parse(base)).toThrow();
    const ok = customerReturnCreateRequestSchema.parse({ ...base, refundDestination: "SHOPPING_BALANCE" });
    expect(ok.refundDestination).toBe("SHOPPING_BALANCE");
  });

  it("return create allows missing destination for REPLACEMENT", () => {
    const r = customerReturnCreateRequestSchema.parse({
      orderNumber: "OS-1",
      resolutionType: "REPLACEMENT",
      items: [{ orderLineId: "l1", quantity: 1, reason: "NO_LONGER_NEEDED" }],
    });
    expect(r.refundDestination).toBeUndefined();
  });

  it("cancel request accepts optional destination", () => {
    const withDest = customerOrderCancelRequestSchema.parse({ reasonCode: "OTHER", reasonNote: "x", refundDestination: "ORIGINAL_PAYMENT" });
    expect(withDest.refundDestination).toBe("ORIGINAL_PAYMENT");
    const without = customerOrderCancelRequestSchema.parse({ reasonCode: "CHANGED_MIND", reasonNote: "y" });
    expect(without.refundDestination).toBeUndefined();
  });

  it("preview schema validates split + eligibility", () => {
    const p = refundDestinationPreviewSchema.parse({
      totalRefundableMinor: 1000,
      externalComponentMinor: 700,
      creditComponentMinor: 300,
      offerOriginalPayment: true,
      offerShoppingBalance: true,
    });
    expect(p.externalComponentMinor).toBe(700);
  });
});

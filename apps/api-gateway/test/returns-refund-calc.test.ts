import { describe, it, expect } from "vitest";
import { allocateOrderDiscount, computeRefund } from "../src/returns/refund-calc";

describe("returns refund calc (ADR-269 §6/§12)", () => {
  it("full-line refund equals line gross when no order discount", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 2, returnedQuantity: 2, lineGrossMinor: 20000, lineVatMinor: 3333 },
      ],
    });
    expect(r.productRefundMinor).toBe(20000);
    expect(r.taxRefundMinor).toBe(3333);
    expect(r.totalRefundMinor).toBe(20000); // tax inside gross, not re-added
  });

  it("partial quantity is pro-rated by returned/line quantity", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 3, returnedQuantity: 1, lineGrossMinor: 30000, lineVatMinor: 4500 },
      ],
    });
    expect(r.productRefundMinor).toBe(10000);
    expect(r.taxRefundMinor).toBe(1500);
  });

  it("order-level discount is allocated by gross weight before pro-rating", () => {
    // Two lines gross 6000 / 4000, order discount 1000 → alloc 600 / 400.
    // Return all of line1: base = 6000-600 = 5400 → refund 5400.
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 1000,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [
        { orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 6000, lineVatMinor: null },
        { orderLineId: "l2", lineQuantity: 1, returnedQuantity: 0, lineGrossMinor: 4000, lineVatMinor: null },
      ],
    });
    expect(r.perLine[0].allocatedDiscountMinor).toBe(600);
    expect(r.perLine[1].allocatedDiscountMinor).toBe(400);
    expect(r.productRefundMinor).toBe(5400);
  });

  it("allocation remainder goes to the last positive-weight line (deterministic, exact)", () => {
    // weights 1/1/1, total 100 → floor 33/33/33 = 99, remainder 1 to last.
    const alloc = allocateOrderDiscount([1, 1, 1], 100);
    expect(alloc).toEqual([33, 33, 34]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("allocation ignores zero-weight lines for remainder placement", () => {
    const alloc = allocateOrderDiscount([1, 0, 1], 100);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(100);
    expect(alloc[1]).toBe(0); // zero-weight line never receives remainder
  });

  it("free shipping → shipping refund is zero even if admin toggles it", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: true,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 5000, lineVatMinor: null }],
    });
    expect(r.shippingRefundMinor).toBe(0);
    expect(r.totalRefundMinor).toBe(5000);
  });

  it("paid shipping refunded only when admin opts in", () => {
    const base = {
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 2500,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 5000, lineVatMinor: null }],
    };
    expect(computeRefund({ ...base, refundShipping: false }).shippingRefundMinor).toBe(0);
    const withShip = computeRefund({ ...base, refundShipping: true });
    expect(withShip.shippingRefundMinor).toBe(2500);
    expect(withShip.totalRefundMinor).toBe(7500);
  });

  it("inclusive tax is never double-counted in the total", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 12000, lineVatMinor: 2000 }],
    });
    // total = product (12000, VAT-inclusive) + shipping (0); tax 2000 disclosed only.
    expect(r.totalRefundMinor).toBe(12000);
    expect(r.taxRefundMinor).toBe(2000);
  });

  it("legacy line without VAT snapshot → tax refund 0, product from gross", () => {
    const r = computeRefund({
      currency: "TRY",
      orderLevelDiscountMinor: 0,
      shippingAmountMinor: 0,
      refundShipping: false,
      lines: [{ orderLineId: "l1", lineQuantity: 1, returnedQuantity: 1, lineGrossMinor: 8000, lineVatMinor: null }],
    });
    expect(r.productRefundMinor).toBe(8000);
    expect(r.taxRefundMinor).toBe(0);
  });
});

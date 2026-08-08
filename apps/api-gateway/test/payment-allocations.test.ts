/**
 * BUG-CART-005 (Part 2) — Musteri-facing ODEME DAGILIMI (allocation).
 *
 * Mixed-payment sipariste (magaza bakiyesi + kart) her BASARILI (settled: PAID/AUTHORIZED)
 * attempt AYRI satir olur. Pending/failed HARIC. Gosterilen allocation'lar toplami order
 * captured/paid (sumCapturedMinor) ile ESLESIR (invariant).
 */
import { describe, expect, it } from "vitest";
import {
  buildPaymentAllocations,
  sumCapturedMinor,
  type PaymentAllocationAttemptView,
} from "../src/payments/payment-state.js";

const at = (o: Partial<PaymentAllocationAttemptView>): PaymentAllocationAttemptView => ({
  status: "PAID",
  method: "CARD",
  amount: 0,
  currency: "TRY",
  cardBrand: null,
  cardLast4: null,
  provider: null,
  installmentCount: 1,
  paidAt: null,
  ...o,
});

describe("buildPaymentAllocations (BUG-CART-005 / Part 2)", () => {
  it("returns one allocation per successful source for a mixed payment (credit + card)", () => {
    const attempts = [
      at({ method: "STORE_CREDIT", amount: 200000, paidAt: new Date("2026-08-07T10:00:00Z") }),
      at({ method: "CARD", amount: 652064, cardBrand: "VISA", cardLast4: "1234", provider: "IYZICO", paidAt: new Date("2026-08-07T10:00:05Z") }),
    ];
    const allocations = buildPaymentAllocations(attempts);
    expect(allocations).toHaveLength(2);
    // En erken odeme once (store credit).
    expect(allocations[0]).toMatchObject({ sourceType: "STORE_CREDIT", amountMinor: 200000, cardLast4: null });
    expect(allocations[1]).toMatchObject({ sourceType: "CARD", amountMinor: 652064, cardBrand: "VISA", cardLast4: "1234", provider: "IYZICO" });
    // Invariant: allocation toplami = captured toplami.
    const total = allocations.reduce((s, a) => s + a.amountMinor, 0);
    expect(total).toBe(sumCapturedMinor(attempts));
    expect(total).toBe(852064);
  });

  it("credit-only order → single store-credit allocation", () => {
    const attempts = [at({ method: "STORE_CREDIT", amount: 852064, paidAt: new Date("2026-08-07T10:00:00Z") })];
    const allocations = buildPaymentAllocations(attempts);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ sourceType: "STORE_CREDIT", amountMinor: 852064 });
  });

  it("card-only order → single card allocation with masked details", () => {
    const attempts = [at({ method: "CARD", amount: 852064, cardBrand: "MASTERCARD", cardLast4: "4242", provider: "STRIPE", installmentCount: 3, paidAt: new Date("2026-08-07T10:00:00Z") })];
    const allocations = buildPaymentAllocations(attempts);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ sourceType: "CARD", amountMinor: 852064, cardLast4: "4242", installmentCount: 3 });
  });

  it("excludes pending/failed/cancelled attempts (only settled count)", () => {
    const attempts = [
      at({ method: "CARD", amount: 500000, status: "FAILED", paidAt: null }),
      at({ method: "CARD", amount: 500000, status: "PENDING", paidAt: null }),
      at({ method: "CARD", amount: 852064, status: "PAID", cardLast4: "1234", paidAt: new Date("2026-08-07T10:00:00Z") }),
    ];
    const allocations = buildPaymentAllocations(attempts);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].amountMinor).toBe(852064);
    expect(allocations.reduce((s, a) => s + a.amountMinor, 0)).toBe(sumCapturedMinor(attempts));
  });

  it("includes AUTHORIZED attempts (settled) and matches captured", () => {
    const attempts = [at({ method: "CARD", amount: 100000, status: "AUTHORIZED", paidAt: null })];
    const allocations = buildPaymentAllocations(attempts);
    expect(allocations).toHaveLength(1);
    expect(allocations.reduce((s, a) => s + a.amountMinor, 0)).toBe(sumCapturedMinor(attempts));
  });

  it("returns empty for no settled attempts", () => {
    expect(buildPaymentAllocations([])).toEqual([]);
    expect(buildPaymentAllocations([at({ status: "FAILED" })])).toEqual([]);
  });
});

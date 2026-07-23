import { describe, expect, it } from "vitest";
import {
  canStartCollection,
  computeRemainingMinor,
  isAttemptActive,
  isAttemptTerminal,
  isWithinRemaining,
  mapAttemptStatusToOrderStatus,
  resolveOrderPaymentTransition,
  sumCapturedMinor,
} from "../src/payments/payment-state.js";

/**
 * TODO-159F (ADR-095/100) — Order Payment Recovery state machine (tek otorite).
 * Spec §2 (durum makinesi) + §6 (idempotency/webhook ordering) kuralları.
 */
describe("payment-state · canStartCollection", () => {
  it("UNPAID / PAYMENT_PENDING / PAYMENT_FAILED uygundur", () => {
    expect(canStartCollection("UNPAID")).toBe(true);
    expect(canStartCollection("PAYMENT_PENDING")).toBe(true);
    expect(canStartCollection("PAYMENT_FAILED")).toBe(true);
  });

  it("PAID / AUTHORIZED / REFUNDED / PARTIALLY_REFUNDED / CANCELLED terminal → yeni tahsilat YOK", () => {
    expect(canStartCollection("PAID")).toBe(false);
    expect(canStartCollection("AUTHORIZED")).toBe(false);
    expect(canStartCollection("REFUNDED")).toBe(false);
    expect(canStartCollection("PARTIALLY_REFUNDED")).toBe(false);
    expect(canStartCollection("CANCELLED")).toBe(false);
  });
});

describe("payment-state · isAttemptActive", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("CREATED/PENDING/REQUIRES_ACTION + süresi dolmamış → aktif", () => {
    const future = new Date(now.getTime() + 60_000);
    expect(isAttemptActive({ status: "CREATED", expiresAt: future }, now)).toBe(true);
    expect(isAttemptActive({ status: "PENDING", expiresAt: null }, now)).toBe(true);
    expect(isAttemptActive({ status: "REQUIRES_ACTION", expiresAt: future }, now)).toBe(true);
  });

  it("süresi dolmuş aktif deneme → aktif DEĞİL (yeni denemeyi engellemez)", () => {
    const past = new Date(now.getTime() - 1);
    expect(isAttemptActive({ status: "CREATED", expiresAt: past }, now)).toBe(false);
  });

  it("terminal deneme durumları asla aktif değildir", () => {
    for (const status of ["PAID", "AUTHORIZED", "FAILED", "CANCELLED", "REFUNDED"] as const) {
      expect(isAttemptActive({ status, expiresAt: null }, now)).toBe(false);
      expect(isAttemptTerminal(status)).toBe(true);
    }
  });
});

describe("payment-state · mapAttemptStatusToOrderStatus", () => {
  it("PAID→PAID, AUTHORIZED→AUTHORIZED", () => {
    expect(mapAttemptStatusToOrderStatus("PAID")).toBe("PAID");
    expect(mapAttemptStatusToOrderStatus("AUTHORIZED")).toBe("AUTHORIZED");
  });
  it("CREATED/PENDING/REQUIRES_ACTION → PAYMENT_PENDING", () => {
    expect(mapAttemptStatusToOrderStatus("CREATED")).toBe("PAYMENT_PENDING");
    expect(mapAttemptStatusToOrderStatus("PENDING")).toBe("PAYMENT_PENDING");
    expect(mapAttemptStatusToOrderStatus("REQUIRES_ACTION")).toBe("PAYMENT_PENDING");
  });
  it("FAILED/CANCELLED → PAYMENT_FAILED (order CANCELLED değil, tekrar denenebilir)", () => {
    expect(mapAttemptStatusToOrderStatus("FAILED")).toBe("PAYMENT_FAILED");
    expect(mapAttemptStatusToOrderStatus("CANCELLED")).toBe("PAYMENT_FAILED");
  });
});

describe("payment-state · resolveOrderPaymentTransition (webhook ordering / monotonic)", () => {
  it("UNPAID iken PAID webhook → PAID", () => {
    expect(resolveOrderPaymentTransition("UNPAID", "PAID")).toBe("PAID");
  });

  it("PAID iken geç gelen FAILED webhook → değişiklik YOK (geriye çevirmez)", () => {
    expect(resolveOrderPaymentTransition("PAID", "FAILED")).toBeNull();
    expect(resolveOrderPaymentTransition("PAID", "CANCELLED")).toBeNull();
    expect(resolveOrderPaymentTransition("PAID", "CREATED")).toBeNull();
  });

  it("PAID iken REFUNDED webhook → REFUNDED (tek ileri geçiş)", () => {
    expect(resolveOrderPaymentTransition("PAID", "REFUNDED")).toBe("REFUNDED");
  });

  it("PAYMENT_PENDING iken FAILED → PAYMENT_FAILED", () => {
    expect(resolveOrderPaymentTransition("PAYMENT_PENDING", "FAILED")).toBe("PAYMENT_FAILED");
  });

  it("aynı hedefe geçiş → değişiklik YOK", () => {
    expect(resolveOrderPaymentTransition("PAYMENT_PENDING", "CREATED")).toBeNull();
  });

  it("CANCELLED (terminal) iken PAID → değişiklik YOK", () => {
    expect(resolveOrderPaymentTransition("CANCELLED", "PAID")).toBeNull();
  });
});

describe("payment-state · captured / remaining / overpayment", () => {
  it("sumCapturedMinor yalnız PAID/AUTHORIZED denemeleri toplar", () => {
    const attempts = [
      { status: "FAILED" as const, amount: 5000 },
      { status: "PAID" as const, amount: 3000 },
      { status: "AUTHORIZED" as const, amount: 2000 },
      { status: "CREATED" as const, amount: 9999 },
    ];
    expect(sumCapturedMinor(attempts)).toBe(5000);
  });

  it("computeRemainingMinor negatif olmaz", () => {
    expect(computeRemainingMinor(10000, 3000)).toBe(7000);
    expect(computeRemainingMinor(10000, 12000)).toBe(0);
  });

  it("isWithinRemaining: overpayment ve sıfır tutar reddedilir", () => {
    expect(isWithinRemaining(7000, 7000)).toBe(true); // tam tahsilat
    expect(isWithinRemaining(3000, 7000)).toBe(true); // kısmi (sunucu ayrıca reddedebilir)
    expect(isWithinRemaining(8000, 7000)).toBe(false); // overpayment
    expect(isWithinRemaining(0, 7000)).toBe(false); // sıfır
    expect(isWithinRemaining(1000, 0)).toBe(false); // zaten ödenmiş
  });
});

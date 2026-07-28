/**
 * H-3 (ADR-187…191) — Rezervasyon lifecycle SAF çekirdek testleri (DB'siz).
 * Kapsam: terminal state machine · TTL · payment-window yenileme + cap · read-time add-back ·
 * expiry aday · payment-vs-expiry karar tablosu.
 */
import { describe, expect, it } from "vitest";
import {
  isTerminalReservation,
  canConsume,
  canRelease,
  computeInitialExpiresAt,
  computePaymentWindowExpiresAt,
  effectiveAvailable,
  isExpiryCandidate,
  decideExpiry,
  type ReservationTtlPolicy,
} from "../src/reservation-lifecycle.js";

const POLICY: ReservationTtlPolicy = { ttlMinutes: 15, paymentWindowMinutes: 30, maxMinutes: 120 };
const T0 = new Date("2026-07-29T10:00:00.000Z");

describe("reservation lifecycle — state machine", () => {
  it("terminal durumlar reactivate edilemez", () => {
    expect(isTerminalReservation("CONSUMED")).toBe(true);
    expect(isTerminalReservation("RELEASED")).toBe(true);
    expect(isTerminalReservation("EXPIRED")).toBe(true);
    expect(isTerminalReservation("ACTIVE")).toBe(false);
  });

  it("consume/release yalnız ACTIVE'de geçerli (idempotency)", () => {
    expect(canConsume("ACTIVE")).toBe(true);
    expect(canConsume("CONSUMED")).toBe(false);
    expect(canRelease("ACTIVE")).toBe(true);
    expect(canRelease("EXPIRED")).toBe(false);
    expect(canRelease("RELEASED")).toBe(false);
  });
});

describe("reservation lifecycle — TTL", () => {
  it("ilk expiresAt = createdAt + ttl", () => {
    const exp = computeInitialExpiresAt(T0, POLICY);
    expect(exp.toISOString()).toBe("2026-07-29T10:15:00.000Z");
  });

  it("payment-window yenileme now + window (cap altında)", () => {
    const now = new Date("2026-07-29T10:10:00.000Z");
    const initial = computeInitialExpiresAt(T0, POLICY);
    const renewed = computePaymentWindowExpiresAt(T0, now, initial, POLICY);
    // now(10:10) + 30dk = 10:40; cap = 10:00 + 120 = 12:00 → 10:40.
    expect(renewed.toISOString()).toBe("2026-07-29T10:40:00.000Z");
  });

  it("yenileme hard cap'i AŞAMAZ (maksimum toplam süre)", () => {
    const now = new Date("2026-07-29T11:50:00.000Z"); // now + 30 = 12:20 > cap 12:00
    const renewed = computePaymentWindowExpiresAt(T0, now, computeInitialExpiresAt(T0, POLICY), POLICY);
    expect(renewed.toISOString()).toBe("2026-07-29T12:00:00.000Z");
  });

  it("yenileme asla KISALTMAZ (yalnız ileri)", () => {
    const now = new Date("2026-07-29T10:01:00.000Z"); // now + 30 = 10:31
    const current = new Date("2026-07-29T10:45:00.000Z"); // mevcut daha ileri
    const renewed = computePaymentWindowExpiresAt(T0, now, current, POLICY);
    expect(renewed.toISOString()).toBe("2026-07-29T10:45:00.000Z");
  });
});

describe("reservation lifecycle — read-time available add-back", () => {
  it("expired rezervasyon geri eklenir (stok azaltmaz)", () => {
    // onHand 10, reserved 3 (hepsi expired) → available 10.
    expect(effectiveAvailable(10, 3, 3)).toBe(10);
  });
  it("aktif (expired olmayan) rezervasyon stoğu azaltır", () => {
    expect(effectiveAvailable(10, 3, 0)).toBe(7);
  });
  it("negatif sonuç 0'a kırpılır", () => {
    expect(effectiveAvailable(5, 8, 0)).toBe(0);
  });
});

describe("reservation lifecycle — expiry candidate + decision", () => {
  it("ACTIVE + expiresAt <= cutoff → aday; NULL expiresAt → aday DEĞİL", () => {
    const cutoff = new Date("2026-07-29T10:20:00.000Z");
    expect(isExpiryCandidate("ACTIVE", new Date("2026-07-29T10:15:00.000Z"), cutoff)).toBe(true);
    expect(isExpiryCandidate("ACTIVE", new Date("2026-07-29T10:25:00.000Z"), cutoff)).toBe(false);
    expect(isExpiryCandidate("ACTIVE", null, cutoff)).toBe(false);
    expect(isExpiryCandidate("CONSUMED", new Date("2026-07-29T10:15:00.000Z"), cutoff)).toBe(false);
  });

  it("payment-vs-expiry: PAID → CONSUME_INSTEAD, UNPAID+aday → EXPIRE, aksi SKIP", () => {
    expect(decideExpiry("ACTIVE", "PAID", true)).toBe("CONSUME_INSTEAD");
    expect(decideExpiry("ACTIVE", "AUTHORIZED", true)).toBe("CONSUME_INSTEAD");
    expect(decideExpiry("ACTIVE", "UNPAID", true)).toBe("EXPIRE");
    expect(decideExpiry("ACTIVE", "PAYMENT_FAILED", true)).toBe("EXPIRE");
    expect(decideExpiry("ACTIVE", "UNPAID", false)).toBe("SKIP");
    expect(decideExpiry("CONSUMED", "UNPAID", true)).toBe("SKIP");
  });
});

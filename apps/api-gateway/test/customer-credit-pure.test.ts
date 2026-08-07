import { describe, it, expect } from "vitest";
import {
  allocateFefo,
  availableBalanceMinor,
  computeExpiresAt,
  CREDIT_EXPIRY_DAY_OPTIONS,
  expiredSweepCandidates,
  isLotSpendable,
  isValidExpiryDays,
  minBigInt,
  planRestore,
  sortFefo,
  type CreditLotView,
} from "../src/customer-credit/ledger-calc.js";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;

function lot(partial: Partial<CreditLotView> & { id: string; remainingAmountMinor: bigint }): CreditLotView {
  return {
    status: "ACTIVE",
    expiresAt: new Date(NOW.getTime() + 30 * dayMs),
    createdAt: NOW,
    ...partial,
  };
}

describe("expiry days policy (ADR-284)", () => {
  it("yalnız 30/60/120/180 geçerli; maks 180", () => {
    expect(CREDIT_EXPIRY_DAY_OPTIONS).toEqual([30, 60, 120, 180]);
    for (const d of [30, 60, 120, 180]) expect(isValidExpiryDays(d)).toBe(true);
    for (const d of [0, 15, 45, 90, 181, 365, -30]) expect(isValidExpiryDays(d)).toBe(false);
  });

  it("computeExpiresAt now + gün", () => {
    expect(computeExpiresAt(NOW, 30).getTime()).toBe(NOW.getTime() + 30 * dayMs);
    expect(computeExpiresAt(NOW, 180).getTime()).toBe(NOW.getTime() + 180 * dayMs);
  });
});

describe("availability & spendability (expiresAt > now otoritesi)", () => {
  it("süresi dolmuş lot available'a girmez (worker'dan bağımsız)", () => {
    const expired = lot({ id: "a", remainingAmountMinor: 500n, expiresAt: new Date(NOW.getTime() - 1000) });
    const live = lot({ id: "b", remainingAmountMinor: 300n, expiresAt: new Date(NOW.getTime() + dayMs) });
    expect(isLotSpendable(expired, NOW)).toBe(false);
    expect(isLotSpendable(live, NOW)).toBe(true);
    expect(availableBalanceMinor([expired, live], NOW)).toBe(300n);
  });

  it("CONSUMED / remaining=0 / EXPIRED lot harcanamaz", () => {
    expect(isLotSpendable(lot({ id: "c", remainingAmountMinor: 0n }), NOW)).toBe(false);
    expect(isLotSpendable(lot({ id: "d", remainingAmountMinor: 100n, status: "CONSUMED" }), NOW)).toBe(false);
    expect(isLotSpendable(lot({ id: "e", remainingAmountMinor: 100n, status: "EXPIRED" }), NOW)).toBe(false);
  });
});

describe("FEFO tüketim (en erken sona erecek önce)", () => {
  it("sortFefo: expiresAt ASC, createdAt ASC, id ASC", () => {
    const l1 = lot({ id: "z", remainingAmountMinor: 1n, expiresAt: new Date(NOW.getTime() + 60 * dayMs) });
    const l2 = lot({ id: "y", remainingAmountMinor: 1n, expiresAt: new Date(NOW.getTime() + 30 * dayMs) });
    const l3 = lot({ id: "x", remainingAmountMinor: 1n, expiresAt: new Date(NOW.getTime() + 30 * dayMs), createdAt: new Date(NOW.getTime() - dayMs) });
    expect(sortFefo([l1, l2, l3]).map((l) => l.id)).toEqual(["x", "y", "z"]);
  });

  it("erken biten lottan başlar, taşarsa sonrakine geçer", () => {
    const early = lot({ id: "early", remainingAmountMinor: 200n, expiresAt: new Date(NOW.getTime() + 10 * dayMs) });
    const late = lot({ id: "late", remainingAmountMinor: 500n, expiresAt: new Date(NOW.getTime() + 90 * dayMs) });
    const res = allocateFefo([late, early], 300n, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allocations).toEqual([
        { lotId: "early", amountMinor: 200n },
        { lotId: "late", amountMinor: 100n },
      ]);
      expect(res.totalMinor).toBe(300n);
    }
  });

  it("süresi dolmuş lot FEFO'ya alınmaz", () => {
    const expired = lot({ id: "exp", remainingAmountMinor: 1000n, expiresAt: new Date(NOW.getTime() - dayMs) });
    const live = lot({ id: "live", remainingAmountMinor: 400n, expiresAt: new Date(NOW.getTime() + dayMs) });
    const res = allocateFefo([expired, live], 400n, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.allocations).toEqual([{ lotId: "live", amountMinor: 400n }]);
  });

  it("yetersiz bakiye → INSUFFICIENT_BALANCE (kısmi harcama yok)", () => {
    const only = lot({ id: "l", remainingAmountMinor: 100n });
    const res = allocateFefo([only], 150n, NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("0/negatif istek → boş tahsis (no-op)", () => {
    const l = lot({ id: "l", remainingAmountMinor: 100n });
    expect(allocateFefo([l], 0n, NOW)).toEqual({ ok: true, allocations: [], totalMinor: 0n });
    expect(allocateFefo([l], -5n, NOW)).toEqual({ ok: true, allocations: [], totalMinor: 0n });
  });
});

describe("minBigInt (checkout: min(available, payable))", () => {
  it("bakiye ₺500, sipariş ₺300 → 300", () => expect(minBigInt(50000n, 30000n)).toBe(30000n));
  it("bakiye ₺300, sipariş ₺500 → 300", () => expect(minBigInt(30000n, 50000n)).toBe(30000n));
});

describe("restore planı (ADR-284: expired lot revive edilmez)", () => {
  const lotById = new Map([
    ["alive", { expiresAt: new Date(NOW.getTime() + 5 * dayMs) }],
    ["dead", { expiresAt: new Date(NOW.getTime() - dayMs) }],
  ]);

  it("expiry gelecekteyse restore; geçmişse skip (skippedExpired)", () => {
    const decisions = planRestore(
      [
        { lotId: "alive", amountMinor: 200n },
        { lotId: "dead", amountMinor: 300n },
      ],
      lotById,
      NOW,
    );
    expect(decisions).toEqual([
      { lotId: "alive", restoreMinor: 200n, skippedExpiredMinor: 0n },
      { lotId: "dead", restoreMinor: 0n, skippedExpiredMinor: 300n },
    ]);
  });

  it("bilinmeyen lot (silinmiş) → skip", () => {
    const d = planRestore([{ lotId: "ghost", amountMinor: 100n }], lotById, NOW);
    expect(d).toEqual([{ lotId: "ghost", restoreMinor: 0n, skippedExpiredMinor: 100n }]);
  });
});

describe("expiry sweep adayları (worker housekeeping)", () => {
  it("yalnız ACTIVE + remaining>0 + expiresAt<=now", () => {
    const due = lot({ id: "due", remainingAmountMinor: 100n, expiresAt: new Date(NOW.getTime() - 1) });
    const future = lot({ id: "future", remainingAmountMinor: 100n, expiresAt: new Date(NOW.getTime() + dayMs) });
    const empty = lot({ id: "empty", remainingAmountMinor: 0n, expiresAt: new Date(NOW.getTime() - 1) });
    const consumed = lot({ id: "consumed", remainingAmountMinor: 50n, status: "CONSUMED", expiresAt: new Date(NOW.getTime() - 1) });
    expect(expiredSweepCandidates([due, future, empty, consumed], NOW).map((l) => l.id)).toEqual(["due"]);
  });
});

/**
 * TODO-161A.2 (ADR-121…129 · senaryo §17) — "75.000 TL" alacak ilerlemesi.
 *
 * Bu dosya, birleşik ticari akışın kanonik para senaryosunu SAF `billing-core` fonksiyonlarıyla
 * (DB'siz) adım adım kanıtlar. FIXED_FEE anlaşma, vergi = 0 bp varsayımıyla; para her yerde minor
 * unit (75.000 TL = 75_000_00 kuruş DEĞİL — senaryo tutarları doğrudan minor kabul edilir).
 *
 * Akış:
 *   1. 75.000 tahakkuk, 0 tahsilat → kalan 75.000
 *   2. 30.000 avans mahsubu → ödenen 30.000, kalan 45.000
 *   3. 20.000 doğrudan tahsilat → ödenen 50.000, kalan 25.000
 *   4. 25.000 tahsilat → ödenen 75.000, kalan 0, durum PAID
 *   5. fazla tahsilat reddi (OVERPAYMENT)
 *   6. avans bakiyesi aşımı reddi
 */
import { describe, expect, it } from "vitest";
import {
  computeAdvanceAvailableMinor,
  computeChargeTotals,
  computeRemainingMinor,
  isAdvanceAllocationValid,
  isWithinRemaining,
  resolveChargeStatus,
} from "../src/sponsorship/billing-core.js";

// Senaryo sabitleri (minor unit).
const AGREED = 75_000;
const TAX_RATE_BP = 0; // vergisiz senaryo — toplam = matrah.

describe("75.000 senaryosu — alacak ilerlemesi (domain seviyesi kanıt)", () => {
  it("adım 0 — FIXED_FEE toplamı vergisiz olarak matraha eşittir", () => {
    const totals = computeChargeTotals(AGREED, TAX_RATE_BP);
    expect(totals).toEqual({ subtotalMinor: 75_000, taxAmountMinor: 0, totalAmountMinor: 75_000 });
  });

  it("adım 1 — tahakkuk 75.000, tahsilat 0 → kalan 75.000 (ISSUED)", () => {
    const total = computeChargeTotals(AGREED, TAX_RATE_BP).totalAmountMinor;
    const paid = 0;
    expect(computeRemainingMinor(total, paid)).toBe(75_000);
    expect(resolveChargeStatus("ISSUED", total, paid)).toBe("ISSUED");
  });

  it("adım 2 — 30.000 avans mahsubu geçerli → ödenen 30.000, kalan 45.000 (PARTIALLY_PAID)", () => {
    const total = 75_000;
    // 30.000 avans, henüz hiç mahsup edilmemiş.
    const advanceAvailable = computeAdvanceAvailableMinor(30_000, 0);
    expect(advanceAvailable).toBe(30_000);
    // Mahsup hem avans bakiyesini (30.000) hem tahakkuk kalanını (75.000) aşmıyor.
    expect(isAdvanceAllocationValid(30_000, advanceAvailable, 75_000)).toBe(true);

    const paidAfterAllocation = 30_000;
    expect(computeRemainingMinor(total, paidAfterAllocation)).toBe(45_000);
    expect(resolveChargeStatus("ISSUED", total, paidAfterAllocation)).toBe("PARTIALLY_PAID");
  });

  it("adım 3 — 20.000 doğrudan tahsilat geçerli → ödenen 50.000, kalan 25.000", () => {
    const total = 75_000;
    const remainingBefore = 45_000;
    expect(isWithinRemaining(20_000, remainingBefore)).toBe(true);

    const paidAfter = 30_000 + 20_000;
    expect(paidAfter).toBe(50_000);
    expect(computeRemainingMinor(total, paidAfter)).toBe(25_000);
    expect(resolveChargeStatus("PARTIALLY_PAID", total, paidAfter)).toBe("PARTIALLY_PAID");
  });

  it("adım 4 — 25.000 tahsilat kalanı tam kapatır → ödenen 75.000, kalan 0, PAID", () => {
    const total = 75_000;
    const remainingBefore = 25_000;
    expect(isWithinRemaining(25_000, remainingBefore)).toBe(true);

    const paidAfter = 50_000 + 25_000;
    expect(paidAfter).toBe(75_000);
    expect(computeRemainingMinor(total, paidAfter)).toBe(0);
    expect(resolveChargeStatus("PARTIALLY_PAID", total, paidAfter)).toBe("PAID");
  });

  it("adım 5 — tam ödenmiş tahakkukta ek 1 birim tahsilat reddedilir (OVERPAYMENT)", () => {
    // Kalan 0 → hiçbir pozitif tahsilat kabul edilmez.
    expect(isWithinRemaining(1, 0)).toBe(false);
  });

  it("adım 6 — avans bakiyesini aşan mahsup reddedilir (ADVANCE_BALANCE_EXCEEDED)", () => {
    // 30.000 avanstan 40.000 mahsup edilemez; tahakkuk kalanı yeterli olsa bile red.
    const advanceAvailable = computeAdvanceAvailableMinor(30_000, 0);
    expect(isAdvanceAllocationValid(40_000, advanceAvailable, 75_000)).toBe(false);
  });
});

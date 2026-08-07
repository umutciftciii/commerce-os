import { describe, expect, it } from "vitest";
import { computeShoppingCreditPreview } from "../lib/credit";

/**
 * TODO-174B UX — Checkout "Alışveriş bakiyesi" canlı önizlemesi. Kredi bir ÖDEME yöntemidir
 * (indirim DEĞİL): uygulanan = min(bakiye, ödenecek); kalan = ödenecek − uygulanan. Bakiye
 * ödenecekten büyükse sipariş tamamen karşılanır (kalan 0). Bu saf mantık, gateway'in
 * min(available, payable) tahsis kuralını (ADR-282) istemci-önizlemede birebir yansıtır.
 */
describe("computeShoppingCreditPreview", () => {
  it("applies the full balance when it is less than the payable amount", () => {
    expect(computeShoppingCreditPreview(30000, 852064)).toEqual({
      appliedMinor: 30000,
      remainingMinor: 822064,
    });
  });

  it("caps applied credit at the payable amount (fully covered → remaining 0)", () => {
    expect(computeShoppingCreditPreview(900000, 852064)).toEqual({
      appliedMinor: 852064,
      remainingMinor: 0,
    });
  });

  it("covers exactly when balance equals payable", () => {
    expect(computeShoppingCreditPreview(852064, 852064)).toEqual({
      appliedMinor: 852064,
      remainingMinor: 0,
    });
  });

  it("applies nothing when the balance is zero", () => {
    expect(computeShoppingCreditPreview(0, 852064)).toEqual({
      appliedMinor: 0,
      remainingMinor: 852064,
    });
  });

  it("clamps negative/NaN inputs to zero (never negative payable)", () => {
    expect(computeShoppingCreditPreview(-100, 5000)).toEqual({ appliedMinor: 0, remainingMinor: 5000 });
    expect(computeShoppingCreditPreview(Number.NaN, 5000)).toEqual({ appliedMinor: 0, remainingMinor: 5000 });
    expect(computeShoppingCreditPreview(1000, -5000)).toEqual({ appliedMinor: 0, remainingMinor: 0 });
  });
});

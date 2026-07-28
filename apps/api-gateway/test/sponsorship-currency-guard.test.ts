/**
 * H-2 / ADR-181…186 — Sponsorship revenue-share CURRENCY GUARD (SAF çekirdek birim testleri).
 *
 * `billing-core` içindeki para-birimi kimlik/format/partition fonksiyonlarını DB'siz kanıtlar.
 * Kritik invariant: farklı currency'ler tek toplamda birleşemez; uyuşmazlık `hasMismatch=true`
 * ile fail-closed'a taşınır. Kur dönüşümü/FX YOK — yalnız KİMLİK karşılaştırması.
 */
import { describe, expect, it } from "vitest";
import {
  isIso4217,
  isSameCurrency,
  isUsableAgreementCurrency,
  normalizeCurrency,
  partitionRevenueCurrencies,
} from "../src/sponsorship/billing-core.js";

describe("normalizeCurrency + isIso4217", () => {
  it("trim + upper kanonikleştirir", () => {
    expect(normalizeCurrency(" try ")).toBe("TRY");
    expect(normalizeCurrency("usd")).toBe("USD");
  });
  it("yalnız 3 harfli ISO 4217 biçimi geçerlidir", () => {
    expect(isIso4217("TRY")).toBe(true);
    expect(isIso4217("try")).toBe(true);
    expect(isIso4217("TR")).toBe(false);
    expect(isIso4217("TRYX")).toBe(false);
    expect(isIso4217("12$")).toBe(false);
    expect(isIso4217("")).toBe(false);
  });
});

describe("isUsableAgreementCurrency (fail-closed otorite)", () => {
  it("boş/whitespace/format-dışı → kullanılamaz", () => {
    expect(isUsableAgreementCurrency(null)).toBe(false);
    expect(isUsableAgreementCurrency(undefined)).toBe(false);
    expect(isUsableAgreementCurrency("")).toBe(false);
    expect(isUsableAgreementCurrency("  ")).toBe(false);
    expect(isUsableAgreementCurrency("TRYY")).toBe(false);
  });
  it("geçerli ISO → kullanılabilir (case-insensitive)", () => {
    expect(isUsableAgreementCurrency("TRY")).toBe(true);
    expect(isUsableAgreementCurrency("usd")).toBe(true);
  });
});

describe("isSameCurrency", () => {
  it("case/trim duyarsız eşitlik", () => {
    expect(isSameCurrency("TRY", " try ")).toBe(true);
    expect(isSameCurrency("TRY", "USD")).toBe(false);
  });
});

describe("partitionRevenueCurrencies — çoklu-para tespiti (para TOPLAMAZ)", () => {
  it("tek-para (eşleşen): mismatch YOK", () => {
    const p = partitionRevenueCurrencies("TRY", [{ currency: "TRY", count: 5 }]);
    expect(p.hasMismatch).toBe(false);
    expect(p.matchedCount).toBe(5);
    expect(p.mismatchedCount).toBe(0);
    expect(p.foundCurrencies).toEqual(["TRY"]);
  });

  it("karışık-para: mismatch VAR, sayılar currency bazında ayrık", () => {
    const p = partitionRevenueCurrencies("TRY", [
      { currency: "TRY", count: 3 },
      { currency: "USD", count: 2 },
    ]);
    expect(p.hasMismatch).toBe(true);
    expect(p.matchedCount).toBe(3);
    expect(p.mismatchedCount).toBe(2);
    expect(p.foundCurrencies).toEqual(["TRY", "USD"]); // sıralı
  });

  it("yalnızca yabancı-para: matched=0, mismatch var", () => {
    const p = partitionRevenueCurrencies("TRY", [{ currency: "USD", count: 4 }]);
    expect(p.hasMismatch).toBe(true);
    expect(p.matchedCount).toBe(0);
    expect(p.mismatchedCount).toBe(4);
  });

  it("lowercase currency normalize edilir → eşleşir", () => {
    const p = partitionRevenueCurrencies("TRY", [{ currency: "try", count: 7 }]);
    expect(p.hasMismatch).toBe(false);
    expect(p.matchedCount).toBe(7);
    expect(p.foundCurrencies).toEqual(["TRY"]);
  });

  it("boş histogram (sıfır gelir): mismatch YOK", () => {
    const p = partitionRevenueCurrencies("TRY", []);
    expect(p.hasMismatch).toBe(false);
    expect(p.matchedCount).toBe(0);
    expect(p.mismatchedCount).toBe(0);
    expect(p.foundCurrencies).toEqual([]);
  });

  it("expected da farklı yazımda gelse kanonikleşir", () => {
    const p = partitionRevenueCurrencies(" eur ", [
      { currency: "EUR", count: 1 },
      { currency: "USD", count: 1 },
    ]);
    expect(p.expected).toBe("EUR");
    expect(p.hasMismatch).toBe(true);
    expect(p.foundCurrencies).toEqual(["EUR", "USD"]);
  });

  it("aynı currency birden çok kova (boş kod atlanır) → tekilleştirir", () => {
    const p = partitionRevenueCurrencies("TRY", [
      { currency: "TRY", count: 2 },
      { currency: "", count: 1 },
    ]);
    // boş kod foundCurrencies'e girmez ama mismatched sayılır (beklenen değil).
    expect(p.foundCurrencies).toEqual(["TRY"]);
    expect(p.mismatchedCount).toBe(1);
    expect(p.hasMismatch).toBe(true);
  });
});

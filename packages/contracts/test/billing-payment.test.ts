import { describe, expect, it } from "vitest";
import {
  cardLast4,
  customerOrderPaymentSummarySchema,
  detectCardBrand,
  digitsOnly,
  isValidTaxNumber,
  isValidTckn,
  luhnValid,
  publicCheckoutBillingSchema,
  publicPaymentSubmitRequestSchema,
} from "../src/index.js";

describe("F3B.2 billing + payment helpers", () => {
  it("validates T.C. Kimlik No with the official checksum", () => {
    expect(isValidTckn("10000000146")).toBe(true);
    expect(isValidTckn("10000000147")).toBe(false); // bozuk checksum
    expect(isValidTckn("01234567890")).toBe(false); // ilk hane 0
    expect(isValidTckn("123")).toBe(false);
    expect(isValidTckn("1000 0000 146")).toBe(true); // bosluk toleransi
  });

  it("validates 10-digit tax numbers", () => {
    expect(isValidTaxNumber("1234567890")).toBe(true);
    expect(isValidTaxNumber("12345")).toBe(false);
  });

  it("checks card numbers with Luhn and derives brand + last4 (no full PAN kept)", () => {
    expect(luhnValid("5528790000000008")).toBe(true);
    expect(luhnValid("1234567812345678")).toBe(false);
    expect(detectCardBrand("4111111111111111")).toBe("VISA");
    expect(detectCardBrand("5528790000000008")).toBe("MASTERCARD");
    expect(detectCardBrand("378282246310005")).toBe("AMEX");
    expect(cardLast4("5528 7900 0000 0008")).toBe("0008");
    expect(digitsOnly("5528 7900")).toBe("55287900");
  });

  it("requires valid TCKN for individual billing", () => {
    expect(
      publicCheckoutBillingSchema.safeParse({
        type: "INDIVIDUAL",
        sameAsShipping: true,
        name: "Ada",
        tckn: "10000000146",
      }).success,
    ).toBe(true);
    expect(
      publicCheckoutBillingSchema.safeParse({
        type: "INDIVIDUAL",
        sameAsShipping: true,
        name: "Ada",
        tckn: "123",
      }).success,
    ).toBe(false);
  });

  it("requires company + tax office + valid tax number for corporate billing", () => {
    expect(
      publicCheckoutBillingSchema.safeParse({
        type: "CORPORATE",
        sameAsShipping: true,
        companyName: "Acme",
        taxOffice: "Kadikoy",
        taxNumber: "1234567890",
      }).success,
    ).toBe(true);
    expect(
      publicCheckoutBillingSchema.safeParse({
        type: "CORPORATE",
        sameAsShipping: true,
        companyName: "Acme",
      }).success,
    ).toBe(false);
  });

  it("accepts a card payload or a legacy scenario in the payment submit schema", () => {
    expect(
      publicPaymentSubmitRequestSchema.safeParse({
        token: "t",
        card: { holder: "A", number: "5528790000000008", expMonth: 12, expYear: 2030, cvc: "123" },
        installmentCount: 3,
      }).success,
    ).toBe(true);
    expect(publicPaymentSubmitRequestSchema.safeParse({ token: "t", scenario: "success" }).success).toBe(true);
    // Ne kart ne senaryo → reddedilir.
    expect(publicPaymentSubmitRequestSchema.safeParse({ token: "t" }).success).toBe(false);
  });
});

/**
 * BUG-CART-004 (order-detail 404 regresyonu) — Müşteri sipariş detayı ödeme özeti,
 * STORE_CREDIT (Alışveriş bakiyesi, TODO-174B/ADR-282) ile ödenmiş siparişleri de
 * kabul etmelidir. Store-credit PaymentAttempt provider'sızdır (sağlayıcı yok) ve
 * method=STORE_CREDIT'tir. Eskiden şema provider'ı zorunlu enum + method'u kart-yalnız
 * enum tuttuğu için bu siparişin detay ucu 500 veriyor, storefront bunu null→notFound
 * yapıp yanlış ÜRÜN-404 ekranı gösteriyordu.
 */
describe("customerOrderPaymentSummarySchema — store credit paid attempt", () => {
  const base = {
    cardBrand: null,
    cardLast4: null,
    installmentCount: 1,
    transactionId: null,
    threeDsApplied: false,
    paidAt: new Date().toISOString(),
  };

  it("accepts a store-credit payment (no external provider, method STORE_CREDIT)", () => {
    const result = customerOrderPaymentSummarySchema.safeParse({
      ...base,
      provider: null,
      method: "STORE_CREDIT",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a normal card payment (MOCK / CARD)", () => {
    const result = customerOrderPaymentSummarySchema.safeParse({
      ...base,
      provider: "MOCK",
      method: "CARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown method value", () => {
    const result = customerOrderPaymentSummarySchema.safeParse({
      ...base,
      provider: null,
      method: "TOTALLY_UNKNOWN",
    });
    expect(result.success).toBe(false);
  });
});

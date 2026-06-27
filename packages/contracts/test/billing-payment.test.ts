import { describe, expect, it } from "vitest";
import {
  cardLast4,
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

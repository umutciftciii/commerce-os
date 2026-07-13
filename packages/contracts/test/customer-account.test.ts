import { describe, expect, it } from "vitest";
import {
  classifyIdentifier,
  customerAddressInputSchema,
  customerOrderDetailLineSchema,
  customerOrderLineSummarySchema,
  customerPasswordSchema,
  customerRegisterCompleteRequestSchema,
  isValidIban,
  maskIban,
  maskTaxId,
  normalizeIban,
  normalizeTrPhone,
} from "../src/index.js";

describe("F3B.3 customer account helpers", () => {
  it("validates IBAN with ISO 13616 mod-97", () => {
    expect(isValidIban("TR330006100519786457841326")).toBe(true);
    expect(isValidIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true); // bosluk toleransi
    expect(isValidIban("TR330006100519786457841327")).toBe(false); // bozuk checksum
    expect(isValidIban("TR3300061005197864578413")).toBe(false); // yanlis uzunluk
    expect(isValidIban("GB82WEST12345698765432")).toBe(true); // baska ulke
  });

  it("masks IBAN keeping only the head and last two", () => {
    const masked = maskIban("TR330006100519786457841326");
    expect(masked.startsWith("TR33")).toBe(true);
    expect(masked.endsWith("26")).toBe(true);
    expect(masked).not.toContain("0006100519786457841326");
  });

  it("masks tax ids to the last two digits", () => {
    expect(maskTaxId("10000000146")).toBe("*********46");
    expect(maskTaxId("1234567890")).toBe("********90");
  });

  it("normalizes TR phones and IBANs", () => {
    expect(normalizeTrPhone("+90 532 111 22 33")).toBe("5321112233");
    expect(normalizeTrPhone("0532 111 22 33")).toBe("5321112233");
    expect(normalizeIban("tr33 0006")).toBe("TR330006");
  });

  it("classifies identifiers as email, phone, or invalid", () => {
    expect(classifyIdentifier("ada@example.com")).toEqual({ type: "email", value: "ada@example.com" });
    expect(classifyIdentifier("ADA@Example.com")).toEqual({ type: "email", value: "ada@example.com" });
    expect(classifyIdentifier("0532 111 22 33")).toEqual({ type: "phone", value: "5321112233" });
    expect(classifyIdentifier("hello")).toEqual({ type: "invalid" });
    expect(classifyIdentifier("4441111")).toEqual({ type: "invalid" }); // sabit hat degil cep
  });

  it("enforces the password policy (8+, upper, lower, digit)", () => {
    expect(customerPasswordSchema.safeParse("Passw0rd").success).toBe(true);
    expect(customerPasswordSchema.safeParse("short1A").success).toBe(false); // <8
    expect(customerPasswordSchema.safeParse("password1").success).toBe(false); // buyuk harf yok
    expect(customerPasswordSchema.safeParse("PASSWORD1").success).toBe(false); // kucuk harf yok
    expect(customerPasswordSchema.safeParse("Passwordd").success).toBe(false); // rakam yok
  });

  it("requires both consents on register completion", () => {
    const base = {
      identifier: "ada@example.com",
      code: "123456",
      firstName: "Ada",
      lastName: "Lovelace",
      password: "Passw0rd",
    };
    expect(
      customerRegisterCompleteRequestSchema.safeParse({
        ...base,
        kvkkConsent: true,
        clarificationConsent: true,
      }).success,
    ).toBe(true);
    expect(
      customerRegisterCompleteRequestSchema.safeParse({
        ...base,
        kvkkConsent: false,
        clarificationConsent: true,
      }).success,
    ).toBe(false);
  });

  it("validates billing identity in the address input schema", () => {
    const base = {
      addressName: "Ev",
      fullName: "Ada Lovelace",
      phone: "5321112233",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Moda Cad. 1",
    };
    expect(customerAddressInputSchema.safeParse(base).success).toBe(true);
    // Bireysel: gecersiz TCKN reddedilir.
    expect(
      customerAddressInputSchema.safeParse({ ...base, billingType: "INDIVIDUAL", tckn: "123" }).success,
    ).toBe(false);
    // Kurumsal: firma + vergi dairesi zorunlu.
    expect(
      customerAddressInputSchema.safeParse({ ...base, billingType: "CORPORATE", taxNumber: "1234567890" })
        .success,
    ).toBe(false);
    expect(
      customerAddressInputSchema.safeParse({
        ...base,
        billingType: "CORPORATE",
        companyName: "Acme A.Ş.",
        taxOffice: "Kadıköy",
        taxNumber: "1234567890",
      }).success,
    ).toBe(true);
    // Gecersiz telefon reddedilir.
    expect(customerAddressInputSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  });

  // Dilim 6b — sipariş satırı thumbnail'i (imageUrl: nullable ama ZORUNLU alan).
  it("requires imageUrl on customer order lines (nullable, not optional)", () => {
    const line = {
      variantId: "var_1",
      productSlug: "hoodie",
      sku: "HD-M",
      title: "Hoodie",
      variantTitle: "M",
      quantity: 1,
    };
    // Dolu URL ve null ikisi de geçerli.
    expect(customerOrderLineSummarySchema.safeParse({ ...line, imageUrl: "/media/x.webp" }).success).toBe(true);
    expect(customerOrderLineSummarySchema.safeParse({ ...line, imageUrl: null }).success).toBe(true);
    // Alan EKSİK → reddedilir (nullable ama zorunlu; .optional() regresyonunu yakalar).
    expect(customerOrderLineSummarySchema.safeParse(line).success).toBe(false);
  });

  it("customerOrderDetailLineSchema inherits imageUrl from the summary line (extend)", () => {
    const base = {
      variantId: "var_1",
      productSlug: "hoodie",
      sku: "HD-M",
      title: "Hoodie",
      variantTitle: "M",
      quantity: 2,
      unitPriceMinor: 5000,
      lineTotalMinor: 10000,
    };
    // imageUrl mirası: dolu/null geçerli, eksik reddedilir.
    expect(customerOrderDetailLineSchema.safeParse({ ...base, imageUrl: "/media/x.webp" }).success).toBe(true);
    expect(customerOrderDetailLineSchema.safeParse({ ...base, imageUrl: null }).success).toBe(true);
    expect(customerOrderDetailLineSchema.safeParse(base).success).toBe(false);
  });
});

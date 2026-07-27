/**
 * TD-131 (ADR-149…155) — Customer Data Erasure SAF çekirdek testleri.
 * Onay ifadesi doğrulama · anonim placeholder üreticileri · Customer anonimleştirme objesi.
 */
import { describe, expect, it } from "vitest";
import {
  ANONYMIZED_CUSTOMER_FIELDS,
  ANONYMIZED_FULL_NAME,
  CUSTOMER_ERASURE_CONFIRMATION_PHRASE,
  buildCustomerAnonymization,
  emptyDeleteCounts,
  erasedEmailPlaceholder,
  isValidErasureConfirmation,
  totalDeleted,
} from "../src/customer-erasure/core.js";

describe("customer-erasure core: onay ifadesi", () => {
  it("birebir eşleşmede geçerli, boşluk toleranslı", () => {
    expect(isValidErasureConfirmation(CUSTOMER_ERASURE_CONFIRMATION_PHRASE)).toBe(true);
    expect(isValidErasureConfirmation(`  ${CUSTOMER_ERASURE_CONFIRMATION_PHRASE}  `)).toBe(true);
  });
  it("yanlış/boş/null ifade geçersiz", () => {
    expect(isValidErasureConfirmation("kişisel verileri sil")).toBe(false); // küçük harf
    expect(isValidErasureConfirmation("SİL")).toBe(false);
    expect(isValidErasureConfirmation("")).toBe(false);
    expect(isValidErasureConfirmation(undefined)).toBe(false);
    expect(isValidErasureConfirmation(null)).toBe(false);
  });
});

describe("customer-erasure core: placeholder + anonimleştirme", () => {
  it("e-posta placeholder benzersiz + .invalid TLD", () => {
    expect(erasedEmailPlaceholder("c123")).toBe("erased-c123@erased.invalid");
    expect(erasedEmailPlaceholder("c1")).not.toBe(erasedEmailPlaceholder("c2"));
  });

  it("Customer anonimleştirme objesi PII'yi temizler + ERASED terminal + audit izleri", () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    const data = buildCustomerAnonymization({
      customerId: "cus_1",
      now,
      actorUserId: "admin_1",
      reason: "KVKK talebi",
    });
    expect(data.firstName).toBe("Anonim");
    expect(data.lastName).toBe("Müşteri");
    expect(`${data.firstName} ${data.lastName}`).toBe(ANONYMIZED_FULL_NAME);
    expect(data.email).toBe("erased-cus_1@erased.invalid");
    expect(data.phone).toBeNull();
    expect(data.birthDate).toBeNull();
    expect(data.gender).toBeNull();
    expect(data.emailVerifiedAt).toBeNull();
    expect(data.phoneVerifiedAt).toBeNull();
    expect(data.status).toBe("ERASED");
    expect(data.erasedAt).toBe(now);
    expect(data.erasedByUserId).toBe("admin_1");
    expect(data.eraseReason).toBe("KVKK talebi");
  });

  it("anonimleştirilen alan listesi hassas kimlik alanlarını kapsar (audit için)", () => {
    for (const field of ["firstName", "lastName", "email", "phone", "birthDate", "gender"]) {
      expect(ANONYMIZED_CUSTOMER_FIELDS).toContain(field);
    }
  });
});

describe("customer-erasure core: sayaçlar", () => {
  it("boş sayaç tümü sıfır; totalDeleted toplar", () => {
    const c = emptyDeleteCounts();
    expect(totalDeleted(c)).toBe(0);
    c.sessions = 3;
    c.recentlyViewed = 5;
    c.recommendationEvents = 10;
    expect(totalDeleted(c)).toBe(18);
  });
});

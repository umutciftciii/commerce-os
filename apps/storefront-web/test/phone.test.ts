import { describe, expect, it } from "vitest";
import { formatTrPhone, isValidTrPhone, normalizeTrPhone, trLocalDigits } from "../lib/phone";

/**
 * TR telefon yardimcilari (F3B.1 UX). Client format + server normalize/validasyon
 * ayni saf moduldedir. TR cep: 10 hane, "5" ile baslar.
 */
describe("storefront-web · TR phone", () => {
  it("strips prefixes (+90/90/0) to 10 local digits", () => {
    expect(trLocalDigits("+90 532 111 22 33")).toBe("5321112233");
    expect(trLocalDigits("0532 111 22 33")).toBe("5321112233");
    expect(trLocalDigits("905321112233")).toBe("5321112233");
    expect(trLocalDigits("532-111-22-33")).toBe("5321112233");
  });

  it("formats progressively as 5XX XXX XX XX", () => {
    expect(formatTrPhone("532")).toBe("532");
    expect(formatTrPhone("532111")).toBe("532 111");
    expect(formatTrPhone("5321112233")).toBe("532 111 22 33");
    expect(formatTrPhone("0532 111 2233")).toBe("532 111 22 33");
  });

  it("validates Turkish mobile numbers (10 digits starting with 5)", () => {
    expect(isValidTrPhone("532 111 22 33")).toBe(true);
    expect(isValidTrPhone("+90 532 111 22 33")).toBe(true);
    expect(isValidTrPhone("212 111 22 33")).toBe(false); // landline prefix
    expect(isValidTrPhone("532 111 22")).toBe(false); // too short
  });

  it("normalizes to +90XXXXXXXXXX or null when invalid", () => {
    expect(normalizeTrPhone("0532 111 22 33")).toBe("+905321112233");
    expect(normalizeTrPhone("532 111 22 33")).toBe("+905321112233");
    expect(normalizeTrPhone("123")).toBeNull();
    expect(normalizeTrPhone("212 111 22 33")).toBeNull();
  });
});

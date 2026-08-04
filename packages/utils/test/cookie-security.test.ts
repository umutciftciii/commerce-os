/**
 * S5 — Cookie Secure ortak güvenli parser testleri. Boş string production'da insecure ÜRETMEZ;
 * explicit false yalnız dev/test; production'da insecure config FAIL-FAST.
 */
import { describe, expect, it } from "vitest";
import { resolveCookieSecure, resolveSameSite } from "../src/cookie-security.js";

const PROD = { isProduction: true, envName: "ADMIN_COOKIE_SECURE" };
const DEV = { isProduction: false, envName: "ADMIN_COOKIE_SECURE" };

describe("resolveCookieSecure (S5)", () => {
  it("undefined → default (prod true / dev false)", () => {
    expect(resolveCookieSecure(undefined, PROD)).toBe(true);
    expect(resolveCookieSecure(undefined, DEV)).toBe(false);
    expect(resolveCookieSecure(null, PROD)).toBe(true);
  });

  it("boş string / whitespace → default (unset gibi) — prod ASLA insecure değil", () => {
    expect(resolveCookieSecure("", PROD)).toBe(true);
    expect(resolveCookieSecure("   ", PROD)).toBe(true);
    expect(resolveCookieSecure("", DEV)).toBe(false);
  });

  it('"true" → true (her ortamda)', () => {
    expect(resolveCookieSecure("true", DEV)).toBe(true);
    expect(resolveCookieSecure("TRUE", PROD)).toBe(true);
    expect(resolveCookieSecure(" true ", DEV)).toBe(true);
  });

  it('"false" → dev/test false', () => {
    expect(resolveCookieSecure("false", DEV)).toBe(false);
    expect(resolveCookieSecure("FALSE", DEV)).toBe(false);
  });

  it('production + "false" (insecure override) → FAIL-FAST (throw)', () => {
    expect(() => resolveCookieSecure("false", PROD)).toThrow(/production/i);
  });

  it("geçersiz değer → prod throw, dev default(false)", () => {
    expect(() => resolveCookieSecure("yes", PROD)).toThrow();
    expect(() => resolveCookieSecure("1", PROD)).toThrow();
    expect(resolveCookieSecure("yes", DEV)).toBe(false);
  });

  it("production default (unset) → Secure=true", () => {
    expect(resolveCookieSecure(undefined, { isProduction: true })).toBe(true);
  });
});

describe("resolveSameSite (S5)", () => {
  it("strict/lax; boş/geçersiz → lax", () => {
    expect(resolveSameSite("strict")).toBe("strict");
    expect(resolveSameSite("STRICT")).toBe("strict");
    expect(resolveSameSite("lax")).toBe("lax");
    expect(resolveSameSite("")).toBe("lax");
    expect(resolveSameSite(undefined)).toBe("lax");
    expect(resolveSameSite("bogus")).toBe("lax");
  });
});

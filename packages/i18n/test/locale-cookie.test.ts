import { describe, expect, it } from "vitest";
import {
  allDictionaries,
  defaultLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeCookieString,
  resolveLocaleFromCookieValue,
} from "../src/index";

describe("runtime locale cookie", () => {
  it("uses the agreed cookie name", () => {
    expect(localeCookieName).toBe("commerce_os_locale");
  });

  describe("resolveLocaleFromCookieValue", () => {
    it("returns the locale for supported cookie values", () => {
      expect(resolveLocaleFromCookieValue("tr")).toBe("tr");
      expect(resolveLocaleFromCookieValue("en")).toBe("en");
    });

    it("falls back to Turkish for empty, missing or unsupported values", () => {
      expect(resolveLocaleFromCookieValue(undefined)).toBe(defaultLocale);
      expect(resolveLocaleFromCookieValue(null)).toBe(defaultLocale);
      expect(resolveLocaleFromCookieValue("")).toBe(defaultLocale);
      expect(resolveLocaleFromCookieValue("de")).toBe(defaultLocale);
      expect(resolveLocaleFromCookieValue("EN")).toBe(defaultLocale); // case-sensitive
      expect(resolveLocaleFromCookieValue("tr-TR")).toBe(defaultLocale);
    });
  });

  describe("localeCookieString", () => {
    it("builds a lax, path=/ cookie with a long max-age", () => {
      const cookie = localeCookieString("en");
      expect(cookie).toContain(`${localeCookieName}=en`);
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain(`Max-Age=${localeCookieMaxAge}`);
    });

    it("does not mark the cookie httpOnly (it is a preference, not a token)", () => {
      expect(localeCookieString("tr").toLowerCase()).not.toContain("httponly");
    });

    it("omits Secure outside an https browser context", () => {
      // Test ortaminda window/location yoktur; Secure eklenmez.
      expect(localeCookieString("tr")).not.toContain("Secure");
    });
  });
});

describe("language switcher copy parity", () => {
  it("ships the switcher labels in both locales", () => {
    const tr = allDictionaries.tr.common.language;
    const en = allDictionaries.en.common.language;
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
    expect(tr.ariaLabel).toBe("Arayüz dili");
    expect(en.ariaLabel).toBe("Interface language");
    expect(tr.turkish).toBe("Türkçe");
    expect(en.english).toBe("English");
  });
});

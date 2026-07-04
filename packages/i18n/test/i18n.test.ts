import { describe, expect, it } from "vitest";
import {
  allDictionaries,
  defaultLocale,
  format,
  formatDateTime,
  getDefaultDictionary,
  getDictionary,
  isSupportedLocale,
  supportedLocales,
} from "../src/index";

/** Bir nesneyi sirali "nokta yollari" listesine duzler (diziler indeksle). */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) =>
        keyPaths((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
      );
  }
  // Yaprak: yol kaydedilir, deger degil (TR/EN degerleri farkli olmali).
  return [prefix];
}

describe("i18n configuration", () => {
  it("defaults to Turkish", () => {
    expect(defaultLocale).toBe("tr");
  });

  it("supports exactly tr and en", () => {
    expect([...supportedLocales]).toEqual(["tr", "en"]);
  });

  it("treats the first supported locale as the default", () => {
    expect(supportedLocales[0]).toBe(defaultLocale);
  });
});

describe("getDictionary", () => {
  it("returns the Turkish dictionary by default (no/empty locale)", () => {
    expect(getDictionary()).toBe(allDictionaries.tr);
    expect(getDictionary(null)).toBe(allDictionaries.tr);
    expect(getDefaultDictionary()).toBe(allDictionaries.tr);
  });

  it("returns the requested supported dictionary", () => {
    expect(getDictionary("tr")).toBe(allDictionaries.tr);
    expect(getDictionary("en")).toBe(allDictionaries.en);
  });

  it("falls back safely to Turkish for unsupported locales", () => {
    expect(getDictionary("de")).toBe(allDictionaries.tr);
    expect(getDictionary("fr-FR")).toBe(allDictionaries.tr);
    expect(getDictionary("")).toBe(allDictionaries.tr);
    // @ts-expect-error runtime guvenligi: tipi disinda deger de guvenli dusmeli
    expect(getDictionary(123)).toBe(allDictionaries.tr);
  });

  it("renders default (Turkish) shell labels", () => {
    const dict = getDictionary();
    expect(dict.admin.nav.dashboard).toBe("Platform Özeti");
    expect(dict.storeAdmin.nav.dashboard).toBe("Mağaza Paneli");
    expect(dict.storefront.shell.navProducts).toBe("Ürünler");
    expect(dict.common.badges.foundation).toBe("Altyapı");
  });
});

describe("isSupportedLocale", () => {
  it("narrows supported locales and rejects others", () => {
    expect(isSupportedLocale("tr")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("es")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });
});

describe("tr/en key parity", () => {
  const namespaces = ["common", "admin", "storeAdmin", "storefront"] as const;

  for (const ns of namespaces) {
    it(`keeps full key parity for "${ns}"`, () => {
      const trPaths = keyPaths(allDictionaries.tr[ns]);
      const enPaths = keyPaths(allDictionaries.en[ns]);
      expect(enPaths).toEqual(trPaths);
    });
  }

  it("exposes the F3A storefront sales-mode CTA labels in both locales", () => {
    // Vitrin canli katalogtan beslendiginden statik urun listesi kaldirildi;
    // CTA etiketleri (satis-modeli davranisi) her iki dilde de bulunmali.
    for (const locale of ["tr", "en"] as const) {
      const cta = allDictionaries[locale].storefront.cta;
      expect(cta.addToCart.length).toBeGreaterThan(0);
      expect(cta.requestPrice.length).toBeGreaterThan(0);
      expect(cta.bookAppointment.length).toBeGreaterThan(0);
      expect(cta.whatsapp.length).toBeGreaterThan(0);
      expect(cta.requestInfo.length).toBeGreaterThan(0);
    }
  });
});

describe("format", () => {
  it("replaces named placeholders", () => {
    expect(format("{count} ürün", { count: 4 })).toBe("4 ürün");
  });

  it("leaves unknown placeholders intact", () => {
    expect(format("{a} / {b}", { a: "x" })).toBe("x / {b}");
  });
});

describe("formatDateTime", () => {
  // Yerel saatle kurulan Date, yerel saatle biçimlenir → TZ'den bağımsız deterministik.
  const localDate = new Date(2026, 6, 4, 18, 0, 0); // 4 Temmuz 2026, 18:00 (yerel)
  const localMorning = new Date(2026, 6, 5, 9, 5, 0); // 5 Temmuz 2026, 09:05

  it("Türkçe için dd.MM.yyyy HH:mm (24 saat, saniyesiz) döner", () => {
    expect(formatDateTime(localDate, "tr")).toBe("04.07.2026 18:00");
    expect(formatDateTime(localMorning, "tr")).toBe("05.07.2026 09:05");
  });

  it("Türkçe çıktı AM/PM ve saniye içermez", () => {
    const out = formatDateTime(localDate, "tr");
    expect(out).not.toMatch(/AM|PM/);
    expect(out).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("İngilizce için 24 saat (AM/PM yok) makul bir biçim döner", () => {
    const out = formatDateTime(localDate, "en");
    expect(out).toContain("18:00");
    expect(out).not.toMatch(/AM|PM/);
  });

  it("varsayılan locale Türkçedir", () => {
    expect(formatDateTime(localDate)).toBe("04.07.2026 18:00");
  });

  it("geçersiz/boş değerde em-dash döner", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("ISO string girdisini kabul eder", () => {
    expect(formatDateTime(localDate.toISOString(), "tr")).toMatch(
      /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/,
    );
  });
});

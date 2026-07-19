import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESERVED_SLUGS,
  SLUG_FALLBACK,
  SLUG_MAX_LENGTH,
  generateSlug,
  isCanonicalSlug,
  resolveUniqueSlug,
  slugify,
  validateSlug,
} from "../src/slug.js";

describe("slugify — normalizasyon", () => {
  it("lowercase + boşluk → tire", () => {
    expect(slugify("Kırmızı Tişört")).toBe("kirmizi-tisort");
  });

  it("Türkçe karakterler doğru transliterasyon (ç ğ ı İ ö ş ü)", () => {
    expect(slugify("Çğıİöşü ÇĞÖŞÜ")).toBe("cgiiosu-cgosu");
  });

  it("İ (büyük noktalı I) → i (combining dot düşer)", () => {
    expect(slugify("İSTANBUL")).toBe("istanbul");
  });

  it("unicode aksanlı Latin harfleri NFKD ile ASCII'ye iner", () => {
    expect(slugify("Café Crème é à ñ")).toBe("cafe-creme-e-a-n");
  });

  it("geçersiz karakterler (simge/emoji/noktalama) tireye çevrilir + kırpılır", () => {
    expect(slugify("Ürün #1 — %50! ✨")).toBe("urun-1-50");
  });

  it("tekrarlı tireler tek tireye iner + baş/son tire kırpılır", () => {
    expect(slugify("  --a---b--  ")).toBe("a-b");
  });

  it("ß → ss, æ → ae, ø → o genişletmeleri", () => {
    expect(slugify("Straße Æther Søren")).toBe("strasse-aether-soren");
  });

  it("maks uzunluğa keser ve yarım-kelime son tiresini kırpar", () => {
    const long = "a".repeat(SLUG_MAX_LENGTH + 20);
    expect(slugify(long).length).toBe(SLUG_MAX_LENGTH);
    // "aaaa-bbbb..." kesildiğinde son tire kalmaz.
    const dashed = `${"word-".repeat(30)}`; // 150 char
    expect(slugify(dashed).endsWith("-")).toBe(false);
  });

  it("özel maxLength opsiyonu uygulanır", () => {
    expect(slugify("kirmizi-tisort-mavi", { maxLength: 7 })).toBe("kirmizi");
  });

  it("boş / yalnız-simge girdi fallback köküne düşer", () => {
    expect(slugify("")).toBe(SLUG_FALLBACK);
    expect(slugify("✨✨✨")).toBe(SLUG_FALLBACK);
    expect(slugify("   ")).toBe(SLUG_FALLBACK);
    expect(slugify("!!!", { fallback: "kategori" })).toBe("kategori");
  });

  it("deterministik: aynı girdi → aynı çıktı", () => {
    expect(slugify("Yaz Koleksiyonu 2026")).toBe(slugify("Yaz Koleksiyonu 2026"));
  });
});

describe("isCanonicalSlug", () => {
  it("temiz slug için true", () => {
    expect(isCanonicalSlug("kirmizi-tisort")).toBe(true);
  });
  it("büyük harf / boşluk / çift tire için false", () => {
    expect(isCanonicalSlug("Kirmizi Tisort")).toBe(false);
    expect(isCanonicalSlug("a--b")).toBe(false);
    expect(isCanonicalSlug("-a")).toBe(false);
    expect(isCanonicalSlug("")).toBe(false);
  });
});

describe("validateSlug — manuel override doğrulama", () => {
  it("geçerli slug → ok, hata yok", () => {
    expect(validateSlug("kirmizi-tisort")).toEqual({
      ok: true,
      normalized: "kirmizi-tisort",
      errors: [],
    });
  });

  it("büyük harf + boşluk → invalid-characters, normalized önerisi verir", () => {
    const r = validateSlug("Kirmizi Tisort");
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("invalid-characters");
    expect(r.normalized).toBe("kirmizi-tisort");
  });

  it("baş/son tire ve çift tire ayrı hatalar", () => {
    expect(validateSlug("-abc").errors).toContain("leading-trailing-dash");
    expect(validateSlug("a--b").errors).toContain("consecutive-dash");
  });

  it("boş → empty", () => {
    expect(validateSlug("   ").errors).toContain("empty");
  });

  it("çok uzun → too-long", () => {
    expect(validateSlug("a".repeat(SLUG_MAX_LENGTH + 1)).errors).toContain("too-long");
  });

  it("rezerve slug → reserved", () => {
    expect(validateSlug("cart").errors).toContain("reserved");
    expect(validateSlug("checkout").errors).toContain("reserved");
  });
});

describe("resolveUniqueSlug — deterministik kolizyon çözümü", () => {
  it("boş küme → kök korunur", () => {
    expect(resolveUniqueSlug("kirmizi-tisort", () => false)).toBe("kirmizi-tisort");
  });

  it("çakışma → -2, -3 ... deterministik sonek", () => {
    const taken = new Set(["kirmizi-tisort", "kirmizi-tisort-2"]);
    expect(resolveUniqueSlug("Kırmızı Tişört", (c) => taken.has(c))).toBe("kirmizi-tisort-3");
  });

  it("rezerve kök otomatik sonek alır (route çakışması)", () => {
    expect(resolveUniqueSlug("cart", () => false)).toBe("cart-2");
  });

  it("sonek eklerken maks uzunluğu korur (kök kısaltılır)", () => {
    const base = "a".repeat(SLUG_MAX_LENGTH);
    const result = resolveUniqueSlug(base, (c) => c === base, { maxLength: SLUG_MAX_LENGTH });
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(result.endsWith("-2")).toBe(true);
  });

  it("determinizm: aynı girdi + aynı predikat → aynı sonuç", () => {
    const taken = new Set(["a", "a-2"]);
    expect(resolveUniqueSlug("a", (c) => taken.has(c))).toBe(
      resolveUniqueSlug("a", (c) => taken.has(c)),
    );
  });
});

describe("generateSlug — auto + manuel override + güncelleme", () => {
  it("başlıktan otomatik üretir", () => {
    expect(generateSlug({ title: "Yaz Şapkası", existing: new Set() })).toBe("yaz-sapkasi");
  });

  it("geçerli manuel override kullanılır", () => {
    expect(
      generateSlug({ title: "Yaz Şapkası", manual: "ozel-slug", existing: new Set() }),
    ).toBe("ozel-slug");
  });

  it("geçersiz manuel override normalize edilir", () => {
    expect(
      generateSlug({ title: "Yaz Şapkası", manual: "Özel Slug!", existing: new Set() }),
    ).toBe("ozel-slug");
  });

  it("kolizyonda sonek eklenir", () => {
    expect(
      generateSlug({ title: "Yaz Şapkası", existing: new Set(["yaz-sapkasi"]) }),
    ).toBe("yaz-sapkasi-2");
  });

  it("güncelleme: kendi mevcut slug'ıyla çakışma yok sayılır (self)", () => {
    expect(
      generateSlug({
        title: "Yaz Şapkası",
        existing: new Set(["yaz-sapkasi"]),
        self: "yaz-sapkasi",
      }),
    ).toBe("yaz-sapkasi");
  });
});

describe("DEFAULT_RESERVED_SLUGS", () => {
  it("kritik route segmentlerini içerir", () => {
    for (const word of ["products", "search", "cart", "checkout", "account", "sitemap.xml", "robots.txt"]) {
      expect(DEFAULT_RESERVED_SLUGS.has(word)).toBe(true);
    }
  });
});

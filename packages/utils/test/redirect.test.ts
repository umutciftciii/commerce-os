import { describe, expect, it } from "vitest";
import {
  buildRedirectIndex,
  normalizeRedirectPath,
  resolveRedirect,
  resolveRedirectFromRules,
  redirectEnumToStatus,
  type RedirectRule,
} from "../src/redirect.js";
import { productUrlPath, categoryUrlPath } from "../src/seo-paths.js";

const rule = (source: string, target: string, over: Partial<RedirectRule> = {}): RedirectRule => ({
  source,
  target,
  type: over.type ?? 301,
  enabled: over.enabled ?? true,
});

describe("normalizeRedirectPath", () => {
  it("leading slash ekler, trailing slash düşer", () => {
    expect(normalizeRedirectPath("a/b/")).toBe("/a/b");
    expect(normalizeRedirectPath("/a/b")).toBe("/a/b");
  });
  it("query + hash düşer", () => {
    expect(normalizeRedirectPath("/a?x=1#h")).toBe("/a");
  });
  it("kök korunur", () => {
    expect(normalizeRedirectPath("/")).toBe("/");
  });
  it("boş / whitespace → null", () => {
    expect(normalizeRedirectPath("")).toBeNull();
    expect(normalizeRedirectPath("   ")).toBeNull();
  });
});

describe("resolveRedirect — temel eşleşme", () => {
  const rules = [rule("/eski-urun", "/products/yeni-urun")];
  const index = buildRedirectIndex(rules);

  it("kaynak eşleşir → hedef + 301", () => {
    expect(resolveRedirect("/eski-urun", index)).toEqual({
      target: "/products/yeni-urun",
      type: 301,
      hops: 1,
    });
  });

  it("trailing slash farkı yok sayılır", () => {
    expect(resolveRedirect("/eski-urun/", index)?.target).toBe("/products/yeni-urun");
  });

  it("query korunmaz (path bazlı eşleşme)", () => {
    expect(resolveRedirect("/eski-urun?ref=x", index)?.target).toBe("/products/yeni-urun");
  });

  it("kaynak değilse null", () => {
    expect(resolveRedirect("/baska", index)).toBeNull();
  });
});

describe("resolveRedirect — redirect tipleri (301/302/307/308)", () => {
  it("her tip korunur", () => {
    for (const type of [301, 302, 307, 308] as const) {
      const idx = buildRedirectIndex([rule("/a", "/b", { type })]);
      expect(resolveRedirect("/a", idx)?.type).toBe(type);
    }
  });
});

describe("resolveRedirect — chain collapse (zincir YOK)", () => {
  it("A→B→C tek adımda C'ye çözülür, tip ilk kuraldan", () => {
    const idx = buildRedirectIndex([
      rule("/a", "/b", { type: 301 }),
      rule("/b", "/c", { type: 302 }),
    ]);
    expect(resolveRedirect("/a", idx)).toEqual({ target: "/c", type: 301, hops: 2 });
  });

  it("uzun zincir A→B→C→D→E son hedefe iner", () => {
    const idx = buildRedirectIndex([
      rule("/a", "/b"),
      rule("/b", "/c"),
      rule("/c", "/d"),
      rule("/d", "/e"),
    ]);
    expect(resolveRedirect("/a", idx)?.target).toBe("/e");
  });
});

describe("resolveRedirect — loop koruması (güvenli)", () => {
  it("A→B→A döngüsü → null", () => {
    const idx = buildRedirectIndex([rule("/a", "/b"), rule("/b", "/a")]);
    expect(resolveRedirect("/a", idx)).toBeNull();
  });

  it("A→B→C→A döngüsü → null", () => {
    const idx = buildRedirectIndex([rule("/a", "/b"), rule("/b", "/c"), rule("/c", "/a")]);
    expect(resolveRedirect("/a", idx)).toBeNull();
  });

  it("self-redirect (A→A) index'te elenir → null", () => {
    const idx = buildRedirectIndex([rule("/a", "/a")]);
    expect(idx.size).toBe(0);
    expect(resolveRedirect("/a", idx)).toBeNull();
  });

  it("maxHops aşımı (patolojik uzun zincir) → null", () => {
    const rules: RedirectRule[] = [];
    for (let i = 0; i < 20; i += 1) rules.push(rule(`/n${i}`, `/n${i + 1}`));
    const idx = buildRedirectIndex(rules);
    expect(resolveRedirect("/n0", idx, { maxHops: 5 })).toBeNull();
  });
});

describe("buildRedirectIndex — eleme + precedence", () => {
  it("disabled kural yok sayılır", () => {
    const idx = buildRedirectIndex([rule("/a", "/b", { enabled: false })]);
    expect(idx.size).toBe(0);
  });

  it("boş/geçersiz hedef elenir (missing target güvenli)", () => {
    const idx = buildRedirectIndex([rule("/a", ""), rule("/b", "   ")]);
    expect(idx.size).toBe(0);
  });

  it("aynı source için SON kural kazanır (precedence: updatedAt ASC)", () => {
    const idx = buildRedirectIndex([rule("/a", "/eski"), rule("/a", "/yeni")]);
    expect(resolveRedirect("/a", idx)?.target).toBe("/yeni");
  });
});

describe("resolveRedirectFromRules — kolaylık sarmalayıcı", () => {
  it("kural listesi + path → çözüm", () => {
    expect(resolveRedirectFromRules("/a", [rule("/a", "/b")])?.target).toBe("/b");
  });
  it("disabled hedef kaynağı zinciri kırar (aktif A→B, B pasif → B'de durur)", () => {
    const rules = [rule("/a", "/b"), rule("/b", "/c", { enabled: false })];
    expect(resolveRedirectFromRules("/a", rules)?.target).toBe("/b");
  });
});

describe("redirectEnumToStatus — DB enum → HTTP status", () => {
  it("bilinen enumlar doğru statüye", () => {
    expect(redirectEnumToStatus("PERMANENT_301")).toBe(301);
    expect(redirectEnumToStatus("FOUND_302")).toBe(302);
    expect(redirectEnumToStatus("TEMPORARY_307")).toBe(307);
    expect(redirectEnumToStatus("PERMANENT_308")).toBe(308);
  });
  it("bilinmeyen değer güvenli 301'e düşer", () => {
    expect(redirectEnumToStatus("WHATEVER")).toBe(301);
  });
});

describe("seo-paths — entity → kanonik path (gateway/storefront tek kaynak)", () => {
  it("productUrlPath = /products/{slug}", () => {
    expect(productUrlPath("iphone-15")).toBe("/products/iphone-15");
  });
  it("categoryUrlPath = /products?category={slug}", () => {
    expect(categoryUrlPath("ayakkabi")).toBe("/products?category=ayakkabi");
  });
});

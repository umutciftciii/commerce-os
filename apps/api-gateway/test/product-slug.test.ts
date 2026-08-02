import { describe, expect, it } from "vitest";
import { resolveProductSlugOnUpdate } from "../src/seo/product-slug";

const base = {
  currentTitle: "Puma Sneaker",
  currentSlug: "puma-sneaker",
  currentSlugLocked: false,
  existingSlugs: new Set<string>(["puma-sneaker"]),
};

describe("resolveProductSlugOnUpdate", () => {
  it("ad degisince ve kilit yokken slug'i otomatik yeniden uretir", () => {
    const result = resolveProductSlugOnUpdate({ ...base, nextTitle: "Camper Sneaker" });
    expect(result.slug).toBe("camper-sneaker");
    expect(result.slugChanged).toBe(true);
    expect(result.slugLocked).toBe(false);
  });

  it("slug kilitliyken ad degisse bile slug'i korur", () => {
    const result = resolveProductSlugOnUpdate({
      ...base,
      currentSlugLocked: true,
      nextTitle: "Camper Sneaker",
    });
    expect(result.slug).toBe("puma-sneaker");
    expect(result.slugChanged).toBe(false);
    expect(result.slugLocked).toBe(true);
  });

  it("ad ayni kalinca slug'i degistirmez", () => {
    const result = resolveProductSlugOnUpdate({ ...base, nextTitle: "Puma Sneaker" });
    expect(result.slug).toBe("puma-sneaker");
    expect(result.slugChanged).toBe(false);
  });

  it("hicbir alan degismezse slug'i degistirmez", () => {
    const result = resolveProductSlugOnUpdate({ ...base });
    expect(result.slug).toBe("puma-sneaker");
    expect(result.slugChanged).toBe(false);
  });

  it("acik (manuel) slug gonderilirse onu normalize edip kullanir", () => {
    const result = resolveProductSlugOnUpdate({ ...base, explicitSlug: "Ozel Slug!!" });
    expect(result.slug).toBe("ozel-slug");
    expect(result.slugChanged).toBe(true);
  });

  it("otomatik uretimde slug collision'i deterministik sonek ile cozer", () => {
    const result = resolveProductSlugOnUpdate({
      ...base,
      nextTitle: "Camper Sneaker",
      existingSlugs: new Set<string>(["puma-sneaker", "camper-sneaker"]),
    });
    expect(result.slug).toBe("camper-sneaker-2");
    expect(result.slugChanged).toBe(true);
  });

  it("regenerateFromTitle=true iken ad degismese bile slug'i baslikatan tazeler ve kilidi kaldirir", () => {
    const result = resolveProductSlugOnUpdate({
      ...base,
      currentSlug: "eski-manuel-slug",
      currentSlugLocked: true,
      regenerateFromTitle: true,
      existingSlugs: new Set<string>(["eski-manuel-slug"]),
    });
    expect(result.slug).toBe("puma-sneaker");
    expect(result.slugChanged).toBe(true);
    expect(result.slugLocked).toBe(false);
  });

  it("nextSlugLocked=true ile ayni istekte kilitlerse ad degisse bile slug korunur", () => {
    const result = resolveProductSlugOnUpdate({
      ...base,
      nextTitle: "Camper Sneaker",
      nextSlugLocked: true,
    });
    expect(result.slug).toBe("puma-sneaker");
    expect(result.slugLocked).toBe(true);
    expect(result.slugChanged).toBe(false);
  });

  it("kendi mevcut slug'ini collision saymaz (ad ayni normalize edilince)", () => {
    const result = resolveProductSlugOnUpdate({
      ...base,
      currentTitle: "Camper Sneaker",
      currentSlug: "camper-sneaker",
      nextTitle: "Camper Sneaker",
      existingSlugs: new Set<string>(["camper-sneaker"]),
    });
    expect(result.slug).toBe("camper-sneaker");
    expect(result.slugChanged).toBe(false);
  });
});

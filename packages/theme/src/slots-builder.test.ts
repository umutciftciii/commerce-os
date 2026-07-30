import { describe, it, expect } from "vitest";
import {
  THEME_SLOT_REGISTRY,
  listSlotBuilderMenu,
  isValidSlotVariant,
} from "./slots.js";

describe("slot variant genişleme (TODO-164A)", () => {
  it("her slot ≥3 builder variant sunar", () => {
    for (const slot of THEME_SLOT_REGISTRY) {
      expect(slot.builderVariants.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("her builder variant allowlist'te (variants) yer alır", () => {
    for (const slot of THEME_SLOT_REGISTRY) {
      for (const bv of slot.builderVariants) {
        expect(isValidSlotVariant(slot.key, bv.key)).toBe(true);
      }
    }
  });

  it("defaultVariant geriye uyum için variants[0] olarak korunur (lowercase)", () => {
    for (const slot of THEME_SLOT_REGISTRY) {
      expect(slot.variants[0]).toBe(slot.defaultVariant);
    }
  });

  it("eski (lowercase) variant'lar hâlâ geçerli — geriye uyum", () => {
    expect(isValidSlotVariant("header", "solid")).toBe(true);
    expect(isValidSlotVariant("productCard", "premium")).toBe(true);
    expect(isValidSlotVariant("hero", "split")).toBe(true);
  });

  it("listSlotBuilderMenu 8 slot döndürür + label taşır", () => {
    const menu = listSlotBuilderMenu();
    expect(menu).toHaveLength(8);
    for (const entry of menu) {
      expect(entry.nameTr.length).toBeGreaterThan(0);
      expect(entry.variants.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("bilinmeyen variant reddedilir", () => {
    expect(isValidSlotVariant("header", "SOMETHING")).toBe(false);
  });
});

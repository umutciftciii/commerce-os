import { describe, expect, it } from "vitest";
import {
  CART_MAX_LINES,
  CART_MAX_QTY,
  clampQuantity,
  isStaleVersion,
  mergeCartLines,
  nextVersion,
  type CartLineRef,
} from "../src/cart/cart-core.js";

describe("clampQuantity", () => {
  it("clamps below-minimum to 1", () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
  });

  it("clamps above-maximum to 999", () => {
    expect(clampQuantity(1000)).toBe(CART_MAX_QTY);
    expect(clampQuantity(5000)).toBe(999);
  });

  it("keeps in-range values and floors fractionals", () => {
    expect(clampQuantity(3)).toBe(3);
    expect(clampQuantity(2.9)).toBe(2);
  });
});

describe("nextVersion / isStaleVersion", () => {
  it("nextVersion increments by one", () => {
    expect(nextVersion(1)).toBe(2);
    expect(nextVersion(41)).toBe(42);
  });

  it("isStaleVersion true only on mismatch", () => {
    expect(isStaleVersion(3, 3)).toBe(false);
    expect(isStaleVersion(2, 3)).toBe(true);
    expect(isStaleVersion(4, 3)).toBe(true);
  });
});

describe("mergeCartLines", () => {
  const line = (variantId: string, quantity: number): CartLineRef => ({ variantId, quantity });

  it("returns clamped incoming when existing is empty", () => {
    const result = mergeCartLines([], [line("v1", 2), line("v2", 1000)]);
    expect(result.lines).toEqual([line("v1", 2), line("v2", 999)]);
    expect(result.overflow).toEqual([]);
    expect(result.merged).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("preserves existing lines when incoming is empty", () => {
    const existing = [line("v1", 3), line("v2", 4)];
    const result = mergeCartLines(existing, []);
    expect(result.lines).toEqual([line("v1", 3), line("v2", 4)]);
    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("sums quantity for a duplicate variant and keeps existing position", () => {
    const result = mergeCartLines([line("v1", 3), line("v2", 1)], [line("v1", 2)]);
    expect(result.lines).toEqual([line("v1", 5), line("v2", 1)]);
    expect(result.merged).toBe(1);
    expect(result.overflow).toEqual([]);
  });

  it("clamps a summed quantity to the maximum", () => {
    const result = mergeCartLines([line("v1", 995)], [line("v1", 20)]);
    expect(result.lines).toEqual([line("v1", 999)]);
  });

  it("appends new incoming variants in cookie order after existing", () => {
    const result = mergeCartLines([line("v1", 1)], [line("v3", 2), line("v2", 1)]);
    expect(result.lines).toEqual([line("v1", 1), line("v3", 2), line("v2", 1)]);
    expect(result.merged).toBe(2);
  });

  it("sums incoming duplicates among themselves into a single line", () => {
    const result = mergeCartLines([], [line("v1", 2), line("v1", 3)]);
    expect(result.lines).toEqual([line("v1", 5)]);
    expect(result.merged).toBe(2);
  });

  it("caps distinct lines at 100 and reports overflow (no silent loss)", () => {
    const existing: CartLineRef[] = Array.from({ length: CART_MAX_LINES }, (_, i) =>
      line(`e${i}`, 1),
    );
    const result = mergeCartLines(existing, [line("new1", 5), line("new2", 6)]);
    expect(result.lines).toHaveLength(CART_MAX_LINES);
    expect(result.lines.some((l) => l.variantId === "new1")).toBe(false);
    expect(result.overflow).toEqual([line("new1", 5), line("new2", 6)]);
    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("still sums into an existing variant even when at the line cap", () => {
    const existing: CartLineRef[] = Array.from({ length: CART_MAX_LINES }, (_, i) =>
      line(`e${i}`, 1),
    );
    const result = mergeCartLines(existing, [line("e0", 4), line("new1", 9)]);
    expect(result.lines).toHaveLength(CART_MAX_LINES);
    expect(result.lines[0]).toEqual(line("e0", 5));
    expect(result.overflow).toEqual([line("new1", 9)]);
    expect(result.merged).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("drops invalid quantities/ids defensively without throwing", () => {
    const result = mergeCartLines([], [line("", 3), line("v1", 0), line("v2", 2)]);
    expect(result.lines).toEqual([line("v2", 2)]);
  });
});

// TODO-165A (ADR-165A) — Task 8: resolveFashionOptions pure-function tests. Hicbir DB/IO
// yok; plain object fixture'lar ile store-scoped-governed > global-canonical oncelik
// mantigini dogrular.
import { describe, expect, it } from "vitest";
import {
  resolveFashionOptions,
  type ResolvableFashionOption,
} from "../src/taxonomy/option-resolver.js";

function opt(
  storeId: string | null,
  value: string,
  sortOrder: number,
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
): ResolvableFashionOption {
  return { storeId, value, sortOrder, status };
}

describe("resolveFashionOptions — governed fashion.* precedence", () => {
  it("store A sees canonical + its own governed values; store B never sees store A's", () => {
    const allOptions = [
      opt(null, "yaz", 0), // global canonical
      opt(null, "kis", 1), // global canonical
      opt("store_a", "ilkbahar", 2), // store A's own governed value
    ];

    const forA = resolveFashionOptions("store_a", "fashion.season", allOptions);
    expect(forA.map((o) => o.value)).toEqual(["ilkbahar", "yaz", "kis"]);

    const forB = resolveFashionOptions("store_b", "fashion.season", allOptions);
    expect(forB.map((o) => o.value)).toEqual(["yaz", "kis"]);
    expect(forB.some((o) => o.value === "ilkbahar")).toBe(false);
  });

  it("de-dupes by value: store-scoped governed 'pamuk' hides the global canonical twin", () => {
    const allOptions = [
      opt(null, "pamuk", 0), // global canonical
      opt("store_a", "pamuk", 5), // store A governs its own 'pamuk'
    ];

    const forA = resolveFashionOptions("store_a", "fashion.material", allOptions);
    expect(forA).toHaveLength(1);
    expect(forA[0]).toMatchObject({ storeId: "store_a", value: "pamuk" });
  });

  it("a store with no governed 'pamuk' still sees the global canonical 'pamuk'", () => {
    const allOptions = [opt(null, "pamuk", 0), opt("store_a", "pamuk", 5)];

    const forB = resolveFashionOptions("store_b", "fashion.material", allOptions);
    expect(forB).toHaveLength(1);
    expect(forB[0]).toMatchObject({ storeId: null, value: "pamuk" });
  });

  it("ARCHIVED store-scoped option is excluded, and its global twin is NOT resurrected", () => {
    const allOptions = [
      opt(null, "pamuk", 0), // global canonical
      opt("store_a", "pamuk", 5, "ARCHIVED"), // store archived its own governed value
    ];

    const forA = resolveFashionOptions("store_a", "fashion.material", allOptions);
    // archived = "no new selection" — value disappears entirely, global is NOT resurrected.
    expect(forA).toHaveLength(0);
  });

  it("orders store-scoped options by sortOrder, then global fallback by sortOrder", () => {
    const allOptions = [
      opt("store_a", "b_store", 2),
      opt("store_a", "a_store", 1),
      opt(null, "z_global", 10),
      opt(null, "a_global", 1),
    ];

    const forA = resolveFashionOptions("store_a", "fashion.season", allOptions);
    expect(forA.map((o) => o.value)).toEqual(["a_store", "b_store", "a_global", "z_global"]);
  });

  it("ignores ARCHIVED global canonical options as fallback (unselectable)", () => {
    const allOptions = [opt(null, "eskimis", 0, "ARCHIVED")];
    const forA = resolveFashionOptions("store_a", "fashion.season", allOptions);
    expect(forA).toHaveLength(0);
  });

  it("returns the list UNCHANGED for a non-governed definitionCode", () => {
    const allOptions = [
      opt("store_a", "red", 3),
      opt(null, "blue", 1),
      opt("store_a", "green", 0, "ARCHIVED"),
    ];
    const result = resolveFashionOptions("store_a", "color", allOptions);
    expect(result).toEqual(allOptions);
  });

  it("is pure: does not mutate the input array", () => {
    const allOptions = [opt("store_a", "b", 2), opt("store_a", "a", 1)];
    const copy = allOptions.map((o) => ({ ...o }));
    resolveFashionOptions("store_a", "fashion.season", allOptions);
    expect(allOptions).toEqual(copy);
  });
});

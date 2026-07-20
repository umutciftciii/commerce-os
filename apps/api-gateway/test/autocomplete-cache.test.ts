import { describe, expect, it } from "vitest";
import { createAutocompleteCache } from "../src/search/autocomplete-cache.js";
import type { PublicAutocompleteResponse } from "@commerce-os/contracts";

/** TODO-156E — Autocomplete TTL/LRU cache birim testleri. */

const val = (q: string): PublicAutocompleteResponse => ({
  query: q,
  suggestions: [],
  products: [],
  categories: [],
  brands: [],
});

describe("createAutocompleteCache", () => {
  it("set/get aynı pencere içinde hit", () => {
    const c = createAutocompleteCache({ ttlMs: 1000 });
    c.set("k", val("a"), 0);
    expect(c.get("k", 500)?.query).toBe("a");
  });

  it("TTL geçince miss + girdi düşer", () => {
    const c = createAutocompleteCache({ ttlMs: 1000 });
    c.set("k", val("a"), 0);
    expect(c.get("k", 1001)).toBeUndefined();
    expect(c.size()).toBe(0);
  });

  it("maxEntries taşınca EN ESKİ atılır (LRU dokunuşu sıcak tutar)", () => {
    const c = createAutocompleteCache({ ttlMs: 10_000, maxEntries: 2 });
    c.set("a", val("a"), 0);
    c.set("b", val("b"), 0);
    // "a"yı oku → en sona taşınır (sıcak).
    c.get("a", 1);
    c.set("c", val("c"), 1); // taşma → en eski "b" atılır
    expect(c.get("a", 2)?.query).toBe("a");
    expect(c.get("b", 2)).toBeUndefined();
    expect(c.get("c", 2)?.query).toBe("c");
  });
});

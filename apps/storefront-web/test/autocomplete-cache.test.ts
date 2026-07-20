import { describe, expect, it } from "vitest";
import { createClientCache } from "../lib/autocomplete/cache";

/** TODO-156E — İstemci autocomplete cache SAF birim testleri (enjekte saat). */

describe("createClientCache", () => {
  it("set/get pencere içinde hit", () => {
    const c = createClientCache<string>(1000);
    c.set("k", "a", 0);
    expect(c.get("k", 500)).toBe("a");
  });

  it("TTL geçince miss + düşer", () => {
    const c = createClientCache<string>(1000);
    c.set("k", "a", 0);
    expect(c.get("k", 1001)).toBeUndefined();
    expect(c.size()).toBe(0);
  });

  it("maxEntries taşınca en eski atılır (LRU dokunuşu sıcak tutar)", () => {
    const c = createClientCache<string>(10_000, 2);
    c.set("a", "a", 0);
    c.set("b", "b", 0);
    c.get("a", 1); // "a" sıcak
    c.set("c", "c", 1); // "b" düşer
    expect(c.get("a", 2)).toBe("a");
    expect(c.get("b", 2)).toBeUndefined();
    expect(c.get("c", 2)).toBe("c");
  });
});

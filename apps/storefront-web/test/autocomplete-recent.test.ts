import { describe, expect, it } from "vitest";
import { addRecent, clearRecent, readRecent, RECENT_SEARCHES_KEY, type StorageLike } from "../lib/autocomplete/recent";

/** TODO-156E — Son aramalar SAF birim testleri (fake storage). */

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("recent searches", () => {
  it("addRecent başa ekler + tekilleştirir (normalize)", () => {
    const s = fakeStorage();
    addRecent(s, "Kalem");
    addRecent(s, "Defter");
    const out = addRecent(s, "kalem"); // "Kalem" ile aynı → başa taşınır, dup yok
    expect(out).toEqual(["kalem", "Defter"]);
  });

  it("bounded (limit)", () => {
    const s = fakeStorage();
    for (const term of ["a", "b", "c", "d", "e", "f"]) addRecent(s, term);
    expect(readRecent(s, 5)).toHaveLength(5);
    expect(readRecent(s, 5)[0]).toBe("f"); // en yeni başta
  });

  it("boş term değiştirmez", () => {
    const s = fakeStorage();
    addRecent(s, "x");
    expect(addRecent(s, "   ")).toEqual(["x"]);
  });

  it("bozuk JSON güvenle boş döner", () => {
    const s = fakeStorage({ [RECENT_SEARCHES_KEY]: "{not json" });
    expect(readRecent(s)).toEqual([]);
  });

  it("clearRecent hepsini siler", () => {
    const s = fakeStorage();
    addRecent(s, "x");
    clearRecent(s);
    expect(readRecent(s)).toEqual([]);
  });
});

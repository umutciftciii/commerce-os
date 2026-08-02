import { describe, expect, it } from "vitest";
import { axisKind } from "../src/fashion/public-projection";

describe("axisKind — beden ekseni normalize (TODO-165B)", () => {
  it("fashion.color veya COLOR dataType → color", () => {
    expect(axisKind("fashion.color", "COLOR")).toBe("color");
    expect(axisKind("renk", "COLOR")).toBe("color");
  });

  it("fashion.size → size", () => {
    expect(axisKind("fashion.size", "SELECT")).toBe("size");
  });

  it("eski taksonomi beden eksenleri (numara/beden/bez_bedeni) → size", () => {
    expect(axisKind("numara", "SELECT")).toBe("size");
    expect(axisKind("beden", "SELECT")).toBe("size");
    expect(axisKind("bez_bedeni", "SELECT")).toBe("size");
  });

  it("beden-disi eksenler (materyal/sezon) → other", () => {
    expect(axisKind("materyal", "SELECT")).toBe("other");
    expect(axisKind("sezon", "SELECT")).toBe("other");
  });

  it("renk her zaman size'dan once (COLOR dataType 'numara' iceren isim olsa bile color kazanir)", () => {
    // Guard: dataType COLOR ise beden ipucu icerse bile color.
    expect(axisKind("renk_numarasi", "COLOR")).toBe("color");
  });
});

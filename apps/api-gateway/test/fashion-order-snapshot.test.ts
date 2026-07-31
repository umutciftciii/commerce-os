// TODO-165 Fashion Vertical (ADR-252) — order snapshot resolver testleri (SAF).
import { describe, it, expect } from "vitest";
import {
  resolveFashionLineSnapshot,
  extractProductFashionMeta,
  resolveFashionSnapshotFromPrisma,
} from "../src/fashion/order-snapshot.js";

const color = {
  code: "fashion.color",
  dataType: "COLOR",
  optionValue: "red",
  optionLabel: "Kırmızı",
  colorHex: "#D32F2F",
};
const size = {
  code: "fashion.size",
  dataType: "SELECT",
  optionValue: "M",
  optionLabel: "M",
  colorHex: null,
};

describe("resolveFashionLineSnapshot", () => {
  it("fashion-dışı varyant (eksen yok) → tüm alanlar null", () => {
    const snap = resolveFashionLineSnapshot({ axisSelections: [], materialLabels: ["Pamuk"] });
    expect(snap).toEqual({
      selectedColor: null,
      selectedColorHex: null,
      selectedSize: null,
      sizeSystem: null,
      swatchLabel: null,
      materialSummary: null,
      variantDisplayName: null,
    });
  });

  it("renk + beden + materyal → tam snapshot", () => {
    const snap = resolveFashionLineSnapshot({
      axisSelections: [color, size],
      materialLabels: ["Pamuk", "Elastan"],
      sizeSystemKey: "INTERNATIONAL",
    });
    expect(snap.selectedColor).toBe("Kırmızı");
    expect(snap.selectedColorHex).toBe("#D32F2F");
    expect(snap.selectedSize).toBe("M");
    expect(snap.sizeSystem).toBe("INTERNATIONAL");
    expect(snap.swatchLabel).toBe("red"); // colorFamily
    expect(snap.materialSummary).toBe("Pamuk, Elastan");
    expect(snap.variantDisplayName).toBe("Kırmızı / M");
  });

  it("geçersiz hex swatch reddedilir (raw CSS koruması)", () => {
    const snap = resolveFashionLineSnapshot({
      axisSelections: [{ ...color, colorHex: "red; background:url(x)" }],
    });
    expect(snap.selectedColorHex).toBeNull();
    expect(snap.selectedColor).toBe("Kırmızı");
  });

  it("yalnız beden (renk yok) → sizeSystem dolu, renk null", () => {
    const snap = resolveFashionLineSnapshot({ axisSelections: [size], sizeSystemKey: "EU" });
    expect(snap.selectedSize).toBe("M");
    expect(snap.sizeSystem).toBe("EU");
    expect(snap.selectedColor).toBeNull();
    expect(snap.variantDisplayName).toBe("M");
  });

  it("beden yoksa sizeSystem null kalır (yanlış eşleme önlenir)", () => {
    const snap = resolveFashionLineSnapshot({ axisSelections: [color], sizeSystemKey: "EU" });
    expect(snap.sizeSystem).toBeNull();
    expect(snap.variantDisplayName).toBe("Kırmızı");
  });
});

describe("prisma adapterleri (server wiring)", () => {
  it("extractProductFashionMeta: MULTI_SELECT materyal + size_system", () => {
    const meta = extractProductFashionMeta([
      {
        valueText: null,
        definition: { code: "fashion.material", dataType: "MULTI_SELECT" },
        option: null,
        optionLinks: [{ option: { value: "cotton", label: "Pamuk" } }, { option: { value: "elastane", label: "Elastan" } }],
      },
      {
        valueText: null,
        definition: { code: "fashion.size_system", dataType: "SELECT" },
        option: { value: "INTERNATIONAL", label: "Uluslararası" },
        optionLinks: [],
      },
    ]);
    expect(meta.materialLabels).toEqual(["Pamuk", "Elastan"]);
    expect(meta.sizeSystemKey).toBe("INTERNATIONAL");
  });

  it("resolveFashionSnapshotFromPrisma: varyant eksen + ürün meta → tam snapshot", () => {
    const snap = resolveFashionSnapshotFromPrisma({
      axisRows: [
        { definition: { code: "fashion.color", dataType: "COLOR" }, option: { value: "blue", label: "Mavi", colorHex: "#1976D2" } },
        { definition: { code: "fashion.size", dataType: "SELECT" }, option: { value: "L", label: "L", colorHex: null } },
      ],
      productAttributeRows: [
        {
          valueText: null,
          definition: { code: "fashion.material", dataType: "MULTI_SELECT" },
          option: null,
          optionLinks: [{ option: { value: "cotton", label: "Pamuk" } }],
        },
        {
          valueText: null,
          definition: { code: "fashion.size_system", dataType: "SELECT" },
          option: { value: "INTERNATIONAL", label: "Uluslararası" },
          optionLinks: [],
        },
      ],
      variantTitle: "Mavi / L",
    });
    expect(snap).toMatchObject({
      selectedColor: "Mavi",
      selectedColorHex: "#1976D2",
      selectedSize: "L",
      sizeSystem: "INTERNATIONAL",
      swatchLabel: "blue",
      materialSummary: "Pamuk",
      variantDisplayName: "Mavi / L",
    });
  });

  it("fashion-dışı ürün (eksen yok) → tüm alanlar null", () => {
    const snap = resolveFashionSnapshotFromPrisma({
      axisRows: [],
      productAttributeRows: [],
      variantTitle: "Standart",
    });
    expect(snap.selectedColor).toBeNull();
    expect(snap.variantDisplayName).toBeNull();
  });
});

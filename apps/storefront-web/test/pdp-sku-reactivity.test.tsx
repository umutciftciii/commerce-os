// TODO-165 (SKU reactivity fix) — PDP "Ürün kodu" reaktivitesi.
//
// SKU reaktivitesinin çekirdeği: Buy Box, tam eksen seçiminden `fashionVariantIdForSelection`
// ile varyantı çözer ve PAYLAŞILAN selectedVariantId'i günceller; `PdpSkuLabel` bunu okuyup
// seçili varyantın SKU'sunu gösterir. Bu test hem saf çözüm helper'larını hem de bileşen
// render'ını (default/fallback/gizleme) kapsar.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  fashionAxisSelectionForVariant,
  fashionVariantIdForSelection,
  cheapestVariantId,
  type StorefrontFashionView,
  type StorefrontVariantView,
} from "../lib/catalog-types";
import { PdpSelectionProvider } from "../components/pdp-selection";
import { PdpSkuLabel } from "../components/pdp-sku-label";

const COLOR = "attr-color";
const SIZE = "attr-size";

// 2 renk × 2 beden = 4 varyant. siyah/S OOS (auto-heal senaryosu için).
const variants: StorefrontVariantView[] = [
  { id: "v-siyah-S", sku: "SKU-BLK-S", title: "Siyah / S" } as StorefrontVariantView,
  { id: "v-siyah-M", sku: "SKU-BLK-M", title: "Siyah / M" } as StorefrontVariantView,
  { id: "v-mavi-S", sku: "SKU-BLU-S", title: "Mavi / S" } as StorefrontVariantView,
  { id: "v-mavi-M", sku: "SKU-BLU-M", title: "Mavi / M" } as StorefrontVariantView,
];

const fashion: StorefrontFashionView = {
  optionAxes: [
    {
      attributeDefinitionId: COLOR,
      code: "fashion.color",
      name: "Renk",
      dataType: "COLOR",
      kind: "color",
      options: [
        { optionId: "c-siyah", value: "black", label: "Siyah", colorHex: "#111", colorFamily: "black", order: 0 },
        { optionId: "c-mavi", value: "blue", label: "Mavi", colorHex: "#00f", colorFamily: "blue", order: 1 },
      ],
    },
    {
      attributeDefinitionId: SIZE,
      code: "fashion.size",
      name: "Beden",
      dataType: "SELECT",
      kind: "size",
      options: [
        { optionId: "s-S", value: "S", label: "S", colorHex: null, colorFamily: null, order: 0 },
        { optionId: "s-M", value: "M", label: "M", colorHex: null, colorFamily: null, order: 1 },
      ],
    },
  ],
  variantAxisOptions: [
    { variantId: "v-siyah-S", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-siyah" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
    { variantId: "v-siyah-M", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-siyah" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
    { variantId: "v-mavi-S", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-mavi" }, { attributeDefinitionId: SIZE, optionId: "s-S" }] },
    { variantId: "v-mavi-M", axisOptions: [{ attributeDefinitionId: COLOR, optionId: "c-mavi" }, { attributeDefinitionId: SIZE, optionId: "s-M" }] },
  ],
  attributes: [],
  sizeSystemKey: "INTERNATIONAL",
  sizeChart: null,
};

const skuOf = (variantId: string | null) => variants.find((v) => v.id === variantId)?.sku ?? null;

describe("SKU reactivity — saf çözüm helper'ları", () => {
  it("ilk (default) varyant SKU'su: en ucuzdan eksen seçimi → aynı varyant", () => {
    const def = cheapestVariantId(variants);
    const selection = fashionAxisSelectionForVariant(fashion, def);
    expect(skuOf(fashionVariantIdForSelection(fashion, selection))).toBe(skuOf(def));
  });

  it("renk değişimi → SKU senkron değişir", () => {
    const selection = { [COLOR]: "c-mavi", [SIZE]: "s-M" };
    expect(skuOf(fashionVariantIdForSelection(fashion, selection))).toBe("SKU-BLU-M");
  });

  it("beden değişimi → SKU senkron değişir", () => {
    const selection = { [COLOR]: "c-siyah", [SIZE]: "s-S" };
    expect(skuOf(fashionVariantIdForSelection(fashion, selection))).toBe("SKU-BLK-S");
  });

  it("OOS auto-heal sonrası SKU: siyah/S→siyah/M seçimi doğru varyant SKU'su verir", () => {
    // Buy box auto-heal seçili bedeni stokta olana (M) taşır → çözülen varyant SKU'su.
    const healed = { [COLOR]: "c-siyah", [SIZE]: "s-M" };
    expect(skuOf(fashionVariantIdForSelection(fashion, healed))).toBe("SKU-BLK-M");
  });

  it("eksik seçim (yalnız renk) → null (yanıltıcı SKU yok)", () => {
    expect(fashionVariantIdForSelection(fashion, { [COLOR]: "c-siyah" })).toBeNull();
  });

  it("geçersiz kombinasyon (var olmayan option) → null", () => {
    expect(fashionVariantIdForSelection(fashion, { [COLOR]: "c-siyah", [SIZE]: "s-YOK" })).toBeNull();
  });
});

describe("PdpSkuLabel render (initial/SSR)", () => {
  const markup = (defaultVariantId: string | null, fallbackSku: string | null) =>
    renderToStaticMarkup(
      <PdpSelectionProvider defaultVariantId={defaultVariantId}>
        <PdpSkuLabel variants={variants} fallbackSku={fallbackSku} label="Ürün kodu" />
      </PdpSelectionProvider>,
    );

  it("seçili (default) varyant SKU'sunu gösterir", () => {
    expect(markup("v-mavi-M", "SKU-BLK-S")).toContain("SKU-BLU-M");
  });

  it("selectedVariantId eşleşmezse fallback gösterir (yanıltıcı SKU yok)", () => {
    expect(markup(null, "SKU-BLK-S")).toContain("SKU-BLK-S");
  });

  it("SKU yoksa (fallback null + eşleşme yok) hiçbir şey göstermez", () => {
    expect(markup(null, null)).toBe("");
  });

  it("klasik PDP (fashion yok): default varyant SKU'su gösterilir", () => {
    expect(markup("v-siyah-S", "SKU-BLK-S")).toContain("SKU-BLK-S");
  });
});

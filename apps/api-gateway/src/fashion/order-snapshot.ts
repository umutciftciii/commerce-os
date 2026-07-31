// TODO-165 Fashion Vertical (ADR-252) — OrderLine fashion snapshot cozumleyici (SAF).
//
// Bir varyantin normalized eksen degerlerinden (ProductVariantOptionValue ⋈ AttributeOption
// ⋈ AttributeDefinition) OrderLine fashion snapshot alanlarini TURETIR. Server-side
// cagrilir (createOrder/addOrderLine); client MANIPULE EDEMEZ. Sonuc IMMUTABLE — siparis
// aninda dondurulur (urun/varyant sonradan degisse bile snapshot sabit).
//
// SAF: IO yok. Fashion-disi varyant → tum alanlar null (geriye uyumlu; ESKI kalemler NULL).

import { colorFamilyOf, isValidHexSwatch } from "./canonical-attributes.js";

/** Bir varyantin cozulmus eksen secimi (renk/beden). */
export interface VariantAxisSelection {
  /** AttributeDefinition.code — ornek "fashion.color", "fashion.size". */
  code: string;
  dataType: string; // "COLOR" | "SELECT" | ...
  optionValue: string; // AttributeOption.value (normalized)
  optionLabel: string; // AttributeOption.label (display)
  colorHex: string | null; // yalniz COLOR
}

export interface FashionSnapshotInput {
  axisSelections: VariantAxisSelection[];
  /** Urun-seviyesi materyal etiketleri (fashion.material MULTI_SELECT) — ozet icin. */
  materialLabels?: string[];
  /** Urunun beden sistemi (fashion.size_system value) — snapshot icin. */
  sizeSystemKey?: string | null;
  /** Fallback varyant basligi (eksen cozulmezse). */
  variantTitle?: string | null;
}

export interface FashionLineSnapshot {
  selectedColor: string | null;
  selectedColorHex: string | null;
  selectedSize: string | null;
  sizeSystem: string | null;
  swatchLabel: string | null;
  materialSummary: string | null;
  variantDisplayName: string | null;
}

// ── Prisma-sekilli adaptorler (server createOrder/addOrderLine icin) ─────────
// Bu adaptorler prisma select ciktisini SAF resolver girdisine cevirir; boylece
// server.ts tarafi minimal kalir ve mantik tek yerde test edilir.

export interface PrismaVariantAxisRow {
  definition: { code: string; dataType: string };
  option: { value: string; label: string; colorHex: string | null };
}
export interface PrismaProductAttributeRow {
  valueText: string | null;
  definition: { code: string; dataType: string };
  option: { value: string; label: string } | null;
  optionLinks: { option: { value: string; label: string } }[];
}

/** Varyantin eksen secimlerini (renk/beden) resolver girdisine cevirir. */
export function mapVariantAxisSelections(rows: PrismaVariantAxisRow[]): VariantAxisSelection[] {
  return rows.map((r) => ({
    code: r.definition.code,
    dataType: r.definition.dataType,
    optionValue: r.option.value,
    optionLabel: r.option.label,
    colorHex: r.option.colorHex,
  }));
}

/** Urun-seviyesi fashion attribute'larindan materyal etiketleri + beden sistemi cikarir. */
export function extractProductFashionMeta(rows: PrismaProductAttributeRow[]): {
  materialLabels: string[];
  sizeSystemKey: string | null;
} {
  let materialLabels: string[] = [];
  let sizeSystemKey: string | null = null;
  for (const r of rows) {
    if (r.definition.code === "fashion.material") {
      if (r.optionLinks.length > 0) materialLabels = r.optionLinks.map((l) => l.option.label);
      else if (r.option) materialLabels = [r.option.label];
      else if (r.valueText) materialLabels = [r.valueText];
    } else if (r.definition.code === "fashion.size_system") {
      sizeSystemKey = r.option?.value ?? r.valueText ?? null;
    }
  }
  return { materialLabels, sizeSystemKey };
}

/** Prisma varyant+urun cikisindan dogrudan fashion snapshot uretir (tek cagri). */
export function resolveFashionSnapshotFromPrisma(input: {
  axisRows: PrismaVariantAxisRow[];
  productAttributeRows: PrismaProductAttributeRow[];
  variantTitle: string | null;
}): FashionLineSnapshot {
  const { materialLabels, sizeSystemKey } = extractProductFashionMeta(input.productAttributeRows);
  return resolveFashionLineSnapshot({
    axisSelections: mapVariantAxisSelections(input.axisRows),
    materialLabels,
    sizeSystemKey,
    variantTitle: input.variantTitle,
  });
}

const EMPTY: FashionLineSnapshot = {
  selectedColor: null,
  selectedColorHex: null,
  selectedSize: null,
  sizeSystem: null,
  swatchLabel: null,
  materialSummary: null,
  variantDisplayName: null,
};

function isColorAxis(sel: VariantAxisSelection): boolean {
  return sel.dataType === "COLOR" || sel.code === "fashion.color";
}
function isSizeAxis(sel: VariantAxisSelection): boolean {
  return sel.code === "fashion.size";
}

/**
 * Fashion snapshot alanlarini turetir. Renk/beden eksenleri yoksa (fashion-disi urun)
 * tum alanlar null doner — hicbir sipariş görünümü degismez.
 */
export function resolveFashionLineSnapshot(input: FashionSnapshotInput): FashionLineSnapshot {
  const color = input.axisSelections.find(isColorAxis) ?? null;
  const size = input.axisSelections.find(isSizeAxis) ?? null;

  if (!color && !size) {
    // Materyal ozeti tek basina fashion snapshot uretmez (renk/beden yoksa fashion-disi).
    return EMPTY;
  }

  const selectedColor = color?.optionLabel ?? null;
  const selectedColorHex = color?.colorHex && isValidHexSwatch(color.colorHex) ? color.colorHex : null;
  const selectedSize = size?.optionLabel ?? null;
  const colorFamily = color ? colorFamilyOf(color.optionValue) : null;

  const materialSummary =
    input.materialLabels && input.materialLabels.length > 0
      ? input.materialLabels.slice(0, 4).join(", ")
      : null;

  // variantDisplayName: "Renk / Beden" (mevcut olanlar); ikisi de yoksa fallback title.
  const parts = [selectedColor, selectedSize].filter((p): p is string => !!p);
  const variantDisplayName = parts.length > 0 ? parts.join(" / ") : input.variantTitle ?? null;

  return {
    selectedColor,
    selectedColorHex,
    selectedSize,
    sizeSystem: selectedSize ? input.sizeSystemKey ?? null : null,
    swatchLabel: colorFamily,
    materialSummary,
    variantDisplayName,
  };
}

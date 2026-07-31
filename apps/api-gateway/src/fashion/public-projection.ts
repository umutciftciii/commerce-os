// TODO-165 Fashion Vertical (ADR-247/249/250) — Public PDP fashion projeksiyonu.
//
// Bir urun icin yapisal eksenleri (renk/beden), fashion attribute ozetlerini ve yayinli size
// chart ozetini SUNUCUDAN turetir. YALNIZ FASHION_VERTICAL acikken cagrilir (capability-aware;
// endpoint gate'ler). Salt sunum verisi; hesaplama yok. Renk ailesi kod-katalogdan.

import { prisma } from "@commerce-os/db";
import type { PublicFashionProjection } from "@commerce-os/contracts";
import { colorFamilyOf, isValidHexSwatch } from "./canonical-attributes.js";

const AXIS_COLOR = "fashion.color";
const AXIS_SIZE = "fashion.size";
const SIZE_SYSTEM_CODE = "fashion.size_system";

// PDP'de ozetlenecek urun-seviyesi fashion attribute'lari (kod → gorunur ad fallback).
const SUMMARY_CODES: Record<string, string> = {
  "fashion.material": "Materyal",
  "fashion.fit": "Kalıp",
  "fashion.pattern": "Desen",
  "fashion.season": "Sezon",
  "fashion.collection": "Koleksiyon",
  "fashion.care": "Bakım",
  "fashion.gender": "Cinsiyet",
  "fashion.sleeve_type": "Kol",
  "fashion.collar_type": "Yaka",
  "fashion.length": "Boy",
};

function axisKind(code: string, dataType: string): "color" | "size" | "other" {
  if (code === AXIS_COLOR || dataType === "COLOR") return "color";
  if (code === AXIS_SIZE) return "size";
  return "other";
}

export async function buildPublicFashionProjection(
  storeId: string,
  productId: string,
  primaryCategoryId: string | null,
): Promise<PublicFashionProjection | null> {
  // 1) Varyant eksen secimleri (renk/beden) — normalized tablodan.
  const variantOptionValues = await prisma.productVariantOptionValue.findMany({
    where: { storeId, variant: { productId } },
    select: {
      variantId: true,
      attributeDefinitionId: true,
      optionId: true,
      definition: { select: { code: true, name: true, dataType: true } },
      option: { select: { id: true, value: true, label: true, colorHex: true, sortOrder: true } },
    },
  });

  // 2) Urun-seviyesi fashion attribute degerleri (materyal/fit/... + size_system).
  const productAttrs = await prisma.productAttributeValue.findMany({
    where: { storeId, productId, definition: { code: { startsWith: "fashion." } } },
    select: {
      valueText: true,
      definition: { select: { code: true, name: true, dataType: true } },
      option: { select: { label: true, value: true } },
      optionLinks: { select: { option: { select: { label: true } } } },
    },
  });

  // Fashion sinyali yoksa (ne eksen ne attribute) → null (fashion-disi urun).
  if (variantOptionValues.length === 0 && productAttrs.length === 0) return null;

  // ── Eksenleri kur ──
  type AxisAcc = {
    attributeDefinitionId: string;
    code: string;
    name: string;
    dataType: string;
    kind: "color" | "size" | "other";
    options: Map<string, { optionId: string; value: string; label: string; colorHex: string | null; colorFamily: string | null; order: number }>;
  };
  const axes = new Map<string, AxisAcc>();
  const variantAxisOptions = new Map<string, { attributeDefinitionId: string; optionId: string }[]>();

  for (const row of variantOptionValues) {
    const kind = axisKind(row.definition.code, row.definition.dataType);
    let axis = axes.get(row.attributeDefinitionId);
    if (!axis) {
      axis = {
        attributeDefinitionId: row.attributeDefinitionId,
        code: row.definition.code,
        name: row.definition.name,
        dataType: row.definition.dataType,
        kind,
        options: new Map(),
      };
      axes.set(row.attributeDefinitionId, axis);
    }
    if (!axis.options.has(row.optionId)) {
      const hex = row.option.colorHex && isValidHexSwatch(row.option.colorHex) ? row.option.colorHex : null;
      axis.options.set(row.optionId, {
        optionId: row.optionId,
        value: row.option.value,
        label: row.option.label,
        colorHex: hex,
        colorFamily: kind === "color" ? colorFamilyOf(row.option.value) : null,
        order: row.option.sortOrder ?? 0,
      });
    }
    const list = variantAxisOptions.get(row.variantId) ?? [];
    list.push({ attributeDefinitionId: row.attributeDefinitionId, optionId: row.optionId });
    variantAxisOptions.set(row.variantId, list);
  }

  const optionAxes = [...axes.values()].map((a) => ({
    attributeDefinitionId: a.attributeDefinitionId,
    code: a.code,
    name: a.name,
    dataType: a.dataType,
    kind: a.kind,
    options: [...a.options.values()].sort((x, y) => x.order - y.order),
  }));
  // Renk eksenini once goster (swatch), beden sonra.
  optionAxes.sort((x, y) => {
    const rank = (k: string) => (k === "color" ? 0 : k === "size" ? 1 : 2);
    return rank(x.kind) - rank(y.kind);
  });

  // ── Attribute ozetleri + size system ──
  const attributes: { code: string; name: string; values: string[] }[] = [];
  let sizeSystemKey: string | null = null;
  for (const attr of productAttrs) {
    const code = attr.definition.code;
    if (code === SIZE_SYSTEM_CODE) {
      sizeSystemKey = attr.option?.value ?? attr.valueText ?? null;
      continue;
    }
    if (!(code in SUMMARY_CODES)) continue;
    let values: string[] = [];
    if (attr.optionLinks.length > 0) values = attr.optionLinks.map((l) => l.option.label);
    else if (attr.option) values = [attr.option.label];
    else if (attr.valueText) values = [attr.valueText];
    if (values.length > 0) {
      attributes.push({ code, name: SUMMARY_CODES[code] ?? attr.definition.name, values });
    }
  }

  // ── Size chart cozumu: PRODUCT > CATEGORY > STORE (published revision) ──
  const sizeChart = await resolvePublishedSizeChart(storeId, productId, primaryCategoryId);

  return {
    optionAxes,
    variantAxisOptions: [...variantAxisOptions.entries()].map(([variantId, axisOptions]) => ({
      variantId,
      axisOptions,
    })),
    attributes,
    sizeSystemKey,
    sizeChart,
  };
}

async function resolvePublishedSizeChart(
  storeId: string,
  productId: string,
  primaryCategoryId: string | null,
): Promise<PublicFashionProjection["sizeChart"]> {
  // Scope onceligi: PRODUCT → CATEGORY → STORE. Ilk PUBLISHED + revision'li chart kazanir.
  const assignments = await prisma.sizeChartAssignment.findMany({
    where: {
      storeId,
      OR: [
        { scope: "PRODUCT", productId },
        ...(primaryCategoryId ? [{ scope: "CATEGORY" as const, categoryId: primaryCategoryId }] : []),
        { scope: "STORE" },
      ],
    },
    select: { scope: true, sizeChartId: true },
  });
  if (assignments.length === 0) return null;
  const rank = (s: string) => (s === "PRODUCT" ? 0 : s === "CATEGORY" ? 1 : 2);
  assignments.sort((a, b) => rank(a.scope) - rank(b.scope));

  for (const asg of assignments) {
    const chart = await prisma.sizeChart.findFirst({
      where: { id: asg.sizeChartId, storeId, status: "PUBLISHED", publishedRevisionId: { not: null } },
      select: {
        id: true,
        name: true,
        sizeSystemKey: true,
        measurementUnit: true,
        publishedRevisionId: true,
      },
    });
    if (!chart || !chart.publishedRevisionId) continue;
    const revision = await prisma.sizeChartRevision.findFirst({
      where: { id: chart.publishedRevisionId, storeId },
      select: { columns: true, rows: true },
    });
    if (!revision) continue;
    return {
      id: chart.id,
      name: chart.name,
      sizeSystemKey: chart.sizeSystemKey,
      measurementUnit: chart.measurementUnit,
      columns: (Array.isArray(revision.columns) ? revision.columns : []) as {
        key: string;
        label: string;
        unit?: string;
      }[],
      rows: (Array.isArray(revision.rows) ? revision.rows : []) as {
        size: string;
        cells: Record<string, string | number>;
      }[],
    };
  }
  return null;
}

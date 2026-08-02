// TODO-165 Fashion Vertical (ADR-247/249/250) — Public PDP fashion projeksiyonu.
//
// Bir urun icin yapisal eksenleri (renk/beden), fashion attribute ozetlerini ve yayinli size
// chart ozetini SUNUCUDAN turetir. YALNIZ FASHION_VERTICAL acikken cagrilir (capability-aware;
// endpoint gate'ler). Salt sunum verisi; hesaplama yok. Renk ailesi kod-katalogdan.

import { prisma } from "@commerce-os/db";
import type { PublicFashionProjection, PublicProductVariant } from "@commerce-os/contracts";
import { colorFamilyOf, isValidHexSwatch } from "./canonical-attributes.js";
import type { SizeChartService } from "./size-chart-service.js";

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

// TODO-165B — Beden ekseni normalize. Fashion vertical yalniz `fashion.size` code'unu "size"
// sayiyordu; enterprise-demo gibi eski taksonomiler `numara`/`beden`/`bez_bedeni` kullaniyor →
// eksen "other" dusup beden kartlari renk-disi grupta yanlis render ediliyordu. Kod ipuclariyla
// (size/beden/numara) normalize edilir. NOT: bu YALNIZ varyant UX'i (kart gruplama) icindir;
// "Beden Tablosu" butonunun gorunurlugu ayrica fashion.sizeChart VARLIGINA baglidir (buy-box).
const SIZE_CODE_HINTS = ["size", "beden", "numara"];

export function axisKind(code: string, dataType: string): "color" | "size" | "other" {
  if (code === AXIS_COLOR || dataType === "COLOR") return "color";
  const lower = code.toLowerCase();
  if (code === AXIS_SIZE || SIZE_CODE_HINTS.some((hint) => lower.includes(hint))) return "size";
  return "other";
}

export async function buildPublicFashionProjection(
  sizeChartService: Pick<SizeChartService, "resolveEffective">,
  storeId: string,
  productId: string,
  primaryCategoryId: string | null,
  // TODO-165B — Renk/beden kartı fiyat özeti için ZATEN hesaplanmış public varyant DTO'ları
  // (buildPublicProduct çıktısı). Server-authoritative fiyat/stok kaynağı; projeksiyon yeni
  // fiyat türetmez, yalnız option→min seçim yapar.
  variants: readonly PublicProductVariant[] = [],
): Promise<PublicFashionProjection | null> {
  // 1) Varyant eksen secimleri (renk/beden) — normalized tablodan. TODO-165B: YALNIZ ACTIVE
  // varyant (hidden/archived/inactive varyant option'ları optionAxes'e ve fiyat özetine SIZMAZ).
  const variantOptionValues = await prisma.productVariantOptionValue.findMany({
    where: { storeId, variant: { productId, status: "ACTIVE" } },
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

  // ── TODO-165B — Option başına fiyat özeti (renk/beden kartları için; SERVER-authoritative) ──
  // optionId → o option'a sahip ACTIVE varyant id'leri (variantAxisOptions'tan ters harita).
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const variantIdsByOption = new Map<string, string[]>();
  for (const [variantId, opts] of variantAxisOptions) {
    for (const o of opts) {
      const arr = variantIdsByOption.get(o.optionId) ?? [];
      arr.push(variantId);
      variantIdsByOption.set(o.optionId, arr);
    }
  }
  function optionPriceSummary(optionId: string): {
    startingPriceMinor: number | null;
    compareAtMinor: number | null;
    priceCurrency: string | null;
    inStock: boolean;
  } {
    let startingPriceMinor: number | null = null;
    let compareAtMinor: number | null = null;
    let priceCurrency: string | null = null;
    let inStock = false;
    let mixedCurrency = false;
    for (const variantId of variantIdsByOption.get(optionId) ?? []) {
      const v = variantById.get(variantId);
      if (!v) continue; // ACTIVE-only listede yoksa atla (savunma).
      if (v.inStock) inStock = true;
      if (v.priceMinor === null) continue; // fiyat gizli → özete girmez.
      if (priceCurrency === null) priceCurrency = v.currency;
      else if (priceCurrency !== v.currency) mixedCurrency = true;
      if (startingPriceMinor === null || v.priceMinor < startingPriceMinor) {
        startingPriceMinor = v.priceMinor;
        // Eski fiyat yalnız gerçekten indirimliyse (compareAt > satış).
        compareAtMinor = v.compareAtMinor !== null && v.compareAtMinor > v.priceMinor ? v.compareAtMinor : null;
      }
    }
    // Karışık para birimi → tek fiyat özeti YANILTICI olur; fail-safe null (UI fiyat göstermez).
    if (mixedCurrency) return { startingPriceMinor: null, compareAtMinor: null, priceCurrency: null, inStock };
    return {
      startingPriceMinor,
      compareAtMinor,
      priceCurrency: startingPriceMinor !== null ? priceCurrency : null,
      inStock,
    };
  }

  const optionAxes = [...axes.values()].map((a) => ({
    attributeDefinitionId: a.attributeDefinitionId,
    code: a.code,
    name: a.name,
    dataType: a.dataType,
    kind: a.kind,
    options: [...a.options.values()]
      .sort((x, y) => x.order - y.order)
      .map((opt) => ({ ...opt, ...optionPriceSummary(opt.optionId) })),
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
  const sizeChart = await resolvePublishedSizeChart(sizeChartService, storeId, productId, primaryCategoryId);

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

/**
 * TODO-165A Tasks 25/26 — Scope onceligi PRODUCT → CATEGORY → STORE (ilk PUBLISHED +
 * revision'li chart kazanir). Precedence UYGULAMASI `SizeChartService.resolveEffective`'te
 * YASAR (tek yer); bu fonksiyon SADECE onu cagirip PDP'nin public (scope'suz) sekline
 * cevirir. Store-admin `GET .../size-chart-assignment` ucu AYNI `resolveEffective`'i
 * DOGRUDAN cagirir (scope dahil) — paralel bir precedence kopyasi YOK.
 */
export async function resolvePublishedSizeChart(
  sizeChartService: Pick<SizeChartService, "resolveEffective">,
  storeId: string,
  productId: string,
  primaryCategoryId: string | null,
): Promise<PublicFashionProjection["sizeChart"]> {
  const resolved = await sizeChartService.resolveEffective(storeId, productId, primaryCategoryId);
  const revision = resolved?.chart.publishedRevision;
  if (!resolved || !revision) return null;
  const { chart } = resolved;
  return {
    id: chart.id,
    name: chart.name,
    sizeSystemKey: chart.sizeSystemKey,
    measurementUnit: chart.measurementUnit,
    columns: revision.columns,
    rows: revision.rows,
  };
}

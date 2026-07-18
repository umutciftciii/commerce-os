/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Deterministik Arama Dokümanı Builder (SAF).
 *
 * Tek bir ürünün kaynak projeksiyonundan (SearchSourceProduct) arama dokümanı + facet satırlarını
 * üretir. IO YOK, Prisma YOK, rastgelelik YOK → aynı girdi ⇒ aynı çıktı (test edilebilir, idempotent).
 *
 * KURALLAR (ADR-079):
 *  - Ürün ACTIVE değilse → { removed:true } (read-model'de tutulmaz; unpublished/archived = kaldır).
 *  - Fiyat: yalnız priceVisible ise ACTIVE varyantların priceMinor'ından min/max; aksi halde null.
 *  - Stok: varyant inStock = available===null || available>0; hasStock = herhangi bir ACTIVE varyant.
 *  - Facet KAYNAĞI: yalnız CategoryAttribute.filterable=true (hardcode facet YOK). definition/option
 *    ARCHIVED ise HARİÇ. variantDefining → varyant değerleri; aksi → ürün değerleri.
 *  - searchText: title + brand + searchable attribute değerleri + açıklama (normalize).
 *  - Aynı ürünün aynı facet değeri (ör. çoklu varyantta aynı renk) TEKİLLEŞTİRİLİR.
 *  - IMAGE/FILE dataType facet'lenmez; MULTI_SELECT junction seçenekleri ayrı satır olur.
 */

import { buildSearchText, normalizeText } from "./normalize.js";
import type {
  SearchBuildResult,
  SearchDocumentData,
  SearchFacetData,
  SearchSourceCategoryAttribute,
  SearchSourceProduct,
  SearchSourceProductAttributeValue,
} from "./types.js";

/** Facet'lenemeyen (medya) veri tipleri. */
const NON_FACETABLE = new Set(["IMAGE", "FILE"]);

export function buildSearchDocument(source: SearchSourceProduct): SearchBuildResult {
  // 1) Görünürlük: yalnız ACTIVE ürün indekslenir.
  if (source.status !== "ACTIVE") {
    return { removed: true };
  }

  const activeVariants = source.variants.filter((v) => v.status === "ACTIVE");

  // 2) Fiyat projeksiyonu (yalnız görünür fiyat + ACTIVE varyant).
  let minPriceMinor: number | null = null;
  let maxPriceMinor: number | null = null;
  let currency: string | null = null;
  if (source.priceVisible && activeVariants.length > 0) {
    const prices = activeVariants.map((v) => v.priceMinor);
    minPriceMinor = Math.min(...prices);
    maxPriceMinor = Math.max(...prices);
    // Para birimi: en ucuz varyantın currency'si (kart taban fiyatı deseniyle simetrik).
    const cheapest = activeVariants.reduce((a, b) => (b.priceMinor < a.priceMinor ? b : a));
    currency = cheapest.currency;
  }

  // 3) Stok projeksiyonu (Inventory Engine: available = onHand − reserved; null = bilinmiyor = stokta say).
  const hasStock = activeVariants.some((v) => v.available === null || v.available > 0);
  const availability = hasStock ? "IN_STOCK" : "OUT_OF_STOCK";

  // 4) Aranabilir metin (searchable attribute değerleri dahil).
  const searchText = buildSearchText([
    source.title,
    source.brand,
    ...collectSearchableText(source),
    source.description,
  ]);

  const document: SearchDocumentData = {
    storeId: source.storeId,
    productId: source.id,
    primaryCategoryId: source.primaryCategoryId,
    title: source.title,
    slug: source.slug,
    brand: source.brand,
    searchText,
    status: source.status,
    minPriceMinor,
    maxPriceMinor,
    currency,
    hasStock,
    availability,
    variantCount: activeVariants.length,
    productCreatedAt: source.createdAt,
    productUpdatedAt: source.updatedAt,
  };

  // 5) Facet satırları (yalnız filterable; dedupe).
  const facets = buildFacets(source);

  return { removed: false, document, facets };
}

/** searchable=true & definition ACTIVE attribute'ların metin projeksiyonu (option label / valueText). */
function collectSearchableText(source: SearchSourceProduct): string[] {
  const out: string[] = [];
  const searchableDefIds = new Set(
    source.categoryAttributes
      .filter((ca) => ca.searchable && ca.definitionStatus === "ACTIVE")
      .map((ca) => ca.attributeDefinitionId),
  );
  if (searchableDefIds.size === 0) return out;

  for (const pav of source.productAttributeValues) {
    if (!searchableDefIds.has(pav.attributeDefinitionId)) continue;
    if (pav.valueText) out.push(pav.valueText);
    if (pav.option && pav.option.status === "ACTIVE") out.push(pav.option.label);
    for (const opt of pav.multiOptions) {
      if (opt.status === "ACTIVE") out.push(opt.label);
    }
  }
  for (const vav of source.variantAttributeValues) {
    if (!searchableDefIds.has(vav.attributeDefinitionId)) continue;
    if (vav.valueText) out.push(vav.valueText);
    if (vav.option && vav.option.status === "ACTIVE") out.push(vav.option.label);
  }
  return out;
}

/** filterable=true & definition ACTIVE attribute'lardan flat facet satırları (dedupe). */
function buildFacets(source: SearchSourceProduct): SearchFacetData[] {
  const categoryId = source.primaryCategoryId;
  // Ana kategori yoksa facet üretilmez (CategoryAttribute ana kategoriye bağlıdır — ADR-067).
  if (!categoryId) return [];

  const filterable = source.categoryAttributes.filter(
    (ca) => ca.filterable && ca.definitionStatus === "ACTIVE" && !NON_FACETABLE.has(ca.dataType),
  );
  if (filterable.length === 0) return [];

  const rows: SearchFacetData[] = [];
  // Dedupe anahtarı: attributeDefinitionId + typed-değer imzası → aynı üründe tekrar yok.
  const seen = new Set<string>();

  const push = (row: SearchFacetData, dedupeKey: string) => {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    rows.push(row);
  };
  const base = (attributeDefinitionId: string): SearchFacetData => ({
    storeId: source.storeId,
    productId: source.id,
    categoryId,
    attributeDefinitionId,
    optionId: null,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    normalizedText: null,
  });

  for (const ca of filterable) {
    const defId = ca.attributeDefinitionId;
    if (ca.variantDefining) {
      // Varyant-seviyesi değerler (VariantAttributeValue: yalnız option veya valueText).
      for (const vav of source.variantAttributeValues) {
        if (vav.attributeDefinitionId !== defId) continue;
        if (vav.option) {
          if (vav.option.status !== "ACTIVE") continue;
          push(
            { ...base(defId), optionId: vav.option.id, normalizedText: normalizeText(vav.option.value) },
            `${defId}|opt:${vav.option.id}`,
          );
        } else if (vav.valueText) {
          const nt = normalizeText(vav.valueText);
          push({ ...base(defId), valueText: vav.valueText, normalizedText: nt }, `${defId}|txt:${nt}`);
        }
      }
    } else {
      // Ürün-seviyesi değerler (ProductAttributeValue: dataType → typed kolon).
      for (const pav of source.productAttributeValues) {
        if (pav.attributeDefinitionId !== defId) continue;
        emitProductFacet(ca, pav, base(defId), push);
      }
    }
  }
  return rows;
}

/** Ürün-seviyesi bir attribute değerini dataType'a göre facet satır(lar)ına çevirir. */
function emitProductFacet(
  ca: SearchSourceCategoryAttribute,
  pav: SearchSourceProductAttributeValue,
  base: SearchFacetData,
  push: (row: SearchFacetData, key: string) => void,
): void {
  const defId = ca.attributeDefinitionId;
  switch (ca.dataType) {
    case "SELECT":
    case "COLOR": {
      if (pav.option && pav.option.status === "ACTIVE") {
        push(
          { ...base, optionId: pav.option.id, normalizedText: normalizeText(pav.option.value) },
          `${defId}|opt:${pav.option.id}`,
        );
      }
      break;
    }
    case "MULTI_SELECT": {
      for (const opt of pav.multiOptions) {
        if (opt.status !== "ACTIVE") continue;
        push(
          { ...base, optionId: opt.id, normalizedText: normalizeText(opt.value) },
          `${defId}|opt:${opt.id}`,
        );
      }
      break;
    }
    case "TEXT":
    case "TEXTAREA":
    case "RICH_TEXT":
    case "URL": {
      if (pav.valueText) {
        const nt = normalizeText(pav.valueText);
        push({ ...base, valueText: pav.valueText, normalizedText: nt }, `${defId}|txt:${nt}`);
      }
      break;
    }
    case "INTEGER": {
      if (pav.valueInteger !== null) {
        const n = String(pav.valueInteger);
        push({ ...base, valueNumber: n }, `${defId}|num:${n}`);
      }
      break;
    }
    case "DECIMAL": {
      if (pav.valueDecimal !== null) {
        push({ ...base, valueNumber: pav.valueDecimal }, `${defId}|num:${pav.valueDecimal}`);
      }
      break;
    }
    case "BOOLEAN": {
      if (pav.valueBoolean !== null) {
        push({ ...base, valueBoolean: pav.valueBoolean }, `${defId}|bool:${pav.valueBoolean}`);
      }
      break;
    }
    case "DATE": {
      if (pav.valueDate !== null) {
        push({ ...base, valueDate: pav.valueDate }, `${defId}|date:${pav.valueDate.toISOString()}`);
      }
      break;
    }
    // IMAGE / FILE: facet'lenmez (NON_FACETABLE ile zaten elenmiş; savunma amaçlı no-op).
    default:
      break;
  }
}

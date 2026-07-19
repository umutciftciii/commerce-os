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

import { selectIndexableCampaignSnapshot } from "@commerce-os/contracts";
import { buildSearchText, normalizeText } from "./normalize.js";
import type {
  SearchBuildResult,
  SearchDocumentData,
  SearchFacetData,
  SearchListingImage,
  SearchListingProjection,
  SearchListingSwatch,
  SearchSourceCategoryAttribute,
  SearchSourceImage,
  SearchSourceProduct,
  SearchSourceProductAttributeValue,
  SearchSourceVariant,
} from "./types.js";

/** Facet'lenemeyen (medya) veri tipleri. */
const NON_FACETABLE = new Set(["IMAGE", "FILE"]);

/**
 * TODO-155.1 — Kartta gosterilecek AZAMI swatch sayisi (bounded projection). Tam sayi `swatchTotalCount`'ta
 * dondurulur → vitrin fazlasi icin "+N" gosterir. Bounded: payload + render maliyeti sabit kalir.
 */
export const MAX_LISTING_SWATCHES = 8;

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
  // En ucuz görünür (numerik fiyatlı) ACTIVE varyant — kart taban fiyatı + ticari snapshot kaynağı.
  let cheapest: SearchSourceVariant | null = null;
  if (source.priceVisible && activeVariants.length > 0) {
    const prices = activeVariants.map((v) => v.priceMinor);
    minPriceMinor = Math.min(...prices);
    maxPriceMinor = Math.max(...prices);
    // Para birimi: en ucuz varyantın currency'si (kart taban fiyatı deseniyle simetrik).
    cheapest = activeVariants.reduce((a, b) => (b.priceMinor < a.priceMinor ? b : a));
    currency = cheapest.currency;
  }

  // 2b) TODO-155.1 — Ticari snapshot (compareAt/indirim%/Omnibus). Fiyat gizliyse (cheapest null) hepsi null.
  const commercial = buildCommercial(cheapest);

  // 2c) TODO-155.1 — Kart medya/swatch projection'ı (bounded; media-tanımlayıcı eksen).
  const listing = buildListingProjection(source, cheapest);

  // 2d) TODO-155.2 — Kampanya rozeti snapshot'ı. PDP ile AYNI paylaşılan değerlendirici (ADR-062 "tek formül").
  // unitPriceMinor = en ucuz görünür varyant (minPriceMinor); fiyat gizliyse null → yalnız yüzde/etiket, sahte
  // nihai fiyat yok. `evaluationNow` data katmanından gelir (builder SAF: deterministik). Uygun kampanya yoksa null.
  const campaignSnapshot = selectIndexableCampaignSnapshot(
    source.campaigns,
    { id: source.id, categoryIds: source.categoryIds },
    source.evaluationNow,
    minPriceMinor,
  );

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
    compareAtMinor: commercial.compareAtMinor,
    discountPercent: commercial.discountPercent,
    omnibusPreviousPriceMinor: commercial.omnibusPreviousPriceMinor,
    listing,
    campaign: campaignSnapshot?.badge ?? null,
    campaignStartsAt: campaignSnapshot?.startsAt ?? null,
    campaignEndsAt: campaignSnapshot?.endsAt ?? null,
    productCreatedAt: source.createdAt,
    productUpdatedAt: source.updatedAt,
  };

  // 5) Facet satırları (yalnız filterable; dedupe).
  const facets = buildFacets(source);

  return { removed: false, document, facets };
}

/**
 * TODO-155.1 — Ticari snapshot: compareAt/indirim%/Omnibus (en ucuz görünür varyanttan). Fiyat gizliyse
 * (cheapest null) hepsi null. Tek server-side indirim formülü burada; sahte değer üretilmez.
 */
function buildCommercial(cheapest: SearchSourceVariant | null): {
  compareAtMinor: number | null;
  discountPercent: number | null;
  omnibusPreviousPriceMinor: number | null;
} {
  if (!cheapest) {
    return { compareAtMinor: null, discountPercent: null, omnibusPreviousPriceMinor: null };
  }
  const price = cheapest.priceMinor;
  const compareAt =
    cheapest.compareAtMinor !== null && cheapest.compareAtMinor > price ? cheapest.compareAtMinor : null;
  // TEK formül: indirim yüzdesi compareAt tabanına göre (round; ör. 1000→800 = %20).
  const discountPercent = compareAt !== null ? Math.round(((compareAt - price) / compareAt) * 100) : null;
  // Omnibus yalnız indirim aktifken (compareAt) + gerçek geçmiş veri varsa; yoksa null (sahte üretilmez).
  const omnibusPreviousPriceMinor =
    compareAt !== null && cheapest.lowestRecentPriceMinor !== null
      ? cheapest.lowestRecentPriceMinor
      : null;
  return { compareAtMinor: compareAt, discountPercent, omnibusPreviousPriceMinor };
}

/** IÇ görsel → kart görseli projeksiyonu (storageKey IÇ; public url route'ta türetilir). */
function toListingImage(img: SearchSourceImage | undefined | null): SearchListingImage | null {
  if (!img) return null;
  return { storageKey: img.storageKey, altText: img.altText, width: img.width, height: img.height };
}

/**
 * TODO-155.1 — Bounded kart medya/swatch projection'ı. primaryImage = position ASC ilk; secondaryImage =
 * farklı mediaId sonraki (hover). swatches = media-tanımlayıcı eksen (Renk) option'ları (yalnız ACTIVE option
 * ∩ ACTIVE varyantı olan; dedupe; sortOrder ASC). Görsel yok + swatch yok → null (kart placeholder'a düşer).
 */
function buildListingProjection(
  source: SearchSourceProduct,
  cheapest: SearchSourceVariant | null,
): SearchListingProjection | null {
  const images = [...source.images].sort((a, b) =>
    a.position !== b.position
      ? a.position - b.position
      : a.mediaId < b.mediaId
        ? -1
        : a.mediaId > b.mediaId
          ? 1
          : 0,
  );
  const primary = images[0] ?? null;
  const primaryImage = toListingImage(primary);
  const secondary = primary ? (images.find((img) => img.mediaId !== primary.mediaId) ?? null) : null;
  const secondaryImage = toListingImage(secondary);

  const swatches = buildSwatches(source, images, cheapest, primaryImage);

  if (!primaryImage && swatches.list.length === 0) return null;

  return {
    primaryImage,
    secondaryImage,
    swatches: swatches.list,
    swatchTotalCount: swatches.total,
  };
}

/**
 * Media-tanımlayıcı eksen (Renk) swatch listesi. Kaynak = ACTIVE varyantı olan ACTIVE option'lar (görsel
 * varlığı DEĞİL). Her swatch kapak görseli o option'a etiketli en düşük position; yoksa ürün ana görseline
 * KONTROLLÜ fallback. Default = en ucuz görünür varyantın option'ı (aday ise) yoksa ilk (deterministik).
 * Bounded: en fazla MAX_LISTING_SWATCHES döner; `total` tam sayıdır (+N). Media ekseni yoksa boş.
 */
function buildSwatches(
  source: SearchSourceProduct,
  sortedImages: SearchSourceImage[],
  cheapest: SearchSourceVariant | null,
  primaryImage: SearchListingImage | null,
): { list: SearchListingSwatch[]; total: number } {
  const axisId = source.mediaDefiningAttributeId;
  if (!axisId) return { list: [], total: 0 };

  const optionMeta = new Map(
    source.mediaAxisOptions.filter((o) => o.status === "ACTIVE").map((o) => [o.id, o] as const),
  );
  // Yalnız ACTIVE varyantı olan media-option'lar (dedupe); "inactive variant yok" + "archived option yok".
  const activeVariantOptionIds = new Set<string>();
  for (const v of source.variants) {
    if (v.status === "ACTIVE" && v.mediaOptionId !== null) activeVariantOptionIds.add(v.mediaOptionId);
  }
  const candidateIds = [...activeVariantOptionIds].filter((id) => optionMeta.has(id));
  if (candidateIds.length === 0) return { list: [], total: 0 };

  // Option başına kapak (bu eksende, o option'a etiketli en düşük position görsel).
  const imageByOption = new Map<string, SearchListingImage>();
  for (const img of sortedImages) {
    if (img.attributeDefinitionId !== axisId || img.optionId === null) continue;
    if (!imageByOption.has(img.optionId)) {
      const projected = toListingImage(img);
      if (projected) imageByOption.set(img.optionId, projected);
    }
  }

  candidateIds.sort((a, b) => {
    const oa = optionMeta.get(a)!;
    const ob = optionMeta.get(b)!;
    if (oa.sortOrder !== ob.sortOrder) return oa.sortOrder - ob.sortOrder;
    return oa.label.localeCompare(ob.label, "tr");
  });

  const cheapestOptionId =
    cheapest && cheapest.mediaOptionId !== null && candidateIds.includes(cheapest.mediaOptionId)
      ? cheapest.mediaOptionId
      : candidateIds[0];

  const total = candidateIds.length;
  const shownIds = candidateIds.slice(0, MAX_LISTING_SWATCHES);
  // Default kesildiyse görünür pencerede garanti et (son slotu default ile değiştir; deterministik).
  if (!shownIds.includes(cheapestOptionId)) {
    shownIds[shownIds.length - 1] = cheapestOptionId;
  }

  const list: SearchListingSwatch[] = shownIds.map((id) => {
    const o = optionMeta.get(id)!;
    return {
      optionId: id,
      label: o.label,
      colorHex: o.colorHex,
      isDefault: id === cheapestOptionId,
      image: imageByOption.get(id) ?? primaryImage,
    };
  });
  return { list, total };
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
      // (a) Varyant-seviyesi typed değerler (VariantAttributeValue: yalnız option veya valueText — Faz 2A).
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
      // (b) TODO-155.2 — Varyant EKSEN option seçimleri (ProductVariantOptionValue; ADR-072). Kök boşluk
      // düzeltmesi: swatch'ı besleyen aynı eksen seçimleri artık facet'e de yansır. `seen` ile (a) ile
      // BİRLEŞİK dedupe (aynı defId+optionId iki kaynaktan gelirse tek satır). ARCHIVED option hariç.
      for (const vov of source.variantOptionValues) {
        if (vov.attributeDefinitionId !== defId) continue;
        if (vov.option.status !== "ACTIVE") continue;
        push(
          { ...base(defId), optionId: vov.option.id, normalizedText: normalizeText(vov.option.value) },
          `${defId}|opt:${vov.option.id}`,
        );
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

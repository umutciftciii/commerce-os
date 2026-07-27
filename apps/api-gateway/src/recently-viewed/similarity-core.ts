/**
 * TODO-161B (ADR-140/142/143) — Similar Products açıklanabilir skorlama ÇEKİRDEĞİ (SAF; prisma/fastify yok).
 *
 * MVP: geçmişten BAĞIMSIZ, ürün-benzerliği tabanlı, AÇIKLANABİLİR ağırlıklı skor. Sert filtreler (aynı
 * store, ACTIVE, stokta, anchor hariç) veri katmanında uygulanır — burada YALNIZ skorlama + deterministik
 * sıralama. Sponsored priority KARIŞMAZ; organik search ranking DEĞİŞMEZ (bu ayrı bir motordur).
 */

/** Skorlanabilir aday/anchor için gereken minimal, read-model türevli sinyal kümesi. */
export interface SimilarityFeatures {
  productId: string;
  /** Ürünün birincil kategorisi (alt kategori). */
  primaryCategoryId: string | null;
  /** Birincil kategorinin üst kategorisi (adjacency-list parentId). */
  parentCategoryId: string | null;
  brand: string | null;
  salesMode: string | null;
  /** Temsili fiyat (en düşük görünür varyant, kuruş). Fiyat gizli/yoksa null. */
  priceMinor: number | null;
  currency: string | null;
  /** Filtrelenebilir dinamik attribute değer anahtarları: `${attributeDefinitionId}:${optionId}`. */
  attributeKeys: readonly string[];
  /** Deterministik tie-break için ürün oluşturulma zamanı (ms). */
  createdAtMs: number;
}

/** ADR-140 — Örnek ağırlıklar (tek doğruluk kaynağı; ADR'de belgelenir). */
export const SIMILARITY_WEIGHTS = {
  /** Aynı alt kategori (primaryCategoryId eşit). */
  SUBCATEGORY: 40,
  /** Aynı üst kategori (parent eşit, alt farklı). SUBCATEGORY ile karşılıklı dışlar. */
  PARENT_CATEGORY: 18,
  /** Aynı marka (non-null eşit). */
  BRAND: 25,
  /** Aynı salesMode. */
  SALES_MODE: 8,
  /** Fiyat yakınlığı üst sınırı (aynı currency; lineer azalım). */
  PRICE_PROXIMITY_MAX: 15,
  /** Ortak dinamik attribute değeri başına puan. */
  SHARED_ATTRIBUTE_EACH: 6,
  /** Ortak attribute toplam üst sınırı. */
  SHARED_ATTRIBUTE_MAX: 18,
} as const;

export interface SimilarityBreakdown {
  productId: string;
  score: number;
  signals: {
    subcategory: number;
    parentCategory: number;
    brand: number;
    salesMode: number;
    priceProximity: number;
    sharedAttributes: number;
    sharedAttributeCount: number;
  };
}

/**
 * Fiyat yakınlığı skoru: aynı currency ve iki fiyat da doluysa `max * (1 - min(1, |a-c| / max(a,1)))`.
 * a=anchor fiyatı (kuruş). Fiyat eşitse tam puan; fiyat anchor'ın iki katıysa 0. SAF/deterministik.
 */
export function priceProximityScore(
  anchorMinor: number | null,
  candidateMinor: number | null,
  anchorCurrency: string | null,
  candidateCurrency: string | null,
  maxScore: number,
): number {
  if (anchorMinor === null || candidateMinor === null) return 0;
  if (anchorCurrency === null || candidateCurrency === null) return 0;
  if (anchorCurrency !== candidateCurrency) return 0;
  const denom = Math.max(anchorMinor, 1);
  const ratio = Math.min(1, Math.abs(anchorMinor - candidateMinor) / denom);
  return maxScore * (1 - ratio);
}

/** Anchor ile bir adayın ortak (attributeDefinitionId:optionId) değer sayısı. */
export function countSharedAttributes(
  anchorKeys: readonly string[],
  candidateKeys: readonly string[],
): number {
  if (anchorKeys.length === 0 || candidateKeys.length === 0) return 0;
  const set = new Set(anchorKeys);
  let shared = 0;
  const counted = new Set<string>();
  for (const key of candidateKeys) {
    if (set.has(key) && !counted.has(key)) {
      counted.add(key);
      shared += 1;
    }
  }
  return shared;
}

/** Tek adayın anchor'a göre açıklanabilir skoru (breakdown ile). */
export function scoreCandidate(anchor: SimilarityFeatures, candidate: SimilarityFeatures): SimilarityBreakdown {
  const w = SIMILARITY_WEIGHTS;

  // Kategori: alt kategori eşleşmesi parent eşleşmesini DIŞLAR (double-count yok).
  let subcategory = 0;
  let parentCategory = 0;
  if (
    anchor.primaryCategoryId !== null &&
    candidate.primaryCategoryId !== null &&
    anchor.primaryCategoryId === candidate.primaryCategoryId
  ) {
    subcategory = w.SUBCATEGORY;
  } else if (
    anchor.parentCategoryId !== null &&
    candidate.parentCategoryId !== null &&
    anchor.parentCategoryId === candidate.parentCategoryId
  ) {
    parentCategory = w.PARENT_CATEGORY;
  }

  const brand =
    anchor.brand !== null && candidate.brand !== null && anchor.brand === candidate.brand ? w.BRAND : 0;

  const salesMode =
    anchor.salesMode !== null && candidate.salesMode !== null && anchor.salesMode === candidate.salesMode
      ? w.SALES_MODE
      : 0;

  const priceProximity = priceProximityScore(
    anchor.priceMinor,
    candidate.priceMinor,
    anchor.currency,
    candidate.currency,
    w.PRICE_PROXIMITY_MAX,
  );

  const sharedAttributeCount = countSharedAttributes(anchor.attributeKeys, candidate.attributeKeys);
  const sharedAttributes = Math.min(w.SHARED_ATTRIBUTE_MAX, sharedAttributeCount * w.SHARED_ATTRIBUTE_EACH);

  const score = subcategory + parentCategory + brand + salesMode + priceProximity + sharedAttributes;

  return {
    productId: candidate.productId,
    score,
    signals: { subcategory, parentCategory, brand, salesMode, priceProximity, sharedAttributes, sharedAttributeCount },
  };
}

/**
 * Deterministik sıralama: score DESC → createdAtMs DESC (yeni önce) → productId ASC (kararlı tie-break).
 * Aynı girdi → aynı çıktı (Math.random / Date.now KULLANILMAZ). Anchor'ın kendisi çağıran tarafça elenmiş
 * varsayılır; yine de güvence için filtrelenir. `limit` ile bounded.
 */
export function rankSimilar(
  anchor: SimilarityFeatures,
  candidates: readonly SimilarityFeatures[],
  limit: number,
): SimilarityBreakdown[] {
  const seen = new Set<string>();
  const scored: SimilarityBreakdown[] = [];
  const createdAtByProduct = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.productId === anchor.productId) continue;
    if (seen.has(candidate.productId)) continue; // duplicate guard
    seen.add(candidate.productId);
    createdAtByProduct.set(candidate.productId, candidate.createdAtMs);
    scored.push(scoreCandidate(anchor, candidate));
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCreated = createdAtByProduct.get(a.productId) ?? 0;
    const bCreated = createdAtByProduct.get(b.productId) ?? 0;
    if (bCreated !== aCreated) return bCreated - aCreated;
    return a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0;
  });
  return scored.slice(0, Math.max(0, limit));
}

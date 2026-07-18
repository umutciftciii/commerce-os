/**
 * TODO-150 (ADR-073) — Identity Management Engine · COLLISION (SAF ÇEKİRDEK).
 *
 * Değerlendirilmiş kimlik değerlerinden çakışma (collision) tespit eder. SAF: DB/HTTP BİLMEZ.
 *
 * İki tür SKU collision:
 *  - INTERNAL: aynı apply kümesinde iki varyant aynı SKU üretir (Map<value,count> > 1).
 *  - EXTERNAL: üretilen SKU, kümede OLMAYAN başka bir varyantın mevcut SKU'suyla çakışır
 *    (`@@unique([storeId, sku])` zaten reddederdi) — dış küme çağıran tarafça (servis) tek `in`
 *    sorgusuyla getirilir; burada yalnız harita kesişimi yapılır.
 *
 * Barcode collision AYNI biçimde ama NON-BLOCKING (DB'de barcode unique YOK → yalnız uyarı).
 *
 * Karmaşıklık: O(n + m). Nested O(n·m) YOK.
 */

export type CollisionKind = "INTERNAL" | "EXTERNAL";

export interface CollisionInfo {
  /** Aynı kümedeki tekrar sayısı (>1 ise internal). */
  internalCount: number;
  /** Kümede olmayan mevcut bir varyantla çakışıyor mu (external). */
  external: boolean;
}

/**
 * Boş/undefined olmayan değerlerin frekans haritasını kurar (internal duplicate temeli).
 * Boş string değerlendirilmez (uygulanmayan alan). Case-sensitive (SKU'lar zaten normalize edilmiştir).
 */
export function buildValueFrequency(values: Array<string | null | undefined>): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  return freq;
}

/**
 * Tek bir değerin collision durumunu döndürür.
 * @param value           değerlendirilmiş kimlik (SKU/barcode)
 * @param frequency       buildValueFrequency çıktısı (internal)
 * @param externalOwners  value → dış kümedeki (kümede olmayan) sahip variantId (external kanıtı)
 * @param ownVariantId    bu satırın kendi variantId'si (kendine çakışma SAYILMAZ)
 */
export function detectCollision(
  value: string | null | undefined,
  frequency: Map<string, number>,
  externalOwners: Map<string, string>,
  ownVariantId: string,
): CollisionInfo {
  if (value === null || value === undefined || value === "") {
    return { internalCount: 0, external: false };
  }
  const internalCount = frequency.get(value) ?? 0;
  const owner = externalOwners.get(value);
  // Dış sahip kendisi değilse gerçek dış çakışmadır (kendi mevcut SKU'suna eşitse sorun değil).
  const external = owner !== undefined && owner !== ownVariantId;
  return { internalCount, external };
}

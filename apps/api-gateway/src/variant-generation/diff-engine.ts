/**
 * Faz 2C-3 (ADR-072) — SAF varyant diff motoru.
 *
 * Mevcut ProductVariant kayıtları ile Combination Engine'in ürettiği HEDEF kombinasyon kümesini
 * karşılaştırıp create/keep/restore/archive gruplarına ayırır. BU MODÜL TAMAMEN SAFTIR:
 *  - Prisma / DB / transaction / network / Date / Math.random BİLMEZ.
 *  - Girdiyi MUTASYONA UĞRATMAZ; yalnız input → output.
 *  - Aynı input (girdi sırasından BAĞIMSIZ) her zaman aynı deterministik çıktıyı üretir.
 *
 * Sınıflandırma yalnızca `combinationKey` (ID-tabanlı kanonik kimlik) üzerinden yapılır — title/label
 * tabanlı identity KULLANILMAZ (rename identity'yi değiştirmez). Karşılaştırma Map/Set tabanlıdır →
 * yaklaşık O(P + E); nested O(P × E) YOKTUR.
 *
 * Manuel/legacy varyantlar (generationSource=MANUAL) HİÇBİR gruba karışmaz: yalnız `manualVariants`
 * altında raporlanır, asla archive/restore edilmez (izolasyon).
 */

export type DiffGenerationSource = "MANUAL" | "ATTRIBUTE_COMBINATION";

/** Diff için gereken minimum mevcut varyant projeksiyonu (persistence tam kaydı taşır). */
export interface DiffExistingVariant {
  id: string;
  /** Üretilmiş varyantta dolu; manuel varyantta null. */
  combinationKey: string | null;
  generationSource: DiffGenerationSource;
  /** status === "ARCHIVED" (soft-archive). */
  archived: boolean;
}

/** Diff için gereken minimum hedef kombinasyon projeksiyonu (engine çıktısı bunu sağlar). */
export interface DiffTargetCombination {
  combinationKey: string;
}

export interface VariantDiffResult<E extends DiffExistingVariant, T extends DiffTargetCombination> {
  /** Hedefte olan ama hiç generated varyantı olmayan kombinasyonlar → yeni ProductVariant. */
  toCreate: T[];
  /** Hedefte olan + mevcut AKTİF generated varyantı olan → dokunulmaz (write YOK). */
  toKeep: E[];
  /** Hedefte olan + mevcut ARŞİVLİ generated varyantı olan → aynı kayıt geri yüklenir (ID korunur). */
  toRestore: E[];
  /** Hedefte OLMAYAN mevcut AKTİF generated varyant → arşivlenir (+ tekrarlanan duplicate'ler). */
  toArchive: E[];
  /** Manuel/legacy varyantlar — dokunulmaz, yalnız raporlanır. */
  manualVariants: E[];
}

// Kanonik string karşılaştırma (locale-bağımsız, deterministik).
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * SAF diff. `existing` ve `target` READONLY olarak okunur; hiçbir öğe mutasyona uğramaz. Çıktı
 * grupları combinationKey (+ id) sırasında deterministik sıralıdır (girdi sırası sonucu değiştirmez).
 */
export function diffVariantCombinations<
  E extends DiffExistingVariant,
  T extends DiffTargetCombination,
>(existing: readonly E[], target: readonly T[]): VariantDiffResult<E, T> {
  const manualVariants: E[] = [];
  // combinationKey → aynı key'e sahip generated varyant(lar). Normalde tek; duplicate savunmacı ele alınır.
  const generatedByKey = new Map<string, E[]>();

  for (const variant of existing) {
    // Manuel VEYA anomali (generated ama key'siz) → dokunulmaz kümesi.
    if (variant.generationSource !== "ATTRIBUTE_COMBINATION" || variant.combinationKey === null) {
      manualVariants.push(variant);
      continue;
    }
    const bucket = generatedByKey.get(variant.combinationKey);
    if (bucket) bucket.push(variant);
    else generatedByKey.set(variant.combinationKey, [variant]);
  }

  const toCreate: T[] = [];
  const toKeep: E[] = [];
  const toRestore: E[] = [];
  const toArchive: E[] = [];
  const targetSeen = new Set<string>();

  for (const combination of target) {
    if (targetSeen.has(combination.combinationKey)) continue; // hedefteki duplicate'i yok say
    targetSeen.add(combination.combinationKey);

    const bucket = generatedByKey.get(combination.combinationKey);
    if (!bucket || bucket.length === 0) {
      toCreate.push(combination);
      continue;
    }
    // Primary: mümkünse AKTİF olan (restore yerine keep önceliği); yoksa ilk (arşivli) kayıt.
    const active = bucket.find((v) => !v.archived);
    const primary = active ?? bucket[0]!;
    if (primary.archived) toRestore.push(primary);
    else toKeep.push(primary);
    // Aynı key'e sahip fazladan (duplicate) AKTİF kayıtlar → tekilleştir (arşivle).
    for (const variant of bucket) {
      if (variant === primary) continue;
      if (!variant.archived) toArchive.push(variant);
    }
  }

  // Hedefte OLMAYAN key'lerin AKTİF generated kayıtları → arşivle. Zaten arşivli olan dokunulmaz
  // (idempotentlik: gereksiz update/updatedAt değişimi olmaz).
  for (const [key, bucket] of generatedByKey) {
    if (targetSeen.has(key)) continue;
    for (const variant of bucket) {
      if (!variant.archived) toArchive.push(variant);
    }
  }

  // Deterministik sıralama (girdi sırası bağımsız).
  toCreate.sort((a, b) => byString(a.combinationKey, b.combinationKey));
  const sortE = (a: E, b: E) =>
    byString(a.combinationKey ?? "", b.combinationKey ?? "") || byString(a.id, b.id);
  toKeep.sort(sortE);
  toRestore.sort(sortE);
  toArchive.sort(sortE);
  manualVariants.sort((a, b) => byString(a.id, b.id));

  return { toCreate, toKeep, toRestore, toArchive, manualVariants };
}

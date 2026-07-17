/**
 * Faz 2C-2 (ADR-071) — Deterministik Combination Engine (SAF ÇEKİRDEK).
 *
 * `ProductVariantAttribute` (eksen) × `ProductVariantOptionSelection` (eksen başına option)
 * reçetesinden Cartesian çarpımıyla "oluşacak varyant kombinasyonları" ÖNİZLEMESİ üretir.
 *
 * BU MODÜL TAMAMEN SAFTIR:
 *  - Prisma / DB / transaction / network / logger / process.env / Date / Math.random BİLMEZ.
 *  - Yalnız input → output; yan etkisi YOKTUR (girdiyi de mutasyona uğratmaz).
 *  - Aynı input her zaman aynı output'u üretir (deterministik + idempotent).
 *  - HİÇBİR ŞEY YAZMAZ: ProductVariant / SKU / barcode / price / inventory / order OLUŞMAZ.
 *    `combinationKey` üretilir ama DB'ye yazılmaz (kalıcılık Faz 2C-3).
 *
 * Canonical ordering (girdi sırası SONUCU DEĞİŞTİRMEZ):
 *  - Eksenler: position ASC → attributeDefinitionId ASC.
 *  - Option'lar (eksen içi): position ASC → optionId ASC.
 *  - Aynı attribute birden çok eksen olarak gelirse (duplicate axis): option kümeleri BİRLEŞTİRİLİR
 *    (union), pozisyon min() alınır — böylece sonuç girdi sırasından bağımsızdır.
 *  - Aynı option bir eksende birden çok gelirse (duplicate option): tekilleştirilir.
 *  - Archived option'lar çıkarılır. Filtreleme sonrası boş kalan eksen (empty axis) DÜŞÜRÜLÜR.
 */

// ─────────────────────────── Girdi tipleri ───────────────────────────

export interface CombinationOptionInput {
  optionId: string;
  /** Eksen içi admin sırası (ProductVariantOptionSelection.position). */
  position: number;
  label?: string | null;
  /** true ise kombinasyona GİRMEZ (arşivlenmiş seçenek). */
  archived?: boolean;
}

export interface CombinationAxisInput {
  attributeDefinitionId: string;
  /** Eksen admin sırası (ProductVariantAttribute.position). */
  position: number;
  options: CombinationOptionInput[];
}

// ─────────────────────────── Çıktı tipleri ───────────────────────────

export interface CombinationPreviewAttribute {
  attributeDefinitionId: string;
  /** Normalize eksen sırası konumu (canonical). */
  position: number;
  optionId: string;
  optionLabel: string | null;
}

export interface CombinationPreview {
  /** combinationKey'den türeyen deterministik geçici kimlik (random DEĞİL). */
  previewId: string;
  /** Kombinasyonun kanonik makine kimliği (ID-tabanlı; DB'ye yazılmaz). */
  combinationKey: string;
  /** Kanonik eksen sırasında bu kombinasyonun eksen×option ayrıntısı. */
  attributes: CombinationPreviewAttribute[];
  /** attributes ile paralel — kanonik sırada option id'leri. */
  optionIds: string[];
  /** attributes ile paralel — kanonik sırada option etiketleri. */
  optionLabels: (string | null)[];
}

export interface CombinationPreviewSuccess {
  /** Kombinasyona katkı veren (boş olmayan) eksen sayısı. */
  axisCount: number;
  /** Cartesian çarpım büyüklüğü (üretilen kombinasyon sayısı). */
  totalCombinations: number;
  combinations: CombinationPreview[];
}

export type CombinationEngineErrorCode = "PREVIEW_LIMIT_EXCEEDED";

export interface CombinationEngineError {
  code: CombinationEngineErrorCode;
  message: string;
  /** Reddedilen (potansiyel) kombinasyon sayısı. */
  totalCombinations: number;
  /** Uygulanan üst sınır (config'ten gelir). */
  limit: number;
}

export type CombinationEngineResult =
  | { ok: true; result: CombinationPreviewSuccess }
  | { ok: false; error: CombinationEngineError };

export interface CombinationEngineOptions {
  /** Güvenlik limiti — bu sayının üzerinde kombinasyon üretilmez (config; magic number DEĞİL). */
  maxCombinations: number;
}

// ─────────────────────────── Normalize (canonical) ───────────────────────────

interface NormalizedOption {
  optionId: string;
  position: number;
  label: string | null;
}

interface NormalizedAxis {
  attributeDefinitionId: string;
  position: number;
  options: NormalizedOption[];
}

/**
 * Eksenleri kanonik forma indirger: duplicate axis'leri option birleşimiyle katlar, archived +
 * duplicate option'ları eler, boş eksenleri düşürür, sonra deterministik sıralar. Saf: yeni yapı üretir.
 */
function normalizeAxes(axes: CombinationAxisInput[]): NormalizedAxis[] {
  // attributeDefinitionId → { position, options: Map<optionId, NormalizedOption> }
  const axisMap = new Map<
    string,
    { position: number; options: Map<string, NormalizedOption> }
  >();

  for (const axis of axes) {
    let bucket = axisMap.get(axis.attributeDefinitionId);
    if (!bucket) {
      bucket = { position: axis.position, options: new Map() };
      axisMap.set(axis.attributeDefinitionId, bucket);
    } else {
      // Duplicate axis: en küçük position deterministiktir (girdi sırası bağımsız).
      bucket.position = Math.min(bucket.position, axis.position);
    }
    for (const option of axis.options) {
      if (option.archived) continue; // arşivli seçenek kombinasyona girmez
      const existing = bucket.options.get(option.optionId);
      if (!existing) {
        bucket.options.set(option.optionId, {
          optionId: option.optionId,
          position: option.position,
          label: option.label ?? null,
        });
      } else {
        // Duplicate option: min position; etiket ilk boş-olmayanı tercih eder.
        existing.position = Math.min(existing.position, option.position);
        if (existing.label === null && (option.label ?? null) !== null) {
          existing.label = option.label ?? null;
        }
      }
    }
  }

  const normalized: NormalizedAxis[] = [];
  for (const [attributeDefinitionId, bucket] of axisMap) {
    const options = [...bucket.options.values()].sort(compareOptions);
    if (options.length === 0) continue; // empty axis düşürülür
    normalized.push({ attributeDefinitionId, position: bucket.position, options });
  }
  normalized.sort(compareAxes);
  return normalized;
}

// Kanonik option sırası: position ASC → optionId ASC.
function compareOptions(a: NormalizedOption, b: NormalizedOption): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.optionId < b.optionId ? -1 : a.optionId > b.optionId ? 1 : 0;
}

// Kanonik eksen sırası: position ASC → attributeDefinitionId ASC.
function compareAxes(a: NormalizedAxis, b: NormalizedAxis): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.attributeDefinitionId < b.attributeDefinitionId
    ? -1
    : a.attributeDefinitionId > b.attributeDefinitionId
      ? 1
      : 0;
}

// ─────────────────────────── combinationKey + previewId ───────────────────────────

/**
 * Kanonik makine kimliği. ID-tabanlı (rename/position değişiminden bağımsız); segmentler
 * attributeDefinitionId'ye göre sıralanır → aynı kombinasyon her zaman aynı anahtarı üretir.
 * Format: `v1|<attrId>:<optId>|<attrId>:<optId>...` (cuid'ler [a-z0-9] → ayraç çakışması yok).
 */
export function buildCombinationKey(
  pairs: Array<{ attributeDefinitionId: string; optionId: string }>,
): string {
  const segments = pairs
    .map((p) => `${p.attributeDefinitionId}:${p.optionId}`)
    .sort();
  return `v1|${segments.join("|")}`;
}

/**
 * Deterministik string hash (cyrb53 — random YOK, seed sabit). previewId geçici bir UI kimliğidir;
 * kalıcı benzersizlik combinationKey'dedir. 53-bit → 14 haneli hex, çarpışma olasılığı ihmal edilebilir.
 */
function cyrb53(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

export function buildPreviewId(combinationKey: string): string {
  return `pv_${cyrb53(combinationKey)}`;
}

// ─────────────────────────── Cartesian sayımı (guard için) ───────────────────────────

/**
 * Kanonik eksenlerin Cartesian çarpım büyüklüğü. Materialize ETMEDEN hesaplar (guard bunu kullanır).
 * `cap` verilirse çarpım cap'i aşar aşmaz erken döner (aşırı büyük değerde gereksiz döngü/taşma yok).
 */
function countCombinations(axes: NormalizedAxis[], cap: number): number {
  if (axes.length === 0) return 0; // eksen yoksa varyant yok (boş çarpım 1 DEĞİL)
  let total = 1;
  for (const axis of axes) {
    total *= axis.options.length;
    if (total > cap) return total; // erken çıkış: guard zaten reddedecek
  }
  return total;
}

// ─────────────────────────── Ana giriş ───────────────────────────

/**
 * SAF combination engine. Kanonik eksen/option normalizasyonu + guard + Cartesian üretimi.
 * İki kez çağrılırsa BİREBİR aynı sonucu döndürür; girdi sırası sonucu değiştirmez.
 */
export function generateVariantCombinations(
  axes: CombinationAxisInput[],
  options: CombinationEngineOptions,
): CombinationEngineResult {
  const limit = options.maxCombinations;
  const normalized = normalizeAxes(axes);
  const total = countCombinations(normalized, limit);

  // Runtime guard: materialize'den ÖNCE reddet (bellek/CPU patlamasını engeller).
  if (total > limit) {
    return {
      ok: false,
      error: {
        code: "PREVIEW_LIMIT_EXCEEDED",
        message: `Combination count ${total} exceeds the preview limit of ${limit}.`,
        totalCombinations: total,
        limit,
      },
    };
  }

  const combinations: CombinationPreview[] = [];
  if (total > 0) {
    const k = normalized.length;
    const cursor = new Array<number>(k).fill(0); // odometer index'i (O(k) çalışma belleği)
    for (let c = 0; c < total; c++) {
      const attributes: CombinationPreviewAttribute[] = new Array(k);
      const optionIds: string[] = new Array(k);
      const optionLabels: (string | null)[] = new Array(k);
      for (let a = 0; a < k; a++) {
        const axis = normalized[a];
        const option = axis.options[cursor[a]];
        attributes[a] = {
          attributeDefinitionId: axis.attributeDefinitionId,
          position: axis.position,
          optionId: option.optionId,
          optionLabel: option.label,
        };
        optionIds[a] = option.optionId;
        optionLabels[a] = option.label;
      }
      const combinationKey = buildCombinationKey(attributes);
      combinations.push({
        previewId: buildPreviewId(combinationKey),
        combinationKey,
        attributes,
        optionIds,
        optionLabels,
      });

      // Odometer'ı artır (son eksen en hızlı döner → deterministik satır sırası).
      for (let a = k - 1; a >= 0; a--) {
        cursor[a] += 1;
        if (cursor[a] < normalized[a].options.length) break;
        cursor[a] = 0;
      }
    }
  }

  return {
    ok: true,
    result: { axisCount: normalized.length, totalCombinations: total, combinations },
  };
}

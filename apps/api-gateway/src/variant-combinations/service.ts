/**
 * Faz 2C-2 (ADR-071) — variantCombinationPreviewService.
 *
 * Bir ürünün kalıcı varyant EKSEN reçetesini (2C-1) okur, seçili option'ların güncel metadata'sıyla
 * (label/archived) birleştirip SAF `generateVariantCombinations` motoruna verir ve ÖNİZLEME döndürür.
 *
 * Bu servis:
 *  - HİÇBİR ŞEY YAZMAZ (read-only compute). ProductVariant / combinationKey / SKU OLUŞTURULMAZ.
 *  - Runtime guard'ı config'ten gelen `maxCombinations` ile uygular (magic number DEĞİL).
 *  - Sahiplik doğrular (ürün yoksa PRODUCT_NOT_FOUND → 404).
 *
 * Kanonik sıralama + determinizm + duplicate önleme motordadır (engine.ts); bu katman yalnız
 * "kalıcı kayıt → motor girdisi" eşlemesini yapar (archived option'ları da motora bayrakla iletir).
 */
import {
  generateVariantCombinations,
  type CombinationAxisInput,
  type CombinationEngineError,
  type CombinationPreviewSuccess,
} from "./engine.js";
import type { CombinationOptionMeta, VariantCombinationDataAccess } from "./data.js";

export type VariantCombinationErrorCode = "PRODUCT_NOT_FOUND" | CombinationEngineError["code"];

export interface VariantCombinationError {
  code: VariantCombinationErrorCode;
  message: string;
  /** PREVIEW_LIMIT_EXCEEDED'de dolu: reddedilen kombinasyon sayısı + uygulanan limit. */
  totalCombinations?: number;
  limit?: number;
}

export type PreviewResult =
  | { ok: true; preview: CombinationPreviewSuccess }
  | { ok: false; error: VariantCombinationError };

export interface VariantCombinationPreviewService {
  previewCombinations(input: {
    storeId: string;
    productId: string;
  }): Promise<PreviewResult>;
}

export interface VariantCombinationServiceConfig {
  /** Güvenlik limiti (config'ten; MAX_PREVIEW_COMBINATIONS). */
  maxCombinations: number;
}

export function createVariantCombinationPreviewService(
  dataAccess: VariantCombinationDataAccess,
  config: VariantCombinationServiceConfig,
): VariantCombinationPreviewService {
  return {
    previewCombinations: async ({ storeId, productId }) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) {
        return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      }

      const records = await dataAccess.listProductVariantSelections(storeId, productId);
      // Seçili tüm option id'lerini tek batch'te çözümle (N+1 yok).
      const optionIds = [...new Set(records.flatMap((r) => r.optionIds))];
      const metaRows = await dataAccess.findAttributeOptionsMeta(optionIds);
      const metaMap = new Map<string, CombinationOptionMeta>(metaRows.map((m) => [m.id, m]));

      // Kalıcı kayıt → motor girdisi. optionIds DB'de position ASC geldiğinden index=position.
      // Metadata'sı bulunmayan option atlanır (Restrict FK → normalde olmaz; savunmacı).
      const axes: CombinationAxisInput[] = records.map((record) => ({
        attributeDefinitionId: record.attributeDefinitionId,
        position: record.position,
        options: record.optionIds
          .map((optionId, index) => {
            const meta = metaMap.get(optionId);
            if (!meta) return null;
            return {
              optionId,
              position: index,
              label: meta.label,
              archived: meta.status === "ARCHIVED",
            };
          })
          .filter((o): o is NonNullable<typeof o> => o !== null),
      }));

      const engineResult = generateVariantCombinations(axes, {
        maxCombinations: config.maxCombinations,
      });
      if (!engineResult.ok) {
        return {
          ok: false,
          error: {
            code: engineResult.error.code,
            message: engineResult.error.message,
            totalCombinations: engineResult.error.totalCombinations,
            limit: engineResult.error.limit,
          },
        };
      }
      return { ok: true, preview: engineResult.result };
    },
  };
}

// ─────────────────────────── serialize (route katmanı için) ───────────────────────────
export function serializeCombinationPreview(preview: CombinationPreviewSuccess) {
  return {
    axisCount: preview.axisCount,
    totalCombinations: preview.totalCombinations,
    combinations: preview.combinations.map((combination) => ({
      previewId: combination.previewId,
      combinationKey: combination.combinationKey,
      attributes: combination.attributes.map((attribute) => ({
        attributeDefinitionId: attribute.attributeDefinitionId,
        position: attribute.position,
        optionId: attribute.optionId,
        optionLabel: attribute.optionLabel,
      })),
      optionIds: combination.optionIds,
      optionLabels: combination.optionLabels,
    })),
  };
}

// Route katmanının VariantCombinationError.code → HTTP status eşlemesi: sahiplik/bulunamama 404,
// guard limiti 422 (istek geçerli ama işlenemeyecek kadar büyük).
export function variantCombinationErrorStatus(code: VariantCombinationErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  if (code === "PREVIEW_LIMIT_EXCEEDED") return 422;
  return 400;
}

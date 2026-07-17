/**
 * Faz 2C-3 (ADR-072) — variantGenerationService.
 *
 * Bir ürünün kalıcı varyant EKSEN reçetesini (2C-1) SAF Combination Engine'e (2C-2) verip hedef
 * kombinasyon kümesini üretir, mevcut ProductVariant kayıtlarıyla SAF diff'ler (diff-engine.ts) ve
 * sonucu TEK transaction içinde uygular (create/restore/archive). Combination Engine DEĞİŞTİRİLMEZ.
 *
 * Garantiler: deterministik · idempotent · transaction-safe · concurrency-safe (advisory lock + DB
 * unique) · tenant-safe · tekrar çalıştırılabilir. Manuel varyantlar dokunulmaz. Kullanıcı verisi
 * (SKU/price/inventory) korunur: keep write yapmaz, restore yalnız status flip'ler.
 */
import {
  generateVariantCombinations,
  type CombinationAxisInput,
  type CombinationPreview,
} from "../variant-combinations/engine.js";
import { diffVariantCombinations } from "./diff-engine.js";
import type {
  AppliedVariant,
  GenerationOptionMeta,
  NewGeneratedVariantInput,
  VariantGenerationDataAccess,
} from "./data.js";

export type VariantGenerationErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_SELECTION_EMPTY"
  | "INVALID_VARIANT_SELECTION"
  | "ATTRIBUTE_OPTION_NOT_FOUND"
  | "PREVIEW_LIMIT_EXCEEDED"
  | "VARIANT_GENERATION_CONFLICT";

export interface VariantGenerationError {
  code: VariantGenerationErrorCode;
  message: string;
  totalCombinations?: number;
  limit?: number;
}

export interface GeneratedVariantSummary {
  id: string;
  combinationKey: string;
  title: string;
  sku: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  attributes: Array<{ attributeDefinitionId: string; optionId: string; optionLabel: string | null }>;
}

export interface VariantGenerationSummary {
  totalTarget: number;
  created: number;
  kept: number;
  restored: number;
  archived: number;
  manualVariantsUntouched: number;
  variants: GeneratedVariantSummary[];
}

export type GenerateResult =
  | { ok: true; summary: VariantGenerationSummary }
  | { ok: false; error: VariantGenerationError };

export interface VariantGenerationService {
  generate(input: { storeId: string; productId: string }): Promise<GenerateResult>;
}

export interface VariantGenerationServiceConfig {
  /** Güvenlik limiti (config; MAX_PREVIEW_COMBINATIONS) — preview ile aynı sınır yeniden kullanılır. */
  maxCombinations: number;
}

const DEFAULT_CURRENCY = "TRY";

/**
 * Deterministik sistem SKU'su: `V-<productId>-<hash(combinationKey)>`.
 *  - productId cuid (mağaza içi + global tekil) → farklı ürünlerde çakışma yok.
 *  - hash(combinationKey) ürün içi kombinasyonları ayırır; aynı kombinasyon her zaman aynı SKU (stabil).
 *  - random/timestamp YOK. Kullanıcı SKU Matrix'te (2C-4) değiştirebilir; restore mevcut SKU'yu korur.
 */
function deterministicSku(productId: string, combinationKey: string): string {
  // cyrb53 türevi saf hash (engine ile aynı aile; sabit seed, random YOK).
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < combinationKey.length; i++) {
    const ch = combinationKey.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `V-${productId}-${n.toString(36)}`;
}

// Kombinasyonun kanonik option etiketlerinden başlangıç başlığı ("Red / M"). Label yoksa optionId.
function deriveTitle(combination: CombinationPreview): string {
  return combination.optionLabels.map((label, i) => label ?? combination.optionIds[i]!).join(" / ");
}

function toAttributes(combination: CombinationPreview) {
  return combination.attributes.map((a) => ({
    attributeDefinitionId: a.attributeDefinitionId,
    optionId: a.optionId,
    optionLabel: a.optionLabel,
  }));
}

// Prisma P2002 (unique conflict) — beklenmedik eşzamanlılık durumu (advisory lock normalde önler).
function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function createVariantGenerationService(
  dataAccess: VariantGenerationDataAccess,
  config: VariantGenerationServiceConfig,
): VariantGenerationService {
  return {
    generate: async ({ storeId, productId }) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) {
        return { ok: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
      }

      try {
        return await dataAccess.transaction(async (ctx): Promise<GenerateResult> => {
          // (1) Concurrency: ürün bazlı advisory lock — eşzamanlı generation'ları serileştirir.
          await ctx.lockProduct(productId);

          // (2) Reçete oku. Boş reçete → SESSIZ archive YOK; kontrollü hata (mevcut varyantlar dokunulmaz).
          const recipe = await ctx.listRecipe(storeId, productId);
          if (recipe.length === 0) {
            return {
              ok: false,
              error: { code: "VARIANT_SELECTION_EMPTY", message: "Variant selection is empty." },
            };
          }

          // (3) Option metadata (batch; N+1 yok) → motor girdisi.
          const optionIds = [...new Set(recipe.flatMap((r) => r.optionIds))];
          const metaRows = await ctx.findOptionMeta(optionIds);
          const metaMap = new Map<string, GenerationOptionMeta>(metaRows.map((m) => [m.id, m]));

          const axes: CombinationAxisInput[] = recipe.map((axis) => ({
            attributeDefinitionId: axis.attributeDefinitionId,
            position: axis.position,
            options: axis.optionIds
              .map((optionId, index) => {
                const meta = metaMap.get(optionId);
                if (!meta) return null; // FK Restrict → normalde olmaz; savunmacı
                return {
                  optionId,
                  position: index,
                  label: meta.label,
                  archived: meta.status === "ARCHIVED",
                };
              })
              .filter((o): o is NonNullable<typeof o> => o !== null),
          }));

          // FK Restrict garantisine rağmen bir option metadata'sı yoksa (silinmiş/tutarsız) → hata.
          const resolvedOptionCount = axes.reduce((sum, a) => sum + a.options.length, 0);
          const requestedOptionCount = recipe.reduce((sum, r) => sum + r.optionIds.length, 0);
          if (resolvedOptionCount !== requestedOptionCount) {
            return {
              ok: false,
              error: {
                code: "ATTRIBUTE_OPTION_NOT_FOUND",
                message: "One or more selected options could not be resolved.",
              },
            };
          }

          // (4) SAF Combination Engine — guard config'ten (magic number DEĞİL).
          const engineResult = generateVariantCombinations(axes, {
            maxCombinations: config.maxCombinations,
          });
          if (!engineResult.ok) {
            return {
              ok: false,
              error: {
                code: "PREVIEW_LIMIT_EXCEEDED",
                message: engineResult.error.message,
                totalCombinations: engineResult.error.totalCombinations,
                limit: engineResult.error.limit,
              },
            };
          }
          const target = engineResult.result.combinations;
          // Eksen var ama tüm option'lar arşivli → 0 kombinasyon → sessiz archive YERİNE kontrollü hata.
          if (target.length === 0) {
            return {
              ok: false,
              error: {
                code: "INVALID_VARIANT_SELECTION",
                message: "The variant selection produces no combinations (all options archived/removed).",
              },
            };
          }

          // (5) Mevcut varyantlar + SAF diff.
          const existing = await ctx.listExistingVariants(storeId, productId);
          const diffExisting = existing.map((v) => ({ ...v, archived: v.status === "ARCHIVED" }));
          const diff = diffVariantCombinations(diffExisting, target);

          // (6) Yeni varyantlar için currency: mevcut bir varyanttan türet (yoksa mağaza varsayılanı).
          const currency = existing[0]?.currency ?? DEFAULT_CURRENCY;
          const targetByKey = new Map<string, CombinationPreview>(
            target.map((c) => [c.combinationKey, c]),
          );

          const variants: GeneratedVariantSummary[] = [];

          // create — yalnız DAHA ÖNCE VAR OLMAYAN kombinasyonlar (idempotent). Güvenli başlangıç değerleri.
          for (const combination of diff.toCreate) {
            const input: NewGeneratedVariantInput = {
              combinationKey: combination.combinationKey,
              title: deriveTitle(combination),
              sku: deterministicSku(productId, combination.combinationKey),
              currency,
              optionValues: combination.attributes.map((a) => ({
                attributeDefinitionId: a.attributeDefinitionId,
                optionId: a.optionId,
              })),
            };
            const created = await ctx.createVariant(storeId, productId, input);
            variants.push(buildSummary(created, targetByKey));
          }

          // restore — arşivli generated varyant tekrar reçeteye girdi: AYNI ID/SKU/price korunur.
          for (const variant of diff.toRestore) {
            const restored = await ctx.restoreVariant(storeId, productId, variant.id);
            variants.push(buildSummary(restored, targetByKey));
          }

          // keep — hedefte + aktif: HİÇBİR WRITE YOK (idempotentlik; updatedAt değişmez).
          for (const variant of diff.toKeep) {
            variants.push(
              buildSummary(
                { id: variant.id, combinationKey: variant.combinationKey, title: variant.title, sku: variant.sku, status: variant.status },
                targetByKey,
              ),
            );
          }

          // archive — hedefte olmayan aktif generated varyant: soft-archive (hard-delete YOK).
          for (const variant of diff.toArchive) {
            await ctx.archiveVariant(storeId, productId, variant.id);
          }

          // Response: hedef kanonik sırada (created+kept+restored). Deterministik.
          variants.sort((a, b) => (a.combinationKey < b.combinationKey ? -1 : a.combinationKey > b.combinationKey ? 1 : 0));

          return {
            ok: true,
            summary: {
              totalTarget: engineResult.result.totalCombinations,
              created: diff.toCreate.length,
              kept: diff.toKeep.length,
              restored: diff.toRestore.length,
              archived: diff.toArchive.length,
              manualVariantsUntouched: diff.manualVariants.length,
              variants,
            },
          };
        });
      } catch (error) {
        // Advisory lock normalde önler; yine de duplicate insert olursa kontrollü conflict.
        if (isUniqueConflict(error)) {
          return {
            ok: false,
            error: {
              code: "VARIANT_GENERATION_CONFLICT",
              message: "A concurrent generation is in progress. Please retry.",
            },
          };
        }
        throw error;
      }
    },
  };
}

function buildSummary(
  applied: AppliedVariant,
  targetByKey: Map<string, CombinationPreview>,
): GeneratedVariantSummary {
  const combination = applied.combinationKey ? targetByKey.get(applied.combinationKey) : undefined;
  return {
    id: applied.id,
    combinationKey: applied.combinationKey ?? "",
    title: applied.title,
    sku: applied.sku,
    status: applied.status,
    attributes: combination ? toAttributes(combination) : [],
  };
}

// ─────────────────────────── route katmanı yardımcıları ───────────────────────────

export function serializeGenerationSummary(summary: VariantGenerationSummary) {
  return {
    totalTarget: summary.totalTarget,
    created: summary.created,
    kept: summary.kept,
    restored: summary.restored,
    archived: summary.archived,
    manualVariantsUntouched: summary.manualVariantsUntouched,
    variants: summary.variants.map((v) => ({
      id: v.id,
      combinationKey: v.combinationKey,
      title: v.title,
      sku: v.sku,
      status: v.status,
      attributes: v.attributes.map((a) => ({
        attributeDefinitionId: a.attributeDefinitionId,
        optionId: a.optionId,
        optionLabel: a.optionLabel,
      })),
    })),
  };
}

// code → HTTP status: not-found 404, concurrency 409, iş kuralı/limit 422.
export function variantGenerationErrorStatus(code: VariantGenerationErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  if (code === "VARIANT_GENERATION_CONFLICT") return 409;
  return 422;
}

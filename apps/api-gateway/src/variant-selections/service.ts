/**
 * Faz 2C-1 (ADR-070) — variantSelectionService.
 *
 * ProductVariantAttribute / ProductVariantOptionSelection yazan HER YOL (urun create-update gomulu
 * akisi + dedike internal replace ucu) buradan gecer. Hicbir route dogrudan Prisma'ya varyant secimi
 * yazmaz — tek yazma otoritesi budur (Faz 2A attributeValueService deseni).
 *
 * Bu faz KOMBINASYON URETMEZ: ProductVariant / combinationKey / Cartesian / SKU matris OLUSTURULMAZ.
 * Yalniz "hangi eksenler + her eksende hangi option'lar" recetesi saklanir.
 *
 * Dogrulama (write sirasinda, STABIL kodlarla — zod refine DEGIL; Faz 1A/1B/2A deseni):
 *  - tenant izolasyonu (STORE tanimi/secenegi baska magazadan olamaz; PLATFORM her magazada gecerli)
 *  - attribute mevcut mu / archived mi
 *  - product.primaryCategoryId mevcut mu + attribute o kategoriye bagli mi (CategoryAttribute)
 *  - attribute variantDefining=true mi
 *  - attribute option-tabanli mi (SELECT/COLOR) — varyant ekseni tek-secimli option olmali
 *  - ayni attribute iki kez secilmedi mi (duplicate)
 *  - her eksende EN AZ BIR option var mi
 *  - option dogru attribute'a + dogru tenant'a mi ait, archived mi (dedupe)
 *
 * Dogrulama read-only'dir (prepare adimi), kalicilik ayri adimdir (persist/set). Boylece gomulu
 * create akisi urunu OLUSTURMADAN once dogrulayabilir (gecersizse hicbir yazim olmaz).
 */
import type { ProductVariantSelectionInput } from "@commerce-os/contracts";
import type { AttributeDataType } from "@commerce-os/contracts";
import type {
  AttributeDefinitionRef,
  AttributeOptionRef,
  ProductVariantSelectionEntry,
  ProductVariantSelectionRecord,
  VariantSelectionDataAccess,
} from "./data.js";

export type VariantSelectionErrorCode =
  | "PRODUCT_CATEGORY_REQUIRED"
  | "VARIANT_ATTRIBUTE_NOT_FOUND"
  | "VARIANT_ATTRIBUTE_ARCHIVED"
  | "VARIANT_ATTRIBUTE_TENANT_MISMATCH"
  | "VARIANT_ATTRIBUTE_NOT_IN_CATEGORY"
  | "VARIANT_ATTRIBUTE_NOT_VARIANT_DEFINING"
  | "VARIANT_ATTRIBUTE_NOT_OPTION_BASED"
  | "VARIANT_ATTRIBUTE_DUPLICATE"
  | "VARIANT_OPTION_REQUIRED"
  | "VARIANT_OPTION_INVALID"
  | "VARIANT_OPTION_ARCHIVED"
  | "VARIANT_OPTION_TENANT_MISMATCH"
  | "PRODUCT_NOT_FOUND";

export interface VariantSelectionError {
  code: VariantSelectionErrorCode;
  message: string;
  attributeDefinitionId?: string;
}

export type PrepareResult =
  | { ok: true; entries: ProductVariantSelectionEntry[] }
  | { ok: false; error: VariantSelectionError };

export type SetResult =
  | { ok: true; selections: ProductVariantSelectionRecord[] }
  | { ok: false; error: VariantSelectionError };

// Varyant ekseni olabilecek option-tabanli tipler (tek-secimli). MULTI_SELECT eksen DEGIL.
const OPTION_BASED_TYPES = new Set<AttributeDataType>(["SELECT", "COLOR"]);

function err(
  code: VariantSelectionErrorCode,
  message: string,
  attributeDefinitionId?: string,
): { ok: false; error: VariantSelectionError } {
  return { ok: false, error: { code, message, attributeDefinitionId } };
}

// Bir attribute tanimini tenant + archived acisindan dogrular (PLATFORM her magazada gecerli).
function checkDefinition(
  def: AttributeDefinitionRef | undefined,
  storeId: string,
  attributeDefinitionId: string,
): VariantSelectionError | null {
  if (!def)
    return { code: "VARIANT_ATTRIBUTE_NOT_FOUND", message: "Attribute not found.", attributeDefinitionId };
  if (def.status === "ARCHIVED")
    return { code: "VARIANT_ATTRIBUTE_ARCHIVED", message: "Attribute is archived.", attributeDefinitionId };
  if (def.scope === "STORE" && def.storeId !== storeId)
    return {
      code: "VARIANT_ATTRIBUTE_TENANT_MISMATCH",
      message: "Attribute belongs to another store.",
      attributeDefinitionId,
    };
  return null;
}

// Bir option'un tanima + tenant'a aitligini ve aktifligini dogrular.
function checkOption(
  option: AttributeOptionRef | undefined,
  attributeDefinitionId: string,
  storeId: string,
): VariantSelectionError | null {
  if (!option || option.attributeDefinitionId !== attributeDefinitionId)
    return {
      code: "VARIANT_OPTION_INVALID",
      message: "Option does not belong to the attribute.",
      attributeDefinitionId,
    };
  if (option.status === "ARCHIVED")
    return { code: "VARIANT_OPTION_ARCHIVED", message: "Option is archived.", attributeDefinitionId };
  if (option.storeId !== null && option.storeId !== storeId)
    return {
      code: "VARIANT_OPTION_TENANT_MISMATCH",
      message: "Option belongs to another store.",
      attributeDefinitionId,
    };
  return null;
}

export interface VariantSelectionService {
  prepareSelections(input: {
    storeId: string;
    primaryCategoryId: string | null;
    selections: ProductVariantSelectionInput[];
  }): Promise<PrepareResult>;
  persistSelections(
    storeId: string,
    productId: string,
    entries: ProductVariantSelectionEntry[],
  ): Promise<ProductVariantSelectionRecord[]>;
  // Dedike replace ucu: urun zaten mevcut → sahiplik cozumu + dogrulama + kalicilik.
  setSelections(input: {
    storeId: string;
    productId: string;
    selections: ProductVariantSelectionInput[];
  }): Promise<SetResult>;
  // Sahiplik-dogrulamali okuma (dedike GET ucu): urun yoksa 404.
  getSelections(storeId: string, productId: string): Promise<SetResult>;
  listSelections(storeId: string, productId: string): Promise<ProductVariantSelectionRecord[]>;
}

export function createVariantSelectionService(
  dataAccess: VariantSelectionDataAccess,
): VariantSelectionService {
  async function validate(
    storeId: string,
    primaryCategoryId: string | null,
    selections: ProductVariantSelectionInput[],
  ): Promise<PrepareResult> {
    // Bos kume: hicbir sey yazilmaz, kategori kontrolu de anlamsiz.
    if (selections.length === 0) return { ok: true, entries: [] };

    if (!primaryCategoryId) {
      return err(
        "PRODUCT_CATEGORY_REQUIRED",
        "Product must have a primary category before variant attributes can be selected.",
      );
    }

    // Duplicate attributeDefinitionId (ayni attribute iki kez eksen olamaz).
    const seen = new Set<string>();
    for (const selection of selections) {
      if (seen.has(selection.attributeDefinitionId)) {
        return err(
          "VARIANT_ATTRIBUTE_DUPLICATE",
          "The same attribute was selected more than once.",
          selection.attributeDefinitionId,
        );
      }
      seen.add(selection.attributeDefinitionId);
    }

    // Batch lookuplar.
    const defIds = [...seen];
    const optionIds = [...new Set(selections.flatMap((s) => s.optionIds))];
    const [defs, options, links] = await Promise.all([
      dataAccess.findAttributeDefinitionsByIds(defIds),
      dataAccess.findAttributeOptionsByIds(optionIds),
      dataAccess.listCategoryAttributeLinks(storeId, primaryCategoryId),
    ]);
    const defMap = new Map(defs.map((d) => [d.id, d]));
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const linkMap = new Map(links.map((l) => [l.attributeDefinitionId, l]));

    const entries: ProductVariantSelectionEntry[] = [];
    for (const selection of selections) {
      const attributeDefinitionId = selection.attributeDefinitionId;

      // Tanim: mevcut/archived/tenant.
      const defError = checkDefinition(defMap.get(attributeDefinitionId), storeId, attributeDefinitionId);
      if (defError) return { ok: false, error: defError };
      const def = defMap.get(attributeDefinitionId)!;

      // Kategori bagi (primaryCategoryId'ye CategoryAttribute ile bagli mi).
      const link = linkMap.get(attributeDefinitionId);
      if (!link) {
        return err(
          "VARIANT_ATTRIBUTE_NOT_IN_CATEGORY",
          "Attribute is not linked to the product's primary category.",
          attributeDefinitionId,
        );
      }
      // variantDefining=true olmali (bu ekran yalniz varyant eksenleri).
      if (!link.variantDefining) {
        return err(
          "VARIANT_ATTRIBUTE_NOT_VARIANT_DEFINING",
          "Attribute is not variant-defining for this category.",
          attributeDefinitionId,
        );
      }
      // Eksen option-tabanli olmali (SELECT/COLOR) — tek-secimli option.
      if (!OPTION_BASED_TYPES.has(def.dataType)) {
        return err(
          "VARIANT_ATTRIBUTE_NOT_OPTION_BASED",
          "Variant attribute must be option-based (SELECT or COLOR).",
          attributeDefinitionId,
        );
      }

      // En az bir option zorunlu.
      if (selection.optionIds.length === 0) {
        return err(
          "VARIANT_OPTION_REQUIRED",
          "Each variant attribute must include at least one option.",
          attributeDefinitionId,
        );
      }

      // Option'lar: tanima ait + tenant + aktif (dedupe, sira korunur).
      const uniqueOptionIds = [...new Set(selection.optionIds)];
      for (const optionId of uniqueOptionIds) {
        const optionError = checkOption(optionMap.get(optionId), attributeDefinitionId, storeId);
        if (optionError) return { ok: false, error: optionError };
      }

      entries.push({ attributeDefinitionId, optionIds: uniqueOptionIds });
    }

    return { ok: true, entries };
  }

  return {
    prepareSelections: ({ storeId, primaryCategoryId, selections }) =>
      validate(storeId, primaryCategoryId, selections),

    persistSelections: (storeId, productId, entries) =>
      dataAccess.replaceProductVariantSelections(storeId, productId, entries),

    setSelections: async ({ storeId, productId, selections }) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) return err("PRODUCT_NOT_FOUND", "Product not found.");
      const prepared = await validate(storeId, product.primaryCategoryId, selections);
      if (!prepared.ok) return prepared;
      const saved = await dataAccess.replaceProductVariantSelections(storeId, productId, prepared.entries);
      return { ok: true, selections: saved };
    },

    getSelections: async (storeId, productId) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) return err("PRODUCT_NOT_FOUND", "Product not found.");
      const selections = await dataAccess.listProductVariantSelections(storeId, productId);
      return { ok: true, selections };
    },

    listSelections: (storeId, productId) => dataAccess.listProductVariantSelections(storeId, productId),
  };
}

// ─────────────────────────── serialize (route katmani icin) ───────────────────────────
export function serializeProductVariantSelection(record: ProductVariantSelectionRecord) {
  return {
    attributeDefinitionId: record.attributeDefinitionId,
    dataType: record.dataType,
    position: record.position,
    optionIds: record.optionIds,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Route katmaninin VariantSelectionError.code -> HTTP status eslemesi: sahiplik/bulunamama 404,
// diger dogrulama hatalari 400 (attributeValueErrorStatus deseni).
export function variantSelectionErrorStatus(code: VariantSelectionErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  return 400;
}

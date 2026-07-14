/**
 * Faz 2A (ADR-068) — attributeValueService.
 *
 * ProductAttributeValue / VariantAttributeValue yazan HER YOL (urun/varyant create-update
 * gomulu akisi + dedike internal replace uclari) buradan gecer. Hicbir route dogrudan
 * Prisma'ya attribute DEGERI yazmaz — tek yazma otoritesi budur.
 *
 * Dogrulama (write sirasinda, STABIL kodlarla — zod refine DEGIL; Faz 1A/1B deseni):
 *  - tenant izolasyonu (STORE tanimi/secenegi/gorseli baska magazadan olamaz)
 *  - attribute mevcut mu / archived mi
 *  - product.primaryCategoryId mevcut mu + attribute o kategoriye bagli mi (CategoryAttribute)
 *  - required kontrolu (yalniz degerler saglandiginda — undefined = eski davranis)
 *  - option dogru attribute'a + dogru tenant'a mi ait, archived mi
 *  - dataType <-> deger alani eslemesi (tip guvenligi) + "en fazla bir alan"
 *  - variantDefining dogru tabloda mi (product-level attribute variant tablosuna, variant
 *    attribute product tablosuna yazilamaz)
 *
 * Dogrulama read-only'dir (prepare adimi), kalicilik ayri adimdir (persist/set). Boylece
 * gomulu create akisi urunu OLUSTURMADAN once dogrulayabilir (gecersizse hicbir yazim olmaz).
 */
import type {
  ProductAttributeValueInput,
  VariantAttributeValueInput,
} from "@commerce-os/contracts";
import type { AttributeDataType } from "@commerce-os/contracts";
import type {
  AttributeDefinitionRef,
  AttributeOptionRef,
  AttributeValueDataAccess,
  CategoryAttributeRef,
  ProductAttributeValueEntry,
  ProductAttributeValueRecord,
  VariantAttributeValueEntry,
  VariantAttributeValueRecord,
} from "./data.js";

export type AttributeValueErrorCode =
  | "PRODUCT_CATEGORY_REQUIRED"
  | "ATTRIBUTE_NOT_FOUND"
  | "ATTRIBUTE_ARCHIVED"
  | "ATTRIBUTE_TENANT_MISMATCH"
  | "ATTRIBUTE_NOT_IN_CATEGORY"
  | "ATTRIBUTE_DUPLICATE"
  | "ATTRIBUTE_VALUE_MISSING"
  | "ATTRIBUTE_MULTIPLE_VALUES"
  | "ATTRIBUTE_VALUE_TYPE_MISMATCH"
  | "ATTRIBUTE_OPTION_INVALID"
  | "ATTRIBUTE_OPTION_ARCHIVED"
  | "ATTRIBUTE_OPTION_TENANT_MISMATCH"
  | "ATTRIBUTE_MEDIA_NOT_FOUND"
  | "ATTRIBUTE_REQUIRED_MISSING"
  | "ATTRIBUTE_IS_VARIANT_DEFINING"
  | "ATTRIBUTE_NOT_VARIANT_DEFINING"
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_NOT_FOUND";

export interface AttributeValueError {
  code: AttributeValueErrorCode;
  message: string;
  attributeDefinitionId?: string;
}

export type PrepareResult<E> =
  | { ok: true; entries: E[] }
  | { ok: false; error: AttributeValueError };

export type SetProductResult =
  | { ok: true; values: ProductAttributeValueRecord[] }
  | { ok: false; error: AttributeValueError };

export type SetVariantResult =
  | { ok: true; values: VariantAttributeValueRecord[] }
  | { ok: false; error: AttributeValueError };

// dataType -> hangi giris/kolon alani beklenir (tip guvenligi tek kaynak dogrusu).
type ValueField =
  | "valueText"
  | "valueInteger"
  | "valueDecimal"
  | "valueBoolean"
  | "valueDate"
  | "optionId"
  | "optionIds"
  | "mediaId";

const FIELD_BY_TYPE: Record<AttributeDataType, ValueField> = {
  TEXT: "valueText",
  TEXTAREA: "valueText",
  RICH_TEXT: "valueText",
  URL: "valueText",
  INTEGER: "valueInteger",
  DECIMAL: "valueDecimal",
  BOOLEAN: "valueBoolean",
  DATE: "valueDate",
  SELECT: "optionId",
  COLOR: "optionId",
  MULTI_SELECT: "optionIds",
  IMAGE: "mediaId",
  FILE: "mediaId",
};

// Variant tablosu yalniz metin/secenek tasir (valueText | optionId).
const VARIANT_ALLOWED_FIELDS = new Set<ValueField>(["valueText", "optionId"]);

function err(
  code: AttributeValueErrorCode,
  message: string,
  attributeDefinitionId?: string,
): { ok: false; error: AttributeValueError } {
  return { ok: false, error: { code, message, attributeDefinitionId } };
}

// Bir attribute tanimini tenant + archived acisindan dogrular. PLATFORM tanimi tum
// magazalarda gecerli; STORE tanimi yalniz kendi magazasinda.
function checkDefinition(
  def: AttributeDefinitionRef | undefined,
  storeId: string,
  attributeDefinitionId: string,
): AttributeValueError | null {
  if (!def) return { code: "ATTRIBUTE_NOT_FOUND", message: "Attribute not found.", attributeDefinitionId };
  if (def.status === "ARCHIVED")
    return { code: "ATTRIBUTE_ARCHIVED", message: "Attribute is archived.", attributeDefinitionId };
  if (def.scope === "STORE" && def.storeId !== storeId)
    return {
      code: "ATTRIBUTE_TENANT_MISMATCH",
      message: "Attribute belongs to another store.",
      attributeDefinitionId,
    };
  return null;
}

// Bir secenegin (SELECT/COLOR/MULTI_SELECT) tanima + tenant'a aitligini ve aktifligini dogrular.
function checkOption(
  option: AttributeOptionRef | undefined,
  attributeDefinitionId: string,
  storeId: string,
): AttributeValueError | null {
  if (!option || option.attributeDefinitionId !== attributeDefinitionId)
    return {
      code: "ATTRIBUTE_OPTION_INVALID",
      message: "Option does not belong to the attribute.",
      attributeDefinitionId,
    };
  if (option.status === "ARCHIVED")
    return { code: "ATTRIBUTE_OPTION_ARCHIVED", message: "Option is archived.", attributeDefinitionId };
  if (option.storeId !== null && option.storeId !== storeId)
    return {
      code: "ATTRIBUTE_OPTION_TENANT_MISMATCH",
      message: "Option belongs to another store.",
      attributeDefinitionId,
    };
  return null;
}

// Bir girdide dolu olan deger alanlarini (undefined olmayan) sirala.
function presentFields(value: ProductAttributeValueInput): ValueField[] {
  const fields: ValueField[] = [];
  if (value.valueText !== undefined) fields.push("valueText");
  if (value.valueInteger !== undefined) fields.push("valueInteger");
  if (value.valueDecimal !== undefined) fields.push("valueDecimal");
  if (value.valueBoolean !== undefined) fields.push("valueBoolean");
  if (value.valueDate !== undefined) fields.push("valueDate");
  if (value.optionId !== undefined) fields.push("optionId");
  if (value.optionIds !== undefined) fields.push("optionIds");
  if (value.mediaId !== undefined) fields.push("mediaId");
  return fields;
}

export interface AttributeValueService {
  prepareProductValues(input: {
    storeId: string;
    primaryCategoryId: string | null;
    values: ProductAttributeValueInput[];
  }): Promise<PrepareResult<ProductAttributeValueEntry>>;
  prepareVariantValues(input: {
    storeId: string;
    primaryCategoryId: string | null;
    values: VariantAttributeValueInput[];
  }): Promise<PrepareResult<VariantAttributeValueEntry>>;
  persistProductValues(
    storeId: string,
    productId: string,
    entries: ProductAttributeValueEntry[],
  ): Promise<ProductAttributeValueRecord[]>;
  persistVariantValues(
    storeId: string,
    variantId: string,
    entries: VariantAttributeValueEntry[],
  ): Promise<VariantAttributeValueRecord[]>;
  // Dedike replace uclari: urun/varyant zaten mevcut → sahiplik cozumu + dogrulama + kalicilik.
  setProductValues(input: {
    storeId: string;
    productId: string;
    values: ProductAttributeValueInput[];
  }): Promise<SetProductResult>;
  setVariantValues(input: {
    storeId: string;
    variantId: string;
    values: VariantAttributeValueInput[];
  }): Promise<SetVariantResult>;
  // Sahiplik-dogrulamali okuma (dedike GET uclari): urun/varyant yoksa 404.
  getProductValues(storeId: string, productId: string): Promise<SetProductResult>;
  getVariantValues(storeId: string, variantId: string): Promise<SetVariantResult>;
  listProductValues(storeId: string, productId: string): Promise<ProductAttributeValueRecord[]>;
  listVariantValues(storeId: string, variantId: string): Promise<VariantAttributeValueRecord[]>;
}

export function createAttributeValueService(
  dataAccess: AttributeValueDataAccess,
): AttributeValueService {
  // Ortak dogrulama cekirdegi. `variantTable=false` product, `true` variant tablosu icin.
  async function validate(
    storeId: string,
    primaryCategoryId: string | null,
    values: ProductAttributeValueInput[],
    variantTable: boolean,
  ): Promise<
    | { ok: true; entries: (ProductAttributeValueEntry & VariantAttributeValueEntry)[] }
    | { ok: false; error: AttributeValueError }
  > {
    // Bos kume: hicbir sey yazilmaz, required kontrolu de anlamsiz (kategori olsun olmasin).
    if (values.length === 0) return { ok: true, entries: [] };

    if (!primaryCategoryId) {
      return err(
        "PRODUCT_CATEGORY_REQUIRED",
        "Product must have a primary category before attribute values can be set.",
      );
    }

    // Duplicate attributeDefinitionId (ayni attribute iki kez).
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value.attributeDefinitionId)) {
        return err(
          "ATTRIBUTE_DUPLICATE",
          "The same attribute was provided more than once.",
          value.attributeDefinitionId,
        );
      }
      seen.add(value.attributeDefinitionId);
    }

    // Batch lookuplar.
    const defIds = [...seen];
    const optionIds = [
      ...new Set(
        values.flatMap((value) => [
          ...(value.optionId !== undefined ? [value.optionId] : []),
          ...(value.optionIds ?? []),
        ]),
      ),
    ];
    const mediaIds = [
      ...new Set(values.flatMap((value) => (value.mediaId !== undefined ? [value.mediaId] : []))),
    ];

    const [defs, options, mediaFound, links] = await Promise.all([
      dataAccess.findAttributeDefinitionsByIds(defIds),
      dataAccess.findAttributeOptionsByIds(optionIds),
      dataAccess.findMediaAssetIdsForStore(storeId, mediaIds),
      dataAccess.listCategoryAttributeLinks(storeId, primaryCategoryId),
    ]);

    const defMap = new Map<string, AttributeDefinitionRef>(defs.map((def) => [def.id, def]));
    const optionMap = new Map<string, AttributeOptionRef>(options.map((option) => [option.id, option]));
    const mediaSet = new Set(mediaFound);
    const linkMap = new Map<string, CategoryAttributeRef>(
      links.map((link) => [link.attributeDefinitionId, link]),
    );

    const entries: (ProductAttributeValueEntry & VariantAttributeValueEntry)[] = [];

    for (const value of values) {
      const attributeDefinitionId = value.attributeDefinitionId;
      const def = defMap.get(attributeDefinitionId);
      const defError = checkDefinition(def, storeId, attributeDefinitionId);
      if (defError) return { ok: false, error: defError };
      // def kesin var (checkDefinition null dondu).
      const dataType = def!.dataType;

      // Attribute urunun ana kategorisine bagli mi?
      const link = linkMap.get(attributeDefinitionId);
      if (!link) {
        return err(
          "ATTRIBUTE_NOT_IN_CATEGORY",
          "Attribute is not linked to the product's primary category.",
          attributeDefinitionId,
        );
      }

      // variantDefining dogru tabloda mi?
      if (variantTable && !link.variantDefining) {
        return err(
          "ATTRIBUTE_NOT_VARIANT_DEFINING",
          "Only variant-defining attributes can be stored on a variant.",
          attributeDefinitionId,
        );
      }
      if (!variantTable && link.variantDefining) {
        return err(
          "ATTRIBUTE_IS_VARIANT_DEFINING",
          "Variant-defining attributes must be stored on a variant, not the product.",
          attributeDefinitionId,
        );
      }

      const expectedField = FIELD_BY_TYPE[dataType];

      // Variant tablosu yalniz metin/secenek tasir.
      if (variantTable && !VARIANT_ALLOWED_FIELDS.has(expectedField)) {
        return err(
          "ATTRIBUTE_VALUE_TYPE_MISMATCH",
          "This attribute data type cannot be stored on a variant.",
          attributeDefinitionId,
        );
      }

      // Deger alani sayisi: tam bir tane, ve beklenen alanla eslesmeli.
      const provided = presentFields(value);
      if (provided.length === 0) {
        return err("ATTRIBUTE_VALUE_MISSING", "No value provided for the attribute.", attributeDefinitionId);
      }
      if (provided.length > 1) {
        return err(
          "ATTRIBUTE_MULTIPLE_VALUES",
          "Only one value field may be provided per attribute.",
          attributeDefinitionId,
        );
      }
      if (provided[0] !== expectedField) {
        return err(
          "ATTRIBUTE_VALUE_TYPE_MISMATCH",
          `Attribute of type ${dataType} expects the '${expectedField}' value field.`,
          attributeDefinitionId,
        );
      }

      // Alan-bazli deger dogrulama + normalize.
      const entry: ProductAttributeValueEntry & VariantAttributeValueEntry = { attributeDefinitionId };
      switch (expectedField) {
        case "valueText":
          entry.valueText = value.valueText!;
          break;
        case "valueInteger":
          entry.valueInteger = value.valueInteger!;
          break;
        case "valueDecimal":
          entry.valueDecimal = value.valueDecimal!;
          break;
        case "valueBoolean":
          entry.valueBoolean = value.valueBoolean!;
          break;
        case "valueDate":
          entry.valueDate = new Date(value.valueDate!);
          break;
        case "optionId": {
          const optionError = checkOption(optionMap.get(value.optionId!), attributeDefinitionId, storeId);
          if (optionError) return { ok: false, error: optionError };
          entry.optionId = value.optionId!;
          break;
        }
        case "mediaId":
          if (!mediaSet.has(value.mediaId!)) {
            return err(
              "ATTRIBUTE_MEDIA_NOT_FOUND",
              "Media asset not found for this store.",
              attributeDefinitionId,
            );
          }
          entry.mediaId = value.mediaId!;
          break;
        case "optionIds": {
          const ids = value.optionIds!;
          if (ids.length === 0) {
            return err(
              "ATTRIBUTE_VALUE_MISSING",
              "MULTI_SELECT requires at least one option.",
              attributeDefinitionId,
            );
          }
          const uniqueIds = [...new Set(ids)];
          for (const id of uniqueIds) {
            const optionError = checkOption(optionMap.get(id), attributeDefinitionId, storeId);
            if (optionError) return { ok: false, error: optionError };
          }
          entry.optionIds = uniqueIds;
          break;
        }
      }
      entries.push(entry);
    }

    // Required kontrolu (yalniz ilgili tablo kapsamindaki bagli attribute'lar).
    for (const link of links) {
      if (!link.required) continue;
      if (variantTable !== link.variantDefining) continue;
      if (!seen.has(link.attributeDefinitionId)) {
        return err(
          "ATTRIBUTE_REQUIRED_MISSING",
          "A required attribute is missing a value.",
          link.attributeDefinitionId,
        );
      }
    }

    return { ok: true, entries };
  }

  return {
    prepareProductValues: async ({ storeId, primaryCategoryId, values }) => {
      const result = await validate(storeId, primaryCategoryId, values, false);
      if (!result.ok) return result;
      return { ok: true, entries: result.entries as ProductAttributeValueEntry[] };
    },

    prepareVariantValues: async ({ storeId, primaryCategoryId, values }) => {
      // Variant girdisi urun girdisinin alt kumesi (yalniz valueText/optionId) → guvenle daralt.
      const result = await validate(storeId, primaryCategoryId, values as ProductAttributeValueInput[], true);
      if (!result.ok) return result;
      const entries: VariantAttributeValueEntry[] = result.entries.map((entry) => ({
        attributeDefinitionId: entry.attributeDefinitionId,
        valueText: entry.valueText,
        optionId: entry.optionId,
      }));
      return { ok: true, entries };
    },

    persistProductValues: (storeId, productId, entries) =>
      dataAccess.replaceProductAttributeValues(storeId, productId, entries),

    persistVariantValues: (storeId, variantId, entries) =>
      dataAccess.replaceVariantAttributeValues(storeId, variantId, entries),

    setProductValues: async ({ storeId, productId, values }) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) return err("PRODUCT_NOT_FOUND", "Product not found.");
      const prepared = await validate(storeId, product.primaryCategoryId, values, false);
      if (!prepared.ok) return prepared;
      const saved = await dataAccess.replaceProductAttributeValues(
        storeId,
        productId,
        prepared.entries as ProductAttributeValueEntry[],
      );
      return { ok: true, values: saved };
    },

    setVariantValues: async ({ storeId, variantId, values }) => {
      const variant = await dataAccess.findVariantForStore(storeId, variantId);
      if (!variant) return err("VARIANT_NOT_FOUND", "Variant not found.");
      const prepared = await validate(
        storeId,
        variant.primaryCategoryId,
        values as ProductAttributeValueInput[],
        true,
      );
      if (!prepared.ok) return prepared;
      const entries: VariantAttributeValueEntry[] = prepared.entries.map((entry) => ({
        attributeDefinitionId: entry.attributeDefinitionId,
        valueText: entry.valueText,
        optionId: entry.optionId,
      }));
      const saved = await dataAccess.replaceVariantAttributeValues(storeId, variantId, entries);
      return { ok: true, values: saved };
    },

    getProductValues: async (storeId, productId) => {
      const product = await dataAccess.findProductForStore(storeId, productId);
      if (!product) return err("PRODUCT_NOT_FOUND", "Product not found.");
      const values = await dataAccess.listProductAttributeValues(storeId, productId);
      return { ok: true, values };
    },

    getVariantValues: async (storeId, variantId) => {
      const variant = await dataAccess.findVariantForStore(storeId, variantId);
      if (!variant) return err("VARIANT_NOT_FOUND", "Variant not found.");
      const values = await dataAccess.listVariantAttributeValues(storeId, variantId);
      return { ok: true, values };
    },

    listProductValues: (storeId, productId) => dataAccess.listProductAttributeValues(storeId, productId),
    listVariantValues: (storeId, variantId) => dataAccess.listVariantAttributeValues(storeId, variantId),
  };
}

// ─────────────────────────── serialize'lar (route katmani icin) ───────────────────────────
export function serializeProductAttributeValue(record: ProductAttributeValueRecord) {
  return {
    id: record.id,
    attributeDefinitionId: record.attributeDefinitionId,
    dataType: record.dataType,
    valueText: record.valueText,
    valueInteger: record.valueInteger,
    valueDecimal: record.valueDecimal,
    valueBoolean: record.valueBoolean,
    valueDate: record.valueDate ? record.valueDate.toISOString() : null,
    optionId: record.optionId,
    optionIds: record.optionIds,
    mediaId: record.mediaId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializeVariantAttributeValue(record: VariantAttributeValueRecord) {
  return {
    id: record.id,
    attributeDefinitionId: record.attributeDefinitionId,
    dataType: record.dataType,
    valueText: record.valueText,
    optionId: record.optionId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Route katmaninin AttributeValueError.code -> HTTP status eslemesi icin: dogrulama
// hatalari 400, sahiplik/bulunamama 404 (product/variant). Tenant "not found" gibi
// davranir (mevcut desen) ama burada dogrudan kod verilir.
export function attributeValueErrorStatus(code: AttributeValueErrorCode): number {
  if (code === "PRODUCT_NOT_FOUND" || code === "VARIANT_NOT_FOUND") return 404;
  return 400;
}

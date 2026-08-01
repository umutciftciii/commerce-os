// TODO-165A (ADR-165A) — Task 9: Governed Product Taxonomy servisi (TEK YAZAR).
//
// `ProductTaxonomyValue` = governance otoritesi (name/status/displayOrder/metadata/parentId).
// Destekledigi store-scoped `AttributeOption` = assignment/facet kimligi (value IMMUTABLE,
// label name'i mirror'lar, sortOrder displayOrder'i mirror'lar). Bu servis governed
// AttributeOption'larin TEK yazaridir — urun/varyant ATAMASI (EAV) mevcut
// `attributeValueService`de KALIR, bu servis ona DOKUNMAZ.
//
// `create()` HER ZAMAN YENI bir store-scoped AttributeOption uretir — asla mevcut bir
// global/canonical option'a baglanmaz (iki magaza ayni degeri "Pamuk" olarak yaratirsa
// BAGIMSIZ iki option olusur). Rename slug'i/option.value'yu DEGISTIRMEZ (IMMUTABLE).
// Archive/restore/reorder/delete her zaman value+option'i AYNI transaction'da birlikte
// gunceller (bkz. taxonomy-data.ts).
//
// `ensureStoreTaxonomyDefaults(storeId)` idempotent bootstrap: registry'deki her kanonik
// degeri EKSIKSE olusturur, VARSA dokunmaz (manuel rename/arsiv/displayOrder KORUNUR).
// FASHION_VERTICAL capability kontrolu bu serviste YAPILMAZ — cagiran (Task 10b) yalniz
// capability ACIKKEN cagirmalidir; bu servis metodu "zaten enabled" varsayimiyla calisir.

import { slugify } from "@commerce-os/utils";
import {
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
  isProductTaxonomyType,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import { definitionCodeForTaxonomyType } from "./taxonomy-map.js";
import {
  TaxonomyOptionConflictError,
  TaxonomyOptionInUseError,
  type TaxonomyDataAccess,
  type TaxonomyValueRecord,
} from "./taxonomy-data.js";

export type TaxonomyErrorCode =
  | "TAXONOMY_NOT_FOUND"
  | "TAXONOMY_DUPLICATE"
  | "TAXONOMY_IN_USE"
  | "TAXONOMY_ARCHIVED"
  | "TAXONOMY_CROSS_STORE"
  | "TAXONOMY_UNKNOWN_TYPE"
  // Task 27P (gap-fix) — `ensureStoreTaxonomyDefaults` icin fail-closed sinyal: HICBIR
  // governed tip icin PLATFORM AttributeDefinition grounded degilse (operasyonel/ortam
  // provisioning eksigi — bkz. 20260802120000 migration). Tek bir tipin eksik olmasi
  // TOLERE edilir (o tip atlanir); YALNIZ "hepsi eksik" (sifir deger uretildi) bu koda cikar.
  | "TAXONOMY_NOT_PROVISIONED";

export class TaxonomyError extends Error {
  constructor(
    public code: TaxonomyErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TaxonomyError";
  }
}

export function taxonomyErrorStatus(code: TaxonomyErrorCode): number {
  switch (code) {
    case "TAXONOMY_NOT_FOUND":
      return 404;
    case "TAXONOMY_DUPLICATE":
    case "TAXONOMY_IN_USE":
    case "TAXONOMY_ARCHIVED":
      return 409;
    case "TAXONOMY_CROSS_STORE":
      return 403;
    case "TAXONOMY_NOT_PROVISIONED":
      // Ortam/operasyonel provisioning eksigi (client hatasi DEGIL) — 500.
      return 500;
    case "TAXONOMY_UNKNOWN_TYPE":
    default:
      return 400;
  }
}

export interface TaxonomyCreateInput {
  /** Route katmani zod ile ProductTaxonomyType'a kisitlar; servis yine de runtime dogrular. */
  type: string;
  name: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
}

export interface TaxonomyUpdateInput {
  name?: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
  displayOrder?: number;
}

export interface TaxonomyService {
  list(storeId: string, type?: string): Promise<TaxonomyValueRecord[]>;
  get(storeId: string, id: string): Promise<TaxonomyValueRecord>;
  create(storeId: string, input: TaxonomyCreateInput): Promise<TaxonomyValueRecord>;
  update(storeId: string, id: string, patch: TaxonomyUpdateInput): Promise<TaxonomyValueRecord>;
  reorder(storeId: string, type: string, orderedIds: string[]): Promise<TaxonomyValueRecord[]>;
  archive(storeId: string, id: string): Promise<TaxonomyValueRecord>;
  restore(storeId: string, id: string): Promise<TaxonomyValueRecord>;
  delete(storeId: string, id: string): Promise<void>;
  usageCount(storeId: string, id: string): Promise<number>;
  /**
   * Task 24 — `usageCount`'un TOPLU hali (bkz. `TaxonomyDataAccess.countUsageBatch`).
   * Store/id dogrulamasi YAPMAZ (cagiran zaten dogrulanmis kayitlarin
   * `attributeOptionId`'lerini gecirir — liste/mutasyon route'lari); yalnizca
   * `data.countUsageBatch`'e ince bir gecistir.
   */
  usageCountForOptions(optionIds: string[]): Promise<Record<string, number>>;
  /**
   * Idempotent bootstrap — yalniz FASHION_VERTICAL enabled magazalar icin cagirilmali
   * (capability kontrolu cagiranin sorumlulugu, bkz. dosya basi not).
   */
  ensureStoreTaxonomyDefaults(storeId: string): Promise<void>;
}

function requireType(type: string): ProductTaxonomyType {
  if (!isProductTaxonomyType(type)) {
    throw new TaxonomyError("TAXONOMY_UNKNOWN_TYPE", `Unknown taxonomy type: ${type}`, { type });
  }
  return type;
}

/** option.storeId === value.storeId invariant guard — bozuksa (defensive) firlatir, TaxonomyError DEGIL. */
function assertOptionStoreInvariant(record: TaxonomyValueRecord): void {
  if (record.option.storeId !== record.storeId) {
    throw new Error(
      `Taxonomy invariant violated: ProductTaxonomyValue ${record.id} storeId=${record.storeId} ` +
        `but backing AttributeOption ${record.attributeOptionId} storeId=${String(record.option.storeId)}`,
    );
  }
}

export function createTaxonomyService(data: TaxonomyDataAccess): TaxonomyService {
  async function requireValue(storeId: string, id: string): Promise<TaxonomyValueRecord> {
    const record = await data.findById(id);
    if (!record) {
      throw new TaxonomyError("TAXONOMY_NOT_FOUND", `Taxonomy value not found: ${id}`);
    }
    if (record.storeId !== storeId) {
      throw new TaxonomyError("TAXONOMY_CROSS_STORE", `Taxonomy value belongs to another store: ${id}`);
    }
    assertOptionStoreInvariant(record);
    return record;
  }

  async function resolveDefinitionId(type: ProductTaxonomyType): Promise<string> {
    const code = definitionCodeForTaxonomyType(type);
    const defId = await data.platformDefinitionIdForCode(code);
    if (!defId) {
      throw new TaxonomyError(
        "TAXONOMY_UNKNOWN_TYPE",
        `No PLATFORM AttributeDefinition grounded for taxonomy type ${type} (code ${code})`,
        { type, code },
      );
    }
    return defId;
  }

  async function createGoverned(
    storeId: string,
    type: ProductTaxonomyType,
    name: string,
    opts: { metadata?: Record<string, unknown>; parentId?: string | null } = {},
  ): Promise<TaxonomyValueRecord> {
    const defId = await resolveDefinitionId(type);
    const slug = slugify(name);
    const existing = await data.findBySlug(storeId, type, slug);
    if (existing) {
      throw new TaxonomyError(
        "TAXONOMY_DUPLICATE",
        `A taxonomy value already exists for "${slug}" in ${type}`,
        { slug, type },
      );
    }

    let created: TaxonomyValueRecord;
    try {
      created = await data.createValueWithOption({
        storeId,
        type,
        name,
        slug,
        attributeDefinitionId: defId,
        metadata: opts.metadata,
        parentId: opts.parentId ?? null,
      });
    } catch (error) {
      if (error instanceof TaxonomyOptionConflictError) {
        throw new TaxonomyError(
          "TAXONOMY_DUPLICATE",
          `A taxonomy value already exists for "${slug}" in ${type}`,
          { slug, type },
        );
      }
      throw error;
    }

    assertOptionStoreInvariant(created);
    return created;
  }

  return {
    async list(storeId, type) {
      return data.list(storeId, type !== undefined ? requireType(type) : undefined);
    },

    get: (storeId, id) => requireValue(storeId, id),

    async create(storeId, input) {
      const type = requireType(input.type);
      const name = input.name?.trim() ?? "";
      return createGoverned(storeId, type, name, {
        metadata: input.metadata,
        parentId: input.parentId,
      });
    },

    async update(storeId, id, patch) {
      await requireValue(storeId, id);
      // slug/option.value IMMUTABLE — yalniz name/metadata/parentId/displayOrder gecer.
      // status update() ile YAPILMAZ (archive()/restore() ile).
      const updated = await data.renameValueAndOption(storeId, id, {
        name: patch.name !== undefined ? patch.name.trim() : undefined,
        metadata: patch.metadata,
        parentId: patch.parentId,
        displayOrder: patch.displayOrder,
      });
      assertOptionStoreInvariant(updated);
      return updated;
    },

    async reorder(storeId, type, orderedIds) {
      const t = requireType(type);
      // Her id storeId'ye ait olmali (cross-store/not-found guard) VE verilen type'a ait olmali.
      for (const id of orderedIds) {
        const record = await requireValue(storeId, id);
        if (record.type !== t) {
          throw new TaxonomyError(
            "TAXONOMY_UNKNOWN_TYPE",
            `Taxonomy value ${id} does not belong to type ${t}`,
            { id, type: t },
          );
        }
      }
      return data.reorderBoth(storeId, t, orderedIds);
    },

    async archive(storeId, id) {
      await requireValue(storeId, id);
      const updated = await data.setStatusBoth(storeId, id, "ARCHIVED");
      assertOptionStoreInvariant(updated);
      return updated;
    },

    async restore(storeId, id) {
      await requireValue(storeId, id);
      const updated = await data.setStatusBoth(storeId, id, "ACTIVE");
      assertOptionStoreInvariant(updated);
      return updated;
    },

    async delete(storeId, id) {
      const record = await requireValue(storeId, id);
      const usage = await data.countUsage(record.attributeOptionId);
      if (usage > 0) {
        throw new TaxonomyError(
          "TAXONOMY_IN_USE",
          `Taxonomy value ${id} is in use by ${usage} assignment(s)`,
          { usageCount: usage },
        );
      }
      try {
        await data.deleteBoth(storeId, id);
      } catch (error) {
        // TOCTOU: usageCount()===0 yukarida dogrulandi ama bu satira kadar gecen surede
        // (baska bir istek) yeni bir assignment olusmus olabilir — data katmani bunu FK
        // Restrict'ten (P2003) tipli TaxonomyOptionInUseError'a cevirir, burada da servisin
        // tek hata sozlesmesine (TaxonomyError) esleriz — raw Prisma/data-layer hatasi ASLA sizmaz.
        if (error instanceof TaxonomyOptionInUseError) {
          throw new TaxonomyError(
            "TAXONOMY_IN_USE",
            `Taxonomy value ${id} became in-use between the usage check and delete`,
          );
        }
        throw error;
      }
    },

    async usageCount(storeId, id) {
      const record = await requireValue(storeId, id);
      return data.countUsage(record.attributeOptionId);
    },

    async usageCountForOptions(optionIds) {
      return data.countUsageBatch(optionIds);
    },

    async ensureStoreTaxonomyDefaults(storeId) {
      let missingDefCount = 0;
      for (const type of PRODUCT_TAXONOMY_TYPES) {
        const code = definitionCodeForTaxonomyType(type);
        const defId = await data.platformDefinitionIdForCode(code);
        if (!defId) {
          // Grounding eksikse (beklenmeyen operasyonel drift) bu tipi atla — diger tipler icin
          // bootstrap'i BLOKE ETME. taxonomy-map.ts zaten import-time'da GOVERNED_TAXONOMY_CODES'in
          // canonical-attributes.ts'te var oldugunu dogrular; burasi son savunma hatti. Tek basina
          // TEK bir tipin eksik olmasi (kismi drift) tolere edilir — asagidaki dongu sonrasi guard
          // yalniz "TUMU eksik" (Task 27P: hicbir provisioning yapilmamis ortam) durumunu yakalar.
          missingDefCount += 1;
          continue;
        }
        for (const canonical of TAXONOMY_TYPE_REGISTRY[type].canonical) {
          const existing = await data.findBySlug(storeId, type, canonical.slug);
          if (existing) continue; // manuel rename/arsiv/displayOrder KORUNUR — asla ustune yazilmaz.
          try {
            await data.createValueWithOption({
              storeId,
              type,
              name: canonical.name,
              slug: canonical.slug,
              attributeDefinitionId: defId,
            });
          } catch (error) {
            if (error instanceof TaxonomyOptionConflictError) {
              // Concurrent bootstrap yarisi — baskasi zaten olusturdu, no-op (idempotent).
              continue;
            }
            throw error;
          }
        }
      }
      // Task 27P (gap-fix) — katastrofik durum: HICBIR governed tip icin PLATFORM
      // AttributeDefinition grounded degildi (ortam hic provisioning gormemis — bkz.
      // 20260802120000 migration). Bu durumda dongu sessizce hicbir sey uretmeden biter;
      // caller (T10b) bunu "basarili bootstrap" sanip magazayi "enabled ama governed
      // sozlugu tamamen bos" birakirdi. Fail-closed'i DURUST kilmak icin acikca firlatiriz —
      // T10b'nin compensating-write revert'i bu sayede fiilen tetiklenir.
      if (missingDefCount === PRODUCT_TAXONOMY_TYPES.length) {
        throw new TaxonomyError(
          "TAXONOMY_NOT_PROVISIONED",
          `No PLATFORM AttributeDefinition exists for ANY of the ${PRODUCT_TAXONOMY_TYPES.length} ` +
            "governed fashion taxonomy types — this environment's platform provisioning migration " +
            "(20260802120000_provision_platform_fashion_attribute_definitions) has not been applied. " +
            "Refusing to bootstrap a store with a completely empty governed vocabulary.",
          { storeId },
        );
      }
    },
  };
}

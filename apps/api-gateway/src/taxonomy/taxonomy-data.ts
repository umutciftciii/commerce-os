// TODO-165A (ADR-165A) — Task 9: Governed Product Taxonomy veri erisimi.
//
// `ProductTaxonomyValue` <-> destekledigi store-scoped `AttributeOption` (1:1) uzerinde
// TEK YAZAR. Bu modul yalniz IO'dur (dogrulama/duplicate-check YOK — o taxonomy-service.ts'te).
// Her sorgu `{ storeId }` ile scope'lanir (findById haric — cross-store 403 vs not-found 404
// ayrimini servis katmaninda yapabilmek icin unscoped okunur, servis storeId'yi KENDISI
// karsilastirir).
//
// Governed-option mutasyonlari (create/rename/archive/restore/reorder/delete) HER ZAMAN
// `AttributeOption` + `ProductTaxonomyValue`'yu AYNI `$transaction` icinde birlikte yazar
// (ADR-255 tek-yazar disiplini). `createValueWithOption` DB'nin store-scoped partial unique
// index'ine (`(storeId, attributeDefinitionId, value)`) carpip P2002 alirsa bunu yutup
// mevcut kaydi yeniden secer (idempotent bootstrap icin concurrent-safe) — TaxonomyOptionConflictError
// firlatir, cagiran (ensureStoreTaxonomyDefaults) bunu "baskasi zaten olusturdu" olarak yutar.

import { prisma as defaultPrisma } from "@commerce-os/db";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ProductTaxonomyType, ProductTaxonomyStatus } from "@commerce-os/contracts/product-taxonomy";

export interface TaxonomyOptionRef {
  id: string;
  storeId: string | null;
  value: string;
  label: string;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
}

export interface TaxonomyValueRecord {
  id: string;
  storeId: string;
  type: ProductTaxonomyType;
  name: string;
  slug: string;
  status: ProductTaxonomyStatus;
  displayOrder: number;
  metadata: Record<string, unknown>;
  parentId: string | null;
  attributeOptionId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Destekledigi store-scoped AttributeOption (bkz. ADR-255 authority split). */
  option: TaxonomyOptionRef;
}

export interface TaxonomyCreateInput {
  storeId: string;
  type: ProductTaxonomyType;
  name: string;
  /** Onceden slugify edilmis, IMMUTABLE deger — servis uretir. */
  slug: string;
  /** PLATFORM AttributeDefinition id (bkz. `platformDefinitionIdForCode`). */
  attributeDefinitionId: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
}

export interface TaxonomyUpdatePatch {
  name?: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
  displayOrder?: number;
}

/**
 * `createValueWithOption` DB unique-constraint (P2002) ile carptiginda firlatilir. Sadece
 * `ensureStoreTaxonomyDefaults`in concurrent-safe re-run'i icin YUTULUR (bkz. taxonomy-service.ts);
 * genel `create()` akisinda servis bunu `TAXONOMY_DUPLICATE`ye cevirir (defensive ikinci hat —
 * ana duplicate kontrolu servisin on-check'idir).
 */
export class TaxonomyOptionConflictError extends Error {
  constructor(message = "A taxonomy option already exists for this store/type/slug") {
    super(message);
    this.name = "TaxonomyOptionConflictError";
  }
}

/**
 * `deleteBoth` DB foreign-key restrict (P2003) ile carptiginda firlatilir — TOCTOU: servisin
 * `usageCount===0` on-kontrolu ile bu delete arasindaki pencerede yeni bir
 * ProductAttributeValue/ProductAttributeValueOption/VariantAttributeValue satiri olusursa,
 * `AttributeOption`'daki `onDelete: Restrict` FK'lar DB'de patlar. Bu, o patlamayi TIPLI bir
 * hataya cevirir (taxonomy-service.ts `TAXONOMY_IN_USE`/409'a esler) — raw Prisma error
 * cagirana asla sizmaz.
 */
export class TaxonomyOptionInUseError extends Error {
  constructor(message = "Taxonomy option is still referenced by product/variant attribute values") {
    super(message);
    this.name = "TaxonomyOptionInUseError";
  }
}

export interface TaxonomyDataAccess {
  /** `fashion.*` kodu icin PLATFORM (scope=PLATFORM, storeId=null) AttributeDefinition id'si. */
  platformDefinitionIdForCode(code: string): Promise<string | null>;
  /** Store-scoped `(storeId, type, slug)` tekillik kontrolu / idempotent-bootstrap lookup'i icin. */
  findBySlug(storeId: string, type: ProductTaxonomyType, slug: string): Promise<TaxonomyValueRecord | null>;
  /** UNSCOPED (storeId'ye gore filtrelenmez) — cross-store (403) vs not-found (404) ayrimi servis katmanindadir. */
  findById(id: string): Promise<TaxonomyValueRecord | null>;
  list(storeId: string, type?: ProductTaxonomyType): Promise<TaxonomyValueRecord[]>;
  /** `ProductAttributeValue.optionId` + `ProductAttributeValueOption.optionId` + `VariantAttributeValue.optionId` toplami. */
  countUsage(optionId: string): Promise<number>;
  /**
   * Task 24 — `countUsage`'in TOPLU (batch) hali. Liste ucu (`GET .../product-taxonomy`)
   * her sayfa icin N ayri `countUsage` cagrisi yerine (N+1) BURADAN tek turda (3 `groupBy`
   * sorgusu, item sayisindan BAGIMSIZ) kullanim haritasi alir. Sonuc `optionIds`'te
   * OLMAYAN id'ler icin 0 VARSAYAR (cagiran `?? 0` yapmak zorunda degil).
   */
  countUsageBatch(optionIds: string[]): Promise<Record<string, number>>;
  /** TEK YAZAR create — YENI store-scoped AttributeOption + bagli ProductTaxonomyValue, bir `$transaction`. */
  createValueWithOption(input: TaxonomyCreateInput): Promise<TaxonomyValueRecord>;
  /** name/metadata/parentId/displayOrder patch; name verilirse option.label da ayni tx'te guncellenir; slug/option.value IMMUTABLE. */
  renameValueAndOption(storeId: string, id: string, patch: TaxonomyUpdatePatch): Promise<TaxonomyValueRecord>;
  /** value.status + option.status ayni tx'te. */
  setStatusBoth(storeId: string, id: string, status: ProductTaxonomyStatus): Promise<TaxonomyValueRecord>;
  /** displayOrder (0..n-1, verilen sirayla) + option.sortOrder mirror, ayni tx. */
  reorderBoth(storeId: string, type: ProductTaxonomyType, orderedIds: string[]): Promise<TaxonomyValueRecord[]>;
  /** Her iki satiri da (ProductTaxonomyValue + AttributeOption) ayni tx'te siler. */
  deleteBoth(storeId: string, id: string): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** FK "Restrict" ihlali (bkz. AttributeOption.productValues/variantValues/productValueLinks `onDelete: Restrict`). */
function isForeignKeyRestrictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

const valueInclude = {
  attributeOption: {
    select: { id: true, storeId: true, value: true, label: true, sortOrder: true, status: true },
  },
} satisfies Prisma.ProductTaxonomyValueInclude;

type ValueRow = Prisma.ProductTaxonomyValueGetPayload<{ include: typeof valueInclude }>;

function mapRow(row: ValueRow): TaxonomyValueRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    type: row.type,
    name: row.name,
    slug: row.slug,
    status: row.status,
    displayOrder: row.displayOrder,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    parentId: row.parentId,
    attributeOptionId: row.attributeOptionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    option: {
      id: row.attributeOption.id,
      storeId: row.attributeOption.storeId,
      value: row.attributeOption.value,
      label: row.attributeOption.label,
      sortOrder: row.attributeOption.sortOrder,
      status: row.attributeOption.status,
    },
  };
}

export function createPrismaTaxonomyDataAccess(prisma: PrismaClient = defaultPrisma): TaxonomyDataAccess {
  const access: TaxonomyDataAccess = {
    async platformDefinitionIdForCode(code) {
      const row = await prisma.attributeDefinition.findFirst({
        where: { code, scope: "PLATFORM" },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async findBySlug(storeId, type, slug) {
      const row = await prisma.productTaxonomyValue.findFirst({
        where: { storeId, type, slug },
        include: valueInclude,
      });
      return row ? mapRow(row) : null;
    },

    async findById(id) {
      const row = await prisma.productTaxonomyValue.findUnique({
        where: { id },
        include: valueInclude,
      });
      return row ? mapRow(row) : null;
    },

    async list(storeId, type) {
      const rows = await prisma.productTaxonomyValue.findMany({
        where: { storeId, ...(type ? { type } : {}) },
        include: valueInclude,
        orderBy: [{ type: "asc" }, { displayOrder: "asc" }],
      });
      return rows.map(mapRow);
    },

    async countUsage(optionId) {
      const [a, b, c] = await Promise.all([
        prisma.productAttributeValue.count({ where: { optionId } }),
        prisma.productAttributeValueOption.count({ where: { optionId } }),
        prisma.variantAttributeValue.count({ where: { optionId } }),
      ]);
      return a + b + c;
    },

    async countUsageBatch(optionIds) {
      const result: Record<string, number> = {};
      for (const id of optionIds) result[id] = 0;
      if (optionIds.length === 0) return result;
      const [a, b, c] = await Promise.all([
        prisma.productAttributeValue.groupBy({
          by: ["optionId"],
          where: { optionId: { in: optionIds } },
          _count: { _all: true },
        }),
        prisma.productAttributeValueOption.groupBy({
          by: ["optionId"],
          where: { optionId: { in: optionIds } },
          _count: { _all: true },
        }),
        prisma.variantAttributeValue.groupBy({
          by: ["optionId"],
          where: { optionId: { in: optionIds } },
          _count: { _all: true },
        }),
      ]);
      for (const row of [...a, ...b, ...c]) {
        const optionId = row.optionId;
        if (!optionId) continue;
        result[optionId] = (result[optionId] ?? 0) + row._count._all;
      }
      return result;
    },

    async createValueWithOption(input) {
      try {
        return await prisma.$transaction(async (tx) => {
          const sortOrder = await tx.attributeOption.count({
            where: { attributeDefinitionId: input.attributeDefinitionId, storeId: input.storeId },
          });
          const displayOrder = await tx.productTaxonomyValue.count({
            where: { storeId: input.storeId, type: input.type },
          });
          const option = await tx.attributeOption.create({
            data: {
              attributeDefinitionId: input.attributeDefinitionId,
              storeId: input.storeId,
              value: input.slug,
              label: input.name,
              status: "ACTIVE",
              sortOrder,
              metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            },
            select: { id: true },
          });
          const row = await tx.productTaxonomyValue.create({
            data: {
              storeId: input.storeId,
              type: input.type,
              name: input.name,
              slug: input.slug,
              status: "ACTIVE",
              displayOrder,
              metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
              parentId: input.parentId ?? null,
              attributeOptionId: option.id,
            },
            include: valueInclude,
          });
          return mapRow(row);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TaxonomyOptionConflictError();
        }
        throw error;
      }
    },

    async renameValueAndOption(storeId, id, patch) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.productTaxonomyValue.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.metadata !== undefined ? { metadata: patch.metadata as Prisma.InputJsonValue } : {}),
            ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
            ...(patch.displayOrder !== undefined ? { displayOrder: patch.displayOrder } : {}),
          },
          include: valueInclude,
        });
        if (patch.name !== undefined || patch.displayOrder !== undefined) {
          await tx.attributeOption.update({
            where: { id: row.attributeOptionId },
            data: {
              ...(patch.name !== undefined ? { label: patch.name } : {}),
              ...(patch.displayOrder !== undefined ? { sortOrder: patch.displayOrder } : {}),
            },
          });
        }
        const fresh =
          patch.name !== undefined || patch.displayOrder !== undefined
            ? await tx.productTaxonomyValue.findUniqueOrThrow({ where: { id }, include: valueInclude })
            : row;
        void storeId;
        return mapRow(fresh);
      });
    },

    async setStatusBoth(storeId, id, status) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.productTaxonomyValue.update({
          where: { id },
          data: { status },
          include: valueInclude,
        });
        await tx.attributeOption.update({
          where: { id: row.attributeOptionId },
          data: { status },
        });
        const fresh = await tx.productTaxonomyValue.findUniqueOrThrow({ where: { id }, include: valueInclude });
        void storeId;
        return mapRow(fresh);
      });
    },

    async reorderBoth(storeId, type, orderedIds) {
      return prisma.$transaction(async (tx) => {
        const results: TaxonomyValueRecord[] = [];
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          const row = await tx.productTaxonomyValue.update({
            where: { id },
            data: { displayOrder: i },
            include: valueInclude,
          });
          await tx.attributeOption.update({
            where: { id: row.attributeOptionId },
            data: { sortOrder: i },
          });
          const fresh = await tx.productTaxonomyValue.findUniqueOrThrow({ where: { id }, include: valueInclude });
          results.push(mapRow(fresh));
        }
        void storeId;
        void type;
        return results;
      });
    },

    async deleteBoth(storeId, id) {
      try {
        await prisma.$transaction(async (tx) => {
          const row = await tx.productTaxonomyValue.findUnique({ where: { id }, select: { attributeOptionId: true } });
          if (!row) return;
          await tx.productTaxonomyValue.delete({ where: { id } });
          // Bu satir TOCTOU riskini tasir: servisin `usageCount===0` on-kontrolu ile buraya kadar
          // gecen surede yeni bir assignment olusmus olabilir — FK Restrict bu durumda P2003
          // firlatir, asagidaki catch bunu tipli TaxonomyOptionInUseError'a cevirir.
          await tx.attributeOption.delete({ where: { id: row.attributeOptionId } });
        });
      } catch (error) {
        if (isForeignKeyRestrictError(error)) {
          throw new TaxonomyOptionInUseError();
        }
        throw error;
      }
      void storeId;
    },
  };

  return access;
}

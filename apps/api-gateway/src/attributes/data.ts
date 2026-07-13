/**
 * Faz 1B (ADR-067) — Attribute katalog cekirdegi veri erisimi.
 *
 * Kategoriye-bagli dinamik urun ozelliklerinin KATALOG temeli. Bu modul yalniz TANIM
 * katmanidir: urun/varyant deger tablolari (ProductAttributeValue vb.) KAPSAM DISI.
 *
 * scope modeli (tek tablo AttributeDefinition):
 *  - PLATFORM: tum magazalar, storeId = null, yalniz SUPER_ADMIN yonetir.
 *  - STORE:    tek magaza, storeId zorunlu, ilgili store admin yonetir.
 * Bir magazanin "kullanabilecegi" tanimlar = kendi STORE tanimlari + tum PLATFORM
 * tanimlari (kategoriye baglamak icin). Duzenleme yalniz kendi STORE tanimlarinda.
 *
 * Davranis (required/filterable/... + validationRules) yalniz CategoryAttribute'ta
 * tutulur (tek sahip). AttributeDefinition davranis TASIMAZ. Kategori mirasi ve
 * overrideMode UYGULANMAZ (ADR-067 md.7, YAGNI).
 *
 * Ayri bir data-access modulu (customers/hero/campaigns deseni) → dev in-memory
 * AppDataAccess'e (health.test.ts) dokunmadan test edilebilir; DI ile enjekte edilir.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import {
  attributeDefinitionSchema,
  attributeGroupSchema,
  attributeOptionSchema,
  categoryAttributeSchema,
  type AttributeDataType,
  type AttributeScope,
  type AttributeStatus,
} from "@commerce-os/contracts";

// ─────────────────────────── Kayit tipleri ───────────────────────────
export interface AttributeDefinitionRecord {
  id: string;
  scope: AttributeScope;
  storeId: string | null;
  code: string;
  name: string;
  description: string | null;
  dataType: AttributeDataType;
  unit: string | null;
  status: AttributeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttributeGroupRecord {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttributeOptionRecord {
  id: string;
  attributeDefinitionId: string;
  storeId: string | null;
  value: string;
  label: string;
  colorHex: string | null;
  sortOrder: number;
  status: AttributeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryAttributeRecord {
  id: string;
  storeId: string;
  categoryId: string;
  attributeDefinitionId: string;
  groupId: string | null;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
  variantDefining: boolean;
  visibleOnProductPage: boolean;
  visibleOnListing: boolean;
  displayOrder: number;
  validationRules: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────── Girdi tipleri ───────────────────────────
export interface AttributeDefinitionCreateInput {
  scope: AttributeScope;
  storeId: string | null;
  code: string;
  name: string;
  description?: string | null;
  dataType: AttributeDataType;
  unit?: string | null;
  status: AttributeStatus;
}

export interface AttributeDefinitionUpdateInput {
  name?: string;
  description?: string | null;
  dataType?: AttributeDataType;
  unit?: string | null;
  status?: AttributeStatus;
}

export interface AttributeGroupCreateInput {
  name: string;
  description?: string | null;
  sortOrder: number;
}

export interface AttributeGroupUpdateInput {
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface AttributeOptionCreateInput {
  attributeDefinitionId: string;
  storeId: string | null;
  value: string;
  label: string;
  colorHex?: string | null;
  sortOrder: number;
  status: AttributeStatus;
}

export interface AttributeOptionUpdateInput {
  label?: string;
  colorHex?: string | null;
  sortOrder?: number;
  status?: AttributeStatus;
}

export interface CategoryAttributeCreateInput {
  attributeDefinitionId: string;
  groupId?: string | null;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
  variantDefining: boolean;
  visibleOnProductPage: boolean;
  visibleOnListing: boolean;
  displayOrder: number;
  validationRules: Record<string, unknown>;
}

export interface CategoryAttributeUpdateInput {
  groupId?: string | null;
  required?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  comparable?: boolean;
  variantDefining?: boolean;
  visibleOnProductPage?: boolean;
  visibleOnListing?: boolean;
  displayOrder?: number;
  validationRules?: Record<string, unknown>;
}

// ─────────────────────────── select'ler ───────────────────────────
const definitionSelect = {
  id: true,
  scope: true,
  storeId: true,
  code: true,
  name: true,
  description: true,
  dataType: true,
  unit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttributeDefinitionSelect;

const groupSelect = {
  id: true,
  storeId: true,
  name: true,
  description: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttributeGroupSelect;

const optionSelect = {
  id: true,
  attributeDefinitionId: true,
  storeId: true,
  value: true,
  label: true,
  colorHex: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttributeOptionSelect;

const categoryAttributeSelect = {
  id: true,
  storeId: true,
  categoryId: true,
  attributeDefinitionId: true,
  groupId: true,
  required: true,
  filterable: true,
  searchable: true,
  comparable: true,
  variantDefining: true,
  visibleOnProductPage: true,
  visibleOnListing: true,
  displayOrder: true,
  validationRules: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategoryAttributeSelect;

/** ADR-067 md.7 — kategori mirasi/status kontrolu icin sade kategori projeksiyonu. */
export interface AttributeCategoryRef {
  id: string;
  status: "ACTIVE" | "ARCHIVED";
}

export interface AttributeDataAccess {
  // — AttributeDefinition —
  // Store'un KULLANABILECEGI tanimlar: kendi STORE tanimlari + tum PLATFORM tanimlari.
  listAttributeDefinitionsForStore(storeId: string): Promise<AttributeDefinitionRecord[]>;
  // Yalniz PLATFORM tanimlari (/admin/attributes).
  listPlatformAttributeDefinitions(): Promise<AttributeDefinitionRecord[]>;
  findAttributeDefinitionById(id: string): Promise<AttributeDefinitionRecord | null>;
  // Duplicate code kontrolu: scope+store kapsaminda ayni kod. PLATFORM icin storeId null.
  findAttributeDefinitionByCode(
    scope: AttributeScope,
    storeId: string | null,
    code: string,
  ): Promise<AttributeDefinitionRecord | null>;
  createAttributeDefinition(input: AttributeDefinitionCreateInput): Promise<AttributeDefinitionRecord>;
  updateAttributeDefinition(
    id: string,
    input: AttributeDefinitionUpdateInput,
  ): Promise<AttributeDefinitionRecord | null>;
  // dataType immutability icin: tanim "kullanimda mi"? (kategori baglantisi veya secenek)
  countAttributeDefinitionUsage(id: string): Promise<{ links: number; options: number }>;

  // — AttributeGroup (yalniz STORE) —
  listAttributeGroups(storeId: string): Promise<AttributeGroupRecord[]>;
  findAttributeGroupById(storeId: string, id: string): Promise<AttributeGroupRecord | null>;
  createAttributeGroup(storeId: string, input: AttributeGroupCreateInput): Promise<AttributeGroupRecord>;
  updateAttributeGroup(
    storeId: string,
    id: string,
    input: AttributeGroupUpdateInput,
  ): Promise<AttributeGroupRecord | null>;

  // — AttributeOption —
  listAttributeOptions(attributeDefinitionId: string): Promise<AttributeOptionRecord[]>;
  findAttributeOptionById(
    attributeDefinitionId: string,
    id: string,
  ): Promise<AttributeOptionRecord | null>;
  findAttributeOptionByValue(
    attributeDefinitionId: string,
    value: string,
  ): Promise<AttributeOptionRecord | null>;
  createAttributeOption(input: AttributeOptionCreateInput): Promise<AttributeOptionRecord>;
  updateAttributeOption(
    attributeDefinitionId: string,
    id: string,
    input: AttributeOptionUpdateInput,
  ): Promise<AttributeOptionRecord | null>;

  // — CategoryAttribute (yalniz STORE) —
  listCategoryAttributes(storeId: string, categoryId: string): Promise<CategoryAttributeRecord[]>;
  findCategoryAttributeById(storeId: string, id: string): Promise<CategoryAttributeRecord | null>;
  findCategoryAttributeLink(
    categoryId: string,
    attributeDefinitionId: string,
  ): Promise<CategoryAttributeRecord | null>;
  createCategoryAttribute(
    storeId: string,
    categoryId: string,
    input: CategoryAttributeCreateInput,
  ): Promise<CategoryAttributeRecord>;
  updateCategoryAttribute(
    storeId: string,
    id: string,
    input: CategoryAttributeUpdateInput,
  ): Promise<CategoryAttributeRecord | null>;
  deleteCategoryAttribute(storeId: string, id: string): Promise<boolean>;

  // — yardimci lookuplar —
  // Kategori arsivli mi / var mi (archived-category reddi + tenant izolasyonu).
  findCategoryForStore(storeId: string, categoryId: string): Promise<AttributeCategoryRef | null>;
}

export function createPrismaAttributeDataAccess(): AttributeDataAccess {
  return {
    listAttributeDefinitionsForStore: (storeId) =>
      prisma.attributeDefinition.findMany({
        // Kendi STORE tanimlari + tum PLATFORM tanimlari (linklenebilir havuz).
        where: { OR: [{ scope: "STORE", storeId }, { scope: "PLATFORM" }] },
        orderBy: [{ scope: "asc" }, { name: "asc" }],
        select: definitionSelect,
      }),
    listPlatformAttributeDefinitions: () =>
      prisma.attributeDefinition.findMany({
        where: { scope: "PLATFORM" },
        orderBy: { name: "asc" },
        select: definitionSelect,
      }),
    findAttributeDefinitionById: (id) =>
      prisma.attributeDefinition.findUnique({ where: { id }, select: definitionSelect }),
    findAttributeDefinitionByCode: (scope, storeId, code) =>
      prisma.attributeDefinition.findFirst({
        where: { scope, storeId: storeId ?? null, code },
        select: definitionSelect,
      }),
    createAttributeDefinition: (input) =>
      prisma.attributeDefinition.create({
        data: {
          scope: input.scope,
          storeId: input.storeId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          dataType: input.dataType,
          unit: input.unit ?? null,
          status: input.status,
        },
        select: definitionSelect,
      }),
    updateAttributeDefinition: async (id, input) => {
      try {
        return await prisma.attributeDefinition.update({
          where: { id },
          data: input,
          select: definitionSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
        throw error;
      }
    },
    countAttributeDefinitionUsage: async (id) => {
      const [links, options] = await Promise.all([
        prisma.categoryAttribute.count({ where: { attributeDefinitionId: id } }),
        prisma.attributeOption.count({ where: { attributeDefinitionId: id } }),
      ]);
      return { links, options };
    },

    listAttributeGroups: (storeId) =>
      prisma.attributeGroup.findMany({
        where: { storeId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: groupSelect,
      }),
    findAttributeGroupById: (storeId, id) =>
      prisma.attributeGroup.findFirst({ where: { id, storeId }, select: groupSelect }),
    createAttributeGroup: (storeId, input) =>
      prisma.attributeGroup.create({
        data: {
          storeId,
          name: input.name,
          description: input.description ?? null,
          sortOrder: input.sortOrder,
        },
        select: groupSelect,
      }),
    updateAttributeGroup: async (storeId, id, input) => {
      try {
        return await prisma.attributeGroup.update({
          where: { id, storeId },
          data: input,
          select: groupSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
        throw error;
      }
    },

    listAttributeOptions: (attributeDefinitionId) =>
      prisma.attributeOption.findMany({
        where: { attributeDefinitionId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: optionSelect,
      }),
    findAttributeOptionById: (attributeDefinitionId, id) =>
      prisma.attributeOption.findFirst({ where: { id, attributeDefinitionId }, select: optionSelect }),
    findAttributeOptionByValue: (attributeDefinitionId, value) =>
      prisma.attributeOption.findFirst({ where: { attributeDefinitionId, value }, select: optionSelect }),
    createAttributeOption: (input) =>
      prisma.attributeOption.create({
        data: {
          attributeDefinitionId: input.attributeDefinitionId,
          storeId: input.storeId,
          value: input.value,
          label: input.label,
          colorHex: input.colorHex ?? null,
          sortOrder: input.sortOrder,
          status: input.status,
        },
        select: optionSelect,
      }),
    updateAttributeOption: async (attributeDefinitionId, id, input) => {
      try {
        // Once tanim kapsamli varligi dogrula (id PK; update where'de tanim filtresi
        // yok — o yuzden onceden findFirst yerine burada tenant/kapsam route'ta).
        const existing = await prisma.attributeOption.findFirst({
          where: { id, attributeDefinitionId },
          select: { id: true },
        });
        if (!existing) return null;
        return await prisma.attributeOption.update({ where: { id }, data: input, select: optionSelect });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
        throw error;
      }
    },

    listCategoryAttributes: (storeId, categoryId) =>
      prisma.categoryAttribute.findMany({
        where: { storeId, categoryId },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: categoryAttributeSelect,
      }),
    findCategoryAttributeById: (storeId, id) =>
      prisma.categoryAttribute.findFirst({ where: { id, storeId }, select: categoryAttributeSelect }),
    findCategoryAttributeLink: (categoryId, attributeDefinitionId) =>
      prisma.categoryAttribute.findFirst({
        where: { categoryId, attributeDefinitionId },
        select: categoryAttributeSelect,
      }),
    createCategoryAttribute: (storeId, categoryId, input) =>
      prisma.categoryAttribute.create({
        data: {
          storeId,
          categoryId,
          attributeDefinitionId: input.attributeDefinitionId,
          groupId: input.groupId ?? null,
          required: input.required,
          filterable: input.filterable,
          searchable: input.searchable,
          comparable: input.comparable,
          variantDefining: input.variantDefining,
          visibleOnProductPage: input.visibleOnProductPage,
          visibleOnListing: input.visibleOnListing,
          displayOrder: input.displayOrder,
          validationRules: input.validationRules as Prisma.InputJsonValue,
        },
        select: categoryAttributeSelect,
      }),
    updateCategoryAttribute: async (storeId, id, input) => {
      try {
        const existing = await prisma.categoryAttribute.findFirst({
          where: { id, storeId },
          select: { id: true },
        });
        if (!existing) return null;
        const { validationRules, ...rest } = input;
        return await prisma.categoryAttribute.update({
          where: { id },
          data: {
            ...rest,
            ...(validationRules === undefined
              ? {}
              : { validationRules: validationRules as Prisma.InputJsonValue }),
          },
          select: categoryAttributeSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
        throw error;
      }
    },
    deleteCategoryAttribute: async (storeId, id) => {
      try {
        await prisma.categoryAttribute.delete({ where: { id, storeId } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
        throw error;
      }
    },

    findCategoryForStore: (storeId, categoryId) =>
      prisma.productCategory.findFirst({
        where: { id: categoryId, storeId },
        select: { id: true, status: true },
      }),
  };
}

// ─────────────────────────── serialize'lar ───────────────────────────
export function serializeAttributeDefinition(record: AttributeDefinitionRecord) {
  return attributeDefinitionSchema.parse({
    id: record.id,
    scope: record.scope,
    storeId: record.storeId,
    code: record.code,
    name: record.name,
    description: record.description,
    dataType: record.dataType,
    unit: record.unit,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeAttributeGroup(record: AttributeGroupRecord) {
  return attributeGroupSchema.parse({
    id: record.id,
    storeId: record.storeId,
    name: record.name,
    description: record.description,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeAttributeOption(record: AttributeOptionRecord) {
  return attributeOptionSchema.parse({
    id: record.id,
    attributeDefinitionId: record.attributeDefinitionId,
    storeId: record.storeId,
    value: record.value,
    label: record.label,
    colorHex: record.colorHex,
    sortOrder: record.sortOrder,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function serializeCategoryAttribute(record: CategoryAttributeRecord) {
  return categoryAttributeSchema.parse({
    id: record.id,
    storeId: record.storeId,
    categoryId: record.categoryId,
    attributeDefinitionId: record.attributeDefinitionId,
    groupId: record.groupId,
    required: record.required,
    filterable: record.filterable,
    searchable: record.searchable,
    comparable: record.comparable,
    variantDefining: record.variantDefining,
    visibleOnProductPage: record.visibleOnProductPage,
    visibleOnListing: record.visibleOnListing,
    displayOrder: record.displayOrder,
    // validationRules DB'de JSONB; contract jsonRecordSchema (record) bekler.
    validationRules: (record.validationRules ?? {}) as Record<string, unknown>,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

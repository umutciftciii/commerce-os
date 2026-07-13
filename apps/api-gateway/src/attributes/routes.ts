/**
 * Faz 1B (ADR-067) — Attribute katalog cekirdegi HTTP uclari.
 *
 * Iki yetki duzlemi:
 *  - STORE:    requireStoreAdmin (platform admin + store scope). /stores/:storeId/...
 *              Store yalniz KENDI STORE tanimlarini duzenler; PLATFORM tanimlarini
 *              yalniz OKUR (kategoriye baglamak icin). storeId route param'dan turer.
 *  - PLATFORM: requireSuperAdmin (yalniz SUPER_ADMIN). /admin/attributes/...
 *              scope=PLATFORM, storeId=null. Store admin bu uclara erisemez.
 *
 * Immutability:
 *  - code her zaman immutable (farkli deger → 400 ATTRIBUTE_CODE_IMMUTABLE).
 *  - dataType yalniz "kullanim baslamissa" immutable (kategori baglantisi VEYA secenek
 *    varsa) → 400 ATTRIBUTE_DATATYPE_IMMUTABLE; kullanilmiyorsa degistirilebilir.
 * Duplicate:
 *  - code: scope+store kapsaminda route on-kontrolu + DB unique ([storeId, code]) → 409.
 *  - option value: DB unique ([attributeDefinitionId, value]) + route on-kontrolu → 409.
 * Davranis (required/filterable/...) yalniz CategoryAttribute'ta. Kategori mirasi YOK.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  attributeDefinitionCreateRequestSchema,
  attributeDefinitionListResponseSchema,
  attributeDefinitionUpdateRequestSchema,
  attributeGroupCreateRequestSchema,
  attributeGroupListResponseSchema,
  attributeGroupUpdateRequestSchema,
  attributeOptionCreateRequestSchema,
  attributeOptionListResponseSchema,
  attributeOptionUpdateRequestSchema,
  categoryAttributeCreateRequestSchema,
  categoryAttributeListResponseSchema,
  categoryAttributeUpdateRequestSchema,
  type AttributeDataType,
} from "@commerce-os/contracts";
import { Prisma } from "@prisma/client";
import {
  serializeAttributeDefinition,
  serializeAttributeGroup,
  serializeAttributeOption,
  serializeCategoryAttribute,
  type AttributeDataAccess,
  type AttributeDefinitionRecord,
} from "./data.js";

type Actor = { actorUserId: string };

export interface StoreAttributeRoutesDeps {
  dataAccess: AttributeDataAccess;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<Actor | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export interface PlatformAttributeRoutesDeps {
  dataAccess: AttributeDataAccess;
  requireSuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<Actor | null>;
  recordAudit: StoreAttributeRoutesDeps["recordAudit"];
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

// SELECT/MULTI_SELECT/COLOR disindaki tipler secenek TASIMAZ.
const OPTION_DATA_TYPES = new Set<AttributeDataType>(["SELECT", "MULTI_SELECT", "COLOR"]);

const storeParam = z.object({ storeId: z.string().min(1) });
const attributeParam = z.object({ storeId: z.string().min(1), attributeId: z.string().min(1) });
const optionParam = z.object({
  storeId: z.string().min(1),
  attributeId: z.string().min(1),
  optionId: z.string().min(1),
});
const groupParam = z.object({ storeId: z.string().min(1), groupId: z.string().min(1) });
const categoryParam = z.object({ storeId: z.string().min(1), categoryId: z.string().min(1) });
const categoryLinkParam = z.object({
  storeId: z.string().min(1),
  categoryId: z.string().min(1),
  categoryAttributeId: z.string().min(1),
});
const platformAttributeParam = z.object({ attributeId: z.string().min(1) });
const platformOptionParam = z.object({
  attributeId: z.string().min(1),
  optionId: z.string().min(1),
});

// ─── immutability guard: code + dataType (kullanim baslamissa) ───
// Donen deger: gecerliyse yazilacak {name/description/dataType/unit/status} kismi;
// gecersizse reply gonderilmis + null (route hemen return eder).
async function resolveDefinitionUpdate(
  dataAccess: AttributeDataAccess,
  reply: FastifyReply,
  current: AttributeDefinitionRecord,
  input: {
    code?: string;
    name?: string;
    description?: string | null;
    dataType?: AttributeDataType;
    unit?: string | null;
    status?: "ACTIVE" | "ARCHIVED";
  },
): Promise<{
  name?: string;
  description?: string | null;
  dataType?: AttributeDataType;
  unit?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
} | null> {
  // code immutable: farkli deger reddedilir; ayni deger no-op (echo eden istemci kirilmaz).
  if (input.code !== undefined && input.code !== current.code) {
    await reply
      .code(400)
      .send(errorBody("ATTRIBUTE_CODE_IMMUTABLE", "Attribute code cannot be changed."));
    return null;
  }
  // dataType: farkliysa yalniz kullanim baslamamissa (link/secenek yok) izin verilir.
  if (input.dataType !== undefined && input.dataType !== current.dataType) {
    const usage = await dataAccess.countAttributeDefinitionUsage(current.id);
    if (usage.links > 0 || usage.options > 0) {
      await reply
        .code(400)
        .send(
          errorBody(
            "ATTRIBUTE_DATATYPE_IMMUTABLE",
            "Attribute data type cannot be changed once the attribute is in use.",
          ),
        );
      return null;
    }
  }
  // code cikarilir (asla yazilmaz); geri kalan alanlar aynen gecer.
  const { code: _code, ...rest } = input;
  void _code;
  return rest;
}

// ─────────────────────────── STORE routes ───────────────────────────
export function registerStoreAttributeRoutes(app: FastifyInstance, deps: StoreAttributeRoutesDeps) {
  const { dataAccess, requireStoreAdmin, recordAudit } = deps;

  // Store'un duzenleyebilecegi (kendi STORE) tanim mi? Degilse reply gonder + null.
  async function requireEditableStoreDefinition(
    reply: FastifyReply,
    storeId: string,
    attributeId: string,
  ): Promise<AttributeDefinitionRecord | null> {
    const definition = await dataAccess.findAttributeDefinitionById(attributeId);
    if (!definition || definition.scope !== "STORE" || definition.storeId !== storeId) {
      await reply.code(404).send(errorBody("ATTRIBUTE_NOT_FOUND", "Attribute not found."));
      return null;
    }
    return definition;
  }

  // Store'un OKUYABILECEGI (kendi STORE veya PLATFORM) tanim mi? Degilse reply + null.
  async function requireReadableStoreDefinition(
    reply: FastifyReply,
    storeId: string,
    attributeId: string,
  ): Promise<AttributeDefinitionRecord | null> {
    const definition = await dataAccess.findAttributeDefinitionById(attributeId);
    const readable =
      definition &&
      (definition.scope === "PLATFORM" ||
        (definition.scope === "STORE" && definition.storeId === storeId));
    if (!readable) {
      await reply.code(404).send(errorBody("ATTRIBUTE_NOT_FOUND", "Attribute not found."));
      return null;
    }
    return definition;
  }

  app.get("/stores/:storeId/attributes", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const rows = await dataAccess.listAttributeDefinitionsForStore(params.storeId);
    return attributeDefinitionListResponseSchema.parse({
      data: rows.map(serializeAttributeDefinition),
    });
  });

  app.post("/stores/:storeId/attributes", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = attributeDefinitionCreateRequestSchema.parse(request.body);
    if (await dataAccess.findAttributeDefinitionByCode("STORE", params.storeId, input.code)) {
      return reply.code(409).send(errorBody("ATTRIBUTE_CODE_EXISTS", "Attribute code already exists."));
    }
    let record: AttributeDefinitionRecord;
    try {
      record = await dataAccess.createAttributeDefinition({
        scope: "STORE",
        storeId: params.storeId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        dataType: input.dataType,
        unit: input.unit ?? null,
        status: input.status,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send(errorBody("ATTRIBUTE_CODE_EXISTS", "Attribute code already exists."));
      }
      throw error;
    }
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "AttributeDefinition",
      entityId: record.id,
      metadata: { scope: "STORE", code: record.code, dataType: record.dataType },
    });
    return reply.code(201).send(serializeAttributeDefinition(record));
  });

  app.get("/stores/:storeId/attributes/:attributeId", async (request, reply) => {
    const params = attributeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const definition = await requireReadableStoreDefinition(reply, params.storeId, params.attributeId);
    if (!definition) return;
    return serializeAttributeDefinition(definition);
  });

  app.patch("/stores/:storeId/attributes/:attributeId", async (request, reply) => {
    const params = attributeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const current = await requireEditableStoreDefinition(reply, params.storeId, params.attributeId);
    if (!current) return;
    const input = attributeDefinitionUpdateRequestSchema.parse(request.body);
    const data = await resolveDefinitionUpdate(dataAccess, reply, current, input);
    if (!data) return;
    const record = await dataAccess.updateAttributeDefinition(params.attributeId, data);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_NOT_FOUND", "Attribute not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "AttributeDefinition",
      entityId: record.id,
      metadata: { fields: Object.keys(data) },
    });
    return serializeAttributeDefinition(record);
  });

  // — options (yalniz STORE-own tanimlar; okuma da STORE-own icin — PLATFORM secenekleri
  //   platform ucundan yonetilir) —
  app.get("/stores/:storeId/attributes/:attributeId/options", async (request, reply) => {
    const params = attributeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    // Okuma READABLE (STORE-own veya PLATFORM) tanimlar icin acik — UI linkleme
    // ekraninda PLATFORM SELECT seceneklerini de gostermek gerekir.
    const definition = await requireReadableStoreDefinition(reply, params.storeId, params.attributeId);
    if (!definition) return;
    const rows = await dataAccess.listAttributeOptions(definition.id);
    return attributeOptionListResponseSchema.parse({ data: rows.map(serializeAttributeOption) });
  });

  app.post("/stores/:storeId/attributes/:attributeId/options", async (request, reply) => {
    const params = attributeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    // Yazma yalniz STORE-own tanim: store PLATFORM tanimina secenek EKLEYEMEZ.
    const definition = await requireEditableStoreDefinition(reply, params.storeId, params.attributeId);
    if (!definition) return;
    if (!OPTION_DATA_TYPES.has(definition.dataType)) {
      return reply
        .code(400)
        .send(errorBody("ATTRIBUTE_OPTIONS_NOT_SUPPORTED", "This attribute data type does not support options."));
    }
    const input = attributeOptionCreateRequestSchema.parse(request.body);
    if (await dataAccess.findAttributeOptionByValue(definition.id, input.value)) {
      return reply.code(409).send(errorBody("ATTRIBUTE_OPTION_VALUE_EXISTS", "Option value already exists."));
    }
    try {
      const record = await dataAccess.createAttributeOption({
        attributeDefinitionId: definition.id,
        storeId: params.storeId,
        value: input.value,
        label: input.label,
        colorHex: input.colorHex ?? null,
        sortOrder: input.sortOrder,
        status: input.status,
      });
      await recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "AttributeOption",
        entityId: record.id,
        metadata: { attributeDefinitionId: definition.id, value: record.value },
      });
      return reply.code(201).send(serializeAttributeOption(record));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send(errorBody("ATTRIBUTE_OPTION_VALUE_EXISTS", "Option value already exists."));
      }
      throw error;
    }
  });

  app.patch("/stores/:storeId/attributes/:attributeId/options/:optionId", async (request, reply) => {
    const params = optionParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const definition = await requireEditableStoreDefinition(reply, params.storeId, params.attributeId);
    if (!definition) return;
    const input = attributeOptionUpdateRequestSchema.parse(request.body);
    const record = await dataAccess.updateAttributeOption(definition.id, params.optionId, input);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_OPTION_NOT_FOUND", "Option not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "AttributeOption",
      entityId: record.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeAttributeOption(record);
  });

  // — attribute groups (yalniz STORE) —
  app.get("/stores/:storeId/attribute-groups", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const rows = await dataAccess.listAttributeGroups(params.storeId);
    return attributeGroupListResponseSchema.parse({ data: rows.map(serializeAttributeGroup) });
  });

  app.post("/stores/:storeId/attribute-groups", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = attributeGroupCreateRequestSchema.parse(request.body);
    const record = await dataAccess.createAttributeGroup(params.storeId, {
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
    });
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "AttributeGroup",
      entityId: record.id,
      metadata: { name: record.name },
    });
    return reply.code(201).send(serializeAttributeGroup(record));
  });

  app.get("/stores/:storeId/attribute-groups/:groupId", async (request, reply) => {
    const params = groupParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const record = await dataAccess.findAttributeGroupById(params.storeId, params.groupId);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_GROUP_NOT_FOUND", "Group not found."));
    return serializeAttributeGroup(record);
  });

  app.patch("/stores/:storeId/attribute-groups/:groupId", async (request, reply) => {
    const params = groupParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = attributeGroupUpdateRequestSchema.parse(request.body);
    const record = await dataAccess.updateAttributeGroup(params.storeId, params.groupId, input);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_GROUP_NOT_FOUND", "Group not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "AttributeGroup",
      entityId: record.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeAttributeGroup(record);
  });

  // — category attributes (davranis tek sahibi) —
  app.get("/stores/:storeId/categories/:categoryId/attributes", async (request, reply) => {
    const params = categoryParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const category = await dataAccess.findCategoryForStore(params.storeId, params.categoryId);
    if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
    const rows = await dataAccess.listCategoryAttributes(params.storeId, params.categoryId);
    return categoryAttributeListResponseSchema.parse({ data: rows.map(serializeCategoryAttribute) });
  });

  app.post("/stores/:storeId/categories/:categoryId/attributes", async (request, reply) => {
    const params = categoryParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    // Kategori var + arsivli degil (archived-category reddi).
    const category = await dataAccess.findCategoryForStore(params.storeId, params.categoryId);
    if (!category) return reply.code(404).send(errorBody("CATEGORY_NOT_FOUND", "Category not found."));
    if (category.status === "ARCHIVED") {
      return reply.code(400).send(errorBody("CATEGORY_ARCHIVED", "Cannot attach attributes to an archived category."));
    }
    const input = categoryAttributeCreateRequestSchema.parse(request.body);
    // Attribute erisilebilir (STORE-own veya PLATFORM) + arsivli degil (archived-attribute reddi).
    const definition = await requireReadableStoreDefinition(reply, params.storeId, input.attributeDefinitionId);
    if (!definition) return;
    if (definition.status === "ARCHIVED") {
      return reply.code(400).send(errorBody("ATTRIBUTE_ARCHIVED", "Cannot attach an archived attribute."));
    }
    // group (verildiyse) ayni store'a ait olmali.
    if (input.groupId != null && !(await dataAccess.findAttributeGroupById(params.storeId, input.groupId))) {
      return reply.code(400).send(errorBody("ATTRIBUTE_GROUP_NOT_FOUND", "Group not found."));
    }
    // Bir attribute bir kategoriye en fazla bir kez baglanir.
    if (await dataAccess.findCategoryAttributeLink(params.categoryId, definition.id)) {
      return reply
        .code(409)
        .send(errorBody("CATEGORY_ATTRIBUTE_EXISTS", "Attribute already attached to this category."));
    }
    try {
      const record = await dataAccess.createCategoryAttribute(params.storeId, params.categoryId, {
        attributeDefinitionId: definition.id,
        groupId: input.groupId ?? null,
        required: input.required,
        filterable: input.filterable,
        searchable: input.searchable,
        comparable: input.comparable,
        variantDefining: input.variantDefining,
        visibleOnProductPage: input.visibleOnProductPage,
        visibleOnListing: input.visibleOnListing,
        displayOrder: input.displayOrder,
        validationRules: input.validationRules,
      });
      await recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "CategoryAttribute",
        entityId: record.id,
        metadata: { categoryId: params.categoryId, attributeDefinitionId: definition.id },
      });
      return reply.code(201).send(serializeCategoryAttribute(record));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply
          .code(409)
          .send(errorBody("CATEGORY_ATTRIBUTE_EXISTS", "Attribute already attached to this category."));
      }
      throw error;
    }
  });

  app.patch(
    "/stores/:storeId/categories/:categoryId/attributes/:categoryAttributeId",
    async (request, reply) => {
      const params = categoryLinkParam.parse(request.params);
      const access = await requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const input = categoryAttributeUpdateRequestSchema.parse(request.body);
      if (input.groupId != null && !(await dataAccess.findAttributeGroupById(params.storeId, input.groupId))) {
        return reply.code(400).send(errorBody("ATTRIBUTE_GROUP_NOT_FOUND", "Group not found."));
      }
      const record = await dataAccess.updateCategoryAttribute(params.storeId, params.categoryAttributeId, input);
      if (!record) {
        return reply
          .code(404)
          .send(errorBody("CATEGORY_ATTRIBUTE_NOT_FOUND", "Category attribute not found."));
      }
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "CategoryAttribute",
        entityId: record.id,
        metadata: { fields: Object.keys(input) },
      });
      return serializeCategoryAttribute(record);
    },
  );

  app.delete(
    "/stores/:storeId/categories/:categoryId/attributes/:categoryAttributeId",
    async (request, reply) => {
      const params = categoryLinkParam.parse(request.params);
      const access = await requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const deleted = await dataAccess.deleteCategoryAttribute(params.storeId, params.categoryAttributeId);
      if (!deleted) {
        return reply
          .code(404)
          .send(errorBody("CATEGORY_ATTRIBUTE_NOT_FOUND", "Category attribute not found."));
      }
      await recordAudit({
        action: "DELETE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "CategoryAttribute",
        entityId: params.categoryAttributeId,
      });
      return reply.code(204).send();
    },
  );
}

// ─────────────────────────── PLATFORM routes (SUPER_ADMIN) ───────────────────────────
export function registerPlatformAttributeRoutes(app: FastifyInstance, deps: PlatformAttributeRoutesDeps) {
  const { dataAccess, requireSuperAdmin, recordAudit } = deps;

  async function requirePlatformDefinition(
    reply: FastifyReply,
    attributeId: string,
  ): Promise<AttributeDefinitionRecord | null> {
    const definition = await dataAccess.findAttributeDefinitionById(attributeId);
    if (!definition || definition.scope !== "PLATFORM") {
      await reply.code(404).send(errorBody("ATTRIBUTE_NOT_FOUND", "Attribute not found."));
      return null;
    }
    return definition;
  }

  app.get("/admin/attributes", async (request, reply) => {
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const rows = await dataAccess.listPlatformAttributeDefinitions();
    return attributeDefinitionListResponseSchema.parse({ data: rows.map(serializeAttributeDefinition) });
  });

  app.post("/admin/attributes", async (request, reply) => {
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const input = attributeDefinitionCreateRequestSchema.parse(request.body);
    if (await dataAccess.findAttributeDefinitionByCode("PLATFORM", null, input.code)) {
      return reply.code(409).send(errorBody("ATTRIBUTE_CODE_EXISTS", "Attribute code already exists."));
    }
    let record: AttributeDefinitionRecord;
    try {
      record = await dataAccess.createAttributeDefinition({
        scope: "PLATFORM",
        storeId: null,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        dataType: input.dataType,
        unit: input.unit ?? null,
        status: input.status,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send(errorBody("ATTRIBUTE_CODE_EXISTS", "Attribute code already exists."));
      }
      throw error;
    }
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      entityType: "AttributeDefinition",
      entityId: record.id,
      metadata: { scope: "PLATFORM", code: record.code, dataType: record.dataType },
    });
    return reply.code(201).send(serializeAttributeDefinition(record));
  });

  app.get("/admin/attributes/:attributeId", async (request, reply) => {
    const params = platformAttributeParam.parse(request.params);
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const definition = await requirePlatformDefinition(reply, params.attributeId);
    if (!definition) return;
    return serializeAttributeDefinition(definition);
  });

  app.patch("/admin/attributes/:attributeId", async (request, reply) => {
    const params = platformAttributeParam.parse(request.params);
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const current = await requirePlatformDefinition(reply, params.attributeId);
    if (!current) return;
    const input = attributeDefinitionUpdateRequestSchema.parse(request.body);
    const data = await resolveDefinitionUpdate(dataAccess, reply, current, input);
    if (!data) return;
    const record = await dataAccess.updateAttributeDefinition(params.attributeId, data);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_NOT_FOUND", "Attribute not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "AttributeDefinition",
      entityId: record.id,
      metadata: { fields: Object.keys(data) },
    });
    return serializeAttributeDefinition(record);
  });

  app.get("/admin/attributes/:attributeId/options", async (request, reply) => {
    const params = platformAttributeParam.parse(request.params);
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const definition = await requirePlatformDefinition(reply, params.attributeId);
    if (!definition) return;
    const rows = await dataAccess.listAttributeOptions(definition.id);
    return attributeOptionListResponseSchema.parse({ data: rows.map(serializeAttributeOption) });
  });

  app.post("/admin/attributes/:attributeId/options", async (request, reply) => {
    const params = platformAttributeParam.parse(request.params);
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const definition = await requirePlatformDefinition(reply, params.attributeId);
    if (!definition) return;
    if (!OPTION_DATA_TYPES.has(definition.dataType)) {
      return reply
        .code(400)
        .send(errorBody("ATTRIBUTE_OPTIONS_NOT_SUPPORTED", "This attribute data type does not support options."));
    }
    const input = attributeOptionCreateRequestSchema.parse(request.body);
    if (await dataAccess.findAttributeOptionByValue(definition.id, input.value)) {
      return reply.code(409).send(errorBody("ATTRIBUTE_OPTION_VALUE_EXISTS", "Option value already exists."));
    }
    try {
      const record = await dataAccess.createAttributeOption({
        attributeDefinitionId: definition.id,
        storeId: null, // PLATFORM secenegi store'a bagli degil.
        value: input.value,
        label: input.label,
        colorHex: input.colorHex ?? null,
        sortOrder: input.sortOrder,
        status: input.status,
      });
      await recordAudit({
        action: "CREATE",
        platformUserId: access.actorUserId,
        entityType: "AttributeOption",
        entityId: record.id,
        metadata: { attributeDefinitionId: definition.id, value: record.value },
      });
      return reply.code(201).send(serializeAttributeOption(record));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send(errorBody("ATTRIBUTE_OPTION_VALUE_EXISTS", "Option value already exists."));
      }
      throw error;
    }
  });

  app.patch("/admin/attributes/:attributeId/options/:optionId", async (request, reply) => {
    const params = platformOptionParam.parse(request.params);
    const access = await requireSuperAdmin(request, reply);
    if (!access) return;
    const definition = await requirePlatformDefinition(reply, params.attributeId);
    if (!definition) return;
    const input = attributeOptionUpdateRequestSchema.parse(request.body);
    const record = await dataAccess.updateAttributeOption(definition.id, params.optionId, input);
    if (!record) return reply.code(404).send(errorBody("ATTRIBUTE_OPTION_NOT_FOUND", "Option not found."));
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      entityType: "AttributeOption",
      entityId: record.id,
      metadata: { fields: Object.keys(input) },
    });
    return serializeAttributeOption(record);
  });
}

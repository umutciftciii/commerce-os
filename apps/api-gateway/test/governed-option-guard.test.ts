// TODO-165A (ADR-165A) — Task 8: governed-option mutation guard tests.
//  1) assertOptionNotGoverned as a pure function (plain objects, no DB).
//  2) route-level: generic AttributeOption PATCH (rename/archive/reorder — the only generic
//     option mutation surface; there is no separate delete/reorder endpoint, see report)
//     against a governed option -> 409 ATTRIBUTE_OPTION_GOVERNED; same op on a non-governed
//     option still succeeds. Covers both the STORE-scoped and PLATFORM-scoped routes.
import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function attachErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    throw error;
  });
}

// attributes/data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma init'ini
// engellemek icin bos stub yeter (dataAccess in-memory obje olarak geciriliyor).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerStoreAttributeRoutes, registerPlatformAttributeRoutes } = await import(
  "../src/attributes/routes.js"
);
const { assertOptionNotGoverned, AttributeOptionGovernedError, ATTRIBUTE_OPTION_GOVERNED } = await import(
  "../src/taxonomy/option-resolver.js"
);
import type {
  AttributeDataAccess,
  AttributeDefinitionRecord,
  AttributeGroupRecord,
  AttributeOptionRecord,
  CategoryAttributeRecord,
  AttributeCategoryRef,
} from "../src/attributes/data.js";

// ─────────────────────────── Part 1: pure assertOptionNotGoverned ───────────────────────────
describe("assertOptionNotGoverned — pure function", () => {
  it("throws AttributeOptionGovernedError (code ATTRIBUTE_OPTION_GOVERNED) when taxonomyValue is non-null", () => {
    expect(() => assertOptionNotGoverned({ id: "opt_1", taxonomyValue: { id: "tv_1" } })).toThrow(
      AttributeOptionGovernedError,
    );
    try {
      assertOptionNotGoverned({ id: "opt_1", taxonomyValue: { id: "tv_1" } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AttributeOptionGovernedError);
      expect((error as InstanceType<typeof AttributeOptionGovernedError>).code).toBe(
        ATTRIBUTE_OPTION_GOVERNED,
      );
    }
  });

  it("does not throw when taxonomyValue is null", () => {
    expect(() => assertOptionNotGoverned({ id: "opt_2", taxonomyValue: null })).not.toThrow();
  });

  it("does not throw when taxonomyValue is undefined (field omitted)", () => {
    expect(() => assertOptionNotGoverned({ id: "opt_3" })).not.toThrow();
  });
});

// ─────────────────────────── Part 2: route-level guard wiring ───────────────────────────
// Ayni MemoryAttributes deseni (attributes.test.ts) — governedOptionIds ile hangi option'in
// governed oldugunu isaretler; findAttributeOptionGovernance bunu okur.
class MemoryAttributes implements AttributeDataAccess {
  defs: AttributeDefinitionRecord[] = [];
  groups: AttributeGroupRecord[] = [];
  options: AttributeOptionRecord[] = [];
  links: CategoryAttributeRecord[] = [];
  categories: AttributeCategoryRef[] = [];
  governedOptionIds: Map<string, string> = new Map();
  private seq = 0;
  private id(p: string) {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }
  private now() {
    return new Date("2026-08-01T00:00:00.000Z");
  }

  async listAttributeDefinitionsForStore(storeId: string) {
    return this.defs.filter((d) => d.scope === "PLATFORM" || (d.scope === "STORE" && d.storeId === storeId));
  }
  async listPlatformAttributeDefinitions() {
    return this.defs.filter((d) => d.scope === "PLATFORM");
  }
  async findAttributeDefinitionById(id: string) {
    return this.defs.find((d) => d.id === id) ?? null;
  }
  async findAttributeDefinitionByCode(scope: "PLATFORM" | "STORE", storeId: string | null, code: string) {
    return (
      this.defs.find((d) => d.scope === scope && (d.storeId ?? null) === (storeId ?? null) && d.code === code) ??
      null
    );
  }
  async createAttributeDefinition(input: Parameters<AttributeDataAccess["createAttributeDefinition"]>[0]) {
    const rec: AttributeDefinitionRecord = {
      id: this.id("attr"),
      scope: input.scope,
      storeId: input.storeId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      dataType: input.dataType,
      unit: input.unit ?? null,
      status: input.status,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.defs.push(rec);
    return rec;
  }
  async updateAttributeDefinition(id: string, input: Parameters<AttributeDataAccess["updateAttributeDefinition"]>[1]) {
    const rec = this.defs.find((d) => d.id === id);
    if (!rec) return null;
    Object.assign(rec, input, { updatedAt: this.now() });
    return rec;
  }
  async countAttributeDefinitionUsage(id: string) {
    return {
      links: this.links.filter((l) => l.attributeDefinitionId === id).length,
      options: this.options.filter((o) => o.attributeDefinitionId === id).length,
    };
  }

  async listAttributeGroups(storeId: string) {
    return this.groups.filter((g) => g.storeId === storeId);
  }
  async findAttributeGroupById(storeId: string, id: string) {
    return this.groups.find((g) => g.id === id && g.storeId === storeId) ?? null;
  }
  async createAttributeGroup(storeId: string, input: Parameters<AttributeDataAccess["createAttributeGroup"]>[1]) {
    const rec: AttributeGroupRecord = {
      id: this.id("grp"),
      storeId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.groups.push(rec);
    return rec;
  }
  async updateAttributeGroup(storeId: string, id: string, input: Parameters<AttributeDataAccess["updateAttributeGroup"]>[2]) {
    const rec = this.groups.find((g) => g.id === id && g.storeId === storeId);
    if (!rec) return null;
    Object.assign(rec, input, { updatedAt: this.now() });
    return rec;
  }

  async listAttributeOptions(attributeDefinitionId: string) {
    return this.options.filter((o) => o.attributeDefinitionId === attributeDefinitionId);
  }
  async findAttributeOptionById(attributeDefinitionId: string, id: string) {
    return this.options.find((o) => o.id === id && o.attributeDefinitionId === attributeDefinitionId) ?? null;
  }
  async findAttributeOptionByValue(attributeDefinitionId: string, value: string) {
    return this.options.find((o) => o.attributeDefinitionId === attributeDefinitionId && o.value === value) ?? null;
  }
  async findAttributeOptionGovernance(attributeDefinitionId: string, id: string) {
    const rec = this.options.find((o) => o.id === id && o.attributeDefinitionId === attributeDefinitionId);
    if (!rec) return null;
    const taxonomyValueId = this.governedOptionIds.get(id);
    return { id: rec.id, taxonomyValue: taxonomyValueId ? { id: taxonomyValueId } : null };
  }
  async createAttributeOption(input: Parameters<AttributeDataAccess["createAttributeOption"]>[0]) {
    const rec: AttributeOptionRecord = {
      id: this.id("opt"),
      attributeDefinitionId: input.attributeDefinitionId,
      storeId: input.storeId,
      value: input.value,
      label: input.label,
      colorHex: input.colorHex ?? null,
      sortOrder: input.sortOrder,
      status: input.status,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.options.push(rec);
    return rec;
  }
  async updateAttributeOption(attributeDefinitionId: string, id: string, input: Parameters<AttributeDataAccess["updateAttributeOption"]>[2]) {
    const rec = this.options.find((o) => o.id === id && o.attributeDefinitionId === attributeDefinitionId);
    if (!rec) return null;
    Object.assign(rec, input, { updatedAt: this.now() });
    return rec;
  }

  async listCategoryAttributes(storeId: string, categoryId: string) {
    return this.links.filter((l) => l.storeId === storeId && l.categoryId === categoryId);
  }
  async findCategoryAttributeById(storeId: string, id: string) {
    return this.links.find((l) => l.id === id && l.storeId === storeId) ?? null;
  }
  async findCategoryAttributeLink(categoryId: string, attributeDefinitionId: string) {
    return this.links.find((l) => l.categoryId === categoryId && l.attributeDefinitionId === attributeDefinitionId) ?? null;
  }
  async createCategoryAttribute(storeId: string, categoryId: string, input: Parameters<AttributeDataAccess["createCategoryAttribute"]>[2]) {
    const rec: CategoryAttributeRecord = {
      id: this.id("catattr"),
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
      validationRules: input.validationRules,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.links.push(rec);
    return rec;
  }
  async updateCategoryAttribute(storeId: string, id: string, input: Parameters<AttributeDataAccess["updateCategoryAttribute"]>[2]) {
    const rec = this.links.find((l) => l.id === id && l.storeId === storeId);
    if (!rec) return null;
    Object.assign(rec, input, { updatedAt: this.now() });
    return rec;
  }
  async deleteCategoryAttribute(storeId: string, id: string) {
    const idx = this.links.findIndex((l) => l.id === id && l.storeId === storeId);
    if (idx === -1) return false;
    this.links.splice(idx, 1);
    return true;
  }

  async findCategoryForStore(storeId: string, categoryId: string) {
    return this.categories.find((c) => c.id === categoryId && (c as { storeId?: string }).storeId === storeId) ?? null;
  }
}

function buildStoreApp() {
  const dataAccess = new MemoryAttributes();
  const audits: Array<{ action: string; entityType: string; entityId?: string }> = [];
  const app = Fastify();
  attachErrorHandler(app);
  registerStoreAttributeRoutes(app, {
    dataAccess,
    requireStoreAdmin: async () => ({ actorUserId: "admin_1" }),
    recordAudit: async (input) => {
      audits.push({ action: input.action, entityType: input.entityType, entityId: input.entityId });
    },
  });
  return { app, dataAccess, audits };
}

function buildPlatformApp() {
  const dataAccess = new MemoryAttributes();
  const app = Fastify();
  attachErrorHandler(app);
  registerPlatformAttributeRoutes(app, {
    dataAccess,
    requireSuperAdmin: async () => ({ actorUserId: "super_1" }),
    recordAudit: async () => {},
  });
  return { app, dataAccess };
}

let ctx: ReturnType<typeof buildStoreApp> | undefined;
let platformCtx: ReturnType<typeof buildPlatformApp> | undefined;
afterEach(async () => {
  if (ctx?.app) await ctx.app.close();
  if (platformCtx?.app) await platformCtx.app.close();
  ctx = undefined;
  platformCtx = undefined;
});

describe("governed-option guard — STORE-scoped option PATCH", () => {
  beforeEach(async () => {
    ctx = buildStoreApp();
    await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/attributes",
      payload: { code: "season", name: "Season", dataType: "SELECT" },
    });
  });

  async function seedOption(governed: boolean) {
    const attr = ctx!.dataAccess.defs[0]!;
    const created = await ctx!.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${attr.id}/options`,
      payload: { value: "yaz", label: "Yaz" },
    });
    const option = created.json();
    if (governed) {
      ctx!.dataAccess.governedOptionIds.set(option.id, "tv_1");
    }
    return { attr, option };
  }

  it("rejects rename (label) of a governed option with 409 ATTRIBUTE_OPTION_GOVERNED", async () => {
    const { attr, option } = await seedOption(true);
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/${option.id}`,
      payload: { label: "Renamed" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTION_GOVERNED" } });
    // underlying record unchanged (mutation did NOT happen).
    expect(ctx!.dataAccess.options[0]!.label).toBe("Yaz");
  });

  it("rejects archive (status) of a governed option with 409", async () => {
    const { attr, option } = await seedOption(true);
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/${option.id}`,
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTION_GOVERNED" } });
  });

  it("rejects reorder (sortOrder) of a governed option with 409", async () => {
    const { attr, option } = await seedOption(true);
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/${option.id}`,
      payload: { sortOrder: 5 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTION_GOVERNED" } });
  });

  it("does NOT leak a raw Prisma/FK error — body is a clean typed 409 envelope", async () => {
    const { attr, option } = await seedOption(true);
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/${option.id}`,
      payload: { label: "x" },
    });
    const body = res.json();
    expect(body.error.code).toBe("ATTRIBUTE_OPTION_GOVERNED");
    expect(JSON.stringify(body)).not.toMatch(/Prisma|P2\d{3}|foreign key/i);
  });

  it("still allows rename/archive/reorder on a NON-governed option (200)", async () => {
    const { attr, option } = await seedOption(false);
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/${option.id}`,
      payload: { label: "Yaz Mevsimi", sortOrder: 3, status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ label: "Yaz Mevsimi", sortOrder: 3, status: "ARCHIVED" });
  });

  it("404s (not 409) when the option does not exist at all", async () => {
    const attr = ctx!.dataAccess.defs[0]!;
    const res = await ctx!.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${attr.id}/options/opt_missing`,
      payload: { label: "x" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("governed-option guard — PLATFORM-scoped option PATCH", () => {
  beforeEach(async () => {
    platformCtx = buildPlatformApp();
    await platformCtx.app.inject({
      method: "POST",
      url: "/admin/attributes",
      payload: { code: "material", name: "Material", dataType: "SELECT" },
    });
  });

  async function seedOption(governed: boolean) {
    const attr = platformCtx!.dataAccess.defs[0]!;
    const created = await platformCtx!.app.inject({
      method: "POST",
      url: `/admin/attributes/${attr.id}/options`,
      payload: { value: "pamuk", label: "Pamuk" },
    });
    const option = created.json();
    if (governed) {
      platformCtx!.dataAccess.governedOptionIds.set(option.id, "tv_2");
    }
    return { attr, option };
  }

  it("rejects mutation of a governed PLATFORM option with 409 ATTRIBUTE_OPTION_GOVERNED", async () => {
    const { attr, option } = await seedOption(true);
    const res = await platformCtx!.app.inject({
      method: "PATCH",
      url: `/admin/attributes/${attr.id}/options/${option.id}`,
      payload: { label: "Renamed" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTION_GOVERNED" } });
  });

  it("still allows mutation of a non-governed PLATFORM option (200)", async () => {
    const { attr, option } = await seedOption(false);
    const res = await platformCtx!.app.inject({
      method: "PATCH",
      url: `/admin/attributes/${attr.id}/options/${option.id}`,
      payload: { label: "Pamuk Beyaz" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ label: "Pamuk Beyaz" });
  });
});

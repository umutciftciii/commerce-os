import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// createServer'in ZodError→400 handler'inin izole karsiligi (gercek sunucu davranisi).
function attachErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    throw error;
  });
}

// attributes/data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma
// init'ini engellemek icin bos stub yeter (dataAccess'i in-memory obje olarak geciriyoruz,
// prisma hic cagrilmaz). hero-routes.test.ts deseni.
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { registerStoreAttributeRoutes, registerPlatformAttributeRoutes } = await import(
  "../src/attributes/routes.js"
);
import type {
  AttributeDataAccess,
  AttributeDefinitionRecord,
  AttributeGroupRecord,
  AttributeOptionRecord,
  CategoryAttributeRecord,
  AttributeCategoryRef,
} from "../src/attributes/data.js";

// ─── Gercek mantikli in-memory AttributeDataAccess (mock degil; create→duplicate→
//     immutability akislarini uctan uca dogrular) ───
class MemoryAttributes implements AttributeDataAccess {
  defs: AttributeDefinitionRecord[] = [];
  groups: AttributeGroupRecord[] = [];
  options: AttributeOptionRecord[] = [];
  links: CategoryAttributeRecord[] = [];
  categories: AttributeCategoryRef[] = [];
  private seq = 0;
  private id(p: string) {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }
  private now() {
    return new Date("2026-07-14T00:00:00.000Z");
  }

  async listAttributeDefinitionsForStore(storeId: string) {
    return this.defs.filter(
      (d) => d.scope === "PLATFORM" || (d.scope === "STORE" && d.storeId === storeId),
    );
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

// Kategori seed'i storeId'yi de tasimalidir; AttributeCategoryRef store bilgisi tasimaz,
// bu yuzden findCategoryForStore icin storeId'yi ek alanla saklariz.
type SeededCategory = AttributeCategoryRef & { storeId: string };

function buildStoreApp(opts?: { storeAdmin?: (storeId: string) => { actorUserId: string } | null }) {
  const dataAccess = new MemoryAttributes();
  const audits: Array<{ action: string; entityType: string; entityId?: string }> = [];
  const app = Fastify();
  attachErrorHandler(app);
  registerStoreAttributeRoutes(app, {
    dataAccess,
    requireStoreAdmin: async (_request, reply, storeId) => {
      const actor = opts?.storeAdmin ? opts.storeAdmin(storeId) : { actorUserId: "admin_1" };
      if (!actor) {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      }
      return actor;
    },
    recordAudit: async (input) => {
      audits.push({ action: input.action, entityType: input.entityType, entityId: input.entityId });
    },
  });
  return { app, dataAccess, audits };
}

function buildPlatformApp(opts?: { isSuper?: boolean }) {
  const dataAccess = new MemoryAttributes();
  const app = Fastify();
  attachErrorHandler(app);
  registerPlatformAttributeRoutes(app, {
    dataAccess,
    requireSuperAdmin: async (_request, reply) => {
      if (opts?.isSuper === false) {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      }
      return { actorUserId: "super_1" };
    },
    recordAudit: async () => {},
  });
  return { app, dataAccess };
}

// Kategori seed helper (storeId'li).
function seedCategory(dataAccess: MemoryAttributes, cat: SeededCategory) {
  dataAccess.categories.push(cat as AttributeCategoryRef);
}

let ctx: ReturnType<typeof buildStoreApp>;
afterEach(async () => {
  if (ctx?.app) await ctx.app.close();
});

describe("Faz 1B — store attribute definitions", () => {
  beforeEach(() => {
    ctx = buildStoreApp();
  });

  async function create(payload: Record<string, unknown>) {
    return ctx.app.inject({ method: "POST", url: "/stores/store_demo/attributes", payload });
  }

  it("creates a STORE attribute (scope+storeId derived from route, not body)", async () => {
    const res = await create({ code: "screen_size", name: "Screen Size", dataType: "DECIMAL", unit: "inch" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ scope: "STORE", storeId: "store_demo", code: "screen_size", dataType: "DECIMAL" });
    expect(ctx.audits).toContainEqual({ action: "CREATE", entityType: "AttributeDefinition", entityId: body.id });
  });

  it("rejects duplicate code within the same store (409)", async () => {
    await create({ code: "color", name: "Color", dataType: "SELECT" });
    const dup = await create({ code: "color", name: "Renk", dataType: "SELECT" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: "ATTRIBUTE_CODE_EXISTS" } });
  });

  it("rejects an invalid code shape (validation)", async () => {
    const res = await create({ code: "Bad Code!", name: "X", dataType: "TEXT" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("keeps code immutable on PATCH (different value → 400)", async () => {
    const created = (await create({ code: "material", name: "Material", dataType: "TEXT" })).json();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${created.id}`,
      payload: { code: "material2", name: "Malzeme" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_CODE_IMMUTABLE" } });
  });

  it("allows PATCH echoing the SAME code (no-op) and updates name", async () => {
    const created = (await create({ code: "material", name: "Material", dataType: "TEXT" })).json();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${created.id}`,
      payload: { code: "material", name: "Malzeme" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Malzeme", code: "material" });
  });

  it("allows dataType change while UNUSED, blocks it once an option exists", async () => {
    const created = (await create({ code: "size", name: "Size", dataType: "TEXT" })).json();
    // unused → değişebilir
    const ok = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${created.id}`,
      payload: { dataType: "SELECT" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().dataType).toBe("SELECT");
    // bir seçenek ekle → artık immutable
    await ctx.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${created.id}/options`,
      payload: { value: "s", label: "Small" },
    });
    const blocked = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attributes/${created.id}`,
      payload: { dataType: "MULTI_SELECT" },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json()).toMatchObject({ error: { code: "ATTRIBUTE_DATATYPE_IMMUTABLE" } });
  });

  it("enforces tenant isolation: another store cannot read/patch a store's attribute", async () => {
    const created = (await create({ code: "brandline", name: "Brand Line", dataType: "TEXT" })).json();
    const get = await ctx.app.inject({ method: "GET", url: `/stores/store_other/attributes/${created.id}` });
    expect(get.statusCode).toBe(404);
    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_other/attributes/${created.id}`,
      payload: { name: "x" },
    });
    expect(patch.statusCode).toBe(404);
  });

  it("lists STORE-own + PLATFORM definitions together", async () => {
    await create({ code: "own", name: "Own", dataType: "TEXT" });
    ctx.dataAccess.defs.push({
      id: "attr_platform", scope: "PLATFORM", storeId: null, code: "global", name: "Global",
      description: null, dataType: "TEXT", unit: null, status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const list = await ctx.app.inject({ method: "GET", url: "/stores/store_demo/attributes" });
    const codes = list.json().data.map((d: { code: string }) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["own", "global"]));
  });

  it("blocks store from editing a PLATFORM attribute (options POST → 404)", async () => {
    ctx.dataAccess.defs.push({
      id: "attr_platform", scope: "PLATFORM", storeId: null, code: "global_sel", name: "Global",
      description: null, dataType: "SELECT", unit: null, status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/attributes/attr_platform/options",
      payload: { value: "a", label: "A" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Faz 1B — attribute options", () => {
  beforeEach(() => {
    ctx = buildStoreApp();
  });

  async function makeSelect() {
    return (
      await ctx.app.inject({
        method: "POST",
        url: "/stores/store_demo/attributes",
        payload: { code: "color", name: "Color", dataType: "SELECT" },
      })
    ).json();
  }

  it("creates an option for a SELECT attribute and rejects duplicate value", async () => {
    const attr = await makeSelect();
    const first = await ctx.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${attr.id}/options`,
      payload: { value: "red", label: "Red", colorHex: "#ff0000" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ value: "red", colorHex: "#ff0000" });
    const dup = await ctx.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${attr.id}/options`,
      payload: { value: "red", label: "Kirmizi" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTION_VALUE_EXISTS" } });
  });

  it("rejects options for a non-option dataType (TEXT → 400)", async () => {
    const attr = (
      await ctx.app.inject({
        method: "POST",
        url: "/stores/store_demo/attributes",
        payload: { code: "note", name: "Note", dataType: "TEXT" },
      })
    ).json();
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${attr.id}/options`,
      payload: { value: "x", label: "X" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_OPTIONS_NOT_SUPPORTED" } });
  });

  it("validates colorHex shape", async () => {
    const attr = await makeSelect();
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/store_demo/attributes/${attr.id}/options`,
      payload: { value: "red", label: "Red", colorHex: "red" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Faz 1B — attribute groups", () => {
  beforeEach(() => {
    ctx = buildStoreApp();
  });

  it("creates, lists and updates a group; other store cannot see it", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/attribute-groups",
      payload: { name: "Technical", sortOrder: 5 },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const list = await ctx.app.inject({ method: "GET", url: "/stores/store_demo/attribute-groups" });
    expect(list.json().data).toHaveLength(1);
    const otherList = await ctx.app.inject({ method: "GET", url: "/stores/store_other/attribute-groups" });
    expect(otherList.json().data).toHaveLength(0);
    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/stores/store_demo/attribute-groups/${id}`,
      payload: { name: "Teknik" },
    });
    expect(patched.json().name).toBe("Teknik");
  });
});

describe("Faz 1B — category attributes (behavior owner)", () => {
  beforeEach(() => {
    ctx = buildStoreApp();
    seedCategory(ctx.dataAccess, { id: "cat_active", storeId: "store_demo", status: "ACTIVE" });
    seedCategory(ctx.dataAccess, { id: "cat_archived", storeId: "store_demo", status: "ARCHIVED" });
  });

  async function makeAttr(status: "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    const attr = (
      await ctx.app.inject({
        method: "POST",
        url: "/stores/store_demo/attributes",
        payload: { code: `c_${status.toLowerCase()}`, name: "Attr", dataType: "TEXT" },
      })
    ).json();
    if (status === "ARCHIVED") {
      await ctx.app.inject({
        method: "PATCH",
        url: `/stores/store_demo/attributes/${attr.id}`,
        payload: { status: "ARCHIVED" },
      });
    }
    return attr;
  }

  it("links an attribute to a category with behavior flags (201)", async () => {
    const attr = await makeAttr();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/categories/cat_active/attributes",
      payload: { attributeDefinitionId: attr.id, required: true, filterable: true, displayOrder: 3 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      categoryId: "cat_active",
      attributeDefinitionId: attr.id,
      required: true,
      filterable: true,
      variantDefining: false,
      visibleOnProductPage: true,
      displayOrder: 3,
    });
  });

  it("rejects linking to an archived category (400)", async () => {
    const attr = await makeAttr();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/categories/cat_archived/attributes",
      payload: { attributeDefinitionId: attr.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "CATEGORY_ARCHIVED" } });
  });

  it("rejects linking an archived attribute (400)", async () => {
    const attr = await makeAttr("ARCHIVED");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/categories/cat_active/attributes",
      payload: { attributeDefinitionId: attr.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "ATTRIBUTE_ARCHIVED" } });
  });

  it("rejects duplicate link then allows delete (409 → 204)", async () => {
    const attr = await makeAttr();
    await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/categories/cat_active/attributes",
      payload: { attributeDefinitionId: attr.id },
    });
    const dup = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_demo/categories/cat_active/attributes",
      payload: { attributeDefinitionId: attr.id },
    });
    expect(dup.statusCode).toBe(409);
    const link = ctx.dataAccess.links[0]!;
    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/stores/store_demo/categories/cat_active/attributes/${link.id}`,
    });
    expect(del.statusCode).toBe(204);
    expect(ctx.dataAccess.links).toHaveLength(0);
  });

  it("returns 404 linking to a category from a different store (isolation)", async () => {
    const attr = await makeAttr();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/stores/store_other/categories/cat_active/attributes",
      payload: { attributeDefinitionId: attr.id },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Faz 1B — platform attributes (SUPER_ADMIN scope)", () => {
  it("creates a PLATFORM attribute as super admin (scope+null storeId)", async () => {
    const { app } = buildPlatformApp({ isSuper: true });
    const res = await app.inject({
      method: "POST",
      url: "/admin/attributes",
      payload: { code: "gtin", name: "GTIN", dataType: "TEXT" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ scope: "PLATFORM", storeId: null, code: "gtin" });
    await app.close();
  });

  it("forbids non-super-admin (403)", async () => {
    const { app } = buildPlatformApp({ isSuper: false });
    const res = await app.inject({
      method: "POST",
      url: "/admin/attributes",
      payload: { code: "gtin", name: "GTIN", dataType: "TEXT" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects duplicate platform code (409)", async () => {
    const { app } = buildPlatformApp({ isSuper: true });
    await app.inject({ method: "POST", url: "/admin/attributes", payload: { code: "gtin", name: "GTIN", dataType: "TEXT" } });
    const dup = await app.inject({
      method: "POST",
      url: "/admin/attributes",
      payload: { code: "gtin", name: "GTIN2", dataType: "TEXT" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: "ATTRIBUTE_CODE_EXISTS" } });
    await app.close();
  });
});

import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

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

// attribute-values/data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma
// init'ini engellemek icin bos stub yeter (dataAccess in-memory obje; prisma cagrilmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { createAttributeValueService } = await import("../src/attribute-values/service.js");
const { registerAttributeValueRoutes } = await import("../src/attribute-values/routes.js");
import type {
  AttributeDefinitionRef,
  AttributeOptionRef,
  AttributeValueDataAccess,
  CategoryAttributeRef,
  ProductAttributeValueEntry,
  ProductAttributeValueRecord,
  VariantAttributeValueEntry,
  VariantAttributeValueRecord,
} from "../src/attribute-values/data.js";
import type { AttributeDataType } from "@commerce-os/contracts";

// ─── Gercek mantikli in-memory AttributeValueDataAccess (mock degil) ───
type SeededLink = CategoryAttributeRef & { storeId: string; categoryId: string };
type SeededDef = AttributeDefinitionRef;
type SeededOption = AttributeOptionRef;

class MemoryAttributeValues implements AttributeValueDataAccess {
  defs: SeededDef[] = [];
  options: SeededOption[] = [];
  media: Array<{ id: string; storeId: string }> = [];
  links: SeededLink[] = [];
  products: Array<{ id: string; storeId: string; primaryCategoryId: string | null }> = [];
  variants: Array<{ id: string; storeId: string; productId: string }> = [];
  productValues: ProductAttributeValueRecord[] = [];
  variantValues: VariantAttributeValueRecord[] = [];
  private seq = 0;
  private id(p: string) {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }
  private now() {
    return new Date("2026-07-14T00:00:00.000Z");
  }
  private dataTypeOf(attributeDefinitionId: string): AttributeDataType {
    return this.defs.find((d) => d.id === attributeDefinitionId)!.dataType;
  }

  async findAttributeDefinitionsByIds(ids: string[]) {
    return this.defs.filter((d) => ids.includes(d.id));
  }
  async findAttributeOptionsByIds(ids: string[]) {
    return this.options.filter((o) => ids.includes(o.id));
  }
  async findMediaAssetIdsForStore(storeId: string, ids: string[]) {
    return this.media.filter((m) => m.storeId === storeId && ids.includes(m.id)).map((m) => m.id);
  }
  async listCategoryAttributeLinks(storeId: string, categoryId: string) {
    return this.links
      .filter((l) => l.storeId === storeId && l.categoryId === categoryId)
      .map((l) => ({
        attributeDefinitionId: l.attributeDefinitionId,
        required: l.required,
        variantDefining: l.variantDefining,
      }));
  }
  async findProductForStore(storeId: string, productId: string) {
    const p = this.products.find((x) => x.id === productId && x.storeId === storeId);
    return p ? { id: p.id, primaryCategoryId: p.primaryCategoryId } : null;
  }
  async findVariantForStore(storeId: string, variantId: string) {
    const v = this.variants.find((x) => x.id === variantId && x.storeId === storeId);
    if (!v) return null;
    const p = this.products.find((x) => x.id === v.productId);
    return { id: v.id, productId: v.productId, primaryCategoryId: p?.primaryCategoryId ?? null };
  }

  async listProductAttributeValues(storeId: string, productId: string) {
    return this.productValues.filter((v) => v.storeId === storeId && v.productId === productId);
  }
  async listVariantAttributeValues(storeId: string, variantId: string) {
    return this.variantValues.filter((v) => v.storeId === storeId && v.variantId === variantId);
  }

  async replaceProductAttributeValues(
    storeId: string,
    productId: string,
    entries: ProductAttributeValueEntry[],
  ) {
    this.productValues = this.productValues.filter(
      (v) => !(v.storeId === storeId && v.productId === productId),
    );
    for (const e of entries) {
      this.productValues.push({
        id: this.id("pav"),
        storeId,
        productId,
        attributeDefinitionId: e.attributeDefinitionId,
        dataType: this.dataTypeOf(e.attributeDefinitionId),
        valueText: e.valueText ?? null,
        valueInteger: e.valueInteger ?? null,
        valueDecimal: e.valueDecimal ?? null,
        valueBoolean: e.valueBoolean ?? null,
        valueDate: e.valueDate ?? null,
        optionId: e.optionId ?? null,
        mediaId: e.mediaId ?? null,
        optionIds: e.optionIds ?? [],
        createdAt: this.now(),
        updatedAt: this.now(),
      });
    }
    return this.listProductAttributeValues(storeId, productId);
  }

  async replaceVariantAttributeValues(
    storeId: string,
    variantId: string,
    entries: VariantAttributeValueEntry[],
  ) {
    this.variantValues = this.variantValues.filter(
      (v) => !(v.storeId === storeId && v.variantId === variantId),
    );
    for (const e of entries) {
      this.variantValues.push({
        id: this.id("vav"),
        storeId,
        variantId,
        attributeDefinitionId: e.attributeDefinitionId,
        dataType: this.dataTypeOf(e.attributeDefinitionId),
        valueText: e.valueText ?? null,
        optionId: e.optionId ?? null,
        createdAt: this.now(),
        updatedAt: this.now(),
      });
    }
    return this.listVariantAttributeValues(storeId, variantId);
  }
}

const STORE = "store_demo";
const OTHER = "store_other";
const CATEGORY = "cat_1";

// Zengin bir katalog + urun/varyant seed'i kurar.
function seed() {
  const da = new MemoryAttributeValues();
  da.products.push({ id: "prod_1", storeId: STORE, primaryCategoryId: CATEGORY });
  da.products.push({ id: "prod_nocat", storeId: STORE, primaryCategoryId: null });
  da.variants.push({ id: "var_1", storeId: STORE, productId: "prod_1" });

  // Tanimlar (STORE + PLATFORM + baska store + archived).
  const def = (id: string, dataType: AttributeDataType, extra?: Partial<SeededDef>): SeededDef => ({
    id,
    scope: "STORE",
    storeId: STORE,
    dataType,
    status: "ACTIVE",
    ...extra,
  });
  da.defs.push(def("text_attr", "TEXT"));
  da.defs.push(def("int_attr", "INTEGER"));
  da.defs.push(def("dec_attr", "DECIMAL"));
  da.defs.push(def("bool_attr", "BOOLEAN"));
  da.defs.push(def("date_attr", "DATE"));
  da.defs.push(def("url_attr", "URL"));
  da.defs.push(def("select_attr", "SELECT"));
  da.defs.push(def("color_attr", "COLOR"));
  da.defs.push(def("multi_attr", "MULTI_SELECT"));
  da.defs.push(def("image_attr", "IMAGE"));
  da.defs.push(def("platform_attr", "TEXT", { scope: "PLATFORM", storeId: null }));
  da.defs.push(def("other_store_attr", "TEXT", { storeId: OTHER }));
  da.defs.push(def("archived_attr", "TEXT", { status: "ARCHIVED" }));
  da.defs.push(def("variant_text_attr", "TEXT"));
  da.defs.push(def("variant_select_attr", "SELECT"));
  da.defs.push(def("req_attr", "TEXT"));

  // Secenekler.
  da.options.push({ id: "opt_red", attributeDefinitionId: "select_attr", storeId: STORE, status: "ACTIVE" });
  da.options.push({ id: "opt_blue", attributeDefinitionId: "select_attr", storeId: STORE, status: "ACTIVE" });
  da.options.push({ id: "opt_archived", attributeDefinitionId: "select_attr", storeId: STORE, status: "ARCHIVED" });
  da.options.push({ id: "opt_wrong", attributeDefinitionId: "color_attr", storeId: STORE, status: "ACTIVE" });
  da.options.push({ id: "opt_other_store", attributeDefinitionId: "select_attr", storeId: OTHER, status: "ACTIVE" });
  da.options.push({ id: "opt_m1", attributeDefinitionId: "multi_attr", storeId: STORE, status: "ACTIVE" });
  da.options.push({ id: "opt_m2", attributeDefinitionId: "multi_attr", storeId: STORE, status: "ACTIVE" });
  da.options.push({ id: "opt_vsel", attributeDefinitionId: "variant_select_attr", storeId: STORE, status: "ACTIVE" });

  da.media.push({ id: "media_1", storeId: STORE });
  da.media.push({ id: "media_other", storeId: OTHER });

  // Kategori baglantilari (davranis).
  const link = (attributeDefinitionId: string, extra?: Partial<SeededLink>): SeededLink => ({
    storeId: STORE,
    categoryId: CATEGORY,
    attributeDefinitionId,
    required: false,
    variantDefining: false,
    ...extra,
  });
  da.links.push(link("text_attr"));
  da.links.push(link("int_attr"));
  da.links.push(link("dec_attr"));
  da.links.push(link("bool_attr"));
  da.links.push(link("date_attr"));
  da.links.push(link("url_attr"));
  da.links.push(link("select_attr"));
  da.links.push(link("color_attr"));
  da.links.push(link("multi_attr"));
  da.links.push(link("image_attr"));
  da.links.push(link("platform_attr"));
  da.links.push(link("archived_attr"));
  da.links.push(link("variant_text_attr", { variantDefining: true }));
  da.links.push(link("variant_select_attr", { variantDefining: true }));
  // req_attr temelde required DEGIL; required senaryosu ilgili testte acikca isaretlenir.
  da.links.push(link("req_attr"));

  return { da, service: createAttributeValueService(da) };
}

describe("Faz 2A — attributeValueService: typed value validation", () => {
  it("accepts each dataType in its own value column", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [
        { attributeDefinitionId: "text_attr", valueText: "hello" },
        { attributeDefinitionId: "int_attr", valueInteger: 42 },
        { attributeDefinitionId: "dec_attr", valueDecimal: 3.5 },
        { attributeDefinitionId: "bool_attr", valueBoolean: true },
        { attributeDefinitionId: "date_attr", valueDate: "2026-07-14T00:00:00.000Z" },
        { attributeDefinitionId: "url_attr", valueText: "https://x.dev" },
        { attributeDefinitionId: "select_attr", optionId: "opt_red" },
        { attributeDefinitionId: "color_attr", optionId: "opt_wrong" },
        { attributeDefinitionId: "multi_attr", optionIds: ["opt_m1", "opt_m2"] },
        { attributeDefinitionId: "image_attr", mediaId: "media_1" },
        { attributeDefinitionId: "req_attr", valueText: "present" },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.values).toHaveLength(11);
  });

  it("rejects a wrong value column for the dataType (INTEGER given valueText)", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "int_attr", valueText: "not-a-number" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_VALUE_TYPE_MISMATCH");
  });

  it("rejects more than one value field", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "text_attr", valueText: "a", valueInteger: 1 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_MULTIPLE_VALUES");
  });

  it("rejects an empty value (no field provided)", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "text_attr" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_VALUE_MISSING");
  });
});

describe("Faz 2A — attributeValueService: attribute existence / archive / category", () => {
  it("rejects an unknown attribute", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "ghost", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_NOT_FOUND");
  });

  it("rejects an archived attribute", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "archived_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_ARCHIVED");
  });

  it("accepts a PLATFORM attribute for any store", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "platform_attr", valueText: "ok" }],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an attribute not linked to the product's primary category", async () => {
    const { da, service } = seed();
    // text_attr baglantisini kaldir → kategoriye bagli degil.
    da.links = da.links.filter((l) => l.attributeDefinitionId !== "text_attr");
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "text_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_NOT_IN_CATEGORY");
  });

  it("rejects values when the product has no primary category", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_nocat",
      values: [{ attributeDefinitionId: "text_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRODUCT_CATEGORY_REQUIRED");
  });

  it("rejects a duplicate attribute in the same set", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [
        { attributeDefinitionId: "text_attr", valueText: "a" },
        { attributeDefinitionId: "text_attr", valueText: "b" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_DUPLICATE");
  });
});

describe("Faz 2A — attributeValueService: tenant isolation", () => {
  it("rejects a STORE attribute owned by another store", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "other_store_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_TENANT_MISMATCH");
  });

  it("returns PRODUCT_NOT_FOUND for a product in another store", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: OTHER,
      productId: "prod_1",
      values: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("rejects media owned by another store", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "image_attr", mediaId: "media_other" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_MEDIA_NOT_FOUND");
  });
});

describe("Faz 2A — attributeValueService: option validation", () => {
  it("rejects an option that belongs to a different attribute", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "select_attr", optionId: "opt_wrong" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_OPTION_INVALID");
  });

  it("rejects an archived option", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "select_attr", optionId: "opt_archived" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_OPTION_ARCHIVED");
  });

  it("rejects an option owned by another store", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "select_attr", optionId: "opt_other_store" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_OPTION_TENANT_MISMATCH");
  });

  it("rejects an empty MULTI_SELECT selection", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "multi_attr", optionIds: [] }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_VALUE_MISSING");
  });

  it("stores MULTI_SELECT options in the junction and dedupes", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "multi_attr", optionIds: ["opt_m1", "opt_m2", "opt_m1"] }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const row = res.values.find((v) => v.attributeDefinitionId === "multi_attr")!;
      expect(row.optionIds.sort()).toEqual(["opt_m1", "opt_m2"]);
      expect(row.optionId).toBeNull();
    }
  });
});

describe("Faz 2A — attributeValueService: required", () => {
  it("rejects when a required attribute is missing from the provided set", async () => {
    const { da, service } = seed();
    da.links.find((l) => l.attributeDefinitionId === "req_attr")!.required = true;
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [{ attributeDefinitionId: "text_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ATTRIBUTE_REQUIRED_MISSING");
      expect(res.error.attributeDefinitionId).toBe("req_attr");
    }
  });

  it("allows clearing all values with an empty set (no required check)", async () => {
    const { service } = seed();
    const res = await service.setProductValues({ storeId: STORE, productId: "prod_1", values: [] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.values).toHaveLength(0);
  });
});

describe("Faz 2A — attributeValueService: variantDefining table routing", () => {
  it("rejects a non-variantDefining attribute on the variant table", async () => {
    const { service } = seed();
    const res = await service.setVariantValues({
      storeId: STORE,
      variantId: "var_1",
      values: [{ attributeDefinitionId: "text_attr", valueText: "x" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_NOT_VARIANT_DEFINING");
  });

  it("rejects a variantDefining attribute on the product table", async () => {
    const { service } = seed();
    const res = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [
        { attributeDefinitionId: "req_attr", valueText: "present" },
        { attributeDefinitionId: "variant_text_attr", valueText: "x" },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ATTRIBUTE_IS_VARIANT_DEFINING");
  });

  it("accepts variantDefining text + select on the variant table", async () => {
    const { service } = seed();
    const res = await service.setVariantValues({
      storeId: STORE,
      variantId: "var_1",
      values: [
        { attributeDefinitionId: "variant_text_attr", valueText: "42GB" },
        { attributeDefinitionId: "variant_select_attr", optionId: "opt_vsel" },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.values).toHaveLength(2);
  });

  it("returns VARIANT_NOT_FOUND for an unknown variant", async () => {
    const { service } = seed();
    const res = await service.setVariantValues({ storeId: STORE, variantId: "ghost", values: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VARIANT_NOT_FOUND");
  });
});

describe("Faz 2A — attributeValueService: replace-set semantics", () => {
  it("replaces the full set on each write", async () => {
    const { service } = seed();
    await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [
        { attributeDefinitionId: "text_attr", valueText: "a" },
        { attributeDefinitionId: "int_attr", valueInteger: 1 },
        { attributeDefinitionId: "req_attr", valueText: "present" },
      ],
    });
    const second = await service.setProductValues({
      storeId: STORE,
      productId: "prod_1",
      values: [
        { attributeDefinitionId: "text_attr", valueText: "b" },
        { attributeDefinitionId: "req_attr", valueText: "present" },
      ],
    });
    expect(second.ok).toBe(true);
    const listed = await service.listProductValues(STORE, "prod_1");
    expect(listed).toHaveLength(2);
    expect(listed.find((v) => v.attributeDefinitionId === "text_attr")!.valueText).toBe("b");
    expect(listed.find((v) => v.attributeDefinitionId === "int_attr")).toBeUndefined();
  });
});

// ─── Dedike HTTP uclari (GET/PUT) — auth + tenant + round-trip ───
function buildApp(opts?: { storeAdmin?: (storeId: string) => { actorUserId: string } | null }) {
  const { da, service } = seed();
  const audits: Array<{ action: string; entityType: string; entityId?: string }> = [];
  const app = Fastify();
  attachErrorHandler(app);
  registerAttributeValueRoutes(app, {
    service,
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
  return { app, da, service, audits };
}

let ctx: ReturnType<typeof buildApp>;
afterEach(async () => {
  if (ctx?.app) await ctx.app.close();
});

describe("Faz 2A — dedicated attribute-value routes", () => {
  beforeEach(() => {
    ctx = buildApp();
  });

  it("PUT then GET round-trips product attribute values", async () => {
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/attribute-values`,
      payload: {
        values: [
          { attributeDefinitionId: "text_attr", valueText: "hi" },
          { attributeDefinitionId: "req_attr", valueText: "present" },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toHaveLength(2);
    expect(ctx.audits).toContainEqual({
      action: "UPDATE",
      entityType: "ProductAttributeValue",
      entityId: "prod_1",
    });

    const get = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/attribute-values`,
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.map((v: { attributeDefinitionId: string }) => v.attributeDefinitionId).sort()).toEqual(
      ["req_attr", "text_attr"],
    );
  });

  it("PUT surfaces a service validation error as 400 with the stable code", async () => {
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/attribute-values`,
      payload: { values: [{ attributeDefinitionId: "int_attr", valueText: "x" }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("ATTRIBUTE_VALUE_TYPE_MISMATCH");
  });

  it("GET a product in another store returns 404 (tenant isolation)", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${OTHER}/products/prod_1/attribute-values`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 403 when the caller is not a store admin", async () => {
    ctx = buildApp({ storeAdmin: () => null });
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/attribute-values`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT/GET variant attribute values round-trip", async () => {
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/variants/var_1/attribute-values`,
      payload: { values: [{ attributeDefinitionId: "variant_text_attr", valueText: "128GB" }] },
    });
    expect(put.statusCode).toBe(200);
    const get = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variants/var_1/attribute-values`,
    });
    expect(get.json().data[0]).toMatchObject({
      attributeDefinitionId: "variant_text_attr",
      dataType: "TEXT",
      valueText: "128GB",
    });
  });
});

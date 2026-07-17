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

// variant-selections/data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma
// init'ini engellemek icin bos stub yeter (dataAccess in-memory obje; prisma cagrilmaz).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { createVariantSelectionService } = await import("../src/variant-selections/service.js");
const { registerVariantSelectionRoutes } = await import("../src/variant-selections/routes.js");
import type {
  AttributeDefinitionRef,
  AttributeOptionRef,
  CategoryAttributeRef,
  ProductVariantSelectionEntry,
  ProductVariantSelectionRecord,
  VariantSelectionDataAccess,
} from "../src/variant-selections/data.js";
import type { AttributeDataType } from "@commerce-os/contracts";

// ─── Gercek mantikli in-memory VariantSelectionDataAccess (mock degil) ───
type SeededLink = CategoryAttributeRef & { storeId: string; categoryId: string };

class MemoryVariantSelections implements VariantSelectionDataAccess {
  defs: AttributeDefinitionRef[] = [];
  options: AttributeOptionRef[] = [];
  links: SeededLink[] = [];
  products: Array<{ id: string; storeId: string; primaryCategoryId: string | null }> = [];
  selections: ProductVariantSelectionRecord[] = [];
  private seq = 0;
  private id(p: string) {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }
  private now() {
    return new Date("2026-07-17T00:00:00.000Z");
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
  async listCategoryAttributeLinks(storeId: string, categoryId: string) {
    return this.links
      .filter((l) => l.storeId === storeId && l.categoryId === categoryId)
      .map((l) => ({ attributeDefinitionId: l.attributeDefinitionId, variantDefining: l.variantDefining }));
  }
  async findProductForStore(storeId: string, productId: string) {
    const p = this.products.find((x) => x.id === productId && x.storeId === storeId);
    return p ? { id: p.id, primaryCategoryId: p.primaryCategoryId } : null;
  }
  async listProductVariantSelections(storeId: string, productId: string) {
    return this.selections
      .filter((s) => s.storeId === storeId && s.productId === productId)
      .sort((a, b) => a.position - b.position);
  }
  async replaceProductVariantSelections(
    storeId: string,
    productId: string,
    entries: ProductVariantSelectionEntry[],
  ) {
    this.selections = this.selections.filter((s) => !(s.storeId === storeId && s.productId === productId));
    entries.forEach((e, index) => {
      this.selections.push({
        id: this.id("pva"),
        storeId,
        productId,
        attributeDefinitionId: e.attributeDefinitionId,
        dataType: this.dataTypeOf(e.attributeDefinitionId),
        position: index,
        optionIds: [...e.optionIds],
        createdAt: this.now(),
        updatedAt: this.now(),
      });
    });
    return this.listProductVariantSelections(storeId, productId);
  }
}

const STORE = "store_demo";
const OTHER = "store_other";
const CATEGORY = "cat_1";

function seed() {
  const da = new MemoryVariantSelections();
  da.products.push({ id: "prod_1", storeId: STORE, primaryCategoryId: CATEGORY });
  da.products.push({ id: "prod_nocat", storeId: STORE, primaryCategoryId: null });

  const def = (
    id: string,
    dataType: AttributeDataType,
    extra?: Partial<AttributeDefinitionRef>,
  ): AttributeDefinitionRef => ({ id, scope: "STORE", storeId: STORE, dataType, status: "ACTIVE", ...extra });
  da.defs.push(def("color", "SELECT"));
  da.defs.push(def("size", "COLOR")); // COLOR de option-tabanli eksen olabilir
  da.defs.push(def("capacity", "SELECT"));
  da.defs.push(def("material", "TEXT")); // variantDefining ama option-tabanli DEGIL
  da.defs.push(def("product_level", "SELECT")); // variantDefining=false
  da.defs.push(def("platform_color", "SELECT", { scope: "PLATFORM", storeId: null }));
  da.defs.push(def("other_store_color", "SELECT", { storeId: OTHER }));
  da.defs.push(def("archived_color", "SELECT", { status: "ARCHIVED" }));
  da.defs.push(def("unlinked", "SELECT")); // kategoriye bagli DEGIL

  // Secenekler.
  const opt = (id: string, attributeDefinitionId: string, extra?: Partial<AttributeOptionRef>) =>
    da.options.push({ id, attributeDefinitionId, storeId: STORE, status: "ACTIVE", ...extra });
  opt("black", "color");
  opt("white", "color");
  opt("blue", "color");
  opt("archived_opt", "color", { status: "ARCHIVED" });
  opt("other_store_opt", "color", { storeId: OTHER });
  opt("s", "size");
  opt("m", "size");
  opt("cap64", "capacity");
  opt("platform_opt", "platform_color", { storeId: null });

  const link = (attributeDefinitionId: string, variantDefining: boolean): SeededLink => ({
    storeId: STORE,
    categoryId: CATEGORY,
    attributeDefinitionId,
    variantDefining,
  });
  da.links.push(link("color", true));
  da.links.push(link("size", true));
  da.links.push(link("capacity", true));
  da.links.push(link("material", true)); // variantDefining ama TEXT
  da.links.push(link("product_level", false));
  da.links.push(link("platform_color", true));
  da.links.push(link("other_store_color", true));
  da.links.push(link("archived_color", true));

  return { da, service: createVariantSelectionService(da) };
}

describe("Faz 2C-1 — variantSelectionService: seçim + doğrulama", () => {
  it("saves selected axes with their options (option selection)", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [
        { attributeDefinitionId: "color", optionIds: ["black", "white", "blue"] },
        { attributeDefinitionId: "size", optionIds: ["s", "m"] },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.selections).toHaveLength(2);
    expect(res.selections[0]).toMatchObject({ attributeDefinitionId: "color", position: 0 });
    expect(res.selections[0]!.optionIds).toEqual(["black", "white", "blue"]);
    expect(res.selections[1]).toMatchObject({ attributeDefinitionId: "size", position: 1 });
  });

  it("empty selection set writes nothing and is ok (legacy compatibility)", async () => {
    const { service, da } = seed();
    const res = await service.setSelections({ storeId: STORE, productId: "prod_1", selections: [] });
    expect(res.ok).toBe(true);
    expect(da.selections).toHaveLength(0);
  });

  it("rejects the same attribute selected twice (duplicate)", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [
        { attributeDefinitionId: "color", optionIds: ["black"] },
        { attributeDefinitionId: "color", optionIds: ["white"] },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_ATTRIBUTE_DUPLICATE");
    expect(res.error.attributeDefinitionId).toBe("color");
  });

  it("requires at least one option per axis (option required)", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: [] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_OPTION_REQUIRED");
  });

  it("rejects an archived option", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["black", "archived_opt"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_OPTION_ARCHIVED");
  });

  it("rejects an option that belongs to another attribute (invalid)", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["s"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_OPTION_INVALID");
  });

  it("rejects a non-variant-defining attribute", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "product_level", optionIds: ["black"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_ATTRIBUTE_NOT_VARIANT_DEFINING");
  });

  it("rejects a non-option-based (TEXT) variant attribute", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "material", optionIds: ["black"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_ATTRIBUTE_NOT_OPTION_BASED");
  });

  it("rejects an attribute not linked to the product's primary category", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "unlinked", optionIds: ["black"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_ATTRIBUTE_NOT_IN_CATEGORY");
  });

  it("requires a primary category before selecting variant attributes", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_nocat",
      selections: [{ attributeDefinitionId: "color", optionIds: ["black"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRODUCT_CATEGORY_REQUIRED");
  });

  it("dedupes repeated option ids within an axis", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["black", "black", "white"] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.selections[0]!.optionIds).toEqual(["black", "white"]);
  });

  it("replace-set: a second save replaces the first entirely", async () => {
    const { service } = seed();
    await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["black", "white"] }],
    });
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "size", optionIds: ["s"] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.selections).toHaveLength(1);
    expect(res.selections[0]!.attributeDefinitionId).toBe("size");
  });
});

describe("Faz 2C-1 — kalite kapıları: deterministiklik / idempotency / stress", () => {
  // Deterministiklik: farklı option girdi SIRASI, position dışında AYNI normalize kümeyi üretir
  // (satır kimeleri = {attributeDefinitionId, optionId} çiftleri sıradan bağımsız aynıdır).
  it("determinism: different option order → same (attr, option) set (position aside)", async () => {
    const a = seed();
    const b = seed();
    const r1 = await a.service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["black", "white"] }],
    });
    const r2 = await b.service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["white", "black"] }],
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const setOf = (recs: typeof r1.selections) =>
      recs.flatMap((s) => s.optionIds.map((o) => `${s.attributeDefinitionId}:${o}`)).sort();
    expect(setOf(r1.selections)).toEqual(setOf(r2.selections));
  });

  // İdempotency: aynı seçim iki kez kaydedilince mantıksal içerik AYNI kalır, satır sayısı
  // BİRİKMEZ (replace-set: eski silinir, aynı küme yazılır; @@unique çift satırı zaten engeller).
  it("idempotency: saving the same selection twice does not accumulate rows", async () => {
    const { service, da } = seed();
    const input = {
      storeId: STORE,
      productId: "prod_1",
      selections: [
        { attributeDefinitionId: "color", optionIds: ["black", "white"] },
        { attributeDefinitionId: "size", optionIds: ["s", "m"] },
      ],
    };
    await service.setSelections(input);
    const afterFirst = da.selections.length;
    await service.setSelections(input);
    const afterSecond = da.selections.length;
    expect(afterFirst).toBe(2);
    expect(afterSecond).toBe(2); // birikme YOK
    // İçerik birebir aynı (attr + option kümesi).
    const view = da.selections
      .map((s) => `${s.attributeDefinitionId}:${[...s.optionIds].sort().join(",")}`)
      .sort();
    expect(view).toEqual(["color:black,white", "size:m,s"]);
  });

  // Stress: 1000 option'lı tek eksen — batch lookup (tek `in` sorgusu) + tek createMany;
  // duplicate/dedup O(n), N+1 yok. Hepsi tek geçişte doğrulanır ve persist edilir.
  it("stress: an axis with 1000 valid options validates + persists in one pass", async () => {
    const { da, service } = seed();
    const ids: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const id = `bulk_${i}`;
      da.options.push({ id, attributeDefinitionId: "capacity", storeId: STORE, status: "ACTIVE" });
      ids.push(id);
    }
    // Girdide bilerek duplicate ekle (dedupe kanıtı): 1000 benzersiz + 1 tekrar.
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "capacity", optionIds: [...ids, ids[0]!] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.selections).toHaveLength(1);
    expect(res.selections[0]!.optionIds).toHaveLength(1000); // dedupe → 1000
  });

  // Stress + hata karışımı: yoğun listede tek archived/tenant/invalid tüm işlemi reddeder.
  it("stress: a single archived option in a large list rejects the whole save", async () => {
    const { da, service } = seed();
    const ids: string[] = [];
    for (let i = 0; i < 500; i += 1) {
      const id = `big_${i}`;
      da.options.push({ id, attributeDefinitionId: "capacity", storeId: STORE, status: "ACTIVE" });
      ids.push(id);
    }
    da.options.push({ id: "big_bad", attributeDefinitionId: "capacity", storeId: STORE, status: "ARCHIVED" });
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "capacity", optionIds: [...ids, "big_bad"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_OPTION_ARCHIVED");
    expect(da.selections).toHaveLength(0); // hiçbir yazım olmadı
  });
});

describe("Faz 2C-1 — variantSelectionService: tenant isolation", () => {
  it("rejects a STORE attribute from another store", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "other_store_color", optionIds: ["black"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_ATTRIBUTE_TENANT_MISMATCH");
  });

  it("rejects an option from another store", async () => {
    const { service } = seed();
    const res = await service.setSelections({
      storeId: STORE,
      productId: "prod_1",
      selections: [{ attributeDefinitionId: "color", optionIds: ["other_store_opt"] }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_OPTION_TENANT_MISMATCH");
  });

  it("getSelections for a product in another store returns PRODUCT_NOT_FOUND", async () => {
    const { service } = seed();
    const res = await service.getSelections(OTHER, "prod_1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});

// ─── Dedike HTTP uclari (GET/PUT) — auth + tenant + round-trip ───
function buildApp(opts?: { storeAdmin?: (storeId: string) => { actorUserId: string } | null }) {
  const { da, service } = seed();
  const audits: Array<{ action: string; entityType: string; entityId?: string }> = [];
  const app = Fastify();
  attachErrorHandler(app);
  registerVariantSelectionRoutes(app, {
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

describe("Faz 2C-1 — dedicated variant-selection routes", () => {
  beforeEach(() => {
    ctx = buildApp();
  });

  it("PUT then GET round-trips variant selections (save + edit)", async () => {
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
      payload: {
        selections: [
          { attributeDefinitionId: "color", optionIds: ["black", "white"] },
          { attributeDefinitionId: "size", optionIds: ["s"] },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toHaveLength(2);
    expect(ctx.audits).toContainEqual({
      action: "UPDATE",
      entityType: "ProductVariantAttribute",
      entityId: "prod_1",
    });

    const get = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
    });
    expect(get.statusCode).toBe(200);
    const data = get.json().data as Array<{ attributeDefinitionId: string; optionIds: string[] }>;
    expect(data.map((d) => d.attributeDefinitionId)).toEqual(["color", "size"]);
    expect(data[0]!.optionIds).toEqual(["black", "white"]);
  });

  it("PUT with [] clears all selections (edit → empty)", async () => {
    await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
      payload: { selections: [{ attributeDefinitionId: "color", optionIds: ["black"] }] },
    });
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
      payload: { selections: [] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toHaveLength(0);
  });

  it("PUT surfaces a service validation error as 400 with the stable code + attributeDefinitionId", async () => {
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
      payload: { selections: [{ attributeDefinitionId: "material", optionIds: ["black"] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VARIANT_ATTRIBUTE_NOT_OPTION_BASED");
    expect(res.json().error.attributeDefinitionId).toBe("material");
  });

  it("GET a product in another store returns 404 (tenant isolation)", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${OTHER}/products/prod_1/variant-selections`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 403 when the caller is not a store admin", async () => {
    ctx = buildApp({ storeAdmin: () => null });
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variant-selections`,
    });
    expect(res.statusCode).toBe(403);
  });
});

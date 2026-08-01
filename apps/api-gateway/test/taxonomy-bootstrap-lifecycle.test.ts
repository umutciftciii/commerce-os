/**
 * TODO-165A (ADR-165A) — Task 10b: Capability lifecycle → taxonomy bootstrap wiring.
 *
 * FASHION_VERTICAL DISABLED→ENABLED capability-transition, `ensureStoreTaxonomyDefaults`
 * (Task 9)'i tetikler — migration (Task 14b) yalnız migration-anında enabled olan
 * mağazaları kapsadığından, bu YENİ/SONRADAN-enable edilen mağazalar için birincil
 * bootstrap noktasıdır. Mirror `capabilities-routes.test.ts` (fake StoreModulePersistence +
 * gerçek `registerCapabilityRoutes`) + `taxonomy-service.test.ts` (fake TaxonomyDataAccess +
 * gerçek `createTaxonomyService`) — gerçek `ensureStoreTaxonomyDefaults` mantığıyla uçtan
 * uca (idempotent/no-op-if-exists) davranış doğrulanır.
 *
 * FAIL-CLOSED (kritik): bootstrap fırlatırsa PUT kontrollü bir hata döner VE override EXACT
 * önceki duruma geri alınır (compensating write — bkz. `capabilities/routes.ts` yorumu) —
 * mağaza asla "enabled ama default'suz" sessizce bırakılmaz.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createStoreModuleData, type StoreModulePersistence } from "../src/capabilities/data.js";
import { createCapabilityCache } from "../src/capabilities/cache.js";
import { registerCapabilityRoutes, type CapabilityRoutesDeps } from "../src/capabilities/routes.js";
import type { ModuleOverrideState } from "../src/capabilities/resolver.js";
import { createTaxonomyService } from "../src/taxonomy/taxonomy-service.js";
import {
  PRODUCT_TAXONOMY_TYPES,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import { definitionCodeForTaxonomyType } from "../src/taxonomy/taxonomy-map.js";
import {
  TaxonomyOptionConflictError,
  type TaxonomyCreateInput,
  type TaxonomyDataAccess,
  type TaxonomyUpdatePatch,
  type TaxonomyValueRecord,
} from "../src/taxonomy/taxonomy-data.js";

const NOW = new Date("2026-08-01T00:00:00Z");

/** Her governed `fashion.*` kodu icin sabit bir PLATFORM AttributeDefinition id uretir. */
function buildDefinitionIds(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const type of PRODUCT_TAXONOMY_TYPES) {
    const code = definitionCodeForTaxonomyType(type);
    map[code] = `def-${code}`;
  }
  return map;
}

/** Mirror `taxonomy-service.test.ts`'in FakeTaxonomyData'sı (gerçek servis mantığını doğrulamak için). */
class FakeTaxonomyData implements TaxonomyDataAccess {
  values = new Map<string, TaxonomyValueRecord>();
  productAttributeValueOptions: { attributeOptionId: string }[] = [];
  definitionIds: Record<string, string>;
  private seq = 0;

  constructor(definitionIds: Record<string, string>) {
    this.definitionIds = definitionIds;
  }

  async platformDefinitionIdForCode(code: string) {
    return this.definitionIds[code] ?? null;
  }

  private findBySlugSync(storeId: string, type: ProductTaxonomyType, slug: string): TaxonomyValueRecord | null {
    for (const v of this.values.values()) {
      if (v.storeId === storeId && v.type === type && v.slug === slug) return v;
    }
    return null;
  }

  async findBySlug(storeId: string, type: ProductTaxonomyType, slug: string) {
    return this.findBySlugSync(storeId, type, slug);
  }

  async findById(id: string) {
    return this.values.get(id) ?? null;
  }

  async list(storeId: string, type?: ProductTaxonomyType) {
    return [...this.values.values()].filter((v) => v.storeId === storeId && (!type || v.type === type));
  }

  async countUsage(optionId: string) {
    return this.productAttributeValueOptions.filter((v) => v.attributeOptionId === optionId).length;
  }

  async countUsageBatch(optionIds: string[]) {
    const result: Record<string, number> = {};
    for (const id of optionIds) result[id] = await this.countUsage(id);
    return result;
  }

  private nextDisplayOrder(storeId: string, type: ProductTaxonomyType) {
    return [...this.values.values()].filter((v) => v.storeId === storeId && v.type === type).length;
  }

  async createValueWithOption(input: TaxonomyCreateInput): Promise<TaxonomyValueRecord> {
    const dup = this.findBySlugSync(input.storeId, input.type, input.slug);
    if (dup) throw new TaxonomyOptionConflictError();
    this.seq += 1;
    const optionId = `opt-${this.seq}`;
    const id = `tax-${this.seq}`;
    const record: TaxonomyValueRecord = {
      id,
      storeId: input.storeId,
      type: input.type,
      name: input.name,
      slug: input.slug,
      status: "ACTIVE",
      displayOrder: this.nextDisplayOrder(input.storeId, input.type),
      metadata: input.metadata ?? {},
      parentId: input.parentId ?? null,
      attributeOptionId: optionId,
      createdAt: NOW,
      updatedAt: NOW,
      option: {
        id: optionId,
        storeId: input.storeId,
        value: input.slug,
        label: input.name,
        sortOrder: 0,
        status: "ACTIVE",
      },
    };
    this.values.set(id, record);
    return record;
  }

  async renameValueAndOption(_storeId: string, id: string, patch: TaxonomyUpdatePatch) {
    const v = this.values.get(id);
    if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
    const updated: TaxonomyValueRecord = {
      ...v,
      name: patch.name !== undefined ? patch.name : v.name,
      metadata: patch.metadata !== undefined ? patch.metadata : v.metadata,
      parentId: patch.parentId !== undefined ? patch.parentId : v.parentId,
      displayOrder: patch.displayOrder !== undefined ? patch.displayOrder : v.displayOrder,
      updatedAt: NOW,
      option: { ...v.option },
    };
    if (patch.name !== undefined) updated.option.label = patch.name;
    this.values.set(id, updated);
    return updated;
  }

  async setStatusBoth(_storeId: string, id: string, status: TaxonomyValueRecord["status"]) {
    const v = this.values.get(id);
    if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
    const updated: TaxonomyValueRecord = { ...v, status, updatedAt: NOW, option: { ...v.option, status } };
    this.values.set(id, updated);
    return updated;
  }

  async reorderBoth(_storeId: string, _type: ProductTaxonomyType, orderedIds: string[]) {
    return orderedIds.map((id) => {
      const v = this.values.get(id);
      if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
      return v;
    });
  }

  async deleteBoth(_storeId: string, id: string) {
    this.values.delete(id);
  }
}

/** Mirror `capabilities-routes.test.ts`'in FakePersistence'ı. */
class FakePersistence implements StoreModulePersistence {
  overrides = new Map<string, ModuleOverrideState>();
  planMetadata: unknown = null;

  async listStoreModuleOverrides(storeId: string) {
    const out: Array<{ moduleKey: string; state: string }> = [];
    for (const [k, state] of this.overrides) {
      const [sid, moduleKey] = k.split("::");
      if (sid === storeId && moduleKey) out.push({ moduleKey, state });
    }
    return out;
  }
  async getActivePlanMetadata() {
    return this.planMetadata;
  }
  async upsertStoreModuleOverride(storeId: string, moduleKey: string, state: "ENABLED" | "DISABLED") {
    this.overrides.set(`${storeId}::${moduleKey}`, state);
  }
  async deleteStoreModuleOverride(storeId: string, moduleKey: string) {
    this.overrides.delete(`${storeId}::${moduleKey}`);
  }
}

function buildHarness(overrides: Partial<CapabilityRoutesDeps> = {}) {
  const persistence = new FakePersistence();
  const taxonomyData = new FakeTaxonomyData(buildDefinitionIds());
  const taxonomyService = createTaxonomyService(taxonomyData);
  const data = createStoreModuleData(persistence);
  const cache = createCapabilityCache(data, { ttlMs: 30_000 });
  const app = Fastify();
  registerCapabilityRoutes(app, {
    data,
    cache,
    requireStoreAdmin: async () => ({ actorUserId: "admin_1" }),
    resolvePublicStore: async (slug) => ({ id: "s1", slug }),
    ensureFashionTaxonomyDefaults: (storeId) => taxonomyService.ensureStoreTaxonomyDefaults(storeId),
    ...overrides,
  });
  return { app, persistence, taxonomyData, taxonomyService, data, cache };
}

function putModule(app: ReturnType<typeof Fastify>, storeId: string, state: string) {
  return app.inject({ method: "PUT", url: `/stores/${storeId}/modules/FASHION_VERTICAL`, payload: { state } });
}

describe("TODO-165A Task 10b — FASHION_VERTICAL enable → taxonomy bootstrap lifecycle", () => {
  it("enable on a store with no taxonomy creates canonical defaults (store-scoped)", async () => {
    const { app, taxonomyService } = buildHarness();
    const res = await putModule(app, "s1", "ENABLED");
    expect(res.statusCode).toBe(200);

    const values = await taxonomyService.list("s1");
    expect(values.length).toBeGreaterThan(0);
    // Kanonik SEASON degerleri arasinda beklenen bir deger var mi (registry-turevli, hard-code
    // sabit sayi yok — yalniz "en az bir tip icin defaults olustu" dogrulaniyor).
    const seasonValues = await taxonomyService.list("s1", "SEASON");
    expect(seasonValues.length).toBeGreaterThan(0);
  });

  it("a store that stays DISABLED never gets taxonomy defaults", async () => {
    const { app, taxonomyService } = buildHarness();
    const res = await putModule(app, "s1", "DISABLED");
    expect(res.statusCode).toBe(200);

    const values = await taxonomyService.list("s1");
    expect(values.length).toBe(0);
  });

  it("disable → enable again does not duplicate canonical defaults", async () => {
    const { app, taxonomyService } = buildHarness();
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);
    const first = await taxonomyService.list("s1");
    expect(first.length).toBeGreaterThan(0);

    expect((await putModule(app, "s1", "DISABLED")).statusCode).toBe(200);
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    const second = await taxonomyService.list("s1");
    expect(second.length).toBe(first.length);
    expect(second.map((v) => v.id).sort()).toEqual(first.map((v) => v.id).sort());
  });

  it("a value manually renamed before disable survives re-enable unchanged", async () => {
    const { app, taxonomyService } = buildHarness();
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    const seasonValues = await taxonomyService.list("s1", "SEASON");
    const target = seasonValues[0];
    const renamed = await taxonomyService.update("s1", target.id, { name: "Özel İsim XYZ" });
    expect(renamed.name).toBe("Özel İsim XYZ");

    expect((await putModule(app, "s1", "DISABLED")).statusCode).toBe(200);
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    const after = await taxonomyService.get("s1", target.id);
    expect(after.name).toBe("Özel İsim XYZ");
    // Bootstrap kanonik degeri ustune yazmadi/duplicate olusturmadi (slug ayni kaldi).
    const stillOne = (await taxonomyService.list("s1", "SEASON")).filter((v) => v.slug === target.slug);
    expect(stillOne.length).toBe(1);
  });

  it("simulated bootstrap failure → enable returns a controlled error AND the store is not left enabled-without-defaults", async () => {
    const { app, data } = buildHarness({
      ensureFashionTaxonomyDefaults: async () => {
        throw new Error("simulated bootstrap failure");
      },
    });

    const res = await putModule(app, "s1", "ENABLED");
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.json().error.code).toBe("TAXONOMY_BOOTSTRAP_FAILED");

    // Fail-closed: mağaza "enabled ama default'suz" sessizce KALMADI — effective durum
    // hala KAPALI (revert edildi).
    expect(await data.isEnabled("s1", "FASHION_VERTICAL")).toBe(false);
  });

  it("bootstrap failure on a store previously explicit-DISABLED reverts to DISABLED exactly (not INHERIT)", async () => {
    const persistence = new FakePersistence();
    const taxonomyData = new FakeTaxonomyData(buildDefinitionIds());
    const taxonomyService = createTaxonomyService(taxonomyData);
    const data = createStoreModuleData(persistence);
    const cache = createCapabilityCache(data, { ttlMs: 30_000 });
    const app = Fastify();
    let shouldFail = false;
    registerCapabilityRoutes(app, {
      data,
      cache,
      requireStoreAdmin: async () => ({ actorUserId: "admin_1" }),
      resolvePublicStore: async (slug) => ({ id: "s1", slug }),
      ensureFashionTaxonomyDefaults: async () => {
        if (shouldFail) throw new Error("simulated");
      },
    });

    // Establish an explicit DISABLED override first.
    expect((await putModule(app, "s1", "DISABLED")).statusCode).toBe(200);
    expect(persistence.overrides.get("s1::FASHION_VERTICAL")).toBe("DISABLED");

    shouldFail = true;
    const res = await putModule(app, "s1", "ENABLED");
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    // Reverted to the EXACT prior override (DISABLED), not deleted (INHERIT).
    expect(persistence.overrides.get("s1::FASHION_VERTICAL")).toBe("DISABLED");
    expect(await data.isEnabled("s1", "FASHION_VERTICAL")).toBe(false);
    void taxonomyService;
  });

  it("existing product assignments (usage) are preserved across disable→enable", async () => {
    const { app, taxonomyService, taxonomyData } = buildHarness();
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    const seasonValues = await taxonomyService.list("s1", "SEASON");
    const target = seasonValues[0];
    taxonomyData.productAttributeValueOptions.push({ attributeOptionId: target.attributeOptionId });
    expect(await taxonomyService.usageCount("s1", target.id)).toBe(1);

    expect((await putModule(app, "s1", "DISABLED")).statusCode).toBe(200);
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    expect(await taxonomyService.usageCount("s1", target.id)).toBe(1);
  });

  it("bootstrap for store A does not touch store B", async () => {
    const { app, taxonomyService } = buildHarness();
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);

    const bValues = await taxonomyService.list("s2");
    expect(bValues.length).toBe(0);
  });

  it("does not re-trigger bootstrap when already enabled (redundant ENABLED save is a no-op edge)", async () => {
    let calls = 0;
    const persistence = new FakePersistence();
    const taxonomyData = new FakeTaxonomyData(buildDefinitionIds());
    const realService = createTaxonomyService(taxonomyData);
    const data = createStoreModuleData(persistence);
    const cache = createCapabilityCache(data, { ttlMs: 30_000 });
    const app = Fastify();
    registerCapabilityRoutes(app, {
      data,
      cache,
      requireStoreAdmin: async () => ({ actorUserId: "admin_1" }),
      resolvePublicStore: async (slug) => ({ id: "s1", slug }),
      ensureFashionTaxonomyDefaults: async (storeId) => {
        calls += 1;
        await realService.ensureStoreTaxonomyDefaults(storeId);
      },
    });

    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);
    expect(calls).toBe(1);
    // Re-saving ENABLED while already effectively ENABLED must NOT re-trigger the hook.
    expect((await putModule(app, "s1", "ENABLED")).statusCode).toBe(200);
    expect(calls).toBe(1);
  });

  it("does not trigger for unrelated module changes", async () => {
    let calls = 0;
    const { app } = buildHarness({
      ensureFashionTaxonomyDefaults: async () => {
        calls += 1;
      },
    });
    expect((await app.inject({ method: "PUT", url: "/stores/s1/modules/REVIEWS", payload: { state: "DISABLED" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: "/stores/s1/modules/REVIEWS", payload: { state: "ENABLED" } })).statusCode).toBe(200);
    expect(calls).toBe(0);
  });
});

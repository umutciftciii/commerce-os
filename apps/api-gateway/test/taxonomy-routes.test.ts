/**
 * TODO-165A (ADR-165A) — Task 10: Governed Product Taxonomy HTTP route entegrasyon
 * testleri. Saf servis/veri-erişim mantığı `taxonomy-service.test.ts`'te (Task 9) kapsandı.
 * Bu dosya HTTP katmanını doğrular: `createServer` + gerçek `registerTaxonomyRoutes`
 * wiring (FASHION_VERTICAL capability gate) + `app.inject`. `TaxonomyDataAccess` yerine
 * hafif in-memory double `dependencies.taxonomyDataAccess` üzerinden enjekte edilir
 * (mirror `brand-routes.test.ts`). FASHION_VERTICAL opt-in (baselineEnabled=false)
 * olduğundan `dataAccess` ayrıca `StoreModulePersistence` yüzeyini (listStoreModuleOverrides/
 * getActivePlanMetadata) taşır ki capability açık/kapalı senaryoları gerçek
 * `requireStoreAdminForModule` + capability cache üzerinden test edilsin (mirror
 * `site-shell-routes.test.ts`).
 *
 * Kapsanan: create→list→get→patch→archive→restore mutlu yol; capability OFF→403
 * MODULE_DISABLED, ON→200; tenant izolasyonu (cross-store id → 403 TAXONOMY_CROSS_STORE);
 * duplicate→409 TAXONOMY_DUPLICATE; delete-in-use→409 TAXONOMY_IN_USE; reorder tam-küme
 * ok + kısmi küme→400 TAXONOMY_REORDER_INCOMPLETE; 401 unauthenticated.
 *
 * TODO-165A Task 10b (reviewer follow-up) — LAZY BOOTSTRAP NOTU: `GET .../product-taxonomy`
 * artık ilk çağrıda `ensureStoreTaxonomyDefaults`'i tetikler (bkz. `taxonomy-routes.ts` dosya
 * başı yorumu — plan-level capability enable'ın store-level eager hook'u bypass edebildiği
 * missed-fire'a karşı self-healing safety-net). Bu, FASHION_VERTICAL açıkken yapılan İLK
 * `GET list` çağrısının o mağaza için TÜM tiplerin kanonik değerlerini de döndüreceği anlamına
 * gelir. Aşağıdaki testler bunu yansıtacak şekilde güncellendi: tip-filtresiz listeler artık
 * "oluşturulan değer mevcut mu" şeklinde (toplamı varsayan `toHaveLength` YERİNE) doğrulanır;
 * tip-filtreli listeler `TAXONOMY_TYPE_REGISTRY[type].canonical.length + özel-oluşturulan sayısı`
 * ile tam sayıyı doğrular (registry büyürse otomatik doğru kalır — sihirli sayı YOK).
 */
import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import {
  TaxonomyOptionConflictError,
  type TaxonomyCreateInput,
  type TaxonomyDataAccess,
  type TaxonomyUpdatePatch,
  type TaxonomyValueRecord,
} from "../src/taxonomy/taxonomy-data.js";
import { TAXONOMY_TYPE_REGISTRY, type ProductTaxonomyType } from "@commerce-os/contracts/product-taxonomy";
import { createStoreAuthDataFake } from "./helpers/store-auth-fixture.js";

const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
  MEDIA_PUBLIC_BASE_URL: "",
};

const STORE_A = "store_a";
const STORE_B = "store_b";

function store(id: string) {
  return {
    id,
    name: `Demo ${id}`,
    slug: id,
    status: "ACTIVE" as const,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const STORES = new Map([
  [STORE_A, store(STORE_A)],
  [STORE_B, store(STORE_B)],
]);

// Faz E2 — Store Admin route'ları StoreUser oturumu ile doğrulanır. Her mağazanın KENDİ token'ı
// vardır: guard session.storeId == path storeId eşleşmesini zorlar. `AUTH` STORE_A'ya, `AUTH_B`
// STORE_B'ye bağlıdır (tenant-izolasyon testleri için — bkz. buildApp storeAuthData).
const AUTH = { authorization: "Bearer admin-token" };
const AUTH_B = { authorization: "Bearer admin-b-token" };
const NOW = new Date("2026-08-01T00:00:00.000Z");

/** Mirror `taxonomy-service.test.ts`'in FakeTaxonomyData'sı (bu Task, HTTP katmanını doğrular). */
class FakeTaxonomyData implements TaxonomyDataAccess {
  values = new Map<string, TaxonomyValueRecord>();
  usageByOption = new Map<string, number>();
  private seq = 0;

  async platformDefinitionIdForCode(code: string) {
    return `def-${code}`;
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
    return this.usageByOption.get(optionId) ?? 0;
  }

  async countUsageBatch(optionIds: string[]) {
    const result: Record<string, number> = {};
    for (const id of optionIds) result[id] = this.usageByOption.get(id) ?? 0;
    return result;
  }

  async createValueWithOption(input: TaxonomyCreateInput): Promise<TaxonomyValueRecord> {
    const dup = this.findBySlugSync(input.storeId, input.type, input.slug);
    if (dup) throw new TaxonomyOptionConflictError();
    this.seq += 1;
    const optionId = `opt-${this.seq}`;
    const id = `tax-${this.seq}`;
    const displayOrder = [...this.values.values()].filter(
      (v) => v.storeId === input.storeId && v.type === input.type,
    ).length;
    const record: TaxonomyValueRecord = {
      id,
      storeId: input.storeId,
      type: input.type,
      name: input.name,
      slug: input.slug,
      status: "ACTIVE",
      displayOrder,
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
        sortOrder: displayOrder,
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
    if (patch.displayOrder !== undefined) updated.option.sortOrder = patch.displayOrder;
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
    const results: TaxonomyValueRecord[] = [];
    orderedIds.forEach((id, i) => {
      const v = this.values.get(id);
      if (!v) throw new Error(`fake: taxonomy value ${id} not found`);
      const updated: TaxonomyValueRecord = { ...v, displayOrder: i, updatedAt: NOW, option: { ...v.option, sortOrder: i } };
      this.values.set(id, updated);
      results.push(updated);
    });
    return results;
  }

  async deleteBoth(_storeId: string, id: string) {
    this.values.delete(id);
  }
}

/** TODO-163 (Faz 2) StoreModulePersistence yüzeyi — FASHION_VERTICAL toggle. */
class FakeModuleOverrides {
  overrides = new Map<string, "ENABLED" | "DISABLED">();

  set(storeId: string, moduleKey: string, state: "ENABLED" | "DISABLED") {
    this.overrides.set(`${storeId}::${moduleKey}`, state);
  }

  async listStoreModuleOverrides(storeId: string) {
    const out: Array<{ moduleKey: string; state: string }> = [];
    for (const [k, state] of this.overrides) {
      const [sid, moduleKey] = k.split("::");
      if (sid === storeId && moduleKey) out.push({ moduleKey, state });
    }
    return out;
  }

  async getActivePlanMetadata() {
    return null;
  }
}

function buildApp(opts: { fashionEnabled?: boolean } = { fashionEnabled: true }) {
  const taxonomyDataAccess = new FakeTaxonomyData();
  const moduleOverrides = new FakeModuleOverrides();
  if (opts.fashionEnabled !== false) {
    moduleOverrides.set(STORE_A, "FASHION_VERTICAL", "ENABLED");
    moduleOverrides.set(STORE_B, "FASHION_VERTICAL", "ENABLED");
  }
  const auditLogs: Array<{ action: string; storeId?: string; entityType: string; entityId?: string }> = [];

  const dataAccess = {
    async findPlatformSessionByTokenHash() {
      return {
        id: "sess_1",
        expiresAt: new Date(Date.now() + 3_600_000),
        // ADR-271 — iki-kapili omur alanlari (gecerli/taze oturum fake'i).
        lastActivityAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        rememberMe: false,
        revokedAt: null,
        platformUser: {
          id: "pu_1",
          email: "admin@commerce-os.dev",
          name: "Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN" as const,
        },
      };
    },
    async findStoreById(id: string) {
      return STORES.get(id) ?? null;
    },
    async createAuditLog(input: { action: string; storeId?: string; entityType: string; entityId?: string }) {
      auditLogs.push(input);
    },
    listStoreModuleOverrides: (storeId: string) => moduleOverrides.listStoreModuleOverrides(storeId),
    getActivePlanMetadata: () => moduleOverrides.getActivePlanMetadata(),
  } as unknown as AppDataAccess;

  const app = createServer(config, {
    dataAccess,
    taxonomyDataAccess,
    storeAuthData: createStoreAuthDataFake(
      [
        { token: "admin-token", storeId: STORE_A, role: "OWNER" },
        { token: "admin-b-token", storeId: STORE_B, role: "OWNER" },
      ],
      config.SESSION_SECRET,
    ),
  });
  return { app, taxonomyDataAccess, moduleOverrides, auditLogs };
}

function taxonomyBody(overrides: Record<string, unknown> = {}) {
  return { type: "SEASON", name: "SS25", ...overrides };
}

describe("Taxonomy routes — capability gate (FASHION_VERTICAL)", () => {
  it("kapaliyken 403 MODULE_DISABLED doner", async () => {
    const { app } = buildApp({ fashionEnabled: false });
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MODULE_DISABLED");
  });

  it("acikken 200 doner", async () => {
    const { app } = buildApp({ fashionEnabled: true });
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  it("Authorization basligi yoksa 401 doner (capability kontrolunden ONCE)", async () => {
    const { app } = buildApp({ fashionEnabled: false });
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/product-taxonomy` });
    expect(res.statusCode).toBe(401);
  });
});

describe("Taxonomy routes — mutlu yol (create → list → get → patch → archive → restore)", () => {
  it("deger olusturur, listeler, tekil getirir, gunceller, arsivler ve geri yukler", async () => {
    const { app, auditLogs } = buildApp();

    const createRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
      payload: taxonomyBody(),
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().data;
    expect(created.type).toBe("SEASON");
    expect(created.name).toBe("SS25");
    expect(created.slug).toBe("ss25");
    expect(created.status).toBe("ACTIVE");
    expect(created.displayOrder).toBe(0);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({ action: "CREATE", entityType: "ProductTaxonomyValue", entityId: created.id }),
    );

    const listRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(listRes.statusCode).toBe(200);
    // TODO-165A Task 10b — bu, FASHION_VERTICAL açıkken store için İLK `GET list` çağrısı; lazy
    // bootstrap tetiklenir ve TÜM tiplerin kanonik değerleri de oluşur (yalnız "SS25" değil).
    // "Boşluk varsayan" toHaveLength(1) YERİNE: (a) oluşturulan değerin listede olduğunu, (b)
    // toplamın registry'den türetilmiş GERÇEK sayıya (kanonik toplam + 1 özel değer) eşit
    // olduğunu doğrula — sihirli sayı yok, registry büyürse test otomatik doğru kalır.
    const totalCanonicalAcrossAllTypes = Object.values(TAXONOMY_TYPE_REGISTRY).reduce(
      (sum, def) => sum + def.canonical.length,
      0,
    );
    expect(listRes.json().pagination.totalItems).toBe(totalCanonicalAcrossAllTypes + 1);
    expect(listRes.json().data.some((v: { id: string }) => v.id === created.id)).toBe(true);

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.id).toBe(created.id);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
      payload: { name: "İlkbahar/Yaz 2025" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.name).toBe("İlkbahar/Yaz 2025");
    expect(patchRes.json().data.slug).toBe("ss25"); // IMMUTABLE

    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}/archive`,
      headers: AUTH,
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.status).toBe("ARCHIVED");

    const restoreRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}/restore`,
      headers: AUTH,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.status).toBe("ACTIVE");
  });

  it("PATCH ile status da (archive/restore'a translate edilerek) degistirilebilir", async () => {
    const { app } = buildApp();
    const created = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: taxonomyBody() })
    ).json().data;

    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
      payload: { status: "ARCHIVED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("ARCHIVED");
  });

  it("list ?type=&status=&search= filtreler", async () => {
    const { app } = buildApp();
    const season = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: taxonomyBody({ name: "SS25" }),
      })
    ).json().data;
    // TODO-165A Task 10b — "Pamuk" KASITLI OLARAK kullanılmıyor: MATERIAL kanoniklerinde AYNI
    // görünen ad var ("Pamuk", slug "cotton") ve lazy bootstrap (aşağıdaki ilk GET) onu da
    // oluşturacağından "search=pamuk" iki satırla eşleşirdi. Ayırt edici, hiçbir kanonik adla
    // çakışmayan bir isim kullanılıyor.
    const material = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Test Özel Malzeme Q9" },
      })
    ).json().data;
    await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/${material.id}/archive`,
      headers: AUTH,
    });

    // TODO-165A Task 10b — bu, store için İLK `GET list` çağrısı → lazy bootstrap tetiklenir ve
    // SEASON'ın kanonik değerleri de (kendi tipinde) oluşur. toHaveLength(1) YERİNE registry'den
    // türetilmiş gerçek toplam (kanonik + 1 özel değer) + oluşturulan değerin varlığı doğrulanır.
    const byType = await app.inject({ method: "GET", url: `/stores/${STORE_A}/product-taxonomy?type=SEASON`, headers: AUTH });
    const seasonCanonicalCount = TAXONOMY_TYPE_REGISTRY.SEASON.canonical.length;
    expect(byType.json().data).toHaveLength(seasonCanonicalCount + 1);
    expect(byType.json().data.every((v: { type: string }) => v.type === "SEASON")).toBe(true);
    expect(byType.json().data.some((v: { id: string }) => v.id === season.id)).toBe(true);

    // status=ARCHIVED — kanonik değerler her zaman ACTIVE oluşturulur (bootstrap onları
    // arşivlemez), bu yüzden bu filtre bootstrap'tan ETKİLENMEZ: hâlâ tam olarak 1 sonuç.
    const byStatus = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?status=ARCHIVED`,
      headers: AUTH,
    });
    expect(byStatus.json().data).toHaveLength(1);
    expect(byStatus.json().data[0].id).toBe(material.id);

    const bySearch = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?search=q9`,
      headers: AUTH,
    });
    expect(bySearch.json().data).toHaveLength(1);
    expect(bySearch.json().data[0].id).toBe(material.id);
  });
});

describe("TODO-165A Task 10b — lazy taxonomy bootstrap safety-net (GET list)", () => {
  it("mağaza taksonomisi boşken FASHION_VERTICAL açıkken İLK GET list kanonik defaultları döndürür; ikinci çağrı idempotent (dupe yok)", async () => {
    const { app } = buildApp({ fashionEnabled: true });

    const first = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(first.statusCode).toBe(200);
    const totalCanonicalAcrossAllTypes = Object.values(TAXONOMY_TYPE_REGISTRY).reduce(
      (sum, def) => sum + def.canonical.length,
      0,
    );
    expect(first.json().pagination.totalItems).toBe(totalCanonicalAcrossAllTypes);
    // Bir kanonik SEASON değeri gerçekten mevcut mu (ör. "İlkbahar/Yaz", slug "ss").
    const seasonFirst = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?type=SEASON`,
      headers: AUTH,
    });
    expect(seasonFirst.json().data).toHaveLength(TAXONOMY_TYPE_REGISTRY.SEASON.canonical.length);
    const firstIds = seasonFirst.json().data.map((v: { id: string }) => v.id).sort();

    // İkinci çağrı — idempotent olmalı: ayni toplam, ayni id kümesi (dupe YOK).
    const second = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(second.json().pagination.totalItems).toBe(totalCanonicalAcrossAllTypes);
    const seasonSecond = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?type=SEASON`,
      headers: AUTH,
    });
    const secondIds = seasonSecond.json().data.map((v: { id: string }) => v.id).sort();
    expect(secondIds).toEqual(firstIds);
  });

  it("FASHION_VERTICAL kapalıyken lazy net tetiklenmez (403, defaults oluşmaz)", async () => {
    const { app } = buildApp({ fashionEnabled: false });
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("TODO-165A Task 24 — usageCount (store-admin 'Ürün Sözlükleri' ekranı)", () => {
  it("create doner usageCount=0 (taze option, sorgusuz); usage arttiginda GET list + GET tekil yansitir", async () => {
    const { app, taxonomyDataAccess } = buildApp();
    const created = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: taxonomyBody(),
      })
    ).json().data;
    expect(created.usageCount).toBe(0);

    taxonomyDataAccess.usageByOption.set(created.attributeOptionId, 3);

    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(getRes.json().data.usageCount).toBe(3);

    const listRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?type=SEASON`,
      headers: AUTH,
    });
    const row = listRes.json().data.find((v: { id: string }) => v.id === created.id);
    expect(row.usageCount).toBe(3);
    // Kanonik (henuz kullanilmamis) bir SEASON degeri hala 0 olmali (harita hatalica sabit
    // dolmadi — yalniz gercekten kullanimda olan yukseldi).
    const untouched = listRes.json().data.find((v: { id: string }) => v.id !== created.id);
    expect(untouched.usageCount).toBe(0);
  });

  it("archive/restore/patch yaniti da guncel usageCount tasir", async () => {
    const { app, taxonomyDataAccess } = buildApp();
    const created = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: taxonomyBody() })
    ).json().data;
    taxonomyDataAccess.usageByOption.set(created.attributeOptionId, 2);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
      payload: { name: "Yeni Ad" },
    });
    expect(patchRes.json().data.usageCount).toBe(2);

    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}/archive`,
      headers: AUTH,
    });
    expect(archiveRes.json().data.usageCount).toBe(2);

    const restoreRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}/restore`,
      headers: AUTH,
    });
    expect(restoreRes.json().data.usageCount).toBe(2);
  });

  it("reorder yaniti da usageCount tasir", async () => {
    const { app, taxonomyDataAccess } = buildApp();
    const a = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: { type: "MATERIAL", name: "Pamuk" } })
    ).json().data;
    const b = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: { type: "MATERIAL", name: "Yün" } })
    ).json().data;
    taxonomyDataAccess.usageByOption.set(a.attributeOptionId, 5);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/reorder`,
      headers: AUTH,
      payload: { type: "MATERIAL", orderedIds: [b.id, a.id] },
    });
    const rowA = res.json().data.find((v: { id: string }) => v.id === a.id);
    const rowB = res.json().data.find((v: { id: string }) => v.id === b.id);
    expect(rowA.usageCount).toBe(5);
    expect(rowB.usageCount).toBe(0);
  });
});

describe("Taxonomy routes — 409 duplicate", () => {
  it("ayni magaza+tipte ayni isim/slug ikinci kez olusturulamaz (TAXONOMY_DUPLICATE)", async () => {
    const { app } = buildApp();
    await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: taxonomyBody() });
    const dupRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
      payload: taxonomyBody(),
    });
    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error.code).toBe("TAXONOMY_DUPLICATE");
  });
});

describe("Taxonomy routes — tenant izolasyonu", () => {
  it("baska magazanin deger id'si icin GET/PATCH/archive 403 TAXONOMY_CROSS_STORE doner", async () => {
    const { app } = buildApp();
    const created = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: taxonomyBody() })
    ).json().data;

    // Faz E2 — İstek STORE_B path'ine STORE_B'nin KENDİ token'ıyla (AUTH_B) gelir: auth guard
    // geçer (session.storeId==store_b), ardından DOMAIN katmanı değerin store_a'ya ait olduğunu
    // görüp 403 TAXONOMY_CROSS_STORE üretir (auth guard'ın 404'ü DEĞİL).
    const getRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_B}/product-taxonomy/${created.id}`,
      headers: AUTH_B,
    });
    expect(getRes.statusCode).toBe(403);
    expect(getRes.json().error.code).toBe("TAXONOMY_CROSS_STORE");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE_B}/product-taxonomy/${created.id}`,
      headers: AUTH_B,
      payload: { name: "Hijack" },
    });
    expect(patchRes.statusCode).toBe(403);
    expect(patchRes.json().error.code).toBe("TAXONOMY_CROSS_STORE");

    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_B}/product-taxonomy/${created.id}/archive`,
      headers: AUTH_B,
    });
    expect(archiveRes.statusCode).toBe(403);

    // Store A'dan bakildiginda hala erisilebilir.
    const ownRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(ownRes.statusCode).toBe(200);
  });
});

describe("Taxonomy routes — 409 delete-in-use", () => {
  it("kullanimda olan bir deger silinemez (TAXONOMY_IN_USE); kullanimda degilse 204", async () => {
    const { app, taxonomyDataAccess } = buildApp();
    const created = (
      await app.inject({ method: "POST", url: `/stores/${STORE_A}/product-taxonomy`, headers: AUTH, payload: taxonomyBody() })
    ).json().data;
    taxonomyDataAccess.usageByOption.set(created.attributeOptionId, 1);

    const inUseRes = await app.inject({
      method: "DELETE",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(inUseRes.statusCode).toBe(409);
    expect(inUseRes.json().error.code).toBe("TAXONOMY_IN_USE");

    taxonomyDataAccess.usageByOption.set(created.attributeOptionId, 0);
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(deleteRes.statusCode).toBe(204);

    const getAfterDelete = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy/${created.id}`,
      headers: AUTH,
    });
    expect(getAfterDelete.statusCode).toBe(404);
    expect(getAfterDelete.json().error.code).toBe("TAXONOMY_NOT_FOUND");
  });
});

describe("Taxonomy routes — reorder", () => {
  it("tam ACTIVE kumesi verilirse 200 + displayOrder/sortOrder yeniden ayarlanir", async () => {
    const { app } = buildApp();
    const a = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Pamuk" },
      })
    ).json().data;
    const b = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Yün" },
      })
    ).json().data;
    const c = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Keten" },
      })
    ).json().data;

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/reorder`,
      headers: AUTH,
      payload: { type: "MATERIAL", orderedIds: [c.id, a.id, b.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((v: { id: string }) => v.id)).toEqual([c.id, a.id, b.id]);
    expect(res.json().data.map((v: { displayOrder: number }) => v.displayOrder)).toEqual([0, 1, 2]);
  });

  it("kismi kume (bir id eksik) -> 400 TAXONOMY_REORDER_INCOMPLETE; hicbir sey degismez", async () => {
    const { app } = buildApp();
    const a = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Pamuk" },
      })
    ).json().data;
    const b = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Yün" },
      })
    ).json().data;
    await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy`,
      headers: AUTH,
      payload: { type: "MATERIAL", name: "Keten" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/reorder`,
      headers: AUTH,
      payload: { type: "MATERIAL", orderedIds: [b.id, a.id] }, // "Keten" eksik
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("TAXONOMY_REORDER_INCOMPLETE");

    // Hicbir kaydin displayOrder'i degismedi (a hala 0, b hala 1).
    const listRes = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/product-taxonomy?type=MATERIAL`,
      headers: AUTH,
    });
    const byId = new Map(listRes.json().data.map((v: { id: string; displayOrder: number }) => [v.id, v.displayOrder]));
    expect(byId.get(a.id)).toBe(0);
    expect(byId.get(b.id)).toBe(1);
  });

  it("fazla id (baska tipe/bilinmeyen id) -> 400 TAXONOMY_REORDER_INCOMPLETE", async () => {
    const { app } = buildApp();
    const a = (
      await app.inject({
        method: "POST",
        url: `/stores/${STORE_A}/product-taxonomy`,
        headers: AUTH,
        payload: { type: "MATERIAL", name: "Pamuk" },
      })
    ).json().data;

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/product-taxonomy/reorder`,
      headers: AUTH,
      payload: { type: "MATERIAL", orderedIds: [a.id, "does-not-exist"] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("TAXONOMY_REORDER_INCOMPLETE");
  });
});

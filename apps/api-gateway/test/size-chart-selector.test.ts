/**
 * TODO-165A (ADR-165A) Task 13 — Size-chart SEÇİCİ ucu + atama (assign) kural testleri.
 *
 * Saf servis/veri-erişim mantığı `fashion-size-chart-service.test.ts`'te kapsandı. Bu dosya
 * HTTP katmanını doğrular: `createServer` + gerçek `registerSizeChartRoutes` wiring
 * (FASHION_VERTICAL capability gate) + `app.inject` (mirror `taxonomy-routes.test.ts` /
 * `brand-routes.test.ts`). `SizeChartDataAccess` yerine hafif in-memory double
 * `dependencies.sizeChartDataAccess` üzerinden enjekte edilir.
 *
 * Kapsanan:
 *  - `/size-charts/selector` STATİK yolu — capability OFF→403 MODULE_DISABLED
 *  - seçici yalnız mağazanın kendi chart'larını listeler (tenant izolasyonu)
 *  - `status=PUBLISHED` filtresi
 *  - `?ids=` çözüm modu — istemci SIRASI korunur, başka mağazanın id'si SESSİZCE düşer
 *  - `previewSummary` (yayınlanmış revizyon sütun×satır sayısı) dolu gelir
 *  - §9 atama kuralları: YAYINLANMAMIŞ (DRAFT) chart atanamaz → 400; ARŞİVLİ chart
 *    atanamaz → 400; aynı ürün için İKİNCİ PRODUCT-scope atama İLKİNİ DEĞİŞTİRİR
 *    (yeni chart'a taşınır, eski chart'ta artık atama YOKTUR); cross-store ürün/kategori
 *    ataması reddedilir → 403 SIZE_CHART_ASSIGN_CROSS_STORE.
 */
import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import type {
  SizeChartAssignmentRecord,
  SizeChartDataAccess,
  SizeChartRecord,
  SizeChartRevisionRecord,
} from "../src/fashion/size-chart-service.js";

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

const AUTH = { authorization: "Bearer admin-token" };
const NOW = new Date("2026-08-01T00:00:00.000Z");

const COLS = [
  { key: "chest", label: "Göğüs", unit: "cm" },
  { key: "waist", label: "Bel", unit: "cm" },
];
const ROWS = [
  { size: "S", cells: { chest: 90, waist: 70 } },
  { size: "M", cells: { chest: 96, waist: 76 } },
  { size: "L", cells: { chest: 102, waist: 82 } },
];

/** Mirror `fashion-size-chart-service.test.ts`'in FakeData'sı + `selector` + DÜZELTİLMİŞ upsert. */
class FakeSizeChartData implements SizeChartDataAccess {
  charts = new Map<string, SizeChartRecord>();
  revisions: (SizeChartRevisionRecord & { storeId: string; sizeChartId: string })[] = [];
  assignments: (SizeChartAssignmentRecord & { storeId: string; sizeChartId: string })[] = [];
  categories = new Set<string>();
  products = new Set<string>();
  seq = 0;

  private key(storeId: string, id: string) {
    return `${storeId}|${id}`;
  }

  private hydrate(c: SizeChartRecord): SizeChartRecord {
    return {
      ...c,
      assignments: this.assignments
        .filter((a) => a.storeId === c.storeId && a.sizeChartId === c.id)
        .map((a) => ({ id: a.id, scope: a.scope, categoryId: a.categoryId, productId: a.productId })),
      publishedRevision: c.publishedRevisionId
        ? this.revisions.find((r) => r.id === c.publishedRevisionId) ?? null
        : null,
    };
  }

  async list(storeId: string) {
    return [...this.charts.values()].filter((c) => c.storeId === storeId).map((c) => this.hydrate(c));
  }

  async get(storeId: string, id: string) {
    const c = this.charts.get(this.key(storeId, id));
    return c ? this.hydrate(c) : null;
  }

  async create(input: Parameters<SizeChartDataAccess["create"]>[0]) {
    const id = `chart-${++this.seq}`;
    const rec: SizeChartRecord = {
      id,
      storeId: input.storeId,
      name: input.name,
      sizeSystemKey: input.sizeSystemKey,
      measurementUnit: input.measurementUnit,
      gender: input.gender,
      locale: input.locale,
      status: "DRAFT",
      publishedRevisionId: null,
      draftColumns: input.draftColumns,
      draftRows: input.draftRows,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.charts.set(this.key(input.storeId, id), rec);
    return this.hydrate(rec);
  }

  async updateDraft(storeId: string, id: string, patch: Parameters<SizeChartDataAccess["updateDraft"]>[2]) {
    const rec = this.charts.get(this.key(storeId, id))!;
    Object.assign(rec, {
      name: patch.name ?? rec.name,
      measurementUnit: patch.measurementUnit ?? rec.measurementUnit,
      gender: patch.gender === undefined ? rec.gender : patch.gender,
      locale: patch.locale === undefined ? rec.locale : patch.locale,
      draftColumns: patch.draftColumns ?? rec.draftColumns,
      draftRows: patch.draftRows ?? rec.draftRows,
    });
    return this.hydrate(rec);
  }

  async publish(storeId: string, id: string, snapshot: Parameters<SizeChartDataAccess["publish"]>[2]) {
    const rec = this.charts.get(this.key(storeId, id))!;
    const revNo = this.revisions.filter((r) => r.sizeChartId === id).length + 1;
    const rev = {
      id: `rev-${id}-${revNo}`,
      revision: revNo,
      columns: snapshot.columns,
      rows: snapshot.rows,
      locale: snapshot.locale,
      createdAt: NOW,
      storeId,
      sizeChartId: id,
    };
    this.revisions.push(rev);
    rec.publishedRevisionId = rev.id;
    rec.status = "PUBLISHED";
    return this.hydrate(rec);
  }

  async getRevision(_storeId: string, _chartId: string, revisionId: string) {
    return this.revisions.find((r) => r.id === revisionId) ?? null;
  }

  async setStatus(storeId: string, id: string, status: SizeChartRecord["status"]) {
    const rec = this.charts.get(this.key(storeId, id))!;
    rec.status = status;
    return this.hydrate(rec);
  }

  async rollback(storeId: string, id: string, revision: SizeChartRevisionRecord) {
    const rec = this.charts.get(this.key(storeId, id))!;
    rec.publishedRevisionId = revision.id;
    rec.draftColumns = revision.columns;
    rec.draftRows = revision.rows;
    rec.status = "PUBLISHED";
    return this.hydrate(rec);
  }

  /**
   * DÜZELTİLMİŞ semantik (bkz. `size-chart-data.ts` prod fix): tekillik anahtarı
   * (storeId, scope, categoryId, productId)'dir — sizeChartId DAHİL DEĞİLDİR (DB
   * unique index @@unique([storeId,scope,categoryId,productId]) ile birebir). Bu
   * sayede aynı hedefe İKİNCİ farklı chart ataması, önceki satırı YENİ chart'a
   * TAŞIR (yeni satır yaratıp unique-constraint ihlali üretmez).
   */
  async upsertAssignment(input: Parameters<SizeChartDataAccess["upsertAssignment"]>[0]) {
    const existing = this.assignments.find(
      (a) =>
        a.storeId === input.storeId &&
        a.scope === input.scope &&
        a.categoryId === input.categoryId &&
        a.productId === input.productId,
    );
    if (existing) {
      existing.sizeChartId = input.sizeChartId;
      return { id: existing.id, scope: existing.scope, categoryId: existing.categoryId, productId: existing.productId };
    }
    const row = {
      id: `asg-${++this.seq}`,
      scope: input.scope,
      categoryId: input.categoryId,
      productId: input.productId,
      storeId: input.storeId,
      sizeChartId: input.sizeChartId,
    };
    this.assignments.push(row);
    return row;
  }

  async removeAssignment(storeId: string, sizeChartId: string, assignmentId: string) {
    this.assignments = this.assignments.filter(
      (a) => !(a.storeId === storeId && a.sizeChartId === sizeChartId && a.id === assignmentId),
    );
  }

  async categoryExists(storeId: string, categoryId: string) {
    return this.categories.has(`${storeId}|${categoryId}`);
  }

  async productExists(storeId: string, productId: string) {
    return this.products.has(`${storeId}|${productId}`);
  }

  async findProductAssignment(storeId: string, productId: string) {
    const a = this.assignments.find(
      (entry) => entry.storeId === storeId && entry.scope === "PRODUCT" && entry.productId === productId,
    );
    return a ? { assignmentId: a.id, sizeChartId: a.sizeChartId } : null;
  }

  async findResolutionCandidates(storeId: string, productId: string, categoryId: string | null) {
    return this.assignments
      .filter(
        (a) =>
          a.storeId === storeId &&
          ((a.scope === "PRODUCT" && a.productId === productId) ||
            (a.scope === "CATEGORY" && categoryId !== null && a.categoryId === categoryId) ||
            a.scope === "STORE"),
      )
      .map((a) => ({ scope: a.scope, sizeChartId: a.sizeChartId }));
  }

  async getResolutionMeta(storeId: string, id: string) {
    const c = this.charts.get(this.key(storeId, id));
    if (!c) return null;
    const { id: cid, name, sizeSystemKey, measurementUnit, gender, status, publishedRevisionId } = c;
    return { id: cid, name, sizeSystemKey, measurementUnit, gender, status, publishedRevisionId };
  }

  async selector(storeId: string, criteria: Parameters<SizeChartDataAccess["selector"]>[1]) {
    if (criteria.ids && criteria.ids.length > 0) {
      const data = criteria.ids
        .map((id) => this.charts.get(this.key(storeId, id)))
        .filter((c): c is SizeChartRecord => !!c)
        .map((c) => this.hydrate(c));
      return { data, total: data.length };
    }
    let all = [...this.charts.values()].filter((c) => c.storeId === storeId);
    if (criteria.status) all = all.filter((c) => c.status === criteria.status);
    if (criteria.search) {
      const needle = criteria.search.toLowerCase();
      all = all.filter((c) => c.name.toLowerCase().includes(needle));
    }
    const sortBy = criteria.sortBy ?? "name";
    const order = criteria.sortOrder === "desc" ? -1 : 1;
    const sorted = [...all].sort((a, b) => {
      const av = sortBy === "name" ? a.name : a.createdAt.getTime();
      const bv = sortBy === "name" ? b.name : b.createdAt.getTime();
      if (av < bv) return -1 * order;
      if (av > bv) return 1 * order;
      return 0;
    });
    const total = sorted.length;
    const page = sorted.slice(criteria.offset, criteria.offset + criteria.limit).map((c) => this.hydrate(c));
    return { data: page, total };
  }
}

/** TODO-163 (Faz 2) StoreModulePersistence yüzeyi — FASHION_VERTICAL toggle (mirror taxonomy-routes.test.ts). */
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
  const sizeChartDataAccess = new FakeSizeChartData();
  const moduleOverrides = new FakeModuleOverrides();
  if (opts.fashionEnabled !== false) {
    moduleOverrides.set(STORE_A, "FASHION_VERTICAL", "ENABLED");
    moduleOverrides.set(STORE_B, "FASHION_VERTICAL", "ENABLED");
  }

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
    async createAuditLog() {
      // no-op
    },
    listStoreModuleOverrides: (storeId: string) => moduleOverrides.listStoreModuleOverrides(storeId),
    getActivePlanMetadata: () => moduleOverrides.getActivePlanMetadata(),
  } as unknown as AppDataAccess;

  const app = createServer(config, { dataAccess, sizeChartDataAccess });
  return { app, sizeChartDataAccess };
}

async function createChart(app: ReturnType<typeof createServer>, storeId: string, name: string) {
  const res = await app.inject({
    method: "POST",
    url: `/stores/${storeId}/size-charts`,
    headers: AUTH,
    payload: { name, sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string };
}

async function publishChart(app: ReturnType<typeof createServer>, storeId: string, id: string) {
  const res = await app.inject({ method: "POST", url: `/stores/${storeId}/size-charts/${id}/publish`, headers: AUTH });
  expect(res.statusCode).toBe(200);
  return res.json().data;
}

describe("Size-chart routes — capability gate (FASHION_VERTICAL)", () => {
  it("kapaliyken 403 MODULE_DISABLED doner", async () => {
    const { app } = buildApp({ fashionEnabled: false });
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/selector`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MODULE_DISABLED");
  });
});

describe("Size-chart selector — /size-charts/selector (STATIK, /:id'den ONCE)", () => {
  it("yalniz mağazanin kendi chart'larini listeler (tenant izolasyonu)", async () => {
    const { app } = buildApp();
    await createChart(app, STORE_A, "A Chart");
    await createChart(app, STORE_B, "B Chart");

    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/size-charts/selector`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("A Chart");
  });

  it("status=PUBLISHED filtresi yalniz yayinlanmis chart'lari doner", async () => {
    const { app } = buildApp();
    const draft = await createChart(app, STORE_A, "Draft Chart");
    const published = await createChart(app, STORE_A, "Published Chart");
    await publishChart(app, STORE_A, published.id);
    void draft;

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/selector?status=PUBLISHED`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(published.id);
    expect(body.data[0].status).toBe("PUBLISHED");
  });

  it("previewSummary yayinlanmis revizyonun sutun x satir sayisiyla dolu gelir", async () => {
    const { app } = buildApp();
    const chart = await createChart(app, STORE_A, "Preview Chart");
    await publishChart(app, STORE_A, chart.id);

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/selector?ids=${chart.id}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const option = res.json().data[0];
    expect(option.previewSummary).toBe(`${COLS.length} sütun × ${ROWS.length} satır`);
    expect(option.revision).toBe(1);
    expect(option.publishedRevisionId).toBeTruthy();
  });

  it("?ids= istemci SIRASINI korur ve baska magazanin id'sini sessizce dusurur", async () => {
    const { app } = buildApp();
    const a1 = await createChart(app, STORE_A, "A1");
    const a2 = await createChart(app, STORE_A, "A2");
    const b1 = await createChart(app, STORE_B, "B1 (baska magaza)");

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/selector?ids=${a2.id},${b1.id},${a1.id}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // b1 (baska magaza) dusurulur; a2, a1 istemci sirasinda kalir.
    expect(body.data.map((d: { id: string }) => d.id)).toEqual([a2.id, a1.id]);
    expect(body.pagination.totalItems).toBe(2);
  });

  it("aramada bulunamayan bos sonuc doner", async () => {
    const { app } = buildApp();
    await createChart(app, STORE_A, "Bir Şey");
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/selector?search=hicbirsey`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe("Size-chart assignment rules (§9) — assign", () => {
  it("YAYINLANMAMIŞ (DRAFT) chart urune baglanamaz -> 400", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.products.add(`${STORE_A}|prod-1`);
    const draft = await createChart(app, STORE_A, "Draft Chart");

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${draft.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SIZE_CHART_ASSIGN_NOT_PUBLISHED");
  });

  it("ARSIVLI chart urune baglanamaz -> 400 (yayinlanmis olsa dahi)", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.products.add(`${STORE_A}|prod-1`);
    const chart = await createChart(app, STORE_A, "Will Archive");
    await publishChart(app, STORE_A, chart.id);
    const archiveRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/archive`,
      headers: AUTH,
    });
    expect(archiveRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SIZE_CHART_ASSIGN_NOT_PUBLISHED");
  });

  it("ayni urun icin IKINCI PRODUCT-scope atama ILKINI DEGISTIRIR (eski chart'ta atama kalmaz)", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.products.add(`${STORE_A}|prod-1`);
    const chart1 = await createChart(app, STORE_A, "Chart 1");
    const chart2 = await createChart(app, STORE_A, "Chart 2");
    await publishChart(app, STORE_A, chart1.id);
    await publishChart(app, STORE_A, chart2.id);

    const first = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart1.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.assignments).toHaveLength(1);

    const second = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart2.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.assignments).toHaveLength(1);
    expect(second.json().data.assignments[0].productId).toBe("prod-1");

    // Eski chart (chart1) artik bu urun icin atama TASIMAZ (tasindi, cogaltilmadi).
    const chart1After = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/size-charts/${chart1.id}`,
      headers: AUTH,
    });
    expect(chart1After.json().data.assignments).toHaveLength(0);
  });

  it("cross-store urun ataması reddedilir -> 403 SIZE_CHART_ASSIGN_CROSS_STORE", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    // "prod-x" yalniz STORE_B'de var; STORE_A'nin chart'i bunu goremez.
    sizeChartDataAccess.products.add(`${STORE_B}|prod-x`);
    const chart = await createChart(app, STORE_A, "Chart");
    await publishChart(app, STORE_A, chart.id);

    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-x" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SIZE_CHART_ASSIGN_CROSS_STORE");
  });
});

/**
 * TODO-165A Tasks 25/26 — `GET /stores/:storeId/products/:productId/size-chart-assignment`.
 * Ürün formunun "güncel bağlantı" kartı bu ucu okur: PRODUCT-scope doğrudan atama +
 * PRODUCT>CATEGORY>STORE önceliğiyle ÇÖZÜLMÜŞ etkin chart (`resolveEffective` —
 * `size-chart-selector.test.ts`'in ana FakeSizeChartData'sı reddedilen/kabul edilen
 * atama testleriyle AYNI double'ı kullanır).
 */
describe("GET .../products/:productId/size-chart-assignment (Task 25/26)", () => {
  it("kapaliyken 403 MODULE_DISABLED doner", async () => {
    const { app } = buildApp({ fashionEnabled: false });
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-1/size-chart-assignment`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MODULE_DISABLED");
  });

  it("atama yoksa iki alan da null doner", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-none/size-chart-assignment`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ productAssignment: null, effective: null });
  });

  it("PRODUCT-scope doğrudan atama VE effective (scope=PRODUCT) birlikte doner", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.products.add(`${STORE_A}|prod-1`);
    const chart = await createChart(app, STORE_A, "Ürün Tablosu");
    await publishChart(app, STORE_A, chart.id);
    const assignRes = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });
    expect(assignRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-1/size-chart-assignment`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.productAssignment.chart.id).toBe(chart.id);
    expect(body.productAssignment.assignmentId).toBeTruthy();
    expect(body.effective.scope).toBe("PRODUCT");
    expect(body.effective.chart.id).toBe(chart.id);
  });

  it("PRODUCT ataması yokken, ?categoryId= verilirse effective CATEGORY'ye düşer (productAssignment null kalır)", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.categories.add(`${STORE_A}|cat-1`);
    const chart = await createChart(app, STORE_A, "Kategori Tablosu");
    await publishChart(app, STORE_A, chart.id);
    await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "CATEGORY", categoryId: "cat-1" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-1/size-chart-assignment?categoryId=cat-1`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.productAssignment).toBeNull();
    expect(body.effective.scope).toBe("CATEGORY");
    expect(body.effective.chart.id).toBe(chart.id);
  });

  it("categoryId verilmezse CATEGORY ataması ARANMAZ (effective null)", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.categories.add(`${STORE_A}|cat-1`);
    const chart = await createChart(app, STORE_A, "Kategori Tablosu");
    await publishChart(app, STORE_A, chart.id);
    await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "CATEGORY", categoryId: "cat-1" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-1/size-chart-assignment`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.effective).toBeNull();
  });

  it("başka mağazanın ataması GÖRÜNMEZ (tenant izolasyonu)", async () => {
    const { app, sizeChartDataAccess } = buildApp();
    sizeChartDataAccess.products.add(`${STORE_B}|prod-1`);
    const chart = await createChart(app, STORE_B, "B Tablosu");
    await publishChart(app, STORE_B, chart.id);
    await app.inject({
      method: "POST",
      url: `/stores/${STORE_B}/size-charts/${chart.id}/assignments`,
      headers: AUTH,
      payload: { scope: "PRODUCT", productId: "prod-1" },
    });

    // Aynı productId, farklı mağaza (STORE_A) — hiçbir şey görünmemeli.
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/products/prod-1/size-chart-assignment`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ productAssignment: null, effective: null });
  });
});

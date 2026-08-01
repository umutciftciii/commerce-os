// TODO-165 Fashion Vertical (ADR-249) — Size Chart servisi testleri (fake dataAccess).
import { describe, it, expect, beforeEach } from "vitest";
import {
  createSizeChartService,
  validateSizeChartContent,
  SizeChartError,
  type SizeChartDataAccess,
  type SizeChartRecord,
  type SizeChartRevisionRecord,
  type SizeChartAssignmentRecord,
} from "../src/fashion/size-chart-service.js";
// TODO-165A Tasks 25/26 (coordinator review) — PUBLIC storefront PDP resolution path
// coverage. `resolvePublishedSizeChart` (public-projection.ts) delegates precedence to
// `SizeChartService.resolveEffective`; bu dosyanın gerçek `createSizeChartService` + fake
// dataAccess'i AYNI şekilde kullanılır (paralel bir fixture seti YAZILMAZ).
import { resolvePublishedSizeChart } from "../src/fashion/public-projection.js";

const NOW = new Date("2026-07-31T00:00:00Z");

class FakeData implements SizeChartDataAccess {
  charts = new Map<string, SizeChartRecord>();
  revisions: SizeChartRevisionRecord[] = [];
  assignments: (SizeChartAssignmentRecord & { storeId: string; sizeChartId: string })[] = [];
  categories = new Set<string>(["s1|cat-a"]);
  products = new Set<string>(["s1|prod-a"]);
  seq = 0;

  private key(storeId: string, id: string) {
    return `${storeId}|${id}`;
  }
  async list(storeId: string) {
    return [...this.charts.values()].filter((c) => c.storeId === storeId);
  }
  async get(storeId: string, id: string) {
    const c = this.charts.get(this.key(storeId, id));
    if (!c) return null;
    return {
      ...c,
      assignments: this.assignments.filter((a) => a.storeId === storeId && a.sizeChartId === id),
      publishedRevision: c.publishedRevisionId
        ? this.revisions.find((r) => r.id === c.publishedRevisionId) ?? null
        : null,
    };
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
    return rec;
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
    return rec;
  }
  async publish(storeId: string, id: string, snapshot: Parameters<SizeChartDataAccess["publish"]>[2]) {
    const rec = this.charts.get(this.key(storeId, id))!;
    const revNo = this.revisions.filter((r) => r.id.startsWith(`rev-${id}-`)).length + 1;
    const rev: SizeChartRevisionRecord = {
      id: `rev-${id}-${revNo}`,
      revision: revNo,
      columns: snapshot.columns,
      rows: snapshot.rows,
      locale: snapshot.locale,
      createdAt: NOW,
    };
    this.revisions.push(rev);
    rec.publishedRevisionId = rev.id;
    rec.status = "PUBLISHED";
    return rec;
  }
  async getRevision(_storeId: string, _chartId: string, revisionId: string) {
    return this.revisions.find((r) => r.id === revisionId) ?? null;
  }
  async setStatus(storeId: string, id: string, status: SizeChartRecord["status"]) {
    const rec = this.charts.get(this.key(storeId, id))!;
    rec.status = status;
    return rec;
  }
  async rollback(storeId: string, id: string, revision: SizeChartRevisionRecord) {
    const rec = this.charts.get(this.key(storeId, id))!;
    rec.publishedRevisionId = revision.id;
    rec.draftColumns = revision.columns;
    rec.draftRows = revision.rows;
    rec.status = "PUBLISHED";
    return rec;
  }
  async upsertAssignment(input: Parameters<SizeChartDataAccess["upsertAssignment"]>[0]) {
    // Task 13 fix: tekillik anahtarı (storeId, scope, categoryId, productId)'dir —
    // sizeChartId DAHİL DEĞİLDİR (gerçek DB unique index'i mirror'lar). Aynı hedefe
    // ikinci farklı chart ataması mevcut satırı TAŞIR, yeni satır YARATMAZ.
    const existing = this.assignments.find(
      (a) =>
        a.storeId === input.storeId &&
        a.scope === input.scope &&
        a.categoryId === input.categoryId &&
        a.productId === input.productId,
    );
    if (existing) {
      existing.sizeChartId = input.sizeChartId;
      return existing;
    }
    const a = {
      id: `asg-${++this.seq}`,
      scope: input.scope,
      categoryId: input.categoryId,
      productId: input.productId,
      storeId: input.storeId,
      sizeChartId: input.sizeChartId,
    };
    this.assignments.push(a);
    return a;
  }
  async selector(storeId: string, criteria: Parameters<SizeChartDataAccess["selector"]>[1]) {
    if (criteria.ids && criteria.ids.length > 0) {
      const data = criteria.ids
        .map((id) => this.charts.get(this.key(storeId, id)))
        .filter((c): c is SizeChartRecord => !!c);
      return { data, total: data.length };
    }
    const all = [...this.charts.values()].filter(
      (c) => c.storeId === storeId && (!criteria.status || c.status === criteria.status),
    );
    return { data: all.slice(criteria.offset, criteria.offset + criteria.limit), total: all.length };
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
}

const COLS = [{ key: "chest", label: "Göğüs", unit: "cm" }];
const ROWS = [
  { size: "S", cells: { chest: 90 } },
  { size: "M", cells: { chest: 96 } },
];

describe("validateSizeChartContent (pure)", () => {
  it("geçerli içerik", () => {
    expect(() => validateSizeChartContent("INTERNATIONAL", COLS, ROWS)).not.toThrow();
  });
  it("bilinmeyen kolona referans reddedilir", () => {
    expect(() =>
      validateSizeChartContent("INTERNATIONAL", COLS, [{ size: "S", cells: { waist: 70 } }]),
    ).toThrow(SizeChartError);
  });
  it("duplicate kolon key reddedilir", () => {
    expect(() =>
      validateSizeChartContent("INTERNATIONAL", [COLS[0], COLS[0]], ROWS),
    ).toThrow(/Duplicate column/);
  });
  it("markup içeren hücre reddedilir (XSS kalkanı)", () => {
    expect(() =>
      validateSizeChartContent("INTERNATIONAL", COLS, [{ size: "S", cells: { chest: "<b>90</b>" } }]),
    ).toThrow(/Markup/);
  });
  it("enforceSizeValues: sisteme uymayan beden reddedilir", () => {
    expect(() =>
      validateSizeChartContent("INTERNATIONAL", COLS, [{ size: "99XL", cells: { chest: 90 } }], {
        enforceSizeValues: true,
      }),
    ).toThrow(/not in system/);
  });
});

describe("SizeChartService lifecycle", () => {
  let data: FakeData;
  let svc: ReturnType<typeof createSizeChartService>;
  beforeEach(() => {
    data = new FakeData();
    svc = createSizeChartService(data);
  });

  it("create → bilinmeyen size system reddedilir", async () => {
    await expect(svc.create("s1", { name: "X", sizeSystemKey: "NOPE" })).rejects.toMatchObject({
      code: "SIZE_SYSTEM_UNKNOWN",
    });
  });

  it("create + publish revision 1 + rollback", async () => {
    const c = await svc.create("s1", {
      name: "Kadın Üst",
      sizeSystemKey: "INTERNATIONAL",
      columns: COLS,
      rows: ROWS,
    });
    expect(c.status).toBe("DRAFT");
    const pub = await svc.publish("s1", c.id);
    expect(pub.status).toBe("PUBLISHED");
    expect(pub.publishedRevisionId).toBeTruthy();
    // ikinci publish revision 2 üretir
    await svc.update("s1", c.id, { rows: [...ROWS, { size: "L", cells: { chest: 102 } }] });
    const pub2 = await svc.publish("s1", c.id);
    const rev2 = await data.getRevision("s1", c.id, pub2.publishedRevisionId!);
    expect(rev2?.revision).toBe(2);
    // rollback revision 1
    const rev1 = data.revisions.find((r) => r.revision === 1)!;
    const rolled = await svc.rollback("s1", c.id, rev1.id);
    expect(rolled.publishedRevisionId).toBe(rev1.id);
    expect(rolled.draftRows).toHaveLength(2);
  });

  it("boş draft publish reddedilir", async () => {
    const c = await svc.create("s1", { name: "Boş", sizeSystemKey: "EU" });
    await expect(svc.publish("s1", c.id)).rejects.toMatchObject({ code: "SIZE_CHART_EMPTY_DRAFT" });
  });

  it("archive sonrası düzenleme reddedilir", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "EU", columns: COLS, rows: ROWS });
    await svc.archive("s1", c.id);
    await expect(svc.update("s1", c.id, { name: "B" })).rejects.toMatchObject({ code: "SIZE_CHART_ARCHIVED" });
  });

  it("cross-store kategori ataması reddedilir", async () => {
    // Task 13 (§9): assign yalnız PUBLISHED chart'ta çalışır — bu test cross-store
    // reddini doğruladığı için önce publish edilir (INTERNATIONAL: S/M enforceSizeValues'a uyar).
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", c.id);
    await expect(
      svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-other" }),
    ).rejects.toMatchObject({ code: "SIZE_CHART_ASSIGN_CROSS_STORE" });
    // geçerli kategori
    const asg = await svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-a" });
    expect(asg.categoryId).toBe("cat-a");
  });

  it("YAYINLANMAMIŞ (DRAFT) chart baglanamaz (Task 13, §9)", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "EU", columns: COLS, rows: ROWS });
    await expect(
      svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-a" }),
    ).rejects.toMatchObject({ code: "SIZE_CHART_ASSIGN_NOT_PUBLISHED" });
  });

  it("ARSIVLI chart baglanamaz (Task 13, §9)", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", c.id);
    await svc.archive("s1", c.id);
    await expect(
      svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-a" }),
    ).rejects.toMatchObject({ code: "SIZE_CHART_ASSIGN_NOT_PUBLISHED" });
  });

  it("aynı ürün için ikinci PRODUCT-scope atama ilkini DEĞİŞTİRİR (Task 13, §9)", async () => {
    const c1 = await svc.create("s1", { name: "A", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const c2 = await svc.create("s1", { name: "B", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", c1.id);
    await svc.publish("s1", c2.id);
    const first = await svc.assign("s1", c1.id, { scope: "PRODUCT", productId: "prod-a" });
    const second = await svc.assign("s1", c2.id, { scope: "PRODUCT", productId: "prod-a" });
    // Gerçek DB unique index (storeId,scope,categoryId,productId) sizeChartId İÇERMEZ:
    // upsertAssignment aynı hedefi BULUP taşımalı, ikinci bir satır YARATMAMALI.
    expect(second.id).toBe(first.id);
    expect(data.assignments).toHaveLength(1);
    expect(data.assignments[0].sizeChartId).toBe(c2.id);
  });

  it("başka store'un chart'ı görünmez (404)", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "EU", columns: COLS, rows: ROWS });
    await expect(svc.get("s2", c.id)).rejects.toMatchObject({ code: "SIZE_CHART_NOT_FOUND" });
  });
});

/**
 * TODO-165A Tasks 25/26 — `findProductAssignment` (dogrudan PRODUCT-scope) ve `resolveEffective`
 * (PRODUCT>CATEGORY>STORE oncelikli COZUM). `resolvePublishedSizeChart` (public-projection.ts)
 * BU fonksiyonu cagirir — burada dogrulanan siralama/filtre kurallari PDP icin de gecerlidir.
 */
describe("SizeChartService.findProductAssignment / resolveEffective (Task 25/26)", () => {
  let data: FakeData;
  let svc: ReturnType<typeof createSizeChartService>;
  beforeEach(() => {
    data = new FakeData();
    svc = createSizeChartService(data);
  });

  it("findProductAssignment: atama yoksa null", async () => {
    expect(await svc.findProductAssignment("s1", "prod-a")).toBeNull();
  });

  it("findProductAssignment: PRODUCT-scope atama chart ile birlikte doner", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", c.id);
    await svc.assign("s1", c.id, { scope: "PRODUCT", productId: "prod-a" });
    const found = await svc.findProductAssignment("s1", "prod-a");
    expect(found?.chart.id).toBe(c.id);
    expect(found?.assignmentId).toBeTruthy();
  });

  it("resolveEffective: atama yoksa null", async () => {
    expect(await svc.resolveEffective("s1", "prod-a", "cat-a")).toBeNull();
  });

  it("resolveEffective: PRODUCT, CATEGORY'yi ve STORE'u EZER", async () => {
    const store = await svc.create("s1", { name: "Store", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const category = await svc.create("s1", { name: "Cat", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const product = await svc.create("s1", { name: "Prod", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", store.id);
    await svc.publish("s1", category.id);
    await svc.publish("s1", product.id);
    await svc.assign("s1", store.id, { scope: "STORE" });
    await svc.assign("s1", category.id, { scope: "CATEGORY", categoryId: "cat-a" });
    await svc.assign("s1", product.id, { scope: "PRODUCT", productId: "prod-a" });

    const resolved = await svc.resolveEffective("s1", "prod-a", "cat-a");
    expect(resolved?.scope).toBe("PRODUCT");
    expect(resolved?.chart.id).toBe(product.id);
  });

  it("resolveEffective: PRODUCT atama yoksa CATEGORY'ye duser", async () => {
    const store = await svc.create("s1", { name: "Store", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const category = await svc.create("s1", { name: "Cat", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", store.id);
    await svc.publish("s1", category.id);
    await svc.assign("s1", store.id, { scope: "STORE" });
    await svc.assign("s1", category.id, { scope: "CATEGORY", categoryId: "cat-a" });

    const resolved = await svc.resolveEffective("s1", "prod-a", "cat-a");
    expect(resolved?.scope).toBe("CATEGORY");
    expect(resolved?.chart.id).toBe(category.id);
  });

  it("resolveEffective: yalniz STORE atamasi varsa STORE'a duser", async () => {
    const store = await svc.create("s1", { name: "Store", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", store.id);
    await svc.assign("s1", store.id, { scope: "STORE" });

    const resolved = await svc.resolveEffective("s1", "prod-a", "cat-a");
    expect(resolved?.scope).toBe("STORE");
    expect(resolved?.chart.id).toBe(store.id);
  });

  it("resolveEffective: ARSIVLENMIS chart'a bagli PRODUCT atamasi ATLANIR, CATEGORY'ye duser", async () => {
    // assign() yalniz PUBLISHED chart'ta calisir; ama chart SONRADAN arsivlenebilir —
    // atama SATIRI kalir, resolveEffective bu chart'i FILTRELEMELI (status !== PUBLISHED).
    const product = await svc.create("s1", { name: "Prod", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const category = await svc.create("s1", { name: "Cat", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", product.id);
    await svc.publish("s1", category.id);
    await svc.assign("s1", product.id, { scope: "PRODUCT", productId: "prod-a" });
    await svc.assign("s1", category.id, { scope: "CATEGORY", categoryId: "cat-a" });
    await svc.archive("s1", product.id);

    const resolved = await svc.resolveEffective("s1", "prod-a", "cat-a");
    expect(resolved?.scope).toBe("CATEGORY");
    expect(resolved?.chart.id).toBe(category.id);
  });

  it("resolveEffective: categoryId=null iken CATEGORY hedefleri ARANMAZ", async () => {
    const category = await svc.create("s1", { name: "Cat", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", category.id);
    await svc.assign("s1", category.id, { scope: "CATEGORY", categoryId: "cat-a" });

    expect(await svc.resolveEffective("s1", "prod-a", null)).toBeNull();
  });
});

/**
 * TODO-165A Tasks 25/26 (coordinator review, fix #1) — `resolvePublishedSizeChart`
 * (public-projection.ts) is the function the PUBLIC storefront PDP endpoint calls
 * (via `buildPublicFashionProjection`) to build `fashion.sizeChart` on the public
 * product DTO. It was refactored to delegate precedence to `resolveEffective` — this
 * suite locks that PUBLIC path's behavior (not just the new admin endpoint's) against
 * regression: PRODUCT beats CATEGORY beats STORE, an archived/draft assignment is
 * skipped, and the resolved chart's columns/rows come from the PUBLISHED revision
 * (not the draft). Asserts are non-vacuous: actual chart id + actual column/row content.
 */
describe("resolvePublishedSizeChart (public PDP path, delegates to resolveEffective)", () => {
  let data: FakeData;
  let svc: ReturnType<typeof createSizeChartService>;
  beforeEach(() => {
    data = new FakeData();
    svc = createSizeChartService(data);
  });

  it("no assignment at all → null (fashion-disi/bağlantısız ürün)", async () => {
    expect(await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a")).toBeNull();
  });

  it("PRODUCT-scope published chart wins over CATEGORY and STORE; columns/rows come from the published revision", async () => {
    const storeChart = await svc.create("s1", {
      name: "Store Default",
      sizeSystemKey: "INTERNATIONAL",
      columns: [{ key: "chest", label: "Göğüs", unit: "cm" }],
      rows: [{ size: "M", cells: { chest: 96 } }],
    });
    const categoryChart = await svc.create("s1", {
      name: "Category Default",
      sizeSystemKey: "INTERNATIONAL",
      columns: [{ key: "chest", label: "Göğüs", unit: "cm" }],
      rows: [{ size: "M", cells: { chest: 98 } }],
    });
    const productChart = await svc.create("s1", {
      name: "Product Specific",
      sizeSystemKey: "INTERNATIONAL",
      columns: [{ key: "chest", label: "Göğüs", unit: "cm" }, { key: "waist", label: "Bel", unit: "cm" }],
      rows: [{ size: "M", cells: { chest: 100, waist: 80 } }],
    });
    await svc.publish("s1", storeChart.id);
    await svc.publish("s1", categoryChart.id);
    await svc.publish("s1", productChart.id);
    await svc.assign("s1", storeChart.id, { scope: "STORE" });
    await svc.assign("s1", categoryChart.id, { scope: "CATEGORY", categoryId: "cat-a" });
    await svc.assign("s1", productChart.id, { scope: "PRODUCT", productId: "prod-a" });

    const publicChart = await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a");
    expect(publicChart).not.toBeNull();
    // Non-vacuous: the actual winning chart id, not just "truthy".
    expect(publicChart?.id).toBe(productChart.id);
    expect(publicChart?.name).toBe("Product Specific");
    // Columns/rows are the PUBLISHED revision's content, not some other chart's.
    expect(publicChart?.columns).toEqual([
      { key: "chest", label: "Göğüs", unit: "cm" },
      { key: "waist", label: "Bel", unit: "cm" },
    ]);
    expect(publicChart?.rows).toEqual([{ size: "M", cells: { chest: 100, waist: 80 } }]);
    // Sanity: this is NOT the category/store chart's content leaking through.
    expect(publicChart?.rows).not.toEqual([{ size: "M", cells: { chest: 98 } }]);
  });

  it("no PRODUCT assignment → falls back to CATEGORY over STORE", async () => {
    const storeChart = await svc.create("s1", { name: "Store", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const categoryChart = await svc.create("s1", { name: "Category", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", storeChart.id);
    await svc.publish("s1", categoryChart.id);
    await svc.assign("s1", storeChart.id, { scope: "STORE" });
    await svc.assign("s1", categoryChart.id, { scope: "CATEGORY", categoryId: "cat-a" });

    const publicChart = await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a");
    expect(publicChart?.id).toBe(categoryChart.id);
    expect(publicChart?.name).toBe("Category");
  });

  it("only STORE assignment → resolves to the store default", async () => {
    const storeChart = await svc.create("s1", { name: "Store Only", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", storeChart.id);
    await svc.assign("s1", storeChart.id, { scope: "STORE" });

    const publicChart = await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a");
    expect(publicChart?.id).toBe(storeChart.id);
  });

  it("archived PRODUCT-scope chart is skipped on the PUBLIC path too → falls back to CATEGORY", async () => {
    const productChart = await svc.create("s1", { name: "Was Product Default", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    const categoryChart = await svc.create("s1", { name: "Category Fallback", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    await svc.publish("s1", productChart.id);
    await svc.publish("s1", categoryChart.id);
    await svc.assign("s1", productChart.id, { scope: "PRODUCT", productId: "prod-a" });
    await svc.assign("s1", categoryChart.id, { scope: "CATEGORY", categoryId: "cat-a" });
    await svc.archive("s1", productChart.id);

    const publicChart = await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a");
    expect(publicChart?.id).toBe(categoryChart.id);
  });

  it("DRAFT (never-published) chart's assignment is skipped → null when nothing else qualifies", async () => {
    // assign() zaten yalnız PUBLISHED chart'ta çalışır (§9) — bu durum normal akışta
    // oluşamaz; yine de resolveEffective'in "meta.status !== PUBLISHED" filtresini
    // DOĞRUDAN (fake veri üzerinden, servis kuralını bypass ederek) doğrular.
    const draft = await svc.create("s1", { name: "Draft", sizeSystemKey: "INTERNATIONAL", columns: COLS, rows: ROWS });
    data.assignments.push({
      id: "asg-manual",
      scope: "PRODUCT",
      categoryId: null,
      productId: "prod-a",
      storeId: "s1",
      sizeChartId: draft.id,
    });
    expect(draft.status).toBe("DRAFT");

    expect(await resolvePublishedSizeChart(svc, "s1", "prod-a", "cat-a")).toBeNull();
  });
});

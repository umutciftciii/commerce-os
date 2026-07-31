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
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "EU", columns: COLS, rows: ROWS });
    await expect(
      svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-other" }),
    ).rejects.toMatchObject({ code: "SIZE_CHART_ASSIGN_CROSS_STORE" });
    // geçerli kategori
    const asg = await svc.assign("s1", c.id, { scope: "CATEGORY", categoryId: "cat-a" });
    expect(asg.categoryId).toBe("cat-a");
  });

  it("başka store'un chart'ı görünmez (404)", async () => {
    const c = await svc.create("s1", { name: "A", sizeSystemKey: "EU", columns: COLS, rows: ROWS });
    await expect(svc.get("s2", c.id)).rejects.toMatchObject({ code: "SIZE_CHART_NOT_FOUND" });
  });
});

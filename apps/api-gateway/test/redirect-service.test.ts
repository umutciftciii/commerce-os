import { beforeEach, describe, expect, it } from "vitest";
import {
  createRedirectService,
  RedirectError,
  redirectEntityType,
} from "../src/seo/redirect-service.js";
import type {
  RedirectDataAccess,
  RedirectRecord,
  RedirectCreateData,
  RedirectRuleRow,
} from "../src/seo/redirect-data.js";

/**
 * TODO-166 (ADR-265) — Admin redirect servisi (manuel redirect güvenliği). In-memory fake
 * data-access ile; DB yok. SAF doğrulama motoru (@commerce-os/utils) zaten ayrı test edilir —
 * burada servisin canlı-shadow + kaynak-tekilliği + otomatik/manuel silme/düzenleme kuralları.
 */

interface FakeState {
  redirects: RedirectRecord[];
  productSlugs: Set<string>;
  brandSlugs: Set<string>;
}

function createFake(initial?: Partial<FakeState>): { data: RedirectDataAccess; state: FakeState } {
  const state: FakeState = {
    redirects: initial?.redirects ?? [],
    productSlugs: initial?.productSlugs ?? new Set(),
    brandSlugs: initial?.brandSlugs ?? new Set(),
  };
  let seq = state.redirects.length;

  const data: RedirectDataAccess = {
    async list(storeId, criteria) {
      const rows = state.redirects.filter((r) => r.storeId === storeId);
      return { data: rows.slice(criteria.offset, criteria.offset + criteria.limit), total: rows.length };
    },
    async get(storeId, id) {
      return state.redirects.find((r) => r.storeId === storeId && r.id === id) ?? null;
    },
    async findBySource(storeId, sourcePath) {
      return state.redirects.find((r) => r.storeId === storeId && r.sourcePath === sourcePath) ?? null;
    },
    async create(input: RedirectCreateData) {
      seq += 1;
      const rec: RedirectRecord = {
        id: `r${seq}`,
        storeId: input.storeId,
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        type: input.type,
        origin: input.origin,
        enabled: input.enabled,
        notes: input.notes,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      };
      state.redirects.push(rec);
      return rec;
    },
    async update(storeId, id, patch) {
      const rec = state.redirects.find((r) => r.storeId === storeId && r.id === id);
      if (!rec) return null;
      if (patch.sourcePath !== undefined) rec.sourcePath = patch.sourcePath;
      if (patch.targetPath !== undefined) rec.targetPath = patch.targetPath;
      if (patch.type !== undefined) rec.type = patch.type;
      if (patch.enabled !== undefined) rec.enabled = patch.enabled;
      if (patch.notes !== undefined) rec.notes = patch.notes;
      return rec;
    },
    async remove(storeId, id) {
      const idx = state.redirects.findIndex((r) => r.storeId === storeId && r.id === id);
      if (idx === -1) return false;
      state.redirects.splice(idx, 1);
      return true;
    },
    async allRules(storeId): Promise<RedirectRuleRow[]> {
      return state.redirects
        .filter((r) => r.storeId === storeId)
        .map((r) => ({ source: r.sourcePath, target: r.targetPath, type: r.type, enabled: r.enabled }));
    },
    async productSlugExists(_storeId, slug) {
      return state.productSlugs.has(slug);
    },
    async brandSlugExists(_storeId, slug) {
      return state.brandSlugs.has(slug);
    },
    // Slug projeksiyonu bu testin kapsamı dışı (prisma-bağımlı); no-op stub.
    async listSlugRecords() {
      return { data: [], total: 0 };
    },
    async getSlugRecord() {
      return null;
    },
    async slugHistory() {
      return [];
    },
  };
  return { data, state };
}

const STORE = "store-1";

describe("redirectEntityType — kaynak path'ten türetme", () => {
  it("ürün/marka/kategori/diğer", () => {
    expect(redirectEntityType("/products/eski")).toBe("PRODUCT");
    expect(redirectEntityType("/markalar/eski")).toBe("BRAND");
    expect(redirectEntityType("/products?category=eski")).toBe("CATEGORY");
    expect(redirectEntityType("/yaz-indirimi")).toBe("OTHER");
  });
});

describe("createRedirect — manuel redirect kabul + güvenlik", () => {
  let deps: ReturnType<typeof createFake>;
  beforeEach(() => {
    deps = createFake();
  });

  it("geçerli manuel redirect → MANUAL origin + normalize edilmiş path", async () => {
    const service = createRedirectService(deps.data);
    const rec = await service.create(STORE, { sourcePath: "/eski-kampanya/", targetPath: "/products/yeni" });
    expect(rec.origin).toBe("MANUAL");
    expect(rec.sourcePath).toBe("/eski-kampanya");
    expect(rec.type).toBe("PERMANENT_301");
    expect(rec.status).toBe(301);
  });

  it("hedef query'si KORUNUR (kategori hedefi /products?category=...)", async () => {
    const service = createRedirectService(deps.data);
    const rec = await service.create(STORE, {
      sourcePath: "/eski-kategori",
      targetPath: "/products?category=elbise",
    });
    expect(rec.targetPath).toBe("/products?category=elbise");
  });

  it("kaynak == hedef → 400", async () => {
    const service = createRedirectService(deps.data);
    await expect(service.create(STORE, { sourcePath: "/a", targetPath: "/a" })).rejects.toMatchObject({
      code: "REDIRECT_SOURCE_EQUALS_TARGET",
    });
  });

  it("rezerve/canonical rota gölgeleyen kaynak → 400", async () => {
    const service = createRedirectService(deps.data);
    await expect(service.create(STORE, { sourcePath: "/cart", targetPath: "/products/x" })).rejects.toMatchObject({
      code: "REDIRECT_RESERVED_ROUTE",
    });
  });

  it("off-site hedef → 400", async () => {
    const service = createRedirectService(deps.data);
    await expect(
      service.create(STORE, { sourcePath: "/a", targetPath: "https://evil.com" }),
    ).rejects.toMatchObject({ code: "REDIRECT_UNSAFE_TARGET" });
  });

  it("döngü yaratan kaynak → 409", async () => {
    const fake = createFake({
      redirects: [
        {
          id: "r1",
          storeId: STORE,
          sourcePath: "/b",
          targetPath: "/a",
          type: "PERMANENT_301",
          origin: "MANUAL",
          enabled: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const service = createRedirectService(fake.data);
    await expect(service.create(STORE, { sourcePath: "/a", targetPath: "/b" })).rejects.toMatchObject({
      code: "REDIRECT_LOOP",
    });
  });

  it("aynı kaynak zaten varsa → 409 SOURCE_TAKEN", async () => {
    const service = createRedirectService(deps.data);
    await service.create(STORE, { sourcePath: "/a", targetPath: "/products/x" });
    await expect(service.create(STORE, { sourcePath: "/a", targetPath: "/products/y" })).rejects.toMatchObject({
      code: "REDIRECT_SOURCE_TAKEN",
    });
  });

  it("kaynak canlı ürün sayfasını gölgeliyorsa → 409 SHADOWS_LIVE", async () => {
    const fake = createFake({ productSlugs: new Set(["canli-urun"]) });
    const service = createRedirectService(fake.data);
    await expect(
      service.create(STORE, { sourcePath: "/products/canli-urun", targetPath: "/products/x" }),
    ).rejects.toMatchObject({ code: "REDIRECT_SHADOWS_LIVE" });
  });

  it("kaynak canlı marka sayfasını gölgeliyorsa → 409 SHADOWS_LIVE", async () => {
    const fake = createFake({ brandSlugs: new Set(["nike"]) });
    const service = createRedirectService(fake.data);
    await expect(
      service.create(STORE, { sourcePath: "/markalar/nike", targetPath: "/markalar/x" }),
    ).rejects.toMatchObject({ code: "REDIRECT_SHADOWS_LIVE" });
  });

  it("eski ürün slug'ı (canlı değil) manuel kaynağı olabilir", async () => {
    const fake = createFake({ productSlugs: new Set(["yeni-urun"]) });
    const service = createRedirectService(fake.data);
    const rec = await service.create(STORE, { sourcePath: "/products/eski-urun", targetPath: "/products/yeni-urun" });
    expect(rec.entityType).toBe("PRODUCT");
  });
});

describe("updateRedirect — otomatik/manuel ayrımı", () => {
  function autoRow(): RedirectRecord {
    return {
      id: "auto1",
      storeId: STORE,
      sourcePath: "/products/eski",
      targetPath: "/products/yeni",
      type: "PERMANENT_301",
      origin: "AUTOMATIC",
      enabled: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it("otomatik redirect'in source/target'ı düzenlenemez → 409 IMMUTABLE", async () => {
    const fake = createFake({ redirects: [autoRow()] });
    const service = createRedirectService(fake.data);
    await expect(
      service.update(STORE, "auto1", { targetPath: "/products/baska" }),
    ).rejects.toMatchObject({ code: "REDIRECT_AUTOMATIC_IMMUTABLE" });
  });

  it("otomatik redirect aktif/pasif edilebilir", async () => {
    const fake = createFake({ redirects: [autoRow()] });
    const service = createRedirectService(fake.data);
    const updated = await service.update(STORE, "auto1", { enabled: false });
    expect(updated.enabled).toBe(false);
    expect(updated.origin).toBe("AUTOMATIC");
  });

  it("manuel redirect hedefi düzenlenebilir (yeniden doğrulanır)", async () => {
    const fake = createFake({
      redirects: [
        {
          id: "m1",
          storeId: STORE,
          sourcePath: "/eski",
          targetPath: "/products/a",
          type: "PERMANENT_301",
          origin: "MANUAL",
          enabled: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const service = createRedirectService(fake.data);
    const updated = await service.update(STORE, "m1", { targetPath: "/products/b" });
    expect(updated.targetPath).toBe("/products/b");
  });
});

describe("removeRedirect — silme güvenliği", () => {
  it("otomatik redirect silinemez → 409 DELETE_FORBIDDEN", async () => {
    const fake = createFake({
      redirects: [
        {
          id: "auto1",
          storeId: STORE,
          sourcePath: "/products/eski",
          targetPath: "/products/yeni",
          type: "PERMANENT_301",
          origin: "AUTOMATIC",
          enabled: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const service = createRedirectService(fake.data);
    await expect(service.remove(STORE, "auto1")).rejects.toMatchObject({
      code: "REDIRECT_AUTOMATIC_DELETE_FORBIDDEN",
    });
  });

  it("manuel redirect silinebilir", async () => {
    const fake = createFake({
      redirects: [
        {
          id: "m1",
          storeId: STORE,
          sourcePath: "/eski",
          targetPath: "/products/a",
          type: "PERMANENT_301",
          origin: "MANUAL",
          enabled: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const service = createRedirectService(fake.data);
    await service.remove(STORE, "m1");
    expect(fake.state.redirects).toHaveLength(0);
  });

  it("cross-store id → 404 (tenant izolasyonu)", async () => {
    const fake = createFake({
      redirects: [
        {
          id: "m1",
          storeId: "other-store",
          sourcePath: "/eski",
          targetPath: "/products/a",
          type: "PERMANENT_301",
          origin: "MANUAL",
          enabled: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const service = createRedirectService(fake.data);
    await expect(service.remove(STORE, "m1")).rejects.toBeInstanceOf(RedirectError);
    await expect(service.remove(STORE, "m1")).rejects.toMatchObject({ code: "REDIRECT_NOT_FOUND" });
  });
});

describe("getDetail — zincir çözümü + loop bayrağı", () => {
  it("A→B→C zinciri son hedefe çözülür", async () => {
    const mk = (id: string, s: string, t: string): RedirectRecord => ({
      id,
      storeId: STORE,
      sourcePath: s,
      targetPath: t,
      type: "PERMANENT_301",
      origin: "MANUAL",
      enabled: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const fake = createFake({ redirects: [mk("a", "/a", "/b"), mk("b", "/b", "/c")] });
    const service = createRedirectService(fake.data);
    const detail = await service.getDetail(STORE, "a");
    expect(detail.resolvedTarget).toBe("/c");
    expect(detail.chainLength).toBe(2);
    expect(detail.hasLoop).toBe(false);
  });

  it("A→B→A döngüsü → hasLoop true, resolvedTarget null", async () => {
    const mk = (id: string, s: string, t: string): RedirectRecord => ({
      id,
      storeId: STORE,
      sourcePath: s,
      targetPath: t,
      type: "PERMANENT_301",
      origin: "MANUAL",
      enabled: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const fake = createFake({ redirects: [mk("a", "/a", "/b"), mk("b", "/b", "/a")] });
    const service = createRedirectService(fake.data);
    const detail = await service.getDetail(STORE, "a");
    expect(detail.hasLoop).toBe(true);
    expect(detail.resolvedTarget).toBeNull();
  });
});

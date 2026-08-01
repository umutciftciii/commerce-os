// TODO-165A (ADR-165A) — Product Data Governance: Brand servisi testleri (fake dataAccess).
import { describe, it, expect, beforeEach } from "vitest";
import {
  createBrandService,
  BrandError,
  brandErrorStatus,
  type BrandService,
} from "../src/brand/brand-service.js";
import type { BrandDataAccess, BrandRecord, BrandListCriteria, BrandSelectorCriteria } from "../src/brand/brand-data.js";

const NOW = new Date("2026-08-01T00:00:00Z");

class FakeData implements BrandDataAccess {
  brands = new Map<string, BrandRecord>();
  media = new Set<string>(); // `${storeId}|${mediaId}`
  products: { storeId: string; brandId: string | null }[] = [];
  seq = 0;

  private key(storeId: string, id: string) {
    return `${storeId}|${id}`;
  }

  async list(storeId: string, criteria: BrandListCriteria) {
    let rows = [...this.brands.values()].filter((b) => b.storeId === storeId);
    if (criteria.status) rows = rows.filter((b) => b.status === criteria.status);
    if (criteria.search) {
      const q = criteria.search.toLowerCase();
      rows = rows.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q));
    }
    const sortBy = criteria.sortBy ?? "createdAt";
    const dir = criteria.sortOrder === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortBy) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "productCount":
          av = a.productCount;
          bv = b.productCount;
          break;
        default:
          av = a.createdAt.getTime();
          bv = b.createdAt.getTime();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    const total = rows.length;
    const data = rows.slice(criteria.offset, criteria.offset + criteria.limit);
    return { data, total };
  }

  async get(storeId: string, id: string) {
    return this.brands.get(this.key(storeId, id)) ?? null;
  }

  async findBySlug(storeId: string, slug: string) {
    return [...this.brands.values()].find((b) => b.storeId === storeId && b.slug === slug) ?? null;
  }

  async create(input: Parameters<BrandDataAccess["create"]>[0]) {
    const id = `brand-${++this.seq}`;
    const rec: BrandRecord = {
      id,
      storeId: input.storeId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      logoMediaId: input.logoMediaId,
      logoStorageKey: null,
      coverMediaId: input.coverMediaId,
      coverStorageKey: null,
      websiteUrl: input.websiteUrl,
      status: input.status,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      productCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.brands.set(this.key(input.storeId, id), rec);
    return rec;
  }

  async update(storeId: string, id: string, patch: Parameters<BrandDataAccess["update"]>[2]) {
    const rec = this.brands.get(this.key(storeId, id))!;
    Object.assign(rec, {
      name: patch.name ?? rec.name,
      slug: patch.slug ?? rec.slug,
      description: patch.description === undefined ? rec.description : patch.description,
      logoMediaId: patch.logoMediaId === undefined ? rec.logoMediaId : patch.logoMediaId,
      coverMediaId: patch.coverMediaId === undefined ? rec.coverMediaId : patch.coverMediaId,
      websiteUrl: patch.websiteUrl === undefined ? rec.websiteUrl : patch.websiteUrl,
      status: patch.status ?? rec.status,
      seoTitle: patch.seoTitle === undefined ? rec.seoTitle : patch.seoTitle,
      seoDescription: patch.seoDescription === undefined ? rec.seoDescription : patch.seoDescription,
    });
    return rec;
  }

  async setStatus(storeId: string, id: string, status: BrandRecord["status"]) {
    const rec = this.brands.get(this.key(storeId, id))!;
    rec.status = status;
    return rec;
  }

  async selector(storeId: string, criteria: BrandSelectorCriteria) {
    if (criteria.ids && criteria.ids.length > 0) {
      const rows = criteria.ids
        .map((id) => this.brands.get(this.key(storeId, id)))
        .filter((b): b is BrandRecord => !!b);
      return { data: rows, total: rows.length };
    }
    return this.list(storeId, criteria);
  }

  async productCount(storeId: string, brandId: string) {
    return this.products.filter((p) => p.storeId === storeId && p.brandId === brandId).length;
  }

  async productsByBrand(storeId: string, brandIds: string[]) {
    const map = new Map<string, number>();
    for (const id of brandIds) {
      map.set(id, this.products.filter((p) => p.storeId === storeId && p.brandId === id).length);
    }
    return map;
  }

  async visibleProductCounts(storeId: string, brandIds: string[]) {
    const map = new Map<string, number>();
    for (const id of brandIds) {
      map.set(id, this.products.filter((p) => p.storeId === storeId && p.brandId === id).length);
    }
    return map;
  }

  async mediaBelongsToStore(storeId: string, mediaId: string) {
    return this.media.has(`${storeId}|${mediaId}`);
  }

  // TODO-165A (ADR-165A) Task 15/16 gap — bu dosya listProducts'i EGZERSIZ ETMEZ
  // (HTTP katmanı brand-routes.test.ts'te kapsandı); yalnız arayüz uyumu için minimal stub.
  async listProducts() {
    return { data: [], total: 0 };
  }
}

describe("brandErrorStatus", () => {
  it("HTTP status haritası", () => {
    expect(brandErrorStatus("BRAND_NOT_FOUND")).toBe(404);
    expect(brandErrorStatus("BRAND_SLUG_TAKEN")).toBe(409);
    expect(brandErrorStatus("BRAND_ARCHIVED")).toBe(409);
    expect(brandErrorStatus("BRAND_MEDIA_CROSS_STORE")).toBe(403);
    expect(brandErrorStatus("BRAND_NAME_REQUIRED")).toBe(400);
  });
});

describe("BrandService", () => {
  let data: FakeData;
  let svc: BrandService;

  beforeEach(() => {
    data = new FakeData();
    svc = createBrandService(data);
  });

  it("create: slug isimden türetilir; store-scoped tekillik zorunlu (BRAND_SLUG_TAKEN)", async () => {
    const b1 = await svc.create("s1", { name: "Nike Türkiye" });
    expect(b1.slug).toBe("nike-turkiye");
    expect(b1.status).toBe("ACTIVE");

    await expect(svc.create("s1", { name: "Nike Türkiye" })).rejects.toMatchObject({
      code: "BRAND_SLUG_TAKEN",
    });

    // Farklı mağazada aynı slug çakışma sayılmaz.
    const b2 = await svc.create("s2", { name: "Nike Türkiye" });
    expect(b2.slug).toBe("nike-turkiye");
  });

  it("create: boş isim reddedilir (BRAND_NAME_REQUIRED)", async () => {
    await expect(svc.create("s1", { name: "   " })).rejects.toMatchObject({
      code: "BRAND_NAME_REQUIRED",
    });
  });

  it("update: boş isim reddedilir (BRAND_NAME_REQUIRED)", async () => {
    const b = await svc.create("s1", { name: "Valid" });
    await expect(svc.update("s1", b.id, { name: "   " })).rejects.toMatchObject({
      code: "BRAND_NAME_REQUIRED",
    });
  });

  it("update: ARCHIVED marka için metadata düzenleme hâlâ izinli", async () => {
    const b = await svc.create("s1", { name: "Adidas" });
    await svc.archive("s1", b.id);
    const updated = await svc.update("s1", b.id, { description: "Spor markası" });
    expect(updated.status).toBe("ARCHIVED");
    expect(updated.description).toBe("Spor markası");
  });

  it("archive() flips status; restore() geri alır", async () => {
    const b = await svc.create("s1", { name: "Puma" });
    const archived = await svc.archive("s1", b.id);
    expect(archived.status).toBe("ARCHIVED");
    const restored = await svc.restore("s1", b.id);
    expect(restored.status).toBe("ACTIVE");
  });

  it("create/update: başka mağazaya ait logoMediaId/coverMediaId reddedilir (BRAND_MEDIA_CROSS_STORE)", async () => {
    data.media.add("s1|media-own");

    await expect(
      svc.create("s1", { name: "X", logoMediaId: "media-other" }),
    ).rejects.toMatchObject({ code: "BRAND_MEDIA_CROSS_STORE" });

    const b = await svc.create("s1", { name: "Y", logoMediaId: "media-own" });
    expect(b.logoMediaId).toBe("media-own");

    await expect(
      svc.update("s1", b.id, { coverMediaId: "media-other" }),
    ).rejects.toMatchObject({ code: "BRAND_MEDIA_CROSS_STORE" });
  });

  it("list(): arama + sıralama allowlist + sayfalama; productCount Product.brandId'den gelir", async () => {
    const a = await svc.create("s1", { name: "Alpha" });
    const b = await svc.create("s1", { name: "Beta" });
    await svc.create("s1", { name: "Gamma" });
    data.products.push({ storeId: "s1", brandId: b.id });
    data.products.push({ storeId: "s1", brandId: b.id });

    const { data: rows, total } = await svc.list("s1", {
      limit: 10,
      offset: 0,
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(total).toBe(3);

    const betaCount = await svc.productCount("s1", b.id);
    expect(betaCount).toBe(2);
    const alphaCount = await svc.productCount("s1", a.id);
    expect(alphaCount).toBe(0);

    // Sayfalama.
    const page1 = await svc.list("s1", { limit: 2, offset: 0, sortBy: "name", sortOrder: "asc" });
    expect(page1.data.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    const page2 = await svc.list("s1", { limit: 2, offset: 2, sortBy: "name", sortOrder: "asc" });
    expect(page2.data.map((r) => r.name)).toEqual(["Gamma"]);

    // Arama.
    const searched = await svc.list("s1", { limit: 10, offset: 0, search: "bet" });
    expect(searched.data.map((r) => r.name)).toEqual(["Beta"]);

    // productsByBrand toplu.
    const batch = await svc.productsByBrand("s1", [a.id, b.id]);
    expect(batch.get(a.id)).toBe(0);
    expect(batch.get(b.id)).toBe(2);
  });

  it("selector(): dual mode — ids çözüm modu arama/sıralama/sayfalamayı yok sayar", async () => {
    const a = await svc.create("s1", { name: "Alpha" });
    const b = await svc.create("s1", { name: "Beta" });

    const resolved = await svc.selector("s1", { limit: 10, offset: 0, ids: [b.id, a.id] });
    expect(resolved.data.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(resolved.total).toBe(2);

    // Başka mağazanın id'si çözülmez (sessizce elenir).
    const resolvedCross = await svc.selector("s2", { limit: 10, offset: 0, ids: [a.id] });
    expect(resolvedCross.data).toEqual([]);

    // Normal arama/sayfalama modu.
    const searchMode = await svc.selector("s1", { limit: 10, offset: 0, search: "alp" });
    expect(searchMode.data.map((r) => r.name)).toEqual(["Alpha"]);
  });

  it("tenant isolation: başka mağazanın markası görünmez (BRAND_NOT_FOUND)", async () => {
    const b = await svc.create("s1", { name: "Zeta" });
    await expect(svc.get("s2", b.id)).rejects.toMatchObject({ code: "BRAND_NOT_FOUND" });
    await expect(svc.update("s2", b.id, { name: "Hacked" })).rejects.toMatchObject({
      code: "BRAND_NOT_FOUND",
    });
    await expect(svc.archive("s2", b.id)).rejects.toMatchObject({ code: "BRAND_NOT_FOUND" });
    await expect(svc.restore("s2", b.id)).rejects.toMatchObject({ code: "BRAND_NOT_FOUND" });

    // Ama kendi mağazasında hâlâ erişilebilir.
    const found = await svc.get("s1", b.id);
    expect(found.id).toBe(b.id);
  });

  it("get() bulunamayınca BRAND_NOT_FOUND fırlatır", async () => {
    await expect(svc.get("s1", "nope")).rejects.toBeInstanceOf(BrandError);
  });
});

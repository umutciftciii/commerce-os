import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      mediaAsset: { findFirst: vi.fn(), delete: vi.fn() },
      productImage: { count: vi.fn() },
      heroSlide: { count: vi.fn() },
      storeSettings: { count: vi.fn() },
      productCategory: { count: vi.fn() },
    },
  };
});

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

// db mock kurulduktan SONRA import edilmeli.
const { registerMediaAdminRoutes } = await import("../src/media/routes.js");
type MediaAdminRoutesDeps = Parameters<typeof registerMediaAdminRoutes>[1];

// DELETE akisi config'e dokunmaz; POST deps'ini karsilamak icin bos bir stub yeter.
const CONFIG = {} as MediaAdminRoutesDeps["config"];

type StorageMock = {
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
};

function buildApp(opts?: { storeAdmin?: MediaAdminRoutesDeps["requireStoreAdmin"] }) {
  const storage: StorageMock = { put: vi.fn(), delete: vi.fn(), exists: vi.fn() };
  const recordAudit = vi.fn(async () => {});
  const app = Fastify();
  registerMediaAdminRoutes(app, {
    config: CONFIG,
    storage,
    requireStoreAdmin: opts?.storeAdmin ?? (async () => ({ actorUserId: "user_1" })),
    recordAudit,
  });
  return { app, storage, recordAudit };
}

const MEDIA_ROW = {
  id: "media_1",
  storeId: "store_123",
  context: "PRODUCT",
  storageKey: "stores/store_123/products/abc.webp",
  mimeType: "image/webp",
  byteSize: 1234,
  width: 120,
  height: 120,
  altText: null,
  checksum: "deadbeef",
  createdBy: "user_1",
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  updatedAt: new Date("2026-07-11T00:00:00.000Z"),
};

/** Tum referans sayaclari 0 (kullanimda degil) varsayilir. */
function resetCountsToZero() {
  prismaMock.productImage.count.mockResolvedValue(0);
  prismaMock.heroSlide.count.mockResolvedValue(0);
  prismaMock.storeSettings.count.mockResolvedValue(0);
  prismaMock.productCategory.count.mockResolvedValue(0);
}

beforeEach(() => {
  prismaMock.mediaAsset.findFirst.mockResolvedValue(MEDIA_ROW);
  prismaMock.mediaAsset.delete.mockResolvedValue(MEDIA_ROW);
  resetCountsToZero();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /stores/:storeId/media/:mediaId", () => {
  it("kullanimda olmayan gorsel → 204; storage.delete + prisma.delete + audit cagrildi", async () => {
    const { app, storage, recordAudit } = buildApp();

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");

    // Lookup tenant-izole yapildi.
    expect(prismaMock.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "media_1", storeId: "store_123" },
    });
    // 4 referans tablosu da storeId ile sinirli sorgulandi.
    expect(prismaMock.productImage.count).toHaveBeenCalledWith({
      where: { mediaId: "media_1", storeId: "store_123" },
    });
    expect(prismaMock.heroSlide.count).toHaveBeenCalledWith({
      where: { mediaId: "media_1", storeId: "store_123" },
    });
    expect(prismaMock.storeSettings.count).toHaveBeenCalledWith({
      where: {
        storeId: "store_123",
        OR: [{ logoMediaId: "media_1" }, { faviconMediaId: "media_1" }],
      },
    });
    expect(prismaMock.productCategory.count).toHaveBeenCalledWith({
      where: { imageId: "media_1", storeId: "store_123" },
    });

    expect(prismaMock.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "media_1" } });
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith("stores/store_123/products/abc.webp");
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      action: "DELETE",
      entityType: "MediaAsset",
      entityId: "media_1",
      storeId: "store_123",
    });
  });

  it("ProductImage'de kullaniliyor → 409 MEDIA_IN_USE; hicbir silme tetiklenmedi", async () => {
    const { app, storage } = buildApp();
    prismaMock.productImage.count.mockResolvedValue(2);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("MEDIA_IN_USE");
    expect(res.json().error.usedIn).toEqual(["ProductImage"]);
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("HeroSlide'de kullaniliyor → 409 MEDIA_IN_USE; silme yok", async () => {
    const { app, storage } = buildApp();
    prismaMock.heroSlide.count.mockResolvedValue(1);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.usedIn).toEqual(["HeroSlide"]);
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("StoreSettings'te (logo/favicon) kullaniliyor → 409 MEDIA_IN_USE; silme yok", async () => {
    const { app, storage } = buildApp();
    prismaMock.storeSettings.count.mockResolvedValue(1);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.usedIn).toEqual(["StoreSettings"]);
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("ProductCategory'de kullaniliyor → 409 MEDIA_IN_USE; silme yok", async () => {
    const { app, storage } = buildApp();
    prismaMock.productCategory.count.mockResolvedValue(1);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.usedIn).toEqual(["ProductCategory"]);
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("birden fazla tabloda kullaniliyor → 409; usedIn tum tablolari listeler", async () => {
    const { app } = buildApp();
    prismaMock.productImage.count.mockResolvedValue(1);
    prismaMock.heroSlide.count.mockResolvedValue(3);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.usedIn).toEqual(["ProductImage", "HeroSlide"]);
  });

  it("var olmayan mediaId → 404; referans kontrolu/silme calismadi", async () => {
    const { app, storage } = buildApp();
    prismaMock.mediaAsset.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/nope" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(prismaMock.productImage.count).not.toHaveBeenCalled();
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("baska store'un mediaId'si → 404 (tenant izolasyonu; yetkisiz bilgisi sizmaz)", async () => {
    const { app, storage } = buildApp();
    // findFirst { id, storeId } eslesmezse null doner → 404, "baska store'a ait" degil.
    prismaMock.mediaAsset.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: "DELETE", url: "/stores/store_999/media/media_1" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    expect(prismaMock.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "media_1", storeId: "store_999" },
    });
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("requireStoreAdmin reddederse guard'in kodu doner; hicbir silme tetiklenmedi", async () => {
    const { app, storage } = buildApp({
      storeAdmin: async (_req, reply) => {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      },
    });

    const res = await app.inject({ method: "DELETE", url: "/stores/store_123/media/media_1" });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect(prismaMock.mediaAsset.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.mediaAsset.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      mediaAsset: { findMany: vi.fn(), count: vi.fn() },
    },
  };
});

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

const { registerMediaAdminRoutes } = await import("../src/media/routes.js");
type MediaAdminRoutesDeps = Parameters<typeof registerMediaAdminRoutes>[1];

// GET yolu resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, ...) kullanir; bos base
// gorece yol uretir (CDN-hazir gecis) — test icin yeterli.
const CONFIG = { MEDIA_PUBLIC_BASE_URL: "" } as MediaAdminRoutesDeps["config"];

function buildApp(opts?: { storeAdmin?: MediaAdminRoutesDeps["requireStoreAdmin"] }) {
  const storage = { put: vi.fn(), delete: vi.fn(), exists: vi.fn() };
  const app = Fastify();
  registerMediaAdminRoutes(app, {
    config: CONFIG,
    storage,
    requireStoreAdmin: opts?.storeAdmin ?? (async () => ({ actorUserId: "user_1" })),
    recordAudit: vi.fn(async () => {}),
  });
  return { app };
}

function row(id: string, context = "PRODUCT") {
  return {
    id,
    storeId: "store_123",
    context,
    storageKey: `stores/store_123/products/${id}.webp`,
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
}

afterEach(() => vi.clearAllMocks());

describe("GET /stores/:storeId/media (ADR-065 Faz 2 / Dilim 1)", () => {
  beforeEach(() => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([row("m1"), row("m2")]);
    prismaMock.mediaAsset.count.mockResolvedValue(2);
  });

  it("store'un gorsellerini {data,pagination} olarak doner; storageKey/checksum SIZMAZ", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_123/media" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    // TODO-159B (ADR-090) — TD-095: ortak Data Grid meta'si (legacy ucler KORUNUR).
    expect(body.pagination).toEqual({
      limit: 25,
      offset: 0,
      total: 2,
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 1,
    });
    // Allowlist: ic alanlar response'a sizmaz.
    expect(body.data[0]).not.toHaveProperty("storageKey");
    expect(body.data[0]).not.toHaveProperty("checksum");
    expect(body.data[0]).not.toHaveProperty("createdBy");
    expect(body.data[0].url).toContain("stores/store_123/products/m1.webp");
    // storeId ile sinirli, en yeni once.
    expect(prismaMock.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { storeId: "store_123" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: 0,
      take: 25,
    });
  });

  it("context filtresi where'e eklenir", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_123/media?context=CATEGORY" });

    expect(res.statusCode).toBe(200);
    expect(prismaMock.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { storeId: "store_123", context: "CATEGORY" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: 0,
      take: 25,
    });
  });

  it("gecersiz context → 400; gateway sorgulanmaz", async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: "GET", url: "/stores/store_123/media?context=BOGUS" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.mediaAsset.findMany).not.toHaveBeenCalled();
  });

  it("requireStoreAdmin reddederse handler govde donmez", async () => {
    const { app } = buildApp({
      storeAdmin: async (_req, reply) => {
        await reply.code(403).send({ error: { code: "FORBIDDEN" } });
        return null;
      },
    });
    const res = await app.inject({ method: "GET", url: "/stores/store_123/media" });

    expect(res.statusCode).toBe(403);
    expect(prismaMock.mediaAsset.findMany).not.toHaveBeenCalled();
  });
});

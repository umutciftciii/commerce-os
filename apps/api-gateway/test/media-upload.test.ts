import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      mediaAsset: { create: vi.fn() },
    },
  };
});

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

// db mock kurulduktan SONRA import edilmeli.
const { registerMediaAdminRoutes } = await import("../src/media/routes.js");
type MediaAdminRoutesDeps = Parameters<typeof registerMediaAdminRoutes>[1];

const CONFIG = {
  MEDIA_PUBLIC_BASE_URL: undefined,
  MEDIA_STORAGE_DIR: "/tmp/media-test",
  MEDIA_MAX_UPLOAD_BYTES: 5_242_880,
} as unknown as AppConfig;

const BOUNDARY = "----mediatestboundary";

/** Bagimliliksiz multipart/form-data govdesi. Text field'lar dosyadan ONCE gelir. */
function multipartBody(
  fields: Array<{ name: string; value: string }>,
  file: { name: string; filename: string; contentType: string; buffer: Buffer } | null,
): Buffer {
  const parts: Buffer[] = [];
  for (const f of fields) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.buffer);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}

async function pngBuffer(size = 120): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

type StorageMock = {
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
};

function buildApp(opts?: {
  storeAdmin?: MediaAdminRoutesDeps["requireStoreAdmin"];
  maxBytes?: number;
}) {
  const storage: StorageMock = { put: vi.fn(), delete: vi.fn(), exists: vi.fn() };
  const recordAudit = vi.fn(async () => {});
  const app = Fastify();
  app.register(fastifyMultipart, {
    limits: { fileSize: opts?.maxBytes ?? CONFIG.MEDIA_MAX_UPLOAD_BYTES, files: 1 },
  });
  registerMediaAdminRoutes(app, {
    config: CONFIG,
    storage,
    requireStoreAdmin:
      opts?.storeAdmin ??
      (async () => ({ actorUserId: "user_1" })),
    recordAudit,
  });
  return { app, storage, recordAudit };
}

beforeEach(() => {
  prismaMock.mediaAsset.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "media_1",
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    ...data,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /stores/:storeId/media", () => {
  it("gecerli PNG → 201, webp'e normalize, url/context dogru; storage.put + audit cagrildi", async () => {
    const { app, storage, recordAudit } = buildApp();
    const body = multipartBody(
      [
        { name: "context", value: "PRODUCT" },
        { name: "altText", value: "kirmizi tisort" },
      ],
      { name: "file", filename: "x.png", contentType: "image/png", buffer: await pngBuffer() },
    );

    const res = await app.inject({
      method: "POST",
      url: "/stores/store_123/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });

    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.data.context).toBe("PRODUCT");
    expect(json.data.mimeType).toBe("image/webp");
    expect(json.data.altText).toBe("kirmizi tisort");
    // MEDIA_PUBLIC_BASE_URL bos → goreli /media/ + storeId path.
    expect(json.data.url).toMatch(/^\/media\/stores\/store_123\/products\/[^/]+\.webp$/);
    expect(json.data.byteSize).toBeGreaterThan(0);
    expect(json.data.width).toBe(120);
    // Ic alanlar sizmadi (allowlist).
    expect(json.data.storageKey).toBeUndefined();
    expect(json.data.checksum).toBeUndefined();
    expect(json.data.createdBy).toBeUndefined();

    expect(storage.put).toHaveBeenCalledTimes(1);
    const [putKey, putBuf, putType] = storage.put.mock.calls[0];
    expect(putKey).toMatch(/^stores\/store_123\/products\/[^/]+\.webp$/);
    expect(Buffer.isBuffer(putBuf)).toBe(true);
    expect(putType).toBe("image/webp");
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      action: "CREATE",
      entityType: "MediaAsset",
      storeId: "store_123",
    });
    expect(prismaMock.mediaAsset.create).toHaveBeenCalledTimes(1);
  });

  it("desteklenmeyen mime (text/plain) → 415, storage.put cagrilmadi", async () => {
    const { app, storage } = buildApp();
    const body = multipartBody([{ name: "context", value: "PRODUCT" }], {
      name: "file",
      filename: "x.txt",
      contentType: "text/plain",
      buffer: Buffer.from("merhaba"),
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("boyut asimi → 413, storage.put cagrilmadi", async () => {
    const { app, storage } = buildApp({ maxBytes: 256 });
    const body = multipartBody([{ name: "context", value: "PRODUCT" }], {
      name: "file",
      filename: "big.png",
      contentType: "image/png",
      buffer: await pngBuffer(400), // 256 byte'tan cok buyuk ham PNG
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("FILE_TOO_LARGE");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("bozuk gorsel (image/png mime + gecersiz icerik) → 422, storage.put cagrilmadi", async () => {
    const { app, storage } = buildApp();
    const body = multipartBody([{ name: "context", value: "PRODUCT" }], {
      name: "file",
      filename: "fake.png",
      contentType: "image/png",
      buffer: Buffer.from("bu bir gorsel degil, sadece metin"),
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_IMAGE");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("gecersiz context → 400 VALIDATION_ERROR", async () => {
    const { app, storage } = buildApp();
    const body = multipartBody([{ name: "context", value: "AVATAR" }], {
      name: "file",
      filename: "x.png",
      contentType: "image/png",
      buffer: await pngBuffer(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("requireStoreAdmin reddederse guard'in kodu doner; storage.put + prisma cagrilmadi", async () => {
    const { app, storage } = buildApp({
      storeAdmin: async (_req, reply) => {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      },
    });
    const body = multipartBody([{ name: "context", value: "PRODUCT" }], {
      name: "file",
      filename: "x.png",
      contentType: "image/png",
      buffer: await pngBuffer(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/media",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect(storage.put).not.toHaveBeenCalled();
    expect(prismaMock.mediaAsset.create).not.toHaveBeenCalled();
  });
});

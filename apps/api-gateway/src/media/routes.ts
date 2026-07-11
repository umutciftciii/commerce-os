/**
 * ADR-065 — Site-geneli gorsel yonetimi (Faz 1 / Adim 4a).
 *
 * store-admin gorsel yukleme ucu. Guvenlik/kurallar:
 *  - requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - storageKey DAIMA sunucu uretir (buildStorageKey); client'tan path kabul edilmez.
 *  - Girdi jpg/png/webp; sunucuda sharp ile TEK webp'e normalize edilir (rotate/resize).
 *  - Boyut limiti @fastify/multipart (config.MEDIA_MAX_UPLOAD_BYTES) + 413.
 *  - RESPONSE allowlist (mediaAssetSchema): storageKey/checksum/createdBy SIZMAZ;
 *    yalniz turetilmis `url` (resolveMediaUrl) ve gorunur meta doner.
 *
 * DELETE + 409 MEDIA_IN_USE ayri bir checkpoint'te (Adim 4b) eklenecek.
 */
import { createHash, randomUUID } from "node:crypto";

import type { MultipartFile } from "@fastify/multipart";
import type { AppConfig } from "@commerce-os/config";
import { mediaUploadResponseSchema } from "@commerce-os/contracts";
import { prisma } from "@commerce-os/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";

import type { StorageDriver } from "./storage.js";
import { buildStorageKey } from "./storage-key.js";
import { resolveMediaUrl } from "./url.js";

export interface MediaAdminRoutesDeps {
  config: AppConfig;
  storage: StorageDriver;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const storeParam = z.object({ storeId: z.string().min(1) });

const uploadFieldsSchema = z.object({
  context: z.enum(["PRODUCT", "CATEGORY", "HERO", "BRANDING"]),
  altText: z.string().trim().min(1).max(500).optional(),
});

// Girdi olarak kabul edilen mime turleri (cikti daima image/webp'e normalize edilir).
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Normalize hedefi: en fazla 2048px kenar (buyutmeden), webp q=82.
const MAX_EDGE = 2048;
const WEBP_QUALITY = 82;

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/** Multipart text field degerini (varsa) string olarak cikarir. */
function fieldValue(file: MultipartFile, name: string): string | undefined {
  const field = file.fields[name];
  if (!field || Array.isArray(field)) return undefined;
  if (field.type !== "field") return undefined;
  const value = field.value;
  return typeof value === "string" ? value : undefined;
}

export function registerMediaAdminRoutes(app: FastifyInstance, deps: MediaAdminRoutesDeps): void {
  const { config, storage } = deps;

  app.post("/stores/:storeId/media", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    // 1) Dosya (@fastify/multipart). Text field'lar (context/altText) dosyadan ONCE
    //    gonderilmeli — file.fields dosyaya kadar birikenleri tasir.
    const file = await request.file();
    if (!file) {
      return reply.code(400).send(errorBody("NO_FILE", "Yuklenecek dosya bulunamadi."));
    }

    // 2) Alan dogrulama (context zorunlu, enum; altText opsiyonel).
    const parsedFields = uploadFieldsSchema.safeParse({
      context: fieldValue(file, "context"),
      altText: fieldValue(file, "altText"),
    });
    if (!parsedFields.success) {
      return reply
        .code(400)
        .send(errorBody("VALIDATION_ERROR", "Gecersiz alanlar.", parsedFields.error.flatten()));
    }
    const { context, altText } = parsedFields.data;

    // 3) Girdi mime whitelist (cikti yine de webp'e normalize edilir).
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply
        .code(415)
        .send(errorBody("UNSUPPORTED_MEDIA_TYPE", "Yalnizca JPEG/PNG/WEBP kabul edilir."));
    }

    // 4) Buffer'a al — boyut asiminda @fastify/multipart throw eder (limits.fileSize).
    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send(
          errorBody("FILE_TOO_LARGE", "Dosya boyutu limiti asiliyor.", {
            maxBytes: config.MEDIA_MAX_UPLOAD_BYTES,
          }),
        );
      }
      throw err;
    }

    // 5) sharp normalize: EXIF auto-orient → max-kenar clamp (buyutmeden) → webp.
    let output: Buffer;
    let width: number | null = null;
    let height: number | null = null;
    try {
      const result = await sharp(input, { failOn: "error" })
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      output = result.data;
      width = result.info.width ?? null;
      height = result.info.height ?? null;
    } catch {
      return reply
        .code(422)
        .send(errorBody("INVALID_IMAGE", "Gorsel cozumlenemedi (bozuk ya da desteklenmeyen)."));
    }

    // 6) storageKey sunucu uretir; diske yaz + kaydi olustur.
    const storageKey = buildStorageKey(params.storeId, context, randomUUID());
    const checksum = createHash("sha256").update(output).digest("hex");
    await storage.put(storageKey, output, "image/webp");

    const created = await prisma.mediaAsset.create({
      data: {
        storeId: params.storeId,
        context,
        storageKey,
        mimeType: "image/webp",
        byteSize: output.length,
        width,
        height,
        altText: altText ?? null,
        checksum,
        createdBy: access.actorUserId,
      },
    });

    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "MediaAsset",
      entityId: created.id,
      metadata: { context, byteSize: output.length },
    });

    return reply.code(201).send(
      mediaUploadResponseSchema.parse({
        data: {
          id: created.id,
          context: created.context,
          url: resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, created.storageKey),
          mimeType: created.mimeType,
          byteSize: created.byteSize,
          width: created.width,
          height: created.height,
          altText: created.altText,
          createdAt: created.createdAt.toISOString(),
        },
      }),
    );
  });
}

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
 * DELETE /stores/:storeId/media/:mediaId (Adim 4b):
 *  - Tenant izolasyonu: findFirst { id, storeId }; baska store'un id'si → 404 (sizinti yok).
 *  - Referans butunlugu: MediaAsset hala ProductImage/HeroSlide/StoreSettings(logo|favicon)/
 *    ProductCategory tarafindan kullaniliyorsa 409 MEDIA_IN_USE (sessiz SetNull YOK).
 *    Kullanici once iliskiyi kaldirmali; hangi tablolarda kullanildigi `usedIn`'de doner.
 *  - Referans yoksa: prisma.delete + storage.delete (kayit + dosya birlikte) → 204.
 */
import { createHash, randomUUID } from "node:crypto";

import type { MultipartFile } from "@fastify/multipart";
import type { AppConfig } from "@commerce-os/config";
import {
  adminMediaListQuerySchema,
  buildAdminListPagination,
  buildSelectorIdsPagination,
  mediaListResponseSchema,
  mediaUploadResponseSchema,
  parseSelectorIds,
  resolveAdminListPage,
} from "@commerce-os/contracts";
import { prisma } from "@commerce-os/db";
import type { Prisma } from "@prisma/client";
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

/**
 * TODO-159B (ADR-090) — TD-095 kapanisi. Eski sabit `take: 100` KALDIRILDI;
 * uc artik gercek server-side sayfalama + arama + siralama + `ids` cozum modu
 * sunar. LIKE metakarakterleri Prisma `contains` ile parametre olarak tasinir
 * (string interpolasyonu YOK) — kontrolsuz wildcard riski bulunmaz.
 */
const MEDIA_SORT_FIELDS = {
  createdAt: "createdAt",
  altText: "altText",
  byteSize: "byteSize",
} as const;

const mediaDeleteParam = z.object({
  storeId: z.string().min(1),
  mediaId: z.string().min(1),
});

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

  // ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi. store'un yuklenmis gorsellerini
  // (opsiyonel context filtresiyle) dondurur; UI yeniden yukleme yerine var olan
  // gorseli baska entity'ye baglar. RESPONSE allowlist upload ile aynidir
  // (storageKey/checksum/createdBy SIZMAZ; yalniz turetilmis url + gorunur meta).
  //
  // TODO-159B (ADR-090) — gercek sayfalama + arama + siralama + `ids` cozum modu.
  // `ids` verildiginde arama/filtre/siralama UYGULANMAZ: yalniz o id'ler (mağaza
  // icinde) doner — duzenleme ekrani, secili gorsel ilk sayfada olmasa bile onu
  // gosterebilsin diye. Baska magazanin id'si sessizce ELENIR (var/yok bilgisi
  // sizmaz; DELETE'teki 404 deseniyle ayni ilke).
  app.get("/stores/:storeId/media", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    const parsed = adminMediaListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(errorBody("VALIDATION_ERROR", "Gecersiz sorgu parametresi.", parsed.error.flatten()));
    }
    const query = parsed.data;

    const serialize = (media: {
      id: string;
      context: string;
      storageKey: string;
      mimeType: string;
      byteSize: number;
      width: number | null;
      height: number | null;
      altText: string | null;
      createdAt: Date;
    }) => ({
      id: media.id,
      context: media.context,
      url: resolveMediaUrl(config.MEDIA_PUBLIC_BASE_URL, media.storageKey),
      mimeType: media.mimeType,
      byteSize: media.byteSize,
      width: media.width,
      height: media.height,
      altText: media.altText,
      createdAt: media.createdAt.toISOString(),
    });

    // ── `ids` cozum modu ───────────────────────────────────────────────────
    const selectedIds = parseSelectorIds(query.ids);
    if (query.ids !== undefined) {
      const rows =
        selectedIds.length === 0
          ? []
          : await prisma.mediaAsset.findMany({
              where: { storeId: params.storeId, id: { in: selectedIds } },
            });
      // Istemcinin verdigi SIRA korunur (secim sirasi anlamlidir).
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = selectedIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row !== undefined);
      return reply.send(
        mediaListResponseSchema.parse({
          data: ordered.map(serialize),
          pagination: buildSelectorIdsPagination(ordered.length),
        }),
      );
    }

    // ── Normal sayfalama modu ──────────────────────────────────────────────
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const where: Prisma.MediaAssetWhereInput = { storeId: params.storeId };
    if (query.context) where.context = query.context;
    // Arama YALNIZ altText uzerinde: modelde dosya adi kolonu yok, storageKey ise
    // opak sunucu yolu (allowlist geregi disariya hic cikmaz).
    if (query.search) where.altText = { contains: query.search, mode: "insensitive" };

    const field = MEDIA_SORT_FIELDS[query.sortBy ?? "createdAt"];
    const direction = query.sortOrder ?? (query.sortBy ? "asc" : "desc");
    // Ikincil anahtar id: esit degerli satirlarda sayfa siniri deterministiktir
    // (kayit atlanmasi/tekrari olmaz). altText nullable → NULLS LAST.
    const orderBy: Prisma.MediaAssetOrderByWithRelationInput[] =
      field === "altText"
        ? [{ altText: { sort: direction, nulls: "last" } }, { id: "asc" }]
        : [{ [field]: direction } as Prisma.MediaAssetOrderByWithRelationInput, { id: "asc" }];

    const [rows, total] = await Promise.all([
      prisma.mediaAsset.findMany({ where, orderBy, skip: offset, take: limit }),
      prisma.mediaAsset.count({ where }),
    ]);

    return reply.send(
      mediaListResponseSchema.parse({
        data: rows.map(serialize),
        pagination: buildAdminListPagination({ page, pageSize, totalItems: total }),
      }),
    );
  });

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

  app.delete("/stores/:storeId/media/:mediaId", async (request, reply) => {
    const params = mediaDeleteParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    // 1) Tenant-izole lookup. Baska store'un mediaId'si de dahil, bulunamayan her sey
    //    404 — "var ama senin degil" bilgisi sizdirilmaz.
    const media = await prisma.mediaAsset.findFirst({
      where: { id: params.mediaId, storeId: params.storeId },
    });
    if (!media) {
      return reply.code(404).send(errorBody("NOT_FOUND", "Gorsel bulunamadi."));
    }

    // 2) Referans butunlugu. Referans tablolarini storeId ile sinirli sayariz; herhangi
    //    birinde kullanim varsa silmeyi reddeder (sessiz SetNull YOK). Faz 2A (ADR-068):
    //    ProductAttributeValue.mediaId (IMAGE/FILE attribute degeri) FK onDelete: Restrict
    //    oldugundan burada da sayilir — aksi halde silme P2003 ile 500 verirdi.
    const [
      productImageCount,
      heroSlideCount,
      storeSettingsCount,
      categoryCount,
      attributeValueCount,
      // TODO-158A (ADR-086) — Home Experience: hero (desktop mediaId RESTRICT + mobil SetNull)
      // ve featured kategori kapak override'ı (SetNull). SetNull olanlar da sayilir (StoreSettings
      // logo/favicon deseni): sessiz koparma yerine 409 ile acik reddedilir.
      homeHeroCount,
      homeFeaturedCount,
    ] = await Promise.all([
        prisma.productImage.count({
          where: { mediaId: params.mediaId, storeId: params.storeId },
        }),
        prisma.heroSlide.count({
          where: { mediaId: params.mediaId, storeId: params.storeId },
        }),
        prisma.storeSettings.count({
          where: {
            storeId: params.storeId,
            OR: [{ logoMediaId: params.mediaId }, { faviconMediaId: params.mediaId }],
          },
        }),
        prisma.productCategory.count({
          where: { imageId: params.mediaId, storeId: params.storeId },
        }),
        prisma.productAttributeValue.count({
          where: { mediaId: params.mediaId, storeId: params.storeId },
        }),
        prisma.homeHeroSlide.count({
          where: {
            storeId: params.storeId,
            OR: [{ mediaId: params.mediaId }, { mobileMediaId: params.mediaId }],
          },
        }),
        prisma.homeFeaturedCategory.count({
          where: { imageMediaId: params.mediaId, storeId: params.storeId },
        }),
      ]);

    const usedIn: string[] = [];
    if (productImageCount > 0) usedIn.push("ProductImage");
    if (heroSlideCount > 0) usedIn.push("HeroSlide");
    if (storeSettingsCount > 0) usedIn.push("StoreSettings");
    if (categoryCount > 0) usedIn.push("ProductCategory");
    if (attributeValueCount > 0) usedIn.push("ProductAttributeValue");
    if (homeHeroCount > 0) usedIn.push("HomeHeroSlide");
    if (homeFeaturedCount > 0) usedIn.push("HomeFeaturedCategory");

    if (usedIn.length > 0) {
      // `usedIn` structured `details` altina konur: api-client hata zarfinda yalniz
      // `error.details`'i tasir (ADR-065 Faz 2 — zincirin UI'a kadar akmasi icin).
      return reply.code(409).send(
        errorBody("MEDIA_IN_USE", "Gorsel kullanimda; once iliskiyi kaldirin.", {
          details: { usedIn },
        }),
      );
    }

    // 3) Kayit + dosya birlikte silinir. Once DB (referans-butunlugu otoritesi),
    //    sonra dosya — dosya silme basarisiz olsa bile yetim dosya zararsizdir ve
    //    temizlenebilir; ters sira ise dangling kayit birakirdi.
    await prisma.mediaAsset.delete({ where: { id: media.id } });
    await storage.delete(media.storageKey);

    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "MediaAsset",
      entityId: media.id,
      metadata: { context: media.context, storageKey: media.storageKey },
    });

    return reply.code(204).send();
  });
}

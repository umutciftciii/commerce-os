/**
 * TODO-178 (Faz E) — Platform-request attachment upload/serve servis katmanı. Product Support
 * (routes-customer.ts) media akışının birebir paritesi: multipart file → görsel `webp`'e normalize
 * (sharp) / PDF as-is → StorageDriver.put → MediaAsset(context PLATFORM_REQUEST_ATTACHMENT) →
 * PlatformRequestAttachment satırı.
 *
 * HARD SECURITY:
 *  - storageKey DAİMA server-side üretilir (`buildStorageKey`); client'tan storageKey/mediaAssetId ALINMAZ.
 *  - Store upload visibility DAİMA STORE_VISIBLE (client gönderemez); platform upload server-validate.
 *  - Stream lookup store yüzeyinde YALNIZ STORE_VISIBLE + storeId-scoped (INTERNAL / cross-store → null → 404).
 *  - DTO ham storageKey/mediaAssetId taşımaz; yalnız güvenli `id` referansı.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@commerce-os/db";
import type { PlatformRequestMessageVisibility } from "@prisma/client";
import { buildStorageKey } from "../media/storage-key.js";
import type { StorageDriver } from "../media/storage.js";

// Route'lar bu sabitleri kendi doğrulamalarında da kullanır (support paritesi: in-module sabit).
export const PLATFORM_REQUEST_MAX_ATTACHMENT_BYTES = 5_242_880; // 5 MiB
export const PLATFORM_REQUEST_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type AttachmentType = "PHOTO" | "PDF";

type UploadFailure = { ok: false; code: "UNSUPPORTED_MEDIA_TYPE" | "FILE_TOO_LARGE" | "INVALID_IMAGE" };
type MediaResult = { ok: true; mediaAssetId: string; type: AttachmentType } | UploadFailure;

/**
 * Ham dosyayı işleyip MediaAsset oluşturur (henüz request'e bağlamaz). storageKey server-side üretilir;
 * görsel `webp`'e normalize edilir (EXIF döndürme + 2048px sınır), PDF as-is saklanır. Video/başka MIME reddedilir.
 */
async function storeMedia(
  storage: StorageDriver,
  storeId: string,
  raw: Buffer,
  mimetype: string,
  createdBy: string,
): Promise<MediaResult> {
  if (!PLATFORM_REQUEST_ALLOWED_MIME.has(mimetype)) return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  if (raw.byteLength > PLATFORM_REQUEST_MAX_ATTACHMENT_BYTES) return { ok: false, code: "FILE_TOO_LARGE" };

  let storageKey: string;
  let mimeType: string;
  let body: Buffer;
  let width: number | null = null;
  let height: number | null = null;
  let type: AttachmentType;

  if (mimetype === "application/pdf") {
    storageKey = buildStorageKey(storeId, "PLATFORM_REQUEST_ATTACHMENT", randomUUID(), "pdf");
    mimeType = "application/pdf";
    body = raw;
    type = "PDF";
  } else {
    try {
      const normalized = await sharp(raw)
        .rotate()
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const meta = await sharp(normalized).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      storageKey = buildStorageKey(storeId, "PLATFORM_REQUEST_ATTACHMENT", randomUUID(), "webp");
      mimeType = "image/webp";
      body = normalized;
      type = "PHOTO";
    } catch {
      return { ok: false, code: "INVALID_IMAGE" };
    }
  }

  await storage.put(storageKey, body, mimeType);
  const asset = await prisma.mediaAsset.create({
    data: {
      storeId,
      context: "PLATFORM_REQUEST_ATTACHMENT",
      storageKey,
      mimeType,
      byteSize: body.byteLength,
      width,
      height,
      createdBy,
    },
    select: { id: true },
  });
  return { ok: true, mediaAssetId: asset.id, type };
}

export type StoreAttachmentResult =
  | { ok: true; attachment: { id: string; type: AttachmentType; createdAt: string } }
  | { ok: false; code: "REQUEST_NOT_FOUND" | "REQUEST_CLOSED" | UploadFailure["code"] };

/** Store upload — visibility DAİMA STORE_VISIBLE (client gönderemez); request storeId-scoped. */
export async function addStoreRequestAttachment(
  input: { storeId: string; requestId: string; actorId: string; raw: Buffer; mimetype: string },
  storage: StorageDriver,
): Promise<StoreAttachmentResult> {
  const req = await prisma.platformRequest.findFirst({
    where: { id: input.requestId, storeId: input.storeId },
    select: { id: true, status: true },
  });
  if (!req) return { ok: false, code: "REQUEST_NOT_FOUND" };
  if (req.status === "CLOSED") return { ok: false, code: "REQUEST_CLOSED" };

  const media = await storeMedia(storage, input.storeId, input.raw, input.mimetype, `store:${input.actorId}`);
  if (!media.ok) return media;

  const att = await prisma.platformRequestAttachment.create({
    data: {
      storeId: input.storeId,
      requestId: input.requestId,
      mediaAssetId: media.mediaAssetId,
      visibility: "STORE_VISIBLE",
      type: media.type,
    },
    select: { id: true, createdAt: true },
  });
  await prisma.platformRequest.update({
    where: { id: input.requestId },
    data: { lastActivityAt: new Date() },
  });
  return { ok: true, attachment: { id: att.id, type: media.type, createdAt: att.createdAt.toISOString() } };
}

export type PlatformAttachmentResult =
  | {
      ok: true;
      attachment: { id: string; type: AttachmentType; visibility: PlatformRequestMessageVisibility; createdAt: string };
    }
  | { ok: false; code: "REQUEST_NOT_FOUND" | "REQUEST_CLOSED" | UploadFailure["code"] };

/** Platform upload — visibility server-validate (STORE_VISIBLE | INTERNAL). */
export async function addPlatformRequestAttachment(
  input: {
    requestId: string;
    actorId: string;
    raw: Buffer;
    mimetype: string;
    visibility: PlatformRequestMessageVisibility;
  },
  storage: StorageDriver,
): Promise<PlatformAttachmentResult> {
  const req = await prisma.platformRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, storeId: true, status: true },
  });
  if (!req) return { ok: false, code: "REQUEST_NOT_FOUND" };
  if (req.status === "CLOSED") return { ok: false, code: "REQUEST_CLOSED" };

  const media = await storeMedia(storage, req.storeId, input.raw, input.mimetype, `platform:${input.actorId}`);
  if (!media.ok) return media;

  const att = await prisma.platformRequestAttachment.create({
    data: {
      storeId: req.storeId,
      requestId: input.requestId,
      mediaAssetId: media.mediaAssetId,
      visibility: input.visibility,
      type: media.type,
    },
    select: { id: true, createdAt: true },
  });
  await prisma.platformRequest.update({
    where: { id: input.requestId },
    data: { lastActivityAt: new Date() },
  });
  return {
    ok: true,
    attachment: { id: att.id, type: media.type, visibility: input.visibility, createdAt: att.createdAt.toISOString() },
  };
}

/**
 * Store stream lookup — YALNIZ STORE_VISIBLE + storeId-scoped. INTERNAL ek veya başka store'un eki
 * (id bilinse bile) → null → route 404. Yalnız güvenli {storageKey, mimeType} döner (DTO'ya girmez).
 */
export async function getStoreAttachmentForStream(
  storeId: string,
  attachmentId: string,
): Promise<{ storageKey: string; mimeType: string } | null> {
  const att = await prisma.platformRequestAttachment.findFirst({
    where: { id: attachmentId, storeId, visibility: "STORE_VISIBLE" },
    select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
  });
  return att ? att.mediaAsset : null;
}

/** Platform stream lookup — STORE_VISIBLE + INTERNAL (tam yüzey). */
export async function getPlatformAttachmentForStream(
  attachmentId: string,
): Promise<{ storageKey: string; mimeType: string } | null> {
  const att = await prisma.platformRequestAttachment.findUnique({
    where: { id: attachmentId },
    select: { mediaAsset: { select: { storageKey: true, mimeType: true } } },
  });
  return att ? att.mediaAsset : null;
}

-- TODO-178 — Store → Platform Request & Task Management (Faz A foundation).
-- Additive: yalnız yeni enum/tablo + MediaContext değeri. Mevcut tablo/enum DEĞİŞTİRİLMEZ.
-- Kategori seed'i idempotent (ON CONFLICT key DO NOTHING); tek kaynak: packages/config
-- PLATFORM_REQUEST_CATEGORY_SEED. Numara sayacı GLOBAL (singleton id='global').

-- CreateEnum
CREATE TYPE "PlatformRequestStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_STORE', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PlatformRequestStoreImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PlatformRequestCloseReason" AS ENUM ('COMPLETED', 'WITHDRAWN_BY_STORE', 'NOT_ACTIONABLE', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlatformRequestActorKind" AS ENUM ('PLATFORM_USER', 'STORE_USER');

-- CreateEnum
CREATE TYPE "PlatformRequestActorType" AS ENUM ('STORE', 'PLATFORM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PlatformRequestMessageVisibility" AS ENUM ('STORE_VISIBLE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PlatformRequestContextKind" AS ENUM ('NONE', 'PLATFORM_TAXONOMY', 'PLATFORM_CONTENT', 'PLATFORM_POLICY', 'STORE_DATA', 'OTHER');

-- AlterEnum
ALTER TYPE "MediaContext" ADD VALUE 'PLATFORM_REQUEST_ATTACHMENT';

-- CreateTable
CREATE TABLE "PlatformRequestCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelTr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "defaultPriority" "PlatformRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "slaPolicyKey" TEXT NOT NULL DEFAULT 'DEFAULT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRequestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequestNumberCounter" (
    "id" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRequestNumberCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PlatformRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "PlatformRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "storeImpact" "PlatformRequestStoreImpact",
    "contextKind" "PlatformRequestContextKind" NOT NULL DEFAULT 'NONE',
    "contextSnapshot" JSONB,
    "createdByActorKind" "PlatformRequestActorKind" NOT NULL DEFAULT 'PLATFORM_USER',
    "createdByActorId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "assigneePlatformUserId" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" "PlatformRequestCloseReason",
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequestMessage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorType" "PlatformRequestActorType" NOT NULL,
    "actorId" TEXT,
    "visibility" "PlatformRequestMessageVisibility" NOT NULL DEFAULT 'STORE_VISIBLE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequestAttachment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "messageId" TEXT,
    "mediaAssetId" TEXT NOT NULL,
    "visibility" "PlatformRequestMessageVisibility" NOT NULL DEFAULT 'STORE_VISIBLE',
    "type" TEXT NOT NULL DEFAULT 'PHOTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequestHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "PlatformRequestStatus",
    "toStatus" "PlatformRequestStatus",
    "actorType" "PlatformRequestActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequestSlaSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "priority" "PlatformRequestPriority" NOT NULL,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseMetAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "policyLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequestSlaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRequestCategory_key_key" ON "PlatformRequestCategory"("key");

-- CreateIndex
CREATE INDEX "PlatformRequestCategory_active_sortOrder_idx" ON "PlatformRequestCategory"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRequest_requestNumber_key" ON "PlatformRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "PlatformRequest_storeId_status_lastActivityAt_idx" ON "PlatformRequest"("storeId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "PlatformRequest_storeId_assigneePlatformUserId_status_idx" ON "PlatformRequest"("storeId", "assigneePlatformUserId", "status");

-- CreateIndex
CREATE INDEX "PlatformRequest_status_priority_lastActivityAt_idx" ON "PlatformRequest"("status", "priority", "lastActivityAt");

-- CreateIndex
CREATE INDEX "PlatformRequest_assigneePlatformUserId_status_idx" ON "PlatformRequest"("assigneePlatformUserId", "status");

-- CreateIndex
CREATE INDEX "PlatformRequest_categoryId_idx" ON "PlatformRequest"("categoryId");

-- CreateIndex
CREATE INDEX "PlatformRequestMessage_storeId_requestId_createdAt_idx" ON "PlatformRequestMessage"("storeId", "requestId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformRequestMessage_requestId_visibility_createdAt_idx" ON "PlatformRequestMessage"("requestId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformRequestAttachment_storeId_idx" ON "PlatformRequestAttachment"("storeId");

-- CreateIndex
CREATE INDEX "PlatformRequestAttachment_requestId_visibility_idx" ON "PlatformRequestAttachment"("requestId", "visibility");

-- CreateIndex
CREATE INDEX "PlatformRequestAttachment_mediaAssetId_idx" ON "PlatformRequestAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "PlatformRequestHistory_storeId_requestId_createdAt_idx" ON "PlatformRequestHistory"("storeId", "requestId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformRequestHistory_eventType_createdAt_idx" ON "PlatformRequestHistory"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformRequestSlaSnapshot_storeId_requestId_cycle_idx" ON "PlatformRequestSlaSnapshot"("storeId", "requestId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRequestSlaSnapshot_requestId_cycle_key" ON "PlatformRequestSlaSnapshot"("requestId", "cycle");

-- AddForeignKey
ALTER TABLE "PlatformRequest" ADD CONSTRAINT "PlatformRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequest" ADD CONSTRAINT "PlatformRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlatformRequestCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestMessage" ADD CONSTRAINT "PlatformRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlatformRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestAttachment" ADD CONSTRAINT "PlatformRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlatformRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestAttachment" ADD CONSTRAINT "PlatformRequestAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "PlatformRequestMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestAttachment" ADD CONSTRAINT "PlatformRequestAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestHistory" ADD CONSTRAINT "PlatformRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlatformRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRequestSlaSnapshot" ADD CONSTRAINT "PlatformRequestSlaSnapshot_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlatformRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Deterministic platform-managed category taxonomy seed (idempotent).
INSERT INTO "PlatformRequestCategory" ("id", "key", "labelTr", "labelEn", "defaultPriority", "slaPolicyKey", "active", "sortOrder", "createdAt", "updatedAt") VALUES
  ('prcat_cancellation_taxonomy', 'CANCELLATION_TAXONOMY', 'İptal Nedeni Taksonomisi', 'Cancellation Reason Taxonomy', 'NORMAL', 'DEFAULT', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prcat_product_support_config', 'PRODUCT_SUPPORT_CONFIG', 'Ürün Desteği Yapılandırması', 'Product Support Configuration', 'NORMAL', 'DEFAULT', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prcat_catalog_taxonomy', 'CATALOG_TAXONOMY', 'Katalog/Kategori Taksonomisi', 'Catalogue/Category Taxonomy', 'NORMAL', 'DEFAULT', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prcat_platform_policy', 'PLATFORM_POLICY', 'Platform Politikası', 'Platform Policy', 'NORMAL', 'POLICY_REVIEW', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('prcat_operational_other', 'OPERATIONAL_OTHER', 'Operasyonel / Diğer', 'Operational / Other', 'NORMAL', 'DEFAULT', true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

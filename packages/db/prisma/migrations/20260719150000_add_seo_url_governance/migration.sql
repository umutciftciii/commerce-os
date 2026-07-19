-- TODO-156D (ADR-081/082) — SEO URL yönetimi temeli: SlugHistory + Redirect (additive, nullable-safe).
-- Yeni tablolar/enumlar; mevcut tabloya kolon EKLENMEZ → geri-uyumlu, veri kaybı YOK.

-- CreateEnum
CREATE TYPE "SlugEntityType" AS ENUM ('PRODUCT', 'CATEGORY', 'CMS_PAGE');

-- CreateEnum
CREATE TYPE "RedirectType" AS ENUM ('PERMANENT_301', 'FOUND_302', 'TEMPORARY_307', 'PERMANENT_308');

-- CreateTable
CREATE TABLE "SlugHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entityType" "SlugEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "SlugHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "type" "RedirectType" NOT NULL DEFAULT 'PERMANENT_301',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlugHistory_storeId_idx" ON "SlugHistory"("storeId");

-- CreateIndex
CREATE INDEX "SlugHistory_storeId_entityType_entityId_idx" ON "SlugHistory"("storeId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlugHistory_storeId_entityType_oldSlug_key" ON "SlugHistory"("storeId", "entityType", "oldSlug");

-- CreateIndex
CREATE INDEX "Redirect_storeId_idx" ON "Redirect"("storeId");

-- CreateIndex
CREATE INDEX "Redirect_storeId_enabled_idx" ON "Redirect"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_storeId_sourcePath_key" ON "Redirect"("storeId", "sourcePath");

-- AddForeignKey
ALTER TABLE "SlugHistory" ADD CONSTRAINT "SlugHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redirect" ADD CONSTRAINT "Redirect_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;


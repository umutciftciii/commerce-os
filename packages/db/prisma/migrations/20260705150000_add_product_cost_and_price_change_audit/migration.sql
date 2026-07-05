-- F4B — Urun maliyet/marj + liste-fiyati ayrimi + fiyat degisikligi audit'i.
-- ADDITIVE-only: mevcut kolonlara dokunmaz, veri silmez/yeniden adlandirmaz.
-- costMinor SATIS fiyatini (priceMinor) DEGISTIRMEZ; checkout semantigi korunur.
-- Backfill YOK: mevcut varyantlarda costMinor NULL kalir.

-- AlterTable
ALTER TABLE "ProductVariant"
    ADD COLUMN "costMinor" INTEGER;

-- CreateEnum
CREATE TYPE "PriceChangeSource" AS ENUM ('ADMIN_EDIT', 'IMPORT', 'API');

-- CreateTable (append-only audit; EU Omnibus "son 30 gun min fiyat" temeli)
CREATE TABLE "ProductPriceChange" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "changedByPlatformUserId" TEXT,
    "currency" TEXT NOT NULL,
    "oldPriceMinor" INTEGER,
    "newPriceMinor" INTEGER,
    "oldCompareAtMinor" INTEGER,
    "newCompareAtMinor" INTEGER,
    "oldCostMinor" INTEGER,
    "newCostMinor" INTEGER,
    "source" "PriceChangeSource" NOT NULL DEFAULT 'ADMIN_EDIT',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceChange_storeId_variantId_createdAt_idx" ON "ProductPriceChange"("storeId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductPriceChange_storeId_createdAt_idx" ON "ProductPriceChange"("storeId", "createdAt");

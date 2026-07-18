-- TODO-150 (ADR-073) — Identity Management Engine (SKU / Barcode / Variant Title).
-- TAMAMEN ADDITIVE + non-destructive:
--   * ProductVariant'a titleIsCustom BOOLEAN NOT NULL DEFAULT false (baslik override korumasi)
--   * yeni enum VariantIdentityField (SKU|BARCODE|TITLE) — ileride GTIN/EAN/... eklenebilir
--   * yeni tablo VariantIdentityChange (append-only bulk-apply audit; undo metadata, batchId gruplu)
-- Mevcut ProductVariant verisine/SKU'suna/barcode'una/basligina DOKUNULMAZ; titleIsCustom default
-- false → mevcut basliklar gorunmez sekilde "motor-yonetimli" sayilir ama yalnizca ACIK bir
-- preview-gate'li apply yazar (davranis regresyonu yok). Down migration yok (repo standardi).

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "titleIsCustom" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "VariantIdentityField" AS ENUM ('SKU', 'BARCODE', 'TITLE');

-- CreateTable
CREATE TABLE "VariantIdentityChange" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "field" "VariantIdentityField" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "pattern" TEXT,
    "changedByPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantIdentityChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantIdentityChange_storeId_idx" ON "VariantIdentityChange"("storeId");

-- CreateIndex
CREATE INDEX "VariantIdentityChange_productId_idx" ON "VariantIdentityChange"("productId");

-- CreateIndex
CREATE INDEX "VariantIdentityChange_variantId_idx" ON "VariantIdentityChange"("variantId");

-- CreateIndex
CREATE INDEX "VariantIdentityChange_batchId_idx" ON "VariantIdentityChange"("batchId");

-- AddForeignKey
ALTER TABLE "VariantIdentityChange" ADD CONSTRAINT "VariantIdentityChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantIdentityChange" ADD CONSTRAINT "VariantIdentityChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantIdentityChange" ADD CONSTRAINT "VariantIdentityChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

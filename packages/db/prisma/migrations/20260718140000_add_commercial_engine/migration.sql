-- TODO-151 (ADR-074) — Commercial Engine (Price / Compare-at / Cost / VAT).
-- TAMAMEN ADDITIVE + non-destructive:
--   * yeni enum CommercialField (PRICE|COMPARE_AT_PRICE|COST|VAT_RATE) — ileride ek alan eklenebilir
--   * yeni enum CommercialChangeSource (DIRECT_EDIT|BULK_RULE)
--   * yeni tablo VariantCommercialChange (append-only bulk-apply audit; undo metadata, batchId gruplu)
-- Mevcut ProductVariant fiyat kolonlari (priceMinor/compareAtMinor/costMinor/netPriceMinor/vatRateBps/
-- vatAmountMinor) DEGISMEZ; ProductPriceChange (F4B) da BOZULMAZ. Yeni fiyat modeli/backfill/float
-- gecisi YOK. Down migration yok (repo standardi).

-- CreateEnum
CREATE TYPE "CommercialField" AS ENUM ('PRICE', 'COMPARE_AT_PRICE', 'COST', 'VAT_RATE');

-- CreateEnum
CREATE TYPE "CommercialChangeSource" AS ENUM ('DIRECT_EDIT', 'BULK_RULE');

-- CreateTable
CREATE TABLE "VariantCommercialChange" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "field" "CommercialField" NOT NULL,
    "oldValue" INTEGER,
    "newValue" INTEGER,
    "currency" TEXT NOT NULL,
    "source" "CommercialChangeSource" NOT NULL,
    "ruleSnapshot" JSONB,
    "changedByPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantCommercialChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantCommercialChange_storeId_idx" ON "VariantCommercialChange"("storeId");

-- CreateIndex
CREATE INDEX "VariantCommercialChange_productId_idx" ON "VariantCommercialChange"("productId");

-- CreateIndex
CREATE INDEX "VariantCommercialChange_variantId_idx" ON "VariantCommercialChange"("variantId");

-- CreateIndex
CREATE INDEX "VariantCommercialChange_batchId_idx" ON "VariantCommercialChange"("batchId");

-- CreateIndex
CREATE INDEX "VariantCommercialChange_storeId_variantId_createdAt_idx" ON "VariantCommercialChange"("storeId", "variantId", "createdAt");

-- AddForeignKey
ALTER TABLE "VariantCommercialChange" ADD CONSTRAINT "VariantCommercialChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantCommercialChange" ADD CONSTRAINT "VariantCommercialChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantCommercialChange" ADD CONSTRAINT "VariantCommercialChange_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TODO-165 Fashion Vertical Foundation (ADR-249/ADR-252) — ADDITIVE + IMMUTABLE migration.
--
-- Hicbir kolon DUSURULMEZ/YENIDEN-ADLANDIRILMAZ. Tum yeni OrderLine kolonlari NULLABLE →
-- mevcut siparis kalemleri korunur, hicbir sipariş görünümü degismez (legacy'de NULL kalir,
-- yeniden hesaplanmaz). SizeChart* tablolari yenidir; FASHION_VERTICAL capability kapali
-- magazalarda hic satir uretilmez (davranis degismez). Applied migration immutable.
--
-- Kapsam:
--   1) OrderLine additive fashion snapshot kolonlari (7 alan, nullable).
--   2) SizeChartStatus / SizeChartScope enum'lari.
--   3) SizeChart / SizeChartRevision / SizeChartAssignment tablolari + index + FK.

-- ─────────────────────── 1) OrderLine fashion snapshot (additive) ───────────────────────
ALTER TABLE "OrderLine" ADD COLUMN "selectedColor" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "selectedColorHex" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "selectedSize" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "sizeSystem" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "swatchLabel" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "materialSummary" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "variantDisplayName" TEXT;

-- ─────────────────────── 2) Enums ───────────────────────
-- CreateEnum
CREATE TYPE "SizeChartStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SizeChartScope" AS ENUM ('STORE', 'CATEGORY', 'PRODUCT');

-- ─────────────────────── 3) Size chart tablolari ───────────────────────
-- CreateTable
CREATE TABLE "SizeChart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeSystemKey" TEXT NOT NULL,
    "measurementUnit" TEXT NOT NULL DEFAULT 'CM',
    "gender" TEXT,
    "locale" TEXT,
    "status" "SizeChartStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedRevisionId" TEXT,
    "draftColumns" JSONB NOT NULL DEFAULT '[]',
    "draftRows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeChartRevision" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sizeChartId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizeChartRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeChartAssignment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sizeChartId" TEXT NOT NULL,
    "scope" "SizeChartScope" NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizeChartAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SizeChart_storeId_idx" ON "SizeChart"("storeId");

-- CreateIndex
CREATE INDEX "SizeChart_storeId_status_idx" ON "SizeChart"("storeId", "status");

-- CreateIndex
CREATE INDEX "SizeChartRevision_storeId_idx" ON "SizeChartRevision"("storeId");

-- CreateIndex
CREATE INDEX "SizeChartRevision_sizeChartId_idx" ON "SizeChartRevision"("sizeChartId");

-- CreateIndex
CREATE UNIQUE INDEX "SizeChartRevision_sizeChartId_revision_key" ON "SizeChartRevision"("sizeChartId", "revision");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_storeId_idx" ON "SizeChartAssignment"("storeId");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_sizeChartId_idx" ON "SizeChartAssignment"("sizeChartId");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_categoryId_idx" ON "SizeChartAssignment"("categoryId");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_productId_idx" ON "SizeChartAssignment"("productId");

-- CreateIndex
-- NOT: nullable kolonlarda Postgres NULL'lari DISTINCT sayar; bu yuzden STORE-scope
-- (categoryId=NULL, productId=NULL) tekilligi ek olarak SERVIS katmaninda enforce edilir.
CREATE UNIQUE INDEX "SizeChartAssignment_storeId_scope_categoryId_productId_key" ON "SizeChartAssignment"("storeId", "scope", "categoryId", "productId");

-- AddForeignKey
ALTER TABLE "SizeChart" ADD CONSTRAINT "SizeChart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartRevision" ADD CONSTRAINT "SizeChartRevision_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartRevision" ADD CONSTRAINT "SizeChartRevision_sizeChartId_fkey" FOREIGN KEY ("sizeChartId") REFERENCES "SizeChart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_sizeChartId_fkey" FOREIGN KEY ("sizeChartId") REFERENCES "SizeChart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

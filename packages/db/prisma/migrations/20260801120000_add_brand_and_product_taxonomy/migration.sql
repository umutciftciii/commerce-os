-- TODO-165A (ADR-165A) — Product Data Governance Faz 1: Brand + ProductTaxonomyValue temeli.
-- ADDITIVE (+ güvenli constraint swap, veri kaybı YOK).
--
-- Hicbir mevcut kolon DUSURULMEZ/YENIDEN-ADLANDIRILMAZ. Product.brand (legacy serbest-metin)
-- ve ProductSearchDocument.brand (legacy snapshot) DORMANT olarak KORUNUR — yeni Brand/
-- brandId/brandSlug/brandName alanlari onlarin YANINDA yasar. AttributeOption.storeId +
-- store FK zaten mevcuttu (Faz 1B); bu migration yalniz `metadata` kolonunu ekler.
--
-- Tek YIKICI-GORUNEN ama GUVENLI adim: AttributeOption'daki eski global
-- @@unique([attributeDefinitionId, value]) constraint'i iki PARTIAL unique index ile
-- degistirilir (Prisma partial unique index ifade edemez). Mevcut tum AttributeOption
-- satirlari storeId=NULL oldugundan (henuz store-scoped option hic yaratilmadi), yeni
-- global partial index ("storeId" IS NULL) eski constraint ile TAM AYNI garantiyi verir
-- → sifir ihlal, sifir veri kaybi. Yeni store-scoped partial index ise ayni degerin farkli
-- magazalarda BAGIMSIZ olarak var olabilmesini acar (governance/taksonomi on-kosulu).
--
-- Kapsam:
--   1) BrandStatus / ProductTaxonomyType / ProductTaxonomyStatus enum'lari.
--   2) Brand tablosu.
--   3) ProductTaxonomyValue tablosu (AttributeOption'a 1:1 governance katmani).
--   4) Product.brandId (governed marka referansi, SetNull).
--   5) AttributeOption.metadata (JSONB) + eski global unique constraint → iki partial
--      unique index swap.
--   6) ProductSearchDocument.brandId/brandSlug/brandName (turetilmis arama snapshot'i).

-- ─────────────────────── 1) Enum'lar ───────────────────────
-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductTaxonomyType" AS ENUM ('SEASON', 'COLLECTION', 'MATERIAL', 'FIT', 'PATTERN', 'COLLAR', 'SLEEVE', 'LENGTH', 'CARE_LABEL', 'SUSTAINABILITY_LABEL', 'COLOR_FAMILY');

-- CreateEnum
CREATE TYPE "ProductTaxonomyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- ─────────────────────── 2) Brand ───────────────────────
-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoMediaId" TEXT,
    "coverMediaId" TEXT,
    "websiteUrl" TEXT,
    "status" "BrandStatus" NOT NULL DEFAULT 'ACTIVE',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_storeId_slug_key" ON "Brand"("storeId", "slug");

-- CreateIndex
CREATE INDEX "Brand_storeId_idx" ON "Brand"("storeId");

-- CreateIndex
CREATE INDEX "Brand_storeId_status_idx" ON "Brand"("storeId", "status");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────── 3) ProductTaxonomyValue ───────────────────────
-- CreateTable
CREATE TABLE "ProductTaxonomyValue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "ProductTaxonomyType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProductTaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "parentId" TEXT,
    "attributeOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTaxonomyValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTaxonomyValue_attributeOptionId_key" ON "ProductTaxonomyValue"("attributeOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTaxonomyValue_storeId_type_slug_key" ON "ProductTaxonomyValue"("storeId", "type", "slug");

-- CreateIndex
CREATE INDEX "ProductTaxonomyValue_storeId_type_status_idx" ON "ProductTaxonomyValue"("storeId", "type", "status");

-- AddForeignKey
ALTER TABLE "ProductTaxonomyValue" ADD CONSTRAINT "ProductTaxonomyValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxonomyValue" ADD CONSTRAINT "ProductTaxonomyValue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductTaxonomyValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTaxonomyValue" ADD CONSTRAINT "ProductTaxonomyValue_attributeOptionId_fkey" FOREIGN KEY ("attributeOptionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────── 4) Product.brandId (governed marka referansi) ───────────────────────
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "brandId" TEXT;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Product_storeId_brandId_idx" ON "Product"("storeId", "brandId");

-- ─────────────────── 5) AttributeOption.metadata + partial-unique constraint swap ───────────────────
-- AlterTable
ALTER TABLE "AttributeOption" ADD COLUMN "metadata" JSONB;

-- Eski GLOBAL unique constraint (attributeDefinitionId, value) kaldirilir. Mevcut satirlarin
-- TAMAMI storeId=NULL oldugundan asagidaki global partial index ayni garantiyi SIFIR ihlalle
-- devralir (verify: `\d "AttributeOption"` → gercek isim "AttributeOption_attributeDefinitionId_value_key").
-- NOT: bu, Prisma `@@unique` cikisi oldugundan pg_constraint'te bir CONSTRAINT DEGIL, salt bir
-- UNIQUE INDEX'tir (bkz. ilk migration: `CREATE UNIQUE INDEX ...`, `ALTER TABLE ADD CONSTRAINT`
-- DEGIL) → `DROP CONSTRAINT` eslesme bulamaz; dogru komut `DROP INDEX`'tir.
DROP INDEX IF EXISTS "AttributeOption_attributeDefinitionId_value_key";

-- CreateIndex (partial — storeId NULL = platform/global canonical secenek; global tekillik).
CREATE UNIQUE INDEX "AttributeOption_def_value_global_key" ON "AttributeOption"("attributeDefinitionId", "value") WHERE "storeId" IS NULL;

-- CreateIndex (partial — storeId NOT NULL = magaza-sahipli secenek; magaza-ici tekillik).
CREATE UNIQUE INDEX "AttributeOption_store_def_value_key" ON "AttributeOption"("storeId", "attributeDefinitionId", "value") WHERE "storeId" IS NOT NULL;

-- ─────────────────────── 6) ProductSearchDocument governed Brand snapshot ───────────────────────
-- AlterTable
ALTER TABLE "ProductSearchDocument" ADD COLUMN "brandId" TEXT,
ADD COLUMN "brandSlug" TEXT,
ADD COLUMN "brandName" TEXT;

-- CreateIndex
CREATE INDEX "ProductSearchDocument_storeId_brandSlug_idx" ON "ProductSearchDocument"("storeId", "brandSlug");

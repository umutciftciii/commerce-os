-- TODO-158A (ADR-086) — Home Experience Platform: yönetilebilir ana sayfa section altyapısı.
-- TAMAMEN ADDITIVE: yalnız yeni tablolar + FK/index oluşturur; mevcut tabloları DEĞİŞTİRMEZ.
-- (Prisma diff'in ürettiği ProductSearchDocument gin/trgm index drift satırları KASITLI
--  olarak çıkarıldı — Search read-model'e ait raw-SQL index'ler; bu migration'a ait değil.)

-- CreateTable
CREATE TABLE "HomePage" (
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomePage_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "HomeSection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "desktopVisible" BOOLEAN NOT NULL DEFAULT true,
    "mobileVisible" BOOLEAN NOT NULL DEFAULT true,
    "publishStart" TIMESTAMP(3),
    "publishEnd" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeHeroSlide" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "mobileMediaId" TEXT,
    "videoUrl" TEXT,
    "headline" TEXT,
    "subtext" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "targetProductId" TEXT,
    "targetCategoryId" TEXT,
    "targetCampaignId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishStart" TIMESTAMP(3),
    "publishEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeHeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeFeaturedCategory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "imageMediaId" TEXT,
    "titleOverride" TEXT,
    "descriptionOverride" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeFeaturedCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeShowcaseProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeShowcaseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeSection_storeId_idx" ON "HomeSection"("storeId");

-- CreateIndex
CREATE INDEX "HomeSection_storeId_enabled_idx" ON "HomeSection"("storeId", "enabled");

-- CreateIndex
CREATE INDEX "HomeSection_storeId_sortOrder_idx" ON "HomeSection"("storeId", "sortOrder");

-- CreateIndex
CREATE INDEX "HomeHeroSlide_storeId_idx" ON "HomeHeroSlide"("storeId");

-- CreateIndex
CREATE INDEX "HomeHeroSlide_sectionId_idx" ON "HomeHeroSlide"("sectionId");

-- CreateIndex
CREATE INDEX "HomeFeaturedCategory_storeId_idx" ON "HomeFeaturedCategory"("storeId");

-- CreateIndex
CREATE INDEX "HomeFeaturedCategory_sectionId_idx" ON "HomeFeaturedCategory"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeFeaturedCategory_sectionId_categoryId_key" ON "HomeFeaturedCategory"("sectionId", "categoryId");

-- CreateIndex
CREATE INDEX "HomeShowcaseProduct_storeId_idx" ON "HomeShowcaseProduct"("storeId");

-- CreateIndex
CREATE INDEX "HomeShowcaseProduct_sectionId_idx" ON "HomeShowcaseProduct"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeShowcaseProduct_sectionId_productId_key" ON "HomeShowcaseProduct"("sectionId", "productId");

-- AddForeignKey
ALTER TABLE "HomePage" ADD CONSTRAINT "HomePage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSection" ADD CONSTRAINT "HomeSection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "HomePage"("storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "HomeHeroSlide_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "HomeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "HomeHeroSlide_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "HomeHeroSlide_mobileMediaId_fkey" FOREIGN KEY ("mobileMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeFeaturedCategory" ADD CONSTRAINT "HomeFeaturedCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "HomeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeFeaturedCategory" ADD CONSTRAINT "HomeFeaturedCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeFeaturedCategory" ADD CONSTRAINT "HomeFeaturedCategory_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeShowcaseProduct" ADD CONSTRAINT "HomeShowcaseProduct_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "HomeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeShowcaseProduct" ADD CONSTRAINT "HomeShowcaseProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


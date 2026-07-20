-- TODO-158B (ADR-087) — Enterprise Theme Engine & Design Token Architecture.
-- TAMAMEN ADDITIVE: yalnız yeni tablolar + FK/index oluşturur; mevcut tabloları
-- DEĞİŞTİRMEZ. Görsel kimlik store-scoped, versiyonlu JSON belgesinde (document)
-- tutulur → yeni token grubu/anahtarı eklemek MIGRATION GEREKTİRMEZ.
-- (Prisma diff'in ürettiği ProductSearchDocument gin/trgm index drift satırları
--  KASITLI olarak çıkarıldı — Search read-model'e ait; bu migration'a ait değil.)

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeVersion" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "notes" TEXT,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ThemeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Theme_storeId_idx" ON "Theme"("storeId");

-- CreateIndex
CREATE INDEX "Theme_storeId_status_idx" ON "Theme"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeVersion_themeId_version_key" ON "ThemeVersion"("themeId", "version");

-- CreateIndex
CREATE INDEX "ThemeVersion_themeId_idx" ON "ThemeVersion"("themeId");

-- CreateIndex
CREATE INDEX "ThemeVersion_themeId_status_idx" ON "ThemeVersion"("themeId", "status");

-- CreateIndex
CREATE INDEX "ThemeVersion_storeId_idx" ON "ThemeVersion"("storeId");

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeVersion" ADD CONSTRAINT "ThemeVersion_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

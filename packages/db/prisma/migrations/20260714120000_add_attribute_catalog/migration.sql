-- Faz 1B (ADR-067) — Attribute katalog cekirdegi. TAMAMEN ADDITIVE + non-destructive:
-- yalniz yeni enum'lar + yeni tablolar eklenir; mevcut tablolara/kolonlara DOKUNULMAZ.
-- Urun/varyant deger tablolari (ProductAttributeValue vb.) bu migration KAPSAMINDA DEGIL.

-- CreateEnum
CREATE TYPE "AttributeScope" AS ENUM ('PLATFORM', 'STORE');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'TEXTAREA', 'RICH_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'URL', 'SELECT', 'MULTI_SELECT', 'COLOR', 'IMAGE', 'FILE');

-- CreateEnum
CREATE TYPE "AttributeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "scope" "AttributeScope" NOT NULL,
    "storeId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataType" "AttributeDataType" NOT NULL,
    "unit" TEXT,
    "status" "AttributeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeGroup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "storeId" TEXT,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "AttributeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "groupId" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "comparable" BOOLEAN NOT NULL DEFAULT false,
    "variantDefining" BOOLEAN NOT NULL DEFAULT false,
    "visibleOnProductPage" BOOLEAN NOT NULL DEFAULT true,
    "visibleOnListing" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "validationRules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributeDefinition_storeId_idx" ON "AttributeDefinition"("storeId");

-- CreateIndex
CREATE INDEX "AttributeDefinition_scope_idx" ON "AttributeDefinition"("scope");

-- CreateIndex
CREATE INDEX "AttributeDefinition_status_idx" ON "AttributeDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_storeId_code_key" ON "AttributeDefinition"("storeId", "code");

-- CreateIndex
CREATE INDEX "AttributeGroup_storeId_idx" ON "AttributeGroup"("storeId");

-- CreateIndex
CREATE INDEX "AttributeOption_attributeDefinitionId_idx" ON "AttributeOption"("attributeDefinitionId");

-- CreateIndex
CREATE INDEX "AttributeOption_storeId_idx" ON "AttributeOption"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeDefinitionId_value_key" ON "AttributeOption"("attributeDefinitionId", "value");

-- CreateIndex
CREATE INDEX "CategoryAttribute_storeId_idx" ON "CategoryAttribute"("storeId");

-- CreateIndex
CREATE INDEX "CategoryAttribute_categoryId_idx" ON "CategoryAttribute"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryAttribute_attributeDefinitionId_idx" ON "CategoryAttribute"("attributeDefinitionId");

-- CreateIndex
CREATE INDEX "CategoryAttribute_groupId_idx" ON "CategoryAttribute"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAttribute_categoryId_attributeDefinitionId_key" ON "CategoryAttribute"("categoryId", "attributeDefinitionId");

-- AddForeignKey
ALTER TABLE "AttributeDefinition" ADD CONSTRAINT "AttributeDefinition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeGroup" ADD CONSTRAINT "AttributeGroup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AttributeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

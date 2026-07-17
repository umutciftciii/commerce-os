-- Faz 2C-1 (ADR-070) — Varyant motoru TEMELI: urun-seviyesi variant-defining eksen secimi.
-- TAMAMEN ADDITIVE + non-destructive: yalniz iki yeni tablo + index/FK eklenir; mevcut tablolara/
-- kolonlara (ProductVariant.optionValues dahil) DOKUNULMAZ. Bu migration KOMBINASYON URETMEZ:
-- ProductVariant / combinationKey / Cartesian / SKU matris YOK. Gelecekteki Combination Engine
-- bu iki tabloyu (eksenler × secilen option'lar) tuketecek.

-- CreateTable
CREATE TABLE "ProductVariantAttribute" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionSelection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productVariantAttributeId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantOptionSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantAttribute_productId_attributeDefinitionId_key" ON "ProductVariantAttribute"("productId", "attributeDefinitionId");

-- CreateIndex
CREATE INDEX "ProductVariantAttribute_storeId_idx" ON "ProductVariantAttribute"("storeId");

-- CreateIndex
CREATE INDEX "ProductVariantAttribute_productId_idx" ON "ProductVariantAttribute"("productId");

-- CreateIndex
CREATE INDEX "ProductVariantAttribute_attributeDefinitionId_idx" ON "ProductVariantAttribute"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantOptionSelection_productVariantAttributeId_opt_key" ON "ProductVariantOptionSelection"("productVariantAttributeId", "optionId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionSelection_storeId_idx" ON "ProductVariantOptionSelection"("storeId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionSelection_productVariantAttributeId_idx" ON "ProductVariantOptionSelection"("productVariantAttributeId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionSelection_optionId_idx" ON "ProductVariantOptionSelection"("optionId");

-- AddForeignKey
ALTER TABLE "ProductVariantAttribute" ADD CONSTRAINT "ProductVariantAttribute_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttribute" ADD CONSTRAINT "ProductVariantAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttribute" ADD CONSTRAINT "ProductVariantAttribute_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionSelection" ADD CONSTRAINT "ProductVariantOptionSelection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionSelection" ADD CONSTRAINT "ProductVariantOptionSelection_productVariantAttributeId_fkey" FOREIGN KEY ("productVariantAttributeId") REFERENCES "ProductVariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionSelection" ADD CONSTRAINT "ProductVariantOptionSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

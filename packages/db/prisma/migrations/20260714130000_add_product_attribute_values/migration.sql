-- Faz 2A (ADR-068) — Urun/varyant attribute DEGER altyapisi. TAMAMEN ADDITIVE + non-destructive:
-- yalniz yeni tablolar + index/FK + CHECK constraint eklenir; mevcut tablolara/kolonlara DOKUNULMAZ.
-- Faz 1B (attribute katalog) TANIMINI tuketir; combinationKey / otomatik varyant / order
-- snapshot / dinamik urun formu bu migration KAPSAMINDA DEGIL.

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueInteger" INTEGER,
    "valueDecimal" DECIMAL(20,6),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "optionId" TEXT,
    "mediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "optionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeValueOption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productAttributeValueId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAttributeValueOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeDefinitionId_key" ON "ProductAttributeValue"("productId", "attributeDefinitionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_storeId_idx" ON "ProductAttributeValue"("storeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_productId_idx" ON "ProductAttributeValue"("productId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeDefinitionId_idx" ON "ProductAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_optionId_idx" ON "ProductAttributeValue"("optionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_mediaId_idx" ON "ProductAttributeValue"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_variantId_attributeDefinitionId_key" ON "VariantAttributeValue"("variantId", "attributeDefinitionId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_storeId_idx" ON "VariantAttributeValue"("storeId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_variantId_idx" ON "VariantAttributeValue"("variantId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_attributeDefinitionId_idx" ON "VariantAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_optionId_idx" ON "VariantAttributeValue"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValueOption_productAttributeValueId_optionI_key" ON "ProductAttributeValueOption"("productAttributeValueId", "optionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValueOption_storeId_idx" ON "ProductAttributeValueOption"("storeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValueOption_productAttributeValueId_idx" ON "ProductAttributeValueOption"("productAttributeValueId");

-- CreateIndex
CREATE INDEX "ProductAttributeValueOption_optionId_idx" ON "ProductAttributeValueOption"("optionId");

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValueOption" ADD CONSTRAINT "ProductAttributeValueOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValueOption" ADD CONSTRAINT "ProductAttributeValueOption_productAttributeValueId_fkey" FOREIGN KEY ("productAttributeValueId") REFERENCES "ProductAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValueOption" ADD CONSTRAINT "ProductAttributeValueOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────── CHECK constraint (ADR-068) ───────────────────────
-- Amac: bir DEGER satirinda EN FAZLA bir deger kolonu dolu olabilsin (tip guvenligi
-- ikinci savunma katmani; birincil otorite servistir). MULTI_SELECT satirinda TUM deger
-- kolonlari bos kalir (secenekler junction'da) → "<= 1" bunu da kapsar. Cross-table
-- datatype eslemesi (or. INTEGER attribute'una valueText yazilmasi) DB'ye TASINMAZ;
-- o kontrol servistedir (bkz. ADR-068).
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_single_value_check" CHECK (
    (CASE WHEN "valueText" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "valueInteger" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "valueDecimal" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "valueBoolean" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "valueDate" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "optionId" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "mediaId" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

-- VariantAttributeValue: yalniz valueText VEYA optionId dolu olabilir (ikisi birden degil).
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_single_value_check" CHECK (
    (CASE WHEN "valueText" IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN "optionId" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

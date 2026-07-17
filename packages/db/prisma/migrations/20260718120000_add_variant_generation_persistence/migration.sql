-- Faz 2C-3 (ADR-072) — ProductVariant persistence + incremental generation.
-- TAMAMEN ADDITIVE + non-destructive:
--   * yeni enum VariantGenerationSource
--   * ProductVariant'a 3 nullable/defaultli kolon (generationSource, combinationKey, archivedAt)
--   * yeni tablo ProductVariantOptionValue (uretilmis varyantin normalize eksen->option secimi)
--   * (productId, combinationKey) unique index (NULL-distinct → manuel null cakismaz)
-- Mevcut ProductVariant verisine/SKU'suna/optionValues'a DOKUNULMAZ; legacy varyantlar default
-- generationSource=MANUAL alir (tahminî combinationKey ATANMAZ; backfill YOK). Down migration yok
-- (repo standardi; ileriye donuk additive).

-- CreateEnum
CREATE TYPE "VariantGenerationSource" AS ENUM ('MANUAL', 'ATTRIBUTE_COMBINATION');

-- AlterTable
ALTER TABLE "ProductVariant"
    ADD COLUMN "generationSource" "VariantGenerationSource" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "combinationKey" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- (productId, combinationKey) tekil: Postgres NULL'lari DISTINCT sayar → coklu manuel varyant
-- (combinationKey = NULL) cakismaz; uretilmis non-null key ayni urun altinda tektir.
CREATE UNIQUE INDEX "ProductVariant_productId_combinationKey_key" ON "ProductVariant"("productId", "combinationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantOptionValue_variantId_attributeDefinitionId_key" ON "ProductVariantOptionValue"("variantId", "attributeDefinitionId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_storeId_idx" ON "ProductVariantOptionValue"("storeId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_variantId_idx" ON "ProductVariantOptionValue"("variantId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_attributeDefinitionId_idx" ON "ProductVariantOptionValue"("attributeDefinitionId");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_optionId_idx" ON "ProductVariantOptionValue"("optionId");

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Faz 2C-7 (ADR-078) — Variant Media Engine: media-defining axis (Renk-oncelikli) ile varyant galerisi.
-- TAMAMEN ADDITIVE + non-destructive: yalniz nullable kolonlar + 1 index + 3 FK eklenir. Mevcut
-- Product / ProductImage satirlari DEGISMEZ; backfill YOK. Eski urunlerde mediaDefiningAttributeId
-- NULL kalir → tum gorseller etiketsiz (optionId NULL) → tek grup = bugunku galeri davranisi birebir.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "mediaDefiningAttributeId" TEXT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "attributeDefinitionId" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "optionId" TEXT;

-- CreateIndex
CREATE INDEX "ProductImage_productId_optionId_idx" ON "ProductImage"("productId", "optionId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mediaDefiningAttributeId_fkey" FOREIGN KEY ("mediaDefiningAttributeId") REFERENCES "AttributeDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

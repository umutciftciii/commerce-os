-- TODO-159E (ADR-094) — Product Reviews & Ratings.
--
-- TAMAMEN ADDITIVE ve GERİ ALINABİLİR: bir yeni enum, üç yeni tablo (ProductReview,
-- ProductReviewHelpful, ProductRatingAggregate) ve bunlara ait index/FK'ler oluşturulur.
-- Mevcut hiçbir tablo/kolon/kısıt değişmez, veri dönüştürülmez. Geri alma = DROP TABLE + DROP TYPE.
--
-- Yorum ÜRÜN seviyesinde yayınlanır/toplanır; variantId yalnız BAĞLAM (SetNull). Uygunluk
-- SUNUCU-otoriter (satın alma kanıtı gateway'de doğrulanır). Aggregate = ProductRatingAggregate
-- projection'ı (TEK yazma yolu recomputeAggregate; yalnız APPROVED; tamsayı toplamlar → float drift yok).
--
-- Tenant izolasyonu mevcut desenle: storeId FK + onDelete Cascade + @@index([storeId]).
-- FK kararı (ADR-094 §2.8): product/customer/order/orderLine → Cascade; variant → SetNull
-- (varyant silinse bile yorum ürün-seviyesinde yaşar, bağlam null olur).

-- CreateEnum
CREATE TYPE "ProductReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "ProductReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT true,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "moderationNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReviewHelpful" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewHelpful_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRatingAggregate" (
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "sumRating" INTEGER NOT NULL DEFAULT 0,
    "count1" INTEGER NOT NULL DEFAULT 0,
    "count2" INTEGER NOT NULL DEFAULT 0,
    "count3" INTEGER NOT NULL DEFAULT 0,
    "count4" INTEGER NOT NULL DEFAULT 0,
    "count5" INTEGER NOT NULL DEFAULT 0,
    "averageTimes100" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRatingAggregate_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_orderLineId_key" ON "ProductReview"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_storeId_productId_customerId_key" ON "ProductReview"("storeId", "productId", "customerId");

-- CreateIndex
CREATE INDEX "ProductReview_storeId_status_createdAt_idx" ON "ProductReview"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_storeId_productId_status_idx" ON "ProductReview"("storeId", "productId", "status");

-- CreateIndex
CREATE INDEX "ProductReview_customerId_idx" ON "ProductReview"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReviewHelpful_reviewId_customerId_key" ON "ProductReviewHelpful"("reviewId", "customerId");

-- CreateIndex
CREATE INDEX "ProductReviewHelpful_storeId_idx" ON "ProductReviewHelpful"("storeId");

-- CreateIndex
CREATE INDEX "ProductReviewHelpful_customerId_idx" ON "ProductReviewHelpful"("customerId");

-- CreateIndex
CREATE INDEX "ProductRatingAggregate_storeId_idx" ON "ProductRatingAggregate"("storeId");

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewHelpful" ADD CONSTRAINT "ProductReviewHelpful_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewHelpful" ADD CONSTRAINT "ProductReviewHelpful_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewHelpful" ADD CONSTRAINT "ProductReviewHelpful_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRatingAggregate" ADD CONSTRAINT "ProductRatingAggregate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRatingAggregate" ADD CONSTRAINT "ProductRatingAggregate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

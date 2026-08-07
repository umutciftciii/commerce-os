-- TODO-174A (ADR-279/ADR-280) — Cancellation UX & Refund Visibility Follow-up.
-- TÜMÜYLE ADDITIVE + geri uyumlu (migrate-before-app güvenli):
--   * RefundOrigin enum + OrderRefund.origin (DEFAULT 'RETURN_REQUEST') — refund menşei pozitif ayrımı.
--     Mevcut satırlar backfill edilir: returnRequestId IS NULL → 'ORDER_CANCELLATION' (intent'siz cancellation
--     ledger; bkz. TODO-174/ADR-276), aksi hâlde 'RETURN_REQUEST'. Nullable-FK çıkarımı (SetNull kırılganlığı)
--     yerine sorgu-dostu kolon; birleşik iade/refund görünürlüğü + admin kaynak filtresi bunun üstüne kurulur.
--   * OrderExperienceReview = ProductReview'DAN AYRIK sipariş deneyimi değerlendirmesi. Ürün puanına /
--     ProductRatingAggregate'e ASLA yansımaz. Bir müşteri bir sipariş için en fazla bir değerlendirme.
-- Hiçbir mevcut kolon/enum/tablo değiştirilmez ya da silinmez.

-- CreateEnum
CREATE TYPE "RefundOrigin" AS ENUM ('RETURN_REQUEST', 'ORDER_CANCELLATION');

-- AlterTable
ALTER TABLE "OrderRefund" ADD COLUMN     "origin" "RefundOrigin" NOT NULL DEFAULT 'RETURN_REQUEST';

-- Backfill: intent'siz cancellation refund'ları (her iki FK NULL) ORDER_CANCELLATION olarak işaretle.
UPDATE "OrderRefund" SET "origin" = 'ORDER_CANCELLATION' WHERE "returnRequestId" IS NULL;

-- CreateIndex
CREATE INDEX "OrderRefund_storeId_origin_requestedAt_idx" ON "OrderRefund"("storeId", "origin", "requestedAt");

-- CreateTable
CREATE TABLE "OrderExperienceReview" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderExperienceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderExperienceReview_storeId_createdAt_idx" ON "OrderExperienceReview"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderExperienceReview_customerId_idx" ON "OrderExperienceReview"("customerId");

-- CreateIndex
CREATE INDEX "OrderExperienceReview_orderId_idx" ON "OrderExperienceReview"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderExperienceReview_storeId_orderId_customerId_key" ON "OrderExperienceReview"("storeId", "orderId", "customerId");

-- AddForeignKey
ALTER TABLE "OrderExperienceReview" ADD CONSTRAINT "OrderExperienceReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExperienceReview" ADD CONSTRAINT "OrderExperienceReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExperienceReview" ADD CONSTRAINT "OrderExperienceReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

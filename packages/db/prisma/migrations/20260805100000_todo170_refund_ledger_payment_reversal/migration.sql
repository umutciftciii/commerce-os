-- TODO-170 (ADR-272) REFUND LEDGER & PAYMENT REVERSAL — ADDITIVE.
--
-- Yeni append-only OrderRefund/OrderRefundEvent ledger'ı + destekleyici enum'lar. RefundIntentStatus'a
-- CONSUMED değeri eklenir (ilk OrderRefund oluşturulurken atomik consume; PENDING→CONSUMED). PROCESSED
-- legacy olarak KORUNUR (drop/rename YOK). Mevcut hiçbir kolon repurpose EDİLMEZ. PENDING intent'lerden
-- otomatik OrderRefund üretilmez; sahte başarılı refund backfill EDİLMEZ. Migrate-before-app.
--
-- NOT: `ALTER TYPE ... ADD VALUE` bu migration İÇİNDE kullanılmaz (yalnız eklenir) → aynı tx içinde
-- güvenli (returns foundation migration'ında MediaContext ADD VALUE ile aynı kanıtlı desen).

-- CreateEnum
CREATE TYPE "OrderRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundExecutionMode" AS ENUM ('PROVIDER_AUTOMATIC', 'MANUAL_OFFLINE');

-- CreateEnum
CREATE TYPE "OrderRefundEventType" AS ENUM ('REQUESTED', 'PROVIDER_SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'RETRY', 'MANUAL_COMPLETED', 'RECONCILED', 'STATUS_QUERIED', 'DUPLICATE_CALLBACK');

-- CreateEnum
CREATE TYPE "OrderRefundActorType" AS ENUM ('ADMIN', 'SYSTEM', 'PROVIDER');

-- AlterEnum (additive; CONSUMED bu migration içinde KULLANILMAZ)
ALTER TYPE "RefundIntentStatus" ADD VALUE 'CONSUMED';

-- CreateTable
CREATE TABLE "OrderRefund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "returnRequestId" TEXT,
    "refundIntentId" TEXT,
    "paymentAttemptId" TEXT NOT NULL,
    "provider" "PaymentProviderType",
    "executionMode" "RefundExecutionMode" NOT NULL,
    "method" "PaymentMethodType" NOT NULL,
    "status" "OrderRefundStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL,
    "productRefundMinor" INTEGER NOT NULL,
    "shippingRefundMinor" INTEGER NOT NULL,
    "taxRefundMinor" INTEGER NOT NULL,
    "totalRefundMinor" INTEGER NOT NULL,
    "providerRefundId" TEXT,
    "providerReference" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "manualMethod" "PaymentManualMethod",
    "manualReference" TEXT,
    "manualNote" TEXT,
    "manualCompletedByPlatformUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestedByPlatformUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRefundEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderRefundId" TEXT NOT NULL,
    "type" "OrderRefundEventType" NOT NULL,
    "actorType" "OrderRefundActorType" NOT NULL,
    "actorId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "providerReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRefundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRefund_storeId_idx" ON "OrderRefund"("storeId");

-- CreateIndex
CREATE INDEX "OrderRefund_orderId_idx" ON "OrderRefund"("orderId");

-- CreateIndex
CREATE INDEX "OrderRefund_status_idx" ON "OrderRefund"("status");

-- CreateIndex
CREATE INDEX "OrderRefund_returnRequestId_idx" ON "OrderRefund"("returnRequestId");

-- CreateIndex
CREATE INDEX "OrderRefund_refundIntentId_idx" ON "OrderRefund"("refundIntentId");

-- CreateIndex
CREATE INDEX "OrderRefund_storeId_status_completedAt_idx" ON "OrderRefund"("storeId", "status", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRefund_storeId_idempotencyKey_key" ON "OrderRefund"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRefund_storeId_provider_providerRefundId_key" ON "OrderRefund"("storeId", "provider", "providerRefundId");

-- CreateIndex
CREATE INDEX "OrderRefundEvent_storeId_idx" ON "OrderRefundEvent"("storeId");

-- CreateIndex
CREATE INDEX "OrderRefundEvent_orderRefundId_idx" ON "OrderRefundEvent"("orderRefundId");

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_refundIntentId_fkey" FOREIGN KEY ("refundIntentId") REFERENCES "RefundIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefundEvent" ADD CONSTRAINT "OrderRefundEvent_orderRefundId_fkey" FOREIGN KEY ("orderRefundId") REFERENCES "OrderRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

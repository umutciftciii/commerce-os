-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'AWAITING_SHIPMENT', 'RETURN_SHIPPED', 'RECEIVED', 'INSPECTION_REQUIRED', 'INSPECTED', 'REFUND_PENDING', 'REPLACEMENT_PENDING', 'COMPLETED', 'CANCELLED_BY_CUSTOMER', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReturnResolutionType" AS ENUM ('REFUND_TO_ORIGINAL_PAYMENT', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('NO_LONGER_NEEDED', 'ORDERED_BY_MISTAKE', 'BETTER_PRICE_AVAILABLE', 'NOT_AS_DESCRIBED', 'WRONG_ITEM_RECEIVED', 'DEFECTIVE_OR_NOT_WORKING', 'DAMAGED_PRODUCT', 'DAMAGED_PACKAGING', 'MISSING_PARTS_OR_ACCESSORIES', 'QUALITY_NOT_EXPECTED', 'SIZE_OR_FIT_ISSUE', 'DELIVERY_TOO_LATE', 'UNAUTHORIZED_PURCHASE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnItemConditionStatus" AS ENUM ('NEW_UNOPENED', 'OPENED_UNUSED', 'USED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReturnInspectionResult" AS ENUM ('PASSED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ReturnRestockDecision" AS ENUM ('RESTOCK_AS_SELLABLE', 'RESTOCK_AS_DAMAGED', 'DO_NOT_RESTOCK', 'RETURN_TO_VENDOR', 'DISPOSE');

-- CreateEnum
CREATE TYPE "ReturnActorType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RefundIntentStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "MediaContext" ADD VALUE 'RETURN_ATTACHMENT';

-- AlterEnum
ALTER TYPE "InventoryAdjustmentSource" ADD VALUE 'RETURN_RESTOCK';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "returnWindowDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "returnsAllowOriginalPaymentRefund" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "returnsAllowReplacement" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "returnsCustomerPaysShipping" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "returnsRequireApproval" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ReturnNumberCounter" (
    "storeId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnNumberCounter_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "resolutionType" "ReturnResolutionType" NOT NULL,
    "returnWindowEndsAt" TIMESTAMP(3) NOT NULL,
    "customerNote" TEXT,
    "adminNote" TEXT,
    "rejectionReason" TEXT,
    "returnCarrier" TEXT,
    "returnTrackingNumber" TEXT,
    "refundShipping" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "customerComment" TEXT,
    "conditionStatus" "ReturnItemConditionStatus",
    "inspectionResult" "ReturnInspectionResult",
    "approvedQuantity" INTEGER,
    "rejectedQuantity" INTEGER,
    "restockDecision" "ReturnRestockDecision",
    "restockedAt" TIMESTAMP(3),
    "restockBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnAttachment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PHOTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnStatusHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "fromStatus" "ReturnStatus",
    "toStatus" "ReturnStatus" NOT NULL,
    "actorType" "ReturnActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundIntent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "currency" TEXT NOT NULL,
    "productRefundMinor" INTEGER NOT NULL,
    "shippingRefundMinor" INTEGER NOT NULL,
    "taxRefundMinor" INTEGER NOT NULL,
    "totalRefundMinor" INTEGER NOT NULL,
    "status" "RefundIntentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnRequest_storeId_idx" ON "ReturnRequest"("storeId");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");

-- CreateIndex
CREATE INDEX "ReturnRequest_storeId_status_idx" ON "ReturnRequest"("storeId", "status");

-- CreateIndex
CREATE INDEX "ReturnRequest_storeId_createdAt_idx" ON "ReturnRequest"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_storeId_returnNumber_key" ON "ReturnRequest"("storeId", "returnNumber");

-- CreateIndex
CREATE INDEX "ReturnItem_storeId_idx" ON "ReturnItem"("storeId");

-- CreateIndex
CREATE INDEX "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnItem_orderLineId_idx" ON "ReturnItem"("orderLineId");

-- CreateIndex
CREATE INDEX "ReturnAttachment_storeId_idx" ON "ReturnAttachment"("storeId");

-- CreateIndex
CREATE INDEX "ReturnAttachment_returnItemId_idx" ON "ReturnAttachment"("returnItemId");

-- CreateIndex
CREATE INDEX "ReturnAttachment_mediaAssetId_idx" ON "ReturnAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_storeId_idx" ON "ReturnStatusHistory"("storeId");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_returnRequestId_idx" ON "ReturnStatusHistory"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundIntent_returnRequestId_key" ON "RefundIntent"("returnRequestId");

-- CreateIndex
CREATE INDEX "RefundIntent_storeId_idx" ON "RefundIntent"("storeId");

-- CreateIndex
CREATE INDEX "RefundIntent_orderId_idx" ON "RefundIntent"("orderId");

-- CreateIndex
CREATE INDEX "RefundIntent_status_idx" ON "RefundIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefundIntent_storeId_idempotencyKey_key" ON "RefundIntent"("storeId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ReturnNumberCounter" ADD CONSTRAINT "ReturnNumberCounter_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnAttachment" ADD CONSTRAINT "ReturnAttachment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnAttachment" ADD CONSTRAINT "ReturnAttachment_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnAttachment" ADD CONSTRAINT "ReturnAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnStatusHistory" ADD CONSTRAINT "ReturnStatusHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnStatusHistory" ADD CONSTRAINT "ReturnStatusHistory_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;


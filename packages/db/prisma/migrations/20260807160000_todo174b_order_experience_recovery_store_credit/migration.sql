-- CreateEnum
CREATE TYPE "CreditLotStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CreditDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CreditActorType" AS ENUM ('PLATFORM_USER', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CreditSourceType" AS ENUM ('ADMIN_GOODWILL', 'RECOVERY_GOODWILL', 'ADMIN_ADJUSTMENT', 'ORDER_PAYMENT', 'ORDER_CANCELLATION', 'ORDER_REFUND', 'EXPIRY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CreditLedgerType" AS ENUM ('ADMIN_GOODWILL_CREDIT', 'RECOVERY_GOODWILL_CREDIT', 'ORDER_PAYMENT_DEBIT', 'ORDER_CANCELLATION_RESTORE', 'REFUND_RESTORE', 'ADMIN_ADJUSTMENT_CREDIT', 'ADMIN_ADJUSTMENT_DEBIT', 'EXPIRE');

-- CreateEnum
CREATE TYPE "RecoveryCaseStatus" AS ENUM ('OPEN', 'ASSIGNED', 'CONTACT_ATTEMPTED', 'CUSTOMER_REACHED', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED', 'UNREACHABLE', 'NO_ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "RecoveryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecoveryActivityType" AS ENUM ('ASSIGNED', 'CONTACT_CALL', 'CONTACT_EMAIL', 'UNREACHABLE', 'ISSUE_HEARD', 'ACTION_REQUIRED', 'GOODWILL_CREDIT', 'RESOLVED', 'CLOSED', 'NOTE');

-- CreateEnum
CREATE TYPE "RecoveryOutcome" AS ENUM ('ISSUE_RESOLVED', 'APOLOGY_ACCEPTED', 'REFUND_QUESTION', 'DELIVERY_COMPLAINT', 'PRICE_COMPLAINT', 'PRODUCT_EXPECTATION_MISMATCH', 'CUSTOMER_UNREACHABLE', 'CUSTOMER_DECLINED', 'OTHER');

-- CreateEnum
CREATE TYPE "RecoveryResolutionType" AS ENUM ('GOODWILL_CREDIT', 'APOLOGY', 'REFUND_FOLLOWUP', 'NO_ACTION', 'OTHER');

-- AlterEnum
ALTER TYPE "PaymentMethodType" ADD VALUE 'STORE_CREDIT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalPaymentAmountMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "shoppingCreditUsedMinor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "creditLedgerGroupKey" TEXT;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "goodwillCreditCurrency" TEXT,
ADD COLUMN     "maxGoodwillCreditPerActionMinor" BIGINT;

-- CreateTable
CREATE TABLE "CustomerCreditAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "cachedAvailableMinor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditLot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "originalAmountMinor" BIGINT NOT NULL,
    "remainingAmountMinor" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CreditLotStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" "CreditSourceType" NOT NULL,
    "sourceId" TEXT,
    "issuedByType" "CreditActorType" NOT NULL DEFAULT 'PLATFORM_USER',
    "issuedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCreditLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "CreditLedgerType" NOT NULL,
    "direction" "CreditDirection" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceAfterMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "sourceType" "CreditSourceType" NOT NULL,
    "sourceId" TEXT,
    "orderId" TEXT,
    "groupKey" TEXT,
    "description" TEXT NOT NULL,
    "createdByType" "CreditActorType" NOT NULL DEFAULT 'SYSTEM',
    "createdById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRecoveryCase" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderExperienceReviewId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "RecoveryCaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "RecoveryPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneePlatformUserId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstContactAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionType" "RecoveryResolutionType",
    "resolutionNote" TEXT,
    "createdByPlatformUserId" TEXT,
    "updatedByPlatformUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRecoveryActivity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "type" "RecoveryActivityType" NOT NULL,
    "actorType" "CreditActorType" NOT NULL DEFAULT 'PLATFORM_USER',
    "actorId" TEXT,
    "outcome" "RecoveryOutcome",
    "note" TEXT,
    "creditLedgerEntryId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRecoveryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerCreditAccount_storeId_idx" ON "CustomerCreditAccount"("storeId");

-- CreateIndex
CREATE INDEX "CustomerCreditAccount_customerId_idx" ON "CustomerCreditAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditAccount_storeId_customerId_currency_key" ON "CustomerCreditAccount"("storeId", "customerId", "currency");

-- CreateIndex
CREATE INDEX "CustomerCreditLot_storeId_customerId_status_expiresAt_idx" ON "CustomerCreditLot"("storeId", "customerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerCreditLot_storeId_status_expiresAt_idx" ON "CustomerCreditLot"("storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerCreditLot_accountId_idx" ON "CustomerCreditLot"("accountId");

-- CreateIndex
CREATE INDEX "CustomerCreditLedgerEntry_storeId_customerId_createdAt_idx" ON "CustomerCreditLedgerEntry"("storeId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCreditLedgerEntry_accountId_createdAt_idx" ON "CustomerCreditLedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCreditLedgerEntry_lotId_idx" ON "CustomerCreditLedgerEntry"("lotId");

-- CreateIndex
CREATE INDEX "CustomerCreditLedgerEntry_orderId_idx" ON "CustomerCreditLedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "CustomerCreditLedgerEntry_groupKey_idx" ON "CustomerCreditLedgerEntry"("groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditLedgerEntry_storeId_idempotencyKey_key" ON "CustomerCreditLedgerEntry"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRecoveryCase_orderExperienceReviewId_key" ON "OrderRecoveryCase"("orderExperienceReviewId");

-- CreateIndex
CREATE INDEX "OrderRecoveryCase_storeId_status_dueAt_idx" ON "OrderRecoveryCase"("storeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "OrderRecoveryCase_storeId_assigneePlatformUserId_status_idx" ON "OrderRecoveryCase"("storeId", "assigneePlatformUserId", "status");

-- CreateIndex
CREATE INDEX "OrderRecoveryCase_customerId_idx" ON "OrderRecoveryCase"("customerId");

-- CreateIndex
CREATE INDEX "OrderRecoveryCase_orderId_idx" ON "OrderRecoveryCase"("orderId");

-- CreateIndex
CREATE INDEX "OrderRecoveryActivity_storeId_recoveryCaseId_createdAt_idx" ON "OrderRecoveryActivity"("storeId", "recoveryCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRecoveryActivity_recoveryCaseId_idx" ON "OrderRecoveryActivity"("recoveryCaseId");

-- AddForeignKey
ALTER TABLE "CustomerCreditAccount" ADD CONSTRAINT "CustomerCreditAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditAccount" ADD CONSTRAINT "CustomerCreditAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLot" ADD CONSTRAINT "CustomerCreditLot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLot" ADD CONSTRAINT "CustomerCreditLot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLot" ADD CONSTRAINT "CustomerCreditLot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLedgerEntry" ADD CONSTRAINT "CustomerCreditLedgerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLedgerEntry" ADD CONSTRAINT "CustomerCreditLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLedgerEntry" ADD CONSTRAINT "CustomerCreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditLedgerEntry" ADD CONSTRAINT "CustomerCreditLedgerEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CustomerCreditLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryCase" ADD CONSTRAINT "OrderRecoveryCase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryCase" ADD CONSTRAINT "OrderRecoveryCase_orderExperienceReviewId_fkey" FOREIGN KEY ("orderExperienceReviewId") REFERENCES "OrderExperienceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryCase" ADD CONSTRAINT "OrderRecoveryCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryCase" ADD CONSTRAINT "OrderRecoveryCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryActivity" ADD CONSTRAINT "OrderRecoveryActivity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecoveryActivity" ADD CONSTRAINT "OrderRecoveryActivity_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "OrderRecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;


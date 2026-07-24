-- CreateEnum
CREATE TYPE "SponsorAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SponsorshipAgreementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SponsorshipPricingModel" AS ENUM ('FIXED_FEE', 'CPM', 'CPC', 'CPA', 'REVENUE_SHARE');

-- CreateEnum
CREATE TYPE "SponsorshipSettlementPeriod" AS ENUM ('CAMPAIGN_END', 'WEEKLY', 'MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "SponsorshipSettlementStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "SponsorshipChargeType" AS ENUM ('PERIOD', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SponsorshipChargeStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SponsorshipPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD_POS', 'CASH', 'ONLINE_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "SponsoredCommercialMode" AS ENUM ('INTERNAL_PROMOTION', 'SPONSORED');

-- NOT: `prisma migrate diff` bu noktada ProductSearchDocument icin SAHTE bir fark uretir
-- (searchVector generated-kolonu + GIN/trigram indexleri Prisma sema dilinde ifade edilemez,
-- bkz. ADR-079 / TODO-161 migration'i). Uretilen `DROP INDEX ..._searchVector_gin_idx`,
-- `DROP INDEX ..._title_trgm_idx` ve `ALTER COLUMN "searchVector" DROP DEFAULT` ifadeleri
-- BILINCLI OLARAK CIKARILMISTIR — uygulansalardi arama read-model'inin indexleri dusurulurdu.

-- AlterTable
ALTER TABLE "SponsoredProductCampaign" ADD COLUMN     "commercialMode" "SponsoredCommercialMode" NOT NULL DEFAULT 'INTERNAL_PROMOTION';

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "allowUnpaidSponsoredCampaigns" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SponsorAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "taxOffice" TEXT,
    "taxNumber" TEXT,
    "billingAddress" TEXT,
    "status" "SponsorAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipAgreement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sponsorAccountId" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SponsorshipAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "pricingModel" "SponsorshipPricingModel" NOT NULL,
    "settlementPeriod" "SponsorshipSettlementPeriod" NOT NULL DEFAULT 'CAMPAIGN_END',
    "agreedAmountMinor" INTEGER,
    "unitPriceMinor" INTEGER,
    "revenueSharePercentBp" INTEGER,
    "budgetLimitMinor" INTEGER,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "taxRateBp" INTEGER NOT NULL DEFAULT 2000,
    "signedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "notes" TEXT,
    "budgetExhaustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipAgreementCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "allocationAmountMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorshipAgreementCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipSettlement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "periodKind" "SponsorshipSettlementPeriod" NOT NULL DEFAULT 'MANUAL',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "billableImpressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "billableClicks" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "grossRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "netRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "calculatedChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "pricingModel" "SponsorshipPricingModel" NOT NULL,
    "status" "SponsorshipSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "SponsorshipSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipCharge" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "campaignId" TEXT,
    "settlementId" TEXT,
    "chargeNumber" TEXT NOT NULL,
    "chargeType" "SponsorshipChargeType" NOT NULL DEFAULT 'PERIOD',
    "pricingModel" "SponsorshipPricingModel" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPriceMinor" INTEGER NOT NULL DEFAULT 0,
    "subtotalMinor" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL,
    "taxAmountMinor" INTEGER NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SponsorshipChargeStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "chargeId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "SponsorshipPaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "providerId" TEXT,
    "providerReference" TEXT,
    "manualReference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT,
    "reversalOfPaymentId" TEXT,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SponsorAccount_storeId_idx" ON "SponsorAccount"("storeId");

-- CreateIndex
CREATE INDEX "SponsorAccount_storeId_status_idx" ON "SponsorAccount"("storeId", "status");

-- CreateIndex
CREATE INDEX "SponsorAccount_storeId_createdAt_idx" ON "SponsorAccount"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorAccount_storeId_companyName_key" ON "SponsorAccount"("storeId", "companyName");

-- CreateIndex
CREATE INDEX "SponsorshipAgreement_storeId_idx" ON "SponsorshipAgreement"("storeId");

-- CreateIndex
CREATE INDEX "SponsorshipAgreement_storeId_status_idx" ON "SponsorshipAgreement"("storeId", "status");

-- CreateIndex
CREATE INDEX "SponsorshipAgreement_storeId_sponsorAccountId_idx" ON "SponsorshipAgreement"("storeId", "sponsorAccountId");

-- CreateIndex
CREATE INDEX "SponsorshipAgreement_storeId_endsAt_idx" ON "SponsorshipAgreement"("storeId", "endsAt");

-- CreateIndex
CREATE INDEX "SponsorshipAgreement_sponsorAccountId_idx" ON "SponsorshipAgreement"("sponsorAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipAgreement_storeId_agreementNumber_key" ON "SponsorshipAgreement"("storeId", "agreementNumber");

-- CreateIndex
CREATE INDEX "SponsorshipAgreementCampaign_storeId_idx" ON "SponsorshipAgreementCampaign"("storeId");

-- CreateIndex
CREATE INDEX "SponsorshipAgreementCampaign_agreementId_idx" ON "SponsorshipAgreementCampaign"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipAgreementCampaign_campaignId_key" ON "SponsorshipAgreementCampaign"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipAgreementCampaign_agreementId_campaignId_key" ON "SponsorshipAgreementCampaign"("agreementId", "campaignId");

-- CreateIndex
CREATE INDEX "SponsorshipSettlement_storeId_idx" ON "SponsorshipSettlement"("storeId");

-- CreateIndex
CREATE INDEX "SponsorshipSettlement_storeId_status_idx" ON "SponsorshipSettlement"("storeId", "status");

-- CreateIndex
CREATE INDEX "SponsorshipSettlement_storeId_agreementId_idx" ON "SponsorshipSettlement"("storeId", "agreementId");

-- CreateIndex
CREATE INDEX "SponsorshipSettlement_agreementId_periodStart_idx" ON "SponsorshipSettlement"("agreementId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipSettlement_agreementId_periodStart_periodEnd_key" ON "SponsorshipSettlement"("agreementId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_storeId_idx" ON "SponsorshipCharge"("storeId");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_storeId_status_idx" ON "SponsorshipCharge"("storeId", "status");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_storeId_agreementId_idx" ON "SponsorshipCharge"("storeId", "agreementId");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_storeId_status_dueAt_idx" ON "SponsorshipCharge"("storeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_agreementId_idx" ON "SponsorshipCharge"("agreementId");

-- CreateIndex
CREATE INDEX "SponsorshipCharge_campaignId_idx" ON "SponsorshipCharge"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipCharge_storeId_chargeNumber_key" ON "SponsorshipCharge"("storeId", "chargeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipCharge_settlementId_key" ON "SponsorshipCharge"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipCharge_storeId_idempotencyKey_key" ON "SponsorshipCharge"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SponsorshipPayment_storeId_idx" ON "SponsorshipPayment"("storeId");

-- CreateIndex
CREATE INDEX "SponsorshipPayment_storeId_agreementId_idx" ON "SponsorshipPayment"("storeId", "agreementId");

-- CreateIndex
CREATE INDEX "SponsorshipPayment_storeId_paidAt_idx" ON "SponsorshipPayment"("storeId", "paidAt");

-- CreateIndex
CREATE INDEX "SponsorshipPayment_chargeId_idx" ON "SponsorshipPayment"("chargeId");

-- CreateIndex
CREATE INDEX "SponsorshipPayment_agreementId_idx" ON "SponsorshipPayment"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipPayment_reversalOfPaymentId_key" ON "SponsorshipPayment"("reversalOfPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipPayment_storeId_idempotencyKey_key" ON "SponsorshipPayment"("storeId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "SponsorAccount" ADD CONSTRAINT "SponsorAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipAgreement" ADD CONSTRAINT "SponsorshipAgreement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipAgreement" ADD CONSTRAINT "SponsorshipAgreement_sponsorAccountId_fkey" FOREIGN KEY ("sponsorAccountId") REFERENCES "SponsorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipAgreementCampaign" ADD CONSTRAINT "SponsorshipAgreementCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipAgreementCampaign" ADD CONSTRAINT "SponsorshipAgreementCampaign_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorshipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipAgreementCampaign" ADD CONSTRAINT "SponsorshipAgreementCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipSettlement" ADD CONSTRAINT "SponsorshipSettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipSettlement" ADD CONSTRAINT "SponsorshipSettlement_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorshipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipCharge" ADD CONSTRAINT "SponsorshipCharge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipCharge" ADD CONSTRAINT "SponsorshipCharge_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorshipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipCharge" ADD CONSTRAINT "SponsorshipCharge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipCharge" ADD CONSTRAINT "SponsorshipCharge_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SponsorshipSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPayment" ADD CONSTRAINT "SponsorshipPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPayment" ADD CONSTRAINT "SponsorshipPayment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorshipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPayment" ADD CONSTRAINT "SponsorshipPayment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "SponsorshipCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPayment" ADD CONSTRAINT "SponsorshipPayment_reversalOfPaymentId_fkey" FOREIGN KEY ("reversalOfPaymentId") REFERENCES "SponsorshipPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

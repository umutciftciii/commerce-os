-- CreateEnum
CREATE TYPE "SponsoredCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SponsoredPlacementType" AS ENUM ('HOME_SHOWCASE', 'SEARCH_RESULTS');

-- CreateEnum
CREATE TYPE "SponsoredEventType" AS ENUM ('IMPRESSION', 'CLICK', 'CART');

-- NOTE (TODO-161): Prisma, ProductSearchDocument.searchVector'i (Unsupported tsvector, GENERATED
-- ALWAYS + GIN/trigram indeksleri raw SQL migration'da) modelleyemedigi icin bu additive migration'a
-- sahte DROP INDEX / DROP DEFAULT ifadeleri uretti. Bunlar KALDIRILDI — bu migration YALNIZ
-- sponsored tablolarini ekler; mevcut arama read-model'ine DOKUNMAZ.

-- CreateTable
CREATE TABLE "SponsoredProductCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SponsoredCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "placement" "SponsoredPlacementType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxSlots" INTEGER NOT NULL DEFAULT 3,
    "targetCategoryId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsoredProductCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsoredProductPlacement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsoredProductPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsoredTargetKeyword" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredTargetKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsoredProductEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placementId" TEXT,
    "productId" TEXT NOT NULL,
    "type" "SponsoredEventType" NOT NULL,
    "placement" "SponsoredPlacementType" NOT NULL,
    "source" TEXT,
    "visitorIdHash" TEXT,
    "sessionIdHash" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSponsoredAttribution" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placementId" TEXT,
    "productId" TEXT NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL,
    "grossRevenueMinor" INTEGER NOT NULL,
    "refundedRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "netRevenueMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSponsoredAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSponsoredAttributionRefund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderSponsoredAttributionId" TEXT NOT NULL,
    "refundKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSponsoredAttributionRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SponsoredProductCampaign_storeId_idx" ON "SponsoredProductCampaign"("storeId");

-- CreateIndex
CREATE INDEX "SponsoredProductCampaign_storeId_status_placement_idx" ON "SponsoredProductCampaign"("storeId", "status", "placement");

-- CreateIndex
CREATE INDEX "SponsoredProductCampaign_storeId_placement_startsAt_endsAt_idx" ON "SponsoredProductCampaign"("storeId", "placement", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "SponsoredProductCampaign_storeId_createdAt_idx" ON "SponsoredProductCampaign"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "SponsoredProductCampaign_targetCategoryId_idx" ON "SponsoredProductCampaign"("targetCategoryId");

-- CreateIndex
CREATE INDEX "SponsoredProductPlacement_storeId_idx" ON "SponsoredProductPlacement"("storeId");

-- CreateIndex
CREATE INDEX "SponsoredProductPlacement_storeId_productId_idx" ON "SponsoredProductPlacement"("storeId", "productId");

-- CreateIndex
CREATE INDEX "SponsoredProductPlacement_campaignId_idx" ON "SponsoredProductPlacement"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsoredProductPlacement_campaignId_productId_key" ON "SponsoredProductPlacement"("campaignId", "productId");

-- CreateIndex
CREATE INDEX "SponsoredTargetKeyword_storeId_keyword_idx" ON "SponsoredTargetKeyword"("storeId", "keyword");

-- CreateIndex
CREATE INDEX "SponsoredTargetKeyword_campaignId_idx" ON "SponsoredTargetKeyword"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsoredTargetKeyword_campaignId_keyword_key" ON "SponsoredTargetKeyword"("campaignId", "keyword");

-- CreateIndex
CREATE INDEX "SponsoredProductEvent_storeId_idx" ON "SponsoredProductEvent"("storeId");

-- CreateIndex
CREATE INDEX "SponsoredProductEvent_storeId_createdAt_idx" ON "SponsoredProductEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "SponsoredProductEvent_campaignId_type_createdAt_idx" ON "SponsoredProductEvent"("campaignId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "SponsoredProductEvent_productId_type_idx" ON "SponsoredProductEvent"("productId", "type");

-- CreateIndex
CREATE INDEX "SponsoredProductEvent_storeId_placementId_visitorIdHash_typ_idx" ON "SponsoredProductEvent"("storeId", "placementId", "visitorIdHash", "type", "createdAt");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttribution_storeId_idx" ON "OrderSponsoredAttribution"("storeId");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttribution_storeId_campaignId_attributedAt_idx" ON "OrderSponsoredAttribution"("storeId", "campaignId", "attributedAt");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttribution_orderId_idx" ON "OrderSponsoredAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttribution_productId_idx" ON "OrderSponsoredAttribution"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSponsoredAttribution_orderId_campaignId_productId_key" ON "OrderSponsoredAttribution"("orderId", "campaignId", "productId");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttributionRefund_storeId_idx" ON "OrderSponsoredAttributionRefund"("storeId");

-- CreateIndex
CREATE INDEX "OrderSponsoredAttributionRefund_orderSponsoredAttributionId_idx" ON "OrderSponsoredAttributionRefund"("orderSponsoredAttributionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSponsoredAttributionRefund_orderSponsoredAttributionId_key" ON "OrderSponsoredAttributionRefund"("orderSponsoredAttributionId", "refundKey");

-- AddForeignKey
ALTER TABLE "SponsoredProductCampaign" ADD CONSTRAINT "SponsoredProductCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductCampaign" ADD CONSTRAINT "SponsoredProductCampaign_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductPlacement" ADD CONSTRAINT "SponsoredProductPlacement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductPlacement" ADD CONSTRAINT "SponsoredProductPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductPlacement" ADD CONSTRAINT "SponsoredProductPlacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredTargetKeyword" ADD CONSTRAINT "SponsoredTargetKeyword_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredTargetKeyword" ADD CONSTRAINT "SponsoredTargetKeyword_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductEvent" ADD CONSTRAINT "SponsoredProductEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredProductEvent" ADD CONSTRAINT "SponsoredProductEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSponsoredAttribution" ADD CONSTRAINT "OrderSponsoredAttribution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSponsoredAttribution" ADD CONSTRAINT "OrderSponsoredAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSponsoredAttribution" ADD CONSTRAINT "OrderSponsoredAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SponsoredProductCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSponsoredAttributionRefund" ADD CONSTRAINT "OrderSponsoredAttributionRefund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSponsoredAttributionRefund" ADD CONSTRAINT "OrderSponsoredAttributionRefund_orderSponsoredAttributionI_fkey" FOREIGN KEY ("orderSponsoredAttributionId") REFERENCES "OrderSponsoredAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TODO-160 (ADR-102…107) — Influencer Tracking & Attribution.
--
-- TAMAMEN ADDITIVE ve GERİ ALINABİLİR: yalnız 5 yeni enum, 6 yeni tablo ve
-- bunlara ait index/FK'ler oluşturulur. Mevcut hiçbir tablo/kolon/kısıt değişmez,
-- veri dönüştürülmez. Geri alma = DROP TABLE + DROP TYPE.
--
-- Attribution SUNUCU-otoriter + sipariş anında SNAPSHOT'lanır (ADR-103); gross ve
-- net gelir AYRI taşınır (ADR-104): iade net'i düzeltir, gross'u geriye dönük
-- BOZMAZ. OrderAttributionRefund append-only idempotency defteridir
-- (@@unique([orderAttributionId, refundKey])). KVKK (ADR-106): AttributionClick
-- ham IP/UA/referrer SAKLAMAZ — yalnız tuzlu HMAC hash + referrer host.
--
-- Tenant izolasyonu mevcut desenle: storeId FK + onDelete Cascade + @@index([storeId]).
-- FK kararı: product/category takip-link edge'leri SetNull (ürün/kategori silinince
-- link yaşar, hedef çözülemez → güvenli fallback). OrderAttribution.orderId 1-1
-- (@unique) + Cascade. link edge SetNull (link silinse de sipariş snapshot'ı kalır;
-- kimlik alanları snapshot Json'da immutable saklanır).

-- CreateEnum
CREATE TYPE "InfluencerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InfluencerCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TrackingLinkTargetType" AS ENUM ('HOME', 'PRODUCT', 'CATEGORY', 'PATH');

-- CreateEnum
CREATE TYPE "TrackingLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AttributionModel" AS ENUM ('LAST_CLICK');

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "status" "InfluencerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "InfluencerCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfluencerCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerTrackingLink" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "targetType" "TrackingLinkTargetType" NOT NULL DEFAULT 'HOME',
    "targetPath" TEXT NOT NULL DEFAULT '/',
    "productId" TEXT,
    "categoryId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "status" "TrackingLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfluencerTrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionClick" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "trackingLinkId" TEXT NOT NULL,
    "visitorIdHash" TEXT NOT NULL,
    "sessionIdHash" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "referrerHost" TEXT,
    "landingPath" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "trackingLinkId" TEXT,
    "attributionModel" "AttributionModel" NOT NULL DEFAULT 'LAST_CLICK',
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossRevenueMinor" INTEGER NOT NULL,
    "refundedRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "netRevenueMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttributionRefund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderAttributionId" TEXT NOT NULL,
    "refundKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAttributionRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Influencer_storeId_idx" ON "Influencer"("storeId");

-- CreateIndex
CREATE INDEX "Influencer_storeId_status_idx" ON "Influencer"("storeId", "status");

-- CreateIndex
CREATE INDEX "Influencer_storeId_createdAt_idx" ON "Influencer"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_storeId_code_key" ON "Influencer"("storeId", "code");

-- CreateIndex
CREATE INDEX "InfluencerCampaign_storeId_idx" ON "InfluencerCampaign"("storeId");

-- CreateIndex
CREATE INDEX "InfluencerCampaign_storeId_status_idx" ON "InfluencerCampaign"("storeId", "status");

-- CreateIndex
CREATE INDEX "InfluencerCampaign_storeId_influencerId_idx" ON "InfluencerCampaign"("storeId", "influencerId");

-- CreateIndex
CREATE INDEX "InfluencerCampaign_influencerId_idx" ON "InfluencerCampaign"("influencerId");

-- CreateIndex
CREATE INDEX "InfluencerTrackingLink_storeId_idx" ON "InfluencerTrackingLink"("storeId");

-- CreateIndex
CREATE INDEX "InfluencerTrackingLink_storeId_campaignId_idx" ON "InfluencerTrackingLink"("storeId", "campaignId");

-- CreateIndex
CREATE INDEX "InfluencerTrackingLink_campaignId_idx" ON "InfluencerTrackingLink"("campaignId");

-- CreateIndex
CREATE INDEX "InfluencerTrackingLink_productId_idx" ON "InfluencerTrackingLink"("productId");

-- CreateIndex
CREATE INDEX "InfluencerTrackingLink_categoryId_idx" ON "InfluencerTrackingLink"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerTrackingLink_storeId_tokenHash_key" ON "InfluencerTrackingLink"("storeId", "tokenHash");

-- CreateIndex
CREATE INDEX "AttributionClick_storeId_idx" ON "AttributionClick"("storeId");

-- CreateIndex
CREATE INDEX "AttributionClick_storeId_createdAt_idx" ON "AttributionClick"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionClick_trackingLinkId_createdAt_idx" ON "AttributionClick"("trackingLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionClick_campaignId_createdAt_idx" ON "AttributionClick"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionClick_storeId_trackingLinkId_visitorIdHash_creat_idx" ON "AttributionClick"("storeId", "trackingLinkId", "visitorIdHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_storeId_idx" ON "OrderAttribution"("storeId");

-- CreateIndex
CREATE INDEX "OrderAttribution_storeId_campaignId_attributedAt_idx" ON "OrderAttribution"("storeId", "campaignId", "attributedAt");

-- CreateIndex
CREATE INDEX "OrderAttribution_storeId_influencerId_attributedAt_idx" ON "OrderAttribution"("storeId", "influencerId", "attributedAt");

-- CreateIndex
CREATE INDEX "OrderAttribution_campaignId_idx" ON "OrderAttribution"("campaignId");

-- CreateIndex
CREATE INDEX "OrderAttribution_influencerId_idx" ON "OrderAttribution"("influencerId");

-- CreateIndex
CREATE INDEX "OrderAttribution_trackingLinkId_idx" ON "OrderAttribution"("trackingLinkId");

-- CreateIndex
CREATE INDEX "OrderAttributionRefund_storeId_idx" ON "OrderAttributionRefund"("storeId");

-- CreateIndex
CREATE INDEX "OrderAttributionRefund_orderAttributionId_idx" ON "OrderAttributionRefund"("orderAttributionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttributionRefund_orderAttributionId_refundKey_key" ON "OrderAttributionRefund"("orderAttributionId", "refundKey");

-- AddForeignKey
ALTER TABLE "Influencer" ADD CONSTRAINT "Influencer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerCampaign" ADD CONSTRAINT "InfluencerCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerCampaign" ADD CONSTRAINT "InfluencerCampaign_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerTrackingLink" ADD CONSTRAINT "InfluencerTrackingLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerTrackingLink" ADD CONSTRAINT "InfluencerTrackingLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "InfluencerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerTrackingLink" ADD CONSTRAINT "InfluencerTrackingLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerTrackingLink" ADD CONSTRAINT "InfluencerTrackingLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionClick" ADD CONSTRAINT "AttributionClick_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionClick" ADD CONSTRAINT "AttributionClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "InfluencerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionClick" ADD CONSTRAINT "AttributionClick_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "InfluencerTrackingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "InfluencerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_trackingLinkId_fkey" FOREIGN KEY ("trackingLinkId") REFERENCES "InfluencerTrackingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttributionRefund" ADD CONSTRAINT "OrderAttributionRefund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttributionRefund" ADD CONSTRAINT "OrderAttributionRefund_orderAttributionId_fkey" FOREIGN KEY ("orderAttributionId") REFERENCES "OrderAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;


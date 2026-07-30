-- TODO-162 (ADR-205) — Home Discovery section-analytics event domaini (ADDITIVE).
-- Yalniz yeni HomeDiscoveryEvent tablosu + index'ler + Store FK. Mevcut veriye DOKUNMAZ.
-- Eligibility-driven kesif section'larinin funnel olcumu (section/card impression, product/CTA click,
-- add-to-cart). Bot/prefetch VE hidden-section event URETMEZ (satir hic yazilmaz; kural uygulama katmaninda).
-- Sponsored kartlari AYRICA mevcut SponsoredProductEvent token olcumunu kullanir (bu tablo section-funnel).

-- CreateTable
CREATE TABLE "HomeDiscoveryEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "visitorHash" TEXT,
    "sessionHash" TEXT,
    "sectionId" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "eligibilitySource" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "productId" TEXT,
    "campaignId" TEXT,
    "sponsoredCampaignId" TEXT,
    "placement" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeDiscoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeDiscoveryEvent_storeId_createdAt_idx" ON "HomeDiscoveryEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "HomeDiscoveryEvent_storeId_sectionType_eligibilitySource_ev_idx" ON "HomeDiscoveryEvent"("storeId", "sectionType", "eligibilitySource", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "HomeDiscoveryEvent_storeId_sectionId_eventType_createdAt_idx" ON "HomeDiscoveryEvent"("storeId", "sectionId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "HomeDiscoveryEvent_storeId_sectionId_productId_visitorHash__idx" ON "HomeDiscoveryEvent"("storeId", "sectionId", "productId", "visitorHash", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "HomeDiscoveryEvent_storeId_dedupeKey_idx" ON "HomeDiscoveryEvent"("storeId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "HomeDiscoveryEvent" ADD CONSTRAINT "HomeDiscoveryEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

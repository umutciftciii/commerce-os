-- TD-130 (ADR-145…148) — Recommendation Measurement event domaini (ADDITIVE).
-- Yalniz yeni RecommendationEvent tablosu + index'ler + Store FK. Mevcut veriye DOKUNMAZ.
-- NOT: prisma migrate diff ciktisindaki ProductSearchDocument gin/trgm "drift" satirlari KASITLI
-- HARIC birakildi (tsvector/GENERATED index'leri Search'e aittir; Prisma modellemez — memory belgeli).

-- CreateTable
CREATE TABLE "RecommendationEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "visitorHash" TEXT,
    "sessionHash" TEXT,
    "productId" TEXT NOT NULL,
    "anchorProductId" TEXT,
    "source" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationEvent_storeId_createdAt_idx" ON "RecommendationEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_storeId_eventType_source_placement_crea_idx" ON "RecommendationEvent"("storeId", "eventType", "source", "placement", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_storeId_productId_eventType_createdAt_idx" ON "RecommendationEvent"("storeId", "productId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_storeId_source_placement_productId_visi_idx" ON "RecommendationEvent"("storeId", "source", "placement", "productId", "visitorHash", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_storeId_dedupeKey_idx" ON "RecommendationEvent"("storeId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

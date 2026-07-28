-- Influencer Campaign Lifecycle & Granular Analytics (ADR-170…176).
-- ADDITIVE; mevcut veriye DOKUNMAZ (RESET YOK). Enum degerleri ve nullable kolonlar.
--
--  1) InfluencerCampaignStatus: DRAFT/ENDED/CANCELLED eklendi (ACTIVE/PAUSED/ARCHIVED korunur;
--     ARCHIVED legacy = ENDED semantigi). Lifecycle + attribution kapanis politikasi (ADR-173).
--  2) TrackingLinkStatus: PAUSED/REVOKED eklendi (ACTIVE/INACTIVE korunur; INACTIVE legacy =
--     PAUSED semantigi). REVOKED terminal (rotation/iptal).
--  3) InfluencerTrackingLink: utmContent/utmTerm/customLabel (raporlama, immutable) +
--     activatedAt/pausedAt/revokedAt (yasam dongusu zaman damgalari).
--
-- Not: PostgreSQL'de ALTER TYPE ... ADD VALUE ayni transaction icinde kullanilamaz;
-- bu yuzden enum eklemeleri ayri ifadelerdir (Prisma bunlari ayri calistirir).

ALTER TYPE "InfluencerCampaignStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "InfluencerCampaignStatus" ADD VALUE IF NOT EXISTS 'ENDED';
ALTER TYPE "InfluencerCampaignStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "TrackingLinkStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "TrackingLinkStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "customLabel" TEXT;
ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "InfluencerTrackingLink" ADD COLUMN "revokedAt" TIMESTAMP(3);

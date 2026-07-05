-- F4A.4 — Campaign presentation / coupon-card fields (ADR-061).
-- ADDITIVE-only: mevcut kolonlara dokunmaz, veri silmez/yeniden adlandirmaz.
-- Bu alanlar YALNIZCA gorunumdur; indirim motorunu ETKILEMEZ. Mevcut
-- kampanyalar null/varsayilanla calisir (backfill gerekmez).
-- FOLLOW/store-follow/seller-follow gibi takip tabanli hicbir deger YOKTUR.

-- CreateEnum
CREATE TYPE "CampaignBadgeVariant" AS ENUM ('DEFAULT', 'SUPER', 'LIMITED_TIME', 'PERSONAL', 'WEEKEND', 'NEW_CUSTOMER');

-- CreateEnum
CREATE TYPE "CampaignCardStyle" AS ENUM ('STANDARD', 'FEATURED', 'PERSONAL');

-- CreateEnum
-- isPublic bu secimden TURETILIR (AUTO_VISIBLE/PUBLIC_CLAIMABLE=>true; digerleri=>false).
CREATE TYPE "CampaignAccessModel" AS ENUM ('AUTO_VISIBLE', 'PUBLIC_CLAIMABLE', 'CODE_CLAIMED', 'ADMIN_ASSIGNED');

-- AlterTable
ALTER TABLE "Campaign"
    ADD COLUMN "displayTitle" TEXT,
    ADD COLUMN "shortDescription" TEXT,
    ADD COLUMN "terms" TEXT,
    ADD COLUMN "badgeLabel" TEXT,
    ADD COLUMN "badgeVariant" "CampaignBadgeVariant",
    ADD COLUMN "cardStyle" "CampaignCardStyle" NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN "accessModel" "CampaignAccessModel" NOT NULL DEFAULT 'AUTO_VISIBLE',
    ADD COLUMN "displayPriority" INTEGER NOT NULL DEFAULT 0;

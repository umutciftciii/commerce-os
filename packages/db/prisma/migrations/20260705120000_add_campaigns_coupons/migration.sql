-- F4A — Campaigns & Coupons MVP (ADR-058).
-- ADDITIVE-only: mevcut tablo/kolonlara dokunmaz, veri silmez/yeniden adlandirmaz.
-- Indirim kaynak dogrusu sunucu tarafi motorudur; OrderDiscount siparis olusunca
-- IMMUTABLE snapshot'tir; CampaignRedemption siparis basina kampanya BIR KEZ yazilir.

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- BUY_X_GET_Y / FREE_SHIPPING / MEMBERSHIP_ONLY gelecek fazlar icin enum rezervi.
CREATE TYPE "CampaignType" AS ENUM ('COUPON_CODE', 'AUTOMATIC_CART', 'PRODUCT_DISCOUNT', 'CATEGORY_DISCOUNT', 'BUY_X_GET_Y', 'FREE_SHIPPING', 'MEMBERSHIP_ONLY');

CREATE TYPE "CampaignDiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "CampaignType" NOT NULL,
    "discountType" "CampaignDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxDiscountAmountMinor" INTEGER,
    "minOrderAmountMinor" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "totalUsageLimit" INTEGER,
    "perCustomerUsageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalUsageLimit" INTEGER,
    "perCustomerUsageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignProduct" (
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("campaignId","productId")
);

CREATE TABLE "CampaignCategory" (
    "campaignId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCategory_pkey" PRIMARY KEY ("campaignId","categoryId")
);

CREATE TABLE "CampaignRedemption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "couponId" TEXT,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "discountAmountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderDiscount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "campaignId" TEXT,
    "couponId" TEXT,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "discountType" "CampaignDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "discountAmountMinor" INTEGER NOT NULL,
    "scopeSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_storeId_idx" ON "Campaign"("storeId");
CREATE INDEX "Campaign_storeId_status_idx" ON "Campaign"("storeId", "status");
CREATE INDEX "Campaign_storeId_type_idx" ON "Campaign"("storeId", "type");

CREATE UNIQUE INDEX "Coupon_storeId_normalizedCode_key" ON "Coupon"("storeId", "normalizedCode");
CREATE INDEX "Coupon_storeId_idx" ON "Coupon"("storeId");
CREATE INDEX "Coupon_campaignId_idx" ON "Coupon"("campaignId");

CREATE INDEX "CampaignProduct_storeId_idx" ON "CampaignProduct"("storeId");
CREATE INDEX "CampaignProduct_productId_idx" ON "CampaignProduct"("productId");

CREATE INDEX "CampaignCategory_storeId_idx" ON "CampaignCategory"("storeId");
CREATE INDEX "CampaignCategory_categoryId_idx" ON "CampaignCategory"("categoryId");

CREATE UNIQUE INDEX "CampaignRedemption_campaignId_orderId_key" ON "CampaignRedemption"("campaignId", "orderId");
CREATE INDEX "CampaignRedemption_storeId_idx" ON "CampaignRedemption"("storeId");
CREATE INDEX "CampaignRedemption_couponId_idx" ON "CampaignRedemption"("couponId");
CREATE INDEX "CampaignRedemption_campaignId_customerId_idx" ON "CampaignRedemption"("campaignId", "customerId");
CREATE INDEX "CampaignRedemption_campaignId_email_idx" ON "CampaignRedemption"("campaignId", "email");
CREATE INDEX "CampaignRedemption_orderId_idx" ON "CampaignRedemption"("orderId");

CREATE INDEX "OrderDiscount_storeId_idx" ON "OrderDiscount"("storeId");
CREATE INDEX "OrderDiscount_orderId_idx" ON "OrderDiscount"("orderId");
CREATE INDEX "OrderDiscount_campaignId_idx" ON "OrderDiscount"("campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignCategory" ADD CONSTRAINT "CampaignCategory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignCategory" ADD CONSTRAINT "CampaignCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

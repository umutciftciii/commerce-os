-- F4A.3 — Customer coupon wallet (ADR-060).
-- ADDITIVE-only: mevcut tablo/kolonlara dokunmaz, veri silmez/yeniden adlandirmaz.
-- Cuzdan yalnizca atama/claim/uygulama STATE'ini tutar; indirim tutarinin kaynak
-- dogrusu yine couponCode + sunucu-tarafi motordur. Store-scoped; cross-store gorunmez.

-- CreateEnum
CREATE TYPE "CustomerCouponStatus" AS ENUM ('AVAILABLE', 'APPLIED', 'USED', 'REVOKED');

CREATE TYPE "CustomerCouponSource" AS ENUM ('ADMIN_ASSIGNED', 'PUBLIC_CLAIMED', 'CODE_CLAIMED');

-- CreateTable
CREATE TABLE "CustomerCoupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "status" "CustomerCouponStatus" NOT NULL DEFAULT 'AVAILABLE',
    "source" "CustomerCouponSource" NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCoupon_storeId_couponId_customerId_key" ON "CustomerCoupon"("storeId", "couponId", "customerId");

CREATE UNIQUE INDEX "CustomerCoupon_storeId_couponId_email_key" ON "CustomerCoupon"("storeId", "couponId", "email");

CREATE INDEX "CustomerCoupon_storeId_idx" ON "CustomerCoupon"("storeId");

CREATE INDEX "CustomerCoupon_couponId_idx" ON "CustomerCoupon"("couponId");

CREATE INDEX "CustomerCoupon_campaignId_idx" ON "CustomerCoupon"("campaignId");

CREATE INDEX "CustomerCoupon_storeId_customerId_status_idx" ON "CustomerCoupon"("storeId", "customerId", "status");

CREATE INDEX "CustomerCoupon_storeId_email_status_idx" ON "CustomerCoupon"("storeId", "email", "status");

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

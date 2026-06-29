-- F3C.2 — Shipping price engine (store tarife). Kargo ucreti SAGLAYICI quote'u
-- DEGILDIR; magaza/admin tarafindan girilen tarife uzerinden hesaplanir (ADR-036).
-- 1) Yeni enum'lar: ShippingRatePlanStatus / ShippingRatePricingMode / ShippingRateSource.
-- 2) ShippingRatePlan + ShippingRateRule tablolari (store-scoped).
-- 3) Product/ProductVariant kargo olcumu (desi/agirlik) opsiyonel kolonlari.
-- 4) Order kargo SNAPSHOT alanlari (source/plan kimligi/para birimi). Tutar
--    zaten Order.shippingAmount kolonundadir.

-- CreateEnum
CREATE TYPE "ShippingRatePlanStatus" AS ENUM ('ACTIVE', 'PASSIVE');

-- CreateEnum
CREATE TYPE "ShippingRatePricingMode" AS ENUM ('FIXED', 'FREE_THRESHOLD', 'DESI_TABLE', 'WEIGHT_TABLE', 'DESI_AND_REGION_TABLE');

-- CreateEnum
CREATE TYPE "ShippingRateSource" AS ENUM ('STORE_FIXED_RULE', 'STORE_SHIPPING_TARIFF', 'MOCK');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "shippingWeightKg" DECIMAL(10,3),
ADD COLUMN "shippingDesi" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "shippingWeightKg" DECIMAL(10,3),
ADD COLUMN "shippingDesi" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingCurrency" TEXT,
ADD COLUMN "shippingSource" "ShippingRateSource",
ADD COLUMN "shippingRatePlanId" TEXT,
ADD COLUMN "shippingRatePlanName" TEXT;

-- CreateTable
CREATE TABLE "ShippingRatePlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "ShippingProviderType",
    "name" TEXT NOT NULL,
    "status" "ShippingRatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "pricingMode" "ShippingRatePricingMode" NOT NULL DEFAULT 'FIXED',
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "fixedAmountMinor" INTEGER,
    "freeShippingThresholdMinor" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRateRule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "minDesi" DECIMAL(10,2),
    "maxDesi" DECIMAL(10,2),
    "minWeightKg" DECIMAL(10,3),
    "maxWeightKg" DECIMAL(10,3),
    "cityCode" TEXT,
    "districtCode" TEXT,
    "regionCode" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "extraAmountMinor" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRateRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingRatePlan_storeId_idx" ON "ShippingRatePlan"("storeId");

-- CreateIndex
CREATE INDEX "ShippingRatePlan_storeId_status_idx" ON "ShippingRatePlan"("storeId", "status");

-- CreateIndex
CREATE INDEX "ShippingRateRule_ratePlanId_idx" ON "ShippingRateRule"("ratePlanId");

-- CreateIndex
CREATE INDEX "ShippingRateRule_cityCode_districtCode_idx" ON "ShippingRateRule"("cityCode", "districtCode");

-- CreateIndex
CREATE INDEX "ShippingRateRule_storeId_idx" ON "ShippingRateRule"("storeId");

-- AddForeignKey
ALTER TABLE "ShippingRatePlan" ADD CONSTRAINT "ShippingRatePlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRateRule" ADD CONSTRAINT "ShippingRateRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRateRule" ADD CONSTRAINT "ShippingRateRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "ShippingRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

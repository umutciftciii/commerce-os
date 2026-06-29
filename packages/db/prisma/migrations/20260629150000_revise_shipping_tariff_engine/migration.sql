-- F3C.2 revizyon — Generic Shipping Tariff Engine (ADR-044 revizyon). Provider'a
-- ozel fiyat kodu YOKTUR; DHL/Aras/Yurtici fiyat listeleri generic kurallara maplenir.
-- GERIYE UYUMLU migration:
--   1) Yeni enum ShippingChargeType.
--   2) ShippingRateRule.amountMinor -> NULLABLE (mevcut degerler korunur).
--   3) ShippingRateRule'a tier/zone + chargeType + birim/taban alanlari (chargeType
--      DEFAULT 'FLAT' ile mevcut satirlar otomatik backfill olur; FLAT mevcut
--      amountMinor yolunu birebir korur).
--   4) Yeni tablolar: ShippingRateTier / ShippingRateZone / ShippingSurcharge (plan-scoped).

-- CreateEnum
CREATE TYPE "ShippingChargeType" AS ENUM ('FLAT', 'PER_KG', 'PER_DESI', 'PER_KG_OR_DESI', 'PER_ADDITIONAL_KG_OR_DESI');

-- AlterTable: amountMinor nullable + yeni tariff alanlari. chargeType DEFAULT 'FLAT'
-- mevcut tum satirlari FLAT olarak backfill eder; amountMinor degerleri degismeden kalir.
ALTER TABLE "ShippingRateRule"
  ALTER COLUMN "amountMinor" DROP NOT NULL,
  ADD COLUMN "tierId" TEXT,
  ADD COLUMN "zoneId" TEXT,
  ADD COLUMN "chargeType" "ShippingChargeType" NOT NULL DEFAULT 'FLAT',
  ADD COLUMN "unitAmountMinor" INTEGER,
  ADD COLUMN "baseAmountMinor" INTEGER,
  ADD COLUMN "baseThreshold" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "ShippingRateTier" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyShipmentMin" INTEGER,
    "monthlyShipmentMax" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRateZone" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minDistanceKm" DECIMAL(10,2),
    "maxDistanceKm" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRateZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingSurcharge" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chargeType" "ShippingChargeType" NOT NULL DEFAULT 'FLAT',
    "amountMinor" INTEGER,
    "unitAmountMinor" INTEGER,
    "conditionJsonSafe" JSONB,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingRateTier_ratePlanId_idx" ON "ShippingRateTier"("ratePlanId");

-- CreateIndex
CREATE INDEX "ShippingRateZone_ratePlanId_idx" ON "ShippingRateZone"("ratePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRateZone_ratePlanId_code_key" ON "ShippingRateZone"("ratePlanId", "code");

-- CreateIndex
CREATE INDEX "ShippingSurcharge_ratePlanId_idx" ON "ShippingSurcharge"("ratePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingSurcharge_ratePlanId_code_key" ON "ShippingSurcharge"("ratePlanId", "code");

-- CreateIndex
CREATE INDEX "ShippingRateRule_tierId_idx" ON "ShippingRateRule"("tierId");

-- CreateIndex
CREATE INDEX "ShippingRateRule_zoneId_idx" ON "ShippingRateRule"("zoneId");

-- AddForeignKey
ALTER TABLE "ShippingRateTier" ADD CONSTRAINT "ShippingRateTier_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "ShippingRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRateZone" ADD CONSTRAINT "ShippingRateZone_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "ShippingRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingSurcharge" ADD CONSTRAINT "ShippingSurcharge_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "ShippingRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRateRule" ADD CONSTRAINT "ShippingRateRule_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "ShippingRateTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRateRule" ADD CONSTRAINT "ShippingRateRule_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingRateZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

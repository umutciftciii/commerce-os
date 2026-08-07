-- TODO-173 (ADR-274) — Reverse Shipment (Return Flow Simplification PR3).
-- Reddedilen ürünün mağazadan müşteriye güvenli geri gönderimi. TÜMÜYLE ADDITIVE + geri uyumlu:
--   * Shipment.direction default 'OUTBOUND_TO_CUSTOMER' → mevcut TÜM gönderiler otomatik outbound.
--   * Shipment.provider / providerConfigId NOT NULL KALIR: reverse shipment siparişin outbound gönderisinin
--     config'ini REUSE eder (direction filtreleriyle sync/webhook/barcode worker'larından dışlanır).
--   * carrierName / estimatedDeliveryAt = reverse shipment serbest-metin taşıyıcı + müşteri ETA (nullable).
--   * ReturnItemDisposition = reddedilen adet disposition domain'i (ReturnRestockDecision GENİŞLETİLMEZ).
--   * CUSTOMER_RETURN_TO_STORE enum değeri RESERVED — bu migration hiçbir kayıt üretmez/backfill yapmaz.
-- Migrate-before-app güvenli: eski app (direction'sız) yeni şemayla çalışır (yeni kolonlar default/nullable).

-- CreateEnum
CREATE TYPE "ShipmentDirection" AS ENUM ('OUTBOUND_TO_CUSTOMER', 'CUSTOMER_RETURN_TO_STORE', 'STORE_RETURN_TO_CUSTOMER');

-- CreateEnum
CREATE TYPE "ReturnRejectedDisposition" AS ENUM ('RETURN_TO_CUSTOMER', 'DESTROY', 'SEND_TO_VENDOR', 'KEEP_IN_STORE', 'CONTACT_CUSTOMER');

-- CreateEnum
CREATE TYPE "ReturnDispositionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "carrierName" TEXT,
ADD COLUMN     "createdByPlatformUserId" TEXT,
ADD COLUMN     "direction" "ShipmentDirection" NOT NULL DEFAULT 'OUTBOUND_TO_CUSTOMER',
ADD COLUMN     "estimatedDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "returnItemId" TEXT,
ADD COLUMN     "returnQuantity" INTEGER,
ADD COLUMN     "returnRequestId" TEXT,
ADD COLUMN     "reverseShipmentReason" TEXT,
ADD COLUMN     "sourceShipmentId" TEXT;

-- CreateTable
CREATE TABLE "ReturnItemDisposition" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "type" "ReturnRejectedDisposition" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReturnDispositionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdByPlatformUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnItemDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnItemDisposition_storeId_idx" ON "ReturnItemDisposition"("storeId");

-- CreateIndex
CREATE INDEX "ReturnItemDisposition_returnRequestId_idx" ON "ReturnItemDisposition"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnItemDisposition_returnItemId_idx" ON "ReturnItemDisposition"("returnItemId");

-- CreateIndex
CREATE INDEX "ReturnItemDisposition_returnItemId_status_idx" ON "ReturnItemDisposition"("returnItemId", "status");

-- CreateIndex
CREATE INDEX "Shipment_storeId_direction_idx" ON "Shipment"("storeId", "direction");

-- CreateIndex
CREATE INDEX "Shipment_direction_status_idx" ON "Shipment"("direction", "status");

-- CreateIndex
CREATE INDEX "Shipment_returnRequestId_idx" ON "Shipment"("returnRequestId");

-- CreateIndex
CREATE INDEX "Shipment_returnItemId_idx" ON "Shipment"("returnItemId");

-- CreateIndex
CREATE INDEX "Shipment_sourceShipmentId_idx" ON "Shipment"("sourceShipmentId");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_sourceShipmentId_fkey" FOREIGN KEY ("sourceShipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItemDisposition" ADD CONSTRAINT "ReturnItemDisposition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItemDisposition" ADD CONSTRAINT "ReturnItemDisposition_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItemDisposition" ADD CONSTRAINT "ReturnItemDisposition_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

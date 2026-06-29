-- F3C.1 / TODO-094 Shipping provider foundation.
-- Magaza bazli opsiyonel kargo saglayici altyapisi: MOCK / GELIVER / DHL_ECOMMERCE.
-- Secret alanlar AES-256-GCM ciphertext olarak saklanir (encrypted*); duz metin ASLA yazilmaz.
-- UI/domain dilinde "DHL eCommerce"; "MNG" yalniz teknik endpoint referansinda (api.mngkargo.com.tr).

-- CreateEnum
CREATE TYPE "ShippingProviderType" AS ENUM ('MOCK', 'GELIVER', 'DHL_ECOMMERCE');

-- CreateEnum
CREATE TYPE "ShippingProviderMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "ShippingProviderStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ShippingCredentialType" AS ENUM ('DEFAULT', 'IDENTITY', 'STANDARD_COMMAND', 'STANDARD_QUERY', 'BARCODE_COMMAND', 'CBS_INFO', 'BULK_QUERY', 'FINANCE_QUERY');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'ORDER_CREATED', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentEventType" AS ENUM ('CREATED', 'ORDER_CREATED', 'BARCODE_CREATED', 'STATUS_CHANGED', 'TRACKING_UPDATED', 'CANCELLED', 'WEBHOOK_RECEIVED');

-- CreateTable
CREATE TABLE "ShippingProviderConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "ShippingProviderType" NOT NULL,
    "mode" "ShippingProviderMode" NOT NULL DEFAULT 'TEST',
    "status" "ShippingProviderStatus" NOT NULL DEFAULT 'DISABLED',
    "displayName" TEXT NOT NULL,
    "allowOrderCreate" BOOLEAN NOT NULL DEFAULT false,
    "allowBarcodeCreate" BOOLEAN NOT NULL DEFAULT false,
    "allowLabelPurchase" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingProviderCredential" (
    "id" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "type" "ShippingCredentialType" NOT NULL DEFAULT 'DEFAULT',
    "encryptedKey" TEXT,
    "encryptedSecret" TEXT,
    "encryptedCustomerNumber" TEXT,
    "encryptedCustomerPassword" TEXT,
    "identityType" INTEGER,
    "maskedKey" TEXT,
    "configured" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "provider" "ShippingProviderType" NOT NULL,
    "externalOrderId" TEXT,
    "externalShipmentId" TEXT,
    "externalInvoiceId" TEXT,
    "referenceId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "shipmentStatusCode" INTEGER,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "barcodeJsonSafe" JSONB,
    "pieceCount" INTEGER NOT NULL DEFAULT 1,
    "totalKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDesi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packagingType" INTEGER,
    "shipmentServiceType" INTEGER,
    "paymentType" INTEGER,
    "deliveryType" INTEGER,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "recipientCityCode" INTEGER,
    "recipientDistrictCode" INTEGER,
    "recipientCityName" TEXT,
    "recipientDistrictName" TEXT,
    "recipientAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "provider" "ShippingProviderType" NOT NULL,
    "eventType" "ShipmentEventType" NOT NULL,
    "statusCode" INTEGER,
    "statusText" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3),
    "trackingUrl" TEXT,
    "rawSafeJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentQuote" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "providerConfigId" TEXT NOT NULL,
    "provider" "ShippingProviderType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "rawSafeJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingProviderConfig_storeId_idx" ON "ShippingProviderConfig"("storeId");

-- CreateIndex
CREATE INDEX "ShippingProviderConfig_storeId_status_idx" ON "ShippingProviderConfig"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingProviderConfig_storeId_provider_mode_key" ON "ShippingProviderConfig"("storeId", "provider", "mode");

-- CreateIndex
CREATE INDEX "ShippingProviderCredential_providerConfigId_idx" ON "ShippingProviderCredential"("providerConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingProviderCredential_providerConfigId_type_key" ON "ShippingProviderCredential"("providerConfigId", "type");

-- CreateIndex
CREATE INDEX "Shipment_storeId_idx" ON "Shipment"("storeId");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_providerConfigId_idx" ON "Shipment"("providerConfigId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_storeId_referenceId_key" ON "Shipment"("storeId", "referenceId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_storeId_idx" ON "ShipmentEvent"("storeId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_idx" ON "ShipmentEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_eventType_idx" ON "ShipmentEvent"("eventType");

-- CreateIndex
CREATE INDEX "ShipmentQuote_storeId_idx" ON "ShipmentQuote"("storeId");

-- CreateIndex
CREATE INDEX "ShipmentQuote_orderId_idx" ON "ShipmentQuote"("orderId");

-- CreateIndex
CREATE INDEX "ShipmentQuote_providerConfigId_idx" ON "ShipmentQuote"("providerConfigId");

-- AddForeignKey
ALTER TABLE "ShippingProviderConfig" ADD CONSTRAINT "ShippingProviderConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingProviderCredential" ADD CONSTRAINT "ShippingProviderCredential_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ShippingProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ShippingProviderConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ShippingProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;


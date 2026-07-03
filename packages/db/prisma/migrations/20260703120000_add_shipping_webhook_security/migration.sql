-- TODO-100/104 — Shipping webhook guvenligi + idempotency inbox'i.
-- ADDITIVE-only: mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.

-- ShippingProviderConfig: webhook token (URL cozumleme kimligi) + sifreli secret.
-- Token tek basina yetki vermez; HMAC imza her istekte zorunludur.
ALTER TABLE "ShippingProviderConfig" ADD COLUMN IF NOT EXISTS "webhookToken" TEXT;
ALTER TABLE "ShippingProviderConfig" ADD COLUMN IF NOT EXISTS "webhookSecretCipher" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingProviderConfig_webhookToken_key"
  ON "ShippingProviderConfig"("webhookToken");

-- Webhook isleme sonucu.
DO $$ BEGIN
  CREATE TYPE "ShipmentWebhookOutcome" AS ENUM (
    'ACCEPTED',
    'IGNORED_UNKNOWN_SHIPMENT',
    'IGNORED_UNSUPPORTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Idempotency/replay inbox'i: imzasi GECERLI her teslimat (providerConfigId, eventKey)
-- ile bir kez kaydedilir; unique ihlali = duplicate → yeni ShipmentEvent yazilmaz.
CREATE TABLE IF NOT EXISTS "ShipmentWebhookInbox" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "providerConfigId" TEXT NOT NULL,
  "provider" "ShippingProviderType" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "outcome" "ShipmentWebhookOutcome" NOT NULL DEFAULT 'ACCEPTED',
  "shipmentId" TEXT,
  "statusCode" INTEGER,
  "statusText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentWebhookInbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentWebhookInbox_providerConfigId_eventKey_key"
  ON "ShipmentWebhookInbox"("providerConfigId", "eventKey");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookInbox_storeId_idx" ON "ShipmentWebhookInbox"("storeId");
CREATE INDEX IF NOT EXISTS "ShipmentWebhookInbox_shipmentId_idx" ON "ShipmentWebhookInbox"("shipmentId");

DO $$ BEGIN
  ALTER TABLE "ShipmentWebhookInbox"
    ADD CONSTRAINT "ShipmentWebhookInbox_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipmentWebhookInbox"
    ADD CONSTRAINT "ShipmentWebhookInbox_providerConfigId_fkey"
    FOREIGN KEY ("providerConfigId") REFERENCES "ShippingProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- F3C.5 (TODO-121) — Provider-agnostic shipment operasyonu hazirligi.
-- ADDITIVE-only: mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.

-- ShippingProviderConfig: public provider logo alanlari (secret DEGIL).
ALTER TABLE "ShippingProviderConfig" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "ShippingProviderConfig" ADD COLUMN IF NOT EXISTS "logoAlt" TEXT;

-- ShipmentEventType: admin manuel takip no girisi event'i.
ALTER TYPE "ShipmentEventType" ADD VALUE IF NOT EXISTS 'MANUAL_TRACKING';

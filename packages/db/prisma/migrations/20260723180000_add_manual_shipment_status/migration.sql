-- TODO-162 (ADR-101) — Manual Shipment Status & Fulfillment.
-- ADDITIVE-only: operatörün elle durum ilerletmesi için yeni ShipmentEventType değeri.
-- Mevcut veriye dokunmaz; değer silmez/yeniden adlandırmaz.
ALTER TYPE "ShipmentEventType" ADD VALUE IF NOT EXISTS 'MANUAL_STATUS';

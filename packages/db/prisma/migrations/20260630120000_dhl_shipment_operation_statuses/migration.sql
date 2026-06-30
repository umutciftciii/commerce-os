-- F3C.3 — DHL yanit netlestirmesi (ADR-045): operasyonel ara/normalize durumlar.
-- ADDITIVE-only enum genislemesi; mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.
-- AlterEnum (ShipmentStatus): LABEL_PENDING / OUT_FOR_DELIVERY / DELIVERY_FAILED.
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'LABEL_PENDING';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';

-- AlterEnum (ShipmentEventType): BARCODE_PENDING / BARCODE_FAILED.
ALTER TYPE "ShipmentEventType" ADD VALUE IF NOT EXISTS 'BARCODE_PENDING';
ALTER TYPE "ShipmentEventType" ADD VALUE IF NOT EXISTS 'BARCODE_FAILED';

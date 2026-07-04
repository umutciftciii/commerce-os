-- TODO-124 — CBS il/ilce eslemesi + varis subesi onarim akisi.
-- ADDITIVE-only: mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.
-- DESTINATION_REPAIRED = admin varis il/ilce eslemesini duzeltti (CBS kodlari
-- shipment snapshot'ina yazildi). lastBarcodeErrorCode = son barkod denemesinin
-- SINIFLANDIRILMIS sanitize hata kodu (or. DESTINATION_BRANCH_NOT_FOUND);
-- basarili barkod/pending ve onarim bunu sifirlar. TODO-123 retry worker'i
-- DESTINATION_BRANCH_NOT_FOUND'u admin duzeltmesine kadar SKIP etmelidir.

ALTER TYPE "ShipmentEventType" ADD VALUE IF NOT EXISTS 'DESTINATION_REPAIRED';

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "lastBarcodeErrorCode" TEXT;

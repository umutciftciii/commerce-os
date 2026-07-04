-- TODO-123 — Barkod retry/backoff metadata'si.
-- ADDITIVE-only: mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.
-- TODO-129 sync alanlarindan (lastSyncAt/nextSyncAt/syncAttempts/lastSyncErrorCode)
-- AYRIDIR: barkod olusturma ile durum senkronu farkli yasam donguleridir.
--
-- barcodeRetryCount        = ardisik TRANSIENT (retryable) barkod hatasi sayaci;
--                            basarili barkod/pending SIFIRLAR.
-- barcodeNextRetryAt       = backoff (null => zamanlanmadi; worker SECMEZ).
-- barcodeLastAttemptAt     = son barkod DENEMESI ani (basari/hata farketmez).
-- barcodeRetryBlockedReason= otomatik retry BLOK nedeni: "DATA_FIX" (adres/varis
--                            eslemesi duzeltilmeli — TODO-124/139), "TERMINAL"
--                            (kalici/desteklenmeyen), "MAX_ATTEMPTS" (transient limit
--                            doldu). null => bloklu degil. lastBarcodeErrorCode
--                            ("ne oldu") ile AYRIDIR ("neden otomatik denenmiyor").

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "barcodeRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "barcodeNextRetryAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "barcodeLastAttemptAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "barcodeRetryBlockedReason" TEXT;

-- Worker uygun gonderi secimi (status taramasi + backoff siralamasi).
CREATE INDEX IF NOT EXISTS "Shipment_status_barcodeNextRetryAt_idx"
  ON "Shipment" ("status", "barcodeNextRetryAt");
CREATE INDEX IF NOT EXISTS "Shipment_lastBarcodeErrorCode_barcodeNextRetryAt_idx"
  ON "Shipment" ("lastBarcodeErrorCode", "barcodeNextRetryAt");

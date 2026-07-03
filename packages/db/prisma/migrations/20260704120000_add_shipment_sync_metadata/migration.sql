-- TODO-129 — Zamanlanmis shipment sync worker metadata'si (provider-agnostic).
-- ADDITIVE-only: mevcut veriye dokunmaz, deger silmez/yeniden adlandirmaz.
-- lastSyncAt = son sync DENEMESI; nextSyncAt = hata backoff'u (null => hemen secilebilir);
-- syncAttempts = ardisik hata sayaci (basarida sifirlanir); lastSyncErrorCode = sanitize kod.

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "syncAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "lastSyncErrorCode" TEXT;

-- Worker uygun gonderi secimi: status taramasi + backoff/stale filtre-siralamasi.
CREATE INDEX IF NOT EXISTS "Shipment_status_nextSyncAt_idx" ON "Shipment"("status", "nextSyncAt");
CREATE INDEX IF NOT EXISTS "Shipment_status_lastSyncAt_idx" ON "Shipment"("status", "lastSyncAt");

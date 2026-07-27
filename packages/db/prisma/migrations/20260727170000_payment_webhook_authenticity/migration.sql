-- PB-1 (ADR-156/158) — Payment webhook authenticity & server-side store resolution.
-- Additive; mevcut veriye DOKUNMAZ (RESET YOK).
--
--  1) PaymentProviderConfig.webhookToken: public webhook URL kimlik parcasi (opak `whk_…`).
--     URL'de config cozer; YETKI vermez (yetki = HMAC imza). Nullable + unique.
--  2) PaymentAttempt (storeId, providerReference) index: webhook attempt'i DOGRULANMIS
--     provider reference'tan store-scoped cozer (client body.storeId/attemptId DEGIL).

ALTER TABLE "PaymentProviderConfig" ADD COLUMN "webhookToken" TEXT;

CREATE UNIQUE INDEX "PaymentProviderConfig_webhookToken_key" ON "PaymentProviderConfig"("webhookToken");

CREATE INDEX "PaymentAttempt_storeId_providerReference_idx" ON "PaymentAttempt"("storeId", "providerReference");

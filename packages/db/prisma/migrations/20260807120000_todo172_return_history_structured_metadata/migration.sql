-- TODO-172 (ADR-273) — ReturnStatusHistory yapısal audit alanları (additive).
-- Domain sorgusu (ör. son-90-gün hızlı iade sayımı) artık note içindeki JSON substring'e DEĞİL,
-- exact `eventType`'a dayanır. `metadata` yapısal payload (skippedSteps/amount/limit/reason/permission);
-- `note` insan-okur amaçlı kalır. Hepsi nullable → geri uyumlu (mevcut satırlar NULL).
-- YALNIZ ReturnStatusHistory'ye dokunur; ProductSearchDocument tsvector/GIN drift'i BİLİNÇLİ dahil edilmedi.
ALTER TABLE "ReturnStatusHistory" ADD COLUMN "eventType" TEXT;
ALTER TABLE "ReturnStatusHistory" ADD COLUMN "metadata" JSONB;
CREATE INDEX "ReturnStatusHistory_storeId_eventType_createdAt_idx" ON "ReturnStatusHistory"("storeId", "eventType", "createdAt");

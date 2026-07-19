-- TODO-155.2 (ADR-079 Ek) — Faz 2C-9B · Search Campaign Badge Snapshot.
-- TAMAMEN ADDITIVE + non-destructive:
--   * ProductSearchDocument'a 3 nullable kolon: campaign (jsonb), campaignStartsAt, campaignEndsAt
--   * INLINE VERI TASIMA YOK — mevcut dokumanlar runtime reindex/backfill (search-service) ile doldurulur.
-- campaign jsonb = PUBLIC-SAFE kampanya rozeti snapshot'i (PublicCampaignBadge; ic id/limit/priority SIZMAZ).
-- campaignStartsAt/EndsAt = kazanan kampanyanin GECERLILIK penceresi → read-time bastirma + reconciliation sweep.
-- Source-of-truth DEGIL (checkout fiyat otoritesi canli tablolardir); yalniz kart "Sepette" sunumu.
-- Mevcut kolonlar/veriler DEGISMEZ, SILINMEZ, SIFIRLANMAZ. Down migration yok (repo standardi). db push/reset YOK.
--
-- Uretim guvenligi: ADD COLUMN ... (nullable, DEFAULT yok) → metadata-only, tablo yeniden yazilmaz, kilit
-- maliyeti minimal. Index CREATE INDEX (CONCURRENTLY degil; migrate transaction icinde — dev/smoke olcegi).

-- AlterTable — TODO-155.2 campaign snapshot (hepsi nullable; eski satirlarda reindex'e kadar NULL kalir).
ALTER TABLE "ProductSearchDocument" ADD COLUMN "campaign" JSONB;
ALTER TABLE "ProductSearchDocument" ADD COLUMN "campaignStartsAt" TIMESTAMP(3);
ALTER TABLE "ProductSearchDocument" ADD COLUMN "campaignEndsAt" TIMESTAMP(3);

-- Reconciliation sweep: suresi gecmis kampanya snapshot'larini bounded taramak icin.
CREATE INDEX "ProductSearchDocument_storeId_campaignEndsAt_idx" ON "ProductSearchDocument"("storeId", "campaignEndsAt");

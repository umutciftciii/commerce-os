-- TODO-155.1 (ADR-079) — Faz 2C-9 · Search Listing Projection Enrichment.
-- TAMAMEN ADDITIVE + non-destructive:
--   * ProductSearchDocument'a 4 nullable kolon: compareAtMinor, discountPercent, omnibusPreviousPriceMinor, listing (jsonb)
--   * INLINE VERI TASIMA YOK — mevcut dokumanlar runtime reindex/backfill (search-service) ile doldurulur.
-- Bu kolonlar TURETILMIS kart projection'idir (source-of-truth DEGIL; checkout fiyat otoritesi canli tablolardir).
-- `listing` jsonb bounded kart medya/swatch snapshot'idir (IC storageKey'ler; public url runtime'da turetilir).
-- Mevcut kolonlar/veriler DEGISMEZ, SILINMEZ, SIFIRLANMAZ. Down migration yok (repo standardi). db push/reset YOK.
--
-- Uretim guvenligi: ADD COLUMN ... (nullable, DEFAULT yok) → metadata-only, tablo yeniden yazilmaz, kilit
-- maliyeti minimal. Tek migration transaction'inda calisir.

-- AlterTable — TODO-155.1 listing projection (hepsi nullable; eski satirlarda reindex'e kadar NULL kalir).
ALTER TABLE "ProductSearchDocument" ADD COLUMN "compareAtMinor" INTEGER;
ALTER TABLE "ProductSearchDocument" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "ProductSearchDocument" ADD COLUMN "omnibusPreviousPriceMinor" INTEGER;
ALTER TABLE "ProductSearchDocument" ADD COLUMN "listing" JSONB;

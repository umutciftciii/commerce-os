-- TODO-172 (ADR-273) — Fast Refund Controls (StoreSettings additive alanları).
-- Teslim alma + inceleme adımları atlanarak doğrudan para iadesi başlatan kontrollü akış.
-- Hepsi additive + geri uyumlu: mevcut store'larda özellik OTOMATİK AÇILMAZ (default kapalı).
--   * fastRefundEnabled=false (default): UI gizli + backend reddeder.
--   * fastRefundMaxAmountMinor NULL (default): hızlı iade KAPALI (sınırsız DEĞİL); limit set edilene
--     kadar aksiyon reddedilir.
--   * fastRefundCurrency NULL (default): limit sipariş para biriminde yorumlanır; set edilirse
--     sipariş para birimiyle birebir eşleşmeli.
-- NOT: fastRefundMaxAmountMinor şemadaki İLK BIGINT kolonudur (mevcut para alanları INTEGER minor-unit
-- konvansiyonu); serileştirme sınırında Number'a çevrilir. Bu migration YALNIZ StoreSettings'e dokunur;
-- ProductSearchDocument tsvector/GIN drift'i (Prisma datamodel'de temsil edilemez) BİLİNÇLİ dahil edilmedi.
ALTER TABLE "StoreSettings" ADD COLUMN "fastRefundEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSettings" ADD COLUMN "fastRefundMaxAmountMinor" BIGINT;
ALTER TABLE "StoreSettings" ADD COLUMN "fastRefundCurrency" TEXT;

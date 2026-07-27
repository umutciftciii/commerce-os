-- TODO-161A.1 (ADR-132) — Commercial Automation & Data Retention. ADDITIVE.
--
-- StoreSettings.timezone: settlement scheduler (weekly/monthly) donem sinirlarinin store-seviyesi
-- OTORITESI. NOT NULL + DEFAULT 'Europe/Istanbul' → mevcut satirlar guvenle backfill edilir, yeni
-- kolon degisikligi/enum YOK → sifir regresyon. Retention hedef tablolari (SponsoredProductEvent,
-- AttributionClick) ZATEN [storeId, createdAt] index'ine sahip → ek index YOK. QueueJobLog zaten
-- semada mevcut (job-run audit) → yeni tablo YOK.
--
-- `prisma migrate diff` bu semada ProductSearchDocument.searchVector icin SAHTE fark uretebilir
-- (ADR-079); bu migration el ile yazildi ve o BILINCLI olarak dahil EDILMEDI.

ALTER TABLE "StoreSettings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';

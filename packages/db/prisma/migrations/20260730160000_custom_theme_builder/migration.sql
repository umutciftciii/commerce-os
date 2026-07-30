-- TODO-164A (ADR-225/ADR-229) — Custom Theme Builder.
-- ADDITIVE + IMMUTABLE migration. Yalnız Theme'e nullable kimlik kolonları ekler:
--  - duplicatedFrom: kopyalama kaynağı tema id (kopya YENİ kimlik; history KOPYALANMAZ).
--  - createdBy / updatedBy: platform kullanıcı id (audit; PII taşımaz).
-- Hiçbir kolon düşürülmez/yeniden adlandırılmaz. Tümü nullable → mevcut satırlar
-- NULL kalır, hiçbir storefront görünümü değişmez (builder yalnız presentation).
-- Config veri modeli genişlemesi ThemeVersion.config JSON içinde yaşar → şema
-- değişikliği GEREKTİRMEZ (typed builder-config; migration'sız genişleme).

ALTER TABLE "Theme" ADD COLUMN "duplicatedFrom" TEXT;
ALTER TABLE "Theme" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "Theme" ADD COLUMN "updatedBy" TEXT;

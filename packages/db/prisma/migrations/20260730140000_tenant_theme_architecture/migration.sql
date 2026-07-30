-- TODO-164 (ADR-216…224) — Tenant Theme Architecture.
-- ADDITIVE + IMMUTABLE migration. Mevcut mağazaların GÖRÜNÜMÜ KORUNUR:
--  - Yeni kolonlar DEFAULT'lu (Theme.themeKey/layoutPreset = 'BASE_COMMERCE',
--    themeApiVersion = 1; ThemeVersion.config = '{}') → tüm mevcut satırlar
--    deterministik olarak BASE_COMMERCE'e backfill olur.
--  - Hiçbir kolon düşürülmez/yeniden adlandırılmaz; hiçbir storefront görünümü
--    deploy sonrası kaybolmaz (base theme = bugünkü token belgesi).
--  - status kolonu String'dir; INCOMPATIBLE/DISABLED değerleri şema değişikliği
--    GEREKTİRMEZ (yeni kolon eklenmez).

-- ── Theme: theme-key / layout preset / theme API sürümü ──────────────────────
ALTER TABLE "Theme" ADD COLUMN "themeKey" TEXT NOT NULL DEFAULT 'BASE_COMMERCE';
ALTER TABLE "Theme" ADD COLUMN "layoutPreset" TEXT NOT NULL DEFAULT 'BASE_COMMERCE';
ALTER TABLE "Theme" ADD COLUMN "themeApiVersion" INTEGER NOT NULL DEFAULT 1;

-- ── ThemeVersion: layout/slot config + snapshot + publishedBy ────────────────
ALTER TABLE "ThemeVersion" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ThemeVersion" ADD COLUMN "themeKey" TEXT;
ALTER TABLE "ThemeVersion" ADD COLUMN "layoutPreset" TEXT;
ALTER TABLE "ThemeVersion" ADD COLUMN "publishedBy" TEXT;

-- ── Deterministik backfill (savunma; DEFAULT zaten uygular) ───────────────────
-- Mevcut sürümlerin snapshot theme-key/layout preset alanları BASE_COMMERCE'e
-- sabitlenir (görünüm koruma; resolver yine config'ten okur).
UPDATE "ThemeVersion" SET "themeKey" = 'BASE_COMMERCE' WHERE "themeKey" IS NULL;
UPDATE "ThemeVersion" SET "layoutPreset" = 'BASE_COMMERCE' WHERE "layoutPreset" IS NULL;

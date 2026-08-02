-- TODO-166 (ADR-265) — Admin Slug & Redirect Management (TD-057 kapanisi).
-- ADDITIVE + geriye-uyumlu: mevcut redirect satirlari korunur (varsayilan AUTOMATIC).

-- 1) SlugEntityType += BRAND. Marka slug degisiminde SlugHistory + otomatik 301 bu tur uzerinden yazilir.
--    (Postgres: ADD VALUE idempotent degil → IF NOT EXISTS ile korunur.)
ALTER TYPE "SlugEntityType" ADD VALUE IF NOT EXISTS 'BRAND';

-- 2) Redirect kaynagi (otomatik slug-degisimi vs manuel Admin girisi).
DO $$ BEGIN
  CREATE TYPE "RedirectOrigin" AS ENUM ('AUTOMATIC', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Redirect.origin. Mevcut satirlar slug-degisiminden gelir → AUTOMATIC varsayilani dogru.
ALTER TABLE "Redirect" ADD COLUMN IF NOT EXISTS "origin" "RedirectOrigin" NOT NULL DEFAULT 'AUTOMATIC';

-- 4) Otomatik/manuel filtresi icin index (store-scoped).
CREATE INDEX IF NOT EXISTS "Redirect_storeId_origin_idx" ON "Redirect" ("storeId", "origin");

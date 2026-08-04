-- ADR-271 (Unified Session Policy) — ADDITIVE + BACKFILL + REPLAY-SAFE.
--
-- Iki oturum tablosuna (PlatformSession, CustomerSession) ortak iki-kapili omur
-- alanlari eklenir. Hicbir kolon repurpose/drop EDILMEZ; `expiresAt` korunur.
--
-- Guvenli-additive: bu migration, ayni paylasimli veritabanini kullanan
-- ADR-271-ONCESI (main-branch) uygulama surumleriyle AYNI ANDA calisabilir —
-- yeni kolonlarin hepsi ya DEFAULT'ludur ya da NULLABLE'dir; boylece eski kod
-- yolunun INSERT'leri (yeni kolonlari set etmeyen) kirilmaz.
--
-- `IF NOT EXISTS` ile REPLAY-SAFE (kismi uygulama/yeniden calistirma guvenli).

-- ── PlatformSession ─────────────────────────────────────────────────────────
ALTER TABLE "PlatformSession"
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "absoluteExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rememberMe" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rotatedFromSessionId" TEXT;

-- Backfill (dokumante edilmis yaklasim): mevcut satirlar icin idle capasini son
-- guncelleme zamanina, mutlak tavani mevcut absolute deadline'a (=expiresAt) esitle.
-- Sahte uzun omur URETILMEZ. Yalniz henuz set edilmemis (NULL) absolute'leri doldur.
UPDATE "PlatformSession"
  SET "absoluteExpiresAt" = "expiresAt"
  WHERE "absoluteExpiresAt" IS NULL;
UPDATE "PlatformSession"
  SET "lastActivityAt" = "updatedAt";

CREATE INDEX IF NOT EXISTS "PlatformSession_absoluteExpiresAt_idx"
  ON "PlatformSession"("absoluteExpiresAt");

-- ── CustomerSession ─────────────────────────────────────────────────────────
ALTER TABLE "CustomerSession"
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "absoluteExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rememberMe" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rotatedFromSessionId" TEXT;

UPDATE "CustomerSession"
  SET "absoluteExpiresAt" = "expiresAt"
  WHERE "absoluteExpiresAt" IS NULL;
UPDATE "CustomerSession"
  SET "lastActivityAt" = "updatedAt";

CREATE INDEX IF NOT EXISTS "CustomerSession_absoluteExpiresAt_idx"
  ON "CustomerSession"("absoluteExpiresAt");

-- ADR-271 + ADR-269 POST-AUDIT HARDENING — ADDITIVE · REPLAY-SAFE · LOCK-FRIENDLY.
--
-- Bu follow-up migration, UYGULANMIS ADR-271 (20260804160000_adr271_unified_session_policy)
-- migration'inin UZERINE biner; o dosyayi DEGISTIRMEZ (checksum drift YOK). Uc bagimsiz hardening:
--
--  (M1) Session legacy cutover — silent mass-logout onleme:
--       `policyVersion` eklenir. MEVCUT satirlar 0 = grandfathered (yalniz absolute tavan
--       uygulanir; idle-collapse YOK) → ilk ANLAMLI aktivitede uygulama kodu 1'e terfi eder
--       (taze idle penceresi o an baslar). YENI satirlar 1 = ADR-271-native (idle+absolute).
--       Kolon "fast default" (DEFAULT 0) ile eklenir: PG 11+ tabloyu REWRITE ETMEZ, kosulsuz
--       full-table UPDATE calismaz → M2 kilit sorunu olmadan mevcut oturumlar korunur.
--       Ardindan DEFAULT 1'e cevrilir; boylece bu migration'dan SONRA acilan oturumlar
--       otomatik native olur. Deploy aninda mevcut aktif kullanicilar LOGOUT OLMAZ; eski
--       oturum mevcut absolute expiry'sini ASMAZ; migration sinirsiz/yeni omur URETMEZ.
--
--  (M3) Kullanilmayan `absoluteExpiresAt` index'leri kaldirilir — hicbir sweep/range sorgusu
--       kullanmiyor (gecerlilik per-row tokenHash lookup ile okunur; sweep worker yok).
--
--  (R1) `RefundIntent.cancelledAt` / `cancellationReason` — refund'suz terminal iade'de
--       (REJECTED / CANCELLED_BY_CUSTOMER / EXPIRED / CLOSED-finansalsiz) PENDING intent AYNI
--       tx'te CANCELLED yapilirken iptal izi. Intent SILINMEZ (append-only finansal iz).
--
-- `IF NOT EXISTS` / `IF EXISTS` ile REPLAY-SAFE (kismi uygulama / yeniden calistirma guvenli).

-- ── M1/M2: Session legacy cutover marker (fast-default; NO table rewrite, NO mass UPDATE) ──
ALTER TABLE "PlatformSession" ADD COLUMN IF NOT EXISTS "policyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSession" ALTER COLUMN "policyVersion" SET DEFAULT 1;

ALTER TABLE "CustomerSession" ADD COLUMN IF NOT EXISTS "policyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerSession" ALTER COLUMN "policyVersion" SET DEFAULT 1;

-- ── M3: dead index drop (unused; hicbir range/sweep sorgusu absoluteExpiresAt'e dokunmuyor) ──
DROP INDEX IF EXISTS "PlatformSession_absoluteExpiresAt_idx";
DROP INDEX IF EXISTS "CustomerSession_absoluteExpiresAt_idx";

-- ── R1: refund intent cancellation trail (additive nullable) ──
ALTER TABLE "RefundIntent" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "RefundIntent" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

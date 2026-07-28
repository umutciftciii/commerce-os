-- H-3 (ADR-187…193) — Reservation Expiry & Orphan Draft Cleanup
-- Additive migration: lifecycle EXPIRED state, SALE_COMMIT movement, releaseReason audit,
-- sweeper/read-time indexes, active-per-line unique guard, güvenli backfill (quarantine).
-- Immutable: uydurma terminal status yazılmaz; onHand geriye dönük DÜŞÜRÜLMEZ.

-- 1) Lifecycle enum: EXPIRED (TTL süpürücü tarafından bırakılan). Yeni değer bu migration içinde
--    KULLANILMAZ (yalnız ileride yazılır) → transaction güvenli.
ALTER TYPE "InventoryReservationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- 2) Movement tipi: SALE_COMMIT (ödeme başarıyla satışa commit → onHand+reserved birlikte düşer).
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'SALE_COMMIT';

-- 3) Release/expire nedeni (audit; PII taşımaz).
ALTER TABLE "InventoryReservation" ADD COLUMN IF NOT EXISTS "releaseReason" TEXT;

-- 4) Süpürücü aday sorgusu + read-time expiry add-back indexleri.
CREATE INDEX IF NOT EXISTS "InventoryReservation_storeId_status_expiresAt_idx"
  ON "InventoryReservation"("storeId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "InventoryReservation_variantId_status_expiresAt_idx"
  ON "InventoryReservation"("variantId", "status", "expiresAt");

-- 5) Duplicate-guard: sipariş satırı başına en fazla BİR ACTIVE rezervasyon (yarış/duplicate önler).
--    Partial unique — Prisma şemasıyla ifade edilemez, DB-seviyesi invariant (recently-viewed deseni).
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReservation_orderLineId_active_key"
  ON "InventoryReservation"("orderLineId") WHERE "status" = 'ACTIVE';

-- 6) Backfill (immutable; apply-anındaki now()). Yalnız AÇIK stok-kilitlenmesi vakası kısa grace ile
--    quarantine edilir → süpürücü kaldırır. PAID/AUTHORIZED/CONFIRMED/FULFILLED ACTIVE rezervasyonlar
--    MEŞRU tutulur (expiresAt NULL kalır; süpürücü asla dokunmaz; reconciliation izler). Belirsiz
--    drift vakaları (CANCELLED/REFUNDED + ACTIVE) burada DEĞİŞTİRİLMEZ → reconciliation raporlar.
UPDATE "InventoryReservation" r
SET "expiresAt" = now() + interval '30 minutes'
FROM "Order" o
WHERE r."orderId" = o."id"
  AND r."status" = 'ACTIVE'
  AND r."expiresAt" IS NULL
  AND o."status" IN ('DRAFT', 'PLACED')
  AND o."paymentStatus" IN ('UNPAID', 'PAYMENT_PENDING', 'PAYMENT_FAILED');

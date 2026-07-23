-- TODO-159F (ADR-095..099) — Order Payment Recovery & Collection.
-- ADDITIVE-only: mevcut değeri silmez/yeniden adlandırmaz. Eski attempt'ler
-- type=ONLINE default'u ile doğru kalır; yeni sütunlar nullable.

-- AlterEnum (PaymentStatus): genişletilmiş ödeme durum makinesi.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterEnum (PaymentProviderEventType): recovery olay tipleri (ONLINE, provider'lı).
ALTER TYPE "PaymentProviderEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_LINK_CREATED';
ALTER TYPE "PaymentProviderEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_LINK_REGENERATED';
ALTER TYPE "PaymentProviderEventType" ADD VALUE IF NOT EXISTS 'PAYMENT_LINK_EMAILED';

-- CreateEnum (yeni tipler; aynı işlemde kullanılabilir).
CREATE TYPE "PaymentAttemptType" AS ENUM ('ONLINE', 'MANUAL');
CREATE TYPE "PaymentManualMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'POS', 'OTHER');

-- AlterTable (PaymentAttempt): MANUAL desteği + idempotency + link alanları.
-- FK'yi Restrict → SetNull'a çevir (config silinirse attempt kaybolmasın).
ALTER TABLE "PaymentAttempt" DROP CONSTRAINT "PaymentAttempt_providerConfigId_fkey";

ALTER TABLE "PaymentAttempt" ALTER COLUMN "providerConfigId" DROP NOT NULL;
ALTER TABLE "PaymentAttempt" ALTER COLUMN "provider" DROP NOT NULL;
ALTER TABLE "PaymentAttempt" ALTER COLUMN "mode" DROP NOT NULL;

ALTER TABLE "PaymentAttempt" ADD COLUMN "type" "PaymentAttemptType" NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "PaymentAttempt" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "PaymentAttempt" ADD COLUMN "initiatedBy" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "paymentUrl" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "manualMethod" "PaymentManualMethod";
ALTER TABLE "PaymentAttempt" ADD COLUMN "manualReference" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "manualNote" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "collectedAt" TIMESTAMP(3);

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_providerConfigId_fkey"
  FOREIGN KEY ("providerConfigId") REFERENCES "PaymentProviderConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotency: aynı sipariş/store için çift ödeme oturumu koruması.
-- Postgres NULL'ları ayrı sayar → idempotencyKey'i olmayan eski attempt'ler çakışmaz.
CREATE UNIQUE INDEX "payment_attempt_store_idempotency_key"
  ON "PaymentAttempt"("storeId", "idempotencyKey");

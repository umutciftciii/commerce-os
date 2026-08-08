-- TODO-175 (ADR-285/286) — Refund Destination Choice.
-- Müşteri iade/iptalinde geri ödemenin orijinal ödeme yöntemine mi shopping balance'a mı
-- gideceğini seçebilir. STORE_CREDIT değeri asla cash/PSP'ye dönmez; external-paid uygun tutar
-- gönüllü olarak shopping balance'a yönlendirilebilir. Refund-origin credit NON-EXPIRING.
-- Tümü additive; mevcut satırlar korunur (backfill YOK).

-- 1) Yeni enum: refund hedefi (yalnız external-origin bileşeni yönetir).
CREATE TYPE "RefundDestination" AS ENUM ('ORIGINAL_PAYMENT', 'SHOPPING_BALANCE');

-- 2) Mevcut enum genişletmeleri (additive). Kullanım aynı migration'da yok (PG12+ tx-safe).
ALTER TYPE "ReturnResolutionType" ADD VALUE 'REFUND' BEFORE 'REFUND_TO_ORIGINAL_PAYMENT';
ALTER TYPE "RefundExecutionMode" ADD VALUE 'INTERNAL_CREDIT';
ALTER TYPE "CreditSourceType" ADD VALUE 'ORDER_RETURN';
ALTER TYPE "CreditLedgerType" ADD VALUE 'RETURN_CREDIT_RESTORE';

-- 3) Store credit lot expiry artık nullable (null = non-expiring, refund-origin credit).
ALTER TABLE "CustomerCreditLot" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- 4) ReturnRequest: IMMUTABLE müşteri refund hedefi snapshot'ı (REFUND çözümünde set; REPLACEMENT null).
ALTER TABLE "ReturnRequest" ADD COLUMN "refundDestination" "RefundDestination";
ALTER TABLE "ReturnRequest" ADD COLUMN "refundDestinationSelectedBy" "ReturnActorType";
ALTER TABLE "ReturnRequest" ADD COLUMN "refundDestinationSelectedAt" TIMESTAMP(3);

-- 5) OrderRefund: external legin hedefi (ORIGINAL_PAYMENT: PSP; SHOPPING_BALANCE: INTERNAL_CREDIT).
ALTER TABLE "OrderRefund" ADD COLUMN "refundDestination" "RefundDestination";

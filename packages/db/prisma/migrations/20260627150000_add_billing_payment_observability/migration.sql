-- F3B.2 billing + payment observability.
-- Order'a fatura kimlik/vergi alanlari; PaymentAttempt'e turetilmis guvenli kart
-- alanlari (marka/son4) + taksit + paid/failed zaman damgalari. Full PAN/CVC ASLA
-- saklanmaz. Fatura ADRESI mevcut OrderAddress(type=BILLING) kaydinda tutulur.

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billingType" "BillingType",
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingTaxId" TEXT,
ADD COLUMN     "billingCompanyName" TEXT,
ADD COLUMN     "billingTaxOffice" TEXT,
ADD COLUMN     "billingTaxNumber" TEXT,
ADD COLUMN     "billingEmail" TEXT;

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "installmentCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3);

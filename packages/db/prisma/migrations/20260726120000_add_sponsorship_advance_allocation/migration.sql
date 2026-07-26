-- TODO-161B (ADR-128/129) — Sponsorship unified commercial flow. ADDITIVE.
--
-- 1) SponsorshipAgreement: onay metası (approvedAt/approvedByUserId) — ADDITIVE nullable kolon.
-- 2) SponsorshipAdvanceAllocation: APPEND-ONLY avans mahsup defteri (yeni tablo).
--
-- Yeni ENUM yok, mevcut kolon değişikliği yok → sıfır regresyon. `prisma migrate diff` bu
-- şemada ProductSearchDocument.searchVector için SAHTE bir fark üretebilir (ADR-079); el ile
-- yazıldığı için o BILINÇLI olarak dahil EDİLMEMİŞTİR.

-- AlterTable — anlaşma onay metası
ALTER TABLE "SponsorshipAgreement" ADD COLUMN     "approvedAt" TIMESTAMP(3);
ALTER TABLE "SponsorshipAgreement" ADD COLUMN     "approvedByUserId" TEXT;

-- CreateTable — avans mahsup defteri
CREATE TABLE "SponsorshipAdvanceAllocation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "advancePaymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "recordedByUserId" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorshipAdvanceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipAdvanceAllocation_reversalOfId_key" ON "SponsorshipAdvanceAllocation"("reversalOfId");
CREATE UNIQUE INDEX "SponsorshipAdvanceAllocation_storeId_idempotencyKey_key" ON "SponsorshipAdvanceAllocation"("storeId", "idempotencyKey");
CREATE INDEX "SponsorshipAdvanceAllocation_storeId_idx" ON "SponsorshipAdvanceAllocation"("storeId");
CREATE INDEX "SponsorshipAdvanceAllocation_storeId_agreementId_idx" ON "SponsorshipAdvanceAllocation"("storeId", "agreementId");
CREATE INDEX "SponsorshipAdvanceAllocation_advancePaymentId_idx" ON "SponsorshipAdvanceAllocation"("advancePaymentId");
CREATE INDEX "SponsorshipAdvanceAllocation_chargeId_idx" ON "SponsorshipAdvanceAllocation"("chargeId");

-- AddForeignKey
ALTER TABLE "SponsorshipAdvanceAllocation" ADD CONSTRAINT "SponsorshipAdvanceAllocation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SponsorshipAdvanceAllocation" ADD CONSTRAINT "SponsorshipAdvanceAllocation_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorshipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SponsorshipAdvanceAllocation" ADD CONSTRAINT "SponsorshipAdvanceAllocation_advancePaymentId_fkey" FOREIGN KEY ("advancePaymentId") REFERENCES "SponsorshipPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SponsorshipAdvanceAllocation" ADD CONSTRAINT "SponsorshipAdvanceAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "SponsorshipCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SponsorshipAdvanceAllocation" ADD CONSTRAINT "SponsorshipAdvanceAllocation_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SponsorshipAdvanceAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

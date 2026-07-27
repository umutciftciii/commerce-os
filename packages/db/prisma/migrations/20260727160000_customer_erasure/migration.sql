-- TD-131 (ADR-149…155) — Customer Data Erasure Workflow (ADDITIVE).
-- Yalnızca yeni CustomerStatus.ERASED değeri + Customer erasure audit kolonları.
-- Mevcut veriye DOKUNMAZ; geri uyumlu (kolonlar nullable).

-- AlterEnum
ALTER TYPE "CustomerStatus" ADD VALUE 'ERASED';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "erasedAt" TIMESTAMP(3),
ADD COLUMN     "erasedByUserId" TEXT,
ADD COLUMN     "eraseReason" TEXT;

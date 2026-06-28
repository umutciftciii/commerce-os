-- TODO-087 store-admin customer creation + credential management (ADR-035).
-- Admin tetikli aktivasyon/parola-sifirlama token'i. Plain token ASLA saklanmaz;
-- yalnizca sha256 tokenHash (SESSION_SECRET ile). Raw token yalniz uretim
-- response'unda tek seferlik doner. Tek seferlik tuketim: consumedAt.

-- CreateEnum
CREATE TYPE "CustomerCredentialTokenPurpose" AS ENUM ('ADMIN_ACTIVATION', 'ADMIN_PASSWORD_RESET');

-- CreateTable
CREATE TABLE "CustomerCredentialToken" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "purpose" "CustomerCredentialTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCredentialToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCredentialToken_tokenHash_key" ON "CustomerCredentialToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerCredentialToken_storeId_idx" ON "CustomerCredentialToken"("storeId");

-- CreateIndex
CREATE INDEX "CustomerCredentialToken_customerId_idx" ON "CustomerCredentialToken"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCredentialToken_expiresAt_idx" ON "CustomerCredentialToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerCredentialToken" ADD CONSTRAINT "CustomerCredentialToken_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredentialToken" ADD CONSTRAINT "CustomerCredentialToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

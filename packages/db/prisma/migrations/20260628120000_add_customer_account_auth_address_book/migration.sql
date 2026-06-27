-- F3B.3 storefront customer account auth + address book foundation (ADR-032).
-- Tek musteri kavrami: mevcut store-scoped Customer hem CRM hem storefront uyelik
-- hesabidir. Auth/profil alanlari Customer'a; sifre/session/otp/iban/iletisim
-- tercihi alt tablolara eklenir. Plain sifre/OTP ASLA saklanmaz (yalnizca hash).
-- TCKN/VKN/IBAN response'ta maskeli, log/event metadata'ya yazilmaz.

-- AlterEnum
ALTER TYPE "CustomerStatus" ADD VALUE 'PASSIVE';
ALTER TYPE "CustomerStatus" ADD VALUE 'BLOCKED';

-- CreateEnum
CREATE TYPE "CustomerGender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerOtpPurpose" AS ENUM ('REGISTER', 'LOGIN', 'VERIFY_CONTACT');

-- CreateEnum
CREATE TYPE "CustomerOtpChannel" AS ENUM ('EMAIL', 'SMS');

-- AlterTable: Customer auth/profil alanlari + email nullable (GSM-only kayit)
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "gender" "CustomerGender",
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable: CustomerAddress defter + fatura alanlari + soft delete
ALTER TABLE "CustomerAddress" ALTER COLUMN "type" SET DEFAULT 'SHIPPING',
ALTER COLUMN "countryCode" SET DEFAULT 'TR',
ADD COLUMN     "addressName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingType" "BillingType",
ADD COLUMN     "tckn" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "taxOffice" TEXT,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerCredential" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOtpVerification" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "purpose" "CustomerOtpPurpose" NOT NULL,
    "channel" "CustomerOtpChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOtpVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIban" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerIban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCommunicationPreference" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "phoneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCredential_customerId_key" ON "CustomerCredential"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCredential_storeId_idx" ON "CustomerCredential"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_storeId_idx" ON "CustomerSession"("storeId");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

-- CreateIndex
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerOtpVerification_storeId_idx" ON "CustomerOtpVerification"("storeId");

-- CreateIndex
CREATE INDEX "CustomerOtpVerification_customerId_idx" ON "CustomerOtpVerification"("customerId");

-- CreateIndex
CREATE INDEX "CustomerOtpVerification_expiresAt_idx" ON "CustomerOtpVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerIban_storeId_idx" ON "CustomerIban"("storeId");

-- CreateIndex
CREATE INDEX "CustomerIban_customerId_idx" ON "CustomerIban"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCommunicationPreference_customerId_key" ON "CustomerCommunicationPreference"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCommunicationPreference_storeId_idx" ON "CustomerCommunicationPreference"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");

-- AddForeignKey
ALTER TABLE "CustomerCredential" ADD CONSTRAINT "CustomerCredential_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredential" ADD CONSTRAINT "CustomerCredential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOtpVerification" ADD CONSTRAINT "CustomerOtpVerification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOtpVerification" ADD CONSTRAINT "CustomerOtpVerification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIban" ADD CONSTRAINT "CustomerIban_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIban" ADD CONSTRAINT "CustomerIban_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunicationPreference" ADD CONSTRAINT "CustomerCommunicationPreference_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunicationPreference" ADD CONSTRAINT "CustomerCommunicationPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

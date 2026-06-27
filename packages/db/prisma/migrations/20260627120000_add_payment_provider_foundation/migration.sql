-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('MOCK', 'IYZICO', 'STRIPE', 'PAYTR', 'GENERIC_REDIRECT');

-- CreateEnum
CREATE TYPE "PaymentProviderMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY', 'PAYMENT_LINK');

-- CreateEnum
CREATE TYPE "PaymentProviderStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ThreeDsMode" AS ENUM ('DISABLED', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProviderEventType" AS ENUM ('PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_REFUNDED', 'WEBHOOK_RECEIVED', 'CONNECTION_TEST', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "PaymentProviderConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "PaymentProviderStatus" NOT NULL DEFAULT 'DISABLED',
    "mode" "PaymentProviderMode" NOT NULL DEFAULT 'TEST',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "supportedMethods" "PaymentMethodType"[],
    "supportedCurrencies" TEXT[],
    "minAmount" INTEGER,
    "maxAmount" INTEGER,
    "threeDsMode" "ThreeDsMode" NOT NULL DEFAULT 'DISABLED',
    "installmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "merchantId" TEXT,
    "callbackUrl" TEXT,
    "apiKeyCipher" TEXT,
    "secretKeyCipher" TEXT,
    "webhookSecretCipher" TEXT,
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "mode" "PaymentProviderMode" NOT NULL,
    "method" "PaymentMethodType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "threeDsApplied" BOOLEAN NOT NULL DEFAULT false,
    "scenario" TEXT,
    "providerReference" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "accessTokenHash" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "providerConfigId" TEXT,
    "attemptId" TEXT,
    "orderId" TEXT,
    "provider" "PaymentProviderType" NOT NULL,
    "type" "PaymentProviderEventType" NOT NULL,
    "eventId" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProviderConfig_storeId_idx" ON "PaymentProviderConfig"("storeId");

-- CreateIndex
CREATE INDEX "PaymentProviderConfig_storeId_status_idx" ON "PaymentProviderConfig"("storeId", "status");

-- CreateIndex
CREATE INDEX "PaymentProviderConfig_storeId_priority_idx" ON "PaymentProviderConfig"("storeId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfig_storeId_provider_mode_key" ON "PaymentProviderConfig"("storeId", "provider", "mode");

-- CreateIndex
CREATE INDEX "PaymentAttempt_storeId_idx" ON "PaymentAttempt"("storeId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_providerConfigId_idx" ON "PaymentAttempt"("providerConfigId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_idx" ON "PaymentAttempt"("status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_accessTokenHash_idx" ON "PaymentAttempt"("accessTokenHash");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_storeId_idx" ON "PaymentProviderEvent"("storeId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_providerConfigId_idx" ON "PaymentProviderEvent"("providerConfigId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_attemptId_idx" ON "PaymentProviderEvent"("attemptId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_orderId_idx" ON "PaymentProviderEvent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_type_idx" ON "PaymentProviderEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_event_unique_external_event" ON "PaymentProviderEvent"("storeId", "provider", "eventId");

-- AddForeignKey
ALTER TABLE "PaymentProviderConfig" ADD CONSTRAINT "PaymentProviderConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "PaymentProviderConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "PaymentProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

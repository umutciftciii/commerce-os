-- CreateEnum
CREATE TYPE "StoreUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuditActorKind" AS ENUM ('PLATFORM_USER', 'STORE_USER');

-- AlterEnum
ALTER TYPE "CreditActorType" ADD VALUE 'STORE_USER';

-- DropForeignKey
ALTER TABLE "StoreUser" DROP CONSTRAINT "StoreUser_userId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "actorKind" "AuditActorKind",
ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "actorStoreUserId" TEXT;

-- AlterTable
ALTER TABLE "StoreUser" ADD COLUMN     "email" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "status" "StoreUserStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StoreUserSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "absoluteExpiresAt" TIMESTAMP(3),
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "rotatedFromSessionId" TEXT,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "impersonatedByPlatformUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreUserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreUserSession_tokenHash_key" ON "StoreUserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StoreUserSession_storeUserId_idx" ON "StoreUserSession"("storeUserId");

-- CreateIndex
CREATE INDEX "StoreUserSession_storeId_idx" ON "StoreUserSession"("storeId");

-- CreateIndex
CREATE INDEX "StoreUserSession_expiresAt_idx" ON "StoreUserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorStoreUserId_idx" ON "AuditLog"("actorStoreUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreUser_storeId_email_key" ON "StoreUser"("storeId", "email");

-- AddForeignKey
ALTER TABLE "StoreUser" ADD CONSTRAINT "StoreUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreUserSession" ADD CONSTRAINT "StoreUserSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreUserSession" ADD CONSTRAINT "StoreUserSession_storeUserId_fkey" FOREIGN KEY ("storeUserId") REFERENCES "StoreUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorStoreUserId_fkey" FOREIGN KEY ("actorStoreUserId") REFERENCES "StoreUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


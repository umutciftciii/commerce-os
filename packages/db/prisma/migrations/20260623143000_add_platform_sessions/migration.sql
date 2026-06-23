-- Add platform admin session storage. Raw tokens are never stored; only tokenHash is persisted.
CREATE TABLE "PlatformSession" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");
CREATE INDEX "PlatformSession_platformUserId_idx" ON "PlatformSession"("platformUserId");
CREATE INDEX "PlatformSession_expiresAt_idx" ON "PlatformSession"("expiresAt");

ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_platformUserId_fkey"
  FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

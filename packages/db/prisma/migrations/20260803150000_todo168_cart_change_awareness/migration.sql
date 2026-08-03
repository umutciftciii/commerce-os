-- TODO-168 (ADR-267) — Cart Change Awareness.
--
-- Additive-only: CartLine'a nullable REFERANS snapshot kolonlari + CartChangeAck
-- (cross-device ack) + CartChangeEvent (best-effort analytics). Mevcut veriye
-- DOKUNULMAZ; drop/delete/backfill YOK. Snapshot'siz mevcut satirlar ilk guvenilir
-- resolve'da baseline kazanir (sahte gecmis uretilmez). Snapshot ASLA siparis fiyati
-- degildir — yalniz degisiklik aciklama referansi (siparis her zaman taze server fiyati).

-- CartLine snapshot kolonlari (hepsi nullable; add/replace veya ilk-resolve baseline).
ALTER TABLE "CartLine" ADD COLUMN "addedUnitPriceMinor" INTEGER;
ALTER TABLE "CartLine" ADD COLUMN "addedListPriceMinor" INTEGER;
ALTER TABLE "CartLine" ADD COLUMN "addedDiscountedUnitPriceMinor" INTEGER;
ALTER TABLE "CartLine" ADD COLUMN "addedCurrency" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "addedInStock" BOOLEAN;
ALTER TABLE "CartLine" ADD COLUMN "addedOrderable" BOOLEAN;
ALTER TABLE "CartLine" ADD COLUMN "addedAt" TIMESTAMP(3);

-- CreateTable: per-fingerprint cross-device acknowledgement.
CREATE TABLE "CartChangeAck" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "cartLineId" TEXT,
    "customerId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartChangeAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable: best-effort analytics/audit (KVKK-hash kimlik; FK-minimal; dedupeKey idempotent).
CREATE TABLE "CartChangeEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cartIdHash" TEXT NOT NULL,
    "customerIdHash" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "changeType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT,
    "oldMinor" INTEGER,
    "newMinor" INTEGER,
    "currency" TEXT,
    "fingerprint" TEXT NOT NULL,
    "placement" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartChangeAck_cartId_fingerprint_key" ON "CartChangeAck"("cartId", "fingerprint");
CREATE INDEX "CartChangeAck_storeId_cartId_idx" ON "CartChangeAck"("storeId", "cartId");

CREATE UNIQUE INDEX "CartChangeEvent_storeId_dedupeKey_key" ON "CartChangeEvent"("storeId", "dedupeKey");
CREATE INDEX "CartChangeEvent_storeId_occurredAt_idx" ON "CartChangeEvent"("storeId", "occurredAt");
CREATE INDEX "CartChangeEvent_storeId_changeType_occurredAt_idx" ON "CartChangeEvent"("storeId", "changeType", "occurredAt");
CREATE INDEX "CartChangeEvent_storeId_cartIdHash_occurredAt_idx" ON "CartChangeEvent"("storeId", "cartIdHash", "occurredAt");

-- AddForeignKey
ALTER TABLE "CartChangeAck" ADD CONSTRAINT "CartChangeAck_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartChangeAck" ADD CONSTRAINT "CartChangeAck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartChangeEvent" ADD CONSTRAINT "CartChangeEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

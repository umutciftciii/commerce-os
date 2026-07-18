-- TODO-152 (ADR-076) — Warehouse-Aware Inventory Engine.
-- TAMAMEN ADDITIVE + non-destructive:
--   * yeni enum WarehouseStatus / InventoryAdjustmentField / InventoryAdjustmentSource
--   * yeni tablo Warehouse (store-scoped depo; store başına bir DEFAULT)
--   * yeni tablo InventoryBalance (variant × warehouse stok özeti; available TÜRETİLİR, kolon yok)
--   * yeni tablo InventoryAdjustment (append-only stok düzeltme defteri; batchId gruplu)
--   * deterministik + idempotent backfill: store başına 1 default depo + her InventoryItem için
--     default-depo InventoryBalance (onHand/reserved BİREBİR kopyalanır; yeni alanlar 0).
-- Mevcut InventoryItem/InventoryMovement/InventoryReservation DEĞİŞMEZ, SİLİNMEZ, SIFIRLANMAZ.
-- InventoryItem default-depo için onHand/reserved OTORİTESİ olmaya devam eder (checkout/storefront
-- sıfır regresyon). Down migration yok (repo standardı). db push / drop / reset YOK.

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InventoryAdjustmentField" AS ENUM ('ON_HAND', 'INCOMING', 'SAFETY_STOCK', 'REORDER_POINT');

-- CreateEnum
CREATE TYPE "InventoryAdjustmentSource" AS ENUM ('MANUAL_EDIT', 'BULK_OPERATION', 'ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_COMMIT', 'IMPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "city" TEXT,
    "district" TEXT,
    "line1" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "field" "InventoryAdjustmentField" NOT NULL,
    "oldValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "source" "InventoryAdjustmentSource" NOT NULL,
    "batchId" TEXT NOT NULL,
    "changedByPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_storeId_code_key" ON "Warehouse"("storeId", "code");

-- CreateIndex
CREATE INDEX "Warehouse_storeId_idx" ON "Warehouse"("storeId");

-- CreateIndex
CREATE INDEX "Warehouse_storeId_status_idx" ON "Warehouse"("storeId", "status");

-- NOT: "store başına tek DEFAULT depo" bu fazda backfill/seed determinizmi (store başına yalnız bir
-- `wh_default_${storeId}` üretilir) + uygulama katmanı (warehouse set-default CRUD KAPSAM DIŞI, TD-047)
-- ile garanti edilir. Partial unique index (`WHERE isDefault`) schema.prisma'da ifade EDİLEMEDİĞİ için
-- (drift önleme) bilinçle EKLENMEDİ; çoklu-depo CRUD gelince DB-seviyesi garanti o fazda değerlendirilir.

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_warehouseId_variantId_key" ON "InventoryBalance"("warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "InventoryBalance_storeId_idx" ON "InventoryBalance"("storeId");

-- CreateIndex
CREATE INDEX "InventoryBalance_variantId_idx" ON "InventoryBalance"("variantId");

-- CreateIndex
CREATE INDEX "InventoryBalance_storeId_warehouseId_idx" ON "InventoryBalance"("storeId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeId_idx" ON "InventoryAdjustment"("storeId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_warehouseId_idx" ON "InventoryAdjustment"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_productId_idx" ON "InventoryAdjustment"("productId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_variantId_idx" ON "InventoryAdjustment"("variantId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_batchId_idx" ON "InventoryAdjustment"("batchId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeId_variantId_createdAt_idx" ON "InventoryAdjustment"("storeId", "variantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL (TODO-152 / ADR-076) — deterministik + idempotent + non-destructive.
--
-- 1) Her store için bir DEFAULT depo. Deterministik id ('wh_default_' || storeId) →
--    re-run'da ON CONFLICT DO NOTHING (Warehouse_pkey) mevcut satırı EZMEZ. code='DEFAULT'
--    (storeId+code unique ile uyumlu). isDefault=true; store başına tek default backfill
--    determinizmiyle garanti (deterministik id → store başına yalnız bir default satır).
INSERT INTO "Warehouse" ("id", "storeId", "code", "name", "status", "isDefault", "priority", "createdAt", "updatedAt")
SELECT 'wh_default_' || s."id", s."id", 'DEFAULT', 'Ana Depo', 'ACTIVE', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Store" AS s
ON CONFLICT ("id") DO NOTHING;

-- 2) Her mevcut InventoryItem için default-depo InventoryBalance. onHand/reserved BİREBİR kopyalanır;
--    incoming/safetyStock/reorderPoint = 0 (mevcut davranış korunur). Deterministik id
--    ('ib_' || InventoryItem.id) → re-run güvenli. Depo bulunamayan store atlanır (INNER JOIN).
--    Mevcut bir balance varsa (warehouseId+variantId unique) ON CONFLICT DO NOTHING → EZMEZ.
INSERT INTO "InventoryBalance" ("id", "storeId", "warehouseId", "variantId", "onHand", "reserved", "incoming", "safetyStock", "reorderPoint", "createdAt", "updatedAt")
SELECT 'ib_' || ii."id", ii."storeId", w."id", ii."variantId", ii."quantityOnHand", ii."quantityReserved", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryItem" AS ii
JOIN "Warehouse" AS w ON w."storeId" = ii."storeId" AND w."isDefault" = true
ON CONFLICT ("warehouseId", "variantId") DO NOTHING;

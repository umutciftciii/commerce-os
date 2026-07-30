-- TODO-163 (ADR-208) — Tenant Module & Capability Management (ADDITIVE).
-- Yalniz yeni StoreModuleState enum + StoreModule tablosu + index'ler + Store FK.
-- Mevcut veriye/tablolara DOKUNMAZ. Satir yoksa modul INHERIT kabul edilir → effective
-- durum plan defaultuna, o da yoksa registry baseline'ina duser (geriye uyumlu; regresyon yok).

-- CreateEnum
CREATE TYPE "StoreModuleState" AS ENUM ('INHERIT', 'ENABLED', 'DISABLED');

-- CreateTable
CREATE TABLE "StoreModule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "state" "StoreModuleState" NOT NULL DEFAULT 'INHERIT',
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreModule_storeId_idx" ON "StoreModule"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreModule_storeId_moduleKey_key" ON "StoreModule"("storeId", "moduleKey");

-- AddForeignKey
ALTER TABLE "StoreModule" ADD CONSTRAINT "StoreModule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

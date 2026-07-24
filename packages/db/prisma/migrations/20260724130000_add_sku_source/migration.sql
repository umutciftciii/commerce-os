-- TODO-160A (ADR-110) — SKU Generation & Governance: skuSource kaynak alanı.
--
-- ADDITIVE-only: yeni "SkuSource" enum + ProductVariant.skuSource kolonu (NOT NULL DEFAULT 'MANUAL').
-- Mevcut veriye GÜVENLİ: tüm mevcut varyantlar 'MANUAL' varsayılanını alır (en güvenli — otomatik
-- SKU regenerate onları EZMEZ; manuel koruması devrede sayılır). Mevcut `sku` kolonu ve
-- `ProductVariant_storeId_sku_key` unique index'i DEĞİŞTİRİLMEZ (benzersizlik temeli korunur).
-- Barcode'a DOKUNULMAZ (SKU ile ayrı kavram).

-- CreateEnum
CREATE TYPE "SkuSource" AS ENUM ('AUTO', 'MANUAL', 'IMPORTED');

-- AlterTable (additive, güvenli default)
ALTER TABLE "ProductVariant" ADD COLUMN "skuSource" "SkuSource" NOT NULL DEFAULT 'MANUAL';

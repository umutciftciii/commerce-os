-- TODO-152A (ADR-076 devamı) — lowStockThreshold → reorderPoint GÜVENLİ/İDEMPOTENT BACKFILL.
--
-- Bağlam: Stok eşiği artık tek authority olan InventoryBalance.reorderPoint'tir. Legacy
-- InventoryItem.lowStockThreshold ARTIK YAZILMIYOR (variant modalı + gateway create/update kaldırıldı)
-- ve hiçbir runtime karar okuması kalmadı (dashboard KPI + global ekran reorderPoint'e geçti). Var olan
-- eşik sinyalini KAYBETMEMEK için, mevcut eşikler tek seferlik reorderPoint'e taşınır.
--
-- Kurallar:
--   * Yalnız DEFAULT depo bakiyesi (legacy köprünün eşleştiği tek depo).
--   * Yalnız reorderPoint HÂLÂ 0 iken (manuel girilmiş reorderPoint değerlerini ASLA ezmez).
--   * Yalnız anlamlı eşik (lowStockThreshold IS NOT NULL AND > 0).
--   * Idempotent: ikinci çalıştırma reorderPoint>0 satırlarına dokunmaz.
--   * Additive: lowStockThreshold kolonu DROP EDİLMEZ (dormant legacy read-model; non-destructive).
UPDATE "InventoryBalance" AS ib
SET "reorderPoint" = ii."lowStockThreshold",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "InventoryItem" AS ii
JOIN "Warehouse" AS w ON w."storeId" = ii."storeId" AND w."isDefault" = true
WHERE ib."warehouseId" = w."id"
  AND ib."variantId" = ii."variantId"
  AND ib."reorderPoint" = 0
  AND ii."lowStockThreshold" IS NOT NULL
  AND ii."lowStockThreshold" > 0;

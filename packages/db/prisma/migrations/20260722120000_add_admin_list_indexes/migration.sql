-- TODO-159A (ADR-089) — Admin Data Grid liste indeksleri.
--
-- TAMAMEN ADDITIVE ve GERİ ALINABİLİR: yalnız iki yeni index oluşturur; hiçbir
-- kolon/tablo/kısıt değişmez, veri dönüştürülmez. Geri alma = DROP INDEX.
--
-- Neden: Admin ürün listesinin VARSAYILAN yolu "store-scoped + createdAt DESC +
-- LIMIT/OFFSET"tir. Bugün yalnız Product("storeId") indeksi vardı; sıralama her
-- sayfa için ayrı bir sort adımı gerektiriyordu. Bileşik (storeId, createdAt)
-- indeksi hem WHERE hem ORDER BY'ı tek erişimle karşılar.
--
-- İkinci index sipariş listesinin aynı desenidir (store + createdAt DESC), ki
-- sipariş hacmi katalogdan hızlı büyür.
--
-- Kapsam DIŞI (bilinçli): ürün başlığı araması ILIKE '%term%' kullanır ve bu
-- desen B-tree indeksinden yararlanamaz; trigram (pg_trgm) indeksi ayrı bir
-- karardır — bkz. TD-094.

CREATE INDEX IF NOT EXISTS "Product_storeId_createdAt_idx" ON "Product"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

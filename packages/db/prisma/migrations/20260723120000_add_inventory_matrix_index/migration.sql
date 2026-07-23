-- TODO-159C (ADR-092) — Inventory Matrix server-side liste indeksi.
--
-- TAMAMEN ADDITIVE ve GERİ ALINABİLİR: yalnız tek yeni index oluşturur; hiçbir
-- kolon/tablo/kısıt değişmez, veri dönüştürülmez. Geri alma = DROP INDEX.
--
-- Neden: Mağaza-geneli stok matrisinin (`GET /stores/:id/inventory/matrix`)
-- birincil filtresi `ProductVariant."storeId" = ? AND "status" <> 'ARCHIVED'`tir.
-- Bugün yalnız tekil `ProductVariant("storeId")` ve `ProductVariant("status")`
-- indeksleri vardı; bileşik (storeId, status) indeksi bu filtreyi tek erişimle
-- karşılar ve 50k+ varyantta taranan kümeyi belirgin daraltır. Sıralama (onHand/
-- reserved/available) türetilmiş kolonlar üzerinde olduğundan indekslenmez; sayfa
-- boyutlu sonuç kümesinde sort adımı kabul edilebilir maliyettedir (bkz. ADR-092).
--
-- Kapsam DIŞI (bilinçli): ürün/varyant araması ILIKE '%term%' kullanır ve B-tree
-- indeksinden yararlanamaz; trigram (pg_trgm) indeksi ayrı bir karardır — bkz. TD-094.

CREATE INDEX IF NOT EXISTS "ProductVariant_storeId_status_idx" ON "ProductVariant"("storeId", "status");

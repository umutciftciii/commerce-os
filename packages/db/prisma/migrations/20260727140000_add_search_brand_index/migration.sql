-- TODO-161B (ADR-142) — Similar Products Tier 3 (ayni marka) aday sorgusu icin additive index.
-- ProductSearchDocument read-model'e (storeId, brand) index'i: 50k+ katalogda marka-hedefli daraltma
-- (aksi halde storeId index'i tum magazayi tarayip brand'i residual filtreler). Projeksiyon/veri DEGISMEZ.
CREATE INDEX "ProductSearchDocument_storeId_brand_idx" ON "ProductSearchDocument"("storeId", "brand");

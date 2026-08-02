-- TODO-165B — Slug yasam dongusu + cok-kategori read-model (ADDITIVE, immutable)

-- 1) Manuel slug kilidi kalicilligi. Varsayilan false: ad degisince slug otomatik yeniden uretilir.
ALTER TABLE "Product" ADD COLUMN "slugLocked" BOOLEAN NOT NULL DEFAULT false;

-- 2) Cok-kategori indexleme: urunun bagli oldugu TUM kategoriler (primary + secondary).
ALTER TABLE "ProductSearchDocument" ADD COLUMN "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProductSearchDocument" ADD COLUMN "categorySlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 3) Array containment (categoryIds && subtree_ids / categorySlugs && [slug]) icin GIN indeksler.
CREATE INDEX "ProductSearchDocument_categoryIds_idx" ON "ProductSearchDocument" USING GIN ("categoryIds");
CREATE INDEX "ProductSearchDocument_categorySlugs_idx" ON "ProductSearchDocument" USING GIN ("categorySlugs");

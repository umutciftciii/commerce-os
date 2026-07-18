-- TODO-154 (ADR-079) — Faz 2C-8A · Search Read-Model Foundation.
-- TAMAMEN ADDITIVE + non-destructive:
--   * yeni enum SearchAvailabilityState
--   * yeni tablo ProductSearchDocument (ACTIVE urun basina 1 satir; denormalize arama dokumani)
--   * yeni tablo ProductFacetValue (flat facet iş atı; (urun × filterable attribute × deger) satiri)
--   * pg_trgm extension (idempotent) + tsvector GENERATED STORED kolon + GIN/trgm indeksleri
--   * INLINE VERI TASIMA YOK — read-model runtime backfill (search-service) ile doldurulur.
-- Mevcut tablolar (Product/ProductVariant/EAV/Inventory) DEGISMEZ, SILINMEZ, SIFIRLANMAZ. Bu iki tablo
-- TURETILMIS okuma-modelidir (source-of-truth DEGIL). Down migration yok (repo standardi). db push/reset YOK.
--
-- Uretim guvenligi: tum ifadeler tek migration transaction'inda calisir (CONCURRENTLY YOK — tablolar bos
-- olusur, kilit maliyeti sifir). `CREATE EXTENSION IF NOT EXISTS pg_trgm` transaction-guvenli + idempotent.

-- Extension (idempotent; superuser/managed-postgres'te mevcut). Trigram: autocomplete/typo zemini + admin SKU.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "SearchAvailabilityState" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK');

-- CreateTable — ProductSearchDocument. "searchVector" GENERATED ALWAYS STORED (DB uretir; Prisma Client
-- yazmaz/okumaz). 'simple' FTS konfigu dil-bagimsiz (Turkce stemming ileri faz). searchText builder'da
-- normalize edilerek yazilir.
CREATE TABLE "ProductSearchDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "primaryCategoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT,
    "searchText" TEXT NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("searchText", ''))) STORED,
    "status" "ProductStatus" NOT NULL,
    "minPriceMinor" INTEGER,
    "maxPriceMinor" INTEGER,
    "currency" TEXT,
    "hasStock" BOOLEAN NOT NULL DEFAULT false,
    "availability" "SearchAvailabilityState" NOT NULL DEFAULT 'OUT_OF_STOCK',
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "productCreatedAt" TIMESTAMP(3) NOT NULL,
    "productUpdatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductSearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable — ProductFacetValue. Bir satirda EN FAZLA bir typed deger kolonu dolu (CHECK; builder
-- invariant'inin DB-seviyesi guvencesi — ProductAttributeValue <=1 deseni).
CREATE TABLE "ProductFacetValue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "optionId" TEXT,
    "valueText" TEXT,
    "valueNumber" DECIMAL(20,6),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "normalizedText" TEXT,

    CONSTRAINT "ProductFacetValue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductFacetValue_single_value_chk" CHECK (
        (("optionId" IS NOT NULL)::int
       + ("valueText" IS NOT NULL)::int
       + ("valueNumber" IS NOT NULL)::int
       + ("valueBoolean" IS NOT NULL)::int
       + ("valueDate" IS NOT NULL)::int) <= 1
    )
);

-- CreateIndex — ProductSearchDocument (btree; isim Prisma konvansiyonuyla birebir → drift onleme).
CREATE UNIQUE INDEX "ProductSearchDocument_productId_key" ON "ProductSearchDocument"("productId");
CREATE INDEX "ProductSearchDocument_storeId_status_idx" ON "ProductSearchDocument"("storeId", "status");
CREATE INDEX "ProductSearchDocument_storeId_primaryCategoryId_idx" ON "ProductSearchDocument"("storeId", "primaryCategoryId");
CREATE INDEX "ProductSearchDocument_storeId_minPriceMinor_idx" ON "ProductSearchDocument"("storeId", "minPriceMinor");
CREATE INDEX "ProductSearchDocument_storeId_hasStock_idx" ON "ProductSearchDocument"("storeId", "hasStock");
CREATE INDEX "ProductSearchDocument_storeId_availability_idx" ON "ProductSearchDocument"("storeId", "availability");
CREATE INDEX "ProductSearchDocument_storeId_productCreatedAt_idx" ON "ProductSearchDocument"("storeId", "productCreatedAt");

-- CreateIndex — RAW (Prisma schema'da ifade EDILEMEZ; yalniz burada). Gelecekteki `migrate dev` bunlari
-- drift olarak gorebilir — bilincli: deploy-only pipeline'da sorun olmaz, GIN/trgm FTS icin zorunlu.
--   * searchVector GIN → keyword FTS (@@ to_tsquery)
--   * title trgm GIN → autocomplete/typo zemini (Faz E)
CREATE INDEX "ProductSearchDocument_searchVector_gin_idx" ON "ProductSearchDocument" USING GIN ("searchVector");
CREATE INDEX "ProductSearchDocument_title_trgm_idx" ON "ProductSearchDocument" USING GIN ("title" gin_trgm_ops);

-- CreateIndex — ProductFacetValue (facet count'un iş atı + numeric range + kategori/attr + reindex delete).
CREATE INDEX "ProductFacetValue_storeId_attributeDefinitionId_optionId_idx" ON "ProductFacetValue"("storeId", "attributeDefinitionId", "optionId");
CREATE INDEX "ProductFacetValue_storeId_attributeDefinitionId_valueNumber_idx" ON "ProductFacetValue"("storeId", "attributeDefinitionId", "valueNumber");
CREATE INDEX "ProductFacetValue_storeId_categoryId_attributeDefinitionId_idx" ON "ProductFacetValue"("storeId", "categoryId", "attributeDefinitionId");
CREATE INDEX "ProductFacetValue_storeId_productId_idx" ON "ProductFacetValue"("storeId", "productId");

-- AddForeignKey — Store/Product Cascade (magaza/urun silinince read-model otomatik temizlenir; orphan yok).
ALTER TABLE "ProductSearchDocument" ADD CONSTRAINT "ProductSearchDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSearchDocument" ADD CONSTRAINT "ProductSearchDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFacetValue" ADD CONSTRAINT "ProductFacetValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFacetValue" ADD CONSTRAINT "ProductFacetValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Faz 1A (ADR-067) — Ana kategori temeli. TAMAMEN ADDITIVE + non-destructive.
-- primaryCategoryId nullable eklenir (ilk migration'da NOT NULL YOK); FK Restrict;
-- store-scoped index; ardindan deterministik + idempotent backfill.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "primaryCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "Product_storeId_primaryCategoryId_idx" ON "Product"("storeId", "primaryCategoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (Faz 1A / ADR-067) — deterministik ana kategori secimi.
-- Kural: her urun icin AYNI store kapsaminda en ESKI ProductCategoryAssignment
-- (createdAt ASC; esitlik durumunda ikincil deterministik anahtar categoryId ASC)
-- ana kategori olur. Bu, mevcut public "ilk assignment" davranisiyla (assignments
-- orderBy createdAt asc) birebir tutarlidir. Tek kategorili urun => o kategori.
-- Kategorisiz urun => NULL kalir.
--
-- TIE-BREAKER NEDEN categoryId ASC: ProductCategoryAssignment'in surrogate `id`
-- kolonu YOKTUR (composite PK = (productId, categoryId); bkz. schema.prisma). Bir
-- urunun iki assignment'i asla ayni categoryId'yi PAYLASAMAZ (composite PK unique),
-- bu yuzden esit createdAt'te categoryId ASC TAM DETERMINISTIKTIR. `assignment.id ASC`
-- bu modelde uygulanamaz (id kolonu yok); eklemek composite PK'yi degistirir → Faz 1A
-- kapsam disi (assignment modeline dokunma kurali).
--
-- IDEMPOTENCY (dogru ifade): Bu migration Prisma migration history nedeniyle hedef
-- DB'ye YALNIZ BIR KEZ uygulanir ("ikinci kez calisir" IFADESI YANLIS olur). Idempotent
-- olan, backfill UPDATE'inin `WHERE primaryCategoryId IS NULL` kosulu sayesinde RE-RUN
-- guvenli olmasidir: elle veya `db:audit-primary-category --apply` ile tekrar cagrilirsa
-- MEVCUT (non-null) degerleri EZMEZ, yalnizca hala NULL olanlari doldurur. FK bu noktada
-- eklenmis olsa da backfill degerleri gecerli ProductCategory id'leridir (ihlal olmaz).
UPDATE "Product" AS p
SET "primaryCategoryId" = picked."categoryId"
FROM (
  SELECT DISTINCT ON (a."productId")
    a."productId" AS "productId",
    a."categoryId" AS "categoryId",
    a."storeId" AS "storeId"
  FROM "ProductCategoryAssignment" AS a
  ORDER BY a."productId", a."createdAt" ASC, a."categoryId" ASC
) AS picked
WHERE p."id" = picked."productId"
  AND p."storeId" = picked."storeId"
  AND p."primaryCategoryId" IS NULL;

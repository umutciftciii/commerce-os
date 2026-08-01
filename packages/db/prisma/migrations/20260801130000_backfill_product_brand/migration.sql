-- TODO-165A (ADR-165A) — Task 14: Product.brand (serbest metin) -> store-scoped Brand + Product.brandId.
--
-- ADDITIVE + IDEMPOTENT: mevcut Brand kayitlarini ve manuel atanmis brandId'leri KORUR.
-- Legacy `Product.brand` serbest-metin kolonu SILINMEZ (dormant, gostergesel; yeni yazma yolu
-- Brand + Product.brandId uzerinden gecer). Store-scoped: ayni marka ADI farkli magazalarda
-- BAGIMSIZ Brand satiri alir (paylasilan global marka YOK). Ayni magaza icinde farkli
-- yazimlarin (orn. "Nike" / "NIKE") ayni slug'a dusmesi durumunda ON CONFLICT DO NOTHING ile
-- dedup edilir — ikinci yazim ayni (mevcut) Brand satirina UPDATE adiminda eslenir.
INSERT INTO "Brand" ("id","storeId","name","slug","status","createdAt","updatedAt")
SELECT gen_random_uuid()::text, p."storeId", TRIM(p."brand"),
       lower(regexp_replace(TRIM(p."brand"), '[^a-zA-Z0-9]+', '-', 'g')),
       'ACTIVE', now(), now()
FROM (SELECT DISTINCT "storeId", "brand" FROM "Product"
      WHERE "brand" IS NOT NULL AND TRIM("brand") <> '') p
ON CONFLICT ("storeId","slug") DO NOTHING;

UPDATE "Product" pr SET "brandId" = b."id"
FROM "Brand" b
WHERE pr."storeId" = b."storeId"
  AND pr."brandId" IS NULL
  AND pr."brand" IS NOT NULL
  AND lower(regexp_replace(TRIM(pr."brand"), '[^a-zA-Z0-9]+', '-', 'g')) = b."slug";

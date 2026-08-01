-- TODO-165A (ADR-165A / ADR-255) — Task 14b: FASHION_VERTICAL-etkin mağazalar için
-- governed taksonomi backfill (store-scoped AttributeOption kopyaları + ProductTaxonomyValue).
--
-- ADDITIVE + IDEMPOTENT + GÜVENLİ GEÇİŞ (§4): her governed global (storeId IS NULL) kanonik
-- AttributeOption için, migration ÇALIŞTIĞI ANDA FASHION_VERTICAL ENABLED olan HER mağaza
-- kendi BAĞIMSIZ store-scoped kopyasını alır (paylaşılan global option YOK — ADR-255, her
-- mağaza kendi sözlüğüne sahiptir). Mevcut ürün/varyant atamaları (ProductAttributeValue/
-- ProductAttributeValueOption/VariantAttributeValue) HÂLÂ global option'a işaret eder ve
-- BİLEREK yeniden-yönlendirilmez (legacy canonical olarak okunmaya devam eder) — kontrollü,
-- transaction-safe bir yeniden-yönlendirme migration'ı OPSİYONEL olarak ileride yapılabilir
-- ve TECHNICAL_DEBT.md'de kayıtlıdır; burada YAPILMAZ.
--
-- Bu migration IMMUTABLE'dır (uygulandıktan sonra düzenlenmez): migration'dan SONRA
-- etkinleştirilen mağazalar ile registry'ye SONRADAN eklenen kanonik değerler runtime
-- `ensureStoreTaxonomyDefaults` (T9/T10b) ile additive olarak kapsanır.
--
-- Governed kod listesi + CASE eşlemesi apps/api-gateway/src/taxonomy/taxonomy-map.ts
-- içindeki GOVERNED_TAXONOMY_CODES / TAXONOMY_TYPE_REGISTRY (tek otorite) ile BİREBİR
-- aynı olmalıdır — parity: apps/api-gateway/test/taxonomy-map.test.ts
-- ("T14b: parity against real 20260801140000 migration.sql").
--
-- ON CONFLICT hedefleri gerçek DB'den `\d` ile doğrulanmış partial/unique index'lerdir:
--   - AttributeOption_store_def_value_key: UNIQUE (storeId, attributeDefinitionId, value)
--     WHERE storeId IS NOT NULL
--   - ProductTaxonomyValue_storeId_type_slug_key: UNIQUE (storeId, type, slug)
--
-- GÜVENLİK: her iki adımdaki "AttributeDefinition d" JOIN'i `d."scope" = 'PLATFORM' AND
-- d."storeId" IS NULL` ile SIKI şekilde kısıtlanır — governed `fashion.*` kodları PLATFORM
-- (storeId=null) scope'a ait olmak ZORUNDADIR; varsayımsal bir STORE-scoped tanım aynı
-- `code` değerinde çakışsa BİLE (storeId+code unique index farklı mağazalarda aynı kodu
-- teorik olarak izin verebilir) asla bu backfill'e dahil edilmez.

-- ─── 1) Store-scoped AttributeOption kopyaları ───────────────────────────────
-- Her FASHION_VERTICAL ENABLED mağaza × her governed global (storeId IS NULL) canonical
-- option için: aynı PLATFORM attributeDefinitionId, kopyalanmış value/label/sortOrder,
-- YENİ id + storeId=mağaza. Idempotent: ON CONFLICT hedefi store-scoped partial unique.
-- NOT: "updatedAt" kolonunun DB-seviyesinde varsayilani YOK (Prisma `@updatedAt` yalniz
-- client katmaninda uygulanir) — raw SQL insert'te ACIKCA verilmezse NOT NULL ihlali olusur.
INSERT INTO "AttributeOption" ("id", "attributeDefinitionId", "storeId", "value", "label", "sortOrder", "metadata", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."attributeDefinitionId",
  sm."storeId",
  o."value",
  o."label",
  o."sortOrder",
  '{}'::jsonb,
  now(),
  now()
FROM "StoreModule" sm
JOIN "AttributeDefinition" d ON d."code" = ANY(ARRAY[
  'fashion.season',
  'fashion.collection',
  'fashion.material',
  'fashion.fit',
  'fashion.pattern',
  'fashion.collar_type',
  'fashion.sleeve_type',
  'fashion.length',
  'fashion.care',
  'fashion.sustainability',
  'fashion.color_family'
]) AND d."scope" = 'PLATFORM' AND d."storeId" IS NULL
JOIN "AttributeOption" o ON o."attributeDefinitionId" = d."id" AND o."storeId" IS NULL
WHERE sm."moduleKey" = 'FASHION_VERTICAL' AND sm."state" = 'ENABLED'
ON CONFLICT ("storeId", "attributeDefinitionId", "value") WHERE "storeId" IS NOT NULL DO NOTHING;

-- ─── 2) Her store-scoped option için bağlı ProductTaxonomyValue ──────────────
-- `type`, tanımın (definition) `code`'una göre CASE ile governed ProductTaxonomyType'a
-- çözülür (taxonomy-map.ts ile birebir). NOT EXISTS guard'ı, o option için henüz bir
-- taksonomi değeri üretilmediğini garanti eder (attributeOptionId 1:1 unique); ON CONFLICT
-- (storeId, type, slug) ek bir idempotency güvencesidir.
INSERT INTO "ProductTaxonomyValue" ("id", "storeId", "type", "name", "slug", "status", "displayOrder", "metadata", "attributeOptionId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  so."storeId",
  CASE d."code"
    WHEN 'fashion.season' THEN 'SEASON'
    WHEN 'fashion.collection' THEN 'COLLECTION'
    WHEN 'fashion.material' THEN 'MATERIAL'
    WHEN 'fashion.fit' THEN 'FIT'
    WHEN 'fashion.pattern' THEN 'PATTERN'
    WHEN 'fashion.collar_type' THEN 'COLLAR'
    WHEN 'fashion.sleeve_type' THEN 'SLEEVE'
    WHEN 'fashion.length' THEN 'LENGTH'
    WHEN 'fashion.care' THEN 'CARE_LABEL'
    WHEN 'fashion.sustainability' THEN 'SUSTAINABILITY_LABEL'
    WHEN 'fashion.color_family' THEN 'COLOR_FAMILY'
  END::"ProductTaxonomyType",
  so."label",
  so."value",
  'ACTIVE',
  so."sortOrder",
  '{}'::jsonb,
  so."id",
  now(),
  now()
FROM "AttributeOption" so
JOIN "AttributeDefinition" d ON d."id" = so."attributeDefinitionId" AND d."scope" = 'PLATFORM' AND d."storeId" IS NULL
WHERE so."storeId" IS NOT NULL
  AND d."code" = ANY(ARRAY[
    'fashion.season',
    'fashion.collection',
    'fashion.material',
    'fashion.fit',
    'fashion.pattern',
    'fashion.collar_type',
    'fashion.sleeve_type',
    'fashion.length',
    'fashion.care',
    'fashion.sustainability',
    'fashion.color_family'
  ])
  AND NOT EXISTS (
    SELECT 1 FROM "ProductTaxonomyValue" tv WHERE tv."attributeOptionId" = so."id"
  )
ON CONFLICT ("storeId", "type", "slug") DO NOTHING;

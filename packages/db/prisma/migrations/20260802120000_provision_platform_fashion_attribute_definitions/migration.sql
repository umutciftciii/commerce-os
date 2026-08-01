-- TODO-165A (ADR-165A gap-fix) — Task 27P: PLATFORM governed `fashion.*` AttributeDefinition
-- provisioning. Bu migration'dan ÖNCE hiçbir şey (migration/seed/route) bu satırları
-- gerçek bir "platform provisioning" olarak üretmiyordu — yalnız `fashion-demo-seed.mjs`
-- içindeki GEÇİCİ bir find-or-create hack'i (`plat-fashion-attr-*`), ve o da yalnız
-- demo script'in fiilen kullandığı 4 tipi (Sezon/Koleksiyon/Materyal/Kalıp) kapsıyordu.
-- Sonuç: taze bir DB'de FASHION_VERTICAL'ı açan HERHANGİ bir mağaza `ensureStoreTaxonomyDefaults`
-- (apps/api-gateway/src/taxonomy/taxonomy-service.ts) çağrısında `platformDefinitionIdForCode`
-- her kod için null dönerdi, döngü sessizce her tipi atlardı ve mağaza "enabled ama governed
-- sözlüğü tamamen boş" kalırdı (T10b'nin fail-closed revert'i bu sessiz no-op'u
-- yakalayamıyordu — bu migration'la BİRLİKTE taxonomy-service.ts'e eklenen "tümü eksikse
-- throw" guard'ı bunu artık yakalar).
--
-- ADDITIVE + IDEMPOTENT (@@unique([storeId, code]) storeId=NULL için Postgres'te "distinct"
-- sayıldığından ON CONFLICT hedef alamaz — bu yüzden her satır kendi NOT EXISTS guard'ını
-- taşır; tekrar çalıştırmak güvenlidir, yeni satır EKLEMEZ).
--
-- Kod + dataType listesi apps/api-gateway/src/fashion/canonical-attributes.ts
-- (FASHION_PRODUCT_ATTRIBUTES/FASHION_VARIANT_ATTRIBUTES) ile
-- @commerce-os/contracts/product-taxonomy TAXONOMY_TYPE_REGISTRY[type].definitionCode'un
-- BİREBİR kesişimidir (11 governed tip — SEASON/COLLECTION/MATERIAL/FIT/PATTERN/COLLAR/
-- SLEEVE/LENGTH/CARE_LABEL/SUSTAINABILITY_LABEL/COLOR_FAMILY). `name` alanı
-- canonical-attributes.ts'teki TR `name` ile birebir eşleşir. Bu 11 kod dışındaki
-- `fashion.*` kodları (renk/beden/cinsiyet/beden-sistemi/menşei gibi governed OLMAYAN
-- tipler) BİLEREK buraya dahil edilmez — onlar STORE-scope kalır (mevcut davranış).
--
-- "updatedAt" kolonunun DB-seviyesinde varsayılanı YOK (Prisma `@updatedAt` yalnız client
-- katmanında uygulanır) — raw SQL insert'te açıkça verilmezse NOT NULL ihlali oluşur
-- (bkz. 20260801140000_backfill_fashion_taxonomy aynı not).

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-season', 'PLATFORM', NULL, 'fashion.season', 'Sezon', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.season' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-collection', 'PLATFORM', NULL, 'fashion.collection', 'Koleksiyon', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.collection' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-material', 'PLATFORM', NULL, 'fashion.material', 'Materyal / Kompozisyon', 'MULTI_SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.material' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-fit', 'PLATFORM', NULL, 'fashion.fit', 'Kalıp / Fit', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.fit' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-pattern', 'PLATFORM', NULL, 'fashion.pattern', 'Desen', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.pattern' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-collar-type', 'PLATFORM', NULL, 'fashion.collar_type', 'Yaka Tipi', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.collar_type' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-sleeve-type', 'PLATFORM', NULL, 'fashion.sleeve_type', 'Kol Tipi', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.sleeve_type' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-length', 'PLATFORM', NULL, 'fashion.length', 'Boy', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.length' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-care', 'PLATFORM', NULL, 'fashion.care', 'Bakım Talimatı', 'MULTI_SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.care' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-sustainability', 'PLATFORM', NULL, 'fashion.sustainability', 'Sürdürülebilirlik Etiketleri', 'MULTI_SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.sustainability' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

INSERT INTO "AttributeDefinition" ("id", "scope", "storeId", "code", "name", "dataType", "status", "createdAt", "updatedAt")
SELECT 'plat-fashion-color-family', 'PLATFORM', NULL, 'fashion.color_family', 'Renk Ailesi', 'SELECT', 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AttributeDefinition" WHERE "code" = 'fashion.color_family' AND "scope" = 'PLATFORM' AND "storeId" IS NULL
);

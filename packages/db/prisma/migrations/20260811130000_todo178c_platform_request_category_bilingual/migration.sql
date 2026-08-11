-- TODO-178 Faz C (TD-178-5) — Request kategori snapshot'ını bilingual yap (additive).
-- PlatformRequestCategory zaten labelTr+labelEn taşır; burada yalnız REQUEST snapshot'ına EN eklenir.
-- categoryLabel = TR snapshot (mevcut), categoryLabelEn = EN snapshot (yeni). Operasyonel/current
-- kategori `categoryId` relation'ından okunur (TD-178-4); snapshot yalnız audit içindir.
ALTER TABLE "PlatformRequest" ADD COLUMN "categoryLabelEn" TEXT NOT NULL DEFAULT '';

-- Mevcut satırlar için EN etiketini güncel kategoriden backfill et (yeni özellik; genelde satır yok).
UPDATE "PlatformRequest" pr
SET "categoryLabelEn" = c."labelEn"
FROM "PlatformRequestCategory" c
WHERE pr."categoryId" = c."id" AND pr."categoryLabelEn" = '';

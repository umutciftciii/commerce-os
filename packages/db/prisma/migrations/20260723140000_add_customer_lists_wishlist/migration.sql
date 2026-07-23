-- TODO-159D (ADR-093) — Customer Lists & Wishlist.
--
-- TAMAMEN ADDITIVE ve GERİ ALINABİLİR: yalnız iki yeni enum, iki yeni tablo ve
-- bunlara ait index/FK'ler oluşturulur. Mevcut hiçbir tablo/kolon/kısıt değişmez,
-- veri dönüştürülmez. Geri alma = DROP TABLE + DROP TYPE.
--
-- Favori (wishlist) ve alışveriş listeleri AYRI iki sistem DEĞİL; ortak bir
-- `CustomerList` altyapısıdır. Wishlist = type=WISHLIST olan TEK varsayılan liste
-- (isDefault=true; lazy-create; silinemez/yeniden-adlandırılamaz).
--
-- Tenant izolasyonu mevcut desenle: storeId FK + onDelete Cascade + @@index([storeId]).
-- FK kararı (ADR-093): product/variant FK'leri onDelete Cascade — ürün/varyant FİZİKSEL
-- silinince ilgili liste öğe(ler)i güvenle kalkar (dangling referans olmaz). Soft-archive
-- (status<>ACTIVE) satırı DB'de bıraktığından öğe KORUNUR; liste detayı canlı hidrasyonla
-- durumu UNAVAILABLE gösterir.

-- CreateEnum
CREATE TYPE "CustomerListType" AS ENUM ('WISHLIST', 'SHOPPING_LIST');

-- CreateEnum
CREATE TYPE "CustomerListVisibility" AS ENUM ('PRIVATE');

-- CreateTable
CREATE TABLE "CustomerList" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerListType" NOT NULL DEFAULT 'SHOPPING_LIST',
    "visibility" "CustomerListVisibility" NOT NULL DEFAULT 'PRIVATE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerListItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "note" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerList_storeId_idx" ON "CustomerList"("storeId");

-- CreateIndex
CREATE INDEX "CustomerList_storeId_customerId_idx" ON "CustomerList"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerListItem_storeId_idx" ON "CustomerListItem"("storeId");

-- CreateIndex
CREATE INDEX "CustomerListItem_listId_addedAt_idx" ON "CustomerListItem"("listId", "addedAt");

-- CreateIndex
CREATE INDEX "CustomerListItem_productId_idx" ON "CustomerListItem"("productId");

-- CreateIndex
CREATE INDEX "CustomerListItem_variantId_idx" ON "CustomerListItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerListItem_listId_productId_variantId_key" ON "CustomerListItem"("listId", "productId", "variantId");

-- AddForeignKey
ALTER TABLE "CustomerList" ADD CONSTRAINT "CustomerList_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerList" ADD CONSTRAINT "CustomerList_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListItem" ADD CONSTRAINT "CustomerListItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListItem" ADD CONSTRAINT "CustomerListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CustomerList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListItem" ADD CONSTRAINT "CustomerListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListItem" ADD CONSTRAINT "CustomerListItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- KISMİ UNIQUE İNDEKSLER (Prisma şema dilinde ifade edilemez → burada tanımlı).
-- Bu iki index veri invariant'larını DB seviyesinde garanti eder; servis katmanı
-- ayrıca check-then-insert + P2002 yutma ile idempotent davranır (savunma katmanı).
-- ---------------------------------------------------------------------------

-- Invariant #1: her (store, customer) için TAM bir adet varsayılan WISHLIST.
-- İki default wishlist oluşturma (yarış/çift-istek) DB tarafından reddedilir.
CREATE UNIQUE INDEX "CustomerList_default_wishlist_key"
    ON "CustomerList"("storeId", "customerId")
    WHERE "isDefault" = true AND "type" = 'WISHLIST';

-- Invariant #2: bütün-ürün öğesi (variantId IS NULL) aynı listeye iki kez eklenemez.
-- Yukarıdaki 4'lü unique varyant-DOLU durumu kapatır ama Postgres NULL'ları distinct
-- saydığından NULL-varyant (wishlist favorisi) durumunu kapatmaz — bu kısmi index kapatır.
CREATE UNIQUE INDEX "CustomerListItem_list_product_null_variant_key"
    ON "CustomerListItem"("listId", "productId")
    WHERE "variantId" IS NULL;

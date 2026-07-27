-- TODO-161B (ADR-137/138/139) — Recently Viewed & Product Recommendations.
-- RecentlyViewedProduct: sunucu-tarafi, KVKK-uyumlu goruntuleme gecmisi. HAM IP/UA saklanmaz;
-- guest kimligi visitorHash = HMAC(SESSION_SECRET, first-party visitor id). Tam olarak BIR kimlik dolu
-- (customerId XOR visitorHash — CHECK). Ayni kimlik + product icin TEK kayit (kismi unique index —
-- Prisma @@unique NULL-distinct semantigi guest satirlari dedupe etmez).

-- CreateTable
CREATE TABLE "RecentlyViewedProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "visitorHash" TEXT,
    "productId" TEXT NOT NULL,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentlyViewedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (listeleme: en-yeni-once, kimlik-scope)
CREATE INDEX "RecentlyViewedProduct_storeId_customerId_lastViewedAt_idx" ON "RecentlyViewedProduct"("storeId", "customerId", "lastViewedAt");

-- CreateIndex
CREATE INDEX "RecentlyViewedProduct_storeId_visitorHash_lastViewedAt_idx" ON "RecentlyViewedProduct"("storeId", "visitorHash", "lastViewedAt");

-- CreateIndex (urun-bazli cascade/temizlik)
CREATE INDEX "RecentlyViewedProduct_productId_idx" ON "RecentlyViewedProduct"("productId");

-- Kismi UNIQUE index'ler: guest satirlarinda customerId NULL, customer satirlarinda visitorHash NULL.
-- Postgres NULL'lari farkli sayar → normal composite unique dedupe ETMEZ; bu yuzden partial WHERE.
CREATE UNIQUE INDEX "RecentlyViewedProduct_store_customer_product_key" ON "RecentlyViewedProduct"("storeId", "customerId", "productId") WHERE "customerId" IS NOT NULL;

-- CreateIndex (partial)
CREATE UNIQUE INDEX "RecentlyViewedProduct_store_visitor_product_key" ON "RecentlyViewedProduct"("storeId", "visitorHash", "productId") WHERE "visitorHash" IS NOT NULL;

-- Kimlik XOR: tam olarak bir kimlik dolu (customer VEYA visitor).
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_identity_chk"
    CHECK ((("customerId" IS NOT NULL)::int + ("visitorHash" IS NOT NULL)::int) = 1);

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewedProduct" ADD CONSTRAINT "RecentlyViewedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

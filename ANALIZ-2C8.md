# ANALIZ-2C8 — Phase 2C-8 · Search & Filtering Engine (TODO-154)

> Durum: **Yalnızca tasarım/analiz.** Kod yazılmadı. Onay sonrası fazlara bölünmüş implementasyona geçilecek.
> İncelenen gerçek kaynaklar aşağıda dosya:satır ile referanslıdır.

---

## 0. Yöntem — İncelenen gerçek kaynaklar

- `packages/db/prisma/schema.prisma` — Product (750), ProductVariant (824), ProductCategory (928), AttributeDefinition (2288), AttributeOption (2347), CategoryAttribute (2381), ProductAttributeValue (2428), VariantAttributeValue (2466), ProductAttributeValueOption (2493), ProductVariantOptionValue (2577), InventoryItem (972), InventoryBalance (1039), Warehouse (1011).
- `apps/api-gateway/src/server.ts` — public catalog uçları (4228–4460), `loadActivePublicProducts` (4241), `dataAccess.listProducts` (2812), `buildPublicProduct` projeksiyonu (1701), `paginationQuerySchema` (1204), admin ürün listesi (5844).
- `packages/contracts/src/index.ts` — `publicProductVariantSchema` (1635), `publicProductSchema` (1801), `publicProductListResponseSchema` (1843), `publicProductDetailSchema` (1852).
- `apps/storefront-web/` — `app/products/page.tsx`, `app/products/[handle]/page.tsx`, `components/site/product-listing.tsx`, `lib/server/catalog.ts`, `lib/server/gateway.ts`, `next.config.mjs`, `components/site/site-header.tsx`.
- `services/search-service/src/index.ts` (placeholder), `docs/SERVICE_BOUNDARIES.md` (138), `docs/ARCHITECTURE.md` (252/265/283).
- `packages/queues/src/index.ts` (BullMQ), `apps/worker/`, `infra/docker/docker-compose.yml` (postgres:16-alpine, redis:7-alpine).

---

## 1. Mevcut Mimari Analizi

### 1.1 Katalog veri modeli — güçlü ve arama-hazır

Katalog EAV katmanı zaten olgun ve **normalize + indeksli**:

- **`Product`** (750): `title`, `slug`, `brand`, `vendor`, `description`, `status`, `salesMode`, `purchasable`, `primaryCategoryId`, `seoTitle/seoDescription`. İndeksler: `storeId`, `status`, `salesMode`, `purchasable`, `[storeId, primaryCategoryId]`. `@@unique([storeId, slug])`.
- **`ProductVariant`** (824): `sku`, `barcode`, `priceMinor` (KDV dahil brüt), `compareAtMinor`, `costMinor` (ASLA public'e sızmaz), `netPriceMinor`, `vatRateBps`, `status`, `optionValues Json?`. İndeksler: `[storeId, sku]` unique, `productId`, `storeId`, `status`.
- **`ProductCategory`** (928): ağaç (`parentId` self-relation, ADR-067). Ana kategori `Product.primaryCategoryId` (kanonik), ikincil sınıflandırma `ProductCategoryAssignment` (M:N).
- **`CategoryAttribute`** (2381): **bir attribute'un bir kategorideki davranışının tek sahibi.** Kritik bulgu — arama/filtre bayrakları **zaten burada tanımlı**:
  ```
  required  filterable  searchable  comparable
  variantDefining  visibleOnProductPage  visibleOnListing
  displayOrder  validationRules(Json)  groupId
  ```
  Yani "hangi attribute filtrelenebilir/aranabilir/karşılaştırılabilir" bilgisi **modelde var ama hiçbir yerde tüketilmiyor.**
- **`ProductAttributeValue`** (2428): tip-güvenli değer (JSON yok) — `valueText / valueInteger / valueDecimal / valueBoolean / valueDate / optionId / mediaId`, MULTI_SELECT → `ProductAttributeValueOption` junction. İndeksler: `productId`, `attributeDefinitionId`, `optionId`, `storeId`. `@@unique([productId, attributeDefinitionId])`.
- **`VariantAttributeValue`** (2466): yalnız `variantDefining` attribute'lar (`valueText`/`optionId`). İndeksli.
- **Stok**: `InventoryItem` (default-depo otorite köprüsü) + warehouse-aware `InventoryBalance` (ADR-076). Satılabilir = `onHand − reserved`. Pre-order/coming-soon kavramı **yok**.

**Sonuç:** Filtre/facet için gereken taksonomi ve değer verisi zaten yapısal olarak mevcut. Eksik olan, bunu **sorgulanabilir bir arama yüzeyine** dönüştüren katman.

### 1.2 Public katalog uçları — naif, ölçeklenmez

`GET /public/stores/:storeSlug/products` (server.ts:4269) gerçek davranışı:

1. `loadActivePublicProducts(store.id)` (4241) → `dataAccess.listProducts(storeId, { limit: 200, offset: 0 })` — **tüm ürünleri (max `PUBLIC_CATALOG_MAX=200`) belleğe çeker**, sonra `.filter(status==="ACTIVE")`.
2. Sayfalama **JS'te** `products.slice(offset, offset+limit)` (4286).
3. Her sayfa öğesi için **ürün-başına ayrı** `loadActivePublicVariants` (4298) → **varyant N+1**.
4. `loadPublicStockMap` **tüm envanteri** çeker (4251), `loadPublicCategoryNames` **tüm kategorileri** çeker.

Yani PLP başına: 1 ürün taraması + tüm kategori + tüm envanter + N adet varyant sorgusu, hepsi bellekte birleştirilir. **Filtre yok, kategori-filtresi yok, metin araması yok, facet yok, gerçek pagination yok.** 200 ürün üstünde sessizce kesilir.

- `paginationQuerySchema` (1204): yalnız `limit(≤100, default 50)` + `offset`. Cursor yok.
- **Admin ürün listesi** (5844) de aynı — yalnız limit/offset, arama yok.
- **Public kategori ucu YOK.** Kategoriler yalnız admin tarafında (`GET /stores/:storeId/categories`, 5553); public path'te kategori yalnız `categoryLabel` string'i hesaplamak için içeride yükleniyor. → Kategori rotaları/nav için yeni public kategori ucu da gerekecek.
- **`DataAccess.listProducts` arayüzü** (788) yalnız `{ limit, offset }` alır — filtre/sort/search parametresi kontratın hiçbir yerinde yok. Yeni bir sorgu kontratı (`packages/contracts`) + arayüz + Prisma impl (2812) genişletilmeli.

### 1.3 Projeksiyon / allowlist katmanı — korunmalı

`buildPublicProduct` (1701) → `publicProductSchema.parse(...)` allowlist'i uygular. Public DTO (`contracts` 1635/1801):

- **Variant**: `id, title, sku, priceMinor(null'lanabilir), compareAtMinor, lowestPriceMinor (Omnibus), currency, available, inStock, mediaOptionId`.
- **Product**: `id, slug, title, brand, categoryLabel, salesMode, priceVisibility, primaryAction, purchasable, whatsappEnabled/inquiryEnabled/appointmentRequired, min/maxOrderQuantity, variants[], mediaDefiningAttributeId, images[]{url,altText,position,variantOptionId}, campaign, secondaryCoupon`.
- `costMinor`, `mediaId`, `storageKey`, `netPriceMinor` **bilinçli olarak dışarıda.** Kart taban fiyatı = en ucuz görünür varyantın brütü (1733).

**Bir facet/arama katmanı bu allowlist'i BOZMAMALI** — yeni uçlar aynı projeksiyon disiplinini miras almalı, attribute değerleri public'e ancak `filterable/searchable` bayrağı + option label düzeyinde (ham id/tenant verisi değil) çıkmalı.

### 1.4 Repository / veri erişim deseni

Route'lar Prisma'ya doğrudan yazmaz; `dataAccess` (createPrismaDataAccess, server.ts:4063) enjekte edilir; testlerde `MemoryDataAccess` ile değiştirilebilir. Yazımlar servis-tek-nokta (attributeValueService, inventory-engine vb.). Bu DI deseni, **SearchProvider portu** için hazır bir zemin.

**Mevcut precedent — `listOrders` (server.ts:3219–3252):** Kod tabanında DB-düzeyi filtre kuran **tek örnek**. `Prisma.OrderWhereInput`'a `status/paymentStatus/fulfillmentStatus` enum'ları + `dateFrom/dateTo` aralığı + `search` için `OR [{ orderNumber contains, mode:insensitive }, { customerEmail... }, ...]` ekliyor. Ürün arama/filtre motorunun `where` inşası için **hazır şablon**; facet agregasyonu için ise tek örnek `lowestRecentPriceByStore` `groupBy` (3144). Yani P1 baseline'ın "canlı tablo + trgm" varyantı bile bu desenle inşa edilebilir — ama §3.3'teki nedenlerle read-model tercih edilir.

### 1.5 Storefront — greenfield, tümüyle client-side

- **Tek liste rotası** `app/products/page.tsx` (`force-dynamic`, SSR). `searchParams` **okunmuyor** — `getStorefrontListing()` sabit ilk sayfayı çeker (`catalog.ts`).
- Filtre/sıralama **tarayıcıda** (`product-listing.tsx`): sort (`featured|priceAsc|priceDesc|nameAsc`) client array-sort; kategori seçenekleri yüklü ürünlerin `categoryLabel`'ından türetilir (gerçek taksonomi değil). **Fiyat slider yok, facet yok, çoklu seçim yok, sidebar yok, URL senkronu yok.**
- **Kategori/koleksiyon rotası YOK.** Header nav'ında tek "Ürünler" linki. Header arama kutusu `name="q"` ile `/products`'a gider ama `q` **hiç tüketilmez** (hazır bağlanma noktası).
- **Pagination UI yok** (gizli 50 kapağı). Breadcrumb yalnız PDP'de inline. Aktif-filtre çipi yok.
- **Cache yok**: her katalog fetch'i `cache: "no-store"`, tüm katalog sayfaları `force-dynamic`, `generateStaticParams`/`revalidate` yok.
- API çağrısı server-to-server (`getPublic`, `gateway.ts`), `resolveApiGatewayUrl()` ile; `/media/*` Next rewrite ile proxy'lenir, katalog verisi için proxy yok.

### 1.6 Rezerve altyapı

- `services/search-service` — **placeholder** (`indexing-placeholder`, `query-placeholder`). Sınır `docs/SERVICE_BOUNDARIES.md:138`'de tanımlı: "Arama indeksleri, index refresh jobları ve search query davranışları."
- **BullMQ + Redis 7 + `apps/worker`** mevcut (`packages/queues`) → indeks-refresh jobları için hazır.
- **Postgres 16** — `pg_trgm`, `tsvector`/GIN, generated columns, `FILTER` agregatları hepsi mevcut. Prisma'da `previewFeatures`/`fullTextSearch` **kapalı**, hiç GIN/trgm indeksi yok.
- ADR-067/068/069/070/072/073/076/078 — "faceted search Faz 2C+" olarak **açıkça ertelenmiş** (ARCHITECTURE.md:252/283/307).

---

## 2. Referans Sistem Karşılaştırması

| Boyut | Amazon | Shopify (Plus) | commercetools | Adobe Commerce | BigCommerce | Trendyol / Hepsiburada | **commerce-os hedefi** |
|---|---|---|---|---|---|---|---|
| **Arama motoru** | Özel (A9/RufusAI) | Özel arama servisi + Storefront Search API | ElasticSearch/OpenSearch tabanlı | Live Search / Catalog Search (OpenSearch), eski MySQL | Özel + Algolia entegre | ElasticSearch + öğrenen sıralama | **PG-native (Faz 1) → OpenSearch (opsiyonel Faz F)** |
| **Facet kaynağı** | Katalog attribute'ları | Metafield/attribute | Product Type attributes | EAV → flat catalog | Custom fields | Kategori-attribute | **`CategoryAttribute.filterable` (dinamik, hardcode YOK)** |
| **Facet count** | Var | Var | Var (terms aggregation) | Var (layered nav) | Var | Var | **Var (P-B)** |
| **Dinamik facet (kategoriye göre)** | Var | Kısıtlı | Var | Var (attribute set) | Kısmi | Var (çok güçlü) | **Var — `CategoryAttribute` üzerinden** |
| **URL** | `?rh=` opak | `/collections/x?filter.v...` | client | `/x.html?attr=val` | `?attr=val` | `/kategori-x?attr=val` slug-SEO | **`/:category?brand=apple&ram=16gb` SEO-dostu** |
| **Typo tolerance** | Var | Var | Analyzer'a bağlı | Live Search var | Algolia | Var | **Faz E (trgm P1 zemini)** |
| **Synonym** | Var | Var | Analyzer | Var | Algolia | Var | **Faz E (tablo şeması P1'de hazır)** |
| **Autocomplete/suggest** | Var | Var | Suggesters | Var | Var | Var (çok agresif) | **Faz E** |
| **Stok filtresi** | Var | Var | channel/inventory | Var | Var | "Sadece stokta" | **Inventory Engine ile P-B** |
| **Fiyat: kampanyalı/varyant** | Var | Var | scoped price | catalog price rules | Var | Sepette fiyat | **Varyant min/max P-B; kampanyalı fiyat P-C+** |
| **Ranking/AI** | Öğrenen (LTR) | Signal-based | Score fn | Live Search (Adobe Sensei) | Algolia AI | Öğrenen sıralama | **`rankingStrategy` portu (Faz F'e açık)** |

**Ortak enterprise deseni:** Hepsi transaksiyonel DB'den **ayrık, denormalize bir arama okuma-modeli** (search index/document) besler; facet count'u bu model üzerinde terms-aggregation ile yapar; kategori-attribute meta-verisinden **dinamik facet** üretir; URL'i SEO için slug + query-param olarak kurar. commerce-os'un farkı: bu okuma-modelini **önce Postgres'te** kurup, motor değişimini bir **provider implementasyonuna** indirgemek.

---

## 3. Önerilen Mimari

### 3.1 Tek cümlede

> **PostgreSQL-native, denormalize bir "arama okuma-modeli" (search read-model) kur; onu mevcut BullMQ worker'ı ile event-driven besle; sorgu/facet mantığını bir `SearchProvider` portu ardına koy. OpenSearch'ü GÜNÜ GELİNCE aynı portun ikinci implementasyonu olarak ekle — bir yeniden yazım değil.**

Bu, "hardcode filtre yok, tümüyle `CategoryAttribute` üzerinden" ve "gelecekte AI ranking'e açık" hedeflerini karşılarken, gün-1'de yeni bir stateful servis (OpenSearch) operasyon yükü getirmez.

### 3.2 Katmanlar

```
Storefront (Next.js)
  ├─ /:categorySlug  (yeni PLP rotaları, SSR + ISR/cache)
  └─ getPublic → API Gateway
        │
API Gateway  (apps/api-gateway/src/search/)
  ├─ routes.ts        GET /public/stores/:slug/catalog/search   (items+facets+pagination)
  │                   GET /public/stores/:slug/catalog/suggest  (autocomplete)
  ├─ query-parser.ts  URL param → normalize SearchQuery (allowlist, tenant-scoped)
  ├─ search-service.ts  facet meta çözümü (CategoryAttribute) + projeksiyon (allowlist)
  └─ provider/
        ├─ SearchProvider (port/interface)
        ├─ PostgresSearchProvider   ← Faz 1 (default)
        └─ OpenSearchProvider       ← Faz F (opsiyonel, additive)
        │
Read-model (Postgres, denormalize — worker'ın beslediği)
  ├─ ProductSearchDocument   (1 satır / ürün: text vektör + fiyat aralığı + stok + kategori path)
  ├─ ProductFacetValue       (flat: (product, attribute, option/numeric) — facet count'un iş atı)
  └─ (Faz E) SearchSynonym / SearchQueryLog
        ▲
Worker (apps/worker + packages/queues/BullMQ)
  └─ search-indexer  ← ürün/varyant/stok/attribute/kampanya değişince re-project job
```

### 3.3 Neden denormalize okuma-modeli (canlı EAV sorgusu değil)

Facet count "diğer tüm aktif filtreleri uygulayıp, her filtrelenebilir attribute için grupla-say" demektir. Canlı şemada bu, istek başına: her aktif facet için `ProductAttributeValue` join'i + varyant fiyat/stok agregasyonu (min price over variants, `InventoryBalance` toplamı) + `Product.brand` + kampanya = **çok-yollu join patlaması**. `ProductSearchDocument` + `ProductFacetValue` ile aynı sorgu **tek tabloda `GROUP BY`** olur → O(eşleşen satır), join değil. Bu tam olarak commercetools/Adobe/Trendyol'un yaptığı ayrımdır; sadece motor Postgres.

Tutarlılık: katalog gezinme için **eventual consistency kabul edilebilir** (saniye-altı gecikme). Fiyat/stok checkout'ta zaten sunucu-otoriter canlı tablodan doğrulanıyor (`buildPublicCartLine`, 1810) — arama-modeli yalnız **keşif** yüzeyi, otorite değil.

### 3.4 `ProductSearchDocument` (kavramsal alanlar)

Bir satır / ürün (varyant bilgisi agregelenir):

- Kimlik/tenant: `storeId`, `productId`, `slug`, `title`, `brand`
- Kategori: `primaryCategoryId`, `categoryPath` (kök→yaprak ata id dizisi — hiyerarşik filtre: bir üst kategori seçince alt ürünler de gelir), `categoryIds` (ikincil)
- Görünürlük: `status`, `salesMode`, `purchasable`, `priceVisibility`
- Fiyat (varyant agregesi): `minPriceMinor`, `maxPriceMinor`, `hasDiscount`, `maxDiscountPct`, `currency`
- Stok (Inventory Engine): `availabilityState` (enum: `IN_STOCK|OUT_OF_STOCK|PRE_ORDER|COMING_SOON`), `inStock` (bool türev), `availableTotal`
- Sıralama sinyalleri: `createdAt`, `popularityScore`, `salesCount`, `viewCount`, `rankingSignals Json` (AI'a açık kap)
- Metin: `searchVector tsvector` (ağırlıklı: title=A, brand/sku=B, searchable-attribute değerleri=C, description=D), `titleTrgm` (trgm/typo/autocomplete)

### 3.5 `ProductFacetValue` (flat facet iş atı)

Bir satır / (ürün × attribute × değer):
- `storeId, productId, attributeDefinitionId`
- `optionId` (SELECT/MULTI_SELECT/COLOR için) **veya** `numericValue`/`numericBucket` (INTEGER/DECIMAL aralık facet'i için) **veya** `boolValue`
- Yalnız `CategoryAttribute.filterable=true` olan attribute'lar buraya yansıtılır (worker filtreler).
- İndeks: `(storeId, attributeDefinitionId, optionId)` (facet count GROUP BY), `(storeId, productId)` (re-project delete/insert).

Facet count sorgusu: aktif filtreleri (kendi facet'i hariç) uygulayan ürün id kümesi ile `ProductFacetValue`'ya `JOIN` + `GROUP BY attributeDefinitionId, optionId` → `Renk: Siyah(53), Beyaz(21)` çıktısı. "Kendi facet'ini hariç tut" kuralı (bir facet kendi seçili değerlerini count'larken diğer değerleri de göstersin diye) enterprise standardıdır.

### 3.6 SearchProvider portu (soyutlama — gün 1)

```
interface SearchProvider {
  search(storeId, query: SearchQuery): Promise<{ items, facets, total, page }>
  suggest(storeId, prefix, opts): Promise<Suggestion[]>
}
```
- Gün-1: **`PostgresSearchProvider`** — read-model üzerinde SQL. Kod tabanının DI desenine (dataAccess) birebir oturur; `MemoryDataAccess` gibi test edilebilir.
- Gün-N: **`OpenSearchProvider`** — aynı imza, `search`/`suggest` OpenSearch DSL'ine map'lenir; read-model artık OpenSearch'e mirror'lanır. **API kontratı, storefront, admin DEĞİŞMEZ.**

> **Soyutlama gün-1'de gerekli mi? EVET — port (interface). OpenSearch implementasyonu gün-1'de gerekli mi? HAYIR.** Read-model, portu ucuz kılan dikiş yeridir.

---

## 4. Trade-off Analizi (alternatif mimariler)

| # | Alternatif | Artı | Eksi | Karar |
|---|---|---|---|---|
| A | **Canlı EAV sorgusu** (read-model yok, mevcut tablolara doğrudan facet SQL) | Sıfır sync, tam tutarlı, migration hafif | Facet count'ta join patlaması; varyant fiyat/stok agregasyonu istek-başına; >~10K ürün/store'da yavaşlar; N+1 riski sürer | **Ret** (P1 baseline olarak bile facet count'u kaldırmaz) |
| B | **PG denormalize read-model + SearchProvider portu** | Facet O(satır); mevcut PG/BullMQ/DI ile; motor-swap ucuz; hardcode-sız facet | Read-model sync mantığı + backfill; eventual consistency | **SEÇİLDİ** |
| C | **Gün-1 OpenSearch/Elasticsearch** | En güçlü relevance/typo/synonym/scale | Yeni stateful servis (ops, backup, sürüm); sync yine gerekli; erken karmaşıklık; küçük/orta katalogda ROI düşük | **Ertele** (Faz F, portun 2. impl'i) |
| D | **Meilisearch/Typesense** (hafif motor) | Kolay typo/facet/suggest, düşük ops | Yine ayrı servis; multi-tenant izolasyon + fiyat/stok senkron karmaşık; PG'de zaten çözülebilecek işi dışarı taşır | **Ret (şimdilik)**; C'den önce değerlendirilebilir |
| E | **Algolia/harici SaaS** | Sıfır ops, hazır relevance | Maliyet/kayıt-başı; veri egemenliği; multi-tenant maliyet; kilit | **Ret** (ürün self-hosted commerce OS) |

**Neden B:** Mevcut yatırımı (PG16, BullMQ, worker, DI, EAV) kaldıraç yapar; en riskli/kalıcı kısmı (dinamik facet + read-model şekli) **motordan bağımsız** kurar; OpenSearch'ü teknik-borç değil, planlı bir *upgrade path* haline getirir.

### 4.1 PostgreSQL nereye kadar? (net eşikler)

| Metrik | PG-native rahat | PG zorlanır → OpenSearch düşün |
|---|---|---|
| Ürün / store | ≤ ~100K | > ~250K–500K |
| Toplam doküman (tüm store'lar) | ≤ ~1–2M | > birkaç M + cross-store arama |
| Facet sayısı / kategori | ≤ ~20 | çok yüksek kardinalite + çok-facet |
| Relevance ihtiyacı | trgm + tsvector + ağırlık yeterli | LTR/öğrenen sıralama, per-field boosting, vektör/semantik |
| Typo/synonym | trgm + synonym tablosu | dilbilimsel analyzer, çok-dilli stemming |
| p95 arama latency hedefi | < ~150ms | yoğun facet + fuzzy'de aşılırsa |

**Tetik:** Bir store bu eşikleri geçtiğinde veya "öğrenen sıralama/semantik arama" ürün gereksinimi geldiğinde `OpenSearchProvider`'ı aç. Migration = read-model'i OpenSearch'e mirror'la + provider flag'i çevir.

---

## 5. Prisma Etkisi

Tümü **additive** (mevcut tablolara dokunmadan; yalnız yeni indeksler + yeni modeller). Migration'lar house-deseni (raw SQL bloklu) ile.

- **Yeni enum** `ProductAvailabilityState { IN_STOCK, OUT_OF_STOCK, PRE_ORDER, COMING_SOON }`.
  (PRE_ORDER/COMING_SOON'u besleyecek ürün/varyant bayrakları henüz yok → P1'de yalnız IN/OUT üretilir; enum ileriye açık.)
- **Yeni model `ProductSearchDocument`** — §3.4 alanları. `tsvector` kolonu Prisma'da `Unsupported("tsvector")` + raw `GENERATED ALWAYS` / trigger; GIN indeks migration SQL'inde. `@@id([productId])`, `@@index([storeId, status])`, `@@index([storeId, primaryCategoryId])`, `@@index([storeId, minPriceMinor])`, GIN(`searchVector`), GIN trgm(`title`).
- **Yeni model `ProductFacetValue`** — §3.5. `@@index([storeId, attributeDefinitionId, optionId])`, `@@index([storeId, productId])`.
- **(Faz E) `SearchSynonym`** (`storeId, term, synonyms String[]`), **`SearchQueryLog`** (`storeId, q, resultCount, clickedProductId?, createdAt` — sıfır-sonuç analizi + popularity sinyali).
- **Extension migration**: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. (Docker `postgres:16-alpine`'de mevcut.)
- **Prisma**: `previewFeatures`'a gerek yok (tsvector'ı raw yönetiyoruz; `fullTextSearch` preview'ını KULLANMIYORUZ — kontrol/indeks bizde). Generator/datasource değişmez.
- **Mevcut tablolar**: DEĞİŞMEZ. Yalnız okunur (worker projeksiyonu). `costMinor/netPriceMinor` read-model'e **taşınmaz** (allowlist).

> Not: read-model'i migration'la kurmak + **mevcut ürünleri backfill** etmek (tek seferlik reprojection job) Faz A DoD'sidir.

---

## 6. API Tasarımı

Mevcut uçlar **korunur**; yeni uçlar additive ve aynı allowlist projeksiyonunu miras alır.

### 6.1 `GET /public/stores/:storeSlug/catalog/search`

Query paramları (allowlist, normalize; bilinmeyen param yok sayılır):
```
category=<categorySlug>         # hiyerarşik (alt kategoriler dahil)
q=<keyword>                     # metin araması
brand=apple,samsung             # çoklu (repeat veya virgül)
<attrCode>=<optValue>[,<...>]   # dinamik facet: ram=16gb  ekran-boyutu=15,16
minPrice / maxPrice             # minor
availability=in_stock|pre_order|coming_soon
onSale=true
sort=recommended|newest|price_asc|price_desc|best_selling|most_viewed|discount|alpha
page / pageSize   (cursor opsiyonu: after=<opaqueCursor>)
```
Yanıt (envelope):
```
{
  items: PublicProduct[],                 // mevcut publicProductSchema — BOZULMAZ
  facets: [{
    attributeCode, label, type: "checkbox|swatch|range|boolean",
    options: [{ value, label, colorHex?, count }],   // range için: {min,max,buckets}
    displayOrder
  }],
  activeFilters: [{ key, value, label }],
  pagination: { page, pageSize, total, totalPages },
  sort: "<applied>"
}
```
- **Facet meta tümüyle `CategoryAttribute`'tan**: seçili `category` için `filterable=true` linkler → facet listesi; `AttributeOption` → değerler; `colorHex` COLOR swatch'ı; INTEGER/DECIMAL → range; BOOLEAN → toggle. **Hiçbir hardcode filtre yok.** Kategori değişince facet seti değişir.
- **Facet count** her istekte read-model'den (§3.5), kendi-facet-hariç kuralıyla.
- **Tenant izolasyonu**: her sorgu `storeId`-scoped; facet count store-scoped.

### 6.2 `GET /public/stores/:storeSlug/catalog/suggest?q=`
Autocomplete: `trgm`/prefix ile ürün başlığı + kategori + marka önerileri (küçük N, düşük latency, ağır cache). Faz E.

### 6.3 Admin arama uçları
`GET /stores/:storeId/products?q=&sku=&barcode=` — admin ürün listesine arama (SKU/barcode dahil; barcode yalnız admin). Aynı read-model'i (veya trgm indeksli canlı tablo) kullanır; `requireStorePlatformAdmin` korumalı.

### 6.4 Geriye dönük uyumluluk
Mevcut `GET .../products` ve `.../products/:slug` **aynen kalır** (storefront geçişi kademeli). Yeni PLP rotaları `catalog/search`'e geçer.

---

## 7. Storefront Tasarımı (PLP tümüyle yeniden)

### 7.1 Rotalar & URL (SEO)
- **Kategori rotası** ekle: `app/[categorySlug]/page.tsx` (veya `/c/[categorySlug]`) — SSR. Örnek: `/laptoplar`, `/laptoplar?brand=apple&ram=16gb`.
- Filtreler **URL query-param** (paylaşılabilir, bookmarklenebilir, geri-tuşu çalışır). Facet key = `attributeCode`, value = `option.value` (SEO-dostu slug).
- **Canonical**: filtresiz kategori URL'i canonical; filtreli kombinasyonlar `noindex` (crawl bütçesi patlamasını önle) veya seçili "index'lenebilir facet" allowlist'i. `rel=prev/next` yerine canonical-to-clean-URL.
- Header arama kutusu (`name="q"`) → `/arama?q=` veya kategori sonuç sayfası (hazır bağlanma noktası; şu an tüketilmiyor).

### 7.2 Bileşenler
- **Filter sidebar** (desktop): dinamik facet listesi (checkbox/swatch/range/toggle), her opsiyonda count. `facets` yanıtından render.
- **Mobile filters**: bottom-sheet/drawer; "Uygula" ile tek navigasyon (her tıkta değil).
- **Active filters** çip satırı: kaldırılabilir pill'ler + "Tümünü temizle".
- **Breadcrumb**: kategori path'i (`categoryPath` → isimler). Şu an yalnız PDP'de var; PLP'ye eklenir.
- **Result count**: `pagination.total`.
- **Sort dropdown**: server-side sort (§ sıralama).
- **Pagination**: SEO için **numaralı sayfalama** (SSR, crawl edilebilir linkler) **default**; "Daha fazla yükle"/infinite scroll opsiyonel UX katmanı (ama SEO ve derin-link için numaralı kalır). Trade-off aşağıda.

### 7.3 Infinite scroll vs numaralı — trade-off
- Infinite scroll: mobil UX iyi; ama SEO zayıf (crawler derin ürünlere ulaşamaz), derin-link/geri-tuşu kırılır, "kaçıncı sayfadaydım" kaybolur.
- Numaralı: SEO + paylaşılabilirlik güçlü; UX biraz daha statik.
- **Öneri:** URL'de `page` otoriter (SSR, crawl edilebilir) + üstüne **isteğe bağlı** client "daha fazla yükle" (URL'i günceller). İkisinin iyisi; index numaralı sayfalardan yürür.

### 7.4 SSR & Cache
- Kategori sayfaları **ISR/`revalidate`** + **cache tag** (`store:{id}:category:{id}`) ile — anonim trafik CDN'den; kampanya/stok değişince tag invalidasyonu.
- `getPublic`'in `cache: "no-store"`'u katalog listeleri için `next: { revalidate, tags }`'a taşınır (fiyat/stok hassas uçlar hariç).
- Facet yanıtı Redis'te kısa-TTL cache (§11).

---

## 8. Admin Tasarımı

Mevcut sistemle entegrasyon — **çoğu bayrak zaten var, yalnız tüketilecek + birkaç alan eklenecek:**

- **`filterable`**: `ProductFacetValue`'ya yansıma + storefront facet üretimi (bu attribute facet olur).
- **`searchable`**: `searchVector`'a dahil edilme + ağırlık (title=A sabit; searchable attribute'lar=C). Admin bunu kategori-attribute modalında zaten toggle'lıyor.
- **`comparable`**: PDP karşılaştırma tablosu (Faz sonrası; şimdilik yalnız işaretleme korunur).
- **`visibleOnListing`**: PLP kartında attribute rozeti (ör. "16GB RAM" kart üstünde).
- **Yeni (küçük) alanlar** `CategoryAttribute`'a: `facetDisplayType` (CHECKBOX/SWATCH/RANGE/BOOLEAN — dataType'tan türetilebilir ama override faydalı), `facetDisplayOrder` (`displayOrder` yeniden kullanılabilir). Additive.
- **Facet önizleme**: admin kategori ekranında "bu kategoride şu facet'ler çıkacak" önizlemesi (read-model'den count'lu).
- **(Faz E)** Synonym yönetimi ekranı (`SearchSynonym`) + sıfır-sonuç arama raporu (`SearchQueryLog`).

`store-admin-web` koyu-cam UI kit yerel; paylaşılan `@commerce-os/ui`'ye dokunulmaz.

---

## 9. Performans Analizi

- **N+1 elenir**: read-model'de 1 satır/ürün fiyat aralığı + stok + kategori path taşır → PLP tek sorgu (mevcut varyant-N+1 ve "tüm envanteri çek" ortadan kalkar).
- **Facet count maliyeti**: en pahalı kısım. `ProductFacetValue` üzerinde, aktif-filtre-kümesi ürün id'leriyle `JOIN + GROUP BY`. Maliyet ~ O(eşleşen ürün × ilgili facet satırı). N facet için tek sorguda `GROUP BY (attributeDefinitionId, optionId)` — facet başına ayrı sorgu değil. Kendi-facet-hariç kuralı, "seçili facet için full-set, diğerleri için filtreli-set" → pratikte 1 (veya seçili-facet sayısı kadar) agregasyon sorgusu.
- **Metin araması**: `tsvector @@ to_tsquery` GIN ile logaritmik; trgm `%` similarity GIN trgm ile.
- **Hedef p95** (< ~100K ürün/store): arama+facet < ~150ms. Ölçüm Faz A'da `EXPLAIN ANALYZE` ile doğrulanır.
- **Sync maliyeti**: worker job'u ürün başına 1 doc upsert + facet satırları replace (delete-by-product + insert). Toplu (bulk import) için batch.

---

## 10. Index Stratejisi

`ProductSearchDocument`:
- `GIN (searchVector)` — keyword.
- `GIN (title gin_trgm_ops)` — autocomplete/typo (+ opsiyonel `sku` trgm admin için).
- `BTREE (storeId, status)` — temel tenant+görünürlük taraması (partial: `WHERE status='ACTIVE'` düşünülebilir).
- `BTREE (storeId, primaryCategoryId)` — kategori PLP.
- `GIN (categoryPath)` — hiyerarşik "alt kategoriler dahil" (Int[]/text[] `@>`).
- `BTREE (storeId, minPriceMinor)` — fiyat sırala/filtre.
- `BTREE (storeId, createdAt DESC)` / `(storeId, popularityScore DESC)` / `(storeId, salesCount DESC)` — sıralama.

`ProductFacetValue`:
- `BTREE (storeId, attributeDefinitionId, optionId)` — facet count GROUP BY (kapsayıcı).
- `BTREE (storeId, productId)` — reprojection delete.
- Numeric range için `(storeId, attributeDefinitionId, numericValue)`.

Mevcut tablolara **ek indeks önerisi (canlı admin arama için, read-model'e geçilene dek):** `Product` title trgm, `ProductVariant` sku/barcode trgm — ama tercih read-model.

Query-plan doğrulaması Faz A DoD: `EXPLAIN (ANALYZE, BUFFERS)` ile GIN/BTREE kullanımı kanıtlanır (seq-scan yok).

---

## 11. Cache Stratejisi

Çok-katmanlı, hepsi **store-scoped**:

1. **CDN / Next ISR** — anonim PLP HTML: `revalidate` + cache tag (`store:{id}:cat:{id}`). Kampanya/stok/ürün değişince tag purge (worker job'undan).
2. **Redis facet cache** — key: `facets:{storeId}:{categoryId}:{normalizedFilterHash}`; kısa TTL (ör. 30–60sn) + event invalidation (ürün reproject → ilgili kategori facet key'lerini sil). Facet count en pahalı iş; yüksek isabet oranı.
3. **Read-model kendisi** = katalog için materialized cache (canlı tablo değil).
4. **Suggest cache** — popüler prefix'ler agresif TTL.
- Fiyat/stok-hassas checkout yolları **cache'lenmez** (sunucu-otoriter kalır).
- Invalidation kaynağı: worker reprojection job'u, değişen ürünün kategori/store cache tag'lerini de purge eder → tutarlılık ~saniye.

---

## 12. Fazlara Bölünmüş İmplementasyon Planı

| Faz | Kapsam | Çıktı | Bağımlılık |
|---|---|---|---|
| **A — Read-model & Provider temeli** | Prisma: `ProductSearchDocument` + `ProductFacetValue` + enum + `pg_trgm`; `SearchProvider` portu + `PostgresSearchProvider`; worker `search-indexer` job + reprojection; **tüm mevcut ürünleri backfill**; migration + indeks + `EXPLAIN` doğrulaması | Backend, storefront değişmez | Prisma, BullMQ, worker |
| **B — Arama + Facet uçları** | `GET .../catalog/search` (q, category, brand, price, availability, sort) + **dinamik facet + count** (`CategoryAttribute.filterable`); `catalog/suggest` iskeleti; allowlist projeksiyon | Public API | A |
| **C — Storefront PLP** | Kategori rotaları + URL-driven filtre; filter sidebar; mobile drawer; active filters; breadcrumb; result count; numaralı pagination (+ops. daha-fazla-yükle); SSR/ISR + cache tag | Storefront | B |
| **D — Admin entegrasyonu** | `filterable/searchable/comparable/visibleOnListing` tüketimi; `facetDisplayType` + facet önizleme; admin ürün araması (SKU/barcode) | store-admin | B |
| **E — Relevance** | Synonym tablosu + admin; typo (trgm) tuning; autocomplete/suggest tam; `SearchQueryLog` + sıfır-sonuç raporu; popularity/best-seller/most-viewed sinyalleri (orders/telemetry beslemesi) | Backend+admin | B/C |
| **F — Scale-out (opsiyonel)** | `OpenSearchProvider` (aynı port); read-model → OpenSearch mirror; provider feature-flag; AI/vector/LTR ranking `rankingStrategy` | Ops, altyapı | Eşik aşılınca |

Her faz kendi ADR-follow-up + gate (db:generate → build → typecheck) + docker smoke ile kapanır (worktree/turbo gotcha kurallarına uygun).

---

## 13. ADR-079 Taslağı

> **ADR-079 — Search & Filtering Engine: PostgreSQL-native denormalize arama okuma-modeli + `SearchProvider` portu; dinamik facet `CategoryAttribute` üzerinden; OpenSearch ertelenmiş upgrade-path (Faz 2C-8 / TODO-154)**

**Bağlam.** Public katalog tümüyle bellek-içi tarama + JS slice + varyant N+1 ile çalışıyor; metin araması, kategori-filtresi, facet, gerçek pagination yok. `CategoryAttribute` üzerinde `filterable/searchable/comparable/visibleOnListing` bayrakları tanımlı ama tüketilmiyor. Storefront filtre/sıralama tümüyle client-side, URL-senkronsuz. Enterprise referanslar (Amazon/Shopify/commercetools/Adobe/BigCommerce/Trendyol/Hepsiburada) transaksiyonel DB'den ayrık bir arama okuma-modeli besleyip facet'i onun üzerinde üretiyor.

**Karar.**
1. Denormalize **`ProductSearchDocument`** (1 satır/ürün: tsvector + fiyat aralığı + stok + kategori path + ranking sinyalleri) ve flat **`ProductFacetValue`** (facet count iş atı) read-model'i kur; mevcut **BullMQ worker** ile event-driven besle. Katalog gezinme için **eventual consistency** kabul; fiyat/stok checkout'ta canlı-otoriter kalır.
2. Sorgu/facet mantığını **`SearchProvider` portu** ardına koy; gün-1 tek implementasyon **`PostgresSearchProvider`** (PG16 + `pg_trgm` + GIN/tsvector). OpenSearch **ertelenir**, portun ikinci additive implementasyonu olarak (Faz F).
3. **Facet tümüyle dinamik**, `CategoryAttribute.filterable`'dan türetilir — **hardcode filtre yok**. Kategori değişince facet seti + count'lar değişir. Facet count "kendi-facet-hariç" kuralıyla.
4. Yeni public uçlar (`catalog/search`, `catalog/suggest`) **mevcut allowlist projeksiyonunu miras alır**; `costMinor/netPriceMinor/mediaId/storageKey` sızmaz. Mevcut uçlar korunur.
5. Filtreler **URL query-param** (SEO/paylaşılabilir); kategori rotaları + canonical/noindex crawl-bütçe politikası.
6. Ranking `rankingStrategy` ile pluggable — gelecekte AI/LTR/vektör'e açık.

**Sonuçlar.** (+) Facet O(satır), N+1 elenir, motor-swap ucuz, hardcode-sız, mevcut yatırım kaldıraç. (−) Read-model sync + backfill + tutarlılık gecikmesi; kampanya-etkin fiyat facet'i ek iş (P-C+). **Reddedilenler:** canlı-EAV facet (join patlaması), gün-1 OpenSearch (erken ops yükü), harici SaaS (egemenlik/maliyet).

**Kapsam dışı (TD):** kampanya-etkin fiyat aralığı facet'i; PRE_ORDER/COMING_SOON besleyen ürün bayrakları; comparable PDP tablosu; çok-dilli analyzer; cross-store arama; vektör/semantik arama.

---

## 14. Risk Analizi

| Risk | Etki | Olasılık | Azaltım |
|---|---|---|---|
| **Read-model drift** (canlı ile arama-modeli tutarsızlaşır) | Yanlış fiyat/stok/facet gösterimi | Orta | Idempotent reprojection; değişiklik event'lerini worker'a bağla; periyodik full-resync job; checkout canlı-otoriter (drift keşifte kalır, satışa geçmez) |
| **Facet count maliyeti** (çok facet/yüksek kardinalite) | Yavaş PLP | Orta | Flat facet tablosu + kapsayıcı indeks; Redis facet cache; `filterable`-allowlist; `EXPLAIN` DoD |
| **SEO crawl patlaması** (filtre kombinasyon URL'leri) | Crawl bütçesi israfı, indeks kirliliği | Yüksek | Canonical→temiz URL; filtreli kombinasyon `noindex`; index'lenebilir facet allowlist'i |
| **Backfill/migration** (mevcut ürünlerin ilk projeksiyonu) | Eksik/yanlış ilk indeks | Orta | Tek-seferlik toplu reprojection job; idempotent upsert; doğrulama sayacı (product count == doc count) |
| **Kampanya-etkin fiyat facet'i** (zaman-bağlı, stackable indirim) | "İndirimli fiyat" filtresi yanıltıcı | Orta | P1'de facet base/list fiyat üstünde; kampanya değişince reproject (P-C+); `hasDiscount` bool ile başla |
| **Varyant vs ürün facet semantiği** (Beden varyant-düzeyi, Marka ürün-düzeyi) | "Kırmızı VE 42 beden var mı" yanlış eşleşme | Orta | Facet-value'da variant-scope işareti; varyant-düzeyi facet'te "bir varyantı eşleşen ürün" semantiği net dokümante; combination-aware sorgu (ileri faz) |
| **Eventual consistency algısı** (admin ürünü değiştirir, aramada gecikir) | Kafa karışıklığı | Düşük | Sub-saniye sync hedefi; admin'de "indeksleniyor" göstergesi opsiyonel |
| **Tenant izolasyon sızıntısı** (facet count cross-store) | Veri sızıntısı | Düşük | Her sorgu/indeks storeId-prefix zorunlu; contract testleri; MemoryDataAccess ile izolasyon testi |
| **Cache invalidation storm** (çok store/kategori purge) | Redis/CDN yükü | Düşük | Tag-bazlı granular purge; TTL tabanı; değişen kategoriye scope'lu |
| **OpenSearch erken getirme baskısı** | Gereksiz ops karmaşıklığı | Orta | Net eşikler (§4.1); port hazır ama flag kapalı; karar metrik-tetikli |

---

## Onaylanan kararlar (kilitli)

Kullanıcı onayıyla (2026-07-19) üç yön netleşti:

1. **Motor**: ✅ **PG-native read-model + `SearchProvider` portu**; OpenSearch ertelenmiş upgrade-path (Faz F, §4.1 eşikleri).
2. **İlk faz kapsamı**: ✅ **Faz A tek başına** — read-model (`ProductSearchDocument` + `ProductFacetValue`) + provider + worker sync + backfill + indeks/`EXPLAIN`. Storefront/API kontratı bu fazda değişmez. Arama/facet uçları (Faz B) ayrı PR.
3. **PLP sayfalama/SEO**: ✅ **Numaralı (SSR, otoriter `page`, crawl edilebilir) + opsiyonel client "daha fazla yükle"** (Faz C).

> Bu belge yalnız analiz + onaylı mimaridir. Sıradaki adım: **Faz A** implementasyonu.

---

## Faz A (2C-8A) — Uygulandı (worktree; commit/deploy YOK)

ADR-079 kararlarıyla Search Read-Model Foundation uygulandı. Özet:

- **Prisma (additive)**: `ProductSearchDocument` (+ `tsvector` GENERATED STORED) + `ProductFacetValue` (single-value CHECK) + enum `SearchAvailabilityState` + `pg_trgm` + GIN/trgm/btree indeks. Migration `20260719120000_add_search_read_model` (yapı-only; runtime backfill).
- **`services/search-service`**: `SearchProvider` portu + `PostgresSearchProvider` + deterministik SAF `buildSearchDocument` + bounded-batch `data.ts` + backfill CLI. (`docs/SERVICE_BOUNDARIES.md` rezervasyonu dolduruldu.)
- **`packages/queues`**: `search-index` kuyruğu + `enqueueSearchIndexJob`; **`packages/contracts`**: `searchIndexJobSchema`.
- **`apps/worker`**: `search-index` işleyicisi (provider'a dispatch; idempotent + retry).
- **`apps/api-gateway`**: fire-and-forget emitter + 10 mutation noktasında reindex tetiği (ürün/varyant/inventory/attribute-value/eksen/generation/identity/commercial + kategori-attribute/attribute şema → store-batch).
- **Testler**: search-service 35 + queues 6 + api-gateway trigger 6; api-gateway tam suite 1017 (regresyon yok).
- **Gerçek-PG smoke**: index/fiyat/stok/facet delete-and-replace/archive→removed/tsvector FTS/EXPLAIN (Index Only Scan)/cascade cleanup — hepsi PASS. Event-driven smoke: enqueue→worker→read-model PASS. Backfill CLI: DRAFT hariç + idempotent PASS.
- **Yakalanan bug**: deterministik jobId (`:` yasak + BullMQ tamamlanmış-job dedup'u change-stream'i bozuyordu) → **otomatik jobId + idempotent işleme**ye çevrildi.

> **Kod worktree'de bırakıldı; commit/push/PR/merge/deploy YAPILMADI.** Docker container rebuild (worker+api-gateway → 7/7) deploy-checkpoint adımıdır; migration dev-DB'ye deploy edildi ve çalışan main-stack (7/7 healthy, `/health` 200, public catalog 200) additive migration'dan etkilenmedi.

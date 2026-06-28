# Phase Log

## Faz 3A.1 Public Catalog Read Endpoint (TD-032 / TODO-061)

- Tarih: 2026-06-25
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: F3A'da vitrin canli katalogu gecici platform-admin (yuksek yetkili) sunucu-tarafi token
  resolver ile okuyordu — PROD BLOCKER (TD-032). Bu is, gateway'de AUTH GEREKTIRMEYEN, store-scoped,
  salt-okunur public katalog ucu ekleyip vitrini token resolver'dan tamamen kopartir. Kapsam disi:
  cart/checkout/payment/shipping, review/Q&A, media pipeline, DB migration, buyuk UI polish.
- Gateway (`apps/api-gateway/src/server.ts`): iki yeni public uc (auth YOK, yalniz GET):
  `GET /public/stores/:storeSlug/products` ve `GET /public/stores/:storeSlug/products/:productSlug`.
  Store slug ile cozulur; store yok/ACTIVE degil -> guvenli 404; yalniz ACTIVE store + ACTIVE urun/
  varyant doner. Govde `publicProduct*` ALLOWLIST semalariyla `parse` edilir (ic/yonetim alanlari
  dusturulur). Fiyat gizliligi HIDDEN/ON_REQUEST'te numerik fiyat gateway'de null'lanir.
- Kontratlar (`packages/contracts`): `publicProductVariantSchema`, `publicProductSchema`,
  `publicProductListResponseSchema`, `publicProductDetailSchema` + tipleri eklendi; `packages/api-client`
  bu tipleri (type-only) re-export eder.
- Storefront (`apps/storefront-web`): katalog cozumleyici (`lib/server/catalog.ts`) artik public
  uclari TOKEN'SIZ (`fetch`, Authorization yok) cagirir ve public DTO'yu mevcut vitrin gorunum
  modellerine cevirir (sales-model CTA + para bicimlendirme korundu). Gecici token modulu
  (`lib/server/api-token.ts`) silindi; `env.ts`'ten platform kimligi cikarildi; docker-compose ve
  `.env.example`'dan `STOREFRONT_PLATFORM_EMAIL/PASSWORD` kaldirildi. Vitrin `createApiClient`/Bearer/
  platformLogin KULLANMAZ. Sayfalar (`/`, `/products`, `/products/[handle]`) ve placeholder cart/
  checkout davranisi degismedi.
- Karar kaydi: ADR-030. Backend business logic, DB modeli ve mevcut admin kontratlari degismedi.

### Dogrulananlar

- Testler: gateway public katalog (9 yeni `it`: auth'suz list/detail 200, draft/inactive haric,
  cross-store izolasyon, salesMode kontrat alanlari, HIDDEN/ON_REQUEST fiyat gizleme, admin/internal
  alan yoklugu, store/inactive-store/product 404). Storefront resolver testi public `fetch` mock'una
  yeniden yazildi (Authorization header yok, fiyat gizliligi sizmaz, no-store/unknown-handle/5xx).
  Mevcut sales-model/product-card/listing/detail/locale testleri korundu.
- Gate: `pnpm db:generate` + `pnpm build` (24/24) + `pnpm typecheck` (0) + `pnpm lint` (34/34) +
  `pnpm test` (api-gateway 33, storefront 33 dahil tum task) + `git diff --check` temiz.
- Docker smoke: 7 servis healthy. api-gateway `/health` 200; `/public/stores/demo-store/products` ve
  `/.../demo-hoodie` auth'suz 200; bilinmeyen store/product 404; POST 404 (read-only). Storefront
  `/` `/products` `/products/demo-hoodie` `/cart` `/checkout` 200; gecersiz handle graceful 200
  (vitrin empty state). `/products` canli Demo Hoodie + ₺1.299 render. Gateway log: vitrin trafigi
  YALNIZCA `/public/*`'a gider (platform-admin login/`/stores/:id/*` cagrisi yok). HTML ve `.next/
  static` bundle'da token/Bearer/createApiClient/platformLogin/credential YOK; tek `SUPER_ADMIN`
  esmesi paylasimli i18n rol-etiketidir (`packages/i18n`, bu degisiklikten bagimsiz, gizli deger degil).
- Sonuc: TD-032 RESOLVED, public catalog read endpoint prod blocker cozuldu; F3B'ye gecilebilir.

## Faz 2I Store-admin Products & Orders Premium UI Polish

- Tarih: 2026-06-25
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: Store-admin ürün ve sipariş ekranlarinin (`/products`, `/products/[id]`, `/orders`,
  `/orders/[id]`) gorsel kalitesini "Apple glass-inspired" premium SaaS dilinde yukseltmek.
  Yalnizca stil/layout/kompozisyon polish; islev, backend business logic, yeni API endpoint,
  DB model/migration, storefront checkout/cart ve payment/shipping/fulfillment kapsam disidir.
  Entity detail = dedicated route/page standardi (ADR-027) korundu; detay modal'a donulmedi.
- Tasarim dili: light-first, kirik beyaz zemin uzerinde translucent cam yuzeyler (`bg-white/70`,
  `backdrop-blur-xl`, `ring-1 ring-slate-200/70`, ince white/silver kenar, dusuk yogunluklu katmanli
  golge). `#9743CD` marka vurgusu yalnizca CTA/accent/aktif gostergede. Asiri gradient/neon/dark yok.
- Yeni app-local primitive'ler (`apps/store-admin-web/app/components/premium.tsx`): `GlassPanel`,
  `SurfaceCard`, `DetailHero`, `MetricTile`, `MetricGrid`, `DetailLayout`, `RailCard`, `RailRow`,
  `Timeline`, `TimelineItem`. Store-admin'e ozel oldugundan app-local tutuldu (ortaklasirsa
  `packages/ui`'ye tasinabilir).
- Products list: PageHeader + canli listeden hesaplanan dort ozet tile (toplam / aktif / satin
  alinabilir / katalog-only), rafine satis kolonu (sales mode badge + purchasable rozeti + price
  visibility/aksiyon), cam yuzeyli tablo karti. Create modali ve `/products/[id]` detay linki korundu.
- Product detail: DetailHero (baslik, slug, durum + satis rozetleri, kaydet, ürünlere dön) + iki
  kolon: solda temel bilgiler formu ve varyantlar; sagda kompakt baglam rayi (satis profili, stok
  profili, künye, yönetim notu). Satis davranisi bolumu form icinde belirgin sub-surface oldu.
- Orders list: bes ozet tile (toplam / taslak / işlemde / iptal / toplam ciro — canli listeden),
  cam yuzeyli tablo karti, korunan status/payment/fulfillment rozetleri ve satir lifecycle aksiyonlari.
- Order detail: DetailHero (sipariş no, müşteri, status/payment/fulfillment rozetleri, place/cancel) +
  operasyon ozeti tile'lari (total / kalem sayisi / rezervasyon durumu / oluşturma) + iki kolon: solda
  kalemler, tutar özeti ve premium event timeline; sagda müşteri bilgileri, adresler, rezervasyonlar ve
  künye rayi. Lifecycle copy/loading state korundu.
- i18n: `storeAdmin.products.summary`, `storeAdmin.products.detail.rail`, `storeAdmin.orders.summary`,
  `storeAdmin.orders.detail` (overview/tiles/rail/metadata) TR kaynak + EN ayna eklendi; tam tr/en
  key parity korundu. Hicbir ham API kodu UI'da gosterilmez.

### Dogrulananlar

- Testler: products list ozet tile render, product detail hero + sag ray (satis profili/künye/yönetim
  notu) render, orders list operasyon ozeti tile render, order detail ozet tile + müşteri/künye ray
  render eklendi; mevcut detay-route/modal-yok, sales model, lifecycle ve locale=en testleri korundu.
- Gate: `pnpm db:generate` + `pnpm build` (24/24) + `pnpm typecheck` (0) + `pnpm lint` (34/34) +
  `pnpm test` (34/34 task; store-admin 72, i18n 34) gecti. BFF/security ve i18n parity testleri yesil.
- Backend/BFF kontratlari, auth/session/CSRF ve token gizliligi degismedi (UI-only faz).

## Faz 2H Entity Detail Pages Route Standardization

- Tarih: 2026-06-25
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: Ana entity detay ekranlari modal yaklasimindan cikarilip dedicated route/page standardina
  tasindi ve kural kalici olarak dokumante edildi (ADR-027). Frontend/UI agirlikli; backend
  order/catalog business logic, DB model/migration ve BFF guvenlik kontratlari degismedi. Payment/
  shipping/fulfillment, storefront checkout/cart ve inquiry/appointment modelleri kapsam disidir.
- Kural (ADR-027): Detail = dedicated route/page; Modal = kisa create/edit/confirm/adjust. Sipariş,
  ürün, müşteri, mağaza, stok, varyant, plan gibi detay ekranlari modal olamaz. Uzun form, timeline,
  finansal özet, tablolu detay, lifecycle aksiyon veya audit/event iceren ekran route/page zorunludur.
- Orders: `/orders` listesindeki detay modali kaldirildi; "Detay" artik `/orders/[id]` route'una
  linklenir (gercek `href`). Yeni `/orders/[id]` detail page PageHeader (sipariş no, açiklama, listeye
  dön linki, status/payment/fulfillment rozetleri, DRAFT→place / PLACED-CONFIRMED→cancel aksiyonlari)
  + müşteri, tutar özeti, sipariş kalemleri, adresler, rezervasyonlar ve event timeline bölumlerini
  dogal sayfa scroll'u ile gosterir. Liste place/cancel hizli aksiyonlari korundu; kisa "yeni taslak
  sipariş" modali kaldi ve create sonrasi `/orders/[id]`'e yonlendirir.
- Products: `/products` listesindeki ürün düzenleme + varyant yonetimi modallari kaldirildi; "Detay"
  artik `/products/[id]` route'una linklenir. Yeni `/products/[id]` detail/edit page temel bilgiler +
  kategoriler + satis davranisi (F2D/F2F alanlari) formunu, inline varyant bölumunu ve stok özeti
  baglantisini barindirir; kaydet aksiyonu PageHeader'da. Ürün create modali bu fazda kaldi ve create
  sonrasi `/products/[id]`'e yonlendirir. Form mantigi `product-form.tsx` (paylasilan ProductForm) ve
  `variants-manager.tsx` (inline VariantsSection + kisa VariantEditor modali) olarak ayristirildi.
- BFF: Yeni `GET /api/catalog/products/[productId]` proxy'si eklendi (store context server-side,
  `admin.products.get`, token sizmaz). `storeApi.getProduct` istemci helper'i eklendi. Mutating
  route'larin CSRF korumasi ve mevcut order place/cancel akislari degismedi.
- Customers/inventory/store/plan: Bu fazda canli detay implement edilmedi; dedicated route hedefleri
  TODO'ya yazildi (TODO-050..054). admin-web stores/plans hala create/edit modali kullanir (detay
  ekrani degil); F2H kapsami disinda, TD-031 altinda takip edilir.
- i18n: `storeAdmin.orders.detail.backToList/notFound` ve yeni `storeAdmin.products.detail.*`
  (backToList, pageDescription, loadError, notFound, savedToast, saveAction, basicInfoTitle,
  basicInfoSubtitle, categoriesTitle, variantsTitle, inventoryTitle, inventoryNote, inventoryLink) +
  `products.detailAction` TR/EN tam paritede eklendi. Ham API kod UI'da gosterilmez.
- Testler: `orders-ui.test.tsx` detay modal testleri route/link testine cevrildi; yeni
  `order-detail-page.test.tsx` (lines/totals/events, DRAFT place / PLACED cancel / CANCELLED gizleme,
  TR+EN, no invalid nesting) ve `product-detail-page.test.tsx` (sales-behavior alanlari render, save
  update body, lokalize backend hata, inline varyant create, TR+EN) eklendi.
  `store-admin-interactions.test.tsx` ürün edit/varyant modal testleri route linkine cevrildi; create
  modali testleri korundu. Tum app'lerde `next/navigation` mock'landi.
- Gate: `pnpm db:generate`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (turbo, 34/34
  task; store-admin 70/70 test) gecti.

## Faz 2G Store Admin Orders UI

- Tarih: 2026-06-25
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: F2C order/reservation core'u `apps/store-admin-web` sipariş ekranina baglandi. `/orders`
  placeholder'dan canli listeye cevrildi; detay modal + yasam dongusu aksiyonlari + lean taslak
  sipariş olusturma eklendi. Bu faz frontend/UI agirliklidir; backend order/catalog business logic
  degistirilmedi.
- Orders list: Sipariş No, Müşteri/e-posta, Toplam, order/payment/fulfillment durum rozetleri, kalem
  adedi ve İşlemler kolonlari. Loading skeleton, lokalize error + retry, empty state, refresh ve
  uygun durumlarda satir bazli Place/Cancel aksiyonlari.
- Order detail: Paylasilan Modal (scroll fix) icinde sipariş no, customer email, durum rozetleri,
  tutar özeti (subtotal/discount/shipping/tax/total/currency), order lines (sku/title/variantTitle/
  quantity/unit price/line total), shipping/billing adres kartlari (varsa), stok rezervasyonlari
  (varsa; yoksa kapsam notu) ve order events timeline. DRAFT icin "Siparişi ver", PLACED/CONFIRMED
  icin "İptal et"; CANCELLED/FULFILLED icin bilgilendirme ve aksiyon gizleme.
- Create draft (Secenek A, minimal): "Yeni taslak sipariş" modali stok (inventory) listesinden
  varyant seçer (`SKU — başlık`), müşteri e-postasi + adet alir, çok kalem destekler ve
  `createOrder` ile draft olusturup detayini açar. Stoklu varyant yoksa lokalize uyari + submit
  kapali.
- BFF: `/api/orders` (GET list, POST create), `/api/orders/[id]` (GET), `/api/orders/[id]/place`
  (POST), `/api/orders/[id]/cancel` (POST). Store context server-side cozulur (client storeId
  gondermez), GET'ler CSRF istemez, mutating route'larda double-submit CSRF zorunlu, hatalar
  `{ error: { code } }` formatinda lokalize edilir, bearer token client'a sizmaz.
- api-client/contracts: F2C'de eklenen `admin.orders` helper'lari ve order tipleri oldugu gibi
  kullanildi; bu pakette degisiklik yapilmadi.
- i18n: `storeAdmin.orders` namespace'i list/detail/form/lifecycle copy + order/payment/fulfillment/
  reservation durum etiketleriyle genisletildi. Yeni hata kodlari: ORDER_NOT_FOUND,
  ORDER_INVALID_STATUS, ORDER_LINE_NOT_FOUND, ORDER_NUMBER_CONFLICT, ORDER_INSUFFICIENT_STOCK,
  ORDER_RESERVATION_FAILED, ORDER_ALREADY_PLACED, ORDER_ALREADY_CANCELLED, ORDER_MUTATION_NOT_ALLOWED,
  CUSTOMER_NOT_FOUND, PRODUCT_ORDER_QUANTITY_OUT_OF_RANGE. TR/EN tam key paritesi korundu.
- Testler: store-admin-web BFF testlerine orders proxy kapsamasi (401/CSRF 403/place+cancel CSRF ile
  api-client'a gider/token sizmaz/storeId server-side); yeni `orders-ui.test.tsx` (loading/empty/error,
  TR+EN durum rozetleri, DRAFT place / PLACED cancel / CANCELLED gizleme, lokalize aksiyon hatasi,
  detay modal lines+tutar+events render, Modal scroll fix regresyonu, create draft). i18n parity
  testlerine order copy + lifecycle hata kodu kapsamasi eklendi.
- Gate: `pnpm db:generate`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (turbo, 34/34
  task) gecti.
- Runtime: `docker compose up -d --build store-admin-web` (7 servis healthy), store-admin
  `/api/health` 200. Canli BFF smoke (store-admin-web uzerinden): platform admin login 200; orders
  list 200 (bos); draft order create 201 (OS-000009, total ₺2.598,00); place sonrasi PLACED +
  reservation ACTIVE, available 15→13 (reserved stock artti); cancel sonrasi CANCELLED + reservation
  RELEASED, available 13→15. Negatif: place CSRF'siz 403, list cookie'siz 401, detay govdesinde
  bearer token 0 kez. `db:verify-seed` gecti.
- Bilinen artik: Canli smoke tek bir CANCELLED order (OS-000009, customerEmail `smoke@example.local`)
  birakir; cleanup-smoke prefix'leriyle (`smoke-`/`test-` vb.) eslesmedigi icin geri alinmadi.
  Stok/seed etkisi yok (rezervasyon RELEASED, verify-seed gecer). TD'ye not dusuldu.
- Kapsam disi: Backend order/catalog business logic, payment provider, shipping/fulfillment,
  storefront checkout/cart, invoice/refund/return, marketplace, public order tracking, e-posta
  bildirimi, placed-order ileri duzey duzenleme, multi-warehouse, production deploy.

## Faz 2D Product Sales Model Foundation

- Tarih: 2026-06-24
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: Product modeline sales model foundation eklendi: `ProductSalesMode`,
  `ProductPriceVisibility`, `ProductPrimaryAction`, yardimci flow flag'leri, `purchasable`, min/max
  order quantity ve CTA/template/not alanlari. Migration mevcut urunleri
  `ONLINE/VISIBLE/ADD_TO_CART/purchasable=true` defaultlariyla korur.
- Contracts/API: `packages/contracts` product create/update/response schema'lari genisletildi;
  tutarlilik kurallari eklendi (`ONLINE` urunler add-to-cart + visible/starting-from; `purchasable=false`
  online urunu order'a kapatir, `WHATSAPP` icin `primaryAction=WHATSAPP` ve `whatsappEnabled=true`,
  `HIDDEN/ON_REQUEST` icin `purchasable=false`). Product list/get/create/update response'lari yeni
  alanlari doner.
- Order guard: order create, add-line, update-line quantity ve place akislari product/variant ACTIVE
  durumunu ve product sales davranisini kontrol eder. Online satin alma disi urunler stabil kodlarla
  reddedilir: `PRODUCT_NOT_PURCHASABLE`, `PRODUCT_REQUIRES_INQUIRY`,
  `PRODUCT_REQUIRES_APPOINTMENT`, `PRODUCT_REQUIRES_WHATSAPP`, `PRODUCT_CATALOG_ONLY`.
- Seed/cleanup: Demo Hoodie ve Demo Tote Bag online/visible/add-to-cart defaultlariyla idempotent
  guncellenir; verify-seed bu alanlari dogrular. `f2d-smoke-` cleanup prefix'i eklendi.
- Kapsam disi: Store-admin urun formu baglama, storefront CTA render, inquiry request modeli,
  appointment request modeli, WhatsApp store contact config, checkout/payment/shipping/marketplace.
- Dokuman: ADR-025, Roadmap, Architecture, Service Boundaries ve TODO guncellendi.
- Final review (2026-06-24): Product PATCH consistency mevcut urun + partial update adayi uzerinden
  tekrar dogrulanacak sekilde sertlestirildi; tek alanla tutarsiz sales mode gecisi `VALIDATION_ERROR`
  doner. `ONLINE/purchasable=false` bilincli order kapatma flag'i olarak kabul edilir ve order create
  `PRODUCT_NOT_PURCHASABLE` ile bloklanir. Runtime `.mjs` seed/verify scriptleri TS kaynakla
  esitlendi; demo catalog `onlineProducts=2` dogrulamasi container icinde calisir.
- Runtime gate: `docker compose -f infra/docker/docker-compose.yml up --build -d`, `pnpm db:migrate`,
  `pnpm db:seed`, `pnpm db:verify-seed` gecti. Canli smoke: platform admin login 200; product list
  sales model alanlari mevcut; demo ONLINE product ile draft order create 201; `f2d-smoke-*`
  INQUIRY/APPOINTMENT/WHATSAPP/CATALOG_ONLY/ONLINE purchasable=false urunleri beklenen stabil order
  hata kodlariyla bloklandi; product salesMode update 200; api-gateway/admin-web/store-admin-web/
  storefront-web health endpointleri 200; `pnpm db:cleanup-smoke` sonrasi `pnpm db:verify-seed`
  tekrar gecti.

## Faz 2B Store Admin Catalog UI Baglama

- Tarih: 2026-06-24
- Durum: READY_FOR_COMMIT (rapor onayina bagli)
- Kapsam: `apps/store-admin-web` dashboard/categories/products/variants/inventory ekranlari Faz 2A
  catalog/inventory endpointlerine canli baglandi. Backend/schema/API davranisi degismedi.
- Auth/BFF/store context: admin-web BFF deseni store-admin'e tasindi. Platform admin login proxy
  (`/api/auth/login`) bearer token'i store-admin'e ozel httpOnly cookie'ye yazar
  (`commerce_os_store_admin_session`); token istemci JS/UI/log/client bundle'a hic dusmez. Tum gateway
  cagrilari ayni-origin `/api/*` route handler'lari uzerinden gecer. Secili mağaza, session token ile
  `admin.stores.list`'ten server-side cozulur (`STORE_ADMIN_DEMO_STORE_SLUG` -> default `demo-store`,
  yoksa ilk mağaza); `storeId` istemci tarafindan tasinmaz. Mutating route'lar double-submit CSRF ile
  korunur. Karar: ADR-023. Store-user auth borcu TD-019'da acik kalir.
- Dashboard: canli ozet (`/api/dashboard/summary`) — toplam/aktif urun, kategori sayisi, kritik stok
  ve toplam eldeki stok server-side hesaplanir; loading skeleton, hata ve empty state. Toplamlar
  pagination'dan kesin; aktif/kritik sayimlar ilk sayfa uzerinden (TD-024).
- Kategoriler: canli list/create/update; ad/slug/parent/sortOrder/status, status badge, parent
  gosterimi, duplicate slug ve validation Turkce hata, basari sonrasi refresh. Delete/drag-drop/deep
  tree kapsam disi.
- Urunler: canli list/create/update; baslik/slug/status/marka-tedarikci/kategori, kategori atama
  (checkbox), status badge, duplicate slug/validation Turkce hata. Media/rich text/SEO panel/delete
  kapsam disi.
- Varyantlar: urun satirindan acilan modal ile list/create/update; SKU/baslik/fiyat/compareAt/barkod/
  status; fiyat TL girisi minor unit'e cevrilir (virgul/nokta ondalik destegi), compareAt < price
  ve gecersiz fiyat kontrollu Turkce hata; duplicate SKU Turkce hata; create sonrasi inventory kaydi
  otomatik (note ile bildirildi). Option matrix/generator kapsam disi.
- Stok: canli list/adjust; SKU/varyant/onHand/reserved/available/threshold, low stock badge,
  delta+reason adjustment modal; negatif stok `INVALID_INVENTORY_ADJUSTMENT` Turkce gosterilir.
  Reservation/movement timeline kapsam disi.
- i18n: tum gorunur metin `packages/i18n` storeAdmin/common'dan; yeni `storeAdmin.errors` (API
  code -> Turkce), auth/categories/variants/dashboard bloklari; ham API code UI'da gosterilmez; tr/en
  tam key parity korundu.
- Testler: store-admin-web BFF (token expose etmiyor, CSRF, store context, categories/products/
  variants/inventory proxy happy path + duplicate/negatif stok kod esleme, dashboard aggregation) +
  jsdom UI smoke (dashboard live + invalid-nesting regression, categories/products/variant create,
  inventory adjust, Turkce hata esleme) + fiyat helper unit + i18n storeAdmin copy/parity. 29 yeni
  store-admin testi gecti; admin-web (22), api-gateway (18), contracts (3), i18n (23) regresyon gecti.
- Gate: `pnpm db:generate`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — hepsi gecti.
  Client bundle taramasinda token/secret/Bearer/createApiClient sizintisi yok.

## Faz 2A Catalog + Inventory Foundation

- Tarih: 2026-06-24
- Durum: READY_FOR_COMMIT
- Kapsam: Store-scoped product/category/variant/inventory foundation modelleri, migration, platform
  admin guarded API endpointleri, Zod contract'lari, api-client helper'lari, idempotent demo catalog
  seed'i, audit log ve gateway/client/contract testleri. Store-admin UI baglama, storefront resolver,
  cart/order/checkout/payment/shipping/marketplace/media/import/export kapsam disi tutuldu.

### Eklenenler

- Prisma: `Product`, `ProductVariant`, `ProductCategory`, `ProductCategoryAssignment`,
  `InventoryItem`, `InventoryMovement` ve ilgili enum/index/foreign key'ler.
- Multi-tenant guard: product/category slug ve variant SKU store bazli unique; variant/inventory/
  movement uzerinde `storeId` bilincli denormalized.
- Fiyat karari: `priceMinor`/`compareAtMinor` integer minor unit, `currency` ISO-4217 kodu.
- API gateway: `/stores/:storeId/categories`, `/stores/:storeId/products`,
  `/stores/:storeId/products/:productId/variants`, `/stores/:storeId/inventory` endpointleri.
- Inventory: variant create inventory item olusturur; manual adjustment hareket yazar; negatif stok
  engellenir; `quantityAvailable` response'ta turetilir.
- Audit log: category/product/variant create/update ve inventory adjustment islemleri audit log yazar;
  token/secret metadata'ya yazilmaz.
- Contracts/api-client: catalog/inventory request/response schema ve store-scoped helper'lar eklendi.
- Seed: demo store icin iki kategori, iki urun, uc varyant ve stok itemleri idempotent eklendi;
  verify-seed katalog sayimlarini da kontrol eder.

### Bilinen Eksikler / Sonraki Fazlar

- Store-user auth/session ve store-admin role guard henuz yok; endpointler gecici olarak platform
  admin bearer token + explicit `storeId` ile korunur (TD-019).
- Store-admin UI baglama Faz 2B'ye birakildi (TODO-029).
- Order/reservation core Faz 2C/Faz 4'e birakildi (TODO-030, TD-021).
- Storefront resolver/public catalog Faz 3'e birakildi (TODO-031, TD-022).
- Media/options/metafields/import/export kapsam disi (TODO-032, TD-020).

### Commit Onerisi

`feat(catalog): add store catalog and inventory foundation`

### Dogrulananlar

- Baslangic repo durumu: `main`, clean working tree, `origin/main` ile senkron, tek worktree, son
  commit `9c283b6`.
- `pnpm db:generate` gecti.
- `pnpm lint` gecti (34/34 task).
- `pnpm typecheck` gecti.
- `pnpm test` gecti (34/34 task; api-gateway 18 test, api-client 12 test, contracts 3 test dahil).
- `pnpm build` gecti (24/24 task).
- `docker compose -f infra/docker/docker-compose.yml up --build -d` gecti; api-gateway, worker,
  postgres, redis, admin-web, store-admin-web ve storefront-web healthy.
- `pnpm db:migrate` gecti; `20260624120000_add_catalog_inventory_foundation` uygulandi.
- `pnpm db:seed` arka arkaya iki kez gecti.
- `pnpm db:verify-seed` gecti; katalog sayimlari: categories=2, products=2, variants=3,
  inventoryItems=3, duplicate demo slug/SKU yok.
- Canli API smoke: platform admin login `200`; categories list `200`, category create `201`,
  duplicate category slug `409 CATEGORY_SLUG_EXISTS`; products list `200`, product create `201`,
  duplicate product slug `409 PRODUCT_SLUG_EXISTS`; variant create `201`, duplicate SKU
  `409 VARIANT_SKU_EXISTS`; inventory get `200`; inventory adjust `200` + movement `ADJUSTMENT`;
  negatif stok adjustment `400 INVALID_INVENTORY_ADJUSTMENT`.
- Health smoke: api-gateway `/health`, admin-web/store-admin-web/storefront-web `/api/health` hepsi
  `200`.
- Final review (2026-06-24): Tenant isolation review'da inventory repair yolunda variant'in ayni
  store'a ait oldugu ayrica dogrulandi; cross-store inventory adjustment `404 INVENTORY_ITEM_NOT_FOUND`
  regresyon testi eklendi. `pnpm db:cleanup-smoke`, production/staging guard'ini koruyarak
  `f2a-smoke-` catalog kayitlarini temizleyecek sekilde genisletildi; cleanup sonrasi
  `pnpm db:verify-seed` yeniden categories=2/products=2/variants=3/inventoryItems=3 sonucuyla gecti.
  Concurrent adjustment/reservation race riski TD-021 altinda acik teknik borc olarak kayda alindi.

## Faz 1A Multi-Tenant API + Auth/Session Foundation

- Tarih: 2026-06-23
- Final review: 2026-06-24
- Durum: READY_FOR_COMMIT
- Kapsam: Platform admin auth/session foundation, platform admin store/plan API baslangici,
  store access helper foundation, audit log, contracts/api-client genisletmesi ve testler. Frontend
  UI baglama, commerce business logic, OAuth/2FA/password reset/refresh token ve payment/marketplace
  modulleri eklenmedi.

### Eklenenler

- `PlatformSession` modeli ve migration eklendi; raw token DB'ye yazilmaz, `tokenHash` saklanir.
- `packages/auth`: scrypt password hash/verify, `requireAuthenticatedPlatformUser`,
  `requirePlatformAdmin`, `requireStoreAccess`, `assertStoreRole`.
- `apps/api-gateway`: `/auth/platform/login`, `/auth/platform/logout`, `/auth/platform/me`;
  `/admin/stores` ve `/admin/plans` list/create/get/update endpointleri.
- Audit log: login, logout, store create/update, plan create/update.
- `packages/contracts`: auth/admin Zod schema ve ortak error response.
- `packages/api-client`: bearer token destekli auth/admin stores/plans helper'lari.
- Config/env: `SESSION_SECRET`, `SESSION_TTL_SECONDS`, `PASSWORD_HASH_PEPPER`,
  `ADMIN_AUTH_COOKIE_NAME`.
- Seed: demo platform admin parolasi scrypt hash ile idempotent guncellenir.

### Dogrulananlar

- `pnpm db:generate` gecti.
- `pnpm typecheck` gecti.
- `pnpm lint` gecti.
- `pnpm build` gecti.
- `pnpm test` gecti.
- Docker Compose image rebuild/recreate sonrasi `pnpm db:migrate` gecti; 2 migration goruldu ve
  `20260623143000_add_platform_sessions` uygulandi.
- `pnpm db:seed` arka arkaya iki kez gecti; `pnpm db:verify-seed` gecti.
- Canli API smoke: platform admin login `200`, me `200`, logout `200`, revoke sonrasi me `401`.
- Final security/runtime review'da expired session `401` ve Prisma unique race durumlari icin
  kontrollu `409` davranisi testle netlestirildi.

### Bilinen Riskler / Eksikler

- Login rate limit, brute-force korumasi ve cookie hardening henuz yok (TD-015).
- Admin UI henuz backend auth/admin endpointlerine baglanmadi (TD-016).
- Store-admin gercek endpointleri yok; store role helper'lari foundation olarak testlendi.
- Refresh token, OAuth, 2FA, password reset ve email invite flow kapsam disi.

### Commit Onerisi

`feat(api): add platform auth sessions and admin store plan endpoints`

## Faz 0 Backend Foundation Kapanis Logu

- Tarih: 2026-06-23
- Durum: READY_FOR_COMMIT

### Dogrulananlar

- Docker runtime gecti.
- PostgreSQL, Redis, API gateway ve worker healthy duruma geldi.
- Migration canli PostgreSQL uzerinde gecti.
- Seed idempotent gecti; arka arkaya calisma duplicate uretmedi.
- Seed verification gecti.
- Public `/health` ve `/version` endpointleri gecti.
- Internal DB/Redis health endpointleri token yokken `401`, token varken `200` dondu.
- `pnpm lint` gecti.
- `pnpm typecheck` gecti.
- `pnpm test` gecti.
- `pnpm build` gecti.

### Bilinen Riskler

- Frontend app'ler henuz yok.
- Gercek auth/session implementasyonu yok.
- Permission sistemi henuz gercek endpointlerde uygulanmadi.
- Tenant isolation helperlari foundation seviyesinde; gercek endpointlerde genisletilecek.
- Integration, search ve analytics servisleri skeleton seviyesinde.
- Root `db:migrate`, `db:seed` ve `db:verify-seed` komutlari Compose runtime'a bagli.
- Host Prisma CLI kullanimi ile container runtime `DATABASE_URL` farki dikkat gerektiriyor.

### Commit Onerisi

`docs: close phase 0 documentation`

## Frontend/Admin/Store UI Foundation Kapanis Logu

- Tarih: 2026-06-23
- Durum: READY_FOR_COMMIT
- Kapsam: Backend foundation uzerine frontend shell. Uc Next.js App Router app (`admin-web`,
  `store-admin-web`, `storefront-web`), paylasimli `packages/ui` design system, `packages/api-client`
  placeholder, ortak Tailwind preset, root script ve docs guncellemeleri. Commerce/business logic
  veya gercek auth EKLENMEDI.

### Design-First Yaklasimi

- Bu fazda design-first calisma kurali uygulandi: ana ekranlar once kisa "Claude Design Plan" ile
  tasarlandi, sonra kodlandi. Kural kalici proje kurali olarak `docs/PROMPT_RULES.md` (ve ADR-012)
  icine eklendi.
- Gorsel ton: light-first, premium, sade, kurumsal SaaS. Dark theme, neon/AI look, asiri gradient
  ve dashboard kalabaligindan kacinildi. Placeholder ekranlar bile baglam + beklenen modul + empty
  state ile urun kalitesinde tutuldu.

### Dogrulananlar

- `pnpm build` gecti (3 frontend app dahil; Next prerender/SSG ciktilari uretildi).
- `pnpm typecheck` gecti (tum workspace'ler, uc app dahil).
- `pnpm lint` gecti.
- `pnpm test` gecti (turbo; UI smoke testleri + app health route testleri + backend testleri).
- `pnpm test:unit` gecti (11 dosya / 25 test).
- `pnpm test:integration` gecti.
- Backend foundation bozulmadi; Docker runtime ve compose davranisi degistirilmedi.

### Bilinen Riskler / Eksikler

- Tum frontend sayfalari placeholder/empty state; gercek veri, form ve mutation yok (TD-010).
- API client auth/token icermiyor; yalnizca health/version placeholder (TD-009).
- Storefront multi-tenant store slug/domain resolver yok (TD-011).
- Frontend Docker Compose servisleri eklenmedi (TD-008).
- Frontend testleri smoke seviyesinde; jsdom etkilesim testleri yok (TD-012).

### Commit Onerisi

`feat: scaffold frontend admin/store/storefront UI foundation`

### Final Local Smoke Review (2026-06-23)

- Uc app lokal dev'de calistirildi (`pnpm dev:admin/:store-admin/:storefront`).
- Health endpointleri: `:3001`, `:3002`, `:3000` `/api/health` -> 200, dogru `service`+`status`.
- Route smoke: tum admin (5), store-admin (8) ve storefront (home, list, detail, bilinmeyen
  handle, cart, checkout) sayfalari HTTP 200 ve beklenen icerik; bilinmeyen route -> 404.
- Gorsel dogrulama (render HTML): light-first canvas (`bg-slate-50`), AppShell sidebar/topbar,
  `aria-current` aktif nav, `shadow-card`, storefront `data-theme="default"`. Dark theme YOK,
  Next.js runtime error overlay YOK.
- Dev loglarinda runtime error yok. Tek uyari "Next.js inferred your workspace root" (coklu
  lockfile) idi; her app `next.config.mjs` icine `outputFileTracingRoot` (monorepo koku, iki ust
  dizin) eklenerek giderildi. Bu kucuk config duzeltmesi disinda UI/kod degisikligi yapilmadi.
- Final gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` -> hepsi gecti (uyari yok).
- Sonuc: Frontend foundation commit'e hazir.

## Frontend UI Dil/Tasarim Revizyonu + i18n Foundation

- Tarih: 2026-06-23
- Durum: READY_FOR_COMMIT (revizyon commit'i; mevcut UI foundation commit'i korunur)
- Tetik: Frontend UI foundation smoke review. Tespitler: (1) tum ekranlar Ingilizce uretilmis,
  oysa proje Turkiye pazari odakli ve varsayilan dil Turkce olmali; (2) tasarim fazla basic/starter
  template; premium SaaS hissi zayif; (3) empty state/mikro copy/marka karakteri guclendirilmeli;
  (4) light-first dogru ama fazla duz ve "default admin template" hissi veriyor.
- Ek kritik karar (revizyon sirasinda): sadece Turkce ceviri degil, i18n foundation da eklendi.
  Varsayilan urun dili Turkce; bundan sonra tum gorunur UI metni dictionary/i18n key uzerinden
  gelistirilecek (hardcoded gorunur metin yasak). Bkz. ADR-013, ADR-014.

### Dil Revizyonu

- Uc app'in (admin-web, store-admin-web, storefront-web) tum gorunur metni Turkce'ye cevrildi:
  sidebar, topbar, sayfa basligi/aciklamasi, butonlar, badge'ler, empty state, kart basliklari,
  footer notlari, health/status metinleri ve storefront metinleri.
- `lang="en"` -> `lang="tr"` (uc app). Footer/badge "Foundation" -> "Altyapi"; "placeholder data"
  -> "ornek veriler".
- Tum metin `packages/i18n` sozlugunden okunur hale getirildi; uygulama kodunda hardcoded gorunur
  metin birakilmadi (yalnizca sabit kimlikler: urun `handle`, route segmenti, env adlari).

### i18n Foundation

- `packages/i18n` eklendi: tipli, bagimliliksiz sozluk sistemi. `defaultLocale = "tr"`,
  `supportedLocales = ["tr", "en"]`, `Locale = "tr" | "en"`, `getDictionary`,
  `getDefaultDictionary`, `isSupportedLocale`, `format` ve guvenli fallback.
- Namespace'ler: `common`, `admin`, `storeAdmin`, `storefront` (tr kaynak + en ayna). EN sozlukleri
  TR tip sekline bagli yazildi; derleme zamani key parity garanti edilir, ayrica testle dogrulanir.
- Bilincli kapsam disi: runtime locale switcher, `/tr`-`/en` route prefix, tarayici dil tespiti,
  DB locale alani, Next middleware, agir framework, yeni dependency. (docs/TODO.md altinda takip.)

### Tasarim Revizyonu (premium, sade, kurumsal SaaS)

- Tasarim token'lari: `canvas` kirik-beyaz tuval, katmanli golge skalasi (`card`, `card-hover`,
  `panel`, `sidebar`), `tracking-tightish`, olculu indigo accent.
- `packages/ui` iyilestirmeleri: AppShell (rafine sidebar, brand mark ring, `bg-canvas`), SidebarNav
  (bolum basligi + sol accent bar + ring'li aktif state + ikon yuvasi), Topbar (durum noktasi),
  yeni `UserChip` (lokalize avatar+isim+rol), Button (ring/shadow tonlari), Badge (ring + durum
  noktasi), Card/SectionCard (ikon yuvasi), EmptyState (faz etiketi + ikon kutusu + dokulu yuzey),
  StatCard (ikon + tonlu rozet), PageHeader (eyebrow + ayrac).
- Admin/store-admin: her nav'a sade stroke ikon seti, "sayfa baglami" (eyebrow) hissi, urunlesmis
  empty state'ler ("Bu modul Faz X'de canliya baglanacak" netligi).
- Storefront: duyuru cubugu, yapiskan header + sepet rozeti, deger onerileri serisi, premium
  `ProductCard` (kategori + rozet + hover), zengin coklu-kolon footer. Gercek checkout logic yok.

### Dogrulananlar (Gate Sonuclari)

- `pnpm db:generate` calistirildi (typecheck'in Prisma client'a bagimliligi icin; backend'e
  dokunulmadi).
- `pnpm build` gecti (24/24 task; uc app prerender/SSG dahil; turbo uyarisi yok).
- `pnpm typecheck` gecti (i18n + ui + apps + backend paketleri).
- `pnpm test` gecti (34/34 task): i18n 15 test (defaultLocale, supportedLocales, tr/en parity,
  fallback, format), ui 7 test (Turkce kabuk etiketleri smoke dahil), app health route testleri,
  backend testleri bozulmadi.
- `pnpm lint` gecti.
- Backend foundation, Docker runtime ve compose davranisi degistirilmedi; yeni commerce business
  logic eklenmedi.

### Bilinen Eksikler

- Runtime locale switcher / URL locale stratejisi / kullanici-mağaza locale tercihi henuz yok (TD-013).
- Frontend testleri smoke seviyesinde; jsdom etkilesim testleri yok (TD-012, devam).
- Onceki foundation eksikleri (gercek veri/aksiyon, auth/token, multi-tenant resolver) acik (TD-009..011).

### Final Smoke Review (2026-06-23)

- Git: yalnizca beklenen frontend/i18n/docs/config/test degisiklikleri. `.env`, `node_modules`,
  `.next`, `.turbo`, `*.tsbuildinfo` gitignore ile disarida (dogrulandi).
- Local dev: uc app (`:3001`, `:3002`, `:3000`) calistirildi; `/api/health` ucu de 200 ve dogru
  `service`/`status`.
- Dil: render HTML'de `<html lang="tr">` (uc app). Script-disi gorunur metinde Ingilizce sizinti
  YOK. "Dashboard/Inventory/Marketplace" eslesmeleri yalnizca Next dev RSC payload'undaki component
  fonksiyon adlari (`StoreDashboardPage`, `InventoryIcon`, `MarketplacePage`...) idi; gorunur metin
  degil. Gorunur etiketler Turkce dogrulandi (Platform Ozeti, Magazalar, Magaza Paneli, Pazaryerleri,
  Sistem Sagligi, Altyapi, vb.).
- Tasarim: `shadow-card`, `bg-canvas`, `tracking-tightish`, `ring-1`, marka avatari + `UserChip`
  ("Super Yonetici"), faz etiketli/baglamli empty state'ler ve storefront vitrin markerlari
  (duyuru, deger onerileri, `ProductCard` kategori+fiyat) render edildi. Dark theme YOK
  (`data-theme="default"`, dark sinifi yok), Next.js error overlay YOK, dev loglarinda hata yok.
- i18n sanity: `defaultLocale = "tr"`, `supportedLocales = ["tr", "en"]`; middleware / `/[locale]`
  route prefix / locale switcher / tarayici dil tespiti YOK (kapsam korundu). 23 app dosyasi
  dictionary'den okur.
- Final gate: `pnpm lint` (34/34), `pnpm typecheck` (hatasiz), `pnpm test` (34/34; i18n 15, ui 7,
  app health, backend), `pnpm build` (24/24, uyari yok) -> hepsi gecti.
- Smoke sirasinda kod duzeltmesi gerekmedi. Sonuc: revizyon commit'e hazir.

### Commit Onerisi

`feat(ui): default Turkish UI, i18n foundation and premium SaaS polish`

## Faz 1B Admin UI Canli API Baglama Kapanis Logu

Kapsam: yalnizca `apps/admin-web` canli gateway'e baglandi. `store-admin-web` ve `storefront-web`
gercek API'ye baglanmadi; backend davranisi degistirilmedi; commerce business logic eklenmedi.

### Design-First Yaklasimi

Koddan once kisa Claude Design Plan cikarildi: login ekrani (kabuk disi, ortalanmis), oturum guard'li
`(app)` kabugu, mağazalar/paketler canli liste + create/update modal UX'i, sistem sagligi canli/dahili
durum, loading/error/empty yaklasimi, gecici token saklama (httpOnly cookie), i18n copy yaklasimi ve
kapsam disi maddeler. Mimari karar: gateway'de CORS olmadigi ve backend degismeyecegi icin BFF (Next
route handler proxy) zorunlu; token httpOnly cookie'de server-side tutuldu (ADR-017).

### Yapilanlar

- `packages/ui`: yeni sunum primitive'leri — `Spinner`, `Skeleton`/`SkeletonRows`, `Alert`, `Select`/
  `Textarea`, `Modal` (role=dialog, aria-modal, ESC/backdrop, odak), `DataTable`.
- `packages/api-client`: tipli `ApiError` (gateway `code`/`status`/`apiMessage`), internal DB/Redis
  health helper'lari (`internal.dbHealth/redisHealth`), frontend icin contract tipi re-export'lari;
  hata govdesi `{ error: { code } }` parse edilir.
- `packages/i18n`: admin namespace genisledi (auth/login, errors kod->mesaj, stores/plans tablo+form,
  canli dashboard, system health dahili-token copy) + common (actions/states/status). tr kaynak + en
  ayna tam parity.
- `apps/admin-web`: BFF route handler'lari (`/api/auth/{login,me,logout}`, `/api/admin/stores(/:id)`,
  `/api/admin/plans(/:id)`, `/api/system/{health,internal}`); httpOnly cookie session helper'lari;
  kabuk disi login; oturum guard'li `(app)` kabugu (canli kullanici + cikis); canli dashboard KPI;
  mağazalar ve paketler canli liste + create/update modal; sistem sagligi public + guvenli dahili
  proxy. App liveness `/api/health` korundu.

### Guvenlik Notlari (token/secret)

- Platform bearer token yalnizca httpOnly cookie'de (server-side); yanit govdesine, UI'a, console/log'a
  veya client bundle'a girmez. Parola loglanmaz. Hata mesajlari kullanici dostu Turkce; ham gateway
  mesaji/kodu UI'da gosterilmez (kod -> i18n esleme).
- Internal DB/Redis token yalnizca admin-web sunucu env'inde; `/api/system/internal` proxy ile.
  Tanimli degilse "dahili token gerektirir" guvenli durumu gosterilir.

### Dogrulananlar (Gate Sonuclari)

- `pnpm lint` (34/34), `pnpm typecheck` (hatasiz), `pnpm test` (api-client 11, i18n 19, admin-web 11
  dahil hepsi gecti), `pnpm build` (24/24). Gate sirasi: db:generate + build -> typecheck.
- Runtime smoke (canli Docker backend, gateway :4000, admin-web :3001): login (token govdede YOK,
  httpOnly cookie set), me, stores list (cookie'siz 401), create 201, duplicate slug 409
  `STORE_SLUG_EXISTS`, update 200, bad slug 400 `VALIDATION_ERROR`, plans list/create, logout sonrasi
  eski token revoke (401), hatali parola `INVALID_CREDENTIALS`, public system health (ok/0.1.0),
  internal `available:false` (token yokken) ve token verilince `{available:true, db:ok, redis:ok}`
  (secret sizmadan) — hepsi dogrulandi.

### Bilinen Riskler / Eksikler

- Cookie hardening (CSRF, prod secure davranisi, refresh, rate limit) acik (TD-015).
- BFF/internal operasyonel notlari (compose env, hata-kodu senkronu, server-side oturum korumasi)
  TD-017; gercek DOM etkilesim testleri TD-012/TODO-023; smoke test verisi yerelde TD-018.
- Gateway store list/get `domain` dondurmedigi icin UI'da domain kolonu yok (TODO-025).

### Final Smoke Review (2026-06-24)

- Git: degisiklikler Faz 1B kapsamiyla sinirli (admin-web, packages/ui, api-client, i18n, docs, README).
  Backend (api-gateway/worker/services/db/contracts/auth/config) ve store-admin-web/storefront-web
  dokunulmadi. `.env`, `node_modules`, `.next`, `.turbo`, `*.tsbuildinfo` gitignore disinda (dogrulandi).
- Security sanity: `NEXT_PUBLIC` ile secret tasinmiyor; admin-web kaynakta `console.*` yok (token/parola
  loglanmaz); `INTERNAL_API_TOKEN` yalnizca server route handler'da; login token'i yalnizca httpOnly
  cookie'ye yaziliyor, yanit govdesi yalnizca `user` (tokenInBody=false, runtime dogrulandi); cookie
  `httpOnly`+`sameSite=lax`+`secure=IS_PROD`.
- Health/API smoke (canli backend :4000, admin-web :3001): login yanlis parola 401
  `INVALID_CREDENTIALS`, dogru 200 (token govdede yok), me cookie'siz 401 / cookie'li 200, stores/plans
  session'siz 401 / session'li 200, system/health 200, logout 200, logout sonrasi eski cookie ile me &
  stores 401 (revoke). Store create 201 / duplicate slug 409 `STORE_SLUG_EXISTS` / update 200; plan
  create 201 / duplicate code 409 `PLAN_CODE_EXISTS` / update 200; system/internal token yokken
  `available:false`. Korumali sayfalar (`/`, `/stores`, `/plans`, `/system-health`, `/settings`) SSR 200.
- UI: `<html lang="tr">`, `bg-canvas` (light), gorunur Ingilizce sizinti yok (Sign in / Verifying
  session / Dashboard = 0), dark theme/`data-theme=dark` yok, dev log'da runtime hata/uyari yok.
- Gate: `pnpm lint` 34/34, `pnpm typecheck` exit 0, `pnpm test` 34/34, `pnpm build` 24/24 — hepsi gecti.
- Smoke verisi: yerel dev DB'sine `rev-store-*`/`rev-plan-*` kayitlari kaldi; delete kapsam disi,
  TD-018 altinda takipli. Sonuc: kod duzeltmesi gerekmedi; commit'e hazir.

### Commit Onerisi

`feat(admin-web): wire admin console to live API via BFF session`

## Faz 1C Auth Hardening + Operasyon Temizligi Logu

Kapsam: yeni commerce feature eklenmedi; `store-admin-web` ve `storefront-web` canli API'ye
baglanmadi. Calisma API gateway, admin-web BFF, contract/config, dev ops scriptleri, testler ve
dokumanlarla sinirli tutuldu.

### Yapilanlar

- `apps/api-gateway`: `POST /auth/platform/login` icin IP + e-posta bazli env kontrollu rate limit
  eklendi. Hatalar mevcut `{ error: { code, message, details } }` zarfinda `AUTH_RATE_LIMITED` koduyla
  429 doner. Basarili login ilgili sayaci sifirlar.
- `packages/contracts` + gateway: `AdminStore` response'u `domain: string | null` ile genisledi;
  store list/get ilk StoreDomain bilgisini dondurur. admin-web stores tablosuna domain kolonu eklendi.
- `apps/admin-web`: double-submit CSRF eklendi (`/api/auth/csrf` + CSRF cookie/header). Logout ve
  stores/plans create/update CSRF ister; GET'ler istemez. Session cookie env kontrollu
  (`ADMIN_SESSION_COOKIE_NAME`, `ADMIN_COOKIE_SECURE`, `ADMIN_COOKIE_SAME_SITE`) hale getirildi.
- `apps/admin-web`: `(app)` route group server tarafinda session cookie varligini kontrol eder; login
  sayfasi mevcut session cookie varsa erken panele yonlendirir. Token client bundle'a girmez.
- `apps/admin-web`: internal health proxy token yokken `available:false`, token varken timeout kontrollu
  server-side DB/Redis probe davranisini korur; secret istemciye donmez.
- `packages/db`: `pnpm db:cleanup-smoke` script'i eklendi. `smoke-`, `rev-`, `test-` prefiksli store/
  plan kayitlarini development/test ortaminda temizler; production/staging'de calismayi reddeder.
- `apps/admin-web`: Testing Library/jsdom eklendi; login validation/hata, stores/plans create modal,
  logout flow, CSRF helper ve BFF CSRF/internal health route testleri eklendi.

### Dogrulananlar

- `pnpm --filter @commerce-os/api-gateway test` -> 13 test gecti.
- `pnpm --filter @commerce-os/admin-web test` -> 22 test gecti.
- `pnpm --filter @commerce-os/config test`, `pnpm --filter @commerce-os/{config,contracts,api-client,db,i18n,api-gateway} build`
  ve `pnpm --filter @commerce-os/admin-web build` gecti.

### Final Security / Runtime Review (2026-06-24)

- Git diff Faz 1C kapsamiyla sinirli: api-gateway auth/domain response, admin-web BFF/session/CSRF,
  config/contracts/i18n, db cleanup scriptleri ve docs. `store-admin-web`/`storefront-web` kaynaklari
  degismedi; `.env`, `node_modules`, `.next`, `.turbo`, `dist` ve tsbuildinfo dosyalari commit
  kapsaminda degil.
- Security review: password/token loglanmiyor; session bearer token yalnizca httpOnly cookie'de;
  CSRF token ayri readable cookie/header degeri ve auth token degil; `INTERNAL_API_TOKEN` client
  bundle'a girmiyor. Login CSRF disinda, gateway rate limit ile korunuyor.
- Runtime DB: `pnpm db:migrate` bekleyen migration yok, `pnpm db:seed` idempotent, `pnpm db:verify-seed`
  gecti. Cleanup sonrasi verify-seed tekrar gecti.
- Runtime smoke: gateway dogru login 200, yanlis login 401, art arda yanlis login sonrasi
  `429 AUTH_RATE_LIMITED`, pencere bittikten sonra dogru login tekrar 200. BFF `me` cookie yokken 401,
  cookie varken 200, logout CSRF yokken 403, CSRF varken 200 ve logout sonrasi `me` 401.
- CSRF/admin smoke: store create CSRF yokken 403; CSRF ile store create 201, update 200; plan create
  201, update 200. Store list response'u domain alanini dondurdu.
- Internal/cleanup smoke: `/api/system/internal` token yokken `available:false`; `pnpm db:cleanup-smoke`
  development ortaminda prefiksli smoke/rev/test store/plan kayitlarini temizledi, seed kayitlarini
  korudu; `APP_ENV=production` ile calismayi reddetti.
- Gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` commit oncesi yeniden calistirilacak
  ve gecmeden commit atilmayacak.

### Kalan Bilincli Borclar

- Rate limit proses ici memory fallback'tir; coklu instance production icin Redis/dagitik sayaç veya
  merkezi brute-force izleme Faz 2 borcu olarak kalir.
- Refresh token/rotasyon, OAuth, 2FA ve password reset kapsam disi kaldi.
- Frontend compose secret dagitimi ve gateway hata kodlarini paylasimli kaynaktan turetme TD-017
  altinda devam eder.

## UI Accent Polish + Frontend Docker Runtime + Docker Cleanup

- Tarih: 2026-06-24
- Durum: READY_FOR_COMMIT (rapor onayina bagli)
- Kapsam: Backend/security/commerce feature degisikligi yok. Sadece (1) UI accent renk revizyonu,
  (2) frontend Docker compose runtime, (3) guvenli Docker cache temizligi ve docs.
- UI accent: Tek merkezi degisiklik — `packages/ui/tailwind-preset.cjs` `brand` ramp'i indigo'dan
  `brand-600 = #9743CD` (rgb 151 67 205) ankrajli olculu menekse ramp'ina cevrildi. Tum app'ler bu
  preset'i, componentler yalnizca `brand-*` token'ini kullandigi icin CTA, eyebrow/accent, badge
  `info`, aktif nav, EmptyState etiketi, StatCard, login ve storefront hero/CTA accentleri tek
  noktadan guncellendi. App kodunda hardcoded hex tekrarI yok. Govde metni/genis yuzeyler notr slate
  kaldi; kontrast korundu (brand-600 uzerine beyaz ~5.3:1, text-brand-700 beyaz uzerinde ~7:1). Dark
  theme/neon yok. Karar: ADR-019.
- Frontend Docker: `infra/docker/docker-compose.yml`'e admin-web (3001), store-admin-web (3002),
  storefront-web (3000) servisleri eklendi; backend ile ayni `node.Dockerfile` imaji + `pnpm --filter
  <app> dev`. compose ici `API_GATEWAY_URL=http://api-gateway:4000`; admin-web BFF gateway'e container
  network uzerinden ulasti (`/api/system/health` -> `gatewayUrl: http://api-gateway:4000`, 200).
  `INTERNAL_API_TOKEN` yalnizca admin-web server env'inde; client bundle taramasinda sizinti yok.
  TD-008 RESOLVED. Backend compose (postgres/redis/api-gateway/worker) degismedi.
- Docker temizlik: `docker system df` ile durum raporlandi; yalnizca `docker builder prune -f`
  (~10.39GB kullanilmayan build cache) ve `docker image prune -f` (dangling) calistirildi. Volume'lara
  ve calisan container'lara dokunulmadi; `docker_postgres-data` korundu. Stopped container'lar diger
  projelere (cmd-ledger/atila) ait oldugundan `docker container prune` calistirilmadi, sadece
  raporlandi. Temizlik sonrasi tum 7 servis healthy.
- Smoke: 7 servis compose healthcheck ile healthy; `/health` (gateway) ve uc app `/api/health` 200;
  admin login render (200, dogru title), storefront home 200, store-admin shell 200.
- Gate: `pnpm db:generate`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — hepsi gecti.

## Faz 2C Order / Reservation Core

- Tarih: 2026-06-24
- Durum: IMPLEMENTED_GATE_PENDING (commit atilmadi; final gate ve runtime smoke raporlanacak)
- Kapsam: Customer/CustomerAddress, Order/OrderLine/OrderAddress/OrderEvent,
  InventoryReservation ve OrderNumberCounter Prisma modelleri + migration eklendi. Store-scoped
  order API: list/create/get/update, line add/update, place, cancel. Contracts ve api-client order
  helper'lari eklendi.
- Lifecycle: Order DRAFT olarak lines ile olusur; line snapshot sku/title/variantTitle/unitPrice
  create aninda variant/product'tan alinir. DRAFT line mutation'a aciktir. Place order stok
  rezervasyonu yapar ve PLACED yapar. Cancel aktif rezervasyonlari RELEASED yapar, reserved stogu
  geri dusurur ve CANCELLED yapar. Double cancel double release yapmaz; placed/cancelled line
  mutation engellenir.
- Concurrency: Place transaction icinde `InventoryItem` satirlarini `SELECT ... FOR UPDATE` ile
  kilitler; available stok yetersizse `ORDER_INSUFFICIENT_STOCK` ile 409 doner. Cancel release de
  aktif rezervasyonlar uzerinden idempotent calisir.
- Audit/event: Order create/update/line mutation/place/cancel icin `AuditLog`; order timeline icin
  `OrderEvent`; reservation create/release icin `InventoryMovement` (`SALE_RESERVATION`,
  `SALE_RELEASE`) yazilir.
- Seed/cleanup: Demo order seed edilmedi; `db:verify-seed` order'a bagimli degil. `db:cleanup-smoke`
  smoke order/customer kayitlarini ve aktif smoke rezervasyonlarini guvenli release/delete edecek
  sekilde genisletildi; production/staging guard korunur.
- Kapsam disi: Store-admin orders UI, storefront checkout, payment provider, shipping/fulfillment,
  invoice, cart, email notification, refund/return, marketplace, multi-warehouse.
- Ara dogrulama: `pnpm db:generate`, `pnpm --filter @commerce-os/contracts build`,
  `pnpm --filter @commerce-os/api-gateway test`, `pnpm --filter @commerce-os/contracts test`,
  `pnpm --filter @commerce-os/api-client test`, `pnpm --filter @commerce-os/api-client build`,
  `pnpm typecheck` gecti.

### Final Review / Gate (2026-06-24)

- Scope review: Degisiklikler F2C backend/contracts/client/db/docs/test kapsami ile sinirli; store-admin
  order UI, storefront checkout, payment/shipping/marketplace implementasyonu eklenmedi.
- Security/tenant review: Store-scoped order endpointleri platform admin bearer + explicit `storeId`
  guard'i ile korunur; order/customer/reservation/event query'leri storeId ile scoped; cross-store
  variant create/place engellenir; audit/event metadata token/password/secret tasimaz. Store-user auth
  TD-019 altinda acik kalir.
- Concurrency review: Place transaction icinde `SELECT ... FOR UPDATE` ile inventory satirini kilitler;
  oversell kontrollu `409 ORDER_INSUFFICIENT_STOCK` doner. Cancel yalniz ACTIVE reservation release
  eder; reserved quantity yetersiz/corrupt ise `ORDER_RESERVATION_FAILED` ile durur ve
  `quantityReserved` negatife dusmez.
- Gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` gecti.
- Runtime: Docker compose rebuild/recreate sonrasi 7 servis healthy. `pnpm db:migrate`, `pnpm db:seed`,
  `pnpm db:verify-seed` gecti. Canli smoke: login 200, draft order 201, get/list 200, place 200,
  reserved 0->1, available dustu, insufficient stock 409, cancel 200, reserved 1->0, double cancel
  idempotent, placed/cancelled line mutation engelli, health 200. `pnpm db:cleanup-smoke` smoke order
  ve aktif reservation temizledi; son `pnpm db:verify-seed` gecti.
- Sonraki faz: F2D Product Sales Model Foundation (`ONLINE`, `INQUIRY`, `APPOINTMENT`, `WHATSAPP`,
  `CATALOG_ONLY`, price visibility, CTA behavior).

## Faz 2E Runtime Language Switch (TR/EN)

### Yapilanlar

- `packages/i18n`: Cookie/locale yardimcilari eklendi — `localeCookieName` (`commerce_os_locale`),
  `localeCookieMaxAge`, `resolveLocaleFromCookieValue` (gecersiz/bos -> `tr`), `localeCookieString`
  (sameSite=lax, path=/, uzun max-age, HTTPS'te Secure; httpOnly degil). `common` sozlugune switcher
  copy'si (`language.ariaLabel/turkish/english`) TR/EN paritesiyle eklendi. `getDictionary` fallback
  davranisi korundu.
- `packages/ui`: `LocaleProvider`/`useLocale` (aktif dili istemci agacina tasiyan baglam; saglayicisiz
  Turkce'ye duser) ve erisilebilir `LanguageSwitcher` (TR/EN, `aria-pressed`, grup `aria-label`;
  cookie yazip tam sayfa yeniler). `@commerce-os/i18n` workspace bagimliligi eklendi; `next`'e bagimli
  degil.
- App entegrasyonu (uc app): Sunucu `lib/i18n.ts` modulleri `getRequestLocale()` ile cookie'den
  locale cozer; kok layout `<html lang>` + `generateMetadata`'yi aktif dile gore uretir ve istemci
  agacini (login dahil) `LocaleProvider` ile sarar. admin-web ve store-admin-web istemci sayfalari/
  kabuk/nav/login `useLocale()` + `getDictionary(locale)` kullanir; topbar ve login ekrani
  `LanguageSwitcher` gosterir. storefront sunucu sayfalari her istekte cookie'den dili cozer; header'a
  switcher eklendi (`data-theme`/shell korunur). API hata mesajlari `messageForError(error, locale)`
  ile aktif dilde gosterilir.
- store-admin sunucu sayfalari (orders/customers/settings/marketplace/theme) ve storefront sayfalari
  cookie okudugu icin dinamik render olur; `generateStaticParams` locale-bagimsiz handle listesi
  (`sampleProductHandles`) kullanir.

### Dogrulananlar

- Testler: `packages/i18n` cookie cozumleme + switcher copy paritesi; `packages/ui` switcher render/
  aktif durum/erisilebilir etiket + provider/fallback; admin/store-admin/storefront default TR ve
  `locale=en` (storefront'ta gecersiz->TR fallback dahil) smoke. Mevcut auth/BFF/interaction testleri
  bozulmadi (158 test gecti).
- Gate: `pnpm db:generate` + `pnpm build` (24/24) + `pnpm typecheck` (0) + `pnpm test:unit`
  (158/158) + `pnpm lint` (34/34) gecti.

### Kalan Bilincli Borclar

- Kullanici-bazli (DB) locale tercihi yok; URL locale prefix yok; tarayici dil tespiti yok
  (TD-028, TODO). Cookie tercih oturum/cihaz duzeyinde kalir.
- Sonraki faz: F2F Store-admin Product Sales Model UI.

## Faz 2F Store-admin Product Sales Model UI

- Tarih: 2026-06-24
- Durum: READY_FOR_REVIEW (commit atilmadi)

### Yapilanlar

- `apps/store-admin-web` urun listesi: Mevcut kolonlar korunarak `Durum` ile `Marka` arasina
  kompakt "Satis" kolonu eklendi — ust satir `salesMode` rozeti (tonlu), alt satir
  `priceVisibility` · `primaryAction` kucuk metin, satin alinabilirlik gostergesi
  (`purchasable=false` -> "Sepete eklenemez" amber; `ONLINE`+`true` -> "Sepete eklenebilir"
  yesil). Eski (F2D oncesi) kayitlar icin guvenli varsayilanlar (`?? ONLINE/VISIBLE/...`).
- Urun create/update formu: "Satis davranisi" bolumu eklendi — sales mode / price visibility /
  primary action select'leri, dort toggle (purchasable, inquiryEnabled, appointmentRequired,
  whatsappEnabled), min/max siparis adedi, CTA etiketi, WhatsApp sablonu, fiyat sorma formu
  basligi ve randevu notu alanlari. Yardimci metin alanlari satis tipine gore kosullu gosterilir.
- Dinamik davranis: `salesMode` degisince backend `isConsistentSalesModel` kurallariyla uyumlu
  guvenli default'lar uygulanir (orn. INQUIRY -> purchasable false + primaryAction REQUEST_PRICE
  + inquiryEnabled true); kullanicinin yazdigi metin alanlari ezilmez. `priceVisibility`
  HIDDEN/ON_REQUEST secilince purchasable otomatik kapanir. purchasable=false ve gizli fiyat
  durumlari icin lokalize bilgi notlari gosterilir.
- Validasyon: client-side min>=1, max bos veya >=min, CTA/sablon/baslik/not uzunluk sinirlari
  (kontrat ile ayni: 120/500/160/500). Backend nihai otorite; tutarsiz kombinasyonlar gateway'den
  `VALIDATION_ERROR` ile doner ve UI'da lokalize gosterilir.
- i18n: `storeAdmin.products.salesModel.*` alt yapisi (mode/priceVisibility/action label'lari,
  bolum/toggle/hint/validasyon metinleri) TR kaynak + EN ayna; `errors`'a bes guard kodu
  (`PRODUCT_NOT_PURCHASABLE`, `PRODUCT_REQUIRES_INQUIRY/APPOINTMENT/WHATSAPP`,
  `PRODUCT_CATALOG_ONLY`) eklendi. Tam path paritesi korundu.
- BFF: Product create/update route'lari body'yi degistirmeden gateway'e pass-through eder; yeni
  sales model alanlari ek kod olmadan tasinir. CSRF/store-context/token gizliligi korundu.
- Ops: `packages/db/scripts/cleanup-smoke.ts` prefix listesine `f2f-smoke-` eklendi.

### Dogrulananlar

- Testler: store-admin interaction testlerine sales-mode rozet render (ONLINE/INQUIRY/APPOINTMENT/
  WHATSAPP/CATALOG_ONLY), form bolumu render, sales mode degisiminde helper alan + guvenli default,
  min/max validasyon, lokalize backend guard hatasi; BFF testlerine create/update sales model body
  pass-through + CSRF korumasi; i18n'e sales-model label paritesi ve guard kod testleri eklendi.
- Gate: `pnpm db:generate` + `pnpm lint` (store-admin/i18n/db temiz) + `pnpm typecheck` (0) +
  `pnpm test` (34/34 task) + `pnpm build` (24/24) gecti.
- Docker smoke: 7 servis healthy; store-admin imaji yeniden build edildi; `/api/health` 200.
  Canli BFF akisi: login 200, urun listesi demo urunleri `ONLINE/VISIBLE/ADD_TO_CART` ile dondurdu;
  `f2f-smoke-` INQUIRY urun create 201 (INQUIRY/ON_REQUEST/REQUEST_PRICE/purchasable=false), ayni
  urun APPOINTMENT'a update 200, tutarsiz ONLINE+REQUEST_PRICE create 400 `VALIDATION_ERROR`.
  Smoke kaydi temizlendi; `db:verify-seed` tekrar gecti (2 urun).

### Kalan Bilincli Borclar

- Storefront CTA render yok (F3); inquiry/appointment/WhatsApp kayit modelleri yok (sonraki faz).
- Store-admin orders UI yok (F2G).
- `db:cleanup-smoke` calisan container icindeki eski kodu kullanir; `f2f-smoke-` prefix temizligi
  ancak api-gateway imaji yeniden build edildikten sonra container icinden calisir (kaynakta hazir).

## Faz 3A Storefront Resolver ve CTA Davranisi

### Yapilanlar

- Storefront-web demo/static kabuktan cikti; public vitrin artik CANLI katalog verisine baglanir.
  Ana sayfa one cikan urunler, `/products` listesi ve `/products/[handle]` detayi gateway'den gelen
  gercek urun/varyant/stok/kategori verisini gosterir. Statik `sample-products` + sozlukteki demo
  urun listesi kaldirildi.
- Resolver/BFF (sunucu-tarafi): gateway'de public katalog ucu olmadigindan vitrin, platform-admin
  kimligiyle SUNUCUDA oturum acar; bearer token sunucu belleginde onbelleklenir (login + expiry/401
  yenileme), cookie'ye YAZILMAZ, istemciye/HTML'e/log'a serialize edilmez. Mağaza `demo-store` slug'i
  ile sunucuda cozulur (storeId istemciden alinmaz). `lib/server/{env,api-token,catalog}.ts`.
- Sales-model CTA mapping (saf `lib/sales-model.ts`): ONLINE→Sepete ekle (+Hemen al, adet, fiyat),
  INQUIRY→Fiyat sor, APPOINTMENT→Randevu al, WHATSAPP→WhatsApp ile sor, CATALOG_ONLY→Bilgi al/pasif.
  Fiyat gorunurlugu: VISIBLE→tutar, STARTING_FROM→"…'den baslayan", ON_REQUEST→"Fiyat icin iletisime
  gecin", HIDDEN→numerik fiyat gizli. ONLINE disi modlarda sepete ekle/adet YOK.
- Product detail = satin alma karar merkezi (ADR-029): breadcrumb, baslik/marka/SKU, rating/yorum
  yer tutuculari, medya galerisi (placeholder + thumb rayi), fayda/aciklama/teknik ozellik (gercek
  veriden)/paket/kullanim, varyant secici (canli SKU/fiyat/stok), buy box (fiyat/compare-at,
  satis-modu CTA, adet yalniz ONLINE, stok, teslimat/iade/guvenli odeme/satici guven kartlari),
  altta yorumlar/soru-cevap/birlikte-alinanlar/son-bakilanlar yer tutuculari + canli benzer urunler.
  Yer tutucular sakin, profesyonel copy ("yakinda" yok).
- Cart/checkout: gercek sepet/odeme YOK; musteri-dostu profesyonel placeholder. CTA'lar kontrollu
  (ONLINE sepete ekle/hemen al → /cart yonlendirir).
- i18n: `storefront` sozlugu yeni namespace'lerle yeniden yapilandirildi (cta, price, salesMode,
  buyBox, reviews, questions, related, badges + genisletilmis detail/listing/home). TR kaynak + EN
  ayna, tam path paritesi korundu. Gorunur metin hardcoded degil; ham API kodu UI'da yok.
- Config: `.env.example` + docker-compose storefront-web env (`STOREFRONT_DEMO_STORE_SLUG`,
  `STOREFRONT_PLATFORM_EMAIL/PASSWORD`) + `depends_on api-gateway`. Backend/business logic, DB
  migration/model, kontratlar DEGISMEDI.

### Dogrulananlar

- Testler (storefront 35/35): sales-model CTA mapping (5 mod) + fiyat gorunurlugu; resolver
  (store context sunucuda cozulur, canli liste, token donen veride yok, 401 retry, gecersiz handle),
  ProductCard CTA/fiyat per mod, listing (canli kart/empty/error/EN), detail (baslik/SKU/fiyat/
  galeri/buy box/varyant/trust/reviews/questions/related, CATALOG_ONLY add-to-cart yok + numerik
  fiyat yok, not-found, EN). i18n parite testi guncellendi (statik urun listesi yerine CTA paritesi).
- Gate: `pnpm db:generate` + `pnpm build` (24/24) + `pnpm typecheck` (0) + `pnpm lint` (34/34) +
  `pnpm test` (34/34 task; store-admin 72, i18n parite dahil) gecti.
- Docker smoke: 7 servis healthy; storefront-web imaji worktree'den yeniden build edildi;
  `/api/health` 200. `/` `/products` `/products/demo-hoodie` `/cart` `/checkout` 200; gecersiz handle
  graceful not-found 200. `/products` canli Demo Hoodie/Demo Tote + gercek fiyat (₺1.299,00 / ₺399,00)
  + "Sepete ekle"; detayda SKU `DEMO-HOODIE-BLK-M`, compare-at ₺1.499,00, Stokta, teslimat/benzer
  urunler. `locale=en` → "All products"/"Add to cart". Token/secret HTML'de ve `.next/static`
  bundle'larinda YOK. `db:verify-seed` gecti (2 urun / 3 varyant).

### Kalan Bilincli Borclar

- Public katalog read ucu gateway'de yok; vitrin gecici olarak server-side platform-admin token'i
  kullanir (TD-032). Kalici cozum: gateway'de auth gerektirmeyen public-read katalog ucu.
- Gercek sepet/checkout/payment/shipping yok (F3B); review/Q&A/seller-rating modeli, recommendation
  engine, login-gated fiyat (priceVisibility LOGIN_REQUIRED kontratta yok) sonraki fazlara birakildi.

## Faz 3B.1 Storefront Cart + Checkout Order Foundation

### Yapilanlar

- Cart persistence: Imzali (HMAC-SHA256) httpOnly cookie cart (`commerce_os_cart`). Cookie YALNIZCA
  `{variantId, quantity}` referansi tutar; fiyat/baslik/SKU/salesMode/stok cookie'de YOK. Saf token
  modulu (`lib/cart-token.ts`: encode/decode/imza + sanitize/upsert/remove/add) + sunucu-yalniz cookie
  katmani (`lib/server/cart-cookie.ts`). Kurcalanmis/yanlis-imzali cookie bos sepete duser. Mutasyon
  yalniz Server Action'larda; `STOREFRONT_CART_SECRET` server-only (NEXT_PUBLIC degil).
- Gateway public uclar (auth YOK, store-scoped): `POST /public/stores/:slug/cart` (sepet referansini
  sunucu-otoriter cozer → satir bazli fiyat/stok/uygunluk + subtotal/itemCount/checkoutReady) ve
  `POST /public/stores/:slug/checkout` (createOrder DRAFT → placeOrder rezervasyon → PLACED/UNPAID).
  Cozumleme mevcut katalog/stok loader'larini kullanir (yeni DB metodu yok); cross-store/cozulemeyen
  varyant index'te olmadigindan dusurulur (stale reconcile + tenant izolasyonu).
- Guvenlik kapilari: Yalniz `ONLINE` + `purchasable` + gorunur fiyatli varyant sepete/siparise duser.
  CATALOG_ONLY/INQUIRY/APPOINTMENT/WHATSAPP ve HIDDEN/ON_REQUEST → `UNAVAILABLE` (fiyat 0, sizmaz),
  checkout engellenir. Stok yetersiz → `OUT_OF_STOCK`; adet kisilirsa → `QUANTITY_ADJUSTED`. Istemciden
  gelen price/title/sku/salesMode KABUL EDILMEZ (zod allowlist dusturur); order aninda her sey sunucuda
  yeniden hesaplanir. Allowlist DTO'lar (`publicCart*`, `publicOrderConfirmation*`) ic alan (storeId/
  customerId/reservation/event/adres PII) dondurmez.
- Payment temsili (ADR-031): gercek odeme YOK. Basarili checkout `status=PLACED`, `paymentStatus=UNPAID`
  (odeme bekliyor), `fulfillmentStatus=UNFULFILLED`. F3B.2 provider-ready contract icin TODO-063.
- Storefront UI: `/cart` (gercek satirlar, adet +/−, kaldir, subtotal/sayac, empty/error state,
  stale reconcile bildirimi, uygunsuz satir uyarisi, checkout CTA) ve `/checkout` (iletisim + teslimat
  formu, sunucu+gateway validasyon, payment placeholder, useActionState ile order olusturma, basari
  onay paneli, empty/error state). BuyBox ADD_TO_CART/BUY_NOW artik cookie sepete ekleyip /cart veya
  /checkout'a yonlendirir. Nav rozeti gercek sepet adedini gosterir (cookie'den, gateway cagrisi yok).
- i18n: `cart`/`checkout` namespace'leri genisletildi (placeholder kaldirildi); TR kaynak + EN ayna,
  tam path paritesi korundu (i18n parite testi gecer). Demo-disi operasyon vaadi eklenmedi (kargo demo
  akista hesaplanmaz notu).
- Kontratlar: `packages/contracts`'a `publicCart*` + `publicCheckout*` + `publicOrderConfirmation*`
  sema/tipleri; `packages/api-client` re-export. DB modeli/migration DEGISMEDI.

### Dogrulananlar

- Testler: gateway `health.test.ts`'e 15 yeni cart/checkout testi (ONLINE sepete eklenir; 4 ONLINE-disi
  mod UNAVAILABLE + checkout 409; HIDDEN/ON_REQUEST fiyat sizmaz; client price/title manipulasyonu yok
  sayilir; stok clamp QUANTITY_ADJUSTED; sifir stok OUT_OF_STOCK; cross-store/unknown varyant dusurulur;
  eksik contact 400 + order yok; valid checkout 201 PLACED/UNPAID + stok rezerve; ic alan donmez; 404
  store). Storefront `cart-token.test.ts` (8: round-trip/imza/tamper/sanitize/upsert/remove/add/cap) +
  `cart-resolver.test.ts` (4: DTO→view, auth header yok, checkout onay/hata mapping). i18n parite testi
  cart/checkout dahil gecer.
- Gate: `pnpm db:generate` + build (storefront `next build`: /cart 1.88kB, /checkout 1.91kB; gateway
  tsc) + `pnpm typecheck` (0) + lint (degisen 5 paket temiz) + `pnpm test:unit` (268 gecti) +
  `git diff --check` temiz.
- Docker smoke: 7 servis healthy; storefront imaji worktree'den build. `/health` (gw) 200, `/api/health`
  (sf) 200, `/products` `/products/demo-hoodie` `/cart` `/checkout` 200. Gercek Postgres uzerinde:
  `POST /cart` OK satir + sunucu fiyat; client `priceMinor:1`/`title:"HACK"` GORMEZDEN gelinir (server
  39900/gercek baslik); `POST /checkout` → 201 `OS-000012` PLACED/UNPAID, totals dogru; eksik contact →
  400 VALIDATION_ERROR (order yok). Secret marker taramasi (HTML + 7 JS chunk + cart API yaniti):
  INTERNAL_API_TOKEN/SESSION_SECRET/PASSWORD_HASH_PEPPER/Bearer/createApiClient/STOREFRONT_PLATFORM_*/
  platformLogin/cart-secret degeri = 0 hit.

### Kalan Bilincli Borclar

- TD-033: public checkout create+place iki ayri transaction (yetim DRAFT riski); anonim checkout'ta
  odeme alinmadan stok PLACED ile rezerve (terk edilen siparis icin expiry/iptal job'i yok). Cozum
  F3B.2'de (rezerv-on-auth) + worker temizlik job'i (TODO-064/065).
- Payment provider entegrasyonu yok (F3B.2 / TODO-063); kargo/teslimat ucreti, vergi motoru, kupon,
  iade modeli, billing/shipping ayrimi (su an tek teslimat adresi) sonraki fazlara birakildi.
- Customer hesabi/login yok (anonim checkout; `customerId=null`); abandoned cart reminder yok.

### UX revizyonu (ayni faz, ikinci commit)

- Sepete ekle davranisi: "Sepete ekle" YONLENDIRMEZ; urun detayda kalir, nav sayaci guncellenir, inline
  "sepete eklendi" + opsiyonel "sepete git". "Simdi Al" sepete ekleyip checkout'a yonlendirir.
- Sunucu-otoriter siparis ozeti: gateway cart/checkout yaniti `summary` (itemsSubtotal/shipping/discount/
  taxIncluded/grandTotal + couponStatus) doner; genel toplam SUNUCUDAN gelir. DEMO kurallar (gercek motor
  YOK): KDV %20 fiyatlara DAHIL (taxIncluded gosterge, toplam'a eklenmez), kargo ₺750 ustu ucretsiz /
  alti ₺49,90, kupon `DEMO10` %10 (digerleri INVALID). shipping/discount siparise yazilir (createOrder
  + orderTotals genisletildi; total=subtotal-discount+shipping, taxAmount 0).
- Cart sidebar zenginlesti: ara toplam + adet, indirim (kupon kodu), kargo (ucretsiz/tutar + esik ipucu),
  KDV-dahil gosterge, genel toplam, kupon uygula/kaldir alani. Checkout ozeti ayni dokumu + onay panelinde
  breakdown gosterir.
- Checkout teslimat: TR il/ilce BAGIMLI dropdown (`lib/tr-location-data.ts`, 81 il + ilce; il secilmeden
  ilce kapali, il degisince ilce sifirlanir) + sunucu il/ilce tutarlilik dogrulamasi. Telefon TR cep
  formatli (+90 onek, `5XX XXX XX XX`) + sunucu normalize/validasyon (`lib/phone.ts`). Posta kodundan
  "opsiyonel" etiketi kaldirildi. Mock odeme korunur. Kupon kodu ayri httpOnly cookie'de.
- Dogrulananlar: `pnpm test:unit` 281 gecti (gateway 52 — ozet/kupon/persist dahil; tr-location-data 5;
  phone 4; cart-resolver 4; i18n parite). typecheck 0, lint temiz, build (storefront /checkout 8.45kB —
  81 il/ilce verisi client'ta), git diff --check temiz. Docker smoke (gercek Postgres): cart `summary`
  dogru (tote ₺399 esik alti → kargo ₺49,90; `DEMO10` → ₺39,90 indirim, grandTotal ₺409; invalid → INVALID),
  `POST /checkout` DEMO10 → 201 `OS-000014`, indirim/kargo siparise persist. Secret marker taramasi
  (HTML + 7 chunk + cart API): tum marker'lar (cart-secret + `commerce_os_coupon` dahil) 0 hit.
- Bilincli borc: shipping/tax/coupon "demo calculation"dir (gercek motor F3B.2+, TODO-059/063); il/ilce
  veri seti statik (guncel resmi ilce listesi; degisirse manuel guncellenir).

## Faz 2J Store-admin Koyu "Glassmorphism" Yeniden Tasarim

- Tarih: 2026-06-27
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kaynak: Claude Design handoff bundle (`commerce-os-sayfalar-n-yeniden-tasarla` / `Commerce OS -
  Store Admin.dc.html`). Hedef: `apps/store-admin-web` tum ekranlarini koyu glassmorphism dile cevirmek.
- Kapsam: YALNIZCA gorsel/tema. Hicbir akisa dokunulmadi — veri cekme, BFF/API route'lari, auth/session,
  store context, form handler'lari, lifecycle aksiyonlari ve i18n mantigi AYNEN korundu. Backend/DB/
  contracts/api-client/storefront/admin-web kapsam disi.
- Tasarim dili: koyu zemin (radial + linear gradient, `app/globals.css`), translucent cam yuzeyler
  (`bg-white/[0.06]` + `backdrop-blur-2xl`), ince beyaz kenar (`border-white/[0.09]`), indigo aksan
  (#6366f1 ailesi), SF Pro font yigini, `pdot` canli-nokta animasyonu.
- Izolasyon karari (ADR-032): paylasilan `@commerce-os/ui` (storefront-web + admin-web de kullanir;
  acik tema) DEGISTIRILMEDI. Bunun yerine `apps/store-admin-web/components/ui/index.tsx` = paylasilan
  primitive'lerin **API-uyumlu koyu karsiliklari** (Card, SectionCard, Badge, Button, StatCard,
  PageHeader, DataTable, Alert, Input/Select/Textarea, Spinner, Skeleton, EmptyState, Modal, Container).
  Locale (`useLocale`/`LocaleProvider`/`LanguageSwitcher`) ve `cn` paylasilan paketten aynen re-export.
- Degisen dosyalar (hepsi sunum): `app/globals.css` (koyu gradient zemin), `components/ui/index.tsx`
  (yeni yerel kit), `app/components/premium.tsx` (SurfaceCard/DetailHero/MetricTile/RailCard/Timeline
  koyu glass), `components/store-app-shell.tsx` + `components/store-nav.tsx` (248px koyu cam sidebar:
  kup logo + "Aktif Magaza" karti + gruplu nav Katalog/Satis/Gorunum&Ayar; 56px topbar; footer
  cikis), tum `app/(app)/*` sayfalari (UI import'u yerel kit'e cevrildi + inline acik-tema sinif
  token'lari koyu karsiliklarina donusturuldu), `components/store-login-client.tsx` (login koyu glass).
- Bilincli kabul: topbar dil secici (`LanguageSwitcher`) paylasilan paketten geldigi icin acik (beyaz)
  segmented control olarak kalir — koyu zeminde okunabilir; paketi bozmamak adina degistirilmedi.

### Kodlama esnasinda cikan hatalar ve cozumleri

- **Worktree'de `node_modules` yok** → `tsc`/`vitest` "command not found". Cozum: worktree kokunde
  `pnpm install --offline --ignore-scripts` (lockfile guncel, 2.4 sn). Bkz. memory worktree gotcha.
- **`@commerce-os/api-client` modulu cozulemiyor** (TS2307) ve ondan tureyen ~40 implicit-`any`
  (TS7006/TS7053) hatasi — orn. `store-app-shell` `part` parametresi `any`. Sebep: workspace lib
  paketleri `dist`'e build edilmemis (api-client `main: dist/index.js`). Cozum: gate sirasi — once
  `pnpm db:generate`, sonra `pnpm --filter "@commerce-os/store-admin-web^..." build` (contracts/i18n/
  api-client/ui derlendi); ardindan typecheck 0 hata. (Bkz. memory: typecheck oncesi db:generate +
  build prereqi.) Bu hatalar tasarim degisikliginden DEGIL, ortamdan kaynaklandi.
- **Inline acik-tema sinif artiklari** (`text-slate-*`, `bg-white`, `border-slate-*`, `bg-canvas`,
  `text-brand-*`) koyu zeminde gorunmez kalma riski → sed ile koyu token haritasina cevrildi; sonra
  grep ile dogrulandi (opak acik token kalmadi; yalniz kasitli `bg-white/[opaklik]` cam token'lari).
- **Plain `bg-white`** (products `DETAIL_LINK_CLASS`) sed `bg-white/[X]` token'larini bozmamak icin
  ayrica elle koyu cam buton stiline cevrildi.

### Dogrulananlar

- `pnpm db:generate` + bagimlilik lib build (contracts/i18n/api-client/ui) + `tsc -p tsconfig.json
  --noEmit` = **0 hata**.
- `vitest run` (store-admin-web): **72/72 test gecti** (bff-security 27, store-admin-interactions 14,
  orders-ui 12, product-detail-page 5, order-detail-page 5, locale-smoke 2, price-format 6, health 1)
  → akislar bozulmadi.
- Grep taramasi: `app/` + `components/` icinde opak acik-tema sinifi (slate/brand/canvas/plain bg-white)
  kalmadi; kalan `@commerce-os/ui` import'lari yalniz locale akisi + `cn` (kasitli).
- Kapsam disi / yapilmadi: paylasilan `@commerce-os/ui` koyulastirma, `LanguageSwitcher` koyu varyanti.

### Gorsel dogrulama (lokal/dev — gercek seed veri)

- Ortam: Docker dogrulama **LOKAL/DEV ortamda** yapildi. `pnpm db:migrate` + `pnpm db:seed`
  YALNIZCA lokal/dev seed dogrulamasi icin calistirildi. **Prod verisine veya prod DB'ye
  DOKUNULMADI.** Seed verisi: 2 urun, 2 kategori, 3 varyant, 6 siparis (demo-store).
- Docker container `store-admin-web` worktree context'inden `docker compose up -d --build` ile
  yeniden derlendi; **localhost:3002** uzerinde healthy + `/login` 200 + eski `bg-canvas` yok
  (yeni koyu tema servis ediliyor) olarak dogrulandi.
- Screenshot notu: harici gorsel onizleme araci 3002 portuna baglanamadigi icin ekran goruntuleri
  **ayni worktree kodu + ayni seed DB** ile (Docker gateway `localhost:4000`'e bagli) bassiz Chrome
  (CDP) uzerinden alindi; Docker imajiyla piksel olarak ozdes. Giris: gercek BFF login akisi
  (`/api/auth/login`, httpOnly session cookie).
- Kayitli ekran goruntuleri (gercek veri):
  - `docs/screenshots/store-admin-glass-redesign/login.png`
  - `docs/screenshots/store-admin-glass-redesign/dashboard.png`
  - `docs/screenshots/store-admin-glass-redesign/orders.png`
  - `docs/screenshots/store-admin-glass-redesign/products.png`
  - `docs/screenshots/store-admin-glass-redesign/product-detail.png`
  - `docs/screenshots/store-admin-glass-redesign/inventory.png`
  - `docs/screenshots/store-admin-glass-redesign/theme.png`
  - `docs/screenshots/store-admin-glass-redesign/mobile-nav.png` (PR review sonrasi eklendi)

### PR review sonrasi — responsive nav hardening (commit `fix(store-admin): harden glass shell navigation`)

- PR review geri bildirimi uzerine kabuk navigasyonu sertlestirildi. Onceki halde kenar menu
  `hidden lg:flex` oldugu icin <1024px ekranlarda navigasyon tamamen kayboluyordu.
- **Mobile/tablet nav erisimi korundu:** topbar'a yalniz `lg:hidden` hamburger butonu eklendi;
  tiklayinca masaustu menunun AYNI icerigini (marka, aktif magaza karti, gruplu nav, kullanici/
  cikis) tasiyan bir drawer (karartilmis backdrop + kapatma) acilir. Bir route'a gecince drawer
  kapanir. Masaustu sabit sidebar tasarimi degismedi; auth/store context/logout akisina dokunulmadi.
- **StoreNav `next/link`'e gecirildi:** ozel `<a href>` yerine Next.js `Link`; aktif-route mantigi
  ve gorunum birebir ayni, tam sayfa reload yerine client-side gecis. `onNavigate` prop'u drawer'i
  kapatmak icin eklendi.
- Dogrulama: typecheck 0, store-admin 72/72 test gecti; store-admin-web imaji rebuild edildi,
  localhost:3002 healthy + `/login` 200; mobil drawer gercek seed veriyle `mobile-nav.png`'de
  dogrulandi.

## Faz 3B.2 Payment Operations Foundation

Hedef: Gercek odeme saglayicisi sozlesmesi YOK; canli tahsilat yapilmaz. Sozlesme sonrasi admin
panelinden credential girildiginde canli adaptor baglanabilecek "provider-ready" odeme operasyon
altyapisini kurmak. Cikti "para cekiyor" degil, "parametreler girildiginde canli adaptor takilabilir"
seviyesidir (bkz. ADR-033).

### Yapilanlar

- DB/Prisma: `PaymentProviderConfig`, `PaymentAttempt`, `PaymentProviderEvent` modelleri + 7 enum
  (`PaymentProviderType`/`PaymentProviderMode`/`PaymentMethodType`/`PaymentProviderStatus`/`ThreeDsMode`/
  `PaymentAttemptStatus`/`PaymentProviderEventType`). Secret'lar yalniz ciphertext
  (`apiKeyCipher`/`secretKeyCipher`/`webhookSecretCipher`); PaymentAttempt'te kisa omurlu access token
  HMAC hash + TTL alanlari. Webhook idempotency `@@unique([storeId, provider, eventId])`. Migration:
  `20260627120000_add_payment_provider_foundation`.
- Payment cekirdek (`apps/api-gateway/src/payments/`): `encryption.ts` (AES-256-GCM + dev fallback +
  mask), `tokens.ts` (public odeme access token: plain yalniz response'ta, DB'de hash+TTL), `resolver.ts`
  (saf; deterministik priority asc→createdAt asc→id asc; LIVE-MOCK yasagi; fallback), `serialize.ts`
  (maskeli/client-guvenli config), `types.ts` (PaymentProviderAdapter arayuzu + PaymentConfigError),
  `adapters/` — MOCK tam calisir; IYZICO/STRIPE/PAYTR/GENERIC_REDIRECT icin **provider-specific adapter
  iskeleti**: her provider `contracts/<provider>.ts` (gercek request payload builder + response parser +
  status mapping + credential validation) + `provider-adapter.ts` (7 metod) + `http.ts` (config-gate'li
  transport). Gercek sandbox/live HTTP `PAYMENT_SANDBOX_HTTP_ENABLED` ile acilir; bu fazda KAPALI
  (mapping uretilir, canli cagri yok → `SANDBOX_HTTP_DISABLED`). Credential: eksik → `MISSING_CREDENTIALS`,
  format gecersiz → `CREDENTIALS_INVALID_FORMAT`. iyzico: Checkout Form initialize/detail + IYZWSv2 imza;
  Stripe: PaymentIntents (Bearer sk_…); PayTR: get-token + callback hash; status→PaymentAttemptStatus.
- Gateway route'lari: Admin (store-scoped, platform admin guard, audit log, MASKELI yanit) —
  list/create/get/patch/status/reorder/test-connection/events + store-wide payment-events. Secret update
  semantigi: gonderilmezse korunur, dolu gonderilirse encrypt edilip degisir.
- Checkout wiring (additive, zero-regression): `POST /public/stores/:slug/checkout` siparisi bugunku
  gibi olusturur; uygun TEST/MOCK provider varsa PaymentAttempt + access token uretir ve confirmation'a
  opsiyonel `payment` objesi ekler. **Provider yoksa `payment` alani HIC eklenmez** → response birebir,
  order UNPAID. Public token-korumalı uclar: `GET/POST /public/stores/:slug/orders/:orderId/payment`
  (token hash + expiry + store/order/attempt eslesmesi + order odenebilir + attempt TEST/MOCK; secret
  ASLA donmez). MOCK senaryolari: success→PAID, failure/insufficient_funds→FAILED, cancelled→CANCELLED,
  three_ds_required→REQUIRES_ACTION (ikinci confirm ile PAID). Webhook shell:
  `POST /payments/webhooks/:provider` (idempotency + event log; imza dogrulama placeholder).
- Contracts + api-client: provider config (maskeli)/create/update/reorder/test/event semalari + public
  payment state/submit/result; `admin.paymentProviders` client metotlari + tip re-export'lari.
- store-admin: `/payment-providers` sayfasi (liste + create/edit modal: ad/aktif-pasif/mode/oncelik/
  metotlar/para birimi/min-maks/3DS/taksit/son test; secret alanlari masked, "bos birakilirsa korunur")
  + BFF route'lari (CSRF + server-side store context + secret pass-through) + nav item ("Satis" grubu)
  + ikon + i18n (`nav.paymentProviders` + payment error kodlari). Paylasilan `@commerce-os/ui`
  etkilenmedi (yerel koyu kit, ADR-032).
- storefront: `/checkout/payment` test odeme sayfasi (token zorunlu; MOCK test kart senaryolari) +
  `payment-tester` client bileseni; checkout-form yanitta `payment` varsa odeme sayfasina yonlendirir,
  yoksa bugunku onay ekrani. i18n `payment` namespace (tr + en ayna).
- Guvenlik: Platform/store admin authorization zorunlu; store context disindaki config erisilmez;
  secret response'ta maskeli; loglarda yalniz alan adlari (deger degil). Secret leakage guard testleri.

### Dogrulananlar

- `pnpm db:generate` OK (sema gecerli), `pnpm build` 24/24 OK, `pnpm typecheck` 0 hata, `pnpm lint`
  34/34 OK, `pnpm test` 34/34 OK — api-gateway 89/89 (62 entegrasyon + 27 unit: resolver/encryption/
  adapters[provider mapping dahil]/token), store-admin-web 78/78 (6 yeni BFF payment guvenlik testi
  dahil). `git diff --check` temiz. Docker: izole tek-kullanimlik Postgres 16'da tum migration'lar
  (yenisi dahil) temiz uygulandi (kullanici DB'sine dokunulmadi).
- Regresyon: provider yokken public checkout response shape'i BIREBIR (payment alani yok, UNPAID) —
  ozel regresyon testiyle dogrulandi. Mevcut F3B.1 cart/checkout testleri korundu.
- Token guard: token'siz/yanlis/expired istek 403; basarili odeme sonrasi token tek kullanim (replay
  403). Secret leakage guard: yanitlarda duz metin secret yok.

### Kalan Bilincli Borclar

- Canli odeme YOK; gercek provider HTTP/sandbox adaptorleri ayri maddeler: iyzico (TODO-066), Stripe
  (TODO-067), PayTR (TODO-068), banka sanal POS/GENERIC_REDIRECT (TODO-069).
- Refund/dispute/settlement fazi + ayri `/payments` (operations) ekrani: TODO-070.
- Webhook imza dogrulamasi placeholder; gercek HMAC/signature verification: TODO-071.
- Checkout odeme yonlendirmesi bu fazda yalnizca MOCK provider'i surdurur (stub provider'lar test
  akisini surdurmez; canli adaptor gelince genisletilir).

### F3B.2 Revizyon — checkout/quantity/TCKN/MOCK (manuel smoke sonrasi)

Manuel izole smoke'ta gorulen 4 problem giderildi:

- **Product detail subtotal**: buy box artik adet × birim fiyati gosterir (compare-at de adetle
  carpilir). `StorefrontVariantView` ham `priceMinor/compareAtMinor/currency` tasir; istemci
  `formatMinor(unitMinor * quantity)` ile bicimler. Gizli/talep modunda davranis degismedi.
- **Checkout fatura varsayilani**: fatura bloğu tek "Fatura bilgilerim farkli" checkbox'ina baglandi
  (varsayilan KAPALI). Kapaliyken tip secimi/TCKN render edilmez; fatura iletisim/teslimattan TURETILIR
  ve TCKN/VKN ISTENMEZ. Contract'ta `billing` OPSIYONEL; verilmezse gateway varsayilan bireysel
  faturayi (ad = iletisim adi, TCKN yok) turetir. Verilirse strict dogrulama aynen (Bireysel→gecerli
  TCKN; Kurumsal→firma/vergi dairesi/gecerli VKN). "TCKN zorunlu" karari yalnizca farkli+bireysel
  fatura aciksa gecerlidir.
- **TCKN UX**: TCKN alani kontrollu input; blur/server hatasi sonrasi input-alti net hata
  ("Geçerli 11 haneli T.C. Kimlik No girin."). Server checksum dogrulamasi degismedi.
- **MOCK odeme secimi**: `buildPaymentRedirect` test akisi icin uygun adaylar arasinda MOCK varsa
  priority'den bagimsiz MOCK'u secer; boylece ENABLED MOCK, credential'siz IYZICO/STRIPE/PAYTR daha
  yuksek oncelikli olsa bile bloke olmaz. payment-tester: attempt provider MOCK degilse kart formu/
  odeme butonu gosterilmez, net "MOCK kullanin" uyarisi cikar.

Dogrulananlar: `db:generate`/`build` (24/24)/`typecheck`/`lint` (34/34)/`test` OK — api-gateway 96
(2 yeni regresyon: billing-omitted varsayilan yol; yuksek-oncelikli gercek provider'a ragmen MOCK
tercihi). İzole gateway API smoke: billing'siz checkout 201 + turetilmis fatura (TCKN yok); IYZICO
priority 0 + MOCK iken secilen provider MOCK; MOCK success → PAID, yalniz cardBrand+last4 (PAN/CVC/
secret sizmaz). `git diff --check` temiz.

**Bilincli ertelenenler (known minor UI issues):** Manuel smoke'ta gozlemlenen, F3B.2'yi bloke
ETMEYEN ufak UI eksikleri. Bilinçli olarak ertelendi; bir sonraki buyuk is sonrasinda toplu ele
alinacak (bkz. TODO-072 "F3B.2 follow-up UI polish", TODO-073 "Store-admin orders filters").

1. **3D Secure test akisi eksik/yanlis** — "3D Secure gerekli" test karti secilince gercekci bir 3D
   dogrulama/simulasyon ekrani gelmiyor; dogrudan onay butonu cikiyor ve onaylayinca odeme basarili
   oluyor. Beklenen: 3DS senaryosu ayri bir dogrulama adimi gostermeli; kullanici "3D dogrulamayi
   basarili tamamla" / "3D dogrulama basarisiz" gibi net test aksiyonlari gorebilmeli; PaymentAttempt
   timeline'da 3DS_REQUIRED / 3DS_AUTHORIZED / 3DS_FAILED durumlari izlenebilmeli. Hedef: F3B.2
   follow-up veya F3B.3 payment test polish.
2. **PDP stok limiti sepete eklemeden ONCE uygulanmali** — Demo Hoodie Black/M stogu 2 iken PDP'de
   3 adet secilebiliyor. Sepete gidince server-side reconciliation duzeltiyor (dogru), ama UX zayif.
   Beklenen: PDP adet secici stok limitini bilmeli; stok 2 ise 3'e cikilamamali veya "En fazla 2 adet
   ekleyebilirsiniz" gibi net uyari ile sepete eklemeden once engellenmeli. Hedef: F3B.2 follow-up UI
   polish / inventory-aware PDP quantity control.
3. **Taksit detaylari yetersiz** — Taksit secimi admin siparis detayinda taksitli oldugu goruluyor
   ama odeme adimi ve siparis detayinda taksit ozeti yetersiz. Beklenen: odeme adiminda secilen taksit
   icin ozet ("3 taksit × ₺…" veya aylik plan); siparis detayinda taksit sayisi yaninda tutar/toplam/
   odeme yontemi daha acik. Faiz/komisyon yoksa "vade farksiz" gibi net bilgi; gercek hesap motoru
   yokken SAHTE oran yazilmamali. Hedef: F3B.2 follow-up payment installment UX.

Admin siparis listesi filtreleri (odeme/siparis durumu, tarih araligi, musteri/e-posta arama, tutar
araligi) ayri bir admin-list UX gelistirmesi olarak TODO-073'e alindi.

Smoke override (`docker-compose.smoke.yml`) commit kapsami DISINDA (untracked) tutulur.

## Faz 3B.3 Customer Account Auth + Checkout Guard + Address Book Foundation

Branch: `claude/f3b3-customer-account-auth-address-book` (worktree). Base: main 4b8f634.

### Yapilanlar
- **Veri modeli (ADR-034):** Ayri `CustomerAccount` domaini ACILMADI; mevcut store-scoped `Customer`
  storefront uyelik hesabi olacak sekilde genisletildi. `Customer`'a `birthDate/gender/emailVerifiedAt/
  phoneVerifiedAt` eklendi; `status` enum'una `PASSIVE`/`BLOCKED`; `email` nullable yapildi ve `(storeId,
  phone)` unique eklendi (GSM-only/email-only kayit). Yeni alt tablolar: `CustomerCredential`,
  `CustomerSession`, `CustomerOtpVerification`, `CustomerIban`, `CustomerCommunicationPreference`.
  `CustomerAddress` genisletildi: `addressName`, `isDefaultShipping/Billing`, `billingType`, `tckn`,
  `companyName/taxOffice/taxNumber`, `deletedAt` (soft delete). Migration:
  `20260628120000_add_customer_account_auth_address_book` (additive; order migration gerekmedi).
- **Contracts/validation:** IBAN mod-97 (`isValidIban`), `normalizeIban`/`maskIban`, `maskTaxId`, TR
  telefon `normalizeTrPhone`/`isValidTrPhone`, `classifyIdentifier` (email|GSM tespiti) eklendi.
  Musteri auth/profil/adres/IBAN/iletisim/siparis semalari + sifre politikasi semasi. api-client bu
  yardimcilari ve tipleri re-export eder (vitrin tek type-safe kanali).
- **Gateway (yeni `customers/` modulu):** Ayri injectable `CustomerDataAccess` portu (prisma impl +
  testte in-memory fake). Public uclar `/public/stores/:slug/customer/*`: register start/verify/complete,
  login, logout, me, profile, password, communication-preferences, addresses CRUD + default, ibans
  CRUD + default, orders. Oturum `x-customer-session` header'i ile cozulur (store-scope + ownership).
  Checkout, oturum varsa order'i `customerId`'ye baglar (geriye donuk uyumlu; oturum yoksa anonim).
- **Storefront:** httpOnly `commerce_os_customer_session` cookie; gateway authed fetch katmani
  (`getCustomer`/`sendCustomer`). Auth Server Action'lari (kayit 3 adim/giris/cikis) + hesap mutasyon
  action'lari. Sayfalar: `/auth/login`, `/auth/register` (identifier→OTP→profil/sifre/onaylar),
  `/account` (sol sidebar her zaman gorunur, `?section=...`). Header'a oturum-duyarli "Hesabim"
  dropdown'i. Checkout guard: oturum yoksa `/auth/login?next=/checkout`; adres yoksa "adres ekle";
  adres varsa varsayilan secili adres defteri secici (F3B.2 fatura "farkli" akisi korundu).
- **i18n:** `auth` + `account` bolumleri ve checkout `addressBook` anahtarlari TR/EN paritesiyle eklendi.

### Dogrulananlar
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` 34/34, `test` 34/34,
  `git diff --check` temiz.
- Yeni testler: contracts +8 (IBAN/TCKN/VKN/identifier/sifre/adres semasi), api-gateway +12 musteri
  entegrasyon testi (3-adim kayit, OTP hata, email+GSM giris, cikis, adres TCKN + maskeleme, IBAN
  dogrulama + maskeleme, store-scope ownership izolasyonu, yalniz kendi siparisleri). Mevcut F3B.1/3B.2
  cart/checkout testleri korundu (submitCheckout cookie okumasi istek-disi baglamda guvenli).
- Secret/PII: storefront client bundle marker taramasi temiz (SESSION_SECRET/PASSWORD_HASH_PEPPER/
  x-customer-session/STOREFRONT_CART_SECRET yok). Plain OTP/sifre loglanmiyor (yalniz maskeli hedef).
  TCKN/VKN/IBAN response'ta maskeli; full IBAN/TCKN public yanitta yok (testle dogrulandi).

### Kalan Bilincli Borclar (backlog)
- TODO-074: E-posta/telefon DEGISIKLIGI OTP dogrulamasi — bu fazda Uyelik Bilgilerim'de salt-okunur +
  "dogrulama gerekir" notu. Gercek degisiklik OTP akisi sonraki faz.
- TODO-075: Password reset / "sifremi unuttum" akisi (kapsam disiydi).
- TODO-076: Gercek SMS/e-posta OTP teslimat saglayici entegrasyonu (su an dev/mock; `CUSTOMER_OTP_DEV_CODE`
  yalniz development/test bypass'i).
- TODO-077: Guest gecmis siparis baglama — bu fazda yalniz checkout anindaki yeni siparis customerId'ye
  baglanir; mevcut guest order'larin hesaba retro baglanmasi sonraki faz.
- Hesabim empty-state modulleri (Soru&Talepler, Degerlendirmeler, Begendiklerim, Listeler, Kuponlar)
  gercek modul degil; ilgili fazlarda (review/wishlist TODO-064/kupon F3F) doldurulacak.

## Faz 3B.3 Store-Admin Regression Fix (Orders Layout + Customers Binding)

- Tarih: 2026-06-28
- Durum: READY_FOR_REVIEW (commit atilmadi)
- Kapsam: F3B.3 sonrasi store-admin panelinde tespit edilen iki regresyon. (1) `/orders` liste
  tablosu kolon dagilimi bozuk: siparis no "OS-\n000041" gibi satir kiriyor, badge/islem kolonlari
  daginik, uzun musteri e-postasi tabloyu eziyordu. (2) `/customers` sayfasi F3B.3 ile genisleyen
  Customer modeline hic bagli degildi — sabit `EmptyState` placeholder gosteriyordu. Kapsam disi:
  buyuk admin customer management modulu, customer edit/delete/password-reset, gercek support/review/
  wishlist, orders filter bar (TODO-073 acik birakildi), customers detail route (TODO-078).

- Orders layout (`apps/store-admin-web/app/(app)/orders/page.tsx`): kok neden, generic `DataTable`
  hucrelerinde `whitespace-nowrap`/genislik kisiti olmamasiydi; 8 kolon `w-full` icine sikisinca
  auto table-layout en uzun icerige (e-posta) yer acip siparis no kolonunu eziyordu. Cozum kolon
  bazli: siparis no/tutar/durum/odeme/karsilama/kalem/islem kolonlarina `whitespace-nowrap`
  (header+hucre `column.className` ile birlikte gelir, boylece "SIPARIS DURUMU" basliklari da tek
  satir), tutarlara `tabular-nums`, musteri e-postasi `max-w-[16rem]` + `truncate` + `title`
  (tasma yerine ellipsis). `DataTable` bilesenine dokunulmadi → diger admin tablolarinda regresyon yok.

- Customers binding: yeni store-scoped salt-okunur uc `GET /stores/:storeId/customers`
  (`requireStorePlatformAdmin`; tenant scope zorunlu). Data-access `listCustomers` Customer'i
  credential varligi (yalniz `id`), siparis ozeti (adet/iptal-disi harcama/son siparis), adres
  ozeti (varsayilan adres "Sehir, Ilce") ile toparlar. Serializer yalniz guvenli/maskeli alanlari
  dondurur. Kontratlar: `storeAdminCustomerSummarySchema` + list response. api-client:
  `admin.customers.list`. BFF: `app/api/customers/route.ts` (store baglami server-side). Sayfa
  client component'e cevrildi (orders deseni): ad, e-posta/telefon, durum, uyelik (Uye/Misafir),
  dogrulama rozetleri, siparis adedi, toplam harcama, varsayilan adres, katilim tarihi + 3 ozet kart.
- PII/secret: passwordHash/tokenHash/codeHash/session/OTP ve tam TCKN/VKN/IBAN bu yuzeye HIC cikmaz;
  adres ozeti yalniz sehir/ilce. Test ile dogrulandi (response string'inde sizinti markeri yok).
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` 34/34, `test` 34/34 (api-gateway
  +3 musteri dizini testi: auth zorunlu, guvenli alan listesi + sizinti yok, cross-store izolasyon),
  `git diff --check` temiz.
- Acik kalan: TODO-073 (orders filter bar — layout fix'i buyutmemek icin acik), TODO-078 (customers
  detail route — liste dogru veriye baglandi, ayrintili profil/adres/siparis ekrani sonraki is).

## Faz 3B.3 Store-Admin Customer Management Fix (Detail Route + Update)

- Tarih: 2026-06-28
- Durum: READY_FOR_REVIEW (commit atilmadi). Ayni branch: claude/f3b3-store-admin-regression-fix.
- Kapsam: Onceki adimda `/customers` listesi baglandi ama musteri DETAY + GUNCELLEME yoktu (operasyonel
  eksik). Bu is dedicated detay route'u + tenant-scoped yonetim uclari ekler. Proje kurali geregi ana
  entity detayi MODAL DEGIL: `/customers/[id]` ayri sayfa; modal yalniz kisa adres/IBAN form'u icin.
  Kapsam disi: panelden musteri olusturma, credential/parola sifirlama (TODO-087), gercek OTP provider,
  merge/dedup, segment/B2B, support/review/wishlist.

- Eklenen uclar (gateway, store-scoped, `requireStorePlatformAdmin`): `GET /stores/:storeId/customers/:id`
  (detay: account + agregalar + adresler + IBAN + tercihler + siparisler), `PATCH .../:id` (temel bilgi
  + durum), `PUT .../:id/communication-preferences`, adres `POST` / `PATCH` / `DELETE` / `POST .../default`,
  IBAN `POST` / `DELETE` / `POST .../default`. Storefront `CustomerDataAccess` (adres/IBAN/tercih/siparis
  CRUD) ve serializer'lar yeniden kullanildi; yeni metotlar yalniz `adminFindDetail` + `adminUpdateCustomer`.
  `registerCustomerAdminRoutes` customers/index.ts'te; guard server.ts'ten enjekte edilir.
- Update davranisi/validation kararlari:
  - E-posta/telefon store-scope UNIQUE (uygulama on-kontrol + DB constraint son guvenlik agi; cakisma
    409 EMAIL_TAKEN/PHONE_TAKEN).
  - **Dogrulama karari:** admin e-posta/telefon DEGISTIRIRSE ilgili `emailVerifiedAt`/`phoneVerifiedAt`
    NULL'a cekilir ("admin verified override yok"; yeni deger yeniden dogrulama gerektirir).
  - status yalniz ACTIVE/PASSIVE/BLOCKED (ARCHIVED panelden set EDILMEZ).
  - Adres TCKN (Bireysel) / VKN (Kurumsal) F3B.2 ile ayni katilikta dogrulanir; guncellemede maskeli/bos
    tax alani mevcut degeri korur. credential/parola admin tarafindan DEGISTIRILMEZ.
- Adres yonetimi: ekle/duzenle/sil (soft delete) + varsayilan teslimat&fatura adresi sec. Siparis bolumu
  yalniz o musterinin siparisleri. IBAN: maskeli liste + ekle/sil + varsayilan; tam IBAN yalniz yazma
  yonunde gider, yanit MASKELI. Iletisim tercihleri (SMS/e-posta/telefon) update.
- UI: `app/(app)/customers/[id]/page.tsx` — kimlik header (ad/e-posta/telefon/durum/uyelik/dogrulama
  rozetleri), sag baglam rail'i (kayit/son siparis/adet/harcama/varsayilan adres), kartlar: Profil&Iletisim
  (edit modal), Uyelik&Durum (status select + dogrulama), Adresler (CRUD + default, kisa form modal),
  Siparisler (tablo), Iletisim Tercihleri (toggle), IBAN (maskeli + form modal). Liste ekranina "Yonet"
  CTA kolonu eklendi. Premium dark/glass dili korundu; uzun e-posta/adres ellipsis/nowrap.
- BFF: `app/api/customers/[id]/...` route handler'lari (GET/PATCH + alt kaynaklar; mutasyonlar CSRF'li,
  store baglami server-side). api-client `admin.customers.{get,update,updateCommunicationPreferences,
  addresses.*,ibans.*}`; storeApi karsiliklari.
- PII/secret: detay/yonetim response'larinda passwordHash/tokenHash/codeHash/session/OTP YOK; TCKN/VKN/
  IBAN MASKELI; tam IBAN/TCKN/VKN list/response'a CIKMAZ. Test ile dogrulandi.
- Modal portal fix (`components/ui/index.tsx`): müşteri detay modalları (Profil edit, Adres ekle/düzenle,
  IBAN ekle) cam kart içinde açıldığında BOZUK görünüyordu — kök neden: `backdrop-filter`'lı ata kart
  (SurfaceCard/GLASS) `position: fixed` için containing block oluşturup modalı kartın içine hapsediyordu
  (overlay tam ekranı kaplamıyor, panel saydam, sayfa içeriği sızıyor). Çözüm: `Modal` artık
  `createPortal(document.body)` ile render edilir (SSR-safe mounted guard); her zaman viewport'a göre
  tam ekran açılır. Tüm modal kullanan ekranlar (orders/products/payment) testleriyle korundu.
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` 34/34, `test` 34/34 (api-gateway
  health.test.ts 84 test; +12 yeni: detay auth/tenant-scope/404, PATCH temel+status, EMAIL_TAKEN 409,
  cross-store PATCH 404, adres CRUD+default+TCKN/VKN validation, iletisim tercihleri, IBAN maskeli,
  siparis izolasyonu), `git diff --check` temiz. Modal portal sonrası store-admin modal testleri
  (orders/order-detail/product-detail/payment-providers/store-admin-interactions) yesil.
- Acik kalan: TODO-073 (orders filter bar), TODO-087 (panelden musteri olusturma + credential/parola
  admin akisi — guvenlik kurali geregi bu fazda kapsam disi).

## TODO-073 Store-Admin Orders Filters (Operational Filter Bar)

- Tarih: 2026-06-28
- Durum: READY_FOR_REVIEW (commit atilmadi). Branch: claude/todo-073-store-admin-orders-filters.
- Kapsam: Store-admin `/orders` liste ekranina operasyonel filtre bar. Filtreler DB tarafinda uygulanir
  (client-side filtre YOK). Kapsam disi: order detail yeni ozellik, iade/iptal akisi, kargo, export/CSV,
  bulk action. Ertelendi: toplam tutar araligi (min/max) — TODO-088 (opsiyoneldi, scope buyutmemek icin).
- Filtreler (mevcut enum'lar; sozlesme tek kaynak): siparis durumu (DRAFT/PLACED/CONFIRMED/CANCELLED/
  FULFILLED), odeme durumu (UNPAID/AUTHORIZED/PAID/REFUNDED — "Basarisiz" enum'da yok), karsilama durumu
  (UNFULFILLED/PARTIAL/FULFILLED/CANCELLED), tarih araligi (gun bazli `YYYY-MM-DD`; gateway UTC gun
  basi/sonu sinirina genisletir), arama (siparis no + musteri e-postasi + musteri ad/soyad, case-insensitive).
- Sozlesme/Backend: `contracts` `orderListQuerySchema`/`OrderListQuery` (tum alanlar opsiyonel; limit/offset
  opsiyonel, gateway varsayilan limit=50/offset=0). Gateway `GET /stores/:storeId/orders` query'yi parse
  eder, `listOrders` prisma `where` ile filtreler (`status/paymentStatus/fulfillmentStatus`, `createdAt`
  gte/lte, `OR` arama). **Store-scope korunur:** `where` daima `{ storeId }` ile baslar; filtre yalniz o
  kume icinde daraltir, cross-store siparis sizmaz. Gecersiz enum/tarih → gateway 400 (zod error handler).
- api-client: `orders.list(storeId, query?, token?)` (imza degisti; query string `orderListQueryString`
  ile uretilir, bos/tanimsiz alan atlanir). Store-admin web katmani contracts'a DOGRUDAN baglanmaz —
  BFF `/api/orders` GET yalniz bilinen filtre anahtarlarini secip api-client'a tasir, nihai dogrulama
  gateway'de. storeApi `listOrders(query?)` + `orderListQueryString` export.
- UI (`app/(app)/orders/page.tsx`): tablo ustunde premium dark/glass filtre bar (SurfaceCard). URL query
  string = filtrelerin TEK dogruluk kaynagi (`useSearchParams`); sayfa yenilense de korunur. "Filtrele"
  (URL'e yazar, `router.replace`) ve "Temizle" (sifirlar) CTA'lari; aktif filtre ozeti ("{n} filtre etkin").
  Filtreye duyarli bos durum: filtre aktifken "Bu filtrelere uyan siparis bulunamadi." + Temizle; filtresiz
  klasik "ilk siparisi olustur". `useSearchParams` Suspense sinirina sarildi (build-safe). Mevcut layout
  fix korundu: siparis no nowrap, badge kolon hizasi, islem butonlari tasmaz.
- i18n: TR/EN `orders.filters.*` (title/search/status/payment/fulfillment/date/all/apply/clear/activeSummary/
  emptyTitle/emptyDescription) tam parite (i18n.test.ts tam-yol + store-admin-copy.test.ts odakli test).
- PII/secret: response yalniz mevcut serializeOrder alanlari; ek PII donmez. Filtre query'sinde hash/token/
  OTP/Bearer YOK; `createApiClient` yalniz server-side BFF'te. Secret/PII taramasi temiz.
- Gate: `pnpm db:generate` OK, `build` 24/24 (force), `typecheck` 0, `lint` 34/34 (force), `test` 34/34
  (force) — api-gateway health.test.ts 85 test (+1: status/payment/fulfillment/arama/tarih/kombinasyon/bos/
  gecersiz-enum), store-admin orders-ui 19 test (+7 filtre: default bos query, URL→query+ozet, payment
  apply, arama apply, kombinasyon, temizle, filtreye-duyarli bos durum), bff-security 28 test (+1 filtre
  forward; orders.list imza guncellendi), api-client 13 test (query string + imza), i18n filtre parite.
  `git diff --check` temiz.
- Worktree notu: dosyalar once yanlislikla ana repo path'iyle duzenlendi; patch ile dogru worktree'ye
  tasinip ana repo `git restore` ile temizlendi (main = origin/main = 86ff496, dokunulmadi).

## TODO-087 Store-Admin Customer Creation + Credential Management

- Tarih: 2026-06-28
- Durum: READY_FOR_REVIEW (commit atilmadi). Branch: claude/todo-087-store-admin-customer-creation-credential.
  Base: main = origin/main = b5959c1 (dokunulmadi).
- Kapsam: Store-admin panelden (1) yeni musteri olusturma ve (2) admin-tetikli credential/oturum yonetimi.
  Karar ADR-035: admin KALICI SIFRE BELIRLEMEZ; tek seferlik aktivasyon/parola-sifirlama token'i uretir.
- Sema/migration: yeni `CustomerCredentialToken` (`purpose` ADMIN_ACTIVATION|ADMIN_PASSWORD_RESET, sha256
  `tokenHash` @unique, `expiresAt`, `consumedAt`, `createdByUserId`; store+customer FK, indexler). Enum
  `CustomerCredentialTokenPurpose`. Migration `20260628150000_add_customer_credential_token` (additive).
  Config: `CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS` (varsayilan 24s).
- Sozlesme (contracts): `storeAdminCustomerCreateRequest/Response` (fullName + e-posta/telefon en az biri +
  status + createMembership; fullName→ad/soyad gateway'de bolunur), `storeAdminCredentialSetup` (tek
  seferlik token + purpose + expiresAt), `storeAdminCredentialTokenResponse`, `storeAdminRevokeSessions
  Response`, `customerActivateRequest/Response`. Detail response'a `security` blogu (hasCredential,
  passwordChangedAt, activeSessionCount). serializer allowlist; hash/token ASLA semada degil.
- Gateway: `POST /stores/:storeId/customers` (create + opsiyonel ADMIN_ACTIVATION token), `POST .../:id/
  credential` (uyelik yoksa), `POST .../:id/credential/reset` (uyelik varsa), `POST .../:id/sessions/
  revoke`. Public `POST /public/stores/:storeSlug/customer/activate` token'i (hash ile) bulur, atomik
  tek seferlik tuketir, scrypt ile parola set eder; ADMIN_ACTIVATION → musteri ACTIVE; her iki amac da
  parola set edildiginde mevcut TUM oturumlari revoke eder. Store-scope: cross-store erisim 404; raw
  token yalniz uretim response'unda, log'a yalniz `purpose`/`customerId`/`revokedCount`.
- api-client + BFF: `admin.customers.create/createCredential/resetCredential/revokeSessions`. Store-admin
  BFF (CSRF'li) gateway setup token'ini `STOREFRONT_BASE_URL` (server-only env) ile tek seferlik LINKE
  cevirir; raw token client'a yalniz link string'i icinde, bir kez ulasir.
- Store-admin UI: customers list "Yeni musteri" CTA + create modal (uyelik istenirse once tek seferlik
  link gosterilir, sonra `/customers/[id]`'ye yonlendirir — detail route kurali korunur). Detail'e
  "Guvenlik / Uyelik durumu" karti: credential yok → "Uyelik hesabi yok" + olustur; var → "Giris yapabilir"
  + son sifre degisimi + aktif oturum sayisi + parola sifirlama + tum oturumlari sonlandir. Tek seferlik
  link modali guvenlik uyarisi + kopyala (premium dark/glass dili).
- Storefront: `/auth/activate?token=` sayfasi + `activateAction` (oturum ACMAZ; basari → girise yonlendir).
  Token eksik/gecersiz/tuketilmis net hata. i18n TR/EN parite (store-admin create/link/security +
  storefront activate).
- Status davranisi: PASSIVE/BLOCKED login/session/checkout zaten engelliydi (`status === "ACTIVE"`
  kontrolu login + resolveCustomerFromRequest). DEGISIKLIK YAPILMADI; test ile dogrulandi.
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` 34/34, `test` 34/34 (api-gateway
  138 test; +15 yeni customer-credential.test.ts: create, dup email/phone 409, cross-store 404, detail
  security no-hash, token tek seferlik + hash saklama, activate, reuse-fail, login, reset + eski-sifre-fail,
  session revoke + revoked-session 401, PASSIVE login engeli). `git diff --check` temiz.
- Docker smoke (worktree context = build context; 3 servis `--build` + `prisma migrate deploy`):
  api-gateway `/health` 200, store-admin `/login` 200, storefront `/api/health` 200, `/auth/activate` 200.
  Uctan uca: create+membership → DB'de yalniz `tokenHash` (raw token count=0), activate PASSIVE→ACTIVE +
  token consumed, reuse 400 INVALID_TOKEN, login OK; reset → eski oturum 401 + eski sifre 401 + yeni sifre
  OK; revoke → revokedCount 1 + sonra /me 401; dup email/phone 409. Client bundle + gateway log taramasi:
  createApiClient/SESSION_SECRET/passwordHash/tokenHash/raw-token/Bearer YOK.
- Iliski: TODO-075 (musteri self-service "sifremi unuttum") ve TODO-076 (gercek e-posta/SMS teslimat) ACIK.

## TODO-072 F3B.2 Follow-up Payment/Stock/Installment Polish

- Kapsam: F3B.2 sonrasi manuel smoke'ta gozlemlenen, F3B.2'yi bloke ETMEYEN UI/UX eksiklerinin toplu
  giderilmesi. MOCK simulasyon; gercek provider/iyzico sandbox/3DS redirect KAPSAM DISI (ADR-036).
- Inventory-aware PDP quantity (Kapsam 1): `apps/storefront-web/lib/catalog-types.ts` icine saf
  `maxPurchasableQuantity({minQuantity, storeMax, available})` turetmesi (magaza max ile varyant stok
  limitinin kucugu, min altina dusmez, stok bilinmiyorsa yalniz magaza siniri). BuyBox bunu kullanir:
  stok limitinde `+` disabled + "Bu üründen en fazla N adet ekleyebilirsiniz."; varyant degisince adet
  yeni limite normalize (useEffect clamp); stok yoksa (`inStock === false`) adet kontrolleri + sepete ekle
  disabled + "Bu ürün şu an stokta yok." Gateway public DTO zaten `available` tasiyordu → DTO degisikligi
  YOK; server cart reconcile son guvenlik olarak korunur.
- 3D Secure simulasyon (Kapsam 2): "3DS gerekli" kart artik ANINDA PAID olmaz. Ilk submit REQUIRES_ACTION
  → ayri banka dogrulama simulasyon ekrani (ThreeDsChallenge: siparis no + tutar + "Doğrulamayı başarılı
  tamamla"/"Doğrulamayı başarısız yap"). MOCK adapter `ConfirmPaymentInput.threeDsOutcome` (success/fail)
  ile fail yolu eklendi (FAILED + THREE_DS_FAILED, order UNPAID kalir, retry mumkun). Sozlesme:
  `publicPaymentSubmitRequest.threeDsAction` (opsiyonel enum), `publicPaymentInfo.threeDsApplied` (safe
  boolean). Store-admin order detail payment paneli 3DS durumu gosterir (Gerekli/Doğrulama bekleniyor/
  Doğrulandı/Başarısız); success ekrani "3D Secure: Doğrulandı".
- Installment + success UI (Kapsam 3+4): odeme adimi/success ekrani/store-admin panelinde taksit ozeti
  ("N taksit × ₺X" + toplam + "Vade farksız"). SAHTE oran/faiz YOK — toplam degismez, esit bolunur
  (computed UI; yeni DB alani yok, mevcut `installmentCount`). Success ekrani: siparis no, urunler, odeme
  (saglayici/yontem/maskeli kart/3DS/taksit/islem no/tarih), teslimat + fatura ozeti, test modu notu,
  "Siparişlerime git" (`/account?section=orders`) + "Alışverişe devam et" CTA.
- Guvenlik: full PAN/CVC sunucuya gider, dogrulanir, ASLA saklanmaz/serialize edilmez/loglanmaz (yalniz
  marka + son 4 + scenario + taksit). Yanit serializer'lara eklenen tek yeni alan `threeDsApplied`
  (boolean). i18n TR/EN parite (stok limiti/stokta yok, 3DS aksiyonlari, taksit ozeti/vade farksiz,
  siparislerime git).
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` temiz (worktree path turbo gotcha
  nedeniyle dogrudan eslint ile dogrulandi), `test` yesil — storefront 60 (+buy-box-quantity saf clamp
  testi + SSR out-of-stock), store-admin 89 (+3DS panel testi), api-gateway 139 (+MOCK 3DS fail testi),
  contracts 21. `git diff --check` temiz.
- Docker smoke (worktree context = build context; postgres+redis+3 servis `--build`): tum servisler
  healthy; api-gateway `/health` 200, storefront `/api/health` 200 + `/products` 200, store-admin
  `/login` 200. Public DTO `available` dogrulandi (demo-hoodie 6/15/24). Payment POST `threeDsAction`
  alani kabul (bogus order → 404 kontrollu, 400/500 degil). Diff secret/PII taramasi: yeni full PAN/CVC/
  token/hash sizintisi YOK.
- Not (worktree gotcha): bu oturumda ilk duzenlemeler yanlislikla main worktree path'ine yazildi; degisikler
  `git stash -u` ile dogru worktree branch'ine tasindi, main temiz birakildi, gate'ler worktree'de tekrar
  kosuldu.

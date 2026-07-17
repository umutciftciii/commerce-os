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

## TODO-079 Account Orders Detail + Post-Order Actions

- Kapsam: Hesabim > Siparislerim'i musteri-facing operasyonel seviyeye cikarmak. Gercek iade/destek/review/
  kargo-takip lifecycle KAPSAM DISI (placeholder; bkz. TODO-080..083).
- Ust yapi (Kapsam 1-2): `OrdersSection` (sunucu bileseni) — baslik + aciklama, URL query ile korunan 3 sekme
  (`?section=orders&tab=all|buy-again|not-shipped`) + "tum siparislerde ara" (GET form, `&q=`). Filtre/arama
  saf fonksiyonlarda (`apps/storefront-web/lib/orders.ts`): `filterOrdersByTab` (buy-again = iptal/taslak
  haric; not-shipped = UNFULFILLED/PARTIAL & iptal degil), `searchOrders` (sipariş no / urun adi / varyant /
  SKU, TR-duyarsiz). Veri gateway'de zaten store+customer scoped doner; filtre yalniz sunum.
- Sipariş karti (Kapsam 3): `OrderStatusBadges` (durum/odeme/karsilama, dürüst i18n label + ton), tutar,
  satirlar (gorsel ALTYAPISI YOK → harf placeholder), `OrderActions` (istemci) CTA grubu.
- Detay route (Kapsam 4): `app/account/orders/[orderNumber]/page.tsx` — oturum zorunlu (yoksa login redirect),
  `getCustomerOrderDetail` yalniz kendi siparisini doner; `null` → `notFound()` (404). Tutar kirilimi (ara
  toplam/indirim/kargo/KDV dahil/toplam), satirlar (urun link + SKU + adet + satir toplami), teslimat adresi,
  fatura ozeti (taxId MASKELI), odeme bilgisi (varsa).
- Post-order CTA kararlari (Kapsam 5-8): iade CTA yalniz FULFILLED/PARTIAL + iptal/iade DEGIL gorunur,
  15 gün penceresi dolunca "İade süresi doldu" notuyla pasif (`returnEligibility` saf fonksiyon); destek CTA
  dürüst placeholder ("yakında aktif olacak"); yorum CTA yalniz teslimat (FULFILLED) sonrasi aktif
  (`canWriteReview`), aksi halde "Teslimattan sonra yorum yazabilirsiniz." Hicbiri yanlis vaat icermez.
- Buy-again (Kapsam 7): `lib/server/order-actions.ts#buyAgainAction` Server Action. Yalniz KENDI siparisi
  (`getCustomerOrderDetail` own-only). Sipariş satirlari GÜNCEL katalogdan dogrulanir (`resolveCart` → gateway):
  yalniz `status !== UNAVAILABLE && inStock && availableQuantity > 0` varyantlar uygun adetle sepete eklenir;
  digerleri "mevcut degil" sayilir → kismi ekleme + "Bazı ürünler artık mevcut değil." Eski sipariş satiri
  FIYATINA GÜVENILMEZ (fiyat/uygunluk guncelden gelir). Bkz. DECISIONS ADR-037.
- Backend (Kapsam 10): `customerOrderSummarySchema` genisletildi (`fulfillmentStatus` + line `variantId/
  productSlug/sku`); yeni `customerOrderDetailSchema` (+ address/billing/payment alt-semalari). Gateway
  `CustomerDataAccess.listOrders` genisletildi + yeni `getOrderDetail` (own-scoped). Yeni route
  `GET /public/stores/:slug/customer/orders/:orderNumber` (allowlist serializer; baska musteri/yok → 404).
  Ödeme GÜVENLI alanlari: provider/method/cardBrand/cardLast4/installmentCount/transactionId(=providerReference)/
  threeDsApplied/paidAt; PAN/CVC/accessTokenHash ASLA select EDILMEZ. Fatura taxId `maskTaxId` ile maskeli.
  `serializeCustomerOrderSummary` admin detay yuzeyinde de yeniden kullanildi (tek serializer).
- i18n: TR/EN `account.orders` genisletildi (subtitle, tabs, search, card, actions, fulfillmentValues,
  buyAgain, return, support, review, detail). Parite testi (i18n) yesil.
- Testler: gateway (`customer-account.test.ts`) — own-list (+fulfillmentStatus/line alanlari), detay own +
  GÜVENLI ödeme + maskeli taxId + PAN/token sizinti yok, baska musteri detay 404, guest 401. Storefront
  (`orders-filter.test.ts`) — sekme/arama/applyFilters/iade penceresi (15 gün sinir)/yorum gorunurlugu.
- Gate: `pnpm db:generate` OK, `build` 24/24, `typecheck` 0, `lint` temiz, `test` yesil — storefront 75,
  api-gateway 142, i18n 35 (parite dahil), store-admin 89. `git diff --check` temiz.
- Docker smoke (shared `docker` stack, worktree koduyla `api-gateway`+`storefront-web` `--build`; postgres/redis
  volume + seed KORUNDU — bilincli secim, final merge sonrasi merged main'den yeniden build edilecek):
  api-gateway `/health` 200, storefront `/api/health` 200; guest `/account?section=orders` → 307
  `/auth/login?next=/account`; yeni order endpoint'leri guest 401, bad-store 404. Customer-auth E2E icin
  GEÇICI `CUSTOMER_OTP_DEV_CODE=000000` ile YALNIZ api-gateway recreate (commit edilmeyen scratchpad override;
  DB/seed dokunulmadi) → yeni test musteri register + checkout ile gercek sipariş (OS-000043, Tote ×2 +
  Hoodie-L ×1, PLACED/UNPAID/UNFULFILLED). Dogrulananlar: liste (fulfillmentStatus + line variantId/sku),
  detay (tum allowlist + maskeli fatura + payment null cunku UNPAID), arama (eslesme + dogal dilli bos durum),
  sekme all/buy-again/not-shipped, detay sayfa render + olmayan sipariş 404, buy-again güncel-katalog
  dogrulamasi (available varyantlar OK, OUT_OF_STOCK varyant `unavailable` branch). Cross-customer izolasyon:
  ikinci musteri A'nin siparisine 404 + bos liste. Teardown: dev-code kaldirildi, api-gateway plain config ile
  recreate, `000000` artik `INVALID_OTP` (400) — bypass kapali, health 200.
- Secret/PII/payment kontrolu: order detay JSON yalniz GÜVENLI alanlar (PAN/cvc/tokenHash/passwordHash/codeHash
  yok); gateway log'da plain OTP/parola yok; order serializer maskeli taxId. NOT (pre-existing, TODO-079 DISI):
  (a) Next `force-dynamic`+`cookies()` account sayfalarinda istemcinin KENDI httpOnly oturum cookie'sini RSC
  payload'una serialize ediyor — `addresses`/`profile` (bu fazda dokunulmayan) bolumlerde de ayni; uucuncu-taraf
  sizintisi degil (cross-customer 404 izolasyonu kanitli). (b) `createApiClient` storefront client bundle'inda
  goruluyor; kaynak F3B.3 `address-manager`/`iban-manager`'in api-client VALUE import'u (validator'lar) — TODO-079
  order bilesenleri api-client'tan yalniz `import type` kullanir. Ikisi de F3B.3 deseni; ayri temizlik TODO'su
  onerildi.

## TODO-090 Storefront Client Bundle Hygiene (api-client out of client)

- Kapsam: Storefront "use client" component'lerinin `@commerce-os/api-client`'tan VALUE import etmesi
  nedeniyle gateway'e baglanan `createApiClient`'in client bundle'a sizmasini kesmek. TODO-079 smoke'unda
  gozlemlenen pre-existing (F3B.3 deseni) sorun; urun davranisi degismez.
- Cozum: TR dogrulama yardimcilari (`isValidTckn`/`isValidTaxNumber`/`isValidTrPhone`/`isValidIban`/
  `detectCardBrand`/`cardLast4`/`luhnValid`/`classifyIdentifier` + maske/normalize) saf, bagimsiz
  `packages/contracts/src/validators.ts` modulune tasindi (zod bagimliligi YOK). `contracts` index `export *
  from "./validators.js"` ile tum public yuzeyi korur. `@commerce-os/api-client/validators` ve
  `@commerce-os/contracts/validators` alt-yollari `package.json` `exports` ile eklendi; api-client validators
  alt-modulu `index.ts`'ten (dolayisiyla `createApiClient`'tan) bagimsiz.
- `classifyIdentifier` zod'dan arindirildi: zod v3 `z.string().email()` regex'i birebir kopyalandi; gateway +
  vitrin tek dogrulama otoritesi korunur (contracts testleri yesil).
- Migrasyon: 5 client component value import'larini alt-yola gecirdi — `account/sections/address-manager`,
  `account/sections/iban-manager`, `checkout-form`, `payment-tester`, `auth/register-flow`; tip import'lari
  barrel'da kaldi (erased, bundle etkisi yok).
- Dogrulama: `grep -rE createApiClient apps/storefront-web/.next/static` → BOS; secret/token grep
  (`INTERNAL_API_TOKEN|SESSION_SECRET|PASSWORD_HASH_PEPPER|Bearer`) → BOS; `git diff --check` temiz;
  `db:generate` OK, `build` 24/24, `typecheck` 0, `lint` 34/34, `test` 34/34 (contracts 21, gateway 142 dahil).
- Operasyon kurali: `docs/PROMPT_RULES.md` icine Worktree Path Guard eklendi (izole worktree'de tum dosya
  islemleri aktif worktree path'ine baglanir; yanlislikla main repo'ya yazimda commit'siz dur → stash/patch ile
  worktree'ye tasi → main temizle → raporla). Bu fix sirasinda yasanan gotcha'dan turetildi.
- Commit: `de66ae3` (urun + exports + dokumantasyon); docs kapanis ayri commit.

## TODO-089 Storefront RSC Cookie Serialization Audit

- Kapsam: TODO-079 smoke'unda "account sayfalari istemcinin KENDI httpOnly oturum cookie'sini RSC flight
  payload'una serialize ediyor" raporlanmisti. Bu denetim, raw oturum jetonu / cookie DEGERININ herhangi bir
  client-delivered ciktida (HTML / RSC payload / client bundle / Server Action sonucu / API response) gorunup
  gorunmedigini netlestirir. Urun davranisi degismez; salt denetim + regresyon sentinel'i.
- Bulgu: Uygulama kodu raw jetonu HICBIR yere sizdirmiyor.
  - Statik analiz: jeton yalniz sunucuda `readCustomerToken()` (`lib/server/customer-cookie.ts`) ile okunur ve
    YALNIZCA `x-customer-session` server-to-server fetch header'ina konur (`lib/server/gateway.ts`
    `customerHeaders`). `lib/server/customer.ts` okuma yardimcilari yalniz `CustomerAccount`/orders/addresses/
    iban/comm-pref view model'leri dondurur (jeton/hash alani YOK). Server Action'lar (`auth-actions.ts`,
    `account-actions.ts`, `order-actions.ts`) yalniz `{ ok, code, data? }` dondurur; `loginAction`/
    `registerCompleteAction` jetonu yalniz `writeCustomerToken` ile httpOnly cookie'ye yazar — donus degerine
    KOYMAZ. Account page/order-detail page hicbir client component'e jeton/cookie/header prop'lamaz.
  - Build grep: `apps/storefront-web/.next/static` (client'a teslim edilen chunk'lar) tum marker'lardan
    (`commerce_os_customer_session|x-customer-session|SESSION_SECRET|PASSWORD_HASH_PEPPER|passwordHash|
    tokenHash|codeHash`) TEMIZ. `commerce_os_customer_session` yalniz server-only `.next/server/chunks/170.js`
    icinde LITERAL COOKIE ADI sabiti olarak (`a.get("commerce_os_customer_session")?.value`) gecer — raw
    deger degil, server-side okuma. `x-customer-session` de yalniz server chunk'inda.
  - Sentinel test: `apps/storefront-web/test/account-session-boundary.test.tsx` (4 test) — `next/headers`
    cookie'sine SENTINEL jeton konur, gateway fetch mock'lanir: (1) tum account bolumleri (orders/profile/
    addresses/iban/communication) render edilir → HTML SENTINEL ICERMEZ; (2) jeton gateway fetch'inde
    `x-customer-session` olarak GIDER (sunucu-yanli kullanim kaniti); (3) `getCurrentCustomer()` view
    model'i SENTINEL icermez; (4) `loginAction` sonucu (gateway yaniti raw token tasisa da) SENTINEL
    ICERMEZ — RSC payload boundary'si.
- Kok neden / yorum: Orijinal gozlem buyuk olasilikla RSC navigation (`?_rsc=`) ISTEK `Cookie` header'inin
  (tarayicinin same-origin httpOnly cookie'yi otomatik gondermesi — httpOnly amacina UYGUN, JS erisemez) YANIT
  payload'u ile karistirilmasidir. Uygulama kaynakli serialize sizinti tespit edilmedi; fix gerekmedi.
- Runtime smoke karari: Logged-in full runtime RSC smoke YAPILMADI (karar geregi). Gerekce: shared
  api-gateway'i gecici `CUSTOMER_OTP_DEV_CODE` ile restart etmeyi gerektirir (login icin tum mesru yollar
  korunan secret ister: session forge → `SESSION_SECRET`, parola set → `PASSWORD_HASH_PEPPER`, kayit → OTP
  dev-code + gateway restart); shared stack'i bozmanin operasyonel riski ek kanit degerinden yuksek. Yapilan
  runtime smoke: api-gateway `/health` 200, storefront `/api/health` 200, guest `/account` → 307
  `/auth/login?next=/account`. "runtime logged-in smoke skipped by decision; static/build/sentinel evidence
  sufficient." Ileride gerekirse izole stack ya da dev OTP'li ayri smoke ile yapilabilir.
- Gate: `db:generate` OK, `build` 24/24, `typecheck` 0 hata, storefront `lint` temiz, storefront `test`
  79/79 (yeni sentinel 4 dahil), `git diff --check` temiz.
- Degisiklik: yalniz yeni sentinel test dosyasi + docs (urun kodu degismedi).

## TODO-094 F3C.1 Shipping Provider Foundation — Faz A (Backend)

- Kapsam: Mağaza-scoped opsiyonel kargo saglayici altyapisi (MOCK / GELIVER / DHL_ECOMMERCE). Admin-kontrollu
  foundation: checkout'ta otomatik kargo YOK, odeme sonrasi otomatik kargo/barkod YOK. Pattern: F3B.2 payment
  provider foundation (ADR-033). Bkz. ADR-039..042. Faz B (store-admin UI + order detail shipping panel + BFF +
  runtime smoke) AYRI birakildi.
- Veri modeli (`packages/db/prisma/schema.prisma` + migration 20260628160000_add_shipping_provider_foundation):
  ShippingProviderConfig, ShippingProviderCredential (type bazli; IDENTITY ayrica customerNumber/customerPassword/
  identityType), Shipment, ShipmentEvent, ShipmentQuote + enumlar (ShippingProviderType/Mode/Status,
  ShippingCredentialType, ShipmentStatus/EventType). Store/Order ters iliskileri eklendi. Secret alanlar yalniz
  encrypted* ciphertext olarak saklanir.
- Sifreleme (`apps/api-gateway/src/shipping/encryption.ts`): ayri SHIPPING_ENCRYPTION_KEY (AES-256-GCM). Anahtar
  yoksa HICBIR ortamda fallback YOK → CONFIG_MISSING (lazy cipher). PAYMENT_ENCRYPTION_KEY fallback'i yok. Config:
  `packages/config` (+ guard bayraklari). `.env.example` + docker-compose api-gateway env'i guncellendi (local dev
  key yalniz docker smoke icin, gercek secret degil).
- Provider abstraction (`apps/api-gateway/src/shipping/`): `ShippingProviderAdapter` sozlesmesi + normalized result
  modelleri; varsayilan KAPALI HTTP transport (SHIPPING_HTTP_DISABLED); registry; ALLOWLIST serializer (secret/
  ciphertext/JWT/customerPassword DONMEZ). MOCK tam calisir. DHL adapter (client/mappers/adapter): X-IBM headers,
  Identity token (sanitize: jwt/refreshToken result'a cikmaz, kisa omurlu in-memory cache), calculate/get/track/CBS
  mapper'lari, createOrder/createbarcode guard. Geliver adapter: testConnection + createTest (test-only) + label
  purchase guard; canli shipments.create/acceptOffer cagrilmaz.
- Destructive guard'lar (uc katmanli: env flag && providerConfig.allow* && request.explicitConfirm): createOrder →
  409 ORDER_CREATE_DISABLED, createbarcode → 409 BARCODE_CREATE_DISABLED, Geliver label → 409 LABEL_PURCHASE_DISABLED.
  Hepsi varsayilan KAPALI.
- Gateway uclari (`apps/api-gateway/src/shipping/routes.ts`, server.ts'e register): GET/POST providers, PATCH :id,
  POST/DELETE :id/credentials, POST :id/test, order rate/create-order/create-barcode, GET order shipping, DHL CBS
  preview. Tumu requireStorePlatformAdmin + store-scope (cross-store → 404) + ALLOWLIST + audit (yalniz alan adlari).
- api-client + contracts: `admin.shippingProviders.*` + `admin.orderShipping.*`; zod request/response semalari.
- Testler: 24 yeni unit (shipping-encryption 5, shipping-mappers 8, shipping-adapters 11). Kanit: cipher fallback-yok/
  CONFIG_MISSING; token sanitize (JWT/refreshToken result'ta yok); Identity request X-IBM+body; calculate/status/
  barcode/CBS mapper normalize; serializer secret dondurmez; createOrder/createbarcode/label guard 409; Geliver
  createTest destructive degil (transport disabled). Cross-store route izolasyonu Faz A docker smoke'a birakildi.
- Gate: db:generate OK, build (pnpm -r) tum paketler OK, typecheck 0 hata, lint temiz, test yesil (api-gateway 166
  — 24 yeni dahil; storefront 79, store-admin 89, admin-web 24, contracts/api-client/ui vb. degismeden gecti).
  git diff --check temiz.
- Secret kontrolu: local dev key dist/client bundle'a sizmadi (0); store-admin client bundle shipping secret yok (0,
  UI Faz B); kaynak shipping kodunda JWT literal yok (0); repo disi shipping env MISSING (gercek credential yok).
- Faz A docker smoke (api-gateway worktree kodundan rebuild, shared postgres/redis; migration deploy OK):
  /health 200; platform admin login → store; provider create MOCK/DHL eCommerce/Geliver → 201; DHL IDENTITY
  credential upsert → 200 ALLOWLIST yanit (configured:true, maskedKey "••••XYZ7", secretSet/customerNumberSet/
  customerPasswordSet:true; raw secret/customerPassword/ciphertext DONMEDI — grep 0); DHL testConnection canli
  cagri YOK (transport kapali; eksik STANDARD_COMMAND → ok:false net mesaj); destructive guard'lar: DHL create-order
  → 409 ORDER_CREATE_DISABLED, DHL create-barcode → 409 BARCODE_CREATE_DISABLED, Geliver create-barcode → 409
  LABEL_PURCHASE_DISABLED; list 3 provider; olmayan config → 404; tum yanitlarda raw secret/JWT grep 0. Canli
  destructive (DHL createOrder/createbarcode, Geliver acceptOffer) ve gercek credential smoke YAPILMADI (kapsam disi).

## TODO-094 F3C.1 Shipping Provider Foundation — Faz B (Store-admin UI)

- Kapsam: Faz A backend foundation üzerine store-admin kullanıcı arayüzü. Kargo Sağlayıcıları
  ayar sayfası + sipariş detayı kargo paneli + BFF pass-through + i18n + testler + runtime smoke.
  Gerçek canlı DHL createOrder/createbarcode, Geliver acceptOffer, checkout shipping engine,
  customer-facing tracking, return lifecycle KAPSAM DIŞI (önceki fazlarla aynı çizgi).
- Settings sayfası (`app/(app)/shipping/providers/page.tsx`): provider listesi (MOCK / Geliver /
  DHL eCommerce — UI'da "DHL eCommerce"; "MNG" yok), kart/tablo (status, mode, configured cred sayısı,
  canlı işlem guard durumu, son test, enable/disable, test CTA). Create modal (provider/displayName/mode).
  Edit modal (status/mode + allowOrderCreate/allowBarcodeCreate/allowLabelPurchase toggle + guard uyarısı).
  Credentials modal: Geliver DEFAULT API key; DHL Identity (X-IBM id/secret + müşteri no/şifre + identityType) +
  Standard Command/Standard Query/Barcode Command (zorunlu) + CBS/Bulk/Finance (opsiyonel). Her credential:
  configured + maskedKey + save/clear; secret input'ları `type="password"`; "boş bırakılırsa korunur"
  semantiği; kaydedilen secret tekrar düz gösterilmez.
- Order detail paneli (`app/(app)/orders/[id]/shipping-panel.tsx`): provider seçimi, alıcı snapshot
  (sipariş kargo adresinden), paket bilgileri (parça/kg/desi/packaging/service/payment/delivery + DHL için
  city/district kodu), calculate CTA (tahmini ücret), createOrder/createBarcode CTA (default guarded → 409),
  Geliver test gönderi CTA, mevcut gönderi listesi, provider-yok empty state, "canlı işlem kapalı" uyarısı.
- BFF (`app/api/shipping/providers/*` + `app/api/orders/[id]/shipping/*`): 9 route, `requireStoreContext`
  + `isValidCsrfRequest` + pass-through (payment BFF deseni). Raw credential response'a dönmez; api-client
  client bundle'a girmez (yalnız server BFF kullanır).
- i18n: `storeAdmin.nav.shippingProviders` (TR "Kargo Sağlayıcıları" / EN "Shipping Providers"); sayfa/panel
  metinleri locale-farkındalıklı yerel TR/EN sözlüğüyle (parite korunur). ShippingIcon + store-nav öğesi.
- Testler (+13): store-admin BFF güvenlik (9 — session/CSRF guard, server-context store/token, token sızmaz,
  masked-only yanıt, destructive op CSRF-gated, plain secret echo yok) + page render (4 — empty state,
  DHL eCommerce label & "MNG yok", credential modal masked + password-type secret inputlar, guard uyarısı).
  i18n parite (store-admin-copy) yeşil.
- Gate: build (pnpm -r) ✓, typecheck 0, lint temiz, test yeşil (store-admin 102 — 13 yeni dahil; api-gateway 166,
  i18n 35, contracts 21, api-client 13, storefront 79, admin-web 24). git diff --check temiz.
- Docker runtime smoke (api-gateway + store-admin-web worktree kodundan rebuild): api-gateway /health 200;
  store-admin /login 200; /shipping/providers & /orders 307 (auth guard login'e yönlendirir); gateway destructive
  guard'lar 409 (DHL create-order/create-barcode, Geliver create-barcode); store-admin authenticated BFF akışı
  (csrf → login 200 → GET /api/shipping/providers 200) — 3 provider, credential maskeli (••••XYZ7), yanıtta
  secret/ciphertext/token sızıntısı 0.
- Secret kontrolü: store-admin client bundle (.next/static) grep — X-IBM-Client-Secret / SHIPPING_ENCRYPTION_KEY
  değeri / createApiClient / JWT / refreshToken / customerPassword değeri / Bearer literal = 0. BFF yanıtlarında
  plain secret 0. Test snapshot yok (toMatchSnapshot kullanılmadı).

## TODO-094 F3C.1 — Faz B düzeltme: provider capability modeli (runtime UX bug)

- Bağlam: Faz B runtime testinde yakalandı — sipariş kargo panelinde Geliver seçiliyken "Ücret hesapla"
  butonu açıktı ve tıklanınca backend `NOT_IMPLEMENTED` (Geliver `calculateRate` desteklemiyor) → 409
  dönüyor, UI bunu "Beklenmeyen bir hata oluştu" olarak gösteriyordu. Provider "test OK" olması rate/create/
  label operasyonlarının desteklendiği anlamına gelmiyordu.
- Backend: Config response'una türetilmiş `capabilities` eklendi (`apps/api-gateway/src/shipping/serialize.ts`
  `computeShippingCapabilities`): canTestConnection / canCalculateRate / canCreateTestShipment / canCreateOrder /
  canCreateBarcode / canPurchaseLabel + destructiveActionsDisabledReason. Karar: MOCK rate+create (ENABLED iken);
  Geliver canCalculateRate=false (offer akışı yok), canCreateTestShipment yalnız ENABLED + DEFAULT cred; DHL
  canCalculateRate yalnız ENABLED + STANDARD_QUERY cred, destructive yalnız allow*+env. Tüm yetenekler ENABLED
  şartına bağlı. Capability env-guard'larıyla hesaplanır (route serialize'a `ShippingEnvGuards` geçirir).
- Backend: rate endpoint capability guard'ı — `canCalculateRate=false` ise adapter'a gitmeden 409
  `OPERATION_NOT_SUPPORTED` (operation/provider detaylı). `sendShippingError` adapter `NOT_IMPLEMENTED`'ini de
  `OPERATION_NOT_SUPPORTED`'a eşler. Mevcut destructive guard kodları (ORDER/BARCODE/LABEL) korundu.
- i18n: `storeAdmin.errors`'a shipping hata kodları (TR+EN paritesi) — OPERATION_NOT_SUPPORTED, PROVIDER_DISABLED,
  CONFIG_INCOMPLETE, CONFIG_MISSING, ORDER/BARCODE/LABEL_..._DISABLED, SHIPPING_HTTP_DISABLED, AUTH_FAILED →
  `messageForError` artık net localize mesaj döner ("Beklenmeyen hata" değil).
- UI panel: capability-aware — DISABLED provider seçilince "aktif değil, önce aktifleştirin" uyarısı + tüm
  aksiyonlar disabled; `canCalculateRate=false` → "Ücret hesapla" disabled + "ücret hesaplama desteklenmiyor"
  notu; Geliver → "Test gönderi oluştur" CTA (createTestShipment); DHL createOrder/barcode capability'e göre disabled.
- Testler (+6): capability türetme (3 — MOCK/GELIVER/DHL) + panel render (3 — Geliver rate disabled & test CTA,
  DISABLED provider aktivasyon uyarısı & disabled aksiyonlar, empty state). Toplam api-gateway 169, store-admin 105.
- Gate yeşil (build/typecheck 0/lint temiz/test). Docker runtime smoke: capabilities serialize doğru (Geliver
  canCalculateRate=false, canCreateTestShipment=true); Geliver rate → 409 OPERATION_NOT_SUPPORTED {operation:RATE,
  provider:GELIVER}; destructive guard kodları korundu (ORDER_CREATE_DISABLED/BARCODE_CREATE_DISABLED/
  LABEL_PURCHASE_DISABLED); settings page 200 / panel 307 (auth guard).

## Faz 3C.1 DHL TEST/LIVE base URL + x-api-version + Plus Command + cart quote contract (TODO-094B/C/D)

- Tarih: 2026-06-29
- Durum: READY_FOR_REVIEW (commit atılmadı; branch claude/f3c1-shipping-provider-foundation, HEAD b2dc446 üzerine
  uncommitted)
- Güvenli external doğrulama (değerler yazdırılmadan, .secrets/commerce-os-shipping.local.env process env):
  - DHL Identity POST /mngapi/api/token (+x-api-version) → HTTP 200, JWT alındı.
  - DHL CBS getcities/getdistricts/34 → HTTP 401 (IBM gateway httpCode/httpMessage; CBS_INFO ürünü bu X-IBM
    anahtarı için sandbox'ta abone değil).
  - DHL Standard Query /calculate (Bearer ile) → HTTP 401 (STANDARD_QUERY ürünü abone değil).
  - Geliver: Bearer auth GEÇERLİ — GET /api/v1/providers, /shipments, /transactions → 200; eski /geo/cities → 404.
- Base URL düzeltmesi: DHL adapter mode→host çözer (TEST→DHL_ECOMMERCE_TEST_BASE_URL, yoksa TEST_BASE_URL_MISSING
  ve CANLI host'a fallback YOK; LIVE→DHL_ECOMMERCE_LIVE_BASE_URL). client builder'lar host parametrik; OpenAPI
  path'leri host'a eklenir.
- x-api-version: tüm DHL test/live isteklerine DHL_ECOMMERCE_API_VERSION header eklendi (önceden hiç yoktu).
- Plus Command: ShippingCredentialType.PLUS_COMMAND + ShippingProviderConfig.allowRecipientCreate
  (migration 20260629130000); createRecipient adapter skeleton (DHL) + RECIPIENT_CREATE_DISABLED guard (default
  KAPALI); MOCK deterministik createRecipient; Geliver OPERATION_NOT_SUPPORTED. Store-admin'e allowRecipientCreate
  toggle + TR/EN label.
- Geliver testConnection: doğrulanmamış /geo/cities (404) yerine doğrulanmış /providers (200) kullanır; testType
  GEO_CITIES → PROVIDERS.
- Cart quote contract: cartShippingQuoteResponseSchema (provider/source/status/amountMinor/currency/errorCode/
  message/calculatedAt) YALNIZ contract seviyesinde bırakıldı. KARAR (2026-06-29): DHL calculate cart/checkout
  fiyatı için KULLANILMAYACAK; DHL eCommerce bir OPERASYON sağlayıcısıdır. Sepet/checkout kargo bedeli ayrı faz
  F3C.2 Shipping Price Engine (TODO-108, mağaza/admin tarife/rate-plan modeli) ile çözülecek. TODO-094D geri
  çekildi → F3C.2'ye taşındı. Mevcut sabit kargo kuralı provider quote DEĞİLDİR.
- Testler (+5 adapter): TEST_BASE_URL_MISSING (canlı fallback yok), TEST host + x-api-version taşınması,
  RECIPIENT_CREATE_DISABLED default, Geliver /providers testConnection, x-api-version identity request.
- Gate yeşil: db:generate ✓; build (config/contracts/api-client/api-gateway) ✓; typecheck (api-gateway build +
  store-admin tsc --noEmit) 0 hata; lint temiz; testler api-gateway 184 / store-admin 107 / contracts 21;
  git diff --check temiz. Sızıntı taraması: değişen dosyalarda gerçek secret/JWT/API key YOK (yalnız header ADI
  ve testteki sahte negatif-assertion JWT'si).
- Docker smoke: bu turda ÇALIŞTIRILMADI (kapsam: backend foundation + contract + güvenli dış doğrulama; cart UI
  ucu açık). DHL canlı destructive operasyon (createRecipient/createOrder/createbarcode/cancel) ÇALIŞTIRILMADI.

## Faz 3C.2 Shipping Price Engine — mağaza tarifesi (TODO-108, ADR-044)

Branch: claude/f3c2-shipping-price-engine. Temel karar: kargo ücreti SAĞLAYICI quote'u DEĞİLDİR; mağaza/admin
kargo TARİFE planından hesaplanır. DHL eCommerce operasyon sağlayıcısı olarak kalır (F3C.1); fiyat motoru ondan
bağımsız ve sağlayıcıya istek atmaz.

- Veri modeli (migration 20260629140000_add_shipping_price_engine):
  - Enum: ShippingRatePlanStatus (ACTIVE/PASSIVE), ShippingRatePricingMode (FIXED/FREE_THRESHOLD/DESI_TABLE/
    WEIGHT_TABLE/DESI_AND_REGION_TABLE), ShippingRateSource (STORE_FIXED_RULE/STORE_SHIPPING_TARIFF/MOCK).
  - ShippingRatePlan (storeId, provider nullable, name, status, isDefault, pricingMode, currency, fixedAmountMinor,
    freeShippingThresholdMinor, validFrom/To) + ShippingRateRule (min/max desi & kg, city/district/region kodu,
    amountMinor, extraAmountMinor, sortOrder).
  - Order kargo snapshot: shippingCurrency / shippingSource / shippingRatePlanId / shippingRatePlanName (tutar
    zaten Order.shippingAmount'ta). Product/ProductVariant: shippingWeightKg / shippingDesi (nullable; varyant
    ürünü override eder).
- Hesaplama motoru: apps/api-gateway/src/shipping/price-engine.ts (saf, deterministik). FIXED/FREE_THRESHOLD adres
  gerektirmez; DESI/WEIGHT tablo modları sepet desi/kg + min–max bracket; DESI_AND_REGION_TABLE adres ister.
  Spesifiklik: ilçe>şehir>bölge>generic, eşitlikte sortOrder. Ölçüm eksik → MISSING_SHIPPING_DIMENSIONS; eşleşen
  kural yok → RATE_NOT_FOUND; aktif/default plan yok → NO_RATE_PLAN. Free threshold tüm modlarda geçerli.
- Gateway: store-admin rate-plan CRUD + rules + set-default uçları (rate-plan-routes.ts; tek default guard
  transaction). Cart endpoint quote'u (guest/no-address → ADDRESS_REQUIRED) ve checkout quote'u (teslimat adresi
  ile; OK değilse 409 SHIPPING_QUOTE_UNAVAILABLE) eklendi. Rate plan çözümü dataAccess üzerinden (in-memory test
  + prisma ortak yol). Eski hardcoded ₺49,90 / ₺750 kaldırıldı → store tarifesinden gelir.
- Contracts: shippingRatePlan/rule CRUD + list/detail şemaları; cartShippingQuoteResponseSchema genişletildi
  (status: OK/ADDRESS_REQUIRED/NO_RATE_PLAN/RATE_NOT_FOUND/MISSING_DIMENSIONS/UNAVAILABLE/ERROR; source +
  STORE_SHIPPING_TARIFF; ratePlanId/ratePlanName/freeShipping). publicCartSchema'ya `shipping` alanı.
- Store-admin: /shipping/rates sayfası (liste + tarife formu + kural editörü + set-default/enable-disable/sil),
  BFF route'ları, api-client.admin.shippingRatePlans.*, sidebar "Kargo Tarifeleri" + i18n TR/EN.
- Storefront: cart-view kargo satırı duruma göre mesaj (ADDRESS_REQUIRED/NO_RATE_PLAN/UNAVAILABLE) veya fiyat/
  ücretsiz; i18n shippingPending/shippingNoRatePlan/shippingUnavailable (TR/EN). Quote fail → checkout ödeme
  adımı bloke.
- Seed: demo store default rate plan "Standart Kargo" (FREE_THRESHOLD, 4990 / 75000) — eski sabit kural artık
  store tarifesi.
- Testler: price-engine birim (14), gateway cart/checkout shipping + snapshot (guest ADDRESS_REQUIRED, FIXED
  tarife, free threshold, NO_RATE_PLAN bloke, snapshot yazımı), store-admin rate-plans BFF (7). Tüm workspace test
  task'ları yeşil (api-gateway 202, store-admin 114, storefront, contracts, admin).
- Gate: db:generate ✓; build (tüm workspace) ✓; typecheck ✓; lint ✓; test ✓; git diff --check temiz.
- Kapsam dışı (TODO): bölge yönetimi UI/regionCode türetme (TODO-109), ürün kargo ölçümü admin UI (TODO-110),
  CSV import/export (TODO-111), sipariş sonrası DHL operasyon otomasyonu (TODO-112). DHL canlı destructive
  operasyon ve canlı fiyat çekme ÇALIŞTIRILMADI (tasarım gereği yok).

## F3C.2 REVİZYON — Generic Shipping Tariff Engine (ADR-044 revizyon)

- Karar: her provider için ayrı fiyat motoru YAZILMADI. Tek generic tariff engine; provider fiyat listeleri
  generic modele (tier/zone/rule/surcharge) maplenir. Provider'a özel işler ileride CSV/Excel import mapper
  (TODO-111).
- Model: yeni `ShippingRateTier` / `ShippingRateZone` / `ShippingSurcharge` + `ShippingChargeType` enum
  (FLAT/PER_KG/PER_DESI/PER_KG_OR_DESI/PER_ADDITIONAL_KG_OR_DESI). `ShippingRateRule` + tierId/zoneId/chargeType/
  unitAmountMinor/baseAmountMinor/baseThreshold; amountMinor nullable. Geriye uyumlu migration
  (20260629150000_revise_shipping_tariff_engine): amountMinor NOT NULL kaldırıldı, chargeType DEFAULT 'FLAT'
  backfill — mevcut sabit-ücret kuralları birebir korunur.
- Engine: billableWeight = max(totalWeightKg, totalDesi); seçim sırası plan→tarih→free-threshold→tier→zone/geo→
  bracket→chargeType→surcharge. 30+/31+ = PER_ADDITIONAL_KG_OR_DESI (base + (billable−threshold)×unit). Frontend
  AUTHORITATIVE hesap yapmaz; backend yeniden hesaplar.
- Gerçek fiyat listesi çıkarımı (model doğrulaması için):
  - **DHL eCommerce**: aylık gönderi adedi SEGMENTİ (Tarife I/II/III sözleşme grubu) → `ShippingRateTier`
    (monthlyShipmentMin/Max). Segment içinde DESİ ARALIKLARI (0–1, 1–2, ... 30+) → `ShippingRateRule`
    (minDesi/maxDesi FLAT; 30+ → PER_ADDITIONAL_KG_OR_DESI).
  - **Aras Kargo**: MESAFE ZONU (şehir içi/yakın/kısa/orta/uzak/KKTC/mobil alan) → `ShippingRateZone`
    (code CITY/NEAR/SHORT/MEDIUM/FAR/KKTC/MOBILE). Zon × KG/DESİ ARALIĞI → `ShippingRateRule`; 31+ KG →
    PER_ADDITIONAL_KG_OR_DESI. Ek hizmetler (SMS, taşıma güvencesi, mobil alan, hamaliye/ağır gönderi) →
    `ShippingSurcharge`.
  - **Yurtiçi Kargo**: en/boy/yükseklik/ağırlık → desi/ücrete-esas ağırlık (= billableWeight=max(kg,desi)) +
    standart taşıma + ek hizmet + KDV + genel toplam ayrımı. Ek hizmet kalemleri `ShippingSurcharge`.
  - Açık teyitler: 30+/31+ toplam mı ek-birim mi (TODO-113); adres→zon çözümleme (TODO-114); gerçek boyut alanları
    + volumetrik divisor (TODO-110).
- Admin UI: /shipping/rates modal yerine TAM GENİŞLİK panel; Basit (sabit/eşik/desi) ve Gelişmiş (tier/zone/rule/
  chargeType/surcharge) görünüm. Backend + API + BFF tier/zone/surcharge CRUD hazır.
- Testler: price-engine 25 (16 mevcut korundu + 9 yeni: DHL tier 100/250/700, Aras zone, 31+, billableWeight,
  zone+tier+desi, surcharge). api-gateway 213, store-admin 114, contracts 21, api-client 13 — yeşil.
- Gate: db:generate ✓; build (db/contracts/api-client/api-gateway/store-admin Next) ✓; typecheck (pnpm -r) ✓;
  lint ✓; test ✓; git diff --check temiz.

## F3C.2 BLOCKER FIX — Ürün/varyant kargo ölçüsü admin UI (TODO-110 DONE)

- Root cause: Şema kolonları (Product/ProductVariant.shippingWeightKg/shippingDesi) ve cart hesaplaması F3C.2'de
  hazırdı; ANCAK contracts (input/response), serialize ve admin UI bu alanları taşımıyordu → DESI_TABLE/WEIGHT_TABLE/
  PER_KG_OR_DESI tarifeleri gerçek checkout'ta çalışamıyordu (ölçü girilemiyor).
- Çözüm: contracts product/variant create/update + response şemalarına shippingWeightKg/shippingDesi (>0 nullable);
  serializeProduct/serializeVariant Decimal→number; createProduct/createVariant persist; cart fallback
  resolveShippingDims (varyant→ürün; saf, test edilir). Admin: ürün formu + varyant editörüne "Kargo ölçüleri"
  bölümü (i18n TR/EN). Seed: demo-tote (desi 3 / 0.4 kg) + demo-hoodie (desi 5 / 0.6 kg).
- Testler: contracts validation (0/negatif red, null/omit kabul); resolveShippingDims (override/fallback/null);
  UI render + payload (product-detail-page); i18n parity. Suites: contracts 23, i18n 36, api-gateway 214,
  store-admin 114 — yeşil.
- Runtime smoke (Docker, worktree image): admin API PATCH demo-tote dims 200 (desi 0 → 400; DB precision 0.400/3.00);
  DESI_TABLE default plan (0–10 desi → 5500); demo-tote checkout OS-000048 subtotal 39900 + kargo 5500 = 45400,
  snapshot source STORE_SHIPPING_TARIFF; demo-hoodie (ölçü yok) checkout → 409 SHIPPING_QUOTE_UNAVAILABLE
  (shipping.status MISSING_DIMENSIONS, ödeme bloke). Secret scan temiz.
- Gate: db:generate ✓; build ✓; typecheck ✓; lint ✓; test ✓; git diff --check temiz.
- Kalan: TODO-115 (gerçek en/boy/yükseklik + otomatik volumetrik desi).

### F3C.3 — DHL Sandbox Operation Verification + Admin Order Shipping Action
- Sandbox smoke (testapi.mngkargo.com.tr, process-only guard flag'leri): Identity token 200, CBS
  getcities/getdistricts 200, Standard Query abonelik OK. **createRecipient** (recipient wrapper) 200,
  **createOrder** (marketPlaceShortCode:"") 200 → array[{orderInvoiceId,orderInvoiceDetailId,shipperBranchCode}],
  **getorder** 200, **createbarcode** 200 → {invoiceId,shipmentId,barcodes[],...} ZPL üretildi (Üsküdar/87),
  **getshipmentstatus/trackshipment** 200 (barcode sonrası). Branch routing ilçeye bağlı: Tuzla/Üsküdar/
  Sancaktepe/Arnavutköy/Ataşehir OK; Küçükçekmece kalıcı "HAT KODU BULUNAMADI"; Sultangazi geçici "tekrar deneyin".
  cancel: tüm path varyantları 404 → ENDPOINT_UNRESOLVED. Hiçbir secret/jwt/refreshToken/ZPL loglanmadı.
- Wiring: client.ts (recipient wrapper + marketPlaceShortCode) + mappers (array createOrder, boolean isDelivered,
  no-ZPL barcode, single-object track) fix'leri. Yeni gateway route'ları /dhl/prepare|barcode|sync|cancel
  (ShipmentEvent timeline + duplicate createOrder guard + sanitize persist). BFF pass-through (CSRF +
  requireStoreContext). store-admin order detail paneli: prepare/barcode/sync aksiyonları + durum kartı
  (shipmentId/invoiceId/trackingNumber kopyala + trackingUrl link) + event timeline; cancel disabled.
- Runtime smoke (worktree gateway :4010 + gerçek MNG sandbox): prepare→duplicate→barcode→sync
  uçtan uca yeşil (Shipment ORDER_CREATED→LABEL_CREATED, 4 ShipmentEvent, gerçek tracking
  "İSTANBUL (BAĞCILAR) Gönderi Hazırlandı"); cancel 409 ENDPOINT_UNRESOLVED. **Bulgu:** MNG
  sandbox createRecipient/createOrder/createbarcode/getcities çağrıları runtime'da ~15s
  sürebiliyor; eski sabit 15s transport timeout'u sınırda abort/500 üretiyordu. **Çözüm:**
  sağlayıcı HTTP timeout'u env-configurable yapıldı (DHL_ECOMMERCE_HTTP_TIMEOUT_MS, default
  60000); timeout aşımı ham AbortError yerine sanitize SHIPPING_HTTP_TIMEOUT (504) döner.
- F3C.3 DHL operasyon finalizasyonu (2026-06-30) BEKLEMEYE alındı: DHL/MNG'ye 4 operasyonel soru iletildi
  (createbarcode sparse koşulu, createRecipient boş body/hat kodu, "Sipariş Kargoya Verildi" vs isDelivered:0
  anlamı, trackshipment location çıkış/varış). Yanıt gelene kadar retry/pending/cancel/tracking-gösterim
  tasarımı donduruldu. Sanitize req/resp zinciri dhl-sandbox-report.json olarak DHL'e iletildi. Temel F3C.3
  kodu zaten main'de (4cf8032); ileriye dönük ek merge/push yapılmayacak.

## F3C.3 — DHL yanıtına göre operasyon finalizasyonu (clarification fix)

- Tarih: 2026-06-30
- Durum: KOD HAZIR (commit/merge/push YOK — branch claude/f3c3-dhl-sandbox-operation-verification)
- Tetik: DHL/MNG bekleyen 4 operasyonel soruya yanıt verdi. Bu tur DHL implementasyonunu yanıta göre
  finalize eder (ADR-045 revizyonu). Rate engine / matrix UI / provider-agnostic refactor KAPSAM DIŞI
  (sonuncusu TODO-121).
- Uygulanan kararlar:
  - **statusCode 0-7 normalize eşlemesi** (`mapProviderStatusToShipmentStatus`): 0→ORDER_CREATED,
    1→LABEL_CREATED, 2/3→IN_TRANSIT, 4→OUT_FOR_DELIVERY, 5→DELIVERED, 6→DELIVERY_FAILED, 7→RETURNED.
    5/7 final; 6 final değil (ACTIVE). Rank tabanlı regresyon koruması + terminal guard. Ham kod/metin
    shipmentStatusCode + event statusText'te saklanır.
  - **createbarcode boş 200** → LABEL_PENDING + BARCODE_PENDING event; trackingNumber/shipmentId/ZPL set
    EDİLMEZ; retry mümkün. `barcodeJsonSafe` genişletildi (shipmentIdPresent/invoiceIdPresent/
    providerReturnedEmptyPayload). Dolu yanıt → LABEL_CREATED (mevcut davranış).
  - **hat kodu routing hatası** → BARCODE_FAILED event (sanitize) + BARCODE_RETRYABLE_ERROR (409);
    status ilerletilmez; createOrder TEKRAR çağrılmaz (duplicate prepare guard korunur).
  - **cancel endpoint** teyit edildi: `PUT barcodecmdapi/cancelshipment` body `{referenceId,shipmentId}`.
    adapter + route + UI etkin; guard env DHL_ECOMMERCE_ALLOW_CANCEL + providerConfig + explicitConfirm;
    shipmentId yoksa CANCEL_REQUIRES_SHIPMENT_ID; başarı → CANCELLED + event.
  - **createRecipient boş 200 body** başarı sayılır (zorunlu parse yok).
  - **UI copy:** "Kargoya verildi" otomatik yok; normalize status açıklamaları; timeline location
    "İşlem noktası" (varış şubesi DEĞİL); ham sağlayıcı durumu ayrı "(ham)" etiketiyle. i18n TR/EN parity.
  - **Data model:** additive migration `20260630120000_dhl_shipment_operation_statuses` (ShipmentStatus +=
    LABEL_PENDING/OUT_FOR_DELIVERY/DELIVERY_FAILED; ShipmentEventType += BARCODE_PENDING/BARCODE_FAILED).
- Test/smoke adresi notu: Küçükçekmece KULLANILMAZ; DHL'in önerdiği routable Bağcılar (Bağlar Mah. 1. Sok.
  No:1 Bağcılar/İstanbul) veya routable Üsküdar kullanılır.
- Secret/ZPL: raw ZPL/^XA/JWT/X-IBM secret log/DB/UI/bundle'a yazılmaz; yalnız zplPresent/barcodeCount gibi
  güvenli özet.

### F3C.4 — Shipping Tariff Matrix Entry + CSV Import (TODO-111, ADR-044 devamı)
- **Bağlam:** F3C.3 DHL operasyonu DHL yanıtını beklerken, provider operasyonuna dokunmadan kargo tarife GİRİŞ
  UX'i iyileştirildi. F3C.2 modeli doğru ama veri girişi zahmetliydi (DHL = 9 desi × 3 tarife = 27 kuralı
  tek-tek eklemek). Önce Claude Design tasarım/spec raporu + görsel mockup alındı (kullanıcı onayladı), sonra
  implementation yapıldı. main = origin/main = 98c6415 üzerinden (32459d6'ya reset YOK; F3C.3 kodu korunuyor).
- **Karar:** Tasarım otoritesi olarak spec Claude tarafından üretildi (ortamdaki DesignSync claude.ai/design
  senkron aracıdır, tasarım üreticisi değil); DesignSync push yapılmadı (kullanıcı kararı).
- **Backend (api-gateway):** Saf `matrix-service.ts` (`buildMatrixDiff` grid→CREATE/UPDATE/UNCHANGED/EMPTY +
  plannedOps; `parseCsvToMatrix`; `parseTrDecimalToMinor` TR ondalık). 4 uç eklendi (rate-plan-routes):
  `/matrix/{preview,apply}`, `/import/{preview,apply}` — store-scoped (cross-store 404), preview DB'ye yazmaz,
  apply tek transaction (partial → rollback). YALNIZ upsert; matris kapsamı dışındaki kurallar korunur. 30+
  satırı configurable (FLAT / PER_ADDITIONAL_KG_OR_DESI, varsayılan PER_ADDITIONAL).
- **Contracts + api-client + store-admin client:** `ShippingMatrix*`/`ShippingImport*` şema ve tipleri; api-client
  `matrixPreview/matrixApply/importPreview/importApply`; store-admin `previewShippingMatrix/applyShippingMatrix/
  previewShippingImport/applyShippingImport`.
- **BFF (store-admin-web):** 4 route (CSRF + requireStoreContext, server-side store/token; client storeId yok sayılır).
- **UI:** `/shipping/rates` → `PlanEditor`'a üçüncü sekme **"Matris"** (tablo modlarında ANA AKIŞ; Basit/Gelişmiş
  korundu). `MatrixManager.tsx`: Segment (desi×tarife) / Bölge (desi×zone) modu, eksen (desi/kg), DHL şablonu
  (tier yoksa Tarife I/II/III otomatik oluşturur + DHL desi satırları), satır ekle/sil, hücre fiyat girişi, 30+
  davranış seçimi + taban ücret, CSV paste paneli, değişiklik özeti (oluştur/güncelle/değişmeyen/boş) ve hata
  listesi, diff renk kodu (yeşil=create, indigo=update). Mevcut matris kuralları ızgaraya geri türetilir
  (fiyat listesi yönetimi hissi). TR/EN i18n parity.
- **Testler:** `shipping-matrix.test.ts` (15, saf: DHL preview/create, idempotent update, boş hücre atlama, 30+
  PER_ADDITIONAL/FIXED, TR ondalık, negatif red, aralık/overlap, kapsam-dışı kural korunur, CSV parse uçtan uca,
  ZONE/WEIGHT). `shipping-matrix-bff.test.ts` (5: CSRF/session, server context, token sızdırmaz, i18n parity).
  Gate: db:generate + build (24/24) + typecheck (0) + lint (0) + test (api-gateway 245, store-admin 119,
  contracts 23) + git diff --check temiz.
- **Not (TR locale "I" tuzağı):** `normalizeKey` `toLocaleLowerCase("tr-TR")` kullanır → "Tarife I" → "tarife ı"
  (noktasız). CSV başlığı ile tier adı aynı normalize'dan geçtiği için tutarlı eşleşir; test kurgusunda da
  `normalizeKey` kullanılmalı (elle "tarife i" yazılırsa eşleşmez).
- **Kalan:** CSV/Excel file upload + toplu export + zone generic şablon (TODO-111 KALAN). Commit/merge/push YOK
  (kullanıcı talebi: önce rapor).

## F3C.5 — Provider-agnostic Shipment Operations UI + Shipment domain ayrımı (TODO-121 / ADR-046)

Kargo operasyonu Order detayındaki DHL panelinden çıkarılıp bağımsız **Shipment** lojistik domain'ine taşındı.
Order = ticari işlem (özet + CTA), Shipment = lojistik işlem (liste/detay/operasyon). Hibrit kapsam: UI tamamen
provider-agnostic; backend generic alias'lar mevcut DHL adapter mantığına dispatch eder (tam engine refactor
sonraki tur).

- **Data model (additive):** migration `20260630160000_add_shipment_provider_logo` →
  `ShippingProviderConfig.logoUrl/logoAlt` (public, secret değil) + `ShipmentEventType.MANUAL_TRACKING`.
- **Gateway (`apps/api-gateway/src/shipping`):** serialize'a `buildShipmentProviderInfo` +
  `computeShipmentActionCapabilities` (canPrepare/canCreateLabel/canSync/canCancel/canManualTracking +
  disabledReason) + `shipmentKpiBucket` + logo. routes'a paylaşılan helper'lar (`applyCreateLabel/applySync/
  applyCancel/applyManualTracking` — order-scoped DHL route'ları da bunları kullanır, regresyon yok) ve
  store-level uçlar: `GET /shipping/shipments` (search/status/provider/dateRange/flag filtre + KPI groupBy +
  order/customer/provider join), `GET /shipping/shipments/:id` (detay + generic capability), `POST
  …/:id/create-label|sync|cancel|manual-tracking`. envGuards += `cancel`.
- **Contracts + api-client:** `shipmentStatusValueSchema` (named, paylaşılan), `shipmentProviderInfoSchema`,
  `shipmentActionCapabilitiesSchema`, `shipmentListItem/Kpi/ListResponse/ListQuery`, `shipmentDetail*`,
  generic action request'leri + provider logo create/update alanları ("" => temizle semantiği). api-client
  `admin.shipments.{list,get,createLabel,sync,cancel,manualTracking}` + tip re-export.
- **BFF (store-admin-web):** `/api/shipping/shipments` (GET, filtre forward) + `/api/shipping/shipments/[id]`
  (GET) + 4 aksiyon POST (CSRF + requireStoreContext, server-side store/token).
- **UI:** `/shipping/shipments` (KPI StatCard'lar + filtreler + DataTable, satır → detay) + `/shipping/
  shipments/[id]` (özet + provider-safe **stepper** [Gönderi Kaydı→Barkod→Taşıma→Teslimat→Tamamlandı] +
  "İşlem noktası" timeline + capability-driven generic aksiyon paneli). Order detayında `ShippingPanel`
  (661 satır DHL paneli) **kaldırıldı** → `OrderShipmentSummary` (özet + "Kargo Detayına Git" / born-from-order
  "Gönderi Kaydı Oluştur"). Paylaşılan `ProviderLogo` (initials fallback) + `lib/client/shipment-ui.ts`
  (generic status/event/KPI/step sözlüğü). Provider config UI'a logo URL + alt + preview; logo liste/detay/
  özet/sağlayıcı ekranlarında. Nav "Kargo Gönderileri" linki + TR/EN i18n.
- **Generic copy garantisi:** UI'da DHL/sağlayıcıya özel buton/copy YOK; provider yalnız displayName+logo.
  "Kargoya verildi" otomatik durum üretilmez; timeline "İşlem noktası" (varış şubesi DEĞİL).
- **Testler:** gateway `shipping-shipment-ops.test.ts` (10: capability matrisi, KPI kovaları, provider-info,
  logo serialize). store-admin `order-shipment-summary.test.tsx` (3: empty/no-shipment+CTA/summary+detail
  link, operasyon paneli order'da yok, "Kargoya verildi" yok) + `shipment-screens.test.tsx` (2: liste
  kolonları+KPI, detay generic aksiyon copy + "İşlem noktası" + DHL-spesifik metin yok). Eski
  `shipping-panel.test.tsx` kaldırıldı.
- **Gate:** db:generate + build (24/24) + typecheck (0) + lint (0) + test (api-gateway 264, store-admin-web
  121, toplam 34 task) + git diff --check temiz. **Runtime smoke:** Next build her iki route'u dynamic (ƒ)
  derledi; gateway health test (264, full app boot + route registration) geçti; canlı HTTP stack smoke
  (worktree docker gotcha) çalıştırılmadı. **Secret/ZPL:** yeni UI/BFF taramasında yalnız `ctx.token`
  (server-side BFF→gateway auth, standart) eşleşti; response/UI/bundle'a sızıntı yok. Commit/merge/push YOK.

### F3C.5 manuel UI inceleme fix (5dc3cfb checkpoint sonrası, revert YOK → üzerine fix)

Manuel UI incelemede çıkan bug/UX maddeleri düzeltildi (kararlar: order özet kartı dış sağlayıcıya istek atmaz —
düşük regresyon; yeni DRAFT/prepare uçları bu turda yazılmadı, TODO-126).

- **Manuel tracking → status ilerler (#2):** `applyManualTracking` artık `manualTrackingNextStatus(serialize.ts)`
  ile hazırlık aşamasındaki gönderiyi (`DRAFT/ORDER_CREATED/LABEL_PENDING/LABEL_CREATED`) `IN_TRANSIT`'e ilerletir;
  ileri/terminal durumlar korunur (regres yok). `MANUAL_TRACKING` event copy "Manuel takip numarası eklendi.".
  Order ana ticari `OrderStatus` enum'una DOKUNULMADI; order özet kartı shipment status üzerinden güncel görünür.
  DHL createbarcode sonrası otomatik "kargoya verildi" davranışına DÖNÜLMEDİ (yalnız explicit manuel aksiyon).
- **Order detail CTA (#6, B kararı):** `OrderShipmentSummary` salt-okunur özet oldu — destructive inline create
  form KALDIRILDI, doğrudan `prepareDhlShipment`/`createOrderShipment` çağrısı YOK. Shipment yoksa güvenli özet
  (alıcı önizleme + güvenlik-kilidi notu + "Kargo Gönderileri" linki); varsa özet + "Kargo Detayına Git".
- **Guard copy (#5):** Yanıltıcı "Canlı/Live" guard copy'leri kaldırıldı → "güvenlik kilidi" çerçevesi
  (i18n error code'lar tr+en: RECIPIENT/ORDER/BARCODE_CREATE_DISABLED, CANCEL_DISABLED, SHIPPING_HTTP_DISABLED;
  providers sayfası izin toggle/uyarı copy'leri; `shipment-ui.ts` PROVIDER_ACTIONS_DISABLED). "canlı" yalnız
  "bu güvenlik kilidi canlı/test ayrımından bağımsızdır" cümlesinde kaldı (bilinçli).
- **Status tutarlılığı (#4):** liste/detay/order özet tek `SHIPMENT_STATUS_LABEL/TONE` helper'ından beslenir;
  takip no yoksa "Henüz oluşmadı" (liste + detay + order özet), varsa üçünde aynı no.
- **Tarife UI (#1, copy-only):** "DHL şablonu oluştur" → "Şablon seç" (TR/EN); backend/matrix engine'e
  dokunulmadı. Tam detail-page refactor borcu TODO-121 altında **bilinen UI borcu** olarak listelendi.
- **Provider logo (#3):** kod değişikliği yok; TODO-125 (upload/storage) eklendi. logoUrl geçici MVP.
- **Testler:** gateway `shipping-shipment-ops.test.ts`'e `manualTrackingNextStatus` (advance + no-regress)
  testleri; store-admin tarafında order summary destructive-call-yok + guard copy "Canlı" geçmez + status
  helper paritesi güncellendi. **Bilinen UI borcu:** TODO-121 tarife detail-page refactor, TODO-126 draft flow.

### F3C.5 online-first revizyon (kullanıcı kararı — "test etmeden entegrasyon bilinemez")

Bir önceki manuel-inceleme "order detay istek atmaz" kararı REVİZE edildi (bkz. DECISIONS ADR-046 revizyonu).
Yeni model: **online BİRİNCİL, manuel İKİNCİL fallback.**

- **Order özet kartı (`OrderShipmentSummary`) yeniden yazıldı:** "Gönderi Oluştur" → provider select + parça/kg/desi
  + alıcı önizleme → submit ONLINE dener (DHL `prepareDhlShipment` = createRecipient + createOrder; generic
  `createOrderShipment`). Başarı → `/shipping/shipments/[id]`'e yönlenir (DHL prepare shipment.id döner; generic'te
  refetch ile id bulunur). **Sağlayıcı hatası HAM patlamaz** → tone=warning "Geçici bir sağlayıcı hatası oluştu.
  Manuel gönderi ile devam edebilirsiniz." + İKİNCİL "Manuel Gönderi Hazırla" CTA'sı görünür.
- **Manuel fallback (TODO-126):** yeni `POST /stores/:storeId/orders/:orderId/shipping/shipment-draft` —
  provider'a İSTEK ATMAZ, yerel `ORDER_CREATED` shipment (recipient/pieces siparişten) + manuel-işaretli
  `ORDER_CREATED` event ("…sağlayıcıya istek atılmadı"). Zincir: gateway route + `shippingPrepareRequestSchema`
  reuse + api-client `orderShipping.shipmentDraft` (tip+impl) + BFF `/api/orders/[id]/shipping/shipment-draft`
  (CSRF+store ctx) + store-admin `createShipmentDraft`. Detayda "Manuel Takip No Gir" → IN_TRANSIT.
- **Sandbox guard'ları (local/test) AÇIK:** `SHIPPING_SANDBOX_HTTP_ENABLED` + `DHL_ECOMMERCE_ALLOW_RECIPIENT/
  ORDER/BARCODE_CREATE/CANCEL`. Değerler repo-DIŞI `.secrets/commerce-os-shipping.local.env`'de (flag=enabled);
  docker'a repo-DIŞI override (`commerce-os-shipping.compose.override.yml`, `${VAR}` interpolation) + `--env-file`
  ile geçer. **Tracked compose/.env.example production-safe default (kapalı) korur**; gerçek değer/secret tracked
  dosyaya yazılmaz.
- **createOrder ≠ createbarcode ≠ fiziksel teslim** ayrımı korunur (ADR-045); barkod shipment detayında ayrı aksiyon.

## TODO-117 Müşteri-tarafı kargo takip UI (storefront sipariş detayı)

F3C.5'in (provider-agnostic shipment domain + store-admin shipment ekranları) müşteri-facing tamamlayıcısı.
Şimdiye kadar kargo takibi yalnız store-admin panelindeydi; müşteri kendi siparişinin gönderi durumunu
göremiyordu. Bu iş, mevcut müşteri sipariş detayı route'una (`/account/orders/[orderNumber]`) **salt-okunur**
bir kargo takip kartı ekler. **Yeni operasyon, provider çağrısı veya state machine YOK** — yalnız mevcut
Shipment domaininin müşteri-güvenli bir projeksiyonu.

- **Gateway (allowlist DTO).** `GET /public/stores/:storeSlug/customer/orders/:orderNumber` yanıtına additive
  `shipment` bloğu eklendi (yoksa `null`). `getOrderDetail` siparişin EN GÜNCEL shipment'ını + event'lerini
  çeker; yalnız müşteri-güvenli alanlar SELECT edilir: `providerConfig.displayName/logoUrl/logoAlt`, `status`,
  `trackingNumber`, `trackingUrl`, `updatedAt`, event'ler (`eventType/statusText/location/occurredAt`). SECRET/iç
  alan (barkod/ZPL `barcodeJsonSafe`, `labelUrl`, `externalOrderId/ShipmentId/InvoiceId`, `referenceId`,
  `rawSafeJson`, alıcı telefon/adres) ÇEKİLMEZ. Sözleşme: `customerOrderShipment*` (contracts), allowlist `parse`.
- **Müşteri-görünür event filtresi (ADR-045).** `isCustomerVisibleShipmentEvent` operasyonel-iç adımları
  (`CREATED/BARCODE_CREATED/BARCODE_PENDING/BARCODE_FAILED/WEBHOOK_RECEIVED`) müşteriden gizler — ancak bir
  konum (işlem noktası) taşıyan her event anlamlı sayılıp dahil edilir. `lastLocation` = son konumlu event.
- **Storefront.** Saf helper `lib/shipment.ts` (durum→ton, 4 adımlı stepper index'i, problem/iptal kontrolü,
  logo baş-harf fallback); server component `components/account/shipment-tracking.tsx` (sağlayıcı + logo,
  durum rozeti, takip no + harici link `rel=noopener noreferrer nofollow`, stepper, "işlem noktası" timeline).
  Detay sayfası shipment varsa kartı render eder. **Premium light-first dil + brand (#9743CD) aksanı** korunur.
- **ADR-045 KORUNUR.** "Kargoya verildi" otomatik üretilmez: `ORDER_CREATED` stepper'da hazırlık adımıdır
  (step 0), teslim yalnız `DELIVERED`'da tamamlanır (step 3); konum kesin varış değil → "işlem noktası".
- **İzolasyon/güvenlik.** Own-only zaten `getOrderDetail` (store+customer+orderNumber) ile; başka müşteri/yok →
  404 (değişmedi). Hiçbir ayrıcalıklı secret/admin token client'a girmez (provider logo PUBLIC URL).
- **i18n.** TR/EN paritesi `account.orders.detail.tracking.*` (status/event etiketleri, stepper adımları, copy).
- **Testler.** Gateway: shipment allowlist + secret-yok + event filtresi + status passthrough; shipment yoksa
  `null`; own-only 404 korunur. Filtre unit: `isCustomerVisibleShipmentEvent`. Storefront saf helper:
  step index (ORDER_CREATED < DELIVERED), tone, problem/cancel, initials. Gateway 269, storefront 86 test geçer.
- **Doğrulama:** db:generate / build / typecheck / lint / test / git diff --check yeşil.
- **KALAN:** Canlı provider tracking SYNC'i (TODO-100/104, webhook imza); checkout'ta provider seçimi + logo
  (TODO-125). Bu iş yalnız mevcut shipment verisini müşteriye dürüstçe yansıtır.

## TODO-125 — Checkout kargo sağlayıcı/seçenek seçimi + storefront provider/logo akışı (ADR-047)

- **Karar.** Bir "kargo seçeneği" = AKTİF `ShippingRatePlan` + price-engine ücreti (store TARİFE'si, ADR-044;
  provider canlı quote DEĞİL) + (varsa) ENABLED `ShippingProviderConfig` görünüm bilgisi (ad + public logo).
  Paralel kargo modeli YOK; F3C/F3C.5 domaini yeniden kullanılır. ADR-046 canlı takipten AYRI (bu yalnız seçim).
- **DB (additive).** `Order.shippingProvider/shippingProviderName/shippingLogoUrl/shippingEtaText` +
  `ShippingRatePlan.deliveryEstimate`. Migration `20260701120000_add_checkout_shipping_selection` (ADDITIVE-only,
  IF NOT EXISTS). Mevcut F3C.2 snapshot alanları (`shippingRatePlanId/Name/Source/Currency`) korunur.
- **Contracts.** `shippingOptionSchema` (müşteri-güvenli ALLOWLIST) + `cartShippingQuoteResponse.options[]/
  selectedOptionId`; `publicCart/CheckoutRequest.shippingOptionId`; `orderShippingSelectionSchema` →
  sipariş onayı (`shippingOption`), müşteri sipariş detayı (`shippingSelection`), admin `orderSchema.
  shippingSelection`; `shippingRatePlan*.deliveryEstimate`.
- **Gateway.** Saf üreteç `shipping/checkout-options.ts` (`buildShippingOptions`); dataAccess
  `listActiveShippingRatePlans` + `listShippingProviderDisplays` (yalnız ENABLED). `assemblePublicCart`
  seçenek-tabanlı. Checkout SUNUCU-OTORİTER: ücreti seçilen plandan YENİDEN hesaplar (istemci fiyatı yok/strip),
  `SHIPPING_OPTION_INVALID` (cross-store/inactive/bilinmeyen) / `SHIPPING_OPTION_REQUIRED` (çoklu+seçimsiz) /
  `SHIPPING_QUOTE_UNAVAILABLE` (uygun yok; NO_RATE_PLAN geriye dönük). `createOrder` provider snapshot'ı yazar.
- **Storefront.** Checkout'ta seçilebilir provider kartları (radio, dropdown DEĞİL): logo veya baş-harf fallback
  (`lib/shipment.ts` `providerInitials/hasProviderLogo`), fiyat/ETA; seçim cookie'ye yazılır (Server Action) ve
  sayfa revalidate ile toplamı günceller. Tek/çok/yok durumları + net TR mesaj. Success ekranında seçilen
  sağlayıcı özeti. **Light-first premium + brand (#9743CD) aksanı.**
- **Store-admin.** Sipariş detayı özetinde "Kargo sağlayıcı" satırı; tarife formunda `deliveryEstimate` alanı.
- **Seed.** Demo store: 2 ENABLED provider config (DHL Express + Ekonomik Kargo) + 2 aktif tarife (default hızlı
  FIXED + ekonomik FREE_THRESHOLD), ETA metinleriyle → checkout'ta çoklu seçenek demoable.
- **Güvenlik.** Storefront/müşteri DTO'larına secret/credential/account no/webhook secret/raw payload/label/
  barcode/ZPL/admin-only alan SIZMAZ. Tenant izolasyonu: seçenekler store-scoped; seçilen plan store + ACTIVE +
  bu sepet/adres için uygun olmalı; cross-store/tamper reddedilir.
- **Testler.** Gateway entegrasyon (çoklu seçenek + provider ad/logo, seçim→ücret/snapshot, toplam değişimi,
  tamper-yok, cross-store red, tek-seçenek auto), saf builder (`shipping-checkout-options.test.ts`), storefront
  helper (logo/initials). TODO-117 shipment takip testleri yeşil kalır. Gateway 282, storefront 87 test geçer.
- **Doğrulama.** db:generate / build / typecheck / lint / test / git diff --check yeşil.
- **KALAN.** Provider logo dosya UPLOAD/asset storage (TODO-127, manuel public URL devam); canlı tracking SYNC +
  webhook imza (TODO-100/104) kapsam dışı.

## TODO-100/104 — Shipping webhook güvenliği + provider-agnostic toplu tracking sync (ADR-048)

- **Denetim/seçim.** TODO-127 (provider logo upload) kozmetik olduğundan ertelendi; shipment durumlarının
  gerçek güncelleme yolu (webhook + sync) seçildi. DHL sandbox query/command aboneliği olmadığından (F3C.3)
  provider-spesifik canlı entegrasyon YAPILMADI; platform-normalize sözleşme + adapter-sync yolu uygulandı.
- **DB (additive).** `ShippingProviderConfig.webhookToken` (unique) + `webhookSecretCipher`; yeni
  `ShipmentWebhookInbox` (storeId, providerConfigId, provider, eventKey, payloadHash, outcome, shipmentId,
  statusCode/Text) + `ShipmentWebhookOutcome` enum'ı. Migration `20260703120000_add_shipping_webhook_security`
  (ADDITIVE-only, IF NOT EXISTS).
- **Webhook ucu.** `POST /public/shipping/webhooks/:webhookToken` (`shipping/webhook-routes.ts`): kullanıcı auth
  YOK; her istekte HMAC-SHA256 (`x-shipping-signature` + `x-shipping-timestamp`, raw-body üzerinden,
  `timingSafeEqual`) zorunlu. Eksik/geçersiz imza → 401 + DB'ye yazım YOK; timestamp toleransı 300 sn; pencere
  içi duplicate/replay'i inbox unique `(providerConfigId, eventKey)` keser (shipment update + WEBHOOK_RECEIVED
  event ile atomik transaction). Bilinmeyen statusCode durumu değiştirmez (ADR-045 regresyon koruması);
  eşleşmeyen gönderi/bozuk payload audit'li IGNORED kaydı + 200 ACK. Shipment araması {storeId,
  providerConfigId} scoped → cross-store mutasyon imkânsız. ACK minimal (ok/duplicate/handled).
- **Rotate ucu.** `POST /stores/:storeId/shipping/providers/:id/webhook/rotate` (admin): secret+token üretir;
  secret AES-256-GCM saklanır, yalnız bu yanıtta BİR KEZ döner (ADR-035 deseni); config DTO'sunda yalnız
  `webhookConfigured` boolean. Audit yalnız alan adı yazar.
- **Toplu sync ucu (TODO-100 runtime yolu).** `POST /stores/:storeId/shipping/shipments/sync-all` (admin,
  limit≤50): terminal olmayan gönderiler (DRAFT hariç; `SYNCABLE_SHIPMENT_STATUSES`) mevcut `applySync` ile
  senkronlanır; DISABLED provider skipped, gönderi başına hata kod bazlı raporlanır; audit özeti yazılır.
- **Contracts/api-client.** `shippingWebhookEventRequestSchema` (normalize sözleşme), `shippingWebhookAckResponse`,
  `shippingWebhookRotateResponse`, `shipmentSyncAll*`; config şemasına `webhookConfigured`. api-client
  `shippingProviders.rotateWebhook` + `shippingProviders.syncAllShipments`.
- **Güvenlik garantileri.** Webhook secret yalnız server-side (şifreli); token yetki vermez (imza şart);
  constant-time karşılaştırma; timestamp + inbox çift replay koruması; müşteri/public DTO'larda secret/raw
  payload/label/barkod/ZPL/hesap no YOK (test ile kanıtlı); TODO-117 müşteri timeline'ı ve TODO-125 checkout
  seçimi davranışı DEĞİŞMEDİ (regresyon testleri yeşil).
- **Testler.** Yeni `shipping-webhook.test.ts` (19): geçerli imza→event/durum güncelleme, geçersiz/eksik imza
  401 + yazım yok, tamper red, timestamp replay red, duplicate→tek event, hash-key idempotency, statusCode 4/5
  eşleme, bilinmeyen kod güvenli, cross-store IGNORED + mutasyon yok, bozuk JSON crash yok, ACK/config DTO
  sızıntı yok, sync durum seçimi. Toplam: gateway 301, store-admin 125, admin-web 24, storefront yeşil.
- **Doğrulama.** db:generate / build / typecheck / lint / pnpm -r test / git diff --check yeşil.
- **KALAN.** Store-admin webhook yönetim UI (TODO-128), zamanlanmış otomatik sync worker job (TODO-129),
  DHL/Geliver ham webhook format + provider imza şeması adaptörleri (TODO-130, canlı abonelik sonrası),
  DHL Bulk Query sağlayıcı-özel toplu uç (TODO-100 kalanı), payment webhook imzası (TODO-071, bağımsız).
- **Runtime smoke (2026-07-03, worktree gateway :4100 + paylaşılan dev DB/Redis).** Docker imajları main
  context'inden build'li olduğundan (branch kodu imajda yok — bkz. TODO-122 pattern) documented compose smoke
  yerine EŞDEĞER runtime smoke yapıldı: migration `prisma migrate deploy` ile dev DB'ye uygulandı (additive);
  worktree gateway ayrı portta gerçek DB/Redis'e karşı başlatıldı. Kanıtlar: imzasız → 401 SIGNATURE_MISSING;
  yanlış imza → 401 SIGNATURE_INVALID; eski timestamp → 401 TIMESTAMP_OUT_OF_RANGE; geçerli imza → 200
  handled:true + shipment IN_TRANSIT→OUT_FOR_DELIVERY + WEBHOOK_RECEIVED event (konum "işlem noktası");
  aynı eventId tekrar → duplicate:true + yeni event YOK; bilinmeyen statusCode 99 → event yazıldı, durum
  KORUNDU; eşleşmeyen takip no → IGNORED_UNKNOWN_SHIPMENT inbox kaydı + mutasyon yok; bilinmeyen token → 404;
  rotate → tek seferlik secret + `webhookConfigured:true`, config yanıtında token/cipher SIZINTISI YOK;
  sync-all → scanned 6, gönderi başına TEST_BASE_URL_MISSING kod raporu (env'siz DHL TEST beklenen; iş
  durmadı). Smoke gateway kapatıldı; smoke verisi dev DB'de (TD-018 deseni).

## F3C.6 — DHL Sandbox Verification & Hardening (TODO-131, ADR-049)

- Tarih: 2026-07-03. Branch: claude/great-shannon-5558b3.
- **Doküman denetimi.** Sağlanan 6 OpenAPI dosyası (Identity, CBS Info, Plus Command, Standard Command,
  Standard Query, Barcode Command; host testapi.mngkargo.com.tr) mevcut `dhl-ecommerce` adapter'la
  (client/adapter/mappers + routes status eşleme + webhook yolu) satır satır karşılaştırıldı. Auth akışı,
  base path'ler, header'lar (X-IBM çifti + x-api-version + Bearer), tüm request gövdeleri ve F3C.3'te
  sandbox'la netleşen incelikler (recipient wrapper, marketPlaceShortCode:"", uppercase referenceId,
  createOrder array yanıtı, cancelshipment PUT gövdesi) doğru bulundu.
- **Düzeltilen kusurlar (doküman/sandbox kanıtlı).**
  1. `parseProviderDate`: dokümandaki dd-MM-yyyy (tire) formatı `Date.parse` önceliği yüzünden gün≤12'de
     ABD MM-DD olarak YANLIŞ tarihe, gün>12'de null'a düşüyordu → dd?MM?yyyy regex'i ([./-], saat opsiyonel)
     Date.parse'tan ÖNCE denenir; modül scope'a taşındı + test edildi.
  2. Sync idempotency: `trackshipment` KÜMÜLATİF hareket listesi döndüğünden `applySync` her çağrıda tüm
     hareketleri yeniden TRACKING_UPDATED yazıyordu → `shipmentTrackingEventKey`
     (statusText|location|occurredAt-ms) ile insert-seviyesi dedupe; müşteri timeline'ına ayrıca
     `dedupeConsecutiveShipmentEvents` (ardışık aynı event teklenir, A→B→A korunur).
  3. HTTP hata normalizasyonu: sorgu/calculate/geo/createOrder/createRecipient yanıtlarında status kontrolü
     yoktu — 404 ProblemDetails "başarı" gibi parse edilip junk STATUS_CHANGED event, calculate 4xx'te 0 TL
     quote, createOrder 400'de null-id sahte başarı üretebiliyordu → `ensureProviderResponseOk`: gönderi
     sorgusu 404 → PROVIDER_SHIPMENT_NOT_FOUND (HTTP 404), diğer sorgu → PROVIDER_QUERY_FAILED (502),
     operasyon → PROVIDER_OPERATION_FAILED (502); mesaja yalnız güvenli sağlayıcı alanları girer
     (secret/JWT/hesap no ASLA). createbarcode/cancel zaten status-aware idi (ADR-045), değişmedi.
  4. `.env.example`: eksik DHL_ECOMMERCE_TEST_BASE_URL / API_VERSION / ALLOW_RECIPIENT_CREATE / ALLOW_CANCEL
     örnekleri eklendi.
  5. statusCode 8 (Destek_Gerekiyor, dokümanda tanımlı) BİLEREK eşlenmedi: bilinmeyen kod durumu İLERLETMEZ
     (ham kod/metin event'te saklanır) — davranış testle sabitlendi.
- **Sandbox smoke (2026-07-03, gerçek testapi.mngkargo.com.tr; secret'lar .secrets dosyasından process-only,
  hiçbir secret/JWT loglanmadı; createOrder/createbarcode/cancel ÇAĞIRILMADI).**
  - Identity POST /token → HTTP 200, jwt + refreshToken + jwtExpireDate (dd.MM.yyyy) ✓ dokümanla uyumlu.
  - CBS getcities → 200 (82 şehir); getdistricts/34 → 200 (40 ilçe) ✓ dokümanla uyumlu.
  - Bilinmeyen referans getshipmentstatus + trackshipment → 404 ProblemDetails ✓ dokümanla uyumlu;
    yeni PROVIDER_SHIPMENT_NOT_FOUND normalizasyonunu doğrular.
  - calculate → DOKÜMAN↔SANDBOX ÇELİŞKİSİ: OpenAPI cityCode/districtCode integer der; sandbox binder STRING
    ister (integer → 400 code 4002 "The JSON value could not be converted to System.String"). KOD DEĞİŞTİ:
    calculate isteğinde kodlar string gönderilir. String ile tekrar → HTTP 500 code 20001
    "<WERR>[] NOLU ŞUBENİN İLİ BULUNAMADI" (test müşteri hesabında şube ataması yok — HESAP/PROVİZYON kısıtı,
    kod değil; ADR-044 gereği calculate checkout fiyatında kullanılmadığından etki düşük). Ek bulgu: MNG hata
    zarfı nested `{error:{code|Code,message|Message,description|Description}}` (camel/Pascal karışık) →
    `extractProviderErrorMessage` genişletildi (KOD DEĞİŞTİ).
- **Sandbox'ın doğrulayamadıkları.** createOrder/createbarcode/label/cancel (dokümanlar faturasız/güvenli
  demiyor; F3C.3'te uçtan uca doğrulanmıştı, kod değişmedi); webhook push formatı (dokümanlarda YOK →
  provider-özel webhook adaptörü EKLENMEDİ, TODO-130 açık); calculate mutlu yolu (hesap kısıtı, yukarıda).
- **Testler.** Yeni `shipping-dhl-hardening.test.ts` (20): tarih formatları (MM-DD tuzağı dahil), statusCode
  8/99 durum ilerletmez, tracking dedupe anahtarı + müşteri ardışık-duplikasyon filtresi, 404/500/401/400
  normalize + redaksiyon (mesajda secret/jwt yok), calculate string kod gövdesi, nested hata zarfı çıkarımı,
  doküman fixture'lı getshipmentstatus/trackshipment/getshipment eşlemeleri. Mevcut TODO-117/125/104 testleri
  dahil tüm gate'ler yeşil (aşağıda).
- **Doğrulama.** pnpm db:generate / build / typecheck / lint (+ --filter api-gateway lint) / pnpm -r test
  (gateway 321, store-admin 125, storefront 87, admin-web 24, api-client 13, ui 14, queues 1) / git diff --check
  yeşil. Değişen davranışlar geriye dönük uyumlu-additive; migration YOK.

## TODO-132 — MNG/DHL createRecipient e-posta çözümleme + payload doğrulama

- Tarih: 2026-07-03. Branch: claude/friendly-hofstadter-0bdcc6.
- **Runtime bulgu (kullanıcı + MNG API çağrı geçmişi + sanitize log).** Store-admin "Gönderi Oluştur" →
  `POST /orders/:id/shipping/dhl/prepare` 502 `PROVIDER_OPERATION_FAILED`. Gerçek neden: MNG sandbox
  `pluscmdapi/createRecipient` 400 kod **26039** "'Recipient. Email' geçerli bir e-posta adresi değil" —
  adapter `email: ""` gönderiyordu. Token 200 (auth/abonelik sorunu DEĞİL). UI recipient'ı sipariş KARGO
  adresinden kurar (adreste e-posta alanı yok); siparişte geçerli `Order.customerEmail` OLDUĞU halde akış
  hiç kullanmıyordu.
- **Fix (sunucu-otoriter e-posta çözümleme).** Yeni `shipping/recipient.ts`: `resolveRecipientEmail`
  aday sırası Order.customerEmail → Customer.email (trim + format doğrulama; hata sonucuna aday DEĞERİ
  taşınmaz). `dhl/prepare` + generic `create-order` (yalnız DHL) route'ları e-postayı çözer; geçerli yoksa
  sağlayıcı ÇAĞRILMADAN 422 `RECIPIENT_EMAIL_REQUIRED` / `RECIPIENT_EMAIL_INVALID`. Persist edilen
  `recipientEmail` = çözülmüş değer. Client'tan gelen `recipient.email` GÜVENİLMEZ (üzerine yazılır).
- **DHL builder guard'ı.** `buildDhlRecipientBody` (createRecipient + createOrder ortak): geçerli e-posta
  olmadan istek ÜRETMEZ (`email: ""`/null/geçersiz imkânsız; adapter testiyle sabit: hatada sağlayıcıya
  istek gitmediği doğrulanır).
- **cityCode/districtCode kararı.** OpenAPI (Plus/Standard Command `Customer`): kodlar OPSİYONEL int32
  ("CBS Info API'den alınabilir"), required listesi YOK. Karar: bilinmiyorsa/≤0 ise alan ATLANIR (0
  gönderilmez), cityName/districtName kalır. Sandbox: kodsuz + adlarla createRecipient/createOrder 200.
  Gerçek kod (>0) verilirse aynen gönderilir. CBS otomatik eşleme TODO-124'te.
- **Telefon kararı.** Doküman örneği YEREL 10 hane ("5555555555"); F3C.3'ün başarılı smoke'u da yerel.
  `normalizeDhlMobilePhoneNumber`: rakam dışı ayıklanır, +90/90/0 öneki soyulur → 10 hane; normalize
  edilemeyen rakam haliyle geçer (doküman pattern dayatmaz).
- **İKİNCİ runtime bulgu — createOrder content.** Prepare artık createRecipient'ı geçince createOrder
  `content:""` ile AÇIKLAMASIZ 400 verdi. OpenAPI: `Order.content` + `Order.description` REQUIRED.
  Sanitize sandbox ayrıştırması: content dolu → 200, boş → 400 (kod/il fark etmez). Fix: content boşsa
  PII içermeyen referenceId fallback'i gönderilir (UI content göndermiyor; F3C.3 smoke "TEST" ile geçmişti).
- **Hata normalizasyonu.** `extractProviderErrorCode` (nested/Pascal/array zarf; yalnız kısa alfanumerik
  kod) + `ensureProviderResponseOk` mesajına "[sağlayıcı kodu N]" işlenir; MNG 26039 →
  `RECIPIENT_EMAIL_INVALID`'e normalize (UI'da aksiyon alınabilir). BFF yalnız `code` geçirir (mevcut
  politika); i18n TR/EN `RECIPIENT_EMAIL_REQUIRED/INVALID` sözlük girdileri + order kargo kartında
  spesifik mesaj (generic "geçici sağlayıcı hatası" yerine) + manuel gönderi CTA'sı korunur.
- **Testler.** Yeni `shipping-recipient-email.test.ts` (25): e-posta öncelik/trim/lokal red, builder
  guard'ları (boş/null/geçersiz e-posta imkânsız + sağlayıcıya istek gitmez), kod omit/geçirme, telefon
  normalize, content fallback, 26039 normalize + redaksiyon (mesajda e-posta/secret/JWT yok),
  `extractProviderErrorCode` zarf varyantları. store-admin: RECIPIENT_EMAIL_REQUIRED spesifik mesaj testi
  (mock UiError). Mevcut DHL shape testlerine geçerli e-posta eklendi (redakte fixture).
- **Sandbox doğrulama (testapi.mngkargo.com.tr, worktree gateway :4010, gerçek credential DB'den).**
  Token 200. Sanitize probe: createRecipient kodsuz/0-kodlu/34-87 kodlu üç varyant da geçerli e-postayla
  200. OS-000054 prepare uçtan uca **HTTP 201** → Shipment ORDER_CREATED + dış order/invoice id
  (26039 YOK). createbarcode/cancel ÇAĞIRILMADI; secret/JWT/PII loglanmadı; probe script silindi.
- **Gate.** db:generate ✓; build ✓; typecheck ✓; lint ✓; pnpm -r test ✓ (gateway 350, store-admin 126,
  storefront 87, admin 24, i18n 36, contracts 23, diğerleri yeşil); git diff --check ✓. Migration YOK.
- **Kalan.** Kullanıcı stack'inde docker api-gateway REBUILD gerekli (fix'in UI'a yansıması için).
  TODO-124 (CBS otomatik kod eşleme) ve TODO-130 (provider webhook formatı) AÇIK.

## TODO-133 — Prepare başarısını shipment/order durum özetine yansıt (state reflection fix)

Brief bunu "TODO-127" olarak adlandırdı; repo TODO-127 = "Provider logo upload/storage" (AÇIK, farklı iş)
olduğundan numara çakışması önlenip TODO-133 kaydedildi. Fable'ın shipping mimarisi (TODO-104 webhook,
F3C.6 hardening, TODO-132 recipient e-posta) DEĞİŞTİRİLMEDİ; yalnız durum yansıtma/kopya düzeltildi.

- **Kök neden.** DHL/MNG prepare (createRecipient + createOrder) başarısında backend zaten doğru
  davranıyor: `Shipment.status=ORDER_CREATED` yazılır, `ORDER_CREATED` event kaydedilir, `Order.status`
  DEĞİŞMEZ (shipped/in-transit/delivered yapılmaz). Sorun tamamen UI yansıtma/kopya katmanındaydı:
  store-admin durum etiketi "Gönderi kaydı oluşturuldu" idi ve "kargonun alımı bekleniyor" ipucu yoktu;
  müşteri timeline'ı admin operasyonel `statusText`'ini ("…(DHL gönderi kaydı)") gösteriyordu. ADR-045/049:
  createOrder başarısı = kargo firmasında KAYIT açıldı; fiziksel teslim/yolda DEĞİL.
- **Store-admin.** `shipment-ui`: ORDER_CREATED etiketi → "Gönderi oluşturuldu"/"Shipment created";
  açıklaması → "Kargonun alımı bekleniyor. Kargo firmasında kayıt açıldı."/"Waiting for carrier pickup…";
  yeni `isAwaitingPickupStatus` (ORDER_CREATED/LABEL_PENDING/LABEL_CREATED). Order kargo özet kartı bu
  hazırlık durumlarında bekleme ipucunu badge altında gösterir; IN_TRANSIT/DELIVERED'de göstermez.
- **Müşteri (storefront).** i18n TR/EN `statusValues`/`eventValues` ORDER_CREATED → "Gönderi oluşturuldu"/
  "Shipment created" + yeni `preparedNote` "Kargonun alımı bekleniyor."/"Waiting for carrier pickup.".
  `lib/shipment` `isAwaitingPickupShipmentStatus`; takip kartı hazırlık aşamasında (iptal/sorun değilse)
  bu notu gösterir. Müşteri-güvenli: gateway customer DTO `customerSafeShipmentEventStatusText` ile
  ORDER_CREATED event `statusText`'ini null'lar → admin metni sızmaz, i18n kullanılır. İç id/secret/ham
  payload YOK (mevcut allowlist korunur); yanıltıcı shipped/delivered kopyası yok.
- **Testler.** store-admin `shipment-ui.test` (etiket/helper/awaiting-pickup/step) + `order-shipment-summary`
  (ORDER_CREATED "Gönderi oluşturuldu" + "Kargonun alımı bekleniyor.", IN_TRANSIT'te ipucu yok); storefront
  `shipment.test` (awaiting-pickup helper + i18n kopya, yanıltıcı ifade yok); gateway `customer-account`
  (`customerSafeShipmentEventStatusText` ORDER_CREATED null, gerçek takip metni korunur). "prepare ≠
  shipped/in-transit/delivered" mevcut `shipmentKpiBucket`/`manualTrackingNextStatus`/`mapProviderStatus…`
  guard'larıyla korunur; duplicate prepare 409 + event tekrarsızlığı bu turda DEĞİŞTİRİLMEDİ.
- **Gate.** db:generate ✓; build ✓; typecheck ✓; lint ✓; pnpm test (turbo) ✓ (store-admin 132,
  api-gateway 351, diğer paketler yeşil); git diff --check ✓. Migration/şema değişikliği YOK (yeni enum yok).
- **Kalan.** Kullanıcı stack'inde docker api-gateway + web REBUILD gerekli (fix'in çalışan UI'a yansıması
  için). Runtime doğrulama merge/rebuild sonrası yapılmalı (aşağıdaki runtime adımları).

## TODO-135 — Sipariş listesi/başlık karşılama rozetlerini shipment hazırlık durumuna yansıt

TODO-133 shipment DETAY kartını düzeltmişti; ancak sipariş ÖZET/liste rozetleri hâlâ `Order.fulfillmentStatus`'u
DOĞRUDAN okuyordu (`Shipment.status`'tan türetilmiyordu). Sonuç: prepare başarısına (ORDER_CREATED) rağmen
store-admin liste "Karşılama Durumu" + detay hero "Gönderilmedi", storefront hesabım listesi "Henüz kargoya
verilmedi" gösteriyordu. Bu tur YALNIZ gösterim yansıtması — backend prepare/createRecipient/createOrder/webhook/
sync/checkout ve shipment mimarisi DEĞİŞMEZ; `Order.status`/`Order.fulfillmentStatus` MUTATE EDİLMEZ.

- **Paylaşılan helper (contracts).** Yeni saf `getOrderFulfillmentDisplay(fulfillmentStatus, shipmentStatus)` →
  gösterim durumu (`NOT_SHIPPED`/`SHIPMENT_CREATED`/`IN_TRANSIT`/`DELIVERED`/`FULFILLED`/`PARTIAL`/`CANCELLED`).
  Öncelik: iptal sipariş > DELIVERED > IN_TRANSIT/OUT_FOR_DELIVERY > DRAFT/ORDER_CREATED/LABEL_PENDING/
  LABEL_CREATED (→ SHIPMENT_CREATED) > sipariş-seviyesi fulfillment. ADR-045: ORDER_CREATED asla shipped/transit/
  delivered sayılmaz. Ayrıca `pickOrderShipmentStatus` (birden çok gönderide "en ileri" pozitif durum; terminal-
  olumsuz iptal/iade/başarısız 0 → tek onlarsa null). Her ikisi de `@commerce-os/api-client` üzerinden re-export.
- **DTO allowlist.** Admin `orderSchema` + storefront `customerOrderSummarySchema`'ya TEMSİLİ `shipmentStatus`
  DURUM enum'u eklendi (`.nullable().default(null)`). Yalnız DURUM taşınır — statusText/iç ID/externalShipmentId/
  referenceId/ham payload/secret YOK (customer-safe; zod allowlist bilinmeyen alanları düşürür). Gateway
  `orderSelect` ve customer `listOrders` sorgusu `shipments.status` çeker; `pickOrderShipmentStatus` ile temsili
  durum türetilir.
- **UI.** Store-admin sipariş listesi + detay hero rozeti ve storefront `OrderStatusBadges`, display helper
  üzerinden çözülür. Yeni i18n: store-admin TR/EN `orders.fulfillmentDisplayLabels` (SHIPMENT_CREATED → "Gönderi
  oluşturuldu"/"Shipment created", IN_TRANSIT → "Yolda"/"In transit", DELIVERED → "Teslim edildi"/"Delivered");
  storefront TR/EN `account.orders.fulfillmentDisplay` (müşteri-güvenli aynı kopya). fulfillmentStatus FİLTRE
  dropdown'u hâlâ ham `fulfillmentLabels` kullanır (gerçek alan filtresi, dokunulmadı).
- **Testler.** contracts `order-fulfillment-display` (helper öncelikleri + pickOrderShipmentStatus + DTO
  allowlist statusText/referenceId/externalShipmentId sızmaz — 11 test); store-admin `orders-ui` (ORDER_CREATED
  → "Gönderi oluşturuldu" değil "Gönderilmedi"; shipment yok → "Gönderilmedi"; IN_TRANSIT → "Yolda") +
  `order-detail-page` (hero ORDER_CREATED/no-shipment); storefront `order-badges` (ORDER_CREATED, no-shipment,
  IN_TRANSIT/DELIVERED). TODO-117/125/132/133 mevcut testleri yeşil kaldı; `orders-filter` mock'una
  `shipmentStatus: null` eklendi.
- **Gate.** db:generate ✓; build ✓; typecheck ✓; lint ✓; pnpm test (turbo) ✓ (contracts 34, store-admin 137,
  storefront 92, api-gateway 351, diğer paketler yeşil); git diff --check ✓. Migration/şema değişikliği YOK
  (yeni Prisma enum yok; mevcut ShipmentStatus değerleri kullanıldı).
- **Kalan.** Kullanıcı stack'inde docker api-gateway (DTO değişti) + store-admin-web + storefront-web REBUILD
  gerekir. Runtime doğrulama (OS-000054/OS-000055 gibi ORDER_CREATED shipment'i olan sipariş) merge/rebuild
  sonrası: liste/başlık "Gönderi oluşturuldu" göstermeli, "Gönderilmedi"/"Henüz kargoya verilmedi" GÖSTERMEMELİ;
  provider kanıtlamadıkça "Kargoya verildi/Yolda/Teslim edildi" GÖSTERMEMELİ.

## TODO-136 — Karşılama durum kopyası netleştirme + ödemesiz siparişe gönderi guard'ı (ADR-050)
- **Kök neden.** (A) TODO-135'in tek `SHIPMENT_CREATED` gösterim durumu operasyonel netlik için yetersizdi
  (ORDER_CREATED ile LABEL_CREATED aynı etikete çöküyor, OUT_FOR_DELIVERY IN_TRANSIT'e çöküyor, kargo kaydı yok →
  "Gönderilmedi"/"Henüz kargoya verilmedi" yanıltıcıydı). (B) Ödemesi alınmamış sipariş için gönderi oluşturmayı
  engelleyen iş kuralı YOKTU (kritik: ödemesiz sipariş kargoya verilmemeli).
- **Kopya (A).** `OrderFulfillmentDisplay`'e `AWAITING_PICKUP` / `PACKED` / `OUT_FOR_DELIVERY` eklendi;
  `getOrderFulfillmentDisplay` yeniden eşlendi — ORDER_CREATED/LABEL_PENDING → "Kargonun Alınması Bekleniyor",
  LABEL_CREATED → "Kargo İçin Paketlendi", OUT_FOR_DELIVERY → "Dağıtımda", IN_TRANSIT → "Yolda", DELIVERED →
  "Teslim edildi", (kargo yok/DRAFT) → "Hazırlanıyor". ADR-045 korunur (ORDER_CREATED asla shipped/transit/
  delivered). Aynı sözlük tüm yüzeylerde uygulandı: store-admin liste/hero (`fulfillmentDisplayLabels`), kargo
  kartı + shipment liste/detay (`SHIPMENT_STATUS_LABEL` ORDER_CREATED/LABEL_CREATED/IN_TRANSIT/OUT_FOR_DELIVERY),
  storefront hesap listesi (`fulfillmentDisplay`) + takip `statusValues` + "Hazırlanıyor" sekmesi; i18n TR/EN.
  "Henüz Teslim Alınmadı" bilinçli olarak OTOMATİK türetilmedi (ayrı provider sinyali yok; müşteri teslim
  durumuyla karışma riski — brief uyarısı).
- **Guard (B).** Yeni SAF helper `isOrderPaidForShipment(paymentStatus)` (contracts, api-client re-export):
  PAID/AUTHORIZED uygun; UNPAID/REFUNDED engelli — mevcut mock ödeme akışının `succeeded` (PAID||AUTHORIZED,
  paidAt işaretli) semantiğiyle birebir (ADR-050). Backend NİHAİ otorite: `create-order`, `dhl/prepare`,
  `shipment-draft` uçları sağlayıcı çağrısından + Shipment/ShipmentEvent yaratımından ÖNCE 409
  `ORDER_PAYMENT_REQUIRED`. Store-admin kargo kartı ödemesiz siparişte "Gönderi Oluştur"u pasifleştirir +
  "Ödeme alınmadan gönderi oluşturulamaz." yardımcı metni gösterir. Ödeme provider/checkout fiyatlama/DHL/MNG
  istek/webhook mimarisi DEĞİŞMEZ; sipariş/ödeme durumu MUTATE EDİLMEZ.
- **Testler.** contracts `order-fulfillment-display` (gösterim eşlemesi güncellendi + `isOrderPaidForShipment`);
  api-gateway yeni `shipping-payment-guard` (unpaid create-order/prepare/draft → 409 ORDER_PAYMENT_REQUIRED,
  Shipment/ShipmentEvent OLUŞMAZ; paid guard'ı geçer); store-admin `order-shipment-summary` (unpaid buton pasif +
  yardımcı metin, paid aktif), `orders-ui` + `order-detail-page` (yeni rozet etiketleri), `shipment-ui` +
  `shipment-screens` (kargo kartı/detay etiketleri); storefront `order-badges` + `shipment` kopya. Mevcut
  TODO-117/125/132/133/135 testleri yeşil.
- **Gate.** db:generate ✓; build ✓ (her iki web app derlendi); typecheck ✓; lint ✓; pnpm test (turbo) ✓
  (34/34 task, gateway 355, store-admin 142, storefront + contracts + i18n yeşil); git diff --check ✓.
  Migration/şema değişikliği YOK.
- **Kalan.** Kullanıcı stack'inde docker api-gateway (guard + DTO kopya) + store-admin-web + storefront-web
  REBUILD gerekir. Runtime doğrulama merge/rebuild sonrası: prepared sipariş liste/hero "Kargonun Alınması
  Bekleniyor", kargo yok → "Hazırlanıyor", label hazır → "Kargo İçin Paketlendi"; ödemesiz siparişte "Gönderi
  Oluştur" pasif + backend doğrudan prepare isteğini 409 ile reddeder (provider'a istek gitmez).

## TODO-137 Docker Deterministik Clean-Build + Cache Hijyeni

- Tarih: 2026-07-03
- Durum: DONE (branch `claude/ecstatic-hawking-5d76c9`, commit atılmadı)
- Kapsam: Yalnız Docker/build hijyeni. App/domain mantığı, runtime komutları, compose servis topolojisi
  ve env DEĞİŞMEDİ. TODO-122'nin çözümü; TODO-135/136 runtime rebuild'lerinde ortaya çıkan gerçek boşluk.
- **Kök neden.** `infra/docker/node.Dockerfile` `pnpm build` çalıştırmıyordu (yalnız `install` + `db:generate`)
  ve repo'da `.dockerignore` yoktu. `COPY apps/packages/services` host'ta üretilmiş artifact'leri imaja
  sızdırıyordu: bayat `packages/*/dist`, host `node_modules` (darwin/arm64), `apps/*/.next`, `.turbo`. Dev
  container'ları paylaşılan paketleri derlenmiş `dist/`'ten import ettiği için bayat host `dist` →
  api-gateway `does not provide an export named 'pickOrderShipmentStatus'` çökmesi. Workaround (host'ta önce
  `pnpm db:generate && pnpm build`) kırılgandı.
- **.dockerignore (yeni).** Dışlanan: `node_modules`/`**/node_modules`, `dist`/`**/dist`, `.next`/`**/.next`,
  `build`, `*.tsbuildinfo`, `packages/db/generated`, `**/.prisma`, `.turbo`, `coverage`, `.env*`
  (`!.env.example` korunur), `.git`, `.claude` (iç içe worktree'ler), `docs`, `README.md`, `*.log`, `.DS_Store`.
  KORUNAN: tüm kaynak, package manifest'leri, `pnpm-lock.yaml`, Prisma şema + `migrations/`, Next config.
- **Dockerfile.** Artifact'ler artık İMAJ İÇİNDE üretilir: `pnpm install --frozen-lockfile`
  (lockfile'dan deterministik; BuildKit pnpm-store cache mount) → `pnpm db:generate` → `pnpm exec turbo run
  build --filter="./packages/*"` (filtre tırnaklı — sh/zsh glob taşması önlendi). Backend app'ler `tsx watch`
  ile kaynaktan, web app'ler `next dev` ile çalışır; ikisi de paylaşılan paketleri `dist/`'ten import eder,
  bu yüzden yalnız paketler build edilir (app bundle gereksiz).
- **Host gate.** db:generate ✓; build ✓ (turbo 24/24); typecheck ✓ (exit 0); lint ✓ (34/34); pnpm test ✓
  (gateway 355 passed, 34/34 task); `git diff --check` temiz.
- **Docker clean-build doğrulama.** İzole proje (`docker137`, port bağlamadan — çalışan `docker` stack'ine
  dokunulmadı). api-gateway + store-admin-web + storefront-web paylaşılan Dockerfile'dan build oldu; 12 paket
  İMAJ İÇİNDE taze derlendi (0 cached). Build context host artifact sızıntısı olmadan **2.98MB**'a düştü.
  İmaj-içi kanıt: api-gateway bağlamında `import('@commerce-os/contracts').pickOrderShipmentStatus` ===
  `function` (bayat-export çökme senaryosu artık çözülü), `@commerce-os/db` import OK (Prisma client pnpm
  sanal store'da üretildi), web-app bağlamında `@commerce-os/api-client` import OK; container = linux/arm64
  (host darwin `node_modules` sızıntısı yok).
- **Cache hijyeni.** Bkz. docs/OPERATIONS.md — clean build + `docker builder/image/container prune` (yalnız
  kullanılmayan cache/dangling imaj/durmuş container; named volume'lara ve DB verisine DOKUNULMAZ).
- **Kalan.** Merge sonrası kullanıcı ana `docker` stack'i normal `build` ile rebuild edilebilir; host'ta önce
  `pnpm build` ARTIK GEREKMEZ. Tam paralel-stack runtime health (up + /health 200) çalışan stack'le port
  çakışması ve gereksiz volume yaratmamak için bilinçli koşulmadı; runtime komutları değişmediğinden davranış
  aynıdır ve imaj-içi import kanıtı kök nedeni doğrudan kapatır.

## TODO-128 — Store-admin webhook yönetim/gözlem UI (safe API surfacing)

- **Amaç.** TODO-104 ile hazır olan webhook backend'i (HMAC ingestion + inbox idempotency + rotate)
  store-admin panelde görünür/yönetilebilir kılmak. Backend güvenlik modeli (imza doğrulama, timestamp
  toleransı, idempotency, rotate semantiği, provider adapter'ları) DEĞİŞMEDİ — yalnız UI + güvenli okuma ucu.
- **UI.** Kargo Sağlayıcıları sayfasına ([apps/store-admin-web/app/(app)/shipping/providers/page.tsx])
  "Webhook" modalı: durum rozeti, tam webhook URL + "URL'yi Kopyala", "Secret'ı Yenile" (confirm →
  rotate → yeni secret YALNIZ BİR KEZ gösterim + "yalnızca bir kez gösterilir" uyarısı + "Secret'ı Kopyala";
  modal kapanınca secret bellekten düşürülür, persistlenmez, log/analytics/URL'ye girmez), sağlayıcı paneli
  kurulum ipucu ve "Son Webhook Olayları" tablosu (TR/EN i18n).
- **Yeni uç.** `GET /stores/:storeId/shipping/providers/:id/webhook` — YETKİLİ (requireStoreAdmin), mağaza+
  providerConfigId SCOPED ShipmentWebhookInbox projeksiyonu (limit default 20/max 50). Yanıt: `webhookConfigured`,
  `webhookUrl` (null = base URL yok ya da token yok), `webhookBaseUrlConfigured`, `events[]`. Event DTO KESIN
  ALLOWLIST: `id/provider/eventKey/outcome/shipmentId/statusCode/statusText/receivedAt` — payloadHash / raw
  payload / imza / secret / cipher / header ASLA dönmez.
- **URL üretimi.** Yeni `PUBLIC_WEBHOOK_BASE_URL` (opsiyonel env) + `/public/shipping/webhooks/:token`. Tanımsızsa
  panel "public base URL ayarlanmalı" uyarısı gösterir, URL üretmez. Token (URL yol parçası) bulk config DTO'suna
  (`serializeShippingProviderConfig`) EKLENMEZ → TODO-104 DTO sızıntı testi yeşil kalır; tam URL yalnız bu tekil
  yetkili uçta döner (rotate zaten aynı admin-görünür token'ı döndürdüğünden güvenlik duruşu değişmez).
- **Katmanlar.** api-client `shippingProviders.webhookInfo` + rotate BFF (`webhook/rotate/route.ts`) + info BFF
  (`webhook/route.ts`, CSRF gerektirmeyen GET) + storeApi `getShippingWebhookInfo`/`rotateShippingWebhook`.
- **Testler.** api-gateway `shipping-webhook-admin.test.ts` (8): scoping, güvenli DTO, base URL null uyarısı,
  limit clamp, cross-store 404, yetkisiz 403. store-admin `shipping-webhook-admin.test.tsx` (6): URL+kopyala,
  base URL uyarısı, rotate öncesi secret YOK, rotate sonrası bir-kez secret+uyarı, güvenli event alanları.
  Mevcut TODO-104/132/133/135/136 testleri yeşil (api-gateway 363, store-admin 148 pass).

## TODO-129 — Zamanlanmış shipment sync worker'ı (provider-agnostic)

- **Amaç.** Gönderi durumu manuel prepare/webhook/sync'e bağımlıydı; barkod hazır olduktan sonra
  sistemin admin aksiyonu olmadan "Yolda / Dağıtımda / Teslim edildi"ye ilerlemesi.
- **Mimari (ADR-051).** Çekirdek `apps/api-gateway/src/shipping/sync-service.ts`: uygun gönderi seçimi +
  provider adapter dispatch + regresyon korumalı durum ilerletme + event idempotency; DI persistence
  (webhook-routes test deseni). Zamanlayıcı `sync-worker.ts`: api-gateway süreci içinde setTimeout-zincirli
  döngü (overlap korumalı, graceful stop; main.ts'te başlar). apps/worker'a taşınMADI çünkü shipping
  domain'i (adapter/şifreleme/prisma bağlamı) gateway'de yaşar — taşıma provider abstraction redesign'ı
  olurdu (non-goal). Manuel `sync-all` + tekil sync uçları AYNI çekirdeğe bağlandı (force=true: stale/
  backoff/attempt filtrelerini atlar); saf durum eşleme yardımcıları `status-map.ts`'e çıkarıldı
  (routes.ts re-export, davranış aynı), context kurulumu `context.ts`'e çıkarıldı.
- **Şema.** `Shipment.lastSyncAt/nextSyncAt/syncAttempts/lastSyncErrorCode` + `(status,nextSyncAt)`,
  `(status,lastSyncAt)` index'leri (additive migration `20260704120000_add_shipment_sync_metadata`).
- **Kurallar.** Seçim: SYNCABLE durumlar (terminal asla) + ENABLED config + backoff/stale/attempt filtreleri.
  Durum yalnız sağlayıcı kanıtıyla ilerler (mevcut `mapProviderStatusToShipmentStatus`); NOT_FOUND/4xx/5xx
  İLERLETMEZ → sanitize `lastSyncErrorCode` + üstel backoff (staleAfter·2^n, 6 saat tavan); başarı sayaç
  sıfırlar. STATUS_CHANGED yalnız gerçek değişimde (durum geçişi veya sağlayıcı kod/metin değişimi);
  TRACKING_UPDATED kümülatif listeye karşı doğal anahtarla dedupe → tekrarlanan polling duplicate üretmez.
  Sync desteklemeyen sağlayıcı (MOCK/GELIVER) `PROVIDER_SYNC_UNSUPPORTED` ile atlanır (attempt sayılmaz);
  gönderi başına hata batch'i durdurmaz. Log yalnız id/store/provider/durum/hata kodu (secret/raw asla).
- **Config.** `SHIPMENT_SYNC_ENABLED` (varsayılan false; docker dev compose'da true) +
  `INTERVAL_SECONDS(300)/BATCH_SIZE(25)/STALE_AFTER_MINUTES(15)/MAX_ATTEMPTS(10)` — hepsi PR #15
  boş-string normalizasyon deseniyle (`KEY=` çökertmez, varsayılana düşer).
- **Testler.** `shipping-sync-service.test.ts` (25): seçim/terminal/stale/backoff/attempt filtreleri,
  force modu, batch limiti, ilerletme+regresyon korumaları, event idempotency (tekrar polling), hata
  izolasyonu, NOT_FOUND sahte-başarı yok, unsupported/disabled skip, provider-key dispatch, worker
  enabled=false/çalışma/hata dayanıklılığı, env parsing (varsayılan + boş-string + sınırlar).
  Mevcut kargo/webhook/guard test dosyaları değişmeden yeşil (api-gateway 388 pass).

## TODO-124 — CBS il/ilçe kod eşleme + admin varış onarımı (DHL/MNG)

- **Kök neden (OS-000053).** Barkod gövdesi çalışan siparişlerle aynıydı; sorun MNG sipariş
  kaydının varış şubesini çözememesiydi. UI recipient'ı sipariş adresinden yalnız
  cityName/districtName ile kuruyordu (cityCode/districtCode hiç set edilmiyordu); Üsküdar
  seçili ama adres metni Küçükçekmece-benzeri olunca MNG createOrder'ı kabul edip
  createbarcode'da 500 kod 20001 "VARIŞ ŞUBESİ BULUNAMADI" veriyordu. ADR-045 davranışı
  doğruydu (BARCODE_FAILED event, durum ORDER_CREATED, retry mümkün, sahte başarı yok).
- **Otomatik eşleme (ADR-052).** `cbs-resolver.ts`: TR-güvenli normalize (tr-TR lower +
  diakritik katlama) ile CBS il/ilçe listesinden YALNIZ exact-match; muğlak (aynı ada farklı
  kodlu) eşleşme reddedilir; fuzzy/adres-metni tahmini yok. providerConfig başına 6 saat TTL
  in-memory cache. Prepare + generic create-order (DHL) sağlayıcı çağrısından önce çözer:
  saklı geçerli kod korunur (OS-000050 yolu), 0 asla gönderilmez (TODO-132 korunur), CBS
  verisi varken eşleşmezse sağlayıcı çağrılmadan 422 ADDRESS_DISTRICT_CODE_REQUIRED; CBS
  erişilemezse/ilçe metni yoksa isim-bazlı eski davranış (OS-000041/43 regresyonu korunur).
- **Sınıflandırma.** MNG 20001/"VARIŞ ŞUBESİ" → `DESTINATION_BRANCH_NOT_FOUND`
  (`classifyBarcodeProviderError`); BARCODE_FAILED event rawSafeJson.errorCode + admin-güvenli
  TR statusText; yeni `Shipment.lastBarcodeErrorCode` (başarı/pending/onarım sıfırlar); route
  409 `PROVIDER_DESTINATION_BRANCH_UNRESOLVED` (retryable). Müşteri DTO'suna raw sağlayıcı
  hatası çıkmaz (TODO-117 DTO'su yalnız durum/takip alanları taşır).
- **Onarım akışı.** `POST /stores/:id/shipping/shipments/:sid/repair-destination`: kodlar
  sunucuda CBS'e karşı doğrulanır (CBS_CODE_INVALID), Shipment recipient SNAPSHOT'ı
  güncellenir (sipariş/müşteri adresi mutasyonsuz), aynı referenceId ile createRecipient
  yeniden iletilir (guard'lı); reddedilirse yerel düzeltme korunur + providerResent=false
  (UI sınırlamayı açıkça söyler). DESTINATION_REPAIRED event. Duplicate guard bozulmadı;
  ikinci aktif gönderi açılmaz. Yeni CBS ilçe ucu + cities ucu cache'e bağlandı.
- **UI.** Shipment detayında "Varış İl/İlçe Eşlemesi" kartı (il/ilçe, kargo kodları, eşleşme
  rozeti, DESTINATION_BRANCH_NOT_FOUND uyarısı) + onarım paneli (CBS dropdown, "CBS'den
  Eşleştir" otomatik ön-seçim, kaydet+yeniden ilet, retry rehberi). Capability
  `canRepairDestination` (yalnız DHL + ORDER_CREATED/LABEL_PENDING). Order kargo kartı 422
  ADDRESS_DISTRICT_CODE_REQUIRED'ı spesifik mesajla gösterir.
- **Şema.** Additive migration `20260704130000_add_shipment_destination_repair`:
  ShipmentEventType += DESTINATION_REPAIRED; Shipment.lastBarcodeErrorCode TEXT NULL.
- **TODO-123 sınırı.** Retry/backoff burada uygulanmadı; job sınıflandırmayı tüketmeli:
  DESTINATION_BRANCH_NOT_FOUND admin düzeltmesine kadar retry edilmez (repair kodu sıfırlar),
  geçici hatalar backoff'la denenebilir.
- **Testler.** `shipping-cbs-mapping.test.ts` (28): TR normalize varyantları, exact-match/
  muğlaklık/fuzzy-yok, saklı kod koruma, 0-kod değişimi, cache (tek sağlayıcı çağrısı + TTL),
  CBS_UNAVAILABLE bloklamaz, validateCodes, 20001 sınıflandırma + payload kod alanları,
  canRepairDestination projeksiyonu. Mevcut kargo/webhook/guard testleri değişmeden yeşil
  (api-gateway 416, store-admin 148 pass).

## TODO-139 — Sipariş teslimat adresi snapshot düzenleme (admin, taşıma öncesi)

- **Problem/kök neden.** Sipariş oluştuktan sonra yanlış/tutarsız adres kalabiliyordu; TODO-124
  repair YALNIZ `Shipment` il/ilçe KODLARINI düzeltiyor, `OrderAddress(SHIPPING)` snapshot'ının
  ad/telefon/adres satırı/il-ilçe İSİMLERİ düzenlenemiyordu (Order snapshot bayat kalıyordu).
- **Snapshot kaynak-otoritesi.** Sipariş adresi = `OrderAddress(SHIPPING)` (kargo kodu YOK);
  kargo kodları/operasyon = `Shipment.recipient*` (gönderi sonrası bu otorite). İkisi ayrı kopya.
- **Uç.** `PATCH /stores/:storeId/orders/:orderId/shipping/address` (shipping/routes.ts) —
  ownership + store-admin auth. Güvenli durum guard'ı: `ADDRESS_EDITABLE_SHIPMENT_STATUSES =
  {DRAFT, ORDER_CREATED, LABEL_PENDING}`; aktif gönderi başka durumdaysa 409
  `SHIPMENT_ADDRESS_LOCKED` (LABEL_CREATED/IN_TRANSIT/…/DELIVERED/RETURNED/CANCELLED KİLİTLİ —
  TODO-124 repair guard'ıyla birebir tutarlı). Aktif gönderi YOKSA yalnız OrderAddress güncellenir.
- **İşlem (transaction).** (1) `OrderAddress(SHIPPING)` upsert; (2) `OrderEvent(type=
  "SHIPPING_ADDRESS_UPDATED")` (String — migration YOK); (3) gönderi düzenlenebilirse `Shipment`
  alıcı snapshot'ı da güncellenir. DHL ise CBS il/ilçe çözümü: client cityCode/districtCode
  CBS'e karşı YENİDEN doğrulanır (`validateCodes`), kod verilmezse yeni isimden EXACT-match
  (`resolveRecipientGeo`; fuzzy YOK), eşleşmezse bayat kod NULL'lanır (0/negatif ASLA persist).
  Geçerli kod eşleşince `lastBarcodeErrorCode` temizlenir. `ShipmentEvent` DESTINATION_REPAIRED
  yeniden kullanılır (yeni enum YOK).
- **Sağlayıcı onarımı.** DHL + güvenli + geçerli kodlu ise `createRecipient` yeniden iletilir
  (TODO-124 guard deseni); başarısız/desteklenmezse yerel snapshot KORUNUR, `providerResent:false`/
  `providerRepairSupported:false` döner (sahte başarı YOK). Duplicate guard'a DOKUNULMAZ (yeni
  gönderi OLUŞTURULMAZ). MÜŞTERİ adres defteri (CustomerAddress) global mutasyona UĞRAMAZ.
- **UI.** Order detay kargo kartı (`order-shipment-summary` → yeni `edit-shipping-address`):
  "Teslimat Adresini Düzenle" + CBS il/ilçe dropdown'ları ("CBS eşleşmesi bulundu/bulunamadı" +
  kargo kodları) + kapsam uyarısı ("yalnızca bu siparişin teslimat adresini günceller") + kilit
  kopyası + `providerResent:false` sınırlama kopyası. Kayıt sonrası `router.refresh()` + kart
  yeniden yükleme.
- **Şema.** Migration YOK — mevcut alanlar/enum yeniden kullanıldı.
- **Testler.** api-gateway `shipping-address-update.test.ts` (9); CBS kod doğrulama guarantee'leri
  `shipping-cbs-mapping.test.ts` (validateCodes → CBS_CODE_INVALID, isValidGeoCode(0)=false) ile
  korunur; store-admin `edit-shipping-address.test.tsx` (5). TODO-124/129/132/135/136 yeşil;
  test:unit 808 pass. TODO-123 sınırı DEĞİŞMEZ (retry job adres onarımından SONRA çalışmalı).

## TODO-123 — Barkod retry/backoff (transient otomatik, veri-hatası admin düzeltmesi bekler)

- **Kök neden.** Barkod oluşturma sağlayıcı hatasıyla düştüğünde retry manueldi; sistem
  **geçici** (timeout/5xx) ile **veri düzeltmesi gerektiren** (varış şubesi/adres eşlemesi geçersiz —
  TODO-124) hatayı ayırıp zamanlanmış backoff uygulamıyordu.
- **Sınıflandırma** (`barcode-service.ts`, ADR-054). `lastBarcodeErrorCode` ("ne oldu") ile
  `barcodeRetryBlockedReason` ("neden otomatik denenmiyor") AYRIDIR:
  - **RETRYABLE** (transient): `SHIPPING_HTTP_TIMEOUT`, `BARCODE_PROVIDER_ERROR` (generic 5xx),
    `PROVIDER_NETWORK_ERROR` → üssel backoff `stale·2^(deneme-1)` (6 saat cap); `BARCODE_RETRY_MAX_ATTEMPTS`
    sonra `MAX_ATTEMPTS` blok (worker seçmez, manuel çalışır).
  - **DATA_FIX**: `DESTINATION_BRANCH_NOT_FOUND`, `ADDRESS_DISTRICT_CODE_REQUIRED`, `CBS_CODE_INVALID`,
    `RECIPIENT_EMAIL_*` → otomatik denenmez; admin düzeltmesi (TODO-124/139) bloğu kaldırır.
  - **TERMINAL**: `AUTH_FAILED`, `*_DISABLED` vb. → otomatik denenmez. Bilinmeyen kod uydurulmaz → RETRYABLE.
- **Şema.** Additive migration `20260704140000_add_barcode_retry_metadata`: Shipment'a
  `barcodeRetryCount`/`barcodeNextRetryAt`/`barcodeLastAttemptAt`/`barcodeRetryBlockedReason` +
  `@@index([status, barcodeNextRetryAt])`, `@@index([lastBarcodeErrorCode, barcodeNextRetryAt])`.
  TODO-129 sync alanlarından (syncAttempts/nextSyncAt) BAĞIMSIZ (farklı yaşam döngüleri).
- **Tek çekirdek, iki tetik.** Manuel "Barkod/Etiket Oluştur" (route `applyCreateLabel`) + zamanlanmış
  `barcode-retry-worker.ts` (TODO-129 sync worker deseni: api-gateway içi overlap-korumalı setTimeout
  zinciri, `main.ts`) AYNI `attemptBarcode` çekirdeğini kullanır (drift yok). Manuel backoff'u bypass eder;
  fırlatılan hata (timeout) manuelde yeniden fırlatılır → mevcut HTTP mapping (504/409) korunur. Başarı/
  pending tüm retry metadata'sını sıfırlar; ADR-045 durum güvenliği + duplicate guard bozulmaz.
- **TODO-124/139 etkileşimi.** repair-destination + adres düzenleme yolları artık `BARCODE_RETRY_UNBLOCK`
  (lastBarcodeErrorCode + retry sayaç/backoff/blok = sıfır) yazar → DATA_FIX bloğu kalkar.
- **Idempotent event.** `BARCODE_FAILED` yalnız ilk hata / kod değişimi / yeni blok nedeninde (spam yok).
- **Config.** `BARCODE_RETRY_ENABLED` (varsayılan **false**, docker dev'de açılmaz — MNG sandbox'ı düzenli
  çağırmamak için), `_INTERVAL_SECONDS` (300, min 30), `_BATCH_SIZE` (10), `_STALE_AFTER_MINUTES` (15),
  `_MAX_ATTEMPTS` (5). Hepsi boş-string toleranslı (PR #15 deseni).
- **UI.** Shipment detay sağ panel: retry durumu (transient/DATA_FIX/TERMINAL/MAX_ATTEMPTS mesajı +
  sonraki deneme/sayaç/son deneme) + güvenli durumda "Şimdi Tekrar Dene"; DATA_FIX'te varış onarım/adres
  düzenleme CTA (TODO-124/139). Müşteri DTO'su değişmedi (ham sağlayıcı hatası admin-only, allowlist korunur).
- **Testler.** `shipping-barcode-retry.test.ts` (28: sınıflandırma/backoff/metadata/event/seçim/worker),
  `shipping-barcode-route.test.ts` (2: manuel wiring + metadata), store-admin `shipment-screens.test.tsx`
  retry UI (4). Regresyon: api-gateway 455, store-admin 153 pass; TODO-124/129/132/135/136/139 yeşil.

## 2026-07-04 — TODO-130: Provider HAM webhook payload adapter katmanı (ADR-055)

- **Ne yapıldı.** `apps/api-gateway/src/shipping/webhook-adapters.ts` eklendi: imza doğrulama SONRASI
  çalışan saf normalize katmanı. Webhook rotası (`webhook-routes.ts`) minimal değişti: generic tek-şema
  parse yerine provider dispatch'li adapter; imza/timestamp/rotate/inbox idempotency AYNEN korundu.
- **Kapsam.** PLATFORM sözleşmesi tüm sağlayıcılarda öncelikli (ADR-048 geriye uyum; kimlik zorunlu).
  DHL_ECOMMERCE(=MNG): repoda grounded getshipmentstatus-benzeri durum push'u + trackshipment-benzeri
  kümülatif hareket push'u (dizi/sarmal/tek hareket; farklı gönderi kimlikleri = ambiguous, işlenmez).
  Geliver: örnek payload gelene kadar güvenli `IGNORED_UNSUPPORTED` ("örnek payload gerekli").
  MOCK: yalnız PLATFORM (değişmedi).
- **Eşleştirme/idempotency.** externalShipmentId → trackingNumber → referenceId önceliği (scoped);
  ham şekiller için volatil alansız `nrm:` deterministik event key; PLATFORM anahtarı değişmedi.
  Çoklu hareketler `shipmentTrackingEventKey` ile timeline'a karşı dedupe → ek WEBHOOK_RECEIVED.
  Durum eşleme sync ile aynı `mapProviderStatusToShipmentStatus` fold'u. Migration YOK, kontrat YOK.
- **Testler.** Yeni `shipping-webhook-adapters.test.ts` (18: normalize şekilleri, event key kararlılığı,
  eşleştirme önceliği, teslim kanıtı, terminal koruması, kümülatif dedupe, Geliver unsupported, güvenlik
  regresyonu). Tüm gate'ler yeşil: db:generate, pnpm -r build, typecheck, lint, test (api-gateway 482).
- **Kalan.** Geliver ham format örneği; sağlayıcının kendi imza şeması (TODO-107 canlı callback kaydı ile).

## 2026-07-04 — TODO-140: Kargo HAREKET metniyle Shipment.status ilerletme

- **Problem.** TODO-130'dan sonra gönderi timeline'ı "SMOKE AKTARMADA"/"SMOKE TRANSFER MERKEZİNDE"
  hareketlerini gösterirken üst rozet PACKED ("Kargo İçin Paketlendi") + "Kargonun alımı bekleniyor."
  ipucunda takılı kalıyordu. Tutarsız müşteri deneyimi.
- **Kök neden.** `mapProviderStatusToShipmentStatus` yalnız `statusCode`+`isDelivered` inceliyordu.
  MNG/DHL sandbox HAREKET push'ları kod TAŞIMADAN yalnız `eventStatus` METNİ gönderince kod null →
  ilerleme yok. Müşteri/store-admin gösterimi zaten `Shipment.status`'tan doğru türetiyor (IN_TRANSIT →
  "Yolda"); bayat kalan tek şey kaynak-otorite `Shipment.status`'tı. UI'da timeline metnine bakarak
  ÇÖZÜLMEDİ — kaynak durum ilerletildi.
- **Çözüm.** `status-map.ts` içine paylaşılan saf `inferShipmentStatusFromTrackingText(text)`: Türkçe
  büyük/küçük + diakritik BAĞIMSIZ normalize (NFD + noktalı/noktasız i sabitleme + ASCII fold), güçlü
  kanıt önceliğiyle DELIVERED > OUT_FOR_DELIVERY > IN_TRANSIT; zayıf/bilinmeyen metin → null.
  `mapProviderStatusToShipmentStatus` artık kod + metin adaylarından EN İLERİ olanı (rank) seçer;
  terminal/regresyon koruması AYNEN. **Kapsam:** metin çıkarımı YALNIZ HAREKET (trackshipment /
  DHL_TRACKING) push'una — DURUM push'u (getshipmentstatus / DHL_STATUS) ve PLATFORM sözleşmesi
  kod-güdümlü kalır (TODO-130'un "status-push metni tek başına kanıt değil" kuralı korunur).
- **Nerede.** Webhook (`webhook-routes.ts`) ve zamanlanmış sync (`sync-service.ts`) AYNI yardımcıyı
  kullanır; sync ayrıca `trackShipment` hareketlerini katarak ilerletir (önceden yalnız getShipmentStatus
  snapshot'ı). Migration YOK, kontrat/DTO YOK — ham payload dışarı sızmaz.
- **Testler.** `shipping-mappers.test.ts` (+6), `shipping-webhook.test.ts` (+4),
  `shipping-sync-service.test.ts` (+2), `storefront-web/shipment.test.ts` (+1). Tüm gate'ler yeşil:
  db:generate, pnpm -r build, typecheck, lint, test:unit (882/882), git diff --check temiz.
  TODO-130/129/123/135/136 regresyon testleri yeşil.
- **Kalan.** main'e merge sonrası docker api-gateway REBUILD + runtime doğrulama.

## 2026-07-05 — TODO-141: Kargo UI cilası (tarih biçimi + durum yardımcı kopyası)
- **Sorun.** Müşteri vitrini kargo hareket tarihlerini locale'siz `toLocaleString()` ile US biçiminde
  gösteriyordu (`7/4/2026, 6:00 PM` — AM/PM'li, Türk vitrinine yabancı). Store-admin timeline'ı
  `toLocaleString(locale)` ile TR'de doğru gün/ay veriyordu ama gereksiz SANİYE taşıyordu
  (`04.07.2026 18:00:00`). Biçim tek kaynaktan yönetilmiyordu; her bileşende ad-hoc idi.
- **Çözüm.** Paylaşılan `formatDateTime(value, locale)` → `@commerce-os/i18n` (her iki app zaten bağımlı).
  24 saat, saniyesiz; TR `04.07.2026 18:00`, EN `en-GB` biçimi (AM/PM YOK); geçersiz/boş → "—". Zaman
  dilimi BİLİNÇLİ olarak ayarlanmadı — mevcut yerel-tz davranışı korunur (bu düzeltme yalnız BİÇİM sorununu
  çözer, gösterilen saati kaydırmaz). `store-admin-web/lib/client/shipment-ui.ts` bunu re-export eder
  (shipment ekranları tek kaynağı paylaşır).
- **Kopya.** Müşteri kartındaki dağınık üç not (`preparedNote`/`problemNote`/`cancelledNote`) tek,
  duruma-göre tutarlı `statusHelp` satırıyla birleşti (TR+EN, her Shipment.status için). Yardımcı metin
  source-of-truth `Shipment.status`'tan türer (timeline metninden değil); IN_TRANSIT → "Kargonuz taşıma
  sürecinde." gösterir ve "Kargonun alımı bekleniyor." göstermez (ADR-045). PACKED (LABEL_CREATED) vs
  AWAITING_PICKUP (ORDER_CREATED/LABEL_PENDING) semantik ayrımı korundu.
- **Nerede.** Müşteri: `shipment-tracking.tsx` (+ `locale` prop, sayfa `getRequestLocale`). Admin:
  gönderi detay `[id]` (lastSync/event/retry×2), gönderi listesi (lastSync), order özet kartı (lastUpdate).
  Backend/domain/status-map/webhook/sync/retry/CBS DEĞİŞMEDİ; DTO allowlist aynı, ham payload sızmaz.
- **Testler.** `storefront-web/shipment-tracking.test.tsx` (+7 render: dd.MM.yyyy HH:mm, AM/PM yok,
  IN_TRANSIT→"Yolda", bekleme ipucu yok, konum var/yok temiz, ham payload sızmaz), `shipment.test.ts`
  (statusHelp'e taşındı), `i18n.test.ts` (+6 formatDateTime), `store-admin-web/shipment-screens.test.tsx`
  (+1 admin tarih 24 saat/saniyesiz). Gate'ler yeşil: db:generate, pnpm -r build, typecheck, lint,
  test (34/34 task), git diff --check temiz. ADR YOK (mimari karar yok). TODO-140/130/123 regresyon yeşil.
- **Kalan.** main'e merge sonrası storefront-web (+ değiştiyse store-admin-web) REBUILD + runtime doğrulama.

## 2026-07-05 — TODO-141b: Müşteri sipariş SALT-TARİH alanları (US MM/DD/YYYY düzeltmesi)
- **Sorun.** TODO-141 timeline datetime'ını düzeltti ama müşteri sipariş **başlığı** + liste + ödeme
  tarihleri hâlâ locale'siz `toLocaleDateString()` kullanıyordu → tarayıcı/runtime locale'ine göre US
  `7/4/2026` (MM/DD/YYYY) görünüyordu. Kullanıcı başlıkta bu tutarsızlığı fark etti.
- **Çözüm.** `formatDateTime` ile aynı tek kaynağa SALT-tarih kardeşi eklendi: `formatDate(value, locale)`
  → `@commerce-os/i18n`. TR `04.07.2026`, EN `04/07/2026` (hiçbir locale'de US MM/DD/YYYY DEĞİL);
  geçersiz/boş → "—"; saat alanı yok. Aynı BCP-47 etiketlerini (`tr-TR`/`en-GB`) paylaşır. Timezone
  davranışı değişmedi.
- **Nerede.** Müşteri sipariş detayı `[orderNumber]/page.tsx` (başlık `createdAt` + `PaymentBlock` `paidAt`,
  `locale` prop eklendi), `account/page.tsx` (`getRequestLocale` → `renderSection` → `OrdersSection` locale
  threading), sipariş listesi `orders-section.tsx` `OrderCard` (`createdAt`). `payment-tester.tsx` zaten
  `tr-TR` (dev aracı) → kapsam dışı. Backend/DTO DEĞİŞMEDİ.
- **Testler.** `i18n.test.ts` (+5 formatDate: TR dd.MM.yyyy, EN dd/MM/yyyy US-değil, saatsiz, varsayılan
  TR, geçersiz→"—"). Gate'ler yeşil: db:generate, pnpm -r build, typecheck, lint, test (34/34), git
  diff --check temiz. ADR YOK.
- **Kalan.** merge sonrası storefront-web REBUILD + runtime doğrulama.

## 2026-07-05 — TD-036: Config empty-string normalizasyon temizliği (ADR-057)
- **Sorun.** `env_file`'da `KEY=` bırakılan ya da docker override'da boş string atanan OPSİYONEL
  değerler, Zod şemasında `url()`/`regex()`/enum/`coerce.number()` doğrulamasına takılıp api-gateway
  boot'unu çökertme sınıfıydı. Daha önce nokta-atışı düzeltildi (PR #10 `DHL_TEST_BASE_URL`, PR #15
  `PUBLIC_WEBHOOK_BASE_URL` + sync worker) ama desen inline tekrar ediyordu ve birçok opsiyonel alan
  (`DHL_ECOMMERCE_TEST_BASE_URL/LIVE_BASE_URL`, `CUSTOMER_OTP_DEV_CODE`, tüm provider guard boolean'ları,
  varsayılanlı sayı/enum alanları) hâlâ boş-string'de çökme adayıydı.
- **Çözüm.** Paylaşılan helper: `packages/config/src/env.ts` → `emptyToUndefined`, `optionalEnv`,
  `optionalUrlEnv`, `optionalBooleanEnv`, `optionalNumberEnv`. `undefined | null | "" | yalniz-bosluk`
  → "yok" (undefined); opsiyonel alan varsayılanına/undefined'a düşer. `packages/config/src/index.ts`
  şeması bu helper'larla yeniden yazıldı; inline `z.preprocess(...)` tekrarları kaldırıldı. `loadConfig`
  artık `safeParse` + `ConfigValidationError` (yalnız **anahtar + mesaj**; env DEĞERİ asla basılmaz →
  secret sızmaz).
- **Strict kalanlar.** `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_TOKEN`, `SESSION_SECRET` bilerek
  toleranssız: eksik/geçersizse boot yüksek sesle hata verir. Secret'lar (`PAYMENT_ENCRYPTION_KEY`,
  `SHIPPING_ENCRYPTION_KEY`) dokunulmadı (downstream `key.trim().length` ile boşu zaten "yok" sayıyor).
  Opsiyonel bir alana boş OLMAYAN geçersiz değer verilirse yine yüksek sesle hata.
- **Kapsam dışı.** İş mantığı, shipment/webhook/sync davranışı DEĞİŞMEDİ (yalnız config parsing güvenliği).
  Web app'lerin request-time `?? default` okuyuşları (boot değil) bu turda değiştirilmedi.
- **Nerede.** `packages/config/src/env.ts` (yeni), `packages/config/src/index.ts`, `.env.example`
  (baştaki politika notu), `packages/config/test/config.test.ts` (+20 test: opsiyonel URL/bool/number/
  regex, required-strict, secret sızmama, helper birim testleri).
- **Testler.** Gate'ler yeşil: db:generate, pnpm -r build, typecheck, lint, test (config 24/24; api-gateway
  494/494 regresyon dahil), git diff --check temiz.
- **Kalan.** merge sonrası docker api-gateway rebuild + boş opsiyonel env'lerle boot doğrulama (aşağıdaki
  runtime doğrulama planı).

## 2026-07-05 — TODO-142 + TD-038: Kargo sandbox smoke runbook + web request-time env normalizasyon
- **Bağlam.** Kargo temeli (gönderi/DHL-MNG sandbox/CBS/adres/barkod/retry/sync/webhook/UI) büyük ölçüde
  tamam; kampanya/kupon MVP'sine geçmeden önce (1) operatör için tekrarlanabilir smoke akışı ve (2) TD-036'nın
  bilinçli kapsam dışı bıraktığı web app request-time env boşluğunun kapatılması gereken küçük bir kapanış turu.
- **Part A — TODO-142 runbook.** Yeni `docs/runbooks/shipping-sandbox-smoke.md`: 11 bölümlük somut kontrol
  listesi — ön koşullar (stack/gateway/panel health, sandbox env, guard'lar), ödeme uygunluğu (`409
  ORDER_PAYMENT_REQUIRED`), CBS/varış onarımı (MNG **20001** "VARIŞ ŞUBESİ BULUNAMADI" = DATA_FIX; TD-035
  provision boşluğu beklenen), prepare/duplicate güvenli yanıt, barkod 3 sınıf (RETRYABLE otomatik /
  DATA_FIX admin onarımı bekler / TERMINAL) + manuel retry backoff bypass, sync worker + manuel `sync-all`
  (drift yok) + terminal hariç + duplicate-event yok, webhook rotate/imzalı örnek/geçersiz-imza-reddi/
  duplicate-idempotency/ham-payload-sızmaz (openssl HMAC örneği), müşteri UI (TR tarih `04.07.2026 18:00`,
  IN_TRANSIT "Yolda", "Kargonuz taşıma sürecinde."), admin UI (detay/olaylar/webhook-modal/retry-panel/
  onarım), güvenlik kuralları (DB reset/seed/prune/prod-credential/sahte-DELIVERED YOK), kopyala-yapıştır
  final rapor şablonu. `docs/OPERATIONS.md`'ye kısa link/bölüm eklendi. Kod/domain DEĞİŞMEDİ.
- **Part B — TD-038 env normalizasyon.** Duz-string helper `optionalEnvString` (`packages/utils`):
  `undefined|null|""|whitespace` → undefined (config'in zod `optionalEnv`'inin web karşılığı; `loadConfig`/
  zod **web bundle'a girmez**, yalnız `packages/utils` zero-dep). Gateway URL tek noktada: `resolveApiGatewayUrl`
  (`packages/api-client`) boş/whitespace `API_GATEWAY_URL`'yi "yok" sayar → default; storefront
  `gatewayBaseUrl()` buraya delege edildi (store-admin/admin zaten `createApiClient` üzerinden aynı noktayı
  kullanıyor). Helper ile sarılan diğer okumalar: `SESSION_COOKIE_NAME`/`CSRF_COOKIE_NAME`/`CSRF_HEADER_NAME`
  (store-admin+admin), demo mağaza slug'ları (storefront `env.ts`, store-admin `store-context.ts`),
  `STOREFRONT_BASE_URL` (aktivasyon linki — whitespace artık `"   /auth/activate"` bozuk mutlak URL üretmez),
  `STOREFRONT_CART_SECRET`.
- **Bilinen bug düzeltmesi.** `API_GATEWAY_URL=""` artık default gateway URL'ini bypass ETMEZ; unset gibi
  davranır (boş değerle bozuk göreli fetch'e düşmez).
- **Değişmeyen.** Zorunlu `INTERNAL_API_TOKEN` doğrudan/strict okunur. Karşılaştırmalı okumalar
  (`NODE_ENV === "production"`, `ADMIN_COOKIE_SECURE === "true"`, `ADMIN_COOKIE_SAME_SITE === "strict"`)
  boş string'de zaten doğru else-dalına düştüğünden dokunulmadı. Helper değeri asla loglamaz (secret güvenliği).
- **Dep politikası.** `@commerce-os/utils` (zero-dep, bundle-safe) → storefront-web/store-admin-web/admin-web
  ve api-client'a workspace dep. Yeni ağır/zod bağımlılığı yok, client bundle riski yok → **ADR gerekmez**.
- **Testler.** `packages/utils/test/env.test.ts` (+6), `packages/api-client/test/api-client.test.ts` (+6:
  undefined/""/whitespace→default, valid, explicit öncelik, boş explicit→env), `apps/store-admin-web/test/
  activation-link.test.ts` (+4: unset/""/whitespace→göreli, set→mutlak). Gate'ler yeşil: db:generate,
  pnpm -r build, typecheck, lint, test (utils 6/6, api-client 19/19, store-admin 161/161, storefront 101/101,
  admin 24/24, api-gateway 494/494 regresyon), git diff --check temiz.
- **Kalan.** merge sonrası storefront/store-admin/admin-web rebuild + `API_GATEWAY_URL=` boş env ile boot/
  login-redirect/guarded-page doğrulama (500 yok, secret loglanmaz); api-gateway sağlıklı tutulur.

## 2026-07-05 — F4A: Kampanyalar & Kuponlar MVP (ADR-058)

- **İş problemi.** Mağazaların Amazon/Hepsiburada tarzı kupon kodu ve otomatik sepet/ürün/kategori
  kampanyaları tanımlayabilmesi; indirimin İSTEMCİYE GÜVENMEDEN, sunucu tarafında hesaplanıp siparişe
  değişmez snapshot olarak yazılması. Önceki durum: gateway'de yalnız hardcoded `DEMO10` %10 demo kuponu
  vardı (ADR-031 "demo calculation" notu; TODO-059 kapsamındaki gerçek coupon motoru).
- **Veri modeli (additive migration `20260705120000_add_campaigns_coupons`).** `Campaign` (status
  DRAFT/ACTIVE/PAUSED/ARCHIVED; type COUPON_CODE/AUTOMATIC_CART/PRODUCT_DISCOUNT/CATEGORY_DISCOUNT —
  BUY_X_GET_Y/FREE_SHIPPING/MEMBERSHIP_ONLY gelecek fazlar için YALNIZ enum rezervi, motor uygulamaz;
  discountType PERCENT/FIXED_AMOUNT; maxDiscountAmountMinor/minOrderAmountMinor; startsAt/endsAt;
  totalUsageLimit/perCustomerUsageLimit + atomik `usageCount`; stackable/priority/isPublic), `Coupon`
  (code + normalizedCode, `@@unique([storeId, normalizedCode])` — farklı mağazalar aynı kodu kullanabilir;
  opsiyonel pencere/limit override), `CampaignProduct`/`CampaignCategory` (kapsam; boş = tüm sepet),
  `CampaignRedemption` (`@@unique([campaignId, orderId])`; customerId/email kimliği; İPTAL/REFUND'ta
  TARİHSEL kalır — kompanzasyon deseni yok, ADR-058), `OrderDiscount` (sipariş sonrası IMMUTABLE snapshot:
  label/code/discountType/value/amount + scopeSummary).
- **Motor.** `apps/api-gateway/src/campaigns/discount-engine.ts` — SAF (I/O yok, `now` parametre).
  Kupon normalizasyonu: trim + locale-BAĞIMSIZ `toUpperCase` (TR-I tuzağı yok) + `[A-Z0-9_-]{2,40}` format.
  Doğrulama sırası: varlık → durum → pencere (kampanya + kupon override) → limitler → min tutar → kapsam;
  spesifik `couponReason` üretir (NOT_FOUND/INACTIVE/NOT_STARTED/EXPIRED/MIN_ORDER_NOT_MET/
  USAGE_LIMIT_REACHED/NOT_APPLICABLE). Hesap: PERCENT Math.round; max-cap; eligible-subtotal cap; kalan
  sepet cap (toplam indirim > subtotal imkânsız). Stacking (MVP): kupon HER ZAMAN önce; adaylar priority
  DESC → tutar DESC → id ASC; stackable=false seçilince başka kampanya uygulanmaz (best-discount otomatik
  seçimi); stackable=true'lar birlikte.
- **Public entegrasyon.** `POST /public/stores/:slug/cart` + `/checkout` DEMO10 yerine motoru kullanır;
  kampanya bağlamı `AppDataAccess.loadCampaignDiscountContext` (store-scoped kupon lookup — cross-store
  kupon çözülmez) ile yüklenir. Sepet özetine `couponReason` + `discountLines` (yalnız label/code/amount —
  kampanya iç metadata'sı/istatistiği PUBLIC yanıta sızmaz) eklendi. Checkout'ta geçersiz kupon 409
  `COUPON_INVALID` döner (sessiz sıfır-indirim ile sipariş OLUŞMAZ). createOrder transaction'ı: koşullu
  `updateMany` ile `usageCount < totalUsageLimit` ATOMIK artışı + per-customer redemption COUNT; ihlalde
  `CampaignRedemptionRejection` throw → ROLLBACK (sipariş+sayaç kalıcı olmaz) → 409. OrderDiscount +
  CampaignRedemption aynı transaction'da yazılır; `Order.discountAmount`/`totalAmount` mevcut
  `orderTotals` yolunda (max(0, subtotal - discount + shipping)).
- **Admin API + UI.** Gateway `registerCampaignAdminRoutes`: GET/POST `/stores/:storeId/campaigns`,
  GET/PATCH `/:id`, POST `/:id/activate|pause|archive` (platform-admin + store scope guard; ARCHIVED
  düzenlenemez ve terminaldir; geçişler DRAFT→ACTIVE, ACTIVE↔PAUSED, *→ARCHIVED; detay maskeli e-posta ile
  son 10 kullanım + toplam istatistik; audit log'lu). Store-admin: `/campaigns` sayfası (liste: ad/tip/
  indirim/pencere/kullanım/durum + aksiyonlar; form: tüm alanlar + ürün/kategori kapsam seçici + kupon kodu;
  detay paneli: kuponlar/istatistik/son kullanımlar), BFF proxy `/api/campaigns/*` (CSRF + store context),
  api-client `admin.campaigns.*`, nav "Kampanyalar" + `storeAdmin.nav.campaigns` TR/EN.
- **Storefront.** Mevcut kupon input/apply/remove akışı korundu (cookie yalnız kod taşır; tutar daima
  sunucudan). Neden-bazlı hata kopyaları (TR: "Bu kupon sepetiniz için geçerli değil." / min tutar / süre /
  limit; NOT_FOUND ve INACTIVE aynı genel kopyaya düşer — kupon varlığı sızdırılmaz); çoklu indirim satırı
  gösterimi (kupon + otomatik kampanya); checkout 409 kupon reddi için ayrı banner (`errorCouponInvalid`).
- **Testler.** Motor 19 birim (`campaigns-engine.test.ts`: yüzde/sabit/cap/min/normalize/pencere/limit/
  kapsam/stacking/öncelik/deterministik yuvarlama); gateway F4A 10 API testi (health.test.ts: admin create/
  validation/duplicate-code/cross-store-izolasyon/auth, public reason'lar, checkout revalidation + snapshot
  + redemption + limit + kuponsuz regresyon); storefront kupon UI 4 (`cart-coupon-ui.test.tsx`); store-admin
  sayfa 3 (`campaigns-page.test.tsx`). Regresyon: api-gateway 523/523, storefront 105/105, store-admin
  164/164, tüm workspace testleri yeşil.
- **Gate'ler.** db:generate, pnpm -r build, typecheck, lint, test, git diff --check — hepsi yeşil.
- **Kalan.** Merge sonrası docker rebuild (api-gateway + storefront-web + store-admin-web) + migration
  deploy + runtime smoke (TEST250: ₺250 sabit, min ₺1.000, limit 10/müşteri-başı 1; BADCODE; min-altı;
  cross-store; kuponsuz regresyon). Ürün kartı kampanya rozeti bilinçli follow-up. İptal/refund'ta
  redemption iadesi yok (tarihsel kayıt; ADR-058'de sınırlama olarak dokümante).

## 2026-07-05 — F4A.1 + F4A.2: Kampanya görünürlüğü, otomatik kupon kodu, sipariş kampanya paneli, analitik (ADR-059)

- **Public rozet projeksiyonu (F4A.1).** `publicProductSchema`'ya additive `campaign` alanı
  (`publicCampaignBadgeSchema` allowlist: kind AUTOMATIC/COUPON, discountType, discountValue,
  minOrderAmountMinor). Gateway public ürün liste/detay uçları store-scoped ACTIVE + isPublic
  kampanyaları yükler (`listPublicActiveCampaigns`) ve ürün başına rozeti SAF helper'la seçer
  (`campaigns/public-badge.ts`: pencere/limit/ACTIVE kupon şartı, kapsam eşlemesi, priority→id
  deterministik). Kampanya iç kimliği/istatistiği/kapsam listeleri public gövdeye taşınmaz;
  isPublic=false kupon kampanyaları hiçbir public yüzeyde görünmez.
- **Paylaşılan etiketler.** `@commerce-os/utils` → `getCampaignPublicLabel`/`getCampaignBadgeText`/
  `formatCampaignAmount` (TR/EN; "Sepette %10 indirim", "₺250 kupon", "Kuponlu ürün"; para tr-TR,
  tam lirada ondalıksız). Vitrin resolver'ı (catalog.ts) rozeti hazır metinlere çevirir (istemci hesap
  yapmaz); sayfalar request locale'ini geçirir.
- **Vitrin görünürlüğü.** Ürün kartı: kampanya rozeti (compareAt "İndirim" rozetinden öncelikli).
  Ürün detay/buy box: fiyat altında kampanya kutusu — etiket + "Sepette uygulanır" +
  "Kupon kodu gerektirir" (kuponlu) + "₺X üzeri geçerli" (minOrderAmountMinor varsa). Sepet + checkout
  özeti: indirim satırları kampanya ADIYLA ("Sepette %10 İndirim"), kupon satırında kod parantezde;
  geçersiz kupon hatası gösterilirken otomatik kampanya indirim satırı görünür kalır (çelişki yok).
- **Otomatik kupon kodu (Part B).** Store-admin kampanya formunda "Otomatik Oluştur" / EN "Generate
  automatically" (yalnız COUPON_CODE + yeni kayıt). Üretim: kampanya adından TR→ASCII önek (İ/ı→I, Ş→S…)
  + indirim ipucu (%10→"10"; ₺250→"250") + 4'lü rastgele sonek (karışan karakterler alfabe dışı) →
  `YAZ10-K7P3` biçimi; `/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/` doğrulamasına sığar; alan üretim sonrası
  düzenlenebilir; benzersizlik kaynağı backend (409 DUPLICATE_COUPON_CODE → yeniden üret).
- **Sipariş kampanya paneli (Part C).** `orderSchema.discounts` additive alan (OrderDiscount SNAPSHOT:
  id/campaignId/code/label/discountType/discountValue/discountAmountMinor/createdAt; scopeSummary raw
  ve couponId iç alanları SEÇİLMEZ). `orderSelect` + `serializeOrder` güncellendi. Store-admin sipariş
  detayında "Kampanya / Kupon Bilgisi" kartı: satır başına tip rozeti (Kupon kodu / Otomatik kampanya),
  kod, indirim tipi (Yüzde/Sabit tutar), değer (%10 / ₺250), uygulanan tutar, kullanım tarihi; altta
  indirim öncesi ara toplam → toplam indirim → indirim sonrası ara toplam → kargo → genel toplam ve
  "Bu bilgiler sipariş anındaki indirim kaydıdır." notu. İndirimsiz siparişte nötr "kampanya/kupon
  kullanılmadı" metni. Çoklu indirim satırları ayrı ayrı + toplamla gösterilir.
- **Kampanya analitiği (Part D, ADR-059).** `campaignDetailResponseSchema.analytics`
  (redemptionCount, uniqueCustomerCount (customerId??email tekilleştirme), totalDiscountMinor,
  ordersSubtotalMinor (indirim öncesi ciro), ordersTotalMinor (tahsil edilen), avgDiscountPerOrderMinor,
  avgOrderTotalMinor, lastRedemptionAt) + son kullanımlarda `orderTotalMinor` ve sipariş detayına LİNK.
  Kaynak: immutable CampaignRedemption + sipariş snapshot alanları; (campaignId, orderId) unique →
  çift sayım yok; güncel kampanya tanımından yeniden hesap YOK; iptal edilen siparişlerin kullanımları
  tarihsel olarak dahil (UI notu). Arşivli kampanyanın analitiği görüntülenebilir kalır. Maskeli e-posta
  dışında müşteri verisi taşınmaz; analitik yalnız sayısal özetlerdir.
- **Testler.** utils etiket 10; gateway public-badge birim 15 + public liste rozet entegrasyonu 2
  (allowlist sızıntı + isPublic/PAUSED dışlama) + health regresyon 107/107; storefront kart rozeti 3 +
  detay kampanya kutusu 3 + tam paket 111→121; store-admin üretici 11 + form UI 2 + sipariş paneli 4 +
  analitik UI 2 (sıfır durumu + sipariş linki dahil).
- **Kapsam dışı/bilinçli.** İndirim motoru, checkout toplam hesabı ve limit transaction mantığına
  DOKUNULMADI; yeni kampanya tipi yok; migration yok. Kampanya listesi kolonlarına toplam indirim/ciro,
  tarih-aralıklı rapor sayfası + CSV export ve yüksek hacim için SQL aggregate follow-up.
- **Kalan.** Merge sonrası docker rebuild (api-gateway + storefront-web + store-admin-web) + runtime
  smoke ("Sepette %10 İndirim" rozet/detay/sepet görünürlüğü, Otomatik Oluştur, TEST250 sipariş paneli,
  kampanya analitiği, cross-store izolasyon).

## 2026-07-05 — F4A.3: Kupon vs sepet indirimi UX + kalıcı müşteri kupon cüzdanı (ADR-060)

- **Sorun.** Vitrin otomatik sepet indirimlerini ("Sepette %X") ve kupon-kodu kampanyalarını görsel
  olarak karıştırıyordu; kupon ürünlerinde müşteri kodu görmüyor, nasıl kullanacağını bilmiyordu
  ("Kupon kodu gerektirir" çıkmaz sokak). Kuponların dağıtım yolları (public keşif / admin ataması /
  kod ile tanımlama) için model yoktu.
- **Gösterim taksonomisi (additive DTO).** `publicCampaignBadgeSchema` → `displayKind`
  (AUTOMATIC_CART_DISCOUNT | PUBLIC_COUPON), `requiresCouponCode`, `couponCode` (nullable; yalnız
  isPublic + ACTIVE kupon + pencere geçerli iken), `couponAction` (CLAIM/APPLY/COPY/MANUAL_ONLY),
  `endsAt`. Otomatik: kart "Sepette %10", detay "Kod gerekmez" + alt limit. Public kupon: kart
  "Kuponlu ürün", detay KUPON KARTI (kod + "Kuponu ekle"/"Kodu kopyala" + alt limit + son kullanma).
  Private (isPublic=false) hiçbir public yüzeyde görünmez; iç kimlik/priority/usage/limit sızmaz.
- **Kalıcı cüzdan (`CustomerCoupon`).** Additive migration (2 enum + tablo; DB reset yok). customerId
  VEYA email anahtarlı; status AVAILABLE/APPLIED/USED/REVOKED; source ADMIN_ASSIGNED/PUBLIC_CLAIMED/
  CODE_CLAIMED. "Kullan"→APPLIED, "Kaldır"→AVAILABLE, başarılı sipariş→USED (aynı transaction; başarısız
  sipariş USED yapmaz).
- **İki adımlı akış.** "Kupon Kodu Ekle" doğrular + uygunsa cüzdana ekler (claim); "Kullan" ayrı adım.
  Alt limit/kapsam claim'i reddetmez — kart "Alt limit eksik" ile görünür. Gateway uçları
  `POST .../cart/coupons/claim|apply|remove`; sepet quote'una `availableCoupons` (public + oturum cüzdanı
  + misafir cookie `claimedCodes`).
- **İndirim kaynak doğrusu değişmedi.** Kupon indirimi yine couponCode + motor (ADR-058); cüzdan APPLIED
  yalnız durum aynası (client'a güvenilmez). Checkout semantiği ve limit transaction'ı korundu; sipariş
  oluşturmada store-scope/pencere/limit yeniden doğrulanır.
- **Store-admin atama.** Kampanya detayı (email ile) + müşteri detayı (kupon seçerek) — AYNI backend
  servisi (`assignCoupon`); cross-store engeli; maskeli e-posta; private kuponu public yapmaz. Yardımcı
  metin: "Public kuponlar ürün/sepet ekranlarında gösterilir; private kuponlar yalnızca kodu bilen/atanan
  müşteri kullanır."
- **Testler.** utils discountText 2; gateway public-badge taksonomi + private dışlama + yeni
  `campaigns-wallet` suite (projeksiyon/dedup/claim eval) + health public coupon 1 (557/557 yeşil);
  storefront kart/detay/sepet Kuponlar 7 (114/114 yeşil).
- **Kapsam dışı/bilinçli.** İndirim motoru + checkout toplamı + usage-limit transaction mantığına
  DOKUNULMADI (yalnız additive USED işaretleme); yeni kampanya tipi yok. Sınırlamalar: misafire ATANAN
  kupon checkout email'ine kadar görünmez (kimlik boşluğu); misafir kod-claim'i sepet cookie'sinde
  (`claimedCodes`); "Tüm Kuponlar" listeleme sayfası follow-up (dead link eklenmedi); store-admin atama
  UI'si için otomatik test backend gateway testiyle kapsanıyor (UI testi follow-up).
- **Kalan.** Merge sonrası docker rebuild (api-gateway + storefront-web + store-admin-web) + runtime smoke
  (otomatik "Sepette %10" kart/detay/sepet; TEST250 public kupon kartı/claim/Kullan; private yalnız kodla;
  BADCODE güvenli hata + otomatik satır korunur; admin atama iki yerden; public payload sızıntısızlığı).

## 2026-07-05 — F4A.5: Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi (ADR-060 devamı)

- **Amaç.** F4A.3 kalıcı cüzdanının eksik UX katmanı: müşteri kuponları tek bir merkezde keşfeder, görür,
  ekler ve kullanır. Yeni ADR yok — ADR-060 güvenlik/allowlist sözleşmesini genişletir.
- **Rota.** Mevcut hesap konvansiyonu izlendi: `/account?section=coupons` (sidebar + header dropdown +
  placeholder zaten bağlıydı). Ayrı `/account/coupons` route açılmadı (hesap sayfası section-tabanlı tek
  sayfa). Oturum zorunlu; misafir → mevcut `/auth/login?next=/account` redirect'i (yeni guest akışı yok).
- **Yeni uç (müşteri-scoped + store-scoped).** `GET /public/stores/:slug/customer/coupons` (server.ts;
  wallet + campaigns dataAccess'in bir arada olduğu yer). `x-customer-session` zorunlu (yoksa 401). Döner:
  (1) kullanılabilir = PUBLIC (isPublic + ACTIVE kupon kampanyaları) + bu müşteri/email cüzdanı (ASSIGNED/
  CLAIMED); (2) kullanıldı = kimliğin KENDİ USED geçmişi (usedAt + kendi sipariş no). Saf projeksiyon
  `projectCouponCenter` (wallet.ts): SEPET-BAĞIMSIZ (subtotal=+∞ → alt limit "eksik" çıkmaz; kart AVAILABLE/
  EXPIRED), kullanılmış kod "Kullanılabilir"den düşürülür. Küçük güvenli additive: `listUsedWalletEntries
  ForIdentity` (yalnız okuma; **migration YOK**).
- **Allowlist/güvenlik.** Çıkan kart yalnız `code/discountType/discountValue/minOrderAmountMinor/endsAt/
  state/source/usedAt/orderNumber` taşır; kampanya/kupon iç kimliği, limit/istatistik, priority/stackable,
  redemption iç verisi SIZMAZ. Private kupon yalnız atanmış/claim edilmişse görünür; cross-store yok; USED
  yalnız kendi müşteri/email; `orderNumber` müşterinin kendi siparişi (zaten sipariş listesinde görünür).
- **Sayfa (client).** Başlık "Kuponlarım"; sekmeler Tüm Kuponlar / Kullanılabilir / Sana Özel / Kullanıldı
  (+ kupon varsa Süresi Doldu); arama "Kupon ara" (kod + indirim metni); "Kupon Kodu Ekle" (mevcut
  `claimCouponAction` + `router.refresh()`; claim otomatik uygulamaz). Kart: indirim/alt limit/geçerlilik/
  kod+kopyala/kaynak/durum rozeti; aksiyonlar Kullan (AVAILABLE) → mevcut `applyWalletCouponAction` +
  refresh, Sepete Git (APPLIED), Siparişi gör (USED). İndirim tutarı İSTEMCİDE hesaplanmaz; uygulama durumu
  sepet couponCode cookie'sinden işaretlenir (kaynak doğrusu).
- **Sepet bağlantısı.** Sepet "Kuponlar" alanına "Tüm Kuponlar" → `/account?section=coupons` linki eklendi
  (dead link giderildi). Oturum yoksa mevcut hesap redirect'i devreye girer.
- **Testler.** gateway `projectCouponCenter` 6 (AVAILABLE allowlist + USED usedAt/order + sepet-bağımsız alt
  limit + kullanılmış kod dışlama + alan sızıntısızlığı); storefront kupon merkezi UI 8 (başlık/sekmeler/
  arama/kart/applied/used-no-Kullan/assigned rozet/empty) + cart "Tüm Kuponlar" link 1. Gate: db:generate +
  `pnpm -r build` + typecheck + lint + turbo test (35 task; api-gateway 563, storefront 123) + `git diff
  --check` yeşil.
- **Kapsam dışı/bilinçli.** İndirim motoru + checkout toplamı + CustomerCoupon yaşam döngüsü + usage-limit
  transaction'a DOKUNULMADI (yalnız additive USED okuma). F4A.4 admin kupon oluşturma alanları eklenmedi.
  Kategori çip filtresi follow-up (kampanya categoryIds var ama kategori-ad çözümlemesi + kapsam eşleşmesi
  ayrı iş — tabs/arama önce yapıldı). Çok-kullanımlı public kupon bir kez kullanıldığında "Kullanılabilir"den
  düşer (MVP kabulü). Kargo/takip'e dokunulmadı; follow/takip et yok.
- **Kalan.** Merge sonrası docker rebuild (api-gateway + storefront-web) + runtime smoke: /account?section=
  coupons yüklenir; TEST250 uygun yerde görünür; atanan kupon yalnız atanan müşteride; private kod-claim'den
  önce görünmez; kod-claim kart ekler; Kullan uygular; sipariş sonrası USED "Kullanıldı"da; sepet "Tüm
  Kuponlar" linki çalışır; iç alan sızıntısızlığı.

## 2026-07-05 — F4A.4: Kampanya/kupon oluşturma seçenekleri + kriter genişletme (ADR-061)

- **Amaç.** Store-admin'in production-grade kupon kartları/kampanyalar tanımlaması. TEMEL KURAL: sunum
  alanları indirim hesabından AYRI — motor/checkout/cüzdan yaşam döngüsü/kargo DEĞİŞMEDİ (additive).
- **Şema (additive migration `20260705140000_add_campaign_presentation_fields`).** `Campaign`'e nullable/
  varsayılanlı SUNUM alanları: `displayTitle` (≤120), `shortDescription` (≤240), `terms` (≤2000),
  `badgeLabel` (≤40), `badgeVariant`, `cardStyle` (STANDARD), `accessModel` (AUTO_VISIBLE), `displayPriority`
  (0). Yeni enumlar: `CampaignBadgeVariant`, `CampaignCardStyle`, `CampaignAccessModel`. Backfill YOK;
  mevcut kampanyalar null/varsayılanla çalışır.
- **Erişim modeli → isPublic türetimi.** `deriveIsPublicFromAccessModel` (contracts tek kaynak):
  AUTO_VISIBLE/PUBLIC_CLAIMABLE→true, CODE_CLAIMED/ADMIN_ASSIGNED→false. `isPublic` public projeksiyon için
  AUTHORITATIVE gate; admin ayrı input görmez. data-layer create/update ve in-memory test data access
  aynı türetimi uygular. Redundant audience/claimType eklenmedi.
- **Public projeksiyon.** `couponDisplayFieldsSchema` (allowlist) badge + wallet + coupon-center
  yanıtlarına eklendi; `toCouponDisplayFields` ortak helper (public-badge + wallet). Private güvenlik
  korundu: yalnız isPublic=true kampanyada (rozet) / cüzdana girmiş kuponda (sepet/merkez) taşınır;
  iç kimlik/limit/priority/stackable yine sızmaz.
- **Store-admin formu.** 6 bölüm (Görünüm/Kupon Kartı · İndirim Kuralı · Geçerlilik · Erişim/Kitle ·
  Kapsam · Önizleme) + kupon kartı önizlemesi (gerçek hesap YOK) + bitişten türetilmiş "Bugün bitiyor/
  Son 3 Gün" etiketi. Erişim seçicisi kupon tipinde 3 claim modeli; otomatik tiplerde AUTO_VISIBLE.
  Kampanya detayına sunum alanı özeti + erişim/public göstergesi eklendi.
- **Vitrin tüketimi.** Ürün rozeti (`StorefrontCampaignView`) + kupon merkezi kartı
  (`StorefrontCouponCenterView`) displayTitle/shortDescription/badgeLabel/terms taşır; kart displayTitle
  varsa öne çıkarır, yoksa üretilmiş tutar etiketine düşer; badgeLabel yoksa kaynak rozeti; terms yoksa
  "Detaylar" yok. i18n `details` anahtarı (tr/en).
- **HARİÇ (bilinçli).** "Takip et kazan"/store-follow/seller-follow hiçbir enum/UI/doküman/testte YOK.
  Reserved segmentler (ilk sipariş/geri dönen/e-posta) enforce edilemediği için enum/forma eklenmedi.
  Marka/vendor scope yok (`Product.brand`/`vendor` serbest metin, first-class değil — follow-up).
  Coupon-seviyesi sunum alanı yok (campaign-seviyesi yeterli). Sunum alanları OrderDiscount snapshot'ına
  yazılmaz.
- **Testler.** contracts doğrulama 10 (uzunluk/geçersiz enum/follow+reserved reddi/türetim/partial);
  gateway rozet+merkez sunum taşıma + allowlist güncellemeleri; store-admin 5 (6 bölüm+preview / follow
  yok / erişim seçenekleri / alan kaydı+türetim / null-alan edit); storefront kupon merkezi 3 (display
  kullanımı / fallback / follow yok). Gate: db:generate + `pnpm -r build` + typecheck + lint + turbo test
  (35 task) + `git diff --check` yeşil.
- **Kalan.** Merge sonrası `prisma migrate deploy` (RESET YOK) + docker rebuild (api-gateway + store-admin-
  web + storefront-web) + runtime smoke (OPERATIONS F4A.4): admin sunum alanlı kupon kaydeder + önizleme
  gösterir; vitrin kartı güvenle gösterir; "Takip et kazan" hiçbir yerde yok; claim/kullan akışı çalışır;
  checkout+OrderDiscount değişmez; private sunum alanı public'te sızmaz; TEST250 + otomatik kampanya eskisi
  gibi. Follow-up: marka/vendor scope, reserved segment enforcement.

## 2026-07-05 — F4A.6: Vitrin ürün kartı "Sepette" fiyat gösterimi + smoke/stale denetimi (ADR-062)

- **Amaç.** Otomatik sepet indirimi uygulanan ürün kartları referans e-ticaret gibi görünmüyordu: yalnız
  küçük pill rozet vardı, "üstü çizili normal fiyat + Sepette + %badge + nihai fiyat" bloğu yoktu; ayrıca
  demo mağazada global+yüksek öncelikli TEST250 kuponu, ürün kapsamlı otomatik "Sepette %10"u her kartta
  gölgeleyip "Kuponlu ürün" gösteriyordu.
- **Ön denetim (kod yazmadan).** Runtime DB: demo-store'da ACTIVE `TEST250 Sabit İndirim` (COUPON_CODE,
  priority 1, global kapsam, bilinçli public kupon) + `Sepette %10 İndirim` (AUTOMATIC_CART, priority 0,
  2 ürün kapsamı); ikisi de `stackable=false`. Rozet seçimi priority DESC → TEST250 kazanıyor = "Kuponlu
  ürün" (kural gereği doğru). "Eski smoke indirim" aslında `demo-hoodie` varyantındaki compareAt
  (₺1.299 satış / ₺1.499 liste) mock artığı — kampanya DEĞİL. `accessModel` default'u (AUTO_VISIBLE) bir
  bug değil: `displayKind` `type === COUPON_CODE`'dan türetiliyor. Seed kampanya YARATMIYOR (hepsi runtime).
- **Güvenli nihai fiyat (ADR-062).** Public rozete additive `estimatedDiscountMinor` /
  `estimatedFinalUnitPriceMinor`. YALNIZCA otomatik + `PERCENT` + tek-fiyatlı ürün (görünür varyant fiyatları
  eşit) + (`minOrder` yok ya da birim fiyat eşiği karşılıyor) durumunda; formül motorla AYNI
  (`round(unit*yüzde)`, `maxDiscount` cap, birim sınırı). `FIXED_AMOUNT`/aralık/min-order belirsizinde `null`
  → kart yalnız "Sepette %X" + "₺X üzeri" notu (sahte fiyat yok). Tahmin gateway'de (buildPublicProduct)
  hesaplanır; storefront yalnız biçimler.
- **Stackable-duyarlı gösterim.** `publicProductSchema.secondaryCoupon` additive. Uygun kampanyaların HEPSİ
  stackable ise otomatik "Sepette" birincil + public kupon ikincil çip birlikte; biri non-stackable ise
  (checkout'ta bloklar) yalnız öncelik kazananı. `selectPublicCampaignBadge` → geriye-uyumlu ince sarmalayıcı
  (`selectPublicCampaignDisplay(...).primary`).
- **UI.** `product-card.tsx`: otomatik indirimde `CartPriceBlock` (üstü çizili normal fiyat + emerald "%X" +
  "Sepette" + kalın nihai fiyat; güvenli değilse label + min-order notu) + otomatik birincil iken ikincil
  kupon çipi. `buy-box.tsx` detay: güvenli tahminde belirgin "Sepette <nihai>" bloğu + "Kod gerekmez". i18n
  `badges.inCart` (tr "Sepette" / en "In cart").
- **Denetim sonucu / veri.** DB'ye DOKUNULMADI (bu commit'te): TEST250 demo-store'da geçerli kalır;
  demo-hoodie compareAt ve stackable ayarları + maliyet/marj + fiyat audit'i F4B'ye taşındı (checkout
  semantiği korunsun diye). f4a-smoke-test-store artık smoke kampanyaları kaldı (demo storefront'u etkilemez).
- **Regresyon.** İndirim motoru/checkout/OrderDiscount snapshot/kupon cüzdanı/analitik/kargo DEĞİŞMEDİ;
  additive alanlar, migration YOK.
- **Gate.** db:generate + `pnpm -r build` + typecheck + lint + turbo test (api-gateway 587, storefront-web
  131, store-admin 188; toplam yeşil) + `git diff --check` temiz.
- **Kalan.** Merge sonrası docker rebuild (api-gateway + storefront-web) + runtime doğrulama (kart Sepette
  bloğu güvenli tahminde; kupon kartı ayrı; no-leak; checkout/cart toplamları aynı). Follow-up: F4B —
  ürün maliyet/marj + liste fiyatı + fiyat değişikliği audit (son 30 gün en düşük fiyat).

## 2026-07-05 — F4B: Ürün maliyet/marj + liste fiyatı + fiyat audit (docs geri dolumu)

- PR #32 (ad273ee) ile MERGE edildi; docs güncellemesi o PR'da atlanmıştı, bu kayıt F4C sırasında geri
  dolduruldu. `ProductVariant.costMinor` (public'e sızmaz; kural cost ≤ compareAt ?? price), append-only
  `ProductPriceChange` audit'i, EU Omnibus `lowestPriceMinor` (son 30 gün en düşük satış), admin marj/markup
  göstergesi + fiyat geçmişi. Migration `20260705150000_add_product_cost_and_price_change_audit`.

## 2026-07-06 — F4C: Varyant kart fiyatı + Kaydet CTA fix + KDV temeli + sipariş satış özeti (ADR-063/ADR-064)

- **Amaç.** (1) Çok varyantlı ürün kartındaki fiyat aralığı kampanya bloğuyla çakışıyordu; (2) ürün
  Kaydet butonu başarıda "Kaydediliyor…"da takılıyordu; (3) faturalama/yasal belge için varyant-seviyesi
  KDV temeli; (4) admin sipariş detayına tablo benzeri ödeme + satış/vergi/kâr özeti.
- **Kart fiyatı (BUGFIX).** `formatPriceRange` kaldırıldı; kart "amount" modunda EN UCUZ görünür varyantın
  KDV dahil fiyatını tek başına gösterir. Gateway `buildPublicProduct.unitPriceMinor` = en ucuz görünür
  varyant → otomatik kampanya "Sepette" tahmini kartla AYNI tabandan (F4A.6 "yalnız tek-fiyat" kuralı
  bilinçli genişletildi; kart tek fiyat gösterdiği için tahmin artık yanıltıcı değil). compareAt/Omnibus
  türetimi zaten en ucuz varyanttandı — değişmedi.
- **Kaydet CTA (BUGFIX).** `product-form.tsx` ve `variants-manager.tsx` onSubmit'te `setSaving(false)`
  yalnız catch'teydi → `finally`'ye taşındı. Başarı bildirimi aynen kalır; kaydetme sırasında
  `disabled={saving}` double-submit'i engellemeye devam eder.
- **KDV temeli (ADR-063).** Additive migration `20260706120000_add_variant_vat_and_order_snapshots`:
  `ProductVariant.netPriceMinor/vatRateBps(default 2000)/vatAmountMinor`. `priceMinor` KDV DAHİL brüt satış
  fiyatı olarak KALIR (Option A — vitrin/sepet/checkout sıfır regresyon). Admin "KDV hariç fiyat" + oran
  girer ("Fiyat alanına KDV hariç tutarı girin" yardımı; %0/%1/%10/%20 seçimi; salt-okunur KDV tutarı +
  KDV dahil önizleme). Sunucu tek otorite: `vatFromNet(net,bps)` → vat=round(net·bps/10000), brüt=net+vat;
  legacy brüt girişte `splitGrossByVat` brütü KORUR. Yalnız oran değişirse net ANKOR kalır. Paylaşılan saf
  modül `@commerce-os/utils/vat` (UI önizleme aynı formül; istemci değerine güvenilmez; kontrat 0..10000 bps).
  Backfill: tüm varyantlarda net=round(brüt·10000/12000) → görünen brüt fiyatlar birebir korundu.
- **Sipariş snapshot + satış özeti (ADR-064).** `OrderLine`'a additive 10 kolon (unitNet/unitVatRateBps/
  unitVatAmount/unitGross/unitList/unitCost + lineNet/lineVat/lineGross/lineCost); createOrder/addOrderLine
  yazar, updateOrderLine adet değişiminde satır toplamlarını birim snapshot'tan türetir. Sipariş-seviyesi
  kolon EKLENMEDİ: `salesSummary` gateway'de saf modülden (`orders/sales-summary.ts`) deterministik türetilir
  (satır snapshot'ları + OrderDiscount + kargo + PaymentAttempt). Bölüm A: ara toplam/indirim(+etiket)/kargo/
  ödenmesi gereken/net ödenen(ilk PAID|AUTHORIZED deneme ?? paymentStatus PAID→toplam ?? 0)/kalan. Bölüm B
  (yalnız TÜM satırlar KDV snapshot'lıysa): liste=Σ(unitList·adet), KDV=Σ(lineVat)+oran dağılımı, vergisiz
  net=Σ(lineNet), maliyet=Σ(lineCost; biri yoksa null), brüt kâr=net−maliyet, kampanya indirimi=brüt
  Order.discountAmount, net kâr=brüt kâr−indirim (MVP kuralı). Eski sipariş → "eski formatta oluşturuldu"
  bilgisi; yanıltıcı sıfır YOK.
- **Regresyon.** Checkout toplamları/kampanya motoru/kargo DEĞİŞMEDİ (`taxIncludedMinor` bilgi satırı hâlâ
  %20 legacy çıkarım — bilinçli follow-up). Public DTO'ya net/KDV/maliyet sızmaz (health no-leak testi).
  Mevcut siparişler mutate edilmedi; OrderLine backfill yok (legacy güvenli kısmi durum).
- **Gate.** db:generate + pnpm -r build + typecheck + lint + test (utils 28, api-gateway 609+13, storefront
  135, store-admin 195) + `git diff --check` yeşil.
- **Kalan.** Merge sonrası migrate deploy (reset YOK) + docker rebuild (api-gateway + storefront-web +
  store-admin-web) + runtime doğrulama (OPERATIONS F4C). Follow-up: sepet "KDV (dahil)" satırını satır
  oranlarından türetme; fatura üretimi.

## 2026-07-13 — Faz 1A: Ürün ana kategorisi (`primaryCategoryId`) temeli (ADR-067, TODO-143)

- **Amaç.** Kategoriye-bağlı dinamik ürün özellikleri (attribute) çalışmasının 1A adımı: M:N ürün↔kategori
  ilişkisindeki belirsizliği gidererek her ürüne, ileriki attribute şemasının/breadcrumb'ın/kanonik URL'in
  kaynağı olacak **tek ana kategori** eklemek. Attribute tabloları bu faz kapsamı DIŞINDA (Faz 1B+).
- **Veri modeli.** `Product.primaryCategoryId String?` (additive, nullable), FK → `ProductCategory`
  `onDelete: Restrict`, `@@index([storeId, primaryCategoryId])`, back-relation `primaryProducts`. Migration
  `20260713120000_add_product_primary_category`: additive DDL + deterministik backfill (aynı store, en eski
  assignment `createdAt ASC` / eşitlikte `categoryId ASC`; tek→o kategori; kategorisiz→null). Tie-breaker
  `categoryId ASC` çünkü `ProductCategoryAssignment` surrogate `id` taşımaz (composite PK) → `assignment.id ASC`
  uygulanamaz + kapsam dışı; categoryId ürün içinde unique olduğundan tam deterministik. Idempotency: migration
  history nedeniyle BİR KEZ uygulanır; backfill `WHERE primaryCategoryId IS NULL` ile RE-RUN güvenlidir (mevcut
  değeri ezmez). NOT NULL YOK (ilk faz). `db push`/`reset` KULLANILMADI; deploy = `prisma migrate deploy`.
  İzole PostgreSQL'de doğrulandı (tek/çok/eşit-createdAt/kategorisiz/önceden-primary/cross-store/FK-RESTRICT).
- **Domain/contract.** Saf `resolvePrimaryCategorySelection` (contracts) + `resolvePrimaryCategory` route helper
  (gateway) assignment+primary'yi tek `$transaction`'da doğrular/yazar. Stabil kodlar: `PRIMARY_CATEGORY_
  REQUIRED/NOT_ASSIGNED/STORE_MISMATCH/ARCHIVED/ASSIGNMENT_CONFLICT` (zod refine yerine route — özel kod korunur).
  Ana kategori sessizce kaldırılamaz; kategoriler boşalınca ana null; tek kategori otomatik normalize.
- **Storefront.** `publicCategoryLabel` önce `primaryCategoryId`, yoksa "ilk assignment" fallback (legacy
  ürünler aynı etiketi gösterir). Public allowlist DEĞİŞMEDİ (primary iç projeksiyon; label sunucuda türer).
- **Admin UX.** Ürün formunda "Ana kategori" işaretleyici (tek kategori otomatik ana; ana kaldırılınca yeni
  ana zorunlu; edit hydration; server hata→kategori alanı). RHF/Zod'a taşıma YOK (Faz 2). i18n TR kaynak + EN.
- **Runtime kategori mirası UYGULANMADI (MVP).** Parent zinciri dolaşılmaz; `overrideMode`/`INHERIT`/`OVERRIDE`/
  `DISABLE` alanları eklenmedi (YAGNI).
- **Testler.** contracts 73 (`resolvePrimaryCategorySelection` 5 + şema 1), gateway health 132 (yeni 4),
  store-admin 232 (yeni 4 ana kategori component: otomatik primary / 2. kategoride korunma+rozet / submit engeli /
  hydration).
- **Merge-öncesi doğrulama (2026-07-13).** (a) **İzole PostgreSQL** (ayrı container :5433, proje volume'una
  dokunulmadan): pre-Faz1A zinciri + kontrollü fixture + `prisma migrate deploy` + backfill. Senaryolar A(tek→kategori)
  B(çok/en-eski createdAt) C(eşit createdAt→categoryId ASC) D(kategorisiz→null) E(önceden-primary EZİLMEZ) F(cross-store
  YOK) G(FK RESTRICT ihlali) HEPSİ doğru; backfill re-run = `UPDATE 0`; audit dry-run↔DB uyumu; `--apply` migration ile
  BİREBİR aynı; 2. `--apply` = idempotent. (b) **Runtime smoke** (gerçek Fastify+Prisma+izole PG): API create/update
  kuralları + varyant/inventory regresyonu 15/15; public categoryLabel primary-önceliği + primary-flip + no-leak 4/4.
  (c) **Typecheck main↔branch:** her ikisinde AYNI tek hata (`checkout-form-render.test.tsx` CartLineView, önceden
  mevcut) → branch **0 yeni** hata.
- **Gate.** db:generate + build + typecheck (src + store-admin) + lint + prisma validate + `git diff --check` temiz.
- **Kalan.** Merge sonrası HEDEF DB'de `prisma migrate deploy` (reset YOK) + docker rebuild (api-gateway + store-admin-web +
  storefront-web) + prod-benzeri runtime smoke + çok-kategorili backfill review. Faz 1B (AttributeDefinition/CategoryAttribute/
  değerler) ayrı iş.

## 2026-07-14 — Faz 1B: Attribute katalog çekirdeği (ADR-067 genişletildi, TODO-144)

- Tarih: 2026-07-14
- Durum: READY_FOR_REVIEW (commit atılmadı)
- Kapsam: Kategoriye-bağlı dinamik ürün özelliklerinin **KATALOG TANIM** temeli. Yalnız tanım katmanı;
  ürün/varyant DEĞER tabloları, dinamik form, RHF geçişi, varyant kombinasyon motoru, order snapshot, PDP tablo,
  faceted search, marketplace mapping, kategori mirası, overrideMode, primaryCategoryId NOT NULL geçişi ve
  storefront/checkout/order/inventory değişiklikleri KAPSAM DIŞI.
- **Prisma.** 3 enum (`AttributeScope`, `AttributeDataType` 13 tip, `AttributeStatus`) + 4 model:
  `AttributeDefinition` (tek tablo + scope; storeId nullable; code/dataType service-immutable; **davranış taşımaz**),
  `AttributeGroup` (store-scoped sunum kabı), `AttributeOption` (SELECT/MULTI_SELECT/COLOR; `@@unique([attributeDefinitionId,value])`),
  `CategoryAttribute` (davranışın **TEK SAHİBİ**; 7 bayrak + displayOrder + validationRules; `@@unique([categoryId,attributeDefinitionId])`).
  Store/ProductCategory back-relation'ları eklendi. Kategori mirası/overrideMode YOK (YAGNI).
- **Migration.** `20260714120000_add_attribute_catalog` **tamamen additive** (yeni enum + tablo; mevcut şemaya
  dokunulmaz). İzole shadow-DB `prisma migrate diff (from-migrations → to-schema)` = **"empty migration"** → şemayla
  birebir, drift yok. `db push`/`migrate reset` KULLANILMADI. `prisma format`/`validate`/`generate` temiz.
- **Contracts.** definition/group/option/categoryAttribute + create/update/list şemaları + enum'lar + tipler.
  scope + storeId GÖVDEDE YOK (route türer → spoof engellenir). code + dataType update'te kabul edilir ama route
  immutability uygular (stabil kod). validationRules `jsonRecordSchema`.
- **Gateway.** `src/attributes/` ayrı `AttributeDataAccess` + route modülü (hero/kampanya deseni; DI → dev
  MemoryDataAccess'e dokunulmadan test). STORE uçları `requireStorePlatformAdmin` (kendi STORE + PLATFORM okuma);
  PLATFORM uçları YENİ `requireSuperAdmin` (yalnız SUPER_ADMIN; **mevcut yetkiler bozulmadı**). Stabil kodlar:
  `ATTRIBUTE_CODE_EXISTS/CODE_IMMUTABLE/DATATYPE_IMMUTABLE/OPTIONS_NOT_SUPPORTED/ARCHIVED`, `ATTRIBUTE_OPTION_VALUE_EXISTS`,
  `CATEGORY_ARCHIVED`, `CATEGORY_ATTRIBUTE_EXISTS`, `*_NOT_FOUND`. dataType immutability = "kullanım başladı mı"
  (link VEYA seçenek var mı).
- **İstemci/BFF/UI.** api-client admin+platformAttributes metodları + tipler; 8 Next BFF proxy route; storeApi client.
  store-admin **Katalog → Özellikler** ekranı (tanım + grup + seçenek CRUD; PLATFORM salt-okunur; scope/dataType
  rozetleri) + kategori ekranından **CategoryAttribute bağlama modalı** (davranış bayrakları, grup, sıra). Ürün formu
  DEĞİŞMEDİ. i18n TR kaynak + EN (locale-smoke yeşil).
- **Testler.** gateway `attributes.test.ts` 21 (scope/immutable-code/immutable-dataType/duplicate-code/duplicate-option/
  tenant-isolation/option-datatype-guard/group/categoryAttribute-archived-both/duplicate-link/delete/platform-403),
  contracts `attribute-contracts.test.ts` 8, store-admin `attributes-page.test.tsx` 3 → **32 yeni**. Regresyon:
  api-gateway 716/716, contracts 81/81, store-admin 235/235.
- **Gate.** db:generate + prisma format/validate + contracts/api-client/i18n build + api-gateway build + store-admin
  tsc `--noEmit` + eslint temiz; izole shadow-DB migration diff = empty.
- **Kalan.** Merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri runtime smoke.
  Faz 2 (ProductAttributeValue / VariantAttributeValue / dinamik form / varyant motoru / PDP tablo / faceted search /
  marketplace mapping) ayrı iş.

## 2026-07-14 — Faz 2A: Ürün/varyant attribute DEĞER temeli + `attributeValueService` (ADR-068, TODO-145)

- **Kapsam.** Faz 1B katalog TANIMINI tüketip ürün/varyantların gerçek attribute DEĞERLERİNİ saklayan çekirdek veri +
  doğrulama katmanı. Dinamik ürün formu, varyant kombinasyon motoru/`combinationKey`, otomatik varyant, PDP attribute
  tablosu, faceted search, marketplace mapping, order snapshot **KAPSAM DIŞI**. Storefront/checkout/order/inventory/
  search/marketplace ve ürün formu DEĞİŞMEDİ.
- **Prisma.** 3 model: `ProductAttributeValue` (tip başına ayrı kolon `valueText/valueInteger/valueDecimal(Decimal 20,6)/
  valueBoolean/valueDate` + `optionId` FK + `mediaId` FK; `@@unique([productId, attributeDefinitionId])`),
  `VariantAttributeValue` (yalnız `valueText`+`optionId`; variantDefining), `ProductAttributeValueOption` (MULTI_SELECT
  junction — **JSON YOK**; `@@unique([productAttributeValueId, optionId])`). FK: definition/option/media `onDelete: Restrict`
  (kullanımdaki tanım/seçenek/görsel silinemez), product/variant/store `Cascade`. Back-relation'lar Store/Product/
  ProductVariant/AttributeDefinition/AttributeOption/MediaAsset'e eklendi.
- **CHECK constraint.** İki adet: `ProductAttributeValue_single_value_check` (7 kolonun NOT NULL toplamı `<= 1`) ve
  `VariantAttributeValue_single_value_check` (valueText XOR optionId). MULTI_SELECT satırı 0 kolon dolu → `<= 1` kapsar.
  Cross-table datatype eşlemesi DB'ye TAŞINMADI (serviste). Migration `20260714130000_add_product_attribute_values`
  TAMAMEN ADDITIVE.
- **attributeValueService (tek yazma otoritesi).** ProductAttributeValue/VariantAttributeValue yazan hiçbir route
  doğrudan Prisma'ya yazmaz. STABIL kodlarla doğrular (zod refine değil): tenant izolasyonu, attribute mevcut/archived,
  primaryCategoryId + CategoryAttribute bağı, required (yalnız değer sağlanınca — undefined = eski davranış), dataType↔alan
  eşlemesi + "en fazla bir alan", option attribute/tenant/archived, media tenant, **variantDefining tablo yönlendirme**
  (product-level→variant tablosuna, variant→product tablosuna YAZILAMAZ). read-only `prepare*` (create'ten ÖNCE doğrula) +
  `persist*` (sonra yaz); yazma **replace-set** (`[]` temizler, `undefined` dokunmaz). Kodlar: `ATTRIBUTE_NOT_FOUND/
  ARCHIVED/TENANT_MISMATCH/NOT_IN_CATEGORY/DUPLICATE/VALUE_MISSING/MULTIPLE_VALUES/VALUE_TYPE_MISMATCH/OPTION_INVALID/
  OPTION_ARCHIVED/OPTION_TENANT_MISMATCH/MEDIA_NOT_FOUND/REQUIRED_MISSING/IS_VARIANT_DEFINING/NOT_VARIANT_DEFINING`,
  `PRODUCT_CATEGORY_REQUIRED`, `PRODUCT/VARIANT_NOT_FOUND`.
- **Gateway.** `src/attribute-values/` ayrı data-access + service + route modülü (attributes/ deseni; DI). Product/Variant
  create-update GÖMÜLÜ opsiyonel `attributeValues` (create'te ürün oluşmadan önce doğrulanır) + dedike internal replace
  uçları (`GET/PUT .../products/:id/attribute-values` ve `.../variants/:id/attribute-values`; store admin). Media silme
  in-use guard'ına `ProductAttributeValue.mediaId` eklendi.
- **Contracts/İstemci.** `productAttributeValueInputSchema` (MULTI_SELECT için optionIds), `variantAttributeValueInputSchema`,
  read + replace-request şemaları; product/variant create/update'e opsiyonel `attributeValues`. api-client
  `admin.products.attributeValues.{get,replace}` + `admin.products.variants.attributeValues.{get,replace}`. Ürün formu
  DEĞİŞMEDİ (API hazır; UI Faz 2B).
- **Testler.** gateway `attribute-values.test.ts` 30 (typed value matrix / tenant / option / required / archived /
  variantDefining tablo yönlendirme / MULTI_SELECT junction+dedup / replace-set + dedike route round-trip/403/404) +
  media-delete 1 yeni; contracts `attribute-value-contracts.test.ts` 12 (şema + geriye uyum); db
  `attribute-value-migration.test.ts` 8 (CHECK/junction/FK DDL). Regresyon: api-gateway **747/747**, contracts **93/93**,
  api-client **23/23**, db **8/8**.
- **Gate.** db:generate + build (contracts/db/api-client/api-gateway) + typecheck (değişen paketler temiz; storefront
  `checkout-form-render` hatası ÖNCEDEN mevcut) + lint temiz + izole shadow-DB `migrate diff` = **"No difference"**
  (drift yok). Canlı DB smoke (izole `smoke_2a`): `migrate deploy` OK; CHECK iki-değer REDDETTİ, sıfır-değer (MULTI_SELECT)
  FK'ye düştü (CHECK geçti), variant CHECK ikili değeri reddetti.
- **Kalan.** Merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri runtime smoke.
  Faz 2B (dinamik ürün formu / attribute renderer / kategori-değişince-form / varyant kombinasyon motoru / `combinationKey`)
  ayrı iş.

## 2026-07-17 — Faz 2B: Dinamik ürün formu temeli (RHF + Zod + attribute renderer) (ADR-069, TODO-146)

- **Kapsam.** store-admin ürün oluştur/düzenle ekranını Faz 2A backend'iyle çalışır dinamik forma çevirmek. Varyant
  kombinasyon motoru / `combinationKey` / otomatik varyant / SKU matris / PDP attribute tablosu / storefront / faceted
  search / marketplace / order snapshot / checkout / inventory KAPSAM DIŞI (dokunulmadı). Migration YOK (yalnız UI +
  ince BFF/gateway hata-detayı plumbing'i).
- **RHF + Zod göçü.** `apps/store-admin-web/app/(app)/products/product-form.tsx` ~25 dağınık useState → tek
  `useForm<ProductFormValues>`. Çekirdek doğrulama Zod `superRefine` (yeni `product-form-schema.ts`) ile mevcut elle
  onSubmit ile **birebir**: title zorunlu, slug (yalnız create) regex, çok-kategoride primary zorunlu, min/max qty tam-
  sayı + max≥min, CTA/WhatsApp/inquiry/appointment uzunluk sınırları, kargo ölçüsü >0. Dinamik attribute alanları
  backend-şekilli kurallarla (`validateAttributeValue`) ayrı doğrulanır; ikisi `createProductFormResolver` (zodResolver
  core + attribute döngüsü) ile birleştirilir → başarıda ham değerler döner (attributes/images strip edilmez). Çekirdek
  alan davranışı KORUNDU. UI kit `Input/Select/Textarea` `forwardRef`'e çevrildi (RHF `register` ref bağlar; additive,
  mevcut kullanımlar bozulmadı).
- **Kategori-güdümlü attribute.** Ana kategori (primaryCategoryId) attribute ŞEMASINI sürer — backend değer doğrulaması
  da primaryCategoryId + CategoryAttribute bağına göre yapıldığından UI aynı otoriteyi izler. `useCategoryAttributes`
  hook'u self-describing-OLMAYAN CategoryAttribute + AttributeDefinition + AttributeOption + AttributeGroup uçlarını
  çekip client-side join eder. Sıralama displayOrder ASC → name ASC; gruplar AttributeGroup.sortOrder (grupsuz "General
  attributes" kovası önce). Yalnız ürün-seviyesi (variantDefining=false) + ACTIVE attribute'lar. **Memoization** (md.13):
  kategori-bağımsız veriler (tanım/grup/seçenek) tek sefer, kategori-attribute join'i kategori başına cache → kategori
  değişmezse yeniden istek YOK.
- **Dinamik renderer.** `attributes/attribute-section.tsx` (grup kartları + RHF Controller) + `attribute-field.tsx`
  dataType→"widget kind"→bileşen **registry** deseni (switch-case cehennemi YOK). 13 tip: TEXT/URL→input, TEXTAREA/
  RICH_TEXT→textarea (zengin editör YOK, TD), INTEGER/DECIMAL→number, BOOLEAN→checkbox, DATE→date, SELECT→select,
  COLOR→swatch chip'ler, MULTI_SELECT→checkbox listesi, IMAGE/FILE→MediaUpload single. Grup başlığı + zorunlu/opsiyonel
  işareti + validationRules (min/max/minLength/maxLength/pattern/step/placeholder/helperText; desteklenmeyen kural
  sessizce yok sayılır) + alan-seviyesi hata.
- **Round-trip.** Düzenlemede yeni BFF GET `app/api/catalog/products/[productId]/attribute-values` +
  `storeApi.getProductAttributeValues` mevcut ProductAttributeValue'ları form haritasına doldurur (`buildAttributeValueMap`);
  kayıpsız (read→form→input). Kategori değişince taze boş şema (eski kategori değerleri sızmaz).
- **Save.** Gömülü `attributeValues` (product create/update payload; attributeValueService'ten geçer — tek yazma
  otoritesi) Faz 2A replace-set formatında (`attributeValuesToInputs`). YALNIZ kategori attribute tanımlıysa gönderilir;
  aksi halde `undefined` → **legacy ürünler bozulmaz** (md.12). BOOLEAN her zaman gönderilir (false anlamlı); metin/
  sayı/tarih/seçenek/medya boşsa atlanır; DATE yyyy-mm-dd→ISO; MULTI_SELECT dedupe.
- **Sunucu hata → alan (md.11).** Gömülü create/update akışı artık `error.details.attributeDefinitionId` taşır
  (`server.ts` iki nokta; dedike PUT ucuyla tutarlı bilgi). store-admin `UiError` + `call()` bunu okur; form catch'i
  attribute kodunu (ATTRIBUTE_OPTION_INVALID / REQUIRED_MISSING / NOT_IN_CATEGORY / VALUE_TYPE_MISMATCH ...) ilgili
  alana `setError` ile bağlar; aksi halde genel Alert (`messageForError`). Client-side doğrulama zaten çoğu vakayı
  submit ÖNCESİ yakalar.
- **api-client.** `AttributeDataType` / `ProductAttributeValueInput` / `ProductAttributeValueResponse` type re-export
  (apps yalnız api-client kanalını kullanır). Runtime değişiklik yok.
- **i18n.** `storeAdmin.products.attributes` (tr+en): grup/loading/error/required-optional + validation şablonları
  ({value}) + serverErrors kod→mesaj.
- **Testler.** store-admin `products-form-attributes.test.tsx` **8** (kategori-değişince fetch + gruplu/sıralı render /
  required / validationRules minLength / save payload Faz 2A / edit round-trip / boş-legacy kategori attributeValues
  göndermez / sunucu hata alan-eşleme / memoization tek-fetch) + `attribute-value-mapping.test.ts` **12** (tip matrisi /
  round-trip / required+rules/URL / parseValidationRules / server-error tanıma). Mevcut `products-form-primary-category`
  + `products-form-gallery` stub eklenerek aynen yeşil. Regresyon: store-admin **255/255**, api-gateway **747/747**,
  api-client **23/23**, contracts **93/93**.
- **Gate.** db:generate + build (contracts/utils/api-client) + typecheck (değişen paketler TEMİZ) + lint temiz +
  `next build` store-admin OK (/products, /products/[id] derlendi). storefront `checkout-form-render.test.tsx` tsc
  hatası ÖNCEDEN mevcut (Faz 2A entry'de not edildi; CartLineView alanları önceki fazlardan, fixture güncellenmemiş) —
  benim değişikliğimle alakasız, "dokunma" listesindeki storefront/checkout alanı, DOKUNULMADI (TECH_DEBT'e taşındı).
- **Kalan.** Docker rebuild + prod-benzeri auth'lu runtime smoke (canlı attribute'lu ürün oluştur/düzenle round-trip).
  Faz 2C (varyant kombinasyon motoru / `combinationKey` / SKU matris) ayrı iş.

## 2026-07-17 — Faz 2C-1: Varyant motoru TEMELI + varyant attribute seçimi (ADR-070, TODO-147)

- **Kapsam.** Variant Engine'in YALNIZ veri modelini + admin seçim ekranını kurmak. **KESİNLİKLE varyant/kombinasyon
  ÜRETİLMEZ**: ProductVariant, Cartesian, `combinationKey`, SKU matris, bulk edit, varyant görselleri, storefront/search/
  inventory/order snapshot KAPSAM DIŞI. Admin bir üründe hangi attribute'ların "variant defining" olacağını ve her eksende
  hangi option'ların kullanılacağını seçer; bu ürün-seviyesi bir "reçetedir" (gelecekteki Combination Engine tüketecek).
- **Veri modeli (JSON YOK, normalize).** İki additive tablo (Faz 2A değer katmanının kardeşi): `ProductVariantAttribute`
  (üründe EKSEN olarak seçilen variantDefining attribute; `@@unique([productId, attributeDefinitionId])` = aynı attribute iki
  kez seçilemez, `position`, storeId denormalize; FK `attributeDefinitionId → Restrict` katalog usage-guard, product/store →
  Cascade) + `ProductVariantOptionSelection` (eksen altında kapsanan `AttributeOption`; `@@unique([productVariantAttributeId,
  optionId])`, `position`, `optionId → Restrict`, parent/store → Cascade). `ProductVariant.optionValues Json?` (legacy)
  DOKUNULMADI — yeni akış onu kullanmaz. Migration `20260717120000_add_product_variant_selection` TAMAMEN ADDITIVE
  (`migrate diff --from-empty` çıktısıyla index/FK adları birebir; Prisma 63-char kırpma `..._productVariantAttributeId_opt_key`).
- **variantSelectionService (tek yazma otoritesi).** `apps/api-gateway/src/variant-selections/{data,service,routes}.ts` — Faz 2A
  `attributeValueService` deseni: prepare(read-only, ürün OLUŞTURULMADAN önce doğrular) + persist(replace-set, tek transaction).
  STABIL kodlarla doğrular (zod refine DEĞİL): tenant izolasyonu (STORE tanımı/seçeneği başka mağazadan olamaz; PLATFORM her
  mağazada), attribute mevcut/archived, `primaryCategoryId` + CategoryAttribute bağı, **variantDefining=true**, **option-tabanlı
  (SELECT/COLOR)** — varyant ekseni tek-seçimli olmalı (VariantAttributeValue tek option taşır); MULTI_SELECT/metin/sayı eksen
  OLAMAZ (`VARIANT_ATTRIBUTE_NOT_OPTION_BASED`), duplicate (`VARIANT_ATTRIBUTE_DUPLICATE`), her eksende **≥1 option**
  (`VARIANT_OPTION_REQUIRED`), option attribute/tenant/archived (+ dedupe).
- **API.** Gömülü opsiyonel `variantSelections` (product create/update; `undefined`=eski davranış/legacy korunur, `[]`=temizle) —
  route destructure eder, service'e verir, ürün oluştuktan sonra persist eder (create'te önce-doğrula, geçersizse hiç yazılmaz).
  Dedike `GET/PUT /stores/:storeId/products/:productId/variant-selections`. contracts (`productVariantSelectionInputSchema`/
  `Schema`/replace/list) + api-client (`admin.products.variantSelections.{get,replace}` + tipler). Mevcut Product API /
  `ProductVariant` / `optionValues` semantiği DEĞİŞMEDİ (yanıt şeması aynı; seçim ayrı uçtan okunur).
- **UI (dinamik form uyumlu).** store-admin ürün formuna "Variant Attributes" bölümü. `variant-attributes/{types,use-variant-
  attributes,variant-selection-mapping,variant-attribute-section}.ts(x)`. `useVariantAttributes` mevcut `useCategoryAttributes`'ın
  aynası: aynı uçlardan variantDefining=true + option-tabanlı + ACTIVE attribute'ları çözer (memoized). `VariantAttributeSection`:
  her eksen bir checkbox; seçince option checkbox'ları görünür (COLOR'da swatch); archived option UI'da gizli. Form state
  `variantSelections: Record<attributeDefinitionId, {enabled, optionIds}>`; enabled-eksende ≥1 option client-side (submit öncesi);
  server hatası `error.details.attributeDefinitionId` ile eksene bağlanır. Kategori variantDefining option-tabanlı attribute
  tanımlamamışsa bölüm gizli + payload `undefined` (legacy korunur). Yeni BFF GET `.../variant-selections`. i18n tr+en.
- **Testler.** api-gateway `variant-selections.test.ts` **24** (in-memory DI; seçim/duplicate/≥1-option/archived/invalid/variant-
  defining/option-tabanlı/kategori-bağı/kategori-yok/dedupe/replace-set/tenant + route PUT→GET round-trip/[]-temizle/400-stable-
  code/404/403; + deterministiklik/idempotency/1000-option stress kalite kapıları) + contracts `variant-selection-contracts.test.ts` **8** + store-admin `products-form-variant-attributes.test.tsx`
  **7** (filtre render/option reveal+archived-gizle/save payload/≥1-option blok/legacy/edit round-trip/server hata) +
  `variant-selection-mapping.test.ts` **7** + db `variant-selection-migration.test.ts` **8** (additive/Restrict/Cascade/JSON-yok).
  Mevcut `products-form-attributes.test.tsx` iki assertion güncellendi (listCategoryAttributes artık 2 tüketici → kategori başına
  2 çağrı; memoization = re-select refetch YOK korunur). Regresyon: store-admin **269/269**, api-gateway **771/771**, api-client
  **23/23**, contracts **101/101**, db **16/16**.
- **Gate.** db:generate + build (contracts/api-client dist) + typecheck (değişen paketler TEMİZ; storefront `checkout-form-render`
  tsc hatası ÖNCEDEN mevcut — TD-040, dokunulmadı) + lint (yeni + değişen dosyalar temiz) + `next build` store-admin OK
  (/products, /products/[id] + yeni variant-selections BFF derlendi).
- **Kalan.** Docker rebuild + prod-benzeri auth'lu runtime smoke (canlı variantDefining attribute'lu ürün + eksen/option seçimi
  round-trip). **Faz 2C-2 (Combination Engine: Cartesian → `combinationKey` → `ProductVariant` + SKU matris) AYRI iş.**

## 2026-07-17 — Faz 2C-2: Deterministik Combination Engine + kombinasyon önizlemesi (ADR-071, TODO-148)

- **Kapsam.** Faz 2C-1 eksen reçetesinden (`ProductVariantAttribute` × `ProductVariantOptionSelection`) **oluşacak varyant
  kombinasyonlarının ÖNİZLEMESİNİ** üreten **tamamen SAF** motor + salt-okunur önizleme ucu/ekranı. **KESİNLİKLE kombinasyon
  YAZILMAZ**: ProductVariant, SKU, barcode, price, inventory, bulk edit, varyant görselleri, storefront/search/marketplace,
  order snapshot KAPSAM DIŞI. `combinationKey` üretilir ama **DB'ye YAZILMAZ** (kalıcılığı Faz 2C-3). Şema DEĞİŞMEDİ (migration YOK).
- **Saf motor** (`apps/api-gateway/src/variant-combinations/engine.ts`). `generateVariantCombinations(axes, {maxCombinations})`
  yalnız input → output; Prisma/DB/transaction/network/logger/`process.env`/`Date`/`Math.random` YOK; girdiyi mutasyona uğratmaz.
  **Deterministik + idempotent.** **Canonical ordering:** eksen `position ASC → attributeDefinitionId ASC`, option `position ASC →
  optionId ASC` — karışık girdi ve farklı position aynı çıktıyı verir. **Duplicate önleme:** duplicate option tekilleştirilir,
  duplicate axis option-union'lanır. Archived option elenir, empty axis düşürülür, hiç eksen yoksa 0 kombinasyon (boş çarpım = 1
  REDDEDİLDİ). **Cartesian:** iteratif odometer (`O(k)` çalışma-belleği; son eksen en hızlı döner).
- **`combinationKey` + `previewId`.** Key `v1|<attrId>:<optId>|...` — ID-tabanlı (rename/position bağımsız stabil kimlik),
  segmentler attrId'ye göre sıralı, cuid'ler ayraç çakışmaz, sürüm ön eki format evrimine izin verir; **DB'ye yazılmaz**. previewId
  `pv_<cyrb53(key)>` deterministik (random DEĞİL — React key/snapshot/idempotency için). Big-O: zaman `O(P·k)` (P=Cartesian
  büyüklüğü, k=eksen), bellek `O(P·k)` çıktı + `O(k)` çalışma. Guard P'yi sınırladığından streaming GEREKMEZ.
- **Runtime guard.** `MAX_PREVIEW_COMBINATIONS` (packages/config `optionalNumberEnv` default **1000**; magic number DEĞİL,
  TD-036 boş-string toleranslı). Cartesian büyüklüğü **materialize edilmeden önce** hesaplanır; aşımda stabil `PREVIEW_LIMIT_EXCEEDED`
  + `{totalCombinations, limit}` (route **422**).
- **API + UI.** Salt-okunur `GET /stores/:id/products/:id/variant-combinations/preview` (WRITE YOK; legacy variant-selections +
  `ProductVariant`/`optionValues` DEĞİŞMEDİ). contracts `variantCombinationPreview*` + api-client `admin.products.variantCombinations.
  preview` + store-admin Next BFF proxy. store-admin ürün formuna salt-okunur **"Oluşacak Kombinasyonlar"** paneli
  (`useVariantCombinationPreview` + `CombinationPreview`); yalnız düzenleme modu + kategori varyant-defining eksen tanımladıysa;
  kaydedilmiş reçeteyi yansıtır (her kaydetmede yeniden çeker). DÜZENLEME YOK. i18n tr+en.
- **Testler.** api-gateway `variant-combinations.test.ts` **31** (saf motor: tek/çok eksen, 2×10=100, 3-eksen=100, 5-eksen=1024,
  canonical ordering, determinizm/idempotency/input-order-bağımsızlık, duplicate option/axis, archived, empty axis, combinationKey
  format/stabilite, previewId determinizm/benzersizlik, guard limit; service: tenant/boş/archived; route: 200/404/422/403), store-admin
  `combination-preview.test.tsx` **7** (liste/sayı, null→optionId, guard uyarı, hata, spinner, 0→render-yok, veri-yok→render-yok).
  Mevcut `products-form-variant-attributes.test.tsx` mock'una `getVariantCombinationPreview` eklendi. Regresyon: store-admin
  **269/269**, api-gateway **802/802**, contracts **101/101**, config **24/24**, i18n **47/47**.
- **Gate.** db:generate + build (contracts/config/i18n/api-client dist) + typecheck (api-gateway tsc + store-admin tsc TEMİZ) + tüm
  testler yeşil. Migration YOK.
- **Kalan.** Docker rebuild + prod-benzeri auth'lu runtime smoke (canlı eksen reçeteli üründe preview). **Faz 2C-3 (kalıcı
  `ProductVariant` + SKU matris; `combinationKey` DB'ye yazımı) AYRI iş.**

## 2026-07-18 — Faz 2C-3: ProductVariant persistence + incremental diff motoru (ADR-072, TODO-149)

- **Kapsam.** Faz 2C-2 SAF Combination Engine'inden (`combinationKey` üretir, DB'ye YAZMAZ) **kalıcı `ProductVariant` üretimi**:
  kaydedilmiş eksen reçetesinden hedef kombinasyonlar üretilir ve mevcut varyantlarla **diff'lenir** → create/keep/restore/archive.
  Deterministik · idempotent · transaction-safe · concurrency-safe · tenant-safe · tekrar-çalıştırılabilir. Combination Engine
  (`engine.ts`) DEĞİŞMEDİ. **SKU Matrix DEĞİL** (fiyat/stok/barcode/inline düzenleme YOK).
- **Veri modeli (additive).** `ProductVariant` + `generationSource VariantGenerationSource @default(MANUAL)` (yeni enum:
  MANUAL | ATTRIBUTE_COMBINATION) + `combinationKey String?` + `archivedAt DateTime?`; `@@unique([productId, combinationKey])`
  (Postgres NULL-distinct: manuel null'lar çakışmaz, üretilmiş non-null key tek). Yeni tablo **`ProductVariantOptionValue`**
  (variantId, attributeDefinitionId, optionId; `@@unique([variantId, attributeDefinitionId])`) — üretilmiş varyantın normalize
  eksen→option seçimi (2A `VariantAttributeValue`'dan AYRI: single-writer invariantı karışmasın; `optionValues` JSON authoritative DEĞİL).
- **Diff motoru (saf).** `diff-engine.ts` Prisma/DB/Date/random BİLMEZ, girdiyi mutasyona uğratmaz; **Map/Set tabanlı ~O(P+E)**
  (nested O(P×E) YOK); `{toCreate, toKeep, toRestore, toArchive, manualVariants}`, `combinationKey` sırasında deterministik.
  Manuel varyantlar hiçbir gruba karışmaz (izolasyon).
- **Semantik.** create=yeni hedef → DRAFT + deterministik SKU (`V-<productId>-<hash(combinationKey)>`; random/timestamp YOK) +
  normalize selection; keep=**write YOK** (idempotent; `updatedAt` sabit); restore=aynı ID/SKU/price, yalnız `status=DRAFT`+`archivedAt=null`;
  archive=`status=ARCHIVED`+`archivedAt=now` (hard-delete YASAK; storefront ARCHIVED'ı zaten dışlar → storefront kodu değişmez).
  Yeni varyant: InventoryItem OLUŞTURULMAZ (görev kuralı; ilişki nullable), price-audit yazılmaz.
- **Transaction + concurrency.** Tüm üretim tek `prisma.$transaction`; başında **advisory xact lock**
  (`pg_advisory_xact_lock(hashtext(productId))`) + DB unique `(productId, combinationKey)` → yarışta duplicate P2002 → kontrollü
  `VARIANT_GENERATION_CONFLICT` (409).
- **API + UI.** `POST /stores/:id/products/:id/variant-combinations/generate` (gövdesiz; kaynak DB reçetesi). Yanıt
  `{totalTarget, created, kept, restored, archived, manualVariantsUntouched, variants[]}`. Stabil hatalar: PRODUCT_NOT_FOUND(404),
  VARIANT_SELECTION_EMPTY / INVALID_VARIANT_SELECTION / PREVIEW_LIMIT_EXCEEDED / ATTRIBUTE_OPTION_NOT_FOUND(422),
  VARIANT_GENERATION_CONFLICT(409). contracts `variantGenerationResponseSchema` + api-client `admin.products.variantCombinations.generate`
  + store-admin Next BFF proxy. Ürün formuna **"Varyantları Oluştur"** aksiyonu + sonuç özeti (yalnız düzenleme + eksen varsa görünür;
  preview limiti/loading'de pasif); başarıda önizleme yeniden çekilir. i18n tr+en. Preview ucu (GET) BOZULMAZ.
- **Boş reçete.** Eksen yoksa `VARIANT_SELECTION_EMPTY` (sessiz archive YOK); tüm option'lar archived → `INVALID_VARIANT_SELECTION`.
- **Backfill YOK.** Legacy `optionValues` JSON'dan combinationKey tahmini YAPILMADI (TD kaydı: [[legacy-optionvalues-backfill]]).
- **Testler.** api-gateway `variant-generation.test.ts` **36** (saf diff: empty/same/create/archive/restore/mixed, input-order
  bağımsızlık, duplicate detection, manuel exclusion, deterministik, mutation-yok; service: first/idempotent/option-add/remove/restore/
  axis-add/remove/rename-no-regen/position-no-regen/SKU+price korunum/empty/limit/archived-option/invalid-option/tenant/manuel-untouched/
  unique-conflict/deterministik-SKU; route: 200/idempotent/422×2/404/403). contracts `variant-generation-contracts.test.ts` **3**,
  store-admin `generate-variants-action.test.tsx` **9** (görünürlük/disabled/loading/özet/hata/tıklama/i18n tr+en). Regresyon:
  api-gateway **838/838**, contracts **104/104**, store-admin **285/285**, api-client **23/23**, db **16/16**.
- **Gate.** Prisma format+validate+generate + migration SQL (Prisma diff ile isim doğrulaması) + typecheck (api-gateway + store-admin
  tsc TEMİZ) + lint TEMİZ + build (api-gateway tsc + store-admin Next) + `git diff --check` temiz. Migration additive.
- **Kalan.** Docker rebuild + `migrate deploy` + prod-benzeri auth'lu runtime smoke (2×2 ilk üretim → tekrar → option ekle/kaldır →
  restore → SKU/fiyat/manuel korunum → storefront/checkout/inventory regresyon). **Gerçek-PG concurrency integration testi** repo
  test altyapısında yok (in-memory fake + unique-conflict testi ile kanıtlandı) → TD kaydı. **Faz 2C-4 (SKU Matrix) AYRI iş.**

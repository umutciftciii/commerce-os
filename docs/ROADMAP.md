# Roadmap

## Faz 0 Backend Foundation

- Durum: READY_FOR_COMMIT
- Amac: Backend runtime, veri tabani, kuyruk, health ve seed foundation'ini calisir hale getirmek.
- Kapsam: Monorepo, API gateway, worker, PostgreSQL, Redis, Prisma migration, idempotent seed,
  health endpointleri, lint/typecheck/test/build kontrolleri.
- Kabul kriterleri: Docker runtime healthy; migration gecer; seed iki kez idempotent gecer;
  seed verify gecer; public/internal health endpointleri beklenen cevaplari verir;
  lint/typecheck/test/build basarili olur; docs kapanisi tamamlanir.

## UI Foundation (faz-disi on hazirlik)

- Durum: DONE
- Amac: Backend foundation uzerine frontend shell kurmak (commerce feature olmadan).
- Kapsam: `apps/admin-web`, `apps/store-admin-web`, `apps/storefront-web` Next.js App Router shell'leri;
  `packages/ui` design system; `packages/api-client` placeholder; ortak Tailwind preset; design-first
  kurali. Tum sayfalar placeholder/empty state.
- Not: Gercek veri, auth ve aksiyonlar ilgili fazlarda (Faz 1/2/3/4) baglanacak.

## Faz 1 Multi-Tenant Foundation

- Durum: PLANNED
- Amac: Tenant secimi, tenant guard, rol/permission modeli ve store-scoped API desenlerini gercek
  endpointlere tasimak.
- Kapsam: Auth/session taslagi, tenant context cozumleme, platform/store kullanici ayrimi,
  permission enforcement, audit/event kayit desenleri.
- Kabul kriterleri: Store-scoped endpointler tenant isolation uygular; platform endpointleri store
  operasyonlarindan ayrilir; permission karar noktalarinin testleri vardir; docs guncellenir.

## Faz 2 Commerce Core

- Durum: IN_PROGRESS (Faz 2A backend foundation + Faz 2B store-admin UI baglama + Faz 2C order core + Faz 2D product sales model + Faz 2E runtime TR/EN language switch eklendi)
- Amac: Ticaret cekirdegini erken parcalamadan urun, stok, musteri ve siparis modellerini kurmak.
- Kapsam: Product/catalog, inventory, customer, order, basic pricing ve order status akislari.
- Kabul kriterleri: Commerce modelleri migration ile gelir; temel CRUD/API akislari testlidir;
  tenant isolation commerce endpointlerinde uygulanir; servis sinirlari guncellenir.

### Faz 2A Catalog + Inventory Foundation

- Durum: FINAL_GATE_PENDING
- Kapsam: Product/category/variant/inventory modelleri, store-scoped catalog API, manual inventory
  adjustment, movement ledger, audit log, contracts/api-client ve idempotent demo catalog seed'i.
- Kapsam disi: store-admin UI baglama, order/reservation, cart/checkout/payment/shipping,
  marketplace sync, media/options/import/export ve storefront resolver.

### Faz 2B Store Admin Catalog UI Baglama

- Durum: FINAL_GATE_PENDING
- Kapsam: `apps/store-admin-web` dashboard/categories/products/variants/inventory ekranlarini Faz 2A
  endpointlerine canli bagladi. Guvenli BFF (admin-web deseni): platform admin login -> httpOnly
  cookie -> ayni-origin `/api/*` proxy + server-side store context cozumleme; CSRF korumali mutating
  route'lar; TL<->minor unit fiyat donusumu; tum hata kodlari Turkce i18n esleme; tr/en parity.
- Kapsam disi: backend catalog/inventory davranisi degisikligi, order/checkout/payment/shipping,
  storefront resolver, marketplace, media/options/import, delete endpointleri, store-user auth
  (gecici platform-admin store context ile calisir — bkz. ADR-023, TD-019).

### Faz 2C Order / Reservation Core

- Durum: IMPLEMENTED_GATE_PENDING
- Kapsam: Customer/CustomerAddress foundation, Order/OrderLine/OrderAddress/OrderEvent,
  InventoryReservation ve OrderNumberCounter modelleri; store-scoped order list/create/get/update,
  line add/update, place ve cancel endpointleri; price snapshot, minor-unit total hesaplama,
  PostgreSQL row-level lock ile reservation, audit/order event, contracts/api-client ve cleanup-smoke
  genisletmesi.
- Kapsam disi: store-admin orders UI, storefront checkout, payment provider, shipping/fulfillment,
  invoice, cart, notification, refund/return, marketplace ve production deploy.

### Faz 2D Product Sales Model Foundation

- Durum: IMPLEMENTED_GATE_PENDING
- Kapsam: Product sales model karar ve backend foundation'i: `ONLINE`, `INQUIRY`, `APPOINTMENT`,
  `WHATSAPP`, `CATALOG_ONLY`; price visibility ve CTA behavior kurallari; product create/update/list/get
  contract/API response genisletmesi; order create/add-line/place purchasability guard.
- Kapsam disi: Store-admin UI form baglama, storefront CTA render, inquiry/appointment modelleri,
  WhatsApp store contact config, checkout/payment/shipping/marketplace.

### Faz 2E Runtime Language Switch

- Durum: IMPLEMENTED_GATE_PENDING
- Kapsam: TR/EN runtime language switch, `commerce_os_locale` cookie ve admin-web, store-admin-web,
  storefront-web entegrasyonu. `packages/i18n` locale yardimcilari, `packages/ui`
  `LocaleProvider`/`useLocale`/`LanguageSwitcher`; varsayilan TR + TR fallback + key parity korundu
  (bkz. ADR-026).
- Kapsam disi: Kullanici/DB locale tercihi, URL locale prefix, tarayici dil tespiti (TD-028,
  TODO-044/045).

### Faz 2F Store-admin Product Sales Model UI

- Durum: IMPLEMENTED_GATE_PENDING
- Kapsam: F2D product sales model alanlari store-admin urun listesi ve create/update formuna
  baglandi; sales mode / price visibility / primary action / purchasable liste rozetleri,
  formda "Satis davranisi" bolumu, sales mode degisiminde guvenli default uygulama, client-side
  min/max adet + uzunluk validasyonu ve backend guard hatalarinin (PRODUCT_NOT_PURCHASABLE vb.)
  TR/EN lokalize gosterimi. BFF body pass-through ile yeni alanlar gateway'e tasinir.
- Kapsam disi: Storefront CTA render, inquiry/appointment kayit modelleri, WhatsApp redirect
  endpoint, store-admin orders UI.

### Faz 2G Store Admin Orders UI

- Durum: IMPLEMENTED_GATE_PENDING
- Kapsam: F2C order list/detail/lifecycle store-admin BFF + UI ekranlarina baglandi. `/orders`
  canli API'den listelenir; sipariş no, müşteri, toplam, order/payment/fulfillment durum rozetleri
  ve kalem adedi gösterilir. Detay modal kalemleri, tutar özetini (subtotal/discount/shipping/tax/
  total), adresleri, stok rezervasyonlarini ve sipariş geçmişini (events) gösterir. DRAFT sipariş
  "Siparişi ver" (place), PLACED/CONFIRMED sipariş "İptal et" (cancel) ile yönetilir; CANCELLED/
  FULFILLED siparişlerde aksiyon gizlenir. Lean "Yeni taslak sipariş" modali stoklu varyantlardan
  kalem seçerek draft order oluşturur. Yeni BFF route'lari: `/api/orders`, `/api/orders/[id]`,
  `/api/orders/[id]/place`, `/api/orders/[id]/cancel` (mutating'lerde CSRF zorunlu, store context
  server-side, token client'a sizmaz). TR/EN order copy + lifecycle hata kodlari lokalize.
- Kapsam disi: Storefront checkout/cart, payment provider, shipping/fulfillment implementasyonu,
  invoice/refund/return, marketplace, placed-order satir düzenleme, e-posta bildirimi.

## Faz 3 Storefront + Theme Foundation

- Durum: PLANNED
- Amac: Magaza vitrini ve tema foundation'ini kurmak.
- Kapsam: Storefront app, tema konfigrasyonu, domain routing taslagi, public catalog okuma akislari.
- Kabul kriterleri: Demo store public storefront uzerinden gorunur; tema ayarlari tenant'a baglidir;
  admin/storefront ayrimi dokumante edilir.

## Faz 4 Checkout/Payment

- Durum: PLANNED
- Amac: Sepet, checkout ve odeme servis foundation'ini kurmak.
- Kapsam: Cart, checkout session, payment provider abstraction, siparis olusturma baglantisi.
- Kabul kriterleri: Checkout akisi test ortaminda tamamlanir; odeme provider detaylari izole edilir;
  basarisiz odeme ve retry durumlari dokumante edilir.

## Faz 5 Shipping/Invoice Foundation

- Durum: PLANNED
- Amac: Kargo ve fatura entegrasyonlari icin foundation olusturmak.
- Kapsam: Shipment, carrier abstraction, invoice abstraction, belge/event kayitlari.
- Kabul kriterleri: Siparise bagli kargo ve fatura durumlari izlenir; provider bagimliligi servis
  sinirlari icinde kalir; hata durumlari testlidir.

## Faz 6 Marketplace Integration

- Durum: PLANNED
- Amac: Turkiye pazaryerleri icin entegrasyon altyapisini ve ilk connector desenlerini kurmak.
- Kapsam: Integration service genisletmesi, connector SDK, credential isolation, product/order sync,
  job scheduling.
- Kabul kriterleri: En az bir pazaryeri connector'u sandbox/fake provider ile dogrulanir; sync
  joblari idempotenttir; secret ve credential kurallari dokumante edilir.

## Faz 7 Growth Assistant v1

- Durum: PLANNED
- Amac: Operasyonel veriden aksiyon onerileri ureten ilk buyume asistani surumunu hazirlamak.
- Kapsam: Basit insight modeli, raporlama girdileri, aksiyon listeleri, admin yuzeyine hazir API.
- Kabul kriterleri: Asistan onerileri kaynak veriye baglanir; kararlar trace edilebilir; MVP disi AI
  genisletmeleri teknik borc veya roadmap olarak ayrilir.

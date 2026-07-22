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

## Test/Demo Altyapısı — Enterprise Demo Commerce Dataset (TODO-157)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı)
- Amac: Search, autocomplete, dynamic facet, campaign projection, variant filtering ve inventory
  state'lerini gerçekçi ölçekte (Türkiye e-ticaret dağılımı) test edecek deterministik demo veri seti.
- Kapsam: `enterprise-demo` store scope'unda (production `demo-store` izole) deterministik üretici +
  idempotent persistans + invariant doğrulama + runbook. 37 kategori · 66 marka · 471 ürün · 2.202 varyant ·
  25 attribute · 14 kampanya · 2 depo. Search read-model `search:backfill` ile beslenir.
- Kabul kriterleri: iki kez seed idempotent (birebir); duplicate SKU/slug yok; orphan yok; envanter/fiyat/
  kampanya invariant'ları geçer; search/facet/autocomplete/campaign-badge canlı sorgularla doğrulanır;
  demo-store dokunulmaz. Karar ADR-085; sınırlar TD-066/TD-067. Bkz. `docs/runbooks/enterprise-demo-dataset.md`.

## Storefront CMS — Home Experience Platform (TODO-158A)

- Amaç: Storefront ana sayfasındaki hardcoded içerikleri kaldırıp yönetilebilir, genişleyebilir bir "Home
  Experience" temeli kurmak. Hero, Featured Categories ve Product Showcase bölümleri store-admin'den yönetilir;
  section sırası DB'den gelir. Mimari ileride Banner/RichContent/CampaignBlock/BrandShowcase/Video/Collection/HTML
  tiplerini MIGRATION'SIZ destekleyecek şekilde kurulur (polimorfik `HomeSection`: String type + JSON config).
- Kapsam: Yeni modeller (`HomePage`/`HomeSection`/`HomeHeroSlide`/`HomeFeaturedCategory`/`HomeShowcaseProduct`;
  additive migration). Gateway admin section CRUD + tip-özel çocuk uçları + MANUAL/DYNAMIC showcase motoru (6 kural:
  NEW_PRODUCTS/CAMPAIGN/CATEGORY/BRAND/ATTRIBUTE/IN_STOCK). Tek sunucu-composed public uç `GET /public/stores/:slug/home`
  (Server Component uyumlu, no-store). Store-admin "Ana Sayfa Deneyimi" modülü (CRUD + yukarı/aşağı sıralama).
  Storefront ana sayfası tümüyle yeni API'dan beslenir (hardcoded mock KALDIRILDI). Kart yoğunluğu iyileştirmesi.
- Kabul kriterleri: migration additive + geriye-uyumlu (mevcut hero/`/hero-slides` KORUNUR); public /home yalnız
  enabled + yayın-penceresi geçerli içeriği döner (allowlist, iç alan sızmaz); showcase ürünleri `/products` ile aynı
  projeksiyon; enterprise seed 3 hero + 6 featured + 6 showcase ekler. Karar ADR-086; sınırlar TD-074…TD-079.

## Enterprise Theme Engine & Design Token Architecture (TODO-158B)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı)
- Amaç: Storefront'un görsel kimliğini (renk/tipografi/köşe/gölge/motion/layout) koddan tamamen ayırıp
  tenant-bazlı, versiyonlu, yönetilebilir bir Design System mimarisi kurmak (Shopify Theme Editor / Figma
  Variables / Material Design 3 Tokens benzeri). Katmanlar: Design Token → Semantic Token → Component Token →
  CSS Variable → Rendered UI. Component asla doğrudan HEX/Tailwind değeri bilmez.
- Kapsam: Yeni `@commerce-os/theme` çekirdek paketi (versiyonlu Zod belge şeması + token resolver + CSS
  Variable motoru + 10 preset + variant kataloğu + custom-CSS sanitize + import/export; 99 birim test). Yeni
  `Theme`/`ThemeVersion` modelleri (additive migration; store başına tek PUBLISHED; publish yeni immutable
  versiyon; rollback). Gateway theme servisi (CRUD+versiyon+publish/rollback+import/export+önizleme+preset) +
  public `GET /public/stores/:slug/theme` (sunucu-çözülmüş CSS, allowlist). Storefront layout `<style>`
  enjeksiyonu (mevcut token-tabanlı bileşenler otomatik yeniden temalanır; varsayılan tema = globals.css
  paritesi → geriye-uyumlu). Store-admin Theme Studio (preset seç → düzenle → istemci-tarafı canlı önizleme →
  yayınla; import/export; rollback). Enterprise seed 11 tema (1 published + 10 preset).
- Kabul kriterleri: migration additive + geriye-uyumlu (temasız mağaza vitrini AYNEN çalışır); token belge
  şeması JSONB'de (yeni token = migration'sız); tenant izolasyonu korunur; Search/SEO/CMS/Checkout/Dynamic
  Attributes/Campaign/Inventory/PDP davranışı DEĞİŞMEZ; typecheck/lint/test/build yeşil. Karar ADR-087;
  sınırlar TD-080…TD-086.

## Storefront UX/UI — Enterprise Storefront Experience Redesign Faz 1 (TODO-158C)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Amaç: Storefront'u yalnız görsel değil UX/UI/IA/responsive/a11y/performans açısından enterprise seviyeye
  taşımak; Theme Engine (ADR-087) üzerine, 0 hardcoded design value ile (yalnız token zinciri).
- Kapsam: (1) Medya-üzeri SEMANTIC token katmanı (scrim/on-media/control/overlay + sabit hero yükseklikleri).
  (2) KRİTİK hero yeniden tasarım — aspect-ratio yerine sabit yükseklik (mobil ~256 / tablet ~408 / masaüstü
  ~528px), container-hizalı contained banner, belirgin CTA, modern ok/pagination, LCP-öncelikli görsel.
  (3) Faz 1 Navigation — sticky kondens header, kategori mega-menü (FEATURED_CATEGORIES beslemeli; iş mantığına
  dokunmadan), tokenize announcement/campaign bar, mobil kategori akordeonu, accent aksiyon hover/rozet.
  (4) Faz 2 Homepage — section ritmi/whitespace, tokenize featured overlay, "Tümünü gör" başlıklar, value-props +
  editorial sunum blokları (fallback). (5) Faz 3 Product Card — kompakt/premium, kampanya/indirim/yeni/TÜKENDİ
  rozet sistemi, tokenize wishlist/quick-view/modal, hover; PDP benzer-ürünler token'lı karta taşındı; PLP kartı
  hizalandı. (6) Faz 4 Category — mega menü + PLP CategoryChips navigasyonu + premium featured grid. (7) Faz 5
  Footer — social[MOCK]/legal/ödeme-güven şeridi; responsive/a11y/perf geçişleri.
- Kabul kriterleri: 0 hardcoded design value (token zinciri), search/SEO/checkout/attribute/campaign/inventory/
  order/payment iş mantığı DEĞİŞMEDİ; storefront `next build` PASS + tip geçerli; eslint temiz; 392 storefront +
  47 i18n testi yeşil; canlı headless render (masaüstü/mobil) PASS. Karar ADR-088; sınırlar TD-087…TD-090.
  Sonraki fazlar: adanmış public kategori-nav ucu (TD-088), managed home section tipleri (TD-089), overlay
  token'larının Theme Engine semantic katmanına yayını + store-settings social/payments (TD-090).

## Store Admin — Enterprise Admin Data Grid Foundation (TODO-159A)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Amaç: Liste ekranlarına tek tek geçici pagination eklemek yerine, tüm Store Admin liste yüzeyleri için
  ORTAK bir veri listeleme standardı kurmak (query sözleşmesi + sunucu-otoriter filtreleme + URL state +
  paylaşılan sunum bileşenleri) ve `/products`'ı bu standarda tam taşımak.
- Kapsam: (1) 29 liste yüzeyinin denetimi (`docs/analysis/TODO-159A-admin-data-grid-audit.md`) — "sessiz ilk
  sayfa" defektinin tespiti. (2) Ortak query/pagination sözleşmesi (contracts): `page/pageSize/search/sortBy/
  sortOrder` + modül-başına `sortBy` allowlist'i, sunucu-otoriter `pageSize` tavanı, geriye-uyumlu
  `totalItems/totalPages` meta'sı. (3) Gateway: `listProductsAdmin` (türetilmiş fiyat/stok için tek
  parametreli SQL yolu; N+1 yok) + `products/filter-options`; kategori/müşteri/sipariş uçlarının
  ortaklaştırılması. (4) `components/data-grid/` ailesi — URL state motoru, arama + filtre popover + aktif
  filtre çipleri, yapışkan başlık + `aria-sort` + loading/empty/error, sayfalama çubuğu (25/50/100).
  (5) Ürünler tam uygulama; Kategoriler + Müşteriler taşındı; Siparişler sayfalama/sıralama kazandı.
  (6) Additive index migration (`Product`/`Order` × `storeId,createdAt`).
- Kabul kriterleri: frontend hiçbir ekranda tüm dataset'i çekip `slice/filter/sort` YAPMAZ; geçersiz
  sort/filtre allowlist ile 400 döner; `pageSize` tavanı sunucuda zorlanır; tenant izolasyonu tüm
  sorgularda korunur; mevcut tasarım dili ve Theme Engine yapısı korunur (paralel design system YOK,
  hardcoded renk YOK); mevcut testler bozulmaz. Karar ADR-089; sınırlar TD-091…TD-095.
- Sonraki adımlar: Envanter matrisinin sayfalanabilir sözleşmeye taşınması (TD-091), sayfalamasız koleksiyon
  uçlarının ortak meta'ya geçirilmesi (TD-092), arama tabanlı ürün/kategori seçicisi (TD-093).

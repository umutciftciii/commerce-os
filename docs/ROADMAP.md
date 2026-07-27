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

## Store Admin — Admin Searchable Selectors & Media Library Scalability (TODO-159B)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı). TD-093 + TD-095 KAPANDI.
- Amaç: ADR-089'un liste standardını SEÇİM yüzeylerine genişletmek; büyük kataloglarda eksik sonuç gösteren
  ürün/kategori seçicilerini ve sahte sayfalama meta'sı dönen medya kütüphanesini ölçeklenebilir hâle getirmek.
- Kapsam: (1) 9 seçim yüzeyinin denetimi (`docs/analysis/TODO-159B-admin-selectors-media-audit.md`).
  (2) Seçici query sözleşmesi (contracts): ADR-089 tabanı + `ids` ÇÖZÜM MODU — seçili kayıt arama/sayfa
  dışında kalsa bile getirilir, "seçileni bulmak için tüm kataloğu çek" deseni ortadan kalkar.
  (3) Gateway: `products/selector` + `categories/selector` (hafif projeksiyon, hiyerarşi `path`'i seviye-bazlı
  batched çözüm), liste ile PAYLAŞILAN filtre/sıralama SQL'i. (4) Medya ucunun gerçek sayfalamaya geçişi.
  (5) `components/selector/` ailesi (debounce/sayfa/durumlar + listbox klavye + Escape/odak) ve altı seçim
  yüzeyinin taşınması. (6) Additive index migration (`MediaAsset(storeId, createdAt)`).
- Kabul kriterleri: seçici hiçbir yerde tüm kataloğu istemciye almaz; seçili kayıt arama sonucunda görünmese
  bile gösterilir ve kaldırılabilir; mevcut kayıtlar (kampanya kapsamı, showcase pinleri, öne çıkan
  kategoriler, hero/medya seçimleri, ürün medyası) düzenleme ekranında eksiksiz görünür ve kaydet–yeniden aç
  akışında korunur; `pageSize` tavanı ve sort allowlist'i sunucuda zorlanır; tenant izolasyonu korunur;
  mevcut tasarım dili korunur (paralel design system YOK, hardcoded renk YOK); mevcut testler bozulmaz.
  Karar ADR-090; sınırlar TD-096…TD-098.
- Sonraki adımlar: Envanter matrisinin sayfalanabilir sözleşmeye taşınması (TD-091 — bu fazın kapsamı
  dışındaydı), sayfalamasız koleksiyon uçlarının ortak meta'ya geçirilmesi (TD-092), admin aramasının
  trigram/read-model'e bağlanması (TD-094 + TD-096 + TD-098 aynı ön koşulu paylaşır).

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

## Store Admin — Inventory Matrix Scalability (TODO-159C · ADR-092) — TAMAMLANDI

- Durum: **DONE (commit'e hazır; PR/deploy YAPILMADI).** TD-091 KAPANDI. Analiz:
  `docs/analysis/TODO-159C-inventory-matrix-scalability.md`.
- Sonuç: `GET /stores/:id/inventory/matrix` sunucu-otoriter oldu (ADR-089 Data Grid standardı).
  Query: `page`/`pageSize`(≤100)/`search`/`sortBy`(allowlist)/`sortOrder` + `warehouseId`/`stockStatus`/
  `reserved`/`variantStatus`/`productStatus`. Response: `warehouse` + bir SAYFA `rows` + `pagination` meta'sı
  + sayfadan BAĞIMSIZ `summary`. `listStoreVariants` sınırsız `findMany`'den tek raw SQL CTE taramasına
  (LIMIT/OFFSET + aggregate özet + attribute hidrasyonu; sabit 3 sorgu, N+1 yok) taşındı. Çift otorite
  (ADR-076: default depoda InventoryItem overlay) SQL'de korundu; satır `currentCalc` yine SAF `computeCalc`
  ile (tek gösterim otoritesi). Ekran `useDataGridQuery` + `DataGridToolbar`/`DataGrid`/`DataGridPagination`;
  KPI'lar server `summary`'sinden. Additive `ProductVariant(storeId, status)` indeksi (migration
  `20260723120000`).
- Canlı doğrulama (enterprise-demo, edm-store 2.138 varyant): sayfa taraması 5.7 ms, payload 819 KB → 9.7 KB
  (~84×), filtre↔summary paritesi (LOW_STOCK 187), tenant sızıntısı 0. Bulk: gerçek fan-out yazma EKLENMEDİ
  (ADR-076 korunur); Data Grid seçim altyapısı sonradan gerçek bulk için hazır, "görünen sayfa" vs "filtreye
  uyan tüm kayıtlar" ayrımı ADR-092'de dokümante.
- Ertelenen sınırlar (yeni borç DEĞİL, uygulanmış tasarım sınırı): TD-099 (ürün-facet filtreleri:
  kategori/marka/tedarikçi), TD-100 (stok formülü SQL+JS iki dilde, parite testli).

## Payment — Order Payment Recovery & Collection (TODO-159F · ADR-095…100) — TAMAMLANDI

- Sorun: Sağlayıcı tanımlanmadan / checkout ödeme oturumu üretilemeden oluşmuş geçerli `UNPAID`
  siparişler sonradan tahsil edilemiyordu; sipariş detayında yalnız "henüz ödeme denemesi yok"
  mesajı vardı. Analiz: `docs/analysis/TODO-159F-order-payment-recovery.md`.
- Kapsam: (1) Genişletilmiş `PaymentStatus` durum makinesi (tek otorite `payments/payment-state.ts`).
  (2) Admin tahsilat aksiyonları: ödeme bağlantısı oluştur/yenile/kopyala/e-postala + manuel (offline)
  ödeme kaydı. (3) Opaque token'lı müşteri ödeme sayfası `/pay/:token`. (4) Webhook nihai ödeme
  otoritesi (monotonic geçiş + dedup). (5) Kalan bakiye sunucu-otoritesi (order snapshot).
- Idempotency: sipariş başına tek aktif online link (deterministik `idempotencyKey` + DB unique).
- Kararlar: ADR-095 (state machine), ADR-096 (snapshot tutar otoritesi), ADR-097 (aktif deneme
  idempotency), ADR-098 (manuel vs online), ADR-099 (link token güvenliği), ADR-100 (webhook ordering).
- Migration: `20260723170000_add_order_payment_recovery` (enum genişletme + PaymentAttempt alanları;
  ADDITIVE, backfill yok).
- Ertelenen sınırlar (borç): TD-110 (SMTP teslimatı — dispatcher no-op), TD-111 (gerçek provider canlı
  tahsilat + webhook HMAC), TD-112 (kısmi capture desteklenmiyor).

## Operations — Manual Shipment Status & Fulfillment (TODO-162 · ADR-101) — TAMAMLANDI

- Sorun: Entegre kargo süreci DIŞINDA yönetilen gönderiler `DELIVERED` olamıyor, sipariş "teslim
  edildi" işaretlenemiyordu (fulfillmentStatus kargo durumundan beslenmiyordu).
- Kapsam: Operatör manuel durum ilerletme (`shipments/:id/status`); saf monotonic + terminal-kilit;
  DELIVERED → sipariş FULFILLED; ShipmentEvent MANUAL_STATUS + AuditLog. Migration 20260723180000.
- Karar: ADR-101. Her gönderide operatör override; sağlayıcı sync terminal manuel durumu ezmez.

## Growth & Monetization — Faz Sıralaması ve Ortak Ölçüm Altyapısı

> **🛑 HOTFIX ARASI — TODO-159G Demo Data Safety & Recovery (2026-07-24, ADR-108 / TD-116).**
> 2026-07-23'te yerel enterprise-demo kataloğu elle yıkıcı `prisma db push` sonucu silindi. Growth
> hattının aktif fazı (**TODO-160A**) bu olay süresince **BLOCKED** işaretlendi. Recovery TAMAMLANDI
> (deterministik seed + search backfill, verify 21/21, demo-store korundu) ve seed güvenlik guard'ları
> (env/scope/circuit-breaker/backup) eklendi → **TODO-160A artık UNBLOCKED**, devam edilebilir.

- Konum: Bu iki faz, mevcut core commerce ve operasyon işleri TAMAMLANDIKTAN SONRA, final enterprise
  UI/design polish fazından ÖNCE yer alır.
- Sıra: ~~TODO-159C~~ (DONE) → ~~TODO-159D Customer Lists & Wishlist~~ (DONE) →
  ~~TODO-159E Product Reviews & Ratings~~ (DONE) → ~~TODO-159F Order Payment Recovery & Collection~~
  (DONE — kritik ödeme açığı kapatıldı) → ~~TODO-160 Influencer Tracking & Attribution~~
  (DONE — ADR-102…107; PR #113) → ~~TODO-160A SKU Generation & Governance~~ (DONE) →
  ~~TODO-161 Sponsored Product Management~~ (DONE) → ~~TODO-161A Sponsorship Billing & Settlement~~ (DONE) →
  ~~TODO-161A.2 Unified Sponsorship Commercial Flow~~ (DONE — PR #124) →
  ~~TODO-161A.1 Commercial Automation & Data Retention~~ (DONE — PR #126) →
  ~~BUG-PDP-001 PDP Quantity Unit Price Hotfix~~ (DONE / KOD TAMAM) →
  ~~TODO-161B Recently Viewed & Product Recommendations~~ (KOD TAMAM — commit YOK; ADR-137…143) →
  **Final enterprise UI/design polish (SIRADAKİ AKTİF; henüz numaralandırılmadı)**.
- **TODO-160A konumlandırma:** TODO-160 ile TODO-161 arasına alındı. Katalog kimlik hijyeni (SKU'nun
  varyant-seviyesi tek otorite + deterministik üretim + çakışma yönetimi + governance) bir katalog-veri
  kalitesi işidir; sponsored yerleşim (TODO-161) ürün kimliğinin sağlam olmasından yararlanır. TODO-160'ın
  event/attribution altyapısıyla teknik bağı yoktur; sıralama önceliktir, bağımlılık değil.
- **TODO-159F konumlandırma:** TODO-160'tan ÖNCE araya alındı çünkü sağlayıcı tanımlanmadan oluşmuş
  geçerli `UNPAID` siparişler operasyonel olarak tahsil edilemiyordu (kritik ödeme açığı). Ödeme
  recovery altyapısı (durum makinesi + link + manuel + webhook otoritesi) Growth fazlarından bağımsızdır.
- **Konumlandırma gerekçesi:** TODO-159D ve TODO-159E, Growth & Monetization (attribution/sponsored)
  fazlarından ÖNCE gelir çünkü temel müşteri-alışveriş etkileşimlerini (favori/liste, yorum/puan)
  tamamlarlar; influencer ve sponsored ölçümü daha zengin bir müşteri etkileşim yüzeyi üzerine oturur.
- TODO-161, TODO-160'ın kurduğu event/attribution temelinden yararlanabilmek için ondan SONRA konumlanır.
- **Ortak ölçüm altyapısı notu:** Influencer Tracking & Attribution ile Sponsored Product Management AYNI
  event ve conversion attribution altyapısını yeniden kullanmalıdır. Ortak olabilecek kavramlar:
  `impression` · `click` · `session` · `cart` · `checkout` · `order` · `refund` · `attributed revenue` ·
  `campaign source` · `placement`. **Ancak iki modül tek ürün modeli altında ZORLA BİRLEŞTİRİLMEZ:**
  influencer bir dış kişi/anlaşma ilişkisidir (kimlik, link, ileride komisyon/ödeme); sponsored ürün bir
  yerleşim/merchandising kararıdır (slot, hedefleme, yoğunluk sınırı). Yaşam döngüleri, yetkilendirme ve
  raporlama soruları farklıdır. Paylaşım event/attribution KATMANINDA olur, domain modelinde değil.
  Karar: ADR-091.

## Customer Lifecycle — Customer Lists & Wishlist (TODO-159D · ADR-093)

- Durum: **DONE (tüm katmanlar + gate + canlı doğrulama YEŞİL; commit'e hazır — commit/PR/deploy
  YAPILMADI).** Analiz: `docs/analysis/TODO-159D-customer-lists-wishlist.md`.
- Gate: `pnpm build` (25/25) · `pnpm typecheck` · `pnpm lint` (38/38) · `pnpm test` (api-gateway 1156,
  yeni customer-lists route 14 + wishlist-token 6 + heart a11y 3 dahil) · `git diff --check` temiz.
- Migration `20260723140000` gerçek PostgreSQL 16'da uygulandı; kısmi unique invariant'lar (ikinci default
  wishlist reddi, bütün-ürün dedup reddi), varyant-özel kabul ve FK cascade doğrulandı.
- Canlı doğrulama (enterprise-demo seed, gerçek gateway + Prisma): lazy-create default wishlist, gerçek
  ürünle toggle + batched status, CANLI hidrasyon (fiyat/stok/görsel; OUT_OF_STOCK gerçek envanterden),
  toplu sepete ekleme aday+atlanan (UNAVAILABLE sebepli), 401/404/422 güvenlik guard'ları, guest merge
  (merged/skipped, bozuk id eleme), DB invariant = tam 1 default wishlist.
- Amaç: Favori (wishlist) ve alışveriş listelerini iki ayrı sistem olarak değil, ortak ve tenant-safe bir
  `CustomerList` altyapısı üzerine kurmak. Storefront'ta gerçek (mock olmayan) favori davranışı + Customer
  Account altında liste yönetimi.
- Domain: `CustomerList` (id, storeId, customerId, name, type, visibility, isDefault) + `CustomerListItem`
  (id, storeId, listId, productId, variantId?, addedAt, note?, quantity?, sortOrder?). Enum:
  `CustomerListType` {WISHLIST, SHOPPING_LIST}, `CustomerListVisibility` {PRIVATE} (MVP yalnız PRIVATE).
- Kurallar: her müşteri+mağaza için TAM bir adet varsayılan WISHLIST (silinemez); aynı ürün/varyant aynı
  listeye iki kez eklenemez (composite unique); tenant izolasyonu unique + sorgu katmanında; ürün/varyant
  silme davranışı FK ile açıkça belgelenir; Product/Variant modeline JSON wishlist alanı EKLENMEZ.
- Favori davranışı: PLP · Home showcase · PDP · (varsa Quick View) product-card yüzeylerinde gerçek
  backend durumu; optimistic UI + rollback; idempotent; `aria-pressed` + SR metni; batched wishlist status
  resolver (N+1 yok). Guest wishlist: first-party cookie (yalnız productId/variantId, fiyat/PII yok, maks.
  kayıt sınırı); login'de idempotent merge + guest temizliği.
- Alışveriş listeleri: Customer Account'ta CRUD + item ekle/kaldır/taşı/kopyala + tekli/toplu sepete ekleme
  (canlı stok/fiyat otoritesi, stokta olmayan atlanır + sonuç özeti). Ekranlar `/account/lists`,
  `/account/lists/[listId]`, wishlist kısa yolu. Liste detayı ADR-089 Data Grid pagination'ı (25/50/100).
- Store Admin: MVP'de tam düzenleme YOK; müşteri detayında salt-okunur özet (liste sayısı, wishlist öğe
  sayısı, son eklenen tarih) değerlendirilir.
- **MVP:** ortak liste altyapısı · gerçek favori · guest wishlist + merge · alışveriş listeleri CRUD ·
  tekli/toplu sepete ekleme · batched status · Account UI.
- **Sonraki faz:** paylaşımlı/public liste · liste bazlı fiyat-düşüş bildirimi · admin liste analitiği.
- Kabul kriterleri (taslak): müşteri yalnız kendi listelerine erişir (ID enumeration sızdırmaz); tüm
  sorgular tenant-izole; add/remove idempotent; batch üst sınırı sunucuda; canlı ürün/variant/stok
  otoritesi kullanılır (snapshot'a güvenilmez); guest merge kısmi hatada sessiz veri kaybı yaratmaz.

## Customer Lifecycle — Product Reviews & Ratings (TODO-159E · ADR-094)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL; commit'e hazır — commit/PR/deploy YAPILMADI).**
  Analiz: `docs/analysis/TODO-159E-product-reviews-ratings.md`. Karar: **ADR-094**.
- Domain: `ProductReview` + `ProductReviewHelpful` + `ProductRatingAggregate` (projection) + enum
  `ProductReviewStatus {PENDING, APPROVED, REJECTED, HIDDEN}`. Migration `20260723160000` (additive).
- Uygunluk SUNUCU-otoriter (OrderLine↔Order↔Shipment: PAID + not-CANCELLED + DELIVERED/FULFILLED + ürün
  başına tek yorum). Aggregate = projection otoritesi (tek yazma yolu `recomputeAggregate`; yalnız APPROVED;
  tamsayı toplam → float drift yok). Public projeksiyon ALLOWLIST (PII/order/note sızmaz).
- Moderasyon: Store Admin `/reviews` (ADR-089 Data Grid + Modal drawer approve/reject/hide + AuditLog).
  Storefront PDP gerçek değerlendirme bölümü + Account "Değerlendirmelerim"; 3 kart yüzeyi gerçek batched
  rating (mockRating KALDIRILDI). Helpful (idempotent, kendi-yorumu engeli, rate-limit).
- Ertelenen sınırlar: TD-106 (iade sonrası manuel moderasyon), TD-107 (search read-model rating denormalize),
  TD-108 (review approved/rejected bildirimi — notification-service stub).
- Eski PLANNED kaydı (referans):
- Sıra: TODO-159D'den SONRA, TODO-160'tan ÖNCE.
- Amaç: Ürünlere yıldız puanı + metin yorumu; doğrulanmış alışveriş (verified purchase) temelli güven; PDP
  rating özeti + yorum listesi; Store Admin moderasyonu.
- Kapsam (taslak): yıldız puanı + metin yorum · sipariş kalemi bazlı yorum uygunluğu (yalnız satın alınan
  ürün) · doğrulanmış alışveriş rozeti · tekrar yorum koruması (ürün+müşteri tekil) · moderasyon durumları
  (PENDING/APPROVED/REJECTED) · Store Admin moderasyon ekranı · PDP rating summary (ortalama + dağılım) +
  yorum listesi · "faydalı buldum" oyu · spam/rate-limit · iade/iptal sonrası doğrulama kuralı.
- **Sonraki faz:** görsel/video yorumu · satıcı yanıtı · yorum bazlı ürün skorlama.
- Kabul kriterleri (taslak): yorum uygunluğu SUNUCU-otoriter (satın alma kanıtı gateway'de doğrulanır);
  aynı müşteri aynı ürüne tek yorum; moderasyon onaylanmadan PDP'de görünmez; tüm sorgular tenant-izole.
- **NOT:** TODO-159D görevinde yorum sistemi KODU yazılmaz; yalnız bu planlama kaydı eklenir.

## Growth & Monetization — Influencer Tracking & Attribution (TODO-160)

- Durum: **DONE / SHIPPED (2026-07-24) — PR #113 MERGED (merge commit 47a330e).** MVP + fazladan
  (tenant-safe attribution zinciri, dashboard, CSV export, bot/dedupe/rate-limit, KVKK minimizasyonu).
  ADR-102…107; ADR-091 KABUL EDİLDİ. Migration `20260724120000_add_influencer_tracking_attribution`
  (ADDITIVE). Tracking token HASH'li saklanır (ADR-102 ship-öncesi revizyon); plain URL tek-seferlik +
  rotasyon. Ertelenenler: TD-113 (retention worker), TD-114 (canlı kısmi iade),
  TD-115 (kupon-bağı/komisyon/portal/multi-touch). HTTP E2E (gerçek servisler) 33/33 PASS.
- Durum (özgün plan): PLANNED (yalnız roadmap kaydı; implementasyon YAPILMADI).
- Amaç: Mağazanın influencer/iş ortağı kaynaklı trafiğini ölçülebilir, tenant-izole ve KVKK/GDPR uyumlu bir
  attribution zinciriyle gelire bağlamak: link → tıklama → oturum → sepet → checkout → sipariş → net gelir.
- Kapsam: Influencer CRUD · kampanya bazlı takip linkleri · güvenli kısa tracking token · click ve unique
  visitor ölçümü · first-party attribution cookie · last-click MVP · cart ve checkout attribution · order
  attribution snapshot · iptal/iade/refund sonrası net gelir düzeltmesi · attribution window · UTM ve kupon
  ilişkilendirmesi · dashboard · click/conversion/order/gross-net revenue/AOV metrikleri · CSV export ·
  temel bot/fraud filtreleri · tenant isolation · KVKK/GDPR uyumlu veri saklama (saklama süresi + IP/UA
  minimizasyonu).
- **MVP:** Influencer CRUD · Tracking Link CRUD · click tracking · attribution cookie · last-click order
  attribution · temel dashboard · CSV export.
- **Sonraki faz:** Kupon attribution · multi-touch attribution · komisyon ve ödeme · fraud detection ·
  influencer portalı.
- Kabul kriterleri (taslak): attribution kararı SUNUCU-otoriter ve sipariş anında SNAPSHOT'lanır (sonradan
  yeniden hesaplanmaz); iptal/iade sonrası net gelir düzeltmesi gross'u geriye dönük bozmadan ayrı ölçülür;
  tüm sorgular tenant-izole; tracking token tahmin edilemez ve sayaç/id sızdırmaz; kişisel veri saklama
  süresi ve minimizasyon politikası dokümante edilir.

## Catalog Integrity — SKU Generation & Governance (TODO-160A)

- Durum: **DONE / KOD TAMAM (2026-07-24) — commit/PR YAPILMADI (git kuralı gereği durduruldu).** MVP +
  fazlası: SAF SKU generator (`@commerce-os/utils/sku`, 34 test), additive `SkuSource` migration
  (`20260724130000_add_sku_source`, gerçek PG'ye uygulandı + doğrulandı), manuel create'te boş SKU AUTO
  üretim, varyant üretim motorunda okunabilir SKU (`V-<id>-<hash>` KALDIRILDI) + `skuSource=AUTO`, sku-engine
  (preview/regenerate/validate/audit; server-authoritative + advisory-lock + AuditLog; 29 test), salt-okuma
  audit + dry-run-varsayılan backfill CLI (enterprise-demo canlı doğrulandı), store-admin Otomatik SKU paneli
  + kaynak rozeti + opsiyonel SKU. ADR-109…113. Gate'ler: build/typecheck/lint/test PASS. Ertelenen:
  TD-117 (ürün import sistemi greenfield), TD-118 (docker canlı API/UI smoke). Sıra: TODO-160'tan SONRA,
  TODO-161'den ÖNCE.
- Amaç: SKU'yu **varyant seviyesinde tek otorite** yapmak; ürün/varyant oluştururken **deterministik
  otomatik SKU üretimi**, mağaza içinde **benzersizlik garantisi**, çakışma yönetimi ve governance
  (audit + kontrollü backfill) sağlamak. SKU ile barcode kavramlarını **ayrı** tutmak.
- Kapsam: SKU varyant-seviyesi tek otorite · yeni ürün/varyant oluştururken otomatik SKU · toplu varyant
  generator entegrasyonu · mağaza içi unique garanti · manuel override · format ve uzunluk validation ·
  Türkçe karakter transliteration + özel karakter normalizasyonu · ürün ve variant option kodlarından
  deterministic üretim · collision durumunda kontrollü sequence/suffix · preview ve regenerate · import
  sırasında mevcut geçerli SKU'yu koruma · boş/tekrarlı/geçersiz mevcut SKU **audit raporu** · opsiyonel
  ve güvenli **backfill** · SKU değişikliklerini AuditLog'a yazma · order line snapshot'taki eski SKU'yu
  koruma · SKU ↔ barcode ayrımı · concurrency/idempotency · tenant isolation.
- **Zorunlu kurallar (kabul kriteri):** (1) SKU üretimi deterministiktir (aynı girdi → aynı SKU) ve
  mağaza içinde uniqueness DB seviyesinde garanti edilir. (2) Otomatik üretim mevcut GEÇERLİ SKU'ları
  EZMEZ (import/backfill koruma). (3) Sipariş anındaki SKU snapshot'ı (OrderLine) sonradan DEĞİŞMEZ. (4)
  SKU ile barcode ayrı alanlar/kavramlardır; biri diğerini türetmez. (5) Tüm sorgular tenant-izole;
  değişiklikler AuditLog'a yazılır.
- **MVP:** varyant-seviyesi tek otorite + deterministik otomatik SKU + store-unique + collision suffix +
  manuel override + preview/regenerate + format/transliteration validation + audit raporu.
- **Sonraki faz:** güvenli otomatik backfill (büyük katalog) · gelişmiş SKU şablon dili · barcode üretim/
  doğrulama (GTIN) entegrasyonu.
- Planlama notu: Uygulama fazında ilgili ADR (SKU otorite + deterministik üretim + governance) yazılacaktır;
  bu bir planlama kaydıdır, teknik borç DEĞİLDİR.

## Growth & Monetization — Sponsored Product Management (TODO-161)

- Durum: **DONE / KOD TAMAM (2026-07-24) — commit/PR YAPILMADI (git kuralı gereği durduruldu).** MVP +
  fazlası: ayrı domain (SponsoredProductCampaign/Placement/TargetKeyword/Event + OrderSponsoredAttribution
  (+Refund)), additive migration (`20260724171728_add_sponsored_product_management`, gerçek PG'ye uygulandı +
  `EXPLAIN` ile doğrulandı; tsvector generated-kolon sahte-diff temizlendi). SAF çekirdek
  `sponsored/sponsored-core.ts` (imzalı token, relevancy, slot injection, dedupe, öncelik, metrik; 23 test) +
  `checkout-attribution.ts` (sunucu-otoriter; 8 test). Search enjeksiyonu (organik ranking'e DOKUNMAZ, 1.
  sayfa/keyword, cap=2, lead=1, best-effort) + Home `SPONSORED_SHOWCASE` (polimorfik HomeSection, migration'sız).
  Storefront "Sponsorlu" rozeti + IntersectionObserver impression + click + checkout `sponsoredGrants[]`
  cookie. Store-admin `/sponsored-products` (list+dashboard+new+[id]) Data Grid + TODO-159B selector + CSV
  export (tenant-safe, CSV-injection guard). ADR-114…120. Gate'ler: build 25/25 · typecheck temiz · lint 38/38
  · test 1321 PASS · git diff --check temiz. Ertelenen: TD-119…122 (aşağı). Sıra: TODO-160A'dan SONRA;
  sıradaki aktif faz = final enterprise UI/design polish.
- (Planlama kaydı — orijinal kapsam) Durum: PLANNED.
- Amaç: Mağaza içi ürün öne çıkarmayı (self-merchandising / ileride reklam) organik arama kalitesini
  bozmadan, kullanıcıya açıkça etiketlenmiş ve ölçülebilir bir yerleşim sistemine dönüştürmek.
- Kapsam: Sponsored Campaign CRUD · sponsorlu ürün seçimi · başlangıç/bitiş tarihi · öncelik ve aktiflik ·
  ana sayfa sponsorlu vitrin · Home Experience (ADR-086) entegrasyonu · search sonuçlarında KONTROLLÜ
  sponsorlu slotlar · query ve kategori hedefleme · impression/click/cart/order/revenue ölçümü · kampanya
  dashboard'u · tenant isolation · stokta olmayan/pasif ürünlerin otomatik elenmesi.
- **Zorunlu kurallar (pazarlıksız — MVP KABUL KRİTERİ, sonraki faza ertelenemez):** (1) Kullanıcıya
  açıkça `Sponsorlu` etiketi gösterilir. (2) Organik
  search sıralaması KALICI olarak bozulmaz — sponsorlu seçim organik skoru değiştirmez. (3) Sponsorlu
  sonuçlar AYRI slotlarda enjekte edilir. (4) Aynı ürün sponsorlu ve organik olarak İKİ KEZ gösterilmez.
  (5) Sponsorlu yoğunluk sınırlıdır (sayfa/sonuç başına tavan). (6) Arama sorgusuyla İLGİSİZ ürün
  gösterilmez (sponsorluk alaka eşiğini atlatamaz). (7) Kampanya bitince ürün organik davranışına döner —
  kalıcı iz bırakmaz.
- **MVP:** Campaign CRUD · ürün seçimi · tarih/öncelik · homepage showcase · search sponsored slots ·
  sponsorlu etiketi · impression/click/order attribution · temel raporlama.
- **Sonraki faz:** CPC/CPM · bütçe · keyword bidding · placement yönetimi · vendor self-service ·
  faturalandırma.
- Kabul kriterleri (taslak): sponsorlu enjeksiyon read-model'in organik sıralamasını DEĞİŞTİRMEDEN,
  sonuç kümesi üretildikten sonra ayrı bir katmanda yapılır; dedupe garanti edilir; yoğunluk tavanı ve
  alaka eşiği sunucuda zorlanır; kampanya penceresi dışında hiçbir sponsorlu iz kalmaz; ölçüm TODO-160'ın
  event/attribution altyapısını yeniden kullanır (ADR-091).

## Growth & Monetization — Sponsorship Agreements, Billing & Settlement (TODO-161A)

- Durum: **DONE / KOD TAMAM (2026-07-25) — commit/PR YAPILMADI (git kuralı §17).** TODO-161'in
  sponsorlu gösterim + attribution altyapısını TÜKETİR (yeniden yazmaz); üzerine ticari/finansal
  operasyon kurar. Analiz: `docs/analysis/TODO-161A-sponsorship-commercial-operations.md`. ADR-121…127.
- Kapsam (tamamlandı): Sponsor cari (`SponsorAccount`) · anlaşma (`SponsorshipAgreement`, 6-durumlu
  yaşam döngüsü + allowlist geçiş) · kampanya bağlama (pencere kapsama guard'ı) · 5 pricing model
  (FIXED_FEE/CPM/CPC/CPA/REVENUE_SHARE, sunucu-otoriter SAF `billing-core.ts`) · dönemsel mutabakat
  (`SponsorshipSettlement`, metrik snapshot + DRAFT/FINALIZED immutability + çift-tahakkuk DB-guard) ·
  tahakkuk (`SponsorshipCharge`, iç ticari belge — resmî fatura DEĞİL) · append-only tahsilat
  (`SponsorshipPayment`, türetilmiş bakiye + aşırı-tahsilat reddi + ters kayıt) · refund adjustment
  (idempotent, negatif alacak) · para-birimi bazlı dashboard + CSV · unpaid campaign guard (iki
  katmanlı, `commercialMode` + `allowUnpaidSponsoredCampaigns`) · 6 store-admin ekranı (Data Grid).
- **Zorunlu kurallar (sağlandı):** (1) para tamsayı minor unit, oran basis point; (2) tahsilat tutarı
  istemciden OTORİTE değil (bakiye sunucuda türetilir); (3) bot/duplicate event ücretlendirmeye
  girmez; (4) currency karışmaz (para birimi bazında ayrı); (5) FINALIZED settlement immutable; (6)
  charge idempotent (settlement 1-1 + idempotencyKey); (7) tenant izolasyonu (public uç YOK, vergi
  no/iletişim public'e çıkmaz); (8) platform içi tahakkuk resmî fatura gibi ADLANDIRILMAZ.
- Migration `20260725090000_add_sponsorship_billing_settlement` (ADDITIVE; gerçek PG'ye uygulandı,
  tsvector sahte-diff temizlendi, search index'leri korundu, checksum senkronlandı). 2 additive kolon:
  `SponsoredProductCampaign.commercialMode`, `StoreSettings.allowUnpaidSponsoredCampaigns`.
- Gate'ler: build 25/25 · typecheck temiz · lint 38/38 · test 1394 gateway + 356 store-admin PASS ·
  git diff --check temiz. Canlı enterprise-demo doğrulama: 17 adım / 31 assertion PASS (gerçek PG +
  gerçek Prisma + gerçek `billing-core`; test verisi temizlendi, demo bütün). Ertelenen: TD-123…126.
- Sıra: TODO-161'den SONRA; sıradaki aktif faz = **final enterprise UI/design polish**.

## Growth & Monetization — Unified Sponsorship Commercial Flow (TODO-161A.2, stabilization/hotfix)

- Durum: **DONE (2026-07-27) — MERGED + DEPLOYED.** Commit `2be74d9` · PR `#124` · merge commit `947557d` ·
  deploy `api-gateway + store-admin-web` · auth'lu 75.000 TL smoke **25/25 PASS** · **TD-126 CLOSED**. TODO-161
  + TODO-161A ürün modelini tek tutarlı akışa dönüştüren stabilizasyon fazı. ADR-128/129. Migration ADDITIVE
  (`20260726120000_add_sponsorship_advance_allocation`; uygulanmış dosya immutable).
- Kapsam: anlaşma-kapılı kampanya aktivasyonu (ADR-124 Katman 1 artık gerçek) · kampanya `commercialMode`
  (Ticari sponsorluk / İç promosyon) form seçimi + doğrudan anlaşma bağlama · avans + append-only mahsup
  defteri (`SponsorshipAdvanceAllocation`) · FIXED_FEE doğrudan tahakkuk · sponsor cari + kullanılmamış
  avans · anlaşma finans merkezi · kampanya ticari özet kartı · menü/bilgi mimarisi (tek "Sponsorluk"
  grubu; "Sponsorlu Kampanyalar") · eşzamanlılık (advisory-lock) + iyimser kilit (`BALANCE_CHANGED`).
- Domain hata kodları: `AGREEMENT_REQUIRED`, `AGREEMENT_NOT_ACTIVE`, `AGREEMENT_DATE_MISMATCH`,
  `AGREEMENT_ALLOCATION_EXCEEDED`, `CURRENCY_MISMATCH`, `OVERPAYMENT`, `ADVANCE_BALANCE_EXCEEDED`,
  `BALANCE_CHANGED`.
- Sıra: TODO-161A'dan SONRA. Canlı auth'lu tümleşik smoke (yerel dev + gerçek PG, 75.000 TL senaryosu 25/25)
  DOĞRULANDI → **TD-126 KAPANDI (2026-07-27)**.

## Growth & Monetization — Commercial Automation & Data Retention (TODO-161A.1) — DONE / MERGED + DEPLOYED

- Durum: **DONE — MERGED + DEPLOYED (2026-07-27).** Commit `a6c607b` · PR `#126` · merge commit `36b188b` ·
  deploy `api-gateway + store-admin-web`. Analiz:
  `docs/analysis/TODO-161A.1-commercial-automation-retention.md`. ADR-130…136. **TD-125, TD-121, TD-113 CLOSED.**
  Ertelenen teknik borçları operasyonel otomasyona ve veri saklama hijyenine bağladı. Yeni ticari yüzey
  EKLEMEDİ; mevcut sponsorluk/attribution altyapısını otomatikleştirdi + saklama politikası uyguladı.
  Zamanlayıcı eşzamanlılığı **dağıtık PostgreSQL advisory lock** (session `connection_limit=1`) + 409
  `JOB_ALREADY_RUNNING` ile korunur; job yaşam döngüsü `QueueJobLog`'a yazılır.
  Canlı doğrulama (gerçek PostgreSQL, izole veri) 17/17 PASS; api-gateway testleri 42 yeni test PASS;
  build/typecheck (api-gateway + api-client + store-admin-web + contracts/config/db) temiz.
- **Teslim edilenler:** iki zamanlanmış in-process worker (`sponsorship-settlement-scheduler`,
  `attribution-event-retention`; ADR-051 deseni, default kapalı env bayrağı) · SAF çekirdekler
  (timezone dönem matematiği, settlement uygunluk, retention cutoff/circuit-breaker) · DI-testable servisler
  (previewSettlement reuse; DRAFT-only; per-agreement hata izolasyonu; store-scope batch purge) · manuel
  dry-run/run/apply + status HTTP uçları (platform-admin + tenant-izole) · store-admin `/operations` görünürlük
  paneli · `QueueJobLog` job-run audit (yeni tablo YOK) · additive migration `StoreSettings.timezone`.
- **TD-125 — Otomatik mutabakat zamanlaması (Automatic Settlement Scheduling):** haftalık / aylık / campaign-end
  dönemlerinde **DRAFT** settlement üretimi (otomatik finalize YOK — tahakkuk yine manuel onaylanır); idempotency;
  scheduler overlap kilidi; timezone-aware dönem hesaplama; retry; job audit; **hata alan bir anlaşma diğerlerini
  BLOKLAMAZ**. TODO-129 shipment-sync worker deseni.
- **TD-121 + TD-113 — Attribution event saklama & purge (Retention & Purge):** sponsored (TODO-161) ve influencer
  (TODO-160) **ham event** saklama; domain tabloları AYRI kalır ama **ortak purge yardımcıları** kullanılabilir;
  finansal attribution / order / refund / settlement **snapshot'ları SİLİNMEZ**; varsayılan **dry-run** + explicit
  `--apply`; store scope; batch delete; circuit breaker; environment guard; operasyon raporu; başlangıç retention
  **180 gün**.
- **Kapsam DIŞI (bu faza ALINMAZ):** e-Fatura, muhasebe entegrasyonu (TD-124), bidding, advertiser portal,
  sponsor-influencer ticari birleşimi, yeni placement tipleri (TD-120).
- Sıra: **TODO-161A.2'den SONRA — TAMAMLANDI**; sonraki hotfix = BUG-PDP-001; sonraki faz = TODO-161B.
- Doğrulama borcu: TD-127 (auth'lu `/operations` UI click-through smoke) — **✅ CLOSED (2026-07-27)** ayrı
  docs-only turda; settlement dry-run/run + retention dry-run/apply + 6 QueueJobLog durumu + SKIPPED_LOCKED +
  güvenlik + TR/EN doğrulandı, kod defekti yok. Bkz. `docs/TECHNICAL_DEBT.md` TD-127.

## Bug — PDP Quantity Changes Displayed Unit Price (BUG-PDP-001) — DONE / KOD TAMAM

- Durum: **DONE / KOD TAMAM (2026-07-27) — commit/PR YAPILMADI (git kuralı §8).** PDP artık daima seçili
  varyantın **tek adet birim fiyatını** gösterir; adet değişimi fiyat gösterimini etkilemez.
- **Kök neden:** `apps/storefront-web/components/buy-box.tsx` standart (otomatik-kampanya olmayan) fiyat bloğu
  `unitMinor * quantity` ve `compareMinor * quantity` ile gösterim yapıyordu (buy box'ta ara toplam). Otomatik
  kampanya bloğu (`showAutoPriceBlock`) ise birim fiyatı çarpmıyordu → **render-yolu ayrımı**. AUTOMATIC_CART_
  DISCOUNT+PERCENT kampanyalı ürünler (ör. Xiaomi Edge 50) otomatik bloğa girip doğru davranıyordu; PUBLIC_
  COUPON'lu veya kampanyasız ürünler (ör. Artesan Bel Çantası) standart bloğa düşüp adetle çarpılıyordu.
  Canlı veri kanıtı: Artesan `campaign.displayKind=PUBLIC_COUPON`, birim 629110 → adet 2'de eski kod 1.258.220
  (₺12.582,20) üretiyordu (bug raporuyla birebir); Xiaomi `displayKind=AUTOMATIC_CART_DISCOUNT`.
- **Fix:** Standart blok SAF `resolveUnitPriceLabels` yardımcısını (yeni; `apps/storefront-web/lib/money.ts`)
  kullanır — fonksiyon quantity parametresi ALMAZ. `unitMinor * quantity` / `compareMinor * quantity` çarpanları
  ve adete bağlı "Birim fiyat" notu KALDIRILDI. `quantity` yalnız add-to-cart payload'ında (`addToCartAction`)
  kullanılır. Fiyat otoritesi: `selectedVariant.unitPrice`.
- **Sunucu otoritesi (değişmedi):** sepet cookie'si yalnız `{variantId, quantity}` tutar; gateway kendi
  fiyatını çözer (`server.ts:4106` `variant.priceMinor * line.quantity`). Cart/checkout/order/payment tutarları
  sunucuda; PDP salt sunum.
- **Test:** yeni `apps/storefront-web/test/buy-box-unit-price.test.ts` (7 test) invariant'ı kilitler; gate'ler
  yeşil (build 25/25 · typecheck · lint 38/38 · test 1478 api-gateway + storefront · git diff --check temiz).
- **Canlı smoke (enterprise-demo):** Artesan PDP adet 1→2→5 fiyat sabit ₺6.291,10 (Omnibus/üstü-çizili sabit);
  sepet satır toplamı sunucuda ₺31.455,50 (=6.291,10×5). Xiaomi adet 1→2 sabit; varyant değişince birim fiyat
  ₺56.896,50→₺68.705,20 (adet 2 sabit, 2× DEĞİL). İki-ürün sepeti: satır toplamları + Telefonlarda %10 +
  genel toplam ₺155.124,86 + KDV tutarlı. Checkout sayfası auth gerektirir (parola girilemez → non-interactive);
  grand/payment total sepet özetinde sunucu-otoriter doğrulandı. Test verisi temizlendi; demo bütün (471 ürün).
- Sıra: **BUG-PDP-001'den SONRA → TODO-161B → final enterprise UI/design polish.**

## Growth & Monetization — Recently Viewed & Product Recommendations (TODO-161B) — KOD TAMAM (commit YOK)

- Durum: **KOD + MIGRATION + TEST + DOKÜMANTASYON TAMAM (2026-07-27); tüm gate'ler geçti. Commit/push/PR/
  merge/deploy YAPILMADI (git kuralı §16).** Analiz: `docs/analysis/TODO-161B-recently-viewed-product-
  recommendations.md`. ADR-137…143.
- İki AYRI capability, tek fazda: (1) **Recently Viewed** — `RecentlyViewedProduct` (dual-key
  customerId|visitorHash + kısmi unique index + XOR CHECK; HAM IP/UA saklanmaz; visitorHash =
  HMAC(SESSION_SECRET, first-party `commerce_os_vid`); bot/prefetch elenir; max 50/kimlik write-time; guest→
  customer idempotent merge; 90-gün retention TODO-161A.1 SAF altyapı reuse + AYRI domain/worker,
  `RETENTION_TABLE_SPECS` allowlist'ine dokunulmaz). (2) **Similar Products** — geçmişten BAĞIMSIZ açıklanabilir
  ağırlıklı skor (SAF `similarity-core.ts`; alt/üst kategori, marka, salesMode, fiyat yakınlığı, ortak dinamik
  attribute; read-model aday sorgusu bounded scan-cap 200; deterministik sıralama; fallback katmanları).
- **İzolasyon (kritik):** sponsored priority skora KARIŞMAZ (`injectSponsoredSlots` çağrılmaz), organik search
  ranking DEĞİŞMEZ (`search-query.ts` sabit), cross-store karışma yok. Home "Son İncelediklerin" bilinçli olarak
  `HomeSection` tipi YAPILMADI (kişiselleştirme+cache; ADR-141) → tek sabit client şerit.
- API (public/customer): `POST/GET/DELETE /public/stores/:slug/recently-viewed`, `.../recently-viewed/merge`,
  `GET /public/stores/:slug/products/:productId/similar`. Kartlar read-model `listing` snapshot'ından
  (`publicSearchProductSchema`; ikinci hidrasyon yok, N+1 yok — ADR-143).
- Yüzeyler: PDP Benzer Ürünler (statik related grid → açıklanabilir motor) + görüntüleme izleyici · Home Son
  İncelediklerin · Cart düşük-yoğunluk şerit (sepet ürünleri hariç) · Hesabım Görüntüleme Geçmişi (temizle).
  Mevcut `SearchProductCard`/`Section`/`Container` DS'i korundu; i18n TR+EN.
- Migration: `20260727130000_add_recently_viewed_products` (additive; gerçek Postgres'te uygulandı + doğrulandı:
  3 index + 2 kısmi unique + XOR CHECK + 3 FK Cascade).
- Testler: 51 yeni backend test (similarity-core 20 · recently-viewed-core 23 · retention-service 8);
  api-gateway suite yeşil (1529 test); storefront tsc temiz + 5 SSR UI testi.
- **Pre-ship hardening (2026-07-27):** (1) **TD-128 CLOSED** — öneri kartı wishlist kalbi GERÇEK (island'lar
  `WishlistProvider initialSavedIds` + BFF `savedIds`; auth→gateway, guest→cookie; optimistic+rollback).
  (2) **Similarity candidate KATMANLI** (ADR-142 revize) — per-tier-kotalı (120) katmanlı sorgu + additive index
  `ProductSearchDocument(storeId, brand)` (migration `20260727140000`); ilgisiz ilk-N sonucu bozmaz + katalog-sonundaki
  ilgili aday bulunur (canlı 200-boundary smoke + EXPLAIN). TD-129/130 AÇIK.
- Sıra: **TODO-161B'den SONRA → Final enterprise UI/design polish.**

## Growth & Monetization — Recommendation Surface Governance & Measurement (TD-129 + TD-130) — KOD TAMAM (commit YOK)

- Durum: **KOD + MIGRATION + TEST + DOKÜMANTASYON TAMAM (2026-07-27); tüm gate'ler geçti. Commit/push/PR/merge/
  deploy YAPILMADI (git kuralı).** ADR-144…148. TODO-161B'nin iki açık borcunu kapatır.
- **TD-129 CLOSED (ADR-144)** — Home "Son İncelediklerin" artık yönetilebilir `HomeSection` tipi `RECENTLY_VIEWED`
  (migration'sız; `type=String`). Admin göster/gizle + sıralama + TR/EN başlık + `maxItems`. ADR-141 gerilimi
  çözüldü: section YALNIZ sunum config'i taşır → `/home` cacheable/viewer-agnostic kalır; veri storefront
  istemcisinde `/recently-viewed`'den hidrasyon (TODO-161B altyapısı DEĞİŞMEDİ). Eski manuel iki sabit render
  KALDIRILDI (duplicate yok); geçmiş yoksa şerit render olmaz.
- **TD-130 CLOSED (ADR-145…148)** — Recommendation Measurement. AYRI davranış-event domaini: `RecommendationEvent`
  (migration `20260727150000`; yalnız Store FK; productId plain; HMAC hash; bot/prefetch satır yazmaz) +
  `apps/api-gateway/src/recommendation-events/`. Influencer/sponsored tablolarına YAZMAZ; `RETENTION_TABLE_SPECS`'e
  DOKUNMAZ (ayrı worker/jobType `recommendation-event-retention`, 180 gün). source/placement/type ALLOWLIST +
  sunucu-otoritesi. UI: `RecommendationCard` (viewport impression + click + attribution) Home/PDP/Cart/Account;
  buy-box başarılı add-to-cart'ta attribution tüketir (sahte aksiyon yok). Dedupe: impression 30 dk · click 30 sn ·
  add-to-cart dedupeKey. Store-admin görünürlük: `/home/insights` (funnel + source/placement kırılımı + filtreler).
  Kapsam-dışı (bilinçli): order/revenue/multi-touch/ML.
- Testler: gateway 1566 · storefront 439 · store-admin 356 — hepsi yeşil; tüm tsc temiz.
- Sıra: **TD-129/130'dan SONRA → Final enterprise UI/design polish (SON faz; yeni ürün geliştirme kararına kadar
  başlatılmaz).**

## Compliance — Customer Data Erasure Workflow (TD-131) — KOD TAMAM (commit YOK)

- Durum: **KOD + MIGRATION + TEST + CANLI DOĞRULAMA + DOKÜMANTASYON TAMAM (2026-07-27); tüm gate'ler geçti.
  Commit/push/PR/merge/deploy YAPILMADI (git kuralı).** ADR-149…155. KVKK md.7 / GDPR Art. 17 uyumu.
- **İki ayrı aksiyon (ADR-149):** `Hesabı Pasifleştir` (DEACTIVATE → PASSIVE + oturum revoke; veri korunur, geri
  alınabilir) ve `Kişisel Verileri Sil` (ERASE_PERSONAL_DATA → ERASED terminal; geri alınamaz). Migration
  `20260727160000_customer_erasure` (additive: `CustomerStatus.ERASED` + `erasedAt/erasedByUserId/eraseReason`).
- **Domain:** `apps/api-gateway/src/customer-erasure/` (core/data/service/routes). Dry-run preview (YAZMA YOK) +
  apply (müşteri-izole advisory lock + tek transaction + kilit-altı ikinci okuma + idempotent) + deactivate.
  API: `/erasure/preview`, `/erasure/apply`, `/deactivate`, `/erasure/status` (requireStorePlatformAdmin, tenant-izole).
- **Sil:** session/credential/token/OTP/IBAN/commPref/address/wishlist(+item)/coupon/recentlyViewed/reviewHelpful +
  FK'siz `RecommendationEvent` (deleteForCustomer, ADR-155). **Anonimleştir:** Customer + Order temas PII +
  OrderAddress + CampaignRedemption.email. **Koru:** Order/OrderLine/Payment/redemption mali + `billingTaxId` yasal
  kimlik (asgari saklama, ADR-151 → süre-sonu purge = TD-132). **Review:** KORU+ANONİM (silinmez; ADR-153).
  Guest/cross-store DOKUNULMAZ; audit PII-SIZ (ADR-154).
- **UI:** Store-admin müşteri detayında Danger Zone kartı + geri-alınamaz danger modal (dry-run özeti + confirmation
  phrase + reason); ERASED müşteri "Silinmiş" rozetiyle görünür, düzenlenemez, giriş yapamaz. TR/EN.
- Testler: 25 birim (customer-erasure core/service/data) + **47/47 canlı erasure smoke** (gerçek PostgreSQL,
  enterprise-demo, izole müşteri); gateway 1594 · store-admin 356 — hepsi yeşil; build/typecheck/lint temiz.
- Kalan borç: **TD-132** (yasal-kimlik süre-sonu retention purge). Doğrulama borcu **TD-127** (auth'lu `/operations`
  UI click-through smoke) → **✅ CLOSED (2026-07-27)** ayrı docs-only turda.
- Sıra: **TD-131 → TD-127 auth'lu smoke (✅ CLOSED) → Final enterprise UI/design polish (SON faz — SIRADAKİ).**

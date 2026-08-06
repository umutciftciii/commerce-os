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

## Growth & Monetization — Recently Viewed & Product Recommendations (TODO-161B) — DONE / MERGED + DEPLOYED

- Durum: **DONE / MERGED + DEPLOYED (PR #130, `a223beb`/`8e2e804`; migration `20260727130000`/`20260727140000`
  main'de). Launch Audit 2026-07-27 ile doğrulandı — bayat "commit YOK" kaydı düzeltildi.** Analiz:
  `docs/analysis/TODO-161B-recently-viewed-product-recommendations.md`. ADR-137…143.
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

## Growth & Monetization — Recommendation Surface Governance & Measurement (TD-129 + TD-130) — DONE / MERGED + DEPLOYED

- Durum: **DONE / MERGED + DEPLOYED (PR #131, `1ea9f19`/`c7817d0`; migration `20260727150000` main'de). Launch
  Audit 2026-07-27 ile doğrulandı — bayat "commit YOK" kaydı düzeltildi.** ADR-144…148. TODO-161B'nin iki açık
  borcunu kapatır.
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

## Compliance — Customer Data Erasure Workflow (TD-131) — DONE / MERGED + DEPLOYED

- Durum: **DONE / MERGED + DEPLOYED (PR #132, `cd48c87`/`f184b89`; migration `20260727160000_customer_erasure`
  main'de). Launch Audit 2026-07-27 ile doğrulandı — bayat "commit YOK" kaydı düzeltildi.** ADR-149…155.
  KVKK md.7 / GDPR Art. 17 uyumu. Kalan: **TD-132** (yasal-kimlik süre-sonu purge) yalnız EXTERNAL DECISION.
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

## Launch Readiness — Production Gap Audit (2026-07-27)

- Durum: **ANALİZ TAMAM.** Tam envanter: `docs/analysis/launch-readiness-product-gap-audit.md`. `main` HEAD
  `03042f3` üzerinde 6 paralel salt-okunur kod keşfi + docs↔kod tutarlılık kontrolü. Kod/migration/UI değişikliği
  YAPILMADI.
- **Özet:** Çekirdek ticaret motoru (auth/session, sunucu-otoriter sepet/fiyat, tenant izolasyonu, oversell kilidi,
  monotonik ödeme durum makinesi, migration disiplini, retention/audit) production-kalite. Launch'ı bloklayan iki
  küme: **ödeme otantikliği** (webhook imza gate'lenmiyor) ve **felaket kurtarma** (test edilmiş restore yok).
- **PROD BLOCKER:** (PB-1) Ödeme webhook'u imza doğrulamadan siparişi PAID yapıyor (`server.ts:9069-9147`) —
  gerçek-ödeme kapısı. (PB-2) Test edilmiş DB restore yolu yok (`db:restore-enterprise` = demo re-seed). (PB-3)
  Backup manuel/tek-host/zamanlanmamış/offsite-siz. → [[TD-034]], [[TD-135]].
- **HIGH (launch öncesi):** (H-1) ✅ **ÇÖZÜLDÜ (2026-07-28, ADR-180, [[TD-134]] CLOSED).** Typed theme token
  registry + save-time + render-time savunma + güvenli serializer; canlı smoke (vuln→fix) PASS. Kalan: storefront
  CSP ([[TD-147]], MEDIUM, derinlemesine savunma). (H-2) ✅ **ÇÖZÜLDÜ (2026-07-28, ADR-181…186, [[TD-133]] CLOSED).**
  Revenue-share tek-currency invariant + karışık-para fail-closed (`REVENUE_CURRENCY_MISMATCH`); currency-aware dashboard
  + audit + store-admin uyarı; canlı smoke 21/21 PASS. FX dönüşümü kapsam dışı ([[TD-148]] FUTURE). (H-3) ✅
  **ÇÖZÜLDÜ (2026-07-29, ADR-187…193, [[TD-136]] CLOSED).** Rezervasyon lifecycle (ACTIVE→CONSUMED/RELEASED/EXPIRED) +
  TTL (15dk) + read-time expiry add-back + write-time lazy-expiry + `inventory-reservation-expiry` worker (advisory
  lock + SKIP LOCKED + dry-run/apply + circuit breaker) + orphan DRAFT/PLACED-UNPAID kontrollü cancel + payment-vs-expiry
  fail-closed (`LATE_PAYMENT_AFTER_EXPIRY`) + reconciliation; migration `20260729120000` gerçek PG'de uygulandı, 25 test
  + 18/18 canlı smoke PASS. **Pre-ship hardening (ADR-194…196):** süpürücü api-gateway'den `@commerce-os/inventory`
  paketi + `apps/worker` BullMQ Job Scheduler'a TAŞINDI (gateway yalnız enqueue/status); PAID+ACTIVE reconcile servisi
  (dry-run+MANUAL_REVIEW); lock-ordering+counter invariant; 35 test + 13/13 hardening smoke PASS. Çok-depolu/waitlist
  FUTURE (ADR-193). (H-4) ✅ **DOĞRULANDI (2026-07-29, [[TD-122]] CLOSED).** Authenticated money path & sponsored
  funnel smoke: tüm gate'ler yeşil (build/typecheck/lint + 1793 test PASS); canlı deployed gateway'de imzalı
  payment webhook 10/10 (legacy→404, unsigned/wrong-sig/old-ts→401, amount/currency/reference mismatch→no
  mutation, monotonic no-rollback, idempotent); fixture CustomerSession auth (200/401/401) + cross-store
  isolation (401); consume-on-paid iki ödeme yolunda wired; revenue-share currency guard + settlement/attribution
  gateway suite'leriyle kapsandı; veri bütünlüğü clean-except-legacy (2 pre-H-3 PAID+ACTIVE reservation kalıntısı
  — reconcile uyarısı, kod defekti değil). **Kod defekti bulunmadı → docs-only kapanış.** Residual: store-admin
  UI-piksel click-through Final UI Polish'e devredildi (parola; non-interactive). Analiz:
  `docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`.
- **MEDIUM:** dağıtık rate-limit (TD-015), dev seed env guard, migrate-on-release gate, worker dağıtık kilit,
  search reconciliation süpürücü, kategori runtime redirect (TD-064), mail altyapısı disabled buton, admin-web
  Settings inert placeholder.
- **EXTERNAL DECISION:** canlı ödeme sağlayıcısı (TD-034); yasal-saklama süre-sonu purge (**TD-132 yalnız buraya**);
  ürün import launch-kapısı GTM segmenti (TD-117).
- **FINAL POLISH:** ERASED müşteri ACTIVE seçeneği (server 409-guard'lı); `JOB_ALREADY_RUNNING` i18n eşlemesi;
  öneri kartı rating yıldızları; parola-değişimi session revoke; internal-token constant-time; shipping bildirim butonu.
- **FUTURE CAPABILITY:** ürün/varyant import (TD-117), warehouse-aware rezervasyon (TD-047), transactional mail
  altyapısı, sponsored budget/placement/merge (TD-119/120/123), kısmi-iade (TD-114), store-user auth (TD-019).
- Önerilen sıra: **Aşama A** (DR + tema XSS + bayat kayıt temizliği) → **Aşama B** (sağlayıcı + webhook imza +
  para-yolu smoke + rezervasyon expiry) → **Aşama C** (store-user auth + ölçek + future capability). Detay: analiz §9.

## Security — PB-1 Payment Webhook Authenticity & Store Resolution — ✅ CLOSED / MERGED + DEPLOYED

- Durum: **✅ CLOSED / MERGED + DEPLOYED (2026-07-27; PR #135, merge `382e1c8`; api-gateway rebuild + recreate;
  migration `20260727170000` deploy edildi + `migrate status` up-to-date). Production-stack exploit regresyonu
  21/21 (deploy edilen gateway :4000).** ADR-156/157/158. Analiz:
  `docs/analysis/PB-1-payment-webhook-authenticity.md`.
- **Kapatılan açık:** Eski `/payments/webhooks/:provider` client body'yi (storeId/attemptId/status) otorite kabul
  ediyor + imzayı gate'lemiyordu → müşteri kendi siparişini bedavaya PAID yapabiliyordu. **KALDIRILDI.**
- **Yeni doğrulanmış webhook** `POST /public/payments/webhooks/:webhookToken`: HMAC(`timestamp.rawBody`) imza +
  300 sn replay penceresi; store URL token'ından; attempt/order DOĞRULANMIŞ provider reference'tan (client body
  DEĞİL); amount/currency invariant; monotonik geçiş (payment-state reuse); `(storeId,provider,eventId)`
  idempotency (tek-tx P2002). Fail-closed (secret yok → 404). Tüm `verifyWebhookSignature(){return true}` bypass'ları
  + adapter webhook metodları silindi.
- Migration `20260727170000_payment_webhook_authenticity` (additive: `PaymentProviderConfig.webhookToken` unique +
  `PaymentAttempt(storeId, providerReference)` index; gerçek Postgres'te uygulandı + doğrulandı).
- Testler: 30 yeni (13 imza birim + 17 route) + coupled test'ler güncellendi; api-gateway suite **1624 yeşil**;
  build/lint temiz. **Canlı exploit regresyonu 14/14** (gerçek PostgreSQL, izole fixture, cleanup).
- Kalan (EX-1 canlı sağlayıcıya bağlı): **TD-137** sağlayıcı-native imza · **TD-138** webhook provisioning UI.
  Gerçek ödeme yalnız EX-1 + TD-137 sonrası etkinleştirilir.

## DR — PB-2 Backup/Restore CLOSED · PB-3 Offsite IMPLEMENTED-BUT-NOT-CONFIGURED

- **PB-2 (test edilmiş gerçek DB restore yolu) — ✅ CLOSED (2026-07-28).** Yeni `@commerce-os/backup` paketi
  (SAF çekirdek + provider-bağımsız adapter'lar) + api-gateway `database-backup` scheduler worker + CLI'lar.
  Gerçek `pg_dump -Fc` → client-side **AES-256-GCM** (fail-closed, ayrı domain anahtarı) → **S3-uyumlu offsite**
  (SigV4, SDK'sız, private ACL, upload sonrası remote HEAD+sha256 doğrulama) → **GFS retention** (14/8/12, en-yeni
  korunur, dry-run, parity) → **gerçek `db:restore`** (checksum+decrypt+hedef-guard+reset+restore) → **izole
  restore-verification** (migrate status + kritik tablo + integrity + bilinen fixture). Secret-siz + PII-sınıflı
  manifest. Advisory lock + QueueJobLog (yeni tablo YOK). ADR-159…166.
- **Canlı DR smoke** (`infra/scripts/dr-smoke.zsh`): izole source+target postgres + **MinIO** offsite; fixture →
  backup → encrypt → upload → remote checksum → boş DB → download → decrypt → restore → migrate 61/61 (latest eşleşti)
  → fixture ilişkileri (Order/OrderLine/PaymentAttempt/Inventory) korundu → source dokunulmadı → **PASS**
  (backup ~0.57s / restore ~1.1s). Testler: 73 paket + 11 api-gateway.
- **PB-3 (offsite/otomatik/rotasyon) — ⚠️ IMPLEMENTED-BUT-NOT-CONFIGURED / OPEN.** Kod+test+smoke tamam ancak
  **gerçek production offsite provider'ı yapılandırılmadı** ve production'dan doğrulanmış remote backup yok (yalnız
  MinIO/local). PB-3 ancak gerçek provider config + ilk production remote backup doğrulaması sonrası CLOSED. Bkz.
  **TD-139** (+ TD-140 media volume, TD-141 verify-target). Durumu olduğundan iyi gösterme: local smoke ≠ production offsite.
- **Demo ayrımı:** `db:restore-enterprise` (yanıltıcı) → **`db:reseed-enterprise`**; eski ad deprecation köprüsü (ADR-166).
- **Kapsam dışı (future capability):** PITR/WAL archiving, streaming replication, multi-region active-active,
  tenant-level selective restore, Kubernetes operator, `media-data` volume backup (TD-140).
- **Bu görevde commit/push/PR/merge/deploy YAPILMADI** (kullanıcı talimatı: kod+test+smoke+docs tamamla, dur).

### PB-2/PB-3 pre-ship hardening (2026-07-28, ADR-167…169)

- **Scheduler → worker:** backup zamanlaması api-gateway `setTimeout`'tan **apps/worker** BullMQ Job Scheduler'a
  taşındı (API restart takvimi etkilemez; worker restart paralel timer üretmez; advisory lock `@commerce-os/db`'de,
  job orchestration `@commerce-os/backup`'ta — worker+gateway paylaşır). api-gateway yalnız enqueue eder.
- **S3 → AWS SDK v3:** elle SigV4 kaldırıldı; bounded retry + timeout + **https-only** (prod'da HTTP reddedilir,
  local MinIO için explicit insecure override).
- **Envelope + manifest HMAC:** encryption envelope version+keyId (rotation-hazır, truncation tespiti); manifest
  HMAC-SHA256 (kurcalanma → cross-environment/checksum guard atlatılamaz) + restore ortam guard'ı.
- **Testler:** 95 paket + worker/health; **iki canlı smoke** — `dr-smoke.zsh` (data-path) + `dr-worker-smoke.zsh`
  (worker-tetikli: STARTED→COMPLETED, offsite obje, SKIPPED_LOCKED, Redis Job Scheduler, gateway'de scheduler yok).
- **PB-2 CLOSED** kalır; **PB-3 OPEN / PROD BLOCKER (TD-139)** — production offsite provider yapılandırılıp
  production kaynaklı remote backup + restore-verification geçene dek. Bu turda commit/push/PR/deploy YAPILMADI.

## Influencer Campaign Lifecycle & Granular Analytics (2026-07-28, ADR-170…176)

- **Durum:** KOD + MIGRATION + TEST + DOKÜMANTASYON TAMAM · commit/PR YOK (talep gereği dur) · canlı smoke bekliyor (TD-143).
- **Kapsam.** TODO-160 attribution çekirdeği üzerine iki ürün kusuru + yaşam döngüsü + granüler analitik:
  1. **Redirect kusuru (ADR-171/172).** Durdurulmuş kampanyanın tracking URL'si ürüne yönlendiriyordu → artık markalı
     terminal sayfa (`/campaign-unavailable`, 200+noindex); click/session/cookie/pencere YAZILMAZ; hedef ürün sızdırılmaz.
     Redirect kapısına store aktifliği + target ürün/kategori aktifliği eklendi.
  2. **Analitik kusuru (ADR-174/176).** Influencer detayı tek toplam gösteriyordu → 3-seviyeli IA: influencer toplam
     (sayılar) + kampanya bazlı metrik tablosu + kampanya detay dashboard (link/UTM/hedef/seri/son sipariş) + link detay
     dashboard. Multi-currency ayrı toplam (sessiz cross-currency toplam kaldırıldı).
- **Yaşam döngüsü (ADR-170).** Campaign `DRAFT/ACTIVE/PAUSED/ENDED/CANCELLED` (+legacy ARCHIVED→ENDED); link `ACTIVE/
  PAUSED/REVOKED` (+legacy INACTIVE→PAUSED). Additive migration `20260728120000` (gerçek PG'ye UYGULANDI + doğrulandı).
- **Attribution kapanış (ADR-173).** PAUSED/ENDED pencere-içi eski session convert eder; CANCELLED/DRAFT ve REVOKED link
  etmez; session silinmez.
- **Gate'ler.** gateway build 0 · gateway test 1653/1653 (39 yeni influencer testi) · store-admin 356 · storefront 439 ·
  lint 0 hata · her iki app tsc 0 · git diff --check temiz.
- **Sıra:** bu faz TAMAM (commit'e hazır) → **H-1 Theme Token Stored XSS** (bu iş için ertelenmişti) devam edecek.

## Influencer Analytics Demo Completion (2026-07-28, ADR-177…179)

- **Durum:** TD-143/144/145/146 KAPATILDI · kod + fixture + runbook + testler tamam · SHIP hazır.
- **TD-145** — tracking link formu tam (6 UTM/label alanı: source/medium/campaign/content/term + customLabel; trim +
  empty-to-null + max120 + kontrol-karakter reddi + TR/EN + immutable ipucu). Liste/detayda customLabel + UTM görünür.
- **TD-144** — currency-aware UTM kırılımı (clicks/unique/orders/CR + per-currency `revenues[]` + hasMultipleCurrencies +
  customLabel); influencer/campaign/link/UTM her seviyede currency ayrımı; sessiz cross-currency toplam YOK.
- **TD-146** — kampanya/link günlük zaman serisi grafiği (bağımlılıksız inline SVG; 7/30/90/özel aralık, store-timezone
  gün sınırı, zero-fill, link/UTM filtre, tooltip/legend/empty/loading/a11y; currency başına ayrı seri).
- **TD-143** — deterministik demo fixture (`influencer-demo-seed.mjs`: Melek İçmeli + 3 kampanya + UTM + 42 tıklama +
  TRY/USD sipariş) + `docs/runbooks/influencer-analytics-demo.md`. Data-layer smoke gerçek PG'ye karşı PASS (25/26; 1
  smoke-script alan hatası, ürün doğru).
- **Gate'ler.** gateway build 0 · test 1669 (+16) · store-admin 356 · storefront 439 · lint 0 · tsc 0 · migrate status
  temiz (yeni migration YOK — alanlar 20260728120000'de).
- **Sıra:** SHIP (commit→PR→merge→deploy→smoke→worktree cleanup) → **H-1 Theme Token Stored XSS** (SIRADAKİ aktif faz).

## H-1 — Theme Token Stored XSS (2026-07-28, ADR-180, TD-134 CLOSED)

- **Durum:** kod + test + canlı smoke + docs TAMAM · **commit'e hazır** (git: commit/push/PR/merge/deploy YOK).
- **Kök neden.** Theme Engine (ADR-087) token değerleri yalnız `z.string().min(1)` ile doğrulanıyor, serializer
  (`css.ts`) ham `${name}:${value};` olarak `<style dangerouslySetInnerHTML>`'e basıyordu (3 sink tek serializer).
  `#fff</style><script>…` → public storefront **stored XSS**; `.passthrough()` bilinmeyen anahtar da sızdırıyordu.
- **Çözüm.** Typed **token registry** (COLOR/LENGTH/NUMBER/FONT_FAMILY_PRESET/FONT_WEIGHT/SHADOW_PRESET/DURATION/EASING);
  **parse+range+normalize validators** (regex-only değil); **render-time defense** (serializer geçersizi atlar, bozuk ref
  çökertmez); **save-time defense** (draft/publish/import + `THEME_TOKEN_*`/`THEME_PUBLISH_BLOCKED`, ham payload dönmez);
  **font/shadow preset policy** (ham string yok → preset+allowlist); **customCss sertleştirme** (yorum-strip + `<` kaldırma
  + fixpoint); store-admin field-level TR/EN + publish-blocked; legacy salt-okuma tarama scripti. Bkz.
  `docs/analysis/H-1-theme-token-stored-xss.md`.
- **Canlı smoke (enterprise-demo).** Payload DB'ye enjekte → **mevcut stack ham breakout servis etti** (endpoint +
  storefront HTML 8× `<script>alert`, vuln doğrulandı) → gateway worktree fix imajıyla değiştirildi → **payload düştü**
  (endpoint + storefront HTML temiz, `--accent` atlandı, `--paper` sağlam, sayfa kırılmadı, diğer store etkilenmedi) →
  **fixture geri yüklendi.**
- **Gate'ler.** theme 147 test + build 0 · gateway 1675 test (+6 XSS integration) + build 0 · store-admin 356 + next build ·
  storefront 439 · i18n 47 · lint 0 hata · `git diff --check` temiz.
- **Kalan.** Storefront CSP ([[TD-147]], MEDIUM — derinlemesine savunma; H-1 için gerekli değil).
## H-2 — Revenue Share Currency Guard (2026-07-28, ADR-181…186, TD-133 CLOSED)

- **Durum:** kod + test + veri taraması + canlı smoke + docs TAMAM · **commit'e hazır** (git: commit/push/PR/merge/deploy YOK).
- **Kök neden.** İki gizli currency-mixing: (1) `collectBillableMetrics` dönemin `OrderSponsoredAttribution` gelirlerini
  satır `currency`'sini yoksayarak `_sum` ile topluyor → karışık-para tek `netRevenueMinor` → REVENUE_SHARE bozuk tahakkuk;
  (2) `getDashboard` net geliri currency olmadan gruplayıp mağaza-currency net'i anlaşma-currency kovasına ekliyor.
  `isSameCurrency` payment/advance yollarında vardı ama **revenue→settlement yolunda YOKTU**. Bkz.
  `docs/analysis/H-2-revenue-share-currency-guard.md`.
- **Çözüm.** SAF `partitionRevenueCurrencies` (billing-core; para toplamaz, KİMLİK karşılaştırır); `collectBillableMetrics
  (expectedCurrency)` gelir toplamlarını agreement currency'ye filtreler (snapshot tek-para); `previewSettlement`/
  `finalizeSettlement`/`createChargeFromSettlement`/`createRefundAdjustment` **fail-closed** (`AGREEMENT_CURRENCY_REQUIRED`/
  `REVENUE_CURRENCY_MISMATCH`/`SETTLEMENT_CURRENCY_MISMATCH`); karışık-para SESSİZCE dışlanmaz (kısmi settlement yok);
  currency-aware dashboard + `currencyMismatch` operations özeti; scheduler adapter fail-closed köprüsü; mismatch AuditLog
  (SYSTEM, PII-free, bounded orderId örneği); store-admin kontrollü uyarı kartı (beklenen/bulunan currency + uyuşmayan
  sayı) + buton disable + TR/EN. FX dönüşümü kapsam dışı (ADR-186, [[TD-148]] FUTURE CAPABILITY).
- **Currency otoritesi.** Server-side `SponsorshipAgreement.currency` (ISO 4217); settlement/charge türetir; istemci
  `input.currency` yalnız karşılaştırma. Attribution currency = sipariş currency → guard zorunlu.
- **Canlı smoke (enterprise-demo, izole fixture).** 21/21 PASS: TRY happy-path (preview net 150000 → %10 charge 15000 →
  finalize → payment) · karışık-para (TRY+USD) → `REVENUE_CURRENCY_MISMATCH`, draft OLUŞMADI, audit yazıldı (PII-free),
  TRY+USD tek toplamda BİRLEŞMEDİ · finalize recheck (draft sonrası USD sızıntısı → fail-closed, DRAFT kaldı) · USD
  payment TRY charge reddi · USD advance reddi · cross-store `AGREEMENT_NOT_FOUND` · boş currency `AGREEMENT_CURRENCY_REQUIRED`
  · fixture temizlendi (0 kalıntı). Salt-okuma tarama baseline temiz (`db:scan-sponsorship-currency`).
- **Gate'ler.** api-gateway build 0 + 1697 test (12 currency-guard + 6 route + 3 persistence + 1 scheduler yeni) · contracts
  build 0 · store-admin tsc 0 · lint 0 hata · `git diff --check` temiz. Migration GEREKMEDİ (currency alanları mevcut).
- **Kalan.** FX çok-para settlement ([[TD-148]] FUTURE CAPABILITY — teknik borç değil, bilinçli fail-closed sınır).
- **Sıra:** commit'e hazır → **Final Enterprise UI/Design Polish** (kullanıcı başlatınca).

## H-4 — Authenticated Money Path & Sponsored Funnel Smoke (2026-07-29, TD-122 CLOSED)

- **Durum:** DOĞRULAMA TAMAM · **kod defekti bulunmadı → docs-only kapanış** (git: commit/push/PR/merge SHIP aşamasında).
- **Amaç.** Gerçek para/sponsorluk akışlarını uçtan uca doğrula: cart→checkout→payment→order · recovery · webhook
  sonrası durum · reservation consume/release · sponsor→agreement→campaign→settlement→charge→payment · sponsored
  attribution→revenue share→settlement · refund/reversal · tenant isolation · operations görünürlüğü.
- **Auth.** Kısa ömürlü `CustomerSession` fixture (tokenHash = sha256("token.SESSION_SECRET"); secret yalnız
  konteyner içinde; TTL 10dk; smoke sonunda silindi; secret/parola okunmadı/loglanmadı). Store-admin/internal =
  `INTERNAL_API_TOKEN` (okunmadı).
- **Canlı güvenlik (deployed gateway :4000).** İmzalı payment webhook 10/10: legacy→404, unknown token→404
  generic (fail-closed), GET→404, unsigned→401 `SIGNATURE_MISSING`, wrong-sig→401 `SIGNATURE_INVALID`, old-ts→401
  `TIMESTAMP_OUT_OF_RANGE`, wrong-amount→`AMOUNT_MISMATCH` no-mutation, wrong-currency→`CURRENCY_MISMATCH`
  no-mutation, unknown-ref→`WEBHOOK_REFERENCE_NOT_FOUND` no-mutation, valid→PAID `applied=true`, duplicate→
  `duplicate=true`, PAID sonrası late FAILED→no rollback (monotonic), duplicate `PaymentProviderEvent`=0.
- **Canlı auth + isolation.** Minted session → own store 200 / no-session 401 / bogus 401; edm-store session
  demo-store'da → 401 `CUSTOMER_UNAUTHORIZED` (session store-scoped, cross-store reddi).
- **Consume/release.** Consume-on-paid iki ödeme-başarı yolunda da wired (`server.ts:4744` hosted-pay/manual +
  `:6610` webhook applyOutcome; aynı tx; late-after-expiry fail-closed). Reconcile (ADR-193) salt-okunur.
- **Sponsored/revenue/settlement/refund.** Gateway entegrasyon suite'leriyle kapsandı (`sponsored-*`,
  `sponsorship-*`, `commercial-automation-*`; agreement-gated activation, currency guard fail-closed,
  unique-dönem + finalized-immutable, attribution scope/duplicate/bot guard + cross-store reddi, reversal).
- **Gate'ler.** `pnpm build`/`typecheck`/`lint` PASS · `pnpm test` **1793 passed / 0 failed** · `git diff --check`
  temiz · `prisma migrate status` up to date. Migration GEREKMEDİ.
- **Bulgu (F-1, kod defekti değil).** edm-store'da 2 legacy PAID+ACTIVE reservation (`OS-000001`/`OS-000002`,
  H-3 consume-on-paid'den önce ödenmiş fixture kalıntısı). `reservedCounterMismatch=0`, `reservedExceedsOnHand=0`
  → oversell yok. Spec §15 + ADR-193 salt-okunur → otomatik düzeltilmedi, reconcile uyarısı olarak raporlandı.
- **Doğrulama sınırı.** Store-admin tarayıcı UI-piksel click-through non-interactive session'da yapılamaz
  (parola; [[TD-126]] yöntemi tekrarlanamaz) → Final UI Polish + deploy-öncesi manuel kontrol.
- **Sıra:** SHIP (docs-only PR → merge → değişen servis rebuild GEREKMEZ) → **Final Enterprise UI/Design Polish**.
  Analiz: `docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`.

## TODO-162 — Storefront Discovery & Merchandising (2026-07-30, CLOSED & DEPLOYED)

- **Durum:** CLOSED & DEPLOYED. FOUNDATION + TD-149…TD-152 CLOSED; discovery→PDP→add-to-cart
  attribution dahil. PR #143 MERGED (merge `ba5bfde`); 4 servis deploy healthy; `prisma migrate
  status` up-to-date; post-deploy ingest smoke 10/10 + KVKK/PII temiz. Worktree kaldırıldı.
  Kalan yalnız opsiyonel tarayıcı UI smoke. (Bu kayıt product-split turunda gerçek durumla
  bağdaştırıldı; öncesi IN_PROGRESS yazıyordu.)
- **Amaç.** Home Experience'ı eligibility-driven bir keşif yüzeyine dönüştür (Amazon slider-altı ritminden
  esin; görsel kopya değil). Bir section yalnız gerçek/doğrulanmış sinyal eşiğini karşılarsa render edilir;
  aksi halde DOM'a hiç eklenmez (boş başlık/spacing/impression yok). Kişiselleştirilmişte fallback yasak.
  Mevcut Home Experience/Recently Viewed/Wishlist/Cart/Orders/Campaign/Sponsored altyapıları REUSE; paralel
  CMS/ikinci engine YOK.
- **Teslim edilen (bu tur, build+test yeşil).**
  - Analiz: `docs/analysis/TODO-162-storefront-discovery-merchandising.md` (5-ajanlı kod denetimi temelli).
  - Eligibility motoru (saf): `apps/api-gateway/src/home/eligibility-core.ts` — `resolveHomeSectionEligibility`
    + `SECTION_BOUNDS` (ADR-199) + `resolveDiscoveryGrid` (min2/max4). **25 birim testi PASS.**
  - Analytics saf çekirdek: `apps/api-gateway/src/home/discovery-event-core.ts` (hidden-section event üretmez).
    **9 birim testi PASS.**
  - Kontratlar: 10 yeni section tipi allowlist + config şemaları (discovery rail/grid/editorial)
    (`packages/contracts`); gateway `parseConfigForType` yeni tipleri doğrular. contracts+api-gateway build 0.
  - Migration (ADDITIVE): `HomeDiscoveryEvent` (`20260730120000`) — **gerçek Postgres'te uygulandı + doğrulandı**
    (tablo + 5 index; `prisma migrate status` up to date).
- **Kalan (sıradaki oturum).** Katman B viewer-specific resolver + `POST .../home/discovery` endpoint (6
  kişiselleştirilmiş data-access yolu: cart-recs/personalized-deals/repurchase/similar-to-purchased/
  wishlist-deals/continue-browsing) · DISCOVERY_GRID + fold-altı lazy island'lar (storefront) · Category
  Shortcuts boş-kategori fix · analytics ingest endpoint + retention worker · store-admin SectionEditor
  genişletmesi + preview · entegrasyon/UI testleri · enterprise-demo canlı smoke. Bkz. [[TD-149]]…[[TD-152]].
- **Kararlar.** ADR-197…ADR-206 (eligibility-driven · guest/auth context · min-threshold invariant ·
  no-fallback personalization · merge reuse · viewer-specific hydration · DISCOVERY_GRID · page-level dedupe ·
  hidden-section analytics · lazy hydration).

## Product Split Baseline — Modular ↔ Marketplace (2026-07-30, DONE)

- **Durum:** DONE. Mevcut `commerce-os` reposu **Commerce OS Modular** ürün hattı olarak
  tanımlandı; ayrı bir **Commerce OS Marketplace** repository baseline'dan hazırlandı.
- **Baseline tag:** `v1.0.0-product-split-baseline` (annotated) → commit `1001ee4`; origin'e
  push edildi. İki ürünün ortak tarihsel referansıdır.
- **Modular ürün kimliği:** müşterilere dağıtılan modüler e-ticaret ürünü; tek repo, ortak
  release zinciri, mağaza-bazlı capability, Theme Studio, versioned custom theme, vertical
  preset. Release/tag deseni `modular-vX.Y.Z`.
- **Marketplace:** ayrı repository (`../commerce-os-marketplace`), bağımsız `.git`,
  `NO_REMOTE_CONFIGURED`, `FOUNDATION_ONLY`. Namespace/DB/redis/cookie/port tam izole; release
  deseni `marketplace-vX.Y.Z`. Marketplace feature'ları bu modular roadmap'e implementasyon işi
  olarak karışmaz (yalnız ürün hattı referansı).
- **Migration zinciri:** baseline'a kadar ortak (64 migration, son
  `20260730120000_add_home_discovery_events`); baseline sonrası bağımsız. Ortak fix'ler bilinçli
  port/cherry-pick ile (migration içeren commit kör cherry-pick edilmez). Bkz. ADR (product
  split) — `docs/DECISIONS.md`.

## TODO-163 — Tenant Module & Capability Management (2026-07-30, CLOSED)

- **Durum:** **CLOSED** — Faz 1 (thin vertical slice) + Faz 2 (enforcement expansion & storefront runtime)
  + **Faz 3 (enforcement closure: worker skip + store-admin direct-URL guard + kalan storefront gate'leri
  + plan capability editörü)** teslim edildi; tüm gate'ler yeşil + canlı smoke PASS. Analiz:
  `docs/analysis/TODO-163-tenant-module-capability.md`. Kararlar: **ADR-208…ADR-215**.
- **Amaç.** Modular ürün kimliğinin "mağaza-bazlı capability" sütunu: her tenant'ın hangi
  modüle sahip olduğu **sunucu-otoriter** türetilir. Core'da ürün/müşteri adına göre koşul YOK.
- **Teslim edilen (Faz 1).**
  - Tipli **registry** (WHAT-var; 14 modül, core/baseline/requires) + **saf resolver**
    (override > plan > baseline + dependency; fail-closed) — 16 birim testi.
  - Adanmış **`StoreModule`** tablosu (sparse override) + `StoreModuleState` enum; additive
    migration `20260730130000` **gerçek Postgres'te uygulandı + doğrulandı**.
  - Gateway: `GET/PUT /stores/:storeId/modules` + `requireCapability` (temsili: payment-providers
    → 403 CAPABILITY_DISABLED). Persistence `AppDataAccess` üzerinden enjekte (in-memory test uyumlu).
  - store-admin: `/api/store/modules` BFF + `/modules` yönetim ekranı + **StoreNav** capability
    gizleme. api-client `admin.modules.{list,setOverride}`.
  - 12 route/orkestrasyon testi + api-gateway **1803 test PASS** (regresyon yok); build/lint temiz.
- **Geriye uyumluluk.** Non-core baseline ENABLED → override/plan yokken mevcut davranış aynı.

- **Teslim edilen (Faz 2 — Enforcement Expansion & Storefront Runtime; ADR-211…ADR-213).**
  - **Taksonomi** 12 CORE + 16 OPTIONAL (uppercase-snake) + tam dependency grafiği (ADR-211).
  - **Gateway server-side enforcement** TÜM opsiyonel modüllerde (admin 403 MODULE_DISABLED, public
    404 leak-siz) — register-modül deps'leri modül-scope'lu sarmalayıcılarla gate'lendi; inline public
    read'ler (home/hero/theme/campaigns/discovery) kapalıyken **graceful boş/base**. CORE gate YOK.
  - **Store-scoped bounded TTL cache** (30s) — public hot-path N+1'siz; mutation→explicit invalidate;
    DB hatası→fail-closed (core açık); cross-store leak yok (ADR-213).
  - **Public projeksiyon** `GET /public/stores/:slug/modules` (boolean-only) + storefront
    `getStoreCapabilities()`; account sidebar/section + wishlist kalp gizleme.
  - **Parent-disable guard** (409 DEPENDENTS_ACTIVE + preview + cascade; sessiz cascade yok — ADR-212).
  - **Testler:** capability-core (18) + capability-routes/cache (16) genişletildi; api-gateway
    **1809 PASS** · storefront **446 PASS** · store-admin **356 PASS**; tam workspace build + lint temiz.
  - **Canlı smoke (enterprise-demo):** REVIEWS off→public 404+projeksiyon false; HOME/THEME/CAMPAIGNS
    off→graceful boş + SPONSORED/INFLUENCER dependency-off; re-enable→veri geri (silme yok). ✓
- **Teslim edilen (Faz 3 — Enforcement Closure; ADR-214…ADR-215).**
  - **Worker per-store skip** ([[TD-153]]): paylaşılan `worker-gate.ts` 6 opsiyonel worker'a enjekte;
    kapalı store → mutation yok + `SKIPPED_DISABLED` (bounded QueueJobLog, hata değil, retry yok);
    attribution retention per-tablo; CORE worker'lar gate'siz.
  - **Store-admin direct-URL guard** ([[TD-155]]): paylaşılan route→modül haritası + `module-access` +
    `ModuleGuard` server component + 14 route `layout.tsx` → kapalı sayfa data fetch/render YOK.
  - **Kalan storefront gate'leri** ([[TD-156]]): tracker/similar/reviews/sponsored/influencer/wishlist —
    kapalı modül veri çekmez + render etmez + event üretmez; sponsored token üretimi gateway'de kesildi.
  - **Plan → capability editörü** ([[TD-154]]): SAF `plan-capabilities` (required/optional/unavailable +
    doğrulama + preview + merge) + gateway `/admin/plans/:id/capabilities` + platform-admin PlanEditor UI.
  - **Testler:** api-gateway **1831** · storefront **446** · store-admin **360** · admin-web **24** PASS;
    tam workspace build (27/27) + lint (0 error) + migrate status up-to-date; canlı smoke PASS.
- **TODO-163 CLOSED.** Sıradaki: **TODO-164 Tenant Theme Architecture** bu capability temeli üstüne kurulur.

## TODO-164 — Tenant Theme Architecture (2026-07-30, CLOSED & DEPLOYED)

- **Amaç.** Her mağaza ORTAK storefront engine üzerinde kendi görünümünü kullanabilir. Üç katman
  (Theme Tokens · Layout Presets · Versioned Custom Theme Package) mevcut Enterprise Theme Engine
  (TODO-158B/ADR-087) + H-1 typed-token savunması ÜSTÜNE kurulur; paralel storefront YOK.
- **Kapsam.**
  - `@commerce-os/theme`: **theme-key registry** (BASE + 4 layout preset + custom package; unknown reddi),
    **slot contract** (8 slot, typed variant allowlist, presentation-only), **layout presets**
    (BASE_COMMERCE/FASHION_MINIMAL/FASHION_EDITORIAL/MARKETPLACE_DENSE/PREMIUM_BOUTIQUE), **custom package**
    manifest + `demo-aurora` (`packages/themes/`), **compatibility** (themeApiVersion/semver/slot/status),
    **config** (draft/publish/rollback slot yapılandırması).
  - DB additive migration `20260730140000_tenant_theme_architecture`: `Theme.themeKey/layoutPreset/
    themeApiVersion` + `ThemeVersion.config/themeKey/layoutPreset/publishedBy`. Backfill BASE_COMMERCE →
    görünüm KORUNUR (immutable migration).
  - Gateway: public resolver (published custom/preset → base fallback) + ALLOWLIST projeksiyon (css +
    colorScheme + layoutPreset + slots) + store-scoped bounded cache + publish/assign/modül-değişimi
    invalidation; publish compatibility gate (409); Platform Admin `/admin/stores/:id/theme-binding`.
  - Storefront: `ThemeSlotsProvider`/`useSlotVariant` + `data-layout-preset`/`data-*variant` + gerçek CSS
    variant farkları (ProductCard/Header/Hero/Footer/MobileNav).
  - UI: store-admin Theme Studio layout preset seçici (config); platform-admin "Tema ve Marka" paneli.
- **Kararlar.** **ADR-216…ADR-224**. Analiz: `docs/analysis/TODO-164-tenant-theme-architecture.md`.
- **Canlı smoke (enterprise-demo).** Base render (BASE_COMMERCE + tam slot haritası); draft (FASHION_MINIMAL
  kaydedildi, production DEĞİŞMEDİ); publish (storefront FASHION_MINIMAL + compact, cache invalidate,
  demo-store etkilenmedi); rollback (base'e döndü); capability disable→base / re-enable→published; compat
  (uyumsuz publish 409, storefront base fallback). Testler: `@commerce-os/theme` **180** + api-gateway
  theme/capability route PASS.
- **Git.** Bu aşamada commit/push/PR/merge/deploy YOK (prompt kuralı) — implementasyon + smoke + docs tamam, DUR.

## TODO-164A — Custom Theme Builder (2026-07-31, CLOSED & DEPLOYED)

- **Amaç.** Mağazaları birkaç sabit presete mahkûm etmemek; kod yazmadan gerçek farklı storefront temaları
  üretmek. Ortak engine + slot contract + H-1 güvenlik modeli KORUNUR (paralel motor/storefront YOK).
- **Kapsam.**
  - `@commerce-os/theme`: **genişletilmiş builder config** (`builder-config.ts` — slotVariants + tokenOverrides
    + typography + container + radius + shadow + buttonStyle + surfaceStyle + productCard + listing +
    productDetail + hero + navigation + media + responsiveOverrides + colorScheme; strict/bounded/H-1-tipli),
    **WCAG contrast publish gate** (`contrast.ts`), **responsive/yapısal CSS serializer** (`builder-css.ts` —
    `--tb-*` + sistem breakpoint `@media`), **başlangıç noktaları** (`starting-points.ts` — BASE/FASHION_MINIMAL/
    FASHION_EDITORIAL/PREMIUM_BOUTIQUE/EMPTY, registry MUTATE etmez), **slot variant genişleme** (her slot ≥3
    adlandırılmış variant, additive; eski + default KORUNUR).
  - DB additive migration `20260730160000_custom_theme_builder`: `Theme.duplicatedFrom/createdBy/updatedBy`
    (nullable; görünüm değişmez). Builder config genişlemesi `ThemeVersion.config` JSON'unda → şema değişmez.
  - Gateway: create `startingPoint`; **duplicate** / **archive** / **preview-token** uçları; draft/publish
    builder config doğrulama (INVALID_THEME_CONFIG / THEME_INCOMPATIBLE); **contrast gate** (THEME_CONTRAST_FAILED
    409); public projeksiyon builder CSS EKLER + slotVariants merge; **public preview projeksiyonu** (imzalı
    token, prod cache'ten AYRI); binding'e draftThemeCount/sourcePreset/lastUpdatedAt.
  - Storefront: 8 slotun TAMAMI bağlı (3 bağlanmamış slot + PLP/PDP/home wiring) + gerçek variant CSS
    (UNLAYERED, layout farkı); `--tb-*` tüketimi; **middleware+cookie preview** (draft render, prod değişmez).
  - Store Admin: Theme Studio → **görsel builder** (Yapı: slot variant + yapısal; Stil: token editörü;
    Önizleme: desktop/tablet/mobile + gerçek vitrin iframe); startingPoint; **Kopyala/Arşivle**.
  - Platform Admin: binding paneli draftThemeCount + sourcePreset + lastUpdatedAt.
- **Kararlar.** **ADR-225…ADR-231**. Analiz: `docs/analysis/TODO-164A-custom-theme-builder.md`.
- **Testler/gate.** `@commerce-os/theme` **229** (48 yeni) · contracts **115** · api-client **23** · api-gateway
  **1850** (8 yeni builder route testi) · storefront **446** · store-admin **360** · admin-web **24** — TÜMÜ PASS.
  Build/typecheck/lint TÜM etkilenen paket+app temiz; `git diff --check` temiz.
- **Canlı smoke (enterprise-demo, gerçek stack + tarayıcı).** Migration `migrate deploy` (additive; 3 kolon
  nullable, mevcut 11 Theme/54 versiyon + published korundu, görünüm değişmedi). Stack worktree'den rebuild
  (4 servis). Builder (store-admin UI): startingPoint BASE_COMMERCE → 8 slot variant + renk/font/liste/hero/
  radius/gutter → draft (production DEĞİŞMEDİ) → publish → **storefront GÖRÜNÜR değişti** (DOM/CSS ile
  kanıtlandı: Header CENTERED_BRAND iki-satır, Footer MULTI_COLUMN, MobileNav BOTTOM_BAR fixed-bottom sheet,
  Hero EDITORIAL_OVERLAY 608px, ProductCard EDITORIAL 3:4+shadow, PLP EDITORIAL_GRID 3-kolon@1280, PDP
  GALLERY_FIRST tek-kolon, HomeFrame FULL_BLEED, accent #c2185b). Preview izolasyonu (imzalı token → draft
  render; prod cache ayrı; tampered/garbage token → 401). İkinci tema FASHION_EDITORIAL'dan → belirgin farklı.
  Duplicate (yeni kimlik/duplicatedFrom/history yok) · Archive (draft 200/published 409) · Rollback (görünüm
  geri döndü, yeni revizyon). Capability disable→base fallback+builder API 403+veri korundu / re-enable→published
  geri. Güvenlik: XSS token 400, unsafe length 400, unknown themeKey 400, unsupported variant 400. Contrast gate:
  düşük gövde kontrastı → 409 THEME_CONTRAST_FAILED. Responsive 375/768/1280/1440 taşma YOK.
- **Canlı smoke'ta yakalanan + düzeltilen 2 gerileme.** (1) FASHION_EDITORIAL preset'in vivid marka linki
  (#ff2d6f 3.6:1) contrast gate'i HARD engelliyordu → link pair `blocking:false` (WARNING; gövde metni HARD
  kalır) → shipped preset yayınlanabilir. (2) UI "Kenar boşluğu" (gutter) kontrolü `--tb-gutter`'ı emit ediyor
  ama storefront TÜKETMİYORDU → `.max-w-grid` padding-inline'a bağlandı (canlı doğrulandı 40px). TD-160 CLOSED
  (compose `NEXT_PUBLIC_STOREFRONT_URL`). TD-159 FUTURE (responsiveOverrides henüz builder-UI'da açık değil).

## TODO-164B — Theme Builder Productization & Role Separation (2026-07-31, Dilim 1 IMPLEMENTASYON, commit YOK)

- **Amaç.** Tema yönetimini iki role ayır: **Platform Admin = Theme Designer & Library**, **Store Admin = Brand
  Customizer**. Teknik iç detayları (slot contract, themeApiVersion, raw token) mağazadan kaldır; renk seçimini
  hex-only'den kurtar; font seçeneklerini genişlet; alan açıklamaları + preview highlight ekle. Mevcut motor +
  slot contract + H-1 KORUNUR (paralel motor YOK).
- **Onaylı kararlar.** (1) Platform temaları sistem mağazasında (`Store.systemPurpose="THEME_LIBRARY"`; tenant
  izolasyon invariant'ı korunur, sistem mağazası her yerden dışlanır). (2) Fazlı: Dilim 1 temel, Dilim 2 platform
  9-sekme Designer + versiyon upgrade + full-screen preview. (3) Logo/favicon tek otorite = StoreSettings.
- **Kapsam (Dilim 1).**
  - `@commerce-os/theme`: `override-policy.ts` (FieldPolicy + `enforceOverridePolicy` server-side + explicit gate),
    `font-library.ts` (16 aile / 18 preset / 8 kategori), `color-palettes.ts` (8 WCAG-güvenli palet), `field-labels.ts`.
  - DB additive `20260731120000_theme_productization_role_separation` (`Store.systemPurpose`, `Theme.ownerScope/
    overridePolicy/sourceThemeId/sourceThemeVersion`; mevcut veri korunur).
  - Gateway: override policy enforcement (409 THEME_FIELD_LOCKED/FONT/LAYOUT/POLICY_INCOMPLETE); detail projeksiyonu;
    binding assign policy; sistem mağazası dışlama (resolvePublicStore 404 + listStores + fleet).
  - Store-admin: "Marka ve Görünüm" (ColorField picker+kontrast+açıklama+palet+font önizleme; teknik alanlar kaldırıldı).
  - Storefront: `ThemePreviewHighlight` (postMessage; yalnız preview cookie).
- **Kararlar.** **ADR-232…ADR-237**. Analiz: `docs/analysis/TODO-164B-theme-productization.md`.
- **Testler/gate.** theme **268** · gateway **1857** (7 yeni policy testi) · store-admin **365** (5 yeni) · contracts/
  api-client/storefront/admin-web build — TÜMÜ PASS. build 27/27 · lint temiz · typecheck temiz · git diff --check temiz.
- **Durum.** Dilim 1 SHIPPED & DEPLOYED (PR #156, merge `4ed0629`).

### Dilim 2 — Platform Theme Library, Designer & Controlled Rollout (2026-07-31, IMPLEMENTASYON, commit YOK)

- **Kapsam.**
  - `@commerce-os/theme`: `theme-diff.ts` (kullanıcı-dostu before/after özeti — renk/tipografi/düzen/slot/medya/
    policy) + `library.ts` (kütüphane store kimliği, `computeUpdateAvailable`, controlled rollout tipleri/özeti).
  - DB additive `20260731130000_theme_library_designer_rollout` (`Theme.policyRevision`, `ThemeVersion.
    stagedLogoMediaId/stagedFaviconMediaId/assetSnapshot`; mevcut veri korunur).
  - Gateway `theme/library-routes.ts` (SUPER_ADMIN): kütüphane CRUD + designer draft + policy matris + publish
    (policy-explicit gate) + archive/duplicate/rollback + version-scoped preview token + diff + usage + assignable
    stores + assign/preview (dry-run) + assign + update/apply (controlled rollout). Logo staging atomik publish
    (`data.ts` publishTheme/rollbackToVersion). Store-admin `platform-status` ucu.
  - api-client: `admin.themeLibrary.*` + `admin.theme.platformStatus`. Contracts: library/policy/diff/usage/
    rollout/preview şemaları.
  - admin-web: "Tema Kütüphanesi" nav + liste + 9-sekme Designer (Şablon/Marka/Renk/Tipografi/Bileşenler/Sayfa
    Düzenleri/Mobil/Önizleme/Yayınlama) + PolicyMatrix + AssignmentDialog (rollout) + PreviewFrame (çok-sayfa/
    çok-viewport/before-after) + BeforeAfter.
  - store-admin: Brand Customizer üstü `PlatformThemeBanner` (aktif platform teması + update-available + editable/
    locked; salt-okuma). storefront: version-scoped preview token + middleware request-cookie forward (ilk yük draft).
- **Kararlar.** **ADR-238…ADR-245**.
- **Testler/gate.** theme **287** · gateway **1866** (9 yeni library testi) · store-admin **365** · contracts **115** ·
  api-client **23** · admin-web **30** (6 yeni) · storefront **446** — TÜMÜ PASS. admin-web/store-admin/storefront
  Next build + tüm paket build PASS · lint temiz · typecheck temiz · git diff --check temiz.
- **TD.** TD-162 CLOSED · TD-163 CLOSED · TD-164 OPEN (non-blocking — sistem/bundled font yükleniyor; harici hosting future).
- **AÇIK.** **commit/push/PR/merge/deploy YOK** (bu aşamada). Canlı stack smoke deploy sonrası (post-deploy).

### TODO-166 — Slug & Redirect Management — ✅ CLOSED & DEPLOYED (PR #164, merge `e253fa7`; 2026-08-03)

- Amaç: Store-admin için merkezi **SEO > Slug ve Yönlendirmeler** modülü — mevcut slug/redirect motorunu
  (TODO-156D: SlugHistory/Redirect + `@commerce-os/utils` SAF resolver) yönet; yeni motor kurma.
- Kapsam: Gateway admin uçları (`/stores/:storeId/seo/redirects` + `/seo/slugs`, `CATALOG` core-gate),
  api-client + BFF proxy, DataGrid tabanlı Slug/Yönlendirme ekranları + detay drawer + manuel redirect
  formu (ADR-089/090 desenleri). **BRAND** motora eklendi (`SlugEntityType += BRAND`, `brandUrlPath`,
  atomik `recordSlugChange`). `Redirect.origin` (AUTOMATIC/MANUAL) — otomatik salt-toggle, manuel tam CRUD.
- Kabul: SAF motor + governance + servis testleri; tam gate (build/lint/typecheck/2097 gateway test);
  GERÇEK browser smoke (worktree stack + enterprise-demo + docker postgres) — ürün+marka eski URL → 301,
  slug/redirect listeleri + detay + filtre + pasifleştirme. Smoke 2 bug yakaladı+düzeltti (hedef-query,
  entityType-pagination).
- 404 önerileri: yakalama altyapısı YOK → future. Kategori runtime redirect: TD-064 sınırı (query-tabanlı).
- Durum: TD-057 KAPANDI. Bkz. `docs/analysis/SLUG-redirect-management.md`.

### TODO-165 Fashion Vertical Foundation — ✅ CLOSED & DEPLOYED (PR #158, main `83bcd8e`; 2026-08-02 düzeltildi)

> Completion Recovery: çekirdek kullanıcı değeri TD-166'ya ERTELENMEDİ; tümü TODO-165 içinde
> tamamlandı ve GERÇEK browser + GERÇEK DB (docker postgres) ile doğrulandı. Aşağıdaki "İNEN &
> DOĞRULANAN" listesi güncel; "KALAN" kutusu kapatıldı.

- **Amaç.** Modular içine moda/tekstil dikeyi (ürün/varyant/beden/renk/sezon/koleksiyon + fashion PDP/PLP/
  admin akışı) **tenant-capability kontrollü** ekle. Kapalıyken çekirdek commerce aynen korunur. Analiz:
  `docs/analysis/TODO-165-fashion-vertical-foundation.md`.
- **İNEN & DOĞRULANAN (bu oturum).**
  - **Capability** `FASHION_VERTICAL` (registry.ts; opt-in `baselineEnabled:false`; resolver/cache/matrix/
    plan-editor/projeksiyon otomatik alır). Gate: `requireStoreAdminForModule`/`resolvePublicStoreForModule`.
    Capability testleri güncellendi (opt-in) — **55 PASS**.
  - **Typed size-system registry** `@commerce-os/contracts/size-systems` (10 sistem; ordered/normalized/locale/
    kategori-uyum; serbest JSON yok) — **15 PASS**.
  - **Kanonik fashion attribute katalogu** `api-gateway/src/fashion/canonical-attributes.ts` (PLATFORM EAV reuse;
    color-family map + hex-swatch doğrulama). Yeni motor YOK.
  - **Şema + additive migration** `20260731140000_fashion_vertical_foundation`: `SizeChart`/`SizeChartRevision`/
    `SizeChartAssignment` + `OrderLine` 7 additive fashion snapshot kolonu (+ SizeChart draft JSON). `db:generate` OK.
  - **Size-chart backend** (service+prisma data+routes, capability-gated, tenant-scoped, XSS-guard, advisory-lock
    publish/rollback) — server.ts'e wire edildi, **api-gateway build PASS**; servis testleri **11 PASS**.
  - **Order snapshot resolver** (saf `resolveFashionLineSnapshot`, server-authoritative, immutable) — **5 PASS**.
  - **Contracts** size-chart şemaları; contracts + api-gateway build temiz.
- **TAMAMLANAN entegrasyon (Completion Recovery).**
  - **Order snapshot wiring**: `createOrder`+`addOrderLine` select genişletildi (variant `optionValueSelections` +
    product `attributeValues`); saf `resolveFashionSnapshotFromPrisma` ile 7 alan server-side dolduruldu; müşteri
    order summary/detail serializer + contracts genişledi. **GERÇEK sipariş (OS-000005, Beyaz/M×2) → snapshot doğru;
    ürün+varyant başlığı değiştirilince snapshot DEĞİŞMEDİ (immutability PASS).**
  - **Public DTO**: `publicProductDetailSchema.fashion` (capability-aware; kapalıyken null) + `buildPublicFashionProjection`
    (yapısal color/size eksenleri, variantAxisOptions, attribute özetleri, sizeSystemKey, published size chart —
    scope PRODUCT>CATEGORY>STORE). Curl ile doğrulandı.
  - **Storefront PDP**: renk swatch + beden seçici + **OOS beden disabled** (buy-box `soldOut` her zaman disable +
    renk değişiminde stok-gerektiren auto-heal — smoke sırasında bulunan hata düzeltildi) + seçili renge göre medya +
    **beden tablosu modal** + materyal/kalıp/sezon + düşük stok + eksik seçimde ATC engeli. Fashion-dışı/kapalı → klasik.
  - **Storefront PLP**: fashion facetleri (renk swatch + beden ızgara + sezon/koleksiyon/materyal/fit) — `resolveFacetKind`
    `size` branch + `facet-size-grid`; disjunctive facet + store-scoped count (backfill). URL codec korundu.
  - **Store Admin**: `admin.sizeCharts.*` api-client + BFF + **Beden Tabloları** sayfası (liste/oluştur/düzenle/publish/
    rollback/arşiv/bağla) + **10-adım fashion wizard** (Stepper primitive; tek RHF; capability kapalı → klasik form) +
    nav ModuleGuard. GERÇEK browser'da doğrulandı (seed'li chart "Yayında"; wizard 10 adım render).
  - **Seed**: `packages/db/scripts/fashion-demo-seed.mjs` (idempotent, `fash-` prefix, enterprise-demo scope) →
    3 kategori · 12 ürün · 155 varyant (41 OOS) · size chart (PUBLISHED+revision+CATEGORY ataması) · `edm-store`
    FASHION_VERTICAL=ENABLED; `demo-store` KAPALI. Search backfill (12 doc, 155 facet değeri).
  - **Migration**: `prisma migrate deploy`+`status` GERÇEK DB'de PASS; additive (473 ürün/2205 varyant/6 sipariş korundu).
  - **Capability**: DISABLE→fashion null + veri korundu + public modules false; ENABLE→geri geldi (30s cache TTL).
- **Kararlar.** **ADR-246…ADR-252**.
- **Testler/gate.** api-gateway **1893** (fashion size-chart 11 + order-snapshot 8 + capability) · contracts **130**
  (size-systems 15) — PASS. contracts/api-client/api-gateway/db/storefront/store-admin build PASS · lint temiz ·
  git diff --check temiz. GERÇEK browser smoke (PDP/PLP/order/capability/store-admin/responsive-375) PASS.
- **DURUM (2026-08-02 güncellendi).** ✅ **CLOSED & DEPLOYED** — PR #158, main `83bcd8e`. (Önceki
  "commit YOK" ifadesi bayattı.)

### TODO-165A — Product Data Governance & Editing UX Recovery — ✅ CLOSED & DEPLOYED (PR #160, merge `bfb88f2`; 2026-08-02 düzeltildi)

- **Amaç.** TODO-165'in serbest-metin `Product.brand` string'ini + sabit-kod fashion sözlüklerini
  (season/collection/material/fit/…) store-yönetilebilir governance katmanlarına taşı; size-chart bağlamayı
  raw-ID input'tan searchable selector UX'e geçir. Mevcut EAV/capability/size-chart/tenant/selector (ADR-090)
  motorları REUSE — paralel sistem YOK. Analiz: `docs/analysis/TODO-165A-product-data-governance.md`.
- **İNEN & DOĞRULANAN.**
  - **Brand entity**: store-scoped `Brand` modeli + `Product.brandId` (relation `governedBrand`); legacy
    `Product.brand` string DORMANT (dual-write) korunur; public DTO'lara additive `brandRef` (ACTIVE-only);
    search read-model brand alanları denormalize → PLP brand facet + `/markalar/[slug]`. Brand modülü `CATALOG`
    (core, her zaman açık) ile gate'li — tüm mağazalar kullanabilir. Store-admin "Markalar" modülü (DataGrid +
    editor + ürün formu selector + quick-create).
  - **Store-scoped fashion taksonomileri**: `ProductTaxonomyValue` (governance otoritesi) ↔ store-scoped
    `AttributeOption` (1:1, atama/facet kimliği) — her mağaza kendi opsiyonunu sahiplenir, global kanonik
    opsiyon paylaşılan governance kaydı değildir. Governed opsiyon mutasyonu yalnız taxonomy servisinden
    (`409 ATTRIBUTE_OPTION_GOVERNED` generic endpoint'lerde). Çok-kiracılı benzersizlik iki partial unique index
    ile (global/store). Okuma önceliği store-scoped>global, de-dupe. `FASHION_VERTICAL` gate'li. Store-admin
    "Ürün Sözlükleri" (tip-başına sekme, quick-create/arşiv/usageCount/reorder) + ürün formu governed fashion
    attribute'ları taxonomy-backed searchable select + quick-add.
  - **Bootstrap/provisioning**: migration-time backfill (`20260801130000`, `20260801140000`) + PLATFORM
    fashion-definition provisioning (`20260802120000`, 11 tanım, idempotent, mağaza-bağımsız) + runtime
    `ensureStoreTaxonomyDefaults` DISABLED→ENABLED geçişinde (fail-closed: bootstrap başarısızsa capability
    sessizce "enabled" görünmez) + taxonomy list/quick-create'te lazy safety-net (plan-seviyesi enable gibi
    diğer yolları self-heal eder). Kanonik güncelleme additif; mağaza-yönetilen değerleri asla overwrite etmez.
  - **Size-chart selector UX**: yeni `GET /stores/:storeId/size-charts/selector` (dual-mode); `resolveEffective`
    TEK precedence implementasyonu (PDP+admin paylaşır); merkezi `AssignModal` + ürün formu `size-chart-step.tsx`
    raw ID input'ları searchable `EntitySelectorModal`'a taşındı. **TODO-165'te bulunan iki gerçek bug
    düzeltildi**: `assign()` PUBLISHED-durum guard'ı eklendi (`SIZE_CHART_ASSIGN_NOT_PUBLISHED`); `upsertAssignment`
    yanlış anahtar (sizeChartId dahil) düzeltildi → ikinci ürün bağlaması ilkinin yerini alır (gerçek
    `@@unique` ile hizalı).
  - **Selector'lar (ADR-090 reuse)**: Brand/Category/Product/Size-chart hepsi aynı `?ids=` + arama/sayfalama
    desenini kullanır; hiçbir ekranda raw ID input yok (grep-clean).
- **Kararlar.** **ADR-253…ADR-258**.
- **Testler/gate (SDD ledger Task 29, tam gate — GREEN).** `pnpm db:generate` + `pnpm build` **27/27** ·
  `pnpm -r exec tsc -p tsconfig.json --noEmit` **exit 0** · `pnpm test` **3320/3320** · `prisma migrate status`
  **74** migration uygulanmış · `git diff --check` temiz · search read-model reindex **430/430** (marka alanları
  dolu). 5 pre-existing PR#158 fashion fixture type-drift'i additive-only greenlendi (branch'in kendi
  regresyonu değil).
- **Gerçek browser smoke (SDD ledger Task 30, GERÇEK DB+stack — PASS).** İzole stack (kendi api-gateway:4001 +
  storefront:3010 + store-admin:3012, isolated DB `commerce_os_todo165a`; kullanıcının :4000/:3000/:3002 stack'i
  dokunulmadı): storefront `/markalar` dizini (desktop+mobile, gerçek markalar) · brand facet canlı ·
  Brands admin liste+create (71→72) · Ürün Sözlükleri (tip-sekme, usageCount, reorder) · ürün formu Fashion
  Özellikleri (searchable SEZON select + round-trip pre-select + quick-add) · merkezi size-chart AssignModal
  (STORE=kimliksiz, PRODUCT=searchable 483 ürün, raw ID YOK) · responsive 375px.
- **Güvenlik/tenant (SDD ledger Task 31).** 3320/3320 testin içinde tenant-isolation cross-store-rejection,
  capability 403 MODULE_DISABLED, governed-option 409, arşivli-varlık reddi, size-chart cross-store 403,
  `TAXONOMY_NOT_PROVISIONED` fail-closed. Plain-text validasyon (raw HTML/CSS/JS yok), colorHex regex, media
  yalnız store-owned (storageKey sızmaz), client-supplied id server-side store-scoped doğrulanır. Yeni admin
  UI'da `dangerouslySetInnerHTML` sıfır (grep).
- **DURUM (2026-08-02 güncellendi).** ✅ **CLOSED & DEPLOYED** — PR #160 (merge `bfb88f2`), main `83bcd8e`.
  (Önceki "commit YOK" ifadesi bayattı.) Ertelenen küçük borçlar `docs/TECHNICAL_DEBT.md`'de.

## Sıralama (§29 — güncel öncelik)

> **Güncelleme (2026-08-02, Final Polish readiness audit):** TODO-165 / 165A / 165B artık **CLOSED &
> DEPLOYED** (`main == origin/main == 83bcd8e`; PR #158 fashion, PR #160 165A `bfb88f2`, PR #161 165B).
> Aşağıdaki "IMPLEMENTED / commit bekliyor" ifadeleri bayattı ve düzeltildi. Sıradaki aktif iş:
> **Final Enterprise UI Polish** (readiness = **READY**; bkz. `docs/TECHNICAL_DEBT.md` "Final Enterprise
> UI Polish — Readiness Audit (2026-08-02)").

1. **Final Enterprise UI & Design Polish** — **SIRADAKİ AKTİF İŞ** (readiness audit READY; kapsam:
   TD-170, TD-173, TD-157, C1 form `aria-describedby`, D1 Modal focus-trap, B1 storefront buton/input token
   birleştirme — bkz. readiness raporu).
2. Kalan launch blocker + teknik borçlar (**PB-3/TD-139 offsite backup — tek açık PROD BLOCKER, altyapı**,
   TD-147 CSP, TD-148 FX, TD-164, TD-167+).

> **Tamamlanan (CLOSED & DEPLOYED, `83bcd8e`):** TODO-165A Product Data Governance (PR #160), TODO-165B
> PDP/Catalog/Slug Recovery (PR #161), TODO-165 Fashion Vertical Foundation (PR #158).

> Tamamlanan: **TODO-165 Fashion Vertical Foundation** (IMPLEMENTED, uçtan uca smoke geçti, commit YOK) ·
> **TODO-164 Tenant Theme Architecture** (CLOSED & DEPLOYED, PR #149) ·
> **TODO-163 Tenant Module & Capability** (CLOSED & DEPLOYED, Faz 1+2+3) ·
> **TODO-162 Storefront Discovery & Merchandising** (CLOSED & DEPLOYED) ·
> **Product Split Baseline** (DONE, yukarı bkz.).

> **Final Enterprise UI Polish** (IMPLEMENTED, worktree `commerce-os-ui-polish-872a6a`, commit YOK): Foundation
> primitive'leri (z-index/Tooltip/B1/C1/D1) + PDP (hover-zoom/layout/Reviews-tab) + Ana Sayfa duplicate redirect +
> TD-170 brand facet + FP-3 rating. Tam gate YEŞİL; browser smoke. Follow-up: TD-173, TD-157 kalanı, admin geniş tarama.
> Detay: `docs/analysis/FINAL-enterprise-ui-polish.md`.

> **Final Enterprise UI Polish — IMPLEMENTED** (worktree `commerce-os-ui-polish-872a6a`, commit YOK): Foundation
> (z-index/Tooltip/B1/C1/D1) + PDP (hover-zoom/layout/Reviews-tab) + Ana Sayfa duplicate redirect + TD-170 +
> FP-3 + TD-173 (ProductMediaFrame tam geçiş) + TD-157 (theme control wiring) + Platform Admin raw-enum temizliği
> + Settings kararı. Tam gate YEŞİL (test 1231, build 9/9); browser matris 375/768/1024/1280. Kalan PROD BLOCKER
> pre-existing PB-3/TD-139 (offsite backup). Detay: `docs/analysis/FINAL-enterprise-ui-polish.md`.

## TODO-167 — Persistent Cart & Cross-Device Foundation (Faz A) — IMPLEMENTED (2026-08-03, worktree, commit YOK)

Hibrit cart: anonim=HMAC cookie (değişmez), authenticated=kalıcı DB cart (cross-device). Cart REFERANS tutar
(fiyat YOK; ortak `assemblePublicCart` — kaynağa göre farklı fiyatlama yok). Tek ACTIVE/(store,customer)
partial-unique; `Cart.version` optimistic-concurrency (409 CART_STALE); deterministik login-merge
(100-cap + MERGE_LIMIT_EXCEEDED); checkout DB-cart otoriter + CONVERTED; env-gated 90-gün expiry sweep
(default OFF). ADR-266. Gate YEŞİL (build 27/27 + lint 42/42 + test 2132 + git diff --check).
Faz B (**TODO-168 Cart Change Awareness**) BLOCKED_BY 167. Detay:
`docs/analysis/PERSISTENT-cart-implementation.md`.

## TODO-167 Persistent Cart — CLOSED & DEPLOYED (2026-08-03)

PR #165 merged (merge commit `0a602d2`). api-gateway + storefront-web rebuilt from main; migration
`20260803140000_todo167_persistent_cart` applied via `migrate deploy` (partial ACTIVE index verified live).
Post-deploy smoke 20/20 PASS (deployed gateway :4000): cart mechanics · CART_STALE concurrency · login merge ·
checkout DB-cart authority · convert-on-paid (settlement) · failed-payment→ACTIVE · DB invariants. Temp fixtures
FK-safe cleaned + inventory restored; enterprise-demo pristine (473 products / 9 orders unchanged). ADR-266
ACCEPTED. **TODO-168 (Cart Change Awareness) UNBLOCKED.** TD-174 open future; cart hard-delete/anonymization
future; cross-device Cart-Change acknowledgement = TODO-168 scope.

## TODO-168 — Cart Change Awareness (Faz B) — CLOSED & DEPLOYED (2026-08-03)

PR #166 MERGED (merge `65c7ca1`). api-gateway + storefront-web rebuilt/recreated from main (docker
`--no-deps`); migration `20260803150000_todo168_cart_change_awareness` applied to prod via `migrate deploy`.
Post-deploy smoke PASS on deployed gateway :4000 (prod-safe anon changeContext): INFO/WARN/checkout-409-
CART_CHANGED/ack-pass/back-in-stock/BLOCKING(temp stock restored)/analytics-dedupe/auth-ack-401-wired/
storefront-200. Mobile cart-line overflow fixed (no overflow 320-1440). enterprise-demo PRISTINE
(471 products / 9 orders). ADR-267 ACCEPTED. Open: TD-176 future.

### (implementation record)

Add-time snapshot vs live server-authoritative projection → deterministic change list; INFO surfaced /
WARN gates checkout (`409 CART_CHANGED` until acked) / BLOCKING keeps existing `409 CART_NOT_READY`. One shared
pure engine (`cart-changes/change-engine.ts`, identity-agnostic); snapshot/ack identity-split: **auth = DB**
(`CartLine` snapshot columns lazy-baseline + `CartChangeAck`, **cross-device ack**); **anon = signed
`commerce_os_cart_meta` cookie** (versioned, byte-budgeted, severity-aware pruning, orphan cleanup, malformed→
fail-safe). Snapshot is explain-only, never an order price; ack = fingerprint invalidation (no snapshot
mutation). `CartChangeEvent` best-effort analytics (RecommendationEvent pattern, KVKK-hash, idempotent).
UI: CartChangeBar + per-line markers + TR/EN + a11y. ADR-267. Additive migration
`20260803150000_todo168_cart_change_awareness` (no drop/backfill). Gate GREEN (build 27/27 · lint 42/42 ·
typecheck · test gateway 2184 [+52] / storefront 534 [+8] / store-admin 364 · `git diff --check`). Future:
`FREE_SHIPPING_ELIGIBILITY_CHANGED` + `SELLER_CHANGED` + event retention worker. Detail:
`docs/analysis/PERSISTENT-CART-roadmap.md` Faz B + `docs/adr/ADR-267-cart-change-semantics.md`.

## BUG-CART-002 — PDP availability, cart badge & line-selection consistency — CLOSED & DEPLOYED (2026-08-03, PR #167 merge `cf6823a`)

TODO-167/168 sonrası production-critical regresyon. (A) PDP fail-open bounded stok projeksiyonu
(`loadPublicStockMap(PUBLIC_CATALOG_MAX)` pencere dışı varyant → `inStock:true`) → tükenmiş varyant
"eklenebilir" görünüyordu; add endpoint stok kontrolü yoktu; başarı toast'ı optimistic'ti. (B) header badge
add sonrası `router.refresh()` yokluğundan stale kalıyordu. (C) auth checkbox deselection gateway'e taşınmıyordu
(re-check) + kargo `subtotal>0` kapısı yokluğundan "0 ürün + ₺49,90". Düzeltmeler: variant-scoped fail-CLOSED
stok (`loadPublicStockMapForVariants`), add-guard `409 VARIANT_OUT_OF_STOCK`/`VARIANT_STOCK_LIMIT`,
`AddToCartResult` + anon on-doğrulama, PDP OOS UX (disabled/strikethrough/aria "Tükendi", `selectColor`
sessiz-kaydırma kaldırıldı), `router.refresh()` badge senkronu, `deselectedVariantIds` auth VIEW+checkout
threading, kargo `hasShippableSelection` kapısı + vitrin "—". Gate GREEN (build 27/27 · gateway 2188 · storefront
534 · lint 0 error · typecheck). api-gateway + storefront-web main'den rebuild+recreate (postgres/redis/worker/
admin/store-admin DOKUNULMADI, volume korundu); migrate status "up to date" (yeni migration yok). Post-deploy
smoke PASS deployed :4000/:3000 (fail-open giderildi: deployed :4000 OOS varyant `available:0,inStock:false`;
OOS disabled+üstü-çizili+aria; add→badge refresh'siz+toast; deselect→"0 ürün/—/₺0/disabled"; re-select geri;
remove→badge temiz; mobil temiz). Açık follow-up TD-177 (PLP/home bounded stok) · TD-174 (cross-device
deselection persist). **Gift Card blocker KALDIRILDI.** TODO-168 DEĞİŞMEDİ. Detay:
`docs/analysis/BUG-CART-002-availability-badge-selection.md`.

## TODO-169 Returns Management Foundation — CLOSED & DEPLOYED (2026-08-04, PR #171 merge `360fb96`) — ADR-269

Müşteri iade talebi + Store Admin iade operasyon süreci. İade **OrderLine + quantity** seviyesinde modellenir
(bir sipariş zamanla N `ReturnRequest`; her request N `ReturnItem`; kısmi adet + çoklu satır + tekrarlı iade;
toplam talep+kabul+tamamlanan adet satın alınanı AŞAMAZ). İlk faz çözüm türleri: `REFUND_TO_ORIGINAL_PAYMENT`,
`REPLACEMENT` (Store Credit / Gift Card / Manufacturer / Instant / Exchange = FUTURE, enum-reserve edilmedi).
**Eligibility server-authoritative fail-closed:** order-level DELIVERED YOK → teslim shipment-seviyesi (≥1 DELIVERED
gönderi); stabil ankor additive `Shipment.deliveredAt` (DELIVERED geçişinde manuel+sync yollarında set, migration
mevcut DELIVERED'ları `updatedAt` ile backfill, çoklu gönderide MAX); `returnWindowDays` içinde; kalan iade
edilebilir qty > 0 (red/iptal/expire adedi havuza döner). Mağaza politikası `StoreSettings` additive 5 alan
(`returnWindowDays=14` TR mesafeli satış, `returnsRequireApproval`, `returnsCustomerPaysShipping`,
`returnsAllowReplacement`, `returnsAllowOriginalPaymentRefund`; satır yoksa aynı güvenli default). Saf state-machine
(`returns/status-map.ts`, 17 durum, terminal immutable, aktör yetkisi ayrımı, illegal→409). Append-only
`ReturnStatusHistory(actorType/actorId)` birincil audit; admin aksiyonları ek `recordAudit`. **Finans etkisi YOK bu
fazda:** `RefundIntent` PENDING oluşur ama `refundAmountsSupported=false` KALIR, gross satış azalmaz; ADR-268 §5
`OrderRefund` defterinin upstream'i (TODO-170 işler). Tutar SAF hesap (immutable OrderLine snapshot × iade oranı;
order-discount gross-ağırlıklı dağıtım son-satır remainder; inclusive KDV üstüne eklenmez; kargo yalnız politika/
admin kararıyla). Restock yalnız `RESTOCK_AS_SELLABLE` (idempotent, `InventoryMovement RETURN` +
`InventoryAdjustment RETURN_RESTOCK`). Attachment PRIVATE (`MediaContext.RETURN_ATTACHMENT`; public `/media/*`
onRequest guard 404; auth-gate'li stream; `StorageDriver.read`). Kargo: mevcut carrier/label altyapısı iade-etiketi
üretmez → ilk faz manuel talimat + müşteri tracking no + admin "teslim alındı" (sahte etiket YOK). Bildirim
post-commit fail-open (domain txn rollback etmez; gerçek email teslimi platform-geneli placeholder — dürüstçe
dokümante). Backend `apps/api-gateway/src/returns/` (status-map · eligibility · refund-calc SAF+36 birim test ·
service · routes-customer/admin/attachment · serialize); contracts return şemaları; `StoreSettings` politika wiring.
Migration `20260804090000_todo169_returns_management_foundation` (additive: 8 yeni enum + 2 enum value +
`Shipment.deliveredAt` + `StoreSettings` 5 alan + `ReturnNumberCounter/ReturnRequest/ReturnItem/ReturnAttachment/
ReturnStatusHistory/RefundIntent`). Backend gate: gateway typecheck 0 hata. UI: storefront müşteri sihirbazı
(ürün/adet → neden/açıklama/foto → çözüm → özet/onay + takip ekranı) + admin `Siparişler > İadeler` (liste + detay
+ aksiyonlar). **Kapsam dışı:** gerçek provider refund (TODO-170), Gift Card / Store Credit, Marketplace repo,
otomatik iade etiketi, PB-3/TD-139. Karar [ADR-269](./adr/ADR-269-returns-authority-and-lifecycle.md); analiz
`docs/analysis/RETURNS-management-foundation.md`. **TODO-170 Refund Ledger & Payment Reversal — BLOCKED_BY TODO-169.**

**TODO-169.1 Customer & Order Integration Recovery — CLOSED & DEPLOYED (2026-08-04, PR #173 merge `eef32e0`)** —
post-deploy kabul denetiminde çıkan 6 blocker düzeltildi (additive, **ek migration YOK**): iade penceresi görünürlüğü
(deliveredAt-türevi), özet CTA responsive, Store-Admin iade görseli (ortak cover helper), geri-kargo UX, sipariş listesi
iade rozeti + review regresyonu, sipariş detayı iade entegrasyonu + **pending finansal etki** (RefundIntent PENDING ≠
gerçekleşen; Financial Reporting revenue DEĞİŞMEZ, `refundAmountsSupported=false`). Ortak `returns/projection.ts` tek
server-side otorite (customer list/detail + admin order detail + eligibility). Gate 0 hata, 4229 test yeşil; api-gateway+
storefront-web+store-admin-web main'den rebuild+recreate (`--no-deps --force-recreate`; postgres/redis/worker/admin-web
DOKUNULMADI, volume korundu); post-deploy smoke PASS (window/badge/lifecycle→RESTOCK/REFUND_PENDING/admin imageUrl/
pending etki/security 404·409; izole fixture temizlendi). Ayrıntı [ADR-269 §11](./adr/ADR-269-returns-authority-and-lifecycle.md)
+ analiz §5. **TODO-169 + TODO-169.1 CLOSED & DEPLOYED; ADR-269 ACCEPTED & DEPLOYED; TODO-170 UNBLOCKED.**

## Financial Reporting Foundation — CLOSED & DEPLOYED (2026-08-03, PR #168 merge `9a4c8db` + fix PR #169 `eb31cc3`)

Store-Admin **Finans > Raporlar** modülü: sipariş SNAPSHOT'larından türetilen (canlı fiyat DEĞİL) mağaza-geneli
finansal raporlar. Kapsam: satış özeti (KPI + günlük seri + önceki-dönem karşılaştırması), ürün/varyant
performansı, kategori & marka kırılımı, ödeme raporu, indirim raporu, CSV export (BOM'lu, injection-korumalı).
Tek server-side metrik sözlüğü (`finance/metrics.ts`, SAF) + tz-aware bounded aralık (`resolveRange` yeniden
kullanım) + `$queryRaw` DB agregasyonu (günlük-grain → saf fold ⇒ reconciliation yapıca garanti). KDV inclusive
(revenue'ya 2. kez eklenmez); her currency AYRI (FX yok); satış ≠ tahsilat. **Refund tutar defteri YOK →
uydurulmaz** (yalnız iade ADEDİ + `refundAmountsSupported=false`); minimum `OrderRefund` read-model'i ADR-268
§5'te KARARLAŞTIRILDI. **Kârlılık** cost snapshot mevcut olduğundan DESTEKLENİR, kapsam-kapılı (all-or-null).
**Migration YOK** (snapshot sorgusu; `FinancialDailyAggregate` gelecek ölçek yolu). Yeni capability key YOK
(Orders/dashboard katmanı; store-scoped 404 izolasyonu). Gate GREEN: build 27/27 (`/finance/reports` + 9 BFF
route) · typecheck temiz · lint 0 error · test 4171 (api-gateway alt kümesi 2219; 32 finans). **Deploy:**
api-gateway + store-admin-web main'den rebuild+recreate (`--no-deps`; postgres/redis/worker/storefront/admin-web
DOKUNULMADI, named volume'lar korundu); migration YOK, schema "up to date". **Post-deploy smoke PASS:** izole
fixture (normal/indirimli/kargolu/ücretsiz-kargo PAID + CANCELLED + UNPAID + USD; CARD/BANK_TRANSFER) deployed
:4000 API'de reconciliation birebir (gross 419400 / net 411400 / cancelled hariç / unpaid ödemede yok / USD ayrı),
deployed :3002 UI enterprise-demo'da render + currency dropdown fix (TRY seçili → [TRY,USD]), responsive 375/768/
1440; fixture FK-güvenli temizlendi (demo-store pristine). Follow-up fix PR #169: currency seçimi sonrası dropdown
çökmesi (availableCurrencies tümünü listeler). Karar: [ADR-268](./adr/ADR-268-financial-reporting-authority.md);
analiz: `docs/analysis/FINANCIAL-reporting-foundation.md`. Future: refund tutarı, payment fee, FX,
profitability allocation, FinancialDailyAggregate, XLSX, scheduled reports, platform cross-store.

## Gift Cards & Store Credit — FUTURE BACKLOG

Bu fazda geliştirilmedi. Financial Reporting sözlüğü, gelecekte gift card issued liability / redeemed
allocation / outstanding & expired balance / store credit movement kaynaklarını EKlenebilir şekilde tasarlandı;
ancak bugün sahte kolon, sıfır değer veya boş Gift Card kartı GÖSTERİLMEZ.

## Pre-Refund UX Recovery & Unified Session Policy (design) — 2026-08-04

- Durum: **IMPLEMENTED (item 1/2/4) — TAM GATE + BROWSER SMOKE PASS, COMMIT YOK.** ADR-270. Item 3 Unified
  Session Policy = **DESIGN-ONLY** (ADR-271), sıradaki bağımsız faz.
- Amac: TODO-169 sonrası müşteri/mağaza çıkmazlarını kapatmak — bozuk iade CTA'sı, görünmeyen bekleyen iş,
  onaydan sonra erişilemeyen geri-kargo akışı.
- Kapsam: (1) BUG-RETURN-DEEPLINK — projeksiyon `primaryReturnNumber` + tek canonical `resolveReturnCtaHref` +
  order-detail `#returns` erişilebilir focus. (2) Pending Work Indicators — gateway bounded aggregate
  (`/stores/:id/pending-work-summary`, 2 groupBy) → sidebar rozet + dashboard "Bekleyen İşler" + mutation
  event-refresh; Platform Admin'e mağaza-op sayacı YOK. (4) Return-shipment — approve → otomatik
  `AWAITING_SHIPMENT` (aynı tx) + `shipByDate` + "Ürünü geri gönderin" + admin "Müşteri tarafından gönderildi".
- Kabul kriterleri: migration YOK; gate GREEN (typecheck 0 · lint 42/42 · test 42/42 gw 2279 · build 27/27);
  gerçek browser smoke storefront + store-admin (CTA deep-link/focus · badge 3→2 mutation · ship→RETURN_SHIPPED→
  RECEIVED · responsive 375/768/1024/1440); demo restore. Item 3 yalnız analiz+plan (ADR-271).
- Sonraki: **Unified Session Policy** implementasyonu (ADR-271 §5, 7 adım) → sonra TODO-170 Refund Ledger.

## Unified Session Policy (ADR-271) — ✅ ACCEPTED & DEPLOYED (post-audit hardening; PR #177) — 2026-08-05

- Durum: **🔶 IN_PROGRESS — post-audit hardening; ship M1 kararı + M2 deploy runbook'a bağlı; COMMIT/DEPLOY YOK.**
  ADR-271 §7 (temel) + **§8 hardening**. Analiz + implementasyon + tam gate + gerçek browser smoke sonrası
  cross-module review deploy/correctness açıkları buldu; hardening additive olarak §7 üzerine eklendi (git kuralı
  gereği duruldu).
- **Post-audit hardening (ADR-271 §8 / ADR-269):** M1 policyVersion legacy cutover (sessiz kitlesel-logout önlendi) ·
  M2 fast-default migration (full-table lock yok; §7 backfill'i büyük tabloda kilit yapabilir → düşük trafik/maintenance
  penceresi) · S1 `/me`/logout/extend `countAsActivity=false` · S2 multi-tab false-expiry `me()`-teyitli · S4 logout CSRF
  cookie temizliği · C1 private media guard iteratif-decode/segment-bazlı (substring bypass kapatıldı) · R1–R5 return
  financial invariants (RefundIntent CANCELLED lifecycle · advisory lock · atomic optimistic version · COMPLETED guard) ·
  P1/P2 admin-actionable allowlist. Follow-up migration `20260804170000_adr271_returns_session_hardening`.
- Amaç: Storefront + Store Admin + Platform Admin için ORTAK oturum politikası — idle + absolute iki-kapı,
  remember-me, extend (rotation), warning modal + geri sayım, multi-tab, safe returnTo, güvenli logout.
- Kapsam: tek policy kaynağı (`packages/config/src/session-policy.ts`); additive migration
  (`lastActivityAt`/`absoluteExpiresAt?`/`rememberMe`/`rotatedFromSessionId`, backfill, replay-safe); gateway
  dual-gate + throttle'lı sliding refresh + extend uçları (platform+customer, CSRF/rate-limit, absolute sabit,
  expired diriltilmez); 3 app remember-me UI + cookie policy'den + ortak `SessionGuard` (a11y modal + aria-live
  geri sayım + BroadcastChannel `*_session_sync`) + safe returnTo + expiry mesajı. `expiresAt` REPURPOSE EDİLMEDİ
  (korundu; idle hesaplanır). store-admin PlatformSession'a biner. Token httpOnly (JS/localStorage'da YOK).
- Kabul: gate GREEN (repo-typecheck exit 0 · lint 0 error · config 48/contracts 151/gw 2279/admin 36/store-admin
  368/storefront 550); live API smoke (login/me/extend-rotation/idle-expiry/expired-cannot-extend/remember windows)
  + real browser smoke (admin tam yaşam döngüsü + storefront login/remember-me + mobil responsive) — test-clock
  (`SESSION_*` env) ile, gerçek 30 dk bekleme YOK.
- **TODO-170 Refund Ledger — ⛔ BLOCKED** (yeniden): return financial invariants (R1–R5, P1/P2) + private media
  hardening (C1) ship edilene kadar append-only refund ledger'a başlanmamalı. R1 orijinal blocker'ı çözdü ama
  commit/deploy yok. Sıradaki roadmap adayı (hardening ship sonrası): **Storefront Social Login & Customer Identity
  Linking** (TD-181) — bu oturum temeli üzerine kurulur.

## TODO-170 Refund Ledger & Payment Reversal — CLOSED & DEPLOYED (2026-08-05, ADR-272; PR #179 merge `9023d3d`)

- Amaç: TODO-169'un PENDING `RefundIntent` (finansal talimat) boşluğunu gerçek para hareketine dönüştürmek —
  **sahte provider capability üretmeden**. Denetim (4 paralel ajan) doğruladı: refund iskeleti var ama çalışan yol
  yok (çağıran yok, canlı transport kapalı, MOCK stub, partial order-state yok, `refundAmountsSupported=false`).
- Yeni: append-only **`OrderRefund`** (ledger head) + **`OrderRefundEvent`**; yalnız `SUCCEEDED` finansal gerçektir.
  Partial + çoklu refund; cap invariant `Σ SUCCEEDED + Σ active ≤ captured` (order+currency; `pg_advisory_xact_lock`
  + `updateMany where version`). RefundIntent additive **`CONSUMED`** (atomik, bir kez; `PROCESSED` legacy korunur);
  R5 COMPLETED guard artık SUCCEEDED OrderRefund toplamına bakar.
- Provider capability DÜRÜST: MOCK→PROVIDER_AUTOMATIC; gerçek online provider (Stripe/iyzico/PayTR/generic)→
  MANUAL_OFFLINE (transport + native webhook yok → manuel workflow, taklit yok); offline tahsilat→MANUAL_OFFLINE
  (banka/reference + açıklama + SUPER_ADMIN). Async/timeout/retry güvenli (kör retry yok; reconcile `refresh`);
  duplicate providerRefundId `@@unique` + `DUPLICATE_CALLBACK`.
- Order paymentStatus PROJEKSİYON (`resolveRefundedPaymentStatus`; REFUNDED/PARTIALLY_REFUNDED monotonic; attempt
  REFUNDED'a çevrilmez → captured otoritesi korunur; yeni OrderStatus yok). Finance: SUCCEEDED refund'lar
  `completedAt` (store tz) bucketlenip Net/Total'dan TEK kez düşülür (inclusive KDV üstüne eklenmez);
  `refundAmountsSupported=true` → **TD-FR-1 closure candidate**.
- UI: Store-admin iade detayı refund paneli (başlat/durumu yenile/tekrar dene/manuel tamamla/iptal + event timeline,
  expectedVersion, erişilebilir confirmation, ham provider kodu müşteriye sızmaz) + storefront maskeli müşteri refund
  durumu (bekleniyor/işleniyor/tamamlandı/başarısız + ayrı finansal özet; teknik kod YOK).
- Migration `20260805100000_todo170_refund_ledger_payment_reversal` (additive; drop/rename yok; auto-backfill yok;
  migrate-before-app). Testler: `refunds-ledger.integration` 16/16 gerçek-DB (full/partial/concurrent cap/duplicate
  idempotency+callback/success/failure/timeout+reconcile/retry/manual/stale/currency/cross-store/finance) + `refunds-pure`
  + finance/projection güncellemeleri. Kapsam dışı (future): provider-native refund webhook + scheduled reconciliation
  (TD-FR-5), chargeback/dispute, Gift Card/Store Credit refund (TD-FR-6), gerçek online provider canlı transport (EX-1).

## Return Decision Flow Simplification — Faz 1 (TODO-171) — CLOSED & DEPLOYED (PR #183) (2026-08-06)

- Amaç: TODO-170 sonrası kanıtlı denetim (`docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md`, K1–K4 kararlandı
  2026-08-06) "Kapat" tuzağını yapısal olarak yok etti, inceleme'yi kalem/adet karar merkezine dönüştürdü,
  `COMPLETED`'ı terminal yaptı ve gerçekleşen refund'ı sipariş Ücret Özeti'nde görünür kıldı.
- Kapsam (PR1): `REFUND_PENDING/COMPLETED → CLOSED` admin geçişi state-machine guard'ıyla kapatıldı
  (`REFUND_UNSETTLED`, 409); `REPLACEMENT_PENDING → CLOSED` admin arşivleme serbest kaldı (dead-end
  önlenir). "İncelemeye al" + "Gönderim bekleniyor" + "Kapat" butonları store-admin UI'dan kaldırıldı;
  approve→`AWAITING_SHIPMENT` otomasyonu (mevcut, ADR-270) korundu. İlk admin kararında idempotent
  `RETURN_REVIEW_STARTED` history event yazılır (kolon YOK, K2). İnceleme kalem/adet kabul → mevcut
  iki-aşamalı `initiateRefund`'ı reuse eden tek "İadeyi yap" aksiyonu (`POST
  /returns/:id/inspect-decision`); red → zorunlu gerekçe → `REJECTED` + `DO_NOT_RESTOCK` (reddedilen
  quantity refund'a girmez, phantom envanter önlenir). Atıl order-level `refund-context` uç noktası
  Ücret Özeti'ne bağlandı ("Gerçekleşen iade (−)" + "İade sonrası net tahsilat"); 3 stale copy düzeltildi
  (admin sipariş detayı, storefront sipariş detayı, finans raporu).
- Durum: **CLOSED & DEPLOYED (PR #183)** — kod tamamlandı, tüm review temiz, 2396 test yeşil; commit/push/
  PR/merge/deploy YOK. Migration YOK. **TODO-170 (Refund Ledger) semantiği KORUNUR** — `OrderRefund`/
  `RefundIntent`/cap invariant'a dokunulmadı. Karar: ADR-269 (§ "Faz 1 Revizyonu") + ADR-272 (§ "Faz 1
  Revizyonu") güncellendi. Analiz: `docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md` +
  `docs/analysis/RETURNS-FLOW-PHASE1-PLAN.md`.
- **PR2 — Fast Refund Controls (TODO-172): CLOSED & DEPLOYED (2026-08-07; ADR-273; PR #185).** Granular
  yetki `RETURN_FAST_REFUND` = **SUPER_ADMIN role-gate** (mevcut rol-tabanlı sistem reuse; refund
  `manual-complete` `requireStoreSuperAdmin` deseni mirror; yeni tablo YOK). `StoreSettings` additive
  `fastRefundEnabled` (default false) + `fastRefundMaxAmountMinor BigInt?` (**null=kapalı, sınırsız değil**)
  + `fastRefundCurrency String?` (order currency ile birebir eşleşme). **Kaynak durumlar = AWAITING_SHIPMENT
  + RECEIVED** (APPROVED Faz 1'de geçici/ulaşılamaz, RETURN_SHIPPED ürün yolda = ayrı karar). Teslim alma/
  inceleme atlanarak `initiateRefund` (TODO-170 REUSE; provider I/O tx dışında); zorunlu gerekçe + audit
  (`return.fast_refund.started`) + `RETURN_FAST_REFUND_STARTED` history marker (skippedSteps). Bounded risk
  context endpoint (fraud scoring YOK). Idempotent; gerçek refund olmadan COMPLETED olmaz. Store-admin CTA +
  onay modalı; customer UX değişmedi (maskeli durum korunur). Migration additive; ayrı return-config tablosu
  yok. Saf 17 + gerçek-DB 20 test yeşil. **Ship-hardening:** BigInt→kanonik string kontrat (TD-194 CLOSED),
  yapısal history `eventType`/`metadata` (2. additive migration), flaky store-admin kök-neden fix (5× yeşil,
  TD-199 CLOSED). **commit/push/PR/merge/deploy YOK.**
- **PR3 — Reverse Shipment: PLANNED.** `Shipment.direction` üç yönlü additive enum baştan (K4:
  `OUTBOUND_TO_CUSTOMER`/`CUSTOMER_RETURN_TO_STORE`/`STORE_RETURN_TO_CUSTOMER`; genel "OUTBOUND"
  kullanılmaz); reddedilen ürünün müşteriye geri gönderimi için `STORE_RETURN_TO_CUSTOMER` disposition +
  direction-aware create-guard/duplicate/projeksiyon/stok. Migration additive (nullable/default → geri
  uyumlu); `ReturnRestockDecision`'a `STORE_RETURN_TO_CUSTOMER` ayrı migration adımıyla eklenir.

# TODO

## Yakin Isler

- TODO-001: Faz 0 commit.
- TODO-002: Faz 1 multi-tenant API plani.
- TODO-003: Claude frontend/admin foundation promptu. (DONE — UI foundation eklendi)
- TODO-004: Store admin UI foundation. (DONE — apps/store-admin-web shell)
- TODO-005: Super admin UI foundation. (DONE — apps/admin-web shell)
- TODO-006: Tenant guard gercek endpointlere uygulanacak. (PARTIAL — platform admin guard Faz 1A'da
  admin store/plan endpointlerinde uygulandi; store-admin endpointleri bekliyor)
- TODO-007: Auth/session gercek implementasyon. (DONE — platform admin login/me/logout/session revoke)
- TODO-008: Storefront UI foundation. (DONE — apps/storefront-web shell)
- TODO-009: API client'a auth/token ve per-domain resource'lari eklemek. (PARTIAL — auth, admin
  stores/plans, Faz 2A catalog/inventory ve Faz 2C order lifecycle helper'lari eklendi; checkout/
  storefront public resource'lari bekliyor)
- TODO-010: Frontend ekranlarini gercek API'ye baglamak (TD-010).
- TODO-011: Storefront store slug/domain resolver (TD-011).
- TODO-012: Frontend app'ler icin Docker Compose servisleri (TD-008). (DONE — admin-web/store-admin-web/
  storefront-web compose servisleri eklendi, paylasimli node.Dockerfile + `next dev`, compose ici
  `API_GATEWAY_URL=http://api-gateway:4000`, `/api/health` healthcheck; smoke gecti; TD-008 RESOLVED)
- TODO-013: Frontend etkilesim/erisilebilirlik testleri (jsdom + Testing Library) (TD-012).
- TODO-014: Frontend UI dil/tasarim revizyonu — varsayilan Turkce + premium SaaS polish.
  (DONE — uc app Turkce'ye cevrildi, packages/ui rafine edildi; TD-013 RESOLVED)
- TODO-015: i18n foundation — packages/i18n tipli sozluk, tr/en parity, getDictionary.
  (DONE — defaultLocale "tr", supportedLocales ["tr","en"], parity testleri)
- TODO-016: Runtime locale switcher ve UI'da dil secimi (TD-014).
- TODO-017: URL locale stratejisi (`/tr`-`/en` prefix) ve/veya tarayici dil tespiti (TD-014).
- TODO-018: Kullanici ve mağaza bazli locale tercihi (gerekirse DB locale alani) (TD-014).
- TODO-019: UI polish takibi — gercek veri baglandikca StatCard trend/delta, tablo ve liste
  gorunumleri, loading/skeleton durumlari (TD-010 ile birlikte).
- TODO-020: Faz 1B admin-web login/me/logout akisi ve stores/plans liste/formlarini backend
  endpointlerine baglamak (TD-016). (DONE — BFF proxy + httpOnly cookie + canli stores/plans/health)
- TODO-021: Auth rate limit, cookie hardening, CSRF ve production session security kararlarini
  netlestirmek (TD-015, TD-017). (PARTIAL — gateway login rate limit, BFF CSRF, cookie env hardening
  ve server-side cookie guard eklendi; refresh/dagitik rate limit Faz 2)
- TODO-022: Store-admin backend endpointleri geldiginde `requireStoreAccess`/`assertStoreRole`
  helper'larini gercek store-scoped route'larda zorunlu kilmak.
- TODO-023: admin-web etkilesim testleri (jsdom + Testing Library): login form submit, oturum guard
  redirect, stores/plans modal create/update, system health durum render (TD-012). (PARTIAL — login
  validation/hata, stores/plans create modal ve logout flow eklendi; update/system-health daha sonra)
- TODO-024: Faz 1C dahili health guvenli ops baglamasi — admin-web container env'ine `INTERNAL_API_TOKEN`
  vermek (frontend compose servisiyle, TD-008) veya ayri ops ekrani; gateway hata kodlarini paylasimli
  kaynaktan turetmek (TD-017). (PARTIAL — server-side proxy timeout ve token yok/var testleri eklendi;
  compose secret dagitimi bekliyor)
- TODO-025: admin-web stores listesinde domain gosterimi — gateway store list/get response'u `domain`
  dondurmuyor (StoreDomain ayri tablo). Gerekirse contract'i genisletip UI'da domain kolonu eklemek.
  (DONE — contract response `domain: string | null`, gateway list/get ve UI domain kolonu eklendi)
- TODO-026: Admin stores/plans icin sayfalama UI'si (gateway limit/offset destekliyor; UI su an ilk
  sayfayi gosterir) ve liste arama/filtre.
- TODO-027: Faz 2 store-admin-web ve storefront-web gercek API baglama (TD-010, TD-011). (PARTIAL —
  store-admin-web Faz 2B'de canli baglandi; storefront-web resolver bekliyor (TODO-031).)
- TODO-028: Production deploy hattI — frontend icin Next.js standalone/production image (non-root,
  optimize layer), Nginx reverse proxy + domain routing + SSL/TLS, ortam bazli env yonetimi ve
  deploy pipeline. Su an compose frontend servisleri `next dev` ile calisir (gelistirme runtime'i);
  production image optimizasyonu ve reverse proxy/SSL bilincli olarak sonraya birakildi (bkz. ADR-019).
- TODO-029: Faz 2B store-admin UI baglama — category/product/variant/inventory endpointlerini
  `apps/store-admin-web` BFF/form/list ekranlarina baglamak; store-user auth/context kararini
  netlestirmek (TD-019). (DONE — dashboard/categories/products/variants/inventory canli baglandi,
  guvenli BFF + server-side store context (ADR-023), CSRF, TL<->minor unit, Turkce hata esleme,
  tr/en parity, BFF + jsdom UI testleri. Store-user auth gecici platform-admin context ile vekaleten
  cozuldu; gercek store-user auth TODO-033'te acik.)
- TODO-030: Faz 2C order core — order/customer temel modelleri, fiyat snapshot, stok rezervasyonu
  (`SALE_RESERVATION`/`SALE_RELEASE`) ve audit/event davranisini eklemek (TD-021). (DONE — backend
  modeller/API/contracts/api-client/test/docs eklendi; UI/checkout/payment kapsam disi.)
- TODO-031: Faz 3 storefront resolver / checkout plani — domain/slug -> store cozumleme, public
  catalog read API, storefront-web veri baglama, cart/checkout taslagi ve cache stratejisi (TD-022,
  TD-025).
- TODO-032: Catalog media/options/import backlog — product image/media, zengin option modeli,
  metafields/collections/tags ve bulk import/export ihtiyaclarini ayri fazlara bolmek (TD-020).
- TODO-033: Store-user auth + role guard — store-scoped session/token tipi, granular store role
  permission matrisi; store-admin-web login proxy'sini gercek store-user akisina, server-side store
  context'i store-user erisim listesine baglamak (cok-mağazali secici), catalog/inventory
  endpointlerinde `requireStoreAccess`/role guard'i zorunlu kilmak (TD-019, ADR-023).
- TODO-034: Store-admin dashboard pagination-aware aggregation — aktif urun ve kritik stok sayilari
  su an ilk sayfa uzerinden hesaplanir; gateway sayim/aggregate ucu veya api-client limit/offset ile
  tam sayim (TD-024).
- TODO-035: Faz 2D Product Sales Model Foundation — product sales model enum/kurallari:
  `ONLINE`, `INQUIRY`, `APPOINTMENT`, `WHATSAPP`, `CATALOG_ONLY`; price visibility ve CTA behavior
  backend contract/model kararlarini eklemek. (DONE — F2D backend/model/contract/API foundation,
  order purchasability guard ve seed/verify eklendi; UI/storefront baglama kapsam disi.)
- TODO-036: Faz 2E Runtime Language Switch — TR/EN switch, locale cookie ve admin-web,
  store-admin-web, storefront-web entegrasyonu. (DONE — `commerce_os_locale` cookie, `packages/i18n`
  locale yardimcilari, `packages/ui` `LocaleProvider`/`useLocale`/`LanguageSwitcher`, uc app server+
  client entegrasyonu, TR varsayilan + TR fallback, key parity korundu; bkz. ADR-026, TD-028.)
- TODO-044: User/DB locale preference — store-user auth (TD-019) tamamlandiginda kalici, store-scoped
  kullanici dil tercihini DB'ye yazmak ve cookie ile birlikte cozumleme onceligini tanimlamak (TD-028).
- TODO-045: URL locale prefix / public i18n routing — ileride public SEO/i18n gerekirse `/tr`-`/en`
  (veya domain/locale negotiation) routing, middleware ve canonical kararlarini ayri is olarak ele
  almak; mevcut prefix'siz cookie stratejisinin uzerine katmanlanir (TD-028).
- TODO-046: Faz 2F Store-admin Product Sales Model UI. (DONE — F2D alanlari urun listesi rozetlerine
  ve create/update formundaki "Satis davranisi" bolumune baglandi; dinamik default'lar, client
  validasyon ve lokalize guard hatalari eklendi.)
- TODO-037: Faz 2F Store-admin Product Sales Model UI — F2D product sales model alanlarini store-admin
  urun formuna baglamak; sales mode, price visibility, CTA behavior ve tutarlilik hatalarini Turkce
  gostermek. (DONE — TR/EN paritesiyle; backend business/catalog/order logic degismedi.)
- TODO-038: Faz 2G Store-admin Orders UI. (DONE — `/orders` canli API'ye baglandi; list status/payment/
  fulfillment rozetleri, detay modal (lines/tutar/adres/rezervasyon/events), DRAFT place / PLACED
  cancel, lean taslak sipariş olusturma, yeni BFF route'lari CSRF + server-side store context ile,
  TR/EN order copy. Backend order/catalog logic degismedi.)
- TODO-047: Faz 3 Storefront checkout/cart + public CTA davranisi — sirada. Storefront'ta sepet/cart
  modeli, checkout akisi ve product sales model'e gore CTA render (sepete ekle / fiyat sor / randevu /
  WhatsApp / katalog-only). (TODO-043 ile iliskili.)
- TODO-048: Store-admin orders UI sonraki tur — payment/shipping/fulfillment UI, invoice/refund/return,
  placed-order satir duzenleme ve sipariş arama/filtre/pagination (su an list pagination UI yok). Bu
  faz disinda birakildi (TD-029).
- TODO-049: Manual draft order creation UI ileri tur — F2G'de lean (inventory varyant secimli) create
  modali eklendi; musteri secimi (customerId), adres girisi ve coklu kalem UX iyilestirmesi sonraya
  birakildi.
- TODO-039: Faz 4 payment — payment provider abstraction, authorization/capture, webhook/idempotency,
  refund durumlari ve `paymentStatus` lifecycle entegrasyonu (TD-025).
- TODO-040: Product inquiry request model — `INQUIRY` urunleri icin tenant-scoped talep kaydi,
  durum akisi, audit/event ve store-admin listeleme.
- TODO-041: Appointment request model — `APPOINTMENT` urunleri icin randevu talebi, musaitlik ve
  store-admin takip akisi.
- TODO-042: WhatsApp redirect/store contact config — store-level public contact/WhatsApp telefon
  ayarlari ve product `whatsappMessageTemplate` render kurali.
- TODO-043: Faz 3A Storefront Resolver ve CTA behavior. (DONE — storefront-web canli katalog
  verisine baglandi; home/listing/detail gercek urun/varyant/stok gosterir; CTA sales-model'e gore
  degisir (ONLINE/INQUIRY/APPOINTMENT/WHATSAPP/CATALOG_ONLY) ve fiyat gorunurlugu uygulanir;
  detail = satin alma karar merkezi iskeleti (ADR-029); cart/checkout musteri-dostu placeholder;
  sunucu-tarafi resolver + token gizliligi (TD-032); TR/EN parite; backend/kontrat degismedi.)
- TODO-044: Faz 2H Entity Detail Pages Route Standardization. (DONE — sipariş detayi `/orders/[id]`,
  ürün detay/düzenleme `/products/[id]` route'una tasindi; liste detay/düzenle aksiyonlari route'a
  linklenir; kisa create/adjust modallari korundu; kural ADR-027 + PROMPT_RULES'a yazildi; TR/EN
  detail copy; backend/BFF kontratlari degismedi.)
- TODO-050: Customer detail dedicated route `/customers/[id]` — müşteri profili, iletişim, adresler ve
  sipariş geçmişi. (Bekliyor — customers ekrani henuz placeholder; canli olunca route/page olur,
  modal degil; bkz. ADR-027.)
- TODO-051: Inventory detail dedicated route `/inventory/items/[id]` (veya `/inventory/[id]`) — varyant
  stok detayi, hareketler ve rezervasyonlar. (Bekliyor — kisa stok adjust modali kalir; detay
  route/page olur.)
- TODO-052: Variant detail dedicated route `/products/[id]/variants/[variantId]` — varyant yonetimi
  su an ürün detay sayfasinda inline bölum; gerekirse ayri detail route'a tasinir.
- TODO-053: admin-web store detail dedicated route `/stores/[id]` — mağaza detayi (su an create/edit
  modali). (Bekliyor — admin-web ayri faz; TD-031.)
- TODO-054: admin-web plan detail dedicated route `/plans/[id]` — plan detayi (su an create/edit
  modali). (Bekliyor — TD-031.)
- TODO-055: Faz 2I Store-admin Products & Orders Premium UI Polish. (DONE — `/products`,
  `/products/[id]`, `/orders`, `/orders/[id]` glass-inspired premium dile tasindi; app-local premium
  primitive'ler eklendi; ozet/metric tile'lar canli listeden hesaplanir; product/order detail hero +
  iki kolon + baglam rayi; TR/EN summary/rail copy; entity detail route standardi ADR-027 korundu;
  backend/BFF kontratlari degismedi; bkz. ADR-028.)
- TODO-056: Premium primitive'lerin (`SurfaceCard`/`DetailHero`/`MetricTile`/`DetailLayout`/`RailCard`/
  `Timeline`) admin-web'de de kullanilmasi gerekirse `packages/ui`'ye tasinmasi ve ortak design token
  haline getirilmesi. (Bekliyor — su an store-admin app-local; ortaklasma ihtiyaci dogunca.)
- TODO-057: Categories/inventory/dashboard ekranlarinin da ayni glass-inspired premium dile
  hizalanmasi (F2I yalniz products/orders kapsadi). (Bekliyor — gorsel tutarlilik icin.)
- TODO-058: Faz 3B Storefront cart + checkout — gercek sepet cekirdegi (oturum/anon cart), satir/
  adet/toplam, order create/place akisinin storefront'tan baglanmasi. (DONE — F3B.1: imzali httpOnly
  cookie cart (yalniz {variantId, quantity} referansi), gateway public `POST /public/stores/:slug/cart`
  (sunucu-otoriter cozumleme) + `POST /public/stores/:slug/checkout` (createOrder→placeOrder, stok
  rezervasyonu, PLACED/UNPAID); ONLINE disi + gizli fiyat sepete/siparise dusmez; fiyat/baslik/salesMode
  istemciden kabul edilmez; allowlist DTO; tenant izolasyonu iki katmanli; cart/checkout sayfalari
  gercek veriye bagli (empty/error/success/quantity/remove/reconcile); TR/EN parite; bkz. ADR-031, TD-033.)
- TODO-059: Storefront payment + shipping + fulfillment — odeme provider, kargo/teslimat secimi ve
  vergi hesaplamasinin checkout'a baglanmasi (TODO-039/payment ile birlikte).
- TODO-060: Storefront review + Q&A + seller rating modeli — gercek yorum/soru-cevap/satici puani
  veri modeli ve store-admin moderasyonu (F3A'da yer tutucu); ardindan recommendation/recently-viewed
  ve "birlikte alinanlar" oneri motoru.
- TODO-061: Gateway public-read katalog ucu — auth gerektirmeyen, store-scoped, yalniz ACTIVE/yayinda
  urun donen public katalog uclari; storefront resolver'in platform-admin token'i birakmasi (TD-032).
  (DONE — F3A.1: `GET /public/stores/:storeSlug/products` + `/:productSlug`, `publicProduct*` allowlist
  DTO, fiyat gizliligi gateway'de uygulanir; vitrin token'siz okur, platform-admin resolver kaldirildi;
  TD-032 RESOLVED, ADR-030)
- TODO-062: Storefront medya/gorsel pipeline — gercek urun gorseli yukleme/CDN ve detay galeri
  zoom/lightbox/video (F3A'da galeri placeholder).
- TODO-063: Faz 3B.2 Storefront payment provider abstraction — checkout'a gercek odeme adimini
  baglamak (Masterpass/iyzico/Stripe). F3B.1 siparisi PLACED/UNPAID (odeme bekliyor) olarak yaratir;
  paymentStatus gecisleri (AUTHORIZED/PAID) ve payment intent/webhook contract'i eklenecek (TODO-059
  ile birlikte; bkz. ADR-031, TD-033).
- TODO-064: Public checkout atomicligi — F3B.1'de createOrder (DRAFT) ve placeOrder (rezervasyon) iki
  ayri transaction; placeOrder basarisiz olursa DRAFT siparis kalir. Tek transaction'da create+place
  yapan public-checkout data-access metodu ve/veya basarisiz place'te DRAFT temizleme/expiry (TD-033).
- TODO-065: Anonim sepet/rezervasyon yasam dongusu — anonim checkout'ta stok PLACED ile rezerve
  edilir; odeme alinmadan terk edilen siparisler icin reservation expiry/iptal job'i (worker) ve
  abandoned-order temizligi (TD-033).

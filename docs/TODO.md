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
  vergi hesaplamasinin checkout'a baglanmasi (TODO-039/payment ile birlikte). NOT: F3B.1 UX
  revizyonunda gateway'e SUNUCU-OTORITER DEMO ozet eklendi (KDV %20 dahil, kargo ₺750 ustu ucretsiz/
  alti ₺49,90, `DEMO10` %10 kupon); shipping/discount siparise yazilir. Bunlar "demo calculation";
  gercek shipping/tax/coupon motoru bu TODO'da yapilacak (bkz. ADR-031 revizyon notu).
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
- TODO-063: Faz 3B.2 Payment Operations Foundation. (DONE — provider abstraction + admin provider
  yonetimi (`/payment-providers`) + resolver/fallback + TEST/LIVE mode + credential encryption-at-rest
  (AES-256-GCM) + masking + checkout resolver (additive) + token-korumalı MOCK test odeme akisi +
  webhook shell (idempotency) + PaymentAttempt/PaymentProviderEvent log. CANLI odeme YOK; gercek
  provider HTTP adaptorleri ayri maddelerde (TODO-066..069). Bkz. ADR-033, Faz 3B.2 phase log.)
- TODO-066: iyzico canli/sandbox HTTP AKTIVASYONU — provider-specific adapter iskeleti hazir
  (`contracts/iyzico.ts`: Checkout Form initialize/detail request builder + response parser + IYZWSv2
  imza + status mapping + credential validation). Kalan: `PAYMENT_SANDBOX_HTTP_ENABLED=true` ile gercek
  sandbox/live cagriyi test/kanit + buyer/sepet zenginlestirme + gercek callback imza dogrulama (TODO-071).
- TODO-067: Stripe canli/sandbox HTTP AKTIVASYONU — adapter iskeleti hazir (`contracts/stripe.ts`:
  PaymentIntents request/response/status mapping + Bearer auth + credential format). Kalan: gercek
  sandbox cagri + Stripe-Signature webhook dogrulama (TODO-071).
- TODO-068: PayTR canli/sandbox HTTP AKTIVASYONU — adapter iskeleti hazir (`contracts/paytr.ts`:
  get-token request + paytr_token hash + callback status mapping). Kalan: gercek cagri + callback hash
  dogrulama (TODO-071).
- TODO-069: Banka sanal POS (GENERIC_REDIRECT) HTTP AKTIVASYONU — iskelet hazir
  (`contracts/generic-redirect.ts`: redirect create + callback status mapping). Kalan: gercek PSP
  endpoint/imza entegrasyonu.
- TODO-070: Refund/dispute/settlement fazi — refundPayment canli implementasyonu, mutabakat raporlari,
  iade/itiraz is akislari ve ayri `/payments` (operations) operasyon ekrani (musteri odeme hareketleri).
- TODO-071: Gercek webhook signature verification — F3B.2 webhook shell imzayi placeholder olarak
  kabul eder; provider basina HMAC/imza dogrulamasi ve raw-body koruma eklenecek.
- TODO-064: Public checkout atomicligi — F3B.1'de createOrder (DRAFT) ve placeOrder (rezervasyon) iki
  ayri transaction; placeOrder basarisiz olursa DRAFT siparis kalir. Tek transaction'da create+place
  yapan public-checkout data-access metodu ve/veya basarisiz place'te DRAFT temizleme/expiry (TD-033).
- TODO-065: Anonim sepet/rezervasyon yasam dongusu — anonim checkout'ta stok PLACED ile rezerve
  edilir; odeme alinmadan terk edilen siparisler icin reservation expiry/iptal job'i (worker) ve
  abandoned-order temizligi (TD-033).
- TODO-072: F3B.2 follow-up UI polish — DONE (2026-06-28). Manuel izole smoke'ta gozlemlenen, F3B.2'yi
  bloke ETMEYEN ufak UI/UX eksikleri toplu ele alindi (MOCK simulasyon; gercek provider/iyzico/3DS
  redirect KAPSAM DISI — bkz. ADR-036). Cozulen maddeler:
  - Inventory-aware PDP quantity: buy box adet secici secili varyantin `available` stok limitine duyarli
    (`maxPurchasableQuantity` saf turetme; magaza max ile stok limitinin kucugu). Stok limitinde `+`
    disabled + "Bu üründen en fazla N adet ekleyebilirsiniz." uyarisi; varyant degisince adet yeni
    limite normalize edilir (useEffect clamp); stok yoksa adet kontrolu + sepete ekle disabled + "Bu
    ürün şu an stokta yok." Gateway public DTO zaten `available` tasiyordu (DTO degisikligi gerekmedi);
    server reconcile son guvenlik olarak korunur.
  - 3D Secure test akisi: "3DS gerekli" kart artik ANINDA PAID olmaz. Ilk submit REQUIRES_ACTION → ayri
    gercekci banka dogrulama simulasyon ekrani (ThreeDsChallenge): "Doğrulamayı başarılı tamamla" → PAID,
    "Doğrulamayı başarısız yap" → FAILED (THREE_DS_FAILED) + retry. MOCK adapter `threeDsOutcome`
    (success/fail) ile fail yolu eklendi; `publicPaymentSubmitRequest.threeDsAction` alani. Store-admin
    order detail payment panelinde 3DS durumu (Gerekli/Doğrulama bekleniyor/Doğrulandı/Başarısız) +
    success ekraninda "3D Secure: Doğrulandı". `publicPaymentInfo.threeDsApplied` (safe boolean) eklendi.
  - Taksit UX: odeme adiminda taksit ozeti ("N taksit × ₺X" + toplam + "Vade farksız"), success ekrani
    ve store-admin panelinde ayni ozet. SAHTE oran/faiz YOK — toplam degismez, esit bolunur (computed UI
    alani; yeni DB alani yok, mevcut `installmentCount` kullanildi).
  - Payment success ekrani zenginlestirildi: siparis no, urunler (varyant/adet/birim/satir toplami),
    odeme (saglayici/yontem/maskeli kart/3DS/taksit ozeti/islem no/tarih), teslimat + fatura ozeti, test
    modu notu, "Siparişlerime git" + "Alışverişe devam et" CTA. Full PAN/CVC/token ASLA serialize edilmez.
  - i18n TR/EN paritesi: stok limit/stokta yok, 3DS dogrulama aksiyonlari, taksit ozeti/vade farksiz,
    siparislerime git eklendi. Testler: PDP clamp (saf + SSR out-of-stock), MOCK 3DS fail, store-admin
    3DS paneli, taksit ozeti. Docker smoke (worktree context) healthy; public DTO `available` dogrulandi.
- TODO-073: Store-admin orders filters — DONE (2026-06-28). Store-admin `/orders` listesine operasyonel
  filtre bar eklendi: siparis durumu, odeme durumu, karsilama durumu (mevcut enum'lar; "Basarisiz/kismi
  iade" enum'da yok), tarih araligi (gun bazli, UTC sinir), musteri/e-posta/siparis-no arama. Filtreler
  DB tarafinda (gateway `listOrders` where), store-scope korunur; cross-store sizmaz. URL query string =
  tek dogruluk kaynagi (yenilemede korunur), "Filtrele"/"Temizle" CTA + aktif filtre ozeti, filtreye
  duyarli bos durum ("Bu filtrelere uyan siparis bulunamadi."). Layout regression (siparis no nowrap,
  badge hizasi) korundu. Kapsam disi/ertelendi: toplam tutar araligi (min/max) — opsiyonel, ayri TODO.
  Sozlesme: `orderListQuerySchema`/`OrderListQuery` (contracts), api-client `orders.list(storeId,query,
  token)`. i18n TR/EN `orders.filters.*` paritesi eklendi.

- F3B.3: Customer Account Auth + Checkout Guard + Address Book Foundation. (DONE — bkz. ADR-034 +
  Faz 3B.3 phase log. Mevcut `Customer` storefront uyelik hesabi olacak sekilde genisletildi;
  CustomerCredential/Session/OtpVerification/Iban/CommunicationPreference; checkout guard + adres
  defteri; `/auth/login`, `/auth/register` (3 adim OTP), `/account` shell + dropdown. Migration
  20260628120000.)
- TODO-074: E-posta/telefon DEGISIKLIGI OTP dogrulamasi — Uyelik Bilgilerim'de e-posta/telefon su an
  salt-okunur (+"dogrulama gerekir" notu). Gercek degisiklik icin OTP akisi (REGISTER ile ayni altyapi,
  purpose=VERIFY_CONTACT zaten sema'da) sonraki faz.
- TODO-075: Musteri SELF-SERVICE "sifremi unuttum" akisi (F3B.3 kapsam disiydi). OTP/e-posta ile
  musteri kendi reset talebini baslatir + yeni sifre. ACIK. TODO-087 ile gelen admin-tetikli
  aktivasyon/reset FOUNDATION'i (CustomerCredentialToken + `POST /public/.../customer/activate` +
  storefront `/auth/activate`) bu akista yeniden kullanilabilir; eksik olan musteri-tetikli token
  uretimi (kendi e-posta/telefonuna gonderim) ve teslimat (TODO-076).
- TODO-076: Gercek SMS/e-posta OTP/aktivasyon teslimat saglayici entegrasyonu. Su an provider-ready
  dev/mock; `CUSTOMER_OTP_DEV_CODE` yalniz development/test bypass'i (plain kod loglanmaz). TODO-087'de
  aktivasyon/reset linki mail provider olmadigi icin admin UI'da TEK SEFERLIK gosterilir (ADR-035);
  gercek e-posta gonderimi bu TODO ile gelir.
- TODO-078: Store-admin customers DETAIL route — DONE (F3B.3 Store-Admin Customer Management Fix).
  Dedicated route `/customers/[id]` (modal degil); gateway `GET/PATCH /stores/:storeId/customers/:customerId`
  + adres/IBAN/iletisim tercihleri alt uclari (CustomerDataAccess yeniden kullanildi). Profil/durum
  guncelleme, adres CRUD + default, IBAN ekle/sil + default (maskeli), iletisim tercihleri, siparis
  ozeti. PII minimizasyonu korunur (hash/token/OTP/plain secret yok; TCKN/VKN/IBAN maskeli).
- TODO-087: Store-admin customer creation and credential management — DONE (2026-06-28). Panelden yeni
  musteri olusturma (`POST /stores/:storeId/customers`; Ad Soyad + e-posta/telefon + durum + opsiyonel
  uyelik), admin-tetikli credential/oturum yonetimi ve guvenli aktivasyon/reset yaklasimi. ADR-035
  karari: admin KALICI SIFRE BELIRLEMEZ; `CustomerCredentialToken` (purpose ADMIN_ACTIVATION /
  ADMIN_PASSWORD_RESET, sha256 tokenHash, expiresAt, consumedAt, createdByUserId) uretir. Raw token
  yalniz uretim response'unda TEK SEFERLIK doner ve admin UI'da bir kez gosterilir (mail provider yok).
  Public `POST /public/stores/:storeSlug/customer/activate` token'i tuketir, parolayi set eder, ACTIVATION
  ise musteriyi ACTIVE yapar, mevcut tum oturumlari revoke eder. Storefront `/auth/activate?token=` sayfasi.
  Credential token uclari: `POST .../credential` (uyelik yoksa), `.../credential/reset` (uyelik varsa),
  `.../sessions/revoke` (tum oturumlari sonlandir). Detail response'a `security` blogu (hasCredential,
  passwordChangedAt, activeSessionCount; hash ASLA donmez). Status PASSIVE/BLOCKED login/session/checkout'u
  zaten engelliyordu (test ile dogrulandi). Iliski: TODO-075 (musteri self-service) ve TODO-076 (gercek
  e-posta/SMS teslimat) ACIK kalir.
- TODO-088: Store-admin orders — tutar araligi (min/max total) filtresi. TODO-073'te erteleme: temel 5
  filtre (siparis/odeme/karsilama durumu, tarih, arama) tamamlandi; tutar araligi opsiyoneldi ve scope'u
  buyutmemek icin ertelendi. Gateway `orderListQuerySchema`'ya `minTotal`/`maxTotal` + where (`totalAmount`
  gte/lte), UI'da iki sayisal alan + URL query. Kucuk ek; ayri PR.
- TODO-077: Guest gecmis siparis baglama — F3B.3'te yalniz checkout anindaki yeni siparis customerId'ye
  baglanir; mevcut guest order'larin (customerEmail ile) hesaba retro baglanmasi sonraki faz.
- TODO-079: Account orders detail and post-order actions — DONE (2026-06-28). Hesabim > Siparislerim
  musteri-facing operasyonel seviyeye cikarildi. Ust baslik + aciklama; URL query ile korunan 3 sekme
  (Siparisler / Tekrar Satin Al / Henuz Kargoya Verilmedi: `?section=orders&tab=all|buy-again|not-shipped`)
  ve "tum siparislerde ara" (sipariş no / urun adi / varyant / SKU; `&q=`, dogal dilli arama-bos durumu).
  Sipariş karti: durum/odeme/karsilama rozetleri (musteri-facing dürüst label), tutar, satirlar (gorsel
  ALTYAPISI YOK → harf placeholder), post-order CTA'lar. Dedicated detay route `/account/orders/[orderNumber]`
  (yalniz kendi siparisi; baska musteri/yok → notFound 404): tutar kirilimi, satirlar, teslimat adresi,
  fatura ozeti (taxId MASKELI), odeme GÜVENLI alanlari (saglayici/maskeli kart/taksit/islem no/3DS/odeme
  tarihi; PAN/CVC/token/hash YOK). Backend: `GET /public/stores/:slug/customer/orders` genisletildi
  (fulfillmentStatus + line variantId/productSlug/sku), yeni `GET .../customer/orders/:orderNumber` (allowlist
  + own-only). "Tekrar satin al" storefront Server Action: order satirlarini GÜNCEL katalogdan dogrular
  (`resolveCart`); yalniz hala satilabilir + stokta varyantlari uygun adetle sepete ekler, mevcut olmayan
  urunler icin "Bazı ürünler artık mevcut değil." uyarisi (eski sipariş FIYATINA güvenilmez — bkz. DECISIONS
  buy-again karari). Iade/destek/yorum CTA'lari bu fazda PLACEHOLDER (gercek lifecycle yok): iade 15 gün
  penceresi + FULFILLED/PARTIAL kosulu UI'da uygulanir, süre dolunca "İade süresi doldu" notu; yorum yalniz
  teslimat (FULFILLED) sonrasi aktif. i18n TR/EN paritesi (sekme/arama/kart/detay/iade/destek/yorum/buy-again/
  rozet/bos durumlar). Testler: gateway (own-list, detay own + GÜVENLI ödeme alanlari + maskeli taxId, baska
  musteri detay 404, guest 401), storefront saf fonksiyonlar (sekme/arama/iade penceresi/yorum). Gercek
  iade=TODO-081 (F3C/F3K), gercek destek ticket=TODO-080 (F3K), gercek review=TODO-082 (F3E), gercek kargo
  takip=TODO-083 ile baglandi.
- TODO-080: Musteri destek / "Bize Ulasin" ticket sistemi (F3K). TODO-079'da "Ürün desteği al" CTA dürüst
  placeholder ("yakında aktif olacak"); gercek ticket olusturma + `?section=contact&topic=order-support&
  order=...` hedef bolumu bu faz. ACIK.
- TODO-081: Gercek iade talebi lifecycle (F3C/F3K). TODO-079'da iade CTA yalniz 15 gün penceresi + FULFILLED/
  PARTIAL gorunurluk kurali (placeholder panel). Gercek iade workflow (talep olusturma, durum, onay/red,
  stok/odeme iadesi) bu faz. ACIK.
- TODO-082: Gercek urun degerlendirme/yorum modeli (F3E). TODO-079'da "Ürün yorumu yaz" CTA teslimat sonrasi
  aktif placeholder; gercek review entity + form + moderasyon bu faz. ACIK.
- TODO-083: Gercek kargo takip saglayici entegrasyonu. TODO-079 fulfillment rozetleri enum'dan türetilir
  (takip no üretilmez); gercek kargo provider + takip no/link bu faz. ACIK.
- TODO-089: Storefront RSC cookie serialization audit. TODO-079 smoke'unda gozlemlendi (pre-existing,
  F3B.3 deseni): Next `force-dynamic` + `cookies()` kullanan account sayfalari icin istemcinin KENDI httpOnly
  oturum cookie'sinin RSC flight payload'una serialize edildigi raporlanmisti (`addresses`/`profile`/`orders`).
  (DONE — denetim sonucu: uygulama kodu raw oturum jetonunu/cookie DEGERINI HICBIR yere sizdirmiyor.
  (1) Statik analiz: jeton yalniz sunucuda `readCustomerToken()` ile okunur ve YALNIZCA `x-customer-session`
  fetch header'ina konur (`lib/server/customer-cookie.ts`, `customer.ts`, `gateway.ts`); hicbir client
  component prop'una, Server Action donus degerine veya render agacina girmiyor. `loginAction`/
  `registerCompleteAction` jetonu yalniz `writeCustomerToken` ile httpOnly cookie'ye yazar, sonuc `{ ok }`
  dondurur. `CustomerAccount` view model'inde jeton/hash alani yok. (2) Build grep: `apps/storefront-web/.next/static`
  (client'a teslim edilen chunk'lar) MARKER'lardan tamamen temiz; `commerce_os_customer_session` yalniz
  server-only `.next/server/chunks` icinde LITERAL COOKIE ADI sabiti olarak gecer (raw deger degil).
  (3) Sentinel test: `test/account-session-boundary.test.tsx` — cookie'ye SENTINEL jeton konur; tum account
  bolumlerinin render ciktisi ve `loginAction` sonucu jetonu ICERMEZ, ama gateway fetch header'i jetonu
  TASIR (jeton'un dogru sekilde sunucu-yanli kullanildigi kaniti). Sonuc: orijinal gozlem buyuk olasilikla
  RSC navigation (`?_rsc=`) ISTEK Cookie header'inin (tarayicinin same-origin httpOnly cookie'yi otomatik
  gondermesi — httpOnly amacina UYGUN) YANIT payload'u ile karistirilmasidir; uygulama kaynakli sizinti yok.
  KARAR: logged-in full runtime RSC smoke YAPILMADI — gerekce: shared api-gateway restart + gecici OTP
  dev-code gerektirir, operasyonel risk ek kanit degerinden yuksek; statik analiz + build grep + sentinel
  test + guest redirect/health smoke yeterli. Ileride gerekirse izole stack ya da dev OTP'li ayri smoke ile
  yapilabilir.)
- TODO-090: Storefront client bundle'indan api-client VALUE import'larini cikar. TODO-079 smoke'unda
  gozlemlendi (pre-existing, F3B.3): `apps/storefront-web/components/account/sections/address-manager.tsx`
  ve `iban-manager.tsx` `@commerce-os/api-client`'tan VALUE import yapiyor (`isValidTckn`/`isValidTaxNumber`/
  `isValidTrPhone`/`isValidIban`); bu "use client" component'lerinde tum api-client (gateway'e baglanan
  `createApiClient` dahil) client bundle'a giriyor. Guvenlik etkisi dusuk (client gateway'e dogrudan
  baglanmaz; olu/tree-shake edilmemis util — secret icermez) ama proje kurali "createApiClient client
  bundle'da olmamali". Cozum: TR validator'lari client-safe bagimsiz bir alt-modulden export et
  (`@commerce-os/api-client/validators` veya contracts saf modulu) ve client component'leri ona gecir.
  Dogrulama: build sonrasi `grep -rE createApiClient apps/storefront-web/.next/static` bos donmeli.
  (DONE — commit de66ae3: TR validator'lar saf `@commerce-os/contracts/validators` modulune tasindi,
  `@commerce-os/api-client/validators` alt-yolu eklendi, 5 client component (address/iban/checkout/
  payment-tester/register-flow) ona gecirildi; classifyIdentifier zod'dan arindirildi. Dogrulama:
  `grep createApiClient .next/static` bos; secret/token grep bos; typecheck/lint/test/build yesil.)
- TODO-094: F3C.1 Shipping provider foundation (DHL eCommerce + Geliver + MOCK). Mağaza-scoped opsiyonel
  kargo saglayici altyapisi: ShippingProviderConfig/Credential/Shipment/ShipmentEvent/ShipmentQuote modelleri
  + migration; ayri SHIPPING_ENCRYPTION_KEY (AES-256-GCM, fallback YOK → CONFIG_MISSING); provider-bagimsiz
  adapter sozlesmesi + MOCK/DHL/Geliver adapter foundation; gateway store-admin uclari (provider CRUD +
  credential upsert/clear + test + order rate/create-order/create-barcode + CBS preview); api-client +
  contracts; destructive guard'lar (createOrder/createbarcode/label-purchase varsayilan 409); unit testler.
  Isimlendirme: UI "DHL eCommerce", teknik "MNG/api.mngkargo.com.tr". (DONE — bkz. ADR-039..042, PHASE_LOG
  F3C.1 Faz A + Faz B. Faz A backend foundation + Faz B store-admin Kargo Sağlayıcıları ayar sayfası + sipariş
  detayı kargo paneli + BFF + i18n + testler + docker runtime smoke tamam. Canlı destructive operasyonlar
  varsayılan guard altında; controlled rollout TODO-095..097'de. Geliver REST yolları SDK'dan türetildi,
  canlı doğrulanmadı.)
- TODO-094B: Shipping provider safe external verification. (1) UI/backend dürüstlük düzeltmesi (DONE):
  testConnection artık GERÇEK provider HTTP yanıtı alınmadan "OK" dönmez — SHIPPING_SANDBOX_HTTP_ENABLED=false
  iken `status=HTTP_DISABLED`, `lastTestStatus` OK yerine HTTP_DISABLED/SKIPPED/FAILED yazılır; provider config
  yanıtına `credentialStatus` (CONFIGURED/INCOMPLETE/MISSING) ve `connectionStatus` (UNTESTED/OK/FAILED/
  HTTP_DISABLED/SKIPPED) + `lastProviderHttpStatus/TestType/TestAt/ErrorCode` eklendi (migration
  20260629120000); UI "Kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı." gösterir; sipariş paneli
  HTTP kapalı uyarısı; sepetteki ₺49,90'ın provider quote DEĞİL sabit mağaza kuralı olduğu netleştirildi.
  (2) GERÇEK external verification (DONE — 2026-06-29): credential dosyası
  (.secrets/commerce-os-shipping.local.env, değerler yazdırılmadan process env olarak) ile güvenli read-only
  doğrulama yapıldı (testapi.mngkargo.com.tr + x-api-version). Sonuç: DHL Identity token POST /mngapi/api/token
  → HTTP 200 (JWT alındı) ✓; CBS getcities/getdistricts → HTTP 401 (IBM gateway product auth: CBS_INFO ürünü
  bu X-IBM anahtarı için sandbox'ta abone değil); Standard Query /calculate → HTTP 401 (Bearer ile bile;
  STANDARD_QUERY ürünü abone değil). Geliver Bearer auth GEÇERLİ (GET /api/v1/providers, /shipments,
  /transactions → 200); adapter'daki /geo/cities yolu 404'tü → testConnection /providers'a düzeltildi.
  createOrder/createbarcode/createRecipient/acceptOffer ÇALIŞTIRILMADI.
- TODO-094C: F3C.1 DHL TEST/LIVE base URL + x-api-version + Plus Command (DONE — 2026-06-29). DHL adapter artık
  mode'a göre host çözer: TEST → DHL_ECOMMERCE_TEST_BASE_URL (yoksa TEST_BASE_URL_MISSING, CANLI host'a fallback
  YOK), LIVE → DHL_ECOMMERCE_LIVE_BASE_URL; tüm DHL isteklerine zorunlu x-api-version (DHL_ECOMMERCE_API_VERSION)
  header'ı eklendi. ShippingCredentialType enum'a PLUS_COMMAND, ShippingProviderConfig'e allowRecipientCreate
  (migration 20260629130000); createRecipient adapter skeleton + RECIPIENT_CREATE_DISABLED guard (env flag +
  config.allowRecipientCreate + explicitConfirm üçlüsü; default KAPALI — bu turda canlı/sandbox createRecipient
  YOK). Cart provider quote contract'ı (cartShippingQuoteResponseSchema: provider/source/status/amountMinor/
  currency/errorCode/message/calculatedAt) eklendi. Store-admin'e allowRecipientCreate toggle.
- TODO-094D: Cart/checkout provider shipping quote uygulaması — GERİ ÇEKİLDİ / F3C.2'ye TAŞINDI (2026-06-29).
  KARAR: DHL eCommerce bir OPERASYON sağlayıcısıdır (Identity, CBS, createRecipient, createOrder, createbarcode,
  tracking); DHL `calculate` cart/checkout kargo fiyatı için KULLANILMAYACAK. Bu nedenle sepet/checkout kargo
  bedeli provider'dan CANLI çekilmeyecek; ayrı bir faz olan F3C.2 Shipping Price Engine ile çözülecek (bkz.
  TODO-108). cartShippingQuoteResponseSchema yalnızca contract seviyesinde bırakıldı (storefront/backend
  uygulaması YOK). Mevcut sabit kargo kuralı provider quote DEĞİLDİR; güncel kargo fiyat listeleri mağaza/admin
  tarafından F3C.2'de girilecek.
- TODO-095: DHL eCommerce canli createOrder controlled rollout. Env+config+explicitConfirm guard'i ile gercek
  Standard Command /createOrder; idempotent referenceId, hata sinifları, sipariş→Shipment yasam dongusu.
- TODO-096: DHL eCommerce canli createbarcode controlled rollout. Barcode Command /createbarcode (faturalastirma
  → shipmentId/invoiceId/barcodes); etiket URL/PDF saklama; updateshipment/cancelshipment guard'li akis.
- TODO-097: Geliver canli etiket satin alma (transactions.acceptOffer) controlled rollout. Offer polling →
  normalized rate, acceptOffer guard kaldirma kriterleri, createReturn.
- TODO-098: Checkout shipping price engine. Sepette/checkout'ta tahmini kargo ucreti (calculate/offer) — su an
  checkout'a BAGLANMADI.
- TODO-099: Customer-facing kargo takip UI (storefront). DONE — TODO-117 ile kapandı (storefront sipariş
  detayında shipment takip kartı + "işlem noktası" timeline; allowlist DTO, secret yok). Canlı provider
  trackShipment/status SYNC'i ayrı kalır (TODO-100/104).
- TODO-100: DHL Bulk Query toplu gonderi sync (getShipmentByDate/getStatusChangedShipments) runtime entegrasyonu.
  (KISMEN DONE — 2026-07-03, ADR-048: provider-agnostic toplu sync RUNTIME YOLU eklendi:
  `POST /stores/:storeId/shipping/shipments/sync-all` terminal olmayan gonderileri mevcut applySync
  (getShipmentStatus+trackShipment, adapter dispatch) ile senkronlar; limit≤50, DISABLED provider skipped,
  gonderi basina hata kod bazli rapor. KALAN: DHL Bulk Query saglayici-ozel toplu ucun bu ucun arkasina
  takilmasi — sandbox'ta STANDARD_QUERY/BULK_QUERY urunleri abone olmadigi icin canli dogrulanamiyor
  (bkz. TODO-107); zamanlanmis otomatik sync worker job'i TODO-129.)
- TODO-101: DHL Finance Query fatura/komisyon mutabakat entegrasyonu.
- TODO-102: DHL CBS sehir/ilce/mahalle kod cache/sync production hardening (su an read-only preview).
- TODO-103: DHL Identity token refresh akisi (OpenAPI /refresh belirsiz) + kalici/dagitik token cache.
- TODO-104: Shipping webhook production verification — DONE (2026-07-03, ADR-048). Public uc
  `POST /public/shipping/webhooks/:webhookToken` platform-normalize sozlesme
  (shippingWebhookEventRequestSchema) kabul eder; kullanici auth YOK ama her istekte HMAC-SHA256 imza
  (`x-shipping-signature` + `x-shipping-timestamp`, RAW BODY uzerinden, timingSafeEqual/constant-time)
  ZORUNLU. Eksik/gecersiz imza → 401 + DB yazimi yok; timestamp toleransi 300 sn (replay penceresi);
  pencere ici duplicate/replay'i `ShipmentWebhookInbox` unique (providerConfigId, eventKey) keser —
  shipment guncelleme + WEBHOOK_RECEIVED event ATOMIK transaction, duplicate yeni event uretmez.
  Secret/token admin `POST .../providers/:id/webhook/rotate` ile uretilir (AES-256-GCM saklanir, yalniz
  rotate yanitinda BIR KEZ plain; config DTO'sunda yalniz `webhookConfigured` boolean). Bilinmeyen
  statusCode durumu DEGISTIRMEZ (ADR-045 regres korumasi); eslesmeyen gonderi/bozuk payload audit'li
  IGNORED inbox kaydi + 200 ACK; shipment aramasi {storeId, providerConfigId} scoped → cross-store
  mutasyon imkansiz. KALAN: DHL/Geliver HAM webhook format + provider imza semasi adaptorleri TODO-130
  (canli abonelik/dogrulama sonrasi); store-admin webhook yonetim UI TODO-128. Payment webhook imzasi
  (TODO-071) bagimsiz ACIK.
- TODO-105: Marketplace alanları — Trendyol (TRND) + N11 entegrasyon desteği (ürün/sipariş/stok senkron alanları,
  provider abstraction'a marketplace tipi). Henüz tasarım aşamasında.
- TODO-106: ZPL render/print desteği — Barcode Command /createbarcode çıktısındaki ZPL'i önizleme/yazdırma
  (label PDF/PNG render + yazıcı akışı). TODO-096 ile bağlantılı.
- TODO-107: DHL production static IP authorization checklist — canlı (api.mngkargo.com.tr) erişim için sabit IP
  beyanı/whitelist süreci, API Zone abonelik onayı (CBS_INFO/STANDARD_QUERY/STANDARD_COMMAND/BARCODE_COMMAND/
  PLUS_COMMAND ürünleri), callback URL kaydı doğrulaması.
- TODO-108: F3C.2 Shipping Price Engine — DONE (ADR-044). Kargo bedeli mağaza TARİFE planından hesaplanır
  (ShippingRatePlan + ShippingRateRule; price-engine.ts saf fonksiyon). Admin tarife yönetimi UI
  (/shipping/rates), storefront cart/checkout kargo satırı (ADDRESS_REQUIRED/NO_RATE_PLAN/free/amount), sipariş
  kargo snapshot'ı, demo store default rate plan seed (eski ₺49,90/₺750 buraya taşındı). DHL eCommerce operasyon
  sağlayıcısı olarak kalır; fiyat motoru ondan bağımsızdır.
- TODO-109: Kargo bölge yönetimi UI + şehir/ilçe → bölge (regionCode) eşleme. DESI_AND_REGION_TABLE modeli
  destekler ama admin UI ilk sürümde minimal (şehir/ilçe kodu serbest metin); regionCode storefront adresinden
  henüz türetilmiyor (EngineAddress.regionCode = null). DHL CBS geo kod cache'iyle (TODO-102) entegre edilebilir.
- TODO-110: Ürün/varyant kargo ölçümü admin UI alanları — DONE. Ürün formuna (product-form.tsx) ve varyant
  editörüne (variants-manager.tsx) "Kargo ölçüleri" bölümü eklendi (shippingWeightKg / shippingDesi; >0 doğrulama,
  boş=null). Contracts product/variant create/update + response şemaları alanları kabul/dönüyor; serialize Decimal→
  number; cart hesaplaması varyant→ürün fallback (resolveShippingDims). i18n TR/EN, testler (contracts validation,
  resolveShippingDims, UI render, i18n parity) ve runtime smoke (demo-tote checkout kargo hesaplandı; dims yoksa
  MISSING_SHIPPING_DIMENSIONS → ödeme bloke). KALAN (yeni TODO-115): gerçek en/boy/yükseklik boyut alanları +
  volumetrik desi otomatik hesabı (en×boy×yükseklik / divisor, default 3000); şimdilik kullanıcı hesaplanmış desiyi
  girer (billableWeight = max(kg, desi) precomputed shippingDesi ile çalışır).
- TODO-115: Gerçek ürün boyut alanları (en/boy/yükseklik) + otomatik volumetrik desi (divisor default 3000). Şu an
  admin yalnız hesaplanmış desi/ağırlık girer; ölçü alanlarından otomatik desi türetme ileride.
- TODO-111: Kargo tarife matris girişi + CSV import — KISMEN DONE (F3C.4). Matris/grid girişi (DESİ × Tarife
  I/II/III ve DESİ/KG × zone), DHL şablonu (tier yoksa Tarife I/II/III otomatik oluşturur), CSV **paste** import
  (server-side parse, TR ondalık 116,99/₺116,99, ; ve TAB ayraç), değişiklik önizleme/özet (oluştur/güncelle/
  değişmeyen/boş) ve apply DONE. Backend authoritative, store-scoped, transaction'lı; YALNIZ upsert (matris
  kapsamı dışındaki özel/gelişmiş kurallar korunur). Uçlar: POST .../matrix/{preview,apply} ve .../import/
  {preview,apply}. UI: store-admin /shipping/rates → "Matris" sekmesi (ana akış), Basit/Gelişmiş korunur.
  KALAN (sonraki faz): (a) CSV/Excel **file upload** (şu an yalnız paste), (b) toplu **export**, (c) zone için
  generic şablon butonu. Gelişmiş kural editörü hâlâ tekil/istisnai kurallar + surcharge için mevcut.
- TODO-113: 30+/31+ satır semantiği provider teyidi. F3C.4'te matris UI'da 30+ satırı için **davranış seçimi**
  eklendi: "Eşik üstü birim ücret" (PER_ADDITIONAL_KG_OR_DESI; varsayılan) veya "Sabit toplam ücret" (FLAT,
  maxDesi/maxWeightKg=null = "ve üzeri"). Admin gerekirse satır bazında değiştirir. DHL/Aras resmi tarifesinden
  "30+/31+" satırının TOPLAM mı yoksa ek-birim mi olduğu teyit edilince varsayılan/yorum netleştirilecek.
- TODO-114: Adres → zon (zoneCode) çözümleme. EngineAddress.zoneCode şu an null (server city→zone maplemiyor);
  zoneId'li kurallar yalnız zoneCode upstream çözülünce eşleşir. Şehir/ilçe → zon eşleme tablosu (Aras bölge
  tanımları / DHL CBS geo cache TODO-102) ile doldurulacak.
- TODO-112: Sipariş sonrası DHL operasyon otomasyonu — checkout sonrası createRecipient/createOrder/createbarcode
  akışının (admin onaylı veya otomatik) tarife motoruyla ilişkilendirilmesi. Marketplace TRND/N11 kargo alanları
  (bkz. TODO-105) bu akışa bağlanır.
- TODO-116 (ÇÖZÜLDÜ — DHL yanıtı): DHL kargo İPTAL endpoint'i teyit edildi →
  `PUT /mngapi/api/barcodecmdapi/cancelshipment`, gövde `{ referenceId, shipmentId }`.
  `DhlEcommerceAdapter.cancelShipment` implement edildi (guard: env DHL_ECOMMERCE_ALLOW_CANCEL +
  providerConfig + explicitConfirm; shipmentId yoksa CANCEL_REQUIRES_SHIPMENT_ID). `/dhl/cancel` route
  status→CANCELLED + CANCELLED event yazar; UI iptal aksiyonu shipmentId varsa aktif (onay copy'li).
  ENDPOINT_UNRESOLVED kaldırıldı. Kalan: canlı (production) iptal davranışı TODO-118 rollout ile.
- TODO-117: Müşteri tarafı kargo takip UI'si — DONE (TODO-117). Storefront müşteri sipariş detayına
  (`/account/orders/[orderNumber]`) kargo takip kartı eklendi: sağlayıcı (ad + logo / baş harf fallback),
  müşteri-facing durum rozeti, takip no + harici takip linki, 4 adımlı stepper (Hazırlanıyor → Yolda →
  Dağıtımda → Teslim edildi) ve "işlem noktası" timeline'ı. Gateway müşteri sipariş detayı
  (`GET /public/stores/:slug/customer/orders/:orderNumber`) en güncel shipment'ı ALLOWLIST DTO ile döner
  (`customerOrderShipmentSchema`): yalnız providerName/logoUrl/logoAlt/status/trackingNumber/trackingUrl/
  lastLocation/updatedAt/events. SECRET/iç alan (barkod/ZPL, labelUrl, externalOrderId/ShipmentId,
  referenceId, rawSafeJson, alıcı PII) ÇEKİLMEZ/sızmaz; operasyonel-iç event'ler (barkod/webhook/iç oluşturma)
  konum taşımıyorsa müşteri timeline'ından dışlanır. ADR-045 KORUNUR: "Kargoya verildi" otomatik üretilmez
  (ORDER_CREATED hazırlık adımı; teslim yalnız DELIVERED), konum kesin varış değil → "işlem noktası". Own-only
  izolasyon zaten getOrderDetail'de (store+customer+orderNumber); shipment additive nullable, mevcut akış
  bozulmaz. i18n TR/EN paritesi (`account.orders.detail.tracking.*`). Testler: gateway (shipment allowlist +
  secret yok + event filtresi + status passthrough; shipment yoksa null), filtre unit (isCustomerVisibleShipmentEvent),
  storefront saf helper (step index / tone / problem-cancel / initials). TODO-099 (eski kopya) bu işle kapanır.
  KALAN: gerçek kargo provider canlı tracking sync (TODO-100/104) ve checkout'ta provider seçimi/logo (TODO-125).
- TODO-118: DHL canlı (production) rollout checklist — statik IP / client onayı, LIVE base URL geçişi,
  guard flag'lerinin (ALLOW_ORDER/BARCODE/RECIPIENT/CANCEL) canlıda kontrollü açılması, gerçek müşteri adresi →
  MNG cityCode/districtCode çözümleme (CBS geo cache, TODO-102). NOT: barcode "hat kodu" hatası artık
  BARCODE_RETRYABLE_ERROR + BARCODE_FAILED event ile retryable (ADR-045); rollout'ta retry/uyarı UX'i + boş
  yanıt (LABEL_PENDING) için otomatik retry/backoff (bkz. TODO-123) doğrulanmalı.
- TODO-119 (ÇÖZÜLDÜ): Sağlayıcı HTTP timeout env-configurable (DHL_ECOMMERCE_HTTP_TIMEOUT_MS,
  default 60000; timeout→SHIPPING_HTTP_TIMEOUT 504). F3C.3 runtime smoke'ta MNG sandbox ~15s
  latency'sinin sabit 15s timeout'u sınırda abort etmesi üzerine eklendi.
- TODO-120 (ÇÖZÜLDÜ — DHL yanıtı geldi, uygulandı): DHL operasyon finalizasyonu yapıldı.
  Uygulanan aksiyonlar: (a) statusCode 0-7 normalize eşlemesi + regresyon koruması; (b) createbarcode boş
  200 → LABEL_PENDING + BARCODE_PENDING event (tracking/ZPL set edilmez, retry mümkün); (c) hat kodu hatası →
  BARCODE_FAILED event + BARCODE_RETRYABLE_ERROR (createOrder tekrar çağrılmaz); (d) cancel endpoint
  (TODO-116); (e) location "işlem noktası" UI label; (f) "Kargoya verildi" otomatik kullanılmaz; (g) additive
  enum migration. Provider-agnostic refactor HARİÇ (TODO-121). createRecipient boş 200 body başarı sayılır.
- TODO-121 (F3C.5 — UI/domain ayrımı UYGULANDI; tam engine refactor KISMİ): Provider-agnostic **Shipment
  Operations UI + Shipment domain** ayrımı yapıldı (ADR-046). Uygulanan: (a) DB additive
  `ShippingProviderConfig.logoUrl/logoAlt` + `ShipmentEventType.MANUAL_TRACKING` (migration
  `20260630160000`); (b) gateway store-level uçlar `GET /shipping/shipments` (filtre + KPI), `GET
  /shipping/shipments/:id` (order+müşteri+provider+generic capability), generic aksiyon alias'ları
  `create-label`/`sync`/`cancel`/`manual-tracking` (mevcut DHL adapter/aksiyon mantığı `applyCreateLabel/
  applySync/applyCancel/applyManualTracking` helper'larına çıkarıldı, order-scoped DHL route'ları da bunları
  paylaşır); (c) generic capability projeksiyonu `computeShipmentActionCapabilities`
  (canPrepare/canCreateLabel/canSync/canCancel/canManualTracking) + KPI kovaları + provider gorunum DTO; (d)
  store-admin **shipment list** `/shipping/shipments`, **shipment detail** `/shipping/shipments/[id]`
  (provider-safe stepper, "İşlem noktası" timeline, generic action paneli), **order özet kartı** (tam DHL
  operasyon paneli KALDIRILDI → salt-okunur özet + "Kargo Detayına Git" CTA);
  (e) provider logo desteği (config UI create/edit + preview + initials fallback; liste/detay/özet/sağlayıcı
  ekranlarında gösterim); (f) nav linki + TR/EN i18n. KAPSAM DIŞI (sonraki tur): cancel için dedike
  `providerConfig.allowCancel` toggle (şu an `allowOrderCreate` + `DHL_ECOMMERCE_ALLOW_CANCEL` env kapısı),
  tam provider-agnostic engine/registry (UI generic ama backend dispatch hâlâ DHL adapter'a), "Müşteriye
  Bildirim Gönder" (UI'da pasif + not), manuel shipment ana akışı, **tarife detail-page refactor**
  (`/shipping/rates` matris/şablon gelişmiş akışı — F3C.4 üzerine, ayrı tur), storefront provider logo
  (checkout'ta provider SEÇİMİ yok → yalnız altyapı + TODO).
  - **F3C.5 manuel inceleme fix (5dc3cfb üzerine):** (a) manuel takip no girişi artık hazırlık aşamasındaki
    (DRAFT/ORDER_CREATED/LABEL_PENDING/LABEL_CREATED) gönderiyi `IN_TRANSIT`'e ilerletir (regres yok),
    `MANUAL_TRACKING` event "Manuel takip numarası eklendi." — yalnız explicit manuel aksiyon, DHL createbarcode
    otomatik handoff DEĞİL (ADR-046); (b) order özet kartı dış sağlayıcıya İSTEK ATMAZ → destructive inline
    create form kaldırıldı, shipment yoksa güvenli özet + "Kargo Gönderileri" linki, varsa "Kargo Detayına Git";
    (c) guard copy'lerinden yanıltıcı "Canlı" kelimesi kaldırıldı → "güvenlik kilidi" çerçevesi (TR/EN); (d)
    list/detail/order summary tek status helper + takip no yoksa "Henüz oluşmadı" fallback.
  - **Tarife UI borcu (F3C.4B — `/shipping/rates` detail-page refactor, AYRI TUR):** inline edit KALDIRILACAK;
    `/shipping/rates/new` ve `/shipping/rates/[id]` sayfaları yapılacak; "DHL şablonu oluştur" ana buton OLMAYACAK
    (bu turda copy "Şablon seç" yapıldı); ana aksiyon "Şablon seç" olacak; DHL yalnız preset olacak. (Bu tur sadece
    copy düzeltildi; backend/matrix engine'e dokunulmadı.)
- TODO-125 — Checkout kargo SAĞLAYICI/SEÇENEK seçimi + storefront provider/logo akışı. Durum: **DONE**
  (ADR-047). Bir "kargo seçeneği" = AKTİF `ShippingRatePlan` + price-engine ücreti (store TARİFE'si, ADR-044;
  provider canlı quote DEĞİL) + (varsa) ENABLED `ShippingProviderConfig` görünüm bilgisi (ad + public logo).
  Paralel kargo modeli YOK. Uygulanan: (a) DB additive — `Order.shippingProvider/shippingProviderName/
  shippingLogoUrl/shippingEtaText` + `ShippingRatePlan.deliveryEstimate` (migration `20260701120000`); (b) public
  uçlar `POST /public/stores/:slug/cart` ve `/checkout` artık `shipping.options[]` + `selectedOptionId` döner
  (müşteri-güvenli ALLOWLIST: secret/credential/account no/label/barcode YOK); istek `shippingOptionId` kabul eder;
  (c) checkout SUNUCU-OTORİTER doğrular: ücreti seçilen plandan YENİDEN hesaplar (istemci fiyatına güvenmez —
  tamper imkânsız, body'de fiyat alanı yok ve strip edilir), cross-store/inactive/bilinmeyen id `SHIPPING_OPTION_INVALID`,
  çoklu seçenek + seçimsiz `SHIPPING_OPTION_REQUIRED`, uygun seçenek yok `SHIPPING_QUOTE_UNAVAILABLE` (NO_RATE_PLAN
  geriye dönük korunur), tek seçenek otomatik seçilir; (d) sipariş SNAPSHOT'i (provider/hizmet/ücret/para/logo/ETA)
  `createOrder`'a yazılır → tarihsel sabitlik; (e) sipariş onayı (`shippingOption`), müşteri sipariş detayı
  (`shippingSelection`, shipment canlı takibinden AYRI) ve store-admin sipariş detayı (özet satırı + `orderSchema.
  shippingSelection`) seçimi gösterir; (f) storefront checkout'ta seçilebilir provider kartları (radio, dropdown
  DEĞİL; logo veya baş-harf fallback, fiyat/ETA, seçim cookie'ye yazılıp sayfa revalidate ile toplamı günceller);
  tek/çok/yok durumları + net TR mesajlar; (g) store-admin tarife formu `deliveryEstimate` alanı; seed demo verisi
  (2 ENABLED provider + 2 aktif tarife). i18n TR/EN paritesi. Testler: gateway (çoklu seçenek listesi + provider
  ad/logo, seçim→ücret/snapshot, toplam değişimi, tamper-yok, cross-store red, tek-seçenek auto), saf builder
  (`checkout-options`: default/en-ucuz/requested seçim, fiyatlanamayan plan dışlanır, adres yok→fiyatsız, provider
  fallback), storefront helper (logo/initials). TODO-117 shipment takip testleri yeşil kalır.
  KALAN: provider logo dosya UPLOAD/asset storage (artık TODO-127); şu an `logoUrl` manuel public URL.
- TODO-127 — Provider logo upload/storage. Durum: TODO (eski TODO-125'ten ayrıldı). `ShippingProviderConfig.logoUrl`
  şu an manuel public URL (geçici MVP, dış bağımlılık). İleride dosya upload / asset storage / media library ile
  yönetilmeli; `logoAlt` korunur. Checkout/success/admin'de logo gösterimi TODO-125 ile zaten devrede.
- TODO-126 — Manuel gönderi (online-first fallback). Durum: **UYGULANDI** (online-first revizyonuyla). Karar
  revize edildi: order CTA artık online-first (createRecipient + createOrder) + güvenli fallback. Uygulanan:
  (a) `POST .../orders/:orderId/shipping/shipment-draft` — provider'a İSTEK ATMAZ, yerel ORDER_CREATED shipment
  (recipient/pieces siparişten) + manuel işaretli event; (b) order özet kartı "Gönderi Oluştur" online dener,
  sağlayıcı hatasında "Geçici sağlayıcı hatası… Manuel Gönderi Hazırla" CTA'sına düşer; (c) başarıda shipment
  detayına yönlendirir. KALAN/opsiyonel: generic createOrder shipment id döndürmediğinden detaya yönlendirme
  refetch ile yapılıyor (DHL prepare id döndürür); ileride generic createOrder da id döndürebilir.
- TODO-122 — Docker dev image clean-build gap. Durum: TODO. Tracked `infra/docker/node.Dockerfile`
  `pnpm build` ÇALIŞTIRMIYOR (yalnız `pnpm install` + `pnpm db:generate`); api-gateway dev runtime bazı
  workspace paketlerini (`@commerce-os/config` `dist/index.js`, `@commerce-os/db` `dist/src/index.js`,
  contracts/api-client) `dist/` üzerinden çözüyor. Temiz checkout / build context içinde `dist/` yoksa
  image ayağa kalkmayabilir (api-gateway `ERR_MODULE_NOT_FOUND`). F3C.4 Docker/main-context smoke host'ta
  derlenmiş `dist/` bulunduğu için geçti (önceki worktree-docker smoke'larıyla aynı pattern). CI/deploy
  öncesi: Dockerfile'a build adımı eklenmeli VEYA workspace paketlerine `development` export koşulu (src'den
  çözme) stratejisi netleştirilmeli. Kapsam: Repo infra / Docker. Bloklayıcı: F3C.4 için HAYIR;
  deploy/CI hardening için EVET.
- TODO-128 (AÇIK): Store-admin webhook yönetim UI — sağlayıcı ayar sayfasına "Webhook" bölümü:
  rotate CTA (secret TEK SEFERLIK gösterim, ADR-035 kopya deneyimi), webhookConfigured durumu,
  webhook path kopyalama, inbox son teslimatlar listesi (outcome + tarih; payload GÖSTERİLMEZ).
  Backend uçları TODO-104 ile hazır (rotate + inbox modeli); yalnız BFF + UI + i18n kaldı.
- TODO-129 (AÇIK): Zamanlanmış otomatik toplu tracking sync worker job'ı — `sync-all` ucundaki mantığın
  worker'da periyodik çalıştırılması (backoff, store başına limit, yalnız ENABLED provider); admin uç
  manuel tetik olarak kalır. TODO-123 (barcode retry) ile aynı worker altyapısını paylaşabilir.
- TODO-130 (AÇIK): DHL/Geliver HAM webhook format + provider-özel imza şeması adaptörleri — sağlayıcının
  gerçek push formatını platform-normalize sözleşmeye çeviren adapter katmanı + sağlayıcının kendi imza
  doğrulaması (DHL callback kaydı TODO-107 canlı süreciyle birlikte). Şu an uç platform-normalize
  sözleşme + platform HMAC şeması ile çalışır (ADR-048).
- TODO-123 (AÇIK): Barcode boş-yanıt (LABEL_PENDING) için otomatik retry/backoff job. createOrder→createbarcode
  arası MNG sandbox sparse yanıt verebildiğinden, LABEL_PENDING gönderiler için zamanlanmış yeniden deneme
  (backoff + max attempts) ve admin'e bildirim. Şu an retry manuel (UI "Barkod Oluştur" tekrar).
- TODO-124 (AÇIK): CBS adres normalizasyonu — gerçek müşteri adresi → MNG cityCode/districtCode otomatik
  eşleme (CBS geo cache, TODO-102 ile). Şu an cityCode/districtCode admin tarafından elle girilebiliyor.
- TODO-131: F3C.6 DHL sandbox verification & hardening (DONE — 2026-07-03, ADR-049). Sağlanan 6 OpenAPI dokümanı
  (Identity/CBS/Plus/Standard Command/Standard Query/Barcode) mevcut adapter'la satır satır karşılaştırıldı +
  güvenli read-only sandbox smoke yapıldı (Identity token 200, getcities 200/82 şehir, getdistricts/34 200/40 ilçe,
  bilinmeyen referans getshipmentstatus/trackshipment 404 ProblemDetails, calculate → aşağıda). Düzeltilen kusurlar:
  (1) `parseProviderDate` dd-MM-yyyy (tire) formatını `Date.parse`'ın ABD MM-DD tuzağına düşürüyordu → regex önce,
  ayraç [./-], saat opsiyonel; (2) trackshipment KÜMÜLATİF liste her sync'te yeniden TRACKING_UPDATED yazıyordu →
  insert-seviyesi dedupe (`shipmentTrackingEventKey`) + müşteri timeline ardışık-duplikasyon filtresi
  (`dedupeConsecutiveShipmentEvents`); (3) HTTP >=400 sorgu/operasyon yanıtı başarı gibi parse ediliyordu (404 →
  junk STATUS_CHANGED, calculate 4xx → 0 TL quote, createOrder 400 → null-id sahte başarı) → status-aware normalize:
  404 sorgu → PROVIDER_SHIPMENT_NOT_FOUND (404), diğer → PROVIDER_QUERY_FAILED (502) / PROVIDER_OPERATION_FAILED
  (redaksiyonlu mesaj); (4) SANDBOX↔DOKÜMAN ÇELİŞKİSİ: calculate binder'ı cityCode/districtCode'u STRING ister
  (OpenAPI integer der; integer → 400 code 4002 "System.String") → string gönderiliyor; (5) MNG hata zarfı gerçekte
  `{error:{code|Code,message|Message,description|Description}}` nested/PascalCase → extractProviderErrorMessage
  genişletildi; (6) .env.example eksik DHL değişkenleri eklendi; (7) statusCode 8 (Destek_Gerekiyor) bilerek
  eşlenmemiş — bilinmeyen kod durumu İLERLETMEZ (testle sabitlendi). KALAN: calculate sandbox'ta HTTP 500 code 20001
  "<WERR>[] NOLU ŞUBENİN İLİ BULUNAMADI" döner (test müşteri hesabında şube ataması yok — hesap/provizyon kısıtı;
  ADR-044 gereği calculate checkout fiyatı için kullanılmadığından etki düşük). createOrder/createbarcode/cancel bu
  turda ÇAĞIRILMADI (dokümanlar faturasız/güvenli olduğunu belirtmiyor; F3C.3'te zaten uçtan uca doğrulanmıştı).
  Webhook formatı dokümanlarda YOK → provider-özel webhook adaptörü eklenmedi; TODO-130 AÇIK kalır.
- TODO-132: MNG/DHL createRecipient e-posta çözümleme + payload doğrulama (DONE — 2026-07-03). Runtime bulgu:
  store-admin "Gönderi Oluştur" 502 (PROVIDER_OPERATION_FAILED) veriyordu; MNG sandbox createRecipient'ı 400 kod
  26039 ("'Recipient. Email' geçerli bir e-posta adresi değil") ile reddediyordu çünkü adapter `email: ""`
  gönderiyordu (UI recipient'ı sipariş adresinden e-postasız kuruyor, sipariş e-postası hiç kullanılmıyordu).
  Fix: (1) alıcı e-postası SUNUCU-otoriter çözülür — Order.customerEmail → Customer.email fallback (trim +
  format doğrulama); geçerli e-posta yoksa sağlayıcı ÇAĞRILMADAN 422 RECIPIENT_EMAIL_REQUIRED/INVALID;
  (2) DHL builder'ları (`buildDhlRecipientBody`) boş/geçersiz e-postayla istek ÜRETMEZ (email:""/null imkansız);
  (3) cityCode/districtCode 0 GÖNDERİLMEZ — bilinmiyorsa alan atlanır (OpenAPI: opsiyonel int32, CBS'ten alınır;
  ad alanları yeterli — sandbox 200 doğrulandı); (4) telefon MNG doküman örneğindeki yerel 10 haneye normalize
  (+90/0 öneki soyulur); (5) MNG 26039 → RECIPIENT_EMAIL_INVALID normalize + `extractProviderErrorCode` (kod
  mesaja güvenli işlenir); (6) i18n TR/EN + order kargo kartında spesifik aksiyon mesajı. İKİNCİ runtime bulgu:
  createOrder `content: ""` ile açıklamasız 400 veriyordu — OpenAPI Order.content+description REQUIRED →
  boşsa referenceId fallback gönderilir (sandbox 200). Sandbox doğrulama: OS-000054 prepare → HTTP 201,
  Shipment ORDER_CREATED (createRecipient 200 + createOrder 200); barkod/iptal ÇAĞIRILMADI. KALAN: TODO-124
  (CBS otomatik kod eşleme) açık; kullanıcı stack'inde docker api-gateway rebuild gerekir.

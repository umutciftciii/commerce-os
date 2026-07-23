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
- TODO-122 — Docker dev image clean-build gap. Durum: ÇÖZÜLDÜ (TODO-137, 2026-07-03). Tracked `infra/docker/node.Dockerfile`
  `pnpm build` ÇALIŞTIRMIYOR (yalnız `pnpm install` + `pnpm db:generate`); api-gateway dev runtime bazı
  workspace paketlerini (`@commerce-os/config` `dist/index.js`, `@commerce-os/db` `dist/src/index.js`,
  contracts/api-client) `dist/` üzerinden çözüyor. Temiz checkout / build context içinde `dist/` yoksa
  image ayağa kalkmayabilir (api-gateway `ERR_MODULE_NOT_FOUND`). F3C.4 Docker/main-context smoke host'ta
  derlenmiş `dist/` bulunduğu için geçti (önceki worktree-docker smoke'larıyla aynı pattern). CI/deploy
  öncesi: Dockerfile'a build adımı eklenmeli VEYA workspace paketlerine `development` export koşulu (src'den
  çözme) stratejisi netleştirilmeli. Kapsam: Repo infra / Docker. Bloklayıcı: F3C.4 için HAYIR;
  deploy/CI hardening için EVET.
- TODO-128 (DONE — 2026-07-04): Store-admin webhook yönetim/gözlem UI. Kargo Sağlayıcıları
  sayfasına "Webhook" modalı eklendi: webhook durum rozeti, tam webhook URL (kopyala butonu),
  secret rotate CTA (yeni secret YALNIZ BİR KEZ gösterim + uyarı + kopyala; ADR-035 deseni) ve
  son webhook olayları tablosu (receivedAt/provider/eventKey/outcome/shipmentId; RAW payload/imza/
  secret/payloadHash GÖSTERİLMEZ). Yeni yetkili tekil uç `GET /stores/:storeId/shipping/providers/
  :id/webhook` (mağaza+provider SCOPED inbox projeksiyonu, limit default 20/max 50, güvenli DTO
  allowlist'i). Webhook URL, yeni `PUBLIC_WEBHOOK_BASE_URL` env'inden üretilir; tanımsızsa panel
  net uyarı gösterir (URL üretmez). Token bulk config DTO'suna EKLENMEZ (TODO-104 sızıntı testi
  yeşil kalır); tam URL yalnız bu tekil uçta döner (rotate ile aynı admin-görünür token deseni).
  HMAC/timestamp/idempotency/rotate semantiği DEĞİŞMEDİ. Rotate BFF + `webhookInfo` api-client
  metodu + storeApi wrapper'ları eklendi. Testler: api-gateway 8 + store-admin 6.
- TODO-129: Zamanlanmış shipment sync worker'ı (DONE — 2026-07-04, ADR-051). Provider-agnostic çekirdek
  `sync-service.ts` (uygun gönderi seçimi + adapter dispatch + regresyon korumalı durum ilerletme + event
  idempotency) hem yeni zamanlanmış döngü (`sync-worker.ts`, api-gateway süreci içinde; gerekçe ADR-051)
  hem manuel `sync-all`/tekil sync uçları tarafından kullanılır (drift yok). `Shipment`'a minimal sync
  metadata'sı eklendi (`lastSyncAt/nextSyncAt/syncAttempts/lastSyncErrorCode` + 2 index; migration
  `20260704120000_add_shipment_sync_metadata`). Env: `SHIPMENT_SYNC_ENABLED` (varsayılan false; docker dev
  compose açık) + `SHIPMENT_SYNC_INTERVAL_SECONDS/BATCH_SIZE/STALE_AFTER_MINUTES/MAX_ATTEMPTS` — hepsi
  PR #15 boş-string desenine toleranslı. STATUS_CHANGED artık yalnız gerçek değişimde yazılır (tekrarlanan
  polling duplicate event üretmez; `lastSyncedAt` DTO'su `Shipment.lastSyncAt`'ten beslenir). Sync
  desteklemeyen sağlayıcı (MOCK/GELIVER) `PROVIDER_SYNC_UNSUPPORTED` ile güvenle atlanır; gönderi başına
  hata batch'i durdurmaz; DELIVERED/terminal asla regres etmez; NOT_FOUND/4xx/5xx durumu İLERLETMEZ
  (backoff + sanitize hata kodu). Testler: `shipping-sync-service.test.ts` (25). Kalan: TODO-123 (barcode
  retry) aynı çekirdek/worker desenini paylaşabilir; ham provider webhook adapter'ları TODO-130'da.
- TODO-130 (DONE — 2026-07-04, ADR-055; Geliver ham format ÖRNEK BEKLİYOR): Provider HAM webhook payload
  adapter katmanı (`webhook-adapters.ts`). İmza doğrulama SONRASI çalışan saf normalize fonksiyonu:
  PLATFORM sözleşmesi (ADR-048) tüm sağlayıcılar için aynen çalışır (geriye uyum); DHL_ECOMMERCE(=MNG)
  için yalnız repoda GROUNDED şekiller çözülür (getshipmentstatus-benzeri durum push'u + trackshipment-
  benzeri kümülatif hareket push'u; alan adları mappers.ts OpenAPI eşlemeleriyle birebir — uydurma alan
  yok). Eşleştirme önceliği externalShipmentId → trackingNumber → referenceId ({storeId, providerConfigId}
  scoped; PII/adresle eşleşme ve webhook'tan shipment yaratma YOK). Idempotency: PLATFORM yolu mevcut
  anahtarı korur (evt:/sha256:), ham şekiller volatil alansız normalize deterministik `nrm:` hash;
  inbox unique (providerConfigId, eventKey) dedupe kapısı DEĞİŞMEDİ. Durum eşleme sync ile AYNI
  `mapProviderStatusToShipmentStatus` fold'u (bilinmeyen kod ilerletmez, terminal regres etmez); çoklu
  hareketler doğal anahtarla (shipmentTrackingEventKey, TRACKING_UPDATED∪WEBHOOK_RECEIVED) dedupe edilip
  ek WEBHOOK_RECEIVED yazılır. Migration YOK, kontrat değişikliği YOK. KALAN: (1) Geliver ham formatı =
  güvenli IGNORED_UNSUPPORTED ("örnek payload gerekli") — gerçek örnek gelince adapter doldurulacak;
  (2) sağlayıcının KENDİ imza şeması (platform HMAC yerine) canlı callback kaydı/abonelik (TODO-107)
  sonrası ayrı iş — güvenlik modeli zayıflatılmadan mevcut HMAC korunur. Testler:
  `shipping-webhook-adapters.test.ts` (18), mevcut `shipping-webhook.test.ts` (17) yeşil.
- TODO-123 (DONE — 2026-07-04, ADR-054): Barkod retry/backoff (transient otomatik, veri-hatası admin
  düzeltmesi bekler). Üç sınıf (`barcode-service.ts`): RETRYABLE (timeout/5xx/network) → üssel backoff
  (`stale·2^(deneme-1)`, 6 saat cap, `BARCODE_RETRY_MAX_ATTEMPTS` sonra `MAX_ATTEMPTS` blok); DATA_FIX
  (`DESTINATION_BRANCH_NOT_FOUND`, `ADDRESS_DISTRICT_CODE_REQUIRED`, `CBS_CODE_INVALID`, `RECIPIENT_EMAIL_*`)
  → otomatik denenmez; TERMINAL (`AUTH_FAILED`/`*_DISABLED`) → otomatik denenmez. Ayrı additive Shipment
  metadata (`barcodeRetryCount`/`barcodeNextRetryAt`/`barcodeLastAttemptAt`/`barcodeRetryBlockedReason`;
  TODO-129 sync alanlarından bağımsız). Manuel "Barkod/Etiket Oluştur" + zamanlanmış
  `barcode-retry-worker.ts` (TODO-129 deseni; `BARCODE_RETRY_ENABLED=false` varsayılan) AYNI `attemptBarcode`
  çekirdeğini kullanır. **TODO-124/TODO-139 etkileşimi:** repair-destination + adres düzenleme
  `lastBarcodeErrorCode` + retry blok/sayaç/backoff'u sıfırlar → DATA_FIX bloğu kalkar, deneme yeniden
  anlamlı. Idempotent `BARCODE_FAILED` (ilk hata/kod değişimi/yeni blok). Sahte başarı yok; durum yalnız
  barkod kanıtıyla ilerler; duplicate guard + CustomerAddress bozulmaz. UI: retry durumu (sonraki deneme/
  sayaç/blok nedeni) + "Şimdi Tekrar Dene" + DATA_FIX CTA. Testler: `shipping-barcode-retry.test.ts` (28),
  `shipping-barcode-route.test.ts` (2), `shipment-screens.test.tsx` retry UI (4).
- TODO-124: CBS il/ilçe kod eşleme + admin varış onarımı (DONE — 2026-07-04, ADR-052). Kök neden (OS-000053):
  UI recipient'ı sipariş adresinden yalnız cityName/districtName ile kuruyordu, cityCode/districtCode hiç
  gönderilmiyordu; adres metni ilçe seçimiyle tutarsız olunca MNG createOrder'ı kabul edip createbarcode'da
  500 kod 20001 "VARIŞ ŞUBESİ BULUNAMADI" veriyordu. Uygulanan: (1) `cbs-resolver.ts` — TR-güvenli normalize
  (tr-TR lower + diakritik katlama; İstanbul/ISTANBUL/uskudar/kucukcekmece) ile CBS il/ilçe listesinden YALNIZ
  exact-match kod çözümü (fuzzy YOK; aynı ada farklı kodlu çift = muğlak = eşleşmedi), providerConfig-bazlı
  6 saat TTL in-memory cache (CBS aşırı çağrılmaz); (2) prepare + generic create-order (DHL) sağlayıcı
  çağrısından ÖNCE kodları çözer: geçerli saklı kod (>0) aynen korunur (OS-000050 yolu), 0/geçersiz kod asla
  gönderilmez (TODO-132 korunur), CBS verisi varken il/ilçe eşleşmezse sağlayıcı ÇAĞRILMADAN 422
  ADDRESS_DISTRICT_CODE_REQUIRED; CBS erişilemezse/ilçe metni yoksa eski isim-bazlı davranış sürer
  (OS-000041/43 regresyonu korunur); serbest adres metninden ilçe TAHMİN EDİLMEZ; (3) barkod 20001/"VARIŞ
  ŞUBESİ" → `DESTINATION_BRANCH_NOT_FOUND` sınıflandırması: BARCODE_FAILED event (rawSafeJson.errorCode +
  admin-güvenli TR statusText), yeni `Shipment.lastBarcodeErrorCode` kolonu (başarı/pending/onarım sıfırlar),
  route 409 PROVIDER_DESTINATION_BRANCH_UNRESOLVED (retryable; durum İLERLEMEZ, sahte başarı YOK — ADR-045
  korunur); (4) admin onarım: `POST /stores/:id/shipping/shipments/:sid/repair-destination` — kod CBS'e karşı
  SUNUCUDA yeniden doğrulanır (CBS_CODE_INVALID), Shipment recipient SNAPSHOT'ı güncellenir (sipariş/müşteri
  adresi mutasyona uğramaz), aynı referenceId ile createRecipient sağlayıcıya yeniden iletilir; reddedilirse
  yerel düzeltme korunur + providerResent=false döner (UI sınırlamayı açıkça söyler: mevcut kargo kaydı
  otomatik güncellenmeyebilir); DESTINATION_REPAIRED event yazılır; (5) yeni CBS ilçe ucu
  `POST .../shipping/dhl/cbs/districts` (+mevcut cities/preview ucu cache'e bağlandı); (6) store-admin
  shipment detayında "Varış İl/İlçe Eşlemesi" kartı: il/ilçe + kargo il/ilçe kodları + eşleşme rozeti +
  "Adres İl/İlçe Eşlemesini Düzelt" paneli (CBS dropdown, "CBS'den Eşleştir" otomatik ön seçim,
  kaydet+yeniden ilet, retry rehberi); capability `canRepairDestination` (yalnız DHL + ORDER_CREATED/
  LABEL_PENDING); order kartı 422'yi spesifik mesajla gösterir. Migration:
  `20260704130000_add_shipment_destination_repair` (enum DESTINATION_REPAIRED + Shipment.lastBarcodeErrorCode;
  additive-only). Duplicate guard / webhook HMAC / sync worker / ödeme guard'ına DOKUNULMADI. Testler:
  `shipping-cbs-mapping.test.ts` (28). KALAN/SINIRLAMA: MNG'nin mevcut sipariş kaydında varış güncellemesini
  kabul ettiği garanti değil; OS-000053/54/55 gibi takılı sandbox kayıtları onarım+retry ile düzelmezse yeni
  sipariş/gönderi gerekebilir (barkod öncesi cancelshipment shipmentId olmadığından çağrılamaz). TODO-123
  retry/backoff bu sınıflandırmayı tüketmelidir.
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
- TODO-133 — Prepare başarısını shipment/order durum özetine yansıt (DONE — 2026-07-03). NOT: iş kalemi
  brief'te "TODO-127" olarak adlandırıldı; ancak repo'daki TODO-127 = "Provider logo upload/storage" (AÇIK,
  farklı iş) olduğundan numara çakışmasını önlemek için bu düzeltme TODO-133 olarak kaydedildi. Kök neden:
  state reflection/copy hatası — backend prepare/createOrder başarısında zaten `Shipment.status=ORDER_CREATED`
  yazıyor + `ORDER_CREATED` event kaydediyor ve `Order.status`'u DEĞİŞTİRMİYOR (doğru), ancak UI kopyası
  yanıltıcıydı: durum etiketi "Gönderi kaydı oluşturuldu" idi ve "kargonun alımı bekleniyor" ipucu yoktu.
  ADR-045/049 semantiği korunur (createOrder başarısı = kargo firmasında KAYIT açıldı; kargoya verildi/yolda/
  teslim DEĞİL). Uygulanan (yalnız yansıtma/kopya, mimari değişmez): (a) store-admin `shipment-ui`
  ORDER_CREATED etiketi → "Gönderi oluşturuldu"/"Shipment created", açıklaması → "Kargonun alımı bekleniyor.
  Kargo firmasında kayıt açıldı."/"Waiting for carrier pickup…"; yeni `isAwaitingPickupStatus` yardımcısı;
  order özet kartı hazırlık durumunda bekleme ipucunu gösterir; (b) müşteri storefront i18n TR/EN
  `statusValues`/`eventValues` ORDER_CREATED → "Gönderi oluşturuldu" + yeni `preparedNote` "Kargonun alımı
  bekleniyor."; takip kartı hazırlık aşamasında bu notu gösterir; (c) müşteri-güvenli: gateway customer DTO
  ORDER_CREATED event `statusText`'ini null'lar (admin operasyonel metni "…(DHL gönderi kaydı)" sızmaz →
  i18n kullanılır); iç id/secret/ham payload YOK. Testler: store-admin `shipment-ui`/order özet, storefront
  `shipment` + i18n kopya, gateway `customerSafeShipmentEventStatusText`; duplicate prepare 409 +
  event/status tekrarsızlığı ve "prepare success ≠ shipped/in-transit/delivered" mevcut testlerle korunur.
- TODO-135 — Sipariş listesi/başlık karşılama rozetlerini shipment hazırlık durumuna yansıt (DONE —
  2026-07-03). Kök neden: TODO-133 shipment DETAY kartını düzeltti ama sipariş ÖZET/liste rozetleri hâlâ
  `Order.fulfillmentStatus`'u DOĞRUDAN okuyordu (`Shipment.status`'tan türetilmiyordu) → prepare başarısına
  (ORDER_CREATED) rağmen store-admin liste/başlık "Gönderilmedi", storefront hesabım listesi "Henüz kargoya
  verilmedi" gösteriyordu. Backend prepare/mimari DEĞİŞMEZ; yalnız gösterim yansıtması. Uygulanan: (a) yeni
  paylaşılan SAF helper `getOrderFulfillmentDisplay(fulfillmentStatus, shipmentStatus)` + `pickOrderShipmentStatus`
  (`@commerce-os/contracts`, api-client'tan re-export) — öncelik: iptal>DELIVERED>IN_TRANSIT/OUT_FOR_DELIVERY>
  ORDER_CREATED/DRAFT/LABEL_* → SHIPMENT_CREATED, aksi halde fulfillment; ORDER_CREATED asla shipped/transit/
  delivered sayılmaz (ADR-045). (b) DTO allowlist: admin `orderSchema` + `customerOrderSummarySchema`'ya yalnız
  temsili `shipmentStatus` DURUM enum'u eklendi (statusText/iç ID/ham payload YOK; gateway `orderSelect`/
  `listOrders` `shipments.status` çeker, birden çok gönderide en ileri durum seçilir). (c) UI: store-admin
  liste + detay hero rozeti ve storefront `OrderStatusBadges` display helper üzerinden çözülür; yeni i18n
  `fulfillmentDisplayLabels` (store-admin TR/EN) + `fulfillmentDisplay` (storefront TR/EN) — "Gönderi
  oluşturuldu"/"Shipment created". `Order.status`/`Order.fulfillmentStatus` MUTATE EDİLMEZ. Testler: contracts
  helper/DTO allowlist (11), store-admin liste/detay rozet (ORDER_CREATED→"Gönderi oluşturuldu", shipment
  yok→"Gönderilmedi", IN_TRANSIT→"Yolda"), storefront `order-badges` (ORDER_CREATED, no-shipment, IN_TRANSIT/
  DELIVERED). KALAN: kullanıcı stack'inde docker api-gateway + store-admin-web + storefront-web REBUILD gerekir;
  runtime doğrulama (OS-000054/OS-000055) merge/rebuild sonrası.
- TODO-136 — Karşılama durum kopyasını netleştir + ödemesiz siparişe gönderi guard'ı (DONE — 2026-07-03). İki
  parça. (A) Kopya: TODO-135'in tek `SHIPMENT_CREATED` gösterim durumu operasyonel olarak yetersizdi; hazırlık
  aşaması iki nete ayrıldı — ORDER_CREATED/LABEL_PENDING → `AWAITING_PICKUP` ("Kargonun Alınması Bekleniyor"),
  LABEL_CREATED → `PACKED` ("Kargo İçin Paketlendi"); OUT_FOR_DELIVERY artık IN_TRANSIT'e çökmez (`OUT_FOR_DELIVERY`
  → "Dağıtımda"); kargo kaydı yok → NOT_SHIPPED etiketi "Hazırlanıyor" oldu ("Gönderilmedi"/"Henüz kargoya
  verilmedi" kaldırıldı). Aynı sözlük tüm yüzeylerde: store-admin liste "Karşılama Durumu", detay hero, kargo
  özet kartı + shipment detay/liste rozeti (`SHIPMENT_STATUS_LABEL`), storefront hesap listesi + takip
  `statusValues`, "Hazırlanıyor" sekmesi; i18n TR/EN. `getOrderFulfillmentDisplay` yeniden eşlendi (ADR-045
  korunur: ORDER_CREATED asla shipped/transit/delivered). "Henüz Teslim Alınmadı" etiketi bilinçli olarak OTOMATİK
  türetilmedi (mevcut mimaride ORDER_CREATED/LABEL_CREATED'ten ayıran ayrı provider sinyali yok; müşteri teslim
  durumuyla karışma riski — brief uyarısı). (B) Guard: ödemesi alınmamış sipariş kargoya VERİLEMEZ. Yeni SAF
  helper `isOrderPaidForShipment(paymentStatus)` (PAID/AUTHORIZED uygun; UNPAID/REFUNDED engelli — mevcut domain
  `succeeded` semantiği, ADR-050). Backend NİHAİ otorite: `create-order` + `dhl/prepare` + `shipment-draft`
  uçları sağlayıcı çağrısından/Shipment/ShipmentEvent yaratımından ÖNCE 409 `ORDER_PAYMENT_REQUIRED` döner.
  Store-admin kargo kartı ödemesiz siparişte "Gönderi Oluştur"u pasifleştirir + "Ödeme alınmadan gönderi
  oluşturulamaz." yardımcı metni. Ödeme provider/checkout/DHL/MNG/webhook mimarisi DEĞİŞMEZ. Testler: contracts
  helper (`isOrderPaidForShipment` + gösterim eşlemesi), api-gateway `shipping-payment-guard` (unpaid create-order/
  prepare/draft → 409, Shipment/ShipmentEvent YOK; paid guard'ı geçer), store-admin `order-shipment-summary`
  (unpaid buton pasif + yardımcı metin; paid aktif) + liste/hero rozet, storefront `order-badges`/`shipment`
  kopya. Tüm mevcut TODO-117/125/132/133/135 testleri yeşil. KALAN: kullanıcı stack'inde docker api-gateway +
  store-admin-web + storefront-web REBUILD; runtime doğrulama merge/rebuild sonrası.
- TODO-137 — Docker deterministik clean-build + cache hijyeni (DONE — 2026-07-03). TODO-122'nin çözümü;
  TODO-135/136 runtime rebuild'lerinde ortaya çıkan gerçek altyapı boşluğu. Kök neden: `infra/docker/
  node.Dockerfile` yalnız `pnpm install` + `pnpm db:generate` yapıyor, `pnpm build` YOK; ayrıca `.dockerignore`
  yoktu → `COPY apps/packages/services` host'tan üretilmiş artifact'leri (bayat `packages/*/dist`, host
  `node_modules` [darwin/arm64], `apps/*/.next`, `.turbo`) imaja sızdırıyordu. Dev container'ları paketleri
  derlenmiş `dist/`'ten import ettiği için bayat host `dist` → `does not provide an export named
  'pickOrderShipmentStatus'` çökmesi (TODO-135 rebuild). Workaround: host'ta önce `pnpm db:generate && pnpm build`
  — kırılgan. Çözüm: (A) `.dockerignore` eklendi — `node_modules`/`**/node_modules`, `dist`/`**/dist`, `.next`/
  `**/.next`, `build`, `*.tsbuildinfo`, `packages/db/generated`, `**/.prisma`, `.turbo`, `coverage`, `.env*`
  (`!.env.example`), `.git`, `.claude` (iç içe worktree'ler — dev), `docs`, `*.log`, `.DS_Store` dışlandı;
  kaynak/manifest/lockfile/Prisma şema+migration/Next config KORUNDU. (B) Dockerfile artifact'leri İMAJ İÇİNDE
  üretir: `pnpm install --frozen-lockfile` (lockfile'dan deterministik, pnpm store cache mount) → `pnpm
  db:generate` → `pnpm exec turbo run build --filter="./packages/*"` (paylaşılan paket `dist`'leri; backend app
  `tsx watch` kaynaktan, web app `next dev` — app bundle gerekmez ama ikisi de paketleri `dist`'ten import eder).
  Runtime komutları (`pnpm --filter <ws> dev`) DEĞİŞMEDİ — yalnız build katmanı. Doğrulama: host gate'leri yeşil
  (typecheck 0, lint 34/34, test 355 passed, `git diff --check` temiz); Docker clean-build — api-gateway +
  store-admin-web + storefront-web imajları paylaşılan Dockerfile'dan build oldu (12 paket İMAJ İÇİNDE taze
  derlendi, 0 cached), build context host artifact sızıntısı OLMADAN 2.98MB'a düştü; imaj-içi kanıt: api-gateway
  bağlamında `import('@commerce-os/contracts').pickOrderShipmentStatus === 'function'` (bayat-export senaryosu
  çözüldü), `@commerce-os/db` import OK (Prisma client pnpm sanal store'da), web-app bağlamında
  `@commerce-os/api-client` import OK; container platformu linux/arm64 (host darwin sızıntısı yok). App/domain
  mantığı DEĞİŞMEDİ — yalnız Docker/build hijyeni. Cache hijyeni: bkz. docs/OPERATIONS.md (clean build + `docker
  builder/image/container prune`; volume'lara DOKUNULMAZ). KALAN: main'e merge sonrası kullanıcı ana `docker`
  stack'ini `--no-cache` gerekmeden rebuild edebilir; host'ta önce `pnpm build` ARTIK GEREKMEZ.
- TODO-139 — Sipariş teslimat adresi snapshot düzenleme (DONE — 2026-07-04). İş problemi: sipariş oluştuktan
  sonra yanlış/tutarsız adres kalan siparişlerde admin'in teslimat adresini — gönderi henüz taşınmaya
  başlamadan — güvenle düzeltebilmesi. Kök neden: TODO-124 repair YALNIZ `Shipment` il/ilçe KODLARINI düzeltir;
  `OrderAddress(SHIPPING)` snapshot'ı ile ad/telefon/adres satırı/il-ilçe İSİMLERİ düzenlenemiyordu (Order
  snapshot bayat kalıyordu). Snapshot kaynak-otoritesi: sipariş adresi = `OrderAddress(SHIPPING)` (kargo kodu
  YOK); kargo kodları/operasyon = `Shipment.recipient*`. Uygulanan: yeni `PATCH /stores/:storeId/orders/
  :orderId/shipping/address` (shipping/routes.ts) — ownership + store-admin auth; güvenli durum guard'ı
  (`ADDRESS_EDITABLE_SHIPMENT_STATUSES = DRAFT|ORDER_CREATED|LABEL_PENDING`; aktif gönderi başka durumdaysa 409
  `SHIPMENT_ADDRESS_LOCKED` — LABEL_CREATED/IN_TRANSIT/…/DELIVERED/RETURNED/CANCELLED KİLİTLİ; TODO-124 repair
  guard'ıyla birebir tutarlı). İşlem: (1) `OrderAddress(SHIPPING)` transaction'da güncellenir/oluşturulur;
  (2) `OrderEvent(type="SHIPPING_ADDRESS_UPDATED")` yazılır (String — migration YOK); (3) gönderi düzenlenebilirse
  `Shipment` alıcı snapshot'ı da güncellenir; (4) DHL ise CBS il/ilçe çözümü/doğrulaması — client'tan gelen
  cityCode/districtCode CBS'e karşı YENİDEN doğrulanır (`validateCodes`; körü körüne güvenilmez), kod
  verilmezse yeni isimden EXACT-match (`resolveRecipientGeo`; fuzzy YOK), eşleşmezse bayat kod NULL'lanır
  (0/negatif ASLA persist); (5) geçerli kod eşleşince `lastBarcodeErrorCode` temizlenir; (6) `ShipmentEvent`
  DESTINATION_REPAIRED yeniden kullanılır (yeni enum YOK). Sağlayıcı onarımı: DHL + güvenli + geçerli kodlu ise
  `createRecipient` yeniden iletilir (TODO-124 guard deseni); başarısız/desteklenmezse yerel snapshot KORUNUR,
  `providerResent:false`/`providerRepairSupported:false` döner (sahte başarı YOK). Duplicate shipment guard'a
  DOKUNULMAZ (yeni gönderi OLUŞTURULMAZ); MÜŞTERİ adres defteri (CustomerAddress) global mutasyona UĞRAMAZ —
  yalnız BU sipariş. UI: order detay kargo kartına (`order-shipment-summary` → yeni `edit-shipping-address`)
  "Teslimat Adresini Düzenle" + CBS il/ilçe dropdown'ları + kapsam uyarısı + kilit kopyası + `providerResent:false`
  sınırlama kopyası; kayıt sonrası `router.refresh()` + kart yeniden yükleme. Migration: HAYIR. Testler:
  api-gateway `shipping-address-update` (9: no-shipment→yalnız OrderAddress, ORDER_CREATED/LABEL_PENDING→her iki
  snapshot + DESTINATION_REPAIRED event, IN_TRANSIT/DELIVERED/LABEL_CREATED→locked, ownership 404, non-admin 401,
  duplicate guard/customer-address dokunulmaz), CBS kod doğrulama guarantee'leri `shipping-cbs-mapping` (validateCodes
  CBS_CODE_INVALID + isValidGeoCode(0)=false) ile korunur; store-admin `edit-shipping-address` (5: güvenli/kilit
  durum, CBS dropdown, kayıt→onSaved refresh, providerResent:false sınırlama kopyası). TODO-124/129/132/135/136
  testleri yeşil; TODO-123 sınırı DEĞİŞMEZ. NOT (TODO-123): retry job adres snapshot onarımından SONRA çalışmalı
  (düzeltilmiş kodlarla). KALAN: main'e merge sonrası docker api-gateway + store-admin-web REBUILD + runtime
  doğrulama (yanlış adresli/taşınmamış sipariş → geçerli Kadıköy adresi → snapshot+CBS+barkod retry; kilitli
  siparişte engel; müşteri adres defteri değişmez).
- TODO-140 — Kargo HAREKET metniyle Shipment.status ilerletme (DONE — 2026-07-04). İş problemi: TODO-130 ham
  webhook adapter'ından SONRA, gönderi timeline'ı "SMOKE AKTARMADA"/"SMOKE TRANSFER MERKEZİNDE" hareketleri
  gösterirken üst rozet "Kargo İçin Paketlendi" (PACKED) ve "Kargonun alımı bekleniyor." ipucunda TAKILI
  kalıyordu. Kök neden: `mapProviderStatusToShipmentStatus` YALNIZ `statusCode`+`isDelivered` bakıyordu;
  MNG/DHL sandbox hareket push'ları kod TAŞIMADAN yalnız `eventStatus` METNİ gönderdiğinden kod null →
  ilerleme yok. Müşteri/store-admin gösterimi zaten `Shipment.status`'tan doğru türetiyordu (IN_TRANSIT →
  "Yolda"); sorun kaynak-otorite durumun bayat kalmasıydı. Çözüm: `status-map.ts` içine paylaşılan saf
  `inferShipmentStatusFromTrackingText(text)` — Türkçe büyük/küçük + diakritik BAĞIMSIZ (NFD + noktalı/noktasız
  i sabitleme + ASCII fold) normalize eder; güçlü kanıt önceliğiyle TESLİM EDİLDİ→DELIVERED, DAĞITIMA
  ÇIKTI/DAĞITIMDA→OUT_FOR_DELIVERY, TRANSFER/AKTARMA/TAŞIMA/YOLDA/HUB/SORTING/DAĞITIM MERKEZ→IN_TRANSIT;
  zayıf metin (oluşturuldu/etiket/barkod/paketlendi/"teslim ALINDI") → null. `mapProviderStatusToShipmentStatus`
  artık kod + metin adaylarından EN İLERİ olanı (rank) seçer; terminal/regresyon koruması AYNEN korunur.
  KAPSAM: metin çıkarımı YALNIZ HAREKET (trackshipment / DHL_TRACKING) push'una uygulanır — DURUM push'u
  (getshipmentstatus / DHL_STATUS) ve PLATFORM sözleşmesi kod-güdümlü kalır (TODO-130'un "status-push metni
  tek başına kanıt değil" kuralı korunur). Webhook (`webhook-routes.ts`) ve zamanlanmış sync (`sync-service.ts`)
  AYNI yardımcıyı kullanır (drift yok); sync ayrıca `trackShipment` hareketlerini katarak ilerletir (önceden
  yalnız getShipmentStatus snapshot'ı ilerletiyordu). Idempotency/dedupe DEĞİŞMEDİ (event fingerprint durum
  metnini zaten taşıyordu; türetilen durum değil). Migration: HAYIR. Kontrat/DTO değişikliği: HAYIR (müşteri
  DTO allowlist'i olduğu gibi — ham payload dışarı sızmaz, statusText timeline-güvenli alan). Testler:
  `shipping-mappers.test.ts` (+6: metin→durum + kod-yok/terminal-koruma), `shipping-webhook.test.ts` (+4:
  DHL_TRACKING transfer→IN_TRANSIT, duplicate spam yok, zayıf metin durumu değiştirmez, TESLİM→DELIVERED),
  `shipping-sync-service.test.ts` (+2: hareket metniyle IN_TRANSIT, ileri durum geri çekilmez),
  `storefront-web/shipment.test.ts` (+1: IN_TRANSIT→"Yolda" adımı + bekleme ipucu yok). TODO-130/129/123/135/136
  testleri yeşil (882/882). KALAN: main'e merge sonrası docker api-gateway REBUILD + runtime doğrulama (SMOKE
  AKTARMADA hareketli mevcut gönderi → DB Shipment.status=IN_TRANSIT + müşteri/order rozet "Yolda").
- TODO-141 — Kargo UI cilası: tarih biçimi + durum yardımcı kopyası (DONE — 2026-07-05). Sorun: müşteri
  vitrini kargo hareket tarihlerini locale'siz `toLocaleString()` ile US biçiminde gösteriyordu
  (`7/4/2026, 6:00 PM`); store-admin ise `toLocaleString(locale)` ile saniye taşıyordu. Çözüm: yeni
  paylaşılan `formatDateTime(value, locale)` (`@commerce-os/i18n`) — 24 saat, saniyesiz, geçersiz→"—";
  TR `04.07.2026 18:00`, EN `en-GB` (AM/PM yok). Timezone'a DOKUNULMADI (yalnız biçim). Müşteri kartı:
  timeline `formatDateTime`'a taşındı + `locale` prop; dağınık üç not (prepared/problem/cancelled) tek,
  duruma-göre tutarlı `statusHelp` satırıyla birleşti (PACKED/AWAITING_PICKUP semantiği korundu, ADR-045).
  Admin: `[id]` detay (lastSync/event/retry×2), gönderi listesi (lastSync), order özet kartı (lastUpdate)
  → `formatDateTime`. Backend/domain/status-map/webhook/sync/retry DEĞİŞMEDİ; ham payload sızmaz. Testler:
  `storefront-web/shipment-tracking.test.tsx` (+7 render), `shipment.test.ts` (statusHelp), `i18n.test.ts`
  (+6 formatDateTime), `store-admin-web/shipment-screens.test.tsx` (+1 admin tarih). Gate'ler yeşil
  (db:generate, pnpm -r build, typecheck, lint, test 34/34, git diff --check temiz). ADR YOK (mimari karar
  yok). KALAN: merge sonrası storefront-web (+ değiştiyse store-admin-web) REBUILD + runtime doğrulama.
- TODO-141b — Müşteri sipariş SALT-tarih alanları US MM/DD/YYYY düzeltmesi (DONE — 2026-07-05). TODO-141
  timeline'ı düzeltti ama sipariş başlığı/liste/ödeme tarihleri hâlâ locale'siz `toLocaleDateString()` ile
  US `7/4/2026` gösteriyordu (kullanıcı başlıkta fark etti). Çözüm: `formatDateTime` ile aynı kaynağa salt-tarih
  kardeşi `formatDate(value, locale)` (`@commerce-os/i18n`) — TR `04.07.2026`, EN `04/07/2026` (US değil),
  geçersiz→"—". Nerede: `[orderNumber]/page.tsx` (başlık createdAt + PaymentBlock paidAt), `account/page.tsx`
  (locale threading → OrdersSection), `orders-section.tsx` OrderCard (createdAt). `payment-tester.tsx` zaten
  tr-TR (dev aracı, kapsam dışı). Backend/DTO değişmedi. Testler: `i18n.test.ts` (+5 formatDate). Gate'ler
  yeşil (34/34). ADR YOK. KALAN: merge sonrası storefront-web REBUILD + runtime doğrulama.
- TD-036 — Config empty-string normalizasyon temizliği (DONE — 2026-07-05, ADR-057). Sorun: `env_file`'da
  `KEY=` bırakılan OPSİYONEL değerler Zod `url()`/`regex()`/enum/`coerce.number()` doğrulamasına takılıp
  api-gateway boot'unu çökertme sınıfıydı (PR #10/#15 nokta-atışı düzeltmişti; desen inline tekrar ediyordu).
  Çözüm: paylaşılan helper `packages/config/src/env.ts` (`emptyToUndefined`, `optionalEnv`, `optionalUrlEnv`,
  `optionalBooleanEnv`, `optionalNumberEnv`) — opsiyonel boş/whitespace → varsayılan/undefined; şema
  (`index.ts`) yeniden yazıldı, inline `z.preprocess` tekrarı kaldırıldı; `loadConfig` `safeParse` +
  `ConfigValidationError` (yalnız anahtar+mesaj, env değeri basılmaz → secret sızmaz). Strict kalanlar:
  `DATABASE_URL`/`REDIS_URL`/`INTERNAL_API_TOKEN`/`SESSION_SECRET`. Secret'lar dokunulmadı. İş mantığı/
  shipment/webhook/sync davranışı DEĞİŞMEDİ. Testler: `config.test.ts` (24, +20). Gate'ler yeşil
  (db:generate, build, typecheck, lint, config 24/24 + api-gateway 494/494, git diff --check). KALAN:
  merge sonrası docker api-gateway rebuild + boş opsiyonel env'lerle boot doğrulama.
- TODO-142 — Kargo sandbox uçtan uca smoke runbook + kontrol listesi (DONE — 2026-07-05). İş: kargo temeli
  (gönderi/DHL-MNG sandbox/CBS/adres/barkod/retry/sync/webhook/UI) büyük ölçüde tamam; kampanya MVP'sinden
  önce operatörün tekrarlanabilir bir smoke akışına ihtiyacı vardı. Çözüm: yeni `docs/runbooks/
  shipping-sandbox-smoke.md` — 11 bölüm (ön koşullar, ödeme uygunluğu `ORDER_PAYMENT_REQUIRED`, CBS/varış
  onarımı + 20001, prepare/duplicate, barkod 3 sınıf RETRYABLE/DATA_FIX/TERMINAL + manuel retry, sync
  worker + manuel sync-all + terminal hariç, webhook rotate/imza/duplicate/ham-payload sızmaz, müşteri UI
  TR-tarih/"Yolda"/"Kargonuz taşıma sürecinde.", admin UI, güvenlik kuralları, kopyala-yapıştır final rapor
  şablonu). OPERATIONS.md'ye kısa link/bölüm + web request-time env kuralı eklendi. Kod/domain DEĞİŞMEDİ
  (yalnız doküman). KALAN: yok (runbook operasyoneldir; ilk gerçek sandbox koşusunda TD-035 varış şubesi
  boşluğu 20001 olarak beklenir).
- TD-038 — Web app request-time env boş-string normalizasyonu (DONE — 2026-07-05). Sorun: TD-036 boot-time
  config'i normalize etti ama web app'lerin Next.js server bağlamında `process.env.X ?? default` ile
  okuduğu OPSİYONEL env'ler kapsam dışıydı; `API_GATEWAY_URL=` boş string `??` fallback'ini bypass edip
  boş/bozuk gateway URL'e (bozuk göreli fetch) düşebiliyordu. Çözüm: duz-string helper `optionalEnvString`
  (`packages/utils`) — `undefined|null|""|whitespace` → undefined (config'in zod `optionalEnv`'inin
  karşılığı; web bundle'a zod/`loadConfig` taşımaz). Gateway URL tek noktada düzeltildi:
  `resolveApiGatewayUrl` (`packages/api-client`) boş/whitespace `API_GATEWAY_URL`'yi "yok" sayar;
  storefront `gatewayBaseUrl()` buraya delege edildi (store-admin/admin zaten `createApiClient` üzerinden
  kullanıyor). Helper ile sarılanlar: cookie/CSRF adları (store-admin+admin session/csrf), demo mağaza
  slug'ları (storefront `env.ts`, store-admin `store-context.ts`), `STOREFRONT_BASE_URL` (aktivasyon
  linki — whitespace artık bozuk mutlak URL üretmez), `STOREFRONT_CART_SECRET`. Strict kalan:
  `INTERNAL_API_TOKEN`. Karşılaştırmalı okumalar (`NODE_ENV`/`ADMIN_COOKIE_SECURE`/`ADMIN_COOKIE_SAME_SITE`)
  zaten güvenli, dokunulmadı. `@commerce-os/utils` web app + api-client'a workspace dep olarak eklendi
  (zero-dep, bundle-safe; yeni ağır/zod bağımlılığı yok → ADR gerekmez). Testler: `utils/env.test.ts` (+6),
  `api-client` gateway URL (+6: undefined/""/whitespace/valid/explicit), `store-admin-web/activation-link.test.ts`
  (+4). Gate'ler yeşil (db:generate, pnpm -r build, typecheck, lint, test — utils 6/6, api-client 19/19,
  store-admin 161/161, storefront 101/101, admin 24/24, api-gateway 494/494; git diff --check temiz).
  KALAN: merge sonrası storefront/store-admin/admin-web rebuild + `API_GATEWAY_URL=` boş env ile boot/login
  redirect doğrulama.
- F4A — Kampanyalar & Kuponlar MVP (DONE — 2026-07-05, ADR-058). İş: Amazon/Hepsiburada kalıplarından
  esinlenen, güvenli kapsamlı kampanya/kupon temeli. Veri modeli: `Campaign` (DRAFT/ACTIVE/PAUSED/ARCHIVED;
  COUPON_CODE/AUTOMATIC_CART/PRODUCT_DISCOUNT/CATEGORY_DISCOUNT + BUY_X_GET_Y/FREE_SHIPPING/MEMBERSHIP_ONLY
  yalnız enum rezervi; PERCENT/FIXED_AMOUNT, max/min tutar, pencere, toplam+müşteri-başı limit, stackable,
  priority, usageCount) + `Coupon` (normalizedCode `@@unique([storeId, normalizedCode])` — mağazalar arası
  aynı kod serbest) + `CampaignProduct`/`CampaignCategory` kapsamı + `CampaignRedemption`
  (`@@unique([campaignId, orderId])`) + `OrderDiscount` (immutable sipariş indirim SNAPSHOT satırı).
  Migration: `20260705120000_add_campaigns_coupons` (additive). Motor: `apps/api-gateway/src/campaigns/
  discount-engine.ts` — SAF/deterministik (Math.round yüzde, eligible+kalan-subtotal cap, kupon önce,
  stackable=false seçilince başka kampanya yok, stackable'lar birleşir); kupon normalizasyonu locale-BAĞIMSIZ
  uppercase (TR-I tuzağı yok) + `[A-Z0-9_-]` format. DEMO10 hardcoded kuponu KALDIRILDI; public cart/checkout
  gerçek motoru kullanır (`couponReason` + `discountLines` public özet alanları eklendi; kampanya iç
  metadata'sı sızmaz). Checkout: geçersiz kupon 409 `COUPON_INVALID` (sessiz sıfır-indirim yok); createOrder
  transaction'ında limitler ATOMIK yeniden doğrulanır (koşullu updateMany + redemption COUNT; ihlal → rollback,
  sipariş oluşmaz), OrderDiscount + CampaignRedemption aynı transaction'da yazılır. Admin: `/stores/:storeId/
  campaigns` CRUD + activate/pause/archive (platform-admin + store scope; ARCHIVED düzenlenemez/terminal;
  detayda maskeli e-posta ile son kullanımlar + istatistik). Store-admin UI: `/campaigns` (liste/form/detay,
  kapsam seçici, nav + TR/EN i18n). Storefront: mevcut kupon input/apply/remove korunmuş; neden-bazlı TR/EN
  hata kopyaları (NOT_FOUND/INACTIVE aynı genel kopya — varlık sızdırmaz) + çoklu indirim satırı gösterimi;
  checkout 409 kupon hatası ayrı banner. Testler: motor 19 birim + gateway F4A API 10 + storefront kupon UI 4
  + store-admin sayfa 3; regresyon: api-gateway 523/523, storefront 105/105, store-admin 164/164. Gate'ler
  yeşil (db:generate, pnpm -r build, typecheck, lint, test, git diff --check). KALAN: merge sonrası docker
  rebuild (api-gateway + storefront-web + store-admin-web) + migration deploy + runtime smoke (TEST250
  senaryosu); ürün kartı kampanya rozeti ("Sepette %20", "Kuponlu ürün") bilinçli follow-up (public listing
  sözleşmesine dokunulmadı); iptal/refund'ta redemption iadesi YOK (kompanzasyon deseni yokken tarihsel kalır
  — ADR-058'de dokümante).
- F4A.1 + F4A.2 — Kampanya görünürlüğü, otomatik kupon kodu, sipariş kampanya paneli, kampanya analitiği
  (DONE — 2026-07-05, ADR-059). F4A.1: public ürün liste/detay DTO'suna additive `campaign` rozet alanı
  (`publicCampaignBadgeSchema` allowlist: kind/discountType/discountValue/minOrderAmountMinor; yalnız
  ACTIVE + isPublic + pencere açık + limiti dolmamış kampanyalar; kapsam eşlemesi ürün/kategori; seçim
  deterministik priority→id; iç metadata/kapsam listesi sızmaz — isPublic=false özel kupon public'te
  GÖRÜNMEZ). Paylaşılan etiket helper'ları `@commerce-os/utils` `getCampaignPublicLabel`/
  `getCampaignBadgeText` ("Sepette %10 indirim", "₺250 kupon", "Kuponlu ürün"). Vitrin: ürün kartı rozeti
  (kampanya > compareAt önceliği), ürün detayda fiyat yanı kampanya kutusu ("Sepette uygulanır" /
  "Kupon kodu gerektirir" / "₺X üzeri geçerli"), sepet+checkout indirim satırları kampanya ADIYLA
  (geçersiz kuponda otomatik kampanya satırı görünür kalır). Store-admin kampanya formunda "Otomatik
  Oluştur" kupon kodu üretici (TR→ASCII önek + indirim ipucu + 4'lü rastgele sonek; alan düzenlenebilir;
  benzersizlik kaynağı backend DUPLICATE_COUPON_CODE). F4A.2: `orderSchema.discounts` additive
  OrderDiscount SNAPSHOT satırları (id/campaignId/code/label/discountType/discountValue/
  discountAmountMinor/createdAt; scopeSummary raw sızmaz) + store-admin sipariş detayında "Kampanya /
  Kupon Bilgisi" kartı (tip rozeti kupon/otomatik, kod, indirim tip/değer, uygulanan tutar, öncesi/
  sonrası ara toplam, kargo, genel toplam, kullanım tarihi, snapshot notu; indirimsizde nötr metin).
  Kampanya detayına snapshot-tabanlı analitik (`campaignAnalyticsSchema`: kullanım, tekil müşteri,
  toplam indirim, ciro öncesi/sonrası, ortalama indirim/sipariş, ortalama sipariş tutarı, son kullanım)
  + son kullanımlar sipariş detayına LİNKLİ (orderTotal + maskeli e-posta ile). Kaynak doğrusu:
  OrderDiscount + CampaignRedemption (ADR-059; iptal edilen siparişler tarihsel olarak dahil, UI notu
  var). Migration YOK (tümü additive DTO/UI). Testler: utils etiket 10, gateway public-badge 15 +
  entegrasyon 2, storefront kart/detay 6+3, store-admin üretici 11 + form UI 2 + sipariş paneli 4 +
  analitik 2. KALAN: merge sonrası docker rebuild (api-gateway + storefront-web + store-admin-web) +
  runtime smoke; kampanya LİSTE kolonlarına toplam indirim/ciro (groupBy) ve tarih-aralıklı rapor sayfası
  + CSV export follow-up; analitik bellekte toplanır — yüksek hacimde SQL aggregate follow-up.
- F4A.3 — Kupon vs sepet indirimi UX düzeltmesi + kalıcı müşteri kupon cüzdanı (DONE — 2026-07-05,
  ADR-060). Gösterim taksonomisi: public rozet DTO'suna additive `displayKind`
  (AUTOMATIC_CART_DISCOUNT | PUBLIC_COUPON), `requiresCouponCode`, `couponCode` (nullable, yalnız public+
  ACTIVE+pencere geçerli iken), `couponAction` (CLAIM/APPLY/COPY/MANUAL_ONLY), `endsAt`. Otomatik: kart
  "Sepette %10", detay "Kod gerekmez"; public kupon: kart "Kuponlu ürün", detay KUPON KARTI (kod + "Kuponu
  ekle"/"Kodu kopyala" + alt limit + son kullanma). Private (isPublic=false) kupon hiçbir public yüzeyde
  görünmez; iç metadata sızmaz. Kalıcı cüzdan: `CustomerCoupon` (additive migration; customerId/email,
  status AVAILABLE/APPLIED/USED/REVOKED, source ADMIN_ASSIGNED/PUBLIC_CLAIMED/CODE_CLAIMED). Sepet
  "Kuponlar" alanı: kullanılabilir kupon kartları (Kullan/Uygulandı/Alt limit eksik) + iki adımlı "Kupon
  Kodu Ekle" (claim → sonra Kullan). Gateway uçları: `POST .../cart/coupons/claim|apply|remove`; sepet
  quote'una `availableCoupons`; sipariş transaction'ında cüzdan USED işaretleme (rollback güvenli).
  Store-admin: kampanya detayı (email ile) + müşteri detayı (kupon seçerek) kupon atama — ortak backend
  (`assignCoupon`); cross-store engeli; maskeli e-posta. İndirim kaynak doğrusu değişmedi (couponCode +
  motor; ADR-058); checkout semantiği/limit transaction korundu. Testler: utils discountText 2, gateway
  public-badge taksonomi + private dışlama + wallet projeksiyon/claim eval (yeni campaigns-wallet suite) +
  health public coupon 1, storefront kart/detay/sepet Kuponlar 7. KALAN: merge sonrası docker rebuild
  (api-gateway + storefront-web + store-admin-web) + runtime smoke; "Tüm Kuponlar" listeleme sayfası
  follow-up (dead link eklenmedi); misafire ATANAN kupon checkout email'ine kadar görünmez (kimlik boşluğu);
  store-admin atama UI'si için otomatik test follow-up (backend gateway testiyle kapsanıyor).

- F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi (DONE — 2026-07-05, ADR-060 devamı; yeni ADR
  yok). F4A.3'ten sonra eksik olan UX katmanı: müşteri kuponları keşfeder, görür, ekler ve kullanır.
  Rota: mevcut hesap konvansiyonu (`/account?section=coupons`) — sidebar/header menüsü + placeholder zaten
  bağlıydı; ayrı bir route açılmadı. Oturum zorunlu (misafir → mevcut `/auth/login` redirect'i). Yeni uç
  (müşteri-scoped + store-scoped): `GET /public/stores/:slug/customer/coupons` → allowlist'li kupon merkezi
  kartları: kullanılabilir (PUBLIC isPublic+ACTIVE + bu müşteri/email cüzdanı ASSIGNED/CLAIMED) + kullanıldı
  (kendi USED geçmişi; usedAt + kendi sipariş no). SEPET-BAĞIMSIZ: alt limit burada hesaplanmaz (kart
  AVAILABLE/EXPIRED); uygulama durumu (APPLIED) sepet couponCode cookie'sinden işaretlenir. Kullanılmış kod
  "Kullanılabilir"den düşürülür. Sayfa: başlık "Kuponlarım", sekmeler (Tüm Kuponlar / Kullanılabilir / Sana
  Özel / Kullanıldı + kupon varsa Süresi Doldu), arama ("Kupon ara" — kod/indirim metni), "Kupon Kodu Ekle"
  (mevcut claimCouponAction + router.refresh), kupon kartları (indirim/alt limit/geçerlilik/kaynak/durum/
  Kullan-Sepete Git-Kodu kopyala-Siparişi gör). "Kullan" → mevcut applyWalletCouponAction (indirim istemcide
  hesaplanmaz). Sepet "Kuponlar" alanına "Tüm Kuponlar" bağlantısı eklendi (dead link giderildi). Güvenlik:
  iç id/limit/istatistik/priority/stackable/redemption sızmaz; private kupon yalnız atanmış/claim edilmişse
  görünür; cross-store yok; USED yalnız kendi müşteri/email. Küçük güvenli additive: `listUsedWalletEntries
  ForIdentity` (yalnız okuma; migration YOK). Testler: gateway `projectCouponCenter` 6 (allowlist + USED
  dışlama + sepet-bağımsız alt limit), storefront kupon merkezi UI 8 + cart "Tüm Kuponlar" link 1. Gate:
  db:generate + `pnpm -r build` + typecheck + lint + test (35 task) + `git diff --check` yeşil. KALAN: merge
  sonrası docker rebuild (api-gateway + storefront-web) + runtime smoke; kategori çip filtresi bilinçli
  follow-up (kampanya categoryIds var ama kategori-ad çözümlemesi + kod tarafında kapsam eşleşmesi ayrı iş);
  çok-kullanımlı public kupon bir kez kullanıldığında "Kullanılabilir"den düşer (MVP kabulü).
- F4A.4 — Kampanya/kupon oluşturma seçenekleri + kriter genişletme (DONE — 2026-07-05, ADR-061). Amaç:
  store-admin'in production-grade kupon kartları/kampanyalar tanımlayabilmesi. TEMEL KURAL: sunum alanları
  indirim hesabından AYRI (motor DEĞİŞMEDİ). Additive migration `20260705140000_add_campaign_presentation_
  fields` (nullable/varsayılan; backfill YOK; mevcut kampanyalar null ile çalışır). Yeni Campaign SUNUM
  alanları: displayTitle/shortDescription/terms/badgeLabel/badgeVariant/cardStyle/displayPriority. Yeni
  enumlar: CampaignBadgeVariant (DEFAULT/SUPER/LIMITED_TIME/PERSONAL/WEEKEND/NEW_CUSTOMER), CampaignCardStyle
  (STANDARD/FEATURED/PERSONAL), CampaignAccessModel (AUTO_VISIBLE/PUBLIC_CLAIMABLE/CODE_CLAIMED/ADMIN_
  ASSIGNED). `isPublic` accessModel'den TÜRETİLİR (authoritative gate; `deriveIsPublicFromAccessModel`);
  admin isPublic'i ayrı input olarak görmez. Public projeksiyon allowlist'i genişletildi (badge + wallet +
  coupon-center'a sunum alan paketi); private veri güvenliği korundu (yoksa UI fallback). Store-admin formu
  6 bölüm (Görünüm/İndirim/Geçerlilik/Erişim/Kapsam/Önizleme) + kupon kartı önizlemesi (gerçek hesap YOK).
  Vitrin: ürün rozeti + kupon merkezi kartı displayTitle/badgeLabel/terms tüketir (fallback'li). HARİÇ:
  "Takip et kazan"/store-follow/seller-follow hiçbir yerde yok; reserved segmentler (ilk sipariş/geri dönen/
  e-posta) enforce edilemediği için enum/forma eklenmedi; marka/vendor scope yok (Product.brand/vendor
  serbest metin, first-class değil — follow-up); coupon-seviyesi sunum alanı yok. Testler: contracts
  doğrulama 10 (uzunluk/enum/follow reddi/türetim/partial), gateway rozet+merkez sunum taşıma/allowlist,
  store-admin 5 (6 bölüm+preview / follow yok / erişim seçenekleri / alan kaydı / null edit), storefront
  kupon merkezi 3 (display kullanımı/fallback/follow yok). Gate: db:generate + `pnpm -r build` + typecheck +
  lint + turbo test (35 task; api-gateway 575, storefront 129, store-admin 12) + `git diff --check` yeşil.
  KALAN: merge sonrası migrate deploy + docker rebuild (api-gateway + store-admin-web + storefront-web) +
  runtime smoke (OPERATIONS F4A.4). Follow-up: marka/vendor scope, reserved segment enforcement.
- F4A.6 — Vitrin ürün kartı "Sepette" fiyat gösterimi + smoke/stale kampanya denetimi (DONE — 2026-07-05,
  ADR-062; migration YOK). Amaç: otomatik sepet indirimi uygulanan ürün kartlarında referans e-ticaret gibi
  "üstü çizili normal fiyat + Sepette + %badge + güvenli nihai fiyat" bloğu; kupon kampanyaları "Kuponlu ürün"
  kartı olarak AYRI kalır (kod gerekir izlenimi verilmez). Public rozete additive `estimatedDiscountMinor` /
  `estimatedFinalUnitPriceMinor` (yalnız otomatik + PERCENT + tek-fiyatlı ürün + min-order eşiği karşılanınca;
  formül motorla aynı: round(unit*yüzde), maxDiscount cap). FIXED_AMOUNT/aralık/min-order belirsizinde SAHTE
  fiyat YOK → yalnız "Sepette %X" + "₺X üzeri" notu. `publicProductSchema.secondaryCoupon` additive:
  stackable-duyarlı gösterim — tüm uygun kampanyalar stackable ise otomatik birincil + kupon ikincil ÇİP
  birlikte; biri non-stackable ise yalnız öncelik kazananı. `displayKind` yine type'tan türetilir (accessModel
  AUTO_VISIBLE default'u kuponu otomatiğe ÇEVİRMEZ). RUNTIME DENETİM: demo-store'da aktif TEST250 (public kupon,
  bilinçli) + Sepette %10 (otomatik, 2 ürün kapsamı) — ikisi de non-stackable, bu yüzden kartta TEST250 kazanır
  (kural gereği doğru). "Eski smoke indirim" aslında demo-hoodie varyantındaki compareAt (₺1.299/₺1.499)
  mock artığı; kampanya DEĞİL → maliyet/marj + liste fiyatı ayrımı + fiyat audit'i F4B'ye taşındı (checkout
  semantiği korunsun diye). f4a-smoke-test-store'daki artık smoke kampanyalar KALDI (demo storefront'u
  etkilemiyor). HARİÇ: motor/checkout/OrderDiscount/cüzdan/analitik/kargo değişmedi; DB reset/seed/silme yok.
  Testler: gateway public-badge birim (tahmin safe/unsafe/FIXED/maxCap/kupon-null + stackable both/priority +
  accessModel-default kupon=PUBLIC_COUPON), gateway health entegrasyon (kart tahmin + no-leak), storefront
  product-card 5 (Sepette blok/final/min-order notu/ikincil çip/no-campaign) + detay 1 (belirgin Sepette blok).
  Gate: db:generate + `pnpm -r build` + typecheck + lint + turbo test (api-gateway 587, storefront 131,
  store-admin 188) + `git diff --check` yeşil. KALAN: merge sonrası docker rebuild (api-gateway + storefront-web)
  + runtime doğrulama. Follow-up: F4B — ürün maliyet/marj + liste fiyatı + fiyat değişikliği audit (son 30 gün
  en düşük fiyat); demo-store kampanyalarını stackable yapıp Sepette bloğunu canlı sergileme (veri kararı).
- F4B — Ürün maliyet/marj + liste fiyatı ayrımı + fiyat değişikliği audit'i (DONE — 2026-07-05, PR #32
  ad273ee; migration 20260705150000; docs kaydı F4C sırasında geri dolduruldu). `ProductVariant.costMinor`
  (satış priceMinor KALIR; cost yalnız iç marj/kâr için, public'e sızmaz; kural: cost ≤ compareAt ?? price) +
  append-only `ProductPriceChange` audit'i + EU Omnibus "son 30 günün en düşük fiyatı" public
  `lowestPriceMinor` + admin varyant formunda marj/markup göstergesi + fiyat geçmişi.
- F4C — Varyant kart fiyatı + Kaydet CTA bugfix + KDV temeli + sipariş satış özeti (DONE — 2026-07-06,
  ADR-063/ADR-064; migration 20260706120000_add_variant_vat_and_order_snapshots). (1) BUGFIX kart fiyatı:
  vitrin kartı artık fiyat ARALIĞI ("min – max") göstermez; en ucuz aktif varyantın KDV dahil fiyatı tek
  başına gösterilir; gateway kampanya "Sepette" tahmini de aynı en-ucuz tabandan hesaplanır (F4A.6'daki
  "yalnız tek-fiyatlı ürün" kuralı bilinçli genişletildi — kart tek fiyat gösterdiği için tahmin artık
  yanıltıcı değil). (2) BUGFIX Kaydet CTA: ürün/varyant formlarında setSaving(false) yalnız catch'teydi;
  finally'e alındı — başarıda buton "Kaydediliyor…"da takılı kalmıyor, double-submit disabled korunuyor.
  (3) KDV temeli (ADR-063): admin varyantta KDV HARİÇ net fiyat + oran (%0/%1/%10/%20; bps) girer; KDV
  tutarı + KDV dahil brüt SUNUCUDA hesaplanır (vat=round(net·bps/10000)); `priceMinor` KDV DAHİL brüt satış
  fiyatı olarak KALIR (vitrin/sepet/checkout sıfır regresyon). Backfill: net=round(brüt·10000/12000) — mevcut
  görünen fiyatlar birebir korundu, sürpriz fiyat değişikliği YOK. (4) Sipariş snapshot + satış özeti
  (ADR-064): OrderLine'a additive net/oran/KDV/brüt/liste/maliyet birim+satır snapshot kolonları; admin
  sipariş detayında Bölüm A (Ara toplam/İndirim+etiket/Kargo/Ödenmesi gereken/Net ödenen/Kalan bakiye) +
  Bölüm B (Liste fiyatı/KDV %X ve karma oran dağılımı/Vergisiz net/Maliyet/Brüt kâr/Kampanya indirimi/
  vurgulu Net kâr) YALNIZ snapshot'lardan türetilir; eski siparişler "eski format" bilgisiyle güvenli kısmi
  durumda, yanıltıcı sıfır yok; maliyet snapshot'sız satır varsa kâr "—". HARİÇ: sepet/checkout toplamları,
  kampanya semantiği, kargo, `taxIncludedMinor` bilgi satırı (hâlâ %20 legacy çıkarım — follow-up)
  DEĞİŞMEDİ; public DTO'ya net/KDV/maliyet SIZMAZ. Testler: utils vat 28, gateway health F4C 4 entegrasyon +
  orders-sales-summary 13 birim + kart-en-ucuz/no-leak, storefront kart en-ucuz 2, store-admin CTA 2 +
  KDV UI 1 + satış özeti 4. Gate: db:generate + pnpm -r build + typecheck + lint + test + git diff --check.
  KALAN: merge sonrası migrate deploy + docker rebuild (api-gateway + storefront-web + store-admin-web) +
  runtime doğrulama (OPERATIONS F4C). Follow-up: sepet/checkout "KDV (dahil)" bilgi satırını satır
  oranlarından türetme; fatura üretimi (alanlar hazır).
- TODO-143 — Faz 1A: Ürün ana kategorisi (`primaryCategoryId`) temeli (DONE — 2026-07-13, ADR-067). İş:
  kategoriye-bağlı dinamik attribute altyapısının ilk adımı; M:N `ProductCategoryAssignment` belirsizliğini
  gidermek için her ürüne tek ana kategori. Çözüm: (1) additive nullable `Product.primaryCategoryId` FK
  `onDelete: Restrict` + `@@index([storeId, primaryCategoryId])` + tarihli migration
  `20260713120000_add_product_primary_category` (deterministik backfill: en eski assignment `createdAt ASC`,
  eşitlikte `categoryId ASC` — `ProductCategoryAssignment` surrogate id taşımadığı için `assignment.id ASC`
  yerine categoryId, ürün içinde unique olduğundan deterministik; tek→o kategori; kategorisiz→null; NOT NULL
  YOK). Migration history nedeniyle BİR KEZ uygulanır; backfill `WHERE ... IS NULL` ile RE-RUN güvenlidir. (2) contracts: `primaryCategoryId` (response nullable; create/update opsiyonel) + saf
  `resolvePrimaryCategorySelection` kural fonksiyonu. (3) gateway service guard: `resolvePrimaryCategory`
  route helper — assignment+primary tek `$transaction`; stabil kodlar `PRIMARY_CATEGORY_REQUIRED/NOT_ASSIGNED/
  STORE_MISMATCH/ARCHIVED/ASSIGNMENT_CONFLICT`; ana kategori sessizce kaldırılamaz. (4) `publicCategoryLabel`
  önce primary, yoksa "ilk assignment" fallback (storefront geriye uyumlu). (5) store-admin form: "Ana
  kategori" işaretleyici (tek kategori otomatik ana; ana kaldırılınca yeni ana zorunlu; edit hydration;
  server hata bağlama) + i18n TR/EN. (6) seed hoodie/tote primary; `db:audit-primary-category` review
  script'i (dry-run default, `--apply` idempotent). Runtime kategori mirası UYGULANMADI (MVP; `overrideMode`
  yok). Testler: contracts 73 (resolve* + şema), gateway health 132 (4 yeni), store-admin 232 (4 yeni ana
  kategori component). Merge-öncesi DOĞRULAMA (2026-07-13): (a) izole PostgreSQL (ayrı container :5433, proje
  volume'una dokunulmadan) — pre-Faz1A zinciri + fixture + `prisma migrate deploy` + backfill; senaryolar
  A(tek→cat) B(çok/en-eski createdAt) C(eşit createdAt→categoryId ASC) D(kategorisiz→null) E(önceden-primary
  ezilmez) F(cross-store yok) G(FK RESTRICT) HEPSİ doğru; backfill re-run=UPDATE 0; audit dry-run↔DB uyumu;
  `--apply` migration ile birebir aynı; 2. `--apply`=applied 0. (b) runtime smoke (gerçek Fastify+Prisma+izole
  PG): API create/update kuralları + regresyon 15/15; public label primary-önceliği/flip/no-leak 4/4. (c)
  typecheck main(c2067b3) vs branch: her ikisinde AYNI tek hata (`checkout-form-render.test.tsx` CartLineView,
  ÖNCEDEN mevcut) → branch 0 YENİ hata. Gate: db:generate + build + typecheck + lint + prisma validate +
  `git diff --check` temiz. KALAN: merge sonrası HEDEF DB'de `prisma migrate deploy` + docker rebuild
  (api-gateway + store-admin-web + storefront-web) + prod-benzeri runtime smoke; Faz 1B (attribute tabloları)
  ayrı iş.
- TODO-144 — Faz 1B: Attribute katalog çekirdeği (DONE — 2026-07-14, ADR-067 genişletildi). İş: kategoriye-bağlı
  dinamik ürün özelliklerinin KATALOG temeli. Yalnız tanım katmanı; ürün/varyant DEĞER tabloları, dinamik form,
  varyant kombinasyon motoru, storefront, checkout, order, search ve marketplace KAPSAM DIŞI. Çözüm:
  (1) Prisma: 3 enum (`AttributeScope` PLATFORM/STORE, `AttributeDataType` 13 tip, `AttributeStatus`) + 4 model
  `AttributeDefinition` (scope tek tablo; storeId nullable; code + dataType service-immutable; davranış TAŞIMAZ),
  `AttributeGroup` (store-scoped sunum kabı), `AttributeOption` (SELECT/MULTI_SELECT/COLOR; `@@unique([attributeDefinitionId, value])`),
  `CategoryAttribute` (davranışın TEK SAHİBİ: required/filterable/searchable/comparable/variantDefining/
  visibleOnProductPage/visibleOnListing + displayOrder + validationRules Json; `@@unique([categoryId, attributeDefinitionId])`).
  Kategori mirası ve overrideMode YOK (YAGNI). (2) Migration `20260714120000_add_attribute_catalog` TAMAMEN ADDITIVE
  (yeni enum + tablo; mevcut şemaya dokunulmaz); izole shadow-DB `migrate diff` = "empty" (şemayla birebir; drift yok).
  (3) contracts: definition/group/option/categoryAttribute + create/update/list şemaları; scope+storeId GÖVDEDE YOK
  (route türer → spoof engellenir); code her zaman immutable, dataType kullanımda immutable (route stabil kodlar).
  (4) gateway `src/attributes/` ayrı data-access + route modülü (hero/kampanya deseni; DI ile dev MemoryDataAccess'e
  dokunulmadan test): STORE uçları `requireStorePlatformAdmin` (kendi STORE + PLATFORM okuma), PLATFORM uçları YENİ
  `requireSuperAdmin` (yalnız SUPER_ADMIN; mevcut yetkiler bozulmadı). Stabil kodlar: `ATTRIBUTE_CODE_EXISTS/
  CODE_IMMUTABLE/DATATYPE_IMMUTABLE/OPTIONS_NOT_SUPPORTED/ARCHIVED`, `ATTRIBUTE_OPTION_VALUE_EXISTS`,
  `CATEGORY_ARCHIVED`, `CATEGORY_ATTRIBUTE_EXISTS`, `*_NOT_FOUND`. (5) api-client + Next BFF proxy (8 route) +
  storeApi client. (6) store-admin: yeni **Katalog → Özellikler** ekranı (tanım + grup + seçenek CRUD; PLATFORM
  salt-okunur) + kategori ekranından CategoryAttribute bağlama modalı (davranış bayrakları) + i18n TR kaynak + EN.
  Ürün formu/storefront/checkout/order/inventory/search/marketplace DEĞİŞMEDİ. Testler: gateway `attributes.test.ts`
  21 (scope/immutable/duplicate/tenant/option/group/categoryAttribute/platform 403), contracts `attribute-contracts.test.ts`
  8, store-admin `attributes-page.test.tsx` 3 → 32 yeni; api-gateway 716/716, contracts 81/81, store-admin 235/235.
  Gate: db:generate + prisma format/validate + contracts/api-client/i18n build + api-gateway build + store-admin
  tsc/eslint temiz. KALAN: merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri
  runtime smoke. Faz 2 (ProductAttributeValue / dinamik form / varyant motoru / PDP tablo / faceted search) ayrı iş.
- TODO-145 — Faz 2A: Ürün/varyant attribute DEĞER temeli (DONE — 2026-07-14, ADR-068). İş: Faz 1B katalog TANIMINI
  tüketip ürün/varyantların gerçek attribute DEĞERLERİNİ saklayan çekirdek veri katmanı. Dinamik ürün formu, varyant
  kombinasyon motoru/`combinationKey`, otomatik varyant, PDP attribute tablosu, faceted search, marketplace mapping,
  order snapshot KAPSAM DIŞI. Storefront/checkout/order/inventory/search/marketplace ve ürün formu DEĞİŞMEDİ. Çözüm:
  (1) Prisma: 3 model `ProductAttributeValue` (tip başına ayrı kolon: valueText/Integer/Decimal/Boolean/Date +
  optionId + mediaId; `@@unique([productId, attributeDefinitionId])`), `VariantAttributeValue` (yalnız valueText +
  optionId; variantDefining), `ProductAttributeValueOption` (MULTI_SELECT junction — JSON YOK). definition/option/media
  FK `onDelete: Restrict` (kullanımda olan tanım/seçenek/görsel silinemez), product/variant/store `Cascade`. (2) Migration
  `20260714130000_add_product_attribute_values` TAMAMEN ADDITIVE; iki **CHECK constraint** ("bir satırda en fazla bir
  değer kolonu dolu"; MULTI_SELECT satırı 0 dolu → `<= 1` kapsar; cross-table datatype kontrolü DB'ye TAŞINMAZ, serviste).
  İzole shadow-DB `migrate diff` = "No difference" (şemayla birebir; drift yok; index adı 63-char kırpma dahil). (3)
  **attributeValueService** — ProductAttributeValue/VariantAttributeValue yazan TEK nokta (route Prisma'ya yazmaz).
  Dogrulama STABIL kodlarla (zod refine değil): tenant izolasyonu, attribute mevcut/archived, primaryCategoryId +
  CategoryAttribute bağı, required (yalnız değer sağlanınca), dataType↔alan eşlemesi + "en fazla bir alan", option
  attribute/tenant/archived, media tenant, variantDefining tablo yönlendirme (product-level→variant tablosuna, variant→product
  tablosuna YAZILAMAZ). Kodlar: `ATTRIBUTE_NOT_FOUND/ARCHIVED/TENANT_MISMATCH/NOT_IN_CATEGORY/DUPLICATE/VALUE_MISSING/
  MULTIPLE_VALUES/VALUE_TYPE_MISMATCH/OPTION_INVALID/OPTION_ARCHIVED/OPTION_TENANT_MISMATCH/MEDIA_NOT_FOUND/
  REQUIRED_MISSING/IS_VARIANT_DEFINING/NOT_VARIANT_DEFINING`, `PRODUCT_CATEGORY_REQUIRED`, `PRODUCT/VARIANT_NOT_FOUND`.
  read-only `prepare*` (create'ten ÖNCE doğrula) + `persist*` (sonra yaz, replace-set: [] tümünü temizler). (4) gateway
  `src/attribute-values/` ayrı data-access + service + route modülü (attributes/ deseni; DI). Product/Variant create-update
  GÖMÜLÜ `attributeValues` alanı (opsiyonel; undefined=eski davranış → geriye dönük uyumlu; create'te ürün oluşmadan önce
  doğrulanır) + dedike internal replace uçları (`GET/PUT .../products/:id/attribute-values` ve `.../variants/:id/attribute-values`).
  Media silme in-use guard'ına `ProductAttributeValue.mediaId` eklendi (Restrict FK → aksi halde P2003/500). (5) contracts:
  `productAttributeValueInputSchema` (MULTI_SELECT için optionIds), `variantAttributeValueInputSchema`, read + replace-request
  şemaları; product/variant create/update'e opsiyonel `attributeValues`. (6) api-client: `admin.products.attributeValues.{get,replace}`
  + `admin.products.variants.attributeValues.{get,replace}`. Store admin ürün formu DEĞİŞMEDİ (API hazır; UI Faz 2B). Testler:
  gateway `attribute-values.test.ts` 30 (typed/tenant/option/required/archived/variantDefining/MULTI_SELECT/replace-set +
  dedike route round-trip/403/404) + media-delete 1 yeni, contracts `attribute-value-contracts.test.ts` 12 (şema + geriye
  uyum), db `attribute-value-migration.test.ts` 8 (CHECK/junction/FK DDL). api-gateway 747/747, contracts 93/93, api-client
  23/23, db 8/8. Canlı DB smoke (izole): `migrate deploy` OK; CHECK iki-değer REDDETTİ, sıfır-değer (MULTI_SELECT) FK'ye
  düştü (CHECK geçti), variant CHECK ikili değeri reddetti. Gate: db:generate + build (contracts/db/api-client/api-gateway) +
  typecheck (değişen paketler temiz; storefront `checkout-form-render` hatası ÖNCEDEN mevcut) + lint + migrate diff drift-yok.
  KALAN: merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri runtime smoke. Faz 2B
  (dinamik ürün formu / attribute renderer / kategori-değişince-form / varyant kombinasyon motoru) ayrı iş.
- TODO-146 — Faz 2B: Dinamik ürün formu temeli (DONE — 2026-07-17, ADR-069). İş: store-admin ürün oluştur/düzenle
  ekranını Faz 2A backend'iyle çalışır dinamik forma çevirmek. Varyant motoru/PDP/storefront/search KAPSAM DIŞI.
  (1) **RHF + Zod göçü.** `product-form.tsx` ~25 dağınık useState → tek `useForm<ProductFormValues>`; çekirdek
  doğrulama Zod `superRefine` ile (mevcut elle onSubmit ile BİREBİR: title/slug/min-max qty/CTA-şablon uzunlukları/
  kargo>0/çok-kategoride-primary-zorunlu). Dinamik attribute alanları backend-şekilli kurallarla ayrı doğrulanıp
  birleşik resolver'da (`createProductFormResolver`) birleştirilir. Çekirdek alan davranışı KORUNDU (mevcut 235 test
  yeşil). UI kit `Input/Select/Textarea` `forwardRef`'e çevrildi (RHF `register` ref bağlar; additive). (2) **Kategori-
  güdümlü attribute.** Ana kategori (primaryCategoryId) attribute ŞEMASINI sürer (backend değer doğrulaması da
  primaryCategoryId+CategoryAttribute bağına göre). `useCategoryAttributes` hook'u CategoryAttribute (self-describing
  DEĞİL) + tanım + seçenek + grup uçlarını çekip client-side join eder; sıralama displayOrder ASC → name ASC; gruplar
  AttributeGroup.sortOrder (grupsuz "General attributes" önce). Memoization: kategori-bağımsız veriler tek sefer,
  kategori-attribute join'i kategori başına cache (kategori değişmezse yeniden fetch YOK). (3) **Dinamik renderer.**
  `AttributeSection`/`AttributeField` + dataType→widget registry (switch-case cehennemi YOK); 13 tip: TEXT/TEXTAREA/
  RICH_TEXT(düz textarea, TD)/INTEGER/DECIMAL/BOOLEAN/DATE/URL/SELECT/MULTI_SELECT/COLOR(swatch)/IMAGE/FILE(MediaUpload
  single). Grup başlıkları + required işareti + validationRules (min/max/minLength/maxLength/pattern/step/placeholder/
  helperText; desteklenmeyen sessizce yok sayılır). (4) **Round-trip.** Düzenlemede yeni BFF GET `.../products/:id/
  attribute-values` (+ `storeApi.getProductAttributeValues`) mevcut değerleri form haritasına doldurur (kayıpsız).
  (5) **Save.** Gömülü `attributeValues` (product create/update; attributeValueService'ten geçer) Faz 2A replace-set
  formatında; YALNIZ kategori attribute tanımlıysa gönderilir (aksi halde undefined → legacy ürünler bozulmaz). BOOLEAN
  her zaman gönderilir (false anlamlı), diğerleri boşsa atlanır. (6) **Sunucu hata → alan.** Gömülü akış artık
  `error.details.attributeDefinitionId` taşır (server.ts create+update; dedike PUT ile tutarlı bilgi); `UiError` +
  `call()` bunu okur; form catch'i attribute kodunu (ATTRIBUTE_OPTION_INVALID/REQUIRED_MISSING/...) ilgili alana bağlar,
  aksi halde genel Alert. (7) **api-client.** `AttributeDataType`/`ProductAttributeValueInput`/`ProductAttributeValueResponse`
  type re-export (apps yalnız api-client kanalı). Testler: store-admin `products-form-attributes.test.tsx` 8 (kategori-
  değişince fetch+gruplu/sıralı render / required / validationRules / save payload / edit round-trip / boş-legacy kategori /
  sunucu hata eşleme / memoization) + `attribute-value-mapping.test.ts` 12 (tip matrisi / round-trip / required+rules /
  parseValidationRules / server-error tanıma) + mevcut iki form testi (stub eklendi, davranış aynen yeşil). store-admin
  255/255, api-gateway 747/747, api-client 23/23, contracts 93/93. Gate: db:generate + build (contracts/utils/api-client) +
  typecheck (değişen paketler TEMİZ; storefront `checkout-form-render` hatası ÖNCEDEN mevcut — Faz 2A'da da not edildi,
  benim işimle alakasız) + lint + `next build` store-admin (/products, /products/[id] derlendi). KALAN: docker rebuild +
  prod-benzeri auth'lu runtime smoke (canlı attribute'lu ürün oluştur/düzenle). Faz 2C (varyant kombinasyon motoru /
  combinationKey / SKU matris) ayrı iş.

- TODO-147 — Faz 2C-1: Varyant motoru TEMELI + varyant attribute seçimi (DONE — 2026-07-17, ADR-070). İş: Variant Engine'in
  YALNIZ veri modelini + admin seçim ekranını kurmak. **KESİNLİKLE varyant/kombinasyon üretilmez**: ProductVariant, Cartesian,
  combinationKey, SKU matris, bulk edit, varyant görselleri, storefront/search/inventory/order snapshot KAPSAM DIŞI.
  (1) **Veri modeli (JSON YOK, normalize).** İki additive tablo: `ProductVariantAttribute` (üründe EKSEN olarak seçilen
  variantDefining attribute; `@@unique([productId, attributeDefinitionId])`, `position`, storeId denormalize; `attributeDefinitionId
  → Restrict`, product/store → Cascade) + `ProductVariantOptionSelection` (eksen altında kapsanan AttributeOption; `@@unique(
  [productVariantAttributeId, optionId])`, `position`, `optionId → Restrict`, parent/store → Cascade). `ProductVariant.optionValues
  Json?` (legacy) DOKUNULMADI. Migration `20260717120000_add_product_variant_selection` TAMAMEN ADDITIVE. (2) **`variantSelectionService`
  (tek yazma otoritesi).** Faz 2A `attributeValueService` deseni: prepare(read-only, create'ten önce) + persist(replace-set,
  transactional); STABIL kodlarla doğrular (zod refine DEĞİL): tenant izolasyonu, attribute mevcut/archived, primaryCategory bağı,
  **variantDefining=true**, **option-tabanlı (SELECT/COLOR)** — varyant ekseni tek-seçimli, MULTI_SELECT/metin eksen OLAMAZ,
  duplicate, her eksende **≥1 option**, option attribute/tenant/archived. (3) **API.** Gömülü opsiyonel `variantSelections` (product
  create/update; undefined=legacy korunur, []=temizle) + dedike `GET/PUT /stores/:id/products/:id/variant-selections`. contracts +
  api-client (`admin.products.variantSelections.{get,replace}`) + tipler. Mevcut Product API/`optionValues` DEĞİŞMEDİ. (4) **UI.**
  store-admin ürün formuna **"Variant Attributes"** bölümü; `useVariantAttributes` (variantDefining=true + option-tabanlı; mevcut
  `useCategoryAttributes` bunları dışlar) + `VariantAttributeSection` (eksen checkbox → seçince option checkbox'ları: Siyah ✓ /
  Beyaz ✓ / Mavi ☐). Form state `variantSelections: Record<defId, {enabled, optionIds}>`; enabled-eksende ≥1 option client
  doğrulaması; server hata `error.details.attributeDefinitionId` ile eksene bağlanır (Faz 2B deseni). Dinamik form mimarisi bozulmadı.
  i18n tr+en. (5) **Testler.** api-gateway `variant-selections.test.ts` 24 (seçim/deterministiklik/idempotency/1000-option stress + seçim/duplicate/archived/tenant/variantDefining/option-
  tabanlı/kategori-bağı/≥1-option/replace-set + route GET/PUT/404/403), contracts `variant-selection-contracts.test.ts` 8, store-admin
  `products-form-variant-attributes.test.tsx` 7 (render filtre/option seç/≥1-option blok/archived gizle/legacy/edit round-trip/server
  hata) + `variant-selection-mapping.test.ts` 7, db `variant-selection-migration.test.ts` 8 (additive/Restrict/Cascade/JSON-yok).
  Regresyon: store-admin 269/269, api-gateway 771/771, api-client 23/23, contracts 101/101, db 16/16. Gate: db:generate + build
  (contracts/api-client) + typecheck (değişen paketler TEMİZ; storefront `checkout-form-render` ÖNCEDEN mevcut/TD-040) + lint +
  `next build` store-admin OK. KALAN: docker rebuild + prod-benzeri auth'lu runtime smoke. Faz 2C-2 (Combination Engine: Cartesian →
  combinationKey → ProductVariant + SKU matris) AYRI iş.

- TODO-148 — Faz 2C-2: Deterministik Combination Engine + kombinasyon önizlemesi (DONE — 2026-07-17, ADR-071). İş: 2C-1 eksen
  reçetesinden (`ProductVariantAttribute` × `ProductVariantOptionSelection`) **oluşacak varyant kombinasyonlarının ÖNİZLEMESİNİ**
  üreten **tamamen SAF** bir motor + salt-okunur önizleme ucu/ekranı. **KESİNLİKLE kombinasyon YAZILMAZ**: ProductVariant, SKU,
  barcode, price, inventory, bulk edit, varyant görselleri, storefront/search/marketplace, order snapshot KAPSAM DIŞI;
  `combinationKey` üretilir ama **DB'ye YAZILMAZ** (kalıcılığı Faz 2C-3). (1) **Saf motor** (`apps/api-gateway/src/variant-combinations/
  engine.ts`) `generateVariantCombinations(axes, {maxCombinations})` — Prisma/DB/network/logger/`Date`/`Math.random` YOK, girdiyi
  mutasyona uğratmaz; deterministik + idempotent. **Canonical ordering**: eksen `position ASC → attributeDefinitionId ASC`, option
  `position ASC → optionId ASC`. **Duplicate önleme**: duplicate option tekilleştirilir, duplicate axis option-union'lanır. Archived
  option elenir, empty axis düşürülür, eksen yoksa 0 kombinasyon. **Cartesian**: iteratif odometer (`O(k)` bellek). **`combinationKey`**:
  `v1|attrId:optId|...` (ID-tabanlı, segmentler attrId'ye sıralı — rename/position bağımsız). **`previewId`**: `pv_<cyrb53(key)>`
  (deterministik, random DEĞİL). (2) **Runtime guard** `MAX_PREVIEW_COMBINATIONS` (config `optionalNumberEnv` default 1000; magic
  number DEĞİL); Cartesian materialize edilmeden hesaplanır, aşımda `PREVIEW_LIMIT_EXCEEDED` (route 422). (3) **API.** Salt-okunur
  `GET /stores/:id/products/:id/variant-combinations/preview` (WRITE YOK; legacy variant-selections + `optionValues` DEĞİŞMEDİ).
  contracts (`variantCombinationPreview*` şema/tip) + api-client (`admin.products.variantCombinations.preview`). (4) **UI.** store-admin
  ürün formuna salt-okunur **"Oluşacak Kombinasyonlar"** paneli (`useVariantCombinationPreview` + `CombinationPreview`); yalnız
  düzenleme modu + kategori varyant-defining eksen tanımladıysa; kaydedilmiş reçeteyi yansıtır (her kaydetmede yeniden çeker). DÜZENLEME
  YOK. i18n tr+en. (5) **Testler.** api-gateway `variant-combinations.test.ts` 31 (saf motor: tek/çok eksen, 2×10=100, 3-eksen=100,
  5-eksen=1024, canonical ordering, determinizm/idempotency/input-order-bağımsızlık, duplicate option/axis, archived, empty axis,
  combinationKey format/stabilite, previewId determinizm/benzersizlik, guard limit + service tenant/boş/archived + route 200/404/422/403),
  store-admin `combination-preview.test.tsx` 7 (liste/sayı, null→optionId, guard uyarı, hata, spinner, 0→render-yok, veri-yok→render-yok).
  Regresyon: store-admin 269/269 (+7 yeni dosya), api-gateway 802/802, contracts 101/101, config 24/24, i18n 47/47. Gate: db:generate +
  build (contracts/config/i18n/api-client) + typecheck (api-gateway tsc + store-admin tsc TEMİZ) + tüm testler yeşil. Migration YOK
  (şema değişmedi). KALAN: docker rebuild + prod-benzeri auth'lu runtime smoke. Faz 2C-3 (kalıcı ProductVariant + SKU matris; combinationKey
  DB'ye yazımı) AYRI iş.
- TODO-149 — Faz 2C-3: ProductVariant persistence + incremental diff motoru (DONE — 2026-07-18, ADR-072). İş: Faz 2C-2 SAF Combination
  Engine'inden (`combinationKey` üretir, DB'ye YAZMAZ) **kalıcı `ProductVariant` üretimi** — kaydedilmiş eksen reçetesinden hedef
  kombinasyonlar üretilir ve mevcut varyantlarla **diff'lenir** → create/keep/restore/archive. Deterministik · idempotent · transaction-
  safe · concurrency-safe · tenant-safe · tekrar-çalıştırılabilir. **SKU Matrix DEĞİL** (fiyat/stok/barcode/inline düzenleme, variant image,
  storefront selector, marketplace KAPSAM DIŞI). (1) **Veri modeli (additive).** `ProductVariant` + `generationSource`
  (enum MANUAL|ATTRIBUTE_COMBINATION @default MANUAL) + `combinationKey String?` + `archivedAt DateTime?`;
  `@@unique([productId, combinationKey])` (Postgres NULL-distinct). Yeni tablo `ProductVariantOptionValue` (variantId,
  attributeDefinitionId, optionId; unique(variantId, attributeDefinitionId)) — normalize eksen→option seçimi (2A `VariantAttributeValue`'dan
  AYRI; `optionValues` JSON authoritative DEĞİL). Migration additive (yeni enum + 3 kolon + tablo + 1 unique index; backfill YOK).
  (2) **Saf diff motoru** (`variant-generation/diff-engine.ts`) Prisma/DB/Date/random BİLMEZ, girdiyi mutasyona uğratmaz; Map/Set ~O(P+E)
  (nested O(P×E) YOK); `{toCreate, toKeep, toRestore, toArchive, manualVariants}` deterministik. (3) **Persistence** (`data.ts`+`service.ts`)
  tek `prisma.$transaction`; başında **advisory xact lock** (`pg_advisory_xact_lock(hashtext(productId))`) + DB unique → yarışta P2002 →
  `VARIANT_GENERATION_CONFLICT`. keep=write YOK (idempotent); restore=aynı ID/SKU/price, yalnız status flip; archive=soft (`status=ARCHIVED`+
  `archivedAt`; hard-delete YASAK); create=DRAFT + deterministik SKU `V-<productId>-<hash(combinationKey)>` (random/timestamp YOK) +
  normalize selection; InventoryItem/price-audit yazılmaz. (4) **API.** `POST /stores/:id/products/:id/variant-combinations/generate`
  (gövdesiz; kaynak DB reçetesi). Yanıt `{totalTarget, created, kept, restored, archived, manualVariantsUntouched, variants[]}`. Stabil
  hatalar PRODUCT_NOT_FOUND(404) / VARIANT_SELECTION_EMPTY / INVALID_VARIANT_SELECTION / PREVIEW_LIMIT_EXCEEDED / ATTRIBUTE_OPTION_NOT_FOUND(422)
  / VARIANT_GENERATION_CONFLICT(409). contracts `variantGenerationResponseSchema` + api-client `...variantCombinations.generate`. Preview
  ucu (GET) BOZULMAZ. (5) **UI.** Ürün formuna **"Varyantları Oluştur"** aksiyonu + sonuç özeti (`useVariantGeneration` +
  `GenerateVariantsAction`; yalnız düzenleme + eksen varsa görünür; preview limiti/loading'de pasif); başarıda önizleme yeniden çekilir.
  i18n tr+en. (6) **Boş reçete.** Eksen yoksa `VARIANT_SELECTION_EMPTY` (sessiz archive YOK); tüm option archived → `INVALID_VARIANT_SELECTION`.
  (7) **Testler.** api-gateway `variant-generation.test.ts` 36 (saf diff + service tüm senaryolar + route), contracts 3, store-admin
  `generate-variants-action.test.tsx` 9. Regresyon: api-gateway 838/838, contracts 104/104, store-admin 285/285, api-client 23/23,
  db 16/16. Gate: prisma format/validate/generate + migration SQL review + typecheck + lint + build (api-gateway tsc + store-admin Next) +
  `git diff --check` temiz. KALAN: docker rebuild + `migrate deploy` + prod-benzeri auth'lu runtime smoke; gerçek-PG concurrency
  integration testi (TD-043). Faz 2C-4 (SKU Matrix) AYRI iş.

- TODO-150 — Faz 2C-4: Identity Management Engine (SKU/Barcode/Variant Title pattern motoru) (DONE — 2026-07-18, ADR-073;
  commit/merge/deploy YAPILMADI — final rapor sonrası durum). İş: 2C-3 persistence altyapısını (kalıcı `ProductVariant`,
  `combinationKey`, `ProductVariantOptionValue`, deterministik placeholder SKU) tüketip **pattern tabanlı kimlik motoru** ekler.
  Bu faz yalnız **SKU · Barcode · Variant Title** aktif (GTIN/EAN/UPC/ERP/marketplace altyapı olarak öngörülür, YAZILMAZ). SKU Matrix
  ekranı DEĞİL; **Identity Matrix** (pattern editörü + preview tablosu + collision paneli + apply). (1) **SAF motor**
  (`identity-engine/`): `tokenizer.ts` (lexer; kaçış `{{`/`}}` + charset + dengeli/iç-içe parantez) · `parser.ts` (token semantiği +
  AST; PRODUCT/CATEGORY/ATTRIBUTE:code/COLOR/SIZE/SEQ aktif, ID/YEAR/MONTH rezerve → `IDENTITY_TOKEN_NOT_SUPPORTED`) · `evaluator.ts`
  (identifier modu=value+UPPER / title modu=label; SEQ padding; eksik token=missing) · `collision.ts` (internal+external, O(n+m)) ·
  `preview.ts` (değerlendirme+validation+collision orkestrası; blocking bayrağı). Hepsi Prisma/HTTP/Date/`Math.random` BİLMEZ.
  (2) **Veri modeli (additive).** `ProductVariant.titleIsCustom Boolean @default(false)` (title override koruması; varyant PATCH
  `title` verince true) + `enum VariantIdentityField (SKU|BARCODE|TITLE)` + append-only `VariantIdentityChange` (batchId gruplu undo
  metadata; oldValue/newValue/field/pattern/changedByPlatformUserId scalar). Migration additive (1 kolon + enum + tablo + 4 index +
  3 FK; backfill YOK). (3) **Servis** (`service.ts`+`data.ts`): preview yalnız-okuma + deterministik; apply **server-authoritative**
  (preview'i yeniden hesaplar) + tek `prisma.$transaction` + **advisory xact lock** (`$executeRaw`) + yalnız-değişen yazım + audit.
  Fail-closed: blocked (SKU collision / sert validation) → hiçbir yazım (422 `IDENTITY_APPLY_BLOCKED`). Idempotent (ikinci apply →
  updated=0). Dış-SKU sahipleri tek `in` sorgusu (N+1 YOK). (4) **API.** `GET .../identity/preview` (query: sku/barcode/title/seqStart/
  regenerateCustomTitles) + `POST .../identity/apply`. Yanıt `{rows[], collisions[], blocked, counts, patterns, variantCount}` /
  apply `{batchId, updated, skipped, collisions, preview}`. Stabil hatalar PRODUCT_NOT_FOUND(404) / IDENTITY_NO_PATTERN /
  IDENTITY_PATTERN_INVALID / IDENTITY_APPLY_BLOCKED(422) / IDENTITY_SKU_CONFLICT(409). contracts `identity*Schema` + api-client
  `...identity.{preview,apply}`. Combination/generation uçları BOZULMAZ. (5) **UI.** Ürün formuna **Identity Matrix** bölümü
  (`useIdentityMatrix` + `IdentityMatrix`; yalnız düzenleme + eksen varsa görünür): debounce'lu canlı preview, pattern editörü (SKU/
  Barcode/Title + seqStart + regenerateCustomTitles), preview tablosu (mevcut→yeni + değişim/çakışma rozetleri), collision paneli,
  apply (blocked/değişiklik yok iken pasif). BFF proxy `.../identity/{preview,apply}`. i18n tr+en (`identityMatrix`). (6) **Testler.**
  api-gateway `identity-engine.test.ts` (~46: tokenizer/parser/evaluator/collision/preview saf + service in-memory fake + route).
  Regresyon: api-gateway 878/878, store-admin 285/285; full `pnpm -r build` PASS (25/25 proje). Gate: prisma format/generate +
  migration SQL + full build + typecheck + tests. KALAN: docker rebuild + `migrate deploy` + auth'lu runtime smoke; gerçek-PG
  concurrency integration (TD-044). GTIN/ERP/Marketplace/Price Matrix/Inventory Matrix/Variant Media KAPSAM DIŞI.
- TODO-151 — Faz 2C-5: Commercial Engine (Price/Compare-at/Cost/VAT preview-first bulk pricing) (DONE — 2026-07-18, ADR-074;
  commit/merge/deploy YAPILMADI — final rapor sonrası durum). İş: 2C-4 Identity Engine desenini `ProductVariant`'ın **ticari** alanlarına
  taşır. Aktif alanlar: **Price · Compare-at · Cost · VAT**; hesaplanan/salt-okunur: **Gross Profit · Margin% · Markup% · Discount%**.
  (1) **SAF motor** (`commercial-engine/`): `types.ts` (field/operation/rounding enum + state) · `money.ts` (integer minor aritmetiği:
  yüzde/sabit/markup/compareAt-türetme/rounding/price-ending/overflow; float YASAK) · `calculator.ts` (margin/markup/discount, division-by-
  zero güvenli) · `fingerprint.ts` (FNV-1a stale-guard) · `rule.ts` (yapısal rule normalize+validate; operation↔field uyumu) · `evaluator.ts`
  (rule/direct-edit → hedef state) · `validation.ts` (blocking/warning sınıflama) · `diff-engine.ts` (alan-bazlı O(n·f) diff) · `preview.ts`
  (rows+summary+fingerprint orkestrası). Hepsi Prisma/HTTP/Date/`Math.random` BİLMEZ. (2) **Veri modeli (additive).** `enum CommercialField
  (PRICE|COMPARE_AT_PRICE|COST|VAT_RATE)` + `enum CommercialChangeSource (DIRECT_EDIT|BULK_RULE)` + append-only `VariantCommercialChange`
  (batchId gruplu; oldValue/newValue [money=minor, VAT=bps] + currency + source + ruleSnapshot + changedByPlatformUserId scalar). Migration
  `20260718140000_add_commercial_engine` (2 enum + tablo + 5 index + 3 FK; mevcut fiyat kolonları DEĞİŞMEZ; backfill/down YOK). `ProductPriceChange`
  (F4B) BOZULMAZ. (3) **Servis** (`service.ts`+`data.ts`): preview yalnız-okuma + deterministik; apply **server-authoritative** (preview'i
  yeniden hesaplar) + tek `prisma.$transaction` + **advisory xact lock** (`$executeRaw`) + **stale-preview fingerprint kontrolü** + yalnız-
  değişen yazım (PRICE/VAT değişince net/KDV F4C üçlüsü `splitGrossByVat` ile türetilir; brüt SABİT) + audit. Fail-closed: blocked/stale →
  hiçbir yazım. Idempotent (ikinci apply → updated=0). ARCHIVED kapsam dışı; apply status DEĞİŞTİRMEZ. (4) **API.** `GET .../commercial`
  (matris) + `POST .../commercial/preview` + `POST .../commercial/apply`. Rule VEYA direct-edit + selectedVariantIds (tenant/scope guard).
  Stabil hatalar PRODUCT_NOT_FOUND(404) / COMMERCIAL_VARIANT_NOT_FOUND(404) / COMMERCIAL_PREVIEW_STALE(409) / COMMERCIAL_CONFLICT(409) /
  COMMERCIAL_INVALID_RULE / COMMERCIAL_SELECTION_EMPTY / COMMERCIAL_APPLY_BLOCKED(422). contracts `commercial*Schema` + api-client
  `...commercial.{get,preview,apply}`. Identity/combination/generation uçları BOZULMAZ. (5) **UI.** Ürün formuna **Commercial Matrix**
  (`useCommercialMatrix` + `CommercialMatrix`; kaydedilmiş her üründe görünür): mod anahtarı (toplu kural / hücre düzenle), rule paneli
  (targetField/operation/amount/rounding/price-ending), seçim (tümü/temizle), preview tablosu (mevcut→hedef + margin/markup/discount +
  değişim/warning/error rozetleri), özet paneli, apply (blocked/değişiklik-yok iken pasif; autosave YOK). BFF proxy `.../commercial/{,preview,apply}`
  (apply CSRF'li). i18n tr+en (`commercialMatrix`). (6) **Testler.** api-gateway `commercial-engine.test.ts` (66: money/calculator/rule/
  evaluator/fingerprint/diff/preview SAF + service in-memory fake [matrix/preview/apply/idempotent/stale/blocked/tenant/empty-selection/
  invalid-rule/VAT-gross-sabit/P2002]). Regresyon: api-gateway **944/944**, store-admin **285/285**; contracts 104, api-client 23, db 16.
  Gate: prisma format/validate/generate + migration SQL + api-gateway/store-admin typecheck TEMİZ + lint + tests yeşil + git diff --check.
  KALAN: docker rebuild + `migrate deploy` + auth'lu runtime smoke; gerçek-PG concurrency integration (TD-045). Inventory/Variant Media/
  currency conversion/rule persistence/undo UI/scheduled pricing/1000+ row virtualization KAPSAM DIŞI.
- TODO-151A — Faz 2C-5A: Commercial UX Refinement — tam genişlik "Fiyatlandırma" sekmesi + anlaşılır fiyat dili + yönlendirmeli toplu işlem
  (DONE — 2026-07-18, ADR-075; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). **Yalnız Store Admin UX**; Commercial Engine
  (money/calculator/margin/markup/discount/fingerprint/stale-guard/diff/transaction/advisory-lock/audit/tenant/net-KDV türetme/changed-only) ve
  API kontratı **DEĞİŞMEDİ**. (1) **Bağımsız Pricing tab.** `products/[id]/page.tsx` artık iki sekme (Genel · Fiyatlandırma); ticari alan Genel
  formun içindeki küçük gömülü karttan (`CommercialMatrix`) çıkarıldı → tam genişlik çalışma alanı. Eski `commercial/commercial-matrix.tsx`
  SİLİNDİ; `use-commercial-matrix.ts` KORUNDU (varsayılan mod artık `direct`=Hızlı düzenleme; `setSelection` helper eklendi — motor/kontrat
  etkisi yok). (2) **Yeni workspace** (`products/pricing/`): `pricing-workspace.tsx` (KPI kartları · Hızlı düzenleme[varsayılan] vs Toplu işlem
  modu · tam genişlik tablo · alan-bazlı önizleme özeti · old→new gösterim · seçim UX · uyarı/engelleyici ayrımı · loading/empty/error/allArchived/
  noSelection/noChanges/stale/success state) · `guided-operations.ts` (senaryo → [targetField,operation] eşlemesi; motor değişmeden) ·
  `pricing-tokens.ts` (semantik token sınıfları). (3) **Dil.** "Ticari matris"/"İndirim" gibi teknik/yanıltıcı ifadeler UI'dan kaldırıldı;
  "Liste fiyatına göre indirim" + kolon tooltip'leri (satış/liste/maliyet/KDV/marj/markup) + insan-dostu hata mesajları (`issueMessages`; ham
  stable kod yalnız "Teknik detay"). i18n tr+en `products.pricing` + `products.detail.tabs` (EN yapısal olarak TR ile eşleşir — i18n build yeşil).
  (4) **Tema.** `globals.css` `.pricing-workspace` semantik token katmanı (ink/surface/line/success/warning/danger…); renk anlamı token'dan gelir,
  ikon+başlık+metin ile eşlenir (yalnız-renk değil); `[data-theme="light"]` açık tema türetmesi hazır (panel geri kalanı bilinçli koyu-tek-tema
  kalır — @commerce-os/ui'ye dokunulmadı). (5) **Testler.** store-admin `pricing-workspace.test.tsx` (14) + `guided-operations.test.ts` (4) +
  `product-detail-page.test.tsx` sekme testleri (2 yeni); toplam store-admin **305/305**, i18n 47. Gate: store-admin typecheck+lint+build TEMİZ,
  git diff --check temiz. KALAN: docker rebuild + auth'lu runtime görsel smoke (screenshot checklist final raporda). Backend engine/DB/API/checkout/
  storefront/inventory/scheduled-pricing/approval/autosave/1440px+ per-tab breakout KAPSAM DIŞI.

- TODO-152 — Faz 2C-6: Warehouse-Aware Inventory Engine (depo/onHand/reserved/available/incoming/safety/reorder preview-first bulk)
  (DONE — 2026-07-18, ADR-076; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). Mevcut `InventoryItem`/reservation/movement,
  checkout/sipariş (`placeOrder`/`cancelOrder` + `FOR UPDATE`) ve storefront **DEĞİŞMEDİ** (sıfır regresyon; additive). (1) **DB.** Yeni enum
  `WarehouseStatus`/`InventoryAdjustmentField`(reserved YOK)/`InventoryAdjustmentSource`; model `Warehouse` (store-scoped, partial-unique default),
  `InventoryBalance` (variant×warehouse, `@@unique([warehouseId,variantId])`), `InventoryAdjustment` (append-only ledger). Migration
  `20260718150000` additive + deterministik/idempotent backfill (store başına default depo + InventoryItem→balance BİREBİR; `ON CONFLICT DO NOTHING`).
  (2) **Engine** (`apps/api-gateway/src/inventory-engine/`): SAF `availability`(available=onHand−reserved−safetyStock; incoming HARİÇ)/`calculator`/
  `validation`/`fingerprint`(reserved dahil)/`diff-engine`/`preview` + IO `data`(advisory-lock `$executeRaw` · InventoryItem köprüsü: default depoda
  onHand/reserved canlı overlay + onHand→InventoryItem senkron · changed-only + audit)/`service`(stale-guard + INACTIVE fail-closed)/
  `reservation-service`(SAF foundation, order flow'a bağlı DEĞİL — Alternatif A)/`routes`. (3) **API.** `GET …/warehouses` · `GET/POST …/products/
  :productId/inventory{,/preview,/apply}`; stable error kodları (INVENTORY_PREVIEW_STALE/APPLY_BLOCKED/WAREHOUSE_INACTIVE/…). contracts+api-client.
  (4) **Store Admin.** Bağımsız tam-genişlik **Stok** sekmesi (`products/inventory/*`; pricing token'ları yeniden kullanıldı): depo seçici+default
  rozet+INACTIVE uyarı · 6 KPI · Hızlı düzenleme (reserved **salt-okunur**) vs Toplu işlem (8 yönlendirmeli senaryo + "Stoğu sıfırla" uyarı) ·
  alan-bazlı preview özeti (old→new) · warning/blocking humanize. Autosave YOK. i18n tr+en `products.inventory` + `detail.tabs.inventory` (parity).
  (5) **Testler.** api-gateway `inventory-engine.test.ts` (64) + store-admin `inventory-workspace.test.tsx` (6); regresyon api-gateway **1008/1008**,
  store-admin **312/312**, contracts 104, api-client 23, i18n 47. Gate: prisma format/validate/generate + build + tsc + eslint + git diff --check
  TEMİZ; prisma package.json/lockfile bump GERİ ALINDI. KALAN: migration deploy + docker rebuild + auth'lu runtime görsel smoke (final raporda).
  KAPSAM DIŞI (TD-047): warehouse-aware reservation/checkout/allocation · checkout safety-stock uygulaması · warehouse CRUD UI · fulfillment commit
  · transfer/PO/lot/serial/bin/expiry/cycle-count/reconciliation/ERP/marketplace · low-stock notification · gerçek-PG concurrency integration · 1000+
  satır virtualization.

- TODO-152A — Faz 2C-6 devamı: Inventory UX Birleştirme (global izleme merkezi + reorderPoint tek authority + sekme kontrastı)
  (DONE — 2026-07-18, ADR-077; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). Motor/şema/transaction mimarisi DEĞİŞMEDİ.
  (1) **Global Stok = izleme & operasyon merkezi.** Legacy `InventoryItem` liste + "Stok düzelt" modalı KALDIRILDI; `app/(app)/inventory/page.tsx`
  yeniden yazıldı: depo seçici + 6 KPI + arama + durum filtresi + tablo (Ürün/Varyant/SKU/Elde/Rezerve/Güvenlik/Satılabilir/Gelen/**Yeniden sipariş
  noktası**/Durum) + satır→`/products/:id?tab=inventory` derin-link + güvenli tek-satır hızlı işlem (+10/−10/sıfırla, ürün-bazlı preview→apply; blocked→uyarı).
  Quick Edit/Bulk/Preview/Apply YALNIZ Product Detail > Stok'ta (ADR-076 per-product transaction korunur; fan-out yazma REDDEDİLDİ). (2) **Yeni SALT-OKUMA
  uç.** `GET …/inventory/matrix?warehouseId=` (data `listStoreVariants` batched N+1-siz · service `storeMatrix` SAF `computeCalc` durum paritesi · contracts
  `inventoryStoreMatrix*` · api-client `admin.inventory.storeMatrix` · BFF `catalog/inventory/matrix` · `storeApi.getStoreInventoryMatrix`). (3) **reorderPoint
  tek authority.** Varyant modalı "Kritik stok eşiği" + gateway create/update `lowStockThreshold` yazımı + contract create/update request alanları KALDIRILDI;
  dashboard "kritik stok" KPI'ı motor LOW_STOCK'undan (=reorderPoint) türetilir. Kolon DROP EDİLMEDİ (dormant; additive). Idempotent backfill
  `20260718160000_backfill_reorder_point` (default depo · reorderPoint=0 · eşik>0 → taşı; manuel değerleri ezmez). (4) **Paylaşılan atomlar** `products/
  inventory/shared.tsx` (Kpi/WarehouseSelector/StatusBadge/fmt) → global + Product Detail AYNI componentler. (5) **Sekme kontrastı** underline→pill (indigo
  dolgu + border + ikon + hover + mobil kaydırma; `?tab=` derin-link). i18n tr+en `storeAdmin.inventory` yeniden yazıldı, `variants.form.lowStock*` kaldırıldı.
  (6) **Testler.** api-gateway `inventory-engine.test.ts` +2 (storeMatrix span/exclude-archived + WAREHOUSE_NOT_FOUND) → **1010/1010**; store-admin
  inventory testleri yeni global sayfaya göre yeniden yazıldı (izleme + quick +10 preview→apply + blocked-guard) → **313/313**; contracts 104, api-client 23,
  i18n 47. Gate: build (contracts/api-client/i18n/api-gateway tsc + store-admin/storefront/worker) + eslint TEMİZ. KALAN: backfill migration deploy + docker
  rebuild + auth'lu runtime görsel smoke (final raporda). KAPSAM DIŞI: global fan-out yazma · lowStockThreshold kolon drop · warehouse CRUD UI (TD-047).

- TODO-153 — Faz 2C-7: Variant Media Engine — Media-Defining Axis ile Renk-bazlı varyant galerisi
  (DONE — 2026-07-18, ADR-078; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası). Mevcut Product/Variant/Media mimarisi + ADR-065 galeri +
  checkout/inventory/pricing/variant-generation/storefront-availability **DEĞİŞMEDİ** (additive + backward compatible; `mediaDefiningAttributeId=null` →
  klasik galeri birebir). (1) **DB (additive migration 20260718170000).** `Product.mediaDefiningAttributeId` (nullable FK→AttributeDefinition, SetNull);
  `ProductImage.attributeDefinitionId`+`optionId` (nullable FK Restrict) + index `[productId,optionId]`. Backfill YOK. (2) **API.** contracts:
  `productImageSchema.optionId`/`productSchema.mediaDefiningAttributeId` (default null); update `imageBindings:[{mediaId,optionId?}]`+`mediaDefiningAttributeId`;
  public `publicProductImageSchema.variantOptionId`+`publicProductVariantSchema.mediaOptionId`+`publicProductSchema.mediaDefiningAttributeId` (yalnız id'ler;
  mediaId/storageKey SIZMAZ). gateway `ProductImageBinding` soyutlaması (persistence-only join-tablo geçişi); `listProductImages` optionId (EKSTRA SORGU YOK);
  detay `resolveVariantMediaOptions` (TEK batched, yalnız eksen varsa; PLP sorgu sayısı değişmez); guard `assertMediaDefiningAxis`(INVALID_MEDIA_AXIS)+
  `prepareProductImageBindings`(INVALID_MEDIA_OPTION/MEDIA_AXIS_REQUIRED); MEDIA_IN_USE DEĞİŞMEDİ. (3) **Admin UI.** galeri bölümünde media-eksen seçici (yalnız
  etkin SELECT/COLOR varyant eksenleri) + görsel-başı renk etiketleme (gruplu; "Tüm varyantlar"=paylaşılan); eksen değişince etiket sıfırlama; MediaUpload
  primitive'i korundu. (4) **Storefront.** `PdpSelectionProvider` (context) ile BuyBox↔`VariantGallery` state lift; `galleryImagesForVariant` saf helper (eşleşen
  renk+paylaşılan; fallback tüm-dizi); SSR default=en ucuz varyant grubu (hidrasyon sıçraması yok); PLP kapak değişmedi. (5) **Testler.** api-gateway +1 entegrasyon
  → 1011/1011; storefront +variant-media.test.ts → 202/202; store-admin gallery→imageBindings → 313/313; contracts +3 → 107/107. i18n TR/EN parity. Gate:
  tsc/eslint/build/prisma-validate/git-diff TEMİZ (istisna: önceden var olan checkout-form-render.test.tsx tsc — kapsam dışı). KALAN: migrate deploy + docker
  rebuild + auth'lu görsel smoke (final rapor). KAPSAM DIŞI: per-SKU/hibrit override · ProductImageOption join tablo · video/360/3D/AR/mediaKind (TD-048).

- TODO-154 — Faz 2C-8A: Search Read-Model Foundation (arama/filtreleme altyapısı — YALNIZ temel)
  (DONE + MERGED + DEPLOYED — 2026-07-19, ADR-079; PR #80 feat `15f8425` merge `0aaea08` + docker build fix
  PR #81 `279ab69` merge `0b1a63c`=main; CI yeşil, 7/7 healthy, deployed smoke ALL PASS). Public search/facet uçları, storefront filtre UI, URL senkronu,
  autocomplete/synonym KAPSAM DIŞI (Faz B+). Mevcut public katalog uçları + allowlist + checkout/inventory/pricing DEĞİŞMEDİ (additive). (1) **DB (additive
  migration 20260719120000).** `ProductSearchDocument` (ACTIVE ürün/1 satır; `searchVector tsvector` GENERATED STORED + min/max fiyat + hasStock/availability +
  revision) + `ProductFacetValue` (flat `(ürün×filterable attr×değer)`; single-value CHECK) + enum `SearchAvailabilityState`; `pg_trgm` + GIN(searchVector) +
  GIN trgm(title) + btree kompozit; Store/Product Cascade. Inline veri taşıma YOK (runtime backfill). (2) **search-service.** `SearchProvider` portu +
  `PostgresSearchProvider` + deterministik SAF `buildSearchDocument` + bounded-batch `data.ts` (N+1 yok) + backfill CLI (`--store|--all|--dry-run`,
  resumable/idempotent/non-truncating). Facet YALNIZ `CategoryAttribute.filterable`; ARCHIVED def/option hariç; dedupe; IMAGE/FILE hariç. (3) **queues/contracts.**
  `search-index` kuyruğu + `enqueueSearchIndexJob` (OTOMATİK jobId — deterministik jobId change-stream'i bozuyordu) + `searchIndexJobSchema`. (4) **worker.**
  `search-index` işleyici (provider dispatch; idempotent + retry/backoff; poison log). (5) **api-gateway.** fire-and-forget emitter (Redis down→mutation
  etkilenmez) + 10 mutation noktasında reindex tetiği (product/variant/inventory/attribute-value/eksen/generation/identity/commercial + categoryAttribute/STORE
  attribute+option şema → store-batch). (6) **Testler.** search-service 35 + queues 6 + api-gateway trigger 6; api-gateway tam suite 1017 (regresyon yok). Gerçek-PG
  smoke (index/fiyat/stok/facet-replace/archive→removed/tsvector FTS/EXPLAIN Index-Only-Scan/cascade) + event-driven smoke (enqueue→worker→read-model) + backfill
  smoke (DRAFT hariç + idempotent) hepsi PASS. Gate: prisma format/validate/generate + turbo build 24/24 + lint 36/36 + test 36/36 + git-diff TEMİZ; CI yeşil. DEPLOY:
  api-gateway+worker merged-main'den rebuild, migrate deploy (up to date), 7/7 healthy, deployed event-driven smoke (container worker) ALL PASS. KAPSAM DIŞI: public
  search/facet uç · storefront PLP/filtre · URL sync · autocomplete/synonym · OpenSearch · AI ranking · kampanya-etkin fiyat facet'i · PLATFORM attribute global fan-out (TD-049).

- TODO-155 — Faz 2C-8B: Public Search & Facet API (DONE + MERGED + DEPLOYED — 2026-07-19, ADR-079 Faz B;
  feat `5a5e597`, PR #83, merge `04264ae`=main; CI lint·test·build yeşil (3m37s); deploy: merged-main'den api-gateway+worker rebuild,
  migrate deploy up-to-date (YENİ MIGRATION YOK), 4/4 healthy, post-merge runtime smoke ALL PASS).
  YALNIZ read-model'den okur (Product/EAV re-join YOK); Faz A read-model'i üstüne okuma katmanı. (1) **search-service.**
  `SearchProvider.search` + provider-bağımsız port tipleri (`SearchQuery`/`SearchFilter`/`SearchResult`/`SearchFacet`/`SearchError`); `search-query.ts` =
  read-model üzerinde bounded/parametreli/tenant-scoped raw SQL (result + disjunctive facet count/range + pagination + facet meta) + SAF yardımcılar
  (`assembleFacets`/`computePagination`/`deriveSelectionMode`/`escapeLike`). (2) **contracts.** `publicSearchResponseSchema` (ALLOWLIST). (3) **api-gateway.**
  `GET /public/stores/:storeSlug/search`; `search/query-parser.ts` (SAF; `filter[code]`+`[min]`/`[max]` bracket → düz-anahtar regex — Fastify default parser)
  + `search/routes.ts` (SearchError→HTTP; kategori adı + kapak görseli bounded page-hidrasyonu; allowlist); `searchProvider` DI seam. **Kararlar:** subtree
  DAHİL (recursive CTE); disjunctive facet (OR-içi/AND-arası/kendi-hariç, COUNT DISTINCT); relevance = exact→prefix→FTS rank→trigram→productId; taban fiyat
  range overlap (kampanyalı fiyat kapsam dışı); numaralı pagination (PUBLIC_CATALOG_MAX kullanılmaz); hata kodları (INVALID_SEARCH_QUERY/SORT/PAGINATION/FILTER/
  FILTER_VALUE, CATEGORY_NOT_FOUND, ATTRIBUTE_NOT_FILTERABLE); cache ERTELENDİ (read-model = materialized cache). (4) **Testler.** search-service 49 (+14) +
  api-gateway 1047 (+30) + contracts 107 + queues 8; tüm build/lint temiz. Docker gerçek-PG üretim-kod smoke 31/31 PASS + HTTP endpoint uçtan uca + EXPLAIN
  index doğrulaması + allowlist sıfır sızıntı; 4/4 healthy; smoke verisi temizlendi (cascade → read-model 0/0). KAPSAM DIŞI: storefront PLP/filter sidebar/
  mobile/URL sync UI · "daha fazla yükle" · autocomplete/suggest/synonym · search analytics · OpenSearch · AI ranking · best_selling/most_viewed sort ·
  promotion-aware price · Redis facet cache (Faz C+/E/F).

- TODO-156 — Faz 2C-8C: Storefront Search & Filter UI (PLANLANDI — henüz başlanmadı). Faz B public arama/facet ucunu (`GET /public/stores/:slug/search`)
  tüketen storefront PLP: kategori rotaları + URL-driven filtre (query-param), filter sidebar (dinamik facet render + count), mobile drawer, aktif-filtre çipleri,
  breadcrumb, result count, numaralı pagination (+opsiyonel "daha fazla yükle" progressive enhancement), SSR/ISR + cache tag. Autocomplete/synonym (Faz E),
  OpenSearch (Faz F) AYRI. Bu faza BAŞLANMADI.

- TODO-156A — Storefront Search Experience Mimarisi (ANALİZ, kod yok). Mevcut storefront + tamamlanmış search backend analizi → enterprise PLP/filter/URL-state/SEO/
  a11y/component mimarisi + fazlara bölünmüş plan (156B/156C/156D). Çıktı: `ANALIZ-156A.md`. **R1 riski** (arama kartının ticari/görsel zenginlik kaybı) → TODO-155.1.

- TODO-155.1 — Faz 2C-9: Search Listing Projection Enrichment (ADR-079 Ek). **DONE + MERGED + DEPLOYED** (feat `dbeeac0`, PR #85, merge `42bc9c7`=main; CI pass 3m34s; merged-main deploy 4/4 healthy + post-merge smoke ALL PASS). TODO-156A R1'i çözer:
  arama kartı için bounded/tenant-safe/public-safe listing projection'ı **index anında** snapshot'lanarak read-model'de tutulur (ikinci hydration turu YOK; read-model-only
  korunur). `ProductSearchDocument` additive: `compareAtMinor`/`discountPercent`/`omnibusPreviousPriceMinor` (typed) + `listing` jsonb (primary/secondary görsel +
  swatches[] + swatchTotalCount). Migration `20260719130000` **additive**. Ticari snapshot (tek indirim formülü; Omnibus yalnız indirim aktifken, sahte yok) + swatch
  (media-tanımlayıcı eksen; ACTIVE option ∩ ACTIVE varyant; dedupe/sortOrder/archived-inactive hariç/görsel fallback/deterministik default/bounded 8+total) + görsel
  (storageKey IÇ; url route'ta türetilir; eski resolveCovers sorgusu kaldırıldı). DTO additive + allowlist (storageKey/mediaId sızmaz). **Gate:** search-service 70
  (+21) · contracts 110 (+3) · api-gateway 1047 · full build 24/24 · typecheck · lint TEMİZ. **Docker gerçek-PG smoke ALL PASS** (backfill 3 indexed · 3-swatch gerçek
  veri · compareAt→discount%20 yansıma · idempotency revision 0→1 · allowlist sıfır sızıntı; smoke verisi geri alındı). **KAPSAM DIŞI (→155.2):** kampanya/indirim rozeti
  snapshot'ı (F4A motoru paylaşımı) · zamanlanmış reconciliation sweep kodu (strateji dokümante) · promotion-aware filter/sort · Redis cache. Bkz. TD-050.

- TODO-155.2 — Faz 2C-9B: Search Listing Semantic Completion (**DONE · worktree · gate + docker smoke ALL PASS; commit/PR YAPILMADI — TODO-156C ile birleşik ship bekliyor**).
  İKİ gerçek tutarsızlık kapatıldı: (A) **PDP↔PLP kampanya**: pure `selectPublicCampaignDisplay` + `CampaignRecord`/`CampaignCouponRecord` + `toCouponDisplayFields` **paylaşılan pakete
  taşındı** (`@commerce-os/contracts`; PDP + indexer AYNI "tek formül"). `selectIndexableCampaignSnapshot` index-anı birincil rozet + kazanan pencere → `ProductSearchDocument.campaign`
  (jsonb) + `campaignStartsAt/EndsAt` (additive migration `20260719140000`); read-time `isCampaignSnapshotDisplayable` bastırma + lifecycle reindex (`onCampaignChanged→reindexStore`)
  + reconciliation sweep (`CAMPAIGN_RECONCILE_ENABLED`, in-process setTimeout, default off). (B) **Swatch↔Facet**: variantDefining+filterable eksen seçimleri (`ProductVariantOptionValue`)
  artık `ProductFacetValue`'ya index'lenir (`buildFacets` VAV **+** variant eksen option birleşik dedupe) → Demo Hoodie Renk facet'i ELLE SEED OLMADAN üretilir. checkout otoriter KALIR
  (PLP fiyatı bilgilendirici tahmin; ADR-062). **Gate:** full build 25/25 · search-service 78 · api-gateway 1057 · storefront 317 · i18n 47 · lint · next build · diff-check TEMİZ.
  **Docker smoke ALL PASS** (gerçek Demo Hoodie: PLP kartı ₺1.349,10 %10 "Sepette" = PDP ile birebir · Renk facet auto Siyah/Kırmızı/Mavi · disjunctive filtre · canlı read-time
  suppression · allowlist sıfır sızıntı · regresyon home/cart/pdp 200; geçici endsAt mutasyonu backfill ile geri alındı). Bkz. ADR-079 Ek + PHASE_LOG Faz 2C-9B + TD-050.1/051.3 (RESOLVED)
  + TD-053.5 (kısmen) + TD-054. **Sıradaki: TODO-155.2 + TODO-156C birleşik final review + ship.**

- TODO-156B — Faz 2C-8C: Storefront Search Experience Foundation (DONE · **MERGED + DEPLOYED**; feat `415a0cd`, PR #87, merge `77042e4`=main; 5/5 healthy + post-merge runtime smoke ALL PASS). PLP (`/products`) URL-state + RSC + public
  search endpoint temeline geçti: tek-otorite URL codec (`lib/search/url-state.ts`, gateway parser'ıyla birebir + kanonik serialize), sunucu-yalnız BFF (allowlist parse),
  biçimleme-yalnız listing adapter, search-özel ProductCard (swatch preview + secondary hover; varyant seçimi yok), numaralı SSR pagination (Load More ertelendi), gerçek
  header arama (mock kaldırıldı), loading/empty(4 durum)/error(route boundary) UX, SEO temeli (noindex arama+filtre / canonical). Eski `ProductListingView` (istemci
  filtre/slice) silindi; catalog/PDP/eski `.../products` ucu KORUNDU. Gate: storefront 273/273 (+75 test) · i18n 47 (TR/EN parity) · contracts 110 · next build yeşil ·
  lint temiz · **Docker runtime smoke ALL PASS** (PLP SSR · header arama · sort · pagination · geri/ileri · swatch · mobil 2-kolon · PDP/katalog regresyon). YENİ MIGRATION
  YOK. **KAPSAM DIŞI:** facet UI (→156C) · Load More (→156C/D) · kampanya rozeti (→155.2) · kategori SEO landing + JSON-LD (→156D) · autocomplete/suggest/recent (backend yok).
  Bkz. PHASE_LOG Faz 2C-8C + TD-051.

- TODO-156C — Faz 2C-8D: Dynamic Facet Experience (**DONE · gate + worktree docker smoke ALL PASS; commit/PR bekliyor**). Storefront facet UI eklendi: veri-güdümlü
  `FacetRenderer` registry (`resolveFacetKind`: selectionMode birincil / dataType sunum → checkbox/color/boolean/range/date; bilinmeyen → checkbox fallback; switch-case YOK)
  + desktop kalıcı `FilterRail` (sticky) + mobil tam-yükseklik `FilterDrawer` (role=dialog/aria-modal/ESC/scroll-lock/focus-trap; **rail ile AYNI `FacetList` renderer**) +
  `ActiveFilterChips` (YALNIZ URL-türevli; tekil kaldır kanonik removeHref + tümünü temizle) + Fiyat/Stok top-level facet + collapse/"daha fazla göster" + disjunctive count/
  selected yansıması. URL mutasyonları SAF tek yazma noktası (`url-state.ts`: toggle/removeValue/removeFilter/setRange/withPrice/withInStock/clearedFiltersOnly); **yerel filtre
  state YOK** (her etkileşim → URL replace → RSC SSR refetch). +39 test (312/312) · i18n +25 anahtar (parity 47) · `next build` yeşil · lint temiz · **YENİ MIGRATION YOK**.
  Docker smoke: desktop tık→disjunctive→çip, mobil drawer+ESC+focus dönüş, deep-link/refresh/share 3 kombine filtre, geri; seed verisi geri alındı. Bilinçli kapsam dışı:
  slider (TD-053.2) · Load More (156C/D) · DATE canlı (TD-053.4) · kampanya rozeti (155.2). Bkz. PHASE_LOG Faz 2C-8D + TD-051.1 (RESOLVED) + TD-053. Sıradaki: TODO-156D.
- TODO-156D — SEO URL Governance, Category SEO, JSON-LD & Accessibility Hardening (**DONE · worktree · gate + `next build` doğrulandı; commit/PR/deploy YAPILMADI — brief kuralı**).
  ADR-080/081/082/083. Pure domain motorları (`@commerce-os/utils`: slug + redirect, çerçeve-bağımsız, +50 test) · storefront SEO katmanı (`lib/seo/`: site-url/routes/breadcrumb/
  metadata/json-ld/product-seo, TEK otorite) · JSON-LD (Organization/WebSite+SearchAction/BreadcrumbList/ItemList/Product+Offer) · **PDP generateMetadata YOK'tan VAR** (canonical/OG/
  robots + Product/BreadcrumbList JSON-LD + `notFound()` 404 + React cache) · robots.ts/sitemap.ts/not-found.tsx · kategori-farkında H1+breadcrumb · public `seoTitle/seoDescription`
  (additive) · SlugHistory+Redirect tablo temeli (migration `20260719150000`, gateway/UI'ya bağlı DEĞİL) · a11y breadcrumb semantik düzeltmesi. **KARAR SAPMASI (belgeli, ADR-080):**
  kategori surface = PLP `/products?category=slug` (ayrı `/categories/[slug]` REDDEDİLDİ → soft-404+duplicate önlenir). **KAPSAM DIŞI (brief):** autocomplete/analytics/AI search/
  merchandising/Admin UI · rel prev/next (canonical page-self yeterli). Gate: unit 2070/2070 · `next build` 17 route temiz. Bkz. PHASE_LOG TODO-156D + TD-055…063.
- TODO-156D tamamlama — SlugHistory Write Path & Runtime Redirect Resolution (**DONE · worktree · gate + `next build` doğrulandı; commit/PR/deploy YAPILMADI**). TD-058 + TD-059
  KAPANDI. (1) Write path: ürün/kategori PATCH transaction'ında slug gerçekten değişince `recordSlugChange` (gateway `src/seo/slug-governance.ts`) → SlugHistory (immutable/idempotent)
  + otomatik **301** redirect + **chain collapse** (A→B,B→C ⇒ A→C; back-rename/loop tohumu temizliği) atomik. (2) Runtime: storefront `middleware.ts` 404'ten ÖNCE public
  `GET /public/stores/:slug/redirects` (enabled-only + enum→sayısal allowlist, TTL-cache'li) → SAF `resolveRedirect` (chain/loop guard) → doğru 301/302/307/308; broken/loop/missing → geçiş
  (soft redirect YOK). Path tek kaynak `@commerce-os/utils` productUrlPath/categoryUrlPath. **Sınır (TD-064):** kategori runtime redirect query-param olduğu için hariç (`/categories/[slug]`
  bekliyor); ürün tam çalışır. Gate: **unit 2097/2097** · storefront tsc TAM temiz (TD-056 + latent fixture'lar düzeltildi) · `next build` + `ƒ Middleware` kayıtlı · MIGRATION YOK.
  Docker smoke (gerçek DB PATCH→satır + middleware 301) = deploy adımı (TD-063). Sıradaki: ayrı shipping promptu.
- TODO-156E — Faz 2C-8E: Enterprise Search Autocomplete & Discovery (**DONE · worktree · gate + `next build` + Docker/tarayıcı smoke doğrulandı; commit/PR/merge/deploy YAPILMADI — brief kuralı**).
  ADR-084. **AYRI hafif suggest yolu** (`SearchProvider.suggest`; tam search motorunu çağırmaz — facet/pagination YOK; provider-bağımsız → OpenSearch AYNI imza) · `suggest-query.ts` bounded
  motor (products relevance-sıralı + brands DISTINCT/COUNT + categories breadcrumb'lı recursive-CTE + SAF query-suggestions) · gateway `GET /public/stores/:slug/autocomplete` +
  hafif process-yerel TTL cache (Redis YOK; `x-autocomplete-cache` hit/miss) · `publicAutocompleteResponseSchema` ALLOWLIST (storageKey/internal SIZMAZ) · storefront `/api/autocomplete`
  proxy (gateway URL sunucu-yalnız) · **combobox** (ARIA listbox: aria-expanded/controls/activedescendant, ↑↓/Enter/ESC/Home/End/Tab, hover↔aktif, aria-live) · **debounce 180ms +
  AbortController + RACE guard + client cache** · XSS-güvenli highlight (Türkçe fold) · empty (recent localStorage + popüler placeholder) / results (4 grup + "tüm sonuçlar") / zero-result
  kurtarma · **mobil tam-ekran drawer** (autofocus/scroll-lock/ESC/safe-area) · no-JS native GET fallback korundu. **KAPSAM DIŞI (Çalışma Sınırı):** AI/semantik arama · typo tolerance ·
  synonym · click/impression analytics · ranking motoru · personalization · recent-search sunucu persistence · popüler-arama analytics. Migration YOK; eski search/SSR/SEO DEĞİŞMEDİ.
  Gate: **search-service 87/87 · api-gateway 1081/1081 · storefront 386/386** (yeni: +9 suggest, +14 gateway ac, +23 storefront ac) · tsc temiz · `next build` 18 route (`/api/autocomplete`
  kayıtlı). **Docker smoke (gerçek PG + tarayıcı):** autocomplete/desktop/mobil/klavye(aria-activedescendant + Enter→PDP)/cache(miss→hit)/kategori(breadcrumb)/marka/ürün/allowlist(0
  storageKey sızıntısı)/hata(400/404) HEPSİ PASS. Bkz. PHASE_LOG Faz 2C-8E + TD-066…071.
  **UX Rafinasyonu (2. geçiş):** fiyat KALDIRILDI (keşif ekranı) · ürün kartı ad→marka→kategori + Yeni/Kampanya nötr rozet (categoryLabel route-resolved; Çok Satan=TD-072) · grup sırası
  Öneriler→Kategoriler→Markalar→Ürünler (boş grup gizli) · "tüm sonuçları görüntüle (N)" (SuggestResult.total) · empty "tüm ürünlere göz at" (popüler kategoriler=TD-073) · aktif satır
  belirginleşti (sol ink çubuğu, tek-accent korundu). Gate: 87+1081+392 test · +6 panel testi · tsc temiz · `next build` 18 route · Docker+tarayıcı smoke (fiyat-yok/rozet/grup-sırası/total) PASS.
- TODO-157 — Enterprise Demo Commerce Dataset (**DONE · worktree · seed+backfill+verify canlı doğrulandı; commit/PR/deploy YAPILMADI — brief kuralı**).
  Deterministik demo veri seti (`enterprise-demo` store / `edm-store` scope; production `demo-store` izole). Ölçek: 37 kategori (29 yaprak) ·
  66 marka · 471 ürün · 2.202 varyant · 25 attribute (111 option) · 14 kampanya · 2 depo. Tek sabit tohum → idempotent (2× seed birebir aynı;
  duplicate yok). Search/facet/autocomplete/campaign-badge canlı doğrulandı (`/public/stores/enterprise-demo/search` + `search:backfill`).
  Script'ler: `packages/db/scripts/enterprise/*` + `enterprise-seed.mjs` + `verify-enterprise-seed.mjs`; komutlar `db:seed-enterprise` / `:dry` /
  `db:backfill-enterprise` / `db:verify-enterprise`. Runbook: `docs/runbooks/enterprise-demo-dataset.md`. Karar: ADR-085. Sınırlar: TD-066, TD-067.
  Gate: SAF üretici vitest 43/43 · eslint clean · verify 21/21 · db test 59/59. **PR #94 sonrası:** autocomplete `suggest` ucuyla brand/category/product
  öneri gruplarının final UX smoke'u (runbook §PR #94). PR #94'e bağımlı test EKLENMEDİ (main davranışıyla doğrulandı).
- TODO-158A: Storefront CMS Foundation — Home Experience Platform. (DONE — worktree'de; commit/PR YOK, brief kuralı)
  Polimorfik `HomeSection` (String type + JSON config → yeni tip migration'sız) + 3 çocuk tablo; additive migration
  `20260720120000_add_home_experience`. Gateway: section CRUD + hero/featured/showcase-manuel uçları + MANUAL/DYNAMIC
  showcase motoru (6 kural) + tek public composed `GET /public/stores/:slug/home`. Store-admin "Ana Sayfa Deneyimi"
  modülü (`/home` + `/home/[sectionId]`; section CRUD + yukarı/aşağı + tip-özel çocuk yöneticileri + MediaUpload).
  Storefront ana sayfası tümüyle `/home`'dan beslenir; hardcoded mock KALDIRILDI (fallback: generic hero + gerçek ürün).
  Full-width hero slider (mobil görsel + autoplay). Kart yoğunluğu iyileştirildi. Enterprise seed 8 section ekler.
  Media MEDIA_IN_USE guard'ı hero/featured görsellerini kapsar. Karar ADR-086; sınırlar TD-074…TD-079.
  Gate: gateway 1092 test · store-admin 313 · storefront 392 · contracts 110 · i18n 47 · api-client 23 · lint clean ·
  storefront+store-admin next build PASS · runtime `/home` smoke PASS (8 section, tüm showcase dolu, campaign restore edildi).

## TODO-158B — Enterprise Theme Engine & Design Token Architecture (ADR-087)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Yeni paket: `@commerce-os/theme` — versiyonlu `ThemeDocument` (design/semantic/component katmanları),
  token resolver (döngü/derinlik korumalı), CSS Variable motoru (storefront uyum varları + `--ds-*` zengin
  katman), 10 preset, `buildThemeDocument` (semantic/component otomatik türer), variant kataloğu, custom-CSS
  sanitize, import/export (schemaVersion migrasyon kancası). 99 birim test.
- DB: `Theme` + `ThemeVersion` (migration `20260720140000_add_theme_engine`, additive). Store başına tek
  PUBLISHED; tema başına tek DRAFT + tek PUBLISHED; publish → yeni immutable versiyon + taze draft; rollback.
- Contracts + api-client: theme admin DTO'ları (belge OPAK; gateway doğrular) + `admin.theme.*` + public
  `PublicTheme`.
- Gateway: `src/theme/{data,routes}.ts` (CRUD+versiyon+publish/rollback+import/export+canlı önizleme+preset) +
  inline public `GET /public/stores/:slug/theme` (sunucu-çözülmüş CSS, allowlist). 13 route testi.
- Storefront: `getStoreTheme()` + layout `<style>` `:root[data-theme]` enjeksiyonu → mevcut bileşenler
  (header/footer/hero/button/badge/product-card/category-card/section-title) otomatik yeniden temalanır.
  Varsayılan tema globals.css ile birebir (geriye-uyumlu).
- Store-admin: Theme Studio modülü (`/theme` + `/api/theme/*` BFF, CSRF) — liste, preset'ten oluştur, token
  editörü, istemci-tarafı canlı önizleme, taslak kaydet, yayınla, import/export, rollback.
- Seed: enterprise-demo 1 published "Varsayılan" + 10 preset teması (Theme Studio ilk açılışta dolu).
- Sınırlar: TD-080…TD-086 (çok-app tüketim, @font-face yükleme, editör kapsamı, variant render, iframe
  önizleme, CSS AST sandbox, otomatik tema provizyonu).

## TODO-158C — Enterprise Storefront Experience Redesign Faz 1 (ADR-088)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Theme Engine (ADR-087) üzerine storefront UX/UI/IA/responsive/a11y/perf yükseltmesi; 0 hardcoded design value.
- **Token temeli:** globals.css medya-üzeri semantic katman (`--scrim-*`, `--on-media*`, `--control-*`,
  `--hero-h-*`, `shadow-lg`) + `.scrim-media`/`.on-media`/`.control-*`/`.overlay-scrim`/`.hero-frame` yardımcı
  sınıfları. Tailwind yalnız layout; tasarım değerleri CSS var'dan (tema-override edilebilir).
- **Hero:** sabit yükseklik (`.hero-frame`), container-hizalı `rounded-md` contained banner, belirgin CTA,
  tokenize ok/pagination (dokunmatikte görünür ok), LCP eager/high-priority görsel.
- **Navigation:** `sticky-header` (scroll gölge kondensi), `category-menu` mega menü (FEATURED_CATEGORIES,
  `getNavCategories`+`getHome` cache), mobil kategori akordeonu, tokenize campaign-bar, accent aksiyon/rozet.
- **Homepage:** `home-sections` ritmi/whitespace + tokenize featured overlay + "Tümünü gör"; `home/editorial`
  (`ValueProps`+`EditorialBanner`) fallback'te.
- **Product Card:** kompakt/premium; kampanya/indirim/yeni/TÜKENDİ rozet; tokenize wishlist/quick-view/modal;
  `product-media` placeholder token'landı (ham hex kaldırıldı). PDP benzer-ürünler → `StorefrontProductCard`.
- **Category:** `category-chips` PLP navigasyonu; premium featured grid; mega menü.
- **Footer:** premium IA — marka+social[MOCK] · Alışveriş/Yardım/Kurumsal/Yasal · güven+ödeme şeridi.
- Gate: `next build` PASS + tip geçerli · eslint temiz · 392 storefront + 47 i18n testi yeşil · canlı headless
  render (masaüstü/mobil) PASS. Analiz: `docs/analysis/TODO-158C-storefront-redesign.md`. Sınırlar TD-087…TD-090.

## TODO-159B — Admin Searchable Selectors & Media Library Scalability (ADR-090)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı). **TD-093 ve TD-095 KAPANDI.**
- Amaç: Store Admin'deki sabit limitli SEÇİM yüzeylerini (ürün/kategori/medya) ortak, sunucu-taraflı
  aranabilir bir seçici standardına taşımak ve medya kütüphanesinin sahte sayfalamasını gerçek
  sayfalamayla değiştirmek. (TD-091 envanter matrisi bu fazın kapsamı DIŞINDA — dokunulmadı.)
- **Denetim:** `docs/analysis/TODO-159B-admin-selectors-media-audit.md` — 9 seçim yüzeyi tek tek çıkarıldı
  (uç, limit, arama, sayfalama, seçili kaydın limit dışı davranışı, dataset istemciye alınıyor mu, tenant
  izolasyonu, payload/N+1 riski). Ana bulgu: seçili kayıtlar KAYBOLMUYOR (form id dizisini aynen geri
  gönderiyor) ama GÖRÜNMÜYOR — dolayısıyla kaldırılamıyor ve sayaç görünenden fazlasını söylüyor.
  Tespit edilen sabitler: kampanya/home seçicileri 25 (argümansız çağrı), ürün filtresi + kategori ebeveyn
  seçici 100, medya ucu sabit `take:100` (+ `offset` HİÇ uygulanmıyor), attribute IMAGE önizlemesi 100.
- **Query standardı (contracts):** `adminSelectorQueryBaseSchema` = ADR-089 tabanı + `ids`.
  `?ids=a,b,c` → ÇÖZÜM MODU: arama/sayfalama yok sayılır, yalnız o id'ler (mağaza içinde, en çok
  `ADMIN_SELECTOR_MAX_IDS`=100, istemcinin verdiği sırada) döner. Response ADR-089 meta'sının aynısıdır.
- **Yeni uçlar:** `GET /stores/:id/products/selector` (hafif projeksiyon: id/title/slug/status/sku/imageUrl/
  priceMinor/currency/stockAvailable/variantCount — ürün detay payload'ı TAŞINMAZ; `sku` yalnız tek aktif
  varyantlı üründe dolu) · `GET /stores/:id/categories/selector` (`path` = kökten kendine ad zinciri).
- **Kategori yolu N+1'siz:** sayfadaki satırların ebeveynleri SEVİYE SEVİYE, her seviyede TEK batched
  `findCategoriesByIds` ile çözülür (sorgu sayısı satır sayısına değil ağaç derinliğine bağlı; MAX_DEPTH=10
  hem üst sınır hem döngü guard'ı). Tüm kategori ağacı hiçbir istekte yüklenmez.
- **Paylaşılan SQL:** `buildAdminProductScanSql` — liste (`listProductsAdmin`) ve seçici
  (`listProductSelector`) AYNI filtre/sıralama üretecini kullanır; "listede var, seçicide yok" yapısal
  olarak imkânsız.
- **Ortak UI:** `apps/store-admin-web/components/selector/` — `useSelectorSearch` (300 ms debounce, sayfa,
  loading/empty/filtreli-empty/error+retry, `sourceKey` ile kaynak değişiminde yeniden çekim),
  `useSelectedItems` (batched `ids` çözümü + id-bazlı önbellek; listeden seçim EK İSTEK üretmez),
  `EntitySelectorField` (çipler + kaldır + tümünü kaldır + çözülemeyen id uyarısı),
  `EntitySelectorModal` (listbox deseni: `role="listbox"/"option"`, `aria-selected`,
  `aria-activedescendant`, ArrowUp/Down/Home/End/Enter, `aria-live` durum, Escape + odak yönetimi).
  Sayfalama çubuğu ADR-089'un `DataGridPagination`'ı. Yeni palet/token/hardcoded renk YOK.
- **Taşınan yüzeyler:** kampanya ürün + kategori kapsamı · Home Showcase ürünleri · Home öne çıkan
  kategoriler · ürün formu kategori ataması (★ ana kategori kuralları BİREBİR korundu; `ProductCategoryField`)
  · ürün listesi kategori filtresi (Data Grid araç çubuğuna `kind:"entity"` filtresi eklendi) · kategori
  ebeveyn seçici + liste ebeveyn adı çözümü · attribute IMAGE/FILE önizlemesi (`ids` moduna geçti).
  `ProductForm`'un `categories` prop'u KALDIRILDI (form artık kataloğu prop olarak almaz).
- **Medya (TD-095):** sabit `take:100` kaldırıldı; `page/pageSize/search/context/sortBy/sortOrder/ids` +
  ortak meta (legacy `limit/offset/total` KORUNDU). Sıralama allowlist'i modelde GERÇEKTEN olan alanlarla
  sınırlı (`createdAt`/`altText`/`byteSize`); `mimeType` filtresi eklenMEDİ (her görsel webp'e normalize
  edilir → sahte filtre olurdu). Picker'da context KİLİTLİ (cross-context bağlama guard'ı reddederdi).
  `admin.media.list` imzası `(storeId, query, token)` oldu.
- **Migration:** `20260722190000_add_media_pagination_index` — TAMAMEN ADDITIVE, geri alınabilir:
  `MediaAsset(storeId, createdAt)`. `EXPLAIN` ölçümü (60k sentetik satır, `page=5&pageSize=25`):
  indekssiz Parallel Seq Scan + top-N heapsort 7.524 ms / 1549 buffer → indeksli Index Scan Backward
  0.065 ms / 11 buffer. `context` filtresi de AYNI indeksi kullanıyor → ayrı bileşik index eklenmedi.
- Gate: build + typecheck + lint temiz · 1141 gateway (20 yeni) + 351 store-admin (22 yeni) testi yeşil ·
  `git diff --check` temiz.
- **Canlı doğrulama (enterprise-demo, gerçek Postgres):** 471 ürünün TAMAMI 5 sayfada erişilebilir
  (benzersiz 471/471) · alfabetik son sıradaki ürün arandı, KLAVYE ile seçildi, kaydedildi ve yeniden
  açıldığında korundu · mevcut kampanyanın 13 ürünlük kapsamı düzenleme ekranında eksiksiz göründü ve
  değişiklik yapılmadan kaydedilip yeniden açıldığında aynen kaldı · kategori yolu
  "Elektronik / Bilgisayar Bileşenleri / Ekran Kartı" olarak doğru üretildi · 139 medya kaydıyla
  `page=1`/`page=2` kesişimi 0, birleşim tam; 100'ün ötesindeki görsel `ids` ile çözüldü · başka mağazanın
  ürün/kategori/medya id'leri ÇÖZÜLMEDİ · `pageSize=500` ve `sortBy=hack` 400 döndü · `search=%` 0 kayıt
  (kontrolsüz wildcard yok) · response'ta `storageKey`/`checksum`/`createdBy` sızıntısı YOK.
- Sınırlar: TD-096 (medya araması yalnız `altText`; trigram yok) · TD-097 (picker'da context filtresi yok;
  ayrı Medya Kütüphanesi ekranı yok) · TD-098 (seçici fiyat/stok özeti iki LATERAL join; read-model'e
  bağlanabilir). TD-091'e DOKUNULMADI.

## TODO-159A — Enterprise Admin Data Grid Foundation (ADR-089)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Amaç: Store Admin liste ekranlarını tek tek yamamak yerine ORTAK, yeniden kullanılabilir bir veri
  listeleme standardı kurmak; `/products`'ı bu standarda TAM taşımak.
- **Denetim:** `docs/analysis/TODO-159A-admin-data-grid-audit.md` — 29 liste yüzeyi (tam sayfa + modal)
  tek tek çıkarıldı (veri çekme, SS/CS, arama/filtre/sıralama/sayfalama/URL state/durumlar/toplu seçim/risk).
  Ana bulgu: "sessiz ilk sayfa" defekti — `listProducts()/listCategories()/listCustomers()` argümansız
  çağrılıyor, gateway varsayılanı `limit=50` sessizce uygulanıyordu; 471 ürünlük mağazada kataloğun %89'u
  panelden ERİŞİLEMEZDİ ve kullanıcıya bunun bir sayfa olduğu hiçbir yerde söylenmiyordu.
- **Query standardı (contracts):** `page`/`pageSize`/`search`/`sortBy`/`sortOrder` + modüle özel filtreler;
  `sortBy` her modülde KENDİ allowlist enum'u. `pageSize` üst sınırı (100) SUNUCUDA zorlanır. Response
  meta'sı `items`(data) + `page`/`pageSize`/`totalItems`/`totalPages`; legacy `limit`/`offset`/`total`
  AYNEN korunur (geriye uyumlu). Tek türetme: `buildAdminListPagination` / `resolveAdminListPage`.
- **Gateway:** `listProductsAdmin` (tek parametreli raw SQL → id + total, ardından mevcut `productSelect`
  ile hidrasyon; `LEFT JOIN LATERAL` yalnız fiyat/stok gerektiğinde; LIKE metakarakter kaçırma; sıralama
  kapalı allowlist'ten) + `listProductFilterOptions` (yeni `GET .../products/filter-options`).
  Kategori/müşteri uçlarına arama+durum filtresi+sıralama; sipariş ucuna sıralama.
- **Ortak UI:** `apps/store-admin-web/components/data-grid/` — `useDataGridQuery` (URL state motoru;
  filtre/arama/sıralama/pageSize değişince page 1'e döner, varsayılanlar URL'e yazılmaz), `DataGridToolbar`
  (görünür arama + filtre popover + kaldırılabilir aktif filtre çipleri + sıralama), `DataGrid` (yapışkan
  başlık, `aria-sort` sıralanabilir kolonlar, loading/empty/filtreli-empty/error, opsiyonel satır seçimi),
  `DataGridPagination` (aralık + toplam + önceki/sonraki + doğrudan sayfa + 25/50/100). Mevcut koyu cam kiti
  SARMALANIR; tek yeni token `--dg-header-surface` (yapışkan başlık opaklığı) — bileşende sabit renk yok.
- **Ürünler (tam uygulama):** arama (ad/slug/SKU/barkod/marka/tedarikçi) · filtreler (durum, satış tipi,
  satın alınabilirlik, kategori, marka, tedarikçi, stok durumu, fiyat aralığı) · sıralama (en yeni/en eski,
  ad A–Z/Z–A, fiyat artan/azalan, stok artan/azalan) · sayfalama 25/50/100 + toplam + aralık · tam URL state.
  NOT: modelde ayrı "yayın durumu" kolonu YOK — `status` yayın otoritesidir (uydurma kavram eklenmedi).
- **Ayrıca taşınanlar:** Kategoriler (arama/durum/sıralama/sayfalama) · Müşteriler (arama/durum/üyelik/
  sıralama/sayfalama) · Siparişler (sayfalama + sıralama + ortak sayfalama çubuğu; mevcut zengin filtre
  paneli KORUNDU). Sayfa-türevi özet metrikler kaldırıldı/işaretlendi (sunucu-taraflı sayfalamada yanıltıcı).
- **Migration:** `20260722120000_add_admin_list_indexes` — TAMAMEN ADDITIVE, geri alınabilir:
  `Product(storeId, createdAt)` + `Order(storeId, createdAt)`. `EXPLAIN` ile `Index Scan Backward` doğrulandı.
- Gate: build + typecheck + lint temiz · 1121 gateway (15 yeni) + 329 store-admin (16 yeni) testi yeşil ·
  `git diff --check` temiz. Canlı doğrulama gerçek enterprise-demo (471 ürün): toplam/sayfa/arama/filtre/
  sıralama/allowlist-400/pageSize-tavanı/tenant izolasyonu PASS.
- Sınırlar: TD-091 (envanter matrisi sınırsız) · TD-092 (sayfalamasız koleksiyon uçları) · TD-093 (ürün/
  kategori seçicileri hâlâ 100 ile sınırlı → arama tabanlı seçici gerek) · TD-094 (ILIKE araması için trigram
  indeksi) · TD-095 (medya kütüphanesi sabit 100 + yanıltıcı meta).

## TODO-159C — Inventory Matrix Scalability (ADR-092) — TAMAMLANDI

- Durum: **DONE — commit'e hazır (PR/deploy YAPILMADI).** TD-091 KAPANDI. Analiz:
  `docs/analysis/TODO-159C-inventory-matrix-scalability.md`; karar: ADR-092.
- Uygulanan: `GET /stores/:id/inventory/matrix` sunucu-otoriter (ADR-089 Data Grid). Query
  `page`/`pageSize`(≤100)/`search`/`sortBy`(allowlist)/`sortOrder` + `warehouseId`/`stockStatus`/`reserved`/
  `variantStatus`/`productStatus`; response `warehouse` + sayfa `rows` + `pagination` + sayfadan bağımsız
  `summary`. `listStoreVariants` → tek raw SQL CTE tarama (LIMIT/OFFSET + aggregate + attribute hidrasyonu;
  3 sorgu, N+1 yok). Çift otorite (ADR-076) SQL'de korundu; satır `currentCalc` SAF `computeCalc` ile.
  Ekran `useDataGridQuery` + Data Grid bileşenleri; KPI'lar server `summary`'den. Dashboard özeti de
  `summary`'ye taşındı. Additive `ProductVariant(storeId,status)` indeksi (migration `20260723120000`).
  Değişen dosyalar: contracts, api-client, inventory-engine (data/service/routes), BFF (list-query + matrix
  route + dashboard summary), store-admin `/inventory` page + client, i18n (tr+en), Prisma schema+migration;
  testler: contract + inventory-engine service + store-admin interactions + bff-security.
- Canlı doğrulama (enterprise-demo edm-store, 2.138 varyant): sorgu 5.7 ms, payload 819 KB → 9.7 KB (~84×),
  filtre↔summary paritesi (LOW_STOCK 187), tenant sızıntısı 0, non-default depoda item overlay yok.
- Ertelenen sınırlar: **TD-099** (kategori/marka/tedarikçi facet filtreleri — additive), **TD-100** (stok
  formülü SQL+JS iki dilde; parite testli). Gate'ler yeşil.
- Orijinal planlanan kapsam (referans):
  1. `inventory/matrix` ucuna sayfalama sözleşmesi (`page`/`pageSize` + ortak `adminListPaginationSchema`
     meta'sı; legacy yanıt alanları geriye-uyumlu korunur).
  2. SKU / barkod / ürün adı / varyant başlığı araması (sunucu-taraflı).
  3. Depo (warehouse) filtresi.
  4. Stok durumu filtresi (ör. stokta / tükendi / rezerve).
  5. Düşük stok filtresi (`reorderPoint` otoritesi TODO-152A'da netleşti — yeni kavram üretilmeyecek).
  6. `onHand` / `reserved` / `available` sıralaması (kapalı allowlist).
  7. Tam URL state (ADR-089 `useDataGridQuery`).
  8. 25/50/100 sayfa boyu; `pageSize` tavanı SUNUCUDA zorlanır.
  9. Batched minimum projeksiyon — satır başına ek sorgu YOK.
  10. Tenant izolasyonu (tüm sorgularda `storeId` zorunlu).
  11. N+1 kontrolü (`EXPLAIN` ile doğrulama; gerekiyorsa additive index).
  12. Toplu (bulk) envanter işlemlerinin sayfalamayla uyumluluğu — "görünen sayfa" ile "filtreye uyan tüm
      kayıtlar" ayrımı açıkça tanımlanacak; sessiz kısmi uygulama OLMAYACAK.
  13. TD-091 kapanışı.
- Ön koşul notu (TD-091'den, aynen geçerli): bu yalnız bir UI değişikliği DEĞİLDİR —
  `inventoryStoreMatrixResponseSchema` sayfalama meta'sı taşımıyor, `listStoreVariants` sayfalanabilir
  değil ve TODO-152A'nın "stok izleme merkezi" semantiği tüm satırların aynı anda görünmesine dayanıyor.
  Sözleşme değişikliği bu üçünü BİRLİKTE ele almalı.
- Kapsam dışı: envanter iş mantığı (rezervasyon, hareket ledger'ı, safety/reorder hesapları), depo CRUD,
  yeni stok kavramı, search read-model'e bağlanma (TD-094 ön koşulu).

## TODO-159D — Customer Lists & Wishlist (Customer Lifecycle · ADR-093)

- Durum: **DONE — tüm katmanlar + gate + canlı doğrulama YEŞİL; commit'e hazır (commit/PR/deploy
  YAPILMADI).** Sıra: TODO-159C'den SONRA, TODO-159E'den ÖNCE. Analiz:
  `docs/analysis/TODO-159D-customer-lists-wishlist.md`. Ertelenen sınırlar: TD-101…TD-105.
- Amaç: Favori (wishlist) + alışveriş listelerini ORTAK, tenant-safe `CustomerList` altyapısı üzerine
  kurmak; storefront'ta gerçek (mock olmayan) favori davranışı + Customer Account liste yönetimi.
- Domain: `CustomerList` (storeId, customerId, name, type, visibility, isDefault) + `CustomerListItem`
  (storeId, listId, productId, variantId?, addedAt, note?, quantity?, sortOrder?). Enum `CustomerListType`
  {WISHLIST, SHOPPING_LIST}, `CustomerListVisibility` {PRIVATE}.
- Varsayılan wishlist kuralı: her müşteri+mağaza için TAM bir adet default WISHLIST; ilk erişimde
  lazy-create; silinemez; yeniden adlandırılamaz. Aynı ürün/varyant aynı listeye iki kez eklenemez.
- Guest wishlist: first-party signed cookie (yalnız productId/variantId; fiyat/PII yok; maks. kayıt sınırı;
  bozuk/eski id toleransı). Login'de default wishlist'e idempotent merge + guest temizliği; kısmi hatada
  sessiz veri kaybı YOK. Cart-cookie/claimed-coupons merge deseni referans alınır (körlemesine kopya YOK).
- Favori davranışı: PLP · Home showcase · PDP · Quick View product-card yüzeyleri; gerçek backend durumu;
  optimistic + rollback; idempotent; `aria-pressed` + SR metni; batched status resolver (tüm katalog
  çekilmez, N+1 yok).
- Alışveriş listeleri (Customer Account): liste CRUD + item ekle/kaldır/taşı/kopyala + tekli/toplu sepete
  ekleme. Toplu sepete eklemede stokta olmayan/pasif ürün ATLANIR + sonuç özeti. Canlı ürün/variant/stok
  otoritesi (snapshot'a güvenilmez). Ekranlar: `/account/lists`, `/account/lists/[listId]`, wishlist kısa
  yolu. Liste detayı ADR-089 Data Grid pagination (varsayılan 25; 25/50/100; totalItems/totalPages).
- API (customer-scoped, `requireStore`+`requireCustomer`): list/create/get/rename/delete list · add/remove/
  move/copy item · batch-add-to-cart · wishlist status by ids · merge guest wishlist. Contracts paketinde
  şema. Müşteri yalnız kendi listelerine erişir; ID enumeration sızdırmaz; write öncesi ownership doğrulanır;
  batch üst sınırı sunucuda.
- Store Admin: MVP'de tam düzenleme YOK; müşteri detayında salt-okunur özet (liste sayısı, wishlist öğe
  sayısı, son eklenen tarih).
- Kapsam dışı (MVP): paylaşımlı/public liste, fiyat-düşüş bildirimi, admin liste analitiği.

## TODO-162 — Manual Shipment Status & Fulfillment (Operations · ADR-101)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL).** Operasyonel açık: entegre kargo süreci
  DIŞINDA yönetilen gönderiler `DELIVERED` olamıyordu (yalnız sağlayıcı sync'ten geliyordu) ve
  `order.fulfillmentStatus` kargo durumundan beslenmiyordu → sipariş "teslim edildi" işaretlenemiyordu.
- Çözüm: Operatör manuel durum ilerletme aksiyonu (`POST .../shipping/shipments/:id/status`). Saf kural
  `evaluateManualStatusChange` (monotonic + terminal-kilit + izinli hedef). Hedefler: IN_TRANSIT /
  OUT_FOR_DELIVERY / DELIVERED / DELIVERY_FAILED / RETURNED. Sağlayıcıya ÇAĞRI YOK.
- Karar (kullanıcı): DELIVERED → sipariş de FULFILLED (fulfillmentStatus + status; iptal korunur);
  her gönderide operatör override (terminal-kilit sync çakışmasını önler).
- Gönderi detay sayfasında "Kargo Durumunu İşaretle" (dropdown ileri hedefler + not); ShipmentEvent
  MANUAL_STATUS + OrderEvent ORDER_FULFILLED + AuditLog. Migration 20260723180000 (additive).
- Testler: `shipping-manual-status.test.ts` (8, saf transition).

## TODO-159F — Order Payment Recovery & Collection (Payment · ADR-095…100)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL; commit/PR/deploy YAPILMADI).** Sıra: TODO-159E'den
  SONRA, TODO-160'tan ÖNCE (kritik ödeme açığı). Analiz: `docs/analysis/TODO-159F-order-payment-recovery.md`.
  Ertelenen sınırlar: TD-110…TD-112.
- Migration `20260723170000_add_order_payment_recovery` (ADDITIVE): `PaymentStatus` +PAYMENT_PENDING/
  PARTIALLY_REFUNDED/PAYMENT_FAILED/CANCELLED; `PaymentAttemptType` + `PaymentManualMethod` enum;
  `PaymentAttempt` genişletme (type, nullable provider/mode/providerConfigId→SetNull, idempotencyKey unique,
  paymentUrl, expiresAt, initiatedBy, manual alanları). Backfill YOK.
- Durum makinesi tek otorite `payments/payment-state.ts` (SAF): canStartCollection · isAttemptActive ·
  resolveOrderPaymentTransition (monotonic; PAID sonrası geç FAILED webhook geriye çevirmez).
- Admin: `GET .../orders/:id/payment` (kalan bakiye + uygun sağlayıcılar + aktif deneme + geçmiş) +
  `payment-link` (oluştur) + `payment-link/regenerate` + `payment-link/email` + `manual-payment`. Store-admin
  sipariş detayında `OrderPaymentActions` paneli (link oluştur/kopyala/yenile/gönder + manuel modal).
- Public: opaque `GET/POST /public/pay/:token` (hash + TTL + tek-store; enumeration yok). Storefront
  `/pay/[token]` sayfası (MOCK sandbox tamamlama). E-posta dispatcher no-op (TD-110).
- Idempotency: sipariş başına tek aktif online link (`active-link:{orderId}` + DB unique; P2002→mevcut link).
  Manuel/online yarışı ve çift tahsilat engellenir; overpayment/kısmi manuel reddedilir.
- Shipment guard korunur (PAID/AUTHORIZED); ödeme sonrası yenilemede gönderi aksiyonu açılır.
- Testler: gateway payment-state saf (17) + sales-summary regresyon + store-admin `OrderPaymentActions`
  render (3) + webhook response shape güncellemesi. Tüm suite YEŞİL.

## TODO-159E — Product Reviews & Ratings (Customer Lifecycle · ADR-094)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL; commit/PR/deploy YAPILMADI).** Sıra: TODO-159D'den
  SONRA, TODO-160'tan ÖNCE. Analiz: `docs/analysis/TODO-159E-product-reviews-ratings.md`. Ertelenen
  sınırlar: TD-106…TD-108.
- Migration `20260723160000_add_product_reviews_ratings` (additive; `ProductReviewStatus` enum + `ProductReview`
  + `ProductReviewHelpful` + `ProductRatingAggregate` + index/FK). Gerçek PostgreSQL'de uygulanıp doğrulandı.
- Uygunluk sunucu-otoriter (OrderLine↔Order↔Shipment). Aggregate = projection (tek yazma yolu
  `recomputeAggregate`; yalnız APPROVED; tamsayı toplam → float drift yok). Public projeksiyon ALLOWLIST.
- Moderasyon durum makinesi (PENDING/APPROVED/REJECTED/HIDDEN) + Store Admin `/reviews` + AuditLog. Storefront
  PDP değerlendirme bölümü + Account "Değerlendirmelerim" + 3 kart yüzeyi gerçek batched rating (mock KALDIRILDI).
- Helpful (idempotent, kendi-yorumu engeli, rate-limit). Testler: gateway route (20) + aggregate saf (6) +
  storefront rating-provider (4).
- Eski PLANLANDI kaydı (referans):
- Amaç: Ürünlere yıldız puanı + metin yorum; doğrulanmış alışveriş temelli güven; PDP rating özeti + yorum
  listesi; Store Admin moderasyonu.
- Kapsam (taslak): yıldız + metin yorum · sipariş kalemi bazlı yorum uygunluğu · doğrulanmış alışveriş
  rozeti · tekrar yorum koruması (ürün+müşteri tekil) · moderasyon durumları (PENDING/APPROVED/REJECTED) ·
  Store Admin moderasyon ekranı · PDP rating summary (ortalama + yıldız dağılımı) + yorum listesi · "faydalı
  buldum" · spam/rate-limit · iade/iptal sonrası doğrulama kuralı.
- Sonraki faz: görsel/video yorumu · satıcı yanıtı.
- Kabul kriterleri (taslak): yorum uygunluğu SUNUCU-otoriter (satın alma kanıtı doğrulanır); aynı müşteri
  aynı ürüne tek yorum; onaylanmadan PDP'de görünmez; tüm sorgular tenant-izole.
- **NOT:** TODO-159D görevinde yorum sistemi KODU yazılmaz; yalnız bu planlama kaydı.

## TODO-160 — Influencer Tracking & Attribution (Growth & Monetization)

- Durum: **PLANLANDI — implementasyon YAPILMADI.** Sıra: TODO-159C'den SONRA.
- Amaç: Influencer/iş ortağı kaynaklı trafiği ölçülebilir, tenant-izole ve KVKK/GDPR uyumlu bir attribution
  zinciriyle gelire bağlamak: link → tıklama → oturum → sepet → checkout → sipariş → net gelir.
- Kapsam: Influencer CRUD · kampanya bazlı takip linkleri · güvenli kısa tracking token · click ve unique
  visitor ölçümü · first-party attribution cookie · last-click MVP · cart ve checkout attribution · order
  attribution snapshot · iptal/iade/refund sonrası net gelir düzeltmesi · attribution window · UTM ve kupon
  ilişkilendirmesi · dashboard · click / conversion / order / gross-net revenue / AOV metrikleri · CSV
  export · temel bot/fraud filtreleri · tenant isolation · KVKK/GDPR uyumlu veri saklama.
- **MVP:** Influencer CRUD · Tracking Link CRUD · click tracking · attribution cookie · last-click order
  attribution · temel dashboard · CSV export.
- **Sonraki faz:** Kupon attribution · multi-touch attribution · komisyon ve ödeme · fraud detection ·
  influencer portalı.
- Planlama notları (karar ADR-091, uygulama fazında netleşecek):
  - Attribution SUNUCU-otoriterdir ve sipariş anında SNAPSHOT'lanır; rapor sorgusu sonradan yeniden
    hesaplama YAPMAZ (fiyat/kampanya snapshot deseninin aynısı — bkz. ADR-047/ADR-058).
  - Tracking token tahmin edilemez olmalı; artan id / sayaç sızdırmamalı.
  - Refund/iptal net geliri DÜZELTİR ama gross'u geriye dönük bozmaz — iki metrik ayrı taşınır.
  - Attribution window ve cookie ömrü yapılandırılabilir; varsayılan dokümante edilir.
  - Kişisel veri minimizasyonu (IP/UA saklama politikası + saklama süresi) tasarımın parçasıdır, sonradan
    eklenen bir katman değil.
- Kapsam dışı (MVP): komisyon hesabı/ödeme akışı, influencer self-service portalı, gelişmiş fraud skorlama,
  multi-touch modelleri, dış reklam platformu entegrasyonu.

## TODO-161 — Sponsored Product Management (Growth & Monetization)

- Durum: **PLANLANDI — implementasyon YAPILMADI.** Sıra: TODO-160'tan SONRA (ortak event/attribution
  altyapısından yararlanabilmesi için).
- Amaç: Mağaza içi ürün öne çıkarmayı, organik arama kalitesini bozmadan, kullanıcıya açıkça etiketlenmiş
  ve ölçülebilir bir yerleşim (placement) sistemine dönüştürmek.
- Kapsam: Sponsored Campaign CRUD · sponsorlu ürün seçimi · başlangıç/bitiş tarihi · öncelik ve aktiflik ·
  ana sayfa sponsorlu vitrin · Home Experience (ADR-086) entegrasyonu · search sonuçlarında kontrollü
  sponsorlu slotlar · query ve kategori hedefleme · impression / click / cart / order / revenue ölçümü ·
  kampanya dashboard'u · tenant isolation · stokta olmayan/pasif ürünlerin otomatik elenmesi.
- **Zorunlu kurallar (pazarlıksız — kabul kriteri):**
  1. Kullanıcıya açıkça `Sponsorlu` etiketi gösterilir.
  2. Organik search sıralaması KALICI olarak bozulmaz; sponsorluk organik skoru değiştirmez.
  3. Sponsorlu sonuçlar AYRI slotlarda enjekte edilir.
  4. Aynı ürün sponsorlu ve organik olarak İKİ KEZ gösterilmez (dedupe garantili).
  5. Sponsorlu yoğunluk sınırlıdır (sayfa/sonuç kümesi başına tavan, sunucuda zorlanır).
  6. Arama sorgusuyla İLGİSİZ ürün gösterilmez — sponsorluk alaka eşiğini atlatamaz.
  7. Kampanya bitince ürün organik davranışına döner; kalıcı iz bırakmaz.
- **MVP:** Campaign CRUD · ürün seçimi · tarih/öncelik · homepage showcase · search sponsored slots ·
  sponsorlu etiketi · impression/click/order attribution · temel raporlama.
- **Sonraki faz:** CPC/CPM · bütçe · keyword bidding · placement yönetimi · vendor self-service ·
  faturalandırma.
- Planlama notları (karar ADR-091, uygulama fazında netleşecek):
  - Enjeksiyon, organik sonuç kümesi ÜRETİLDİKTEN SONRA ayrı bir katmanda yapılır; `ProductSearchDocument`
    read-model'inin sıralama skoruna dokunulmaz (ADR-079 read-model-only ilkesi korunur).
  - Ürün seçimi ADR-090'ın ortak seçici sözleşmesini (`products/selector` + `ids` çözüm modu) kullanır —
    yeni bir seçici deseni üretilmez.
  - Ana sayfa vitrini ADR-086'nın polimorfik `HomeSection` altyapısına yeni bir tip olarak oturur
    (migration'sız genişleme; bkz. TD-089).
  - Uygunluk (stok/durum) filtresi RENDER anında uygulanır; süresi dolmuş veya elenmiş ürün için impression
    kaydedilmez.
- Kapsam dışı (MVP): teklif/açık artırma mekaniği, bütçe tüketimi ve faturalandırma, satıcı self-service
  arayüzü, dış reklam ağı entegrasyonu.

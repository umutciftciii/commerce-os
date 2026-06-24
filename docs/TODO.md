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
- TODO-046: Faz 2F Store-admin Product Sales Model UI — sirada (F2D alanlarini urun formuna baglamak).
- TODO-037: Faz 2F Store-admin Product Sales Model UI — F2D product sales model alanlarini store-admin
  urun formuna baglamak; sales mode, price visibility, CTA behavior ve tutarlilik hatalarini Turkce
  gostermek.
- TODO-038: Faz 2G Store-admin Orders UI — F2C order list/detail, place/cancel durumlari ve timeline
  icin BFF + ekran baglama; store-user auth gelene kadar mevcut server-side store context deseniyle
  sinirli kalacak.
- TODO-039: Faz 4 payment — payment provider abstraction, authorization/capture, webhook/idempotency,
  refund durumlari ve `paymentStatus` lifecycle entegrasyonu (TD-025).
- TODO-040: Product inquiry request model — `INQUIRY` urunleri icin tenant-scoped talep kaydi,
  durum akisi, audit/event ve store-admin listeleme.
- TODO-041: Appointment request model — `APPOINTMENT` urunleri icin randevu talebi, musaitlik ve
  store-admin takip akisi.
- TODO-042: WhatsApp redirect/store contact config — store-level public contact/WhatsApp telefon
  ayarlari ve product `whatsappMessageTemplate` render kurali.
- TODO-043: Faz 3 Storefront CTA behavior — product sales model alanlarina gore sepete ekle, fiyat
  sor, randevu al, WhatsApp ve katalog-only davranisini public storefront'ta render etmek.

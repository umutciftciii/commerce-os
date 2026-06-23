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
- TODO-009: API client'a auth/token ve per-domain resource'lari eklemek. (PARTIAL — auth ve admin
  stores/plans eklendi; commerce resource'lari bekliyor)
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
- TODO-027: Faz 2 store-admin-web ve storefront-web gercek API baglama (TD-010, TD-011).
- TODO-028: Production deploy hattI — frontend icin Next.js standalone/production image (non-root,
  optimize layer), Nginx reverse proxy + domain routing + SSL/TLS, ortam bazli env yonetimi ve
  deploy pipeline. Su an compose frontend servisleri `next dev` ile calisir (gelistirme runtime'i);
  production image optimizasyonu ve reverse proxy/SSL bilincli olarak sonraya birakildi (bkz. ADR-019).

# Phase Log

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

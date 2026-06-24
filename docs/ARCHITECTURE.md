# Architecture

## Genel Yapi

commerce-os, TypeScript strict monorepo olarak organize edilir. Workspace pnpm ile yonetilir,
Turborepo build/lint/test orchestration saglar. Faz 0 sonunda runtime backend foundation seviyesindedir:
API gateway, worker, PostgreSQL, Redis, Prisma, queue ve paylasimli paketler calisir durumdadir.

## Apps

- `apps/api-gateway`: Fastify tabanli giris noktasi. Public health/version endpointleri, internal
  DB/Redis health endpointleri, platform admin auth/session endpointleri ve Faz 1A platform admin
  store/plan yonetim endpointleri burada bulunur. Faz 2A ile store-scoped catalog/inventory
  foundation endpointleri de burada yayinlanir (`/stores/:storeId/categories`, `/products`,
  `/variants`, `/inventory`). Route'lar Zod contract'lariyla input validate eder, tutarli JSON hata
  zarfi dondurur ve admin/catalog/inventory mutation'larinda audit log yazar.
- `apps/worker`: Background job runtime foundation'i. Redis/BullMQ tabanli queue islerinin calisacagi
  runtime alanidir.
- `apps/admin-web`: Platform super admin arayuzu (Next.js App Router). Faz 1B'de canli gateway'e
  bagli: kabuk disi login ekrani, oturum guard'li `(app)` route group kabugu (dashboard, stores,
  plans, system health, settings) ve canli stores/plans liste + create/update modallari. Tarayici
  yalnizca ayni-origin BFF route handler'larini (`/api/auth/*`, `/api/admin/*`, `/api/system/*` ve
  app liveness `/api/health`) cagirir; bu handler'lar `packages/api-client` ile gateway'e gider
  (bkz. ADR-017). Tum gorunur metin `packages/i18n`'den Turkce gelir.
- `apps/store-admin-web`: Magaza yoneticisi paneli (Next.js App Router). Faz 2B'de canli gateway'e
  bagli: kabuk disi login ekrani, oturum guard'li `(app)` route group kabugu ve canli
  dashboard/categories/products/variants/inventory ekranlari (orders, customers, marketplace, theme,
  settings hala placeholder). Tarayici yalnizca ayni-origin BFF route handler'larini (`/api/auth/*`,
  `/api/store/context`, `/api/catalog/*`, `/api/dashboard/summary`, `/api/health`) cagirir; bu
  handler'lar `packages/api-client` ile gateway'e gider ve secili mağaza server-side cozulur
  (bkz. ADR-023). Mutating route'lar CSRF korumalidir. Tum gorunur metin `packages/i18n`'den Turkce
  gelir.
- `apps/storefront-web`: Public magaza vitrini (Next.js App Router). Home, product listing, product
  detail, cart ve checkout placeholder sayfalari, tema-hazir layout ve `/api/health`. Multi-tenant
  store slug/domain cozumleyici henuz implement edilmedi; tek demo store render edilir.

Frontend app'ler backend domain logic icermez. Backend ile tek temas noktalari API gateway'dir ve
bu erisim `packages/api-client` uzerinden type-safe sekilde yapilir. admin-web ve store-admin-web bu
erisimi Next route handler'lari (BFF) icinde SUNUCU tarafinda yapar; tarayici dogrudan gateway'e
gitmez. storefront-web hala placeholder seviyesindedir. Next.js build ciktilari `.next/` altindadir.

## Services

- `services/commerce-service`: Product, inventory, customer ve order gibi commerce core davranislari
  icin hedef servis alani.
- `services/checkout-service`: Cart, checkout session ve payment adapter akislari icin hedef servis
  alani.
- `services/storefront-service`: Public storefront okuma ve tema/render foundation'i icin hedef servis
  alani.
- `services/integration-service`: Pazaryeri ve dis sistem entegrasyonlari icin hedef servis alani.
- `services/search-service`: Arama indeksleme ve sorgulama davranislari icin hedef servis alani.
- `services/analytics-service`: Raporlama, metrik ve growth assistant girdileri icin hedef servis
  alani.
- `services/notification-service`: Email, webhook ve bildirim isleri icin hedef servis alani.

## Packages

- `packages/db`: Prisma schema, Prisma client lifecycle, seed ve tenant query pattern'leri.
- `packages/auth`: Platform/store context ve tenant foundation yardimcilari; scrypt tabanli parola
  hash/dogrulama, platform admin guard ve store role guard foundation'i.
- `packages/config`: Environment config parsing ve validation.
- `packages/contracts`: Paylasimli API/domain kontratlari icin hedef paket. Faz 2A ile catalog ve
  inventory Zod schema'lari, request/response tipleri ve stabil hata zarfi tipleri burada tutulur.
- `packages/logger`: Ortak logger factory ve log formatlama.
- `packages/queues`: Redis/BullMQ queue connection ve job naming foundation.
- `packages/integrations-sdk`: Connector gelistirme icin hedef SDK paketi.
- `packages/validators`: Paylasimli validation semalari icin hedef paket.
- `packages/utils`: Genel yardimci fonksiyonlar icin hedef paket.
- `packages/ui`: Paylasimli, light-first premium SaaS tasarim sistemi primitive'leri (Button, Card,
  SectionCard, Badge, Input, PageHeader, EmptyState, StatCard, Container, AppShell, Topbar,
  SidebarNav, `cn`). TypeScript kaynak olarak yayinlanir; app'ler `transpilePackages` ile derler.
  Ortak Tailwind preset'i (`tailwind-preset.cjs`) tasarim token'larini merkezilestirir.
- `packages/api-client`: Frontend app'lerin API gateway ile konustugu type-safe client.
  `API_GATEWAY_URL` env'inden base URL cozer; health/version, internal DB/Redis health (token-gated),
  platform auth, admin store/plan ve Faz 2A catalog/inventory helper'lari sunar. Hatada gateway
  `code`/`status` tasiyan tipli `ApiError` firlatir ve frontend'in tek kanaldan erismesi icin gerekli
  kontrat tiplerini re-export eder. admin-web bu client'i BFF route handler'lari icinde kullanir;
  store-admin-web Faz 2B'de catalog/inventory helper'larini ayni sekilde BFF icinde tuketir.
- `packages/i18n`: Frontend i18n altyapisi. Basit, tipli sozluk sistemi; varsayilan urun dili
  Turkce'dir. Tum gorunur UI metni buradan okunur (hardcoded gorunur metin yasaktir). TypeScript
  kaynak olarak yayinlanir; app'ler `transpilePackages` ile derler. Yeni bagimlilik eklenmez.

### packages/i18n yapisi

```
packages/i18n/
  package.json
  tsconfig.json
  turbo.json
  src/
    index.ts            # defaultLocale, supportedLocales, Locale, getDictionary, getDefaultDictionary,
                        # isSupportedLocale, format, allDictionaries
    locales/
      tr/               # KAYNAK sozluk (tip parite kaynagi)
        common.ts  admin.ts  storeAdmin.ts  storefront.ts
      en/               # tr sekline tip-bagli ayna (key parity zorunlu)
        common.ts  admin.ts  storeAdmin.ts  storefront.ts
  test/
    i18n.test.ts        # defaultLocale, supportedLocales, parity, fallback testleri
```

- `defaultLocale = "tr"`, `supportedLocales = ["tr", "en"]`, `type Locale = "tr" | "en"`.
- `getDictionary(locale?)` desteklenmeyen/eksik locale'de guvenli sekilde Turkce'ye duser.
- EN sozlukleri TR tipine (`AdminDictionary` vb.) bagli yazilir; derleme zamani key parity garantisi.
- Kapsam disi (bilincli): runtime locale switcher, `/tr`-`/en` route prefix, tarayici dil tespiti,
  DB locale alani, Next middleware. Bunlar `docs/TODO.md` altinda takip edilir.

## Frontend Stack

- Next.js App Router, React 19, TypeScript strict.
- Tailwind CSS v3, ortak preset `packages/ui/tailwind-preset.cjs` uzerinden.
- Light-first premium SaaS gorunum; dark theme, neon/AI look ve agir gradient kullanilmaz.
- Accent rengi tek merkezi noktadan yonetilir: ortak preset'teki `brand` skalasi (anchor
  `brand-600 = #9743CD`, olculu menekse). Componentler yalnizca `brand-*` token'i tuketir; CTA,
  aktif durum ve accent rozetlerinde kullanilir, govde metni/genis yuzeyler notr slate kalir
  (bkz. ADR-019).
- Tasarim-first calisma: yeni ana ekranlar once kisa "Claude Design Plan" ile tasarlanir
  (bkz. `docs/PROMPT_RULES.md`).
- i18n-first: varsayilan UI dili Turkce'dir. Tum gorunur UI metni `packages/i18n` sozlugunden gelir;
  bilesenlerde hardcoded gorunur metin yazilmaz. Her app'te locale cozumleme `lib/i18n.ts` icinde tek
  noktada toplanir (su an varsayilan `tr`).

## DB

Baslangicta tek PostgreSQL 16 cluster kullanilir. Prisma schema `packages/db/prisma/schema.prisma`
altindadir. Model platform user, platform session, store, store user, domain, plan, subscription,
audit log, event log, queue job log ve Faz 2A katalog/stok foundation varliklarini icerir.

### Catalog / Inventory Foundation (Faz 2A)

- `Product`: store-scoped urun kaydi; `slug` store bazinda unique, `status` ile arsivleme.
- `ProductVariant`: store-scoped varyant; `sku` store bazinda unique, fiyatlar integer minor unit
  (`priceMinor`, `compareAtMinor`) ve `currency` ile saklanir. `storeId` tenant guard icin bilincli
  denormalized tutulur.
- `ProductCategory`: store-scoped kategori agaci; `slug` store bazinda unique, `parentId` ayni store
  icinde validate edilir.
- `ProductCategoryAssignment`: urun-kategori baglantisi; storeId ile tenant sorgulari ve unique guard
  net tutulur.
- `InventoryItem`: varyant basina tek stok kaydi; `quantityAvailable` DB'de kolon degildir, response'ta
  `quantityOnHand - quantityReserved` olarak hesaplanir.
- `InventoryMovement`: her manual adjustment icin ledger kaydi; `quantityDelta`, reason/reference ve
  actor id metadata'si tutulur.

Bu fazda order, cart, checkout, payment, shipping, marketplace sync, media/images, product options
modeli, import/export ve storefront resolver yoktur. Store-admin UI henuz bu endpointlere baglanmadi.

Platform session raw token saklamaz; secret ile hashlenmis `tokenHash`, `expiresAt`, opsiyonel
revoke/user-agent/ip placeholder alanlari tutulur.

## Auth / Session

Faz 1A/1C'de platform admin auth bearer session token ile calisir. `/auth/platform/login` demo seed
admin parolasini scrypt hash uzerinden dogrular, session TTL'ini `SESSION_TTL_SECONDS` env'inden
alir ve raw token'i yalnizca response'ta dondurur. `/auth/platform/me` ve admin endpointleri token'i
`SESSION_SECRET` ile hashleyip DB'deki aktif session ile eslestirir. `/auth/platform/logout` session'i
revoke eder. Login brute-force korumasi IP + normalize e-posta bazli proses ici sayaçla uygulanir
(`AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`); basarili login ilgili
sayaçlari sifirlar.

### admin-web auth akisi (Faz 1B/1C BFF)

admin-web tarayicisi gateway'e dogrudan gitmez (gateway'de CORS yok ve token istemciye sizdirilmez).
Bunun yerine ayni-origin Next route handler'lari (BFF) kullanilir:

1. Login: tarayici `POST /api/auth/login` cagirir; handler gateway `/auth/platform/login`'i cagirir,
   donen bearer token'i **httpOnly cookie**'ye (`ADMIN_SESSION_COOKIE_NAME`, sameSite=lax, prod'da secure)
   yazar ve istemciye yalnizca kullanici bilgisini doner (token govdede/log'da yer almaz).
2. Oturum dogrulama: `(app)` route group server tarafinda once session cookie varligini kontrol eder;
   mount'ta `GET /api/auth/me` cagirir ve handler cookie token'i ile gateway `/auth/platform/me`'yi
   dogrular. Oturum yoksa `/login`'e yonlendirir; login sayfasi cookie varsa erken panele gider.
3. Admin islemleri: `/api/admin/stores`, `/api/admin/plans` (+`/:id`) handler'lari cookie token'i ile
   gateway admin endpointlerine proxy yapar; gateway hata `code`'u i18n ile Turkce mesaja cevrilir.
   Mutating BFF istekleri double-submit CSRF ister: `/api/auth/csrf` token/header adini verir,
   logout ve stores/plans create/update bu header ile gelir. GET istekleri CSRF istemez.
4. Logout: `POST /api/auth/logout` CSRF dogrular, cookie'yi temizler ve gateway `/auth/platform/logout`
   ile session'i revoke eder.
5. System health: `/api/system/health` public gateway health/version'i proxy'ler; `/api/system/internal`
   yalnizca admin-web sunucu env'inde `INTERNAL_API_TOKEN` tanimliysa timeout kontrollu DB/Redis
   durumunu doner, aksi halde "dahili token gerektirir" durumu gosterilir (secret client'a girmez).

### store-admin-web auth + store context akisi (Faz 2B BFF)

store-admin-web ayni BFF desenini kullanir (ADR-023); store-user auth henuz olmadigi icin demo
asamasinda platform admin login'i vekaleten kullanir:

1. Login: `POST /api/auth/login` gateway platform login'i proxy'ler ve bearer token'i store-admin'e
   ozel **httpOnly cookie**'ye (`STORE_ADMIN_SESSION_COOKIE_NAME`, varsayilan
   `commerce_os_store_admin_session`) yazar; istemciye yalnizca kullanici doner. Cookie adi
   admin-web'den ayridir.
2. Store context: catalog/inventory/dashboard handler'lari her istekte `requireStoreContext` ile
   cookie token'i dogrular ve hedef mağazayi gateway `admin.stores.list`'ten server-side cozer
   (`STORE_ADMIN_DEMO_STORE_SLUG`, varsayilan `demo-store`; yoksa ilk mağaza). `storeId` istemciden
   gelmez; `GET /api/store/context` UI'a yalnizca mağaza meta'sini (id/ad/slug/durum) doner.
3. Katalog islemleri: `/api/catalog/categories`, `/api/catalog/products` (+`/:id`),
   `.../variants` (+`/:id`), `/api/catalog/inventory` (+`/:variantId/adjust`) cozulen `storeId` ve
   cookie token ile gateway store-scoped endpointlerine proxy yapar. `/api/dashboard/summary` urun/
   kategori/stok ozetini server-side hesaplar. Mutating route'lar double-submit CSRF ister
   (`/api/auth/csrf`); GET istemez. Gateway hata `code`'u `storeAdmin.errors` ile Turkce mesaja cevrilir.
4. Logout: `POST /api/auth/logout` CSRF dogrular, cookie'yi temizler, gateway session'i revoke eder.

Host makineden dogrudan Prisma CLI kullanilirken `127.0.0.1` tabanli `DATABASE_URL` gerekir. Root
`db:migrate`, `db:seed` ve `db:verify-seed` scriptleri ise Docker Compose icindeki `api-gateway`
container'inda calisir ve container network servis adlarini kullanir.

## Frontend Docker runtime

Backend (postgres/redis/api-gateway/worker) yaninda uc frontend app de Docker Compose ile ayaga
kalkar: admin-web (3001), store-admin-web (3002), storefront-web (3000). Hepsi backend ile ayni
paylasimli `infra/docker/node.Dockerfile` imajini kullanip `pnpm --filter <app> dev` ile Next.js dev
runtime olarak calisir; her servisin `/api/health` liveness'i compose healthcheck'tir. compose icinde
`API_GATEWAY_URL=http://api-gateway:4000` verilir; admin-web BFF gateway'e container network uzerinden
erisir. `INTERNAL_API_TOKEN` yalnizca admin-web server env'inde tutulur, client bundle'a girmez.
Production-grade image, reverse proxy ve SSL kapsam disidir (bkz. ADR-019, TODO-028).

## Redis ve Queue

Redis, Faz 0'da cache/queue foundation runtime'i olarak konumlanir. BullMQ queue altyapisi
`packages/queues` icinde merkezilesir. Worker uygulamasi background job islemek icin hedef runtime'dir.

## Logger

Ortak logger davranisi `packages/logger` icinde tutulur. Servisler uygulama adi ve context bilgisiyle
logger uretmelidir. Secret, token ve credential degerleri loglanmaz.

## Config

Environment config `packages/config` icinde Zod tabanli validation ile okunur. `.env` lokal gelistirme
icin kullanilir ve commitlenmez. `.env.example` secret olmayan placeholder degerler tasir.

## Contracts

Paylasimli kontratlar `packages/contracts` icinde tutulur. Servisler arasi veri sekli, API response
formatlari ve event payload'lari burada tip guvencesiyle tanimlanmalidir.

## Order / Reservation Domain (Faz 2C)

Faz 2C order/reservation cekirdegi henuz ayri `commerce-service` runtime'ina tasinmadi; mevcut
gateway icinde store-scoped API olarak uygulanir. Veri modeli `Customer`, `CustomerAddress`,
`Order`, `OrderLine`, `OrderAddress`, `OrderEvent`, `InventoryReservation` ve
`OrderNumberCounter` tablolarindan olusur. Her tablo `storeId` tasir ve gateway route'lari explicit
`/stores/:storeId/*` tenant guard'i ile calisir.

Order DRAFT olarak lines ile olusur. Line snapshot'i product/variant aktifken alinan sku, product
title, variant title, minor-unit unit price ve currency degerlerini saklar; katalog fiyat/title
degisikligi mevcut order line'i degistirmez. Place islemi PostgreSQL row-level lock ile
`InventoryItem` satirini kilitler, available stogu kontrol eder, `quantityReserved` artirir ve
`InventoryReservation ACTIVE` olusturur. Cancel aktif reservation'lari `RELEASED` yapar ve reserved
stogu geri dusurur; double cancel idempotenttir. `CONSUMED`, fulfillment fazinda onHand dusumu icin
hazir tutulur.

Bu domain payment capture, cart/checkout session, shipment, invoice, notification ve marketplace
sync davranisini sahiplenmez; bu akislara ait state machine'ler sonraki servis/faz sinirlarinda
eklenecektir.

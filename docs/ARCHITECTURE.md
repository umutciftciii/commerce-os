# Architecture

## Genel Yapi

commerce-os, TypeScript strict monorepo olarak organize edilir. Workspace pnpm ile yonetilir,
Turborepo build/lint/test orchestration saglar. Faz 0 sonunda runtime backend foundation seviyesindedir:
API gateway, worker, PostgreSQL, Redis, Prisma, queue ve paylasimli paketler calisir durumdadir.

## Apps

- `apps/api-gateway`: Fastify tabanli giris noktasi. Public health/version endpointleri, internal
  DB/Redis health endpointleri, platform admin auth/session endpointleri ve Faz 1A platform admin
  store/plan yonetim endpointleri burada bulunur. Route'lar Zod contract'lariyla input validate eder,
  tutarli JSON hata zarfi dondurur ve admin mutation'larinda audit log yazar.
- `apps/worker`: Background job runtime foundation'i. Redis/BullMQ tabanli queue islerinin calisacagi
  runtime alanidir.
- `apps/admin-web`: Platform super admin arayuzu (Next.js App Router). Dashboard, stores, plans,
  system health ve settings shell sayfalari ile `/api/health` route handler. Su an placeholder/empty
  state seviyesinde; gercek veri ve aksiyonlar ileride baglanacak.
- `apps/store-admin-web`: Magaza yoneticisi paneli (Next.js App Router). Dashboard, products, orders,
  inventory, customers, marketplace, theme ve settings shell sayfalari ile `/api/health`.
- `apps/storefront-web`: Public magaza vitrini (Next.js App Router). Home, product listing, product
  detail, cart ve checkout placeholder sayfalari, tema-hazir layout ve `/api/health`. Multi-tenant
  store slug/domain cozumleyici henuz implement edilmedi; tek demo store render edilir.

Frontend app'ler backend domain logic icermez. Backend ile tek temas noktalari API gateway'dir ve
bu erisim `packages/api-client` uzerinden type-safe sekilde yapilir (su an yalnizca health/version
placeholder). Next.js build ciktilari `.next/` altindadir.

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
- `packages/contracts`: Paylasimli API/domain kontratlari icin hedef paket.
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
  `API_GATEWAY_URL` env'inden base URL cozer; health/version, platform auth ve admin store/plan
  helper'lari sunar. Frontend UI henuz bu endpointlere baglanmamistir.
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
- Tasarim-first calisma: yeni ana ekranlar once kisa "Claude Design Plan" ile tasarlanir
  (bkz. `docs/PROMPT_RULES.md`).
- i18n-first: varsayilan UI dili Turkce'dir. Tum gorunur UI metni `packages/i18n` sozlugunden gelir;
  bilesenlerde hardcoded gorunur metin yazilmaz. Her app'te locale cozumleme `lib/i18n.ts` icinde tek
  noktada toplanir (su an varsayilan `tr`).

## DB

Baslangicta tek PostgreSQL 16 cluster kullanilir. Prisma schema `packages/db/prisma/schema.prisma`
altindadir. Model platform user, platform session, store, store user, domain, plan, subscription,
audit log, event log ve queue job log varliklarini icerir.

Platform session raw token saklamaz; secret ile hashlenmis `tokenHash`, `expiresAt`, opsiyonel
revoke/user-agent/ip placeholder alanlari tutulur.

## Auth / Session

Faz 1A'da platform admin auth bearer session token ile calisir. `/auth/platform/login` demo seed
admin parolasini scrypt hash uzerinden dogrular, session TTL'ini `SESSION_TTL_SECONDS` env'inden
alir ve raw token'i yalnizca response'ta dondurur. `/auth/platform/me` ve admin endpointleri token'i
`SESSION_SECRET` ile hashleyip DB'deki aktif session ile eslestirir. `/auth/platform/logout` session'i
revoke eder. Cookie tabanli browser detaylari ileriki UI baglama fazina birakildi; cookie adi env'i
hazir tutulur.

Host makineden dogrudan Prisma CLI kullanilirken `127.0.0.1` tabanli `DATABASE_URL` gerekir. Root
`db:migrate`, `db:seed` ve `db:verify-seed` scriptleri ise Docker Compose icindeki `api-gateway`
container'inda calisir ve container network servis adlarini kullanir.

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

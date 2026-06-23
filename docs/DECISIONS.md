# Decisions

## ADR-001 Monorepo + pnpm + Turborepo

- Durum: ACCEPTED
- Baglam: Backend, servis skeletonlari ve paylasimli paketlerin birlikte gelismesi gerekiyor.
- Karar: Proje monorepo olarak tutulacak; paket yonetimi pnpm, task orchestration Turborepo ile
  yapilacak.
- Sonuc: Paketler arasi kontrat ve build/test akislari tek repoda dogrulanir. Repo disiplini
  bozulmamasi icin workspace sinirlari korunur.

## ADR-002 Microservice-ready sinirli servis mimarisi

- Durum: ACCEPTED
- Baglam: Urun zamanla commerce, checkout, storefront, integration, search ve analytics alanlarina
  ayrilacak; erken asamada runtime karmasasi istenmiyor.
- Karar: Servisler microservice-ready olacak, ancak foundation asamasinda sinirli skeleton ve ortak
  paketlerle ilerleyecek.
- Sonuc: Servis sinirlari bugunden dokumante edilir; runtime ayrisma ihtiyaci dogdukca kontrollu
  genisletilir.

## ADR-003 Baslangicta tek PostgreSQL cluster

- Durum: ACCEPTED
- Baglam: MVP icin operasyonel basitlik ve veri modeli hizli dogrulama oncelikli.
- Karar: Baslangicta tek PostgreSQL cluster ve Prisma schema kullanilacak.
- Sonuc: Servisler kendi alan sinirlarini kod ve dokumanla korur; baska servisin DB alanina direkt
  erisim yasaktir.

## ADR-004 Redis + BullMQ

- Durum: ACCEPTED
- Baglam: Sync, notification, integration ve background job ihtiyaclari erken donemde ortaya cikacak.
- Karar: Queue foundation Redis ve BullMQ uzerine kurulacak.
- Sonuc: Worker runtime'i ve queue package ortak isleme desenlerini tasir; job idempotency fazlara
  gore genisletilir.

## ADR-005 Fastify api-gateway

- Durum: ACCEPTED
- Baglam: API gateway hafif, TypeScript dostu ve test edilebilir olmalidir.
- Karar: API gateway Fastify ile kurulacak.
- Sonuc: Health, version, auth/tenant middleware ve ilerideki route kayitlari Fastify pattern'leriyle
  ilerler.

## ADR-006 Prisma ORM

- Durum: ACCEPTED
- Baglam: PostgreSQL modeli, migration ve TypeScript tip guvencesi icin standart bir ORM gerekiyor.
- Karar: Prisma ORM kullanilacak.
- Sonuc: Schema, migration ve generated client lifecycle'i packages/db icinde tutulur; host/container
  DATABASE_URL farki dokumante edilir.

## ADR-007 Commerce core erken parcalanmayacak

- Durum: ACCEPTED
- Baglam: Product, inventory, customer ve order alanlari erken donemde sik degisecek.
- Karar: Commerce core Faz 2'de tek tutarli domain olarak ele alinacak; erken mikro parcalanmadan
  kacinilacak.
- Sonuc: Gereksiz network/runtime karmasasi ertelenir; servis sinirlari yine dokumante edilir.

## ADR-008 Docs-first proje disiplini

- Durum: ACCEPTED
- Baglam: Fazlar, teknik borclar, kararlar ve AI promptlari hizli degisebilir.
- Karar: Her faz ve anlamli degisiklik docs guncellemesiyle kapanacak.
- Sonuc: Yeni teknik borc TECHNICAL_DEBT.md'ye, yeni karar DECISIONS.md'ye, yeni is TODO.md'ye,
  faz notu PHASE_LOG.md'ye yazilir; docs guncelligi kabul kriteridir.

## ADR-009 Frontend stack: Next.js App Router + React 19 + Tailwind v3

- Durum: ACCEPTED
- Baglam: Uc frontend (super admin, store admin, public storefront) ortak monorepo icinde
  build/test/lint/typecheck uyumlu calismali; light-first premium SaaS gorunumu hedefleniyor.
- Karar: Frontend app'ler Next.js App Router, React 19 ve TypeScript strict ile kurulur. Styling
  Tailwind CSS v3 ile yapilir. Bilerek en yeni surum yerine stabil/iyi dokumante kombinasyon secildi
  (Next 15.5, React 19.2, Tailwind 3.4) cunku foundation'in deterministik build'i onceliklidir.
- Sonuc: App'ler `apps/admin-web`, `apps/store-admin-web`, `apps/storefront-web` olarak eklendi;
  Turborepo build/test grafigine dahil. Backend runtime ve Docker davranisi degismedi.

## ADR-010 Paylasimli UI paketi kaynak-transpile modeliyle

- Durum: ACCEPTED
- Baglam: Tekrar eden markup yerine ortak, light-first design system primitive'leri gerekiyor.
- Karar: `packages/ui` TypeScript/TSX kaynagi olarak yayinlanir (exports -> src). App'ler bu paketi
  `transpilePackages` ile derler. Ortak tasarim token'lari `tailwind-preset.cjs` icinde merkezilesir.
- Sonuc: Asiri soyutlamadan kacinilarak kucuk, yeniden kullanilabilir primitive seti olusturuldu;
  app'ler dist build adimi olmadan kaynaktan derler.

## ADR-011 API client placeholder paketi

- Durum: ACCEPTED
- Baglam: Frontend'in backend ile temasinin tek, type-safe ve genisletilebilir bir kanaldan olmasi
  isteniyor; ancak bu fazda gercek auth/token yok.
- Karar: `packages/api-client` eklenir. Base URL `API_GATEWAY_URL` env'inden cozulur, health/version
  helper'lari `packages/contracts` tipleriyle saglanir. Auth/token sonraki fazda eklenecek.
- Sonuc: Frontend -> gateway erisimi tek yerde toplandi; backend API kontrati bozulmadi.

## ADR-012 Design-first UI calisma kurali

- Durum: ACCEPTED
- Baglam: Placeholder ekranlarin bile tutarli, premium urun kalitesinde durmasi ve dagilmamasi
  gerekiyor.
- Karar: Yeni ana UI ekranlari once kisa "Claude Design Plan" ile tasarlanir, sonra kodlanir.
  Kural `docs/PROMPT_RULES.md` icinde kalici proje kurali olarak tanimlandi.
- Sonuc: UI calismalari tutarli bilgi hiyerarsisi, empty/loading/error yaklasimi ve light-first
  gorsel ton ile ilerler.

## ADR-013 Varsayilan urun dili Turkce

- Durum: ACCEPTED
- Baglam: Urun oncelikli olarak Turkiye pazarina hitap ediyor. Ilk UI foundation tum ekranlari
  Ingilizce uretmisti; UI smoke review'da bunun yanlis varsayilan oldugu tespit edildi.
- Karar: commerce-os'un varsayilan urun dili Turkce'dir. Tum gorunur UI metni (admin, store-admin,
  storefront) varsayilan olarak Turkce render edilir. Ingilizce ikinci dil olarak desteklenir ancak
  varsayilan degildir.
- Sonuc: `packages/i18n` icinde `defaultLocale = "tr"` tanimlandi; uc frontend app varsayilan olarak
  Turkce render eder. Gelecekteki tum UI metni de Turkce varsayilanla uretilecek.

## ADR-014 i18n-first frontend gelistirme (tipli sozluk)

- Durum: ACCEPTED
- Baglam: Sadece bir kerelik Turkce ceviri, ileride dil tutarsizligi ve hardcoded metin borcu
  uretir. Coklu dil ihtiyaci (en az tr/en) bastan ele alinmali; ancak agir bir i18n framework'u bu
  asamada gereksiz runtime ve bagimlilik karmasasi getirir.
- Karar: Frontend i18n-first gelistirilir. Tum gorunur UI metni `packages/i18n` icindeki tipli
  sozlukten okunur; bilesenlerde hardcoded gorunur metin yazmak yasaktir. Basit, bagimliliksiz bir
  sozluk sistemi kurulur: `defaultLocale = "tr"`, `supportedLocales = ["tr", "en"]`,
  `getDictionary(locale)` ve guvenli fallback. EN sozlukleri TR tip sekline bagli yazilarak derleme
  zamani key parity garanti edilir.
- Bilincli kapsam disi: runtime locale switcher, `/tr`-`/en` route prefix, tarayici dil tespiti, DB
  locale alani, Next middleware ve agir i18n framework. Bunlar ileride ayri islerde ele alinacak.
- Sonuc: `packages/i18n` eklendi; uc app tum gorunur metnini sozlukten okur. Yeni dependency
  eklenmedi. tr/en key parity testle korunur.

## ADR-015 Platform admin session token yaklasimi

- Durum: ACCEPTED
- Baglam: Faz 1A'da platform admin login, session dogrulama, logout/revoke ve admin endpoint guard'i
  gerekiyor. OAuth, 2FA, password reset ve browser cookie hardening bu fazin kapsaminda degil.
- Karar: API bearer token donduren session modeli kullanir. Raw token yalnizca login response'unda
  verilir; DB'de `SESSION_SECRET` ile uretilen SHA-256 `tokenHash`, TTL, revoke bilgisi ve opsiyonel
  user-agent/ip placeholder alanlari saklanir. Parola hash/dogrulama Node `crypto.scrypt` ile
  yapilir; ek auth dependency eklenmez.
- Sonuc: Backend endpointleri ve testleri cookie bagimliligi olmadan dogrulanir.
  `ADMIN_AUTH_COOKIE_NAME` ileride browser-cookie baglamina hazir env olarak tutulur. Rate limit,
  cookie security ve refresh token kararlarinin ayrintisi sonraki fazlara birakildi.

## ADR-016 Auth guard ve admin API contract yaklasimi

- Durum: ACCEPTED
- Baglam: Platform admin store/plan endpointleri auth gerektirmeli, ama Faz 1A commerce domain
  logic'i eklememeli. Frontend sonraki fazda bu endpointlere baglanacak.
- Karar: `packages/contracts` icinde basit Zod schema + exported type modeli kullanilir. API gateway
  route'lari platform session'i dogrular, platform admin guard uygular, input'u Zod ile validate eder
  ve tutarli `{ error: { code, message, details } }` zarfi dondurur. Store-scoped helper'lar
  `packages/auth` icinde role sirasi ve access assertion olarak hazir tutulur.
- Sonuc: Faz 1A endpointleri type-safe contract, test ve audit log ile hazir; asiri typed API
  framework veya frontend UI baglama eklenmedi.

## ADR-017 admin-web BFF (Next route handler proxy) + httpOnly cookie token saklama

- Durum: ACCEPTED
- Baglam: Faz 1B'de `apps/admin-web` canli gateway'e baglanmali (login, me, logout, stores, plans,
  system health). Iki kisit var: (1) api-gateway'de CORS yok ve backend Faz 1B'de degistirilmeyecek,
  bu yuzden tarayici dogrudan gateway'e gidemez; (2) gateway bearer token donduruyor ve token UI'a,
  log'a veya client bundle'a dusmemeli. Internal health uclari ayrica `INTERNAL_API_TOKEN` gerektirir.
- Karar: admin-web icinde **Backend-for-Frontend (BFF)** deseni kullanilir. Tarayici yalnizca
  ayni-origin Next route handler'larini (`/api/auth/*`, `/api/admin/*`, `/api/system/*`) cagirir;
  bu handler'lar `packages/api-client` ile gateway'e gider. Platform bearer token login'de **httpOnly
  cookie**'ye SERVER tarafinda yazilir (`ADMIN_AUTH_COOKIE_NAME`, `sameSite=lax`, prod'da `secure`);
  token hicbir zaman yanit govdesine, istemci JS'ine veya log'a dusmez. BFF yalnizca makine-okunur
  hata `code`'unu ve HTTP status'u tarayiciya doner; ham gateway mesaji sizdirilmaz ve UI kodu i18n
  sozluguyle Turkce mesaja cevirir. Internal DB/Redis health icin `INTERNAL_API_TOKEN` yalnizca
  sunucu env'inde tutulur ve `/api/system/internal` server-side proxy ile cagrilir; token yoksa uc
  `available:false` doner ve UI "dahili token gerektirir" durumunu gosterir. localStorage tabanli
  token saklama bilincli olarak REDDEDILDI (XSS yuzeyi daha genis; httpOnly cookie daha guvenli ve
  esit eforda).
- Bilincli kapsam disi (gecici): CSRF token, `secure` cookie matrisi disindaki production hardening,
  refresh token rotasyonu, rate limit, server-side render'da oturum on-yuklemesi. Bunlar TD-015 ve
  TD-017 altinda takip edilir.
- Sonuc: admin-web backend'i degistirmeden, CORS gerektirmeden ve token'i istemciye sizdirmadan canli
  API'ye baglanir. `packages/api-client` tek server->gateway kanali olarak kalir; frontend boundary
  korunur. Runtime smoke ile login/me/logout/revoke, stores/plans CRUD ve health akislari dogrulandi.

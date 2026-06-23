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

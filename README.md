# commerce-os

Backend foundation for a multi-tenant commerce operations SaaS.

## Docs

Project tracking and technical context live under `docs/`:

- `docs/PROJECT_OVERVIEW.md`: urun amaci, MVP konumlandirmasi ve kapsam sinirlari.
- `docs/ROADMAP.md`: fazlar, kapsamlar, kabul kriterleri ve durumlar.
- `docs/TECHNICAL_DEBT.md`: bilinen teknik borclar ve hedef fazlar.
- `docs/DECISIONS.md`: ADR formatinda mimari ve proje karar kayitlari.
- `docs/PHASE_LOG.md`: faz kapanis notlari ve dogrulama ozetleri.
- `docs/TODO.md`: yakin isler.
- `docs/ARCHITECTURE.md`: mevcut mimari, apps/services/packages ve runtime bilesenleri.
- `docs/SERVICE_BOUNDARIES.md`: servis sorumluluklari ve DB erisim sinirlari.
- `docs/PROMPT_RULES.md`: AI calisma ve dokumantasyon kurallari.

## Stack

- TypeScript strict, pnpm, Turborepo
- Fastify API gateway
- Prisma, PostgreSQL 16
- Redis, BullMQ
- Zod config/contracts
- Vitest, ESLint, Prettier

## İlk Kurulum

```bash
cp .env.example .env
pnpm install
pnpm db:generate
```

`.env` dosyası commitlenmez. `.env.example` içindeki değerler local geliştirme placeholder
değerleridir; gerçek secret içermez.

## Docker İle Ayağa Kaldırma

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

Servisler:

- API Gateway: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## DATABASE_URL Farkı

Host makineden `pnpm db:migrate`, `pnpm db:seed` veya Prisma komutları çalışırken:

```bash
DATABASE_URL=postgresql://commerce_os:commerce_os_password@127.0.0.1:5432/commerce_os?schema=public
```

Container içinden çalışan API/worker için Docker Compose servis adı kullanılır:

```bash
DATABASE_URL=postgresql://commerce_os:commerce_os_password@postgres:5432/commerce_os?schema=public
REDIS_URL=redis://redis:6379
```

Bu yüzden `.env.example` host makineye göre `127.0.0.1` içerir; `docker-compose.yml` API ve worker
container ortamında `postgres` ve `redis` servis adlarını override eder.

## Migration ve Seed

Docker Compose ile Postgres ayağa kalktıktan sonra host makineden aşağıdaki root scriptleri çalıştır:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm db:verify-seed
```

Seed idempotent tasarlanmıştır. Arka arkaya çalıştırıldığında demo platform admin, demo plan, demo
store, demo domain ve demo store user kayıtlarını duplicate üretmeden korur.

Not: Root `db:migrate`, `db:seed` ve `db:verify-seed` komutları host makineden tetiklenir; Prisma
işlemi Docker Compose içindeki `api-gateway` container'ında çalışır. Böylece container runtime için
geçerli `postgres` servis adı ve aynı image bağımlılıkları doğrulanır. Host makineden doğrudan Prisma
CLI çalıştırılacaksa `.env` içindeki `127.0.0.1` değerleri kullanılmalıdır.

## Health Endpointleri

Public endpointler:

```bash
curl -i http://localhost:4000/health
curl -i http://localhost:4000/version
```

Internal endpointler token ister:

```bash
curl -i http://localhost:4000/internal/health/db
curl -i -H "Authorization: Bearer replace-with-local-internal-token" \
  http://localhost:4000/internal/health/db
curl -i -H "Authorization: Bearer replace-with-local-internal-token" \
  http://localhost:4000/internal/health/redis
```

Token yokken internal endpointler `401` döner. Geçerli token ile DB ve Redis bağlantısı gerçek
olarak test edilir.

## Scriptler

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm build`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:deploy`
- `pnpm db:seed`
- `pnpm db:verify-seed`

## Project Tracking & Documentation Discipline

Faz kapanisinda docs guncelligi zorunlu kabul kriteridir. Kod, runtime, servis siniri, teknik borc,
karar veya yeni yapilacak is ureten her anlamli degisiklik ilgili `docs/` dosyasina ayni is icinde
yansitilmelidir.

- Yeni teknik borclar `docs/TECHNICAL_DEBT.md` dosyasina eklenir.
- Yeni mimari kararlar `docs/DECISIONS.md` dosyasina ADR olarak yazilir.
- Yeni takip isleri `docs/TODO.md` dosyasina eklenir.
- Faz kapanis notlari `docs/PHASE_LOG.md` dosyasina yazilir.
- Servis siniri veya mimari degisikligi `docs/ARCHITECTURE.md` ve
  `docs/SERVICE_BOUNDARIES.md` dosyalarina yansitilir.
- Prompt ve AI calisma disiplini `docs/PROMPT_RULES.md` kurallarina uyar.
- Secret, token, credential veya gercek musteri verisi docs icine yazilmaz.

## Tenant Query Pattern

Store-scoped reads and writes must receive a `TenantContext` from the auth package and include
`storeId` in the Prisma `where` clause. Platform-level operations must use `PlatformContext` and
avoid store-scoped writes unless explicitly operating on a target store.

## Faz 0 Kapanış Kabul Kriterleri

- Docker Compose ile Postgres, Redis, API Gateway ve Worker ayağa kalkar.
- API Gateway `localhost:4000` üzerinden erişilebilir.
- Compose healthcheckleri Postgres, Redis, API ve worker için sağlıklı duruma geçer.
- `pnpm db:migrate` canlı Postgres üzerinde başarılı olur.
- `pnpm db:seed` canlı Postgres üzerinde iki kez başarılı olur.
- `pnpm db:verify-seed` demo kayıtlarının varlığını ve duplicate olmadığını doğrular.
- `/health` ve `/version` public çalışır.
- Internal DB/Redis health endpointleri token yokken `401`, token varken `200` döner.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:unit`, `pnpm test:integration`,
  `pnpm build`, `pnpm db:generate` başarılıdır.
- `docs/` proje takip dokumanlari gunceldir ve faz kapanis notu yazilmistir.

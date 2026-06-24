# commerce-os

Multi-tenant commerce operations SaaS — backend foundation plus the frontend admin/store/storefront
UI foundation.

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
- Frontend: Next.js App Router (15), React 19, Tailwind CSS 3, shared `@commerce-os/ui` design system
- i18n: shared `@commerce-os/i18n` typed dictionary, default product language **Turkish** (`tr`)

## Frontend Apps

Light-first, premium SaaS UI foundation. **Varsayilan UI dili Turkce'dir** (`defaultLocale = "tr"`).
Tum gorunur UI metni `@commerce-os/i18n` sozlugunden okunur; bilesenlerde hardcoded gorunur metin
yazilmaz (bkz. ADR-013, ADR-014, `docs/PROMPT_RULES.md`). Ingilizce (`en`) ikinci dil olarak tam key
parity ile saglanir ancak varsayilan degildir; runtime locale switcher / URL locale stratejisi bu
asamada kapsam disidir.

`apps/admin-web` is wired to the live API gateway (Faz 1B): platform admin login, session, and live
stores/plans/system-health (see "Faz 1B admin-web" below). `store-admin-web` and `storefront-web`
remain placeholders/empty states — no commerce business logic, no payment. Frontends talk to the
backend only through the API gateway via `@commerce-os/api-client`; admin-web does this server-side
inside Next route handlers (BFF), the browser never calls the gateway directly.

- `apps/admin-web` — platform super admin (dashboard, stores, plans, system health, settings). `pnpm dev:admin` → `http://localhost:3001`
- `apps/store-admin-web` — store manager panel (dashboard, products, orders, inventory, customers, marketplace, theme, settings). `pnpm dev:store-admin` → `http://localhost:3002`
- `apps/storefront-web` — public demo storefront (home, products, product detail, cart, checkout). `pnpm dev:storefront` → `http://localhost:3000`

Each app exposes its own `/api/health` route handler:

```bash
curl http://localhost:3001/api/health   # admin-web
curl http://localhost:3002/api/health   # store-admin-web
curl http://localhost:3000/api/health   # storefront-web
```

Each returns `200` with `{ "status": "ok", "service": "<app>", "timestamp": "…" }`.

Shared UI primitives live in `packages/ui` (Button, Card, SectionCard, Badge, Input, PageHeader,
EmptyState, StatCard, AppShell, Topbar, SidebarNav, UserChip, …) with a shared Tailwind preset. New
UI screens follow the design-first rule in `docs/PROMPT_RULES.md`.

Visible UI copy lives in `packages/i18n` as a typed dictionary (`tr` source + `en` mirror, full key
parity). Default locale is Turkish; `getDictionary(locale)` resolves a dictionary and falls back
safely to Turkish. Each app centralises locale resolution in its `lib/i18n.ts`. See ADR-013/ADR-014
and the i18n rule in `docs/PROMPT_RULES.md`.

## İlk Kurulum

```bash
cp .env.example .env
pnpm install
pnpm db:generate
```

`.env` dosyası commitlenmez. `.env.example` içindeki değerler local geliştirme placeholder
değerleridir; gerçek secret içermez.

Auth/session icin zorunlu local env alanlari:

```bash
SESSION_SECRET=replace-with-local-session-secret-32-chars-min
SESSION_TTL_SECONDS=28800
PASSWORD_HASH_PEPPER=
AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5
ADMIN_SESSION_COOKIE_NAME=commerce_os_admin_session
ADMIN_AUTH_COOKIE_NAME=commerce_os_admin_session
ADMIN_CSRF_COOKIE_NAME=commerce_os_admin_csrf
ADMIN_CSRF_HEADER_NAME=x-commerce-os-csrf
ADMIN_COOKIE_SECURE=false
ADMIN_COOKIE_SAME_SITE=lax
```

`SESSION_SECRET` gercek ortamlarda guclu ve ortam disindan yonetilen bir secret olmalidir. Repo'ya
gercek secret yazilmaz.

## Docker İle Ayağa Kaldırma

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

Backend servisleri:

- API Gateway: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Worker: arka plan (port yok)

Frontend web app servisleri (Next.js dev runtime, backend ile aynı `node.Dockerfile` imajı):

- `admin-web` → `http://localhost:3001`
- `store-admin-web` → `http://localhost:3002`
- `storefront-web` → `http://localhost:3000`

Üç frontend app de aynı imaj + `pnpm --filter <app> dev` target'ı ile çalışır; her birinin
kendi `/api/health` liveness endpoint'i compose healthcheck olarak kullanılır. `store-admin-web`
ve `storefront-web` henüz canlı API'ye bağlı değildir, shell olarak ayağa kalkar (bkz. TD-010/011).

### Frontend env ayrımı (host vs compose)

`API_GATEWAY_URL` ortama göre ayrışır:

- **Host / `pnpm dev:*`**: `http://localhost:4000` (`.env.example` varsayılanı).
- **Compose içi**: `http://api-gateway:4000` — frontend servislerine `environment` ile verilir;
  böylece admin-web BFF route handler'ları gateway'e container network üzerinden erişir.

`admin-web` compose servisine `.env.example` `env_file` olarak verilir; `INTERNAL_API_TOKEN`
**yalnızca server env**'inde tutulur (BFF internal health proxy için), `NEXT_PUBLIC` ile
taşınmadığından client bundle'a girmez. `store-admin-web`/`storefront-web` secret almaz; yalnızca
`API_GATEWAY_URL` alır.

> Kubernetes / Nginx reverse proxy / SSL / production image optimizasyonu kapsam dışıdır
> (bkz. `docs/TODO.md`, `docs/DECISIONS.md` ADR-019).

### Docker cache / image temizliği (güvenli)

Disk şişerse yalnızca **kullanılmayan** build cache ve dangling image temizlenir; named volume
(özellikle `docker_postgres-data`) ve çalışan container'lara dokunulmaz:

```bash
docker builder prune -f    # kullanılmayan build cache
docker image prune -f      # yalnızca dangling (tag'siz) image — -a DEĞİL
```

> `docker volume prune`, `docker system prune -a --volumes` ve `docker container prune`
> (diğer projelerin stopped container'larını da silebilir) bilinçli olarak **kullanılmaz**.
> Temizlik öncesi/sonrası `docker system df` ve `docker compose ... ps` ile durum doğrulanır.

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

Local demo platform admin:

- Email: `platform-admin@example.local`
- Password: `local-admin-password`

Seed bu parolayi scrypt ile hashler; raw parola DB'ye yazilmaz.

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

## Faz 1A Auth ve Admin API

Platform admin session endpointleri bearer token kullanir. Login response'u raw token'i bir kez
dondurur; DB'de yalnizca secret ile hashlenmis `tokenHash` tutulur. Login brute-force korumasi
varsayilan olarak IP + e-posta bazli 60 saniye / 5 deneme penceresiyle calisir; limit asilinca
`429 AUTH_RATE_LIMITED` doner. Degerler `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS` ve
`AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS` ile ayarlanir.

```bash
curl -i -X POST http://localhost:4000/auth/platform/login \
  -H "content-type: application/json" \
  -d '{"email":"platform-admin@example.local","password":"local-admin-password"}'

curl -i http://localhost:4000/auth/platform/me \
  -H "Authorization: Bearer <token>"

curl -i -X POST http://localhost:4000/auth/platform/logout \
  -H "Authorization: Bearer <token>"
```

Platform admin token gerektiren endpointler:

- `GET /admin/stores`
- `POST /admin/stores`
- `GET /admin/stores/:id`
- `PATCH /admin/stores/:id`
- `GET /admin/plans`
- `POST /admin/plans`
- `GET /admin/plans/:id`
- `PATCH /admin/plans/:id`

`GET /admin/stores` ve `GET /admin/stores/:id` response'lari `domain: string | null` alanini dondurur.
Bu alan StoreDomain tablosundaki ilk sistem/primary domain bilgisini admin UI'da gostermek icindir.

## Faz 2A Catalog + Inventory API

Faz 2A store-admin UI baglamaz; API foundation platform admin bearer token ile test edilir. Store-user
auth tamamlanana kadar store-scoped endpointler explicit `storeId` path parametresi ve platform admin
session guard'i kullanir.

Endpointler:

- `GET|POST /stores/:storeId/categories`
- `GET|PATCH /stores/:storeId/categories/:categoryId`
- `GET|POST /stores/:storeId/products`
- `GET|PATCH /stores/:storeId/products/:productId`
- `GET|POST /stores/:storeId/products/:productId/variants`
- `PATCH /stores/:storeId/products/:productId/variants/:variantId`
- `GET /stores/:storeId/inventory`
- `GET /stores/:storeId/inventory/:variantId`
- `POST /stores/:storeId/inventory/:variantId/adjust`

Catalog smoke ornegi:

```bash
TOKEN="<platform-admin-token>"
STORE_ID="<demo-store-id>"

curl -i "http://localhost:4000/stores/$STORE_ID/categories" \
  -H "Authorization: Bearer $TOKEN"

curl -i -X POST "http://localhost:4000/stores/$STORE_ID/categories" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Smoke Category","slug":"smoke-category"}'

curl -i -X POST "http://localhost:4000/stores/$STORE_ID/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Smoke Product","slug":"smoke-product","status":"ACTIVE"}'

curl -i -X POST "http://localhost:4000/stores/$STORE_ID/products/<product-id>/variants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Default","sku":"SMOKE-SKU-1","priceMinor":1000,"currency":"TRY"}'

curl -i -X POST "http://localhost:4000/stores/$STORE_ID/inventory/<variant-id>/adjust" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"quantityDelta":5,"reason":"smoke"}'
```

Fiyat alanlari integer minor unit'tir (`priceMinor`, `compareAtMinor`). Variant create edildiginde
inventory item otomatik olusur. Inventory adjustment `InventoryMovement` yazar; adjustment sonucu
stok negatif olacaksa `400 INVALID_INVENTORY_ADJUSTMENT` doner. Store bazli duplicate slug/SKU
durumlari stabil `409` hata kodlariyla doner (`PRODUCT_SLUG_EXISTS`, `CATEGORY_SLUG_EXISTS`,
`VARIANT_SKU_EXISTS`).

Hatalar su zarfta doner:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized."
  }
}
```

## Faz 1B admin-web (canli yonetim konsolu)

`apps/admin-web` canli gateway'e baglidir. Tarayici gateway'e dogrudan gitmez; ayni-origin Next route
handler'lari (BFF) gateway'i SUNUCU tarafinda cagirir ve platform bearer token'i httpOnly cookie'de
saklar (bkz. ADR-017). Token UI'da gosterilmez, log'a/console'a yazilmaz, client bundle'a girmez.
Mutating BFF route'lari (logout, stores/plans create/update) double-submit CSRF ister; login CSRF
disinda tutulur ve gateway rate limit ile korunur.

Yerel calistirma:

```bash
# 1) Backend runtime (postgres + redis + api-gateway + worker)
docker compose -f infra/docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed

# 2) admin-web dev (gateway adresi varsayilan http://localhost:4000)
API_GATEWAY_URL=http://localhost:4000 pnpm dev:admin   # http://localhost:3001
```

- Giris: `http://localhost:3001/login` → seed admin (`platform-admin@example.local` /
  `local-admin-password`). Basarili giriste panele yonlendirir; oturum varsa `/login` otomatik panele
  gider; "Cikis yap" oturumu sonlandirir (gateway session revoke).
- Mağazalar ve Paketler sayfalari canli listeler; create/update modallari calisir, basarida liste
  yenilenir. Mağaza listesinde domain kolonu gosterilir. Duplicate slug/kod ve validation hatalari
  kullanici dostu Turkce gosterilir.
- Sistem Sağlığı sayfasi public `/health` + `/version`'i canli gosterir. Dahili DB/Redis durumu icin
  admin-web SUNUCU env'ine gateway ile ayni `INTERNAL_API_TOKEN` verilirse canli baglanir; verilmezse
  "dahili token gerektirir" durumu gosterilir (secret istemciye sizmaz):

```bash
INTERNAL_API_TOKEN=<gateway-ile-ayni-token> API_GATEWAY_URL=http://localhost:4000 pnpm dev:admin
```

## Scriptler

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm build`
- `pnpm dev:admin`
- `pnpm dev:store-admin`
- `pnpm dev:storefront`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:deploy`
- `pnpm db:seed`
- `pnpm db:verify-seed`
- `pnpm db:cleanup-smoke` — yalnizca development/test ortaminda `smoke-`, `rev-`, `test-` prefiksli
  dev store/plan kayitlarini temizler; production/staging'de calismayi reddeder.

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

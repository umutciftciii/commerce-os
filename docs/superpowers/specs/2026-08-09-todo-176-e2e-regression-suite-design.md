# TODO-176 — Automated Storefront E2E Regression Suite (Design)

**Tarih:** 2026-08-09
**Durum:** Approved (brainstorming) → implementation plan aşamasına geçiliyor
**Kapsam:** PR1 (bu spec). PR2 senaryoları ayrı planlanacak.

## 1. Amaç ve karar

Manuel browser smoke'u release gate'in **ana** mekanizması olmaktan çıkarıp, repo-içi
kalıcı Playwright E2E regression suite kurmak. Bu suite:

- PR/CI'da gerçek browser regression gate'i olur (merge-blocking).
- Deploy sonrası target environment'a karşı (güvenli, non-destructive) smoke koşabilir.
- Kritik kullanıcı akışlarının kalıcı, deterministik doğrulamasıdır.

**ADR kararı (bu iş kapsamında yazılacak):**
> Playwright E2E suite is the source-of-truth automated browser release gate;
> manual browser smoke is exploratory/complementary, not the primary regression mechanism.

## 2. Mevcut durum (audit)

- **Playwright yok.** Yalnız Vitest unit/integration: `tests/unit`, `tests/integration`,
  `apps/*/test`, `packages/*/test`.
- **CI** (`.github/workflows/ci.yml`): `install → db:generate → build → lint → test`.
  Browser gate yok. Concurrency-cancel var.
- **Stack (Docker, `infra/docker/docker-compose.yml`):** storefront `:3000`,
  store-admin `:3002`, admin `:3001`, api-gateway `:4000`, postgres `:5432`, redis, worker.
  Healthcheck'ler `/api/health` (web) ve `:4000` üzerinden mevcut.
- **Fixture/cleanup:** `packages/db/scripts/cleanup-smoke.ts` — prefix bazlı
  (`smoke-`, `test-`, `rev-`, …), `APP_ENV` guard'lı (`development`/`test` dışında red).
- **Storefront auth:** customer session httpOnly cookie **`commerce_os_customer_session`**
  (ham token; gateway sha256 → `CustomerSession.tokenHash`). Login = client form
  (`components/auth/login-form.tsx`) → server action cookie set eder →
  `/account` (veya `?next=`) redirect. Cart ayrı, cookie-tabanlı.
- **Default seed** yalnız platform-admin içerir; storefront **test müşterisi yok**.

## 3. Kararlar (onaylı)

1. **Konum:** kök `tests/e2e/` + kökte `playwright.config.ts`.
2. **Fixture baseline:** dedike deterministik `e2e-seed.mjs` (izole `e2e-store`, `e2e-` prefix);
   write-path verisi test içinde üretilir; sonda prefix cleanup. Enterprise-demo'ya dokunulmaz.
3. **Auth:** gerçek UI login → `storageState`. Bypass/sahte session yok.
4. **Fazlama:** PR1 = altyapı + auth + 8 çekirdek smoke + CI gate + docs. PR2 = geniş regression.
5. **CI gate:** ayrı **`.github/workflows/e2e.yml`**, kendi **required status check**'i.
6. **Seed minimalizmi:** PR1 e2e seed **yalnız ilk 8 smoke senaryosunun** ihtiyacını üretir.
   Shopping-balance/return/refund gibi PR2 datası **şimdiden seed'e eklenmez**.
7. **Prod ayrımı:** CI/staging full write-path E2E ile production post-deploy smoke **ayrı**.
   Production'da **e2e-store seed/cleanup veya write-fixture yok**; ayrı `@prod-smoke`
   profili yalnız güvenli/non-destructive (anonim, read-only) kontroller çalıştırır.

## 4. Mimari

### 4.1 Dizin yapısı
```
tests/e2e/
  playwright/            # (config kökte; bu klasör test+destek)
  fixtures/
    test-base.ts         # custom fixtures (storageState, api client, prefix helper)
    api.ts               # gateway REST helper (write-path veri üretimi/temizliği)
    ids.ts               # deterministik e2e kimlikleri (store slug, customer email, sku'lar)
  setup/
    auth.setup.ts        # gerçek UI login → .auth/customer.json storageState
  smoke/                 # @smoke — desktop Chromium çekirdek akışlar (8 senaryo)
    *.spec.ts
  responsive/            # @responsive — küçük kritik subset, çoklu viewport
    *.spec.ts
  prod-smoke/            # @prod-smoke — anonim, read-only, fixtures/cleanup YOK
    *.spec.ts
  .auth/                 # storageState (git-ignore)
playwright.config.ts     # kökte
```

### 4.2 `playwright.config.ts` projeleri
- **`setup`** — `setup/auth.setup.ts`; storageState üretir. `smoke`/`responsive` bu projeye `dependencies` ile bağlıdır.
- **`smoke`** — Desktop Chromium (1280×800); `storageState: .auth/customer.json`; `grep: /@smoke/`.
- **`responsive`** — `grep: /@responsive/`; viewport matrisi **375 / 768 / 1024 / 1440**; yalnız responsive-critical subset (küçük). CI maliyetini şişirmemek için ana functional akış burada tekrarlanmaz.
- **`prod-smoke`** — `grep: /@prod-smoke/`; **setup dependency YOK**, storageState YOK, seed/cleanup YOK; anonim. Post-deploy target'a `E2E_STOREFRONT_URL` ile koşar.

Environment-aware `baseURL` / URL'ler `.env` / process.env'den:
`E2E_STOREFRONT_URL` (default `http://localhost:3000`), `E2E_STORE_ADMIN_URL` (`:3002`),
`E2E_GATEWAY_URL` (`:4000`). **URL hardcode yok.** Aynı config local/CI/staging/prod.

Reporter: `list` + `html` + (CI'da) `github`. `retries: process.env.CI ? 2 : 0`.
`use`: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'on-first-retry'`.
`forbidOnly: !!process.env.CI`. `workers`: CI'da sınırlı (ör. 2) determinism için.

### 4.3 Auth (storageState)
`auth.setup.ts`: `E2E_STOREFRONT_URL/auth/login` → email+password (seed'deki test müşterisi)
→ submit → `/account` redirect'ini `expect(page).toHaveURL` ile bekle →
`page.context().storageState({ path: '.auth/customer.json' })`. Bu **gerçek** oturum
cookie'sini (`commerce_os_customer_session`) yakalar. Prod profili bu setup'ı kullanmaz.

### 4.4 Fixture / seed
- **`packages/db/scripts/e2e-seed.mjs`** (yeni), `db:seed-e2e` script'i (docker exec).
  Idempotent (upsert; retry duplicate üretmez). Üretilenler — **yalnız 8 smoke için**:
  - `e2e-store` (slug `e2e-store`, `e2e-` prefix, `APP_ENV=development/test`).
  - Test müşterisi: `e2e-customer@example.test` + sabit parola (hash `@commerce-os/auth`).
  - Deterministik ürünler/varyantlar + stok (variant seçimi + add-to-cart + PDP için;
    en az bir çok-varyantlı ürün, bilinen SKU/fiyat).
  - Bir kupon (apply/remove + repricing senaryosu için; bilinen kod + indirim).
  - **Bir önceden var olan sipariş** (order list/detail senaryosu için; ödeme-yöntemine
    özel PR2 datası içermez).
  - **PR2 datası (shopping-balance lot, return, refund) EKLENMEZ.**
- **Write-path izolasyon:** cart/checkout testleri kendi geçici verisini test içinde üretir.
  Test/suite sonunda `e2e-`/`test-` prefix cleanup (`cleanup-smoke` mekanizması;
  gerekiyorsa `e2e-` prefix eklenir). `APP_ENV` guard korunur → prod'da asla çalışmaz.
- Testler birbirine bağımlı değil; her biri kendi ön-koşulunu kurar; retry duplicate üretmez.

### 4.5 Selectors
- Kırılgan CSS/layout selector yok. Kritik UI'lara **`data-testid`** veya semantic locator
  (`getByRole`) eklenir: cart badge, PDP variant seçici + add-to-cart, coupon input/apply/remove,
  order list satırı/detay, login form alanları. Text selector yalnız copy gerçekten ürün
  contract'ıysa (`getByRole('button', { name })`).

## 5. Smoke senaryoları (PR1 — 8 çekirdek, `@smoke`)

Her senaryo iş-sonucu assert eder (yalnız "açıldı" değil): DB-backed persistence, doğru
variant/qty/fiyat/cart count, refresh sonrası state, raw enum yok, console/runtime error yok.

1. **Auth / login / session** — login → `/account`, oturumlu içerik; storageState reuse doğrulaması.
2. **PDP variant seçimi** — çok-varyantlı üründe variant seç → doğru fiyat/SKU/görsel reaktif.
3. **Add-to-cart** — seçili variant + qty sepete eklenir; sepette doğru satır/variant/fiyat.
4. **Header cart badge** — ekleme sonrası badge count artışı; doğru toplam adet.
5. **Cart refresh / persistence** — reload sonrası sepet aynı (cookie-backed); satır/qty korunur.
6. **Coupon apply/remove + repricing** — kod uygula → indirim + yeni toplam; kaldır → eski toplam.
7. **Cart → checkout canonical cart identity** — sepet ile checkout'taki sepet aynı (satır/qty/fiyat/toplam eşit).
8. **Order list / detail** — seed order `/account` sipariş listesinde; detay doğru kalemler/tutar, raw enum yok.

**PR2 (bu spec dışı):** reorder/BUG-CART-006 invariant (`reorder == /cart == checkout`),
shopping-balance-only ödeme, mixed balance+external, cancellation, return,
refund ORIGINAL_PAYMENT, refund SHOPPING_BALANCE, İadelerim, Alışveriş Bakiyem,
wishlist, product review, order-experience review.

## 6. Prod post-deploy smoke (`@prod-smoke`)

- **Anonim, read-only, non-destructive.** Fixture/seed/cleanup/login YOK.
- **Explicit target env** (rastgele mevcut ürüne bağlanmaz — silent fallback yasak):
  - `E2E_STOREFRONT_URL` — production storefront origin.
  - `E2E_PROD_PRODUCT_SLUG` — PDP kontrolü için bilinen, stabil ürün slug'ı.
  - `E2E_PROD_CATEGORY_SLUG` (opsiyonel) — PLP kontrolü için bilinen kategori slug'ı.
  - `E2E_PROD_SEARCH_TERM` (opsiyonel) — arama kontrolü için deterministik terim.
- **Fallback yok / fail-loud degrade:** Bir target env tanımsızsa o kontrol **başka
  ürüne/kategoriye silent fallback yapmaz**. Politika: opsiyonel env tanımsızsa ilgili
  kontrol `test.skip(condition)` ile **açıkça atlanır ve raporda görünür** (prod kapsamını
  güvenli minimuma düşürür); **zorunlu** `E2E_PROD_PRODUCT_SLUG` yoksa prod-smoke run'ı
  **açık config error** ile durur (yeşil vermez). Bu, "PDP smoke koştu" yanılsamasını önler.
- Kapsam (yalnız explicit target'lar üzerinden): storefront home yüklenir; `E2E_PROD_CATEGORY_SLUG`
  varsa PLP kart + fiyat; `E2E_PROD_PRODUCT_SLUG` üzerinden PDP variant render + fiyat;
  `E2E_PROD_SEARCH_TERM` varsa arama çalışır; raw enum yok; console/runtime error yok.
- Post-deploy: `pnpm e2e:prod-smoke` (yalnız `prod-smoke` projesi) target env'lere karşı.

## 7. CI gate

**`.github/workflows/e2e.yml`** (yeni, ayrı workflow, kendi required status check'i):
`on: pull_request` + `push: [main]`.
1. checkout → pnpm/action-setup → setup-node(20, cache pnpm) → `pnpm install --frozen-lockfile`.
2. `pnpm db:generate`.
3. Required servisleri ayağa kaldır: `docker compose -f infra/docker/docker-compose.yml up -d`
   (postgres, redis, api-gateway, storefront-web, worker) → healthcheck'leri bekle.
4. Fixture: `pnpm db:seed-e2e` (`APP_ENV=test`).
5. `pnpm exec playwright install --with-deps chromium`.
6. `pnpm e2e:smoke` (setup+smoke; gerekiyorsa responsive subset).
7. **Fail → merge BLOCK** (required check).
8. Failure artifacts upload: `playwright-report/`, `test-results/` (trace/screenshot/video),
   console/network context. Secrets/PII **maskeli** — env log'lanmaz, storageState artifact'a girmez.
9. Cleanup: prefix cleanup + `docker compose down -v` (best-effort, `if: always()`).

**Main/post-deploy:** aynı repo `prod-smoke` profili target environment'a
`E2E_STOREFRONT_URL` + `E2E_PROD_PRODUCT_SLUG` (+ opsiyonel category/search) ile koşar
(ayrı adım/job; seed/cleanup yok).

`ci.yml` (mevcut lint·test·build) korunur; e2e ayrı workflow olarak eklenir.

### 7.1 Required status check governance (kritik)

`.github/workflows/e2e.yml` eklemek **tek başına** onu merge-blocking required check
yapmaz — required check'ler repo **branch protection / ruleset**'inde tanımlanır.

- **Doğrulama:** merge'den önce `gh api` ile main branch protection / ruleset'inde e2e
  job'unun status check adının (`e2e / <job-name>`) **required** listesinde olduğu doğrulanır
  (ör. `gh api repos/:owner/:repo/branches/main/protection`).
- **Yetki varsa:** required check `gh api` ile eklenir (branch protection `required_status_checks`
  veya ruleset güncellenir).
- **Yetki yoksa (fork/permission):** bu bir **açık governance adımı** olarak dokümante edilir
  (repo admin'in eklemesi gereken tam status-check adı + komut) ve **final raporda required
  status check kanıtı** (branch protection JSON'daki required checks listesi veya PR
  "required" rozet çıktısı) gösterilir. "Workflow eklendi = gate zorunlu" varsayımı yapılmaz.

## 8. Flakiness policy

- Arbitrary `sleep` **yasak** → Playwright auto-wait + `expect` polling (web-first assertions).
- `retries: CI?2:0`. Retry ile geçen flaky test **raporda görünür** (html + github reporter).
- Flaky testi skip ederek gate'i yeşile çevirmek **yasak**. Root cause düzeltilmeden
  **permanent skip yok**. Test retry sınırlı (2).

## 9. Definition of Done (yeni feature standardı — docs'a işlenecek)

1. backend/unit/integration tests
2. kısa exploratory browser smoke
3. kritik kullanıcı davranışı varsa kalıcı Playwright testi
4. Playwright smoke green
5. CI green
6. ship

Claude'un uzun manuel 4-viewport click-through'u default gate değildir; yalnız yeni/karmaşık
UX veya exploratory doğrulama için.

## 10. Docs güncellemeleri

- `docs/ROADMAP.md`, `todo.md` / `docs/TODO.md`
- `docs/TESTING.md` (yeni veya mevcut test dokümanı) — suite kullanımı, profiller, env, fixture.
- ADR (yukarıdaki karar cümlesi) → `docs/adr/` + `docs/DECISIONS.md`.
- `docs/TECHNICAL_DEBT.md` — PR2 kalan senaryolar + BrowserStack cross-browser FUTURE.

## 11. Gate (ship öncesi)

typecheck · lint · existing tests Run1+Run2 · Playwright smoke · (targeted regression varsa) ·
build · `git diff --check`. CI'da gerçek smoke gate'in çalıştığı kanıtlanır (kırmızı→yeşil).

## 12. Non-goals (PR1)

- PR2 senaryoları (return/refund/balance/wishlist/review/reorder).
- Full cross-browser/device matrisi (BrowserStack vb.) — FUTURE.
- 4 viewport'ta tüm functional smoke — yalnız küçük responsive-critical subset.
- Production'da herhangi bir write/seed/cleanup.

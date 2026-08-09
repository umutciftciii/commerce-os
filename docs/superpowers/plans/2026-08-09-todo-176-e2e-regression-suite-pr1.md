# TODO-176 PR1 — Storefront E2E Regression Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo-içi kalıcı Playwright E2E suite kur; 8 çekirdek storefront smoke senaryosunu gerçek UI + izole `e2e-store` fixture üzerinde deterministik doğrula; ayrı merge-blocking `e2e.yml` CI gate + non-destructive `@prod-smoke` profili ekle.

**Architecture:** Kök `tests/e2e/` + kök `playwright.config.ts`, projeler: `setup` (gerçek UI login → storageState), `smoke` (desktop Chromium, `@smoke`), `responsive` (`@responsive`, küçük subset), `prod-smoke` (`@prod-smoke`, anonim/read-only). Storefront tek-store olduğundan (`STOREFRONT_DEMO_STORE_SLUG` env, 46 kullanım, host-tabanlı çözüm yok) e2e için ayrı bir storefront runtime `storefront-web-e2e` (`:3100`, slug `e2e-store`) compose override ile ayağa kalkar; enterprise-demo (`:3000`) hiç bozulmaz. Fixture = dedike idempotent `e2e-seed.mjs`; write-path verisi test içinde üretilir + `e2e-`/`test-` prefix cleanup (`APP_ENV` guard).

**Tech Stack:** `@playwright/test`, Next.js 15 storefront, api-gateway (:4000) public REST, Prisma seed (docker exec), Docker Compose, GitHub Actions, pnpm workspace.

## Global Constraints

- **Türkçe iletişim** (kullanıcı tercihi); kod/log İngilizce olabilir.
- **URL hardcode yok** — tüm hedefler env'den: `E2E_STOREFRONT_URL` (default `http://localhost:3100`), `E2E_GATEWAY_URL` (default `http://localhost:4000`), `E2E_STORE_ADMIN_URL` (default `http://localhost:3002`).
- **Auth bypass yok** — session yalnız gerçek UI login ile kurulur; storageState reuse edilir.
- **Enterprise-demo / production verisi kirletilmez.** Fixture yalnız `e2e-store` + `e2e-`/`test-` prefix. Cleanup `APP_ENV ∈ {development,test}` guard'lı; prod'da asla çalışmaz.
- **PR1 seed yalnız 8 smoke ihtiyacı** — shopping-balance/return/refund gibi PR2 datası eklenmez.
- **`sleep` yasak** → auto-wait + web-first `expect`. `retries: CI?2:0`. Kalıcı skip yasak.
- **Prod smoke non-destructive** — seed/cleanup/login/write yok; hedefler explicit env (`E2E_PROD_PRODUCT_SLUG` zorunlu; category/search opsiyonel; silent fallback yok).
- Deterministik `e2e-store` kimlikleri (tek kaynak `tests/e2e/fixtures/ids.ts`):
  - store slug: `e2e-store`
  - customer: `e2e-customer@example.test` / password `E2eCustomer!pass1`
  - çok-varyantlı ürün slug: `e2e-tshirt`; varyant SKU'ları `e2e-tshirt-s` / `e2e-tshirt-m` / `e2e-tshirt-l`
  - basit ürün slug: `e2e-mug` (SKU `e2e-mug-std`)
  - kupon kodu: `E2E10` (%10, minimumsuz)
  - önceden var order: `e2e-order-1001`
- Fiyatlar minor (kuruş) STRING/INT tutarlılığı repo pattern'ine uyar; seed'de sabit değerler kullanılır (t-shirt 20000 minor = ₺200,00; mug 5000 minor = ₺50,00).

---

## File Structure

**Yeni:**
- `playwright.config.ts` — kök config (projeler, reporter, artifacts, env).
- `tests/e2e/fixtures/ids.ts` — deterministik e2e kimlikleri (tek kaynak).
- `tests/e2e/fixtures/env.ts` — env okuma + fail-loud helper'lar.
- `tests/e2e/fixtures/api.ts` — gateway public REST helper (write-path + assertion).
- `tests/e2e/fixtures/test-base.ts` — custom `test` (storageState, api, ids).
- `tests/e2e/setup/auth.setup.ts` — gerçek UI login → `.auth/customer.json`.
- `tests/e2e/smoke/*.spec.ts` — 8 çekirdek senaryo.
- `tests/e2e/responsive/critical.spec.ts` — `@responsive` küçük subset.
- `tests/e2e/prod-smoke/prod-read.spec.ts` — `@prod-smoke` anonim/read-only.
- `tests/e2e/README.md` — suite kullanımı (TESTING.md'den link).
- `packages/db/scripts/e2e-seed.mjs` — idempotent `e2e-store` seed.
- `infra/docker/docker-compose.e2e.yml` — `storefront-web-e2e` (:3100, slug e2e-store).
- `.github/workflows/e2e.yml` — merge-blocking E2E gate.
- `docs/TESTING.md` — E2E suite dokümanı.
- `docs/adr/ADR-287-playwright-e2e-release-gate.md` — karar kaydı.

**Değişecek:**
- `package.json` (kök) — `e2e:*` scriptleri + `db:seed-e2e` + `db:cleanup-e2e` + devDep `@playwright/test`.
- `.gitignore` — `tests/e2e/.auth/`, `playwright-report/`, `test-results/`, `blob-report/`.
- `packages/db/scripts/cleanup-smoke.ts` — `e2e-` prefix ekle (SMOKE_PREFIXES).
- UI test hook'ları (`data-testid`): `components/site/site-header.tsx`, `components/buy-box.tsx`, `components/pdp-selection.tsx`, `components/cart-view.tsx`, account orders bileşeni/sayfası, PDP fiyat.
- `docs/ROADMAP.md`, `todo.md`, `docs/DECISIONS.md`, `docs/TECHNICAL_DEBT.md`.

---

## Task 1: Playwright kurulumu + kök config + scriptler + gitignore

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fixtures/ids.ts`, `tests/e2e/fixtures/env.ts`
- Modify: `package.json` (root), `.gitignore`

**Interfaces:**
- Produces: `ids` (deterministik kimlik objesi), `envUrl(name, default)` / `requiredEnv(name)`, playwright projeleri `setup|smoke|responsive|prod-smoke`, npm scriptleri `e2e:install|e2e:smoke|e2e:responsive|e2e:prod-smoke`.

- [ ] **Step 1: Playwright'ı kök devDependency ekle + tarayıcı indir**

```bash
pnpm add -Dw @playwright/test@^1.49.0
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: `tests/e2e/fixtures/ids.ts` yaz (tek kaynak kimlikler)**

```ts
export const ids = {
  storeSlug: "e2e-store",
  customer: { email: "e2e-customer@example.test", password: "E2eCustomer!pass1", firstName: "E2E", lastName: "Customer" },
  variantProduct: { slug: "e2e-tshirt", title: "E2E Tshirt", priceMinor: 20000,
    variants: [
      { sku: "e2e-tshirt-s", label: "S" },
      { sku: "e2e-tshirt-m", label: "M" },
      { sku: "e2e-tshirt-l", label: "L" },
    ] },
  simpleProduct: { slug: "e2e-mug", title: "E2E Mug", sku: "e2e-mug-std", priceMinor: 5000 },
  coupon: { code: "E2E10", percentOff: 10 },
  seedOrderNumber: "e2e-order-1001",
} as const;
```

- [ ] **Step 3: `tests/e2e/fixtures/env.ts` yaz (env + fail-loud)**

```ts
export function envUrl(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v.replace(/\/$/, "") : fallback;
}
export function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`[e2e] Required env ${name} is not set (no silent fallback allowed).`);
  return v;
}
export const STOREFRONT_URL = envUrl("E2E_STOREFRONT_URL", "http://localhost:3100");
export const GATEWAY_URL = envUrl("E2E_GATEWAY_URL", "http://localhost:4000");
export const STORE_ADMIN_URL = envUrl("E2E_STORE_ADMIN_URL", "http://localhost:3002");
```

- [ ] **Step 4: `playwright.config.ts` yaz**

```ts
import { defineConfig, devices } from "@playwright/test";
import { STOREFRONT_URL } from "./tests/e2e/fixtures/env";

const CI = !!process.env.CI;
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: CI,
  fullyParallel: false,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["list"], ["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: STOREFRONT_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    { name: "setup", testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: "smoke",
      testDir: "tests/e2e/smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/customer.json" },
      dependencies: ["setup"],
    },
    {
      name: "responsive",
      testDir: "tests/e2e/responsive",
      grep: /@responsive/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/customer.json" },
      dependencies: ["setup"],
    },
    {
      name: "prod-smoke",
      testDir: "tests/e2e/prod-smoke",
      grep: /@prod-smoke/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 5: kök `package.json` scriptleri + devDep ekle**

`scripts` içine:
```json
"e2e:install": "playwright install --with-deps chromium",
"e2e:smoke": "playwright test --project=smoke",
"e2e:responsive": "playwright test --project=responsive",
"e2e:prod-smoke": "playwright test --project=prod-smoke",
"e2e:report": "playwright show-report",
"db:seed-e2e": "docker compose -f infra/docker/docker-compose.yml exec -T -e APP_ENV=test api-gateway node packages/db/scripts/e2e-seed.mjs",
"db:cleanup-e2e": "docker compose -f infra/docker/docker-compose.yml exec -T -e APP_ENV=test api-gateway pnpm --filter @commerce-os/db db:cleanup-smoke"
```

- [ ] **Step 6: `.gitignore`'a artefaktları ekle**

```
tests/e2e/.auth/
playwright-report/
test-results/
blob-report/
```

- [ ] **Step 7: Config yüklenir doğrula**

Run: `pnpm exec playwright test --list --project=smoke`
Expected: Hata yok; henüz test yok → "Total: 0 tests" veya "no tests found" (config parse OK). Kritik: config/TS parse hatası olmaması.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures/ids.ts tests/e2e/fixtures/env.ts package.json pnpm-lock.yaml .gitignore
git commit -m "chore(e2e): Playwright kök config + fixtures scaffold + scripts (TODO-176)"
```

---

## Task 2: `e2e-store` seed + compose override (`storefront-web-e2e` :3100)

**Files:**
- Create: `packages/db/scripts/e2e-seed.mjs`, `infra/docker/docker-compose.e2e.yml`
- Modify: `packages/db/scripts/cleanup-smoke.ts` (SMOKE_PREFIXES'e `"e2e-"` ekle)

**Interfaces:**
- Consumes: `ids` değerleri (aynı sabitler — seed JS'te literal tekrarlanır; `ids.ts` TS olduğundan seed .mjs kendi literal'ini içerir, değerler birebir eşleşir).
- Produces: DB'de `e2e-store` + test müşterisi (`CustomerCredential`) + 2 ürün/varyant + stok + kupon + `e2e-order-1001`. `storefront-web-e2e` servisi `:3100`, `STOREFRONT_DEMO_STORE_SLUG=e2e-store`.

- [ ] **Step 1: `cleanup-smoke.ts` prefix'ine `e2e-` ekle**

`SMOKE_PREFIXES` dizisine `"e2e-"` ekle (mevcut `["smoke-", "rev-", "test-", ...]`). `APP_ENV` guard aynen korunur.

- [ ] **Step 2: `e2e-seed.mjs` yaz (idempotent, mevcut `seed.mjs` upsert pattern'i)**

Gereken model alanlarını doğrulamak için ÖNCE oku: `packages/db/prisma/schema.prisma` — `Store`, `Customer`, `CustomerCredential`, `Product`, `ProductVariant`, `InventoryItem`, `Coupon/Campaign`, `Order`/`OrderLine`, `StoreDomain`, `Plan` modelleri (zorunlu alanlar + enum'lar). Mevcut `enterprise-seed.mjs` ve `seed.mjs` ürün/varyant/stok/kupon/order kurulumunu referans al (aynı Prisma ilişkileri).

Seed iskeleti (alan adları schema'dan doğrulanacak; `hashPassword` `@commerce-os/auth`'tan):
```js
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@commerce-os/auth";
const prisma = new PrismaClient();

async function main() {
  if (!["development", "test", undefined].includes(process.env.APP_ENV)) {
    throw new Error(`Refusing e2e seed when APP_ENV=${process.env.APP_ENV}`);
  }
  // 1) plan + store (slug: e2e-store) upsert (status ACTIVE) — seed.mjs pattern
  // 2) StoreDomain upsert (e2e-store.localhost / e2e domain) — opsiyonel, gateway store çözümü slug ile
  // 3) customer upsert (email e2e-customer@example.test, storeId) + CustomerCredential upsert (passwordHash = hashPassword("E2eCustomer!pass1", PEPPER))
  // 4) çok-varyantlı ürün e2e-tshirt (priceMinor 20000) + 3 varyant (S/M/L, SKU e2e-tshirt-*) + InventoryItem (yeterli stok, tracking on)
  // 5) basit ürün e2e-mug (priceMinor 5000) + tek varyant e2e-mug-std + stok
  // 6) kupon E2E10 (%10) — mevcut Coupon/Campaign modeline göre
  // 7) önceden var order e2e-order-1001: müşteriye bağlı, 1 satır (e2e-mug x1), PAID/uygun status, tutar snapshot
  // Tüm write'lar upsert → idempotent; retry duplicate üretmez.
  console.log(JSON.stringify({ ok: true, store: "e2e-store" }));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 3: `docker-compose.e2e.yml` override yaz**

```yaml
services:
  storefront-web-e2e:
    restart: unless-stopped
    build:
      context: ../..
      dockerfile: infra/docker/node.Dockerfile
    command: pnpm --filter @commerce-os/storefront-web dev
    environment:
      SERVICE_NAME: storefront-web-e2e
      NODE_ENV: development
      API_GATEWAY_URL: http://api-gateway:4000
      STOREFRONT_DEMO_STORE_SLUG: e2e-store
      STOREFRONT_CART_SECRET: e2e-cart-secret
      PORT: 3100
    command_note: "next dev --port 3100 (package script :3000 → PORT env veya --port override)"
    depends_on:
      api-gateway:
        condition: service_healthy
    ports:
      - "3100:3100"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 30
      start_period: 40s
```
NOT: storefront `dev` scripti `--port 3000` sabit. `:3100` için ya compose `command`'i `pnpm --filter @commerce-os/storefront-web exec next dev --port 3100` olarak override et, ya da storefront `dev` scriptini `next dev --port ${PORT:-3000}` yap (tercih: compose command override — app scriptine dokunma). `command_note` alanını gerçek `command:` ile değiştir.

- [ ] **Step 4: e2e storefront'u ayağa kaldır + seed**

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.e2e.yml up -d storefront-web-e2e
pnpm db:seed-e2e
```

- [ ] **Step 5: e2e-store'un servis edildiğini doğrula (business result)**

Run:
```bash
curl -s "http://localhost:4000/public/stores/e2e-store/store-info" | head -c 300; echo
curl -s "http://localhost:3100/api/health"; echo
curl -s "http://localhost:3100/products/e2e-tshirt" -o /dev/null -w "%{http_code}\n"
```
Expected: store-info JSON `e2e-store` döner (200); health ok; PDP `200`.

- [ ] **Step 6: Idempotency (retry duplicate üretmez) doğrula**

Run: `pnpm db:seed-e2e && pnpm db:seed-e2e`
Expected: İkinci koşu hata vermez; ürün/order sayısı artmaz (upsert). Gerekirse gateway `.../products` sayımı sabit kalır.

- [ ] **Step 7: Commit**

```bash
git add packages/db/scripts/e2e-seed.mjs infra/docker/docker-compose.e2e.yml packages/db/scripts/cleanup-smoke.ts
git commit -m "feat(e2e): dedike e2e-store seed + storefront-web-e2e (:3100) override + e2e- cleanup prefix (TODO-176)"
```

---

## Task 3: `api.ts` fixture + `test-base.ts` (custom test) + `auth.setup.ts`

**Files:**
- Create: `tests/e2e/fixtures/api.ts`, `tests/e2e/fixtures/test-base.ts`, `tests/e2e/setup/auth.setup.ts`

**Interfaces:**
- Consumes: `ids`, `STOREFRONT_URL`, `GATEWAY_URL`.
- Produces: `test` (extended, `api` + `ids` fixtures), `expect`. `api.getStore()`, `api.getProductBySlug(slug)`. `.auth/customer.json` storageState.

- [ ] **Step 1: `api.ts` yaz (gateway public read helper)**

```ts
import { request, type APIRequestContext } from "@playwright/test";
import { GATEWAY_URL } from "./env";
import { ids } from "./ids";

export class Api {
  constructor(private ctx: APIRequestContext) {}
  static async create() { return new Api(await request.newContext({ baseURL: GATEWAY_URL })); }
  async storeInfo() {
    const r = await this.ctx.get(`/public/stores/${ids.storeSlug}/store-info`);
    if (!r.ok()) throw new Error(`storeInfo ${r.status()}`);
    return r.json();
  }
  async productBySlug(slug: string) {
    const r = await this.ctx.get(`/public/stores/${ids.storeSlug}/products/${slug}`);
    if (!r.ok()) throw new Error(`product ${slug} ${r.status()}`);
    return r.json();
  }
  async dispose() { await this.ctx.dispose(); }
}
```
NOT: gerçek public endpoint yolları `apps/storefront-web/lib/server/*.ts` içindeki path'lerden doğrulanır (`/public/stores/:slug/products/:handle` vb.). Path'i oradan birebir al.

- [ ] **Step 2: `test-base.ts` yaz (custom fixtures)**

```ts
import { test as base, expect } from "@playwright/test";
import { Api } from "./api";
import { ids } from "./ids";

export const test = base.extend<{ api: Api }>({
  api: async ({}, use) => { const api = await Api.create(); await use(api); await api.dispose(); },
});
export { expect, ids };
```

- [ ] **Step 3: `auth.setup.ts` yaz (gerçek UI login → storageState)**

```ts
import { test as setup, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STOREFRONT_URL } from "../fixtures/env";

const authFile = "tests/e2e/.auth/customer.json";

setup("authenticate customer via real UI login", async ({ page }) => {
  await page.goto(`${STOREFRONT_URL}/auth/login`);
  await page.locator("#login-identifier").fill(ids.customer.email);
  await page.locator("#login-password").fill(ids.customer.password);
  await page.getByRole("button", { name: /giriş|login|oturum/i }).click();
  await expect(page).toHaveURL(/\/account(\/|$|\?)/, { timeout: 15_000 });
  // gerçek session cookie yakalandı doğrula
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "commerce_os_customer_session")).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
```
NOT: submit butonunun görünen adı `t.login.submit` (i18n). Gerçek metni `packages/i18n` storefront sözlüğünden doğrula; regex'i ona göre daralt.

- [ ] **Step 4: setup projesini koştur (storageState üretir)**

Run: `pnpm exec playwright test --project=setup`
Expected: PASS; `tests/e2e/.auth/customer.json` oluşur, `commerce_os_customer_session` cookie'sini içerir.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/api.ts tests/e2e/fixtures/test-base.ts tests/e2e/setup/auth.setup.ts
git commit -m "feat(e2e): api fixture + custom test base + gerçek UI auth storageState (TODO-176)"
```

---

## Task 4: Senaryo 1 — Auth / login / session (`@smoke`)

**Files:**
- Create: `tests/e2e/smoke/01-auth-session.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `ids`, storageState (setup).

- [ ] **Step 1: Failing test yaz**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke authenticated session persists and shows account @responsive", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account(\/|$|\?)/); // login'e redirect OLMAMALI
  await expect(page.getByText(new RegExp(ids.customer.firstName, "i"))).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/account(\/|$|\?)/); // reload sonrası hâlâ oturumlu
  expect(errors, `console/runtime errors: ${errors.join(" | ")}`).toEqual([]);
});
```
NOT: hesap sayfasında görünen kullanıcı adı alanını gerçek markup'tan doğrula; gerekirse `data-testid="account-greeting"` ekle (`app/account/.../*.tsx`).

- [ ] **Step 2: Koştur, GEÇMELİ (storageState hazır)**

Run: `pnpm e2e:smoke -- 01-auth-session.spec.ts`
Expected: PASS. Fail ederse account greeting locator'ını düzelt (testid ekle).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke/01-auth-session.spec.ts apps/storefront-web/app/account
git commit -m "test(e2e): senaryo 1 auth/session smoke (TODO-176)"
```

---

## Task 5: Senaryo 2 — PDP variant seçimi (`@smoke`) + PDP test hook'ları

**Files:**
- Create: `tests/e2e/smoke/02-pdp-variant.spec.ts`
- Modify: `apps/storefront-web/components/pdp-selection.tsx`, `apps/storefront-web/components/buy-box.tsx`

**Interfaces:**
- Consumes: `ids.variantProduct`.
- Produces: testid'ler → `variant-option-<sku>`, `buybox-price`, `add-to-cart`.

- [ ] **Step 1: PDP'ye stabil test hook'ları ekle**

`pdp-selection.tsx`: her varyant seçim kontrolüne `data-testid={`variant-option-${sku}`}` (veya `getByRole('radio', {name})` semantic). `buy-box.tsx`: birim fiyat elemanına `data-testid="buybox-price"`, sepete ekle butonuna `data-testid="add-to-cart"`.

- [ ] **Step 2: Failing test yaz**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke PDP variant selection updates price/sku reactively", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await expect(page.getByTestId("buybox-price")).toBeVisible();

  // S seç → fiyat görünür + SKU reaktif; L seç → değişim (varsa fiyat farkı ya da SKU)
  await page.getByTestId(`variant-option-${p.variants[0].sku}`).click();
  await expect(page.getByTestId("buybox-price")).toContainText(/₺|TL|\d/);
  await page.getByTestId(`variant-option-${p.variants[2].sku}`).click();
  // seçili varyant sepete ekle butonunu enable eder
  await expect(page.getByTestId("add-to-cart")).toBeEnabled();
});
```

- [ ] **Step 3: Koştur — önce FAIL (testid yok) sonra ekleyip PASS**

Run: `pnpm e2e:smoke -- 02-pdp-variant.spec.ts`
Expected: testid eklenmeden FAIL; eklendikten sonra PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke/02-pdp-variant.spec.ts apps/storefront-web/components/pdp-selection.tsx apps/storefront-web/components/buy-box.tsx
git commit -m "test(e2e): senaryo 2 PDP variant + PDP test hook'ları (TODO-176)"
```

---

## Task 6: Senaryo 3+4 — Add-to-cart + header cart badge (`@smoke`) + header hook

**Files:**
- Create: `tests/e2e/smoke/03-add-to-cart-badge.spec.ts`
- Modify: `apps/storefront-web/components/site/site-header.tsx`

**Interfaces:**
- Consumes: `variant-option-*`, `add-to-cart`, `ids`.
- Produces: `data-testid="cart-badge"` (count), `data-testid="cart-link"`.

- [ ] **Step 1: Header'a cart badge/link testid'i ekle**

`site-header.tsx`: sepet ikon linkine `data-testid="cart-link"`, adet rozetine `data-testid="cart-badge"` (rozet 0 iken de render edilebilir veya yoksa `count=0` semantiği; test buna göre yazılır).

- [ ] **Step 2: Failing test yaz (iş sonucu: badge count + cart satırı)**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke add-to-cart increments badge and persists correct line", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${p.variants[1].sku}`).click(); // M
  await page.getByTestId("add-to-cart").click();

  await expect(page.getByTestId("cart-badge")).toHaveText(/1/);

  await page.getByTestId("cart-link").click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText(new RegExp(p.title, "i"))).toBeVisible(); // doğru ürün
  await expect(page.getByText(/M/)).toBeVisible(); // doğru varyant
});
```
NOT: cart satırı için `cart-view.tsx`'e `data-testid="cart-line"` + `data-testid="cart-line-variant"` eklemek locator kırılganlığını azaltır (Task 8'de coupon ile birlikte de gerekebilir; burada ekle).

- [ ] **Step 3: FAIL→PASS koştur**

Run: `pnpm e2e:smoke -- 03-add-to-cart-badge.spec.ts`
Expected: testid eklenince PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke/03-add-to-cart-badge.spec.ts apps/storefront-web/components/site/site-header.tsx apps/storefront-web/components/cart-view.tsx
git commit -m "test(e2e): senaryo 3+4 add-to-cart + cart badge + header/cart hook'ları (TODO-176)"
```

---

## Task 7: Senaryo 5 — Cart refresh / persistence (`@smoke`)

**Files:**
- Create: `tests/e2e/smoke/04-cart-persistence.spec.ts`

- [ ] **Step 1: Failing test yaz**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke cart survives reload (cookie-backed persistence)", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${p.variants[0].sku}`).click(); // S
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText(/1/);

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.reload();
  // reload sonrası aynı satır + badge korunur
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-badge")).toHaveText(/1/);
  await expect(page.getByText(new RegExp(p.title, "i"))).toBeVisible();
});
```

- [ ] **Step 2: Koştur PASS**

Run: `pnpm e2e:smoke -- 04-cart-persistence.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke/04-cart-persistence.spec.ts
git commit -m "test(e2e): senaryo 5 cart refresh/persistence (TODO-176)"
```

---

## Task 8: Senaryo 6 — Coupon apply/remove + repricing (`@smoke`) + coupon hook'ları

**Files:**
- Create: `tests/e2e/smoke/05-coupon-repricing.spec.ts`
- Modify: `apps/storefront-web/components/cart-view.tsx`

**Interfaces:**
- Produces: `coupon-input`, `coupon-apply`, `coupon-remove`, `cart-total`.

- [ ] **Step 1: cart-view coupon hook'ları ekle**

`cart-view.tsx`: kupon input `data-testid="coupon-input"`, uygula butonu `data-testid="coupon-apply"`, kaldır butonu `data-testid="coupon-remove"`, sepet toplamı `data-testid="cart-total"`.

- [ ] **Step 2: Failing test yaz (iş sonucu: toplam değişir)**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke coupon apply reduces total and remove restores it", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${p.variants[1].sku}`).click();
  await page.getByTestId("add-to-cart").click();
  await page.goto("/cart");

  const totalBefore = (await page.getByTestId("cart-total").innerText()).trim();
  await page.getByTestId("coupon-input").fill(ids.coupon.code);
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("cart-total")).not.toHaveText(totalBefore); // repricing gerçekleşti (indirim)

  await page.getByTestId("coupon-remove").click();
  await expect(page.getByTestId("cart-total")).toHaveText(totalBefore); // eski toplam geri
});
```

- [ ] **Step 3: FAIL→PASS koştur**

Run: `pnpm e2e:smoke -- 05-coupon-repricing.spec.ts`
Expected: PASS. Kupon uygulanmıyorsa seed kupon kodu/kapsamını doğrula.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke/05-coupon-repricing.spec.ts apps/storefront-web/components/cart-view.tsx
git commit -m "test(e2e): senaryo 6 coupon apply/remove repricing + coupon hook'ları (TODO-176)"
```

---

## Task 9: Senaryo 7 — Cart → checkout canonical cart identity (`@smoke`)

**Files:**
- Create: `tests/e2e/smoke/06-cart-checkout-identity.spec.ts`
- Modify: `apps/storefront-web/components/checkout-form.tsx` (gerekirse `data-testid="checkout-line"`, `checkout-total`)

- [ ] **Step 1: Failing test yaz (invariant: cart == checkout)**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke cart identity is preserved into checkout (lines + total)", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${p.variants[2].sku}`).click(); // L
  await page.getByTestId("add-to-cart").click();

  await page.goto("/cart");
  const cartTotal = (await page.getByTestId("cart-total").innerText()).trim();
  const cartLines = await page.getByTestId("cart-line").count();

  await page.getByTestId("checkout-cta").click(); // cart-view'de checkout CTA'ya testid ekle
  await expect(page).toHaveURL(/\/checkout/);

  await expect(page.getByTestId("checkout-line")).toHaveCount(cartLines); // aynı satır sayısı
  await expect(page.getByTestId("checkout-total")).toHaveText(cartTotal);  // aynı toplam
});
```
NOT: `cart-view.tsx`'e `data-testid="checkout-cta"`, `checkout-form.tsx`'e `checkout-line`/`checkout-total` ekle. Toplam metni birebir eşleşmiyorsa (KDV/kargo satırı checkout'ta ayrışıyorsa) invariant'ı "ürün ara-toplamı (subtotal)" üzerinden kur: `cart-subtotal` == `checkout-subtotal`. Hangi alanın canonical olduğunu `cart-view`/`checkout-form` kaynak koddan doğrula ve testid'i ona göre yerleştir.

- [ ] **Step 2: FAIL→PASS koştur**

Run: `pnpm e2e:smoke -- 06-cart-checkout-identity.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke/06-cart-checkout-identity.spec.ts apps/storefront-web/components/cart-view.tsx apps/storefront-web/components/checkout-form.tsx
git commit -m "test(e2e): senaryo 7 cart→checkout canonical identity (TODO-176)"
```

---

## Task 10: Senaryo 8 — Order list / detail (`@smoke`) + account order hook'ları

**Files:**
- Create: `tests/e2e/smoke/07-order-list-detail.spec.ts`
- Modify: account siparişler bileşeni/sayfası (`apps/storefront-web/app/account/**` veya `components/account/**`)

**Interfaces:**
- Consumes: seed order `ids.seedOrderNumber`.
- Produces: `order-list-item`, `order-detail-line`, `order-detail-total`.

- [ ] **Step 1: account order hook'larını ekle**

Sipariş listesi satırına `data-testid="order-list-item"` (+ order number görünür), detay kalemine `data-testid="order-detail-line"`, tutara `data-testid="order-detail-total"`. Ham enum sızmadığını (status label'ı çeviri) doğrulayacağız.

- [ ] **Step 2: Failing test yaz (iş sonucu + no raw enum)**

```ts
import { test, expect, ids } from "../fixtures/test-base";

test("@smoke seeded order appears in list and detail renders correctly", async ({ page }) => {
  await page.goto("/account/orders"); // gerçek rota kaynaktan doğrula (account siparişler)
  const item = page.getByTestId("order-list-item").filter({ hasText: ids.seedOrderNumber });
  await expect(item).toBeVisible();

  await item.click();
  await expect(page.getByTestId("order-detail-line")).toHaveCount(1); // seed: 1 kalem (e2e-mug)
  await expect(page.getByText(new RegExp(ids.simpleProduct.title, "i"))).toBeVisible();
  await expect(page.getByTestId("order-detail-total")).toBeVisible();

  // no raw enum: PAID/PENDING gibi ham enum ekranda görünmemeli
  await expect(page.locator("body")).not.toContainText(/\b(PAID|PENDING|FULFILLED|CANCELLED)\b/);
});
```
NOT: account sipariş rotasını (`/account/orders` mı `/account` içinde mi) kaynaktan doğrula.

- [ ] **Step 3: FAIL→PASS koştur**

Run: `pnpm e2e:smoke -- 07-order-list-detail.spec.ts`
Expected: PASS.

- [ ] **Step 4: Tüm smoke suite yeşil**

Run: `pnpm e2e:smoke`
Expected: 8 senaryo (setup dahil) PASS. HTML rapor üretilir.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/smoke/07-order-list-detail.spec.ts apps/storefront-web/app/account apps/storefront-web/components/account
git commit -m "test(e2e): senaryo 8 order list/detail + account order hook'ları (TODO-176)"
```

---

## Task 11: Responsive subset (`@responsive`) + prod-smoke profili (`@prod-smoke`)

**Files:**
- Create: `tests/e2e/responsive/critical.spec.ts`, `tests/e2e/prod-smoke/prod-read.spec.ts`

**Interfaces:**
- Consumes: `requiredEnv`, `ids`.

- [ ] **Step 1: responsive critical subset yaz (küçük — 2 viewport, 1 akış)**

```ts
import { test, expect, ids } from "../fixtures/test-base";

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  test(`@responsive PDP + add-to-cart at ${vp.w}px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`/products/${ids.variantProduct.slug}`);
    await page.getByTestId(`variant-option-${ids.variantProduct.variants[0].sku}`).click();
    await expect(page.getByTestId("add-to-cart")).toBeEnabled();
    await page.getByTestId("add-to-cart").click();
    await expect(page.getByTestId("cart-badge")).toHaveText(/1/);
  });
}
```
NOT: Ana functional akış smoke'ta desktop'ta zaten koşuyor; burada yalnız responsive-critical küçük subset (768/1024 eklemek istenirse diziye eklenir; CI maliyeti için 2 ile sınırlı).

- [ ] **Step 2: prod-smoke yaz (anonim, read-only, explicit target, fail-loud)**

```ts
import { test, expect } from "@playwright/test";
import { requiredEnv, envUrl } from "../fixtures/env";

const PRODUCT_SLUG = process.env.E2E_PROD_PRODUCT_SLUG?.trim();
const CATEGORY_SLUG = process.env.E2E_PROD_CATEGORY_SLUG?.trim();
const SEARCH_TERM = process.env.E2E_PROD_SEARCH_TERM?.trim();

test("@prod-smoke storefront home renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(envUrl("E2E_STOREFRONT_URL", "http://localhost:3100"));
  await expect(page).toHaveTitle(/.+/);
  expect(errors).toEqual([]);
});

test("@prod-smoke PDP renders for explicit target product", async ({ page }) => {
  const slug = requiredEnv("E2E_PROD_PRODUCT_SLUG"); // zorunlu → yoksa açık config error
  await page.goto(`/products/${slug}`);
  await expect(page.getByTestId("buybox-price")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b(PAID|PENDING|FULFILLED|CANCELLED)\b/);
});

test("@prod-smoke PLP renders for explicit category", async ({ page }) => {
  test.skip(!CATEGORY_SLUG, "E2E_PROD_CATEGORY_SLUG tanımsız → PLP kontrolü atlandı (silent fallback yok)");
  await page.goto(`/t/${CATEGORY_SLUG}`); // gerçek kategori rotasını kaynaktan doğrula
  await expect(page.getByTestId("product-card").first()).toBeVisible();
});

test("@prod-smoke search works for explicit term", async ({ page }) => {
  test.skip(!SEARCH_TERM, "E2E_PROD_SEARCH_TERM tanımsız → arama kontrolü atlandı");
  await page.goto(`/discovery?q=${encodeURIComponent(SEARCH_TERM!)}`); // gerçek arama rotasını doğrula
  await expect(page.getByTestId("product-card").first()).toBeVisible();
});
```
NOT: prod-smoke `baseURL` config'ten (`E2E_STOREFRONT_URL`). Kategori/arama rotalarını storefront kaynaktan doğrula. `product-card` testid'i `components/site/product-card.tsx` veya `ui/product-card.tsx`'e eklenir (Task 6 kapsamına alınabilir; burada ekle).

- [ ] **Step 3: responsive lokal koştur**

Run: `pnpm e2e:responsive`
Expected: 2 viewport PASS.

- [ ] **Step 4: prod-smoke lokal doğrula (e2e-store'a karşı, explicit env)**

Run: `E2E_STOREFRONT_URL=http://localhost:3100 E2E_PROD_PRODUCT_SLUG=e2e-tshirt pnpm e2e:prod-smoke`
Expected: home + PDP PASS; category/search env yoksa **skip (raporda görünür)**. `E2E_PROD_PRODUCT_SLUG` olmadan koşulursa PDP testi **açık error** verir (fail-loud doğrulaması).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/responsive/critical.spec.ts tests/e2e/prod-smoke/prod-read.spec.ts apps/storefront-web/components/site/product-card.tsx
git commit -m "test(e2e): responsive subset + prod-smoke (explicit target, fail-loud) (TODO-176)"
```

---

## Task 12: CI gate `.github/workflows/e2e.yml` + artifacts + required-check governance

**Files:**
- Create: `.github/workflows/e2e.yml`

**Interfaces:**
- Produces: PR/main'de e2e smoke gate; failure artifacts; required-check adı `e2e / smoke`.

- [ ] **Step 1: `e2e.yml` yaz**

```yaml
name: e2e
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true
jobs:
  smoke:
    name: smoke
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      APP_ENV: test
      E2E_STOREFRONT_URL: http://localhost:3100
      E2E_GATEWAY_URL: http://localhost:4000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - name: Start stack (gateway + e2e storefront + deps)
        run: |
          docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.e2e.yml up -d \
            postgres redis api-gateway worker storefront-web-e2e
      - name: Wait for health
        run: |
          for i in $(seq 1 60); do
            curl -sf http://localhost:4000/ >/dev/null 2>&1 && \
            curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break
            sleep 5
          done
          curl -sf http://localhost:3100/api/health
      - name: Migrate + seed e2e fixtures
        run: |
          pnpm db:migrate || true
          pnpm db:seed-e2e
      - name: Install Playwright browser
        run: pnpm exec playwright install --with-deps chromium
      - name: Run smoke
        run: pnpm e2e:smoke
      - name: Upload artifacts
        if: ${{ failure() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
      - name: Cleanup
        if: ${{ always() }}
        run: |
          pnpm db:cleanup-e2e || true
          docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.e2e.yml down -v || true
```
NOT: secrets/PII sızmaması için env `run` içinde echo edilmez; storageState (`.auth/`) artifact path'ine dahil değil (yalnız `playwright-report/` + `test-results/`). `db:migrate`/gateway health komutunu gerçek healthcheck'e göre ayarla.

- [ ] **Step 2: YAML lint / workflow parse doğrula**

Run: `pnpm dlx @action-validator/cli .github/workflows/e2e.yml || python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/e2e.yml'))"`
Expected: parse OK.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci(e2e): merge-blocking Playwright smoke gate + failure artifacts (TODO-176)"
```

- [ ] **Step 4: Required-check governance (branch protection) — PUSH sonrası**

PR açıldıktan / workflow bir kez koştuktan sonra, status-check adı (`e2e / smoke`) main branch protection'a **required** olarak eklenir:
```bash
gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts' || echo "protection yok/erişim yok"
# Yetki varsa ekle (mevcut ci gate'i koruyarak):
# gh api -X PUT repos/{owner}/{repo}/branches/main/protection ... required_status_checks.contexts += ["e2e / smoke"]
```
Yetki yoksa: bu adım **açık governance notu** olarak final rapora yazılır (tam context adı + komut) ve mevcut required-check listesi JSON'ı kanıt olarak gösterilir. "Workflow eklendi = required" varsayımı yapılmaz.

---

## Task 13: Docs — ADR + ROADMAP + TODO + TESTING + TECHNICAL_DEBT + DoD

**Files:**
- Create: `docs/adr/ADR-287-playwright-e2e-release-gate.md`, `docs/TESTING.md`, `tests/e2e/README.md`
- Modify: `docs/ROADMAP.md`, `todo.md`, `docs/DECISIONS.md`, `docs/TECHNICAL_DEBT.md`

- [ ] **Step 1: ADR-287 yaz**

Karar cümlesi (birebir): *"Playwright E2E suite is the source-of-truth automated browser release gate; manual browser smoke is exploratory/complementary, not the primary regression mechanism."* Context (manuel smoke'un ölçeklenmemesi), Decision, Consequences (CI maliyeti, flakiness policy, PR2 kapsamı), Alternatives (BrowserStack FUTURE).

- [ ] **Step 2: `docs/TESTING.md` + `tests/e2e/README.md` yaz**

Suite kullanımı: profiller (`smoke`/`responsive`/`prod-smoke`), env değişkenleri, lokal koşum (`docker compose ... e2e up storefront-web-e2e` + `db:seed-e2e` + `pnpm e2e:smoke`), storageState, fixture/cleanup, flakiness policy, DoD (6 madde), yeni feature standardı.

- [ ] **Step 3: ROADMAP + todo + DECISIONS + TECHNICAL_DEBT güncelle**

- ROADMAP: TODO-176 satırı (E2E suite, PR1 smoke).
- todo.md: TODO-176 PR1 kapsamı + PR2 kalan senaryolar.
- DECISIONS.md: ADR-287 özeti + link.
- TECHNICAL_DEBT.md: PR2 senaryoları (reorder/BUG-CART-006 invariant, balance/mixed payment, cancellation, return, refund ORIGINAL/BALANCE, İadelerim, Bakiye, wishlist, review, order-experience review) + cross-browser/device BrowserStack FUTURE + required-check governance notu (yetki dışıysa).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/ADR-287-playwright-e2e-release-gate.md docs/TESTING.md tests/e2e/README.md docs/ROADMAP.md todo.md docs/DECISIONS.md docs/TECHNICAL_DEBT.md
git commit -m "docs(todo-176): ADR-287 E2E gate + TESTING + roadmap/todo/tech-debt (TODO-176)"
```

---

## Task 14: Final gate + ship

- [ ] **Step 1: Gate (repo kuralı — memory: db:generate + build önce)**

Run (sırayla):
```bash
pnpm db:generate
pnpm build
pnpm typecheck
pnpm lint
pnpm test          # Run1
pnpm test          # Run2 (deterministik doğrulama)
pnpm e2e:smoke     # Playwright smoke
pnpm e2e:responsive
git diff --check
```
Expected: hepsi yeşil. Herhangi biri kırmızıysa root-cause düzelt (skip yok).

- [ ] **Step 2: Push + PR aç**

```bash
git push -u origin claude/storefront-e2e-regression-0af485
gh pr create --title "TODO-176 PR1: Storefront E2E regression suite (Playwright smoke gate)" --body "<özet + spec/plan link + PR2 kapsamı>"
```

- [ ] **Step 3: CI gerçek gate kanıtı**

CI'da `e2e / smoke` job'unun koştuğunu ve **kırmızı→yeşil** olduğunu gözlemle (gerekirse kasıtlı fail ile gate'in bloklamasını kanıtla, sonra düzelt). Required-check governance (Task 12 Step 4) kanıtını topla.

- [ ] **Step 4: Merge (squash/rebase/force YOK) → gerekiyorsa yalnız değişen servisi deploy → post-deploy `@prod-smoke`**

```bash
gh pr merge --merge   # merge commit
# deploy (değişen: storefront-web) — repo deploy akışına göre
E2E_STOREFRONT_URL=<prod-url> E2E_PROD_PRODUCT_SLUG=<prod-known-slug> pnpm e2e:prod-smoke
```

- [ ] **Step 5: docs CLOSED & DEPLOYED + memory + cleanup**

todo.md/ROADMAP'e CLOSED & DEPLOYED (PR# + merge SHA + CI + post-deploy). Memory'ye TODO-176 kaydı. Worktree cleanup.

---

## Self-Review (writing-plans)

**Spec coverage:** §2 audit → Task boyunca referans. §3 kararlar → Task 1-2 (konum/config/seed/compose), Task 3 (auth). §4 mimari → Task 1 (projeler/env), Task 2 (compose/seed), Task 3 (auth/fixtures/api), UI hook'ları Task 5/6/8/9/10. §5 8 senaryo → Task 4-10. §6 prod-smoke (explicit target/fail-loud) → Task 11. §7 CI gate + §7.1 governance → Task 12. §8 flakiness → config (Task 1) + policy docs (Task 13). §9 DoD + §10 docs → Task 13. §11 gate + ship → Task 14. §12 non-goals → PR2 TECH_DEBT (Task 13). ✔ Boşluk yok.

**Placeholder scan:** Kod blokları somut; `NOT:` satırları executor'ın kaynaktan doğrulayacağı gerçek çıpaları (rota/label/testid yerleşimi) işaret eder — bunlar "implement later" değil, mevcut markup'a testid ekleme talimatıdır. ✔

**Type/isim tutarlılığı:** `ids.*` alanları (variantProduct.variants[].sku, simpleProduct.title, coupon.code, seedOrderNumber) tüm task'larda tutarlı. testid isimleri sabit: `variant-option-<sku>`, `buybox-price`, `add-to-cart`, `cart-badge`, `cart-link`, `cart-line`, `cart-total`, `coupon-input/apply/remove`, `checkout-cta/line/total`, `order-list-item`, `order-detail-line/total`, `product-card`. Env: `E2E_STOREFRONT_URL`(:3100), `E2E_GATEWAY_URL`(:4000), `E2E_PROD_PRODUCT_SLUG/CATEGORY_SLUG/SEARCH_TERM`. ✔

**Bilinen risk / executor doğrulaması gereken noktalar:** (1) storefront `dev` scripti `:3000` sabit → compose `command` ile `:3100` override; (2) gateway public product endpoint path'i (`/public/stores/:slug/products/:handle`) kaynaktan teyit; (3) checkout total invariant KDV/kargo nedeniyle subtotal üzerinden kurulabilir; (4) account orders rotası; (5) i18n login submit label. Her biri ilgili task'ta `NOT:` ile işaretli.

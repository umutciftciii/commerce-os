# Testing Guide

Bu doküman repodaki test katmanlarını ve özellikle **Playwright E2E** paketinin (TODO-176 PR1) nasıl
çalıştırılacağını anlatır. Karar gerekçesi için bkz.
[ADR-287](adr/ADR-287-playwright-e2e-release-gate.md).

## 1. Test katmanları (özet)

| Katman | Komut | Kapsam |
| --- | --- | --- |
| Unit | `pnpm test:unit` (`vitest run tests/unit packages/*/test apps/*/test`) | Saf fonksiyonlar, izole modüller |
| Integration | `pnpm test:integration` (`vitest run tests/integration`) | Gerçek-DB entegrasyon testleri |
| Workspace test | `pnpm test` (`turbo run test`) | Yukarıdakileri her paket/app için orkestre eder |
| **E2E (Playwright)** | `pnpm e2e:*` (aşağıda) | Gerçek browser, gerçek HTTP, gerçek DB — kritik kullanıcı akışları |

Unit/integration/workspace test katmanları bu dokümanın kapsamı dışıdır (bkz. ilgili paketlerin kendi
test dosyaları). Bu doküman yalnız E2E paketini anlatır.

## 2. E2E paketi — genel bakış

- **Konum:** `tests/e2e/` + kökte `playwright.config.ts`.
- **Amaç:** ADR-287'de karara bağlandığı gibi, Playwright suite **kaynak-otorite otomatik browser
  release gate'idir**; manuel browser smoke exploratory/complementary bir katmandır, ana regresyon
  mekanizması değildir.

### 2.1 Projeler (`playwright.config.ts`)

| Proje | Grep tag | Tarayıcı/viewport | Auth | Bağımlılık | Amaç |
| --- | --- | --- | --- | --- | --- |
| `setup` | — | — | gerçek UI login | — | `tests/e2e/.auth/customer.json` storageState üretir |
| `smoke` | `@smoke` | Desktop Chromium | storageState reuse | `setup` | 9 çekirdek kullanıcı akışı (PR1 8 + PR2 reorder/BUG-CART-006 invariant) |
| `responsive` | `@responsive` | Desktop Chromium, viewport **375** ve **1440** | storageState reuse | `setup` | Küçük, kritik responsive subset (kırılma taraması; ana akış smoke'ta zaten var) |
| `regression` | `@regression` | Desktop Chromium | storageState reuse | `setup` | Ağır finansal/lifecycle senaryoları (PR2) — smoke gate DIŞINDA (PR smoke süresini büyütmez); `pnpm e2e:regression` |
| `prod-smoke` | `@prod-smoke` | Desktop Chromium | **anonim** (storageState/setup YOK) | — | Post-deploy, güvenli/read-only, hedef ortama karşı |
| `store-admin-setup` | — | — | gerçek UI login (store-admin) | — | `tests/e2e/.auth/store-admin.json` storageState üretir (ADR-288) |
| `admin-smoke` | `@admin-smoke` | Desktop Chromium | store-admin storageState | `store-admin-setup` | Shopping Balance Admin salt-okunur READ smoke (liste + KPI); **required gate** (e2e `smoke` job'ında koşar) |
| `admin-regression` | `@admin-regression` | Desktop Chromium | store-admin storageState | `store-admin-setup` | Shopping Balance Admin mutation regresyonu (grant + persistence + cross-store izolasyon); smoke gate DIŞINDA; `pnpm e2e:admin-regression` |

> **Store-admin E2E (ADR-288).** İlk store-admin Playwright kapsamı. `baseURL = STORE_ADMIN_URL`
> (`E2E_STORE_ADMIN_URL`, CI'da `http://localhost:3110`). CI'da branch checkout'undan build eden
> `store-admin-web-e2e` servisi (:3110, gateway tenant `STORE_ADMIN_STORE_SLUG=e2e-store`, `ADMIN_COOKIE_SECURE=false`)
> ayağa kalkar; `admin-smoke` required `smoke` job'ının bir adımıdır. Lokal: `pnpm e2e:store-admin`
> (host `next dev :3110`, branch kodunu servis eder — storefront `pnpm e2e:storefront` deseniyle aynı;
> docker store-admin build context'i main olduğundan branch route/sayfaları docker'da yoktur).

`workers: 1` — tüm smoke/responsive testleri **aynı** e2e müşterisinin DB-tabanlı (server-authoritative)
sepetini paylaşır (`tests/e2e/fixtures/cart.ts`); `fullyParallel: false` yalnız dosya-içi sırayı
garanti eder, dosyalar-arası izolasyonu sağlamaz — bu yüzden `workers: 1` şart. Bu, bilinen bir
paralellik maliyetidir (bkz. `docs/TECHNICAL_DEBT.md` "per-worker cart isolation").

`retries: process.env.CI ? 2 : 0`. `reporter`: `list` + `html` (CI'da ek `github`). `trace:
"on-first-retry"`, `screenshot: "only-on-failure"`, `video: "on-first-retry"`.

### 2.2 npm/pnpm script'leri

```
pnpm e2e:install       # playwright install --with-deps chromium
pnpm e2e:smoke         # playwright test --project=smoke (setup önce koşar, dependency)
pnpm e2e:responsive    # playwright test --project=responsive
pnpm e2e:regression    # playwright test --project=regression (PR2 finansal/lifecycle senaryoları)
pnpm e2e:admin-smoke      # playwright test --project=admin-smoke (Shopping Balance Admin READ smoke; store-admin-setup önce koşar)
pnpm e2e:admin-regression # playwright test --project=admin-regression (grant + persistence + izolasyon)
pnpm e2e:store-admin      # host next dev :3110 (branch store-admin; gateway tenant STORE_ADMIN_STORE_SLUG=e2e-store)
pnpm e2e:prod-smoke    # playwright test --project=prod-smoke
pnpm e2e:report        # playwright show-report (son HTML raporunu açar)
pnpm e2e:storefront    # host `next dev --port 3100`, e2e-store env'iyle (yerel storefront servisi)
pnpm db:seed-e2e       # e2e-store fixture'ını seed eder (idempotent)
pnpm db:cleanup-e2e    # e2e-* prefix'li veriyi temizler (APP_ENV guard'lı)
```

### 2.3 Ortam değişkenleri

| Değişken | Varsayılan | Zorunlu mu | Not |
| --- | --- | --- | --- |
| `E2E_STOREFRONT_URL` | `http://localhost:3100` | hayır | `smoke`/`responsive`/`prod-smoke` baseURL'i |
| `E2E_GATEWAY_URL` | `http://localhost:4000` | hayır | api-gateway (fixture/api yardımcıları için) |
| `E2E_STORE_ADMIN_URL` | `http://localhost:3002` | hayır | store-admin (ileride kullanım için ayrılmış) |
| `E2E_PROD_PRODUCT_SLUG` | — | **evet (yalnız `prod-smoke`)** | PDP kontrolü hedefi; eksikse **açık config error** (fail-loud, silent fallback yok) |
| `E2E_PROD_CATEGORY_SLUG` | — | hayır (`prod-smoke`) | PLP kontrolü; eksikse ilgili test **görünür `test.skip`** ile atlanır |
| `E2E_PROD_SEARCH_TERM` | — | hayır (`prod-smoke`) | Arama kontrolü; eksikse görünür `test.skip` |

Boş string de "tanımsız" sayılır (`env.ts` `.trim()` uygular) — `E2E_PROD_PRODUCT_SLUG=""` de
`requiredEnv` hatası fırlatır. prod kategori/arama rotaları: **`/products?category=<slug>`** ve
**`/products?q=<term>`** (ikisi de aynı PLP rotası — `/discovery` ve `/t/:token` bunun için
KULLANILMAZ, bkz. `tests/e2e/prod-smoke/prod-read.spec.ts` üst yorumu).

## 3. Local çalıştırma (adım adım)

**Kritik store-runtime notu:** storefront tek-mağazalıdır (`STOREFRONT_DEMO_STORE_SLUG`). Docker
`storefront-web` servisi kaynağı **volume mount etmez** — build context her zaman ana repodur, bu
yüzden worktree'deki değişiklikler o servise yansımaz. Bu nedenle **local E2E storefront'u host
`next dev` ile :3100'de çalıştırılır** (worktree kodunu servis eder, `e2e-store` slug'ıyla). CI'da
aynı rolü `infra/docker/docker-compose.e2e.yml` içindeki `storefront-web-e2e` servisi görür (CI branch
checkout'undan build eder). İkisi de aynı `E2E_STOREFRONT_URL=http://localhost:3100` hedefine çalışır.
enterprise-demo (:3000) hiçbir E2E adımında dokunulmaz.

1. **Docker stack'i ayağa kaldır** (postgres/redis/api-gateway/worker) — `infra/docker/docker-compose.yml`
   üzerinden mevcut geliştirme akışınla (örn. `docker compose -f infra/docker/docker-compose.yml up -d
   postgres redis api-gateway worker`).
2. **Fixture'ı seed et:**
   ```
   pnpm db:seed-e2e
   ```
   İzole `e2e-store` (test müşterisi `e2e-customer@example.test`, ürünler `e2e-tshirt`/`e2e-mug`,
   kupon `E2E10`, bir `CustomerAddress`, seed siparişler `e2e-order-1001` + PR2 `e2e-order-2001`
   [reorder invariant: tshirt M × 2], PR2 goodwill kredi grant [Alışveriş Bakiyem] ve 2 `ReturnRequest`
   [`e2e-return-1001`/`e2e-return-1002`, farklı refund destination]) kurar/upsert'ler. Idempotent —
   iki kez koşmak duplicate üretmez (`APP_ENV=test` guard'lı; `docker exec -e APP_ENV=test`).

   > **Local gotcha (worktree seed değişikliği):** `db:seed-e2e`, **çalışan** `api-gateway` container'ı
   > içinde `node packages/db/scripts/e2e-seed.mjs` çalıştırır — container ana repo kodunu taşır, worktree
   > değişikliğini GÖRMEZ (docker `storefront-web` gotcha'sıyla aynı sebep). Worktree'de seed'i düzenlediysen
   > önce dosyayı container'a kopyala, sonra çalıştır:
   > ```
   > docker compose -f infra/docker/docker-compose.yml cp packages/db/scripts/e2e-seed.mjs api-gateway:/app/packages/db/scripts/e2e-seed.mjs
   > pnpm db:seed-e2e
   > ```
   > CI'da bu gerekmez (`docker-compose.e2e.yml` branch checkout'undan build eder).
3. **Local storefront'u ayrı bir terminalde başlat:**
   ```
   pnpm e2e:storefront
   ```
   Host `next dev --port 3100`, worktree kodunu `e2e-store` slug'ıyla servis eder.
4. **Smoke suite'ini koştur:**
   ```
   pnpm e2e:smoke
   ```
   Önce `setup` projesi gerçek UI login yapıp storageState üretir, sonra `smoke` projesi koşar.
   Responsive subset için `pnpm e2e:responsive` (aynı `setup`'a bağlıdır, ayrıca çalıştırılabilir).
5. **Raporu incele (opsiyonel):**
   ```
   pnpm e2e:report
   ```
6. **Temizlik:**
   ```
   pnpm db:cleanup-e2e
   ```
   `e2e-` prefix'li verileri siler; `APP_ENV` guard'lıdır (yalnız `development`/`test`/undefined) —
   **asla production'da çalışmaz**.

## 4. CI

`.github/workflows/e2e.yml` (`e2e` workflow'u, `smoke` job'u):

1. checkout → pnpm/action-setup → setup-node(20, pnpm cache) → `pnpm install --frozen-lockfile`.
2. `pnpm db:generate` (Prisma client).
3. `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.e2e.yml up -d
   postgres redis api-gateway worker storefront-web-e2e` — base `storefront-web` servisi **kasıtlı
   olarak başlatılmaz**; onun yerine branch checkout'undan build eden `storefront-web-e2e` (:3100)
   kullanılır.
4. Health bekleme (`:4000/health`, `:3100/api/health`).
5. `pnpm db:migrate` (fresh CI postgres'te şema yok — seed'den önce zorunlu).
6. `pnpm db:seed-e2e`.
7. `pnpm exec playwright install --with-deps chromium`.
8. `pnpm e2e:smoke` — **bu adımın başarısızlığı merge'i BLOKE eder** (required check).
9. Yalnız başarısızlıkta artifact yükle: `playwright-report/` + `test-results/` (trace/screenshot/
   video). `tests/e2e/.auth/` (gerçek oturum cookie'si — secret) ve env **asla** artifact'a girmez.
10. `if: always()` cleanup: `pnpm db:cleanup-e2e` + `docker compose ... down -v` (best-effort).

**Required status check:** context adı **`smoke`** (workflow adı `e2e` + job adı `smoke`). Bu
workflow'u eklemek onu otomatik olarak branch-protection'da required yapmaz — repo-admin ayrı bir adımda
main branch protection/ruleset'ine bu context'i eklemelidir (bkz. `docs/TECHNICAL_DEBT.md`
"required-status-check governance").

**Production/post-deploy:** aynı repo, `prod-smoke` projesi, hedef ortamın `E2E_STOREFRONT_URL` +
`E2E_PROD_PRODUCT_SLUG` (+ opsiyonel category/search) ile ayrı bir adım/job olarak koşar — seed/cleanup
yok, anonim, read-only.

## 5. StorageState

`tests/e2e/setup/auth.setup.ts` gerçek `/auth/login` formunu kullanır (email+password, seed'deki test
müşterisi), `/account` redirect'ini bekler, gerçek `commerce_os_customer_session` cookie'sinin
oluştuğunu doğrular, sonra `page.context().storageState({ path: "tests/e2e/.auth/customer.json" })` ile
kaydeder. `smoke` ve `responsive` projeleri bu dosyayı reuse eder (`dependencies: ["setup"]`). Bypass
veya sahte session **yoktur** — her koşuda gerçek login akışı çalışır. `.auth/` git-ignore'dur ve CI
artifact'ına asla dahil edilmez.

## 6. Fixture'lar ve izolasyon

- **Deterministik seed** (`packages/db/scripts/e2e-seed.mjs`, `db:seed-e2e`): izole `e2e-store`
  (test müşterisi, çok-varyantlı ürün `e2e-tshirt` + basit ürün `e2e-mug`, kupon `E2E10`, bir
  `CustomerAddress`, seed sipariş `e2e-order-1001`). Deterministik id/slug/sku sabitleri
  `tests/e2e/fixtures/ids.ts` içinde tanımlıdır — testler bu literal'lere birebir bağımlıdır.
- **Yazma-yolu (write-path) verisi test içinde üretilir** — sepete ekleme, kupon uygulama gibi
  mutasyonlar testin kendi akışında oluşur, seed'e önceden gömülmez.
- **Sepet izolasyonu:** auth müşteri sepeti DB-tabanlı (server-authoritative) ve suite boyunca aynı
  storageState'i paylaşan tüm testler arasında **kalıcıdır**. Bu yüzden sepet dokunan testler
  `beforeEach`'te `tests/e2e/fixtures/cart.ts` `clearCart(page)` yardımcısıyla sepeti boşaltır
  (`/cart`'a gider, `cart-line` kalmayana kadar `cart-line-remove`'a tıklar; web-first `toHaveCount`
  polling — sleep yok).
- **Cleanup:** `pnpm db:cleanup-e2e` (`packages/db` `db:cleanup-smoke` script'i, `e2e-` prefix'i dahil)
  — `APP_ENV` guard'lı, prod'da asla çalışmaz.

## 7. 8 çekirdek smoke senaryosu (PR1, `@smoke`)

Her senaryo yalnız "sayfa açıldı" değil, **iş sonucunu** assert eder: DB-backed persistence, doğru
variant/qty/fiyat/cart count, refresh sonrası state korunumu, ham enum sızmaması, console/runtime
hatası olmaması.

1. **Auth/login/session** (`01-auth-session.spec.ts`) — login → `/account`, storageState reuse.
2. **PDP variant seçimi** (`02-pdp-variant.spec.ts`) — çok-varyantlı üründe variant seçimi → doğru
   fiyat/SKU reaktif.
3. **Add-to-cart** (`03-add-to-cart-badge.spec.ts`) — seçili variant + qty sepete eklenir.
4. **Header cart badge** — aynı test dosyasında, ekleme sonrası badge count doğrulanır.
5. **Cart refresh/persistence** (`04-cart-persistence.spec.ts`) — reload sonrası sepet aynı kalır
   (cookie/DB-backed).
6. **Coupon apply/remove + repricing** (`05-coupon-repricing.spec.ts`) — claim→kullan ile indirim
   uygulanır, kaldırınca eski toplam geri gelir.
7. **Cart → checkout canonical identity** (`06-cart-checkout-identity.spec.ts`) — sepetteki satır/
   qty/fiyat/toplam checkout'takiyle birebir eşleşir.
8. **Order list/detail** (`07-order-list-detail.spec.ts`) — seed sipariş listede görünür, detay doğru
   kalem/tutar gösterir, ham enum yok.

**PR2 kapsamı** (bu suite'te henüz YOK — bkz. `docs/TECHNICAL_DEBT.md`): reorder/BUG-CART-006
invariant, shopping-balance-only ödeme, mixed balance+external ödeme, cancellation, return, refund
ORIGINAL_PAYMENT, refund SHOPPING_BALANCE, İadelerim, Alışveriş Bakiyem, wishlist, ürün review,
order-experience review.

## 8. Flakiness policy

- Arbitrary `sleep`/`waitForTimeout` **yasak** — Playwright'ın web-first `expect` polling'i (auto-wait)
  kullanılır.
- `retries: CI ? 2 : 0`. Retry ile geçen flaky test raporda görünür kalır (html + github reporter) —
  sessizce yutulmaz.
- Flaky testi **skip ederek gate'i yeşile çevirmek yasaktır**. Kök neden düzeltilmeden kalıcı skip yok.
- Bir test benign olmayan bir `console`/`pageerror` üretirse test kırmızı olmalıdır (bkz. `07-order-
  list-detail.spec.ts`, `prod-read.spec.ts` gibi senaryolardaki raw-enum/console kontrolleri).

## 9. Definition of Done (yeni feature standardı)

ADR-287 kararının operasyonel karşılığı:

1. Backend/unit/integration testleri yazılır ve yeşildir.
2. Kısa **exploratory** browser smoke ile ilk-elden doğrulama yapılır (Claude veya geliştirici elle
   gezinir).
3. Kritik kullanıcı davranışı varsa (yeni akış, mevcut akışta regresyon riski) **kalıcı Playwright
   testi** yazılır (`tests/e2e/smoke/` veya ilgili proje).
4. Playwright smoke yeşildir (`pnpm e2e:smoke`).
5. CI yeşildir (`ci.yml` + `e2e.yml`).
6. Ship.

**Yeni feature standardı — önemli netleştirme:** Claude'un uzun manuel 4-viewport
(375/768/1024/1440) click-through'u **artık default gate değildir**. Yalnız şu durumlarda kullanılır:
yeni veya karmaşık UX'in ilk-elden keşfi, ya da Playwright'in henüz kapsamadığı bir alanda exploratory
doğrulama. Kalıcı, tekrarlanabilir regresyon garantisi Playwright suite'inden gelir (bkz. ADR-287).

## 9b. Product Support (ADR-289 / TODO-177) test kapsamı

- **Unit (api-gateway):** `product-support-{warranty,question-engine,resolution,sla,status-map,notification,seed-graphs}.test.ts`
  (saf modüller; `sla` içinde TD-177-2 `liveSlaSnapshot`/`isLiveCycleAtSlaRisk`).
- **Integration (api-gateway, `commerce_os_test`):** `product-support-service.integration.test.ts` — ownership/snapshot/
  concurrency/resolver/lifecycle/reopen/isolation/attachment/notification/domain-unaffected + **TD-177-2 live-cycle SLA
  risk (4)** + admin assignment cross-store reject (3).
- **Component/BFF:** storefront `test/support-*.test.ts(x)` (flow/wizard reducer/labels/actions/attachment-proxy/detail
  render/line-cta) + store-admin `test/ticket-labels.test.ts` + admin-web question-set testleri.
- **Contracts:** `customer-account.test.ts` (orderLineId), support Zod şemaları.
- **E2E (Playwright):** storefront `regression/03-product-support.spec.ts` (`@regression` ×4: order-line CTA→guided
  self-service→ticket YOK / escalate→ticket / RESOLVED reopen / list raw-enum-leak yok); store-admin
  `admin-regression/02-product-support.spec.ts` (`@admin-regression` ×1: inbox→detail→context/SLA→assign me→reply).
  Mutation-heavy testler `@regression`/`@admin-regression` (smoke'a değil). Seed: `e2e-seed.mjs` support bloğu
  (7 published DEFAULT question-set + topic defaults + warranty + DELIVERED shipment + RESOLVED ticket S900001; idempotent).

## 9c. Store → Platform Request (ADR-290 / TODO-178) test kapsamı

- **Config (saf):** `packages/config/test/platform-request-{sla-policy,taxonomy}.test.ts` (SLA policy + category
  seed TEK KAYNAK).
- **Unit (api-gateway):** `platform-request-{sla,status-map,serialize,notification}.test.ts` — `status-map`
  (evaluateTransition/Close/Reopen), `serialize` (AYRI store/platform projeksiyon; INTERNAL store'a sızmaz;
  attachment + timeline allowlist), `notification` (honest UNCONFIGURED + assign→notify).
- **Integration (api-gateway, `commerce_os_test`):** `platform-request-service.integration.test.ts` (38) —
  create/list/detail/reply/withdraw/confirmClose/reopen + assign/priority/status/recategorize +
  store-visible timeline (INTERNAL sızmaz) + slaRisk live-cycle (historical false-positive yok) + assignee
  directory + cross-store scope + attachment (STORE_VISIBLE serve 200 / INTERNAL store 404) + MEDIA_IN_USE.
- **Component/BFF:** store-admin `test/platform-requests-{create,detail,list,bff}.test.tsx` (+ module-guard
  PLATFORM_REQUESTS nav) + admin-web `test/platform-requests-{ui,bff-security}.test.tsx`.
- **Contracts:** `platform-request-contracts.test.ts` (store/platform DTO + action + category Zod).
- **E2E (Playwright, cross-app store-admin ↔ admin-web):** `platform-requests/01-canonical-lifecycle.spec.ts`
  (`@platform-smoke`: store create→PR-######→platform inbox/assign/priority/status/visible+internal→store
  visibility+INTERNAL non-leak→reply→resolve→store confirm-close→CLOSED); `02-visibility-attachments.spec.ts`
  (`@platform-regression`: foto upload+serve 200 / INTERNAL store non-leak + serve 404 / capability nav);
  `03-assignment-sla-reopen.spec.ts` (`@platform-regression`: searchable assign + inbox filter + no raw id +
  SLA labels + RESOLVED→reopen fresh cycle). **admin-web İLK KEZ E2E'ye girdi** (`admin-web-e2e` :3120 servisi
  + `platform-admin-auth.setup.ts`). Cross-context ilk-okuma `reloadUntil` helper ile deterministik
  (client-mount tek-atış fetch + ms-yarışı; flake gizleme değil). `@platform-smoke` CI required; regression
  nightly/manuel `pnpm e2e:platform-regression`. Seed: `e2e-seed.mjs` `e2e-agent@example.test` (SUPPORT_ADMIN,
  login yok — AssigneeSelector hedefi; kategoriler migration'dan). **repeat-each=3 → 17/17.**

## 10. İlgili dokümanlar

- [ADR-287](adr/ADR-287-playwright-e2e-release-gate.md) — karar ve gerekçe.
- `docs/DECISIONS.md` — ADR-287 özeti.
- `docs/TECHNICAL_DEBT.md` — PR2 kalan senaryolar + diğer açık borçlar.
- `docs/ROADMAP.md` — TODO-176 durumu.
- `tests/e2e/README.md` — hızlı başlangıç (bu dokümana pointer).
- `docs/superpowers/specs/2026-08-09-todo-176-e2e-regression-suite-design.md` — orijinal tasarım spec'i.

## 11. Perf regresyon muhafızı (`perf` projesi — PERF-001)

`tests/e2e/perf/` altında **`@perf`** tag'li kaba (wall-clock) navigasyon gecikmesi muhafızı;
`pnpm e2e:perf` (`--project=perf`). **Required smoke gate'in DIŞINDA** — wall-clock varyansı merge'i
gereksiz bloke etmesin diye bilinçli olarak `e2e.yml` required job'una eklenmedi (manuel/nightly).

Tasarım (flaky olmadan anlamlı): (1) her rota önce warm-up ile derlenir — `next dev` cold compile
ölçüm dışı; (2) her akış 3 kez ölçülür ve **MEDIAN** bütçeyle kıyaslanır — tek seferlik bellek/GC
spike'ı median'ı bozmaz ama sürekli 4–5 s regresyon yakalanır; (3) cömert bütçe **6000 ms**
(`PERF_NAV_BUDGET_MS` ile override). Akışlar: home load, PLP load, **PLP→PDP tıklama** (kullanıcının
bildirdiği tam akış). Bkz. `docs/analysis/PERF-001-navigation-latency.md`.

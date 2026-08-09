# Shopping Balance Admin (Müşteri Bakiye Yönetimi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Store Admins a centralized, drill-down Finance surface (`Finans > Alışveriş Bakiyesi`) to view every customer's shopping-balance account, inspect lots + ledger, and grant goodwill credit — reusing the canonical customer-credit domain, never re-implementing balance math.

**Architecture:** New **read** projections in the existing `apps/api-gateway/src/customer-credit/` domain (raw parameterized SQL for the per-customer aggregate list + a store-wide KPI summary reusing the canonical live-lot predicate; typed queries for lots/ledger detail). New Fastify routes under `/stores/:storeId/shopping-balance` guarded by `requireStorePlatformAdmin`. New store-admin-web BFF routes + api-client methods + two client pages built on the ADR-089 Data Grid kit. Goodwill grant reuses the existing `issueCredit` path/endpoint; no new financial write path is introduced.

**Tech Stack:** TypeScript, Fastify (api-gateway), Prisma/Postgres, Next.js App Router (store-admin-web), `@commerce-os/api-client`, `@commerce-os/contracts`, ADR-089 Data Grid, Playwright.

## Global Constraints

- All money is **minor-unit `BigInt`**; serialize across HTTP as **decimal strings**, never JS numbers. No floating point anywhere.
- **Balance authority = Σ live-lot `remainingAmountMinor`** where `status='ACTIVE' AND remainingAmountMinor > 0 AND (expiresAt IS NULL OR expiresAt > now)`. Never derive available balance from the ledger, from `cachedAvailableMinor`, or from the client.
- KPI financial semantics MUST match the existing finance report (`apps/api-gateway/src/customer-credit/report.ts`): reuse the same live-lot predicate and the same ledger-type buckets.
- Every gateway query threads `storeId` as the first `where`/SQL predicate. Guard = `requireStorePlatformAdmin`. Cross-store access must be indistinguishable from not-found (no leak).
- Trust nothing from the client for balance/source/amount authority — the client sends only `customerId`, grant amount, reason, expiryDays; the server re-derives everything else.
- Goodwill grant: **expiring only** (30/60/120/180 days). Manual non-expiring goodwill is forbidden. Refund-origin non-expiring stays exclusively on refund-system paths.
- **No new balance-reduction (debit) path** in this PR: the safe SUPER_ADMIN debit (`adminAdjustBalance`, `ADMIN_ADJUSTMENT_DEBIT`) already exists; a dedicated reduction surface is deferred to TECHNICAL_DEBT.
- Prisma models `CustomerCreditAccount/Lot/LedgerEntry` and `Customer` have **no `@@map`** → raw SQL uses double-quoted PascalCase identifiers (`"CustomerCreditLot"`, `"remainingAmountMinor"`, etc.).
- Enum values (verbatim): `CreditLedgerType` = `ADMIN_GOODWILL_CREDIT, RECOVERY_GOODWILL_CREDIT, ORDER_PAYMENT_DEBIT, ORDER_CANCELLATION_RESTORE, REFUND_RESTORE, ADMIN_ADJUSTMENT_CREDIT, ADMIN_ADJUSTMENT_DEBIT, EXPIRE, RETURN_CREDIT_RESTORE`. Goodwill `CreditSourceType` = `ADMIN_GOODWILL, RECOVERY_GOODWILL`. Refund-origin `CreditSourceType` = `ORDER_REFUND, ORDER_CANCELLATION, ORDER_RETURN`.
- Expiring-soon window default = **30 days** (constant `EXPIRING_SOON_DEFAULT_DAYS`, overridable via query `expiringWithinDays`).

## Column / bucket semantics (canonical — document in ADR)

Per-customer aggregates (single currency per account). Lifetime buckets come from `CustomerCreditLedgerEntry` grouped by type; balance buckets come from live lots.

| Field | Source | Definition |
|---|---|---|
| `availableMinor` (Kullanılabilir) | live lots | Σ remaining under the live-lot predicate |
| `issuedMinor` (Toplam yüklenen) | ledger | Σ of **all CREDIT-direction** entries lifetime (goodwill + refund-origin + restored + adjustment-credit) |
| `spentMinor` (Harcanan) | ledger | Σ `ORDER_PAYMENT_DEBIT` |
| `refundOriginMinor` (İade kaynaklı) | ledger | Σ `REFUND_RESTORE` |
| `restoredMinor` (Restore edilen) | ledger | Σ (`ORDER_CANCELLATION_RESTORE` + `RETURN_CREDIT_RESTORE`) |
| `goodwillMinor` (Goodwill / telafi) | ledger | Σ (`ADMIN_GOODWILL_CREDIT` + `RECOVERY_GOODWILL_CREDIT`) |
| `expiredMinor` (Süresi dolan) | ledger | Σ `EXPIRE` |
| `nearestExpiryAt` (En yakın son kullanım) | live lots | MIN(`expiresAt`) over live lots with non-null expiry |
| `lastMovementAt` (Son hareket) | ledger | MAX(`createdAt`) |

Store-wide KPI summary (filter-independent):

| KPI | Definition |
|---|---|
| `outstandingLiabilityMinor` | Σ remaining over all live lots (store) — matches `report.ts` |
| `customersWithBalance` | distinct `customerId` over live lots |
| `goodwillBalanceMinor` | Σ remaining over live lots where `sourceType ∈ {ADMIN_GOODWILL, RECOVERY_GOODWILL}` |
| `refundOriginBalanceMinor` | Σ remaining over live lots where `sourceType ∈ {ORDER_REFUND, ORDER_CANCELLATION, ORDER_RETURN}` |
| `expiringSoonMinor` | Σ remaining over live lots where `expiresAt` in `(now, now + expiringWithinDays]` |

---

## File Structure

**api-gateway (new):**
- `apps/api-gateway/src/customer-credit/admin-projection.ts` — pure/DB projections: `listCustomerBalances`, `shoppingBalanceSummary`, `getCustomerBalanceDetail` (lots + buckets + ledger). Owns the raw SQL.
- `apps/api-gateway/src/customer-credit/admin-routes.ts` — `registerShoppingBalanceAdminRoutes(app, deps)`: `GET /stores/:storeId/shopping-balance`, `GET /stores/:storeId/shopping-balance/:customerId`.

**api-gateway (modify):**
- `apps/api-gateway/src/server.ts` — wire `registerShoppingBalanceAdminRoutes` next to `registerCustomerCreditAdminRoutes` (~:7883), passing `{ prisma, requireStoreAdmin: requireStorePlatformAdmin-wrapper }`.

**contracts (modify):**
- `packages/contracts/src/index.ts` — add `shoppingBalanceListQuerySchema`, `ShoppingBalanceRowDto`, `ShoppingBalanceSummaryDto`, `ShoppingBalanceListResponseDto`, `ShoppingBalanceDetailDto` (lot + ledger + summary). Reuse `resolveAdminListPage`/`buildAdminListPagination`.

**api-client (modify):**
- `packages/api-client/src/index.ts` — add `admin.shoppingBalance.list(storeId, token, query)` and `.detail(storeId, token, customerId)`.

**store-admin-web (new):**
- `apps/store-admin-web/app/(app)/finance/shopping-balance/page.tsx` — list + KPI cards (Suspense-wrapped).
- `apps/store-admin-web/app/(app)/finance/shopping-balance/[id]/page.tsx` — detail: summary + lots table + ledger timeline + grant modal.
- `apps/store-admin-web/app/api/finance/shopping-balance/route.ts` — BFF list.
- `apps/store-admin-web/app/api/finance/shopping-balance/[id]/route.ts` — BFF detail.

**store-admin-web (modify):**
- `apps/store-admin-web/components/store-nav.tsx` — add nav item to the Finance group (~:196-203).
- `apps/store-admin-web/lib/client/api.ts` — `storeApi.listShoppingBalances`, `storeApi.getShoppingBalanceDetail` (grant reuses existing `issueCustomerCredit`).
- `apps/store-admin-web/lib/server/list-query.ts` — add `SHOPPING_BALANCE_LIST_KEYS`.
- `packages/i18n/src/locales/{tr,en}/storeAdmin.ts` — labels (human-readable TR ledger/source/status labels; no raw enums).

**Tests (new):**
- `apps/api-gateway/test/shopping-balance-admin.test.ts` — projection + route integration tests.
- `packages/db/scripts/e2e-seed.mjs` (modify) — add a **second store** (`e2e-store-2`) + a distinct credit account for cross-store isolation; ensure a store-admin platform user + credential exists for `e2e-store`.
- `tests/e2e/setup/store-admin-auth.setup.ts` (new) — first store-admin login → `tests/e2e/.auth/store-admin.json`.
- `playwright.config.ts` (modify) — `store-admin-setup` + `admin-regression`/`admin-smoke` projects (baseURL = store-admin app).
- `tests/e2e/regression/03-shopping-balance-admin.spec.ts` (new) — `@regression` suite.
- `tests/e2e/smoke/09-shopping-balance-admin.spec.ts` (new) — one fast `@smoke` read test.

---

### Task 1: Per-customer balance list projection (raw SQL)

**Files:**
- Create: `apps/api-gateway/src/customer-credit/admin-projection.ts`
- Test: `apps/api-gateway/test/shopping-balance-admin.test.ts`

**Interfaces:**
- Consumes: Prisma client; enum constants above.
- Produces:
  ```ts
  export const EXPIRING_SOON_DEFAULT_DAYS = 30;
  export interface ShoppingBalanceListParams {
    storeId: string; currency?: string; now?: Date;
    search?: string; balancePositiveOnly?: boolean;
    source?: "GOODWILL" | "REFUND_ORIGIN"; expiringWithinDays?: number | null;
    sortBy?: "available" | "lastMovement" | "nearestExpiry" | "customer";
    sortOrder?: "asc" | "desc"; limit: number; offset: number;
  }
  export interface ShoppingBalanceRow {
    customerId: string; customerName: string | null; customerEmail: string | null; currency: string;
    availableMinor: bigint; issuedMinor: bigint; spentMinor: bigint;
    refundOriginMinor: bigint; restoredMinor: bigint; goodwillMinor: bigint; expiredMinor: bigint;
    nearestExpiryAt: Date | null; lastMovementAt: Date | null;
  }
  export async function listCustomerBalances(prisma, p: ShoppingBalanceListParams): Promise<{ rows: ShoppingBalanceRow[]; total: number }>;
  ```

**Design:** Single `$queryRaw` (`Prisma.sql`) with CTEs, base table `"CustomerCreditAccount"` (store-scoped), left-joined to a lot-aggregate CTE and a ledger-aggregate CTE and `"Customer"`. `now` bound as a parameter. `balancePositiveOnly` filters on the lot-agg available; `source` filter narrows via `EXISTS` over live lots of that source class; `expiringWithinDays` filter via live lots with `expiresAt` in window. `total` via `COUNT(*) OVER()` in the same query (read into row 0) OR a sibling count query with identical `where`. All identifiers double-quoted. All SUMs `COALESCE(...,0)::text` returned as strings then parsed to `bigint` in JS.

- [ ] **Step 1: Write failing tests** covering, against a seeded store: (a) row available == Σ live-lot remaining and excludes an expired lot; (b) goodwill vs refund-origin buckets split correctly; (c) `balancePositiveOnly` drops zero-balance accounts; (d) `search` matches customer email/name; (e) pagination `total` correct; (f) sort by `available desc`; (g) non-expiring lot has `nearestExpiryAt = null` but still counts in available; (h) rows are strictly store-scoped (a second store's account never appears).
- [ ] **Step 2: Run** `pnpm --filter @commerce-os/api-gateway test shopping-balance-admin` → FAIL (module missing).
- [ ] **Step 3: Implement** `admin-projection.ts` `listCustomerBalances` with the CTE query above; parse bigints; map to `ShoppingBalanceRow`.
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** `feat(shopping-balance): per-customer balance list projection`.

### Task 2: Store-wide KPI summary projection

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/admin-projection.ts`
- Test: `apps/api-gateway/test/shopping-balance-admin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ShoppingBalanceSummary {
    currency: string; outstandingLiabilityMinor: bigint; customersWithBalance: number;
    goodwillBalanceMinor: bigint; refundOriginBalanceMinor: bigint; expiringSoonMinor: bigint;
  }
  export async function shoppingBalanceSummary(prisma, p: { storeId: string; currency?: string; now?: Date; expiringWithinDays?: number }): Promise<ShoppingBalanceSummary>;
  ```

**Design:** Reuse the exact live-lot predicate. One aggregate query over live lots with conditional sums (`SUM(...) FILTER (WHERE ...)`) for goodwill/refund-origin/expiring-soon + `COUNT(DISTINCT "customerId")`. `outstandingLiabilityMinor` must equal `report.ts`'s value — assert this in the test by cross-checking against `creditReport(...).outstandingLiabilityMinor` on the same fixture.

- [ ] **Step 1: Write failing tests**: outstanding == `creditReport` outstanding on same fixture; goodwill+refund-origin balances split; expiring-soon respects window (lot expiring in 20d counted for window 30, excluded for window 14); non-expiring lot excluded from expiring-soon but included in outstanding; store isolation.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `shoppingBalanceSummary`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shopping-balance): store-wide KPI summary projection`.

### Task 3: Customer balance detail projection (lots + buckets + ledger)

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/admin-projection.ts`
- Test: `apps/api-gateway/test/shopping-balance-admin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CreditLotDetail {
    id: string; sourceType: string; originalAmountMinor: bigint; remainingAmountMinor: bigint;
    status: string; issuedAt: Date; expiresAt: Date | null; sourceId: string | null;
  }
  export interface CustomerBalanceDetail {
    customerId: string; customerName: string | null; customerEmail: string | null; currency: string;
    summary: Omit<ShoppingBalanceRow, "customerId" | "customerName" | "customerEmail">;
    lots: CreditLotDetail[]; ledger: CreditLedgerEntryView[]; // CreditLedgerEntryView from service.ts
  }
  export async function getCustomerBalanceDetail(prisma, p: { storeId: string; customerId: string; currency?: string; now?: Date; ledgerLimit?: number }): Promise<CustomerBalanceDetail | null>;
  ```

**Design:** Reuse `getCustomerBalance` (service.ts) for `availableMinor` + ledger entries (bump `entryLimit`, default 100). Add a typed Prisma `findMany` for `lots` (all lots for the account, ordered `expiresAt ASC NULLS LAST, createdAt ASC`). Reuse the per-customer bucket sums from Task 1's helper (extract a shared `customerBucketSums(prisma, storeId, customerId, currency)` used by both list and detail to stay DRY). Return `null` when the customer has no account in this store (route → 404, leak-free).

- [ ] **Step 1: Write failing tests**: detail summary buckets match the list row for the same customer; lots include an expired lot with `status EXPIRED`/excluded-from-available while still listed; ledger ordered newest-first; unknown customer → `null`; cross-store customer → `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `getCustomerBalanceDetail` + shared `customerBucketSums`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shopping-balance): customer balance detail projection`.

### Task 4: Contracts (DTO schemas)

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/api-gateway/test/shopping-balance-admin.test.ts` (schema round-trip asserts within the route tests of Task 5)

**Interfaces:**
- Produces Zod schemas + inferred DTOs (money as strings): `shoppingBalanceListQuerySchema` (search, balancePositive, source, expiringWithinDays, sort, page/pageSize via existing list helpers), `ShoppingBalanceRowDto`, `ShoppingBalanceSummaryDto`, `ShoppingBalanceListResponseDto = { data: Row[]; summary: Summary; pagination }`, `CreditLotDto`, `ShoppingBalanceDetailDto`.

- [ ] **Step 1:** Add schemas mirroring Task 1-3 interfaces; money fields `z.string()`; dates `z.string().datetime().nullable()`.
- [ ] **Step 2:** `pnpm --filter @commerce-os/contracts build` → PASS (typecheck).
- [ ] **Step 3: Commit** `feat(contracts): shopping-balance admin DTOs`.

### Task 5: Gateway routes

**Files:**
- Create: `apps/api-gateway/src/customer-credit/admin-routes.ts`
- Modify: `apps/api-gateway/src/server.ts`
- Test: `apps/api-gateway/test/shopping-balance-admin.test.ts`

**Interfaces:**
- Consumes: Task 1-4 projections + schemas; `resolveAdminListPage`, `buildAdminListPagination`; `requireStorePlatformAdmin`.
- Produces routes:
  - `GET /stores/:storeId/shopping-balance` → `{ data, summary, pagination }`
  - `GET /stores/:storeId/shopping-balance/:customerId` → `ShoppingBalanceDetailDto` (404 when projection returns null)

**Design:** `registerShoppingBalanceAdminRoutes(app, deps)` mirroring `registerCustomerCreditAdminRoutes`. Serialize bigints → strings via the contract schema `.parse`. Guard first, `storeParamSchema.parse`, `shoppingBalanceListQuerySchema.parse(query)`.

- [ ] **Step 1: Write failing route tests** (inject app): list returns paginated rows + summary; unauthenticated → 401/403; cross-store storeId → 404 leak-free; detail 404 for unknown customer; money fields are strings.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** routes + wire in `server.ts`.
- [ ] **Step 4: Run** full `shopping-balance-admin.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(shopping-balance): gateway admin routes`.

### Task 6: api-client methods

**Files:**
- Modify: `packages/api-client/src/index.ts`

**Interfaces:**
- Produces: `admin.shoppingBalance.list(storeId, token, query): Promise<ShoppingBalanceListResponseDto>` → `GET /stores/${storeId}/shopping-balance${buildQueryString(query)}`; `admin.shoppingBalance.detail(storeId, token, customerId): Promise<ShoppingBalanceDetailDto>`.

- [ ] **Step 1:** Add the `shoppingBalance` block next to `customerCredit`/`finance`; typecheck.
- [ ] **Step 2:** `pnpm --filter @commerce-os/api-client build` → PASS.
- [ ] **Step 3: Commit** `feat(api-client): shopping-balance admin methods`.

### Task 7: BFF routes + nav + client service

**Files:**
- Create: `apps/store-admin-web/app/api/finance/shopping-balance/route.ts`, `.../[id]/route.ts`
- Modify: `apps/store-admin-web/components/store-nav.tsx`, `apps/store-admin-web/lib/client/api.ts`, `apps/store-admin-web/lib/server/list-query.ts`

**Design:** BFF list mirrors `app/api/customers/route.ts` — `requireStoreContext`, `pickListQuery(searchParams, SHOPPING_BALANCE_LIST_KEYS)`, `createApiClient().admin.shoppingBalance.list(ctx.store.id, ctx.token, query)`. Detail mirrors `app/api/customers/[id]/route.ts`. Nav item appended to Finance group. `storeApi.listShoppingBalances` / `getShoppingBalanceDetail` call the BFF.

- [ ] **Step 1:** Add `SHOPPING_BALANCE_LIST_KEYS = ["search","balancePositive","source","expiringWithinDays","sortBy","sortOrder","page","pageSize"]`.
- [ ] **Step 2:** Implement BFF routes (`requireStoreContext` guard, allowlist query).
- [ ] **Step 3:** Add nav item `{ href: "/finance/shopping-balance", label: tr ? "Alışveriş Bakiyesi" : "Shopping Balance", icon: <PaymentIcon /> }`.
- [ ] **Step 4:** Add `storeApi` methods; typecheck store-admin-web.
- [ ] **Step 5: Commit** `feat(shopping-balance): store-admin BFF + nav + client service`.

### Task 8: List page (KPI cards + Data Grid)

**Files:**
- Create: `apps/store-admin-web/app/(app)/finance/shopping-balance/page.tsx`
- Modify: `packages/i18n/src/locales/{tr,en}/storeAdmin.ts`

**Design:** `"use client"` + `<Suspense>`. `useDataGridQuery<ShoppingBalanceFilters>({ basePath: "/finance/shopping-balance", sortOptions: ["available","lastMovement","nearestExpiry","customer"], defaultSortBy: "available", defaultSortOrder: "desc", filterKeys: ["balancePositive","source","expiringWithinDays"] })`. Columns per spec (money via `formatMinor`). KPI cards row above the grid from `response.summary`. Row action → link to `/finance/shopping-balance/${customerId}`. Empty/loading/error handled by `DataGrid` status. `data-testid` on rows (`shopping-balance-row`) + KPI (`kpi-outstanding`) for E2E.

- [ ] **Step 1:** Build page mirroring `customers/page.tsx`; add i18n labels (human-readable TR source/status).
- [ ] **Step 2:** `pnpm --filter @commerce-os/store-admin-web build` (or dev typecheck) → PASS.
- [ ] **Step 3: Commit** `feat(shopping-balance): admin list page with KPI cards`.

### Task 9: Detail page (summary + lots + ledger + grant modal)

**Files:**
- Create: `apps/store-admin-web/app/(app)/finance/shopping-balance/[id]/page.tsx`

**Design:** Summary cards (available + buckets). Lots table (source label, original, remaining, issued, expiry/"Süresiz", status, reference). Ledger timeline (human-readable TR label per `CreditLedgerType`, direction sign, amount, balanceAfter, date). **Grant modal** reuses existing `storeApi.issueCustomerCredit(customerId, { amountMinor, expiryDays, reason, internalNote, idempotencyKey })` (the same api-client path the customers detail page uses). Fields: amount, reason/note, expiry select 30/60/120/180. On success → refetch detail (balance updates immediately) + toast. Enforce client-side that expiry is one of the four (server is authority). No non-expiring option. No reduction control.

- [ ] **Step 1:** Build detail page + grant modal; raw enums never rendered (map to TR labels).
- [ ] **Step 2:** Typecheck/build → PASS.
- [ ] **Step 3: Commit** `feat(shopping-balance): admin customer detail + goodwill grant`.

### Task 10: E2E seed — store-admin user + second store

**Files:**
- Modify: `packages/db/scripts/e2e-seed.mjs`

**Design:** Ensure a **platform admin user + credential** that can log into the store-admin app for `e2e-store` (reuse existing platform-user seed if present; else add). Add a **second store `e2e-store-2`** with its own customer + a live credit lot, so cross-store isolation is assertable (its customer must never appear in `e2e-store`'s balance list). Idempotent upserts, `APP_ENV`-guarded like the rest.

- [ ] **Step 1:** Add seed rows; run `pnpm db:seed-e2e` against the docker stack → succeeds idempotently (twice).
- [ ] **Step 2: Commit** `test(e2e): seed store-admin user + second store for isolation`.

### Task 11: Playwright store-admin harness + tests

**Files:**
- Create: `tests/e2e/setup/store-admin-auth.setup.ts`, `tests/e2e/regression/03-shopping-balance-admin.spec.ts`, `tests/e2e/smoke/09-shopping-balance-admin.spec.ts`
- Modify: `playwright.config.ts`, `tests/e2e/fixtures/ids.ts` (add admin creds + store-2 fixture)

**Design:** New setup project performs a real store-admin UI login (login page `apps/store-admin-web/app/login/page.tsx`, cookie `commerce_os_store_admin_session`) → `tests/e2e/.auth/store-admin.json`. New `admin-regression` (grep `@regression-admin` or reuse `@regression` with `testDir` filter — use a distinct tag `@admin` to avoid running under the storefront project) and `admin-smoke` projects with `baseURL = STORE_ADMIN_URL`, `storageState = store-admin.json`, `dependencies: ["store-admin-setup"]`.

`@regression` admin tests (persistent): (1) list renders under Finans > Alışveriş Bakiyesi; (2) seeded customer + correct available balance shown; (3) drill into detail; (4) lots + ledger visible (no raw enums); (5) goodwill grant via modal; (6) balance increases immediately after grant; (7) balance persists after reload; (8) `e2e-store-2`'s customer absent from `e2e-store` list (cross-store leak-free).

One fast `@smoke` admin test: list page loads + KPI cards render + at least one row (read-only, deterministic).

- [ ] **Step 1:** Add config projects + setup + ids fixtures.
- [ ] **Step 2:** Write the `@regression` spec (mutation-heavy) + `@smoke` read spec.
- [ ] **Step 3:** Run locally (docker deps + `pnpm db:seed-e2e` + store-admin dev server on its port + storefront on :3100 as needed) → PASS twice (Run1/Run2).
- [ ] **Step 4: Commit** `test(e2e): shopping-balance admin regression + smoke`.

### Task 12: Docs, gate, ship

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/adr/ADR-XXX-shopping-balance-admin.md` (new), `docs/TESTING.md`, `docs/TECHNICAL_DEBT.md`, TODO tracker.

**Design:** New ADR documenting the read-only admin projection, the canonical live-lot predicate reuse, the column/bucket semantics table above, the KPI definitions, and the §5 decision (reduction deferred). TESTING.md: document the new store-admin Playwright projects + how to run. TECHNICAL_DEBT: add "dedicated admin-privileged shopping-balance reduction surface (reuse `adminAdjustBalance` debit) — future". ROADMAP/TODO: mark CLOSED & DEPLOYED after merge.

- [ ] **Step 1:** Full gate — `db:generate`, typecheck, lint, targeted tests Run1+Run2, build, `git diff --check`, Playwright regression + smoke.
- [ ] **Step 2:** Commit docs, push branch, open PR, wait for required CI (`smoke`), merge.
- [ ] **Step 3:** Deploy changed services only; post-deploy safe smoke.
- [ ] **Step 4:** Update docs to CLOSED & DEPLOYED; cleanup worktree.

---

## Self-Review

**Spec coverage:** §1 list → Tasks 1,5,7,8. §2 KPI → Tasks 2,5,8. §3 detail (lots/ledger) → Tasks 3,5,9. §4 grant → Task 9 (reuse). §5 reduction → deferred (documented, Task 12). §6 security → Global Constraints + Tasks 5,7 (guards, storeId scope, no client trust). Tests → Tasks 1-3,5,11. Playwright → Task 11. Gate/ship → Task 12. All covered.

**Type consistency:** `ShoppingBalanceRow` fields reused verbatim in `CustomerBalanceDetail.summary` (via `Omit`) and in contracts DTOs. `customerBucketSums` shared by Tasks 1 & 3. Enum lists identical across projection SQL and contracts.

**Open decision (defaulted, non-blocking):** expiring-soon window = 30 days.

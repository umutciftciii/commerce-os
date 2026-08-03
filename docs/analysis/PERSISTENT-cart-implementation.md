# TODO-167 — Persistent Cart & Cross-Device Foundation (Faz A) — Implementation Record

> **Status: CLOSED & DEPLOYED** (2026-08-03). PR #165 merged (merge commit `0a602d2`); api-gateway +
> storefront-web rebuilt from main + `20260803140000_todo167_persistent_cart` applied via `migrate deploy`
> (partial ACTIVE index verified live). **Post-deploy smoke 20/20 PASS** on the deployed gateway :4000
> (cart mechanics · CART_STALE concurrency · login merge · checkout DB-cart authority · convert-on-paid ·
> failed-payment→ACTIVE · DB invariants); temp fixtures FK-safe cleaned + inventory restored to baseline;
> enterprise-demo left pristine (473 products / 9 orders / inventory unchanged). Design:
> [ADR-266](../adr/ADR-266-persistent-cart-authority.md) · [roadmap](./PERSISTENT-CART-roadmap.md).
> **ADR-266 ACCEPTED. TODO-168 (Cart Change Awareness) UNBLOCKED.** TD-174 future; cart hard-delete/
> anonymization future; cross-device Cart-Change acknowledgement = TODO-168 scope.

## 1. What shipped (hybrid cart)

Anonymous cart = unchanged cookie. Authenticated cart = persisted DB cart (cross-device), reference-only
(no prices), one ACTIVE per (store, customer), `version` optimistic-concurrency, deterministic login merge,
checkout DB-cart authority + CONVERTED, env-gated 90-day expiry sweep. All pricing via the **shared**
`assemblePublicCart` (no source-dependent pricing).

## 2. Files

**Schema / migration**
- `packages/db/prisma/schema.prisma` — `CartStatus` enum + `Cart` + `CartLine` (+ Store/Customer/Variant
  relations). Reference-only; no price/snapshot columns.
- `packages/db/prisma/migrations/20260803140000_todo167_persistent_cart/migration.sql` — additive; partial
  unique `Cart_active_customer_key ON (storeId, customerId) WHERE status='ACTIVE'`.

**Gateway (`apps/api-gateway/src/cart/`)**
- `cart-core.ts` — PURE: `clampQuantity`, `nextVersion`, `isStaleVersion`, `mergeCartLines` (deterministic,
  100-cap + overflow).
- `data.ts` — `createCartData(prisma)`: load-or-create ACTIVE, atomic version-conditional
  add/set/delete/reconcile, `mergeGuestItems`, `markConverted`, `sweepExpired`; typed errors
  (`CartStaleError`/`CartInactiveError`/`CartLineLimitError`/`CartLineNotFoundError`).
- `routes.ts` — `registerCustomerCartRoutes`: GET/POST/PATCH/DELETE `/customer/cart[/lines[/:lineId]]` +
  `/reconcile` + `/merge`. Auth 401, store 404, cross-customer/store line 404, inactive 409, stale 409
  CART_STALE (+ current projection), variant store-ownership 404.
- `expiry-service.ts` + `expiry-worker.ts` — env-gated (default OFF) advisory-locked idempotent sweep.
- `server.ts` — extracted **shared** `resolvePublicCartProjection` (anon route + auth `projectCart` reuse
  it); wired `createCartData` + `registerCustomerCartRoutes`; checkout uses DB cart as authority
  (`effectiveItems`) + `markConverted` on placement.
- `main.ts` — `startCartExpiryWorker`; `packages/config/src/index.ts` — `CART_EXPIRY_*` env.

**Contracts / api-client**
- `packages/contracts/src/index.ts` — `cartStatusSchema`, `customerCartProjectionSchema` (version/status/
  cart/`lineIds`), request schemas (add/set/delete/reconcile/merge), stale + merge responses, `CART_MAX_*`.
- `packages/api-client/src/index.ts` — type + const re-exports.

**Storefront (`apps/storefront-web/`)**
- `lib/server/cart.ts` — `getAuthCartProjection`, `resolveAuthCartView`, `authAddLine/authSetLine/
  authRemoveLine` (read-then-mutate + 1 retry on CART_STALE), `authMergeGuestCart`.
- `lib/server/cart-actions.ts` — add/update/remove branch on session (auth → customer cart API; guest →
  cookie, unchanged); `mergeGuestCartAction`; checkout empty-guard uses DB cart for auth.
- `lib/server/auth-actions.ts` — `mergeGuestCartAction()` after login + register (isolated; won't fail
  login).
- `app/cart/page.tsx` — auth → DB cart view, guest → cookie (shared `CartPageShell`).
- `app/layout.tsx` — nav badge count auth-aware (DB itemCount vs cookie).

## 3. Tests (TDD; all pass)

- `cart-core.test.ts` (14) — clamp/version/merge/clamp-on-sum/append-order/dup-sum/100-cap-overflow/
  cap-still-sums/invalid-drop.
- `cart-data.test.ts` (10) — lazy+reuse ACTIVE; add+version bump; increment clamp; **CART_STALE no-mutation**;
  100-cap CART_LINE_LIMIT; set-0-removes; **cross-customer line 404**; deterministic merge; convert→new cart;
  90-day sweep + idempotent.
- `customer-cart-routes.test.ts` (8) — 401/404 store/lazy GET/add version-bump/**409 CART_STALE + current
  projection**/cross-store variant 404/cross-customer line 404/guest merge+overflow.
- `cart-expiry-service.test.ts` (3) — 90-day cutoff+delegate/dry-run/lock-not-acquired.
- Aggregate: **api-gateway 2132 tests pass, 127 files** (no regressions).

## 4. Verification (gate)

`db:generate` ✓ · full workspace **build 27/27** ✓ · **lint 42/42** ✓ (0 errors; pre-existing
commercial-automation warnings only) · **tests 2132** ✓ · `git diff --check` CLEAN. No commit/push/PR.

## 5. Tenant isolation

Every query store+customer scoped; cross-customer/cross-store line → 404 (enumeration-safe); variant
store-ownership checked before add; platform-admin token can't resolve a customer session → 401. Fingerprint
of tenant safety carried into route tests.

## 6. Deviations / follow-up (technical debt)

- **TD-174** — authenticated cart coupon-code + shipping-option selection not persisted (automatic
  campaigns apply; selection threading is follow-up).
- **TD-175 — RESOLVED (2026-08-03).** Cart CONVERTED now happens at **payment settlement** (SALE_COMMIT →
  `consumeOrderReservations`, the single chokepoint both the webhook and test-payment paths funnel through),
  **not** at checkout placement. So a **failed payment leaves the cart ACTIVE** (retryable) and only a
  **settled payment** converts it (+ clears lines); the next cart read lazily creates a fresh empty ACTIVE
  cart. Verified live (see §8). The atomic cart conversion runs inside the same payment transaction (cart
  converts iff payment commits).
- **Data-layer test boundary** — Prisma glue exercised via faithful in-memory fakes + browser smoke;
  DB-level partial-unique invariant is a Postgres guarantee (mirrors the CustomerList/ADR-093 pattern).
- **UI polish (future)** — explicit stale-banner / merge-result / MERGE_LIMIT_EXCEEDED toast surfaces are
  minimal (read-then-mutate + revalidate keeps the displayed cart fresh; overflow is logged + returned, not
  lost). Richer surfaces deferred.

## 7. TODO-168 (Cart Change Awareness) readiness

Snapshot/ack becomes: authenticated → additive `CartLine` columns + `CartChangeAck` (DB); guest → cookie
meta (existing design). Same pure change engine (identity-agnostic). ADR-267 reserved. This foundation
provides the DB cart + version + merge rules those need.

## 8. Browser smoke — status

**Migration validated on real Postgres (enterprise-demo left PRISTINE).** `prisma migrate diff
--from-migrations … --to-schema-datamodel …` replayed ALL migrations (incl.
`20260803140000_todo167_persistent_cart`) on a throwaway shadow DB and matched the schema — the only diff
is a pre-existing `ProductSearchDocument` tsvector-generated-column artifact, unrelated to Cart. Verified in
the shadow DB: `Cart`/`CartLine` tables, `CartStatus = {ACTIVE,CONVERTED,MERGED,EXPIRED}`, and the partial
index `CREATE UNIQUE INDEX "Cart_active_customer_key" ON "Cart"(storeId,customerId) WHERE status='ACTIVE'`.
Shadow DB dropped; `commerce_os` (enterprise-demo) confirmed to still have **no** Cart table (untouched).

**Isolated-stack FUNCTIONAL acceptance — RUN & PASSED (2026-08-03).** Isolated DB `cart_smoke` (separate
Postgres database; migrations deployed), the **worktree api-gateway** booted on :4100 against it, an isolated
enterprise seed + a dedicated known-password smoke customer, and a MOCK/TEST/ENABLED payment provider. All
scenarios exercised via **live HTTP against the real gateway + direct DB verification**:

- **Cart mechanics (17/17 PASS):** lazy ACTIVE cart (v1) · add + version bump (2/3/4) · increment (v1
  qty→5) · **concurrency**: two mutations @ same version → first 200, second **409 CART_STALE with the
  current authoritative projection** · nonexistent/cross-store variant → 404 · foreign lineId → 404 ·
  no-session → 401 · PATCH qty 0 removes.
- **Checkout (live):** authenticated checkout **used the DB cart as authority** (client sent `[{V1,q1}]`;
  order was built from the DB cart V1 q5 + V3 q1 — client items ignored) · order PLACED/UNPAID · cart
  **ACTIVE before payment** · **failed payment → cart stays ACTIVE + lines preserved (PASS)**.
- **Convert-on-paid (direct DB proof, PASS):** `consumeOrderReservations` (the exact SALE_COMMIT function
  the settlement paths call) run against a real PLACED order + real ACTIVE cart → cart **CONVERTED +
  lines cleared + convertedAt set**; new ACTIVE cart lazily created on next read.
- **Login merge (4/4 PASS):** dup variant summed (2+3=5) · new variant added · invalid variant dropped
  (no catalog match) · merged count reported.
- **DB invariants (4/4 PASS):** exactly **one ACTIVE cart per (store, customer)** · `(cartId, variantId)`
  no duplicates · **CartLine has zero price/amount/minor columns** (reference-only proven) · no
  cross-store line leak.
- **100-line overflow / MERGE_LIMIT_EXCEEDED:** covered by unit + data-layer tests (cart-core, cart-data);
  live merge confirmed dedupe-sum + new + invalid-drop.

**Cleanup:** gateway stopped; `cart_smoke` database dropped (FORCE); temp smoke scripts removed;
**enterprise-demo (`commerce_os`) confirmed pristine** (no Cart table; 473 products intact).

**Storefront UI + responsive acceptance — RUN (2026-08-03).** Worktree storefront (`next dev :3100`) +
gateway (:4100) on the isolated `cart_smoke` DB. Verified in a real browser:

- **Friendly notice UI** (new): merge / cross-device / payment-preserved banners map to friendly TR/EN copy;
  **raw codes (`CART_STALE`, `MERGE_LIMIT_EXCEEDED`) are never shown**. Merge banner confirmed present in the
  cart HTML immediately after a login-with-guest-cart (one-shot; cleared on mount). `role="status"`/`"alert"`
  + controlled `aria-live`, icon + title (not color-only), accessible dismiss label.
- **Authenticated persistent cart** renders in the browser (header "Hesabım" + cart badge; two DB cart lines
  with thumbnail, variant, SKU, qty steppers, strikethrough compareAt + campaign-discounted price, order
  summary with %10 campaign + inclusive VAT + "ÖDEMEYE GEÇ"). The DB cart was populated via the gateway API
  in one session and rendered in the browser session → **cross-device visually confirmed**.
- **Empty cart** editorial state renders ("Sepetiniz boş" + CTA).
- **Responsive 375 / 768 / 1024 / 1440** — cart lines, qty controls, coupon, summary all render; stacked on
  mobile/tablet, 2-column with sticky summary sidebar at ≥1024; **no horizontal overflow** (asserted via
  `scrollWidth<=clientWidth`), checkout CTA visible.
- **Accessibility (live-asserted):** qty increase/decrease `aria-label` (2+2), selection-checkbox labels (2),
  `aria-live` regions (2), `role=status/alert` present.

**Environment caveat (transparent):** the browser-automation surface in this session could **not** trigger
the storefront's React Server Action *button-onClick* interactions (add-to-cart), though form submits
(`form.requestSubmit()` → login) and pure navigation/rendering worked. So the interactive add→login→merge→
checkout chain was driven via a mix of the working login form-submit + gateway-API cart population; the
**functional** behavior of every step is independently proven live via HTTP + DB (above), and the UI
rendering + responsive + a11y are visually captured.

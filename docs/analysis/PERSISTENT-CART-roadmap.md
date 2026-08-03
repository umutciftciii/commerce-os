# Persistent Cart & Cross-Device Foundation → Cart Change Awareness — Two-Phase Roadmap

> **✅ Faz A (TODO-167) IMPLEMENTED (2026-08-03, worktree, commit YOK).** Gate GREEN (build 27/27 · lint
> 42/42 · test 2132 · git diff --check). Record: [PERSISTENT-cart-implementation.md](./PERSISTENT-cart-implementation.md);
> decision: [ADR-266](../adr/ADR-266-persistent-cart-authority.md). Faz B (TODO-168) still BLOCKED_BY Faz A.
>
> **Revised plan (2026-08-03).** Supersedes the "cookie-carried, zero-migration" framing of
> [CART-change-awareness.md](CART-change-awareness.md) for the **authenticated** path. That doc's §1 audit
> and behaviour spec remain the reference.
>
> **Critical product decision (hybrid cart model):**
> - **Anonymous cart** → stays **cookie-based** (`commerce_os_cart`, unchanged).
> - **Authenticated cart** → **persisted DB cart**, owned by the customer, **visible cross-device**.
> - **Login** → anonymous cookie cart is **merged** into the customer's DB cart (deterministic).
> - **Snapshot + acknowledgement** → **DB for authenticated**, **cookie for anonymous**.
>
> **Sequencing rule:** **Faz B (Cart Change Awareness) does NOT start until Faz A (Persistent Cart
> Foundation) is complete.** No commit/push/PR/merge/deploy until each phase's implementation + full gate +
> browser smoke is done and explicitly approved.
>
> **Numbering:** Faz A = **TODO-167** (renamed to *Persistent Cart & Cross-Device Foundation*); Faz B =
> **TODO-168** (*Cart Change Awareness*). ADRs from **ADR-266**. (To confirm at kickoff.)

---

## Guiding invariants (both phases)

1. **The cart stores REFERENCES, not prices.** Both the cookie cart and the DB cart hold
   `{variantId, quantity, selected}` only. Price/stock/discount are **always** recomputed
   server-authoritative on read via the existing `assemblePublicCart` engine (audit §1). The Faz B
   *snapshot* is a separate, explain-only baseline — never an order price.
2. **One pricing/availability engine.** No parallel pricing. Reuse `buildPublicCartIndex` +
   `assemblePublicCart` + `computeDiscounts` for anon and auth alike.
3. **Tenant isolation.** `storeId` on every cart row; every query store-scoped; `customerId` FK is
   store-scoped (a customer belongs to exactly one store).
4. **Additive migrations only.** No drop/delete. Existing anonymous carts (cookies) keep working
   untouched.

---

# Faz A — Persistent Cart & Cross-Device Foundation (TODO-167)

Goal: a server-authoritative, cross-device cart for authenticated customers, with a deterministic
login-time merge from the anonymous cookie cart, without changing the anonymous experience.

## A.1 Data model (additive migration #1)

```prisma
enum CartStatus {
  ACTIVE      // the customer's live cart
  MERGED      // superseded by a merge (kept for audit)
  CONVERTED   // turned into an order at checkout
  EXPIRED     // aged out by cleanup
}

model Cart {
  id             String     @id @default(cuid())
  storeId        String
  customerId     String                          // authenticated owner (anon carts are NOT rows)
  status         CartStatus @default(ACTIVE)
  currency       String                          // cart's settled currency (single-currency invariant)
  version        Int        @default(1)          // optimistic-concurrency + checkout cart-version
  lastActivityAt DateTime   @default(now())
  expiresAt      DateTime?                        // null = no explicit expiry (cleanup uses lastActivityAt)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  lines          CartLine[]
  store          Store      @relation(fields: [storeId], references: [id], onDelete: Cascade)
  customer       Customer   @relation(fields: [customerId], references: [id], onDelete: Cascade)
  // Exactly one ACTIVE cart per customer per store (partial-unique enforced in migration SQL).
  @@index([storeId, customerId, status])
  @@index([status, lastActivityAt])   // cleanup sweep
}

model CartLine {
  id         String   @id @default(cuid())
  cartId     String
  storeId    String                              // denormalized for store-scoped queries/guards
  variantId  String
  quantity   Int
  selected   Boolean  @default(true)             // mirrors the existing deselect behaviour
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  cart       Cart          @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant    ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  @@unique([cartId, variantId])       // one line per variant; merge sums quantity
  @@index([storeId])
}
```

Migration SQL adds a **partial unique index** `WHERE status = 'ACTIVE'` on `(storeId, customerId)` so a
customer has at most one live cart. **No price columns** on `CartLine` in Faz A — snapshot columns come in
Faz B (migration #2).

## A.2 Anonymous cart — unchanged

`commerce_os_cart` cookie (`{variantId, quantity}`) + server actions + `POST /cart` resolve stay exactly as
audited. No DB. This is the whole anonymous experience; Faz A must not regress it.

## A.3 Authenticated cart — server-authoritative membership

Because the cart must be **cross-device**, membership lives in the DB, not the client. New gateway
endpoints (customer-session scoped) mutate the DB cart; the read endpoint reads it:

- `GET  /public/stores/:slug/cart` (auth) → load ACTIVE cart, resolve via `assemblePublicCart`, return
  `PublicCart` + `version`.
- `POST /public/stores/:slug/cart/lines` → add/increment a line (`{variantId, quantity, version}`).
- `PATCH /public/stores/:slug/cart/lines/:variantId` → set quantity (0 removes) (`{quantity, version}`).
- `DELETE /public/stores/:slug/cart/lines/:variantId` → remove.
- `POST /public/stores/:slug/cart/select` → toggle `selected` (`{variantId, selected, version}`).

All mutations: store + customer scoped, run in a transaction, **bump `Cart.version`**, update
`lastActivityAt`. **Optimistic concurrency:** if the request's `version` ≠ current → `409 CART_STALE` +
current cart; client refetches (this is how device A / device B conflicts resolve safely).

Storefront: `cart-actions.ts` server actions branch on identity — anonymous → cookie mutation (today's
path); authenticated → call the gateway mutation endpoints with the current `version`. `resolveCart`
branches: authenticated → `GET /cart` (server cart, ignore cookie items); anonymous → today's `POST /cart`
with cookie items.

## A.4 Login merge (deterministic)

Hook into `loginAction` / `registerCompleteAction` (`apps/storefront-web/lib/server/auth-actions.ts`,
alongside the existing wishlist + recently-viewed merges):

1. Read the anonymous cookie cart items.
2. Gateway `POST /cart/merge` (customer-session scoped): load-or-create the customer's ACTIVE cart, then
   **deterministic quantity merge** — for each anonymous `variantId`: `newQty = clamp(existingQty +
   anonQty, 1, min(999, variant max))`; new variants inserted; item count capped at 100 (reuse the
   `sanitizeItems` rules, audit §1). Transaction bumps `version`.
3. **Clear the anonymous cookie cart** after a successful merge (no double-count on the device).
4. Merge is **idempotent** (re-running with an empty anon cart is a no-op).

Faz A merge concerns **membership + quantity only** (no snapshots yet — those are Faz B, and §8 of the
change-awareness doc defines the snapshot/ack merge rules that Faz B implements: oldest meaningful
`addedAt` wins; **never migrate an ack across users**).

## A.5 Cart version

`Cart.version` (Int) is the single concurrency + freshness token. It powers A.3's optimistic concurrency
and becomes the **checkout cart-version** the original spec wanted (audit §1 found none exists today).

## A.6 Expired cart cleanup

ACTIVE DB carts with `lastActivityAt` older than TTL (env, e.g. 90 days) → `EXPIRED`. Reuse the existing
**self-chaining `setTimeout` sweep** pattern (advisory-locked, `QueueJobLog`, env-gated, **off by
default**) — same shape as `recommendation-events/retention-worker.ts` / reservation expiry (audit §6).
Anonymous carts expire naturally via the 30-day cookie. `MERGED`/`CONVERTED` carts may be pruned on a
longer horizon.

## A.7 Checkout integration

- **Authenticated checkout:** load the ACTIVE DB cart as the authoritative line set (do **not** trust
  client-sent items), reprice via `assemblePublicCart`, place order, mark cart `CONVERTED` + clear lines in
  the same transaction. Carry `version` for a final stale check.
- **Anonymous checkout:** unchanged (cookie items → reprice → order → clear cookie).
- The existing `CART_NOT_READY` (stock/availability) 409 semantics are preserved for both.

## A.8 Faz A tests

Cart CRUD (add/increment/set/remove/select) with version bump; optimistic-concurrency `CART_STALE`;
one-ACTIVE-cart-per-customer constraint; **login merge** (empty→anon, existing→anon dup sums &
clamps/caps, idempotent re-run); anonymous path unchanged (regression); cross-device read (two sessions,
one DB cart); tenant isolation (customer A cannot read/mutate store B's cart / another customer's cart);
authenticated checkout reads DB cart + converts; expired-cart sweep marks EXPIRED; server-authoritative
pricing still fresh (no price stored on line).

## A.9 Faz A browser smoke

Anonymous add → login → cart merged & visible; second-device login → same cart visible; mutate on one
device → refetch on other reflects it (version); authenticated checkout empties the DB cart; anonymous
flow still works. Viewports 375/768/1024/1440. Leave enterprise-demo pristine.

---

# Faz B — Cart Change Awareness (TODO-168)

> **✅ IMPLEMENTED (2026-08-03, worktree, commit YOK).** Decision: [ADR-267](../adr/ADR-267-cart-change-semantics.md).
> Gate GREEN (build 27/27 · lint 42/42 · typecheck · test gateway 2184 / storefront 534). Additive migration
> `20260803150000_todo168_cart_change_awareness`. Shipped exactly to the binding below: shared pure engine
> `cart-changes/change-engine.ts`; auth snapshot/ack in DB (`CartLine` snapshot columns + `CartChangeAck`,
> cross-device); anon snapshot/ack in signed `commerce_os_cart_meta` cookie; INFO/WARN(`409 CART_CHANGED`)/
> BLOCKING(`409 CART_NOT_READY`) checkout tiers; `CartChangeEvent` best-effort analytics. Ack re-baselines by
> **fingerprint invalidation, not snapshot mutation** (ADR-267 §6). Open: `FREE_SHIPPING`/`SELLER_CHANGED` +
> event retention worker = future. No commit/push/PR/merge/deploy.

Starts only after Faz A ships. Behaviour is fully specified in
[CART-change-awareness.md](CART-change-awareness.md); this section records only how it **binds to the
hybrid cart** from Faz A.

## B.1 Snapshot & acknowledgement home (identity-split)

- **Authenticated** → snapshot + ack in the **DB** (additive migration #2):
  ```prisma
  // CartLine gains additive nullable snapshot columns:
  //   addedUnitPriceMinor, addedListPriceMinor, addedDiscountedUnitPriceMinor,
  //   addedCurrency, addedInStock, addedOrderable, addedAt
  model CartChangeAck {
    id          String   @id @default(cuid())
    storeId     String
    cartId      String
    fingerprint String
    createdAt   DateTime @default(now())
    @@unique([cartId, fingerprint])   // per-fingerprint ack (new price change ⇒ new fingerprint ⇒ re-shown)
    @@index([storeId, cartId])
  }
  ```
  Snapshot captured on add/replace + re-baselined on ack, **server-side** (genuine cross-device ack — what
  was a "future" in the cookie design becomes the default).
- **Anonymous** → snapshot + ack in the **cookie** exactly as designed in CART-change-awareness.md
  §3.1–§3.4 (`commerce_os_cart_meta`, versioned, HMAC-signed, byte-budgeted, severity-aware pruning,
  meta↔cart `cartId`/version binding, orphan cleanup).

## B.2 Shared change engine (unchanged from the approved design)

Pure `computeCartChanges({ snapshot, current }, ackedFingerprints)` in the gateway — **identity-agnostic**.
The only difference between anon and auth is **where `snapshot` and `ackedFingerprints` come from** (cookie
vs DB); the engine, fingerprint formula, dedup, and per-line/cart outputs are identical. This is exactly
why almost nothing from the earlier design is wasted.

## B.3 Same fingerprint semantics

`fingerprint = hash(storeId, cartId, variantId, changeType, oldValueMinor, newValueMinor)`. For auth,
`cartId` = `Cart.id`; for anon, `cartId` = the cookie's minted cart id. Per-fingerprint ack; a new price
change is a new fingerprint ⇒ old ack invalid ⇒ re-surfaced (approved decision).

## B.4 Checkout WARN/BLOCKING behaviour (unchanged three-tier)

- INFO (`PRICE_DECREASED`, `DISCOUNT_STARTED`, `VARIANT_BACK_IN_STOCK`, `PRODUCT_AVAILABLE_AGAIN`) — no
  block.
- WARN (`PRICE_INCREASED`, `DISCOUNT_ENDED`) — `409 CART_CHANGED` until the fingerprint is acknowledged.
- BLOCKING (`VARIANT_OUT_OF_STOCK`, `PRODUCT_UNAVAILABLE`, quantity adjustment) — ack insufficient; line
  must be fixed (existing `CART_NOT_READY`).

Enforcement reads acked fingerprints from the DB (auth) or cookie (anon); the checkout reprice is
server-authoritative either way.

## B.5 Analytics event table (unchanged)

Additive `CartChangeEvent` (RecommendationEvent-style, FK-minimal, KVKK-hashed identity,
`@@unique([storeId, cartId, dedupeKey])`, `dedupeKey = hash(eventType, fingerprint)`) — read is
side-effect-free; rows written only via idempotent upsert; best-effort via BFF proxy. Same for anon & auth.

## B.6 Faz B tests

All of CART-change-awareness.md §15 **× {anonymous cookie, authenticated DB}**, plus: cross-device ack
(ack on device A clears on device B); login merge preserves oldest `addedAt` snapshot and does **not**
migrate acks across users; snapshot lives server-side for auth (never in the request body).

---

## Reuse vs discard ledger (from the cookie-only design)

| Piece | Fate |
|---|---|
| §1 architecture audit | **Reuse** — foundational for Faz A + B. |
| Pure change engine, fingerprint, dedup, 3-tier checkout | **Reuse as-is** (identity-agnostic). |
| `CartChangeEvent` analytics table + idempotent upsert | **Reuse as-is** (Faz B / migration #2). |
| UI: CartChangeBar, line markers, TR/EN | **Reuse as-is** (Faz B). |
| Cookie meta (snapshot/ack, versioned/HMAC/budget/prune/binding) | **Reuse for the ANONYMOUS path only.** |
| "Authenticated ack in cookie" | **Discard** → DB (`CartChangeAck` + CartLine snapshot columns). |
| "Zero-migration / no persisted cart" framing | **Discard** → Faz A adds Cart/CartLine; Faz B adds snapshot+ack+event. |
| "Snapshot travels in request body" (auth) | **Discard** for auth (server-owned); kept for anon. |

## Open decisions to confirm at Faz A kickoff

1. Auth cart mutation API shape — dedicated line endpoints (A.3, recommended, true cross-device) vs
   whole-item-set upsert.
2. Cart numbering (TODO-167 rename vs new number) + ADR range.
3. Cleanup TTL default + whether to hard-delete or keep `EXPIRED`/`MERGED` for audit.
4. Currency on a persisted cart if the customer's store currency changes over time (out of scope now;
   single-currency invariant holds).

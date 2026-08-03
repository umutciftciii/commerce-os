# ADR-267 — Cart Change Semantics (Cart Change Awareness)

- **Status:** ACCEPTED (implemented, not yet merged/deployed) — TODO-168.
- **Date:** 2026-08-03
- **Builds on:** [ADR-266](./ADR-266-persistent-cart-authority.md) (Persistent Cart & Cross-Device Foundation).
- **Supersedes for the authenticated path:** the "cookie-carried, zero-migration" framing of
  [CART-change-awareness.md](../analysis/CART-change-awareness.md) §2–§4/§8/§10.

## Context

TODO-167 (ADR-266) made the authenticated cart **server-authoritative and persisted** (`Cart` + `CartLine`,
cross-device); the anonymous cart stays a signed `commerce_os_cart` cookie. Price/stock/availability are
**always recomputed** on read via the one existing engine (`assemblePublicCart`); the cart stores
**references, not prices**. TODO-168 adds **change awareness**: after a customer adds an item, its price,
discount, stock, or availability may move before checkout. We want to *surface* those movements, *gate*
checkout on the ones that could surprise the buyer, and never turn a stale snapshot into an order price.

## Decision

### 1. Snapshot is an explain-only baseline, never an order price

Each line keeps an **add-time reference snapshot** (`unitPrice`, `listPrice`/compareAt, `discountedUnitPrice`,
`currency`, `inStock`, `orderable`, `capturedAt`). It is used **only** to explain what changed. The order
always prices at the current server-authoritative value (unchanged from ADR-266).

### 2. Identity-split snapshot & acknowledgement authority; one shared engine

- **Authenticated → DB.** Additive nullable snapshot columns on `CartLine`
  (`addedUnitPriceMinor`, `addedListPriceMinor`, `addedDiscountedUnitPriceMinor`, `addedCurrency`,
  `addedInStock`, `addedOrderable`, `addedAt`) + a `CartChangeAck` table (`@@unique(cartId, fingerprint)`).
  Cross-device acknowledgement is the **default**, not a future.
- **Anonymous → cookie.** A separate signed, versioned `commerce_os_cart_meta` cookie carries the per-variant
  snapshot + acked fingerprint set. The primary `commerce_os_cart` cookie is unchanged.
- **Shared pure engine** `apps/api-gateway/src/cart-changes/change-engine.ts` — identity-agnostic. The only
  difference between anon and auth is *where the snapshot and acked set come from*; the fingerprint formula,
  dedup, severity map, and per-line output are identical.

### 3. Snapshot capture = lazy baseline on first reliable resolve

- **Auth:** baseline written server-side during projection when the snapshot columns are `null`
  (idempotent `addedAt IS NULL` guard). Adding a *new* line creates a `null`-snapshot row → baselined on the
  next projection; **incrementing/quantity edits never touch the snapshot** (a conscious quantity change is
  not a price event); re-adding a removed variant re-baselines.
- **Anon:** baseline written into the meta cookie by the mutation server actions (Next.js only allows cookie
  writes in actions/route handlers); `addToCartAction` resolves current prices once and baselines missing
  lines, preserving existing snapshots and pruning orphans.
- **Legacy carts** (pre-feature, no snapshot) get their baseline on the first reliable resolve/mutation — **no
  fabricated history**.

### 4. Fingerprint & dedup

`fingerprint = sha256(storeId, cartId, variantId, changeType, oldValueMinor, newValueMinor, currency)`
(store-scoped ⇒ cross-store isolation; deterministic ⇒ idempotent). A **new** price value produces a **new**
fingerprint, so an old acknowledgement never hides a new change. Money is compared in **minor units only**;
a **currency mismatch is not a price movement** (price/discount changes suppressed, stock/availability still
evaluated).

### 5. Change types & severity (checkout behaviour)

One primary change per line, by precedence: availability → stock → quantity → discount-presence → base-price.

| Severity | Types | Checkout |
|---|---|---|
| **INFO** | `PRICE_DECREASED`, `DISCOUNT_STARTED`, `VARIANT_BACK_IN_STOCK`, `PRODUCT_AVAILABLE_AGAIN` | not blocked |
| **WARN** | `PRICE_INCREASED`, `DISCOUNT_ENDED` | `409 CART_CHANGED` until the fingerprint is acknowledged |
| **BLOCKING** | `VARIANT_OUT_OF_STOCK`, `PRODUCT_UNAVAILABLE`, `QUANTITY_ADJUSTED` | existing `409 CART_NOT_READY`; acknowledgement does **not** resolve it — the line must be fixed |

BLOCKING changes always coincide with a non-`OK` line status, so they are already enforced by the existing
`checkoutReady`/`CART_NOT_READY` gate; the **only new checkout gate** is the WARN `CART_CHANGED` one. Both
error bodies carry the current change-enriched cart projection (never a raw code shown to the buyer).

### 6. Acknowledgement re-baselines by fingerprint invalidation, not snapshot mutation

Acknowledging inserts a `CartChangeAck` row (auth) / appends a fingerprint (anon). The snapshot is **not**
re-baselined on ack. The change stays computable but marked `acknowledged` (drops out of the panel and the
WARN gate); a subsequent movement mints a new fingerprint and re-surfaces. This keeps ack purely additive,
naturally cross-device, and race-free (no version bump on ack). `acknowledge-all` covers INFO+WARN only —
BLOCKING is never auto-acked.

### 7. Analytics — additive, best-effort, read-side-effect-free

`CartChangeEvent` (RecommendationEvent pattern): FK-minimal (Store only), KVKK-hashed identity
(`cartIdHash`/`customerIdHash` via HMAC — no raw ids), `@@unique(storeId, dedupeKey)` with
`dedupeKey = eventType:fingerprint` ⇒ idempotent upsert (re-render writes 0 rows). Deriving changes on read
is **pure and never writes**; rows are written only via the explicit ingest endpoint
`POST /public/stores/:slug/cart-change-events` (bot/prefetch elided, rate-limited, always 200). Retention is
a documented **future** additive (reuse the recommendation retention worker pattern; off by default).

## Migration

Additive-only (`20260803150000_todo168_cart_change_awareness`): `CartLine` snapshot columns (nullable),
`CartChangeAck`, `CartChangeEvent`, indexes + uniques. No drop/delete, no backfill.

## Consequences

- Anonymous baseline capture happens in mutation actions (Next cookie-write constraint), so the audit
  boundary for anon is "first reliable mutation", not "first render" — acceptable and documented.
- The anon meta cookie is byte-budgeted (< 3800 B signed); on overflow it prunes oldest INFO/in-sync
  snapshots, then oldest acks, preserving WARN/BLOCKING snapshots; cart items are never dropped.
- `CustomerCartProjection` gains an opaque `cartId` for analytics grouping.

## Future (out of scope)

`FREE_SHIPPING_ELIGIBILITY_CHANGED` (cart-level aggregate), `SELLER_CHANGED` (marketplace-only),
`CartChangeEvent` retention worker, read-only admin cart-change history surface.

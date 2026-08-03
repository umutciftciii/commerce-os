# ADR-266 — Persistent Cart Authority (Hybrid Cart Model)

**Status:** Accepted (TODO-167, Faz A) · 2026-08-03
**Related:** ADR-267 (reserved — Cart Change Semantics, TODO-168) · builds on the stateless cookie cart
(F3B.1) and the server-authoritative pricing engine (`assemblePublicCart`).

## Context

The cart was intentionally **stateless and cookie-only**: an HMAC-signed `commerce_os_cart` cookie holding
`{variantId, quantity}` references, re-priced server-authoritative on every read (F3B.1). This gave zero
cart persistence and **no cross-device continuity** for authenticated customers, and **no login-time
merge** of a guest cart into an account. Product decided authenticated customers must see the same cart on
any device, and a guest cart must merge into the account on login.

## Decision

A **hybrid cart model**:

- **Anonymous cart** stays exactly as-is: the `commerce_os_cart` HMAC cookie, 100-line cap, existing
  reconcile rules. No DB row is ever created for a guest.
- **Authenticated cart** is a **persisted DB cart** (`Cart` + `CartLine`), owned by the customer, visible
  cross-device.
- **The cart stores only references** (`variantId`, `quantity`) — **never prices**. Both cookie and DB
  carts project through the **same** `assemblePublicCart` engine, so pricing/campaign/stock/availability
  are identical regardless of source (no source-dependent pricing).
- **One ACTIVE cart per (store, customer)** — enforced by a Postgres **partial unique index**
  `UNIQUE(storeId, customerId) WHERE status='ACTIVE'` + load-or-create with P2002 swallow (idempotent).
- **`Cart.version`** is an optimistic-concurrency token: every meaningful mutation does an atomic
  conditional update `WHERE id = ? AND version = ? AND status='ACTIVE'`. A mismatch → **409 CART_STALE**
  with the current authoritative projection (the client re-renders, never silently overwrites).
- **Login merge:** the anonymous cookie cart deterministically merges into the customer's ACTIVE DB cart
  (existing lines kept; guest lines appended in cookie order; duplicate `variantId` quantities summed;
  clamp `[1,999]`; 100-line cap with `MERGE_LIMIT_EXCEEDED` overflow **reported, never silently lost**).
  The anonymous cookie is cleared **only after** a successful merge.
- **Checkout:** authenticated checkout treats the **DB ACTIVE cart as authoritative** (client line list is
  ignored — cross-device + post-merge the cookie may be empty) and reprices server-authoritative. The cart
  is marked **CONVERTED at payment settlement** (SALE_COMMIT → `consumeOrderReservations`, the single
  chokepoint the webhook + test-payment paths funnel through), **not** at order placement — so a **failed
  payment leaves the cart ACTIVE** (retryable) and only a settled payment converts it (atomic within the
  payment transaction). Anonymous checkout is unchanged.
- **Lifecycle:** `ACTIVE | CONVERTED | MERGED | EXPIRED`. An env-gated (default **OFF**) global sweep marks
  ACTIVE carts inactive for > 90 days as EXPIRED (advisory-locked, idempotent). No hard-delete of
  CONVERTED/MERGED/EXPIRED in this phase (retention/anonymization is future).

## Alternatives considered

- **Persist the whole cart (incl. anon) in the DB** — rejected: creates orphan-cart cleanup burden for
  guests, DB writes on every guest mutation, and contradicts the deliberate stateless-guest design.
- **Keep cart membership client-authoritative even for auth (whole-set upsert)** — rejected: a change on
  device A wouldn't be visible on device B (the cross-device requirement fails); membership must live in
  the DB.
- **Store prices on the cart line** — rejected: the cart must never be a pricing authority (server reprices
  every read; ADR-047/F4A invariants). Price snapshots for change-awareness are TODO-168 (ADR-267), and for
  the authenticated cart will live as additive columns then.

## Consequences

- Zero change to the anonymous experience; additive migration only (no backfill; lazy cart creation).
- Cross-device authenticated carts + deterministic login merge + optimistic-concurrency safety.
- Coupon-code + shipping-option **selection** are not yet persisted on the authenticated DB cart (automatic
  campaigns still apply); threading them is a follow-up (**TD-174**).
- Cart conversion happens at **payment settlement** (not order placement): failed payment preserves the
  ACTIVE cart; settled payment converts it. (Earlier TD-175 deferral is **resolved**.)
- TODO-168 (Cart Change Awareness) is unblocked: authenticated snapshot/ack will be server-side (DB), guest
  snapshot/ack in the cookie, over the **same** change engine (ADR-267).

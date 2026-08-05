# ADR-269 — Returns Authority & Lifecycle (Returns Management Foundation)

- **Status:** ACCEPTED & DEPLOYED — TODO-169 Returns Management Foundation (PR #171 merge `360fb96`;
  2026-08-04). Additive schema + `apps/api-gateway/src/returns/` module + storefront customer flow +
  store-admin module. api-gateway + storefront-web + store-admin-web rebuilt/recreated from main
  (`--no-deps`; postgres/redis/worker/admin-web untouched, volumes preserved); migration
  `20260804090000_todo169_returns_management_foundation` applied (`migrate deploy`); post-deploy smoke
  PASS (deployed :4000 eligibility/create/approve→RefundIntent PENDING/inspection→restock/tenant 401-404/
  private media 404/refundAmountsSupported=false; fixtures cleaned, demo-store pristine).
- **Date:** 2026-08-04 (proposed 2026-08-03)
- **Builds on:** ADR-268 (Financial Reporting Authority — snapshot authority, `refundAmountsSupported=false`),
  ADR-101 (manual shipment status state-machine `evaluateManualStatusChange`), ADR-076 (Inventory Engine
  append-only adjustments + `batchId`), ADR-065 (media pipeline: sharp/webp + `StorageDriver`),
  ADR-089 (Admin Data Grid), ADR-047/ADR-045 (shipment snapshot + honest fulfillment display),
  ADR-032 (single `Customer` identity), F3B.3 (`x-customer-session` auth), F4C/ADR-063/ADR-064
  (per-line VAT/cost/list snapshots).
- **Blocks:** TODO-170 Refund Ledger & Payment Reversal (consumes `RefundIntent`).
- **Analysis:** [RETURNS-management-foundation.md](../analysis/RETURNS-management-foundation.md)

## Context

The platform has customer orders, shipments, inventory, and payment attempts, but **no returns
capability**. The audit (see analysis) established what the order model can and cannot support:

- **Present & reliable:** `OrderLine` immutable snapshots (`quantity`, `unitPriceAmount`, `totalAmount`,
  `currency`, and additive F4C `unitNetPriceMinor` / `unitVatAmountMinor` / `unitGrossPriceMinor` /
  `unitListPriceMinor` / `lineNetAmountMinor` / `lineVatAmountMinor` / `lineGrossAmountMinor` /
  `unitCostMinor`); order-level `discountAmount` + immutable `OrderDiscount` snapshots; `Order.currency`;
  `Order.shippingAmount`; `PaymentAttempt` with `isOrderPaidForShipment` (PAID/AUTHORIZED); shipment
  status incl. `DELIVERED`/`RETURNED`; `InventoryMovementType.RETURN` (already defined).
- **Absent (must be added or derived):**
  1. **No order-level `DELIVERED`.** `OrderStatus` = DRAFT/PLACED/CONFIRMED/CANCELLED/FULFILLED. Delivery
     is a *shipment* fact: `ShipmentStatus.DELIVERED` (`getOrderFulfillmentDisplay` derives the customer
     badge). A DELIVERED shipment already cascades `Order.fulfillmentStatus=FULFILLED`
     (`shipping/routes.ts` manual-status handler).
  2. **No `Shipment.deliveredAt`.** Delivery date is only inferable from a `DELIVERED` `ShipmentEvent.occurredAt`
     (nullable, fragile). The return window needs a **stable anchor**.
  3. **No "already-returned quantity" per line.** Must be computed from the new return domain.
  4. **No store returns policy.** `StoreSettings` has no window/approval/shipping fields.
  5. **No customer refund amount** (ADR-268 §5: `refundAmountsSupported=false`; a future append-only
     `OrderRefund` ledger is specified). Returns must **not** fabricate refund figures into finance.
  6. **No transactional email** (notification-service is a stub; BullMQ `platform-events` bus only logs).
  7. **Media `/media/*` is fully public** (`@fastify/static`, no auth, no signed URLs); `StorageDriver` has
     `put/delete/exists` but **no `read`**. Return photo attachments require privacy.
  8. **`AuditLog` has only `platformUserId`** (no customer/storeUser actor column).

## Decision

### 1. Returns are modelled at OrderLine + quantity granularity, never at Order granularity

A return targets specific `OrderLine`s and specific quantities. An order may have **many** `ReturnRequest`s
over time; each request has **many** `ReturnItem`s (one per returned `OrderLine`, with a `quantity`). This is
the only model that supports partial-line, multi-line, and repeat returns. First-phase resolution types:
`REFUND_TO_ORIGINAL_PAYMENT`, `REPLACEMENT`. Future (enum-reserved, not built): `STORE_CREDIT`,
`GIFT_CARD_BALANCE`, `MANUFACTURER_SUPPORT`, `INSTANT_REFUND`, `EXCHANGE_WITH_DIFFERENT_PRODUCT`.

### 2. Eligibility is computed server-side, fail-closed, from a stable delivery anchor

A line is returnable **iff all** hold (server-authoritative; the client never decides):

1. The order has **at least one `DELIVERED` shipment** (order-level "delivered" = any shipment delivered).
2. **Within the window:** `now ≤ deliveredAt + returnWindowDays`.
3. **`remainingReturnableQty > 0`** where
   `remainingReturnableQty = orderLine.quantity − Σ(open+settled ReturnItem.quantity for that line)`.
   "Open+settled" = every `ReturnItem` whose parent request is **not** in a releasing terminal state
   (`REJECTED`, `CANCELLED_BY_CUSTOMER`, `EXPIRED`). Rejected/cancelled quantities are **released** back to
   the returnable pool; approved/received/completed quantities are **held**.
4. The product/product-type is **not** return-excluded (first phase: no exclusion registry → always
   eligible on this axis; documented extension point).

**Delivery anchor — additive `Shipment.deliveredAt`.** We add `deliveredAt DateTime?` to `Shipment`, set at
the moment status transitions to `DELIVERED` (manual-status route + provider-sync mapping). The migration
**backfills** existing `DELIVERED` shipments with `updatedAt` (best available; documented approximation).
Eligibility anchor for an order = **max `deliveredAt`** across its delivered shipments; if a delivered
shipment has null `deliveredAt` (legacy race), fall back to its `updatedAt`. Choosing the *latest* delivery
is the customer-favourable, defensible choice for multi-shipment orders.

### 3. Store returns policy lives on `StoreSettings` (additive), with TR-grounded safe defaults

`StoreSettings` (1-1, PK=FK) gains five additive columns, wired through the existing settings PATCH path:

| Field | Type | Default | Rationale |
|---|---|---|---|
| `returnWindowDays` | Int | **14** | TR mesafeli satış cayma hakkı = 14 gün (legally grounded). |
| `returnsRequireApproval` | Boolean | **true** | Merchant reviews before authorising (safe default). |
| `returnsCustomerPaysShipping` | Boolean | **true** | First-phase manual return shipping; customer-pays default. |
| `returnsAllowReplacement` | Boolean | **true** | Replacement offered when product/variant still sellable. |
| `returnsAllowOriginalPaymentRefund` | Boolean | **true** | Original-payment refund offered. |

When no `StoreSettings` row exists, the same defaults apply (the GET path already lazy-returns nulls →
resolver coalesces to defaults). Defaults are documented here per the "policy yoksa güvenli default" rule.

### 4. Lifecycle is a pure, fail-closed state machine (no scattered route `if` chains)

`ReturnStatus` (17 states): `REQUESTED`, `UNDER_REVIEW`, `PARTIALLY_APPROVED`, `APPROVED`, `REJECTED`,
`AWAITING_SHIPMENT`, `RETURN_SHIPPED`, `RECEIVED`, `INSPECTION_REQUIRED`, `INSPECTED`, `REFUND_PENDING`,
`REPLACEMENT_PENDING`, `COMPLETED`, `CANCELLED_BY_CUSTOMER`, `EXPIRED`, `CLOSED`. (`CANCELLED_BY_CUSTOMER`
covers customer cancel; `CLOSED` is the admin archival terminal distinct from `COMPLETED`.)

A pure `returns/status-map.ts` (modelled on `evaluateManualStatusChange`) owns the transition table and
`evaluateReturnTransition(from, to, actorType): { ok } | { ok:false, reason }`. Rules:

- Customer may cancel **only** from `REQUESTED`/`UNDER_REVIEW` (and only before approval), producing
  `CANCELLED_BY_CUSTOMER`.
- `REJECTED` requires a non-empty admin reason.
- Partial approval sets `PARTIALLY_APPROVED` and is expressed per-item via `approvedQuantity`/`rejectedQuantity`.
- `REFUND_PENDING` / `REPLACEMENT_PENDING` are **operational** states — they do **not** mean money moved.
- `COMPLETED` is reachable **only after** the resolution outcome is verified (refund intent settled by
  TODO-170, or replacement dispatched). This phase can reach `REFUND_PENDING`/`REPLACEMENT_PENDING` and
  `CLOSED`; the money-verified `COMPLETED` transition is gated for TODO-170.
- Every terminal state is immutable; illegal transitions are rejected (fail-closed → 409).

Append-only `ReturnStatusHistory` (with `actorType` = CUSTOMER/ADMIN/SYSTEM + `actorId?`) is the primary
audit trail — it sidesteps `AuditLog`'s platformUser-only actor limitation. Admin actions **additionally**
write `AuditLog` (`entityType: "ReturnRequest"`, CREATE/UPDATE) via the existing `recordAudit`.

### 5. RefundIntent is created but NEVER touches finance in this phase

On an approved return whose resolution is `REFUND_TO_ORIGINAL_PAYMENT`, a **`RefundIntent`** row is created
with `status=PENDING` and an `idempotencyKey` (store-scoped unique). It records the **computed** product /
shipping / tax / total refund minor amounts (see §6) sourced from immutable `OrderLine` snapshots. **This
phase performs no provider refund call and writes nothing to the finance read-model:**
`refundAmountsSupported` stays `false`, `productRefundsMinor`/`shippingRefundsMinor` stay `0`. `RefundIntent`
is the **upstream** record for ADR-268 §5's future `OrderRefund` ledger; **TODO-170** consumes PENDING
intents, performs the reversal, and writes the ledger that finance reads. Gross sales
(Σ `subtotalAmount`) are an immutable sale snapshot and are **never** reduced by a return.

### 6. Refund amounts are a pure function of snapshots + returned quantity (no client math)

`returns/refund-calc.ts` (pure, unit-tested) computes per return:

- **Per-line product refund** = the line's snapshot value pro-rated by returned quantity:
  `round(lineGrossAmountMinor × returnedQty / lineQty)` (falls back to `unitPriceAmount × returnedQty` for
  pre-F4C legacy lines without gross snapshot).
- **Line discount** is already embedded in the line snapshot. **Order-level discount**
  (`Order.discountAmount`) is allocated to lines deterministically by gross weight: floor-proportional
  minor-unit shares with the leftover **remainder assigned to the last positive-weight line** (so
  Σ allocations = order discount exactly, per the task's "son satır remainder alır" rule), then the
  returned fraction is applied to the discounted line base.
- **Tax:** KDV is **inclusive** (`Order.taxAmount = 0`; VAT lives in `lineVatAmountMinor`). The tax portion
  of a refund is already **inside** the product refund; `taxRefundMinor` is reported as the pro-rated
  `lineVatAmountMinor` **for disclosure only** and is **never added on top** of the gross product refund.
- **Shipping refund:** `0` by default. Shipping is refunded **only** by explicit policy/admin decision; when
  the order had free shipping (`shippingAmount = 0`) the shipping refund is `0`. First phase: shipping
  refund is an admin toggle on the financial decision, defaulting to `0`.
- `totalRefundMinor = Σ productRefund + shippingRefund` (tax already inside product refund; not re-added).

All amounts are computed server-side from snapshots; the customer summary shows an **estimate** derived from
the same snapshot data (no client calculation).

### 7. Restock is admin-decided per item; only sellable restock adjusts inventory

When goods are received, the admin sets a per-item `restockDecision`: `RESTOCK_AS_SELLABLE`,
`RESTOCK_AS_DAMAGED`, `DO_NOT_RESTOCK`, `RETURN_TO_VENDOR`, `DISPOSE`. Inventory is **never** auto-incremented.
**Only `RESTOCK_AS_SELLABLE`** creates an inventory adjustment: increment `InventoryItem.quantityOnHand` by
the received quantity + write `InventoryMovement` (`type: RETURN`, `referenceType: "ReturnItem"`,
`referenceId`) + append `InventoryAdjustment` (`field: ON_HAND`, `source: RETURN_RESTOCK`, `batchId`,
`changedByPlatformUserId`). New enum value **`InventoryAdjustmentSource.RETURN_RESTOCK`**. The adjustment is
**idempotent** (a `ReturnItem` restocks at most once, guarded by `restockedAt` + a per-item batch key) and
**store-scoped** (cannot apply to another store).

### 8. Return photo attachments are private (auth-gated), never public

New `MediaContext.RETURN_ATTACHMENT`. A **customer-facing** multipart upload endpoint (under
`/public/stores/:slug/customer/returns/...`, `requireCustomer`-guarded) runs the same sharp/webp pipeline and
creates a `MediaAsset` + `ReturnAttachment`, but stores under a **private root** that `@fastify/static` does
**not** serve. `StorageDriver` gains `read(key): Promise<Buffer>`; a dedicated **auth-gated retrieval route**
streams bytes only to the owning customer or the store admin. Return DTOs **never** expose a public `/media`
URL for attachments — only an app route that re-checks ownership. The `MEDIA_IN_USE` delete guard is extended
to count `ReturnAttachment` references. (True signed-URL / object-store privacy is a documented follow-up TD;
this phase provides genuine application-layer access control + non-enumerable keys.)

### 9. Notifications are emitted post-commit, fail-open

A `returns/notify.ts` emits a return lifecycle event **after** the domain transaction commits, wrapped in
try/catch so a delivery failure **cannot** roll back the domain write. Because the platform has no real email
sender yet (notification-service + worker are log-only), delivery is **honestly** a platform-wide placeholder:
we enqueue/record the event; actual email templating/sending is future work shared with the rest of the
platform. `ReturnStatusHistory` gives the customer-visible trail regardless of email.

### 10. Tenant isolation & authorization (fail-closed)

- Customer routes: `requireStore` + `requireCustomer`; a return for another customer's order or another
  store's order returns **404** (never 403 — no existence leak). Customer sees only their own returns.
- Store-admin routes: `requireStorePlatformAdmin`; store-scoped `storeId` is the first WHERE clause.
- Attachment access is signed/private (§8); `adminNote` is never serialized to the customer; the customer's
  `customerNote`/`customerComment` is visible to the admin.
- Every state transition passes the state machine **and** the actor-authority check; illegal → fail-closed.

### 11. Ortak return order-summary projection is the single authority for order surfaces (TODO-169.1)

Post-deploy acceptance review surfaced that returns were **not integrated into the order surfaces** (order
list still showed only fulfillment; order detail had no returns section; the return window was invisible; the
admin return thumbnail was blank; the summary CTA overflowed; the review panel pushed the return CTA out of the
action bar). The recovery keeps everything **additive** (no schema/migration change) and introduces a single
server-side authority so React never re-computes return state:

- **`returns/projection.ts`** — a pure `buildReturnOrderSummary` + batched `computeReturnOrderSummaries`
  producing per-order: window fields (`deliveredAt`/`returnWindowDays`/`returnWindowEndsAt`/`remainingDays`/
  `windowState`, all delivery-derived from `Shipment.deliveredAt`, **never** purchase/`placedAt`), activity
  (`requestCount`/`activeRequestCount`/`returnedItemQuantity`/`pendingItemQuantity`/`latestStatus`), and
  **honest finance** (`approvedRefundIntentMinor` = Σ PENDING intents vs `completedRefundMinor` = Σ PROCESSED,
  today `0`; `hasPendingFinancialImpact`). `resolveReturnWindow` is the shared window authority (eligibility +
  projection). Gross sales are **never** reduced.
- **Reuse** (contract `returnOrderSummarySchema`, forward-ref `z.lazy`): customer order list + customer order
  detail (`customers/index.ts`, **fail-open** — a projection error degrades to a hidden badge, never a 500),
  Store-Admin order detail (new `GET /stores/:storeId/orders/:orderId/return-summary` →
  `adminOrderReturnsResponseSchema`), and the eligibility endpoint (window fields).
- **Media parity (blocker #3):** `resolveReturnItemCovers` (store-scoped `ProductImage`, position-asc cover;
  cross-store media never) is shared by the customer and admin serializers — the admin `imageUrl: null` hardcode
  is replaced; missing cover → shared placeholder. There is **no** immutable OrderLine media snapshot (documented
  gap); the current-product cover is the fallback, identical on both surfaces.
- **Delivery badge is preserved (blocker #5):** the return badge is a *separate* signal; `Teslim edildi` is never
  removed (delivery and return are distinct lifecycles). The review panel renders **outside** the fixed action bar
  so the return CTA never shifts.
- **Provisional profitability (blocker #7):** while a PENDING intent exists, admin profit figures carry a
  "provisional / return in progress" note; the customer order detail shows an "expected net after return" line
  explicitly labelled *expected*, plus "refund pending · not yet deducted". `refundAmountsSupported` stays `false`.

## Consequences

- **Additive & reversible:** new models/enums/columns only; no existing column is repurposed; legacy orders
  without F4C snapshots degrade gracefully (product refund falls back to `unitPriceAmount`).
- **Finance stays honest:** returns produce PENDING intents, not revenue changes; `refundAmountsSupported`
  remains `false` until TODO-170.
- **Two new enum values** (`InventoryAdjustmentSource.RETURN_RESTOCK`, `MediaContext.RETURN_ATTACHMENT`),
  **one new column on two existing models** (`Shipment.deliveredAt`, five `StoreSettings` policy fields),
  and the new returns domain — all in one migration.
- **Follow-ups (TECHNICAL_DEBT):** object-store/signed-URL private media; real email delivery; return-exclusion
  registry (product/type opt-out); automated return labels; the `COMPLETED` money-verified transition (TODO-170).

## Post-Audit Hardening (2026-08-04) — status: Return Financial Invariants IN_PROGRESS

Cross-module review found correctness/financial-invariant gaps in the delivered returns work. Fixes are **additive**
(append-only; no existing column repurposed) and are, like §7's returns work, currently **uncommitted** (no commit/
push/PR/merge/deploy). Follow-up migration `20260804170000_adr271_returns_session_hardening`.

- **R1 — RefundIntent CANCELLED lifecycle.** A refund-less terminal transition
  (`REJECTED`/`CANCELLED_BY_CUSTOMER`/`EXPIRED`/`CLOSED` without financial effect) now flips any PENDING
  `RefundIntent` to `CANCELLED` **in the same transaction** (never deleted — append-only). New additive fields:
  `RefundIntent.cancelledAt`, `RefundIntent.cancellationReason`. The projection counts **only** PENDING intents as
  "pending financial impact"; `CANCELLED` intents are excluded, so terminated returns no longer show phantom
  provisional deductions.
- **R2 — Concurrent double-claim serialization.** `createReturnRequest` now takes
  `pg_advisory_xact_lock(storeId:orderNumber)`, serializing concurrent requests for the same order so two in-flight
  claims can no longer over-claim item quantities.
- **R3 — Atomic optimistic version.** Admin mutations require a mandatory `expectedVersion` (contracts).
  `applyReturnTransition` is an atomic optimistic lock (`updateMany where version = expected`; `count = 0` →
  `409 VERSION_CONFLICT`, **no side effect**). Store-Admin UI sends `ret.version`, reloads on `409`, and shows a
  friendly conflict message.
- **R5 — COMPLETED guard enforced in code.** `COMPLETED` is now guarded: `REFUND` may not complete without a real
  refund (intent `PROCESSED`); `REPLACEMENT` may not complete without verified fulfillment → otherwise
  `409 COMPLETION_NOT_ALLOWED`. Until TODO-170 lands the real refund ledger, the furthest financial state is
  `REFUND_PENDING` / `REPLACEMENT_PENDING`.
- **P1/P2 — Admin-actionable allowlist.** Pending-work "actionable" is no longer "everything not settled". It is an
  explicit admin-actionable allowlist (`REQUESTED`/`UNDER_REVIEW`/`RECEIVED`/`INSPECTION_REQUIRED`/`INSPECTED`/
  `REFUND_PENDING`/`REPLACEMENT_PENDING`). Customer/carrier-waiting states
  (`APPROVED`/`PARTIALLY_APPROVED`/`AWAITING_SHIPMENT`/`RETURN_SHIPPED`) do **not** count. `INSPECTED` now lives in the
  inspection bucket (previously lost). Invariant: sidebar actionable count == Σ dashboard buckets.
- **Tests.** Real-DB integration suite `returns-lifecycle.integration.test.ts` (R1 cancellation, R2 serialization,
  R3 version conflict, R5 completion guard, P1/P2 bucketing) runs against `commerce_os_test` with `DATABASE_URL` set;
  skipped in CI where no DB is available.

**TODO-170 relationship.** R1 removed the original blocker (a refund ledger must never be started while a PENDING
intent could be silently dropped). R1 is now resolved, but TODO-170 remains a separate, **still-blocked** effort:
the append-only `OrderRefund` ledger should not begin until these return financial invariants (and the private-media
hardening, C1) are shipped.

**TODO-170 update (2026-08-05, ADR-272 — IN_PROGRESS).** The refund ledger is now implemented (see
[ADR-272](ADR-272-refund-ledger-and-payment-reversal.md)). Two changes intersect this ADR's decisions:
(1) **§5 / R5** — the `RefundIntent` lifecycle gains an additive **`CONSUMED`** value (atomic single consume when the
first `OrderRefund` is created); the `PROCESSED` value is kept as unused legacy. The R5 `COMPLETED` guard
(`isCompletionAllowed`) now keys off **Σ SUCCEEDED `OrderRefund` ≥ intent total** instead of `RefundIntent.status ===
"PROCESSED"` (which was never written). `cancelPendingRefundIntent` is unchanged (targets only PENDING), so a CONSUMED
intent is never cancelled. (2) **§11 projection** — `completedRefundMinor` now comes from the SUCCEEDED `OrderRefund`
ledger (realized money), not intent status; `refundAmountsSupported` in finance flips to `true`. A return reaches
`COMPLETED` only after a real (or manually-confirmed offline) refund succeeds.

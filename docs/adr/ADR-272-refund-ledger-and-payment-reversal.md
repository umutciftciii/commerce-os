# ADR-272 — Refund Ledger & Payment Reversal (TODO-170)

- **Status:** IN_PROGRESS — TODO-170 Refund Ledger & Payment Reversal. Additive schema + new
  `apps/api-gateway/src/refunds/` module + finance ledger integration + store-admin refund UX +
  storefront customer refund status. **Uncommitted** (no commit/push/PR/merge/deploy). Migration
  `20260805100000_todo170_refund_ledger_payment_reversal` authored; full gate + real-DB concurrency
  tests + browser/HTTP smoke required before closure.
- **Date:** 2026-08-05
- **Builds on:** ADR-268 (Financial Reporting Authority — snapshot authority, `refundAmountsSupported`
  flag, §5 future `OrderRefund` ledger), ADR-269 (Returns Authority & Lifecycle — `RefundIntent` PENDING,
  R1 cancellation, R3 version guard, R5 COMPLETED guard), ADR-270 (Returns UX Recovery — auto-advance,
  pending-work), TODO-159F/ADR-095..100 (`payment-state.ts` sole authority, PaymentAttempt, recovery),
  PB-1 (payment webhook authenticity — platform HMAC).
- **Analysis:** [REFUND-LEDGER-PAYMENT-REVERSAL.md](../analysis/REFUND-LEDGER-PAYMENT-REVERSAL.md).
- **Closes candidate:** TD-FR-1 (finance refund amount ledger).

## Context

Returns (ADR-269) produce a `RefundIntent` (status `PENDING`) — a computed *financial instruction* — but
**no money ever moves**: no code calls `PaymentProviderAdapter.refundPayment`, live provider HTTP is disabled
(`SANDBOX_HTTP_DISABLED`), only MOCK works (its `refundPayment` is an uncalled stub), no provider-native
refund webhook signing exists, and `payment-state.ts` produces only full `REFUNDED` (never
`PARTIALLY_REFUNDED`). Finance (ADR-268) already carries the `− ProductRefunds − ShippingRefunds` terms but
they are structurally `0` and `refundAmountsSupported=false`. The audit (analysis §1) confirmed the exact
seams; TODO-170 builds the missing execution + ledger + finance integration **without fabricating provider
capability**.

## Decision

### 1. `OrderRefund` is the append-only ledger of real/attempted money movement
A `ReturnRequest` approval is not a refund; a `RefundIntent` is the instruction; **`OrderRefund` is the money
movement**. Only `OrderRefund.status=SUCCEEDED` is financial truth. Partial and multiple refunds are
supported (one order → many returns → many intents → many refunds). `OrderRefundEvent` is the append-only
per-refund audit trail (`actorId` scalar, not FK — ReturnStatusHistory pattern). See analysis §3.

### 2. Financial invariant, enforced with a per-order lock
`Σ SUCCEEDED + Σ active(PENDING/PROCESSING) ≤ capturedMinor` (order + currency). Enforced inside
`prisma.$transaction` with `pg_advisory_xact_lock(hashtext("refund:${storeId}:${orderId}"))` (`$executeRaw`) +
recomputed captured/reserved + conditional `updateMany where version`. `capturedMinor = sumCapturedMinor` from
`payment-state.ts` (PAID/AUTHORIZED attempts). Currency must match exactly (no FX). See analysis §4.

### 3. RefundIntent is consumed exactly once (additive `CONSUMED`)
`RefundIntentStatus` gains **`CONSUMED`** (additive; `PROCESSED` kept as unused legacy — never dropped).
Consume = `PENDING→CONSUMED` atomically in the same transaction that creates the first `OrderRefund`
(`updateMany where status=PENDING`; `count!=1 ⇒ conflict`). `cancelPendingRefundIntent` is unchanged (targets
only `PENDING`), so a CONSUMED intent is never cancelled. Retry after FAILED does **not** re-consume — it opens
a new `OrderRefund` attempt (new server-derived idempotency key). See analysis §5, §7.

### 4. Provider capability is honest — no fake success
`resolveRefundCapability(attempt)` (pure): MOCK+ONLINE → `PROVIDER_AUTOMATIC`; real online providers
(Stripe/iyzico/PayTR/generic) → `MANUAL_OFFLINE` with `providerAutomaticUnsupported` (transport disabled, only
Stripe has a builder, no native webhook — automatic execution is genuinely unavailable this phase, so we offer
a manual workflow, never a simulated success); MANUAL/offline attempts → `MANUAL_OFFLINE`. MOCK refund
scenarios (`refund_failure`/`refund_timeout`/`refund_async`/`refund_duplicate`/default→success) are
deterministic and MOCK-only. See analysis §6.

### 5. Async/timeout/retry safety
Immediate success → SUCCEEDED + return COMPLETED (guard). Async accept → PROCESSING, reconciled by
`getRefundStatus`. Failure → FAILED, return stays REFUND_PENDING, safe retry. Timeout → **no blind retry**;
reconcile first; unknown surfaced explicitly. See analysis §7.

### 6. Reconciliation, not a fake webhook
No provider-native refund webhook signing exists (deferred, TD-137). This phase uses controlled **status query
reconciliation** (`refresh`) as the primary mechanism; duplicate protection via
`@@unique([storeId,provider,providerRefundId])` + `DUPLICATE_CALLBACK` event (idempotent); a late SUCCEEDED
after FAILED is accepted only when the providerRefundId matches (money truly moved). Cross-store/payment
mismatches rejected. Provider-native refund webhook + scheduled reconciliation are **future TD**. See §8.

### 7. Manual (offline) refund is a distinct, strongly-gated workflow
`MANUAL_OFFLINE` refunds (bank transfer / real-card manual) require `manualReference` + `manualNote` and a
**stronger permission** (SUPER_ADMIN); `PENDING→SUCCEEDED` via `manual-complete`; cannot complete twice
(status + version guard); mandatory audit. See analysis §9.

### 8. Order payment status is a projection; attempts are not mutated
Refund SUCCEEDED sets `Order.paymentStatus` via pure `resolveRefundedPaymentStatus`
(`REFUNDED` when Σ SUCCEEDED ≥ captured>0, else `PARTIALLY_REFUNDED`), monotonic. **PaymentAttempt.status is
NOT flipped to REFUNDED** — that would zero `sumCapturedMinor` and break the cap invariant. The OrderRefund
ledger is the refund authority; `Order.paymentStatus` is display only. No new OrderStatus. Partial refund does
not change delivery lifecycle. See analysis §10.

### 9. Finance subtracts only SUCCEEDED, exactly once
`data.ts` aggregates SUCCEEDED `OrderRefund` by `completedAt` (store tz) into day×currency
`productRefundsMinor`/`shippingRefundsMinor`, restricted to sales-universe orders; `metrics.ts` folds them
(formulas already subtract). `refundAmountsSupported` flips to `true`. Guards against double-count: inclusive
product refund subtracted once (taxRefund never re-subtracted); attribution `refundedRevenueMinor` excluded;
ledger is the single source (not `PaymentAttempt.REFUNDED`); cancelled orders (already out of the sales
universe) never get a refund subtraction. `gross − successful refunds = net` reconciliation tested. See §12.

## Consequences

- **Additive & reversible:** new `OrderRefund`/`OrderRefundEvent` models + enums, one additive enum value
  (`RefundIntentStatus.CONSUMED`); no column repurposed. No auto-backfill of OrderRefund from PENDING intents;
  no fabricated successful refunds. Migrate-before-app.
- **Finance becomes honest end-to-end:** realized refunds subtract from Net/Total once; `refundAmountsSupported`
  is finally `true`. TD-FR-1 closure candidate.
- **Completion unlocked correctly:** R5 guard changes from `RefundIntent.PROCESSED` to a SUCCEEDED
  `OrderRefund` covering the intent total; `PROCESSED` never written (kept as legacy enum value only).
- **Follow-ups (TECHNICAL_DEBT):** provider-native refund webhook signatures + scheduled reconciliation;
  live online-provider refund transport (EX-1); chargeback/dispute; Gift Card / Store Credit refund target.

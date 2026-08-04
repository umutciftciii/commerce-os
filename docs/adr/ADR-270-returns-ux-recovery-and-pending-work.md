# ADR-270 — Returns UX Recovery, Pending Work Indicators & Return-Shipment Unblock

- **Status:** ACCEPTED — implemented, full gate GREEN, real browser smoke PASS, **NOT committed/deployed**
  (git kuralı: commit/push/PR/merge/deploy yok; analiz + implementasyon + tam gate + browser smoke sonrası dur).
- **Date:** 2026-08-04
- **Builds on:** ADR-269 (Returns Authority & Lifecycle — 17-state machine, `evaluateReturnTransition`,
  `returns/projection.ts` `buildReturnOrderSummary`), ADR-094 (Product Reviews & Ratings — `ProductReviewStatus`),
  ADR-268 (Financial Reporting — `refundAmountsSupported=false`; `RefundIntent` PENDING finansa dokunmaz).
- **Scope:** three production-facing blockers surfaced after TODO-169 deploy — (1) storefront "İade durumunu
  görüntüle" CTA dead link, (2) missing pending-work visibility in Store Admin, (4) customer return-shipment
  dead-end after approval. Item (3) Unified Session Policy is **design-only** here → [ADR-271](ADR-271-unified-session-policy.md).
- **Blocks:** TODO-170 Refund Ledger & Payment Reversal stays **BLOCKED** behind the Unified Session Policy phase
  (next independent phase); UNBLOCKED once that phase closes.

## Context

Post-TODO-169 review found three defects that leave the customer or merchant stranded even though the backend
lifecycle is sound:

1. **BUG-RETURN-DEEPLINK.** The order-card CTA linked to `/account?section=returns`, but `returns` is not a
   valid account section (`app/account/page.tsx` `SECTIONS` allowlist + `renderSection` switch have no such
   case → `resolveSection` silently falls back to `orders`). The CTA rendered the orders list again; the
   dedicated routes `/account/returns` and `/account/returns/[returnNumber]` were never reached.
2. **No pending-work visibility.** 3 reviews sat in `PENDING` ("İncelemede") with no signal in Store Admin —
   a merchant only discovered them by opening the Reviews screen. Returns awaiting action were equally invisible.
3. **Return-shipment dead-end.** `canSubmitTracking` is `true` **only** in `AWAITING_SHIPMENT`
   (`evaluateReturnTransition(status,"RETURN_SHIPPED","CUSTOMER")`), but admin approve left the request in
   `APPROVED`/`PARTIALLY_APPROVED`. Reaching `AWAITING_SHIPMENT` required a **second** manual admin step, so an
   approved customer saw no actionable "Ürünü kargoya verdim" flow — the exact dead-end ADR-269 warned against.

## Decision

### 1. BUG-RETURN-DEEPLINK — a single canonical CTA contract, server-derived

The return order-summary projection gains **`primaryReturnNumber`** (contract `returnOrderSummarySchema`,
pure `buildReturnOrderSummary`): the single "focus" return number when there is exactly one active request
(or exactly one total request when none are active), else `null`. One shared storefront helper
`resolveReturnCtaHref(orderNumber, summary)` is the **only** CTA authority, used by every surface:

- `primaryReturnNumber` present → `/account/returns/{returnNumber}` (deep-link straight to tracking detail).
- ambiguous (multiple active) → `/account/orders/{orderNumber}#returns` (order-detail returns section).

The order-detail returns section is an **accessible deep-link target** (`id="returns"`, `scroll-mt-24` so the
sticky header never hides it, `aria-labelledby`, focusable heading). A client island `ReturnsDeepLinkFocus`
runs on mount (works after refresh) and on `hashchange`: it scrolls the target into view and moves focus to the
accessible heading (`preventScroll`), respects `prefers-reduced-motion`, and touches no history (browser Back is
unaffected). Each request card carries `id="return-{returnNumber}"` for future request-level deep links. The
storefront renders returns as **cards, not an accordion**; "auto-open" is therefore scroll + focus + the section
being always-expanded (documented divergence from the original spec's accordion wording).

### 2. Pending Work Indicators — one bounded server-side authority

`GET /stores/:storeId/pending-work-summary` (`apps/api-gateway/src/pending-work/`, `requireStorePlatformAdmin`)
returns a store-scoped, **bounded** aggregate from **two `groupBy` queries** (reviews + returns) — never one
request per menu item (no N+1). A pure `buildPendingWorkSummary` maps status rows to buckets aligned with the
ADR-269 lifecycle:

- `reviews` — `PENDING` count + oldest anchor.
- `returns.actionable` — every non-settled return (settled = `COMPLETED/REJECTED/CANCELLED_BY_CUSTOMER/EXPIRED/CLOSED`) → sidebar badge.
- `returns.newRequests` — `REQUESTED/UNDER_REVIEW` (awaiting review).
- `returns.inspection` — `RECEIVED/INSPECTION_REQUIRED` (goods in for inspection).
- `returns.financialAction` — `REFUND_PENDING/REPLACEMENT_PENDING` (post-inspection action).

Each bucket carries `count` + `oldestAt` (waiting-age derivation). Consumers:

- **Store Admin sidebar** — count pills on Değerlendirmeler (`reviews.count`) and İadeler (`returns.actionable.count`).
  `0` never renders a badge; `>99` shows `99+`; the count is **not colour-only** — an accessible name
  ("Değerlendirmeler: 3 bekleyen") is announced. Counts are store-scoped and **never auto-reset on route open**;
  they reflect real pending rows.
- **Store Admin dashboard** — a "Bekleyen İşler" card: per type, count, oldest waiting age, and a link to the
  filtered screen (`/reviews?status=PENDING`, `/orders/returns?status=…`).
- **Live refresh, not polling** — a decoupled browser-event bridge (`pending-work-events`): review/return
  mutations (`moderateReview`, `transitionReturn/approve/reject/inspect`) fire `notifyPendingWorkChanged()` on
  success; the sidebar and dashboard re-fetch. Verified live: approving one review dropped the badge 3 → 2 with
  no reload.
- **Platform Admin — deliberately no store-operation badges.** The platform surface owns stores/plans/themes/
  system-health, not per-store moderation queues; surfacing store review/return counts there would violate
  "mağaza operasyon sayılarını platform sidebar'a karıştırma". A genuine platform-level pending-work summary is
  future work only if a platform-scoped action queue is introduced.

### 3. Return-shipment — approval auto-advances to AWAITING_SHIPMENT (no dead-end)

On admin approve/partial-approve, **within the same transaction** (guarded by `evaluateReturnTransition`,
ADMIN actor, append-only history), the request auto-advances `APPROVED`/`PARTIALLY_APPROVED` → `AWAITING_SHIPMENT`.
Both first-phase resolutions require the customer to ship the item back, so a single admin click both approves
and opens the ship-back flow. The state machine's customer transition (`AWAITING_SHIPMENT → RETURN_SHIPPED`) is
**unchanged**; history honestly shows `APPROVED → AWAITING_SHIPMENT`.

The customer "Ürünü geri gönderin" section (rendered while `canSubmitTracking`) gains a server-authoritative
**ship-by deadline** `shipByDate` (approval anchor + `RETURN_SHIP_BACK_DAYS = 7`, config-default constant),
packaging guidance, who-pays-shipping (from policy), carrier + tracking inputs (tracking required), and an
idempotent "Takip bilgisini gönder" CTA. Duplicate submission is naturally prevented (post-success the form
hides; a re-POST returns 409 wrong-status). Store Admin shows a **"Müşteri tarafından gönderildi"** label with
the carrier/tracking and a "Teslim alındı" action that sets `receivedAt`. No new `StoreSettings` column was
added: "iade adresi **veya** mağaza talimatı" is satisfied by an honest i18n store-instruction (the return
address is communicated by the store in first-phase manual return shipping).

## Consequences

- **Additive & reversible; no schema/migration change.** `primaryReturnNumber` and `shipByDate` are computed
  from existing columns (`returnNumber`, `approvedAt`/`reviewedAt`); pending-work is `groupBy` over existing
  `ProductReview`/`ReturnRequest`. Nothing in finance changes (`refundAmountsSupported=false` holds).
- **Verification.** Full gate GREEN — typecheck (all workspaces, 0), lint (42/42, 0 errors), test (42/42;
  api-gateway 2279 incl. +5 projection deep-link, +5 pending-work, +4 store-nav badge; storefront 546 incl.
  +4 CTA href), build (27/27 incl. Next apps). Real browser smoke (worktree gateway :4100 + storefront :3100 +
  store-admin :3202 against docker postgres :5432, enterprise-demo) PASS: CTA → `/account/returns/R000001`;
  order-detail `#returns` focus = `returns-heading` (below sticky); sidebar badges 3/1 with accessible names;
  approve review → badge 3 → 2; approve return → `AWAITING_SHIPMENT` (auto-advance, append-only history);
  customer submits tracking → `RETURN_SHIPPED` (`shippedAt` server-side); duplicate → 409, foreign session →
  401/404; admin "Müşteri tarafından gönderildi" + carrier/tracking; "Teslim alındı" → `RECEIVED` + `receivedAt`;
  responsive 375/768/1024/1440 no horizontal overflow. Fixtures/forged sessions cleaned; demo reviews restored
  to PENDING and the return to APPROVED (see TECHNICAL_DEBT for the one unrecoverable smoke side-effect).
- **Follow-ups (TECHNICAL_DEBT):** Unified Session Policy implementation (ADR-271, next phase); optional
  per-store return address/instructions + ship-back-days on `StoreSettings`; dashboard/badge filtered-link
  query-param hydration on the target list screens; a real platform-level pending-work summary if/when a
  platform action queue exists; a real notification centre (this phase deliberately ships dashboard + nav badges
  only, per spec).

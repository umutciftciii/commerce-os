# Financial Reporting Foundation — Analysis

Status: **IN_PROGRESS** (backend + Store-Admin UI implemented; gate GREEN; **not committed/deployed**).
Authority decisions: [ADR-268](../adr/ADR-268-financial-reporting-authority.md).

## 1. Existing financial architecture (audit)

**Order model (`packages/db/prisma/schema.prisma`)**

- `Order`: per-order `currency` (multi-currency; no FX). Minor-unit `Int`:
  `subtotalAmount`, `discountAmount`, `shippingAmount`, `taxAmount`, `totalAmount`. Lifecycle
  `status ∈ {DRAFT,PLACED,CONFIRMED,CANCELLED,FULFILLED}`, `paymentStatus ∈ {UNPAID,PAYMENT_PENDING,
  AUTHORIZED,PAID,PARTIALLY_REFUNDED,REFUNDED,PAYMENT_FAILED,CANCELLED}`. `placedAt`, `cancelledAt`.
  Shipping snapshot (`shippingRatePlanName`, `shippingProvider`…). Billing identity fields.
- `orderTotals` (`apps/api-gateway/src/server.ts:3161`): `subtotalAmount = Σ line.totalAmount`;
  `discountAmount` is a separate order-level clamp; **`taxAmount = 0` always** (VAT inclusive);
  `totalAmount = subtotal − discount + shipping`. Line `unitPriceAmount = variant.priceMinor` (full
  selling price); campaign/coupon discount is applied **separately** via `applyOrderDiscountsInTransaction`
  → `OrderDiscount` rows + `order.discountAmount` ⇒ **no double counting** (Gross = subtotal, Discounts = discountAmount).
- `OrderLine`: `quantity`, `unitPriceAmount`, `totalAmount` (gross incl VAT). Additive F4C snapshots
  (NULL on legacy): `unitNetPriceMinor`, `unitVatRateBps`, `unitVatAmountMinor`, `unitListPriceMinor`,
  `unitCostMinor`, `lineNetAmountMinor`, `lineVatAmountMinor`, `lineCostMinor`.
- `OrderDiscount`: immutable discount snapshot (`discountAmountMinor`, `discountType`, `label`, `code`,
  `campaignId`, `couponId`). `CampaignRedemption`: per-campaign usage + `discountAmountMinor`.
- `PaymentAttempt`: `amount`, `currency`, `status`, `method`, `provider`, `manualMethod`, `paidAt`,
  `collectedAt`. **No fee/commission field.**
- `ProductVariant.costMinor` exists (internal margin; never public). `Product.brandId`/`brand`/
  `primaryCategoryId` for breakdowns.

**What can be computed:** gross (subtotal), net (subtotal−discount), discounts (discountAmount /
OrderDiscount), shipping (shippingAmount), tax (Σ lineVatAmountMinor, inclusive), units (Σ quantity),
orders/paid/cancelled/refunded counts, AOV, cost/profit (where line cost snapshot present).

**What is missing:** customer **refund amount ledger** (only paymentStatus state; `refundedRevenueMinor`
columns are attribution/sponsorship reversal only); **payment fee/commission**; **FX** (by design).

**Sale vs collection dates:** sale = `placedAt` (set at PLACED, `server.ts:4788`); collection =
`PaymentAttempt.paidAt`/`collectedAt` — deliberately separate.

**Store timezone:** `StoreSettings.timezone` (default `Europe/Istanbul`); fallback
`COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE`.

**Existing reporting:** none store-wide. Per-order `buildOrderSalesSummary` (F4C) is the closest primitive
and the model this widens. Reused patterns: `influencers/analytics.ts` (`$queryRaw` per-currency +
tz-bucketed daily), `influencers/analytics-range.ts` `resolveRange` (bounded, DST-safe),
`commercial-automation/timezone.ts`, `billing-core.ts` (bps/minor math). CSV was hand-rolled per route
(no shared helper, **no BOM**) → consolidated here.

## 2. Metric dictionary

See ADR-268 §2. Implemented as pure functions in `apps/api-gateway/src/finance/metrics.ts`
(`summarizeDailyRows`, `averageOrderValue`, `computeDelta`, `listCurrencies`, `primaryCurrency`).
Reconciliation (summary = Σ daily) is structural.

## 3. Reporting authority

Order/line/discount/payment snapshots only; never live product prices. Historical reports immutable under
catalogue change. Coverage-gated tax/profit; honest refund counts.

## 4. Migration / data-model decision

**No migration.** Query snapshots (option 1). `FinancialDailyAggregate` (future scale path) shape:

```
FinancialDailyAggregate {
  storeId, businessDate, currency,
  grossSalesMinor, discountsMinor, refundedProductMinor, netProductSalesMinor,
  shippingRevenueMinor, shippingRefundMinor, taxMinor, totalRevenueMinor,
  orderCount, paidOrderCount, cancelledOrderCount, refundedOrderCount, unitsSold, updatedAt
  @@unique([storeId, businessDate, currency])
}
```

Rebuildable read-model; never the accounting source. Introduce only when query latency demands it.

## 5–9. Reports implemented

- **Sales summary** — `/finance/summary`: KPI cards + daily series (zero-filled) + previous-period
  comparison + daily table (reconciliation view).
- **Product performance** — `/finance/breakdowns` (`byProduct`/`byVariant`): units, gross (selling),
  list-gross, markdown discount (list−selling), net, cost, coverage-gated profit.
- **Category & brand** — `byCategory` (primaryCategory), `byBrand` (governed Brand ∪ legacy `brand`).
- **Payment report** — `/finance/payments`: by provider/method, paid/failed/refunded counts + collected
  amount (per currency, collection-dated).
- **Discount report** — `/finance/discounts`: by campaign/coupon, usage, discount total, orders gross.

## 10. Refund decision

No refund amounts reported (never fabricated). Refund **counts** shown; `refundAmountsSupported=false`
surfaced. Minimum future read-model specified in ADR-268 §5 (`OrderRefund` append-only ledger).

> **Update (TODO-169 / ADR-269, 2026-08-04):** the Returns Management Foundation now creates `RefundIntent`
> (status `PENDING`) rows on approved refund-resolution returns, computed from immutable OrderLine snapshots.
> These are the **upstream** records for the ADR-268 §5 `OrderRefund` ledger but **do not touch finance**:
> `refundAmountsSupported` stays `false` and `productRefundsMinor`/`shippingRefundsMinor` stay `0` until
> **TODO-170 Refund Ledger & Payment Reversal** processes the intents, performs the reversal, and writes the
> ledger that finance reads (subtracting from Net/Total exactly once). Gross sales are never reduced by a return.

## 11. Profitability decision

Supported (cost snapshot exists), coverage-gated (all-or-null per period), coverage disclosed. Allocation/
blended margin future.

## 12. Date / timezone / currency

`resolveFinanceRange` (`finance/date-range.ts`) — presets (today/yesterday/last7/last30/thisMonth/
lastMonth/thisYear/custom) resolved in store tz, bounded to `FINANCE_MAX_RANGE_DAYS=366`, future clamped,
+ previous equal-length period. Per-currency; no FX.

## 13. Comparison

`computeDelta` — amount + percent, zero-denominator safe; UI arrow+sign (not colour-only).

## 14. CSV export

`finance/csv.ts` — shared `csvCell` (formula-injection guard) + `buildCsv` (UTF-8 BOM, `\r\n`).
Exports: sales-summary, product-performance, order-financial-lines (limit 50k), payment-report,
discount-report. Server-side, filter-honouring, store-scoped. XLSX future.

## 15. Tenant isolation & security

Every query `storeId`-scoped via `requireStorePlatformAdmin` (Platform-admin + store-404). No new
capability key (Orders/dashboard tier). No PAN/secret in output. Platform cross-store aggregation future.

## 16. Performance

DB-side aggregation (`$queryRaw` SUM/COUNT/GROUP BY); bounded date range (≤366 days); per-order snapshot
completeness computed in a CTE; breakdowns top-N (LIMIT); order-lines export capped 50k; no N+1, no
row-materialisation into memory for aggregates. Existing indexes leveraged: `Order(storeId,createdAt)`,
`Order(status)`, `OrderLine(orderId|variantId)`, `PaymentAttempt(storeId|status)`.

## 17. Reconciliation invariants (tested)

Summary = Σ daily (structural + unit-tested); cancelled excluded from sales; unpaid excluded from paid;
refund never double-subtracted (amount = 0 this phase); inclusive VAT never re-added to revenue; shipping
only on qualifying orders; per-currency isolation. Suite: `apps/api-gateway/test/finance-metrics.test.ts`.

## 18. Gate

`db:generate` + full `build` (turbo 27/27, incl. `/finance/reports` + 9 BFF routes) →
root `typecheck` clean → `lint` 0 errors → `test` 2219 passed (incl. 31 finance tests). Commit/deploy
**not** performed (git rule).

## 19. Gift Cards & Store Credit

**FUTURE BACKLOG.** No gift-card column, zero value, or empty card rendered this phase. Dictionary is
extensible to future sources (issued liability, redeemed allocation, outstanding/expired balance, store
credit movement) without fabrication.

## 20. Browser smoke runbook (fixtures)

Isolated store with: normal PAID, discounted PAID, shipped, free-shipping, CANCELLED, UNPAID orders;
partial/full refund only if a refund flow exists (else refund counts only); mixed product/category/brand;
two payment methods. Verify dashboard KPIs, date filter, comparison, product & category/brand breakdowns,
payment & discount reports, CSV export, and that totals match the DB fixture exactly. Responsive at
375/768/1024/1440. Clean up fixtures after. (See OPERATIONS.md "Finance Reports smoke runbook".)

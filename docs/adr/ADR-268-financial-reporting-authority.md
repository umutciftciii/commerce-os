# ADR-268 — Financial Reporting Authority (Financial Reporting Foundation)

- **Status:** ACCEPTED & DEPLOYED — Financial Reporting Foundation (PR #168 merge `9a4c8db`;
  currency-selector fix PR #169 merge `eb31cc3`). api-gateway + store-admin-web rebuilt/recreated from main;
  no migration (schema up to date); post-deploy smoke PASS (reconciliation exact; fixtures cleaned).
- **Date:** 2026-08-03
- **Builds on:** F4B (cost/margin snapshot), F4C / ADR-063/ADR-064 (VAT + `buildOrderSalesSummary`
  per-order authority), ADR-176/ADR-178 (per-currency segregation + tz-aware bounded ranges),
  ADR-089 (Admin Data Grid), TODO-160 influencer analytics (`$queryRaw` per-currency aggregation pattern).
- **Analysis:** [FINANCIAL-reporting-foundation.md](../analysis/FINANCIAL-reporting-foundation.md)

## Context

The platform had **no store-wide financial reporting**: the store-admin dashboard summarised only
catalogue/inventory counts; the only per-order money derivation was `orders/sales-summary.ts`
(`buildOrderSalesSummary`, F4C) which computes a single order's gross/net/VAT/profit/paid-vs-remaining
from **snapshot fields**. There was no sales aggregation across orders, no order/sales CSV export, and no
daily financial rollup. Merchants need "Finans > Raporlar": revenue, discounts, shipping, tax, orders,
AOV, units, breakdowns (product/variant/category/brand/payment-method/campaign), payment and discount
reports, period comparison, and CSV export.

The audit (see analysis) established what the order model can and cannot support:

- **Present & reliable:** per-order `currency`; minor-unit money on `Order`
  (`subtotalAmount`, `discountAmount`, `shippingAmount`, `totalAmount`); immutable discount snapshots
  (`OrderDiscount.discountAmountMinor`); per-line VAT/cost/list snapshots
  (`OrderLine.lineVatAmountMinor`, `lineNetAmountMinor`, `lineCostMinor`, `unitListPriceMinor` — additive,
  NULL on pre-F4C legacy); `PaymentAttempt` captured amounts; `placedAt` sale timestamp;
  `StoreSettings.timezone` business timezone.
- **KDV is inclusive:** `Order.taxAmount` is always `0` (prices carry VAT). Tax is only derivable from
  `OrderLine.lineVatAmountMinor` snapshots.
- **Absent:** a **customer refund amount ledger** (only `paymentStatus REFUNDED/PARTIALLY_REFUNDED`
  state exists; the `refundedRevenueMinor` columns belong to attribution/sponsorship reversal, not customer
  money); **payment fee/commission** data; **FX/conversion** (deliberately — currencies are compared by
  identity, never converted).

## Decision

### 1. Reporting authority = order snapshots, never live prices

All figures derive **exclusively** from `Order` / `OrderLine` / `OrderDiscount` / `PaymentAttempt`
snapshots. Live `Product`/`ProductVariant` price, cost, name, category, or brand are **never** joined for
money. Historical reports stay stable when the catalogue changes afterward. This mirrors and store-widens
the per-order `buildOrderSalesSummary` contract.

### 2. Metric dictionary (single server-side source of truth)

A pure, I/O-free module `apps/api-gateway/src/finance/metrics.ts` defines every KPI as a deterministic
function over **daily building-block rows** (`FinanceDailyRow`, one per business-day × currency). Formulas
(minor-unit; VAT inclusive; per-currency):

| Metric | Formula |
|---|---|
| Gross Sales | Σ `Order.subtotalAmount` (pre-discount selling total) |
| Discounts | Σ `Order.discountAmount` (= Σ `OrderDiscount.discountAmountMinor`) |
| Product Refunds | **0** (no amount ledger — see §5; never fabricated) |
| Net Product Sales | Gross − Discounts − Product Refunds |
| Shipping Revenue | Σ `Order.shippingAmount` |
| Total Revenue | Net Product Sales + Shipping Revenue − Shipping Refunds(0) |
| Tax (KDV) | Σ `OrderLine.lineVatAmountMinor` (inclusive; **shown separately, not re-added to revenue**) |
| Orders | count where `status ∈ {PLACED,CONFIRMED,FULFILLED}` |
| Paid Orders | count where `paymentStatus ∈ {PAID,AUTHORIZED}` |
| Units Sold | Σ `OrderLine.quantity` |
| Cancelled Orders | count `status = CANCELLED` (excluded from sales; bucketed by `createdAt`) |
| Refunded Orders | count `paymentStatus ∈ {REFUNDED,PARTIALLY_REFUNDED}` (count only) |
| AOV | round(Total Revenue / Orders); zero-denominator → 0 |

**Reconciliation by construction:** the runtime path is DB-aggregation to daily grain (bounded) → the pure
fold. Summary totals therefore always equal the day-by-day breakdown totals (§15 invariant is arithmetic).

### 3. Sales universe & dates

Sales = `status ∈ {PLACED,CONFIRMED,FULFILLED}` (DRAFT & CANCELLED excluded). Sale date =
`COALESCE(placedAt, createdAt)`. Collection ("tahsilat") is **separate** from sales: the payment report
buckets `PaymentAttempt` by `COALESCE(paidAt, collectedAt, createdAt)` and reports captured amounts —
"satış ≠ tahsilat".

### 4. Data-model decision — query snapshots; NO parallel accounting

Per the preference order (query snapshots → additive immutable snapshot → daily aggregate only if needed),
this phase **queries existing snapshots** via bounded, tz-bucketed `$queryRaw` aggregation. **No
`FinancialDailyAggregate` table and no new migration** are introduced — order/line snapshots are already
sufficient and immutable, and volume is SME/demo-scale. `FinancialDailyAggregate` (shape in the analysis
doc) is recorded as the **future scale path**, to be introduced only when query latency on real volume
demands it; it would be a rebuildable read-model, never the accounting source.

### 5. Refund decision (the "minimum correct refund read-model" this phase must decide)

There is **no reliable customer refund amount**. Therefore refund **amounts are never reported** (no
guessed full-refund = total, no zeroed columns presented as real). The reports expose refund **counts**
(`refundedOrderCount`) — which *are* reliable from `paymentStatus` — and a `refundAmountsSupported: false`
flag the UI surfaces honestly ("İade tutarı altyapısı henüz yok"). The **decided minimum refund
read-model** for a future phase: an append-only `OrderRefund { orderId, amountMinor, shippingPortionMinor,
reason, refundedAt, createdBy }` ledger populated by an actual refund flow; once present, Product Refunds
and Shipping Refunds become non-zero and Net/Total subtract them (single subtraction — never double).

### 6. Profitability decision (ADR-268 §8)

Sale-time cost snapshot (`OrderLine.lineCostMinor`) **exists**, so profitability is **supported**, gated
on coverage exactly like `buildOrderSalesSummary`: profit is shown only when **every** sales order in the
period has full VAT **and** cost snapshots; otherwise `grossProfitMinor`/`netProfitMinor`/`costMinor` are
`null` and the UI discloses coverage (`costCoveredOrderCount / orderCount`). No live/backfilled cost is
applied to historical orders. `Gross Profit = Σ lineNetAmountMinor − Σ lineCostMinor`;
`Net Profit = Gross Profit − Discounts`. Full margin analytics (allocation, blended margin over time)
remain future.

### 7. Time, currency, timezone

All money minor-unit. Every currency reported **separately**; different-currency values are never summed
(no FX). Primary currency = highest sales volume (ADR-176 rule). Business-day boundaries resolved in
`StoreSettings.timezone` (fallback `COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE` → `Europe/Istanbul`) via the
reused `resolveRange` (ADR-178) and SQL `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` bucketing.

### 8. Comparison

Previous **equal-length immediately-preceding** period; amount delta + percent delta with zero-denominator
safety (`previous = 0 → deltaPct = null`, rendered "yeni"). Direction is shown by arrow + sign, never colour
alone (§10 / §17).

### 9. Filters, tenant isolation, export

Filters (period/date/currency/status/paymentStatus/product/variant/category/brand/campaign/paymentMethod)
apply at **order level** — product/category/brand/campaign/payment-method use `EXISTS` semantics ("orders
containing a matching line/discount/capture"), covering **whole matching orders** (order-level snapshots are
not line-attributable). Filter state is preserved in the URL. Every query is `storeId`-scoped; cross-store
access returns 404 via the existing `requireStorePlatformAdmin` gate — **no new capability key** (same tier
as Orders/dashboard; Platform-admin cross-store aggregation is out of scope this phase). CSV is
server-side, honours active filters, is store-scoped, formula-injection-guarded, `\r\n`-delimited,
`text/csv; charset=utf-8`, and **UTF-8 BOM**-prefixed for TR Excel. XLSX is future (no primitive).

### 10. Service layering

`apps/api-gateway/src/finance/`: `metrics.ts` (pure dictionary) · `date-range.ts` (preset/tz range,
reusing `resolveRange` + `commercial-automation/timezone`) · `data.ts` (`$queryRaw` aggregation, injectable
`FinanceDataAccess`) · `csv.ts` (shared injection-guarded + BOM builder) · `routes.ts`
(`registerFinanceRoutes`). Contracts in `@commerce-os/contracts`; store-admin BFF proxies via
`@commerce-os/api-client` `admin.finance.*`; UI at `app/(app)/finance/reports`.

## Consequences

- Reports are honest and stable: no fabricated refund amounts, no misleading zero-cost profit, no
  cross-currency blending, no live-price contamination.
- Reconciliation is structural (summary = Σ daily) and unit-tested; the same pure engine is the runtime path.
- Refund amounts, payment fees, FX, profitability allocation, `FinancialDailyAggregate`, scheduled reports,
  and accounting integration are explicitly **future** (see TECHNICAL_DEBT / ROADMAP).
- Gift Cards & Store Credit stay **FUTURE BACKLOG**; the dictionary is extensible to accept future sources
  (issued liability, redeemed allocation, outstanding/expired balance) without today fabricating any card row.

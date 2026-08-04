# RETURNS Management Foundation — Analysis (TODO-169)

Decision record: [ADR-269](../adr/ADR-269-returns-authority-and-lifecycle.md). Blocks TODO-170 (Refund
Ledger & Payment Reversal). Scope guard: no Marketplace repo changes, no Gift Card / Store Credit, no real
provider refund (TODO-170), no PB-3/TD-139.

## 1. Existing order / fulfillment infrastructure (audited, evidence-based)

| Question the task demands | Finding | Evidence |
|---|---|---|
| Is a delivery date actually stored? | **No first-class delivery date.** `OrderStatus` has no `DELIVERED`; delivery is a *shipment* fact via `ShipmentStatus.DELIVERED`. Only a `DELIVERED` `ShipmentEvent.occurredAt` (nullable) infers it today. → we **add `Shipment.deliveredAt`** set on transition, backfilled from `updatedAt`. | `schema.prisma:259` (OrderStatus), `:456` (ShipmentStatus incl. DELIVERED), `:2236` (ShipmentEvent.occurredAt), `shipping/routes.ts:1629` (DELIVERED→FULFILLED cascade) |
| From which date can the return window be computed? | From the new `Shipment.deliveredAt` (anchor = max deliveredAt over the order's delivered shipments; fallback `updatedAt`). | ADR-269 §2 |
| Is the OrderLine quantity snapshot sufficient? | **Yes.** `OrderLine.quantity`, `unitPriceAmount`, `totalAmount`, `currency`, plus F4C additive `unitNet/unitVat/unitGross/unitList/lineNet/lineVat/lineGross/unitCost` snapshots (nullable on pre-F4C legacy). | `schema.prisma:1815-1856` |
| How is prior returned quantity computed? | **No existing field.** Computed from the new domain: `Σ ReturnItem.quantity` for the line across requests **not** in a releasing terminal state (REJECTED/CANCELLED_BY_CUSTOMER/EXPIRED). | ADR-269 §2 |
| Refund / replacement infra present? | **None.** No `Return*`/`Refund*`/`RefundIntent` customer models. Only payment-layer `PaymentStatus.PARTIALLY_REFUNDED/REFUNDED` + `buildRefundRequest` provider adapter (unused for customer returns), and attribution/sponsorship `*Refund` models (not customer money). | `schema.prisma:277`, `payments/adapters/provider-adapter.ts:84`, `:4234`/`:4401` (attribution refunds) |
| Shipment tracking / return-label support? | Outbound shipment tracking exists (`Shipment.trackingNumber/trackingUrl/labelUrl`, manual tracking event `MANUAL_TRACKING`). **No return-label generation.** First phase: manual return instructions + customer enters a tracking number + admin marks received (no fake label). | `schema.prisma:2154-2234`, `shipping/routes.ts` (MANUAL_TRACKING) |
| Inventory / restock present? | `InventoryItem.quantityOnHand/quantityReserved`, append-only `InventoryAdjustment` (`batchId`, source enum with reserved `ORDER_*`), `InventoryMovementType.RETURN` **already defined**. Order-flow stock is server.ts `placeOrder`/`cancelOrder`; admin field-edit is `inventory-engine`. Return restock uses `quantityOnHand++` + `InventoryMovement RETURN` + `InventoryAdjustment(source RETURN_RESTOCK)`. | `schema.prisma:200-209`, `:1487`, `:333`, `inventory-engine/data.ts:537` |
| Notification / mail infra? | **Placeholder only.** notification-service is a 4-line stub; BullMQ `platform-events` bus exists but the worker only logs; no email sender/templates/producer. → post-commit fail-open event emission; real delivery documented as platform-wide future. | `services/notification-service/src/index.ts:1`, `apps/worker/src/main.ts:22`, `packages/queues/src/index.ts:82` |
| Media upload primitive? | ADR-065 pipeline: admin `POST /stores/:storeId/media` (sharp/webp, MIME/size guards, `MediaAsset`). **Served fully public via `@fastify/static`; `StorageDriver` has no `read`; no signed URLs; `MediaContext` lacks a returns value.** → private root + `read()` + auth-gated route + `RETURN_ATTACHMENT` context. | `media/routes.ts:204`, `media/storage.ts` (no read), `server.ts:7602` (public static), `schema.prisma:158` |
| Audit log? | `AuditLog(action, storeId?, platformUserId?, entityType, entityId?, metadata)`; **only platformUser actor**; generic `AuditAction`. → `ReturnStatusHistory(actorType, actorId)` is primary trail; admin actions also `recordAudit`. | `schema.prisma:1056`, `:58`, `server.ts:5063` |
| Financial Reporting refund gap? | ADR-268: **`refundAmountsSupported=false`**, `productRefundsMinor`/`shippingRefundsMinor` forced `0`; future `OrderRefund` ledger specified (§5). Returns must NOT change revenue. `RefundIntent` PENDING is the upstream record TODO-170 converts. | `ADR-268 §5`, `finance/metrics.ts:86`, `finance/routes.ts:157` |

**Customer screens** (`apps/storefront-web`, no separate storefront-service): list `/account?section=orders`
+ detail `/account/orders/[orderNumber]`; server read helpers `lib/server/customer.ts`; gateway public
customer routes `apps/api-gateway/src/customers/index.ts` (`requireStore` + `requireCustomer`,
`x-customer-session`). Line thumbnail = `ProductMediaFrame variant="line-thumbnail"`. A **placeholder return
flow already exists** (`lib/orders.ts` `RETURN_WINDOW_DAYS=15` + `returnEligibility`; `order-actions.tsx`
info-only CTA; i18n "enabled in a later phase") → upgraded to the real flow. No stepper/checkbox/radio/
char-counter/upload primitive in storefront → built in the local editorial kit (`components/ui`).

**Store-admin** (`apps/store-admin-web`, dark-glass local kit): nav `store-nav.tsx:130` (Siparişler, sales
group) → add "İadeler" sibling with a local locale label map (shared i18n off-limits for net-new nav). List
reuses `components/data-grid/*` (ADR-089) + tone dictionaries in `orders/order-shared.ts`. Detail reuses
`app/components/premium.tsx` (`DetailHero`/`DetailLayout`/`Timeline`/`RailCard`). Actions: `lib/client/api.ts`
→ BFF route `app/api/orders/.../returns/*` (CSRF + `requireStoreContext`) → api-client → gateway
`/stores/:storeId/...` (`requireStorePlatformAdmin`).

**Backend pattern:** modular `registerReturnRoutes(app, deps)` under `apps/api-gateway/src/returns/`
(modelled on the shipping module), not inline server.ts. Data-access via `prisma.$transaction`, `storeId`-first
scoping, string-sentinel / `{ok,error}` returns → `errorBody(code,msg)` → 404/409/400. Contracts/types in
`packages/contracts/src/index.ts`.

## 2. Data model (additive)

New models: `ReturnRequest`, `ReturnItem`, `ReturnAttachment`, `ReturnStatusHistory`, `RefundIntent`.
New enums: `ReturnStatus`, `ReturnResolutionType`, `ReturnReason`, `ReturnItemConditionStatus`,
`ReturnInspectionResult`, `ReturnRestockDecision`, `ReturnActorType`, `RefundIntentStatus`.
Modified: `Shipment.deliveredAt` (+ set-on-DELIVERED); `StoreSettings` +5 policy fields;
`InventoryAdjustmentSource.RETURN_RESTOCK`; `MediaContext.RETURN_ATTACHMENT`. One migration.

## 3. Test surface (see ADR-269 §4/§6/§7)

Pure units: eligibility (window/not-delivered/expired/qty-limit/prior-return-subtraction), state machine
(valid + illegal transitions, actor authority, cancel window), refund calc (pro-rata, order-discount
largest-remainder allocation, free vs paid shipping, inclusive tax not double-counted). Integration:
cross-customer/store 404, multi-line + partial-qty request, required-comment rules, attachment authorization,
full/partial approval, rejection-reason requirement, customer cancel, tracking, received/inspection, idempotent
restock, RefundIntent creation, tenant isolation, append-only history, concurrent duplicate prevention.

## 4. Out of scope / follow-ups

Real provider refund + `OrderRefund` ledger + finance wiring (TODO-170); object-store/signed-URL private
media; real email delivery; return-exclusion registry; automated return labels; store credit / gift card /
manufacturer support / exchange-with-different-product; fraud/risk scoring; marketplace seller return routing.

## 5. Customer & Order Integration Recovery (TODO-169.1)

The foundation shipped the domain + wizard + admin module but **did not surface returns on the order pages**.
Six acceptance blockers were fixed in the same worktree (additive; no migration):

| # | Blocker | Fix (evidence) |
|---|---|---|
| 1 | Return window/policy invisible | Eligibility + projection expose `deliveredAt`/`returnWindowDays`/`returnWindowEndsAt`/`remainingDays`/`windowState` (anchor = `Shipment.deliveredAt`, never purchase). Storefront labels on order list/detail/wizard/return-tracking (`returns/eligibility.ts`, `returns/projection.ts`, i18n `account.orders.returnBadge`). |
| 2 | Summary CTA overflow | `SummaryPanel` nav → full-width stacked (`Geri` secondary + primary submit); no overflow 320/375/1024 (`return-wizard.tsx`). |
| 3 | Admin thumbnail blank | Root cause `serialize.ts:172 imageUrl:null` + no cover map. Shared `resolveReturnItemCovers` (store-scoped ProductImage) wired into `routes-admin.loadAdminDetail`; monogram placeholder fallback. |
| 4 | Return-shipping UX thin | Prominent "ship it back" block (who-pays + instruction + deadline + tracking form) + stage help texts on customer return detail; admin received/inspect/tracking already present. |
| 5 | Order list ignores returns | Separate return badge from `returnSummary` (`latestStatus`+qty) + "view return status"; `Teslim edildi` preserved; review panel moved out of the action bar (regression). |
| 6 | Order detail no returns | `Returns` section + pending financial impact on customer (`order.returnSummary` + `listReturns` filtered) and Store-Admin (`orders/[id]` + `GET …/orders/:id/return-summary`). |

**Return projection (blocker #8)** is the shared authority (`returns/projection.ts`, pure + unit-tested):
`requestCount / activeRequestCount / returnedItemQuantity / pendingItemQuantity / approvedRefundIntentMinor /
completedRefundMinor / hasPendingFinancialImpact / latestStatus / returnWindowEndsAt`. Reused by customer list
(fail-open), customer detail, admin order detail, and eligibility. **Financial semantics stay honest** (blocker #7):
PENDING intent is an approved *intent*, not a realized refund (`completedRefundMinor=0`); the customer sees an
"expected net" line, the admin a provisional-profit note; Financial Reporting revenue is unchanged
(`refundAmountsSupported=false`). Gate: build/lint/typecheck 0 errors, **4229 tests green** (added
`returns-projection` + `returns-summary` unit tests). Browser smoke (isolated `SMOKE-10`, 3-item DELIVERED):
window label = "16.08.2026 tarihine kadar iade edilebilir", badge "1 ürün iade onaylandı" with delivery preserved,
create→approve→RefundIntent PENDING, admin `imageUrl` non-null, pending financial impact on both surfaces, CTA
non-overflowing at 320/375/1024 — fixture cleaned. See [ADR-269 §11](../adr/ADR-269-returns-authority-and-lifecycle.md).

---

## Pre-Refund UX Recovery (ADR-270) — 2026-08-04

TODO-169 sonrası 3 blocker (item 1/2/4) kapatıldı, **migration YOK**:
- **BUG-RETURN-DEEPLINK (kök neden):** order-card CTA `/account?section=returns`'e gidiyordu ama `returns`
  geçerli account section değil (`SECTIONS` allowlist + `renderSection` switch yok → `resolveSection` Orders'a
  düşürüyor). Fix: projeksiyon `primaryReturnNumber` (tek "odak" iade) + tek canonical `resolveReturnCtaHref`
  (tek aktif → `/account/returns/{no}`, çok → `/account/orders/{no}#returns`); order-detail `#returns` anchor +
  `ReturnsDeepLinkFocus` island (refresh/back güvenli, sticky altında değil, erişilebilir başlığa focus).
- **Return-shipment çıkmazı:** `canSubmitTracking` yalnız `AWAITING_SHIPMENT`'te true; approve `APPROVED`'de
  bırakıyordu. Fix: approve aynı tx'te otomatik `APPROVED/PARTIALLY_APPROVED → AWAITING_SHIPMENT` (SYSTEM/ADMIN
  guard + append-only history). Müşteri "Ürünü geri gönderin" `shipByDate` (approvedAt + `RETURN_SHIP_BACK_DAYS`=7)
  + paketleme + a11y; admin "Müşteri tarafından gönderildi" + "Teslim alındı"→`receivedAt`.
- Pending Work: iade `actionable`/`newRequests`/`inspection`/`financialAction` bucket'ları ADR-269 yaşam
  döngüsüyle hizalı (settled = COMPLETED/REJECTED/CANCELLED_BY_CUSTOMER/EXPIRED/CLOSED).

Bkz. [ADR-270](../adr/ADR-270-returns-ux-recovery-and-pending-work.md).

---

## Post-Audit Hardening (2026-08-04)

Cross-module review, deliver edilmiş iade işinde finansal-invariant / correctness açıkları buldu. Hepsi **additive**
(append-only; mevcut kolon repurpose edilmedi), commit/deploy YOK, follow-up migration
`20260804170000_adr271_returns_session_hardening`. Durum: **Return Financial Invariants IN_PROGRESS**.

- **R1 — RefundIntent CANCELLED lifecycle:** refund'suz terminal geçiş
  (`REJECTED`/`CANCELLED_BY_CUSTOMER`/`EXPIRED`/`CLOSED` finansalsız) PENDING `RefundIntent`'i AYNI tx'te `CANCELLED`
  yapar (silinmez). Additive alanlar `RefundIntent.cancelledAt`/`cancellationReason`. Projection yalnız PENDING'i
  "pending financial impact" sayar → sonlanmış iadeler artık hayalet provizyonel düşüş göstermez.
- **R2 — çift-talep serileştirme:** `createReturnRequest` `pg_advisory_xact_lock(storeId:orderNumber)` alır →
  eşzamanlı talepler aynı sipariş için serileşir, over-claim etmez.
- **R3 — atomik optimistic version:** admin mutation'larına zorunlu `expectedVersion` (contracts);
  `applyReturnTransition` atomik (`updateMany where version=expected`; count=0 → 409 `VERSION_CONFLICT`, yan etki yok).
  Store-admin UI `ret.version` gönderir, 409'da reload + dostça mesaj.
- **R5 — COMPLETED guard (kodla enforce):** REFUND için gerçek refund (intent `PROCESSED`), REPLACEMENT için
  doğrulanmış fulfillment olmadan `COMPLETED` yasak → 409 `COMPLETION_NOT_ALLOWED`. TODO-170'e kadar en ileri
  finansal durum `REFUND_PENDING`/`REPLACEMENT_PENDING`.
- **P1/P2 — admin-actionable allowlist:** pending-work "actionable" artık "settled-olmayan her şey" DEĞİL; açık
  allowlist (`REQUESTED`/`UNDER_REVIEW`/`RECEIVED`/`INSPECTION_REQUIRED`/`INSPECTED`/`REFUND_PENDING`/
  `REPLACEMENT_PENDING`). Müşteri/kargo-bekleyen (`APPROVED`/`PARTIALLY_APPROVED`/`AWAITING_SHIPMENT`/`RETURN_SHIPPED`)
  SAYILMAZ. `INSPECTED` artık inspection bucket'ında (eskiden kayıptı). Invariant: sidebar actionable == Σ dashboard
  bucket.
- **Testler:** `returns-lifecycle.integration.test.ts` (`commerce_os_test` DB, `DATABASE_URL` set; CI'da SKIP).
- **TODO-170 durumu:** R1 orijinal blocker'ı çözdü, fakat TODO-170 (append-only `OrderRefund` ledger) ayrı ve
  **hâlâ BLOCKED** — bu return financial invariants + private media hardening (C1) ship edilene kadar başlanmamalı.

Bkz. [ADR-269](../adr/ADR-269-returns-authority-and-lifecycle.md) "Post-Audit Hardening".

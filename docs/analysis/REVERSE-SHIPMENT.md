# Reverse Shipment — Denetim & Spec (Return Flow Simplification PR3)

**Tarih:** 2026-08-07 · **Durum:** IMPLEMENTED / NOT SHIPPED · **ADR:** [ADR-274](../adr/ADR-274-reverse-shipment.md)
**Kararlar:** K1–K5 (kullanıcı, 2026-08-06/07). Commit/push/PR/merge/deploy YOK.

Amaç: incelemede reddedilen ürün/adetlerin mağazadan müşteriye güvenli geri gönderimi; normal fulfillment'tan,
müşteri→mağaza iade kargosundan, refund ledger'dan ayrık.

## 1. Kanıtlı mimari
Tüm shipment + return backend `apps/api-gateway/src/{shipping,returns,customers,refunds}` içinde (Fastify; tek DB
otoritesi). `services/*` NestJS ve Next app'ler (`store-admin-web`, `storefront-web`) yalnız gateway proxy'ler —
`prisma.shipment`'a doğrudan dokunmazlar. Prisma tek shared şema `packages/db/prisma/schema.prisma`. Zod
contract'lar `packages/contracts/src/index.ts`.

## 2. Shipment yazım noktaları (hepsi store-admin, hepsi implicit outbound bugün)
| Yer | Dosya:satır | Guard | referenceId |
|---|---|---|---|
| DHL prepare | `shipping/routes.ts:1114-1141` | `ensureOrderPaidForShipment`(1064) → `findActiveShipment` 409(1067-1075) | `order.orderNumber`(1077) |
| Manuel draft | `shipping/routes.ts:1197-1215` | paid(1181) → findActive(1183-1191) | `order.orderNumber`(1193) |
| create-order upsert | `shipping/routes.ts:797-823` | paid(676), dup guard YOK (upsert `storeId_referenceId`) | client `input.referenceId`(693) |

Duplicate guard `findActiveShipment(storeId,orderId)` `shipping/routes.ts:831-853`: `ACTIVE_SHIPMENT_STATUSES` =
CANCELLED/FAILED dışı hepsi (**DELIVERED dahil**). DB backstop `@@unique([storeId,referenceId])`.

## 3. Direction'sız projeksiyonlar (kirlenme noktaları → OUTBOUND filtresi)
- **Order badge (admin):** `server.ts:2096` `pickOrderShipmentStatus(shipments.status[])`; rank map
  `contracts/src/index.ts:544-573`. `Order.fulfillmentStatus` mutate EDİLMEZ (türetme).
- **Order badge (müşteri liste):** `customers/index.ts:914-927` aynı `pickOrderShipmentStatus`.
- **FULFILLED-on-DELIVERED:** yalnız manuel DELIVERED route `shipping/routes.ts:1634-1648` order'ı FULFILLED yapar.
- **Müşteri tracking:** `customers/index.ts:1021-1069` `findFirst createdAt desc` (direction filtresi YOK) → ters
  gönderi müşterinin outbound tracking'ini gizler. Customer-safe SELECT (PII/barcode hariç).
- **İade penceresi teslim anchor:** `returns/eligibility.ts:26-36` `resolveDeliveryAnchor`=MAX(deliveredAt) over
  DELIVERED shipments; batched `returns/projection.ts:214-264`. Ters DELIVERED pencereyi kaydırabilir (kritik).
- **Admin liste/KPI:** `shipping/routes.ts:1386-1444`; KPI `groupBy status` store-wide; bucket
  `shipping/serialize.ts:343-366`. Filtreler provider/status/date/text — direction yok.

## 4. State-machine (REUSE)
`shipping/status-map.ts`: `evaluateManualStatusChange`(114-131); `MANUAL_SHIPMENT_STATUS_TARGETS` =
IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED/DELIVERY_FAILED/RETURNED(90-96); monotonic `SHIPMENT_STATUS_RANK`; terminal
DELIVERED/RETURNED/CANCELLED/FAILED(79-84). Manuel route `shipping/routes.ts:1586-1660` MANUAL_STATUS event +
`deliveredAt=now` yalnız DELIVERED'da (idempotent). Reverse için REUSE + direction guard (FULFILLED yapmaz).

## 5. Return / disposition tarafı
- `rejectedQuantity` **approve route**'ta set `returns/routes-admin.ts:343-349` (`quantity − approved`); cap
  `INVALID_APPROVED_QUANTITY`(311-319).
- `restockDecision`/`inspectionResult`/`conditionStatus` `applyInspectionDecisions` `returns/service.ts:582-603`;
  yalnız `RESTOCK_AS_SELLABLE` envanter hareketi `applyRestockForItem`(494-560). Diğer 4 değer no-op.
- **Reddedilen adet disposition'ı YOK** (greenfield). Reject path `restockDecision=DO_NOT_RESTOCK` zorlar
  (`store-admin-web/.../returns/[id]/page.tsx:595-597`).
- State-machine `returns/status-map.ts`; REFUND_UNSETTLED guard(103-105); COMPLETED gate `isCompletionAllowed`
  `returns/service.ts:382-405`.
- Adres snapshot `OrderAddress(type=SHIPPING)` `schema:1940-1960`; okuma deseni `shipping/routes.ts:1851-1911`,
  `server.ts:10919-11042` (`safeAddressSummary`).
- Contract'lar `packages/contracts/src/index.ts` ~12117-12224.
- UI: admin `store-admin-web/app/(app)/orders/returns/[id]/page.tsx`; müşteri
  `storefront-web/app/account/returns/[returnNumber]/page.tsx` + `components/account/returns/return-detail-actions.tsx`.

## 6. Uygulama planı (dilimler)
0. Şema + migration (ShipmentDirection, Shipment additive+nullable provider, ReturnRejectedDisposition/
   ReturnDispositionStatus/ReturnItemDisposition).
1. Contracts (zod: direction, disposition, reverse shipment create/action, serializers).
2. Disposition servis + admin route (set/cancel/complete; cap invariant; append-only history+audit).
3. Reverse shipment servis + admin route (create direction-aware + advisory lock invariant; manuel lifecycle;
   OrderRefund/inventory YOK).
4. Projection izolasyonu (direction-aware: findActiveShipment, badge, tracking, delivery anchor, list/KPI, FULFILLED guard).
5. Store-admin UX (rejected disposition + reverse shipment panel/modal + aksiyonlar).
6. Müşteri UX (reverse tracking; refund'dan ayrık copy).
7. Testler (invariant + gerçek-PG concurrency; projection; finance/inventory; security).
8. Docs (ADR-274, bu analiz, ROADMAP/TODO/TECHNICAL_DEBT/DECISIONS/OPERATIONS, ADR-269/272 cross-ref).
9. Tam gate + migration replay + browser/HTTP smoke.

## 7. Test/smoke — bkz. ADR-274 + spec §14/§15 (izole çok-kalemli fixture: accept+reject → disposition
RETURN_TO_CUSTOMER → reverse create → SHIPPED → customer tracking → DELIVERED → badge/refund/inventory değişmez →
duplicate 409 → cap → cancelled reuse → cross-store 404 → customer isolation → admin KPI/filter).
Responsive 375/768/1024/1440; a11y modal focus trap + quantity label + status renk+metin + destructive confirm.

# ADR-275 — Customer Self-Service Order Cancellation: Authority & Lifecycle

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #191 merge `5ce426d`; CI lint·test·build 4m13s PASS). Baseline `981ea5c`.

**İlişkili:** [ADR-276](ADR-276-cancellation-refund.md) (iptal refund'u — intent'siz ledger),
[ADR-277](ADR-277-cancellation-coupon-rollback.md) (coupon/campaign geri alma),
[ADR-278](ADR-278-cancellation-reason-taxonomy.md) (iptal nedeni taksonomisi),
[ADR-269](ADR-269-returns-authority-and-lifecycle.md) (Returns Foundation — DELIVERED sonrası iade akışı),
[ADR-187…196](ADR-189-reservation-lifecycle.md) (reservation lifecycle — `releaseOrderReservations` reuse),
[ADR-272](ADR-272-refund-ledger-and-payment-reversal.md) (Refund Ledger — semantiği KORUNUR).

**Kapsam dışı (FUTURE):** partial item cancellation, IN_TRANSIT carrier intercept, return-to-sender
automation, carrier API cancellation, seller approval, marketplace cancellation, Gift Card/Store Credit
refund, `Store → Platform Request & Task Management`.

---

## Bağlam

Müşterinin kendi siparişini self-servis iptal etmesi için bir uç yoktu. Yalnız admin `cancelOrder`
(`apps/api-gateway/src/server.ts`) vardı: reservation release + status geçişi yapıyor ama **refund
BAŞLATMIYOR**, shipment iptal etmiyor, iptal kaynağını (source) kaydetmiyor. `Order` modelinde `cancelledAt`
+ serbest-metin `cancelReason` vardı; `version`/`source`/reason-kodu YOKTU.

## Karar

### Yeni uç (customer)
`POST /public/stores/:slug/customer/orders/:orderNumber/cancel` (+ `GET .../cancel-eligibility`).
`requireStore → requireCustomer → findFirst({storeId, customerId, orderNumber})` sahiplik + store izolasyonu;
başka müşteri/mağaza → **404** (enumeration sızıntısı yok). 2 adımlı storefront modalinin server tarafı.

### Uygunluk sınırı = CARRIER HANDOFF (shipment varlığı DEĞİL)
Saf hesap `apps/api-gateway/src/orders/cancellation/eligibility.ts` (`computeCancellationEligibility`).
YALNIZ `OUTBOUND_TO_CUSTOMER` gönderiler sayılır; reverse yönler HARİÇ.

| Durum | Anlam |
|---|---|
| `ALLOWED` | gönderi yok VEYA yalnız `DRAFT`/`ORDER_CREATED`/`LABEL_PENDING`/`LABEL_CREATED`/`CANCELLED`/`FAILED` (handoff yok) |
| `BLOCKED_IN_TRANSIT` | ≥1 OUTBOUND `IN_TRANSIT`/`OUT_FOR_DELIVERY`/`DELIVERY_FAILED`/`RETURNED` → "kargoya verildi" mesajı |
| `BLOCKED_DELIVERED` | ≥1 OUTBOUND `DELIVERED` → mevcut Return Flow'a yönlendir |
| `NOT_CANCELLABLE` | sipariş durumu PLACED/CONFIRMED değil (zaten iptal/fulfilled/draft) |

`DELIVERED`, diğer handed-off durumlardan ÖNCE değerlendirilir (karışık gönderide daha doğru CTA). Birden
fazla OUTBOUND varsa biri bile handoff yaptıysa **tüm sipariş** için self-servis iptal kapalı (MVP; partial yok).

### İptal transaction'ı (tek `$transaction`, advisory-locked)
`apps/api-gateway/src/orders/cancellation/service.ts` `cancelCustomerOrder`:
1. Reason doğrulama (aktif taksonomi + OTHER not zorunlu — ADR-278).
2. Sahiplik + erken eligibility (404/mesaj).
3. Advisory lock (`refund:<store>:<order>` — refund işlemleriyle serialize) + **shipment satırları `FOR UPDATE`**.
4. In-tx eligibility RE-CHECK (kilitli shipment'lardan) → yarışta `CANCEL_CONFLICT`.
5. **Optimistic version guard**: `updateMany({status∈[PLACED,CONFIRMED], version}) → count 0 = CANCEL_CONFLICT`.
   Order → `CANCELLED` + `fulfillmentStatus=CANCELLED` + `cancelledAt` + `cancelSource=CUSTOMER` + reason kodu/
   kategori/not + legacy `cancelReason` + `version++`.
6. Pre-handoff OUTBOUND shipment'lar → `CANCELLED` (koşullu updateMany; ShipmentEvent).
7. Rezervasyon release — paylaşılan `releaseOrderReservations(...,"ORDER_CANCELLED")` (expired satır → duplicate
   movement YOK).
8. Coupon/campaign rollback (ADR-277).
9. Refund PENDING ledger (ADR-276; intent'siz).
10. `OrderEvent` (ORDER_CANCELLED + RESERVATION_RELEASED) + **AuditLog** (zorunlu).
Provider refund yürütmesi commit SONRASI (ADR-276).

### Concurrency (spec zorunlu)
- Duplicate cancel: advisory lock serialize + zaten CANCELLED → idempotent no-op (`alreadyCancelled`).
- Cancel vs handoff: iki yönlü guard. (a) cancel tarafı shipment `FOR UPDATE` + in-tx re-check; (b) handoff
  tarafı sertleştirildi (`apps/api-gateway/src/shipping/routes.ts`): shipment-oluşturan uçlar
  `ensureOrderNotCancelled` (409 ORDER_CANCELLED), `/status` route'u tx-içi order-CANCELLED guard + **koşullu
  update** (status=current; count 0 → 409 conflict). Böylece CANCELLED sipariş sonradan fulfillment/IN_TRANSIT
  edilemez; yalnız bir operasyon kazanır.

### Şema (additive, geri uyumlu — migration `20260807140000_todo174_customer_order_cancellation`)
`Order`: `cancelSource OrderCancellationSource?`, `cancelReasonCode OrderCancellationReason?`,
`cancelReasonCategory OrderCancellationReasonCategory?`, `cancelReasonNote String?`, `version Int @default(0)`.
Legacy `cancelReason` KORUNUR. Tüm alanlar nullable/default → migrate-before-app güvenli.

## Sonuçlar
- `+` Self-servis iptal; carrier-handoff sınırı fiziksel gerçeğe uyar; concurrency airtight (advisory + FOR
  UPDATE + version + koşullu update).
- `+` Client refund tutarı KABUL EDİLMEZ (server-authoritative).
- `−` `Order.version` yalnız iptal akışında bump edilir (genel optimistic-lock değil); ileride genişletilebilir.
- Refund provider sonucu iptalle ATOMİK DEĞİL (ADR-276): iptal daima commit olur, refund ayrı yürür.

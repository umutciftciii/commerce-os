# TODO-170 — Refund Ledger & Payment Reversal (analiz)

- **Durum:** CLOSED & DEPLOYED (PR #179 merge `9023d3d`; 2026-08-05). Post-deploy smoke 15/15.
- **Baseline:** `main == 7b78876` → merged `9023d3d` (ADR-271 Unified Session Policy CLOSED & DEPLOYED).
- **Builds on:** ADR-268 (Financial Reporting Authority — snapshot otorite, `refundAmountsSupported=false`,
  §5 gelecek `OrderRefund` ledger'ı), ADR-269 (Returns Authority & Lifecycle — `RefundIntent` PENDING,
  R1 CANCELLED, R3 version guard, R5 COMPLETED guard), ADR-270 (Returns UX Recovery — auto-advance
  `AWAITING_SHIPMENT`, pending-work), TODO-159F/ADR-095..100 (payment-state tek otorite, PaymentAttempt,
  recovery), PB-1 (webhook authenticity — platform HMAC).
- **Karar kaydı:** [ADR-272](../adr/ADR-272-refund-ledger-and-payment-reversal.md).

## 1. Mevcut ödeme altyapısı denetimi (kanıt)

Denetim (4 paralel ajan) mevcut durumu kesinleştirdi — **sahte capability üretilmedi**:

### Ödeme katmanı
- **`PaymentAttempt`** (`schema.prisma:2043-2108`): `amount Int` (minor), `currency String`, `provider
  PaymentProviderType?` (MANUAL'de null), `providerReference String?`, `status PaymentAttemptStatus`,
  `idempotencyKey String?` + `@@unique([storeId, idempotencyKey])`, `@@index([storeId, providerReference])`.
  `refundIntents RefundIntent[]` back-relation var. Refund tutar/refund-status alanı YOK.
- **Tek tahsilat otoritesi = `payments/payment-state.ts`**: `isSettledAttemptStatus` = PAID/AUTHORIZED;
  `sumCapturedMinor(attempts)` = Σ settled attempt.amount; `computeRemainingMinor(total, captured)`.
  İstemci payload'ına asla güvenilmez. `resolveOrderPaymentTransition` monotonic (geç FAILED/CANCELLED
  webhook geriye çevirmez; yalnız PAID/AUTHORIZED→REFUNDED ileri). `mapAttemptStatusToOrderStatus` yalnız
  **tam** REFUNDED üretir; `PARTIALLY_REFUNDED` üreten kod YOK.
- **Provider adapter contract** (`payments/types.ts:102-112`): `PaymentProviderAdapter.refundPayment(input)
  : Promise<PaymentResult>` **var** ve `RefundPaymentInput.amount?` (kısmi ifade edilebilir) — ama
  `supportsRefund`/`supportsPartialRefund`/`createRefund`/`getRefundStatus` YOK; authorization/capture
  ayrımı YOK.
- **`ProviderContract.buildRefundRequest?`** yalnız **Stripe**'ta implement (`contracts/stripe.ts:92-106`,
  POST `/v1/refunds`, kısmi `amount` destekli). IYZICO/PAYTR/GENERIC_REDIRECT implement ETMEZ →
  `refundPayment` `OPERATION_NOT_SUPPORTED` throw eder (`provider-adapter.ts:82-88`).
- **`refundPayment` hiçbir route/servisten ÇAĞRILMIYOR** (yalnız bir unit test). Canlı HTTP transport
  default kapalı (`registry.ts:22-24` → `SANDBOX_HTTP_DISABLED`) → Stripe bile çalışamaz.
- **MOCK tek çalışan adapter**; `refundPayment` koşulsuz `{status:"REFUNDED"}` dönen **stub**
  (`mock-adapter.ts:95-97`), çağrılmıyor, ledger etkisi yok.
- **Webhook** (`payments/webhook-routes.ts` + `webhook-signature.ts`): platform HMAC
  (`hex(HMAC_SHA256(secret,"ts.body"))`, 300s replay, timingSafe), **provider-native imza YOK** (TD-137/EX-1).
  Store `webhookToken`'dan çözülür; `(storeId,provider,eventId)` unique idempotency (`PaymentProviderEvent`).
  Payload `status` enum'ında `REFUNDED` var → paid order'ı tam REFUNDED'a taşıyabilir, ama canlı provider
  imzası olmadan gerçek provider bunu gönderemez.
- **Enum'lar:** `PaymentProviderType={MOCK,IYZICO,STRIPE,PAYTR,GENERIC_REDIRECT}`,
  `PaymentMethodType={CARD,BANK_TRANSFER,CASH_ON_DELIVERY,PAYMENT_LINK}`,
  `PaymentManualMethod={BANK_TRANSFER,CASH,POS,OTHER}`, `PaymentAttemptType={ONLINE,MANUAL}`,
  `PaymentStatus` zaten `PARTIALLY_REFUNDED`+`REFUNDED` içeriyor,
  `PaymentAttemptStatus` zaten `REFUNDED` içeriyor, `PaymentProviderEventType` zaten `PAYMENT_REFUNDED`.

### RefundIntent / Returns
- **`RefundIntent`** (`schema.prisma:5181-5212`): 1-1 `ReturnRequest` (`returnRequestId @unique`), `orderId`,
  `paymentAttemptId?` (en-son PAID/AUTHORIZED attempt'e önceden çözülü), `currency`,
  `productRefundMinor`/`shippingRefundMinor`/`taxRefundMinor`/`totalRefundMinor`, `idempotencyKey`
  (`refund-intent:${returnRequestId}`, `@@unique([storeId,idempotencyKey])`), R1 `cancelledAt`/
  `cancellationReason`. `status RefundIntentStatus={PENDING,PROCESSED,CANCELLED}` — **`PROCESSED` hiçbir
  yerde YAZILMIYOR** (ölü); yorumda geçen `CONSUMED` enum'da YOK.
- **`ReturnRequest`** (16-state `ReturnStatus`; `version Int` optimistic). `isCompletionAllowed`
  (`service.ts:364-380`) REFUND için `refundIntent.status==="PROCESSED"` bekler → **COMPLETED ulaşılamaz**;
  en ileri finansal durum `REFUND_PENDING`.
- **`cancelPendingRefundIntent`** (`service.ts:53-63`) yalnız `status:"PENDING"` → CANCELLED (append-only,
  idempotent); terminal-non-refund geçişte otomatik (`service.ts:451-456`).
- **`upsertRefundIntentForReturn`** (`service.ts:547-628`) yalnız `REFUND_TO_ORIGINAL_PAYMENT` için
  PENDING intent üretir; amount'lar saf `computeRefund`'tan (inclusive VAT, discount allocation
  largest-remainder). Approve + `REFUND_PENDING`'e girişte çağrılır.

### Financial Reporting
- `finance/metrics.ts`: `Net = Gross − Discounts − ProductRefunds`, `Total = Net + Shipping −
  ShippingRefunds`; `productRefundsMinor`/`shippingRefundsMinor` `ZERO_SUMMARY`'de 0 ve fold'da hiç
  mutate edilmiyor → **çıkarma terimleri var ama hep 0**. `refundAmountsSupported=false` hard-coded
  (`routes.ts:157`). `refundedOrderCount` = paymentStatus∈{REFUNDED,PARTIALLY_REFUNDED} **adet**.
- Çift-sayım tehlikeleri: inclusive KDV (taxRefund ürün refund'un İÇİNDE → üstüne eklenmez), discount
  allocation (net taban), cancellation vs refund (CANCELLED zaten satış evreninde yok → iki kez düşme),
  `PaymentAttempt.REFUNDED` sayımı, attribution `refundedRevenueMinor` (AYRI sponsorship ledger'ı — karışmaz).

**Sonuç:** Refund *iskeleti* var (interface metodu, Stripe request builder, enum'lar, event type, hesaplı
`RefundIntent`), **çalışan refund yolu YOK** (çağıran yok, canlı transport yok, provider-native webhook yok,
partial order-state yok). TODO-170 tam da bu boşluğu doldurur.

## 2. Ürün ve finans otoritesi (kararlar)

- **ReturnRequest onayı ≠ refund.** Onay yalnız `RefundIntent` (finansal *talimat*) üretir.
- **`OrderRefund` = gerçekleşen/denenen para hareketi** (yeni, append-only ledger).
- **Yalnız `OrderRefund.status=SUCCEEDED` finanstan düşer.** PENDING/PROCESSING/FAILED/CANCELLED düşmez.
- **Partial + çoklu refund** desteklenir: bir order'ın birden çok ReturnRequest'i (her biri bir intent →
  bir refund) olabilir; cap invariant order/currency düzeyinde tüm OrderRefund'ları toplar.
- **Cap invariant:** `Σ SUCCEEDED + Σ active(PENDING/PROCESSING) ≤ capturedMinor` (order+currency).
- **RefundIntent yalnız bir kez consume edilir** (PENDING→CONSUMED, atomik).
- **Gerçek refund olmadan ReturnRequest COMPLETED olmaz** (guard → OrderRefund SUCCEEDED).

## 3. Veri modeli (additive)

### RefundIntent lifecycle (additive enum)
`RefundIntentStatus`'a **`CONSUMED`** eklenir (drop/rename YOK). Nihai: `PENDING, PROCESSED, CONSUMED,
CANCELLED`. `PROCESSED` **legacy/kullanılmaz** olarak kalır (hiç yazılmadı; silmiyoruz). Consume =
PENDING→CONSUMED, ilk `OrderRefund` oluşturulurken **aynı tx'te atomik** (`updateMany where status=PENDING`;
count=1 değilse conflict). `cancelPendingRefundIntent` davranışı korunur (yalnız PENDING → CANCELLED),
böylece CONSUMED intent asla iptal edilmez.

### OrderRefund (yeni, append-only ledger head)
`OrderRefundStatus={PENDING,PROCESSING,SUCCEEDED,FAILED,CANCELLED}`,
`RefundExecutionMode={PROVIDER_AUTOMATIC,MANUAL_OFFLINE}`.

Alanlar: `id, storeId, orderId, returnRequestId?, refundIntentId?, paymentAttemptId, provider
PaymentProviderType?, executionMode, method PaymentMethodType, status, currency,
productRefundMinor, shippingRefundMinor, taxRefundMinor, totalRefundMinor, providerRefundId?,
providerReference?, failureCode?, failureMessage?, manualMethod PaymentManualMethod?, manualReference?,
manualNote?, idempotencyKey, requestedByPlatformUserId?, requestedAt, processingStartedAt?, completedAt?,
failedAt?, cancelledAt?, createdAt, updatedAt, version`.

Kısıtlar: `@@unique([storeId, idempotencyKey])`, `@@unique([storeId, provider, providerRefundId])`
(provider refund id yalnız bir kez; NULL'lar Postgres'te distinct → sorun yok),
`@@index([storeId])`, `@@index([orderId])`, `@@index([status])`, `@@index([returnRequestId])`,
`@@index([storeId, status, completedAt])` (finans bucketing). FK: Store CASCADE, Order CASCADE,
PaymentAttempt Restrict (ledger için ödeme silinemez), ReturnRequest/RefundIntent SetNull.

### OrderRefundEvent (yeni, append-only)
`OrderRefundEventType={REQUESTED,PROVIDER_SUBMITTED,PROCESSING,SUCCEEDED,FAILED,CANCELLED,RETRY,
MANUAL_COMPLETED,RECONCILED,STATUS_QUERIED,DUPLICATE_CALLBACK}`, `OrderRefundActorType={ADMIN,SYSTEM,PROVIDER}`.

Alanlar: `id, storeId, orderRefundId, type, actorType, actorId?` (scalar, FK DEĞİL — ReturnStatusHistory
deseni), `amountMinor, providerReference?, metadata Json?, createdAt`. FK: OrderRefund CASCADE.
`@@index([storeId])`, `@@index([orderRefundId])`.

## 4. Finansal invariant'lar
- Minor-unit integer; currency birebir eşleşir (order.currency == attempt.currency == refund.currency).
- Concurrent refund race: order başına `pg_advisory_xact_lock(hashtext("refund:${storeId}:${orderId}"))`
  (`$executeRaw`) + tx içinde captured/reserved yeniden hesap + `updateMany where version` guard'ları.
- `@@unique([storeId, idempotencyKey])` → aynı key ikinci refund üretmez (P2002 yakalanır → mevcut döner).
- `@@unique([storeId, provider, providerRefundId])` → aynı providerRefundId bir kez.
- Timeout sonrası kör retry YOK → önce status reconciliation (`getRefundStatus`); unknown açıkça gösterilir.
- FAILED/CANCELLED refund reservation'ı serbest bırakır (aktif değil).
- RefundIntent tutarı client'tan ALINMAZ (server-side `computeRefund` snapshot'ından).
- Stale RefundIntent (CONSUMED/CANCELLED) işlenmez.

## 5. Refund başlatma akışı (`initiateRefund`)
Server doğrulaması: expectedReturnVersion; RefundIntent PENDING; ReturnRequest REFUND_PENDING;
resolutionType REFUND_TO_ORIGINAL_PAYMENT; paymentAttempt PAID/AUTHORIZED; refundable remaining ≥ intent
total; currency eşleşir; provider capability uygun.

Aynı tx'te (provider çağrısı HARİÇ): (1) advisory lock; (2) captured/reserved/remaining hesap;
(3) OrderRefund PENDING; (4) RefundIntent PENDING→CONSUMED atomik; (5) OrderRefundEvent(REQUESTED). Commit.
Sonra tx DIŞINDA provider çağrısı; sonuç kısa follow-up tx'te uygulanır.

## 6. Provider adapter contract (`refunds/`)
Yeni `apps/api-gateway/src/refunds/` modülü (returns/ deseni). `RefundProviderPort`:
`createRefund(input)`, `getRefundStatus(input)` → `{outcome: SUCCEEDED|PROCESSING|FAILED|UNKNOWN,
providerRefundId?, providerReference?, failureCode?, failureMessage?}`; `normalizeRefundError`.

**Capability çözümü** (`resolveRefundCapability(attempt)`, saf):
- MOCK + ONLINE → `PROVIDER_AUTOMATIC` (supportsRefund/partial=true).
- Gerçek online provider (STRIPE/IYZICO/PAYTR/GENERIC_REDIRECT) → bu fazda otomatik yürütme YOK (transport
  kapalı, yalnız Stripe builder, provider-native webhook yok) → `MANUAL_OFFLINE` (`providerAutomaticUnsupported`
  gerekçesi; sahte başarı YOK, manuel workflow sunulur).
- MANUAL attempt (offline BANK_TRANSFER vb.) → `MANUAL_OFFLINE` (banka/reference zorunlu).

**MOCK refund senaryoları** (`mock-refund.ts`, deterministik; attempt.scenario konvansiyonundan — MOCK-only,
canlı smoke + testte kontrol edilebilir): `refund_failure`→FAILED, `refund_timeout`→UNKNOWN (throw),
`refund_async`→PROCESSING (sonra getRefundStatus→SUCCEEDED), `refund_duplicate`→sabit providerRefundId,
default→SUCCEEDED. Unit testler ayrıca port'u inject edebilir.

## 7. Async/retry
- **Anında başarı:** OrderRefund SUCCEEDED + completedAt + providerReference + event; return COMPLETED (guard).
- **Async kabul:** PROCESSING; `getRefundStatus` reconciliation bekler.
- **Failure:** FAILED + code/message; return REFUND_PENDING kalır; güvenli retry.
- **Timeout:** kör retry YOK; önce `getRefundStatus`; unknown açıkça gösterilir.
- **Retry:** yalnız son OrderRefund FAILED ise; **yeni** OrderRefund attempt (yeni idempotencyKey
  `order-refund:${intentId}:retry:${n}`); intent zaten CONSUMED, yeniden consume edilmez.

## 8. Webhook/reconciliation
Provider-native refund webhook imzası **yok** (TD-137). Bu faz: **status query reconciliation** (`refresh`
aksiyonu, `getRefundStatus`) birincil mekanizma; MOCK senkron tamamlar. Duplicate koruması:
`@@unique([storeId,provider,providerRefundId])` + `DUPLICATE_CALLBACK` event → idempotent. SUCCEEDED terminal;
FAILED sonrası geç SUCCEEDED policy: providerRefundId eşleşirse SUCCEEDED kabul (para gerçekten döndü) +
event; başka store/payment reddedilir. **Future TD:** provider-native refund webhook + scheduled reconciliation.

## 9. Manuel refund (MANUAL_OFFLINE)
`manual-complete` aksiyonu: `manualReference` (banka/dekont) + `manualNote` (açıklama) **zorunlu**; **güçlü
yetki** (SUPER_ADMIN); OrderRefund PENDING→SUCCEEDED (`executionMode=MANUAL_OFFLINE`, `manualCompletedBy`);
event `MANUAL_COMPLETED`; iki kez tamamlanamaz (status guard + version). Audit zorunlu.

## 10. Order payment/status projeksiyonu
Partial refund order delivery lifecycle'ını DEĞİŞTİRMEZ. Refund SUCCEEDED sonrası pure
`resolveRefundedPaymentStatus(current, capturedMinor, succeededRefundMinor)`:
`SUCCEEDED>=captured>0 → REFUNDED`, `0<SUCCEEDED<captured → PARTIALLY_REFUNDED`, aksi → değişmez (monotonic).
**PaymentAttempt.status REFUNDED'a ÇEVRİLMEZ** (captured-sum otoritesi PAID/AUTHORIZED filtreler; çevirsek
captured 0'a düşer, cap bozulur). Attempt PAID kalır; OrderRefund ledger refund otoritesi; order.paymentStatus
yalnız *projeksiyon*. Shipment geçmişi korunur; yeni OrderStatus EKLENMEZ.

## 11. Return lifecycle
- OrderRefund PENDING/PROCESSING → ReturnRequest REFUND_PENDING.
- OrderRefund SUCCEEDED → COMPLETED (guard: Σ SUCCEEDED ≥ intent total).
- OrderRefund FAILED → REFUND_PENDING kalır.
- Manual successful → COMPLETED. Replacement bu fazın dışında.
- rejected/cancelled return refund üretemez; CANCELLED intent consume edilemez.

## 12. Financial Reporting entegrasyonu
`data.ts`: OrderRefund SUCCEEDED'ı `completedAt` (store tz) ile gün×currency bucketleyen agregasyon;
`FinanceDailyRow`'a `productRefundsMinor`/`shippingRefundsMinor` eklenir; yalnız satış evrenindeki
(PLACED/CONFIRMED/FULFILLED) order'lar. `metrics.ts` fold bunları toplar (formüller zaten çıkarır).
`refundAmountsSupported=true` (gerçek sorgular tamamlanınca). `buildDailySeries` per-day net/total da çıkarır.
**Çift-sayım guard'ları:** productRefund (inclusive) bir kez; taxRefund üstüne eklenmez; attribution
`refundedRevenueMinor` karışmaz; ledger tek kaynak (PaymentAttempt.REFUNDED'dan tutar türetilmez).
`gross − successful refunds = net` mutabakatı test edilir.

## 13. Güvenlik/tenant
store-scoped; customer yalnız kendi refund durumu (maskeli); admin permission-gated; manual refund ayrı
güçlü yetki (SUPER_ADMIN); cross-store 404; provider secret/PII loglanmaz; idempotencyKey server-üretimi;
CSRF/session korunur; audit zorunlu.

## 14. Migration
Additive: OrderRefund + OrderRefundEvent + enum'lar + index/unique; `RefundIntentStatus` ADD VALUE
`CONSUMED`; PaymentAttempt yeni index gerekmez (mevcut yeterli). drop/rename YOK; PENDING intent'lerden
otomatik OrderRefund üretme YOK; sahte başarılı backfill YOK; migrate-before-app.

## 15. Test & smoke
Gerçek-DB concurrency testleri (`refunds-ledger.integration.test.ts`): full/partial/çoklu partial, concurrent
cap, duplicate idempotency, duplicate provider callback, success/failure/timeout+reconcile/retry, unsupported
provider, manual bank transfer, stale version, consumed/cancelled intent, rejected return, currency mismatch,
failed/unpaid payment, cross-store, projection full vs partial, COMPLETED only after success, finance
subtraction/pending-exclusion/inclusive-tax/reconciliation, rollback safety. Pure testler: capability,
mock-refund, cap-calc, payment-state refund projection, metrics fold. Browser/HTTP smoke: izole fixture,
tam akış + responsive (375/768/1024/1440) + a11y.

## 16. Teknik borç / future
- TD-FR-1 **closure candidate** (refund tutar defteri geldi).
- Provider-native refund webhook imzası + scheduled reconciliation (future TD).
- chargeback/dispute, Gift Card/Store Credit refund hedefi (future).
- Gerçek online provider (Stripe/iyzico/PayTR) canlı refund transport'u (EX-1 transport açılınca).

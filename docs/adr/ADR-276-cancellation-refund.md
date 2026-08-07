# ADR-276 — Cancellation Refund: Intent-less Ledger Entry

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #191 merge `5ce426d`; CI lint·test·build 4m13s PASS).

**İlişkili:** [ADR-275](ADR-275-customer-order-cancellation-authority.md),
[ADR-272](ADR-272-refund-ledger-and-payment-reversal.md) (Refund Ledger — REUSE, semantiği korunur),
[ADR-273](ADR-273-fast-refund-controls.md).

---

## Bağlam

`RefundIntent.returnRequestId` **zorunlu + `@unique`** (1-1 ReturnRequest). `initiateRefund`
(`apps/api-gateway/src/refunds/service.ts`) `ReturnRequest.status === "REFUND_PENDING"` +
`resolutionType === "REFUND_TO_ORIGINAL_PAYMENT"` doğrular. Yani iptal (return YOK) `RefundIntent`/
`initiateRefund` yolunu REUSE EDEMEZ. Ancak `OrderRefund` (ledger head) `returnRequestId?` **ve**
`refundIntentId?` — **her ikisi de nullable**. Refund yürütme çekirdeği (`executeAutomatic`/`applyOutcome`/
`cap-calc`/`resolveRefundCapability`) yalnız `OrderRefund` (id) üzerinden çalışır; `tryCompleteReturn`
`returnRequestId` null ise no-op.

## Karar

İptal refund'u = **intent'siz + return'süz `OrderRefund` ledger girişi** (şema-yasal). Aynı yürütme makinesi
REUSE edilir; return refund akışına DOKUNULMAZ.

`apps/api-gateway/src/refunds/service.ts`:
- `prepareCancellationRefund(tx, {storeId, orderId, actorUserId})` — iptal tx İÇİNDE. Advisory lock → captured
  (`sumCapturedMinor`) → refundable remaining (`computeRefundableRemainingMinor`) → `remaining<=0` ise
  **SKIPPED_NO_CAPTURE** (ödeme yok → refund YOK). Tahsil edilmiş attempt (PAID öncelik; yoksa AUTHORIZED).
  Split: `shipping = min(order.shippingAmount, remaining)`, `product = remaining − shipping`,
  `tax = min(order.taxAmount, product)` (tax product İÇİNDE). `total = remaining` (tam refundable bakiye; kargo
  ücreti DAHİL). Idempotency `order-cancel-refund:<orderId>` (unique → ikinci iptal refund'u = **DEDUPED**).
  `OrderRefund` PENDING + `REQUESTED` event (metadata `{source:"ORDER_CANCELLATION"}`). Provider ÇAĞRILMAZ.
- `runCancellationRefundExecution(storeId, refundId, deps, actorUserId)` — commit SONRASI; `executeAutomatic`'i
  sarar (PROVIDER_AUTOMATIC). `applyOutcome` → SUCCEEDED'de `reprojectOrderPaymentStatus` (Order.paymentStatus →
  PARTIALLY_REFUNDED/REFUNDED); `tryCompleteReturn` no-op (return yok).

### Refund başarısızlığı (spec zorunlu)
Provider hatası → Order **CANCELLED KALIR**, stok yeniden REZERVE EDİLMEZ, order yeniden AÇILMAZ. Ledger satırı
FAILED/PROCESSING (dürüst). Store Admin recovery: mevcut refund admin uçları (retry/manual/refresh) `OrderRefund`
id üzerinden çalıştığından iptal refund'u da kurtarılabilir. Cap invariant (Σ SUCCEEDED + Σ active ≤ captured)
korunur (advisory lock + cap-calc). Cancellation ile provider sonucu **tek atomik işlem gibi modellenmez**.

## Sonuçlar
- `+` Return refund çekirdeği değişmeden REUSE; iptal refund'u tam refundable bakiye + kargo ücreti.
- `+` Duplicate refund imkânsız (server-üretimi idempotency key).
- `−` Split disclosure amaçlıdır; tek finansal-otorite `totalRefundMinor`. Prior partial refund varsa remaining
  düşer (kargo remaining ile cap'lenir).
- Vitrin `refundStatus` MASKELİ (NONE/PENDING/PROCESSING/SUCCEEDED/FAILED); yanıltıcı "iade tamamlandı" YOK.

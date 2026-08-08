# ADR-285 — Refund Destination Choice

**Durum:** ACCEPTED (2026-08-08; TODO-175).

**İlişkili:** [ADR-272](ADR-272-refund-ledger-and-payment-reversal.md) (Refund Ledger — REUSE),
[ADR-276](ADR-276-cancellation-refund.md) (Cancellation refund — genişletildi),
[ADR-280](ADR-280-refund-origin.md) (RefundOrigin), [ADR-281..284] (Store Credit lot-FEFO ledger — REUSE),
[ADR-286](ADR-286-refund-origin-non-expiring-credit.md) (non-expiring refund-origin credit & expiry asimetrisi).

---

## Bağlam

TODO-174B'ye kadar iade/iptal geri ödemesi **örtük** hedeflenirdi: return refund'lar `resolutionType ===
"REFUND_TO_ORIGINAL_PAYMENT"` ile orijinal PSP attempt'ine sabitti; cancellation refund'lar external
(STORE_CREDIT hariç) tahsilatı PSP'ye iade edip credit kısmını ayrı restore ederdi. Müşteri geri ödemenin
**nereye** gideceğini seçemezdi. Ayrıca `STORE_CREDIT` ile ödenmiş değerin asla cash'e dönmemesi finansal
invariant'tır.

## Karar

Müşteri iade/iptalinde geri ödeme hedefini seçebilir: `RefundDestination = { ORIGINAL_PAYMENT, SHOPPING_BALANCE }`.

**Çekirdek model — "destination yalnız external-origin bileşeni yönetir":** Her refund tutarı `R`, kalan
refundable havuzlara **oransal** olarak iki bileşene ayrılır (`apps/api-gateway/src/refunds/destination-calc.ts`
`computeRefundSourceSplit`; BigInt ara matematik, safe-integer guard, external floor + residual credit'e):

- **credit-origin bileşen `Rc`** → HER ZAMAN shopping balance'a restore edilir (original lot revive). Asla
  kart/nakde dönmez → ürün invariant'ının uygulama noktası.
- **external-origin bileşen `Re`** → müşterinin seçimi: `ORIGINAL_PAYMENT` (PSP refund) veya `SHOPPING_BALANCE`
  (non-expiring credit; bkz. ADR-286).

Sonuç: credit-only sipariş → `Re=0` → yalnız SHOPPING_BALANCE anlamlı; card-only → `Rc=0` → her iki hedef geçerli.

**İki refundable havuz (server-authoritative; client tutar göndermez):**
- external refundable = `sumCapturedMinor(non-STORE_CREDIT) − Σ reserved OrderRefund` (INTERNAL_CREDIT legleri de
  external cap'e sayılır) — `getOrderExternalRefundableMinor`.
- credit-origin restorable = `Σ ORDER_PAYMENT_DEBIT − Σ (ORDER_CANCELLATION_RESTORE + RETURN_CREDIT_RESTORE)` —
  `getOrderCreditRestorableMinor`.

**Resolution semantiği (backward-compatible):** `ReturnResolutionType += REFUND` (nötr). Legacy
`REFUND_TO_ORIGINAL_PAYMENT` korunur ve `isRefundResolution()` + `resolveEffectiveRefundDestination()` ile
`REFUND + ORIGINAL_PAYMENT` semantiğine eşlenir (backfill YOK). Yeni return'ler `REFUND` + ayrı immutable
`refundDestination` alanı yazar (`ReturnRequest.{refundDestination, refundDestinationSelectedBy=CUSTOMER,
refundDestinationSelectedAt}`).

**Execution (mevcut advisory lock `refund:<store>:<order>` altında):**
- `SHOPPING_BALANCE` external legi: PSP çağrısı YOK. `OrderRefund` (`executionMode INTERNAL_CREDIT`, tx-içi
  `SUCCEEDED`, `refundDestination SHOPPING_BALANCE`) — finansal/audit record — + `issueCreditInTx(expiresAt=null,
  REFUND_RESTORE)` non-expiring credit. İki ledger `groupKey` ile reconcile edilebilir.
- `ORIGINAL_PAYMENT` external legi: mevcut PSP akışı (`initiateRefund`/`prepareCancellationRefund` → OrderRefund
  PENDING → provider post-commit). OrderRefund tutarı = `Re` (tüm intent değil).
- credit-origin `Rc`: cancellation → mevcut `restoreCreditForOrderInTx`; return → `restoreCreditAmountForOrderInTx`
  (kısmi, ADR-286).
- **COMPLETED guard (iki ledger settlement):** `Σ SUCCEEDED OrderRefund(external, INTERNAL_CREDIT dahil) + Σ return
  credit-origin restore ≥ intent.total` (`tryCompleteReturnByReturnId`, `isCompletionAllowed`).

**Geçersiz hedef (Düzeltme A):** SESSIZ fallback YOK. external=0 iken `ORIGINAL_PAYMENT` → `INVALID_DESTINATION`
(cancellation) / `REFUND_DESTINATION_INVALID` (return create). Eligibility server-authoritative
(`resolveDestinationEligibility`).

**Provenance:** `CreditSourceType += ORDER_RETURN`; `CreditLedgerType += RETURN_CREDIT_RESTORE`. Kovalar:
GOODWILL (`ADMIN/RECOVERY_GOODWILL_CREDIT`), ORDER_CANCELLATION_REFUND (`REFUND_RESTORE`+source
`ORDER_CANCELLATION`), RETURN_REFUND (`REFUND_RESTORE`+source `ORDER_RETURN`), ORIGINAL_CREDIT_RESTORE
(`ORDER_CANCELLATION_RESTORE` + `RETURN_CREDIT_RESTORE`). Müşteri-facing copy semantic-key ile (raw enum yok).

## Sonuçlar

- Belgelenmiş ürün invariant'ları: **`STORE_CREDIT value cannot be converted to cash/original PSP refund.`** ve
  **`Customer may voluntarily convert eligible externally-paid refund into Shopping Balance.`**
- Duplicate/retry-safe (idempotency key + advisory lock + version guard). İki ledger reconcile edilebilir.
- Marketplace kapsam dışı. ProductReview vb. domainlere dokunulmadı.
- Partial refund'da external-vs-credit allocation, kalan havuzlara oransal (successive partial'da cap yeniden
  hesaplanır; residual son legde).

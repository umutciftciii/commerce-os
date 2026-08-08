# ADR-286 — Refund-origin Non-Expiring Credit & Expiry Asimetrisi

**Durum:** ACCEPTED & DEPLOYED (2026-08-08; PR #203 merge `fa30575`; TODO-175).

**İlişkili:** [ADR-284] (Store Credit expiry — 30/60/120/180 zorunlu, korunur),
[ADR-282](ADR-282-cancellation-store-credit-restore.md) (cancellation restore — korunur),
[ADR-285](ADR-285-refund-destination-choice.md).

---

## Bağlam

TODO-174B'de `CustomerCreditLot.expiresAt` **non-nullable**; her lot 30/60/120/180 günden biriyle dolar
(goodwill promosyon mantığı). TODO-175, müşterinin external-paid iade hakkını gönüllü olarak shopping
balance'a yönlendirmesine izin verir. Bu "refund-origin" credit **promosyonel goodwill DEĞİLDİR** — müşterinin
kendi parasıdır; süreyle kaybolmamalıdır. Ancak `expiresAt` non-nullable olduğundan non-expiring lot bugün
imkânsızdı (gerçek çelişki; implementasyondan önce raporlandı ve şu kararla çözüldü).

Ayrıca: bir sipariş STORE_CREDIT ile ödenip, o lot süresi **geçtikten sonra** iade edilirse, credit-origin
değer nereye gider? Cancellation'da mevcut kural expired lot'u canlandırmaz (değer kaybolur). Return'de bu
adil değildir (müşteri malı meşru şekilde iade ediyor).

## Karar

**1) `CustomerCreditLot.expiresAt` → nullable; `null = non-expiring`.** Additive migration (mevcut satırlar
değerini korur). Pure çekirdek (`ledger-calc.ts`): `isLotSpendable` (null → spendable), `sortFefo` (null →
+∞, en son tüketilir), `expiredSweepCandidates`/worker (null hariç), report canlı-liability sorgusu
(`OR expiresAt null`). Goodwill yolu **değişmez** (30/60/120/180 zorunlu).

**2) `expiryDays=null` allowlist (Düzeltme B).** Non-expiring lot YALNIZ allowlisted refund-origin sistem
yolunda üretilebilir: `issueCredit(InTx)` içinde `expiryDays===null` → `refundOriginSystemPath===true &&
actor.type==="SYSTEM" && sourceType ∈ {ORDER_REFUND, ORDER_CANCELLATION, ORDER_RETURN}`; aksi `INVALID_EXPIRY`.
Goodwill/admin/route asla non-expiring üretemez.

**3) Credit-origin restore expiry asimetrisi (cancellation vs return).**
- **Cancellation** (`restoreCreditForOrderInTx`, `planRestore`): mevcut kural KORUNUR — original lot geçerliyse
  aynı lot revive (expiry korunur); **expired ise revive YOK** (`skippedExpiredMinor`). TODO-174B invariant'ı
  bozulmaz.
- **Onaylı return** (`restoreCreditAmountForOrderInTx`, `planReturnRestore`): credit-origin değer KAYBOLMAZ.
  Original lot geçerliyse aynı lot'a restore (expiry korunur); original lot **expired ise** cash'e/PSP'ye
  ÇEVİRMEDEN aynı tutar için **yeni non-expiring lot** (reissue; `credit.returnCreditReissued`). Kısmi tutar
  (`Rc`) original lot'lara alive-first sırayla dağıtılır; per-original-lot cap = `spent(ORDER_PAYMENT_DEBIT) −
  Σ prior RETURN_CREDIT_RESTORE (sourceId=origLot)`; grup idempotency `groupKey credit-return-restore:<returnId>`.

## Sonuçlar

- Refund-origin credit non-expiring; promosyonel goodwill expiry politikası (30/60/120/180) DEĞİŞMEZ.
- Expired promosyonel lot keyfi şekilde cash'e/yeni non-expiring credit'e dönüştürülmez — yalnız gerçek
  credit-origin restore (return, expired original) reissue edilir; goodwill expiry olduğu gibi kalır.
- Duplicate/retry-safe (idempotency key per return+lot; grup-seviyesi no-op recompute).

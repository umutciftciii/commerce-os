# TODO-175 — Refund Destination Choice (Tasarım / Spec)

- **Tarih:** 2026-08-08
- **Durum:** Onaylı tasarım — implementasyon planı (`writing-plans`) öncesi
- **Kapsam:** Modular (marketplace kapsam dışı)
- **Reuse edilen altyapı:** Refund Ledger (TODO-170/ADR-272), Returns (TODO-169/171/173), Customer Self-Service Cancellation (TODO-174/174A), Store Credit / Shopping Balance lot-FEFO ledger (TODO-174B/ADR-281..284)
- **İlgili yeni ADR'ler:** ADR-285 (Refund Destination Choice), ADR-286 (Refund-origin non-expiring credit provenance & expiry asimetrisi)

---

## 0. Amaç ve tek cümlelik ürün invariant'ı

Müşteri, iade veya sipariş iptalinde geri ödemenin nereye yapılacağını seçebilsin: **orijinal ödeme yöntemi** veya **alışveriş bakiyesi**.

> **Ürün invariant'ı:** `STORE_CREDIT` ile ödenmiş değer asla cash / kart / PSP refund'a dönüşemez; yalnız customer shopping balance'a restore edilir. Buna karşılık müşteri, external (kart/PSP) ile ödenmiş uygun tutarı gönüllü olarak alışveriş bakiyesine yönlendirebilir.

Müşteri-facing copy:

| Kod | TR | EN |
|---|---|---|
| `ORIGINAL_PAYMENT` | Ödediğim yönteme iade | Refund to my original payment |
| `SHOPPING_BALANCE` | Alışveriş bakiyeme ekle | Add to my shopping balance |

---

## 1. Audit özeti (mevcut durum)

Tüm refund/return/cancellation/credit domain mantığı **`apps/api-gateway/src/`** içinde; `services/*` boş stub. Prisma tek dosya: `packages/db/prisma/schema.prisma`.

**Hazır zemin (reuse):**

- **Refund ledger:** `OrderRefund` (append-only, `schema.prisma:5805-5865`), cap invariant `apps/api-gateway/src/refunds/cap-calc.ts` (`Σ SUCCEEDED + Σ active ≤ captured`), execution `apps/api-gateway/src/refunds/service.ts` (`initiateRefund`, `executeAutomatic`, `applyOutcome`, `retry/refresh/manual-complete/cancel`, advisory lock `refund:<storeId>:<orderId>`). Yalnız MOCK provider canlı; gerçekler MANUAL_OFFLINE (`capability.ts`).
- **PaymentAttempt source allocation:** `apps/api-gateway/src/payments/payment-state.ts` — `sumCapturedMinor` (PAID/AUTHORIZED), `buildPaymentAllocations` (per `method`), `method: { not: "STORE_CREDIT" }` filtresi (`loadCapturedMinor(excludeStoreCredit)` refunds/service.ts). External-vs-credit split pattern zaten var.
- **Credit ledger:** `CustomerCreditAccount`/`CustomerCreditLot`/`CustomerCreditLedgerEntry` (`schema.prisma:3283-3367`), FEFO/expiry pure core `apps/api-gateway/src/customer-credit/ledger-calc.ts`, servis `service.ts` (`issueCredit`, `spendCreditInTx`, `restoreCreditForOrderInTx`, `expireLotsForStore`). `restoreCreditForOrderInTx` original lot revive + expired-skip (`planRestore`).
- **İskele (henüz çağrılmıyor):** `CreditLedgerType.REFUND_RESTORE` + `CreditSourceType.ORDER_REFUND` + `credit.refundRestore` copy tanımlı; hiçbir yerde invoke edilmiyor → TODO-175'in çekirdek wiring'i.

**Boşluk:**

- `RefundDestination` kavramı yok. `ReturnResolutionType` = yalnız `REFUND_TO_ORIGINAL_PAYMENT | REPLACEMENT`.
- `CustomerCreditLot.expiresAt` **non-nullable** — non-expiring lot bugün imkânsız.
- Return wizard (`return-wizard.tsx`, 4 adım) ve Cancel modal (`cancel-order-modal.tsx`, 2 adım) destination seçimi içermiyor.
- Cancellation projection tutarsızlığı: `apps/api-gateway/src/orders/cancellation/projection.ts` `estimatedRefundMinor` STORE_CREDIT'i dahil eder; gerçek execution external kısmı PSP'ye iade edip credit'i ayrı restore eder → tek sayı iki hareketi karıştırır.

---

## 2. Çekirdek zihinsel model

Her refund tutarı `R` iki bileşene ayrılır (§4 allocation):

- **credit-origin bileşen `Rc`** → **HER ZAMAN** shopping balance'a (original lot restore semantiği). Asla kart/nakde dönmez. Bu, ürün invariant'ının uygulanış noktası.
- **external-origin bileşen `Re`** → **müşterinin destination seçimi buradadır**:
  - `ORIGINAL_PAYMENT` → PSP refund (mevcut OrderRefund akışı).
  - `SHOPPING_BALANCE` → non-expiring yeni credit (PSP çağrısı YOK).

Sonuç:

- **Credit-only sipariş** → `Re = 0` → `ORIGINAL_PAYMENT` anlamsız → yalnız `SHOPPING_BALANCE` sunulur (o da original restore).
- **Card-only sipariş** → `Rc = 0` → her iki destination geçerli.
- **Mixed sipariş** → hem `Rc` hem `Re`; destination yalnız `Re`'yi etkiler.

Spec örneklerinin doğrulaması:

| Sipariş | Destination | Sonuç |
|---|---|---|
| ₺300 credit + ₺700 card, full | ORIGINAL_PAYMENT | ₺300 original lot restore + ₺700 karta |
| ₺300 credit + ₺700 card, full | SHOPPING_BALANCE | ₺300 restore + ₺700 non-expiring credit = balance ₺1.000 |
| ₺1.000 card, full | SHOPPING_BALANCE | ₺1.000 non-expiring credit, PSP YOK |
| ₺1.000 credit, full | (yalnız) SHOPPING_BALANCE | ₺1.000 original lot restore |

---

## 3. Şema değişiklikleri (additive, güvenli migration)

Tek migration klasörü: `packages/db/prisma/migrations/2026XXXX_todo175_refund_destination_choice/`.

### 3.1 Yeni enum
```prisma
enum RefundDestination {
  ORIGINAL_PAYMENT
  SHOPPING_BALANCE
}
```

### 3.2 `ReturnResolutionType` — nötr `REFUND` (Düzeltme 1)
```prisma
enum ReturnResolutionType {
  REFUND                       // yeni nötr değer (destination-agnostic)
  REFUND_TO_ORIGINAL_PAYMENT   // legacy — korunur (backward-compat)
  REPLACEMENT
}
```
- **Legacy mapping:** mevcut `REFUND_TO_ORIGINAL_PAYMENT` satırları `REFUND` + `refundDestination = ORIGINAL_PAYMENT` semantiğine eşdeğer kabul edilir. Backfill **yapılmaz** (append-only/immutable veriye dokunmayız); okuma tarafı legacy'yi tolere eder.
- **`isRefundResolution(type)` helper** (yeni, `apps/api-gateway/src/returns/status-map.ts` veya paylaşılan util): `type === "REFUND" || type === "REFUND_TO_ORIGINAL_PAYMENT"`. Resolution'ı kontrol eden **tüm** çağrı yerleri buna geçer:
  - `apps/api-gateway/src/refunds/service.ts:419` (`initiateRefund` guard)
  - `apps/api-gateway/src/returns/service.ts` (`upsertRefundIntentForReturn`, completion guard)
  - `apps/store-admin-web/app/(app)/orders/returns/[id]/page.tsx:397` (RefundPanel render koşulu)
  - `apps/storefront-web/components/account/returns/return-wizard.tsx` (StepResolution)
- **Yeni return'ler** `REFUND` yazar; destination ayrı `refundDestination` alanında tutulur.
- **Contracts:** `packages/contracts/src/index.ts:12091` `returnResolutionTypeSchema` → `["REFUND","REFUND_TO_ORIGINAL_PAYMENT","REPLACEMENT"]`.

### 3.3 `CustomerCreditLot.expiresAt` → nullable (Düzeltme kararı: null=non-expiring)
```prisma
expiresAt DateTime?   // null = non-expiring (refund-origin credit)
```
- Mevcut satırlar değerlerini korur (additive). Yeni goodwill lot'ları **aynen** 30/60/120/180 zorunlu (route seviyesinde valide).
- `apps/api-gateway/src/customer-credit/ledger-calc.ts`:
  - `isLotSpendable`: `status ACTIVE ∧ remaining>0 ∧ (expiresAt === null || expiresAt.getTime() > now)`.
  - `sortFefo`: null expiry en sona (Infinity) — en erken dolan önce tükenir (doğru FEFO). Tie-break `createdAt ASC → id ASC` korunur.
  - `availableBalanceMinor` / `allocateFefo`: yeni predicate'i kullanır.
- Expiry worker `expireLotsForStore` (`service.ts:535`): `WHERE expiresAt <= now` — SQL karşılaştırması null'ı doğal dışlar; ek guard eklenir (defensive: `expiresAt IS NOT NULL AND expiresAt <= now`).
- Prisma sorgularında `expiresAt: { gt: now }` kullanan yerler `OR expiresAt: null` içerecek şekilde gözden geçirilir (grep zorunlu).

### 3.4 `ReturnRequest` — immutable müşteri tercihi
```prisma
refundDestination              RefundDestination?
refundDestinationSelectedBy    ReturnActorType?   // = CUSTOMER (submit anında)
refundDestinationSelectedAt    DateTime?
```
Nullable: REPLACEMENT / refund'suz return'lerde boş. Bir kez yazıldıktan sonra immutable (admin değiştiremez — §7).

### 3.5 `OrderRefund` — execution split kaydı
```prisma
refundDestination RefundDestination?   // external legin destination bağlamı
executionMode     RefundExecutionMode  // += INTERNAL_CREDIT
```
`enum RefundExecutionMode { PROVIDER_AUTOMATIC, MANUAL_OFFLINE, INTERNAL_CREDIT }` — `INTERNAL_CREDIT` = SHOPPING_BALANCE external legi; provider çağrısı yok, tx-içi `SUCCEEDED`.

### 3.6 Provenance enum genişletmeleri (minimal additive)
```prisma
enum CreditSourceType { ...; ORDER_RETURN }               // += ORDER_RETURN
enum CreditLedgerType { ...; RETURN_CREDIT_RESTORE }      // += return credit-origin restore
```
- Mevcut `REFUND_RESTORE` = **external→balance refund** (cancellation & return; `sourceType` ile ayrışır: `ORDER_CANCELLATION` vs `ORDER_RETURN`).
- `ORDER_CANCELLATION_RESTORE` = cancellation credit-origin restore (mevcut, değişmez).
- `RETURN_CREDIT_RESTORE` = return credit-origin restore (yeni).

**Spec'in istediği 4 provenance kovası ↔ eşleme:**

| Spec kovası | Eşleme |
|---|---|
| `GOODWILL_CREDIT` | `ADMIN_GOODWILL_CREDIT` / `RECOVERY_GOODWILL_CREDIT` |
| `ORDER_CANCELLATION_REFUND` | `REFUND_RESTORE` + source `ORDER_CANCELLATION` |
| `RETURN_REFUND` | `REFUND_RESTORE` + source `ORDER_RETURN` |
| `ORIGINAL_CREDIT_RESTORE` | `ORDER_CANCELLATION_RESTORE` (cancel) + `RETURN_CREDIT_RESTORE` (return) |

**Customer-facing semantic description key'leri** (raw enum gösterilmez; `description` alanı semantic key'dir):

| Key | TR | EN | Örnek |
|---|---|---|---|
| `credit.cancellationRefund` | `OS-{n} sipariş iptali iadesi` | `OS-{n} order cancellation refund` | external→balance, cancel |
| `credit.returnRefund` | `OS-{n} ürün iadesi` | `OS-{n} product return refund` | external→balance, return |
| `credit.cancellationRestore` (mevcut) | Siparişte kullanılan alışveriş bakiyesi geri yüklendi | Store credit used on the order was restored | cancel credit-restore |
| `credit.returnCreditRestore` (yeni) | Siparişte kullanılan alışveriş bakiyesi geri yüklendi | Store credit used on the order was restored | return credit-restore (original lot) |
| `credit.returnCreditReissued` (yeni) | Siparişte kullanılan alışveriş bakiyesi geri yüklendi | Store credit used on the order was restored | return credit-restore, süresi geçmiş lot → yeni non-expiring lot (§6.2) |

---

## 4. Server-authoritative allocation

Client tutar göndermez. Sunucu tutarı order snapshot + ledger state'inden hesaplar.

### 4.1 Yeni pure modül `apps/api-gateway/src/refunds/destination-calc.ts`
- **İki refundable havuz (kalan):**
  - `externalRefundableRemaining = sumCapturedMinor(non-STORE_CREDIT) − Σ OrderRefund(external, active+succeeded)` (mevcut `cap-calc.ts` reuse; INTERNAL_CREDIT legi de external cap'e sayılır çünkü external captured tutarı harcanır).
  - `creditRestorableRemaining = Σ ORDER_PAYMENT_DEBIT(order) − Σ restore(order)` (credit ledger'dan; `restoreCreditForOrderInTx`/return restore idempotent hesap).
- **`computeRefundSourceSplit({ externalRefundableRemaining, creditRestorableRemaining, refundAmount })` →** `{ externalPortion Re, creditPortion Rc }`:
  - Oransal: `Re = round(refundAmount × extPool / (extPool + creditPool))`, `Rc = refundAmount − Re` (residual son bileşene, rounding kaybı olmaz).
  - Cap'ler: `Re ≤ extPool`, `Rc ≤ creditPool`; taşan tarafın fazlası diğerine kaydırılır (invariant korunur). `refundAmount ≤ extPool + creditPool` (üst çağrı garanti eder).
  - Deterministik minor-unit rounding (floor + residual), successive partial'larda kalan havuzlar yeniden hesaplandığından her seferinde tutarlı.
- **`resolveDestinationEligibility({ externalRefundableRemaining, totalRefundable }) →`** `{ offerOriginalPayment: extRemaining > 0, offerShoppingBalance: totalRefundable > 0 }`.
- **`buildRefundDestinationPreview(...)`** → UI DTO: `totalRefundableMinor`, `externalComponentMinor`, `creditComponentMinor`, per-destination özet satırları (§6 confirm summary).

### 4.2 Invariant testleri (pure, hızlı)
`Re + Rc = R`; `Re ≤ extPool`; `Rc ≤ creditPool`; successive partial'da `Σ Re ≤ external captured` ve `Σ Rc ≤ credit captured`; STORE_CREDIT hiçbir dalda PSP'ye gitmez.

---

## 5. Execution

Her iki akış mevcut advisory lock `refund:<storeId>:<orderId>` altında serialize. **Internal legler (credit restore + INTERNAL_CREDIT issuance) tx-içinde, atomik ve idempotent.** External PSP çağrısı **post-commit** (mevcut pattern) — commit anında credit tarafı settle olmuş olur.

### 5.1 Credit-origin restore (Rc) — cancellation vs return asimetrisi (Düzeltme 2)

- **Cancellation** — `restoreCreditForOrderInTx` (mevcut, değişmez):
  - Original lot geçerli (`expiresAt null || > now`) → aynı lot revive (`ORDER_CANCELLATION_RESTORE`, expiry korunur).
  - Original lot **expired** → **revive YOK**, `skippedExpiredMinor` (değer geri yüklenmez). TODO-174B invariant'ı korunur.
- **Onaylı return/refund** — yeni `restoreCreditAmountForOrderInTx(tx, { order, amountMinor: Rc, returnRequestId, idempotencyKey })`:
  - `planRestore` reuse ederek `Rc`'yi order'ın original ORDER_PAYMENT_DEBIT lot'larına dağıtır (FEFO/lot-share deterministik).
  - Original lot geçerli → aynı lot revive (`RETURN_CREDIT_RESTORE`, source `ORDER_RETURN`, expiry korunur, desc `credit.returnCreditRestore`).
  - Original lot **expired** → **cash/PSP'ye çevirmeden** aynı tutar için **yeni non-expiring lot** (`expiresAt = null`, `issueCredit(... expiryDays yok/null, sourceType ORDER_RETURN, ledgerType RETURN_CREDIT_RESTORE, desc credit.returnCreditReissued)`). Değer kaybolmaz.
  - Idempotent per `(returnRequestId, lotId)` — key `return-credit-restore:<returnId>:<lotId>` ve reissue için `return-credit-reissue:<returnId>:<lotId>`. Duplicate execution yeni lot yaratmaz.

### 5.2 External-origin (Re)

- **ORIGINAL_PAYMENT:**
  - Cancellation → mevcut `prepareCancellationRefund` (STORE_CREDIT hariç captured'dan OrderRefund PSP), post-commit `runCancellationRefundExecution`.
  - Return → mevcut `initiateRefund`, **fakat OrderRefund tutarı `Re` (external portion) olur** — tüm intent değil. Kalan `Rc` §5.1 ile ayrı restore edilir.
- **SHOPPING_BALANCE:**
  - `Re` için **PSP çağrısı YOK**. Tx-içinde:
    1. `OrderRefund` satırı (`executionMode INTERNAL_CREDIT`, `refundDestination SHOPPING_BALANCE`, `status SUCCEEDED` doğrudan, `paymentAttemptId` = refund edilen external attempt) — external cap'i tüketir, finansal/audit record.
    2. `issueCredit(expiresAt=null, sourceType = ORDER_CANCELLATION|ORDER_RETURN, ledgerType REFUND_RESTORE, desc credit.cancellationRefund|credit.returnRefund, idempotencyKey)` — non-expiring refund-origin credit.
  - İki ledger `groupKey` ile reconcile edilebilir.

### 5.3 Completion & guard güncellemeleri
- **Return COMPLETED guard** (`returns/service.ts` `isCompletionAllowed`): bugün `Σ SUCCEEDED OrderRefund ≥ intent.total`. Yeni: **`Σ SUCCEEDED OrderRefund(external, incl. INTERNAL_CREDIT) + Σ credit-origin restore(return) ≥ intent.total`** (iki ledger settlement). Ledger otoritesi korunur.
- `RefundIntent.totalRefundMinor` = tam refund (Re+Rc); intent immutable snapshot olarak kalır.

### 5.4 Provider failure & recovery
- Credit legi (restore + INTERNAL_CREDIT) tx-içinde commit → **duplicate olmaz** (idempotency key). 
- ORIGINAL_PAYMENT external legi post-commit PSP fail → OrderRefund `FAILED`/`PROCESSING` (mevcut `applyOutcome`), recovery `retry/refresh/manual-complete` ile. Order/return lifecycle mevcut güvenli semantiği korur; credit tarafı geri alınmaz (ayrı geçerli hareket).
- Gerçek provider constraint/error → recovery state; sessiz destination değişimi YOK.

### 5.5 Cancellation projection düzeltmesi
`projection.ts` `estimatedRefundMinor` artık **split** döndürür: `{ externalRefundableMinor, creditRestorableMinor, totalMinor }`. Confirm summary bunu gösterir (§6). Tek karışık sayı kaldırılır.

---

## 6. UX

### 6.1 Cancellation modal (`apps/storefront-web/components/account/cancellations/cancel-order-modal.tsx`)
- Confirm öncesi **"İade yöntemi"** adımı — yalnız `isPaid && externalRefundableRemaining > 0` iken. Credit-only veya external=0 → adım atlanır (otomatik SHOPPING_BALANCE/restore). Unpaid → refund adımı hiç yok.
- Eligibility server'dan gelir (`summary` prop genişletilir); anlamsız/disabled ikinci seçenek gösterilmez.
- **Confirm summary split:**
  - ORIGINAL_PAYMENT: `Alışveriş bakiyesi: ₺300` / `Kredi kartı ••••1234: ₺700`
  - SHOPPING_BALANCE: `Alışveriş bakiyenize eklenecek: ₺1.000`
- Client yalnız `{ reasonCode, reasonNote?, expectedVersion, refundDestination? }` gönderir (tutar yok).

### 6.2 Return wizard (`return-wizard.tsx` StepResolution)
- Resolution `REFUND` seçilince destination alt-seçimi (`ORIGINAL_PAYMENT`/`SHOPPING_BALANCE`) — eligibility'ye göre. Credit-only → yalnız SHOPPING_BALANCE.
- Submit payload'a `refundDestination` eklenir (`customerReturnCreateRequestSchema` genişletilir; `REFUND` iken zorunlu). Immutable müşteri tercihi olarak saklanır.
- Admin approval'da tercih **immutable** — admin SHOPPING_BALANCE'ı karta çeviremez (§7).

### 6.3 Store Admin
- **Return detail** (`orders/returns/[id]/page.tsx` + `refund-panel.tsx`): müşteri tercihi, refund total, destination, **actual allocation** (external refund / credit restore / balance refund ayrı satır), status. RefundPanel render koşulu `isRefundResolution`.
- **Cancellation/order detail** (`orders/[id]/page.tsx` `OrderCancellationSection`): refund destination + STORE_CREDIT restore + external refund + shopping-balance refund **ayrı** görünür (bugün yalnız captured/refunded toplamı var).
- **Unified İadeler** (`orders/returns/page.tsx`): destination filtresi (`Original payment` / `Shopping balance`). Reporting tile'ları: refund-to-original tutar, refund-to-balance tutar, shopping-balance adoption rate, cancellation vs return breakdown. Gateway `refunds/visibility.ts` genişletilir.

### 6.4 Storefront
- **Hesabım > İadelerim** (`account/returns/page.tsx` + detail): destination + amount + status + actual allocation.
- **Hesabım > Alışveriş Bakiyem** (`components/account/sections/balance-section.tsx`): refund-origin credit hareketleri anında; yeni semantic key copy'leri (§3.6). Raw enum yok. Order detail refund/payment history ile tutarlı.

---

## 7. Güvenlik / finansal invariant'lar

- Strict store/customer isolation; refund destination yalnız order owner/customer tarafından seçilir (submit anında `selectedBy = CUSTOMER`).
- Client tutar kabul edilmez; tutar server snapshot + ledger'dan.
- `STORE_CREDIT → cash/PSP` dönüşümü **yok** (tüm dallarda).
- External refundable cap aşılamaz; duplicate refund yok; duplicate credit yok.
- Concurrent execution güvenli (advisory lock + version guard + unique idempotency).
- Ledger immutable; refund ledger + customer credit ledger `groupKey` ile reconcile edilebilir.
- PaymentAttempt source allocation authoritative.
- Admin, müşterinin SHOPPING_BALANCE tercihini keyfi olarak karta çeviremez (persisted immutable selection; execution UI input'una değil persisted değere güvenir).
- İlgisiz domainlere (ProductReview vb.) dokunulmaz.

---

## 8. Persistence & reconcile özeti

- **`ReturnRequest.refundDestination` (+selectedBy/At)** = immutable müşteri tercihi.
- **Cancellation** destination = `OrderRefund.refundDestination` (external leg) + credit ledger `sourceType/description` (intent-less olduğu için ReturnRequest yok).
- **Actual allocation DTO** server-side assemble: OrderRefund(external legs) + CustomerCreditLedgerEntry(restore + balance-refund) `groupKey`/`returnRequestId`/`orderId` ile gruplanır.
- Execution UI input'una yeniden güvenmez; persisted selection kullanılır. Duplicate/retry-safe.

---

## 9. Test matrisi (minimum)

**Full cancellation:** card→ORIGINAL_PAYMENT; card→SHOPPING_BALANCE; credit-only→yalnız SHOPPING_BALANCE; mixed→ORIGINAL_PAYMENT split; mixed→SHOPPING_BALANCE full credit; duplicate cancellation; provider refund failure; credit idempotency.

**Return:** card-only full return her iki destination; mixed full return her iki destination; partial return ORIGINAL_PAYMENT; partial return SHOPPING_BALANCE; store-credit-origin asla cash-out; prior partial refund cap respected; repeated execution safe.

**Expiry/provenance:** refund-origin credit non-expiring; goodwill expiry değişmez; **cancellation expired-lot no-revive korunur**; **return expired-lot → yeni non-expiring reissue (değer korunur)**; original credit restore mevcut semantiği korur; raw provenance doğru raporlanır.

**Resolution mapping:** legacy `REFUND_TO_ORIGINAL_PAYMENT` return'leri `isRefundResolution` ile doğru işlenir; yeni `REFUND` + destination doğru.

**Isolation:** cross-customer; cross-store.

---

## 10. Browser smoke (gerçek auth + izole fixture, enterprise-demo pristine)

375 / 768 / 1024 / 1440:

1. card-only cancellation → original payment
2. card-only cancellation → shopping balance
3. mixed cancellation → original split
4. mixed cancellation → full shopping balance
5. return flow → destination selection
6. partial return
7. storefront İadelerim visibility
8. Alışveriş Bakiyem movement (refund-origin anında)
9. Store Admin return/cancellation detail
10. reporting/filter

**Regression:** cart/checkout, paymentAllocations, store-credit checkout, cancellation, returns, refund visibility. Fixture cleanup.

---

## 11. Gate

`db generate` → migration varsa fresh replay + existing DB upgrade → typecheck → lint → targeted tests → workspace test Run 1 → Run 2 → build → `git diff --check`.

(Worktree/turbo tuzağı: filtreli komut; Edit worktree path ile — bkz. memory.)

---

## 12. Docs

- `docs/ROADMAP*` , `docs/TODO.md`, `docs/DECISIONS.md` (ADR-285/286), `docs/TECHNICAL_DEBT.md`.
- Belgelenecek ürün invariant'ları:
  - `STORE_CREDIT value cannot be converted to cash/original PSP refund.`
  - `Customer may voluntarily convert eligible externally-paid refund into Shopping Balance.`
  - Expiry asimetrisi: cancellation expired-lot no-revive; approved return expired-lot → non-expiring reissue.

---

## 13. Ship

Tüm gate + browser smoke green ise: commit → push → PR → CI → merge commit → migration deploy → yalnız değişen servis rebuild/recreate → post-deploy smoke → docs CLOSED & DEPLOYED → worktree cleanup. Squash/rebase/force/bypass yok.

---

## 14. Dokunulacak dosyalar (özet harita)

| Katman | Dosya |
|---|---|
| Şema + enum + migration | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/..._todo175_...` |
| Contracts | `packages/contracts/src/index.ts` (resolution enum 12091, return create 12380, cancellation request, yeni destination/preview şemaları) |
| Allocation (pure, yeni) | `apps/api-gateway/src/refunds/destination-calc.ts` |
| Credit core | `apps/api-gateway/src/customer-credit/ledger-calc.ts` (nullable expiry), `service.ts` (`restoreCreditAmountForOrderInTx` yeni, `issueCredit` non-expiring path) |
| Refund execution | `apps/api-gateway/src/refunds/service.ts` (`initiateRefund` Re-only + INTERNAL_CREDIT, `prepareCancellationRefund` destination) |
| Returns | `apps/api-gateway/src/returns/service.ts` (`isRefundResolution`, completion guard, destination persist), `status-map.ts`, `routes-customer.ts`, `routes-admin.ts` |
| Cancellation | `apps/api-gateway/src/orders/cancellation/service.ts`, `projection.ts` (split) |
| Visibility/report | `apps/api-gateway/src/refunds/visibility.ts`, `apps/api-gateway/src/customer-credit/report.ts` |
| Storefront UI | `components/account/cancellations/cancel-order-modal.tsx`, `components/account/returns/return-wizard.tsx`, `components/account/sections/balance-section.tsx`, `app/account/returns/*` |
| Store-admin UI | `app/(app)/orders/returns/[id]/page.tsx` + `refund-panel.tsx`, `app/(app)/orders/returns/page.tsx`, `app/(app)/orders/[id]/page.tsx` |
| i18n | `packages/i18n/src/locales/{tr,en}/storefront.ts` (+ store-admin) |

---

## 15. Açık kabul kriterleri (Definition of Done)

1. Müşteri return submit ve cancellation confirm'de destination seçebilir (eligibility doğru).
2. Server-authoritative allocation; client tutar göndermez.
3. STORE_CREDIT hiçbir dalda cash/PSP'ye dönmez; external cap aşılmaz.
4. Refund-origin credit non-expiring; goodwill expiry değişmez; return expired-lot reissue çalışır; cancellation no-revive korunur.
5. Provider failure → credit duplicate yok, external leg recovery.
6. Admin & storefront'ta destination + actual allocation + status görünür; raw enum yok.
7. Reporting/filter tile'ları doğru.
8. Tüm test matrisi + browser smoke green; enterprise-demo pristine; fixture cleanup.
9. Docs + invariant'lar belgelendi.

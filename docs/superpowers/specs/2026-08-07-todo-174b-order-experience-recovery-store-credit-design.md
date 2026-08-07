# TODO-174B — Order Experience Recovery Operations + Customer Shopping Balance (Store Credit)

**Tarih:** 2026-08-07
**Durum:** Tasarım — kullanıcı onayı bekliyor
**Kapsam:** Modular commerce (Marketplace kapsam dışı)

---

## 1. Amaç ve Özet

TODO-174A ile toplanan `OrderExperienceReview` verisini gerçek operasyona dönüştürmek ve müşteri geri kazanımı için **gerçek TL alışveriş bakiyesi (store credit)** foundation'ı eklemek.

İki bağlı alt-sistem, tek PR olarak shiplenecek (aralarındaki dikişler — recovery → goodwill credit → checkout → cancellation restore — hepsi aynı ledger'ı paylaşır):

- **A. Order Experience Recovery Operations** — düşük memnuniyetli müşteriyi tespit, recovery case yönetimi, contact/outcome, raporlama.
- **B. Customer Shopping Balance / Store Credit** — immutable, **lot-tabanlı FEFO** ledger; admin goodwill kredi; storefront bakiye görünürlüğü; checkout entegrasyonu; iptal/iade restore.

**Açıkça kapsam dışı (FUTURE — "Gift Card Purchase / Code Redemption"):** hediye kartı satın alma, gift card ürünü, kod üretme/redeem, başkasına hediye, e-posta teslim, gift-card ürün expiry politikası.

---

## 2. Denetim Bulguları (reuse zemini)

| Alan | Bulgu | Reuse |
|---|---|---|
| `OrderExperienceReview` | Backend + storefront tam (ADR-279/280); ProductReview/Aggregate'ten kod düzeyinde ayrık. **Admin görüntüleme/recovery yüzeyi yok.** | Model + `order-experience/service.ts` var; admin okuma yüzeyi + recovery yeni. |
| Store credit / bakiye | **Sıfır** (greenfield). | En iyi şablon: `OrderRefund`+`OrderRefundEvent` (append-only head+event, advisory-lock, cap invariant, idempotency, version guard) → `refunds/service.ts`, `cap-calc.ts`. |
| Para | `@commerce-os/utils` minor-string/BigInt kontratı, float yok (TD-194). | Ledger tutarları minor-unit; API'de kanonik string; aritmetik BigInt helper. |
| Ödeme | Order'da tek "ödendi" kolonu yok; `PaymentAttempt`'lerden türetiliyor (`sumCapturedMinor`, `payment-state.ts`). `paymentStatus` projeksiyon. | Store credit = yeni `STORE_CREDIT` yöntemli MANUAL `PaymentAttempt`; makine değişmeden çalışır. |
| İptal | `orders/cancellation/service.ts` tek tx + advisory lock; coupon rollback var, credit restore yok. | Restore adımını coupon rollback (adım 6-7) yanına ekle. |
| İade | `prepareCancellationRefund` tek-attempt seçiyor; multi-source allocation yok. | STORE_CREDIT attempt'i ayrı allocation ile ele al. |
| Admin | DataGrid standardı (ADR-089), `requireStorePlatformAdmin`/SUPER_ADMIN gating (fast-refund deseni), StoreSettings additive-policy (`fastRefundMaxAmountMinor` null=kapalı), `recordAudit` DI, customer/order detail kart desenleri. | Hepsi birebir reuse. |
| Storefront | Coupon center (F4A.5) = `Alışveriş Bakiyem` şablonu; checkout özeti server-otoriter; `x-customer-session`; i18n TR/EN nested-dict + `format()`. | Yeni `balance` section + checkout toggle. |

---

## 3. Veri Modeli

### 3.1 Store Credit — lot-tabanlı FEFO ledger (3 tablo)

Para her yerde **minor-unit `BigInt`** (bakiye büyüyebilir; API'de kanonik string). Store isolation zorunlu.

**`CustomerCreditAccount`** — (store,customer,currency) çıpası + perf cache.
- `id, storeId, customerId, currency`
- `cachedAvailableMinor BigInt @default(0)` — yalnız perf; **otorite lot toplamı** (deterministik doğrulanabilir).
- `version Int @default(0)`, `createdAt, updatedAt`
- `@@unique([storeId, customerId, currency])`

**`CustomerCreditLot`** — bir grant = spendable bir "lot" (mutable head; `remaining` lock altında azalır).
- `id, storeId, customerId, accountId, currency`
- `originalAmountMinor BigInt`, `remainingAmountMinor BigInt`
- `expiresAt DateTime` — **zorunlu** (grant'ta 30/60/120/180 günden biri)
- `status CreditLotStatus @default(ACTIVE)` — `ACTIVE | CONSUMED | EXPIRED`
- `sourceType CreditSourceType`, `sourceId String?` (örn. recoveryCaseId / auditRef)
- `issuedByType, issuedById?` (PLATFORM_USER / SYSTEM)
- `version Int @default(0)`, `createdAt, updatedAt`
- İndeks: `[storeId, customerId, status, expiresAt]` (FEFO tarama), `[storeId, status, expiresAt]` (expiry worker), `[accountId]`

**`CustomerCreditLedgerEntry`** — append-only, immutable; **her hareket bir satır**, lot'a bağlı.
- `id, storeId, customerId, accountId, lotId?`
- `type CreditLedgerType`, `direction CreditDirection` (`CREDIT | DEBIT`)
- `amountMinor BigInt` (daima pozitif; yön `direction`'da)
- `balanceAfterMinor BigInt` — hesap toplamı (görüntüleme/audit)
- `currency`
- `sourceType CreditSourceType, sourceId String?`
- `orderId String?` (harcama/restore siparişi)
- `groupKey String?` — çok-lot'lu tek mantıksal hareketi (bir DEBIT birden çok lot'a değebilir) gruplar
- `description String` (structured; UI'da i18n key ile render, raw enum gösterilmez)
- `createdByType, createdById?`
- `idempotencyKey String`
- `createdAt`
- `@@unique([storeId, idempotencyKey])`; İndeks: `[storeId, customerId, createdAt]`, `[accountId, createdAt]`, `[lotId]`, `[orderId]`

**Enumlar:**
- `CreditLotStatus { ACTIVE, CONSUMED, EXPIRED }`
- `CreditDirection { CREDIT, DEBIT }`
- `CreditSourceType { ADMIN_GOODWILL, RECOVERY_GOODWILL, ADMIN_ADJUSTMENT, ORDER_PAYMENT, ORDER_CANCELLATION, ORDER_REFUND, EXPIRY, SYSTEM }`
- `CreditLedgerType { ADMIN_GOODWILL_CREDIT, RECOVERY_GOODWILL_CREDIT, ORDER_PAYMENT_DEBIT, ORDER_CANCELLATION_RESTORE, REFUND_RESTORE, ADMIN_ADJUSTMENT_CREDIT, ADMIN_ADJUSTMENT_DEBIT, EXPIRE }` (additive; future genişletilebilir)
- `CreditActorType { PLATFORM_USER, CUSTOMER, SYSTEM }`

**Ledger update/delete YOK.** Bakiye = `Σ lot.remainingAmountMinor` (status=ACTIVE ∧ `expiresAt > now`). `cachedAvailableMinor` bunu yansıtır, farkı testte assert edilir.

### 3.2 Recovery Operations (2 tablo)

**`OrderRecoveryCase`**
- `id, storeId, orderExperienceReviewId, customerId, orderId`
- `status RecoveryCaseStatus @default(OPEN)`
- `priority RecoveryPriority` (rating'ten türer: 1★=HIGH, 2★=MEDIUM, 3★-manuel=LOW)
- `assigneePlatformUserId String?`
- `openedAt, firstContactAt?, dueAt, resolvedAt?, closedAt?`
- `resolutionType RecoveryResolutionType?`, `resolutionNote String?`
- `createdByPlatformUserId?, updatedByPlatformUserId?`
- `version Int`, `createdAt, updatedAt`
- `@@unique([storeId, orderExperienceReviewId])` — **review başına tek case** (duplicate aktif case engeli; kapatılan case tekrar açılmaz, gerekirse yeni review yeni case)
- İndeks: `[storeId, status, dueAt]` (geciken), `[storeId, assigneePlatformUserId, status]`, `[customerId]`, `[orderId]`

**`OrderRecoveryActivity`** — append-only.
- `id, storeId, recoveryCaseId, type RecoveryActivityType, actorType, actorId?`
- `outcome RecoveryOutcome?` (structured), `note String?` (OTHER → zorunlu)
- `creditLedgerEntryId String?` — goodwill kredi verildiyse ledger'a bağ (idempotent bağ)
- `metadata Json?`, `createdAt`

**Enumlar:**
- `RecoveryCaseStatus { OPEN, ASSIGNED, CONTACT_ATTEMPTED, CUSTOMER_REACHED, ACTION_REQUIRED, RESOLVED, CLOSED, UNREACHABLE, NO_ACTION_REQUIRED }`
- `RecoveryPriority { LOW, MEDIUM, HIGH }`
- `RecoveryActivityType { ASSIGNED, CONTACT_CALL, CONTACT_EMAIL, UNREACHABLE, ISSUE_HEARD, ACTION_REQUIRED, GOODWILL_CREDIT, RESOLVED, CLOSED, NOTE }`
- `RecoveryOutcome { ISSUE_RESOLVED, APOLOGY_ACCEPTED, REFUND_QUESTION, DELIVERY_COMPLAINT, PRICE_COMPLAINT, PRODUCT_EXPECTATION_MISMATCH, CUSTOMER_UNREACHABLE, CUSTOMER_DECLINED, OTHER }`
- `RecoveryResolutionType { GOODWILL_CREDIT, APOLOGY, REFUND_FOLLOWUP, NO_ACTION, OTHER }`

**Otomasyon:** 1–2★ review create → otomatik case (`OPEN`); 3★ → **manuel** açılabilir (otomatik yok); 4–5★ → case yok. Review create noktasında (`order-experience/service.ts:createOrderExperienceReview`) hook.

### 3.3 Order snapshot alanları (additive)

`Order` modeline (finansal source-of-truth değil, denormalize snapshot):
- `shoppingCreditUsedMinor Int @default(0)`
- `externalPaymentAmountMinor Int @default(0)` (= totalAmount − shoppingCreditUsed; denormalize)

### 3.4 Payment method genişletme

- `PaymentMethodType`'a `STORE_CREDIT` değeri.
- `PaymentAttempt`'e `creditLedgerGroupKey String?` (attempt ↔ ledger DEBIT bağı; refund allocation deterministik).
- Store credit ödemesi = `type: MANUAL, method: STORE_CREDIT, status: PAID` attempt (recovery-routes.ts manuel-tahsilat deseni).

### 3.5 StoreSettings policy (additive)

- `maxGoodwillCreditPerActionMinor BigInt?` — null = **kapalı** (özellik pasif; normal operatör kredi veremez), değer = aksiyon başına üst sınır.
- `goodwillCreditCurrency String?` (default store currency).
- PATCH guard: bu alanlara dokunuluyorsa SUPER_ADMIN (fast-refund `:9245` deseni). Serileştirmede kanonik string.

---

## 4. Kritik Akışlar

### 4.1 Goodwill kredi verme (admin / recovery)
1. Yetki: `requireStorePlatformAdmin`; tutar > `maxGoodwillCreditPerActionMinor` ise **normal operatör 403**, SUPER_ADMIN aşabilir (server-side; client tutarına kör güvenme). `maxGoodwill... == null` → özellik kapalı.
2. Expiry seçimi zorunlu: `{30,60,120,180}` günden biri → `expiresAt = now + N gün`.
3. Tek transaction, advisory lock `credit:<storeId>:<customerId>`:
   - `CustomerCreditAccount` upsert (yoksa oluştur).
   - `CustomerCreditLot` create (`original=remaining=amount`, `expiresAt`, sourceType).
   - `CustomerCreditLedgerEntry` create (CREDIT, `balanceAfter`, idempotencyKey `credit-issue:<sourceType>:<sourceId>` veya recovery için `recovery-credit:<caseId>`).
   - `cachedAvailableMinor` güncelle (version guard).
   - `recordAudit`.
   - Recovery'den ise `OrderRecoveryActivity(GOODWILL_CREDIT, creditLedgerEntryId)` + case history.
4. **Idempotency:** `@@unique([storeId, idempotencyKey])` + P2002 → dedup (sayfa refresh'te tekrar kredi YOK; recovery için `caseId` bazlı key → aynı case'e duplicate credit engeli).

### 4.2 Checkout allocation (server-authoritative)
1. Müşteri "Alışveriş bakiyemi kullan" → checkout flag (cookie/checkout state).
2. `placeOrder` sırasında, advisory lock altında: `availableCredit = Σ ACTIVE non-expired lot remaining`. `creditUsed = min(availableCredit, payableAmount)` (payable = order.totalAmount). **Asla total altına düşme; negatif olamaz.**
3. FEFO tüketim: ACTIVE non-expired lot'lar `expiresAt ASC, createdAt ASC` sırayla; her lottan çekilen kadar `remaining` azalt; lot biterse `status=CONSUMED`; her lot için DEBIT ledger entry (ortak `groupKey`).
4. `PaymentAttempt(MANUAL, STORE_CREDIT, PAID, amount=creditUsed, creditLedgerGroupKey=groupKey)` oluştur.
5. Order snapshot: `shoppingCreditUsedMinor=creditUsed`, `externalPaymentAmountMinor=total-creditUsed`.
6. `resolveOrderPaymentTransition` doğal çalışır: `creditUsed==total` → **external PSP çağrısı yok**, order PAID; `creditUsed<total` → kalan PSP/manuel tahsilata bırakılır (kısmi-tahsilat kısıtı credit+kart için gözden geçirilir).
7. **Concurrency:** aynı bakiyeyi iki checkout iki kez harcayamaz — advisory lock + lot `remaining` version/`updateMany` guard (`WHERE remaining >= çekilen`).

### 4.3 İptal / iade restore
- Full-order cancellation (`cancelCustomerOrder`), coupon rollback yanında: STORE_CREDIT attempt(ler)inin `creditLedgerGroupKey`'inden hangi lot'a ne kadar harcandığı okunur.
- Her kaynak lot için: `expiresAt > now` (hâlâ canlı) → `remaining` geri artır + `ORDER_CANCELLATION_RESTORE` ledger entry (orijinal expiry korunur). Lot **süresi dolmuşsa yapay canlandırma YOK** — o porsiyon restore edilmez, history'de "süresi dolduğu için iade edilmedi" olarak yapısal kayıt.
- Kart ile ödenen kısım mevcut PSP/manuel refund yoluna gider (mevcut `prepareCancellationRefund`, ama STORE_CREDIT attempt'i hariç tutulur → yalnız kart attempt'i refund edilir).
- **Idempotent:** iptal tekrarında duplicate restore yok (idempotencyKey `credit-restore:<orderId>:<lotId>`); Order CANCELLED tekrar açılmaz. PSP refund fail olsa da credit restore transaction'ı doğru state'te idempotent kalır.

### 4.4 Expiry (FEFO lot)
- **Available her zaman doğru:** okuma/harcama `expiresAt > now` filtresiyle hesaplar (worker gecikse bile süresi geçen lot available'a girmez).
- **Scheduled worker** (H-3 reservation-expiry worker deseni): `expiresAt <= now ∧ status=ACTIVE ∧ remaining>0` lot'ları `EXPIRED` yapar + `EXPIRE` ledger entry ("Süresi doldu") yazar + cache günceller. İdempotent (status guard). Worker default açık, config'lenebilir.
- Restore edilen kredi asla yeni/uzatılmış expiry almaz; orijinal lot expiry'si otoritedir.

---

## 5. Değişmezler & Güvenlik

- Strict store/customer isolation (her sorgu storeId-first).
- Immutable ledger (update/delete yok).
- Idempotency (unique key + P2002 dedup) her para hareketinde.
- No negative balance / no negative lot remaining (lock + guard).
- Concurrent checkout aynı bakiyeyi iki kez harcayamaz (advisory lock + version/updateMany guard).
- Compensation permission (policy limit + SUPER_ADMIN override; manuel DEBIT ayrı+yüksek yetki).
- Server-side amount validation (client tutarına kör güven yok).
- Full AuditLog.
- Internal recovery notes storefront'a **asla** sızmaz (ayrı DTO; müşteri ucu yalnız human-readable ledger).
- **ProductReview / ProductRatingAggregate'e sıfır dokunuş.**
- Financial invariant testleri: `cachedAvailable == Σ active-nonexpired lot remaining == Σ ledger (CREDIT−DEBIT−EXPIRE, canlı lot bazında)`.

---

## 6. Store Admin Yüzeyleri

1. **Nav:** `Müşteri Deneyimi > Sipariş Deneyimi` yeni grup+route (`store-nav.tsx groups`, `GROUP_LABELS` tr/en).
2. **Sipariş Deneyimi listesi** (`app/(app)/order-experience/page.tsx`): DataGrid (customers/page.tsx şablonu). Kolonlar: puan, müşteri, sipariş no, yorum, sipariş durumu, cancellation reason label, tarih, recovery status, assignee, SLA, işlem. Filtreler: tarih, puan (1-2/3/4-5), sipariş durumu, cancellation reason, recovery status, assignee, yalnız gecikenler. **KPI:** ayrı summary endpoint (page-local hesap yanıltıcı — audit uyarısı): ort. puan, toplam, 1-2★ oranı, 4-5★ oranı, açık recovery, SLA geciken, ulaşılan oranı, çözüm oranı, verilen goodwill toplam. **ProductRatingAggregate'e etki YOK.**
3. **Recovery case detayı** (`order-experience/[caseId]` veya modal): DetailLayout; lifecycle aksiyonları (ata/kendime ata/arandı/e-posta/ulaşılamadı/dinlendi/aksiyon gerekli/çözüldü/kapat), structured outcome, append-only activity timeline, "Müşteriye alışveriş bakiyesi tanımla" (mevcut bakiye + tutar + expiry + neden + açıklama + confirm; idempotent).
4. **Müşteri detay `Alışveriş Bakiyesi` bölümü** (`customers/[id]`): kullanılabilir bakiye + son hareketler (tarih/açıklama/±tutar/kapanış). Yetkili: `Bakiye Ekle` modal (tutar/neden/expiry/internal note/opsiyonel recovery case). Arbitrary negative textbox YOK; manuel debit ayrı yüksek-yetki action.
5. **Order detail `Sipariş Deneyimi` kartı** (`orders/[id]`): yıldız, yorum, tarih, recovery status, assignee, verilen goodwill tutar, recovery detay link. **Payment summary'de** store credit kullanımı ayrı satır (external payment ile karıştırma).

## 7. Storefront Yüzeyleri (TR/EN)

1. **`Alışveriş Bakiyem`** (`/account?section=balance`, coupon-center şablonu): `Kullanılabilir Bakiyeniz: ₺X` + hareket geçmişi (tarih/açıklama/tutar/kapanış). Human-readable copy ("Müşteri memnuniyeti kapsamında bakiye eklendi", "OS-000123 siparişinde alışveriş bakiyesi kullanıldı", "OS-000123 iptali nedeniyle bakiye geri yüklendi", "Süresi doldu"). Raw enum yok. Expiry bilgisi ("... tarihinde sona erer").
2. **Checkout toggle** (`checkout-form.tsx` ödeme bölümü): "Alışveriş bakiyemi kullan"; özet'te `−credit` satırı (server-otoriter). Tam-credit'te PSP adımı atlanır.
3. **Order success / detail:** özet'te store credit kullanılan satır.

## 8. Raporlama

- Recovery: avg rating trend, 1-2★ trend, cancellation reason × rating, contact success rate, avg first contact, avg resolution, outcome dağılımı, goodwill case sayısı/toplam/ortalama, (mümkünse) recovery sonrası tekrar sipariş oranı.
- Credit (Finans entegrasyonu, ADR-268 zemini): outstanding credit liability (Σ active non-expired remaining), issued, spent, restored, **expired**, admin adjustments. Store isolation zorunlu.

---

## 9. Fazlama (tek PR, sıralı uygulama)

- **F0** Prisma modelleri + enumlar + migration + `db:generate`.
- **F1** Credit ledger domain (account/lot/entry servis, FEFO, invariant, idempotency, advisory lock) + testler.
- **F2** Expiry worker + available hesap.
- **F3** Admin: goodwill credit endpoint + policy (StoreSettings) + müşteri detay bölümü + audit.
- **F4** Recovery: case model + otomasyon (1-2★) + activity + admin liste/detay + KPI summary endpoint.
- **F5** Checkout allocation (STORE_CREDIT attempt + snapshot + FEFO debit) + storefront `Alışveriş Bakiyem` + checkout toggle + success/detail.
- **F6** Cancellation/refund restore + allocation.
- **F7** Order detail experience kartı + payment summary credit satırı + finans raporlama.
- **F8** i18n TR/EN, browser smoke, docs, gate, ship.

---

## 10. Test Kapsamı (özet)

Recovery: 1★/2★ auto case, 3★ manuel-only, duplicate prevention, assign/contact/resolve, SLA overdue.
Credit: sıfır bakiye, admin credit, duplicate idempotency, unauthorized reject, max policy, ledger immutable, balance correctness, cross-store/customer izolasyon, **FEFO tüketim sırası**, **expiry available'dan düşürür + EXPIRE entry**, **expired lot restore'da canlanmaz**.
Checkout: no balance, partial credit (kalan PSP), full-credit (PSP yok, order PAID), insufficient, concurrent spend (çift harcama engeli), snapshot/allocation doğru, external PSP tutarı doğru azalır.
Cancellation: credit-paid restore, mixed credit/card full cancel, no duplicate restore, external refund failure ledger'ı bozmaz.
Storefront: balance, history, human-readable.
Regression: ProductReview/Aggregate untouched.

---

## 11. ADR / Docs

- **ADR-281** Customer Shopping Balance — lot-tabanlı FEFO immutable ledger.
- **ADR-282** Store Credit checkout allocation & STORE_CREDIT PaymentAttempt.
- **ADR-283** Order Experience Recovery Operations (case lifecycle + goodwill).
- **ADR-284** Store credit expiry policy (grant-level 30/60/120/180, FEFO, restore semantics).
- ROADMAP / TODO / DECISIONS / TECHNICAL_DEBT güncelle; TD-174A-1 kapat (admin görünürlük+recovery); "Customer Shopping Balance = ACTIVE", "Gift Card Purchase / Code Redemption = FUTURE".

---

## 12. Açık Riskler / Notlar

- Kısmi-tahsilat kısıtı (`recovery-routes.ts:620`) credit+kart kombinasyonu için gevşetilmeli — F5'te dikkat.
- Order detail/finans ekranlarına credit satırları eklenirken mevcut toplam invariant'ları (subtotal/discount/shipping/tax/total) bozulmamalı; credit **ödeme** tarafında, `orderTotals`'a indirim olarak girmez.
- BigInt (lot/account/ledger) vs Int (order snapshot alanları): sınırda kanonik string kontratı; float yok.

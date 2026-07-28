# H-3 — Reservation Expiry & Orphan Draft Cleanup — Kök Neden Analizi

**Durum:** ANALİZ (2026-07-29). Kaynak: `docs/TECHNICAL_DEBT.md` TD-136 (HIGH — stok kilitlenmesi),
`docs/analysis/launch-readiness-product-gap-audit.md` §H-3.

**Sınıf:** HIGH — terk edilen anonim checkout stoğu **süresiz** kilitler; satılan ürün `quantityOnHand`'den
hiç düşülmez. Oversell kilidi **doğru** (yanlış-negatif yok), ama kullanılabilir stok zamanla erir.

---

## 1. Mevcut mimari (kanıtlı)

### 1.1 Rezervasyonun iki temsili
Stok iki yerde tutulur ve **aynı transaction içinde** birlikte güncellenir:

- **Sayaç (otorite):** `InventoryItem.quantityReserved` (`schema.prisma:1286`). Kullanılabilir stok
  **her yerde** `quantityOnHand − quantityReserved` olarak hesaplanır (aşağıda §1.3).
- **Satır kaydı:** `InventoryReservation` satırları (sipariş satırı başına bir satır) —
  `schema.prisma:1786-1810`. Alanlar `status`, `expiresAt?`, `releasedAt?`, `consumedAt?` **mevcut**
  ama üçü de hiç yazılmıyor.

Bu ikisi arasında **hiçbir arka plan mutabakatı yok** — biri diğerinden saparsa (terk edilmiş DRAFT,
hiç bitmeyen rezervasyon) düzelten mekanizma yok.

### 1.2 Rezervasyon nerede oluşuyor / bırakılıyor / tüketiliyor
| Olay | Konum | Davranış |
|---|---|---|
| **CREATE** | `server.ts:4429-4523` `placeOrder` (DRAFT→PLACED) | Satır başına `InventoryItem` `FOR UPDATE` kilitlenir, `onHand−reserved < qty` ise `INSUFFICIENT_STOCK`, aksi halde `quantityReserved += qty`, `InventoryReservation` `status=ACTIVE` (**`expiresAt` YOK → NULL**), `SALE_RESERVATION` movement. |
| **RELEASE** | `server.ts:4524-4592` `cancelOrder` (yalnız admin iptali) | `ACTIVE` rezervasyonlar: `FOR UPDATE`, `quantityReserved -= qty`, `status=RELEASED`+`releasedAt`, `SALE_RELEASE` movement. |
| **CONSUME** | **YOK** | `CONSUMED`/`consumedAt` hiçbir yerde yazılmıyor. `SALE_COMMIT` movement tipi bile modellenmemiş. Fulfillment (teslim) `quantityOnHand`'i **düşürmez** (`shipping/routes.ts:1607-1648`). |
| **EXPIRY** | **YOK** | `expiresAt` hiç set edilmiyor; hiçbir job süresi dolmuş rezervasyonu bırakmıyor. |

### 1.3 Kullanılabilir stok hesabı (read-time)
Canlı yolun her yerinde formül **`quantityOnHand − quantityReserved`** (0'a clamp), `InventoryReservation`'a
**join yok**, `status`/`expiresAt` filtresi **yok**:
- Tekil kalem: `server.ts:1719`.
- PLP toplu ham SQL: `server.ts:2600-2608`, `server.ts:3367` (`SUM(GREATEST(onHand−reserved,0))`).
- Sepet map: `server.ts:4973`, `server.ts:5468`.
- Search read-model: `services/search-service/src/data.ts` (aynı otorite).

**Sonuç:** hiç bitmeyen bir `ACTIVE` rezervasyon, kullanılabilir stoğu **kalıcı** olarak azaltır.

### 1.4 Checkout / ödeme lifecycle
- Sepet **cookie-tabanlı, sunucu-durumsuz** (Cart/CheckoutSession modeli YOK) → rezervasyon **yalnız**
  `placeOrder`'da doğar.
- Public checkout (`server.ts:5754`): `createOrder` (DRAFT, rezervasyon YOK) → `placeOrder`
  (PLACED + rezerve, `paymentStatus=UNPAID`). **`createOrder` başarılı olup `placeOrder` başarısız
  olursa DRAFT orphan kalır** (`server.ts:5989-5994`, telafi silme yok).
- Ödeme webhook `applyOutcome` (`server.ts:6476-6552`): yalnız `order.paymentStatus` günceller;
  **envantere dokunmaz**.
- Ödeme recovery `/pay/:token` (`payments/recovery-routes.ts`): yalnız `PaymentAttempt` + `paymentStatus`;
  rezervasyonla etkileşim yok → UNPAID sipariş rezervasyonunu **sınırsız** tutar.
- `OrderStatus`: DRAFT/PLACED/CONFIRMED/CANCELLED/FULFILLED (`CONFIRMED` kullanılmıyor).
- `PaymentStatus`: UNPAID/PAYMENT_PENDING/AUTHORIZED/PAID/PARTIALLY_REFUNDED/REFUNDED/PAYMENT_FAILED/CANCELLED.

### 1.5 Sorulara net cevaplar
- **Rezervasyon hangi işlemde oluşuyor?** `placeOrder` (checkout PLACE adımı), ödeme **öncesi**.
- **Reserved quantity hangi tabloda?** `InventoryItem.quantityReserved` sayacı (otorite) + `InventoryReservation` satırları.
- **`expiresAt` var mı?** Kolon VAR, hiç yazılmıyor (NULL).
- **DRAFT kalıcılaşıyor mu?** `createOrder` sonrası `placeOrder` başarısızsa evet (orphan DRAFT).
- **Ödeme öncesi rezervasyon?** Evet — anonim checkout PLACE'te rezerve eder, UNPAID kalır.
- **Başarısız ödeme bırakıyor mu?** HAYIR. Webhook yalnız statü çevirir.
- **Duplicate rezervasyon?** `placeOrder` yalnız DRAFT'tan çalışır ve PLACED ise idempotent döner → satır başına tek rezervasyon.
- **Stok hesabı expired'i sayıyor mu?** Evet (join yok) → hata bu.
- **Orphan var mı?** Bilinmiyor → §16 baseline taraması ölçer.

---

## 2. Çözüm tasarımı (kararlar → ADR-187…193)

### D1 · Kullanılabilir stok doğruluğu — HİBRİT (ADR-188)
Sayaç otorite kalır (storefront sıfır regresyon). Üç katman:
1. **Read-time add-back:** `available = onHand − reserved + expiredActiveReserved`, burada
   `expiredActiveReserved = SUM(quantity)` — `status=ACTIVE AND expiresAt IS NOT NULL AND expiresAt <= now()`.
   Paylaşılan SQL fragment (toplu yollar) + JS helper (satır yolları). **Doğruluk yalnız scheduler'a bağlı değil.**
2. **Write-time lazy expiry:** `placeOrder` içinde, `FOR UPDATE` kilidi altında, o varyantın süresi dolmuş
   `ACTIVE` rezervasyonları oversell kontrolünden **önce** fiziksel bırakılır (sayaç düşer, `EXPIRED`).
   Yanlış oversell reddi imkânsız — scheduler'dan bağımsız.
3. **Scheduled sweep:** kalıcı temizlik + orphan + audit (§D8).

### D2 · TTL politikası (ADR-187)
- `ACTIVE` rezervasyon: `expiresAt = createdAt + RESERVATION_TTL_MINUTES` (varsayılan **15**, min 5, maks 1440).
- Yalnız ödenmemiş sipariş rezervasyonu TTL taşır; CONSUMED (terminal) süre dolmaz.
- **Ödeme oturumu başlarsa** (`PAYMENT_PENDING`: recovery `createLink` veya payment redirect builder) tek
  kontrollü yenileme: `expiresAt = min(now + RESERVATION_PAYMENT_WINDOW_MINUTES(30), createdAt + RESERVATION_MAX_MINUTES(120))`.
  Sayfa yenileme uzatmaz (sunucu-otoriter tek sinyal = ödeme ilerlemesi). Maksimum toplam süre cap'lidir.
- Tüm timestamp UTC. Client `expiresAt` otoritesi **değildir**.

### D3 · Lifecycle state machine (ADR-189)
`ACTIVE → {CONSUMED | RELEASED | EXPIRED}`. Üç hedef **terminal + immutable**; terminal→ACTIVE imkânsız.
Enum'a `EXPIRED` eklenir; `releaseReason` (RELEASED/EXPIRED nedeni) eklenir.

### D4 · Consume (ADR-190)
Ödeme `PAID`/`AUTHORIZED` geçişinde (webhook `applyOutcome` + manuel `recordPaymentAttempt`), aynı tx:
her `ACTIVE` rezervasyon → `quantityReserved -= qty` **ve** `quantityOnHand -= qty` (satış commit),
`status=CONSUMED`+`consumedAt`, `SALE_COMMIT` movement. Idempotent (yalnız `ACTIVE` işlenir → duplicate
webhook ikinci consume yapmaz). Availability değişmez (onHand ve reserved birlikte düşer) → regresyon yok,
ama `quantityOnHand` artık gerçek stoğu yansıtır.

### D5 · Release (ADR-190)
- `CANCELLED` (ödeme iptali, terminal) veya admin `cancelOrder` → rezervasyon bırakılır (`RELEASED` +
  `releaseReason`). Idempotent, tenant-safe, aynı miktarı iki kez geri eklemez.
- `PAYMENT_FAILED` **retryable** (enum yorumu: "yeniden tahsilat başlatılabilir") → **bırakılmaz**; TTL/expiry
  job halleder (recovery penceresini bozmamak için). Erken bırakma retry'de oversell riski yaratır.
- `REFUNDED` (post-PAID, rezervasyon zaten CONSUMED) → restock politikası **KAPSAM DIŞI** (FUTURE, ADR-193).

### D6 · Payment-vs-expiry race (ADR-191)
Consume ve expiry ikisi de varyantın `InventoryItem` satırını `FOR UPDATE` kilitler → serialize olurlar.
- Ödeme kilidi kazanırsa: rezervasyon `CONSUMED` olur; expiry job kilit altında `ACTIVE` görmez → atlar.
- Expiry kilidi kazanırsa ve sipariş hâlâ ödenmemişse: rezervasyon `EXPIRED` olur.
- **Geç ödeme (expiry önce):** ödeme başarısı geldiğinde `ACTIVE` rezervasyon YOK ama `EXPIRED`/`RELEASED`
  var → **fail-closed**: sipariş `PAID` olur (para tahsil edildi) fakat stok **otomatik düşülmez** (oversell
  riski), `LATE_PAYMENT_AFTER_EXPIRY` order-event + reconciliation uyarısı → **manuel inceleme**.
- Expiry job her aday için siparişin `paymentStatus`'unu kilit altında **yeniden okur**; PAID/AUTHORIZED ise
  bırakmaz (reconcile/skip).

### D7 · Orphan DRAFT cleanup (ADR-192)
Job ikinci fazda:
- **PLACED + UNPAID**, tüm rezervasyonları süresi dolmuş → rezervasyonlar `EXPIRED`, sipariş
  `CANCELLED` (`cancelReason=RESERVATION_EXPIRED`), `ORDER_EXPIRED` event. Sipariş **silinmez**.
- **DRAFT**, `DRAFT_MAX_AGE_MINUTES`'ten eski, ödeme attempt yok → `CANCELLED`
  (`cancelReason=ORPHAN_DRAFT`), event. (DRAFT stok tutmaz.)
- CONSUMED/PAID/AUTHORIZED/FULFILLED **asla** dokunulmaz. Audit/history korunur.

### D8 · Expiry job (ADR-191) — `inventory-reservation-expiry`
`settlement-scheduler` + `retention` desenini birebir yansıtır: api-gateway süreci içinde setTimeout
zinciri, `INVENTORY_RESERVATION_EXPIRY_ENABLED=false` (varsayılan no-op), (jobType, storeId) advisory lock,
bounded batch, dry-run/apply, circuit breaker (`MAX_RELEASE_PER_RUN`), `QueueJobLog` (STARTED→terminal +
SKIPPED_LOCKED), UTC cutoff, idempotent. Sıra: lock → cutoff → expired ACTIVE aday → order/payment recheck
(kilit altında) → PAID ise koru/reconcile → orphan EXPIRED → stok görünürlüğü doğrula → job log → unlock.

### D9 · Reconciliation (ADR-193) — salt-okunur
`PAID+ACTIVE`, `CANCELLED+ACTIVE`, `ACTIVE+missing order`, `reserved sayaç ≠ SUM(active qty)`,
`reserved > onHand`, `expiresAt olmayan ACTIVE`. Uyarı üretir; **sessiz otomatik düzeltme yok** (job yalnız
kesin-orphan'ı reconcile eder; belirsizi raporlar). Operations özeti + baseline script.

### D10 · Migration + backfill (ADR-187)
Additive. `EXPIRED` enum, `releaseReason`, `SALE_COMMIT` movement tipi, indexler
(`storeId,status,expiresAt` · `variantId,status,expiresAt` · partial-unique `orderLineId WHERE status='ACTIVE'`).
Backfill (immutable, apply-anındaki `now()`):
- `ACTIVE` + sipariş PAID/AUTHORIZED/CONFIRMED/FULFILLED → **dokunma** (meşru tutulan; `expiresAt` NULL kalır,
  auto-expire etmez; reconciliation izler).
- `ACTIVE` + sipariş UNPAID/PENDING/DRAFT → `expiresAt = now() + kısa grace` (sweep'e girer, quarantine).
- `ACTIVE` + sipariş CANCELLED/REFUNDED (drift) → `expiresAt = now()` (hemen aday).

---

## 3. Domain hata kodları (ADR-190)
`RESERVATION_EXPIRED`, `RESERVATION_ALREADY_CONSUMED`, `RESERVATION_ALREADY_RELEASED`,
`INSUFFICIENT_AVAILABLE_STOCK`, `RESERVATION_CONFLICT`, `LATE_PAYMENT_AFTER_EXPIRY`, `ORPHAN_DRAFT_DETECTED`.
TR/EN mesajları i18n'e eklenir.

## 4. Kapsam dışı (FUTURE CAPABILITY)
- Çok-depolu dağıtık rezervasyon tahsisi / waitlist / backorder (ADR-193, TD-14x).
- Refund-on-restock politikası.
- Gerçek ödeme sağlayıcı native webhook (TD-137).

---

## 5. Pre-ship hardening addendum (2026-07-29, ADR-194…196)

Shipping öncesi iki mimari düzeltme uygulandı:

- **D8 revizyonu (ADR-194):** Süpürücü job **api-gateway runtime'ından çıkarıldı**. Domain mantığı yeni
  `@commerce-os/inventory` paketine taşındı (api-gateway + apps/worker ortak). Periyodik expiry tetiği BullMQ
  Job Scheduler'da (Redis; sabit id → idempotent upsert, worker restart duplicate üretmez, gateway restart/deploy
  takvimi etkilemez). Yürütme yalnız `apps/worker`. api-gateway yalnız manuel expiry/reconcile **enqueue** +
  status/reconcile-scan sunar; `setTimeout`/`setInterval` kalmadı. Consumer worker'da her zaman kayıtlı; periyodik
  zamanlama yalnız `INVENTORY_RESERVATION_EXPIRY_ENABLED=true` iken upsert edilir.
- **Baseline reconcile (ADR-195):** PAID/AUTHORIZED + ACTIVE + expiresAt NULL kayıtları "normal" sayılmaz;
  ayrı kontrollü `inventory-reservation-reconcile` servisi (dry-run varsayılan; transaction + `FOR UPDATE SKIP
  LOCKED`; qty/line/inventory doğrulama; `SALE_COMMIT` yalnız ACTIVE→CONSUMED geçişinde → idempotent; belirsiz →
  MANUAL_REVIEW, mutate etmez). Migration'da kör update yok.
- **Lock ordering + counter invariant (ADR-196):** tek serialize noktası `InventoryItem` `FOR UPDATE`; toplu
  job'lar `InventoryReservation`(SKIP LOCKED claim) → `InventoryItem` sırası → deadlock yok. EXPIRED/RELEASED sayacı
  **fiziksel** azaltır (read-time add-back yalnız pencere içindir; kalıcı sayaç şişmesi yok).

Doğrulama: 35 test (31 `@commerce-os/inventory` + 4 `apps/worker`) + **13/13 hardening canlı smoke** (gerçek PG+Redis:
reconcile dry-run/apply/idempotency, `SALE_COMMIT` tek-kayıt, qty-mismatch→MANUAL_REVIEW, BullMQ scheduler tek-kayıt,
manuel enqueue, unpaid-expired→EXPIRED+orphan-cancel, payment-race→reconcile, advisory-lock SKIPPED_LOCKED,
reconciliation temiz). TD-033'te yalnız single-tx create+place atomiklik dilimi açık kalır (stok-kilitlenmesi CLOSED).

# TODO-159F — Order Payment Recovery & Collection · Ön Analiz

**Tarih:** 2026-07-23
**Kapsam:** Sağlayıcı tanımlanmadan (veya checkout ödeme oturumu üretilemeden)
oluşmuş `UNPAID` siparişler için güvenli, idempotent tahsilat akışı.
**Kapsam DIŞI:** TODO-160 (Influencer), canlı gerçek-provider (IYZICO/STRIPE/PAYTR)
tahsilatı, tam SMTP e-posta teslimatı.

---

## 0. Yönetici özeti — açık (gap)

Mevcut F3B.2 "Payment Operations Foundation" tam kurulu değil. Checkout ödeme
denemesini (PaymentAttempt) **yalnızca** `buildPaymentRedirect` üretir ve bu da
yalnızca uygun bir provider **resolve edildiğinde** çalışır. Provider yoksa
`null` döner: sipariş `PLACED + UNPAID`, **hiç PaymentAttempt olmadan** kalır.

`Order.paymentStatus`'ı `PAID`'e taşıyan **tek** yol, mevcut bir attempt+token
üzerinden çalışan public MOCK confirm ucudur (`recordPaymentAttemptOutcome`).
Attempt yoksa bu uç erişilemez → sipariş kalıcı olarak `UNPAID` kilitli.
Admin sipariş detayında yalnız *"Bu sipariş için henüz ödeme denemesi yok."*
mesajı görünür; hiçbir tahsilat aksiyonu yoktur.

**Sonuç:** Sağlayıcı sonradan aktifleştirilse bile geçerli bir sipariş tahsil
edilemez. Bu görev bu açığı kapatır.

---

## 1. Mevcut durum haritası (dosya + satır)

### Modeller (`packages/db/prisma/schema.prisma`)
- `enum PaymentStatus` (238): `UNPAID | AUTHORIZED | PAID | REFUNDED` — **eksik**:
  `PAYMENT_PENDING`, `PAYMENT_FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`.
- `enum PaymentAttemptStatus` (327): `CREATED | PENDING | REQUIRES_ACTION |
  AUTHORIZED | PAID | FAILED | CANCELLED | REFUNDED` — yeterli.
- `model Order` (1367): `paymentStatus @default(UNPAID)` (1375); tutar
  snapshot'ları `subtotalAmount/discountAmount/shippingAmount/taxAmount/totalAmount`
  (Int, minor). `totalAmount` **otoriter tahsilat tutarıdır**. `amountPaid` /
  `remainingBalance` alanı **YOK**.
- `model PaymentProviderConfig` (1554): store-scoped provider; credential'lar
  yalnız cipher; `@@unique([storeId, provider, mode])`.
- `model PaymentAttempt` (1590): `providerConfigId` **NOT NULL** (1594); `type`
  **yok**; `idempotencyKey` **yok**; `paymentUrl` **yok**; `expiresAt` **yok**
  (`accessTokenExpiresAt` var); `initiatedBy` **yok**; `method` var
  (`PaymentMethodType`); `providerReference/failureCode/failureMessage/paidAt/
  failedAt/accessTokenHash/accessTokenExpiresAt` var.
- `model PaymentProviderEvent` (1632): payment olay defteri;
  `@@unique([storeId, provider, eventId])` (1651) — webhook idempotency backstop'u.
- `model OrderEvent` (1506): sipariş timeline'ı, `type` serbest String,
  `actorUserId`.
- `model AuditLog` (729): `action (AuditAction: CREATE/UPDATE/DELETE/LOGIN/LOGOUT/
  SYSTEM)`, serbest `entityType`, `metadata`.

### Backend (`apps/api-gateway/src`)
- `payments/resolver.ts`: saf provider seçimi (ENABLED + mode + currency + method
  + min/max; LIVE ortamda MOCK yasak). Deterministik sıra.
- `payments/types.ts` + `adapters/*`: 7-metotlu `PaymentProviderAdapter`; MOCK tam
  çalışır, gerçek provider'lar shell (transport `PAYMENT_SANDBOX_HTTP_ENABLED`
  kapalıyken `SANDBOX_HTTP_DISABLED` fırlatır → sahte başarı üretilmez).
- `payments/tokens.ts`: kısa ömürlü public erişim token'ı (hash saklanır).
- `server.ts`:
  - `createOrder` (~4020) / `placeOrder` (~4355): `paymentStatus`'a **dokunmaz**,
    attempt üretmez.
  - `buildPaymentRedirect` (8027): provider resolve olursa attempt + token üretir,
    olmazsa `null` → **açığın kaynağı**.
  - `recordPaymentAttemptOutcome` (4616): tek transaction; attempt update +
    (opsiyonel) order.paymentStatus + PaymentProviderEvent. **PAID'e taşıyan tek
    yazma noktası.**
  - Public pay: `GET/POST /public/stores/:slug/orders/:orderId/payment?token=`
    (8406/8450) — `orderId` URL'de açık; token en son attempt'e bağlı
    (`findLatestPaymentAttemptForOrder`). Yalnız `UNPAID` + `MOCK` + `TEST`.
  - Webhook: `POST /payments/webhooks/:provider` (8604) — **shell**: imza
    placeholder, eventId dedup (read-then-return), state **değiştirmez**.
  - Admin provider config CRUD + events + test-connection (8079+). **Mevcut
    sipariş için attempt oluşturma aksiyonu YOK.**
- `orders/sales-summary.ts`: `paidGrossMinor` = ilk PAID/AUTHORIZED attempt tutarı
  ya da (attempt yoksa) order PAID ise totalAmount; `remainingGrossMinor =
  max(0, total - paid)`. Basit; çoklu/manuel tahsilatı toplamaz.
- `shipping/routes.ts` (583): shipment guard `isOrderPaidForShipment` →
  `PAID/AUTHORIZED` değilse 409 `ORDER_PAYMENT_REQUIRED`.

### Frontend
- Store-admin sipariş detayı: `apps/store-admin-web/app/(app)/orders/[id]/page.tsx`
  — `PaymentSummaryPanel` (paid/remaining) + `PaymentPanel` (attempt gözlem;
  attempt=0 → *"henüz ödeme denemesi yok"*, aksiyon yok). Timeline `order.events`.
- Storefront: `apps/storefront-web/app/checkout/payment/page.tsx` +
  `components/payment-tester.tsx` — mevcut checkout ödeme sayfası
  (`orderId+token` query). Yeni opaque `/pay/:token` sayfası ayrı olacak.

### Kritik altyapı boşlukları
- **E-posta: YOK.** `services/notification-service` 5 satırlık stub; hiçbir
  gönderim yok. → "Müşteriye Gönder" için tam SMTP kapsam DIŞI; dispatcher
  soyutlaması + noop/log + audit ile yapılır (spec fallback: "en azından
  bağlantı üretme ve kopyalama").
- **Webhook state uygulaması: YOK.** Shipment webhook (`shipping/webhook*.ts` +
  `ShipmentWebhookInbox` atomic `@@unique` + P2002-catch) referans desendir.

---

## 2. Netleştirilen sorular

**Checkout hangi noktada PaymentAttempt oluşturuyor?**
Sadece `buildPaymentRedirect` (server.ts:8047), checkout'un son adımında, provider
resolve olursa. `createOrder`/`placeOrder` oluşturmaz.

**Sipariş ödeme oturumu olmadan nasıl oluşabiliyor?**
`buildPaymentRedirect` provider bulamazsa `null` döner; checkout 201 + PLACED +
UNPAID + attempt'siz sipariş döndürür (zero-regression için `payment` alanı
eklenmez).

**Provider sonradan aktifleşince hangi adapter?**
Resolver ile store'un ENABLED + uygun (currency/amount/method/mode) provider'ı
seçilir; MOCK varsa test akışında MOCK önceliklidir. Gerçek provider'lar bu fazda
canlı tahsilat yapmaz (kontrollü hata).

**Sipariş tutarı hangi snapshot'tan?**
`Order.totalAmount` (minor). **Asla** güncel üründen yeniden hesaplanmaz. Kalan
bakiye = `totalAmount − Σ(captured)`.

**Başarısız/süresi dolmuş ödeme yeniden nasıl?**
Yeni PaymentAttempt (yeni idempotencyKey + token). Eski attempt geçmişi silinmez.
Aktif (terminal olmayan, süresi dolmamış) attempt varken ikinci paralel oturum
açılmaz.

**Manuel ödeme mevcut modelde nasıl?**
`PaymentAttempt.type = MANUAL`, `providerConfigId = NULL`, `method ∈ {BANK_TRANSFER,
CASH, POS, OTHER}` (offline allowlist), `status = PAID`, `initiatedBy = admin`.
Provider webhook'u gibi gösterilmez (type ayrımı + event kaynağı).

**Paralel oturumlar nasıl engellenir?**
(a) `idempotencyKey` üzerinde DB `@@unique([storeId, idempotencyKey])`; (b) aktif
attempt kontrolü transaction içinde (order satır kilidi / re-read); (c) webhook
inbox dedup (mevcut `@@unique([storeId, provider, eventId])` + P2002-catch).

---

## 3. Tasarım kararları (ADR adayları)

1. **Payment recovery state machine** (ADR-095): tek otorite modül
   `payments/payment-state.ts` (saf). `canStartCollection(paymentStatus)` →
   `PAID/REFUNDED/CANCELLED` yeni tahsilat yasak; `UNPAID/PAYMENT_FAILED/
   PAYMENT_PENDING` izinli (aktif attempt yoksa). Attempt→order status eşlemesi
   tek yerde.
2. **Order snapshot tutar otoritesi** (ADR-096): tahsilat tutarı daima
   `Order.totalAmount`; kalan bakiye sunucuda türetilir; client tutar/currency/
   provider **belirleyemez**.
3. **Active-attempt idempotency** (ADR-097): `idempotencyKey @unique` + aktif
   attempt tekilliği (transaction). Süresi dolmuş/terminal attempt yeni oluşturmayı
   engellemez.
4. **Manuel vs online ayrımı** (ADR-098): `PaymentAttempt.type (ONLINE|MANUAL)`;
   MANUAL provider'sız, webhook uygulamaz, AuditLog + `initiatedBy` zorunlu.
5. **Payment link token güvenliği** (ADR-099): opaque, tahmin edilemez, hash'li
   saklanan, süreli, tek-store, sipariş ID'si taşımayan `/pay/:token`. Enumeration
   yok (sabit-zaman lookup, generic hata).
6. **Webhook ordering** (ADR-100): webhook nihai otorite; terminal (PAID) durumdan
   sonra geç gelen `FAILED` webhook geriye çevirmez (monotonic geçiş). Dedup atomik.

---

## 4. Genişletme planı (migration)

`PaymentStatus` += `PAYMENT_PENDING, PAYMENT_FAILED, CANCELLED, PARTIALLY_REFUNDED`.
`enum PaymentAttemptType { ONLINE, MANUAL }` (yeni).
`enum PaymentManualMethod { BANK_TRANSFER, CASH, POS, OTHER }` (yeni).
`PaymentAttempt`:
- `providerConfigId` → **nullable** (MANUAL için); relation `onDelete: Restrict`
  → nullable + `SetNull` uyumu korunur (config silinmiyor zaten).
- `type PaymentAttemptType @default(ONLINE)`.
- `manualMethod PaymentManualMethod?`, `manualReference String?`,
  `manualNote String?`, `collectedAt DateTime?`.
- `idempotencyKey String?` + `@@unique([storeId, idempotencyKey])`.
- `paymentUrl String?` (opaque link path; token DEĞİL — token hash ayrı).
- `expiresAt DateTime?` (link/session süresi; `accessTokenExpiresAt`'tan ayrı
  semantik — link geçerlilik penceresi).
- `initiatedBy String?` (platformUserId; MANUAL/admin-initiated için).
Geriye uyum: tüm yeni alanlar nullable/defaultlu; eski attempt'ler etkilenmez.

Backfill gerekmez (yeni alanlar null; `type` default ONLINE eski online
attempt'ler için doğru).

---

## 5. Test matrisi (özet)
Backend: provider'sız sipariş; sonradan aktifleşme; inactive/cross-store/
unsupported-currency reddi; link creation; concurrent → tek aktif; idempotent
retry; expired sonrası yenileme; PAID/CANCELLED/REFUNDED reddi; client amount
spoof; webhook duplicate; late webhook ordering; manual payment; overpayment
reddi; tenant isolation; public token invalid/expired; shipment guard açılması.
Frontend: provider-yok mesajı; aksiyon görünürlüğü; link create/copy/regenerate/
mail; manuel modal; attempt durumları; history; loading/error; erişilebilirlik.

---

## 6. Riskler / teknik borç
- E-posta gerçek teslimatı yok → dispatcher noop/log; **TD**: SMTP entegrasyonu.
- Gerçek provider canlı tahsilat yok → link + MOCK sandbox ile doğrulanır; **TD**.
- Kısmi tahsilat MVP'de reddedilir (`PARTIALLY_REFUNDED` yalnız refund tarafı için
  enum'da; kısmi *capture* desteklenmez) → **TD**.
- `PaymentStatus` enum genişlemesi read tarafında i18n/tone/guard dokunuşu ister.

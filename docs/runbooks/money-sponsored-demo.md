# Runbook — Money Path & Sponsored Funnel Demo

**Amaç.** Enterprise-demo üzerinde korunabilir, tekrarlanabilir bir para + sponsorluk demo akışı. H-4 doğrulama
fazının (bkz. `docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`) operasyonel özeti.

**Ortam.** Docker stack (`infra/docker/docker-compose.yml`): gateway `localhost:4000`, storefront `:3000`,
store-admin `:3002`, postgres `:5432`, redis `:6379`. Store: `enterprise-demo` (storeId `edm-store`).
Ödeme: yalnız `MOCK` (gerçek sağlayıcı KAPALI). Gerçek para hareketi yok.

---

## A. Müşteri tarafı (storefront)

1. **Ürün → sepet.** `enterprise-demo` vitrininde ürün seç, varyant seç, sepete ekle, adet değiştir.
2. **Checkout.** Adres → shipping (store tarifesi) → kupon/kampanya (opsiyonel) → sipariş özeti.
   Fiyat/subtotal/indirim/vergi/shipping/currency **sunucu-otoriter**; birim fiyat adetle değişmez.
3. **Payment attempt.** Sipariş `PAYMENT_PENDING`; rezervasyon `ACTIVE`.
4. **Başarılı ödeme (MOCK success).** Hosted-pay `POST /public/pay/:token` (scenario `success`). Sipariş
   `PAID`/`CONFIRMED`; rezervasyon `ACTIVE→CONSUMED` (aynı tx, `consumeOrderReservations`). `quantityOnHand`/
   `quantityReserved` doğru; duplicate webhook ikinci consume üretmez (idempotent).
5. **Başarısız ödeme + recovery.** Ayrı sipariş, MOCK `failure` (retryable) → sipariş `PAYMENT_FAILED`/UNPAID,
   rezervasyon retry penceresinde korunur (TTL). Recovery link/token (`GET /public/pay/:token`) → başarılı MOCK
   ödeme → `PAID` + `CONSUMED`. Terminal cancellation → rezervasyon `RELEASED`. Expiry sonrası geç ödeme →
   `LATE_PAYMENT_AFTER_EXPIRY` (order-event + manuel inceleme; otomatik PAID/oversell YOK). Recovery token başka
   order/customer/store için çalışmaz (opaque + store-scoped).
6. **Sipariş geçmişi.** Hesabım → sipariş detayında ödeme durumu, kalemler, tutarlar, attribution snapshot korunur.

## B. Sponsor tarafı (store-admin, auth-gated)

1. **Sponsor** (`SponsorAccount`) → **Agreement** (currency OTORİTE; ISO 4217) → **Sponsored Campaign**.
2. **Aktivasyon guard.** Anlaşma `PENDING` iken kampanya `ACTIVE` denemesi → `409 AGREEMENT_NOT_ACTIVE`; `ACTIVE`
   + uygun iken aktivasyon başarılı.
3. **Attributed order/revenue** → **Settlement** (preview → draft → finalize; unique-dönem + FINALIZED-immutable →
   duplicate imkânsız) → **Charge** (settlement'tan türetilir) → **Payment/allocation** (same-currency).
4. **Revenue-share.** Aynı-para (ör. TRY) net gelir → % pay → preview/draft/charge/payment; tümü tam sayı (minor
   units; float yok). **Karışık-para → fail-closed** (`REVENUE_CURRENCY_MISMATCH`; draft oluşmaz, partial yok,
   dashboard uyarısı + audit).
5. **Refund/reversal.** Same-currency refund + attribution reversal → `netRevenueMinor` doğru azalır; finalized
   geçmiş immutable (yeni adjustment kaydı); duplicate idempotent.

## C. Operations görünürlüğü (store-admin `/operations`)

Settlement dry-run/run · reservation expiry dry-run · reservation reconcile dry-run · backup health · retention
dry-run · `QueueJobLog` (STARTED/COMPLETED/DRY_RUN/SKIPPED_LOCKED/FAILED/PARTIAL_SUCCESS). Teknik stack/secret
UI'ya sızmaz.

---

## DEMO_FIXTURE

Bu runbook için **kalıcı DEMO_FIXTURE tutulmadı.** Akış her koşuda enterprise-demo üzerinde canlı üretilir ve
demo sonrası temizlenir. Kalıcı bir demo seti tutulacaksa `DEMO_FIXTURE` olarak açıkça işaretle:

| Alan | Değer |
|---|---|
| store | `edm-store` (enterprise-demo) |
| customer | demo müşteri (izole; smoke için `smoke-h4-*` prefiksli fixture kullan) |
| sponsor | izole `SponsorAccount` (`DEMO_FIXTURE` etiketi) |
| campaign | izole sponsored campaign + agreement (currency = TRY) |
| order | attributed demo order (MOCK success) |
| expected KPI | settlement charge = net revenue × rate (minor units); PAID → outstanding 0 |
| cleanup policy | `pnpm db:cleanup-smoke` (smoke prefiksli satırları siler; `assertSafeCleanupEnv` yalnız dev/test) |

**Geçici security/concurrency fixture'ları** (izole `smoke-h4-*` store/session, webhook config) her koşuda
teardown ile silinir (0 kalıntı). Kalıcı müşteri/finans verisi değiştirilmez.

## Beklenen sonuçlar (özet)

- Ödeme sunucu-otoriter; birim fiyat adetten bağımsız; reservation ACTIVE→CONSUMED; duplicate webhook idempotent.
- Sponsored funnel same-currency; karışık-para fail-closed; settlement duplicate yok, finalized immutable.
- Tenant isolation: cross-store customer/recovery-token/sponsor/settlement/attribution reddi (401/403/404).
- Veri bütünlüğü: PAID/CANCELLED+ACTIVE reservation yok (pre-H-3 legacy hariç → ADR-195 reconcile apply ile çözülür),
  duplicate PaymentProviderEvent/settlement yok, currency mismatch yok, oversell yok.

# H-4 — Authenticated Money Path & Sponsored Funnel Smoke

**Tarih:** 2026-07-29
**Baz commit:** `14b248d` (main == origin/main; PR #141 H-3 sonrası)
**Kapsam:** Gerçek para ve sponsorluk akışlarının uçtan uca doğrulaması. Öncelikli olarak DOĞRULAMA fazı;
kod defekti bulunursa minimum güvenli fix. Yeni yetenek yok.
**Sonuç:** ✅ Tüm gate'ler yeşil; canlı güvenlik + para-yolu smoke'ları PASS; **kod defekti bulunmadı** →
docs-only kapanış.

---

## 1. Ortam ve ön hazırlık

| Kontrol | Sonuç |
|---|---|
| `main == origin/main == 14b248d` | ✅ |
| Çalışma ağacı temiz (worktree branch `claude/h4-money-path-smoke-62eab6`) | ✅ |
| Servisler (`api-gateway`, `worker`, `store-admin-web`, `storefront-web`, `postgres`, `redis`) healthy | ✅ (22–48h up) |
| `prisma migrate status` → up to date (63 migration) | ✅ |
| Gerçek ödeme provider'ı | Kapalı — yalnız `MOCK` (ENABLED, secret'siz → webhook fail-closed) |
| İzole fixture | Tüm canlı testler `smoke-h4-*` prefiksli izole store/session; teardown 0 kalıntı |

Gerçek sağlayıcı açılmadı. Kalıcı müşteri/finans verisi değiştirilmedi (yalnız izole smoke satırları
oluşturulup silindi).

## 2. Auth yöntemi

- **Müşteri (storefront):** kısa ömürlü `CustomerSession` fixture. Raw token client tarafında; DB'de yalnız
  `tokenHash = sha256("<token>.<SESSION_SECRET>")`. `SESSION_SECRET` **yalnız konteyner içinde** kullanıldı;
  hash konteyner içinde hesaplanıp yalnız (hassas olmayan) hash dışarı verildi. TTL 10 dk, smoke sonunda
  session silindi. Secret/parola okunmadı, loglanmadı, repo'ya yazılmadı.
- **Store-admin/internal:** `INTERNAL_API_TOKEN` (konteyner env; okunmadı/loglanmadı). Store-admin UI parola
  gerektirir → **tarayıcı UI click-through yapılmadı** (bkz. §12 sınır ve [[TD-122]]).

**Canlı doğrulama:** minted session ile `GET /public/stores/enterprise-demo/customer/coupons` → **200**;
session'sız → **401**; sahte token → **401**. Session store-scoped (bkz. §12).

## 3. Checkout / payment happy path (money path)

Ödeme-başarı → sipariş + rezervasyon lifecycle'ı iki eş-politikalı yolda uygulanır (aynı transaction):
`apps/api-gateway/src/server.ts:4744` (hosted-pay/manual) ve `:6610` (webhook `applyOutcome`). Her ikisi de
`PAID`/`AUTHORIZED` geçişinde `consumeOrderReservations` çağırır (H-3 ADR-190/191), late-after-expiry
fail-closed dahil.

**Canlı imzalı webhook üzerinden money path (izole store):** `PAYMENT_PENDING` sipariş → geçerli imzalı
`PAID` webhook → sipariş **PAID** (`applied=true`); tutar/para birimi invariant'ı doğrulandı; monotonik +
idempotent. Detay §4.

Fiyat sunucu-otoriter, birim fiyat/subtotal/indirim/vergi/shipping/currency doğruluğu ve reservation
ACTIVE→CONSUMED sayaç doğruluğu regresyon suite'leriyle kapsanır (`payments-*`, `reservation-*`,
`inventory-engine`, `commercial-engine` — hepsi PASS, §11).

## 4. Payment webhook güvenliği (canlı, deployed gateway :4000)

İzole store + bilinen webhook secret ile HMAC imzalı istekler (`x-payment-signature` +
`x-payment-timestamp`; imza `hex(HMAC_SHA256(secret, "<ts>.<rawBody>"))`):

| Senaryo | Beklenen | Sonuç |
|---|---|---|
| legacy route `/webhooks/payment`, `/payments/webhook` | 404 | ✅ 404 |
| bilinmeyen token (imzasız) | 404 generic (fail-closed, tenant sızmaz) | ✅ 404 `WEBHOOK_NOT_FOUND` |
| GET webhook path | 404 (yalnız POST) | ✅ 404 |
| imzasız | 401 | ✅ 401 `SIGNATURE_MISSING` |
| yanlış imza | 401 | ✅ 401 `SIGNATURE_INVALID` |
| eski timestamp (>300s) | reject | ✅ 401 `TIMESTAMP_OUT_OF_RANGE` |
| yanlış tutar | no mutation | ✅ 200 `AMOUNT_MISMATCH`, sipariş değişmedi |
| yanlış currency | no mutation | ✅ 200 `CURRENCY_MISMATCH`, sipariş değişmedi |
| bilinmeyen provider reference | no mutation | ✅ 200 `WEBHOOK_REFERENCE_NOT_FOUND`, sipariş değişmedi |
| geçerli imzalı PAID | apply → PAID | ✅ 200 `applied=true`, sipariş PAID |
| duplicate event | idempotent | ✅ 200 `duplicate=true` (ikinci consume yok) |
| PAID sonrası geç FAILED | no rollback (monotonic) | ✅ sipariş PAID kaldı, `handled=false` |
| duplicate `PaymentProviderEvent` satırı | 0 | ✅ 0 |

**Canlı toplam: 10/10 imzalı senaryo PASS + 3 fail-closed 404.** İmza-tabanlı davranışlar ayrıca
`payments-webhook-signature.test.ts` + `payments-webhook-routes.test.ts` ile unit düzeyde kapsanır (PASS).

## 5. Reservation consume / release

- Consume-on-paid iki ödeme-başarı yolunda da wired (§3). `RELEASE`: terminal CANCELLED → stok geri;
  retryable `PAYMENT_FAILED` → bırakılmaz (TTL halleder) — `reservation-lifecycle`/`operations` suite (PASS).
- Reconciliation (ADR-193) **salt-okunur**: `PAID+ACTIVE`, `CANCELLED+ACTIVE`, `activeUnpaidWithoutExpiry`,
  sayaç-mismatch, reserved>onHand uyarı olarak raporlanır; otomatik düzeltme YOK.

## 6. Sponsor ticari zinciri & 7. Sponsored attribution funnel

Gateway boundary'de tam kapsam (regresyon suite'leri, hepsi PASS):
`sponsored-core`, `sponsored-activation-guard` (agreement-gated activation → `409 AGREEMENT_NOT_ACTIVE`),
`sponsored-checkout-attribution` (store/campaign/product scope, duplicate guard, bot/prefetch exclusion,
cross-store reddi), `sponsorship-billing-core`, `sponsorship-routes`, `sponsorship-75k-scenario`
(avans/mahsup/tahsilat/overpayment), `commercial-automation-settlement-persistence` +
`-scheduler` (unique-dönem + FINALIZED-immutable → duplicate imkânsız, otomatik finalize yok).

## 8/9. Revenue-share happy path & currency mismatch

`sponsorship-currency-guard.test.ts` (H-2, ADR-181…186) PASS: aynı-para revenue-share preview→draft→charge
tam sayı (minor units, float yok); **karışık-para fail-closed** — mismatch sayımı, preview fail-closed, draft
oluşmaz, partial settlement yok, TRY+USD birleşmez. Canlı DB tarama: `charge.currency <> settlement.currency`
= 0; `payment.currency <> charge.currency` = 0.

## 10. Refund / reversal

`OrderAttributionRefund` / `OrderSponsoredAttributionRefund` modelleri + reversal net-revenue düşümü ilgili
suite'lerde kapsanır (PASS). Finalized geçmiş immutable; yeni reversal/adjustment kaydı; currency invariant;
idempotent duplicate guard.

## 11. Gate & test sonuçları

| Gate | Sonuç |
|---|---|
| `pnpm build` | ✅ PASS |
| `pnpm typecheck` | ✅ PASS |
| `pnpm lint` | ✅ PASS |
| `pnpm test` | ✅ **1793 passed / 0 failed** (api-gateway 96 dosya / 1697 test dahil) |
| `git diff --check` | ✅ clean |
| `prisma migrate status` | ✅ up to date |

Money/sponsor kapsamındaki suite'ler (hepsi PASS): `payments-adapters`, `payments-state`,
`payments-resolver`, `payments-tokens`, `payments-encryption`, `payments-webhook-routes`,
`payments-webhook-signature`, `sponsored-*`, `sponsorship-*`, `commercial-automation-*`,
`reservation-*` (packages/inventory), `customer-account`, `customer-credential`, `customer-lists`,
`customer-erasure-*`, `inventory-engine`.

## 12. Tenant isolation (canlı)

İki store fixture mevcut: `enterprise-demo` (edm-store) + `demo-store`. edm-store müşteri session'ı:
- kendi store'unda (`enterprise-demo`) → **200**
- başka store'da (`demo-store`) → **401 `CUSTOMER_UNAUTHORIZED`** (session store-scoped; cross-store reddi)

Sponsor/agreement/campaign/settlement/charge/attribution cross-store erişim reddi tenant-scoped sorgular +
route testleriyle güvence altında.

## 13. Veri bütünlüğü scan (salt-okunur, smoke sonrası)

| Invariant | edm-store | Diğer |
|---|---|---|
| CANCELLED order + ACTIVE reservation | 0 | — |
| duplicate `PaymentProviderEvent` (provider,eventId) | 0 | 0 |
| duplicate settlement (agreement,period) | — | 0 |
| charge.currency ≠ settlement.currency | — | 0 |
| payment.currency ≠ charge.currency | — | 0 |
| orphan OrderLine | — | 0 |
| negatif reservation qty / negatif charge total | — | 0 |
| reservedCounterMismatchVariants | **0** | — |
| reservedExceedsOnHandVariants | **0** | — |
| **PAID order + ACTIVE reservation** | **2 (legacy — bkz. §14)** | — |

## 14. Bulgular

**F-1 (legacy, kod defekti DEĞİL): 2 adet PAID+ACTIVE reservation (edm-store).**
`OS-000001` (2026-07-24) ve `OS-000002` (2026-07-28), müşteri `umut.ciftci@icloud.com`, MOCK/TRY — önceki
H-1/H-2/H-3 smoke sipariş kalıntıları. Her ikisi de H-3 consume-on-paid wiring'inden (ADR-190) **önce**
ödendiği için rezervasyonları hiç CONSUME edilmemiş. Analiz:
- **Mevcut kod doğru:** her iki ödeme-başarı yolu da (`:4744`, `:6610`) `PAID`/`AUTHORIZED`'da
  `consumeOrderReservations` çağırır; canlı imzalı webhook testinde sipariş PAID oldu; yeni PAID+ACTIVE
  üretilmiyor.
- **Etki sınırlı:** `reservedCounterMismatchVariants=0` ve `reservedExceedsOnHand=0` — sayaç iç-tutarlı,
  oversell riski yok; yalnız 2 varyantta available 1 birim eksik gösterilir.
- **Aksiyon:** ADR-193 reconcile SALT-OKUNUR; spec §15 "belirsiz kayıt → otomatik düzeltme yapma, raporla".
  Otomatik düzeltilmedi; operations reconcile raporunda `paidOrderActiveReservations=2` uyarısı olarak
  görünür (manuel consume operasyon kararı). **Kod fix gerekmez.**

Başka defekt bulunmadı.

## 15. Doğrulama sınırı (şeffaflık)

Store-admin **tarayıcı UI click-through**'u yapılmadı (store-admin parola gerektirir; bu session
non-interactive → kullanıcı-parolalı giriş mümkün değil — [[TD-126]]'nın kapandığı yöntem burada
tekrarlanamaz). Sponsored funnel'ın para/güvenlik özü (agreement-gated activation, settlement/charge/payment,
currency guard, attribution scope/refund) **gateway entegrasyon suite'leri + canlı gateway/DB smoke** ile
doğrulandı. Kalan yalnız UI-piksel yürüyüşüdür → Final Enterprise UI Polish + deploy-öncesi manuel kontrol.

## 16. Kapanış

- **H-4:** CLOSED (money-path doğrulama hedefi karşılandı; gate'ler yeşil, canlı güvenlik 10/10, auth +
  tenant isolation canlı, consume-on-paid wired, integrity clean-except-legacy).
- **[[TD-122]]:** CLOSED — sponsored funnel'ın otomatik + gateway + canlı para/güvenlik doğrulaması
  tamamlandı; residual store-admin UI-piksel yürüyüşü Final UI Polish'e devredildi (§15).

**Açık kalan (kapsam dışı):** [[TD-139]]/PB-3 prod offsite config · [[TD-132]] legal retention · [[TD-137]]
provider-native imza · [[TD-147]] CSP · [[TD-033]] create/place atomiklik · Final Enterprise UI Polish.

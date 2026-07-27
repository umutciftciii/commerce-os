# PB-1 — Payment Webhook Authenticity & Store Resolution

- **Tarih:** 2026-07-27
- **Kaynak:** Launch Readiness Audit PB-1 (`docs/analysis/launch-readiness-product-gap-audit.md`).
- **Amaç:** İmzasız/doğrulanmamış webhook veya client payload'ın sipariş/ödeme durumunu değiştirebildiği
  açığın kök neden analizi + fail-closed güvenli tasarım.
- **Invariant (zorunlu):** *Doğrulanmamış hiçbir webhook veya client payload sipariş/ödeme durumunu değiştiremez.*

---

## 1. Exploit kök nedeni

Açık **iki katmanlı** ve imza eksikliğinden daha derin:

**(a) Otorite tamamen client body'de.** Webhook gövde şeması (`server.ts:8369-8380`) `storeId`, `eventId`,
opsiyonel `attemptId` ve opsiyonel `status`'u **client'tan** alır (`.passthrough()`). Handler
(`server.ts:9069-9147`) store'u `body.storeId`'den çözer (`:9078`), attempt'i `body.attemptId`'den bulur
(`:9111`) ve sipariş geçişini **`body.status`'a göre** uygular (`resolveOrderPaymentTransition(order.paymentStatus,
body.status)` `:9116`). Yani sipariş durumu **provider'ın doğrulanmış payload'ından değil, client'ın beyan ettiği
`status`'tan** türetilir.

**(b) İmza doğrulaması hiç uygulanmıyor.** `adapter.handleWebhook` çağrısı `credentials:{...webhookSecret:null}`
ile yapılır (`:9092`), `result.signatureValid` yalnız metadata'ya yazılır (`:9102`) ama geçiş **buna
gate'lenmez**. Provider contract'ların `verifyWebhookSignature()` metodu koşulsuz `true` döndürür
(`adapters/contracts/stripe.ts:146-149`; MOCK `mock-adapter.ts:110-111`). Ayrıca `rawBody` gerçek byte'lar değil
**re-serialize** edilmiş `JSON.stringify(request.body)` (`:9094`) — gerçek HMAC bununla zaten doğrulanamazdı.

**Kök neden:** webhook, "provider imzalı olay → doğrulanmış durum" modeli yerine "client bize ne derse onu uygula"
modeliyle yazılmış; imza doğrulaması bilinçli placeholder (`server.ts:9087`, TODO-071).

## 2. Önceki saldırı senaryosu (kanıt)

- **İstemci hangi payload ile siparişi PAID yapabiliyor?**
  `POST /payments/webhooks/mock` (veya herhangi bir provider) gövdesi:
  `{ "storeId": "<store>", "eventId": "<rastgele>", "attemptId": "<attempt>", "status": "PAID" }`.
  Handler `resolveOrderPaymentTransition(current, "PAID")` → `PAID` uygular (`recordPaymentAttemptOutcome …
  orderPaymentStatus:"PAID"` `:9119-9146`). İmza yok, secret yok, auth yok, feature-flag yok.
- **`attemptId` tek başına yeterli mi?** Evet. `attemptId` müşteriye payment-state yanıtında **açıkça dönüyor**
  (`server.ts:8896-8899`, `recovery-routes.ts:163`). Müşteri kendi siparişinin attempt'ini bilir → **kendi
  siparişini bedavaya PAID** işaretleyebilir. `attemptId` opak/CUID olsa da imza yerine geçmez.
- **`storeId` body'den mi alınıyor?** Evet (`server.ts:9078` `findStoreById(body.storeId)`). Tenant otoritesi
  client'ta → çapraz-store deneme + tenant enumeration yüzeyi.
- **Webhook tekrarları nasıl işleniyor?** `PaymentProviderEvent` unique `(storeId, provider, eventId)`
  (`schema.prisma`) + handler başı dedup (`:9083-9085`). Idempotency VAR ama yalnız **client'ın verdiği eventId**
  üzerinde — saldırgan her seferinde yeni `eventId` uydurarak dedup'ı atlar.
- **Provider secret yokken davranış ne?** İşlem yine de uygulanır (secret hiç kullanılmaz). Fail-**open**.
- **Test/mock endpoint production'da erişilebilir mi?** Evet. `/payments/webhooks/:provider` public + auth'suz +
  flag'siz; MOCK dahil her provider için outcome uygular. Oysa MOCK gerçekte webhook'tan DEĞİL, `/public/pay/:token`
  confirm yolundan tamamlanır (`recovery-routes.ts:740-846`) → webhook endpoint'i MOCK fazında **hiç gerekli değil**.

## 3. Signature verification (yeni tasarım)

Kanıtlanmış in-repo desen **shipping webhook** (`shipping/webhook.ts` + `shipping/webhook-routes.ts`, TODO-104/
ADR-048) birebir aynalanır:

- İmza: `hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))`; `rawBody` **byte-aynen** (scoped
  `addContentTypeParser("application/json", {parseAs:"string"})` → JSON re-serialize edilmez).
- `timingSafeEqual` (uzunluk + hex ön-kontrolü), `x-payment-timestamp` zorunlu, **tolerans 300 sn** (replay
  penceresi); pencere-içi replay'i idempotency inbox keser.
- Secret **PaymentProviderConfig.webhookSecretCipher**'dan decrypt edilir (config silinmez; secret loglanmaz).
- **Fail-closed:** secret yoksa / config DISABLED / bilinmeyen token → generic `404 WEBHOOK_NOT_FOUND` (tenant
  sızdırmaz). İmza yok/yanlış → `401`, **DB'ye yazılmaz** (inbox flood/DoS önlemi).
- `verifyWebhookSignature(){ return true }` **tamamen kaldırılır**; her provider gerçek doğrulama sağlar.

## 4. Raw body davranışı

- Yeni webhook route'u scoped plugin içinde raw string parser kullanır → `request.body` ham gövde string'idir.
- İmza doğrulaması **JSON parse ÖNCESİ** ham byte üzerinde yapılır. Parse yalnız imza geçerliyse ve
  try/catch ile (crash yok; geçersiz JSON → güvenli ignore + ack).
- Ham gövde AuditLog/metadata'ya YAZILMAZ; yalnız `sha256(rawBody)` payload hash'i saklanır.

## 5. Store / order resolution (client body otorite DEĞİL)

- **URL kimliği:** `POST /public/payments/webhooks/:webhookToken` — `webhookToken` (opak, `whk_…`)
  `PaymentProviderConfig`'i çözer → store + provider + secret. Token **yetki vermez**; yetki = HMAC.
  (Shipping deseniyle aynı; `body.storeId` artık okunmaz bile.)
- **Attempt/order:** imza geçtikten sonra provider payload'ından **güvenilir provider reference**
  (`providerReference`/`providerPaymentId`) çıkarılır; attempt `(config.storeId, providerReference)` ile
  server-side çözülür (yeni index `PaymentAttempt(storeId, providerReference)`). `attempt.storeId ==
  config.storeId` ve `attempt.provider == config.provider` doğrulanır.
- **Bilinmeyen reference:** order DEĞİŞMEZ; güvenli `WEBHOOK_REFERENCE_NOT_FOUND` (200 ack — sağlayıcı sonsuz
  retry tetiklenmez); tenant enumeration sızdırmaz (store yalnız token'dan bilinir).
- Payload'daki `storeId`/`orderId`/`amount`/`currency` yalnız **karşılaştırma** için kullanılır; otorite değildir.

## 6. Amount / currency invariant

Doğrulanmış webhook sonrası dahi:
- provider amount (minor) == `PaymentAttempt.amount`
- provider currency == `PaymentAttempt.currency`
- attempt bu store/order'a ait + terminal değil
- partial capture desteklenmez → tam tutar zorunlu

Uyuşmazlıkta: order **PAID olmaz**; attempt kontrollü `FAILED` (review) + `AMOUNT_MISMATCH`/`CURRENCY_MISMATCH`
audit event; domain hata kodu. Client/provider tutarı doğrudan Order total'e **yazılmaz** (tutar daima attempt
snapshot'ından).

## 7. Monotonic state machine

Mevcut `payment-state.ts` `resolveOrderPaymentTransition` (monotonik, allowlist) **korunur ve yeniden kullanılır**
— tek fark: girdi `body.status` değil, **doğrulanmış provider payload'ından türetilen** `PaymentAttemptStatus`
(`contract.mapWebhookStatus(verifiedPayload)`). Geçişler: PENDING→PROCESSING/PAID/FAILED; PAID terminal;
late FAILED/CANCELLED geriye çevirmez; REFUNDED ayrı ileri geçiş. Order + PaymentAttempt + event **tek transaction**.

## 8. Idempotency / replay

- **Replay (pencere dışı):** timestamp tolerans → reddedilir.
- **Replay (pencere içi) + duplicate:** `PaymentProviderEvent` unique `(storeId, provider, eventId)` +
  `eventKey` (eventId yoksa `sha256(rawBody)`) → ikinci kez mutasyon YAPILMAZ (idempotent ack). eventId artık
  **doğrulanmış payload'dan** gelir (client uydurması değil).

## 9. attemptId public davranışı

- Payment status endpoint zaten tenant/session-scoped opak access token (`/pay/:token`, `verifyPaymentAccessToken`)
  ile korunur. `attemptId`'nin dışa dönmesi **artık yetki sağlamaz**: webhook customer session/attemptId
  KULLANMAZ, yalnız provider imzası + provider reference kullanır. attemptId enumeration order bilgisi sızdırmaz.

## 10. Fake / test provider güvenliği

- `FAKE_SIGNED_PROVIDER`: yalnız test/dev env; gerçek HMAC (aynı `timestamp.rawBody` şeması); replay/idempotency
  testli; production/staging environment guard (prod'da 404). Test secret production secret ile **aynı olamaz**.
- "Her signature geçerli" adapter (MOCK.handleWebhook + contract `return true`) production yolundan **kaldırılır**.

## 11. Provider mode / fail-closed

- Gerçek sağlayıcı (STRIPE/IYZICO/PAYTR/GENERIC) seçili + `webhookSecretCipher` set + config ENABLED değilse
  webhook **fail-closed** (404). Böylece EX-1 (canlı sağlayıcı sözleşmesi) tamamlanana kadar hiçbir gerçek-para
  yolu açık kalmaz; MOCK zaten webhook kullanmaz.

## 12. Kapanış kriteri

PB-1 kapalı sayılır: (a) client body ile order/payment mutasyonu İMKANSIZ; (b) imzasız/yanlış-imza/eski-timestamp/
duplicate/bilinmeyen-reference/yanlış-amount/currency/başkasının-attemptId'si/terminal-attempt/out-of-order
senaryolarında order PAID OLMAZ; (c) canlı exploit regresyonu gerçek PostgreSQL'de yeşil. Gerçek ödeme
etkinleştirme yalnız bundan sonra + EX-1.

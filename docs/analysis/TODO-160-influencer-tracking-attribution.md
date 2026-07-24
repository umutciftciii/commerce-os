# TODO-160 — Influencer Tracking & Attribution — Ön Analiz

> Durum: uygulama fazı analizi. Yöneten karar: **ADR-091** (paylaşılan event/attribution
> KATMANI, ayrı domain modelleri). Bu faz ADR-102…ADR-107 arası kararları hayata geçirir
> (aşağıda "Kararlar → ADR" eşlemesi). Commit/PR/deploy YAPILMAZ (görev kuralı §18).

## 0. Mevcut altyapı özeti (keşif sonucu)

- **API**: Fastify 5 monolit — tüm iş mantığı `apps/api-gateway/src/server.ts` (~8.7k satır)
  `createServer(config)` + per-domain modüller `apps/api-gateway/src/<domain>/{data.ts,routes.ts}`.
  Modüller DI ile bağlanır: `register<Domain>Routes(app, deps)` (server.ts ~6000).
  `services/*` yalnızca stub.
- **Admin auth**: ayrı store-admin kimlik YOK. Store-admin = platform admin + store var-kontrolü.
  `requireStorePlatformAdmin(request, reply, storeId)`; `storeId` **URL path param**'dan
  (`/stores/:storeId/...`), header'dan DEĞİL. Bearer token → `hashSessionToken(token, SESSION_SECRET)`.
- **Public route**: `/public/stores/:storeSlug/...`; tenant slug'dan `resolvePublicStore(slug)`
  (ACTIVE store). Gateway **cookiesiz** (header tabanlı, sunucu-sunucu).
- **Customer session**: `x-customer-session` header (opak token, sha256 hash saklanır).
- **Para**: her yerde tamsayı **minor unit** (`Int`); yeni alanlar `...Minor`/`...Bps` sonekli.
- **Order**: `createOrder` (server.ts:4015, `$transaction`) → `placeOrder` (server.ts:4302,
  stok `FOR UPDATE` rezerve). Public checkout `POST /public/stores/:slug/checkout` (server.ts:5601).
  Snapshot deseni: `OrderDiscount` (immutable) + `CampaignRedemption` (`@@unique([campaignId, orderId])`),
  `applyOrderDiscountsInTransaction` (campaigns/data.ts:665) sipariş transaction'ı içinde yazar.
- **Refund/cancel**: `cancelOrder` (server.ts:4464) stok bırakır, `status=CANCELLED`; para iadesi
  KAYDETMEZ, redemption GERİ ALMAZ. Para iadesi = `PaymentStatus REFUNDED/PARTIALLY_REFUNDED`;
  monotonic `resolveOrderPaymentTransition` (payments/payment-state.ts:121). Idempotency emsalleri:
  payment webhook `@@unique([storeId, provider, eventId])` + no-op; shipping webhook HMAC + inbox unique.
- **Cookie/imza**: web app'lerde (`apps/storefront-web/lib/*-token.ts`) HMAC-SHA256
  `payload.sig` + `timingSafeEqual`; secret `optionalEnvString(env) ?? "<dev-fallback>"`. Storefront
  tek-mağaza (`STOREFRONT_DEMO_STORE_SLUG` env). `safeNextPath` (lib/next-path.ts) açık-yönlendirme
  allowlist'i (yalnız `/` ile başlayan tek-slash iç yol).
- **Store-admin**: Next App Router BFF. Data Grid (ADR-089, `components/data-grid`), searchable
  selector + `?ids=` (ADR-090, `components/selector` + `useProductSelectorBinding`/
  `useCategorySelectorBinding`), yerel koyu-glass UI kit (`components/ui`, `app/components/premium`).
  BFF: `app/api/<module>/route.ts` → `createApiClient().admin.<module>.*`; `requireStoreContext`
  storeId/token'ı sunucuda tutar. CSV export deseni YOK (client download idiomu var: theme-studio).
- **contracts**: `packages/contracts/src/index.ts` tek dosya, Zod; `<name>Schema` + inferred
  `PascalCase` tipler; response `{ data }` sarımı; admin query `adminListQueryBaseSchema.extend`.
- **api-client**: `admin.<domain>.method(storeId, ..., input?, token?)`, URL `/stores/${storeId}/...`.

## 1. Netleştirilen sorular (kararlar)

### 1.1 Click hangi route'ta?
Storefront route handler **`app/t/[token]/route.ts`** (GET, `dynamic="force-dynamic"`). Bu handler
gateway'e **`POST /public/stores/:storeSlug/track/:token`** çağrısı yapar (store = `demoStoreSlug()`).
Gateway: token çözer → aktiflik/tarih kontrol → click kaydeder → **imzalı attribution grant** +
**güvenli hedef yol** döner. Storefront: grant'i httpOnly cookie'ye yazar, `safeNextPath` ile
doğrulanmış hedefe `NextResponse.redirect` eder. DB erişimi gateway'de olduğundan click/kayıt orada;
cookie first-party olması gerektiğinden storefront'ta yazılır.

### 1.2 Visitor/session anonimliği
`visitorIdHash` = `HMAC-SHA256(SESSION_SECRET, visitorId)` — `visitorId` first-party bir
`commerce_os_vid` cookie'sinden gelir (yoksa üretilir; opak rastgele). Ham IP/UA ASLA saklanmaz:
`ipHash`/`userAgentHash` = tuzlanmış HMAC (kısaltılmış). `referrerHash` yerine yalnız
`referrerHost` (host parçası; path/query atılır). PII yok. `sessionIdHash` müşteri oturumu varsa
onun token-hash'i, yoksa null.

### 1.3 Attribution cookie süresi
`commerce_os_attribution` cookie maxAge = `INFLUENCER_ATTRIBUTION_COOKIE_TTL_DAYS` (varsayılan **30
gün**). Ancak NİHAİ pencere kampanya bazlıdır (aşağı) ve checkout'ta yeniden zorlanır — cookie ömrü
yalnız üst sınırdır.

### 1.4 Last-click kuralı
Model = **`LAST_CLICK`**. Her GEÇERLİ influencer click'i cookie grant'ini EZER (son tıklama kazanır).
Grant içinde `clickedAt` + `expiresAt` taşınır.

### 1.5 Direct ziyaret mevcut attribution'ı siler mi?
**Hayır.** Direct (tokensiz) ziyaret cookie'ye dokunmaz; mevcut attribution korunur. Yalnız yeni
geçerli bir click cookie'yi değiştirir.

### 1.6 Order snapshot alanları
`OrderAttribution` satırı: `orderId` (unique), `influencerId`, `campaignId`, `trackingLinkId?`,
`attributionModel=LAST_CLICK`, `attributedAt`, `grossRevenueMinor`, `refundedRevenueMinor` (0),
`netRevenueMinor`, `currency`, **`snapshot Json`** (influencer adı+code, campaign adı+pencere,
link targetType/targetPath/utm, clickedAt, landingPath — tarihsel sabitlik; influencer/campaign
sonradan değişse bile bu snapshot değişmez).

### 1.7 Refund sonrası net gelir
`netRevenueMinor = grossRevenueMinor - refundedRevenueMinor` (>=0). Gross geriye dönük BOZULMAZ.
Tam refund/cancel → refunded = gross → net = 0. Kısmi refund → refunded += tutar. Idempotency:
**append-only `OrderAttributionRefund` ledger** (`@@unique([orderAttributionId, refundKey])`);
aynı refund event ikinci kez uygulanınca no-op. Currency sabit.

### 1.8 Unique click tanımı
`uniqueVisitors` = bir dönemde **distinct `visitorIdHash`** (yalnız `isBot=false`). Rapid repeat:
aynı `(storeId, trackingLinkId, visitorIdHash)` için `CLICK_DEDUPE_WINDOW_SECONDS` (varsayılan **1800s
/30dk**) içinde ikinci click YENİ SATIR AÇMAZ (cookie yine tazelenir/last-click güncellenir) →
`totalClicks` şişmez.

### 1.9 Bot/repeat click filtresi
Bilinen bot UA regex → `isBot=true`. Bot click'ler AUDIT için kaydedilir ama TÜM metrik
paydalarından (totalClicks/uniqueVisitors/conversion) DIŞLANIR. Repeat: §1.8 dedupe.

### 1.10 UTM ve kupon ilişkisi
UTM (`utmSource/Medium/Campaign`) `InfluencerTrackingLink`'te tutulur; click landing + order snapshot'a
taşınır (raporlama bağlamı). **Kupon attribution MVP kapsamı DIŞI** (ADR-091 "sonraki faz"): sipariş
kupon kullansa bile influencer attribution kupondan BAĞIMSIZ karar verir (last-click cookie). İkisi
ayrı ölçülür; bağ kurulmaz. TD kaydı düşülür.

## 2. Attribution zinciri güvenlik modeli (kritik karar)

Public checkout ucu **authsız**. Gateway istemciden (veya storefront BFF'ten) gelen düz
influencer/campaign alanlarına GÜVENEMEZ. Çözüm: **grant token'ını GATEWAY imzalar ve GATEWAY
doğrular** (HMAC-SHA256, `SESSION_SECRET`). Storefront cookie yalnız bu opak imzalı grant'in
TAŞIYICISIDIR (secret storefront'ta YOK; grant'i click yanıtından alır, checkout'ta aynen geri
gönderir). Kurcalanan grant → imza bozulur → checkout'ta REDDEDİLİR. `storeId` grant'e gömülür ve
checkout'ta eşitlik kontrol edilir → başka store attribution'ı kullanılamaz. Böylece:
- "İstemciden gelen influencer/campaign'e güvenme" ✓ (yalnız gateway-imzalı token'a güvenilir).
- "Order attribution için public write endpoint açma" ✓ (attribution yalnız gerçek checkout
  transaction'ının yan etkisi; ayrı public write yok).

Grant payload (v1): `{ v, storeId, influencerId, campaignId, trackingLinkId, clickId, clickedAt,
expiresAt }` → `base64url(json).base64url(hmac)`.

## 3. Domain modeli (Prisma — additive)

Enum: `InfluencerStatus{ACTIVE,INACTIVE}`, `InfluencerCampaignStatus{ACTIVE,PAUSED,ARCHIVED}`,
`TrackingLinkTargetType{HOME,PRODUCT,CATEGORY,PATH}`, `TrackingLinkStatus{ACTIVE,INACTIVE}`,
`AttributionModel{LAST_CLICK}`.

Modeller (hepsi `storeId` + cuid + `@@index([storeId])`; para `...Minor`):
- **Influencer**(id, storeId, name, code, email?, status, notes?, ts) — `@@unique([storeId, code])`.
- **InfluencerCampaign**(id, storeId, influencerId, name, status, attributionWindowDays,
  startsAt?, endsAt?, ts).
- **InfluencerTrackingLink**(id, storeId, campaignId, tokenHash[opak HMAC, unique/store], targetType,
  targetPath, productId?, categoryId?, utmSource?, utmMedium?, utmCampaign?, status, ts) —
  `@@unique([storeId, tokenHash])`.
  - **Token saklama kararı (ship-öncesi güvenlik revizyonu → tokenHash):** Plain token DB'de
    SAKLANMAZ; yalnız `HMAC-SHA256(SESSION_SECRET, token)` hash'i saklanır (pay/webhook token deseniyle
    tutarlı). Plain URL yalnız oluşturma/yenileme yanıtında BİR KEZ döner; liste/detay token'ı tekrar
    göstermez. Yenileme = rotasyon (eski token geçersizlenir). Gerekçe: token kamuya açık bir URL'de
    dolaşsa da, plain saklamak DB sızıntısında tüm canlı tracking URL'lerini doğrudan kullanılabilir
    kılardı; hash bu artığı kaldırır (defense-in-depth). Bedeli: URL her zaman yeniden görüntülenemez →
    tek-seferlik gösterim + rotasyon UX'i. Detaylı gerekçe + ileriye dönük hash-rotasyon yolu ADR-102.
- **AttributionClick**(id, storeId, campaignId, trackingLinkId, visitorIdHash, sessionIdHash?,
  ipHash?, userAgentHash?, referrerHost?, landingPath, isBot, createdAt) — indexes:
  `@@index([storeId, createdAt])`, `@@index([trackingLinkId, createdAt])`, `@@index([campaignId])`,
  dedupe için `@@index([storeId, trackingLinkId, visitorIdHash, createdAt])`.
- **OrderAttribution**(id, storeId, orderId, influencerId, campaignId, trackingLinkId?,
  attributionModel, attributedAt, grossRevenueMinor, refundedRevenueMinor, netRevenueMinor,
  currency, snapshot Json, ts) — `@@unique([storeId, orderId])` (sipariş başına tek attribution),
  `@@index([storeId, campaignId, attributedAt])`, `@@index([influencerId])`.
- **OrderAttributionRefund**(id, storeId, orderAttributionId, refundKey, amountMinor, createdAt) —
  `@@unique([orderAttributionId, refundKey])` (append-only idempotency ledger).

Store/Product/Category/Order/Influencer/Campaign geri-ilişkileri eklenir. Migration ADDITIVE
(`2026MMDDHHMMSS_add_influencer_tracking_attribution`).

## 4. Metrik tanımları (ADR'de sabitlenir)

Aralık = `[from, to)` (attributedAt / createdAt). Bot click paydaya GİRMEZ. İptal/refund sipariş
`attributedOrders`'ta SAYILIR (attribution vardı); net gelir refund'u yansıtır.
- `totalClicks` = COUNT(AttributionClick where isBot=false)
- `uniqueVisitors` = COUNT(DISTINCT visitorIdHash where isBot=false)
- `attributedOrders` = COUNT(OrderAttribution)
- `conversionRate` = attributedOrders / uniqueVisitors (payda 0 → 0)
- `grossRevenue` = SUM(grossRevenueMinor); `refundedRevenue` = SUM(refundedRevenueMinor);
  `netRevenue` = SUM(netRevenueMinor)
- `averageOrderValue` = grossRevenue / attributedOrders (payda 0 → 0)

## 5. Uygulama seam'leri

- **Public track**: `apps/api-gateway/src/influencers/{data.ts,routes.ts}` →
  `registerPublicTrackingRoutes` (`POST /public/stores/:slug/track/:token`) + `registerInfluencerAdminRoutes`
  (`/stores/:storeId/influencers`, `/influencer-campaigns`, `/influencer-tracking-links`,
  `/influencer-analytics`, `/influencer-analytics/export`). SAF çekirdek `tracking-core.ts`
  (token üretimi, grant sign/verify, bot tespiti, dedupe kararı, net-revenue, metrik formülleri,
  rate-limit) — DB'siz, birim-testli.
- **Checkout snapshot**: server.ts:5601 handler, `placeOrder` başarısından SONRA
  `dataAccess.recordOrderAttribution(storeId, orderId, resolvedGrant)` (kendi tx, `@@unique(orderId)`
  idempotent). Grant checkout body'sinde `attributionGrant?: string` olarak gelir; gateway doğrular +
  influencer/campaign/link aktifliğini + pencereyi DB'den yeniden doğrular; geçersizse attribution
  YAZILMAZ (sessiz; checkout devam eder). Hata → log + checkout yanıtı bozulmaz.
- **Net gelir**: `cancelOrder` tx'ine tam-reversal (refundKey=`cancel:<orderId>`) + payment webhook
  REFUNDED/PARTIALLY_REFUNDED geçişine refund-apply (refundKey=provider eventId). Her ikisi SAF
  `applyRefundToAttribution` + append-only ledger ile idempotent.
- **api-client**: `admin.influencers.*` (+ campaigns/links/analytics) — `/stores/${storeId}/...`.
- **storefront**: `/t/[token]` route + `lib/server/attribution-cookie.ts` + `lib/attribution-token.ts`
  (yalnız taşıyıcı; imza gateway'de) + `lib/server/tracking.ts` (gateway BFF) + checkout body'sine
  grant iliştirme (`cart.ts submitCheckout`).
- **store-admin**: `/influencers`, `/influencers/[id]`, `/influencer-campaigns`, dashboard;
  Data Grid + selector reuse; BFF `app/api/influencers/...`; nav `sales` grubu; i18n `@commerce-os/i18n`.

## 6. Fraud/bot & rate-limit (MVP)
- Bot UA regex (bot/crawler/spider/preview/curl/headless…) → isBot.
- Repeat dedupe (§1.8).
- Public track rate-limit: ipHash başına sliding-window (SAF limiter, injectable). Invalid token da
  aynı limitere tabi (enumeration yavaşlatma). Aşırı → 429 ama yine güvenli redirect (fallback `/`).
- Order attribution yalnız gerçek checkout tx'inden (§2).
- İleri fraud scoring ertelenir → TD.

## 7. KVKK/GDPR
- Ham IP/UA saklanmaz (yalnız tuzlu HMAC). Referrer yalnız host. PII click log'una yazılmaz.
- Hash secret mevcut `SESSION_SECRET` ile.
- Retention: `AttributionClick` için `INFLUENCER_CLICK_RETENTION_DAYS` (varsayılan **180 gün**);
  worker/retention MVP'de opsiyonel — silme stratejisi ADR'de dokümante, otomatik purge bir sonraki
  faza TD (finansal snapshot OrderAttribution KORUNUR, click ham'ı budanır).
- Customer silme: OrderAttribution finansal snapshot'ı BOZULMAZ (influencer FK Cascade; customerId
  OrderAttribution'da tutulmaz — snapshot email/PII taşımaz).

## 8. Shared event-layer sınırı (ADR-091 uyumu)
Ortak kavramlar (click/session/cart/checkout/order/refund/attributed revenue/placement/source) SAF
`tracking-core.ts` + `OrderAttribution` deseninde yeniden kullanılabilir tutulur; TODO-161 (Sponsored)
bu çekirdeği tüketecek. TEK "Campaign" süper-tipi ZORLANMAZ; TODO-161 kodu bu görevde YAZILMAZ.

## 9. Kararlar → ADR eşlemesi
- ADR-102: last-click attribution + gateway-imzalı grant + cookie/window.
- ADR-103: order attribution snapshot (server-otoriter, order-time).
- ADR-104: refund/net revenue (append-only ledger, idempotency, gross korunur).
- ADR-105: click/unique/bot/dedupe + metrik formülleri.
- ADR-106: privacy/retention (IP/UA minimizasyonu, hash, saklama).
- ADR-107: shared event-layer sınırı (ADR-091 uygulaması); ADR-091 → KABUL EDİLDİ.

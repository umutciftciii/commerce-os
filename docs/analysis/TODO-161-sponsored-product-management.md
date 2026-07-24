# TODO-161 — Sponsored Product Management — Ön Analiz

> Durum: uygulama fazı analizi. Yöneten karar: **ADR-091** (paylaşılan event/attribution
> KATMANI, ayrı domain modelleri; sponsorlu yerleşimin organik aramadan izolasyonu — KABUL).
> Bu faz **ADR-114…ADR-120** kararlarını hayata geçirir (§13 eşleme). TODO-160'ın attribution
> altyapısını (grant sign/verify, KVKK-hash, bot/dedupe, net-gelir/refund defteri) YENİDEN
> KULLANIR; Influencer domain modeliyle Sponsored domainini BİRLEŞTİRMEZ. Commit/PR/deploy
> YAPILMAZ (görev kuralı §18).

## 0. Mevcut altyapı (keşif sonucu)

- **API**: Fastify 5 monolit — `apps/api-gateway/src/server.ts` (~8.7k satır) + per-domain
  `apps/api-gateway/src/<domain>/{data.ts,routes.ts}` modülleri, DI ile bağlanır
  (`register<Domain>Routes(app, deps)`). Yeni modül: `apps/api-gateway/src/sponsored/`.
- **Admin auth**: `requireStorePlatformAdmin(request, reply, storeId)`; `storeId` URL path
  param'ından. Tenant izolasyonu: her sorgu `where: { storeId, ... }`.
- **Public route**: `/public/stores/:storeSlug/...`; `resolvePublicStore(slug)` (ACTIVE store),
  cookiesiz (header/gövde tabanlı, sunucu-sunucu).
- **Para**: her yerde tamsayı **minor unit** (`Int`); yeni alanlar `...Minor` sonekli.
- **Search read-model (ADR-079)**: `GET /public/stores/:storeSlug/search`
  ([search/routes.ts:42](../../apps/api-gateway/src/search/routes.ts)) → `deps.search(storeId, query)`
  (SearchProvider) → organik `SearchResult`. Organik sıralama tamamen
  [`buildOrderBy`](../../services/search-service/src/search-query.ts) SQL `ORDER BY`'da
  (relevance = exact title → prefix → ts_rank → trigram). Yanıt `products` map'i
  [routes.ts:90-123](../../apps/api-gateway/src/search/routes.ts) → `publicSearchResponseSchema`
  ALLOWLIST'i. `ProductSearchDocument` (schema:3267) alanları: `title, slug, brand, searchText,
  searchVector, status, hasStock, availability, minPriceMinor, listing(kart snapshot), campaign(rozet)`.
- **Home (ADR-086)**: polimorfik `HomeSection` (schema:2677) — `type String` (enum DEĞİL →
  migration'sız yeni tip), `config Json`, `enabled` + `publishStart/publishEnd`. Public resolve:
  `GET /public/stores/:storeSlug/home` ([server.ts:5159-5283](../../apps/api-gateway/src/server.ts)).
  `PRODUCT_SHOWCASE` MANUAL (`HomeShowcaseProduct` tablosu) veya DYNAMIC (`resolveDynamicShowcase`
  switch). Storefront renderer: [home-sections.tsx](../../apps/storefront-web/components/site/home/home-sections.tsx)
  (type→component switch).
- **Attribution altyapısı (TODO-160, ADR-102…107)**: `apps/api-gateway/src/influencers/` —
  SAF çekirdek [tracking-core.ts](../../apps/api-gateway/src/influencers/tracking-core.ts) (DB/HTTP'siz,
  birim-testli): `signAttributionGrant/verify` (HMAC-SHA256, SESSION_SECRET), `hashIdentifier`
  (KVKK tuzlu hash), `isBotUserAgent`, `isRapidRepeatClick` (dedupe), `computeNetRevenueMinor` +
  `reduceAttributionRevenue` (append-only iade defteri), `createSlidingWindowLimiter`. Checkout
  snapshot: [checkout-attribution.ts](../../apps/api-gateway/src/influencers/checkout-attribution.ts)
  (`resolveAttributionForCheckout` — sunucu-otoriter grant çözümü) → `recordOrderAttribution`
  ([data.ts:510](../../apps/api-gateway/src/influencers/data.ts)) best-effort, `orderId @unique`
  idempotent. Refund: `applyRefund` (cancel → `cancel:<orderId>`, webhook REFUNDED → `refund:<eventId>`).
- **Store-admin**: Next App Router BFF; Data Grid (ADR-089, `components/data-grid`), searchable
  selector + `?ids=` (ADR-090, `components/selector` + `useProductSelectorBinding`), yerel koyu-glass
  UI kit. BFF `app/api/<module>/route.ts` → `createApiClient().admin.<module>.*`; `requireStoreContext`.
  CSV export idiomu (influencer): blob + anchor download; gateway `text/csv` döner.
- **contracts**: `packages/contracts/src/index.ts` tek dosya, Zod `<name>Schema` + inferred tipler.
- **api-client**: `admin.<domain>.method(storeId, ..., input?, token?)`, URL `/stores/${storeId}/...`.
- **Store timezone kolonu YOK** → §1.10.

## 1. Netleştirilen kararlar

### 1.1 Sponsorlu yerleşimler organik sonuçlara NEREDE enjekte edilir? (ADR-114)
**Organik sonuç kümesi ÜRETİLDİKTEN SONRA, ayrı bir katmanda.** Organik `SearchResult`
(`ORDER BY` dahil) HİÇ değişmez (ADR-079 kilidi + ADR-091 karar 5). Enjeksiyon noktası:
[search/routes.ts:90](../../apps/api-gateway/src/search/routes.ts) organik `products` map'i kurulduktan
sonra, `publicSearchResponseSchema.parse` ÖNCESİ. Sponsorlu adaylar AYRI sorgudan gelir, slot-merge
edilir. Home için: yeni `SPONSORED_SHOWCASE` HomeSection tipi resolve dalı (server.ts home compose).

### 1.2 Impression/click nasıl ölçülür? (ADR-118)
Sunucu her sponsorlu ürünü çözerken **opak, GATEWAY-imzalı `sponsoredToken`** üretir
(`{ v, storeId, campaignId, placementId, productId, placement, issuedAt, expiresAt }`, HMAC-SHA256,
SESSION_SECRET — attribution grant deseninin birebir aynısı). Storefront:
- **Impression**: sponsorlu ürün GERÇEKTEN render edildiğinde (viewport'a girince, IntersectionObserver)
  `POST /public/stores/:slug/sponsored/events` `{ type:"IMPRESSION", token }`.
- **Click**: karta tıklanınca aynı uç `{ type:"CLICK", token }` (+ grant cookie'si tazelenir).
- **Cart**: sepete eklenince `{ type:"CART", token }` (opsiyonel best-effort).

Gateway token'ı doğrular (imza + storeId + süre), gömülü campaignId/placementId/productId'yi kullanır —
**istemci campaign/product/priority/revenue BELİRLEYEMEZ**. Bot UA → `isBot=true` (metrik paydasından
dışlanır ama audit için kaydedilir). Dedupe: aynı `(visitorIdHash, placementId, type)` kısa pencere
(30 dk) içinde YENİ SATIR açmaz (`isRapidRepeatClick` yeniden kullanılır). Unique impression = distinct
`visitorIdHash`. **ORDER/REFUND event enum'a KONMAZ** (§1.8) — sunucu-otoriter attribution tablosunda.

### 1.3 Aynı ürünün organik + sponsorlu tekrarı nasıl engellenir? (ADR-117)
Sponsorlu ürünler üst slotlara enjekte edilir; **aynı productId organik listede varsa organik kopya
DÜŞÜRÜLÜR** (sponsorlu sürüm `Sponsorlu` rozetiyle kalır). Ayrıca bir ürün birden çok kampanyada
sponsorluysa **en yüksek öncelikli kampanya kazanır, tek girdi**. Dedupe SAF fonksiyon (`dedupeSponsored`).

### 1.4 Relevancy eşiği (ADR-116)
Sadece sponsor önceliği İLGİSİZ ürünü gösteremez. Aday, ProductSearchDocument üzerinden şu kapıları
geçmeli:
- **Query hedefleme**: kampanyanın hedef anahtar kelimesi (allowlist, normalize) aramayla token-eşleşir
  VE aday ürünün `searchText`'i aranan token'ı içerir (min relevancy). Yani hedeflenmiş bir kelime bile
  ürünle alakasızsa aday elenir.
- **Kategori hedefleme**: aday ürünün `primaryCategoryId`'si kampanyanın `targetCategoryId` alt-ağacında.
- Query yoksa (boş arama / kategori gezinme): yalnız kategori-hedefli kampanyalar aday olabilir.
MVP'de bidding/ML ranking YOK.

### 1.5 Slot yoğunluğu (ADR-115)
- **Search**: yalnız **1. sayfada** sponsorlu enjeksiyon (sonraki sayfalar tamamen organik). Sayfa
  başına sabit tavan `SPONSORED_SEARCH_MAX_SLOTS = 2`. İlk slot organik ilk kayıttan SONRA gelir
  (`SPONSORED_SEARCH_LEAD_ORGANIC = 1`) — sponsorlu tüm üst sıraları KAPLAMAZ.
- **Home**: `SPONSORED_SHOWCASE` section `config.maxItems` (varsayılan 8, tavan
  `SPONSORED_HOME_MAX_SLOTS = 12`).
- **Kampanya bazlı**: `campaign.maxSlots` her kampanyanın tek sonuç kümesinde alabileceği azami ürün.

### 1.6 Kampanya öncelik + çakışma (ADR-119)
Deterministik sıra: `priority DESC, campaign.createdAt ASC, campaign.id ASC` (eşitlik kırıcı stabil).
Aynı slotlara birden çok uygun kampanya varsa yüksek öncelik önce yerleşir; tavan dolunca kalanlar
düşer. Bir ürün birden çok kampanyada → §1.3 (en yüksek öncelik kazanır).

### 1.7 Stokta olmayan / pasif / arşivli ürün (ADR-116)
Aday çözümü ProductSearchDocument JOIN'i üzerinden yapılır: `status = ACTIVE` VE `hasStock = true`
olmayan ürün **otomatik elenir** (read-model zaten yalnız ACTIVE ürünleri indeksler; stok
InventoryEngine türevidir). Kampanya bitince (endsAt < now / status != ACTIVE) hiçbir sponsorlu iz
kalmaz — ürün organik davranışına döner (kalıcı alan yazılmaz).

### 1.8 Order attribution + client güveni (ADR-118)
Order ve refund **SUNUCU-OTORİTER**; `SponsoredProductEvent` enum'una KONMAZ (event tablosu yalnız
IMPRESSION/CLICK/CART funnel'ı). Sipariş anında:
- Storefront checkout gövdesine tıklanan sponsorlu ürünlerin grant'lerini iliştirir
  (`sponsoredGrants?: string[]`).
- Gateway her grant'i doğrular (imza + storeId + pencere + kampanya ACTIVE) VE grant'in productId'si
  siparişte GERÇEKTEN var mı kontrol eder → yalnız eşleşen sipariş SATIRININ geliri kadar
  `OrderSponsoredAttribution` yazar (per-(order,campaign,product), `@@unique`).
- **Client revenue/orderId belirleyemez** — gelir sipariş satırından türetilir, grant yalnız "hangi
  sponsorlu tıklama"yı taşır.
- Refund idempotent: append-only `OrderSponsoredAttributionRefund` (`refundKey` unique); cancel → tam
  reversal, webhook REFUNDED → oransal reversal. `reduceAttributionRevenue` yeniden kullanılır.

### 1.9 Influencer + Sponsored coexistence (ADR-120)
İki attribution AYNI siparişte BİRLİKTE bulunabilir ve BİRBİRİNİ SİLMEZ:
- **Influencer** (TODO-160): TÜM siparişi tek influencer'a atfeder (`OrderAttribution`, sipariş başına 1).
- **Sponsored** (TODO-161): siparişin BELİRLİ ÜRÜN SATIRLARINI kampanyalara atfeder
  (`OrderSponsoredAttribution`, sipariş başına N — ürün başına 1).
Ayrı tablolar, ayrı grant'ler, ayrı iade defterleri. Bir sipariş hem "influencer X'ten geldi" hem
"içindeki Y ürünü sponsorlu kampanya Z'den tıklandı" olabilir; çakışma yok, sessiz silme yok.

### 1.10 Store timezone
Store'da timezone kolonu YOK. Kampanya `startsAt/endsAt` **UTC instant** (`DateTime`) saklanır; aktiflik
kontrolü tamamen UTC `now` karşılaştırmasıdır (timezone-bağımsız, doğru). Admin'in yerel gün seçimini
doğru UTC instant'a çevirebilmesi için kampanyada `timezone String @default("Europe/Istanbul")` (IANA)
tutulur — yalnız GÖRÜNTÜ/DÜZENLEME bağlamı; aktiflik mantığını ETKİLEMEZ.

## 2. Domain modeli (Prisma — additive; ADR-114)

Enum:
- `SponsoredCampaignStatus { ACTIVE, PAUSED, ARCHIVED }`
- `SponsoredPlacementType { HOME_SHOWCASE, SEARCH_RESULTS }` (MVP; Category-PLP/PDP/Cart/Checkout §4 ileri faz)
- `SponsoredEventType { IMPRESSION, CLICK, CART }` (ORDER/REFUND = sunucu-otoriter attribution tablosu)

Modeller (hepsi `storeId` + cuid + tenant index; para `...Minor`):

- **SponsoredProductCampaign**(id, storeId, name, status, placement, startsAt?, endsAt?, priority
  Int@default(0), maxSlots Int@default(3), targetCategoryId?, timezone String@default("Europe/Istanbul"),
  createdAt, updatedAt) — `@@index([storeId, status, placement])`, `@@index([storeId, placement, startsAt, endsAt])`.
- **SponsoredProductPlacement**(id, storeId, campaignId, productId, position Int?, priority Int@default(0),
  createdAt, updatedAt) — kampanya↔ürün junction. `@@unique([campaignId, productId])`,
  `@@index([storeId, productId])`, `@@index([campaignId])`.
- **SponsoredTargetKeyword**(id, storeId, campaignId, keyword, createdAt) — SEARCH_RESULTS query
  allowlist (normalize). `@@unique([campaignId, keyword])`, `@@index([storeId, keyword])`.
- **SponsoredProductEvent**(id, storeId, campaignId, placementId?, productId, type SponsoredEventType,
  placement SponsoredPlacementType, source?, visitorIdHash?, sessionIdHash?, isBot Boolean@default(false),
  createdAt) — funnel. Indexes: `@@index([storeId, createdAt])`, `@@index([campaignId, type, createdAt])`,
  `@@index([productId, type])`, dedupe `@@index([storeId, placementId, visitorIdHash, type, createdAt])`.
- **OrderSponsoredAttribution**(id, storeId, orderId, campaignId, placementId?, productId, attributedAt,
  quantity Int, grossRevenueMinor, refundedRevenueMinor Int@default(0), netRevenueMinor, currency,
  snapshot Json, createdAt, updatedAt) — `@@unique([orderId, campaignId, productId])`,
  `@@index([storeId, campaignId, attributedAt])`, `@@index([orderId])`, `@@index([productId])`.
- **OrderSponsoredAttributionRefund**(id, storeId, orderSponsoredAttributionId, refundKey, amountMinor,
  createdAt) — `@@unique([orderSponsoredAttributionId, refundKey])`, `@@index([storeId])`.

Store/Product/Category/Order geri-ilişkileri eklenir (Product/Category `onDelete: SetNull` snapshot
alanları KORUNUR; junction/keyword `Cascade`). Migration ADDITIVE
(`2026MMDDHHMMSS_add_sponsored_product_management`). Migration ana repo PG'sine uygulanır + doğrulanır.

## 3. SAF çekirdek (`apps/api-gateway/src/sponsored/sponsored-core.ts`; ADR-115/116/117/118)

DB/HTTP YOK, birim-testli. TODO-160 `tracking-core`'un desenini yeniden kullanır (bazı primitive'ler
oradan re-export/paylaşım; ortak event-layer, ADR-091 karar 1):
- `signSponsoredToken(payload, secret)` / `verifySponsoredToken(token, secret)` — HMAC-SHA256, versiyon guard.
- `normalizeKeyword(raw)` — locale-bağımsız normalize (TR-I tuzağına karşı; arama query normalize'i ile aynı zemin).
- `tokenizeQuery(q)` → normalize token seti.
- `matchesSponsoredRelevancy(queryTokens, doc, campaign)` — query/kategori relevancy kapısı (§1.4).
- `injectSponsoredSlots(organic, sponsored, { leadOrganic, maxSlots })` — slot-merge (SAF, deterministik).
- `dedupeSponsoredCandidates(candidates)` — ürün başına en yüksek öncelik (§1.3).
- `orderSponsoredByPriority(campaigns)` — deterministik sıra (§1.6).
- Impression/click dedupe (`isRapidRepeatClick` yeniden kullanılır), bot (`isBotUserAgent`), net-gelir
  (`computeNetRevenueMinor`, `reduceAttributionRevenue`) — TODO-160'tan.
- Sabitler: `SPONSORED_SEARCH_MAX_SLOTS=2`, `SPONSORED_SEARCH_LEAD_ORGANIC=1`, `SPONSORED_HOME_MAX_SLOTS=12`,
  `DEFAULT_SPONSORED_ATTRIBUTION_WINDOW_DAYS=7`, `SPONSORED_EVENT_DEDUPE_WINDOW_SECONDS=1800`. **Yeni env YOK**
  (influencer deseni: pure-core sabitleri).

## 4. Placement tipleri
MVP: `HOME_SHOWCASE`, `SEARCH_RESULTS`. **İleri faz (TD kaydı)**: Category-PLP injection, PDP
recommendation, Cart upsell, Checkout upsell — enum ileriye açık (yeni değer = servis dalı, migration yok).

## 5. Ana sayfa entegrasyonu (ADR-114)
Yeni polimorfik `HomeSection type = "SPONSORED_SHOWCASE"`, `config { layout: CAROUSEL|GRID, maxItems }`.
**Yeni home engine YOK** — mevcut resolve/render mimarisine dal eklenir:
- contracts: `homeSectionTypeSchema` + config union'a `SPONSORED_SHOWCASE`.
- gateway home compose (server.ts ~5180): section tipi SPONSORED_SHOWCASE → `resolveSponsoredForHome(storeId,
  now, maxItems)` → aktif HOME_SHOWCASE kampanyaları (öncelik sıralı) → placement ürünleri → ProductSearchDocument
  ACTIVE+hasStock kapısı → dedupe → `buildPublicProduct` projeksiyonu + `sponsoredToken`.
- storefront: `catalog-types.ts` union + `catalog.ts` map + `home-sections.tsx` yeni renderer
  (**`Sponsorlu` etiketi zorunlu** + impression/click tracking).
- **Kampanya aktif değilse / geçerli ürün kalmazsa section render EDİLMEZ** (boş → gizlenir; mevcut
  boş-section eleme deseni). Manuel/dynamic showcase davranışı DEĞİŞMEZ.
- Ürün seçimi admin'de TODO-159B searchable selector (sponsored campaign editor'da; home section'da değil).

## 6. Search entegrasyonu (ADR-114/115/117)
1. Organik sonuç mevcut motordan (`deps.search`) — DEĞİŞMEZ.
2. `page === 1` ise sponsorlu adaylar AYRI sorgudan (`resolveSponsoredForSearch`).
3. Relevancy kapısı (§1.4) + ProductSearchDocument ACTIVE+hasStock kapısı (§1.7).
4. Dedupe: kampanyalar arası (ürün-tek) + organik-tekrar düşür (§1.3).
5. Slot enjeksiyonu `injectSponsoredSlots` (lead=1, cap=2).
6. **Pagination semantiği**: `totalItems` = ORGANİK sayı (sponsorlu üst-katman ek overlay; organik
   pagination'a dahil DEĞİL). Sponsorlu item'lar `sponsored:true` + `sponsoredToken` taşır. Belgelenir
   (ADR-115).

## 7. Relevancy (§1.4, ADR-116)
exact/normalized keyword eşleşmesi + ürün `searchText`/title minimum relevancy + kategori hedefleme +
kampanya query allowlist (`SponsoredTargetKeyword`). Bidding/ML YOK.

## 8. Event & attribution (ADR-118; TODO-160 altyapısı)
Ölçülen: impression, unique impression, click, CTR, cart, attributed order, gross/refunded/net revenue,
conversion rate. Kurallar: impression yalnız gerçek render'da; bot dışlanır; repeat dedupe; order
attribution yalnız gerçek checkout'tan (sunucu-otoriter); client revenue/orderId belirleyemez; refund
idempotent (append-only defter). Metrik formülleri `computeAttributionMetrics` (yeniden kullanım).

## 9. Store Admin (ADR-089/090 reuse)
Yeni modül `/sponsored-products` (list) · `/sponsored-products/new` · `/sponsored-products/[id]` (detay +
performans). Data Grid (liste) + searchable selector (ürün/kategori). Fonksiyonlar: campaign CRUD, ürün
seçimi, placement, tarih aralığı, priority, query/kategori hedefleme, maxSlots/position, aktif/pasif,
preview, performans dashboard'u. BFF `app/api/sponsored-products/...` → `admin.sponsoredProducts.*`.
Nav: `sales` grubu. i18n: modül-içi `L = {tr,en}` (hafif ekran deseni) + nav etiketi paket i18n'de.

## 10. Dashboard + CSV
Filtreler: tarih, campaign, placement, product, search query/kategori. KPI: impressions, unique
impressions, clicks, CTR, carts, orders, conversion rate, gross/refunded/net revenue (**ROAS ileri faz —
bütçe yok, hesaplama YAPILMAZ; alan hazır**). Tablolar: campaign/product/placement breakdown, top search
terms, günlük seri. CSV export aynı filtrelerle, tenant-safe, CSV injection guard (`csvCell` deseni).

## 11. API + güvenlik
Admin: store admin guard + tenant isolation + server-side pagination + allowlist sort/filter + batch limit
+ ID enumeration koruması. Public: aktif placement resolve (yalnız server), impression/click event
(imzalı token; client campaign/priority/revenue BELİRLEYEMEZ), bot/rate-limit (`createSlidingWindowLimiter`),
cross-store event reddi (token storeId eşitliği). Secret/internal targeting metadata public response'a SIZMAZ
(allowlist projeksiyon).

## 12. Performans + indexler
Aktif kampanya sorgu indexleri (`[storeId, status, placement]`, `[storeId, placement, startsAt, endsAt]`),
keyword `[storeId, keyword]`, event dedupe/analytics indexleri, attribution `[storeId, campaignId, attributedAt]`.
Search request başına sponsorlu sorgu YALNIZ 1. sayfada + bounded (küçük N) → belirgin yavaşlama yok. Aday
çözümü ProductSearchDocument JOIN'i (read-model, hızlı). Migration'da `EXPLAIN` ile doğrulanır.

## 13. Kararlar → ADR eşlemesi
- **ADR-114**: sponsored/organic izolasyon + domain modeli (ayrı tablolar; enjeksiyon organik-sonrası katman).
- **ADR-115**: slot injection policy (search 1. sayfa, lead=1, cap=2; home maxItems; campaign maxSlots; pagination semantiği).
- **ADR-116**: relevancy eşiği + stok/pasif eleme (ProductSearchDocument kapısı).
- **ADR-117**: dedupe (organik-tekrar düşür + kampanyalar-arası ürün-tek).
- **ADR-118**: event attribution (imzalı token, sunucu-otoriter order/refund, bot/dedupe, append-only defter).
- **ADR-119**: campaign priority + timezone (deterministik sıra; UTC instant + display timezone).
- **ADR-120**: influencer + sponsored coexistence (ayrı tablolar, sessiz silme yok).

## 14. Test kapsamı (§13 görev)
Backend: campaign CRUD, tarih/status validation, active window, priority collision, stok/pasif eleme, home
placement, search placement, relevancy threshold, slot density, organic/sponsored dedupe, campaign expiry,
tenant isolation, impression/click dedupe, bot exclusion, order attribution, refund idempotency, dashboard
formulas, CSV injection. Frontend: campaign form, product/category selector, query targeting, preview, Data
Grid, dashboard, loading/empty/error, sponsored badge, home showcase, search sponsored result, accessibility.

## 15. İleri faz sınırı (TD)
CPC/CPM bütçe · keyword bidding · günlük harcama limiti · vendor self-service · otomatik optimizasyon ·
faturalandırma · marketplace açık artırma · Category-PLP/PDP/Cart/Checkout placement · ROAS hesap. TD olarak kaydedilir.

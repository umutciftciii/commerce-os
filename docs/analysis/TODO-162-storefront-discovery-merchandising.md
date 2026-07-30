# TODO-162 — Storefront Discovery & Merchandising — Ön Analiz

**Tarih:** 2026-07-30 · **Faz:** Growth & Monetization · **Öncül:** H-4 (kapandı, PR #142)
**İlgili ADR'ler (bu fazda, önerilen):** ADR-197…ADR-206
**Kapsam ilkesi:** Mevcut Home Experience (TODO-158A/ADR-086), Recently Viewed (TODO-161B/ADR-137…148),
Wishlist/CustomerList (TODO-159D/ADR-093), Campaigns (F4A/ADR-058…062), Sponsored (TODO-161/ADR-114…120)
altyapıları **REUSE** edilir. **Paralel CMS veya ikinci home engine kurulmaz.**

---

## 0. Amaç ve kapsam sınırı

Amazon ana sayfasındaki "slider altı keşif" ritminden **esinlenerek** (görsel kopya DEĞİL) commerce-os
Home Experience'ı davranış-duyarlı, **eligibility-driven** bir keşif yüzeyine dönüştürmek.

Tek cümlelik sözleşme: **Bir section yalnızca gerçek, doğrulanmış kullanıcı/katalog sinyali eşik değerini
karşılıyorsa render edilir; aksi halde DOM'a hiç eklenmez** (boş başlık yok, boş kart yok, spacing yok,
impression yok, ağır hydration yok). Kişiselleştirilmiş section'larda **fallback yasak**.

Kapsam DIŞI (bu faz KOD YOK): yeni kategori kısayol sistemi (mevcut `FEATURED_CATEGORIES` kullanılır),
ML/vector ranking, birlikte-satın-alınanlar (co-purchase) motoru, gerçek-zamanlı kişiselleştirme,
Final Enterprise UI & Design Polish (roadmap'te en son).

---

## 1. Mevcut durum (existing behavior) — doğrulanmış kod haritası

### 1.1 Home Experience (TODO-158A/ADR-086)
- **Model:** `HomeSection` (`packages/db/prisma/schema.prisma:2861`). `type` **String** (enum DEĞİL) →
  **yeni section tipi = migration'sız**; geçerli set yalnız contract + storefront renderer'da allowlist'lenir
  (`packages/contracts/src/index.ts:1559` `homeSectionTypeSchema`; `:3047` `publicHomeSectionSchema`).
  Alanlar: `enabled`, `sortOrder`, `desktopVisible`/`mobileVisible`, `publishStart`/`publishEnd`,
  `config Json` (tip-özel, contract'ta doğrulanır). Guest/auth bayrağı YOK (payload viewer-agnostic).
  Çocuk tablolar: `HomeHeroSlide` (:2895, ctaLabel/ctaHref/targetProductId/targetCategoryId/targetCampaignId),
  `HomeFeaturedCategory` (:2927), `HomeShowcaseProduct` (:2951, yalnız MANUAL).
- **Public BFF:** `GET /public/stores/:storeSlug/home` (`apps/api-gateway/src/server.ts:5256`).
  Viewer-agnostic, auth yok, `Cache-Control` header YOK (her istekte canlı hesap). Section'lar DB
  `sortOrder`'ında; **boş section atlanır** (`RECENTLY_VIEWED` hariç — o her zaman config olarak emit edilir,
  ürünü istemci çözer). Veri otoritesi `apps/api-gateway/src/home/data.ts` (`resolveDynamicShowcase` :646;
  `CAMPAIGN` kuralı :692). Sponsored için `sponsoredData.resolveHomeCandidates`; ürünler tek turda
  `buildPublicProduct` ile projekte edilir (yalnız `status==="ACTIVE"`).
- **Admin BFF:** `apps/api-gateway/src/home/routes.ts` (`requireStoreAdmin`, store-scoped, audit).
  `parseConfigForType` (:86) tip-bazlı config doğrular; **type create'ten sonra IMMUTABLE**.
- **Storefront render:** `apps/storefront-web/app/page.tsx` (`force-dynamic`), `getHome(locale)`
  (`lib/server/catalog.ts:263`, React `cache()`), renderer switch `components/site/home/home-sections.tsx:23`
  (Server Component, DB sırasında). Client island'lar: `hero-slider.tsx`, `recently-viewed-rail.tsx`
  (**geçmiş yoksa yükleme sırasında bile null render → CLS yok**). Boş/hatalı → `HomeFallback` (generic hero +
  gerçek öne çıkan ürünler; vitrin asla boş görünmez).
- **Store Admin UI:** `apps/store-admin-web/app/(app)/home/page.tsx` (liste: enable/disable toggle, ↑/↓ reorder,
  edit, delete; `SectionEditor` modal, type create'te seçilir/edit'te read-only), child detail
  `[sectionId]/page.tsx` (`EntitySelectorField` + `MediaUpload`).

### 1.2 Recently Viewed + Recommendations (TODO-161B/ADR-137…148)
- **`RecentlyViewedProduct`** (`schema.prisma:4264`): `customerId` XOR `visitorHash`, store-scoped, cap 50
  (`RECENTLY_VIEWED_MAX_PER_VISITOR`), dedupe (identity+product tek satır), 90-gün retention worker.
  **Yalnız PDP kaydeder** — client-only tracker `products/[handle]/page.tsx:162` `RecentlyViewedTracker`;
  SSR'de çalışmaz → bot/prefetch/PLP asla tetiklemez. Server gate `recently-viewed-core.ts:32`
  `shouldRecordView` (bot/prefetch/identity/product). Merge-on-login MEVCUT
  (`recently-viewed/data.ts:220` `mergeGuestIntoCustomer`).
- **Similar Products:** saf motor `similarity-core.ts:150` `rankSimilar(anchor, candidates, limit)` —
  anchor-bazlı (cart/purchase DEĞİL), açıklanabilir ağırlıklar, deterministik sort. Katmanlı aday sorgusu
  `recently-viewed/data.ts` (tier 1-4 + fallback tier 5), `status:"ACTIVE", hasStock:true` filtre.
  `SIMILAR_PRODUCTS_MAX_LIMIT=24`.
- **RecommendationEvent** (`schema.prisma:4296`): ölçüm; `source∈{RECENTLY_VIEWED,SIMILAR_PRODUCTS}`,
  `placement∈{HOME,PDP,CART,ACCOUNT}`, `eventType∈{IMPRESSION,CLICK,ADD_TO_CART}`. **`sectionId` kolonu YOK.**
  `event-core.ts:42` `shouldRecordEvent` (bot/prefetch/identity/product). 180-gün retention.
- **EKSİK (inşa edilecek):** cart-bazlı öneri motoru YOK; similar-to-purchased / order-history önerisi YOK.

### 1.3 Cart / Wishlist / Orders
- **Cart:** kalıcı model YOK. `commerce_os_cart` imzalı httpOnly cookie `{variantId, quantity}` (storefront
  domain). Otorite `POST /public/stores/:storeSlug/cart` (`server.ts:5630`); `buildPublicCartIndex`
  (`server.ts:5509`) variant→product + canlı sellable stok (onHand − reserved + expired reclaim).
  **Login'de merge YOK** (cookie cihaz-bağlı, kalıcı). Guest cart == customer cart (tek mekanizma).
- **Wishlist:** `CustomerList`/`CustomerListItem` (`schema.prisma:2555`, WISHLIST=default, partial-unique
  invariant). Guest cookie `commerce_os_wishlist` `{productId}`. Read `GET .../customer/lists`,
  `POST .../wishlist/status`. Merge-on-login MEVCUT (`customer-lists/routes.ts:617`, canlı katalog doğrulama +
  in-batch + idempotent dedupe + cap).
- **Orders:** `Order` (`schema.prisma:1631`) `status∈{DRAFT,PLACED,CONFIRMED,CANCELLED,FULFILLED}`;
  ödeme ayrı `PaymentStatus∈{...,PAID,AUTHORIZED,...}`. Kodun "ödendi" tanımı
  (`orders/sales-summary.ts:70`): `paymentStatus∈{PAID,AUTHORIZED}`. Cancelled/refunded terminal.
  `listOrders` (`customers/index.ts:763`) **filtresiz** tüm statüleri döner, line'larda `productId`/`variantId`.
  **Repurchasable endpoint YOK** — inşa edilecek (`paymentStatus∈{PAID,AUTHORIZED}` AND `status!=CANCELLED`,
  sonra active+in-stock filtre; `buildPublicCartIndex` primitifleri yeniden kullanılır).

### 1.4 Campaigns / Sponsored / Analytics
- **Campaign** (`schema.prisma:2333`): `startsAt/endsAt`, `status∈{DRAFT,ACTIVE,PAUSED,ARCHIVED}`,
  `discountType∈{PERCENT,FIXED_AMOUNT}`, sunum alanları (`displayTitle`, `shortDescription`, `badgeLabel`,
  `cardStyle`, `displayPriority`), `accessModel`+`isPublic` (public gate). **image/CTA/targetRoute Campaign'de
  YOK; tek dil** — editoryal görsel+CTA+TR/EN deseni `HomeHeroSlide`'da yaşar. Junction `CampaignProduct`,
  `CampaignCategory`.
- **Fiyat motoru:** cart para → `campaigns/discount-engine.ts` (`computeDiscounts`, `isWithinWindow`);
  ürün/varyant → `commercial-engine/calculator.ts` (`discountPct`). **"Şu an gerçekten indirimli":**
  `buildPublicVariant` (`server.ts:1974`) `compareAtMinor > priceMinor` → EU-Omnibus `lowestPriceMinor`,
  `currency` taşınır. Public badge evaluator `contracts:7120-7415` (`isBadgeEligible`,
  `campaignAppliesToProduct`, `isCampaignSnapshotDisplayable`).
- `listPublicActiveCampaigns` (`campaigns/data.ts:344`). Kampanyalı ürün sayımı yapı taşı
  `home/data.ts:692` (`CAMPAIGN` rule). **`activeCampaignProductCount` identifier YOK** — yeni.
- **Sponsored** (`schema.prisma:3811`): `SponsoredProductCampaign` (placement `HOME_SHOWCASE`/`SEARCH_RESULTS`),
  `loadActiveCandidates` / `resolveHomeCandidates` (`sponsored/data.ts:662`), active+in-stock filtre
  (`data.ts:377`), agreement gating (`sponsorship/delivery-guard.ts`), `SPONSORED_HOME_MAX_SLOTS=12`,
  token sign/verify, event ingest. **/home'da `SPONSORED_SHOWCASE` olarak zaten bağlı.**
- **Analytics:** generic `AnalyticsEvent`/`trackEvent` YOK. Üç domain event sistemi (RecommendationEvent,
  SponsoredProductEvent, RecentlyViewed yazımı) ortak `hashIdentifier`/`isBotUserAgent`/`isPrefetchRequest`
  primitiflerini paylaşır. **Hiçbir event modelinde `sectionId`/`sectionType`/`eligibilitySource` yok.**

### 1.5 Kimlik / session / merge / cache
- **Guest:** `commerce_os_vid` (httpOnly opaque UUID, storefront proxy'de lazy üretilir) → gateway'e
  `x-visitor-id` → gateway HMAC-SHA256 `visitorHash` (`tracking-core.ts:60`, `SESSION_SECRET`).
  `(storeId, visitorHash)` ile store-scoped. Raw IP/UA persist EDİLMEZ.
- **Customer:** `commerce_os_customer_session` → `x-customer-session` → `resolveCustomerFromRequest`
  (`customers/index.ts:1562`). **customerId server-side türetilir** (client input DEĞİL); storeId mismatch,
  revoked, expired, non-ACTIVE reddedilir.
- **Merge-on-login:** tek orkestratör YOK; iki call-site'tan (`auth-actions.ts` login/register)
  `mergeGuestWishlistAction` + `mergeRecentlyViewedAction`. Cart/coupon cookie ile taşınır (DB merge yok).
  Hepsi store-scoped, cross-store sızıntı yok.
- **Logout:** `revokeSession` + `clearCustomerToken` + `revalidatePath("/","layout")`. `vid`/cart/wishlist
  cookie'leri TEMİZLENMEZ (guest kimliği tasarım gereği kalıcı).
- **Cache:** tüm viewer-facing route `force-dynamic`; gateway proxy fetch'leri `no-store`. Yalnız
  `private, max-age=15` (autocomplete/reviews). **`s-maxage`/CDN/shared-cache header YOK** → viewer-specific
  hydration güvenli, viewer karışması imkânsız.

---

## 2. Mimari karar — public config + viewer-specific hydration ayrımı

Mevcut `RECENTLY_VIEWED` deseninin (contract yorumu `contracts:1566-1569`) **genelleştirilmesi**:

**Katman A — Public `/home` (viewer-agnostic, cacheable-in-principle):**
Tüm section'ların **config/slot**'unu döner. **Fallback izinli / generic** section'lar (DAILY_DEALS,
EDITORIAL_CAMPAIGN, SPONSORED_RAIL, FEATURED_CATEGORIES, hero, manuel/new-arrivals/best-seller rail'leri)
ürünleri sunucuda çözüp gömer (bugünkü davranış). **Kişiselleştirilmiş** section'lar ve **DISCOVERY_GRID**
yalnızca config/slot emit eder — ürün yok, viewer-eligibility kararı yok → payload viewer-agnostic kalır.

**Katman B — Viewer-specific çözümleme (force-dynamic, no-store, asla shared-cache):**
Yeni gateway ucu `POST /public/stores/:storeSlug/home/discovery` — identity header'ları (`x-visitor-id`,
`x-customer-session`) + gerekli minimum girdiyle (cart variantId listesi body'de). Eligibility engine'i
çalıştırır, yalnız **eligible** section'ların içeriğini döner.
- **Discovery Grid** (ilk viewport, §24): storefront `force-dynamic` render'ında **sunucu-tarafı** çözülür
  (identity header'larıyla Katman B çağrısı) → **flash yok**, CLS yok.
- **Fold-altı kişiselleştirilmiş rail'ler** (Cart Recs, Personalized Deals, Wishlist Deals, Repurchase,
  Similar-to-Purchased): **lazy client-island** hydration (RecentlyViewedRail deseni) → ineligible ise
  null render (DOM'a eklenmez).

Bu ayrım §20 (cache/privacy) ve §21 (loading) gereksinimlerini birebir karşılar: customer response
shared-cache'e girmez; `visitorHash` store-scoped; `customerId` client'tan alınmaz; logout sonrası
personalized içerik `revalidatePath` + session yokluğu ile kaybolur.

---

## 3. Eligibility engine (§4, §17, §18) — merkezi server-side resolver

`resolveHomeSectionEligibility(context, sectionConfig)` — **saf/pure** fonksiyon
(`apps/api-gateway/src/home/eligibility-core.ts`, yeni). Katalog/DB'ye erişmez; **sinyal sayılarını**
girdi alır; karar üretir.

**Context (§4):** `storeId`, `visitorHash?`, `customerId?`, `isAuthenticated`, `recentlyViewedCount`,
`cartItemCount`, `wishlistItemCount`, `completedOrderCount`, `recommendationCount`,
`activeCampaignProductCount`, `eligibleSponsoredProductCount`, `locale`, `currency`.

**Sonuç:** `{ eligible: boolean, reason: string, itemCount: number, source: string, fallbackAllowed: boolean }`.
**Public response `reason` DÖNMEZ** (yalnız server-log/debug; §4). Public'e yalnız `eligible` sonucu ve
içerik gider.

**Merkezi min/max invariant (§17)** — kod sabiti (`SECTION_BOUNDS`), admin **düşüremez** min'i:

| sectionType | min | max |
|---|---|---|
| CONTINUE_BROWSING | 2 | 4 |
| CART_RECOMMENDATIONS | 3 | 8 |
| PERSONALIZED_DEALS | 3 | 8 |
| REPURCHASE | 2 | 6 |
| SIMILAR_TO_PURCHASED | 3 | 8 |
| WISHLIST_DEALS | 2 | 6 |
| DAILY_DEALS | 4 | 12 |
| SPONSORED_RAIL | 3 | 8 |
| GENERIC_PRODUCT_RAIL | 4 | 12 |

Admin `config.maxItems` yalnız **max'i düşürebilir** (min eligibility ≤ effectiveMax olmalı; aksi halde
section admin tarafından etkin biçimde devre dışı bırakılır ama min invariant korunur → yani admin max'ı
min'in altına indirirse section **hiç eligible olmaz**, yani gizlenir — sahte "yetersiz ürün" gösterilmez).

**Fallback politikası (§18):**
- **Fallback YASAK:** CONTINUE_BROWSING, CART_RECOMMENDATIONS, PERSONALIZED_DEALS, REPURCHASE,
  SIMILAR_TO_PURCHASED, WISHLIST_DEALS → sinyal yoksa gizlenir.
- **Fallback İZİNLİ:** EDITORIAL_CAMPAIGN, DAILY_DEALS, MANUAL_PRODUCT_RAIL, CATEGORY_RAIL, NEW_ARRIVALS,
  BEST_SELLERS, SPONSORED_RAIL.

---

## 4. Section-by-section tasarım

Her section: **önce eligibility count (ucuz), sonra ürün sorgusu (bounded)** (§21, §24).
`source` = kararın türetildiği sinyal (analytics `eligibilitySource`).

### 4.1 DISCOVERY_GRID (§6) — hero altı
Yeni section tipi. İçinde **kart** taksonomisi: CONTINUE_BROWSING, CART_RECOMMENDATIONS, PERSONALIZED_DEALS,
EDITORIAL_CAMPAIGN, DAILY_DEALS. Her kart kendi eligibility'siyle değerlendirilir; yalnız **eligible** kartlar
grid'e girer. **Grid kuralı:** min 2 / max 4 eligible kart; 1 kart → grid render EDİLMEZ. Kolon: 2→2, 3→3,
4→4; tablet 2×2; mobile tek kolon/yatay carousel. Admin grid içeriğini **sıralayabilir**, eligibility'yi
**değiştiremez**. Storefront force-dynamic'te sunucu-tarafı çözülür (flash yok).

### 4.2 CONTINUE_BROWSING — "Kaldığın Yerden Devam Et" (§7)
- **Kaynak:** yalnız `RecentlyViewedProduct` (PDP view). PLP/recommendation impression sayılmaz (zaten
  yapısal olarak ayrı; §1.2).
- **Eligibility:** ≥2 farklı aktif ürün; inactive + (stok politikası gerektiriyorsa) stok-dışı çıkarılır;
  filtre sonrası ≥2 kalmalı. 0/1 → gizle; 2-4 → göster; 5+ → son 4. Duplicate yok. Guest+auth.
  **Generic ürün fallback YOK.**
- **Reuse:** `recently-viewed/data.ts listHistory` + `filterVisibleInStock` (zaten ACTIVE+hasStock gate).

### 4.3 CART_RECOMMENDATIONS — "Sepetine Göre Öneriler" (§8)
- **Eligibility:** cart'ta ≥1 geçerli ürün; öneri resolver'ı ≥3 uygun sonuç. cart boş / <3 öneri → gizle.
  min 3 / max 8. Cart ürünleri önerilmez; inactive/stok-dışı çıkar. Guest+auth. **Rastgele/popüler
  fallback YOK.**
- **İnşa:** yeni cart-recommendation resolver. Cart line productId/variantId'lerini **anchor kümesi** alır,
  her anchor için `rankSimilar` adaylarını toplar, cart ürünlerini ve duplicate'leri eler, skor birleştirir.
  Cart cookie storefront'ta olduğundan istemci cart variantId'lerini Katman B çağrısında gönderir.

### 4.4 PERSONALIZED_DEALS — "Sana Özel Fırsatlar" (§9)
- **Kaynak önceliği:** (1) Wishlist üründe aktif kampanya, (2) Recently Viewed üründe aktif kampanya,
  (3) Cart kategori/ürünüyle ilişkili kampanya, (4) auth'ta completed-order kategorileri.
- **Eligibility:** ≥1 gerçek kullanıcı sinyali AND ≥3 kampanyalı uygun ürün. Sinyal yoksa gizle. min 3 / max 8.
  Kampanya fiyat motorunda gerçekten geçerli olmalı (`isBadgeEligible` + `isWithinWindow`); expired
  kullanılmaz. **Genel fırsatı "Sana Özel" adıyla gösterme; fallback YASAK.**

### 4.5 DAILY_DEALS — "Günün Fırsatları" (§10)
- **Genel olabilir** (guest+auth). **Eligibility:** ≥4 aktif ve **gerçekten indirimli** ürün
  (`compareAtMinor > priceMinor`, geçerli kampanya tarihleri, currency tutarlı). min 4 / max 12.
  Min sağlanmazsa gizle. `endAt` yoksa geri sayım gösterme. **Sahte indirim/sahte sayaç YASAK.**
- **Reuse:** `buildPublicVariant` sale-check + EU-Omnibus; `listPublicActiveCampaigns`.

### 4.6 EDITORIAL_CAMPAIGN — "Öne Çıkan Kampanya" (§11)
- Editoryal kart: görsel + başlık + kısa açıklama + CTA + hedef route + başlangıç/bitiş + TR/EN.
- **Eligibility:** aktif campaign + geçerli yayın tarihi + görsel mevcut + CTA hedefi aktif.
- **Model kararı:** Campaign'de image/CTA/targetRoute/TR-EN YOK. **Editoryal içerik section `config`'inde**
  tutulur (görsel `mediaId`, `ctaLabelTr/En`, `ctaHref`, `titleTr/En`, `bodyTr/En`, opsiyonel
  `linkedCampaignId` yalnız yayın-penceresi doğrulaması için). Eksik içerikte **fallback üretme; kartı gizle.**
  (Not: DISCOVERY_GRID kartı olarak da kullanılabilir; standalone section olarak da.)

### 4.7 REPURCHASE — "Tekrar Satın Al" (§12)
- **Yalnız auth.** Eligibility: ≥1 completed/paid order AND ≥2 tekrar-alınabilir aktif ürün. min 2 / max 6.
  cancelled/refunded kaynak olamaz. Guest'te render EDİLMEZ. **Fallback YOK.**
- **İnşa:** paid-orders okuma (`paymentStatus∈{PAID,AUTHORIZED}` AND `status!=CANCELLED`), line productId'ler,
  active+in-stock filtre, en son satın alınan sırayla.

### 4.8 SIMILAR_TO_PURCHASED — "Aldıklarına Benzer Ürünler" (§13)
- **Yalnız auth.** Eligibility: ≥1 completed order AND ≥3 uygun similarity sonucu. min 3 / max 8.
  satın alınan aynı SKU'ları gereksiz tekrar etme; inactive/stok-dışı çıkar. **Fallback YOK.**
- **İnşa:** satın alınan productId'ler anchor → `rankSimilar` (mevcut motor), satın alınanları ele.

### 4.9 WISHLIST_DEALS — "Wishlist Fırsatları" (§14)
- Guest wishlist destekleniyorsa guest; auth wishlist varsa customer. Eligibility: wishlist'te ≥2 aktif ürün
  AND ≥1 üründe geçerli kampanya **veya** doğrulanmış fiyat düşüşü. min 2 / max 6.
  **Fiyat değişimi yoksa "fırsat" adıyla gösterme; güvenilir price history yoksa fiyat-düşüşü iddiası üretme.**
  (Price history: `ProductPriceChange` / EU-Omnibus `lowestPriceMinor`, F4B — doğrulanmış kaynak.)

### 4.10 SPONSORED_RAIL — "Sponsorlu Vitrin" (§15)
- **Mevcut sponsorship altyapısı REUSE** (`SPONSORED_SHOWCASE` zaten var; TODO-162 min/max hizalar).
  Eligibility: aktif agreement + aktif campaign + geçerli home placement + ≥3 uygun ürün. min 3 / max 8.
  Açık "Sponsorlu" etiketi + impression/click ölçümü (token). inactive/stok-dışı gösterme; organik rail'i
  tamamen sponsorlu ürünle doldurma. **Kullanıcı sinyali zorunlu değil** (fallback izinli).

### 4.11 FEATURED_CATEGORIES — Category Shortcuts (§16) — REUSE
- **Yeni sistem KURULMAZ.** Mevcut `FEATURED_CATEGORIES` doğrulanır/iyileştirilir: yalnız aktif kategori
  (`listPublishedFeaturedCategories` zaten `category:{status:"ACTIVE"}`), admin sıra, max 8-12, mobile
  horizontal scroll, TR/EN, doğru route, duplicate yok. **Boş kategori gizleme:** mevcut kod yalnız kategori
  ACTIVE bakıyor; **ürün-sayısı>0** koşulu EKLENECEK (aktif-ama-boş kategori kısayolu gösterilmemeli).

---

## 5. Page-level dedupe (§19)
`apps/api-gateway/src/home/dedupe-core.ts` (yeni, saf). Sıralı çözümde bir `seen: Set<productId>` taşınır:
- Discovery Grid ürünleri sonraki ilk iki rail'de tekrarlanmaz.
- Cart Recommendations cart ürünlerini içermez.
- Aynı ürün aynı section'da duplicate olmaz.
- Sponsored ürün görünümü bounded (max slot).
- **Dedupe sonrası min bozulursa section gizlenir; min'i tamamlamak için ilgisiz ürün EKLENMEZ.**

---

## 6. Analytics (§22) — yeni bounded event modeli
Mevcut RecommendationEvent'te `sectionId`/`sectionType`/`eligibilitySource` yok ve eventType kümesi dar.
Domain-özel event store deseni (RecommendationEvent, SponsoredProductEvent ayrı) izlenerek **yeni**
`HomeDiscoveryEvent` modeli (**additive migration**):
- Alanlar: `storeId`, `customerId?`, `visitorHash?`, `sessionHash?`, `sectionId`, `sectionType`,
  `eligibilitySource`, `eventType∈{SECTION_IMPRESSION,CARD_IMPRESSION,PRODUCT_CLICK,CTA_CLICK,ADD_TO_CART}`,
  `productId?`, `campaignId?`, `sponsoredCampaignId?`, `placement`, `dedupeKey?`, `createdAt`.
- **Yalnız render edilen section event üretir**; eligibility false → impression YOK. Bot/prefetch exclusion
  (ortak `isBotUserAgent`/`isPrefetchRequest` REUSE). Tenant isolation (`storeId` her index'te; cross-store
  productId reddi). Sponsored kartları AYRICA mevcut `SponsoredProductEvent` token ölçümünü kullanır
  (çift ölçüm değil — sponsored için otoritatif olan SponsoredProductEvent; HomeDiscoveryEvent yalnız
  section-seviyesi funnel için).
- Retention worker (mevcut TODO-161A.1 desenli; `RETENTION_TABLE_SPECS` allowlist'ine additive giriş).

---

## 7. Guest/authenticated + merge + logout (§5)
- **Guest kaynakları:** `visitorHash` (store-scoped), guest cart cookie, guest wishlist cookie (varsa),
  recently viewed, session recommendations, genel kampanyalar. Raw IP/PII YOK.
- **Auth kaynakları:** customer cart, wishlist, recently viewed, completed orders, recommendations,
  campaign/coupon eligibility.
- **Login merge:** MEVCUT merge'ler REUSE — recently viewed (dedupe, en yeni viewedAt korunur), wishlist
  (mevcut ürün kararı), cart (cookie kalıcı). **Cross-store merge yok.** Merge sonrası eligibility yeniden
  hesaplanır (bir sonraki render'da otomatik; state yok).
- **Logout:** `revalidatePath` + session yokluğu → customer-specific section'lar kaybolur; guest kimliğiyle
  (vid) yalnız guest-uygun section'lar kalır; önceki kullanıcı verisi görünmez (server-side identity;
  client'ta customer verisi tutulmaz).

---

## 8. Performans / lazy hydration (§24)
- **İlk viewport:** Hero + Discovery Grid + Category Shortcuts + ilk rail (Discovery Grid sunucu-tarafı,
  flash yok).
- Fold-altı section'lar **lazy hydrate** (section-level Suspense / IntersectionObserver island).
- Bounded sorgular (eligibility count → limit'li ürün sorgusu). N+1 yok (batched cover/campaign, mevcut
  `buildPublicProduct` deseni). Hidden section için ürün detayları hydrate EDİLMEZ. CLS üretme.
  Viewer-specific resolver tüm geçmişi çekmez — yalnız gerekli son N kayıt (cap'li read).

---

## 9. Responsive / accessibility (§25)
375 / 768 / 1024 / 1440 doğrulanır. Keyboard erişimi, visible focus, doğru heading hiyerarşisi (h2 section
başlıkları), carousel `aria-label`/`aria-roledescription`, `prefers-reduced-motion`, nested-link hatası yok
(kart tek `<a>`), yalnız-renkle-durum yok, tutarlı kart yükseklikleri, fiyat/CTA taşması yok.

---

## 10. Migration (§26) — additive, minimum
- **`HomeDiscoveryEvent`** modeli + index'ler (analytics). Additive.
- Yeni section tipleri **String allowlist** → **migration YOK**.
- Eligibility bounds **kod sabiti**; admin max + guest/auth support + fallback bayrağı **section `config` Json**
  → **migration YOK**.
- Repurchase/similar-to-purchased/cart-recs/personalized/wishlist-deals çözümleri **mevcut modelleri okur**
  → yeni tablo YOK.
- Retention allowlist girişi (HomeDiscoveryEvent) additive.
- Applied migration immutable.

---

## 11. Testler (§27, özet)
Eligibility (threshold altı/eşit/üstü, filtre sonrası min-altı, inactive/stok-dışı, duplicate, no-signal,
guest/auth, cross-store) · Continue Browsing (0→hidden,1→hidden,2→visible,4→visible,5→son 4, PDP-dışı
sayılmaz) · Cart Recs (empty→hidden, 2→hidden, 3→visible, cart-ürünü-önerilmez, guest/auth) ·
Personalized Deals (no-signal→hidden, yalnız-genel-kampanya→hidden, sinyal→visible, expired→hidden) ·
Auth lifecycle (guest history, login merge, auth history, logout isolation, cache leak yok) · UI (eligible
render, ineligible DOM'da yok, boş başlık/spacing yok, loading, responsive, a11y, TR/EN) · Analytics
(impression, click, add-to-cart, hidden-section event üretmez, bot exclusion, tenant isolation).

---

## 12. Canlı smoke (§28, özet) — enterprise-demo
Guest no-signal / Guest Recently Viewed (1→gizli, 2→görünür, 5→son 4) / Guest Cart (3 öneri eşik) /
Auth geçmiş-yok / Auth order-history (Repurchase, Similar-to-Purchased) / Login merge / Logout isolation /
Daily Deals threshold / Editorial Campaign / Sponsored label / TR-EN / responsive / analytics / cache
privacy / tenant isolation. Geçici fixture'lar temizlenir.

---

## 13. Kararlar (ADR'ler — önerilen, ADR-197…ADR-206)
- **ADR-197** Eligibility-driven sections (render-only-if-eligible; boş başlık/spacing/impression yok).
- **ADR-198** Guest/authenticated context ayrımı (visitorHash vs server-derived customerId; raw IP/PII yok).
- **ADR-199** Merkezi min-threshold invariant (kod sabiti; admin yalnız max düşürür, min düşüremez).
- **ADR-200** No-fallback personalization (kişiselleştirilmiş section'da fallback yasak; generic'te izinli).
- **ADR-201** Guest→customer merge reuse (recently viewed + wishlist; cart/coupon cookie; cross-store yok).
- **ADR-202** Viewer-specific hydration (public config + Katman B force-dynamic/no-store; shared-cache yok).
- **ADR-203** DISCOVERY_GRID section tipi + kart taksonomisi + 2-4 kart grid kuralı.
- **ADR-204** Page-level dedupe (seen-set; min bozulursa gizle, ilgisiz ürün ekleme).
- **ADR-205** Hidden-section analytics + `HomeDiscoveryEvent` bounded event modeli (bot/prefetch exclusion).
- **ADR-206** Performance/lazy hydration (ilk viewport sunucu-tarafı Discovery Grid; fold-altı lazy).

---

## 14. Sıra (bu faz)
1. Eligibility engine (saf) + SECTION_BOUNDS + contract allowlist genişletmesi.
2. Viewer-specific resolver + Katman B endpoint + repurchase/similar-to-purchased/cart-recs/personalized/
   wishlist-deals/daily-deals veri erişimi.
3. DISCOVERY_GRID + storefront renderer + lazy island'lar + Category Shortcuts boş-kategori fix.
4. HomeDiscoveryEvent migration + analytics ingest + retention.
5. Store Admin yönetimi + preview (etiketli örnek veri).
6. Testler → gate → canlı smoke → docs/ADR. **Commit YOK (§31).**

---

## 15. TD-149 uygulaması — Katman B viewer-specific resolver (CANLI, 2026-07-30)

Katman B **uygulandı ve enterprise-demo'da canlı doğrulandı** (TD-149 CLOSED).

**Uç:** `POST /public/stores/:storeSlug/home/discovery` (server.ts). Kimlik server-türevi (customer session →
store-scoped visitorHash); gövde yalnız güvenli public context (`locale`, `currency?`, `cartItems[{variantId,qty}]`,
`wishlistProductIds[]` guest, `seenProductIds[]`) — `.strict()` şema customerId/storeId/eligibility/config override'ı
REDDEDER. `Cache-Control: private, no-store` + `Vary`. Yanıt yalnız eligible section + public-safe projeksiyon
(`reason`/customerId/visitorHash/iç config/cost SIZMAZ).

**Akış (§4):** kimlik → cart index (server-authoritative) → ucuz sinyal sayaçları → published discovery section'ları
(DB sırası) → Pass 1 ham aday id'leri (yalnız signal-gate geçenlerde) → Pass 2 union'u TEK projeksiyon
(`buildPublicProduct`, ACTIVE+stok+kampanya+lowest — yeni fiyat/stok hesabı YOK) → Pass 3 DB sırasında dedupe
(seen-set) + eşik-tekrar + public çıktı. DAILY/PERSONALIZED/WISHLIST için "gerçekten indirimli" süzgeci
(kampanya badge veya compareAt>price).

**Modüller:** `home/discovery-core.ts` (saf orchestration: signal-gate + dedupe + finalize; 12 test) ·
`home/discovery-data.ts` (bounded data-access, mevcut recently-viewed/similarity/sponsored/campaign/wishlist/orders
REUSE) · contracts `publicHomeDiscoveryRequest/Response` + config şemaları.

**Canlı smoke (fixture'lar oluşturulup temizlendi):** guest 13/13 · DISCOVERY_GRID columns=3 / 1-kart→gizli ·
REPURCHASE izole 3 (auth-only) · SIMILAR_TO_PURCHASED 8 · PERSONALIZED_DEALS 5 (no-signal→gizli) · WISHLIST_DEALS 4
(1→gizli, non-discounted→gizli) · page-level dedupe · cache privacy · cross-store 404/session reddi. Defect (smoke'da
bulundu+düzeltildi): `discoverySections` filtresi DISCOVERY_GRID'i eliyordu.

**Kalan (TODO-162 devam):** storefront UI (TD-150) · analytics ingest+retention (TD-151) · store-admin+preview (TD-152).

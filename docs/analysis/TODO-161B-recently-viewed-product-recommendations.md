# TODO-161B — Recently Viewed & Product Recommendations — Ön Analiz

**Tarih:** 2026-07-27 · **Faz:** Growth & Monetization · **Öncül:** BUG-PDP-001 (kapandı)
**İlgili ADR'ler (bu fazda):** ADR-137…ADR-143

## 0. Amaç ve kapsam sınırı

İki AYRI capability, tek fazda ama **birbirinden bağımsız** kurulur:

1. **Recently Viewed** — kullanıcının/visitor'ın gördüğü ürünlerin güvenli, sunucu-tarafı, KVKK-uyumlu kaydı.
2. **Similar Product Recommendations** — geçmişten BAĞIMSIZ, ürün-benzerliği tabanlı açıklanabilir öneri motoru.

Influencer (TODO-160), sponsored (TODO-161) ve finansal attribution (TODO-161A) domainleriyle **BİRLEŞTİRİLMEZ**:
- yalnız SAF/pure yardımcılar paylaşılır (`hashIdentifier`, `isBotUserAgent`, `createSlidingWindowLimiter`,
  `computeCutoff`, `isCircuitBreakerTripped`, advisory-lock, QueueJobLog);
- domain tabloları AYRI (`RecentlyViewedProduct` yeni ve yalnız bu faza ait); sponsored/influencer/finans
  tablolarına YAZILMAZ; retention allowlist'i (ADR-133 `RETENTION_TABLE_SPECS`) DEĞİŞTİRİLMEZ.

İleri faz (bu fazda KOD YOK): Birlikte Görüntülenenler, Birlikte Satın Alınanlar, Personalized Home,
ML/vector ranking, real-time personalization.

## 1. Mevcut durum (existing behavior)

- **Recently Viewed backend YOK.** Repoda `RecentlyViewed`/`ProductView`/`ViewHistory` modeli yok; yalnız
  i18n metinleri var: `packages/i18n/src/locales/{tr,en}/storefront.ts` → `related.recentlyViewedTitle`
  ("Son baktıklarınız" / "Recently viewed") + `related.recentlyViewedBody`. Veri yolu / kayıt / UI YOK.
- **Similar Products KISMEN var (statik):** PDP'de `detail.related` (`StorefrontProductSummary[]`)
  `app/products/[handle]/page.tsx:237-249`'te `StorefrontProductCard` grid'iyle render ediliyor; başlık
  `dict.related.title` = "Benzer ürünler". Ama gerçek benzerlik motoru YOK — related listesi katalog
  DTO'sundan basitçe geliyor. Bu fazda açıklanabilir bir motorla değiştirilecek.
- **Guest visitor kimliği zaten var:** `commerce_os_vid` (httpOnly, opaque, ~1yr) cookie sponsored akışında
  (`apps/storefront-web/app/api/sponsored/event/route.ts`) üretiliyor ve gateway'e `x-visitor-id` header'ıyla
  iletiliyor. Bunu **birebir yeniden kullanıyoruz** (yeni cookie yok).
- **Customer session:** `commerce_os_customer_session` cookie → gateway'e `x-customer-session` header;
  gateway `resolveCustomerFromRequest` ile çözer (`apps/api-gateway/src/customers/index.ts:1559`).
- **Store çözümü:** slug path param (`/public/stores/:storeSlug/...`), host-header multitenancy YOK;
  `resolvePublicStore(slug)` (`server.ts:4933`) → yalnız `status===ACTIVE` store.
- **Search read-model:** `ProductSearchDocument` (yalnız ACTIVE ürün) + `ProductFacetValue` (filtrelenebilir
  attribute değerleri) worker ile senkron tutulur (`services/search-service/src/data.ts`). Benzerlik adayları
  ve kart hidrasyonu buradan gelir (ikinci DB turu yok; `listing` JSON kart snapshot'ı içerir).
- **Retention altyapısı (TODO-161A.1):** `apps/api-gateway/src/commercial-automation/` —
  advisory-lock (dağıtık pg session lock, `connection_limit=1`), `QueueJobLog` (migration'sız), pure
  cutoff+circuit-breaker, dry-run/apply, setTimeout-zinciri worker. SAF kısımları yeniden kullanılır.

## 2. Recently Viewed veri modeli

```prisma
model RecentlyViewedProduct {
  id           String   @id @default(cuid())
  storeId      String
  customerId   String?      // authenticated kimlik
  visitorHash  String?      // guest kimlik (HMAC türetilmiş, HAM visitorId/IP DEĞİL)
  productId    String
  lastViewedAt DateTime @default(now())
  viewCount    Int      @default(1)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  store    Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: Cascade)
  product  Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([storeId, customerId, lastViewedAt])
  @@index([storeId, visitorHash, lastViewedAt])
  @@index([productId])
}
```

**Migration'da raw SQL ile eklenenler (Prisma `@@unique` NULL-distinct semantiği guest satırları dedupe
etmez — bu yüzden kısmi unique index; TD-101 deseni):**
- `UNIQUE (storeId, customerId, productId) WHERE customerId IS NOT NULL`
- `UNIQUE (storeId, visitorHash, productId) WHERE visitorHash IS NOT NULL`
- `CHECK ((customerId IS NOT NULL)::int + (visitorHash IS NOT NULL)::int = 1)` — tam olarak bir kimlik.

**Kurallar:**
- Aynı kimlik (customer VEYA visitor) + product için TEK kayıt (kısmi unique index).
- Tekrar görüntülemede `lastViewedAt=now`, `viewCount+=1` (upsert; P2002-yakala-yeniden-oku deseni).
- Store isolation: her sorgu `storeId` scope'lu; `onDelete: Cascade`.
- **Ham IP/UA saklanmaz.** Guest kimliği `visitorHash = hashIdentifier(visitorId, SESSION_SECRET)`
  (salted HMAC-SHA256 hex; `tracking-core.ts:60`). Cookie'deki `visitorId` opaque; DB'ye hash yazılır.
- **Bot/preload/prefetch sayılmaz:** `isBotUserAgent(ua)` (tracking-core.ts:83) + `Sec-Purpose`/`Purpose`/
  `X-Moz` = `prefetch`/`preload` header kontrolü (yeni, sıfırdan) → kayıt yapılmadan `200 {recorded:false}`.
- **Maksimum geçmiş:** kimlik başına en fazla `RECENTLY_VIEWED_MAX_PER_VISITOR` (varsayılan 50). Write
  yolunda upsert sonrası fazlalık (rank>50, lastViewedAt DESC) silinir → tablo her zaman bounded.
- **Hidrasyon eleme:** pasif (`status!=ACTIVE`) / silinmiş (satır yok) / **stok dışı** (`hasStock=false`)
  ürünler `ProductSearchDocument` join'inde otomatik elenir (yalnız ACTIVE+inStock kart döner). HAM history
  satırı SİLİNMEZ — ürün geri gelirse yeniden görünür.
- **Görüntüleme PDP render'ını BLOKLAMAZ:** kayıt istemci-tarafı `useEffect` beacon'ı (keepalive/sendBeacon,
  best-effort, hata yutulur), SSR DEĞİL. Sunucu ucu hızlı (tek upsert + prune).

## 3. Guest ve authenticated davranışı + merge

- **Guest:** first-party imzalı `commerce_os_vid` (BFF, httpOnly). PII yok. Sunucu-tarafı history
  `visitorHash` ile tutulur (localStorage TEK otorite DEĞİL — sunucu otoritedir).
- **Authenticated:** `customerId` üzerinden sunucu-tarafı history.
- **Login/register sonrası merge** (BFF orchestrate eder, wishlist merge deseni birebir):
  `POST /public/stores/:slug/recently-viewed/merge` — `x-customer-session` + `x-visitor-id` zorunlu.
  Sunucu, visitorHash satırlarını customer satırlarıyla **idempotent** birleştirir:
  - aynı product → tek kayda düşer; `lastViewedAt = max(...)`; `viewCount = min(cap, customer+guest)`;
  - guest-özel satırlar customer'a taşınır (visitorHash→customerId), çakışan siler;
  - merge sonrası guest history satırları temizlenir; BFF `commerce_os_vid` cookie'sini **yalnız
    `result.ok` ise** rotate/temizler (HTTP hatasında korunur, sonraki session'da retry).
  - cap (50) merge sonrası da uygulanır.

## 4. Retention ve gizlilik

- **Başlangıç retention:** 90 gün (`RECENTLY_VIEWED_RETENTION_DAYS`, alt sınır 1), max ürün 50
  (`RECENTLY_VIEWED_MAX_PER_VISITOR`).
- **Kullanıcı geçmişini temizleyebilir:** `DELETE /public/stores/:slug/recently-viewed` (customer VEYA
  visitor scope).
- **Account deletion / KVKK:** `RecentlyViewedProduct` Customer/Store'a `onDelete: Cascade` → müşteri
  silinince otomatik gider; store-scope purge de mevcut.
- **Finansal OrderLine snapshot'ları etkilenmez** (ayrı tablo; retention yalnız bu tabloyu budar).
- **Cross-store merge YOK** (her satır `storeId` scope'lu; merge yalnız aynı store).
- **Bot / internal healthcheck kayıt üretmez** (UA + prefetch guard).
- **Zamanlanmış retention:** TODO-161A.1 altyapısı yeniden kullanılır ama AYRI servis/worker
  (`recently-viewed/retention-*`): advisory-lock singleton + QueueJobLog (queueName `recently-viewed`,
  jobName `recently-viewed-retention`) + pure `computeCutoff`/`isCircuitBreakerTripped`. İki adım: (a)
  `lastViewedAt < cutoff` batch DELETE, (b) kimlik başına rank>cap güvenlik re-prune. `..._ENABLED=false`
  varsayılan (env gate); dry-run varsayılan, apply explicit. `RETENTION_TABLE_SPECS` allowlist'ine
  DOKUNULMAZ.

## 5. Similar Products motoru (MVP, açıklanabilir)

**Sinyaller ve örnek ağırlıklar (ADR-140'ta netleşir):**

| Sinyal | Ağırlık | Not |
|---|---|---|
| Aynı alt kategori (`primaryCategoryId` eşit) | 40 | parent match ile karşılıklı dışlayan |
| Aynı üst kategori (parent eşit, alt farklı) | 18 | |
| Aynı marka (`brand` eşit, non-null) | 25 | |
| Aynı salesMode | 8 | |
| Fiyat yakınlığı | 0–15 | yalnız aynı `currency`; lineer azalım `1 - min(1,|a-c|/max(a,1))` |
| Ortak dinamik attribute değeri | her biri 6, cap 18 | `ProductFacetValue` `(attributeDefinitionId:optionId)` |

**Sert filtreler (skora girmez, adaydan eler):** aynı store, `status=ACTIVE`, `hasStock=true`, anchor'ın
kendisi hariç, duplicate yok.

**Aday sorgusu — KATMANLI DB-seviyesi daraltma (ADR-142 revize; pre-ship hardening):** tek OR-sorgu + global
`createdAt LIMIT` YERİNE, her biri kendi sinyal-hedefli bounded sorgusu olan katmanlar (`ProductSearchDocument`,
sert filtre storeId+ACTIVE+hasStock+anchor-hariç): (1) aynı alt kategori · (2) aynı üst kategori (kardeş
kategoriler; adjacency-list) · (3) aynı marka + fiyat bandı [0.5x,2x] · (4) ortak facet (`ProductFacetValue`
index'i) · (5) fallback (yalnız birleşim <24 ise store-geneli en yeni). **Per-tier kota** `SIMILAR_PER_TIER=120`
→ tek sinyal global cap'i (`SIMILAR_MAX_CANDIDATES=400`) doldurup diğerlerini dışlayamaz → ilgisiz ilk-N sonucu
bozmaz + katalog-sonundaki ilgili aday yine bulunur. Additive index `ProductSearchDocument(storeId, brand)`
(Tier 3; `EXPLAIN` doğrulandı). Skorlama uygulamada (SAF), deterministik: **score DESC → createdAt DESC → id ASC**.
Ortak-attribute + salesMode + parent kategori yalnız BOUNDED birleşim için batch okunur (N+1 yok).

**İzolasyon (kritik):**
- Sponsored priority skora KARIŞMAZ — `injectSponsoredSlots` ÇAĞRILMAZ; sponsored motoru dokunulmaz.
- Organik search ranking DEĞİŞMEZ — `search-query.ts` DEĞİŞMEZ; bu ayrı bir uçtur.
- Farklı store ürünleri karışmaz (storeId scope).
- Sonuç bounded (varsayılan 8, max 24) ve deterministic.

## 6. Öneri yüzeyleri (MVP)

- **PDP → "Benzer Ürünler":** mevcut statik `detail.related` grid'i, yeni `/similar` ucuna bağlı client
  island `SimilarProducts` ile değiştirilir (skeleton/empty/error; mevcut ürün gösterilmez; canonical
  `StorefrontProductCard`; mobil yatay kaydırma + desktop grid).
- **Home → "Son İncelediklerin":** storefront Home sayfasında, mevcut Section/kart bileşenlerini kullanan
  `RecentlyViewed` client island; recently-viewed API'sinden beslenir; geçmiş yoksa render edilmez.
  **Karar (ADR-141):** CMS-yönetimli `HomeSection` tipi YAPILMAZ (kişiselleştirme + cache + her-zaman-açık
  doğası); `/home` sözleşmesi viewer-özel veriyle kirletilmez. "Ayrı paralel home engine" değil — tek sabit
  section, aynı görsel dil.
- **Account → görüntüleme geçmişi:** yeni `/account?section=viewHistory` bölümü; temizle butonu; tarih
  sıralaması; bounded liste.
- **Cart → düşük yoğunluklu blok:** yalnız son incelenenlere benzer/son incelenenler; sepetteki ürünler
  gösterilmez; checkout akışı bozulmaz.

## 7. API (public/customer)

Tümü `/public/stores/:storeSlug/...`; server-side store resolution; imzalı visitor kimliği; rate limit;
bot+prefetch exclusion; tenant isolation; batch hydration; deleted/passive/out-of-stock leak yok. İstemci
fiyat/metadata otoritesi DEĞİL (kartlar read-model snapshot'ından).

- `POST .../recently-viewed` — view kaydı. Body `{ productId }`. Bot/prefetch → `{recorded:false}`.
- `GET  .../recently-viewed?limit=` — hidratlanmış liste (identity: visitor VEYA customer).
- `DELETE .../recently-viewed` — geçmişi temizle.
- `POST .../recently-viewed/merge` — guest→customer idempotent merge.
- `GET  .../products/:productId/similar?limit=` — benzer ürünler (kimlik gerekmez).

## 8. Storefront UI

- BFF proxy route'ları (`app/api/recently-viewed/route.ts`): `commerce_os_vid` okur/üretir, `x-customer-session`
  + `x-visitor-id` + `user-agent` + `x-forwarded-for` iletir; gateway URL server-only.
- Client island'lar: `RecentlyViewedTracker` (PDP mount beacon), `SimilarProducts` (PDP), `RecentlyViewed`
  (Home/Cart), `ViewHistorySection` (Account). Canonical `StorefrontProductCard`; `Section`/`Container`;
  `ProductCardSkeleton`; carousel pattern (`home-sections.tsx` markup). Mevcut design kit korunur; yeni i18n
  anahtarları TR+EN eşit şekilde eklenir.

## 9. Event ve ölçüm

MVP'de karmaşık attribution YOK. Yüzeyler hazırlıklı: kart `sponsoredToken` yolu değişmez; ileride
impression/click/add-to-cart/conversion + source + placement eklenebilir. TODO-160 SAF event yardımcıları
(pure) yeniden kullanılabilir; **influencer/sponsored tablolarına YAZILMAZ.**

## 10. Performans / index

- `@@index([storeId, customerId, lastViewedAt])`, `@@index([storeId, visitorHash, lastViewedAt])`,
  `@@index([productId])`; kısmi unique index'ler (kimlik+product).
- Similarity adayları: `ProductSearchDocument` hazır index'leri (`storeId,primaryCategoryId`,
  `storeId,hasStock`, `storeId,productCreatedAt`) + `ProductFacetValue` `(storeId,attributeDefinitionId,
  optionId)`. Aday sorgusu bounded (LIMIT cap); skorlama uygulamada. 471 ürün ve 50k+ katalog varsayımında
  tüm katalog belleğe ALINMAZ.
- N+1 yok: kart hidrasyonu read-model `listing` snapshot'ından; facets/salesMode yalnız bounded aday
  kümesi için batch. Cache invalidation: read-model worker ile senkron (ürün değişince reindex).

## 11. Testler (özet)

- **Recently Viewed (pure + data + routes):** guest view, auth view, repeat update, max 50 prune, 90-gün
  cutoff, guest→customer merge, duplicate merge, clear, bot exclusion, preload exclusion, deleted/passive/
  out-of-stock hydration eleme, tenant isolation, rate limit.
- **Similar (pure similarity-core + data):** same category, same brand, price proximity, shared attributes,
  deterministic score, current product exclusion, duplicate prevention, stock/passive exclusion, fallback,
  cross-store isolation, bounded result.
- **Frontend (jsdom):** PDP similar, Home recently-viewed, Account history, clear, Cart block,
  loading/empty/error, mobile/desktop, TR/EN, a11y.

## 12. Canlı doğrulama (enterprise-demo)

16 adımlık smoke: 5 ürün görüntüle → sıra → tekrar aç → üste taşı → login merge → duplicate yok → account
history → temizle → PDP benzer → anchor hariç → stok dışı önerilmez → kategori/marka sinyalleri → home
recently-viewed → cart block → cross-store izolasyon → 91-günlük kaydı retention temizler → test verisi
temizlenir.

## 13. Kararlar (ADR'ler)

- **ADR-137** — Recently Viewed identity: dual-key (customerId | visitorHash), kısmi unique index, CHECK.
- **ADR-138** — Guest→customer idempotent merge + cookie rotation.
- **ADR-139** — Retention: 90 gün + max 50 cap; TODO-161A.1 SAF altyapı reuse, ayrı domain/worker,
  allowlist dokunulmaz.
- **ADR-140** — Similarity scoring: açıklanabilir ağırlıklı skor + deterministik sıralama.
- **ADR-141** — Recommendation/source isolation: sponsored/organik dokunulmaz; Home recently-viewed CMS
  section DEĞİL (gerekçe).
- **ADR-142** — Similarity fallback tiers (subcategory→parent→brand→newest).
- **ADR-143** — Performance boundaries: read-model-only aday, bounded scan cap, N+1 yok.

## 14. Sıra

TODO-161B tamamlanınca sıradaki aktif faz: **Final enterprise UI/design polish** (bu fazda kod YOK).

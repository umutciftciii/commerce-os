# TODO-159D — Customer Lists & Wishlist — Ön Analiz

> Durum: analiz + tasarım kararları. Uygulama bu belgedeki kararlara göre yapılır.
> İlgili ADR: **ADR-093**. Roadmap: `docs/ROADMAP.md` (Customer Lifecycle bölümü).

Bu faz favori (wishlist) ve alışveriş listelerini **iki ayrı sistem olarak değil**, ortak ve
tenant-safe bir `CustomerList` altyapısı üzerine kurar. Wishlist, `type = WISHLIST` olan tek bir
varsayılan listedir; alışveriş listeleri `type = SHOPPING_LIST` olan kullanıcı-tanımlı listelerdir.

---

## 1. Mevcut durum tespiti (kod incelemesi)

### 1.1 Favori ikonları şu anda yalnız görsel mi? → EVET, tamamen MOCK

Storefront'ta üç canlı product-card varyantı var; ikisinde kalp ikonu var ve **hiçbiri persist etmiyor**:

- `StorefrontProductCard` — `apps/storefront-web/components/site/product-card.tsx:23`
  (Home, Home showcase, PDP benzer-ürünler). Satır 30: `const [saved, setSaved] = useState(false); // MOCK`.
  `HeartIcon` yerel SVG (`:229-241`); `aria-pressed={saved}` zaten var ama backend karşılığı YOK.
- `SearchProductCard` — `apps/storefront-web/components/search/search-product-card.tsx:27` (PLP grid).
  Aynı MOCK desen; kalp butonu `<a>` içine değil sarmalayıcı `div` içine konmuş (interactive nesting).
- Site header kalbi — `apps/storefront-web/components/site/site-header.tsx:108` → `/account?section=favorites`
  (dekoratif link, state yok).
- BuyBox favori yer tutucu — `apps/storefront-web/components/buy-box.tsx:337-342` (düz metin, buton yok).
- `ProductCard` (`components/ui/product-card.tsx`) ve `components/product-card.tsx` — canlıda ÖLÜ
  (yalnız test; TD-087). Bunlara dokunulmaz.
- Account "favorites" ve "lists" bölümleri — `app/account/page.tsx:125-128` — ikisi de bugün boş
  `<Placeholder>`. Bölüm enum'u, sidebar linki ve header menüsü ZATEN scaffold'lu (kolay bağlanır).

### 1.2 Customer account altyapısı hangi seviyede? → OLGUN (oturum-tabanlı, üretimde)

- Kimlik: `x-customer-session` header (opak, server-to-server). Gateway'de
  `resolveCustomerFromRequest(request, storeId, deps)` (`apps/api-gateway/src/customers/index.ts:1558`),
  `requireCustomer` (`:1594`), `requireStore` (`:1584`). JWT YOK; raw token DB'de tutulmaz (sha256 hash).
- Storefront cookie `commerce_os_customer_session` (`lib/server/customer-cookie.ts`), httpOnly, 30 gün.
  `getCurrentCustomer()` (`lib/server/customer.ts:26`); `customerBasePath()` = `/public/stores/${slug}/customer`.
- Gateway fetch sarmalayıcı `lib/server/gateway.ts`: `getCustomer<T>(path, token)` / `sendCustomer(...)`,
  `customerHeaders` → `x-customer-session`. Server-only, NEXT_PUBLIC değil.
- Account rota deseni: `/account?section=` switcher (tek sayfa) + Siparişlerim için ayrı detay rotası
  (`app/account/orders/[orderNumber]/page.tsx` — `getCurrentCustomer()` guard + `notFound()`).
- Şablon: Kuponlar bölümü uçtan uca hazır (`lib/server/coupons.ts` → `getCouponCenter()` →
  `components/account/sections/coupons-section.tsx`). Yeni liste UI'ı bunu birebir aynalar.

### 1.3 Guest kullanıcı nasıl tanımlanıyor? → Sunucu-tarafı guest kimliği YOK

Guest için kalıcı bir sunucu kaydı/id yoktur. Guest durumu **imzalı httpOnly cookie**'lerde yaşar:

- Sepet: `commerce_os_cart` (`lib/server/cart-cookie.ts:18`), HMAC-SHA256 imzalı, **yalnız
  `{variantId, quantity}` referansı** taşır (fiyat/başlık/stok ASLA). Secret `STOREFRONT_CART_SECRET`.
- Kupon guest cüzdanı: `commerce_os_claimed_coupons` (maks. 20, dedup+cap; `cart-cookie.ts:148-179`).

→ Wishlist guest deposu da **yeni bir imzalı cookie** (`commerce_os_wishlist`) olur; yalnız
`{productId}` (opsiyonel `variantId`) taşır, maks. kayıt sınırlı.

### 1.4 Cart merge yaklaşımı listeler için yeniden kullanılabilir mi? → Kısmen

**Önemli:** Sepet %100 cookie-tabanlı ve sunucuda STATELESS'tir — sunucu-tarafı "customer cart" tablosu
YOKTUR, dolayısıyla login'de sepet merge'i yoktur (guest cookie login sonrası hayatta kalır ve müşteri
token'ıyla yeniden çözülür).

Yeniden kullanılabilir gerçek **guest→customer merge deseni = KUPON CÜZDANI**:
- Union at resolve time: `loadCartWalletCandidates` (`server.ts:5352`) DB cüzdan girişlerini (login) +
  cookie claimed kodlarını (guest) sunucuda birleştirir.
- Idempotent kalıcı merge: `upsertClaim` (`campaigns/wallet-data.ts:221`) compound unique
  (`storeId_couponId_customerId`) üzerinden; mevcut USED/REVOKED satırı AVAILABLE'a diriltilmez (durum korunur).

→ Wishlist guest merge bu deseni aynalar (sepeti DEĞİL): login'de guest cookie öğeleri default wishlist'e
idempotent upsert edilir (compound unique + P2002 yut), zaten var olan atlanır, başarı sonrası guest cookie
temizlenir. Körlemesine kopya yapılmaz.

### 1.5 Product mı, variant mı liste öğesi olmalı? → İKİSİ (productId zorunlu, variantId nullable)

- `CustomerListItem` hem `productId` (zorunlu) hem `variantId` (nullable) taşır.
- **Wishlist favorisi ürün-seviyesidir** (`variantId = NULL`): product-card kalbi ve PDP kalbi her zaman
  BÜTÜN ÜRÜNÜ favoriler. Böylece PLP↔PDP favori durumu tutarlıdır (kabul kriteri: "PDP'de aynı favori
  durumu görülmeli").
- **Alışveriş listeleri varyant-özel öğe taşıyabilir** (`variantId` dolu): kullanıcı belirli bir varyantı
  bir listeye ekleyebilir. Bu yüzden variantId nullable.

### 1.6 Aynı ürünün farklı varyantları ayrı liste öğesi sayılacak mı? → EVET

Öğe kimliği `(listId, productId, variantId)` üçlüsüdür. Aynı ürünün iki farklı varyantı ayrı öğedir.
Bütün-ürün öğesi (`variantId = NULL`) ile varyant-özel öğe de ayrıdır.

### 1.7 Pasif/arşivlenmiş/silinmiş ürünler nasıl gösterilecek? + FK kararı

- **Soft-archive (status ≠ ACTIVE):** ürün/varyant satırı DB'de durur → liste öğesi KORUNUR; liste
  detayı canlı hidrasyonla durumu `UNAVAILABLE`/`ARCHIVED` olarak işaretler, sepete-ekle kapatılır,
  "artık mevcut değil / stokta yok / fiyat değişti" mesajı gösterilir.
- **Hard-delete:** `CustomerListItem.product`/`.variant` FK'leri **onDelete: Cascade** — ürün/varyant
  fiziksel silinirse ilgili öğe(ler) güvenle kaldırılır (dangling referans bırakmaz). Bütün-ürün öğesi
  yalnız ürün silinince kalkar; varyant-özel öğe varyant silinince kalkar.
- Bu karar bilinçlidir ve ADR-093'te belgelidir: soft-archive = "göster ama devre dışı", hard-delete =
  "cascade temizle".

---

## 2. Domain modeli (özet — tam şema §3'te uygulanır)

```
CustomerList(id, storeId, customerId, name, type, visibility, isDefault, createdAt, updatedAt)
CustomerListItem(id, storeId, listId, productId, variantId?, note?, quantity, sortOrder, addedAt)
enum CustomerListType { WISHLIST, SHOPPING_LIST }
enum CustomerListVisibility { PRIVATE }   // MVP yalnız PRIVATE
```

### Kurallar / invariant'lar
1. Her (storeId, customerId) için **tam bir adet** default WISHLIST. Kısmi unique index ile zorlanır:
   `UNIQUE(storeId, customerId) WHERE isDefault = true AND type = 'WISHLIST'`. İlk erişimde lazy-create.
2. Default wishlist **silinemez** ve **yeniden adlandırılamaz** (adı lokalize/sabit türetilir).
3. Aynı ürün/varyant aynı listeye iki kez eklenemez:
   - `@@unique([listId, productId, variantId])` (varyant-dolu durumu Prisma-native kapatır).
   - `UNIQUE(listId, productId) WHERE variantId IS NULL` kısmi index (bütün-ürün durumunu kapatır —
     Postgres NULL'ları distinct saydığı için gerekli).
   - Servis katmanı ayrıca transaction içinde check-then-insert yapar ve P2002'yi idempotent yutar.
4. Özel liste adı zorunlu, trim'li, 1–60 karakter. Aynı müşteride aynı isimli (case-insensitive) ikinci
   özel liste **reddedilir (409 CONFLICT)** — servis katmanında zorlanır (DB unique değil; default'un
   lokalize adı ve i18n nedeniyle).
5. Sunucu limitleri: müşteri başına maks. 50 liste; liste başına maks. 200 öğe; batch add-to-cart maks.
   100 id; wishlist status batch maks. 200 id. Aşımda 422/400.
6. Tenant izolasyonu: her yazma öncesi store+customer+list ownership doğrulanır; her sorgu storeId ile
   scope'lanır. ID enumeration başka müşterinin listesini sızdırmaz (bulunamayan → 404).
7. Product/Variant modeline **JSON wishlist alanı EKLENMEZ** (ayrı normalize tablo).

---

## 3. API yüzeyi (customer-scoped, `requireStore` + `requireCustomer`)

Paths: `/public/stores/:storeSlug/customer/lists*` ve `/public/stores/:storeSlug/customer/wishlist*`.

| Uç | Metod | Açıklama |
|----|-------|----------|
| `/customer/lists` | GET | Müşterinin tüm listeleri (özet: id, name, type, isDefault, itemCount) |
| `/customer/lists` | POST | Yeni özel liste (name) — 409 aynı isim |
| `/customer/lists/:listId` | GET | Liste detayı + sayfalanmış hidrate öğeler (ADR-089: 25/50/100) |
| `/customer/lists/:listId` | PATCH | Yeniden adlandır (default hariç) |
| `/customer/lists/:listId` | DELETE | Sil (default hariç) |
| `/customer/lists/:listId/items` | POST | Öğe ekle (productId, variantId?, note?, quantity?) — idempotent |
| `/customer/lists/:listId/items/:itemId` | DELETE | Öğe kaldır — idempotent |
| `/customer/lists/:listId/items/:itemId/move` | POST | Öğeyi başka listeye taşı (targetListId) |
| `/customer/lists/:listId/items/:itemId/copy` | POST | Öğeyi başka listeye kopyala (targetListId) |
| `/customer/lists/:listId/add-to-cart` | POST | Toplu sepete ekle (itemIds? veya tümü) → sonuç özeti |
| `/customer/wishlist/toggle` | POST | Default wishlist'te ürün favori aç/kapat (productId) — idempotent |
| `/customer/wishlist/status` | POST | Verilen productId listesi için favori durumu (batched) |
| `/customer/wishlist/merge` | POST | Guest wishlist öğelerini default wishlist'e idempotent merge |

Kurallar: müşteri yalnız kendi listelerine erişir; batch üst sınırı sunucuda; add/remove/toggle idempotent;
toplu sepete eklemede canlı stok/fiyat otoritesi (snapshot yok), stokta olmayan/pasif ATLANIR + sonuç özeti
(`added`, `skipped[{productId, reason}]`).

Contracts: `packages/contracts/src/index.ts` içinde yeni banner bölümü (enum → request → response
`{data}`/`{data, pagination}` → inferred type). api-client: `packages/api-client/src/index.ts` yeni grup +
`pnpm --filter @commerce-os/api-client build` (stale dist tuzağı).

---

## 4. Storefront entegrasyonu

- **Batched status resolver:** PLP/Home/PDP sunucu bileşenleri, sayfadaki ürün id'leri için TEK çağrı
  yapar (login → `/wishlist/status`; guest → cookie'den okunur) ve her karta `initialSaved` geçer. Tüm
  katalog istemciye ÇEKİLMEZ; N+1 YOK.
- **Toggle:** `StorefrontProductCard` + `SearchProductCard` gerçek toggle; optimistic UI + başarısızlıkta
  rollback; idempotent (çift tık güvenli); `aria-pressed` + SR metni; başarı/hata feedback'i. Stil mevcut
  MOCK ile aynı (`control-surface` + `var(--ink)` fill) — accent CTA'ya dokunulmaz.
- **PDP:** BuyBox favori yer tutucusu (`buy-box.tsx:337`) gerçek toggle butonuna dönüşür; ürün-seviyesi
  (variantId=NULL) favoriler; `usePdpSelection` ile tutarlı.
- **Guest:** `commerce_os_wishlist` cookie (imzalı, yalnız productId/variantId, maks. sınır, bozuk id
  toleransı). Toggle server action cookie'yi günceller. Login sonrası merge action guest cookie → default
  wishlist + cookie temizliği.

## 5. Customer Account UI

- `/account?section=favorites` → wishlist görünümü (ürün kartları, sepete ekle, kaldır).
- `/account?section=lists` → alışveriş listeleri (liste kartları, oluştur/sil).
- `/account/lists/[listId]` → ayrı detay rotası (order-detail deseni): sayfalanmış öğeler, sepete ekle
  (tekli/toplu), taşı/kopyala, kaldır, yeniden adlandır. Durumlar: loading/empty/error-retry/unavailable/
  fiyat-değişti/stokta-yok. Theme Engine token'ları (`text-ink`, `border-line`, `bg-surface`, ...);
  hardcoded renk yok. Pagination ADR-089 (25/50/100 + totalItems/totalPages).

## 6. Store Admin (MVP: salt-okunur özet)

Müşteri detayında (`apps/store-admin-web/app/(app)/customers/[id]/page.tsx`) `ContextRail`/`MetricTile`
tarzı salt-okunur özet: liste sayısı, wishlist öğe sayısı, son eklenen öğe tarihi. Detaylı davranış takibi
GÖSTERİLMEZ (gizlilik). Tam düzenleme ekranı MVP dışı. Kapsam büyürse yalnız API/veri hazırlanır.

## 7. Performans / güvenlik özeti

- Indexler: `CustomerList(storeId)`, `(storeId, customerId)`; `CustomerListItem(storeId)`,
  `(listId, addedAt)`, `(productId)`, `(variantId)`. Kısmi unique'ler yukarıda.
- Batched status (tek sorgu, `WHERE listId = default AND productId IN (...)`); liste detayı öğeleri
  batched product/variant/stok hidrasyonu (N+1 yok); sayfalama ile büyük liste sınırlı.
- Güvenlik: storeId izolasyonu + customer ownership her yazmada; ID enumeration yok (404); guest cookie
  HMAC imzalı; liste adı/not alanı sunucuda uzunluk + trim validasyonu (XSS için React default escaping +
  düz metin render); batch limitleri; mevcut session/CSRF deseni korunur; paylaşımlı/public liste bu fazda
  YOK.

## 8. Kapsam dışı (MVP) / sonraki faz

Paylaşımlı/public liste · liste bazlı fiyat-düşüş bildirimi · admin liste analitiği · liste yeniden
sıralama UI (sortOrder alanı hazır, sürükle-bırak UI ertelenebilir).

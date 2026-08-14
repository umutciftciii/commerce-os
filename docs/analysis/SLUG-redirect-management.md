# Slug & Redirect Management (TODO-166 / ADR-265)

Store Admin için merkezi **SEO > Slug ve Yönlendirmeler** modülü. Mevcut slug/redirect
motorunu (TODO-156D / ADR-081/082) **yönetir**; yeni motor kurmaz.

## 1. Mevcut mimari (denetim sonucu)

| Katman | Konum | Rol |
| --- | --- | --- |
| Slug üretim motoru (SAF) | `packages/utils/src/slug.ts` | `slugify` + reserved liste + deterministik collision |
| Redirect çözümleme (SAF, TEK OTORİTE) | `packages/utils/src/redirect.ts` | `resolveRedirect` — chain collapse + loop guard + normalize |
| Kanonik path (TEK KAYNAK) | `packages/utils/src/seo-paths.ts` | `productUrlPath` / `categoryUrlPath` / **`brandUrlPath` (yeni)** |
| Slug lifecycle (yazma) | `apps/api-gateway/src/seo/slug-governance.ts` | `recordSlugChange` — SlugHistory + otomatik 301 (tx içi, atomik) |
| Persistence | `packages/db` — `SlugHistory`, `Redirect` | store-scoped tablolar |
| Storefront runtime | `apps/storefront-web/lib/seo/redirect-runtime.ts` + `middleware.ts` | public redirects ucundan çeker, 404'ten ÖNCE çözer |
| Public read ucu | `GET /public/stores/:slug/redirects` | storefront'un okuduğu allowlist projeksiyon |

**Kanıtlanan gerçekler (denetim):**
- Desteklenen entity tipleri (öncesi): PRODUCT, CATEGORY (+ enum'da kullanılmayan CMS_PAGE). **BRAND YOKTU.**
- Manuel redirect altyapısı: `Redirect` modeli (unique `[storeId, sourcePath]`, `notes`, `enabled`, `type`) vardı ama **admin CRUD ucu / UI YOKTU** (TD-057 — "Admin SEO UI YOK").
- Loop/chain koruması: SAF resolver'da (`resolveRedirect` — loop → null; chain → tek hedefe collapse) + `recordSlugChange` yazma-yolunda (chain repoint + self-redirect temizliği).
- Eski slug silme: `SlugHistory` immutable (create-or-noop; UPDATE/DELETE yok).
- Hit/last-used metriği: **YOK.**
- 404 log kaynağı: **YOK** (`not-found.tsx` statik; hiçbir Prisma modeli / analytics eventi yok).

## 2. Seçilen otorite

Mevcut motor **tek otorite** olarak korunur (ADR-262 normu: "yeni redirect/slug-history modeli KURULMAZ").
Yeni Admin katmanı yalnızca bu motorun üstüne **okuma + yönetim** ekler:
- Yeni admin uçları `GET/POST/GET:id/PATCH/DELETE /stores/:storeId/seo/redirects` + `GET /stores/:storeId/seo/slugs[/:type/:id]`.
- `requireStoreAdminForModule("CATALOG")` ile korunur — CATALOG **core/always-on** → SEO yüzeyi her yetkili store-admin için görünür, **ayrı capability GEREKMEZ** (registry'ye modül eklenmez; enterprise-demo dahil hiçbir mağazada 404-gizleme riski yok).

## 3. Manuel redirect kararı

Domain modeli güvenli (unique kısıt + SAF loop/chain guard) → **manuel redirect EKLENDİ.**
Ayrım için `Redirect.origin` (`AUTOMATIC` | `MANUAL`) kolonu eklendi (additive migration; mevcut satırlar
slug-değişiminden geldiği için varsayılan `AUTOMATIC`).

**Doğrulama (SAF `validateManualRedirect` @commerce-os/utils + gateway katmanı):**

| Kural | Katman | Sonuç |
| --- | --- | --- |
| store scope zorunlu | gateway (storeId her where'de) | cross-store id → 404 |
| source == target | SAF | 400 `REDIRECT_SOURCE_EQUALS_TARGET` |
| loop oluşturamaz | SAF (`redirectWouldCreateLoop`) | 409 `REDIRECT_LOOP` |
| canonical/reserved route gölgeleyemez | SAF (`isReservedRedirectSource`) | 400 `REDIRECT_RESERVED_ROUTE` |
| canlı ürün/marka slug'ı gölgeleyemez | gateway (DB canlı kontrolü) | 409 `REDIRECT_SHADOWS_LIVE` |
| başka store'a/off-site yönlenemez | SAF (`isSafeLocalRedirectTarget`: `//`, `://`, kontrol karakteri reddi) | 400 `REDIRECT_UNSAFE_TARGET` |
| kaynak tekilliği | gateway (unique) | 409 `REDIRECT_SOURCE_TAKEN` |
| query/hash davranışı | **kaynak normalize edilir (query düşer, eşleşme için); hedef query'yi KORUR** (kategori `/products?category=...`) | net |
| chain → canonical hedefe collapse | SAF resolver (runtime) | tek redirect |

## 4. Slug değişikliği güvenliği

Ürün/kategori/**marka** slug değişiminde (server-authoritative, tx içinde atomik):
1. Eski slug → `SlugHistory` (immutable upsert).
2. Eski canonical path → yeni canonical path **301** (`origin=AUTOMATIC`).
3. Çoklu rename → chain collapse (A→B, B→C ⇒ A→C; hiçbir eski kaynak canlı path'e zincirlenmez).
4. Yeni canlı path bir redirect kaynağı olamaz (loop tohumu temizlenir) → **loop oluşmaz**.
5. Store izolasyonu: tüm işlemler `storeId`-scoped.
6. Sipariş snapshot'ları: DEĞİŞMEZ (slug'a bağlı değil).
7. Public canonical metadata: search read-model reindex (marka için `onBrandChanged`).

**BRAND eklendi:** `SlugEntityType += BRAND`, `brandUrlPath` (`/markalar/{slug}`), `entityPath`/`recordSlugChange`
BRAND'i kapsar; marka güncelleme prisma veri katmanı slug değişince `recordSlugChange`'i AYNI transaction'da çağırır
(ürün/kategori ile simetrik).

## 5. Loop / chain kuralları

- **Chain (zincir) YOK:** runtime resolver A→B→C'yi tek adımda C'ye çözer (301 zinciri oluşmaz).
- **Loop (döngü) YOK:** A→B→A tespit → redirect YOK (güvenli; orijinal path servis edilir / 404).
- Manuel girişte döngü tohumu `redirectWouldCreateLoop` ile ekleme öncesi reddedilir.
- Otomatik yazımda `recordSlugChange` chain repoint + self-redirect temizliği yapar.

## 6. Tenant izolasyonu

- Store Admin yalnız kendi store kayıtlarını görür (tüm sorgular `storeId`-scoped; cross-store id → 404).
- Store Admin, aktif store bağlamını kimlik doğrulanan StoreUser oturumundan türetir (Faz E1); slug env okunmaz, kanonik `STORE_ADMIN_STORE_SLUG` yalnız gateway ön-login tenant çözümünde kullanılır.
- Cross-store source/target: source store-scoped; target off-site/başka-host reddi (`isSafeLocalRedirectTarget`).
- Fail-closed: capability + auth guard reddi leak-siz.
- Audit: her mutation `createAuditLog` (CREATE/UPDATE/DELETE, `entityType: "Redirect"`).

## 7. Silme / pasifleştirme politikası

- **SlugHistory:** kullanıcı tarafından silinemez (immutable; UI'da salt-okuma geçmiş).
- **Otomatik redirect:** doğrudan SİLİNEMEZ (409 `REDIRECT_AUTOMATIC_DELETE_FORBIDDEN`); source/target/type düzenlenemez
  (409 `REDIRECT_AUTOMATIC_IMMUTABLE`) — yalnız **aktif/pasif** (canonical bütünlüğü korunur).
- **Manuel redirect:** tam CRUD (düzenle / aktif-pasif / sil).

## 8. entity tipi türetimi (redirect)

`Redirect` tablosunda entity tipi kolonu YOK; kaynak path şeklinden türetilir (`redirectEntityType`):
`/products/...` → PRODUCT, `/markalar/...` → BRAND, `...category=...` → CATEGORY, diğer → OTHER.
Liste filtresi **DB seviyesinde** aynı path desenleriyle uygulanır (`entityTypeWhere`) → sayfalama sayacı doğru.

## 9. 404 önerilerinin durumu

**Bu turda YAPILMADI.** Kök neden: hiçbir 404/eksik-path yakalama altyapısı yok (statik `not-found.tsx`,
Prisma modeli yok, analytics eventi yok). Yeni bir log sistemi bu görevin kapsamı dışıdır.
→ **Future / follow-up:** "404 Insights" — middleware `next()` dalında veya `not-found.tsx`'te eksik-path yakalama +
sıklık/son-görülme/önerilen-hedef tablosu + "redirect oluştur" aksiyonu (ayrı TODO).

## 10. Kategori runtime redirect sınırı (mevcut TD)

Kategori canonical'ı query-tabanlıdır (`/products?category={slug}`). Storefront runtime resolver query-kaynaklı
kuralları index'ten HARİÇ tutar (aksi halde `/products` listelemesiyle çakışır). Bu nedenle **kategori eski URL
runtime'da 301 VERMEZ** (eski `?category=` PLP listelemesine düşer, 404 değil). Bu **önceden var olan TD-064**'tür
(`/categories/[slug]` path rotası gelince çözülür); Admin modülü kategori redirect'lerini üretir + LİSTELER, davranış
sınırı korunur. Ürün ve **marka** redirect'leri path-tabanlıdır → runtime'da tam 301 verir (smoke ile doğrulandı).

## 11. Test kapsamı

- SAF motor (utils): `packages/utils/test/redirect.test.ts` — brandUrlPath, isSafeLocalRedirectTarget, isReservedRedirectSource,
  redirectWouldCreateLoop, validateManualRedirect (+ mevcut resolver/normalize/chain/loop).
- Governance: `apps/api-gateway/test/slug-governance.test.ts` — BRAND 301 + history + origin=AUTOMATIC + çoklu-rename collapse.
- Servis: `apps/api-gateway/test/redirect-service.test.ts` — create/validate (source==target, reserved, off-site, loop,
  duplicate, shadows-live), otomatik/manuel immutable & delete-forbidden, chain detail, loop bayrağı, tenant izolasyonu,
  hedef-query koruması.

## 12. Browser smoke (özet)

Gerçek stack (worktree gateway:4100 + store-admin:3100 + storefront:3200, enterprise-demo, paylaşımlı Postgres):
slug listesi (579 kayıt), redirect listesi (kolonlar/rozetler/query-korumalı hedef/pagination), create modal (tüm alanlar),
detay modal (zincir + otomatik-uyarı + toggle-only footer), pasifleştirme (enabled=false persist), filtre/arama/sıralama,
ürün slug → eski URL **301** → yeni PDP, marka slug → **301** → yeni marka sayfası, kategori (query-tabanlı TD-064 sınırı),
375/768/1024/1440'da yatay taşma yok. Smoke iki bug yakaladı ve düzeltti: (a) manuel hedef query'sinin düşmesi, (b) entityType
filtre sayfalama tutarsızlığı.

## 13. Future başlıkları

- **404 Insights** (yukarıda) — eksik-path yakalama + öneri.
- **Kategori path rotası** (`/categories/[slug]`) → TD-064 kapanışı, kategori runtime 301.
- Redirect **hit/last-used metriği** (şu an yok) — kullanım gözlemlenebilirliği.
- CMS_PAGE slug lifecycle (enum'da var, tüketici yok).

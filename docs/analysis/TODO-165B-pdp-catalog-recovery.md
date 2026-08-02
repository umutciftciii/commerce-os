# TODO-165B — PDP, Catalog Projection & Slug Lifecycle Recovery

> **Durum:** IN PROGRESS (recovery). TODO-165A working tree korunur; commit/push/PR/deploy YOK — tam gate + gerçek browser smoke sonrası durulur.
> **Branch:** `claude/pdp-catalog-slug-recovery-996bc3`
> **Kapsam:** Storefront + katalog doğruluğunda 6 blocker. Yeni katalog/medya/redirect/varyant/search motoru KURULMAZ — mevcut projection, search read-model, redirect ve theme-slot altyapısı reuse edilir.

---

## 1. Kök Neden Analizi (Phase 1 — kanıtlı)

Tüm bulgular canlı `enterprise-demo` (storeId=`edm-store`) DB + gateway public API üzerinde doğrulandı. Örnek ürün: `edm-prod-0266`.

| # | Blocker | Kök neden | Kanıt |
|---|---------|-----------|-------|
| 1 | PDP galeri devasa | Ana görsel frame'i yalnız `aspect-[4/5]`; **max-width/max-height yok**. `GALLERY_FIRST` slot varyantında galeri tam genişliğe yayılıyor. Thumbnail'ler **yatay** (Amazon-tarzı dikey istenmiş). | `components/product-gallery.tsx:31-71`, `app/globals.css:404-411` |
| 2 | Varyant kartlarında fiyat yok | Renk/beden kartları **hiç fiyat göstermiyor**; projection'da renk-bazlı fiyat özeti yok. `publicFashionOptionSchema` yalnız `optionId/value/label/colorHex/order`. | `buy-box.tsx:357-460`, `contracts/src/index.ts:3037-3044` |
| 3 | Slug eski isimde kalıyor | Motorlar hazır (`generateSlug`, `recordSlugChange`, redirect middleware) ama **ürün update akışına bağlı değil**. `Product`'ta `slugLocked` yok. Store-admin update payload'ı slug göndermiyor + form'da slug UI yok. | `slug.ts:173`, `slug-governance.ts:38`, `server.ts:3734-3784`, `product-form-schema.ts:307` — canlı: title=`Camper…` slug=`puma-…` |
| 4 | Kategori PLP 0 ürün | PLP + read-model **yalnız `primaryCategoryId`** ile filtreliyor; ikincil assignment görünmez. **+ Veri:** `moda-ayakkabi` (`fash-cat-shoes`) kategorisinde 0 ürün; 25 ayakkabı ürünü `ayakkabi` (`edm-cat-ayakkabi`)'de. | `search-query.ts:307-322,474-476`, `data.ts:428-434`, `schema.prisma:3713` |
| 5 | Beden tablosu görünmüyor | Chart bağlı+PUBLISHED+projection'da mevcut+capability açık. Buton yalnız `axis.kind==='size'` yanında render ediliyor; beden ekseni `numara` code'u `fashion.size` olmadığı için `kind='other'` → buton hiç çıkmıyor. | `buy-box.tsx:421`, `public-projection.ts:13,32` — API: `optionAxes=[color, other]`, `sizeChart` dolu |
| 6 | Kart görselleri kırpılıyor | Ortak `ProductMedia` primitive'i + `fit` prop'u var; kart tüketicileri **default `fit="cover"`** kullanıyor → aşırı zoom. Ortak **frame primitive'i yok**. | `components/ui/product-media.tsx:29,69-73` + ~14 tüketici |

**Reuse teyidi (yeni model kurulmayacak):** `SlugHistory`, `Redirect`, `SizeChart(+Revision+Assignment)`, `ProductSearchDocument`, `ProductFacetValue`, `ProductCategoryAssignment` tabloları zaten var.

---

## 2. Kararlar (kullanıcı onaylı)

### Blocker 4 — Kod + Veri
- `primaryCategoryId` yalnız breadcrumb/canonical navigation içindir.
- Search document `categoryIds` + `categorySlugs` (primary + tüm secondary) tutar.
- Ürün, bağlı olduğu **her** kategoride görünür; duplicate dönmez.
- Assignment create/update/delete sonrası read-model otomatik güncellenir (mevcut reindex akışı yeni alanları doldurur).
- Full reindex yalnız recovery/runbook; normal akış şartı değil.
- İdempotent seed-fix: `enterprise-demo` ürünleri gerçek fashion kategorilerine (`fash-cat-*`) bağlanır. `ayakkabi` bağlantıları silinmez.
- Tenant isolation + inactive/unpublished filtreleri korunur.

### Blocker 5 — sizeChart varlığına bağla
- `fashion.sizeChart` projection'da varsa buy-box'ta "Beden Tablosu" aksiyonu **her zaman** görünür (axis.kind / option code / kategori adı / heuristik bağımlı DEĞİL).
- Product > Category > Store precedence korunur; unpublished/archived görünmez; assignment/publish/rollback sonrası cache invalidate.
- Ek: axis-kind normalize (numara/beden → `size`) yalnız varyant UX içindir; buton şartı değil.

---

## 3. Money & güvenlik invariant'ları (tüm fazlarda)
- Server-authoritative money; client fiyat tahmini yasak (mevcut kampanya `estimateAutomaticUnitFinalMinor` tek istisna, korunur).
- quantity unit price'ı değiştirmez (`resolveUnitPriceLabels` quantity almaz — korunur).
- Renk fiyat özeti yalnız **aktif/satılabilir** (ACTIVE, hidden/archived değil) varyantlardan; fashion projection variant status filtresi eklenir.
- Mixed-currency: renk özeti tek para birimi varsayımı yerine currency taşınır; karışık ise özet gizlenir (fail-safe).
- Redirect metadata public response'a sızmaz; server route düzeyinde 301 çözülür.

---

## 4. Faz Haritası

| Faz | Blocker | Katman | Ana dosyalar |
|-----|---------|--------|--------------|
| F1 | 3,4 | Migration + schema | `schema.prisma`, yeni migration'lar (`Product.slugLocked`, `ProductSearchDocument.categoryIds/categorySlugs`) |
| F2 | 3 | Slug lifecycle backend | `server.ts` updateProduct, `slug-governance.ts`, contracts product input |
| F3 | 3 | Slug lifecycle UI | `store-admin-web` product-form + schema |
| F4 | 4 | Kategori read-model | `search-service/data.ts`, `document-builder.ts`, `search-query.ts` |
| F5 | 4 | Kategori veri seed-fix | idempotent backfill script + runbook |
| F6 | 5 | Beden tablosu | `buy-box.tsx`, `public-projection.ts` (axis normalize), cache invalidation |
| F7 | 2 | Varyant fiyat kartları | contracts, `public-projection.ts`, `catalog-types.ts`, `catalog.ts`, `buy-box.tsx` |
| F8 | 6,7 | Ortak medya primitive | yeni `ProductMediaFrame`, ~14 tüketici + `product-media.tsx` |
| F9 | 1 | PDP galeri UX (frontend-design) | `product-gallery.tsx`, `variant-gallery.tsx`, `globals.css` |
| F10 | 8 | Cache invalidation | ilgili mutation yolları |
| F11 | — | Testler | her alan için unit/integration |
| F12 | — | Docs + ADR | ROADMAP/TODO/DECISIONS/TECH_DEBT/OPERATIONS + 6 ADR |
| F13 | — | Full gate | db generate, migrate, build/test/typecheck, lint, reindex, `git diff --check` |
| F14 | — | Browser + responsive smoke | 375/768/1024/1440 |

**Uygulama sırası mantığı:** Backend veri modeli (F1) → mantık (F2/F4/F6/F7) → UI (F3/F8/F9) → cache (F10) → doğrulama (F11-F14). Her faz kendi testleriyle (TDD) kapanır.

---

## 5. Migration planı (additive, immutable)

1. `Product.slugLocked Boolean @default(false)` — manuel slug kilidi kalıcılığı.
2. `ProductSearchDocument.categoryIds String[]` + `categorySlugs String[]` — çoklu kategori indexleme. GIN index `@@index([storeId], type: ...)` yerine array containment için uygun index.

Mevcut redirect/slug-history/size-chart modelleri yeterli → yeni model YOK.

---

## 6. Test matrisi (spec §10)

- **Gallery:** thumbnail switching, active state, object-contain contract, responsive layout, variant media change.
- **Variant pricing:** multi-color prices, single-color size prices, discount, OOS, mixed-currency rejection, selected variant exact price.
- **Slug:** title→auto slug, manual lock, collision, old slug 301, no redirect chain, cross-store isolation, repeated rename.
- **Category projection:** assigned visible, secondary visible, inactive hidden, mutation updates read-model, reindex recovery, tenant isolation.
- **Size chart:** product scope, category fallback, store fallback, unpublished hidden, assignment cache invalidation, sizeChart-present-but-no-size-axis → button visible.
- **Media cards:** contain not cover, fallback, no layout shift, image sizing.

---

## 7. Browser smoke senaryoları (spec §9)
PDP galeri (7 görsel) · varyant fiyatları (çok-renkli / tek-renk) · slug (rename→200 yeni, 301 eski, chain yok, lock) · kategori (`edm-prod-0266` moda-ayakkabi'de, count, suggestion, rename) · beden tablosu (product→category→store fallback) · kart görseli (search/PLP/brand kırpma yok). Responsive 375/768/1024/1440 taşma yok.
</content>
</invoke>

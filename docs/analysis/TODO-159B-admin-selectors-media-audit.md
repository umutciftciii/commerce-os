# TODO-159B — Store Admin seçici yüzeyleri + Medya kütüphanesi denetimi

**Tarih:** 2026-07-22 · **Kapsam:** `apps/store-admin-web` içindeki TÜM seçim (selector /
picker) yüzeyleri + `GET /stores/:id/media`
· **İlgili borçlar:** TD-093 (ürün/kategori seçicileri), TD-095 (medya sayfalaması)
· **İlgili karar:** ADR-090 (Admin Searchable Selector standardı) · **Öncül:** ADR-089 (Data Grid)

Bu belge, ortak Searchable Selector altyapısı kurulmadan ÖNCEKİ durumu kayda geçirir.
"Seçici" = kullanıcının BAŞKA bir kaydı (ürün / kategori / medya) referans olarak
seçtiği her yüzey. Liste EKRANLARI TODO-159A'da denetlendi; burada yalnız SEÇİM
yüzeyleri var.

TD-091 (envanter matrisi) bu fazın kapsamı DIŞINDADIR ve bu belgede yer almaz.

---

## 1. Özet tablo

Kısaltmalar — **SS**: server-side, **CS**: client-side, **—**: yok.

| # | Seçici yüzeyi | Dosya | Uç (endpoint) | Mevcut limit | Arama | Sayfalama | Seçili kayıt limit dışındaysa | Tüm dataset istemciye mi? | Tenant izolasyonu | Payload / N+1 riski |
|---|---------------|-------|---------------|--------------|-------|-----------|-------------------------------|---------------------------|-------------------|---------------------|
| 1 | **Kampanya ürün seçici** | `campaigns/page.tsx:551` | `GET /stores/:id/products` | **25** (gateway varsayılanı; `listProducts()` argümansız) | — | — | **GÖRÜNMEZ** (kayıt korunur, kaldırılamaz) | Evet (sayfanın tamamı checkbox) | ✓ `requireStorePlatformAdmin` + `where.storeId` | Tam `productSchema` (açıklama + tüm ticari alanlar) yalnız `title` göstermek için |
| 2 | **Kampanya kategori seçici** | `campaigns/page.tsx:552` | `GET /stores/:id/categories` | **25** | — | — | **GÖRÜNMEZ** (korunur) | Evet | ✓ | Tam `productCategorySchema` |
| 3 | **Home Showcase ürün seçici** | `home/[sectionId]/page.tsx:564` | `GET /stores/:id/products` | **25** | — | — | **GÖRÜNMEZ** (pin korunur, kaldırılamaz) | Evet | ✓ | Tam `productSchema` |
| 4 | **Home Featured Categories** | `home/[sectionId]/page.tsx:349` | `GET /stores/:id/categories` | **25** | — | — | Ekleme modunda `<select>`te YOK; düzenlemede kategori zaten sabit | Evet | ✓ | Tam `productCategorySchema` |
| 5 | **Ürün formu kategori ataması** (`categoryIds` + `primaryCategoryId`) | `products/[id]/page.tsx:96` → `product-form.tsx:654` | `GET /stores/:id/categories` | **25** | — | — | **GÖRÜNMEZ** (atama korunur; ★ ana kategori işareti de görünmez) | Evet | ✓ | Tam şema |
| 6 | **Ürün listesi kategori filtresi** | `products/page.tsx:177` | `GET /stores/:id/categories` | **100** (`pageSize:100`) | — | — | 100'den derin ağaçta filtre seçeneği yok | Evet (100 tavan) | ✓ | Tam şema |
| 7 | **Kategori ebeveyn seçici** + liste ebeveyn adı çözümü | `categories/page.tsx:114` | `GET /stores/:id/categories` | **100** | — | — | Ebeveyn 100 dışındaysa ad yerine boş/`id` | Evet (100 tavan) | ✓ | Tam şema |
| 8 | **Medya kütüphanesi** (MediaUpload modalı — projedeki TEK kütüphane yüzeyi) | `components/media-upload.tsx:297` | `GET /stores/:id/media` | **sabit 100** (`take: 100`, `offset` UYGULANMAZ) | — | **sahte meta** (`{limit:100,offset:0,total}`) | 100'den eski görsel **ERİŞİLEMEZ** | Evet (100 tavan) | ✓ | Yalnız allowlist alanlar (binary YOK) |
| 9 | **Ürün attribute IMAGE/FILE değeri önizlemesi** | `products/attributes/attribute-field.tsx:302` | `GET /stores/:id/media` | **sabit 100** (modül-cache'li tek çağrı) | — | — | 100 dışındaki mediaId için önizleme **boş kalır** | Evet | ✓ | Allowlist |

### Aynı ucu kullanan ama seçici OLMAYAN yüzeyler (kapsam dışı, kayıt için)

- `hero/page.tsx`, `settings/page.tsx`, `categories/page.tsx` görsel alanları →
  `MediaUpload` bileşenini kullanır; kütüphane modalı #8 ile AYNI koddur (tek düzeltme
  hepsini kapsar). `settings` marka slotlarında `libraryEnabled={false}` olduğu için
  kütüphane hiç açılmaz (ADR-065 R5).
- `home/[sectionId]` hero slaytları ve featured kategori kapağı → yine `MediaUpload`.
- Attribute `options` / warehouse / kargo sağlayıcı `<select>`'leri → doğal olarak
  küçük, sınırlı ve tek-mağaza kümeleridir; sabit tavan taşımazlar.

### Görevde adı geçip projede KARŞILIĞI OLMAYAN yüzeyler

- **Ayrı "Media Library" ekranı YOKTUR.** Projedeki tek kütüphane yüzeyi `MediaUpload`
  modalıdır. Görev metnindeki "Media picker ile tam Media Library aynı backend
  pagination sözleşmesini kullanmalı" şartı, ikisi AYNI bileşen olduğu için doğal
  olarak sağlanır; yeni bir ekran uydurulmadı.
- **"Klasör" kavramı YOKTUR.** `MediaAsset` yalnız `context` (PRODUCT / CATEGORY /
  HERO / BRANDING) taşır; klasör/koleksiyon kolonu yok. "Kullanım alanı" filtresi =
  `context`.
- **Dosya adı kolonu YOKTUR.** `storageKey` sunucu üretimi opak bir yoldur ve
  response'a SIZMAZ (ADR-065 allowlist). Kullanıcıya görünen tek metin `altText`'tir;
  "isim araması / isim sıralaması" bu alan üzerindedir.
- **Anlamlı bir "dosya tipi" filtresi YOKTUR.** Yükleme yolu her görseli sunucuda
  `image/webp`'e normalize eder (ADR-065); dolayısıyla `mimeType` filtresi tek değerli
  ve sahte bir daraltma olurdu. Eklenmedi — bunun yerine gerçek ayrım olan `context`
  filtresi sunuldu.

---

## 2. Tespit edilen sabit limitler (tam liste)

| Konum | Sabit | Etki |
|-------|-------|------|
| `campaigns/page.tsx:551-552` | `listProducts()` / `listCategories()` argümansız → gateway varsayılanı **25** | Kampanya kapsamına 26. üründen sonrası eklenemez |
| `home/[sectionId]/page.tsx:349,564` | aynı, **25** | Showcase'e / öne çıkan kategorilere 26'dan sonrası eklenemez |
| `products/[id]/page.tsx:96` | `listCategories()` argümansız → **25** | Ürüne 26'dan sonraki kategori atanamaz |
| `products/page.tsx:177` | `listCategories({pageSize:100})` | Kategori filtresi 100 ile sınırlı |
| `categories/page.tsx:114` | `listCategories({pageSize:100})` | Ebeveyn seçici + ad çözümü 100 ile sınırlı |
| `api-gateway/src/media/routes.ts:58` | `MEDIA_LIST_LIMIT = 100`, `take: 100`, `offset` hiç uygulanmaz | 101. görselden itibaren ERİŞİLEMEZ; pagination meta'sı yanıltıcı |
| `attribute-field.tsx:299` | modül-cache'li tek `listMedia()` → **100** | Attribute görsel değerinin önizlemesi çözülemeyebilir |

`slice(0, N)` ile istemcide kesilen bir seçici BULUNMADI (tarama: `apps/store-admin-web`
altındaki tüm `slice(`/`take:`/`limit:` kullanımları; kalanlar tarih kırpma ve baş harf
üretimi gibi sunumsal kullanımlardır).

---

## 3. Ana bulgular

### 3.1 "Sessiz kesme" seçicilere taşınmış durumda

TODO-159A liste ekranlarındaki sessiz ilk-sayfa defektini kapattı; ancak seçiciler
`listProducts()` / `listCategories()`'i **argümansız** çağırmaya devam ediyor. Sonuç:
liste ekranı 471 ürünü doğru sayfalarken, kampanya seçicisi hâlâ yalnız **25** ürün
gösteriyor — ve kullanıcıya "toplam kaç kayıt var" bilgisi verilmiyor. Bu, liste
ekranındakinden daha sinsidir: kullanıcı "ürün yok" sanıp yanlış içerik yayımlayabilir.

### 3.2 Veri KAYBI yok, ama GÖRÜNÜRLÜK kaybı var

Denetimin en önemli olumlu bulgusu: seçili kayıtlar **kaybolmuyor**.

- Kampanya formu `form.productIds`'i `campaign.productIds`'ten kurar; kaydetme aynı
  diziyi geri gönderir. Checkbox listesinde görünmeyen ürün de payload'da kalır.
- Showcase `selected`'ı `listHomeShowcaseProducts()`'tan kurar (ürün listesinden
  DEĞİL); kaydetme pinleri korur.
- Ürün formu `categoryIds`'i üründen alır.

Yani "aç–kapat–kaydet" veri kaybına yol açmıyor. Fakat kullanıcı bu kayıtları
**göremiyor**, dolayısıyla **kaldıramıyor** ve seçim sayacı ekranda gördüğünden fazlasını
gösteriyor. Bu bir tutarlılık/ güven defektidir; TODO-159B'nin "seçili kayıtların arama
sonucunda görünmese bile gösterilmesi" şartı doğrudan bunu hedefler.

**İstisna:** `attribute-field.tsx` medya önizlemesi gerçekten bozulur — mediaId 100
dışındaysa `resolveMediaItem` null döner ve kullanıcı kutuda boş görsel görür (değer
korunur, önizleme kaybolur).

### 3.3 Gereksiz payload

Seçiciler satırda YALNIZ `title` / `name` gösterirken tam entity şemasını taşıyor:
`productSchema` açıklama, SEO alanları, tüm ticari model alanları, kargo ölçüleri ve
`categoryIds` dizisini içerir. 100 ürünlük bir sayfa için bu, gösterilen bilginin
onlarca katıdır.

### 3.4 Medya ucu sözleşmesi YANILTICI

`GET /stores/:id/media` `{limit:100, offset:0, total}` döner — yani "sayfalama var"
izlenimi verir ama `offset` HİÇ uygulanmaz. `total` doğru olduğu için istemci
"100/450 kayıt" görüp sonraki sayfaya geçemez. Bu, sahte pagination meta'sının ders
kitabı örneğidir.

### 3.5 Tenant izolasyonu ve N+1

- **Tenant izolasyonu:** tüm seçici uçları `requireStorePlatformAdmin` + `where.storeId`
  ile korunuyor; denetimde sızıntı BULUNMADI. Medya ucu ayrıca `findFirst({id, storeId})`
  deseniyle korunuyor.
- **N+1 YOK:** tüm yollar toplu `findMany` kullanıyor. Kategori hiyerarşi yolu
  (`Elektronik / Bilgisayar / Ekran Kartı`) YENİ bir risktir — satır başına ebeveyn
  sorgusu N+1 üretirdi; bu yüzden seviye-bazlı batched çözüm seçildi (bkz. §4).
- **Medya binary'si liste response'una GİRMİYOR:** `mediaAssetSchema` allowlist'i
  `storageKey`/`checksum`/`createdBy` dahil hiçbir iç alanı taşımaz; `url` türetilir.

### 3.6 Erişilebilirlik

Mevcut seçicilerin hiçbirinde arama alanı, durum bildirimi (`aria-live`), klavye
navigasyonu ya da "kaç kayıt" göstergesi yok. Kampanya seçicisi `max-h-40` bir kutuya
sıkışmış işaretli kutu listesidir; showcase seçicisi `max-h-[28rem]` içinde tüm sayfayı
render eder.

---

## 4. Bu iş paketinde yapılanlar (özet — ayrıntı: ADR-090)

**Ortak sözleşme:** `adminSelectorQueryBaseSchema` (`page`/`pageSize`/`search`/`sortBy`/
`sortOrder` + `ids`) ve modül başına daraltılmış `sortBy` allowlist'i. `ids` verildiğinde
uç **seçili-çözüm moduna** geçer: arama/filtre uygulanmaz, YALNIZ verilen id'ler
(mağaza içinde, en çok 100 adet) döner. Böylece "seçili kaydı göstermek için tüm
kataloğu çekme" ihtiyacı tamamen ortadan kalkar.

**Yeni uçlar (hafif projeksiyon):**

- `GET /stores/:id/products/selector` → `{ id, title, slug, status, sku, imageUrl,
  priceMinor, stockAvailable }`
- `GET /stores/:id/categories/selector` → `{ id, name, slug, status, path[] }`
- `GET /stores/:id/media` (mevcut uç) → gerçek `page`/`pageSize`/`search`/`context`/
  `sortBy`/`sortOrder`/`ids` + ADR-089 pagination meta'sı

**Kategori yolu (`path`) N+1'siz:** sayfadaki satırların ebeveynleri SEVİYE SEVİYE,
her seviyede TEK batched `findCategoriesByIds` çağrısıyla çözülür (en çok 10 seviye
guard'ı). Tüm kategori ağacı HİÇBİR istekte baştan yüklenmez.

**Ortak UI:** `components/selector/` ailesi — `useSelectorSource` (debounce + sayfa +
seçili çözümü + hata/yeniden dene) ve `EntitySelectorField` / `EntitySelectorModal`
(tekli+çoklu, klavye navigasyonu, Escape, focus yönetimi, `aria-live` durum mesajı,
seçili çipler, toplam kayıt, önceki/sonraki). Yeni palet/token üretilmedi; store-admin
koyu cam kiti ve ADR-089 bileşen dili aynen kullanıldı.

---

## 5. Doğrulama (enterprise-demo, gerçek Postgres)

Yerel gateway + docker Postgres (`edm-store`, 471 ürün / 2202 varyant) ile yapılan
canlı doğrulamanın sonuçları PR açıklamasında ve `docs/TODO.md` TODO-159B kaydında
listelenmiştir.

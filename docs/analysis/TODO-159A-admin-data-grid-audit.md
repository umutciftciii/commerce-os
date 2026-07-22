# TODO-159A — Store Admin liste ekranları denetimi

**Tarih:** 2026-07-22 · **Kapsam:** `apps/store-admin-web` içindeki TÜM liste yüzeyleri
· **İlgili karar:** ADR-089 (Admin Data Grid standardı)

Bu belge, ortak Data Grid altyapısı kurulmadan ÖNCEKİ durumu kayda geçirir ve bu iş
paketinde nelerin taşındığını / nelerin ayrı iş olarak bırakıldığını gerekçesiyle
listeler. "Ekran" = kullanıcının kayıt kümesi gördüğü her yüzey (tam sayfa veya modal).

---

## 1. Özet tablo

Kısaltmalar — **SS**: server-side, **CS**: client-side, **—**: yok, **K**: kısmi.

| # | Ekran | Yol | Veri çekme | Listeleme | Arama | Filtre | Sıralama | Sayfalama | Sayfa boyutu | URL state | Yükleme/Boş/Hata | Toplu seçim | Risk |
|---|-------|-----|-----------|-----------|-------|--------|----------|-----------|--------------|-----------|------------------|-------------|------|
| 1 | **Ürünler** | `/products` | `listProducts()` | SS (gizli 50 tavan) | — | — | — | — | — | — | ✓/✓/✓ | — | **Kritik**: 471 üründe 421'i sessizce görünmüyordu |
| 2 | **Kategoriler** | `/categories` | `listCategories()` | SS (gizli 50 tavan) | — | — | — | — | — | — | ✓/✓/✓ | — | Yüksek: ağaç 50'yi aşarsa ebeveyn adı çözülemez |
| 3 | **Siparişler** | `/orders` | `listOrders(query)` | SS | ✓ | ✓ (durum×3 + tarih) | — | — | — | ✓ (filtre) | ✓/✓/✓ | — | Yüksek: sipariş hacmi katalogdan hızlı büyür |
| 4 | **Müşteriler** | `/customers` | `listCustomers()` | SS (gizli 50 tavan) | — | — | — | — | — | — | ✓/✓/✓ | — | Yüksek |
| 5 | **Envanter (mağaza matrisi)** | `/inventory` | `getStoreInventoryMatrix()` | **CS** | ✓ (CS) | ✓ (CS durum) | — | **— (SINIRSIZ)** | — | — | ✓/✓/✓ | — | **Kritik**: tüm varyantlar (demo: 2202) tek istekte |
| 6 | **Kampanyalar** | `/campaigns` | `listCampaigns()` | **CS** | — | — | — | — (uç sayfalamasız) | — | — | ✓/✓/✓ | K (atama seçimi) | Orta |
| 7 | Kampanya ürün seçici | `/campaigns` (modal) | `listProducts()` | SS (gizli 50 tavan) | — | — | — | — | — | — | K | **Yüksek**: seçici katalogun yalnız ilk 50'sini gösteriyordu |
| 8 | **Attribute tanımları** | `/attributes` | `listAttributes()` | **CS** | — | — | — | — (uç sayfalamasız) | — | — | ✓/✓/✓ | — | Orta |
| 9 | Attribute grupları | `/attributes` | `listAttributeGroups()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 10 | Attribute seçenekleri | `/attributes` (modal) | `listAttributeOptions(id)` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Orta (renk/beden setleri büyür) |
| 11 | Kategori-attribute bağları | `/categories` (modal) | `listCategoryAttributes(id)` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 12 | **Home / CMS bölümleri** | `/home` | `listHomeSections()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük (doğal olarak küçük + sıralı) |
| 13 | Home showcase ürün seçici | `/home/[sectionId]` | `listProducts()` | SS (gizli 50 tavan) | — | — | — | — | — | — | K | **Yüksek** (7 ile aynı defekt) |
| 14 | Home öne çıkan kategoriler | `/home/[sectionId]` | `listCategories()` | SS (gizli 50 tavan) | — | — | — | — | — | — | K | Orta |
| 15 | **Hero slaytları** | `/hero` | `listHeroSlides()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük (sıralı, küçük) |
| 16 | **Theme Studio** | `/theme` | `listThemes()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 17 | **Gönderiler** | `/shipping/shipments` | `listShipments(query)` | SS | ✓ | ✓ (durum/sağlayıcı/bayrak/tarih) | — | — (take=50 sabit) | — | — | ✓/✓/✓ | — | Yüksek (hacim büyür) |
| 18 | **Kargo tarifeleri** | `/shipping/rates` | `listShippingRatePlans()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 19 | Tarife kuralları (matris) | `/shipping/rates` | plan içinde | **CS** | — | — | — | — | — | — | K | Orta (kural sayısı büyür) |
| 20 | **Kargo sağlayıcıları** | `/shipping/providers` | `listShippingProviders()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 21 | Webhook olayları | `/shipping/providers` (modal) | `getShippingWebhookInfo()` | SS (limit 20, max 50) | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 22 | **Ödeme sağlayıcıları** | `/payment-providers` | `listPaymentProviders()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 23 | Ödeme olayları | `/payment-providers` (modal) | `listPaymentProviderEvents()` | SS (limit 50) | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 24 | **Medya kütüphanesi** | MediaUpload modalı | `listMedia(context)` | SS (**sabit 100**) | — | K (context) | — | — | — | — | ✓/✓/✓ | — | **Yüksek**: 100'den eski görsel ERİŞİLEMEZ |
| 25 | Ürün varyantları | `/products/[id]` | `listVariants(productId)` | SS (uçta limit/offset) | — | — | — | — | — | — | ✓/✓/✓ | ✓ (bulk motorlar) | Orta |
| 26 | Varyant fiyat geçmişi | `/products/[id]` | `listPriceChanges()` | SS | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 27 | Ürün stok matrisi | `/products/[id]` (Stok) | `getInventoryMatrix()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | ✓ | Düşük (ürün kapsamlı) |
| 28 | Müşteri kupon cüzdanı | `/customers/[id]` | `listCustomerCoupons()` | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük |
| 29 | Sipariş kalemleri | `/orders/[id]` | sipariş gövdesinde | **CS** | — | — | — | — | — | — | ✓/✓/✓ | — | Düşük (sipariş kapsamlı) |

### Görevde adı geçip projede KARŞILIĞI OLMAYAN ekranlar

Bunlar için ekran uydurulmadı:

- **Depolar**: ayrı yönetim ekranı yok; depo, Envanter ekranındaki seçicidir (`listWarehouses`).
- **Kuponlar**: ayrı liste ekranı yok. Kupon, Kampanya taksonomisinin bir türüdür
  (ADR-060); müşteri bazlı cüzdan `/customers/[id]` altındadır.
- **Import / Export**: genel bir içe/dışa aktarma ekranı yok. Tek içe aktarma yüzeyi
  kargo tarife matrisi CSV yapıştırmasıdır (`/shipping/rates`).
- **Marka / Vendor**: bunlar Product kolonlarıdır, ayrı katalog varlığı değildir.
  (TODO-159A ile marka/tedarikçi DISTINCT değerleri için hafif bir uç eklendi.)
- **Redirect / Slug yönetimi**: TODO-156D ile backend + storefront çözümü var, ancak
  store-admin'de yönetim ekranı YOK.

---

## 2. Tespit edilen ana eksikler

### 2.1 "Sessiz ilk sayfa" defekti (en kritik)

`storeApi.listProducts()`, `listCategories()`, `listCustomers()` argümansız çağrılıyordu.
Gateway varsayılanı `limit=50` olduğundan **her ekran sessizce yalnız ilk 50 kaydı**
gösteriyordu: ne "sayfa 1/N" bilgisi, ne toplam kayıt, ne de sonraki sayfaya geçiş vardı.
Enterprise-demo mağazasında (471 ürün) bu, **kataloğun %89'unun panelde erişilemez
olması** demekti. Aynı defekt kampanya ve home showcase ürün seçicilerinde de vardı —
orada etkisi daha sinsi: kullanıcı "ürün yok" sanıp yanlış içerik yayımlayabilir.

### 2.2 Sayfalanmış veriden hesaplanan özet metrikler

Ürün / müşteri / sipariş ekranlarındaki özet kartları (`aktif ürün`, `üye sayısı`,
`ciro`…) o an yüklü diziden hesaplanıyordu. Sayfalama gelince bu rakamlar "mağaza
geneli" gibi görünüp aslında "bu sayfa" anlamına gelir — yanıltıcıdır.

### 2.3 Sınırsız veri çeken uçlar

`GET /stores/:id/inventory/matrix` **hiçbir sayfalama sınırı taşımıyor**: mağazadaki
tüm non-archived varyantlar + bakiyeleri tek yanıtta dönüyor (enterprise-demo: 2202
varyant). Ekran ayrıca arama/filtreyi tamamen istemcide yapıyor.

### 2.4 Sayfalamasız koleksiyon uçları

`campaigns`, `attributes`, `attribute-groups`, `attribute options`, `home/sections`,
`hero-slides`, `themes`, `shipping/rate-plans`, `shipping/providers`,
`payment-providers` uçları `{ data: [...] }` döner — pagination meta'sı YOKTUR.
Bugün küçük kümeler oldukları için sorun görünmüyor; ancak sözleşme büyümeye kapalıdır.

### 2.5 Medya kütüphanesinde sabit tavan

`GET /stores/:id/media` `take: 100` sabitiyle çalışır ve pagination meta'sını
`{limit:100, offset:0, total}` olarak **yanlış** doldurur (offset hiç uygulanmaz).
100'den fazla görsel yüklenmiş bir mağazada eski görseller kütüphaneden seçilemez.

### 2.6 URL state yokluğu

Yalnız Siparişler ekranı filtrelerini URL'de tutuyordu. Diğer tüm ekranlarda sayfa
yenileme / geri tuşu / link paylaşımı durumu kaybediyordu.

### 2.7 Erişilebilirlik ve kullanım

- Tablo başlıkları yapışkan değildi: uzun listelerde kolon adları kayboluyordu.
- Sıralama arayüzü hiçbir ekranda yoktu (`aria-sort` da yoktu).
- Boş sonuç, "hiç kayıt yok" ile "filtreye uyan kayıt yok" ayrımını yapmıyordu
  (Siparişler hariç).

### 2.8 Performans / güvenlik gözlemleri

- **N+1 yok**: liste yolları toplu `select`/`findMany` kullanıyor. Müşteri listesi
  her satır için `orders` + `addresses` çekiyor; bu bir N+1 değil (tek sorguda nested)
  ancak sayfa boyutuyla doğru orantılı ağırlaşıyor → sayfalama bunu da sınırlar.
- **Tenant izolasyonu**: tüm liste uçları `requireStorePlatformAdmin` + `where.storeId`
  ile korunuyordu; denetimde tenant sızıntısı BULUNMADI.
- **Index**: `Product` üzerinde `(storeId)` vardı ama `(storeId, createdAt)` yoktu →
  varsayılan sıralama her sayfada ayrı sort adımı gerektiriyordu.

---

## 3. Bu iş paketinde yapılanlar

**Ortak altyapı (ADR-089):** `adminListQueryBaseSchema` + `adminListPaginationSchema`
+ `resolveAdminListPage` / `buildAdminListPagination` (contracts) ve store-admin
`components/data-grid/` bileşen ailesi (URL state motoru, araç çubuğu, tablo,
sayfalama çubuğu).

| Ekran | Durum | Kazanılanlar |
|-------|-------|--------------|
| Ürünler | **Tam uygulama** | Arama (ad/slug/SKU/barkod/marka/tedarikçi), 8 filtre, 8 sıralama, 25/50/100 sayfalama, tam URL state |
| Kategoriler | **Taşındı** | Arama (ad/slug), durum filtresi, 5 sıralama, sayfalama, URL state |
| Müşteriler | **Taşındı** | Arama (e-posta/ad/soyad/telefon), durum + üyelik filtresi, 6 sıralama, sayfalama, URL state |
| Siparişler | **Kısmen taşındı** | Sayfalama + sıralama + ortak sayfalama çubuğu eklendi; mevcut zengin filtre paneli (tarih aralığı + 3 durum) bilinçli olarak KORUNDU |

**Taşınmayanlar ve gerekçeleri** ayrı borç kayıtlarına dönüştürüldü: TD-091 (envanter
matrisi), TD-092 (sayfalamasız koleksiyon uçları), TD-093 (ürün/kategori seçicileri),
TD-094 (arama indeksi), TD-095 (medya kütüphanesi sayfalaması). Bunların hepsi ya
sözleşme değişikliği ya da yeni bir seçici bileşeni gerektirdiği için tek PR'ı
kontrolsüz büyütmemek adına ayrıldı.

---

## 4. Doğrulama (enterprise-demo, gerçek Postgres)

Yerel gateway + docker Postgres (`edm-store`, 471 ürün / 2202 varyant) ile:

| Senaryo | Sonuç |
|---------|-------|
| Varsayılan istek | 25 kayıt · `totalItems=471` · `totalPages=19` |
| `page=2` | offset=25 · doğru dilim |
| `page=19` (son sayfa) | 21 kayıt |
| `pageSize=100` | 100 kayıt · `totalPages=5` |
| `pageSize=500` | **400** (sunucu üst sınırı) |
| `search=kahve` | 4 kayıt |
| `search=%` (wildcard kaçırma) | 0 kayıt — kontrolsüz tarama üretmiyor |
| `status=DRAFT` / `ACTIVE` | 22 / 418 |
| `stockStatus=OUT_OF_STOCK` / `IN_STOCK` | 13 / 458 (13+458 = 471 ✓) |
| `brand=Apple` | 14 |
| `sortBy=price\|stock\|title` (asc+desc) | Tümü beklenen uçlarla |
| `sortBy=hack` | **400** (allowlist) |
| Başka mağaza (`demo-store`) | 8 ürün — izolasyon korunuyor |
| `EXPLAIN` varsayılan sorgu | `Index Scan Backward using Product_storeId_createdAt_idx` |

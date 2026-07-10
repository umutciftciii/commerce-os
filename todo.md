# Storefront Premium Redesign — Takip Listesi

> Bu dosya, storefront premium redesign sırasında **mock/statik veriyle** gösterilen
> ama gerçek backend karşılığı olmayan özellikleri kayıt altına alır. Her madde,
> canlıya alınmadan önce gerçek veriyle değiştirilmesi gereken bir görevi temsil eder.
> Kod içinde her mock kullanım `// MOCK: <özellik> — gerçek veri kaynağı yok, bkz. todo.md`
> yorumuyla işaretlenir.

---

## 🔴 [ÖNKOŞUL] Ürün görselleri — backend medya altyapısı

> **Bu bir "nice to have" değil, tüm redesign'ın önkoşuludur.** Tasarım yönü
> (Ssense/Net-a-Porter) "büyük, kaliteli ürün görselleri ön planda" diyor; ancak
> Prisma `Product`/`ProductVariant` modellerinde **hiçbir görsel/medya alanı yok**
> ve public DTO'da da yok. Şu an `ProductCard` gri gradient placeholder gösteriyor.

- **Nerede kullanılıyor:** Home > Hero paneli (`HeroVisual`), Kategori vitrin kartları, Editöryel blok, Öne çıkan ürün kartları ve **PLP ürün kartı** (`components/ui/product-card.tsx`, Adım 3) — hepsi tek `productImageSrc(handle)` kancasından beslenir; ayrıca ileride PDP galeri. **Adım 3:** `ProductMedia` artık opsiyonel `imageUrl` prop'u kabul eder (yeni `ProductCard` de) → gerçek kapak URL'i gelince `src` çözülür, `<img className="object-cover">` render edilir; çağıran taraf DEĞİŞMEZ (drop-in).
- **Neden gerekli:** Premium vitrin görsel-öncelikli bir deneyimdir; görsel olmadan tasarım hedefi (whitespace + büyük görsel) fiziksel olarak kurulamaz.
- **Şu an nasıl mock'lanacak:** Statik/placeholder görsel katmanı (deterministik, ürün handle'ına göre stabil; `next/image` uyumlu). Gradient yerine tutarlı bir "görsel yok" kompozisyonu + hazır olduğunda gerçek URL'e geçecek tek nokta (ör. `productImage(handle)` helper).
- **Gerçek entegrasyon için gereken:**
  1. Prisma: `ProductImage` modeli (productId/variantId, url, alt, sortOrder) veya `Product.images Json` + migration.
  2. Medya yükleme/depolama (S3/CDN) + store-admin ürün formu görsel yükleme UI'ı.
  3. Public DTO'ya `images[]` allowlist alanı (`publicProductSchema`) + gateway projeksiyonu.
  4. Storefront `catalog.ts` → `StorefrontProductSummary.images` map + `next.config` `images.remotePatterns`.
- **Öncelik önerisi:** **En Yüksek (P0 / önkoşul).**

---

## 🟠 [ALTYAPI] Multi-tenant theming (per-store tema)

> Redesign'ın token'ları bilinçli olarak **statik değil, `[data-theme]` üzerinden
> override edilebilir CSS custom property** olarak kuruldu (renk + font ailesi
> dahil). Bu, her müşterinin/mağazanın kendi temasını alabilmesi için gereken
> **altyapı temelidir**; ancak temayı besleyen **store resolution + tema değeri
> kaynağı henüz yok** (redesign kapsamı dışı — Faz 6).

- **Nerede kullanılıyor:** Tüm vitrin — `apps/storefront-web/app/globals.css` (`:root` / `[data-theme="default"]` token'ları), `layout.tsx` `data-theme` attribute'u, `tailwind.config.cjs` `var(--…)` eşlemeleri.
- **Neden gerekli:** Çok kiracılı SaaS'ta her mağaza kendi rengini/fontunu/görsel kimliğini almalı; tek sabit tema kurumsal ürün için yetersiz.
- **Şu an nasıl:** Yalnızca `default` tema tanımlı; `layout.tsx` sabit `data-theme="default"` yazar. Token mimarisi override'a hazır ama besleyen veri yok.
- **Gerçek entegrasyon için gereken:**
  1. Store resolution (domain/slug → mağaza) — **Faz 6** (bu redesign'da kapsam dışı tutuldu).
  2. Mağaza tema modeli (renk paleti + font seçimi + logo) — Prisma `StoreTheme` veya `Store.metadata.theme`.
  3. Public tema projeksiyonu + `layout.tsx`'te çözülen mağazaya göre `data-theme` / inline CSS-var enjeksiyonu.
  4. (Opsiyonel) Store-admin tema editörü UI'ı.
- **Öncelik önerisi:** **Yüksek** (altyapı hazır; Faz 6 store resolution'a bağlı).

---

## [MOCK] Favoriler / Wishlist
- **Nerede kullanılıyor:** Home > ürün kartı sağ-üst kalp düğmesi (`components/site/product-card.tsx`); header favori ikonu (mevcut hesap bölümüne link).
- **Neden gerekli:** Premium vitrinde standart kaydet/geri dön davranışı; keşif deneyimini artırır.
- **Şu an nasıl mock'landı:** Kalp düğmesi client-side geçici `saved` state ile dolup boşalır; **persist YOK** (sayfa yenilenince sıfırlanır).
- **Gerçek entegrasyon için gereken:** `Wishlist`/`CustomerFavorite` modeli (customerId, variantId), müşteri-auth'a bağlı ekle/çıkar endpoint'i, projeksiyon.
- **Öncelik önerisi:** Orta.

## [MOCK] Hızlı bakış (quick view)
- **Nerede kullanılıyor:** Home > öne çıkan ürün kartı hover'ında "Hızlı bakış" düğmesi → modal.
- **Neden gerekli:** Premium keşif; kullanıcı listeden çıkmadan ürüne göz atar.
- **Şu an nasıl mock'landı:** Modal mevcut özet veriyle (başlık/fiyat/kampanya — GERÇEK) doldurulur; ekstra istek yok. Varyant seçimi / sepete ekleme YOK; "Ürünü incele" ile tam PDP'ye yönlendirir. Kod: `components/site/product-card.tsx` `QuickView`.
- **Gerçek entegrasyon için gereken:** Quick view'da varyant + sepete ekle (mevcut buy-box mantığının hafif sürümü) + görsel galerisi (P0 görsel).
- **Öncelik önerisi:** Orta.

## [MOCK] Ürün puanlama & yorumlar (rating & reviews)
- **Nerede kullanılıyor:** Home > ürün kartı ve hızlı bakış modalında yıldız + değerlendirme sayısı (`components/site/product-card.tsx` `mockRating`/`Stars`).
- **Neden gerekli:** Güven ve dönüşüm için premium vitrinlerde neredeyse zorunlu.
- **Şu an nasıl mock'lanacak:** Statik yıldız + yorum sayısı; i18n'de zaten `ratingPlaceholder` var. Gerçekçi ama açıkça mock; yanıltıcı kesinlik iddiası yok.
- **Gerçek entegrasyon için gereken:** `ProductReview` modeli (rating, body, customerId, status/moderation), yorum yaz/oku endpoint'leri, ürün başına ortalama agregasyonu.
- **Öncelik önerisi:** Orta.

## [MOCK] Kategori vitrini (görsel kartlar)
- **Nerede kullanılıyor:** Home > Kategori vitrin section'ı (3-4 büyük kart).
- **Neden gerekli:** Premium home'da görsel-ağırlıklı kategori girişi standarttır.
- **Şu an nasıl mock'lanacak:** Kategori adları ürünlerin `categoryLabel` alanından türetilir (gerçek isimler); ancak kategori **görseli ve public kategori listeleme ucu yok** → kart görselleri mock, kategori linki `/products`e (ileride `?category=`).
- **Gerçek entegrasyon için gereken:** Public `GET /public/stores/:slug/categories` ucu + kategori görseli alanı; PLP kategori filtresi.
- **Öncelik önerisi:** Orta.

## [MOCK] Newsletter (bülten) kaydı
- **Nerede kullanılıyor:** Home > footer üstü bülten bandı.
- **Neden gerekli:** Premium vitrinlerde tipik yeniden-pazarlama girişi.
- **Şu an nasıl mock'lanacak:** E-posta input + gönder butonu; submit client-side "teşekkürler" durumu, persist yok.
- **Gerçek entegrasyon için gereken:** `NewsletterSubscription` modeli veya notification-service entegrasyonu; KVKK/onay akışı.
- **Öncelik önerisi:** Düşük.

## 🟠 [ALTYAPI] PLP filtreleme / sıralama / sayfalama — backend query ucu
- **Nerede kullanılıyor:** Ürün listeleme sayfası araç çubuğu (`components/site/product-listing.tsx`) — kategori filtresi + sıralama; PLP sayfası (`app/products/page.tsx`) tüm ürünleri tek seferde çeker (`getStorefrontListing`).
- **Neden gerekli:** Katalog büyüdükçe (yüzlerce ürün) client-side filtre/sıralama + tek istekte tüm liste ölçeklenmez; sunucu-tarafı filtre/sıralama/sayfalama gerekir.
- **Şu an nasıl (mock DEĞİL, ama sınırlı):** Public `GET /public/stores/:slug/products` ucu **query parametresi desteklemiyor** (sort/filter/category/search/pagination YOK). Bu yüzden filtre/sıralama **eldeki gerçek veriyle istemcide** yapılır — sahte alan/uydurma sonuç yok:
  - Kategori filtresi: ürünlerin gerçek `categoryLabel` değerlerinden türetilir.
  - Fiyat sıralaması: gerçek `sortPriceMinor` (en ucuz görünür varyant, `catalog.ts`) ile; fiyatı gizli/talep olanlar sona düşer.
  - İsim sıralaması: başlık `localeCompare("tr")`.
- **Eksik (deferred):** **"Yeni gelenler" sıralaması** — özet DTO'da `createdAt/publishedAt` **tarih alanı yok**; dürüst uydurma yapılmadığından bu seçenek **eklenmedi**. Ayrıca sunucu-tarafı `sort`/`filter`/`search` + sayfalama (offset/limit zaten response'ta var ama UI'a bağlı değil).
- **Gerçek entegrasyon için gereken:**
  1. Public liste ucuna query desteği: `?sort=price_asc|price_desc|name|newest&category=<slug>&q=<search>&limit/offset`.
  2. Özet DTO'ya sıralanabilir `createdAt`/`publishedAt` alanı (newest için).
  3. Public `GET /public/stores/:slug/categories` (kategori kimliği + sayaç) — filtreyi handle bazlı yapmak için.
  4. PLP'de sunucu-tarafı sayfalama / "daha fazla yükle".
- **Öncelik önerisi:** **Orta-Yüksek** (küçük katalogda mevcut istemci yaklaşımı yeterli; ölçek büyüyünce zorunlu).

## [MOCK] Arama otomatik tamamlama
- **Nerede kullanılıyor:** Header arama alanı (yeni).
- **Neden gerekli:** Premium keşif deneyimi.
- **Şu an nasıl mock'lanacak:** Public arama ucu yok (search-service storefront'a bağlı değil). İstemci-tarafı, mevcut ürün listesi üzerinde basit filtre veya statik öneri; yanıltıcı "sonuç sayısı" iddiası yok.
- **Gerçek entegrasyon için gereken:** Public arama/öneri ucu (search-service köprüsü).
- **Öncelik önerisi:** Düşük.

## [MOCK] Sosyal kanıt ("bugün X kişi görüntüledi")
- **Nerede kullanılıyor:** (Değerlendiriliyor) Öne çıkan ürün / PDP.
- **Neden gerekli:** Aciliyet/güven — ancak abartısız ve dürüst kullanılmalı.
- **Şu an nasıl mock'lanacak:** **Öneri: dahil ETME.** Gerçek görüntülenme verisi yok; sahte sayaç yanıltıcı olur (prompt'un mock politikasına aykırı). Yalnızca gerçek veri (stok kıtlığı) ile aciliyet gösterilecek.
- **Gerçek entegrasyon için gereken:** Analytics-service görüntülenme sayacı + public agregasyon.
- **Öncelik önerisi:** Düşük (veya kapsam dışı).

---

## ✅ Gerçek veriyle bağlanacaklar (mock DEĞİL)
- **Stok / kıtlık göstergesi** — `available`, `inStock`, `lowStockThreshold` gerçek; i18n `stockLow` ("Son birkaç ürün") mevcut.
- **Kampanya / indirim rozetleri** — F4A serisi, tamamen gerçek (otomatik indirim, public kupon, Omnibus).
- **Benzer / ilgili ürünler** — PDP detay ucu `related[]` gerçek dolduruyor.
- **Fiyat görünürlüğü / satış modeli CTA'ları** — gerçek (F2D/F4x).

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
- **Nerede kullanılıyor:** Home ürün kartı + hızlı bakış modalı **ve PDP başlığı** (yıldız + değerlendirme sayısı). TEK KAYNAK: deterministik helper `lib/mock-rating.ts` (`mockRating`) + paylaşılan `components/ui/stars.tsx` (`Stars`); Home kartı (`components/site/product-card.tsx`) ve PDP (`app/products/[handle]/page.tsx`) aynısını kullanır.
- **Neden gerekli:** Güven ve dönüşüm için premium vitrinlerde neredeyse zorunlu.
- **Şu an nasıl mock'landı:** Handle'dan deterministik yıldız (4.0–5.0) + yorum sayısı; SSR/CSR ve tüm yüzeyler (Home/PLP/PDP) tutarlı. Gerçekçi ama açıkça mock; yanıltıcı kesinlik iddiası yok. (Not: PDP eskiden statik `★★★★★` + `ratingPlaceholder` gösteriyordu — Home ile TUTARSIZDI; artık ortak helper'a alındı, iki yerde ayrışmıyor. `detail.ratingPlaceholder`/`reviewCountPlaceholder` i18n anahtarları artık PDP'de kullanılmıyor.)
- **Gerçek entegrasyon için gereken:** `ProductReview` modeli (rating, body, customerId, status/moderation), yorum yaz/oku endpoint'leri, ürün başına ortalama agregasyonu. Gelince yalnızca çağıran taraf gerçek ortalamaya geçer.
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

## [MOCK] PDP görsel galerisi — tekil görsel, thumbnail şeridi YOK
- **Nerede kullanılıyor:** Ürün detay sayfası sol sütun (`app/products/[handle]/page.tsx` `Gallery`).
- **Neden gerekli:** Premium PDP'de büyük kapak + thumbnail şeridi (çoklu açı/detay görseli) standarttır.
- **Şu an nasıl mock'landı:** Tek büyük `ProductMedia` (4:5, `imageUrl`/`productImageSrc` drop-in kancalı; gerçek görsel gelince çağıran taraf DEĞİŞMEZ). Önceki 4 sahte gradient thumbnail **kaldırıldı** — çoklu görsel backend'i olmadan hepsi aynı placeholder olurdu (yanıltıcı + ekstra mock). Ekstra mock üretilmedi.
- **Gerçek entegrasyon için gereken:** P0 görsel backend'i (`images[]` public DTO) — özellikle **ürün başına birden çok görsel**; sonra thumbnail şeridi + seçili görsel state'i eklenir.
- **Öncelik önerisi:** P0 görsele bağlı (görsel altyapısı gelince).

## [MOCK] Sepet satırı ürün görseli — DTO'da `imageUrl` yok
- **Nerede kullanılıyor:** Sepet satırı (`components/cart-view.tsx` `CartLineRow`) ve checkout/ödeme sipariş özeti satırları.
- **Neden gerekli:** Premium sepet, ürünü küçük bir kapak görseliyle (thumbnail) hatırlatır; PLP/PDP'deki `ProductMedia` dili sepette de beklenir.
- **Şu an nasıl (mock DEĞİL, eksik):** Sepet satırı **metin-tabanlı** (başlık/varyant/SKU/adet/fiyat) — görsel YOK. `CartLineView` DTO'sunda (`lib/server/cart.ts`) ve public cart line şemasında (`publicCartLineSchema`) `imageUrl` **alanı yok**. Sahte thumbnail eklenmedi (P0 görsel önkoşuluna bağlı; yanıltıcı olurdu).
- **Gerçek entegrasyon için gereken:** P0 görsel backend'i → public cart line DTO'suna `imageUrl` allowlist alanı + gateway projeksiyonu; sonra `CartLineRow`/checkout özetine `ProductMedia` (drop-in `imageUrl`) eklenir. Çağıran taraf mimarisi hazır (PLP/PDP ile aynı kanca).
- **Öncelik önerisi:** P0 görsele bağlı.

---

## ✅ [YAPILDI] Cart/Checkout design system göçü — Adım 4 (kısmi)
- **Tamamlanan:** `components/cart-view.tsx` + `app/cart/page.tsx` + yeni `app/cart/loading.tsx` vitrin DS'ine göçtü (yerel `components/ui` barrel + `ink/surface/line/accent` token'ları, serif başlık). Aksan (menekşe) yalnız tekil birincil CTA'da ("Ödemeye geç" = `variant="cta"`); indirim/kupon yüzeyleri NOTR (PDP `DetailCouponCard` dili). Kupon claim/apply akış mantığı, `useTransition` + `disabled` bağları DEĞİŞMEDİ. Güvenlik ağı: `test/checkout-form-render.test.tsx` + `test/payment-tester-render.test.tsx` (MOCK guard) eklendi.
- **Tamamlanan (bu checkpoint):** `components/checkout-form.tsx` + `app/checkout/page.tsx` vitrin DS'ine göçtü. `@commerce-os/ui` importları tamamen kaldırıldı (0); `Alert`/`Card` → hairline DS kutular, `Input`/`Select` → yerel `field.tsx` (etiketler `Field` shell ile uppercase DS), kart başlıkları `Subheading as="h2"` (cart ile birebir), sayfa h1 serif `Heading`. Submit butonu artık YEREL `Button variant="cta"` (accent) — tek accent kullanımı; `emerald` (ücretsiz kargo/indirim) → NOTR `ink`. Palet: `slate/brand/emerald` → `ink/surface/line/accent`. **Davranış korundu:** billing `sameAsShipping`/`billingDifferent`/`billingType` hidden input + state, kargo `role="radiogroup"` + hidden `shippingOptionId` + `selectShippingOptionAction`, TCKN anlık doğrulama, il/ilçe bağımlı dropdown, `useActionState`/redirect zinciri DEĞİŞMEDİ. Form `name` alanları (23) göç öncesi/sonrası birebir aynı (server action sözleşmesi). Guard `checkout-form-render.test.tsx` 6/6 yeşil; storefront 148 test + typecheck + build yeşil. Hata border'ı `!` important ile deterministik (`cn` tailwind-merge değil).
  - **Tespit (bu checkpoint):** Worktree'de bağımlılıklar kurulu değildi + workspace paket `dist`'leri yoktu; gate'lerden önce `pnpm install` + `turbo run build --filter=./packages/*` gerekti (memory `gate-ordering-prereqs`/`worktree-path-and-turbo-gotcha` ile uyumlu). Testler worktree kökünden `npx vitest` ile çalışır (root `vitest.config.ts`), `apps/storefront-web` içinden değil (react/jsx-dev-runtime çözülmez).
- **Tamamlanan (bu checkpoint):** `components/checkout-success.tsx` vitrin DS'ine göçtü. `@commerce-os/ui` importları tamamen kaldırıldı (0): `Card` → hairline yüzey (`border border-line bg-surface`), `Alert tone="info"` → nötr not kutusu (`bg-surface-muted` + `role="status"`, cart-view deseni), `Button`+`Link` → tekil yerel `ButtonLink variant="cta"` (iç içe sarmalama kaldırıldı). Başlık serif `Heading`; kart bölüm etiketleri (`shippingOptionTitle`/`shippingTitle`/`billingTitle`) uppercase `Eyebrow`. Palet: `slate×30 + emerald×4` → `ink/surface/line`. "Başarı" rengi (emerald) NÖTR ink'e indirildi; onay sinyali **dolu ink disk + ✓** ile ayrışır (renk taşımaz). İndirim/ücretsiz-kargo satırları NOTR `ink` (`Row`'dan `tone` kaldırıldı; "−" işareti + ücretsiz metni caller'da aynen). Accent (menekşe) YALNIZ tekil CTA'da (1 kullanım). **Davranış korundu:** cookie okuma/imza doğrulama, `confirmation.*` veri bağları (sorted-diff birebir IDENTICAL), koşullu render (shippingOption/shippingAddress/billing/paymentPending), `/products` routing DEĞİŞMEDİ — yalnız görsel katman. `app/checkout/success/page.tsx` KAPSAM DIŞI (dokunulmadı, hâlâ `@commerce-os/ui` Container/EmptyState kullanır, çalışır durumda). Gate: lint + 148 test + build(tsc) yeşil.
- **Tamamlanan (son checkpoint — Adım 3 SON):** `components/payment-tester.tsx` vitrin DS'ine göçtü. `@commerce-os/ui` importları tamamen kaldırıldı (0): `Card` → hairline yüzey (`border border-line bg-surface`), `Alert` (warning/error) → hairline nötr not kutuları (`role="alert"` + `bg-surface-muted`; guard mesajı `text-ink`, ödeme hatası `text-red-600`), `Input`/`Select` (eski `label` prop'lu API) → yerel `field.tsx` + `Field` shell (uppercase DS etiketleri), başlıklar serif `Heading as="h1"`, kart bölüm başlığı `Subheading`, başarı/ödeme/adres/fatura etiketleri `Eyebrow`. Palet: `slate×54 + brand + indigo + emerald` → `ink/surface/line/accent`. "Başarı" (emerald) NÖTR ink'e indirildi (onay = **dolu ink disk + ✓**); 3DS (indigo) NÖTR'e indirildi (**dolu ink "3D" rozeti**); taksit "vade farksız" notu (emerald) → `ink-subtle`. Accent (menekşe) her fazda YALNIZ tekil birincil CTA'da: ödeme submit / 3DS onay / siparişlerim (`variant="cta"`); "Kullan"/3DS-fail/alışverişe-devam NÖTR `secondary`. **Davranış korundu (KRİTİK):** MOCK-first guard (`state.provider !== "MOCK"` koşulu + `providerNotConfiguredTitle/Description` mesajı BİREBİR aynı), `submitTestPaymentAction` POST `/payment` çağrısı + payload, `validate()`/Luhn, taksit hesabı (`perInstallmentMinor` — sahte faiz YOK), test kartları (`TEST_CARDS`), faz makinesi (form/processing/paid/failed/requires_action), 3DS akışı, `syntheticResultFromState`/`failurePhaseFromReason`, `/products`+`/account?section=orders` redirect zinciri DEĞİŞMEDİ — yalnız palet/tipografi. Güvenlik ağı `test/payment-tester-render.test.tsx` (MOCK guard) 3/3 yeşil; storefront tüm test + typecheck + build yeşil.

## ✅ [YAPILDI] PDP buy-box — otomatik kampanya fiyatı üzeri-çizili hiyerarşiye geçti
- **Değişen:** `components/buy-box.tsx` — YALNIZ otomatik indirim (`AUTOMATIC_CART_DISCOUNT`) **ve** sunucu güvenli nihai fiyat (`estimatedFinalLabel`) verdiğinde fiyat bloğu görseli. Eski gösterim: ana fiyat büyük üstte + ayrı "SEPETTE ₺X %10 Kod gerekmez" kutusu (iki blok görsel ağırlıkça yakındı → indirim net değildi). Yeni hiyerarşi tek blokta: **[üzeri çizili liste fiyatı (küçük, nötr `ink-subtle`)] → [büyük/kalın indirimli nihai fiyat + %rozet] → [Kod gerekmez · alt limit]**. Böylece indirimli fiyat sayfadaki "asıl" fiyat olur.
- **Değişmeyen (mantık/veri):** `DetailCampaign`/`DetailCouponCard` fonksiyonlarına DOKUNULMADI; `estimatedFinalLabel`/`discountText`/`minOrderLabel` sunucudan geldiği gibi kullanılır (hesap yok). Public kupon kartı (TEST250 claim/copy akışı) aynen. Guvenli tahmin YOKKEN (`estimatedFinalLabel` null) fallback kutusu hâlâ `DetailCampaign`'da. Omnibus notu (`lowestRecentLabel`) korunur (üzeri çizili fiyatın altında küçük not). Accent (#735389) fiyat bloğunda kullanılmadı (indirim rozeti dolu `ink`). `packages/ui` değişmedi.
- **Uygulama detayı:** Çift render önlemek için `DetailCampaign` çağrısı `!showAutoPriceBlock` ile korundu — otomatik+tahmin durumunda kampanya yalnız üstteki fiyat bloğunda görünür. `showAutoPriceBlock` true iken `Birim fiyat` notu bastırıldı (üzeri çizili fiyatla tekrar olmasın).
- **⚠️ Cart-view tutarlılık notu (bu turda DOKUNULMADI):** `components/cart-view.tsx` indirim gösterimi **satır-ledger** biçimidir (ara toplam → `−indirim satırı` → kalın `grandTotal`), PDP ise tek ürün **başlık-fiyat** biçimi. İkisi farklı bağlam olduğu için layout doğal olarak ayrışır; ANCAK **görsel dil tutarlıdır**: her ikisinde de (a) accent YOK, (b) nihai ödenecek tutar en güçlü ağırlıkta (kalın `ink`), (c) indirim ikincil/nötr. Yani çelişki yok — cart-view değişikliği GEREKMEZ. Yine de ileride istenirse cart özetinde ara-toplam'ı da "üzeri çizili" gösterme opsiyonu değerlendirilebilir (düşük öncelik).

## [MOCK] Taksit gösterimi — gerçek faiz/oran motoru YOK
- **Nerede kullanılıyor:** Test ödeme ekranı (`components/payment-tester.tsx`): taksit seçimi + `InstallmentSummary` ("N taksit × ₺X") ve başarılı ödeme özetindeki taksit satırı. Tek kaynak helper: `perInstallmentMinor(totalMinor, count)`.
- **Şu an nasıl mock'landı:** Toplam DEĞİŞMEZ; tutar taksit sayısına **eşit bölünür** (`Math.round(total / count)`) — vade farkı / faiz / banka oranı UYGULANMAZ. "Vade farksız" notu bilinçli gösterilir; son taksitteki olası kuruş farkı UI'da iddia edilmez. Test ödemesi MOCK adapter'ı sürdüğü için gerçek tahsilat da yok.
- **Neden gerekli:** Gerçek taksitlendirmede banka/BIN'e göre vade farkı, min. tutar, kampanyalı taksit ve komisyon oranları vardır; nihai tutar taksit sayısına göre değişir.
- **Gerçek entegrasyon için gereken:** Ödeme sağlayıcısı (IYZICO/PAYTR/…) taksit/oran sorgu ucu (BIN → uygun taksit + vade farkı matrisi) + sunucu-otoriter taksitli tutar hesabı; `perInstallmentMinor` gerçek plan tutarıyla değiştirilir. Guard: gerçek provider seçiliyken test ekranı zaten kart formunu gizler (`provider !== "MOCK"`).
- **Öncelik önerisi:** Gerçek ödeme sağlayıcısı entegrasyonuna bağlı (P1+).

## [MOCK] PDP ürün içeriği — türetilmiş/statik alanlar (spec · paket · kullanım · fayda)
- **Nerede kullanılıyor:** PDP orta bölüm (`app/products/[handle]/page.tsx`): "Teknik özellikler", "Paket içeriği", "Kullanım ve bakım", "Öne çıkanlar".
- **Neden gerekli:** Karar merkezinde ürüne özel açıklama/spesifikasyon dönüşümü ciddi etkiler.
- **Şu an nasıl (mock/türetilmiş):**
  - **Teknik özellikler:** ürüne özel spec alanı YOK; tablo mevcut alanlardan (marka/kategori/SKU/varyant başlıkları/satış türü) **türetilir** — gerçek ama sınırlı, yapılandırılmış öznitelik değil.
  - **Paket içeriği / Kullanım ve bakım:** ürüne özel değil; i18n'de **statik ortak metin** (`detail.packageBody`/`usageBody`) — tüm ürünlerde aynı.
  - **Öne çıkanlar (benefits):** ürüne özel değil; statik i18n listesi (`detail.benefits`).
- **Gerçek entegrasyon için gereken:** Ürün modeline yapılandırılmış öznitelik/spesifikasyon (key-value grup), zengin açıklama (paket/kullanım) alanları + store-admin ürün formu; public DTO'ya taşınması.
- **Öncelik önerisi:** Orta.

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

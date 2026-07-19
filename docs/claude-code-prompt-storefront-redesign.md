# Commerce-OS Storefront Premium Redesign — Claude Code Prompt

> Kullanım: Bu prompt'u Claude Code'a birebir yapıştır. Adımlar sırayla ilerleyecek şekilde tasarlandı; her adımın sonunda kontrol noktası var, istersen tek seferde tamamını da verebilirsin.

---

## BAĞLAM

Commerce-OS, pnpm workspace + Turborepo ile yönetilen çok kiracılı (multi-tenant) bir e-ticaret SaaS platformu. Stack: Next.js, React, TypeScript, TailwindCSS, Prisma, PostgreSQL, Docker.

Backend, checkout, sipariş, kargo ve kampanya modülleri fonksiyonel olarak tamamlanmış durumda ve production'da çalışıyor. Şu anki en kritik eksik: **storefront'un tasarımı çok basic, kurumsal/premium bir his vermiyor ve tutarlı bir design system'e sahip değil.**

Bu görev bir feature geliştirme değil, **görsel/deneyimsel bir redesign**. Mevcut fonksiyonaliteyi (cart, checkout, sipariş akışı vb.) bozmadan, üzerine premium bir arayüz katmanı inşa edeceğiz.

---

## ÖNCE: KEŞİF (kod yazmadan önce mutlaka yap)

1. Repo yapısını incele (`apps/`, `packages/`, `services/` altında storefront hangi app içinde, hangi path'te).
2. Mevcut storefront'ta kullanılan component'leri, Tailwind config'i, varsa mevcut tema/token yapısını çıkar.
3. Home sayfasının şu anki kodunu ve render ettiği section'ları listele.
4. Ürün, kategori, sepet gibi veri modellerinin (Prisma şeması / DTO) Home sayfasında kullanılan kısımlarını tespit et.
5. Bunları özetleyip bana kısa bir "mevcut durum" raporu ver, ben onay verince sıradaki adıma geç.

**Kod yazmaya bu adım tamamlanmadan başlama.**

---

## KEŞİF SONRASI: PREMIUM E-TİCARET GAP ANALİZİ

Kod yazmadan önce bir **gap analizi** yap: premium bir e-ticaret storefront'unda (Ssense, Net-a-Porter tarzı) tipik olarak bulunan ama Commerce-OS'ta şu an mevcut olmayabilecek özellikleri listele. En azından şunları değerlendir:

- Favoriler / wishlist
- Hızlı bakış (quick view) modal'ı
- Stok durumu / "son X adet" gibi kıtlık göstergeleri
- Ürün puanlama & yorumlar
- Benzer/ilgili ürün önerileri, "birlikte alınanlar"
- Beden rehberi / kişiselleştirilmiş öneriler
- Bülten (newsletter) kaydı
- Arama otomatik tamamlama / öneri
- Sosyal kanıt (örn. "bugün X kişi görüntüledi" gibi unsurlar — dikkatli ve abartısız kullanılmalı)

Her biri için mevcut Prisma şeması / DTO / API'de karşılığı olup olmadığını kontrol et. Sonucu iki gruba ayır:

1. **Mevcut altyapıda karşılığı var** → gerçek veriyle bağla.
2. **Mevcut altyapıda karşılığı yok** → Home tasarımında **mock/statik veri ile** göster (bkz. aşağıdaki "Mock Politikası"), ve bunu `todo.md`'ye görev olarak ekle.

Bu analizi bana özetle, onayımı aldıktan sonra Adım 1'e geç.

---

## MOCK POLİTİKASI

Home sayfası tasarımında, gerçek backend karşılığı olmayan ama premium deneyim için gerekli gördüğün özellikleri **mock/statik veriyle** uygula. Kurallar:

- Mock kullanılan her yerde kodda açık bir işaret bırak: `// MOCK: <özellik adı> — gerçek veri kaynağı yok, bkz. todo.md`
- Mock veri gerçekçi görünmeli (rastgele/anlamsız placeholder değil, gerçek ürün/kategori isimleriyle tutarlı).
- Hiçbir mock, kullanıcıyı yanıltacak şekilde (örn. sahte "sınırlı stok" uyarısı gibi) production'a çıkmamalı — bu bir tasarım/geliştirme aşaması çıktısı, canlıya alınmadan önce gerçek veriyle değiştirilecek.
- Proje kök dizininde `todo.md` dosyası oluştur (yoksa) veya güncelle (varsa). Her mock özellik için şu formatta bir madde ekle:

```
## [MOCK] Özellik adı
- Nerede kullanılıyor: (örn. Home > Öne Çıkan Ürünler section'ı)
- Neden gerekli: (kısa gerekçe — premium deneyime katkısı)
- Şu an nasıl mock'landı: (örn. statik JSON array, sabit 4 ürün)
- Gerçek entegrasyon için gereken: (örn. Product modeline `rating` alanı eklenmeli, review endpoint'i yazılmalı)
- Öncelik önerisi: (Yüksek / Orta / Düşük)
```

- İş bitince `todo.md`'nin tam içeriğini bana ayrıca özetle — bunları birlikte plana/roadmap'e (Faz listesine) dahil edeceğiz.

---

## TASARIM YÖNÜ

Referans: **Ssense, Net-a-Porter** tarzı premium/lüks e-ticaret estetiği. Somut karşılıkları:

- **Beyaz alan (whitespace) bol**, sıkışık değil — ürünler nefes alsın.
- **Tipografi odaklı hiyerarşi**: İnce/orta ağırlıkta sans-serif (örn. Helvetica Neue / Inter tarzı) gövde metni + gerekirse başlıklarda ince bir serif veya geniş harf aralıklı (letter-spacing) büyük başlıklar. Aşırı kalın/renkli başlıklardan kaçın.
- **Renk paleti minimal**: Siyah/beyaz/kırık beyaz (off-white) + bir nötr gri tonu ana paleti oluştursun; marka rengi tek bir vurgu (accent) olarak çok az ve kontrollü kullanılsın. Renk gürültüsü yok.
- **Büyük, kaliteli ürün görselleri** ön planda; küçük ikon/rozet/badge yığını yok.
- **İnce çizgiler (hairline border), gölge yerine kontrast ve boşluk** kullan. Ağır shadow, gradient, yuvarlatılmış köşe bombardımanı yok — sert/keskin köşeler veya çok hafif radius tercih edilir.
- **Mikro-etkileşimler sade**: hover'da yumuşak fade/scale, aşırı animasyon yok.
- **Grid disiplinli**: tutarlı column/gutter sistemi, hizalama kusursuz olmalı.

Bu bir "şablon" değil, prensip seti. Uygularken bu prensiplere sadık kal ama Commerce-OS'a özgü bir kimlik oluştur (Ssense'i birebir kopyalama).

---

## ADIM 1 — Design System Foundation

Aşağıdakileri `packages/` altında (varsa mevcut bir `packages/ui` yapısını kullan, yoksa oluştur) merkezi ve yeniden kullanılabilir şekilde kur:

1. **Design tokens**: renk paleti, tipografi skalası (font ailesi, ağırlıklar, boyut/line-height skalası), spacing skalası, border-radius skalası, shadow skalası (minimal), breakpoint'ler. Tailwind config'e bu token'ları işle.
2. **Temel component library** (headless/minimal, tekrar kullanılabilir):
   - Button (primary / secondary / ghost / link varyantları)
   - Typography component'leri (Heading, Text) veya tutarlı className preset'leri
   - Input, Select (form elemanları — checkout'u bozmayacak şekilde, mevcut form mantığına uyumlu)
   - Badge/Tag
   - Container/Grid/Section wrapper'ları
   - Header (üst nav) ve Footer — bunlar tüm storefront'ta ortak kullanılacak
3. Bu component'leri izole şekilde görebileceğim bir Storybook kurulumu varsa oraya, yoksa basit bir `/design-system` preview route'una ekle (opsiyonel ama tercih edilir).

**Kontrol noktası:** Bu adım bitince bana token'ları ve component listesini özetle, ben onaylayınca Adım 2'ye geç.

---

## ADIM 2 — Home Sayfası Redesign

Adım 1'deki design system'i kullanarak Home sayfasını sıfırdan yeniden kur:

Önerilen section yapısı (mevcut veri modeline göre uyarlayabilirsin, bana neyi neden değiştirdiğini söyle):

1. **Hero** — büyük, tam genişlik görsel/kampanya alanı, minimal metin, tek net CTA.
2. **Kategori vitrin** — 3-4 büyük kategori kartı, görsel ağırlıklı, az metin.
3. **Öne çıkan ürünler** — temiz bir ürün grid'i (ProductCard component'i burada tanımlanmalı: görsel, ürün adı, fiyat, minimal hover etkileşimi).
4. **Marka/değer önerisi bandı** (opsiyonel) — kargo, iade, güvenli ödeme gibi güven unsurları, ikon yerine sade tipografi ile.
5. **Editöryel/lifestyle blok** (opsiyonel, premium his için) — tek büyük görsel + kısa metin.
6. **Footer** — Adım 1'de kurulan ortak footer.

Gap analizinde tespit edilen ve altyapıda karşılığı olmayan özellikleri (örn. wishlist ikonu, hızlı bakış, puanlama) bu section'lara **Mock Politikası**'na uygun şekilde dahil et — tasarımdan çıkarma, sadece mock veriyle göster ve `todo.md`'ye işle.

Teknik gereksinimler:
- Tüm yeni UI **Türkçe** olmalı (mevcut İngilizce ağırlıklı metinleri Türkçeleştir).
- Responsive: mobil, tablet, desktop kırılımları eksiksiz test edilsin.
- Performans: görseller `next/image` ile optimize edilsin, gereksiz client component kullanma (mümkün olduğunca server component).
- Erişilebilirlik: semantik HTML, kontrast oranları, alt text.
- Mevcut cart/checkout/auth fonksiyonalitesine dokunma, sadece header/nav üzerinden bu akışlara giden bağlantılar korunmalı.

**Kontrol noktası:** Home tamamlanınca ekran görüntüsü/açıklama ile bana özet ver.

---

## ADIM 3 — (Bu konuşmada henüz kapsam dışı, ileride ele alınacak)

PLP, PDP, Cart, Checkout görsel güncellemesi — Home onaylandıktan ve stil dili netleştikten sonra aynı design system üzerinden ilerlenecek. Bu adımı şimdi yapma.

---

## GENEL KURALLAR

- Fonksiyonel regresyon yaratma: checkout, sepet, sipariş akışları çalışır durumda kalmalı.
- Her adımdan sonra kısa bir özet ver, büyük mimari kararları (örn. yeni bir kütüphane eklemek) önce sor.
- Projenin kuralı gereği büyük değişiklikler PR ile ilerlemeli, doğrudan `main`'e commit atma.
- Test kapsamını bozma; UI değişikliği nedeniyle kırılan testler varsa güncelle.
- Mock kullanılan hiçbir özellik sessizce geçilmesin — her biri `todo.md`'de görev olarak kayıt altına alınmalı ve iş sonunda bana özetlenmeli.

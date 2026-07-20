# TODO-158C — Enterprise Storefront Experience Redesign (Faz 1) · Analiz Raporu

> Ön çalışma raporu. Kod yazımından ÖNCE mevcut storefront'un UI/UX durumu, token
> altyapısı ve tespit edilen eksikler. Kaynak: `apps/storefront-web` tam okuma +
> `@commerce-os/theme` (TODO-158B/ADR-087) + Home Experience (TODO-158A/ADR-086).

## 0. Bağlam ve temel

- Theme Engine (ADR-087) ve Home Experience (ADR-086) main'de **mevcut ve canlı**.
  Bu çalışma yeni bir motor kurmaz; **var olan token zinciri üzerine görsel/UX katmanı** ekler.
- Token zinciri (değişmez sözleşme):
  `Design Token → Semantic Token → Component Token → CSS Variable → Bileşen`.
  Vitrin bileşenleri **yalnızca** şu semantic utility'leri kullanır (hepsi
  `var(--...)`'a çözülür, `[data-theme]` ile override edilebilir):
  - Renk: `bg-paper` `bg-surface` `bg-surface-muted` · `text-ink` `text-ink-muted`
    `text-ink-subtle` · `border-line` `border-line-strong` · `bg-accent`/`text-accent`
    `text-accent-contrast`
  - Tipografi: `font-sans` `font-serif`
  - Köşe/gölge: `rounded-sm` `rounded-md` · `shadow-sm` `shadow-md`
  - Kerning: `tracking-wideish` (0.08em) `tracking-luxe` (0.2em) `tracking-tightish`
  - Motion: `ease-premium` (cubic-bezier 0.22,1,0.36,1)
  - Kap: `max-w-grid` (1440px)
- **Kural:** yeni bileşenler yalnız bu utility'leri kullanacak. Ham HEX, `bg-gray-*`,
  `text-black/white`, `rounded-[8px]`, `shadow-[...]` **yasak**.

## 1. İki tasarım-token dünyası (kritik mimari gerçek)

1. **Vitrin editorial token sistemi** — site kabuğu + home + search PLP. Tamamen
   token-tabanlı, temalanabilir. Redesign'ın yaşadığı yer burası.
2. **Legacy `@commerce-os/ui` paylaşılan kit** — account, auth, cart, checkout ve PDP
   ilgili-ürünler kartı. `slate-*` `brand-600/700` `emerald-*` `amber-500` `rose-600`
   `rounded-xl` `shadow-lg` — **temalanamaz**. Brief bu iş-akışlarına dokunmamı yasaklıyor;
   yalnız bunların vitrin yüzeyindeki görsel tutarsızlığını TD olarak kaydedeceğim.

## 2. Tespit edilen UI/UX eksikleri (bileşen bileşen)

### Hero (KRİTİK)
- `components/site/home/hero-slider.tsx`: yükseklik **aspect-ratio** ile sürülüyor
  (`aspect-[4/5]` mobil · `sm:aspect-[16/9]` · `lg:aspect-[16/7]`). Full-bleed genişlikte
  (ör. 1920px) `16/7` ≈ **840px** → ekran görüntüsündeki aşırı yükseklik. Sabit `min/max`
  veya `vh` yok.
- Overlay/ok/nokta ham `black/white` renk kullanıyor (token değil).
- `max-w-7xl` kullanıyor; site geneli `max-w-grid` (1440px) ile **tutarsız**.
- CTA `variant="cta"` (doğru) ama görsel ağırlık zayıf; oklar/pagination sade.
- Alt içeriğe (Featured/Showcase) görsel akış yok — hero tek başına ekranı dolduruyor.

### Navigation
- **Mega menu YOK.** Header nav tek hardcoded link (`/products`). Kategori gezinme yok.
  Mobil menü de aynı tek linki listeler. Bu en büyük IA boşluğu.
- Header `h-16` sabit, `sticky top-0` — ama scroll'da **kondens/shrink davranışı yok**.
- Wishlist ikonu MOCK (hesaba yönlendirir, kaydetme yok).
- Dil seçici yalnız `lg` üstünde görünür (tablet/mobil'de erişim zayıf).
- Announcement/campaign bar `text-white/70` gibi ham beyaz kullanıyor (koyu tema'da
  `--surface` beyaz değilse **tutarsızlaşır** — token'a taşınmalı).

### Homepage
- `campaign block` / `promotional banner` / `editorial section` **bileşenleri yok**.
  Tek kampanya yüzeyi üstteki `CampaignBar`. Home yalnız Hero + Featured + Showcase.
- Featured kategori kartı caption overlay ham `from-black/70`, `text-white`.
- Section geçişleri her yerde aynı `border-b border-line py-14 sm:py-16` — ritim monoton,
  whitespace ayrımı zayıf.
- Home fallback (`app/page.tsx:86`) ham hex gradient `from-[#efece6] to-[#ded8cc]`.

### Product Card
- Üç ayrı kart implementasyonu (parçalanma):
  - `components/site/product-card.tsx` (`StorefrontProductCard`, home) — token-temiz,
    badge/wishlist/quick-view/rating var; ham `bg-white/80` `bg-black/40` overlay.
  - `components/search/search-product-card.tsx` (`SearchProductCard`, **canlı PLP**) —
    token-temiz, swatch + hover ikinci görsel + stok rozeti.
  - `components/ui/product-card.tsx` (`ProductCard`) — **legacy slate/brand**, PDP
    ilgili-ürünler'de canlı (`app/products/[handle]/page.tsx:257`). Temalanamaz.
- **Ölü kod (yalnız test):** `components/site/hero-carousel.tsx` ve
  `components/product-card.tsx` — uygulamada hiçbir yerde render edilmiyor.
- Stok rozeti yalnız PLP kartında var; home kartında yok. Rozet dili kartlar arası
  tutarsız.

### Category Experience
- Ayrı kategori landing yok; kategori = PLP (`/products?category=`) + `FilterRail`.
  Category banner / category grid / kategori navigasyonu bileşenleri yok.
- Home `FeaturedCategoriesSection` var ama basit (aspect-[3/4] + overlay caption).

### Footer
- `components/site/site-footer.tsx` düzenli ama eksik: **social / payment ikonları /
  trust rozetleri / legal linkleri yok**. Newsletter MOCK.

### Hardcoded değer denetimi (token ihlalleri)
- Ham HEX (3 nokta): `hero-carousel.tsx:52`, `app/page.tsx:86`, `product-media.tsx:32-37`
  (placeholder tonları). İlk ikisi ölü/fallback; placeholder üretimsel.
- Ham `black/white` overlay: hero-slider, home-sections (featured), product-card,
  campaign-bar. Bunlar için **semantic overlay/on-media token'ları eklenecek** (aşağıda).
- `product-card SVG`'de `#735389` (accent hex) — `var(--accent)`/`currentColor`'a taşınmalı.

## 3. Token temeli genişletmesi (ADR-088 adayı)

Overlay-on-media için bugün token yok → ham `black/white` kullanılıyor. Çözüm: yeni
**semantic** token'lar (globals.css + theme schema semantic katmanı), böylece zincir
korunur ve tema override edilebilir:

- `--overlay-scrim` (medya üzeri koyu gradyan, okunabilirlik)
- `--on-media` / `--on-media-muted` (medya üzeri metin/ikon)
- `--control-surface` / `--control-surface-strong` (medya üzeri buton zemini; cam efekt)
- Hero yükseklik token'ları: `--hero-h-mobile` (~260px), `--hero-h-tablet` (~410px),
  `--hero-h-desktop` (~520px) — sabit aralık, tema ile ayarlanabilir.

Bu token'lar `@commerce-os/theme` semantic katmanına (opsiyonel, geriye-uyumlu) eklenip
`generateCssVariables` ile yayınlanacak; tema yoksa globals.css varsayılanları geçerli.

## 4. Çalışma sınırları (dokunulmayacak)

Search · SEO · Checkout · Dynamic Attributes · Campaign Engine · Inventory · Order ·
Payment iş mantığı. Legacy shared-kit (`@commerce-os/ui`) görünümü. PLP arama akışı
(URL-state, facet, pagination) — yalnız kart/görsel katmanı.

## 5. Faz planı

1. **Token temeli** — overlay/on-media/control/hero-height semantic token'ları.
2. **KRİTİK Hero** — sabit yükseklik + container hizası + CTA/ok/pagination + akış.
3. **Faz 1 Navigation** — announcement/header/sticky/mega-menu/search/user/wishlist/cart/lang.
4. **Faz 2 Homepage** — featured/showcase/campaign-block/promo-banner/editorial + spacing.
5. **Faz 3 Product Card** — kompakt/premium + badge sistemi (tek dil).
6. **Faz 4 Category** — grid/card/banner/navigation.
7. **Faz 5 Footer + Responsive + A11y + Perf + Test + Docs.**

## 6. Kabul

Unit/Integration/Typecheck/Lint/Build/Smoke yeşil. Yeni bileşenlerde 0 hardcoded design
value. Çalışma sonunda commit/push/PR/merge/deploy **YOK** — dur.

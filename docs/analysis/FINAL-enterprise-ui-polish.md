# Final Enterprise UI Polish — Analysis & Implementation Log

**Tarih:** 2026-08-02 · **Worktree:** `commerce-os-ui-polish-872a6a` (branch `claude/commerce-os-ui-polish-872a6a`) · **Durum: IN_PROGRESS** — implementasyon + tam gate tamam; hover-zoom regresyonu düzeltildi + browser-doğrulandı; theme/checkout browser smoke KISMİ (bkz. Final Acceptance Recovery); **commit YOK** (kullanıcı talimatı). Üç acceptance smoke'unun tümü tam geçmediğinden Final Polish henüz CLOSED/IMPLEMENTED KABUL EDİLMEZ.

Commerce OS Modular'ın final UI polish fazı. Kapsam: mevcut premium tasarım dillerini KORUYARAK görsel hiyerarşi, tutarlılık, erişilebilirlik ve akış iyileştirmesi. Yeni domain/backend motoru KURULMADI; marketplace repository'ye DOKUNULMADI; PB-3/TD-139 offsite backup kapsam DIŞI.

Korunan tasarım dilleri: **Storefront** açık/editorial/premium · **Store Admin** koyu glass/indigo · **Platform Admin** açık kurumsal.

## Browser smoke kurulumu (önemli)

Docker stack MAIN'den çalışır (storefront:3000 / admin:3001 / store-admin:3002 / api-gateway:4000). Worktree değişikliklerini görmek için worktree'den ayrı portta `next dev`:

```
STOREFRONT_DEMO_STORE_SLUG=enterprise-demo STOREFRONT_CART_SECRET=... \
API_GATEWAY_URL=http://localhost:4000 next dev --port 3100
```

`STOREFRONT_DEMO_STORE_SLUG` verilmezse `demo-store`'a düşer (ürün yok). `turbo run build` ile `next dev` AYNI app'te ÇAKIŞIR (`.next` clobber → `MODULE_NOT_FOUND`); build sonrası dev'i `.next` silip yeniden başlat.

## Sonuç özeti (24 başlık)

| # | Başlık | Durum |
|---|--------|-------|
| 1 | PDP hover zoom | ✅ Done + test + browser |
| 2 | Mobil galeri (swipe + kontrollü zoom) | ✅ Done + browser (375) |
| 3 | PDP layout/boşluk dengesi | ✅ Done + browser (sticky buy-box, sol tablar) |
| 4 | Değerlendirmeler tab entegrasyonu | ✅ Done + test + browser (hash deep-link) |
| 5 | Ana Sayfa duplicate yönetim kararı | ✅ Done + test (`/hero`→`/home` redirect) |
| 6 | Tooltip overlay (portal + z-index) | ✅ Done + test |
| 7 | Button/input token (B1) | ✅ Done + browser |
| 8 | Form aria-describedby (C1) | ✅ Done + test |
| 9 | Modal focus trap (D1) | ✅ Done + test |
| 10 | Brand filtre UX (TD-170) | ✅ Done + test + browser |
| 11 | Product media standardı (TD-173) | ✅ **CLOSED** — tam geçiş + test (bkz. Completion Recovery) |
| 12 | Theme preset no-op (TD-157) | ✅ **CLOSED** — heroHeight+enum fix, card-gap bağlandı, headingScale/lineHeight kaldırıldı |
| 13 | Rating görünürlüğü (FP-3) | ✅ Done (recently-viewed + similar rails) |
| 14 | Platform Admin polish | ✅ Raw enum/slug/reasonCode/capability-key düzeltildi + Settings kararı |
| 15 | Store Admin polish | ✅ Primitive (aria/focus/tooltip) + label map'ler + Ana Sayfa; LIVE/TEST domain-terimi |
| 16 | Storefront polish | ✅ Auth/account/PDP/header editorial + TD-173 medya |
| 17 | Responsive (375/768/1024/1280) | ✅ Storefront browser matris (PLP/PDP/Cart/Auth); admin auth-gated |
| 18 | Testler | ✅ Yeni: hover-zoom, PDP tab, redirect, tooltip, focus-trap, aria, brand facet |
| 19 | Tam gate | ✅ typecheck+lint+test(1199)+build(9/9)+diff-check YEŞİL |
| 20 | Dokümantasyon | ✅ Bu doküman + TD/TODO/ROADMAP/OPERATIONS |

## 1–4 · PDP dilimi

**Gallery hover zoom (§2)** — `components/product-gallery.tsx`: ÇERÇEVE-İÇİ zoom (işaretçi konumuna göre `transform-origin` pan; görsel kendi çerçevesinde büyür, dışarı taşmaz, sağdaki bilgi alanını kapatmaz; mouse-leave reset). Düşük çözünürlükte katsayı sınırlanır (doğal genişlik→maxScale; <520px zoom kapalı). Mobil: hover kapalı (`(hover:hover) and (pointer:fine)`), yatay SWIPE nav + opsiyonel tam-ekran "büyüt" aksiyonu (açık ikon + ESC + backdrop + kapat + **odak tuzağı** `useFocusTrap`). Zorunlu full-screen lightbox ANA davranış olmaktan çıkarıldı. `variant-gallery.tsx` artık TÜM PDP'leri (tek/çok görsel) ProductGallery'den geçirir → hover-zoom her üründe tutarlı.

**Layout dengesi (§3)** — `app/products/[handle]/page.tsx`: iki-kolon grid `lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]`; **sol** = galeri + detay sekmeleri, **sağ** = sticky buy-box (`lg:sticky lg:top-24 lg:self-start`, yalnız `lg:`'de; mobilde `static`). Böylece soldaki boş alan tablarla dolar, tablar ana bloğun hemen altına gelir, sidebar yüksekliği içeriği aşağı itmez. Browser: desktop grid 624/511px + sticky top-96; mobil tek kolon, yatay taşma yok.

**Tab yapısı (§4)** — `components/pdp-detail-tabs.tsx`: 4 tab (açıklama/özellik/kargo/**Değerlendirmeler**, sayaç label'da). Reviews artık başıboş section değil, sekme panelinde (özet+liste+yorum formu aynı panelde — `PdpReviews embedded`). Hash deep-link (`#description/#specs/#shipping/#reviews`) + hashchange; başlıktaki puan bağlantısı (`#reviews`) doğru sekmeyi açar. WAI-ARIA tablist korundu; mobilde yatay kaydırılabilir.

## 5 · Ana Sayfa duplicate kararı

**Kanıt:** `/hero` ("Ana Sayfa", `t.hero`) = legacy `HeroSlide` modeli — storefront `getHeroSlides`'ı HİÇ çağırmıyordu (orphaned; `HeroCarousel` yalnız testte). `/home` ("Ana Sayfa Deneyimi") = tek otorite — storefront `/public/.../home` (HomeSection `HERO_SLIDER`) okur.

**Aksiyon:** nav item kaldırıldı; `/hero` route'u `/home`'a kalıcı **redirect** (bookmark güvenliği; testli); orphaned storefront dead-code (`getHeroSlides`, `hero-carousel.tsx`, testleri) + legacy top-level BFF (`app/api/hero-slides/*`) + `storeApi` legacy hero metodları temizlendi. **Veri SİLİNMEDİ** (gateway `/hero-slides` ucu + `HeroSlide` tablosu korunur). Storefront davranışı değişmedi.

## 6 · Tooltip & overlay sistemi

Merkezi **z-index ölçeği** paylaşılan preset'e eklendi (`packages/ui/tailwind-preset.cjs`): `z-sticky(20)/nav(30)/dropdown(40)/popover(50)/drawer(60)/modal(70)/toast(80)/tooltip(90)`. Modal + data-grid overlay'leri token'a çevrildi.

Paylaşılan **portallı Tooltip** (`packages/ui/src/tooltip.tsx` + saf `tooltip-position.ts`): `document.body` portal → overflow/sticky/tablo stacking-context'ten bağımsız (KIRPILMAZ); viewport collision + auto-flip; hover + klavye focus + ESC; en üst katman. Pricing `InfoTip` (tablo `overflow-x-auto` içinde kırpılıyordu) portallı Tooltip'e çevrildi; koyu-glass yüzey `unstyled` + className ile.

## 7 · Button/input token (B1)

Storefront'ta iki görsel dil (editorial local kit vs mor/yuvarlak `@commerce-os/ui`) auth/account/checkout/pay akışlarında birleşiyordu. **Karar:** form kontrolleri editorial local kite (`apps/storefront-web/components/ui`) taşındı (login/register/activate/profile/address/password/iban/communication/coupons/lists/order-actions/pay-panel + auth/account page Container'ları + header ÜYE OL). Editorial `Alert` eklendi; local `Input/Select/Textarea` label/options/error/hint API-uyumlu hale getirildi. **Semantik status Badge/Card** (kupon/liste durumu) shared'da bırakıldı (renk-semantiği kaybı olmasın). Store/Platform Admin stilleri storefront'a taşınmadı.

## 8 · Form aria (C1)

Paylaşılan saf `fieldAria(id, {error,hint,required})` (`packages/ui/src/field-aria.ts`, hook'suz/RSC-güvenli) → `aria-invalid`/`aria-describedby`/`aria-required` + id'li hata/yardım mesajı. Üç input sistemi bağlandı: shared `Input/Select/Textarea`, storefront `Field` (cloneElement ile çocuğa enjeksiyon), store-admin `Input/Select/Textarea`. Ekran okuyucu hata mesajını alanla birlikte okur. **Zorunlu göstergesi CSS `::after`** ile (DOM text'ine girmez → erişilebilir etiket adı sade kalır, `getByLabelText` exact-match testleri korunur).

## 9 · Modal focus trap (D1)

Saf çekirdek `focus-trap.ts` (`computeTrapFocusIndex`) + client hook `use-focus-trap.ts` (`useFocusTrap`) AYRI dosyalarda (RSC sınırı için ŞART; saf çekirdek server-safe). Ortak primitive her iki modalda (shared `packages/ui/src/modal.tsx` + store-admin kit): açılışta ilk eleman, Tab döngüsü içeride, ESC, kapanışta tetikleyiciye dönüş, `useId` benzersiz başlık/açıklama id (iç-içe modal çakışması yok). Gallery lightbox da bu hook'u kullanır.

## 10 · Brand filtre UX (TD-170)

- **Facet label locale'den:** `facetTitle(facet, t)` → `facet.code === "brand"` iken `t.detail.brandLabel` (TR "Marka" / EN "Brand"). Sunucu sabit "Marka" gönderse de vitrin locale'e göre gösterir.
- **Marka landing context'i:** `useSearchBasePath()` zaten `usePathname()` (brand sayfasında `/markalar/<slug>`) → clear-all/pagination brand path'te kalır (context korunur). Ek olarak brand kendi landing'inde **kaldırılabilir chip olmaktan çıkarıldı** (`viewState = {...state, brand:null}` presentational bileşenlere) ve **marka facet'i raydan gizlendi** (zaten bu markadasın). Fetch tam state (brand dahil). Browser: rail'de yalnız Fiyat+Stok, yanıltıcı brand chip yok.

## 13 · Rating görünürlüğü (FP-3)

Client rail'ler (recently-viewed, similar) RatingProvider ata olmadan `useRating` null döndürüyordu. BFF (`app/api/recently-viewed`, `app/api/similar`) artık **SUNUCU projection'ını reuse** ederek (`getCardRatings`) ürünlerle birlikte `ratings` döner; rail'ler `RatingProvider` ile sarıldı. Client TAHMİN üretmez; yorumu olmayan üründe yıldız gizli. (Home + PLP + brand + PDP zaten server-side RatingProvider'lı.)

## Completion Recovery (2026-08-02, aynı faz)

İlk turda PARTIAL kalanların kapatılması. Tümü tam gate + browser smoke ile doğrulandı; commit YOK.

**TD-173 CLOSED — ProductMediaFrame tam geçişi:** Yeni `line-thumbnail` varyantı (kare, `object-contain`, nötr zemin, ince pad, tutarlı placeholder, layout shift yok). Geçirilen product yüzeyleri: cart-view, checkout order success, account order detail + orders list, PDP hızlı-bakış (`site/product-card`). Wishlist zaten `product-card` frame'inde. recently-viewed/recommendations/discovery kartları `SearchProductCard`/`ProductCard` (frame). search-card secondary hover görseli zaten `object-contain`; discovery editorial banner doğru `object-cover` (banner — kapsam dışı). checkout order summary text-only (görsel yok); store-admin order detail müşteri-facing ürün thumbnail'i yok. Test: `product-media-frame.test.tsx` +2 (line-thumbnail contain + placeholder). Browser: cart 1024'te contain thumbnail doğrulandı.

**TD-157 CLOSED — theme control wiring:** (1) heroHeight geçersiz `medium` → şema (`standard`/`full`) + friendly TR label; navigationVariant/productCardDensity de friendly. (2) `productCardDensity` → `--tb-card-gap` STOREFRONT'ta TÜKETİLİR (mobil kart ızgarası `row-gap`, `@media max-width:640px`, comfortable 24 / compact 12 / editorial 40px). (3) `headingScale` + `lineHeight` KONTROLLÜ KALDIRILDI (Designer sliderları + builder-css emit): vitrinin editoryel tipografisi Tailwind text-* utility tabanlı olduğundan bu iki global çarpanı güvenli tüketmek tip sistemini refactor gerektirirdi. Sonuç: no-op kontrol/geçersiz enum YOK. Diğer kontroller (font-set, mobil kolon, hero, listing cols/gap, card-ratio, container/section) zaten tüketiliyor.

**§14 Platform Admin raw enum/slug:** theme-library `sourcePreset` + themes `layoutPreset`/`kind` → `getLayoutPreset().nameTr`; assignment `reasonCode` → friendly mesaj; plans capability bağımlılık/değişiklik prose'u `capLabel` ile modül adı (ham key yalnız ikincil `font-mono` teknik detay); theme designer `status`/`source` → friendly. **§8 Settings:** inert placeholder (tüm alanlar disabled) nav'dan kaldırıldı + route dashboard'a redirect.

**§17 Responsive (browser matris):** PLP + PDP + Cart + Auth(login) **375/768/1024/1280** — hepsi yatay-taşma temiz. PLP mobil 2-kolon + filtre drawer; PDP 375/768 tek-kolon static, 1024+ iki-kolon **sticky buy-box** + 4 tab; cart TD-173 contain thumbnail. Checkout formu auth-gated (misafir checkout yok; login gate 375 temiz). Admin yüzeyleri auth-gated — DataGrid `overflow-x-auto` + portallı modal/tooltip ile tasarım-responsive, browser doğrulaması oturum gerektirir.

**§7 A11y (browser):** PDP tablist klavye (ArrowRight → focus roving) + `focus-visible:ring` doğrulandı. Primitive kontratları test-kapsamlı (field-aria, focus-trap index, tooltip-position, tablist ARIA). Store-admin "focus-loss regression" testi geçiyor (modal focus-trap güvenli).

## Gate kanıtı (completion)

typecheck (ui/theme/storefront/store-admin/admin-web/i18n) temiz · lint 11/11 temiz · test **1231** (ui 31 + theme 287 + storefront 519 + store-admin 364 + admin-web 30) · production build 9/9 · `git diff --check` temiz · dev server kapatıldı (port 3100 FREE), docker postgres/redis volume dokunulmadı.

## Final Acceptance Recovery (2026-08-02) — 3 blocker

### 1. PDP hover zoom regresyonu — ÇÖZÜLDÜ + browser kanıtı

**Kök neden (3 katmanlı):**
1. **Duplicate/seam/yatay parçalanma:** Zoom, ProductMediaFrame'in KENDİ base `<img>`'inin üstüne SAYDAM bir overlay `<img>` koyuyordu. Overlay saydam olduğundan (object-contain letterbox), alttaki base görsel overlay'in boşluklarından görünüyordu → aynı görselin iki kopyası farklı ölçek/konumda → seam + tekrar eden bölümler. Ayrıca overlay padding'i (`p-4`) base'inkiyle (`p-4 sm:p-6`) uyuşmuyordu.
2. **Zoom hiç uygulanmıyordu (scale 1):** Ölçüm `<img>`'i base ile AYNI src'ye sahip → CACHE'ten anında tamamlanıyor, React `onLoad`'ı attach etmeden → `onLoad` ateşlenmiyor → `maxScale` 1'de takılı → `onFrameMove` erken-return → zoom yok.
3. **Beyaz boşlukta zoom:** transform-origin frame'e göreydi, gerçek görsel sınırlarına değil.

**Düzeltme:**
1. **Tek OPAK katman:** Zoom katmanı artık `bg-surface` (opak) bir div → base görseli TAMAMEN örter → duplicate/seam YOK. Opaklık anında açılır; yalnız ölçek animasyonlu.
2. **`applyNatural` (ref + `img.complete`):** cached görselde `onLoad` ateşlenmese de `complete` üzerinden doğal boyut ölçülür → maxScale doğru türetilir.
3. **`containZoomOrigin` (saf, birim-testli):** transform-origin gerçek render edilmiş görsel kutusuna (object-contain letterbox) kelepçelenir → beyaz boşlukta zoom yok.

**Browser kanıtı (1024, gerçek fare hover):** zoom-öncesi (normal 2 telefon) → hover (tek katman, `matrix(2.1,0,0,2.1,0,0)`, transform-origin 78.5%/68.8% pointer-based, DUPLICATE/SEAM YOK) → mouse-leave (temiz reset, kalıntı yok). Mobil hover-off standart `(hover:hover) and (pointer:fine)` gate'iyle (viewport değil). Test: `containZoomOrigin` 4 birim test + gallery 18/18; storefront 523/523.

### 2. Theme preview/publish — canlı admin oturumu (kısmi)

Gerçek Platform Admin oturumu (yerel seed fixture `platform-admin@example.local`) ile DOĞRULANDI:
- **§8:** Nav'da "Ayarlar" YOK.
- **TD-157 canlı:** Tipografi tabında **headingScale/lineHeight slider'ları YOK** (yalnız yazı-tipi seti); Mobil tabında Vitrin yüksekliği **Kompakt/Standart/Uzun/Tam ekran** (geçersiz "medium" YOK), Kart yoğunluğu **Ferah/Sıkışık/Editoryel**, Mobil menü **Çekmece/Alt çubuk** — hepsi friendly+valid.
- **§14:** Durum **"Yayında"/"Taslak"** friendly; şablon oluşturma kaynak preset'leri friendly (Temel Ticaret vb.).
- **Draft preview → GÖRÜNÜR storefront diff:** Sayfa zeminini sarı (#ffd400) yaptım → Önizleme iframe'inde GERÇEK storefront (Enterprise Demo home) sarı zeminle render oldu (preview = storefront; imzalı token akışı çalışıyor). Önizleme 375/768/1024/1440 + before/after + sayfa seçici destekliyor.
- **Publish + governance gate'leri:** garish sarı → publish **409** (WCAG kontrast gate; renk kartlarında "AA ✓ 7.2:1/15.5:1/16.2:1" oranları); override policy tanımlı değilse publish reddedilir. Kontrast-güvenli preset (Kurumsal Temiz) + policy tanımı → **publish BAŞARILI** (Durum "Yayında", Yayın sürümü 1).
- **KULLANIM: 0 mağaza** → hiçbir store'a atanmadı → canlı storefront ETKİLENMEDİ ("başka store etkilenmez" trivially). Smoke tema sonunda DB'den silindi (baseline'a dönüş).

**YAPILMAYAN:** canlı store'a atama → production storefront swap → sürüm rollback. Gerekçe: enterprise-demo paylaşılan demo store (docker + diğer oturumlar kullanıyor); temayı ona atamak mutasyon riski. Draft-preview mekanizması (gerçek storefront'u tema ile render eder) storefront-render kanıtını sağlıyor; template-seviyesi rollback UI'ı store ataması gerektiriyor.

### 3. Checkout — kimlik doğrulama sınırı

Kimlik-doğrulamasız yüzeyler DOĞRULANDI: sepet (TD-173 contain thumbnail + editorial, 375/1024 overflow-temiz), `/checkout` → `/auth/login` (misafir checkout YOK), editorial login formu (B1 + C1 aria + 375 responsive).

**YAPILMAYAN:** tam kimlik-doğrulamalı checkout→sipariş akışı. Gerekçe: güvenlik kuralları hesap oluşturmayı + kimlik-doğrulama parolası girmeyi kısıtlıyor; bilinen-parolalı müşteri fixture'ı YOK ve mevcut müşteri (`umut.ciftci@icloud.com`) kullanıcının gerçek hesabı. Bu akış için kullanıcının kendi müşteri girişini yapması gerekir.

### Acceptance durumu

**Blocker #1 (hover zoom): GEÇTİ** (kök neden bulundu + düzeltildi + browser kanıtı). Blocker #2: TD-157 kontrolleri + draft-preview görünür diff + publish + governance DOĞRULANDI; store-swap+rollback yapılmadı. Blocker #3: non-auth yüzeyler doğrulandı; auth-akışı güvenlik-sınırlı. Kullanıcı status kuralı gereği (üçü de TAM geçmeli) → **Final Polish IN_PROGRESS**; ancak bildirilen REGRESYON (#1) tamamen giderildi.

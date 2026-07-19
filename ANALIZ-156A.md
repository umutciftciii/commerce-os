# ANALIZ-156A — Storefront Search Experience Mimarisi

> **Kapsam:** Yalnızca analiz + mimari tasarım. Kod, migration, component, endpoint, PR YOK.
> **Tarih:** 2026-07-19 · **Faz:** 2C-9 (Storefront Search Experience) öncesi mimari
> **Bağlam:** Search backend tamamlandı (TODO-154 Read-Model + TODO-155 Public Search & Facet API, ADR-079).
> Storefront bu ucu **henüz tüketmiyor.**

---

## 0. Yönetici Özeti (TL;DR)

- **Backend hazır, frontend değil.** `GET /public/stores/:storeSlug/search` üretimde ve allowlist'li
  (`publicSearchResponseSchema`); disjunctive facet + dinamik dataType + fiyat/stok/kategori-subtree +
  sıralama + numaralı pagination döndürüyor. Storefront'ta bu uca yapılan **tek bir çağrı bile yok** —
  PLP hâlâ eski `.../products` ucundan **tüm ürünleri tek seferde** çekip **istemcide** filtreliyor.
- **En kritik mimari karar URL state'tir.** Tüm arama durumu (`q`, `category`, `filter[...]`, `sort`,
  `page`, fiyat, stok) URL'de yaşamalı; PLP bir **React Server Component** olarak `searchParams`'tan okuyup
  sunucuda fetch etmeli. Bu; deep-link, paylaşım, geri/ileri, refresh ve SEO'yu tek hamlede çözer.
- **Facet render'ı hardcode DEĞİL, veri-güdümlü olmalı.** Backend `selectionMode` (MULTI/RANGE/BOOLEAN) +
  `dataType` (13 değer) + `colorHex` gönderiyor. Frontend bir **strateji/registry** ile render etmeli:
  birincil anahtar `selectionMode`, sunum inceliği `dataType`.
- **Dürüst sınır:** Search read-model'de **kampanya rozeti YOK, varyant/swatch dizisi YOK, compareAt/Omnibus
  YOK**. Bugünkü PLP kartının gösterdiği F4A kampanya rozeti + "Sepette" tahmini + üstü-çizili fiyat, search
  ucundan **gelmiyor**. Bu, en büyük teknik risk ve bir karar noktası (bkz. §2, §18, §19).
- **Öneri:** İş 3 yaklaşık-eşit faza bölünür — **156B** (URL state + SSR PLP wiring + grid + sort + Load More),
  **156C** (Dynamic Facet Engine + filtre paneli/drawer + aktif filtre çipleri), **156D** (arama deneyimi +
  kategori sayfaları + SEO/JSON-LD + a11y + analytics kancaları).

---

## 1. Mevcut Storefront Analizi

### 1.1 Route yapısı (`apps/storefront-web/app`)

| Route | Tür | Not |
|---|---|---|
| `/` | RSC | Ana sayfa (hero, öne çıkanlar) |
| `/products` | RSC (`dynamic = "force-dynamic"`) | **PLP** — tüm ürünleri çeker, `searchParams` OKUMAZ |
| `/products/[handle]` | RSC (`force-dynamic`) | **PDP** |
| `/cart`, `/checkout`, `/checkout/payment`, `/checkout/success` | RSC | Sepet/ödeme akışı |
| `/account/**` | RSC | Hesap, siparişler, kuponlar |
| `/auth/**` | RSC | Login/register/activate |
| `/design-system` | RSC | DS önizleme |

**Kategori sayfası YOK.** `category` yalnızca PLP araç çubuğundaki bir `<Select>` (istemci filtresi). Ayrı bir
`/categories/[slug]` route'u yok — SEO'lu, canonical'lı kategori sayfaları eksik.

**Arama route'u YOK.** Header'daki arama formu `action="/products"` ile `?q=` gönderir ama PLP `q`'yu okumaz →
şu an **fonksiyonel mock** (`site-header.tsx:80` yorumunda açıkça belirtilmiş).

### 1.2 PLP mimarisi — kritik bulgu

`app/products/page.tsx` → `getStorefrontListing()` (`lib/server/catalog.ts:218`):
- Eski uç: `GET /public/stores/:slug/products` (query parametresi **desteklemiyor** — sort/filter/search/pagination YOK).
- **Tüm yayınlanabilir ürünler tek istekte** çekilir, `StorefrontProductSummary[]`'e map'lenir.
- `components/site/product-listing.tsx` (`"use client"`) filtre + sıralamayı **istemcide, eldeki gerçek veriyle**
  yapar:
  - Kategori filtresi = ürünlerin gerçek `categoryLabel` değerlerinden türetilir (dinamik, ama düz metin).
  - Sıralama: `featured` / `priceAsc` / `priceDesc` / `nameAsc` (`sortPriceMinor` + `localeCompare("tr")`).
  - "Yeni gelenler" **yok** (özet DTO'da tarih alanı yok).
- **Sonuç:** yüzlerce üründe ölçeklenmez; facet yok, fiyat aralığı yok, stok filtresi yok, sunucu sıralaması yok,
  pagination yok, URL sync yok. (todo.md `85-97` bunu "ALTYAPI" borcu olarak zaten işaretlemiş.)

### 1.3 Component tree (ilgili)

```
RootLayout (RSC)  app/layout.tsx
├─ CampaignBar (F4A) | statik duyuru
├─ SiteHeader (RSC)  components/site/site-header.tsx
│  ├─ MobileMenu ("use client")     — disclosure, ESC, scroll-lock
│  ├─ <form action="/products">     — MOCK arama (q consume edilmiyor)
│  ├─ AccountMenu, LangToggle
│  └─ Cart badge
├─ main
│  └─ /products  ProductListingPage (RSC)
│     └─ ProductListingView ("use client")  ← istemci filtre/sıralama
│        └─ ProductCard[]  components/ui/product-card.tsx
│           ├─ ProductMedia  (imageUrl ?? productImageSrc → deterministik placeholder)
│           ├─ Badge (kampanya/indirim)
│           └─ PriceBlock (F4A.6 "Sepette" tahmini + Omnibus)
└─ SiteFooter
```

**İki ayrı ProductCard var:** `components/ui/product-card.tsx` (PLP, sade/editoryel) ve
`components/site/product-card.tsx` (Home, wishlist/quick-view mock'lu). Konsolidasyon borcu.

### 1.4 Design System / tokenlar

- **Yerel DS barrel:** `components/ui/index.ts` — `Container`, `Button/ButtonLink`, tipografi
  (`Display/Heading/Subheading/Eyebrow/Lead/Text/Muted`), `Badge`, `Input/Textarea/Select/Field`,
  `ProductMedia`, `ProductCard`, `ProductCardSkeleton`, `EmptyState`, `Stars`.
- **Tema:** `globals.css` CSS custom property'leri (`--paper/--surface/--ink/--line/--accent...`), Tailwind
  semantik utility'lere bağlı (`bg-paper`, `text-ink`, `border-line`, `bg-accent`). `[data-theme]` ile
  override edilebilir (multi-tenant tema Faz 6). **Tek aksan** kuralı: `--accent` (#735389) yalnız birincil
  tekil CTA + focus halkası; facet/rozet/toggle **nötr** kalır.
- **Paylaşılan `@commerce-os/ui`:** store-admin ile ORTAK → **dokunulmaz** (bkz. memory `store-admin-dark-glass-kit`).
  Vitrine özel her yeni component **yerel** `components/ui`'ye eklenir.
- **Breakpoint:** Tailwind varsayılanı (sm 640 / md 768 / lg 1024 / xl 1280). Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
- **`ease-premium`** timing + `duration-700` hover; radius keskin (0–4px); gölge neredeyse yok.

### 1.5 Veri/erişim katmanı

- BFF deseni: `lib/server/gateway.ts` — `getPublic/postPublic` (auth yok, `cache: "no-store"`), `getCustomer/sendCustomer`
  (`x-customer-session`). Server-only; NEXT_PUBLIC değil → client bundle'a girmez.
- `next.config.mjs`: `/media/:path*` → gateway rewrite (göreli görsel URL proxy'si).
- Görsel altyapısı **var** (Faz 2/3 tamamlandı); `coverUrl`/`images[]` public DTO'da geliyor. `productImageSrc`
  yalnız fallback kancası (P0 placeholder).

---

## 2. Mevcut Eksikler (Gap Analizi)

| # | Eksik | Bugün | Etki |
|---|---|---|---|
| G1 | **Search ucu tüketilmiyor** | PLP eski `.../products`'tan hepsini çeker | Ölçeklenmez, facet yok |
| G2 | **URL state yok** | Filtre/sıralama istemci state'inde | Deep-link/paylaşım/geri-ileri/SEO yok |
| G3 | **Facet UI yok** | Tek `<Select>` kategori | Fiyat/renk/beden/boolean facet yok |
| G4 | **Kategori sayfası yok** | Route yok | SEO'lu kategori landing yok |
| G5 | **Arama sonuç sayfası yok** | Header formu mock | `q` hiçbir yerde consume edilmiyor |
| G6 | **Pagination yok** | Tüm liste tek sayfada | Load More / sayfa yok |
| G7 | **Read-model ↔ kart uçurumu** | Search DTO'da **kampanya/compareAt/Omnibus/varyant-swatch YOK** | PLP kartı bugünkü zenginliğini kaybeder (bkz. §18-R1) |
| G8 | **i18n facet etiketi** | Boolean facet backend'de TR `Evet/Hayır` sabit | EN mağazada dil kayması |
| G9 | **İki ProductCard** | site + ui ayrı | Bakım/konsolidasyon borcu |
| G10 | **Suggest/autocomplete ucu yok** | — | Bu fazda yapılamaz (backend yok) |

---

## 3. UX Kararları (özet — detaylar ilgili bölümlerde)

1. **URL = tek gerçek kaynak.** Tüm arama durumu `searchParams`'ta; PLP RSC sunucuda okur+fetch eder.
   İstemci yalnız `router.replace(...)` ile URL'i günceller (`useTransition` + `useOptimistic`).
2. **Facet render veri-güdümlü.** `selectionMode` → component seçer; `dataType`/`colorHex` → sunum.
3. **Desktop:** kalıcı sol filtre rayı + sticky araç çubuğu (sonuç sayısı + sıralama). **Mobil:** tam-yükseklik
   filtre **drawer**'ı (bottom-sheet değil — facet sayısı değişken/çok olabilir); sıralama ayrı hafif sheet/menu.
4. **Pagination:** SSR ilk sayfa (`?page`) + "Daha Fazla Yükle" (append). URL canonical'ı sayfa-farkında.
5. **Fiyat facet'i:** histogram YOK → çift değerli **min/max sayısal input** (+ opsiyonel slider); sahte
   histogram uydurmayız.
6. **Arama bu fazda:** header search → sonuç sayfası, PLP içi arama, no-result. **Ertelenen:** autocomplete,
   suggest, recent, spell-correction (hepsi ayrı backend ucu ister — yok).
7. **Varyant UX PLP:** search ucunda swatch verisi olmadığından bu fazda **tek kapak görseli + stok**; hover
   image-switch/swatch **ertelenir** (dürüst kısıt; bkz. §9).

---

## 4. Information Architecture (PLP yerleşimi)

### 4.1 Desktop (≥ lg / 1024px)

```
┌───────────────────────────────────────────────────────────────┐
│  Breadcrumb: Ana Sayfa / Kategori / Alt Kategori               │
│  H1 Kategori/Arama Başlığı        (arama ise: "\"x\" için sonuçlar") │
├───────────────┬───────────────────────────────────────────────┤
│  FILTRE RAYI  │  ARAÇ ÇUBUĞU (sticky): 128 ürün · [Sıralama ▾] │
│  (kalıcı,     │  ─────────────────────────────────────────────│
│   ~260-300px) │  AKTİF FİLTRE ÇİPLERİ: [Siyah ✕][100–500₺ ✕] ⟳Temizle│
│               │  ─────────────────────────────────────────────│
│  ▸ Fiyat      │   ┌────┐ ┌────┐ ┌────┐ ┌────┐                 │
│  ▸ Renk 🎨    │   │kart│ │kart│ │kart│ │kart│   (4 sütun)      │
│  ▸ Beden      │   └────┘ └────┘ └────┘ └────┘                 │
│  ▸ Stokta     │   ...                                          │
│  ▸ [Marka]    │         [ Daha Fazla Yükle ]                   │
└───────────────┴───────────────────────────────────────────────┘
```
- Filtre rayı sol; grid 4 sütun (`lg:grid-cols-4`). Araç çubuğu `sticky top-16` (header'ın altında).
- Aktif filtre çipleri grid'in üstünde, ray ile hizalı.

### 4.2 Tablet (md / 768–1023px)

- Sol ray **gizlenir**; yerine araç çubuğunda **`[ Filtrele (n) ]`** butonu → soldan açılan **drawer**.
- Grid 3 sütun (`md:grid-cols-3`). Sıralama araç çubuğunda kalır.

### 4.3 Mobile (< md / < 768px)

- Araç çubuğu tek satır: **`[ Filtrele (n) ]`  ·  `[ Sırala ]`** (iki buton, 50/50 veya sağ-hizalı).
- Grid 2 sütun (`grid-cols-2`).
- Filtre → **tam-yükseklik drawer** (aşağıda §3 gerekçe). Sırala → küçük bottom-sheet/menu.
- Aktif filtre çipleri: yatay kaydırılabilir tek satır (grid üstünde).

**Karar:** IA "içerik-öncelikli" — mobilde filtre/sıralama ekranı kaplamaz, ürünler hemen görünür; filtre
talep üzerine overlay olur.

---

## 5. Filtre Deneyimi (Desktop vs Mobile)

### 5.1 Desktop — sol panel (kalıcı)
- **Karar: kalıcı sol ray.** Facet'ler collapse/expand accordion; çok değerli facet'lerde "Daha Fazla Göster"
  (ilk 5–8, sonra genişlet). Disjunctive count'lar her seçimle güncellenir (backend zaten sağlıyor).
- Genişlik ~260–300px; grid kalan alanı doldurur. Ray kendi içinde `sticky`/scroll.

### 5.2 Mobile — drawer mı, bottom-sheet mi, tam ekran mı?

| Seçenek | Artı | Eksi | Uygunluk |
|---|---|---|---|
| **Tam-yükseklik drawer (öneri)** | Çok/değişken facet'e ölçeklenir; scroll doğal; "Uygula" + canlı sayaç | Ekranı kaplar | ✅ Filtre |
| Bottom-sheet (yarım) | Hızlı, tanıdık | 3–4 facet'ten fazlası sıkışır; iç-scroll karmaşık | ⚠️ Yalnız Sıralama |
| Tam ekran (route) | En çok alan | Ağır geçiş; geri-tuş yönetimi | Alternatif |

- **Karar:** Filtre = **soldan/sağdan tam-yükseklik drawer** (overlay + backdrop). Başlık "Filtrele", altta
  yapışkan **`[ n Ürünü Göster ]`** (canlı sonuç sayısı) + **`Temizle`**. Facet listesi drawer içinde scroll.
- **Sıralama = bottom-sheet** (radyo listesi, tek seçim) — hafif ve tek boyutlu olduğu için sheet ideal.
- Drawer açıkken: focus-trap, ESC kapatır, body scroll-lock (mevcut `MobileMenu` deseni tekrar kullanılır),
  `aria-modal`, `role="dialog"`.

### 5.3 Mobil filtre uygulama modeli
- **Öneri: "gecikmeli uygula".** Mobil drawer'da seçimler yerel state'te toplanır, **"Göster"**e basınca URL'e
  yazılır (tek navigasyon, tek fetch). Sayaç ("n Ürünü Göster") canlı — backend'e hafif "preview count" için ya
  (a) her değişimde debounce'lu bir arama (pageSize=1, sadece totalItems) ya (b) basitçe her seçimde tam fetch
  + optimistic. **Karar:** başlangıçta (b) yeterli değilse (a)'ya geç. Desktop'ta ise **anında uygula** (her
  tık URL'i günceller, `useTransition` ile pending).

---

## 6. Dynamic Facet Rendering Engine

**Prensip:** Hardcode facet YOK. Backend her facet için şunu gönderir (`publicSearchFacetSchema`):
```
{ attributeDefinitionId, code, name, dataType, unit, displayOrder,
  selectionMode: "MULTI"|"RANGE"|"BOOLEAN",
  values: [{ optionId, value, label, colorHex, count, selected }],
  range: { availableMin, availableMax, selectedMin, selectedMax } | null }
```

### 6.1 Render stratejisi — iki katmanlı anahtar

**Birincil anahtar = `selectionMode` (davranış), ikincil = `dataType` (sunum).** Backend'in
`deriveSelectionMode` haritası:

| dataType | selectionMode | Render component (öneri) |
|---|---|---|
| `SELECT` | MULTI | `FacetCheckboxList` (label + count) |
| `MULTI_SELECT` | MULTI | `FacetCheckboxList` |
| `COLOR` | MULTI | `FacetColorSwatch` (**`colorHex` dolu** → renk dairesi + label + count) |
| `TEXT`/`TEXTAREA`/`RICH_TEXT`/`URL` | MULTI | `FacetCheckboxList` (value=label, `optionId=null`) |
| `INTEGER` | RANGE | `FacetRange` (min/max input, `unit` eki) |
| `DECIMAL` | RANGE | `FacetRange` |
| `DATE` | RANGE | `FacetDateRange` (değerler **epoch-ms**) |
| `BOOLEAN` | BOOLEAN | `FacetToggle` (iki değer: `"true"/"false"`, label backend'den) |
| `IMAGE`/`FILE` | — | Backend zaten **eler** (facet olmaz) → frontend'e gelmez |

### 6.2 Registry deseni (kavramsal — kod değil)
```
facetRenderers: Record<SelectionMode, FacetRenderer>
render(facet):
  if facet.selectionMode === "RANGE"  → dataType === "DATE" ? DateRange : NumberRange
  if facet.selectionMode === "BOOLEAN"→ Toggle
  else (MULTI)                        → dataType === "COLOR" ? ColorSwatch : CheckboxList
```
- Yeni bir attribute tipi eklendiğinde yalnız registry'ye bir satır; PLP/route DEĞİŞMEZ. Bu, backend'in
  "hardcode facet yok" ilkesinin frontend karşılığıdır.
- **Fiyat** özel bir facet değil; `minPrice/maxPrice` (top-level) için de aynı `FacetRange` component'i tekrar
  kullanılır (currency formatlı).
- **`unit`** alanı label'a eklenir (ör. "Ağırlık (g)").
- **Fallback:** bilinmeyen `dataType` gelirse → `FacetCheckboxList` (MULTI varsayılanı), asla patlamaz.

### 6.3 Range facet — histogram yok
- Backend yalnız `availableMin/Max` + `selectedMin/Max` verir (**bucket/histogram YOK**). Bu yüzden UI:
  iki sayısal input (min/max) + opsiyonel çift-tutamaçlı slider (`availableMin..availableMax` sınırlı).
  **Sahte histogram çizilmez.** DATE'te epoch-ms → date-picker/iki tarih.

---

## 7. URL State (en kritik bölüm)

### 7.1 İlke
- **Tüm filtre/arama durumu URL query'sinde yaşar.** Backend query kontratıyla **birebir** eşlenir:
  `q`, `category`, `sort`, `page`, `pageSize`, `minPrice`, `maxPrice`, `inStock`, `filter[<code>]=v1,v2`,
  `filter[<code>][min]`, `filter[<code>][max]`.
- **PLP bir RSC'dir**; `searchParams`'ı okur, `lib/server/search.ts` (yeni) ile gateway'e iletir, sonucu
  render eder. İstemci hiçbir arama mantığı çalıştırmaz — yalnız URL'i günceller.

### 7.2 URL ↔ backend eşlemesi (facet key = attribute `code`, value = option `value`)
```
/products?q=mont&category=erkek-mont&filter[renk]=siyah,lacivert
         &filter[beden]=m,l&minPrice=50000&maxPrice=250000
         &inStock=1&sort=price_asc&page=1
```
- Facet çipini kaldır → ilgili URL param'ından o değeri çıkar. Facet tıkla → ekle. Range → min/max yaz.
- **Kanonik seri hale getirme** (belirlenmeli, ADR): anahtar sırası sabit, değerler alfabetik, boş param
  atılır → aynı seçim = aynı URL (cache + canonical + paylaşım tutarlılığı).

### 7.3 Etkiler
| Boyut | Çözüm |
|---|---|
| **history** | `router.replace` (filtre değişimi geçmişi kirletmez) vs `push` (kategori/arama = yeni sayfa). Karar: facet/sort/page = `replace`; kategori/arama gezinmesi = `push`. |
| **refresh** | RSC `searchParams`'tan yeniden fetch → durum aynen döner. |
| **deep-link / share** | URL kendi kendine yeterli; kopyala-yapıştır tam durumu taşır. |
| **SEO** | Kategori URL'i canonical + indexlenebilir; filtreli kombinasyonlar `noindex` (§11). |
| **geri/ileri** | Tarayıcı native; RSC yeniden render. |

### 7.4 İstemci güncelleme deseni
- `useTransition` → URL güncellenirken `isPending` ile grid "yumuşak-meşgul" (opacity/overlay), eski sonuç
  ekranda kalır (layout shift yok).
- `useOptimistic` (opsiyonel) → çip/checkbox anında "seçili" görünür, sunucu doğrulaması gelene kadar.
- Scroll pozisyonu korunur (`scroll: false`).

---

## 8. Search Experience

### 8.1 Bu fazda YAPILACAK
| Özellik | Neden |
|---|---|
| **Header search → sonuç** | `q` gerçek çalışır; `/products?q=` (veya `/search?q=`) SSR sonuç |
| **PLP içi arama** | Aynı sayfada `q` + facet birlikte |
| **No-result durumu** | Boş sonuç ≠ hata; öneri metni + filtre temizle CTA'sı |
| **Kategori araması** | `category` (subtree) + `q` + facet kombinasyonu |

### 8.2 Bu fazda ERTELENECEK (backend ucu yok)
| Özellik | Neden ertelenir |
|---|---|
| Autocomplete / Suggest | Ayrı `suggest` ucu yok; read-model tam-metin var ama öneri projeksiyonu yok |
| Recent searches | İstemci localStorage ile *ucuz* yapılabilir ama ürün kararı; şimdilik ertele |
| Spell correction | Backend trigram similarity var (`relevance`), ama "şunu mu demek istediniz" ucu yok |

- **Route kararı:** ayrı `/search` yerine **`/products` PLP'sini `q` ile tek yüzey** yapmak daha basit ve tek
  kod yolu (arama = facet'siz/kategorisiz bir PLP durumu). Header formu `action="/products"` zaten uyumlu.
  (İleride pazarlama gerekçesiyle `/search` alias'ı eklenebilir.)

### 8.3 No-result vs boş kategori
- **Aramada 0 sonuç:** "\"x\" için sonuç bulunamadı" + yazım/filtre önerisi + popüler/tüm ürünler linki.
- **Filtre 0 sonuç:** aktif filtre çipleri gösterilir + "Filtreleri temizle" (mevcut `EmptyState` + reset deseni).

---

## 9. Variant Experience (PLP)

**Dürüst kısıt:** Search read-model (`ProductSearchDocument`) **varyant/swatch dizisi taşımaz**; `image` yalnız
**tek kapak** (sayfa-yalnız hidrasyon). Dolayısıyla search sonucundan PLP'de swatch/hover-image-switch/quick-preview
**doğrudan beslenemez.**

| Deneyim | Bu fazda? | Not |
|---|---|---|
| Hover zoom (mevcut) | ✅ Korunur | `group-hover:scale-[1.04]` |
| Renk swatch (kart altı) | ❌ Ertele | Search DTO'da varyant yok |
| Hover'da görsel değişimi | ❌ Ertele | İkinci görsel yok |
| Quick preview modal | ❌ Ertele | Tam varyant/fiyat gerekir |

**Yollar (156D veya sonrası):**
1. **Read-model'i genişlet:** dokümana bounded `swatchOptions[]` (renk `colorHex` + optionId) ekle → PLP swatch.
   (En temiz; PDP Variant Media Engine ADR-078 ile uyumlu.)
2. **Facet-güdümlü swatch:** COLOR facet zaten `colorHex` taşıyor; kart-üstü değil ama **facet** tarafında renkli
   seçim bu fazda mümkün (§6 `FacetColorSwatch`). Kart-içi swatch ayrı iş.

**Karar:** Bu faz **facet-COLOR swatch**'ını yapar (veri var); **kart-içi varyant swatch/hover-switch**'i, read-model
genişlemesine bağlı ayrı iş olarak işaretler (bkz. §19 TD).

---

## 10. Performance

| Teknik | Karar |
|---|---|
| **Server Components** | PLP kabuğu + sonuç grid'i RSC; fetch sunucuda (BFF, `no-store`). Facet paneli/drawer = client island. |
| **Streaming + Suspense** | Araç çubuğu + filtre rayı hemen; sonuç grid'i `<Suspense fallback={<GridSkeleton/>}>` ile stream. `loading.tsx` zaten var (genişletilir). |
| **useTransition** | Filtre/sıralama değişiminde grid pending; eski içerik kalır (CLS yok). |
| **Prefetch** | `next/link` ile PDP + sonraki sayfa prefetch (viewport'ta). |
| **Parallel routes** | Gerekmez; tek fetch yeterli. Modal quick-view gelirse `@modal` slot düşünülür (sonraki faz). |
| **Image loading** | İlk satır (LCP) `priority`/eager; gerisi `loading="lazy"`. `next/image` (mevcut `ProductMedia` drop-in). `sizes` responsive. |
| **Virtualization** | **Gerekmez** (pageSize 24 + Load More). Yalnız "hepsini yükle" gibi 500+ DOM olursa gerekir — o senaryo yok. |
| **Fetch maliyeti** | Backend sorgu sayısı ürün-sayısından bağımsız (bounded); pageSize cap 100. |

---

## 11. SEO

| Konu | Karar |
|---|---|
| **PLP (tüm ürünler)** | `index,follow`; canonical = `/products` (filtresiz). |
| **Kategori sayfası** | Yeni `/products?category=slug` (ya da `/categories/[slug]`) → `index,follow`, canonical temiz kategori URL'i. **Öneri:** SEO için ayrı `/categories/[slug]` route'u (temiz path, breadcrumb, açıklama). |
| **Arama (`q`)** | `noindex,follow` (arama sonuç sayfaları indexlenmez — Google en iyi pratiği). |
| **Filtreli kombinasyon** | `noindex,follow` (facet kombinasyon patlaması). İstisna: seçili yüksek-değerli kategori+tek-facet için index-allowlist (ADR-079 §283-284 önerisi). |
| **Canonical** | Filtreli/sayfalı varyantlar → canonical temel kategori/PLP'ye; ya da self-canonical + noindex. |
| **JSON-LD** | `ItemList` (ürün listesi, position + url), `BreadcrumbList`. PDP'de zaten `Product` düşünülmeli (ayrı). |
| **Pagination SEO** | `rel=prev/next` (Google artık kullanmasa da Bing/diğerleri için zararsız); Load More'da SSR ilk sayfa indexlenir, `?page=n` sayfaları self-canonical veya noindex. |
| **Breadcrumb** | Görünür breadcrumb (PDP'de var, PLP/kategoriye eklenir) + JSON-LD. |

---

## 12. Accessibility (WCAG 2.1 AA)

| Alan | Gereksinim |
|---|---|
| **Landmark** | `role="search"` (arama formu — mevcut), filtre `<aside aria-label="Filtreler">`, sonuç `<section aria-label="Ürünler">`. |
| **Keyboard** | Tüm facet/checkbox/slider/sort klavye ile; drawer'da **focus-trap** + ESC + focus-return (mevcut `MobileMenu` deseni). |
| **Checkbox grup** | Her facet `<fieldset>` + `<legend>` (facet adı); checkbox'lar gruplu. |
| **Slider** | `role="slider"`, `aria-valuemin/max/now`, `aria-label`; klavye ok tuşları. Yalnız input kullanılırsa `<input type="number">` label'lı — daha erişilebilir. |
| **Renk swatch** | Renk **tek başına anlam taşımaz** → label metni her zaman görünür/okunur (`aria-label="Renk: Siyah"`). Kontrast: swatch kenarlığı açık renklerde. |
| **Canlı sonuç** | Sonuç sayısı `aria-live="polite"` region ("128 ürün bulundu") — filtre değişince ekran okuyucu duyurur. |
| **Focus görünürlüğü** | `--accent` focus halkası (mevcut token); 3:1 kontrast. |
| **Aktif filtre çipi** | Her çip `<button aria-label="Siyah filtresini kaldır">`. |
| **Reduced motion** | `prefers-reduced-motion` → hover scale/transition kapat. |
| **Kontrast** | Mevcut palet AA geçiyor (accent beyaz üzeri ~6.4:1); count/ink-subtle metinlerde 4.5:1 doğrula. |

---

## 13. Responsive (Breakpoint stratejisi)

| Breakpoint | Grid | Filtre | Sıralama | Çipler |
|---|---|---|---|---|
| `< 640` (base) | 2 sütun | Drawer (buton) | Sheet (buton) | Yatay kaydırma |
| `sm 640` | 2 sütun | Drawer | Sheet | Yatay kaydırma |
| `md 768` | 3 sütun | Drawer | Araç çubuğu dropdown | Tek/çok satır |
| `lg 1024` | 4 sütun | **Kalıcı sol ray** | Araç çubuğu dropdown | Grid üstü |
| `xl 1280` | 4 sütun (geniş) | Kalıcı ray | dropdown | Grid üstü |

- Tek breakpoint sistemi Tailwind varsayılanı (yeni breakpoint gerekmez). `max-w-grid` (1440) kabı korunur.
- Araç çubuğu `sticky top-16` (header 64px altında) tüm boyutlarda.

---

## 14. State Management

| State türü | Nerede | Nasıl |
|---|---|---|
| **Filtre/arama/sıralama/sayfa** | **URL** (`searchParams`) | Tek gerçek kaynak; RSC okur |
| **Sunucu state (sonuç+facet)** | RSC fetch | `no-store`; her istek taze; React `cache()` ile aynı-istekte tekilleştir |
| **Optimistic/transition** | Client island | `useTransition` (pending grid), `useOptimistic` (anında çip) |
| **Efemer UI** | Client (local) | Drawer açık/kapalı, facet collapse, "daha fazla göster", slider sürüklerken geçici değer |
| **Mobil "gecikmeli uygula"** | Client (local) | Drawer içi seçim tamponu → "Göster"de URL'e commit |

- **Kural:** Kalıcı/paylaşılabilir olan her şey URL'de; yalnız görsel/efemer olan client'ta. Global store
  (Redux/Zustand) **gerekmez**.

---

## 15. Error & Loading UX

### 15.1 Error
| Senaryo | Davranış |
|---|---|
| API 5xx / ağ | `error.tsx` boundary → "Bir şeyler ters gitti" + **Tekrar dene** (router.refresh). Mevcut `EmptyState` dili. |
| 400 (geçersiz filtre) | Bozuk param'ı yok say / sıfırla, temiz URL'e düzelt; kullanıcıya sessiz kurtarma. |
| 404 (store/kategori yok) | `no-store` → uygun boş durum (mevcut `catalog.ts` deseni). |
| Timeout | Fetch timeout → error boundary; retry. |
| Offline | Native tarayıcı; retry butonu. |

### 15.2 Loading
| An | UI |
|---|---|
| İlk yük (SSR) | `loading.tsx` iskeleti (başlık + araç çubuğu + kart grid skeleton — mevcut `ProductCardSkeleton`). |
| Filtre değişimi | `useTransition` pending → grid opacity + spinner; **eski sonuç kalır** (boş ekran yok). |
| Load More | Buton `loading` durumu + yeni kart skeleton'ları eklenir. |
| Facet güncelleme | Facet count'ları güncellenirken hafif skeleton/opacity. |
| Progressive | Suspense ile araç çubuğu/filtre önce, grid stream. |

---

## 16. Design System (yeni ortak componentler)

Mevcut yerel DS yeterli **değil**; aşağıdakiler **yeni** (hepsi `apps/storefront-web/components/ui` veya
`components/search/` altına — paylaşılan `@commerce-os/ui`'ye **dokunmadan**):

| Component | Sorumluluk |
|---|---|
| `SearchToolbar` | Sonuç sayısı (aria-live) + sıralama tetikleyicisi + mobil filtre/sırala butonları |
| `SortControl` | Desktop dropdown / mobil bottom-sheet radyo (6 sort değeri) |
| `FilterRail` | Desktop kalıcı sol ray konteyneri |
| `FilterDrawer` | Mobil/tablet tam-yükseklik drawer (focus-trap, ESC, scroll-lock, "Göster" CTA) |
| `FacetSection` | Tek facet accordion (başlık, collapse/expand, "Daha Fazla Göster") |
| `FacetCheckboxList` | MULTI (SELECT/MULTI_SELECT/TEXT) — label + count |
| `FacetColorSwatch` | COLOR — `colorHex` dairesi + label + count |
| `FacetRange` | INTEGER/DECIMAL — min/max input (+ opsiyonel slider), `unit`/currency |
| `FacetDateRange` | DATE — epoch-ms iki tarih |
| `FacetToggle` | BOOLEAN — iki-durumlu (label backend'den) |
| `FacetRenderer` | selectionMode/dataType → doğru facet component'i seçen registry |
| `ActiveFilterChips` | Seçili filtre çipleri + tekil kaldır + **Tümünü Temizle** |
| `Pagination` / `LoadMore` | SSR sayfa + "Daha Fazla Yükle" (append) |
| `SearchResultsGrid` | Responsive kart grid + boş/no-result |
| `EmptyState` (mevcut) | Tekrar kullan (no-result / hata / filtre-boş) |
| `Skeleton`/`ProductCardSkeleton` (mevcut) | Tekrar kullan |
| `PriceRangeInput` | Fiyat (top-level minPrice/maxPrice) — `FacetRange` ile ortak |
| `SearchBox` (geliştir) | Header + PLP; submit → URL; (ileride autocomplete kancası) |

- **Token disiplini:** facet/çip/toggle **nötr** (`ink`/`line`/`surface`); tek `--accent` yalnız birincil CTA +
  focus. Bu kural yeni componentlerde de korunur.
- **Kart:** iki `ProductCard`'ı tek `ProductCard`'a birleştir (search DTO'suna uyarlanabilir prop yüzeyi).

---

## 17. Fazlara Bölünmüş İmplementasyon Planı

> Üç faz **yaklaşık eşit** büyüklükte. Her faz kendi başına deploy edilebilir + smoke edilebilir (backend zaten canlı).

### TODO-156B — Foundation: URL State + SSR PLP + Grid + Sort + Load More
**Hedef:** PLP gerçekten search ucundan beslenir; filtre henüz yok ama arama+sıralama+sayfalama+URL çalışır.
- `api-client`'a `PublicSearchResponse` fetch yüzeyi + query-string builder (URL ↔ backend eşlemesi, kanonik seri).
- `lib/server/search.ts` — gateway `GET /public/stores/:slug/search` çağrısı (BFF, `no-store`).
- `/products` RSC → `searchParams` okur (`q`,`sort`,`page`,`minPrice`,`maxPrice`,`inStock`,`category`), fetch, render.
- `SearchResultsGrid` + kart (mevcut `ProductCard` search DTO'suna uyarlanır; **kampanya/compareAt kayıp** kararı — §18 R1).
- `SortControl` (desktop dropdown), `LoadMore`/`Pagination` (SSR sayfa + append), `useTransition` pending.
- Header arama formu → gerçek `q` (mock kaldırılır); no-result + hata + loading (Suspense/`loading.tsx`).
- Temel SEO: PLP canonical + `noindex` arama; breadcrumb iskeleti.
- Testler: query-builder (saf), RSC render, no-result/hata, sort.

> **✅ DONE (2026-07-19, worktree).** Uygulandı: `lib/search/url-state.ts` (tek-otorite codec, gateway parser'ıyla birebir), `lib/server/search.ts` (BFF + allowlist parse), `lib/search/listing-adapter.ts` (biçimleme-yalnız), `lib/search/pagination.ts` + `lib/search/seo.ts` (saf), `components/search/*` (grid/kart/toolbar/sort/pagination/empty/heading/transition/results-region), `components/site/header-search.tsx` (gerçek arama), `app/products/{page,error,loading}.tsx` (RSC wiring). api-client search yüzeyi + i18n `search` bloğu (TR/EN). Eski `ProductListingView` (istemci filtre/slice) silindi; catalog/PDP/eski uç KORUNDU. **Load More** temiz-history kurulamadığından (BFF sunucu-yalnız) 156C/D'ye ERTELENDİ (yalnız numaralı pagination). Gate: storefront 273/273 (+75 test) · next build yeşil · lint temiz · **Docker runtime smoke ALL PASS** (PLP SSR · header arama · sort · pagination · geri/ileri · swatch · mobil 2-kolon · PDP/katalog regresyon temiz). Detay: [[docs/PHASE_LOG.md]] Faz 2C-8C + [[docs/TECHNICAL_DEBT.md]] TD-051. Commit/PR/deploy YOK (brief gereği).

### TODO-156C — Dynamic Facet Engine + Filtre Paneli/Drawer + Aktif Çipler
**Hedef:** Facet render motoru + desktop ray + mobil drawer + disjunctive count'lar + aktif filtre çipleri.
- `FacetRenderer` registry (selectionMode/dataType) + `FacetCheckboxList`/`FacetColorSwatch`/`FacetRange`/
  `FacetDateRange`/`FacetToggle`/`FacetSection` ("Daha Fazla Göster", collapse/expand).
- `FilterRail` (desktop kalıcı) + `FilterDrawer` (mobil/tablet, focus-trap/ESC/scroll-lock, "Göster" CTA +
  canlı sayaç, "gecikmeli uygula").
- `ActiveFilterChips` (tekil kaldır + Tümünü Temizle) — URL sync.
- `filter[code]` URL kodlaması (multi + range + min/max), disjunctive count'ların doğru yansıması.
- Fiyat = `FacetRange`/`PriceRangeInput` (currency). Stok = `FacetToggle`.
- A11y: fieldset/legend, slider aria, aria-live sonuç sayısı, çip label'ları.
- Testler: facet registry (her dataType), URL kodlama round-trip, drawer davranışı, disjunctive senaryo.

### TODO-156D — Search Deneyimi + Kategori Sayfaları + SEO/JSON-LD + A11y Denetim + Analytics Kancaları
**Hedef:** Deneyimi tamamla ve enterprise cila.
- Kategori sayfası route'u (`/categories/[slug]` veya `category` param'lı zengin PLP) + subtree + açıklama +
  canonical + breadcrumb (görünür + JSON-LD `BreadcrumbList`).
- JSON-LD `ItemList` (sonuç), pagination SEO (`rel prev/next`, page canonical/noindex kuralları), filtreli
  kombinasyon `noindex`/allowlist.
- No-result cila (öneri, popüler linkler), spell/suggest için **kanca noktaları** (backend gelince).
- A11y tam denetim (WCAG 2.1 AA checklist), reduced-motion, ekran okuyucu turu.
- **Analytics kanca noktaları** (§18): olay yayınlayan ince bir katman (henüz tüketici yok).
- Performans cila: image `priority`/`sizes`, prefetch, streaming sınırları.

**Neden bu bölünme dengeli:** 156B veri yolu + kabuk; 156C en ağır UI (facet motoru + drawer); 156D genişlik
(kategori/SEO/a11y/analytics). Her biri ~1 iş paketi.

---

## 18. Riskler

| # | Risk | Etki | Azaltma |
|---|---|---|---|
| **R1** | **Kart zenginlik regresyonu:** search DTO'da kampanya rozeti / "Sepette" tahmini / compareAt / Omnibus YOK | PLP kartı bugünkü F4A/F4B zenginliğini kaybeder | **✅ ÇÖZÜLDÜ (TODO-155.1, ADR-079 Ek).** Read-model'e index-anında bounded listing projection eklendi: `compareAtMinor`/`discountPercent`/`omnibusPreviousPriceMinor` (typed) + swatch/primary/secondary görsel (`listing` jsonb). İkinci hydration turu YOK; allowlist temiz; Docker gerçek-PG smoke PASS. **MERGED + DEPLOYED** (feat `dbeeac0`, PR #85, merge `42bc9c7`=main). **Kalan:** kampanya rozeti snapshot'ı bilinçle **TODO-155.2**'ye ertelendi (F4A motoru paylaşımı; compareAt indirimi + Omnibus 155.1'de KORUNDU). Bkz. TD-050. |
| **R2** | **Fiyat sunumu farkı:** search `minPriceMinor/maxPriceMinor` (aralık) vs bugünkü "en ucuzdan başlayan" + kampanya | Tutarsız fiyat dili | Kart fiyat mantığını tekilleştir; aralık yerine `minPriceMinor` "…'den başlayan" + (kampanya çözülürse) tahmin |
| **R3** | **i18n facet etiketi:** boolean `Evet/Hayır` backend'de TR sabit | EN mağazada kayma | Frontend'de boolean label'ı i18n'den türet (backend value `"true"/"false"` sabit → güvenli) |
| **R4** | **Facet kombinasyon patlaması / SEO** | Crawl bütçesi, dupe içerik | `noindex` + canonical disiplini (§11), kanonik URL serileştirme |
| **R5** | **Mobil "canlı sayaç" maliyeti** | Fazla istek | Debounce + preview-count (pageSize=1) ya da gecikmeli-uygula |
| **R6** | **Çift ProductCard / DS drift** | Bakım | 156B'de kartı birleştir |
| **R7** | **Multi-tenant tek store** | `demoStoreSlug` sabit | Faz 6 kapsamı; slug çözümleme yerelleştir |
| **R8** | **OpenSearch geçişi** | Kontrat değişirse frontend kırılır | ADR-079 kontratı sabit (`SearchProvider` port); frontend yalnız `publicSearchResponseSchema`'ya bağlanır → güvenli |

---

## 19. Teknik Borç

| # | Borç | Not |
|---|---|---|
| TD1 | **Read-model varyant/swatch taşımıyor** | Kart-içi renk swatch + hover image-switch bu fazda yapılamaz; read-model genişlemesi gerekir (ADR-078 ile uyumlu bounded `swatchOptions[]`) |
| TD2 | **Read-model kampanya/indirim taşımıyor** | R1; PLP kampanya rozeti için okuma-modeli veya hidrasyon kararı |
| TD3 | **`productImageSrc` placeholder kancası** | Görsel altyapısı canlı ama fallback hâlâ null; search `image` alanı doğrudan beslenir → kanca sadeleşebilir |
| TD4 | **İki ProductCard component'i** | Konsolidasyon (156B) |
| TD5 | **Kategori sayfası yok** | 156D'de eklenir; şu an `category` yalnız filtre |
| TD6 | **Suggest/autocomplete/recent/spell backend yok** | Frontend kanca noktaları bırakılır; backend ayrı iş |
| TD7 | **Boolean facet TR sabit** | R3; i18n'e taşınmalı |
| TD8 | **Range histogram yok** | Backend yalnız min/max; zengin histogram istenirse read-model + sorgu genişler |

---

## 20. Nihai Öneri

1. **URL-öncelikli, RSC-tabanlı bir PLP'ye geç.** Tüm arama durumu `searchParams`'ta; PLP sunucuda fetch eder;
   istemci yalnız URL'i günceller (`useTransition`/`useOptimistic`). Bu tek karar deep-link/paylaşım/refresh/
   geri-ileri/SEO'yu birlikte çözer ve backend kontratıyla birebir hizalanır.
2. **Facet render'ını registry ile veri-güdümlü yap.** `selectionMode` birincil, `dataType`/`colorHex` sunum.
   Hardcode facet asla. Yeni attribute tipi = registry'ye bir satır.
3. **R1'i (kart zenginlik regresyonu) 156B'den ÖNCE karara bağla** — bu, mimarinin tek gerçek blocker'ı:
   read-model'i mi genişletiyoruz, sayfa-yalnız badge hidrasyonu mu, yoksa PLP'de kampanyayı bilinçli bırakıp
   PDP'ye mi taşıyoruz? Öneri: **bounded read-model genişletmesi** (kampanya-rozeti + swatchOptions), çünkü
   hem PLP zenginliğini korur hem N+1'siz kalır hem ADR-079 "read-model-only" ilkesine sadık.
4. **Mobilde tam-yükseklik filtre drawer'ı + bottom-sheet sıralama.** İçerik-öncelikli; facet sayısına ölçeklenir.
5. **Bu fazda arama = `q`'lu PLP; autocomplete/suggest/recent'i ertele** (backend ucu yok — dürüst kapsam).
6. **Yeni componentler yerel `components/ui`/`components/search`'e; paylaşılan `@commerce-os/ui`'ye dokunma;
   tek-aksan token disiplinini koru.**
7. **Fazlandırma:** 156B (veri yolu + kabuk + sort + pagination + URL), 156C (facet motoru + drawer + çipler),
   156D (kategori + SEO/JSON-LD + a11y + analytics kancaları) — üçü yaklaşık eşit, her biri bağımsız deploy/smoke.

> **Kural teyidi:** Bu doküman analiz + mimaridir. Kod, migration, component, endpoint, PR üretilmemiştir.

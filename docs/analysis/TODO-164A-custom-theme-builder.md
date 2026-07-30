# TODO-164A — Custom Theme Builder (Analiz)

> Durum: analiz + implementasyon. Base: TODO-164 Tenant Theme Architecture CLOSED
> (PR #149 `b4c43928`, docs #150). Bu doküman mevcut tema motorunu haritalar ve
> **görsel bir tema oluşturucuyu** (Store Admin) mevcut engine + slot contract + H-1
> güvenlik modelinin ÜSTÜNE, paralel bir motor/storefront kurmadan nasıl inşa
> edeceğimizi belirler.

## 0. İnvariant'lar (değişmez sınırlar)

- **Tek storefront engine, tek slot contract.** İkinci storefront / paralel tema motoru
  YASAK. Builder yalnız *typed token* + *izinli slot variant config* üretir.
- **Raw HTML / JS / arbitrary CSS YASAK.** Builder'ın ürettiği her değer H-1 typed token
  registry + slot allowlist'ten geçer. Custom CSS alanı EKLENMEZ (bu fazda).
- **Presentation-only.** Builder fiyat/stok/sepet/checkout/ödeme/sipariş/attribution/auth/
  tenant context/API uçlarını DEĞİŞTİREMEZ. Slot bileşenleri yalnız canonical projection
  prop'ları alır.
- **Müşteriye özel core fork YOK.** `if store.slug === …` yasak; mağazaya özel görünüm
  = mağazaya-scoped ThemeVersion snapshot (config + document).
- **Geriye uyumluluk.** Mevcut published tema görünümünü AYNEN korur; builder-uyumlu
  draft'a otomatik-farklı görünmeden dönüştürülebilir. Migration additive + immutable.
- **Marketplace repository'ye dokunulmaz. TODO-165'e geçilmez.**

## 1. Mevcut altyapı (REUSE — yeniden yapılmaz)

TODO-158B (ADR-087) + H-1 + TODO-164 (ADR-216…224) ile üç katmanlı, versiyonlu, güvenli bir
tema temeli zaten var. Builder bu temelin **UI + config genişlemesidir**, yeni motor değildir.

| Katman | Konum | Rol | Builder'da rolü |
| --- | --- | --- | --- |
| Token belgesi | `@commerce-os/theme/schema.ts` `ThemeDocument` | design→semantic→component `{ref}` | Stil sekmesi tokenOverrides kaynağı |
| Token registry (H-1) | `registry.ts` + `validate.ts` | her token TİPLİ; unknown/unsafe reddi | Tüm builder değerleri buradan doğrulanır |
| CSS motoru | `css.ts` `generateStorefrontThemeCss` | belge → `:root[data-theme]` blok | Preview + publish CSS |
| Token presetleri | `presets.ts` | 11 palet (classic/luxury/fashion/dark-luxury…) | Başlangıç noktası paleti |
| Slot contract | `slots.ts` `THEME_SLOT_REGISTRY` | 8 slot, typed variant allowlist | **Yapı sekmesi** — genişletilecek |
| Layout presets | `layout-presets.ts` | 5 preset → slot+tokenPreset | Başlangıç noktası |
| Custom package | `custom-package.ts` | versiyonlu manifest | Preset promotion (görünürlük) |
| Theme registry | `theme-registry.ts` | theme-key otoritesi + compatibility alanları | Compatibility + assign |
| Compatibility | `compatibility.ts` | publish gate (api/version/slot/token) | Publish doğrulama |
| Config | `config.ts` `themeConfigSchema` | `{themeKey, layoutPreset, slots}` | **Genişletilecek** builder config |
| Persistence | DB `Theme` + `ThemeVersion` | DRAFT/PUBLISHED/ARCHIVED, mağaza-başı 1 PUBLISHED, immutable snapshot | Builder taslak/yayın |
| Gateway uçları | `apps/api-gateway/src/theme/{data,routes}.ts` | CRUD + draft/publish/rollback/preview/export/import | Genişletilecek |
| Public uç + cache | `server.ts` `/public/stores/:slug/theme` + `themeResolverCache` (30s, store-scoped) | ALLOWLIST projection; THEME_STUDIO kapalıysa base | Preview ayrı cache alır |
| Storefront enjeksiyon | `storefront-web/app/layout.tsx` | `getStoreTheme()` → `<style>` + `data-layout-preset` + `ThemeSlotsProvider` | Preview route + slot wiring |
| Slot tüketim | `components/theme/theme-slots.tsx` `useSlotVariant` | slot→variant string → `data-*` | **Genişletilecek** (3 slot bağlanacak) |
| Store-admin | `app/(app)/theme/theme-studio.tsx` | token editörü + client scoped preview + rollback | **Builder'a dönüştürülecek** |
| Platform-admin | `admin-web/.../themes` + `theme-binding-panel.tsx` | fleet + assign | Alanlar genişletilecek |
| Capability | `THEME_STUDIO` | gateway 403 / public base-fallback / nav gizleme | Builder da bu capability altında |

### 1.1 Kritik gözlemler (analiz bulguları)

1. **DB modeli snapshot tabanlı.** `ThemeVersion` immutable satır; `document`=token JSON,
   `config`=layout/slot JSON. Draft/published AYRI satırlar (`status` alanı). `draftConfig`/
   `publishedConfig` KOLONU YOK — her ikisi de aynı `config` şemasıyla ama farklı satırda.
   Builder config'i `ThemeVersion.config` içinde yaşar → **yeni kolon gerekmez**.
2. **`Theme.themeKey/layoutPreset/status` = String (enum değil).** Yeni status/variant
   eklemek migration istemez. Builder buna uyar.
3. **Storefront tema = TÜMÜYLE CSS-custom-property sürücülü.** Slot variant'ları
   `data-*` attribute + `globals.css` attribute-selector ile fark üretir. Bileşende switch/
   conditional markup YOK.
4. **Slot uygulama boşluğu:** 8 slottan yalnız **5'i bağlı** (header, footer, mobileNavigation,
   hero, productCard) ve variant farkları **sığ/kozmetik** (border, shadow, aspect-ratio).
   **3 slot HİÇ tüketilmiyor:** `productDetailLayout`, `productListingLayout`, `homeSectionFrame`
   — resolve edilip `theme.slots`'a giriyor ama storefront okumuyor → görünür etki YOK.
   **Bu, TODO-164A'nın ana boşluğudur:** her slot için ≥3 GÖRÜNÜR variant + 3 bağlanmamış slotu
   bağlamak.
5. **Preview = in-admin client-side scoped mock** (`#tp-scope`), gerçek storefront bileşeni
   DEĞİL. Spec "gerçek storefront component reuse" istiyor → **storefront preview route + kısa
   ömürlü imzalı token** yaklaşımı gerekli.
6. **Store-admin editörü slots'u DAİMA `{}` gönderiyor** (yalnız token + layoutPreset). Builder
   `slots` + yeni config gruplarını dolduracak.
7. **Token değerleri serbest CSS DEĞİL** (H-1). Renk = parse+range; font = preset; shadow =
   preset. Builder tüm yeni kontrolleri bu tiplere bağlamak zorunda.

## 2. Builder config veri modeli (genişletme — additive)

`themeConfigSchema` (config.ts) additive genişletilir. Mevcut `{themeKey, layoutPreset, slots}`
KORUNUR (eski config'ler aynen parse olur). Yeni alanların TAMAMI opsiyonel; typed sub-schema'lar
`.strict()` (unknown key reddi); tüm sayısal değerler bounded. Top-level `.strip()` kalır
(ileri-uyum), builder grupları strict.

```
ThemeBuilderConfig (ThemeVersion.config JSON):
  themeKey            string (registry)                  [mevcut]
  layoutPreset        LayoutPresetKey                    [mevcut]
  slots               Partial<slot→variant> (allowlist)  [mevcut — builder doldurur]
  slotVariants        = slots'un builder-facing eşleniği (structured)   [YENİ]
  tokenOverrides      { brand?, surface?, text?, border?, feedback? }   [YENİ, COLOR-typed]
  typography          { headingFont?, bodyFont?, headingScale?, baseSize?,
                        lineHeight?, letterSpacing? }     [YENİ, typed]
  container           { width?, contentMaxWidth?, gridGap?, sectionSpacing? }  [YENİ, LENGTH]
  radius              { sm?, md?, lg? }                   [YENİ, LENGTH]
  shadow              { sm?, md?, lg? } (preset-id)       [YENİ, SHADOW_PRESET]
  buttonStyle         { shape: enum, weight: enum }       [YENİ, allowlist]
  surfaceStyle        { border: enum, elevation: enum }   [YENİ, allowlist]
  productCard         { density: enum, imageRatio: enum } [YENİ, allowlist]
  listing             { columnsDesktop: 2..6, gap: enum } [YENİ, bounded]
  productDetail       { layout: variant }                 [YENİ, allowlist]
  hero                { height: enum, contentAlign: enum } [YENİ, allowlist]
  navigation          { desktop: variant, mobile: variant } [YENİ, allowlist]
  media               (assets ThemeDocument.assets'te; config'te mediaRatio hint) [YENİ]
  responsiveOverrides { tablet?: Partial<ResponsiveKeys>,
                        mobile?: Partial<ResponsiveKeys> } [YENİ, typed bp]
  colorScheme         "light" | "dark"                    [YENİ]
```

Kurallar (spec §3): strict schema · bounded değerler · unknown key reddi · unsupported variant
reddi · client config OTORİTE DEĞİL · server-side validate · draft/published config ayrımı korunur.

**Config ↔ Document ilişkisi:** Renk/tipografi/spacing gibi TOKEN değerleri hem `config`
(builder-facing, structured) hem `document` (render-otoritesi) taşır. Otorite `document`;
`config` builder'ın yeniden-yükleyebileceği yapısal seçim kaydıdır. Publish anında `document`
üretilir (config → buildThemeDocument). Slot/layout seçimleri yalnız `config`'te (render slot
resolver'ı `config`'ten okur). **`responsiveOverrides` + typed spacing** ise `config`'ten
CSS'e serialize edilir (yeni `builder-css.ts` — bounded `@media` blokları; kullanıcı media query
YAZAMAZ).

## 3. Gerçek slot varyantları (görünür fark — ana iş)

Her slot için spec'in adlandırdığı ≥3 variant, `THEME_SLOT_REGISTRY.variants` allowlist'ine
ADDITIVE eklenir (mevcut lowercase variant'lar KORUNUR — layout preset/custom package/eski
config'ler bozulmaz; `defaultVariant` değişmez → geriye uyumlu). Builder yeni adlandırılmış seti
sunar. Storefront **gerçek DOM/class/layout farkı** üretir (yalnız `data-*` + kozmetik CSS DEĞİL —
grid/flex/element görünürlüğü/sıra değişir; 3 bağlanmamış slot markup'a bağlanır).

| Slot | Yeni variant'lar | Görünür fark |
| --- | --- | --- |
| Header | STANDARD · CENTERED_BRAND · EDITORIAL_SPLIT | logo ortalama; sol-nav/sağ-aksiyon split grid |
| Footer | STANDARD · MINIMAL · MULTI_COLUMN | newsletter gizle; 4-kolon link grid |
| MobileNavigation | BOTTOM_BAR · DRAWER · COMPACT_HEADER | sabit alt bar; yandan çekmece; kompakt satır |
| Hero | FULL_WIDTH · SPLIT_CONTENT · EDITORIAL_OVERLAY | tam-en; 2-kolon medya/metin; metin overlay |
| ProductCard | STANDARD · MINIMAL · EDITORIAL · DENSE | çerçeve/sıra; büyük editoryal; sıkı grid |
| ProductListing | STANDARD_GRID · EDITORIAL_GRID · DENSE_CATALOG | 3/asimetrik/5-6 kolon grid |
| ProductDetail | STANDARD · GALLERY_FIRST · EDITORIAL | galeri-üst tam-en; editoryal tek kolon |
| HomeSectionFrame | STANDARD · FULL_BLEED · EDITORIAL · COMPACT | tam-genişlik; kutulu; sıkı boşluk |

Uygulama: (a) slotu `useSlotVariant`/prop ile oku, (b) root'a `data-*` yaz, (c) `globals.css`
attribute-selector kuralları (grid-template, flex, display, order). Bağlanmamış 3 slot için
bileşenlerin root'una `data-*` + gerçek layout CSS eklenir.

## 4. Erişilebilirlik (contrast publish gate)

Yeni `@commerce-os/theme/contrast.ts`: WCAG 2.1 relative luminance + contrast ratio (saf,
bağımsız test edilebilir). Publish öncesi kritik metin/zemin çiftleri denetlenir:
`text.primary`/`surface.background`, `text.secondary`/`surface.surface`, buton fg/bg. Kritik
başarısızlık (< 4.5:1 gövde) → **publish REDDEDİLİR** (`THEME_CONTRAST_FAILED`). Uyarı seviyesi
(< 3:1 large / AA-AAA farkı) açıkça gösterilir, publish engellemez. Renk hex/rgb parse edilir;
hesaplanamayan çift atlanır (fail-safe: bilinen çift zorunlu).

## 5. Preview izolasyonu (store-scoped, kısa ömürlü)

- Gateway `POST /stores/:storeId/themes/:themeId/preview-token` → HMAC-imzalı, storeId+themeId+
  exp (≤10 dk) taşıyan opak token. THEME_STUDIO gate.
- Gateway `GET /public/theme-preview?token=…` → token doğrula → DRAFT config+document çözümle
  (published DEĞİL) → ALLOWLIST projection (prod cache'e YAZMAZ; ayrı kısa-TTL cache). Başka
  store'dan açılamaz (token store-scoped). Gerçek müşteri verisi kullanılmaz (storefront demo
  projection).
- Storefront `/preview/theme?token=…` route: token'ı projection'a çevirir, draft CSS+slots
  uygular, gerçek storefront bileşenlerini render eder (Home/PLP/PDP/Cart/Checkout senaryoları).
- Store-admin builder **iframe** ile bu route'u gömer; desktop/tablet/mobile genişlik iframe
  boyutuyla. Refresh sonrası draft korunur (draft DB'de). Production storefront DEĞİŞMEZ.

## 6. Responsive kontrol (typed)

Sistem-tanımlı breakpoint'ler (desktop/tablet/mobile — `breakpoints` token'ından). Override
alabilen bounded set: `gridColumns`, `containerPadding`, `heroHeight`, `sectionSpacing`,
`productCardDensity`, `navigationVariant`. `responsiveOverrides.{tablet,mobile}` yalnız bu
anahtarları alır; değerler typed (numeric/enum). CSS'e `@media (max-width: <bp>)` blokları
olarak serialize edilir — **kullanıcı arbitrary media query YAZAMAZ** (yalnız izinli anahtar/
bounded değer).

## 7. Tema kimliği & lifecycle

Additive migration ile `Theme` modeline: `duplicatedFrom String?`, `createdBy String?`,
`updatedBy String?`. Mevcut: name, description, status (DRAFT/PUBLISHED/ARCHIVED), version
(ThemeVersion), publishedAt (ThemeVersion). Mağaza-başı tek PUBLISHED = uygulama-enforced
(korunur). Kopyalama: config+document snapshot kopyalanır, YENİ kimlik, history/audit
KOPYALANMAZ, `duplicatedFrom` set.

## 8. Katman-katman değişiklik planı

1. **`@commerce-os/theme`** — `builder-config.ts` (genişletilmiş şema + validate + toDocument),
   `slots.ts` (variant allowlist genişleme), `contrast.ts` (WCAG gate), `builder-css.ts`
   (responsive/spacing serialize), `starting-points.ts` (create-from helper). Unit test.
2. **DB** — additive migration `Theme.duplicatedFrom/createdBy/updatedBy`; `pnpm db:generate`.
3. **contracts** — builder config request/response şemaları, duplicate/archive/preview-token.
4. **api-client** — yeni metodlar.
5. **api-gateway** — create(startingPoint), duplicate, archive, extend draft/publish (builder
   config + contrast gate), preview-token issue + public preview projection (ayrı cache).
6. **storefront** — 8 slotu bağla + gerçek variant CSS/markup; `/preview/theme` route; responsive
   CSS.
7. **store-admin** — Theme Studio → 3-bölüm builder (Yapı/Stil/Önizleme); duplicate/archive;
   başlangıç noktası; iframe preview.
8. **platform-admin** — source preset, compatibility, last update/publish, rollback target,
   preview link, draft themes, status alanları.
9. **Docs + ADR** (§21).

## 9. Güvenlik & test matrisi (özet)

- Schema: valid/unknown-key/invalid-variant/numeric-bounds/unsafe-token/invalid-font/invalid-media.
- Slots: her variant gerçek farklı markup/class; unsupported→fallback; canonical props; no business logic.
- Security: XSS/CSS-injection/external-asset/cross-store-preview/media-ownership/client-override.
- Responsive: desktop/tablet/mobile + bp override.
- Compatibility: eski themeApiVersion/missing-slot/incompatible-package/base-fallback.
- Accessibility: contrast publish gate (kritik reddi + uyarı).

## 10. Yeni ADR'ler

ADR-225 Visual Theme Builder · ADR-226 Safe Slot Composition (variant genişleme) · ADR-227
Responsive Override Policy · ADR-228 Builder Preview Isolation (imzalı token) · ADR-229 Theme
Duplication · ADR-230 Accessibility Publish Gate · ADR-231 Preset Promotion Boundary.

# TODO-164 — Tenant Theme Architecture (Analiz)

> Durum: analiz + implementasyon. Base commit `ced4c206` (TODO-163 CLOSED). Bu doküman
> mevcut altyapıyı haritalar, üç katmanlı tema mimarisini tasarlar ve paralel bir
> storefront kurmadan (invariant) mevcut motorun ÜSTÜNE nasıl inşa edileceğini belirler.

## 1. Amaç ve invariant'lar

Her mağaza, **ortak storefront engine** üzerinde kendi görünümünü kullanabilmeli. Tema:

- Yalnız **presentation** katmanını değiştirir. Fiyat/stok/sepet/ödeme/sipariş/güvenlik
  mantığına erişmez.
- Core içinde **müşteri adına göre koşul yazılmaz** (`if store.slug === …` yasak).
- Tema değişikliği **tenant/store bazında server-side** çözülür.
- Tema kapatılsa/bozulsa storefront **base theme** ile ayakta kalır.

## 2. Mevcut altyapı (yeniden yapılmaz, ÜSTÜNE eklenir)

TODO-158B (ADR-087, Enterprise Theme Engine) + H-1 (typed token XSS savunması) ile güçlü bir
temel zaten var:

| Katman | Konum | Rol |
| --- | --- | --- |
| Token belgesi | `@commerce-os/theme` `schema.ts` | design→semantic→component token, `{ref}` çözümleme |
| Token registry (H-1) | `registry.ts` | her token TİPLİ; bilinmeyen anahtar/unsafe değer reddedilir |
| CSS motoru | `css.ts` `generateStorefrontThemeCss` | belge → `:root[data-theme]` CSS custom property bloğu |
| Token presetleri | `presets.ts` | 11 renk paleti (classic/modern/luxury/fashion…) |
| Component variant kataloğu (STUB) | `variants.ts` | `components[x].variant`; storefront henüz OKUMUYOR |
| Custom CSS sanitize | `custom-css.ts` | H-1; unsafe injection engellenir |
| Persistence | DB `Theme` + `ThemeVersion` (schema.prisma:3019/3044) | DRAFT/PUBLISHED/ARCHIVED, mağaza-başı tek PUBLISHED, immutable snapshot, publish→yeni draft, rollback |
| Admin uçları | `apps/api-gateway/src/theme/{data,routes}.ts` | CRUD + draft/publish/rollback/preview/export/import, H-1 savunması |
| Public uç | `server.ts:5282` `GET /public/stores/:slug/theme` | ALLOWLIST `{css,colorScheme,schemaVersion}`; THEME_STUDIO kapalıysa DEFAULT döner |
| Storefront enjeksiyon | `apps/storefront-web/app/layout.tsx:96` | `getStoreTheme()` → `<style>` head enjekte; null → globals.css varsayılan |
| Capability | `THEME_STUDIO` (requires `HOME_EXPERIENCE`) | gateway `requireStoreAdminForModule` 403 / public 404; store-admin `ModuleGuard` + nav gizleme |

**Kritik gözlem:** Tema tümüyle **CSS-custom-property sürücülü**. Tüm storefront presentation
bileşenleri RSC'lerden **prop-driven** beslenir ve **önceden hesaplanmış** görüntü değerleri
alır (fiyat/stok label'ları sunucudan gelir; yalnız BuyBox varyant-reaktif saf tahmin yapar).
Bu, slot contract'ı temiz kılar: business data canonical projeksiyonlardan gelir, slot fiyat/stok
hesaplamaz.

### Slot → bileşen haritası (storefront)

| Slot | Bileşen | Projeksiyon |
| --- | --- | --- |
| Header | `components/site/site-header.tsx` | store-info + nav categories |
| Footer | `components/site/site-footer.tsx` | i18n |
| MobileNavigation | `components/site/mobile-menu.tsx` | nav links + categories |
| ProductCard | `components/site/product-card.tsx` (+ search varyantı) | `StorefrontProductSummary` / `SearchListingCard` |
| ProductDetailLayout | `app/products/[handle]/page.tsx` | `StorefrontProductDetail` |
| ProductListingLayout | `app/products/page.tsx` | search read-model |
| Hero | `components/site/home/hero-slider.tsx` | `StorefrontHomeHeroSlide[]` |
| HomeSectionFrame | `components/site/home/home-sections.tsx` | `StorefrontHomeSection[]` |

## 3. Üç katmanlı tema mimarisi (YENİ)

```
┌──────────────────────── Theme Registry (tek otorite) ────────────────────────┐
│  key → { kind, version, themeApiVersion, minimumCommerceVersion,             │
│          slots[], tokenSchemaVersion, layoutPreset, status, fallbackThemeKey }│
│  ── Unknown key REDDEDİLİR. Base/Preset/CustomPackage hep buradan çözülür.    │
└───────┬───────────────────────┬───────────────────────────┬─────────────────┘
        │                       │                           │
   1) Theme Tokens        2) Layout Presets          3) Custom Theme Package
   (mevcut motor)          (YENİ — slot→variant)      (YENİ — versioned manifest)
   renk/tipografi/…        BASE_COMMERCE/FASHION_…     packageKey/version/…
```

### 3.1 Theme Tokens (mevcut)
`ThemeDocument` (design/semantic/component). Desteklenen: colors, typography, radius, shadow,
spacing, button style (component.button), surfaces, container width (layout), logo/favicon
(assets). Typed registry + bounded schema; **arbitrary CSS variable kabul edilmez** (H-1).

### 3.2 Layout Presets (YENİ — `layout-presets.ts`)
Bir preset, her slot için bir **variant** seçer + varsayılan token preseti bağlar. İlk presetler:
`BASE_COMMERCE`, `FASHION_MINIMAL`, `FASHION_EDITORIAL`, `MARKETPLACE_DENSE`, `PREMIUM_BOUTIQUE`.
Bu fazda her preset için tamamen farklı tasarım üretilmez; **contract + en az iki gerçek çalışan
varyant** yeterli (ProductCard `comfortable|compact|premium`, Header `solid|minimal|floating`,
Hero `full|editorial|split` gerçek uygulanır).

### 3.3 Custom Theme Package (YENİ — `custom-package.ts`)
Versioned manifest contract: `packageKey, version, themeApiVersion, minimumCommerceVersion,
supportedSlots, status, layoutPreset, slots(override), tokenPreset?, manifest`. Paket YALNIZ izinli
presentation slotlarını override eder; **business logic import etmez**. Örnek generic paket:
`packages/themes/demo-aurora/manifest.json` (müşteri adı YOK). Registry üzerinden çözülür.

## 4. Slot contract (`slots.ts`)

Sabit contract: `header, footer, mobileNavigation, productCard, productDetailLayout,
productListingLayout, hero, homeSectionFrame`. Her slot: typed variant allowlist + defaultVariant +
server/client sınırı. İlkeler: business data canonical projeksiyondan; slot **fiyat/stok hesaplamaz**,
kendi API çağrısını icat etmez, tenant izolasyonunu bypass etmez.

## 5. Persistence (additive)

Mevcut `Theme`/`ThemeVersion` TOKEN belgesini (draftTokens/publishedTokens = `document`), versiyonlama,
publish/rollback'i zaten karşılıyor. TODO-164 additive alanlar ekler:

- `Theme.layoutPreset String @default("BASE_COMMERCE")` — aktif layout preset.
- `Theme.themeKey String @default("BASE_COMMERCE")` — registry key (custom paket için packageKey).
- `Theme.themeApiVersion Int @default(1)`.
- `ThemeVersion.config Json @default("{}")` — slot/layout config (draftConfig/publishedConfig; sürüm statüsüne göre draft vs published).
- `ThemeVersion.layoutPreset String?`, `ThemeVersion.themeKey String?` — sürüm anındaki snapshot.
- `ThemeVersion.publishedBy String?`.

Statü `INCOMPATIBLE`/`DISABLED`: `status` String olduğundan **migration gerektirmez**.
`previousPublishedVersion` sürüm listesinden (ARCHIVED) türetilir. Migration **immutable + additive**;
mevcut satırlar deterministik olarak `BASE_COMMERCE`/`{}`'e backfill edilir → görünüm korunur.

## 6. Storefront resolver + cache

Server-side sıra: **(1) geçerli published custom theme → (2) geçerli layout preset → (3) base theme**.
Public projeksiyon yalnız gerekli presentation projeksiyonunu döndürür (`css`, `colorScheme`,
`layoutPreset`, `slots` map, `schemaVersion`, `themeKey`); iç config/audit/draft **sızmaz**.
Store-scoped bounded cache + publish sonrası invalidation (mevcut `capabilityCache` deseni ile hizalı;
tema publish `themeResolverCache.invalidate(storeId)`).

## 7. Compatibility (`compatibility.ts`)

Kontroller: `themeApiVersion ≤ current`, `commerce-os ≥ minimumCommerceVersion` (semver), required
slots bilinir, deprecated slot uyarısı, eksik component, invalid token schema, desteklenmeyen capability
bağımlılığı. Uyumsuz tema: **publish edilemez** (409); mevcut published çalışıyorsa korunur; storefront
base fallback'e güvenli geçer; Platform Admin **warning** görür.

## 8. Capability entegrasyonu (TODO-163)

`THEME_STUDIO` kapalıysa: menü yok + direct URL kapalı (mevcut `ModuleGuard`) + draft/publish API kapalı
(mevcut `requireStoreAdminForModule`) + storefront **base theme** (mevcut public uç) + mevcut veri korunur.
`HOME_EXPERIENCE` dependency korunur (registry `requires`). Store Admin kendi capability'sini açamaz
(mevcut plan/override modeli).

## 9. Güvenlik

Mevcut H-1 kararları KORUNUR (typed token + customCss sanitize + render-time defense). Ek: layout preset /
slot variant değerleri **allowlist** (bilinmeyen variant reddedilir); custom package manifest **server-side
validate**; client theme key değiştirerek override yapamaz (sunucu-otoriter resolver); cross-store tema
erişimi yok (tüm sorgular storeId-scoped); draft preview token store-scoped + kısa ömürlü; external asset
allowlist (mevcut media store-ownership); audit PII/secret taşımaz.

## 10. Platform Admin — "Tema ve Marka"

admin-web'de ayrı store-detail route YOK; `StoreEditor` modalına salt-okuma **Tema ve Marka** paneli
eklenir (aktif theme/version/layout preset/API uyumu/published+draft revision/son publish/rollback
uygunluğu/capability durumu/incompatible uyarısı) + Platform Admin **theme atama** eylemi. Yeni gateway
ucu: `GET/PUT /admin/stores/:storeId/theme-binding`.

## 11. Test / smoke / gate

Registry unique key, unknown theme, token schema, compatibility, draft/preview/publish/rollback, cache
invalidation, capability disabled → base fallback, slot resolution, cross-store isolation, XSS/CSS injection,
media ownership, existing-store backfill, responsive. Canlı smoke: enterprise-demo (`edm-store`) üzerinde
base/draft/publish/rollback/capability/compat senaryoları.

## 12. ADR'ler

ADR-216 three-layer theme architecture · ADR-217 theme registry (key authority) · ADR-218 presentation-only
boundary + slot contract · ADR-219 layout presets · ADR-220 custom theme package policy · ADR-221 theme
compatibility & versioning · ADR-222 storefront resolver & base fallback · ADR-223 draft/publish/rollback
(config katmanı) · ADR-224 capability integration.

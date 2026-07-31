# TODO-164B — Theme Builder Productization & Role Separation (Analiz)

> Durum: Dilim 1 (Temel) IMPLEMENTASYON TAMAM (build/test/lint/typecheck yeşil).
> Base: TODO-164A Custom Theme Builder CLOSED (PR #155). Bu doküman rol ayrımını,
> store override policy'yi, font/palet kütüphanelerini ve store-admin sadeleştirmesini
> MEVCUT motor + slot contract + H-1 güvenlik modelinin ÜSTÜNE (paralel motor KURMADAN)
> nasıl inşa ettiğimizi belirler.

## 0. Onaylı kararlar (kullanıcı)

1. **Platform kütüphane mağazası.** Platform tema template'leri sentetik bir Store'da
   (`systemPurpose="THEME_LIBRARY"`) yaşar → `Theme` şeması değişmez, "her tema bir
   storeId'ye ait" tenant-izolasyon invariant'ı korunur, mevcut builder aynen kullanılır.
   Sistem mağazası tüm normal listeler + storefront resolver'dan **kesinlikle** dışlanır
   (slug ile ayırmak yetmez — açık `systemPurpose` işareti).
2. **Fazlı.** Dilim 1 = temel (migration + override policy + server enforcement + font/
   palet kütüphanesi + store-admin sadeleştirme + preview highlight + test/gate/smoke).
   Dilim 2 = Platform 9-sekme Theme Designer + versiyon upgrade + full-screen preview.
3. **Logo/favicon tek otorite.** Dilim 1'de `StoreSettings` tek kaynak; `ThemeDocument`'e
   ikinci kez yazılmaz. Marka bölümü logoyu Ayarlar → Marka'ya yönlendirir (çift kaynak yok).
   Draft-staged logo + atomik publish = Dilim 2.

## 1. Değişmezler

- Tek storefront engine, tek slot contract. İkinci motor YASAK. Builder yalnız typed token
  + izinli config üretir. Raw HTML/JS/CSS YASAK (H-1 typed registry + allowlist).
- Presentation-only. Fiyat/stok/sepet/checkout/ödeme/auth/tenant context DEĞİŞMEZ.
- Additive + immutable migration; mevcut published görünüm AYNEN korunur.
- Marketplace repository'ye dokunulmaz; TODO-165'e geçilmez; Final UI Polish başlatılmaz.

## 2. Rol ayrımı

| | Platform Admin — Theme Designer & Library | Store Admin — Brand Customizer |
| --- | --- | --- |
| Kapsam | template oluştur, slot varyant, font/palet yönet, **override policy** tanımla, versiyon, mağazaya ata, rollout, rollback | logo/favicon, marka renkleri, izinli font, görsel, sınırlı düzen, preview, publish |
| Görmez | — | teknik slot contract, raw token, `themeApiVersion`, compatibility, package manifest, config JSON |
| Enforcement sınırı | gateway guard'ları (mevcut) + override policy | override policy server-side (THEME_FIELD_LOCKED) |

Dilim 1 rol ayrımının **backend + store-admin** tarafını teslim eder (policy motoru +
enforcement + sadeleştirilmiş store-admin). Platform Designer UI (9-sekme) Dilim 2.

## 3. Store Override Policy (ADR-233) — çekirdek yenilik

`@commerce-os/theme/override-policy.ts` (SAF, unit-test'li):

- `FieldPolicy = editable | locked | inherited | required | hidden`.
- `StoreOverridePolicy = { fields: Record<CanonicalFieldPath, FieldPolicy>, allowedFonts[],
  allowedPalettes[], allowedLayoutPresets[] }`.
- `CANONICAL_FIELD_PATHS` — tek otorite (brand.logo/favicon/primaryColor/accentColor, color.*,
  typography.headingFont/bodyFont/baseSize, slot.*, responsive.mobileNavigation, layoutPreset).
- `enforceOverridePolicy(policy, prev, next, changedAssetFields?)` — **server-side diff**:
  değişen her canonical alan editable/required değilse `THEME_FIELD_LOCKED`; izinsiz font →
  `THEME_FONT_NOT_ALLOWED`; izinsiz düzen → `THEME_LAYOUT_NOT_ALLOWED`. Ham değer sızmaz.
- Geriye uyum: `defaultOverridePolicy()` = hepsi editable (mevcut mağazalar). Platform
  template (`ownerScope=PLATFORM`) → `isPolicyExplicit` zorunlu; eksikse publish
  `THEME_POLICY_INCOMPLETE`.
- `allowedPalettes` = **katalog kısıtı** (renkler editable ise publish-gate yok; store zaten
  herhangi rengi girebilir). `allowedFonts`/`allowedLayoutPresets` = **enforce edilebilir**
  (tek alan) → publish/save gate.

**Baseline:** save/publish enforcement baseline'ı platform-onaylı PUBLISHED sürümdür
(yoksa mevcut draft). Baseline yoksa gate uygulanmaz (default all-editable). Publish ikinci
kapı: draft'ın locked alanı published'dan farklıysa reddeder (save-time bypass'a karşı).

## 4. Font kütüphanesi (ADR-235)

`font-library.ts`: 16 güvenli aile (familyId → sunucu-tanımlı stack) + **18 preset / 8
kategori** (Sans/Serif/Editorial/Geometric/Humanist/Display/Luxury/Minimal). Her preset:
heading+body ailesi, önerilen ağırlıklar, fallback, locale, okunabilirlik skoru, kaynak/lisans.
Stack'ler yaygın SİSTEM fontlarına + generic fallback'e dayanır → **@font-face yükleme
gerekmez** (web-font barındırma ayrı TD). `validate.ts` `FONT_FAMILY_PRESETS` bu familyId'lerle
ADDITIVE genişletildi → token bir familyId sakladığında güvenli stack'e map edilir (serbest
font-family reddi korunur). Kullanıcı serbest font-family YAZAMAZ.

## 5. Adlandırılmış palet kütüphanesi (ADR-236)

`color-palettes.ts`: **8 güvenli palet** (Modern Minimal, Premium Dark, Fashion Editorial,
Soft Neutral, Vibrant Commerce, Warm Boutique, Monochrome, Corporate Clean). Her palet typed
primitive token seti üretir; `applyPaletteToDocument(doc, id)` draft'a uygular (registry MUTATE
edilmez, girdi mutate edilmez → yeni belge). **Tümü WCAG kritik kontrastından geçer** (test'le
doğrulandı → publish-safe).

## 6. Semantik renk UX + alan etiketleri (ADR-236)

`field-labels.ts`: her canonical alan → `{ labelTr/En, descriptionTr/En, usageTr, previewTarget }`.
Teknik token adı ("primary", "surface", "muted") ANA UI'da GÖSTERİLMEZ. Store-admin `ColorField`
component'i: native renk seçici + hex input + kullanım açıklaması + **kontrast göstergesi**
(contrastRatio) + son kullanılan renkler + "önizlemede göster". Hex-only KALDIRILDI.

## 7. Preview highlight (ADR-237)

Store-admin "önizlemede göster" → preview iframe'ine `postMessage({type:"cos-theme-highlight",
target})`. Storefront `ThemePreviewHighlight` (yalnız draft-preview cookie varken mount) mesajı
dinler, hedef CSS-var/slot için elemanları kısa süre outline'lar. Production vitrini etkilenmez.
Güvenlik: yalnız bilinen mesaj tipi; DOM'a HTML enjekte edilmez.

## 8. Veri modeli (additive migration)

`20260731120000_theme_productization_role_separation`:
- `Store.systemPurpose String?` (null = normal; "THEME_LIBRARY" = tema kütüphanesi).
- `Theme.ownerScope String @default("STORE")` ("STORE"|"PLATFORM").
- `Theme.overridePolicy Json?` (null → default all-editable).
- `Theme.sourceThemeId String? / sourceThemeVersion Int?` (platform template → update-available).
- `@@index([ownerScope])`.

Mevcut veri korunur (nullable/default). Font/palet kütüphaneleri KOD (DB yok); allowed*
referansları `overridePolicy` JSON içinde string[].

## 9. Gateway (enforcement + sistem mağazası dışlama)

- Store-admin `PUT draft` + `POST publish`: `enforceOverridePolicy` → 409 (locked/font/layout).
- Platform template publish: `!isPolicyExplicit` → 409 `THEME_POLICY_INCOMPLETE`.
- `serializeDetail` → `ownerScope` + `overridePolicy` + `fieldPolicyProjection` +
  `sourceThemeVersion` + `updateAvailable` (Dilim 1: false).
- Binding assign → opsiyonel `overridePolicy` yazar.
- **Sistem mağazası dışlama:** `resolvePublicStore` (tüm public route'lar), `listStores`,
  `listThemeBindingSummaries` → `systemPurpose = null` filtreler; storefront slug erişimi 404.

## 10. Store-admin "Marka ve Görünüm"

`theme-studio.tsx` Brand Customizer'a dönüştü: Marka (logo→Ayarlar) · Renkler (picker+palet+
etiket+kontrast) · Tipografi (izinli font + önizleme örneği) · Hazır düzen (izinli, kullanıcı-
dostu ad; locked pasif) · Önizleme (iframe + viewport + highlight) · Yayınlama. KALDIRILDI: slot
menüsü, yapısal knob, raw radius, export/import, themeKey/config JSON, compatibility/version.
`themeConfig()` atama config'inin themeKey + slotVariants'ını KORUR (locked slot reset edilmez).

## 11. Test & gate (Dilim 1)

- theme unit: font-library (10), color-palettes (9, +WCAG), override-policy (15), field-labels (5).
- gateway: policy enforcement (7 — THEME_FIELD_LOCKED/FONT/LAYOUT/POLICY_INCOMPLETE + publish 2. kapı).
- store-admin: ColorField (5). Regresyon: gateway 1857, store-admin 365, theme 268.
- build 27/27 · lint temiz · typecheck temiz · git diff --check temiz.

## 12. Dilim 2 (sonraki) — outline

Platform "Tema Kütüphanesi" ana ekranı + 9-sekme Designer + override policy matris editörü +
atama akışı; theme library versioning (update-available/apply/rollback); full-screen çok-sayfa/
çok-viewport preview + before/after; ilgili testler + platform browser smoke.

## 13. ADR'ler

ADR-232 Theme Designer vs Brand Customizer (platform library store) · ADR-233 Store override
policy + server-side enforcement · ADR-234 Theme library versioning & controlled rollout ·
ADR-235 Safe font library · ADR-236 Semantic color UX + field labels · ADR-237 Preview highlight.

---

## Dilim 2 — Platform Theme Library, Designer & Controlled Rollout (IMPLEMENTASYON TAMAM)

> Durum: build/test/lint/typecheck yeşil; 3 Next app build PASS. commit/PR/deploy YOK.
> ADR-238…245. Mevcut Theme/ThemeVersion motoru REUSE (paralel motor yok).

### 14. Kütüphane mimarisi (ADR-238)
Platform template'leri sentetik `THEME_LIBRARY` sistem mağazasında yaşar (`ensureThemeLibraryStore` get-or-create;
slug `__theme-library__`; `ownerScope=PLATFORM`). Kütüphane CRUD'u mevcut store-scoped `ThemeDataAccess` metotlarını
kütüphane storeId'siyle çağırır → tek motor, migration yok. Sistem mağazası fleet/storefront/assignable-stores/tenant
seçimlerinden dışlanır (ADR-232 + `listAssignableStores` `systemPurpose:null`).

### 15. Designer (9 sekme) + policy matris (ADR-239)
admin-web `/theme-library/[id]`: Şablon/Marka/Renk Paleti/Tipografi/Bileşenler/Sayfa Düzenleri/Mobil/Önizleme/
Yayınlama. Token editörü store-admin `COLOR_UI` haritasını + palet apply + font preset + slot variant + responsive
override'ları yeniden kullanır. Policy matris editörü (`PolicyMatrix`) her canonical alan → 5 durum + font/palet/
düzen allowlist; `PUT .../policy` strict validate (`validateOverridePolicy`) + `policyRevision++`. Publish gate:
`overridePolicy` NULL olamaz + `isPolicyExplicit` (409 `THEME_POLICY_INCOMPLETE`).

### 16. Assignment + controlled rollout (ADR-240/241)
`assignTemplateToStore` published template snapshot'ını hedef mağazaya kopyalar ($transaction; yeni PUBLISHED+DRAFT;
`sourceThemeId/sourceThemeVersion` + policy; runtime bağı yok). `assign/preview` dry-run (uyumluluk + before/after);
`assign`/`update/apply` per-store yürütür → `summarizeRollout` (success/failed/skipped ayrı; failed gizlenmez).
`update/apply` yalnız update bekleyen mağazalara (diğerleri skipped).

### 17. Version upgrade + before/after (ADR-242)
Yeni template sürümü bağlı mağazaları OTOMATİK değiştirmez. `computeUpdateAvailable` (template published > store
sourceVersion). `summarizeThemeChanges` (theme-diff.ts) kullanıcı-dostu kategorize özet; raw JSON yok. Modlar:
published↔draft, current↔target, store↔template-update.

### 18. Logo staging + atomik publish (ADR-243, TD-162 CLOSED)
`ThemeVersion.stagedLogoMediaId/stagedFaviconMediaId` DRAFT staging → publish anında AYNI txn'de StoreSettings'e
atomik + `assetSnapshot`; başarısız → StoreSettings değişmez; rollback snapshot'a döner. ThemeDocument'te ikinci
kalıcı logo YOK.

### 19. Preview (ADR-244)
Version-scoped preview token (`{storeId, themeId, version?}`). Platform template preview: token storeId=kütüphane
mağazası (tema template'ten), katalog demo mağazadan → müşteri verisi kullanılmaz. Storefront middleware token'ı
request cookie'sine forward eder → ilk yükte de draft/hedef sürüm. Full-screen çok-sayfa (Home/PLP/PDP/Cart/Checkout/
Account) + çok-viewport (375/768/1024/1440) + before/after toggle; production cache'ten izole.

### 20. Rol ayrımı (ADR-245)
Store Admin `PlatformThemeBanner` (salt-okuma): managedByPlatform + version + update-available + editable/locked.
Store Admin Platform Designer'a ERİŞEMEZ; kütüphane mutasyonu yalnız SUPER_ADMIN.

### 21. Test/gate
theme 287 · gateway 1866 (9 yeni: CRUD/policy-gate/policy-invalid/assign+usage+isolation/version-update/logo-staging/
preview-version/unauthorized) · admin-web 30 (6 yeni: liste/empty/error/PolicyMatrix/BeforeAfter) · store-admin 365 ·
contracts 115 · api-client 23 · storefront 446. 3 Next app build + tüm paket build · lint · typecheck · git diff --check temiz.

### 22. Invalid media hardening (pre-ship)
Staged logo/favicon media referansı stage VE publish anında `assertAssetOwnership` ile txn-içi doğrulanır (herhangi
bir mutasyondan ÖNCE): media yok→`THEME_MEDIA_NOT_FOUND`(404), başka mağaza→`THEME_MEDIA_NOT_OWNED`(409), görsel
değil→`THEME_MEDIA_INVALID`(400). `ThemeMediaError` route'ta `themeMediaErrorResponse` ile eşlenir; ham Prisma/FK/
constraint/stack SIZMAZ. Geçersiz media artık **500 üretmez**; txn geri alınır → StoreSettings/ThemeVersion değişmez
(kısmi update yok). stage↔publish arası media silinse bile publish güvenli 404 döner. Regression: 6 yeni gateway testi
(not-found/not-owned/invalid/valid-atomik/deleted-after-stage-atomiklik/null-clear). Canlı DB smoke: 404/409 + sızıntı
yok + StoreSettings null korundu.

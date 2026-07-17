# Architecture

## Genel Yapi

commerce-os, TypeScript strict monorepo olarak organize edilir. Workspace pnpm ile yonetilir,
Turborepo build/lint/test orchestration saglar. Faz 0 sonunda runtime backend foundation seviyesindedir:
API gateway, worker, PostgreSQL, Redis, Prisma, queue ve paylasimli paketler calisir durumdadir.

## Apps

- `apps/api-gateway`: Fastify tabanli giris noktasi. Public health/version endpointleri, internal
  DB/Redis health endpointleri, platform admin auth/session endpointleri ve Faz 1A platform admin
  store/plan yonetim endpointleri burada bulunur. Faz 2A ile store-scoped catalog/inventory
  foundation endpointleri de burada yayinlanir (`/stores/:storeId/categories`, `/products`,
  `/variants`, `/inventory`); Faz 2C/F2D ile order lifecycle ve product sales model guard'lari ayni
  gecici commerce core uygulamasinda calisir. Route'lar Zod contract'lariyla input validate eder,
  tutarli JSON hata zarfi dondurur ve admin/catalog/inventory/order mutation'larinda audit log yazar.
- `apps/worker`: Background job runtime foundation'i. Redis/BullMQ tabanli queue islerinin calisacagi
  runtime alanidir.
- `apps/admin-web`: Platform super admin arayuzu (Next.js App Router). Faz 1B'de canli gateway'e
  bagli: kabuk disi login ekrani, oturum guard'li `(app)` route group kabugu (dashboard, stores,
  plans, system health, settings) ve canli stores/plans liste + create/update modallari. Tarayici
  yalnizca ayni-origin BFF route handler'larini (`/api/auth/*`, `/api/admin/*`, `/api/system/*` ve
  app liveness `/api/health`) cagirir; bu handler'lar `packages/api-client` ile gateway'e gider
  (bkz. ADR-017). Tum gorunur metin `packages/i18n`'den Turkce gelir.
- `apps/store-admin-web`: Magaza yoneticisi paneli (Next.js App Router). Faz 2B'de canli gateway'e
  bagli: kabuk disi login ekrani, oturum guard'li `(app)` route group kabugu ve canli
  dashboard/categories/products/variants/inventory ekranlari; Faz 2G'de `orders` ekrani da canli
  baglandi (customers, marketplace, theme, settings hala placeholder). Tarayici yalnizca ayni-origin
  BFF route handler'larini (`/api/auth/*`, `/api/store/context`, `/api/catalog/*`, `/api/orders/*`,
  `/api/dashboard/summary`, `/api/health`) cagirir; bu handler'lar `packages/api-client` ile gateway'e
  gider ve secili mağaza server-side cozulur (bkz. ADR-023). Mutating route'lar CSRF korumalidir. Tum
  gorunur metin `packages/i18n`'den TR/EN runtime switch ile gelir.
- `apps/storefront-web`: Public demo vitrin (Next.js App Router). Faz 3A'da canli katalog verisine
  bagli: home/`/products`/`/products/[handle]` gercek urun/varyant/stok/kategori gosterir ve urun
  satis-modeline gore CTA/fiyat davranisi render eder (ADR-029). Veri SUNUCU bilesenlerinde
  resolver ile cozulur; cart/checkout musteri-dostu placeholder'dir. Tum gorunur metin
  `packages/i18n` `storefront` sozlugunden TR/EN gelir.

### storefront-web canli katalog resolver + public-read uclari (Faz 3A.1)

Public vitrin, katalog verisini gateway'in AUTH GEREKTIRMEYEN, store-scoped, salt-okunur public-read
uclarindan okur (bkz. TD-032 RESOLVED, ADR-030). F3A'daki gecici platform-admin token resolver
KALDIRILDI: vitrin artik hicbir yuksek-yetkili kimlik tasimaz, login yapmaz, Bearer token kullanmaz.
Akis sunucu bilesenlerinde calisir:

1. Gateway — `GET /public/stores/:storeSlug/products` ve `GET /public/stores/:storeSlug/products/:productSlug`
   (auth YOK, yalniz GET). Store slug ile cozulur; yok/ACTIVE degil -> 404; yalniz ACTIVE store + ACTIVE
   urun/varyant doner. Govde `packages/contracts` `publicProduct*` ALLOWLIST semalariyla serialize
   edilir; ic/yonetim alanlari sizmaz. Fiyat gizliligi (HIDDEN/ON_REQUEST) durumunda numerik fiyat
   gateway'de null'lanir.
2. `lib/server/catalog.ts` — `demo-store` slug'i ile public uclari TOKEN'SIZ (`fetch`, Authorization
   header yok) cagirir ve public DTO'yu saf vitrin gorunum modellerine cevirir. Yalniz okur.
3. `lib/sales-model.ts` — F2D satis-modeli alanlarini (salesMode/priceVisibility/primaryAction/
   purchasable) saf bir sekilde CTA + fiyat gorunum bayraklarina cevirir; gorunur etiketler
   `lib/labels.ts` ile i18n'den cozulur (ham API kodu UI'da gosterilmez).

store-admin'in BFF deseninden farki: storefront okuma akisi sunucu bilesenlerinde dogrudan cozulur
(interaktif yazma olmadigindan ayri `/api/*` proxy route'lari gerekmez); buy box varyant/adet secimi
yereldir (gercek sepet yok).

### store-admin orders UI/BFF akisi (Faz 2G)

`/orders` ekrani F2C order/reservation core'unu store-admin BFF uzerinden tuketir. Akis: tarayici
`/api/orders` (GET list), `/api/orders/[id]` (GET detail), `/api/orders/[id]/place` (POST) ve
`/api/orders/[id]/cancel` (POST) route handler'larini cagirir. Her handler `requireStoreContext` ile
oturum token'ini ve hedef mağazayi SUNUCU tarafinda cozer (client `storeId` gondermez), sonra
`packages/api-client` `admin.orders.*` helper'i ile gateway'in `/stores/:storeId/orders*` uclarina
gider. GET route'lari CSRF istemez; place/cancel/create gibi mutating route'lar double-submit CSRF
zorunlu kilar ve gateway hatasini `{ error: { code } }` zarfina indirger (bearer token yanit
govdesine dusmez). UI list'te order/payment/fulfillment durum rozetleri, detay modal'da kalemler,
tutar ozeti, adresler, stok rezervasyonlari ve order events timeline gosterir; DRAFT siparis place,
PLACED/CONFIRMED siparis cancel edilir. Lean "yeni taslak siparis" modali inventory varyant
listesinden kalem secerek `createOrder` cagirir. Backend order business logic'i degismez; UI yalniz
lifecycle aksiyonlarini tetikler (payment/shipping yapmaz).

### Entity detail route standardizasyonu (Faz 2H, bkz. ADR-027)

Ana entity detay ekranlari modal degil dedicated route/page'dir. F2H'de sipariş detayi `/orders/[id]`,
ürün detay/düzenleme `/products/[id]` route'una tasindi; liste sayfalarindaki detay/düzenle aksiyonlari
artik route'a linklenir (`next/link`, gercek `href`). `/orders` ve `/products` listeleri sade kalir;
sipariş place/cancel hizli aksiyonlari listede durur, kisa create modallari korunur ve create sonrasi
yeni kaydin detay route'una `router.push` ile yonlendirilir. Ürün detay sayfasi temel bilgiler + satis
davranisi (F2D/F2F alanlari) formunu ve varyantlari inline bölüm olarak barindirir; varyant
create/edit hala kisa modaldir. Uzun icerik dogal sayfa scroll'u ile akar. BFF tarafinda yeni
`GET /api/catalog/products/[productId]` proxy'si eklendi (store context server-side, token sizmaz);
mutating route'larin CSRF korumasi degismedi. Modal yalnizca kisa create/edit/confirm/adjust
aksiyonlari icin kullanilir.
- `apps/storefront-web`: Public magaza vitrini (Next.js App Router). Home, product listing, product
  detail, cart ve checkout placeholder sayfalari, tema-hazir layout ve `/api/health`. Multi-tenant
  store slug/domain cozumleyici henuz implement edilmedi; tek demo store render edilir.

Frontend app'ler backend domain logic icermez. Backend ile tek temas noktalari API gateway'dir ve
bu erisim `packages/api-client` uzerinden type-safe sekilde yapilir. admin-web ve store-admin-web bu
erisimi Next route handler'lari (BFF) icinde SUNUCU tarafinda yapar; tarayici dogrudan gateway'e
gitmez. storefront-web hala placeholder seviyesindedir. Next.js build ciktilari `.next/` altindadir.

## Services

- `services/commerce-service`: Product, inventory, customer ve order gibi commerce core davranislari
  icin hedef servis alani.
- `services/checkout-service`: Cart, checkout session ve payment adapter akislari icin hedef servis
  alani.
- `services/storefront-service`: Public storefront okuma ve tema/render foundation'i icin hedef servis
  alani.
- `services/integration-service`: Pazaryeri ve dis sistem entegrasyonlari icin hedef servis alani.
- `services/search-service`: Arama indeksleme ve sorgulama davranislari icin hedef servis alani.
- `services/analytics-service`: Raporlama, metrik ve growth assistant girdileri icin hedef servis
  alani.
- `services/notification-service`: Email, webhook ve bildirim isleri icin hedef servis alani.

## Packages

- `packages/db`: Prisma schema, Prisma client lifecycle, seed ve tenant query pattern'leri.
- `packages/auth`: Platform/store context ve tenant foundation yardimcilari; scrypt tabanli parola
  hash/dogrulama, platform admin guard ve store role guard foundation'i.
- `packages/config`: Environment config parsing ve validation.
- `packages/contracts`: Paylasimli API/domain kontratlari icin hedef paket. Faz 2A ile catalog ve
  inventory Zod schema'lari, request/response tipleri ve stabil hata zarfi tipleri burada tutulur.
- `packages/logger`: Ortak logger factory ve log formatlama.
- `packages/queues`: Redis/BullMQ queue connection ve job naming foundation.
- `packages/integrations-sdk`: Connector gelistirme icin hedef SDK paketi.
- `packages/validators`: Paylasimli validation semalari icin hedef paket.
- `packages/utils`: Genel yardimci fonksiyonlar icin hedef paket.
- `packages/ui`: Paylasimli, light-first premium SaaS tasarim sistemi primitive'leri (Button, Card,
  SectionCard, Badge, Input, PageHeader, EmptyState, StatCard, Container, AppShell, Topbar,
  SidebarNav, `cn`). TypeScript kaynak olarak yayinlanir; app'ler `transpilePackages` ile derler.
  Ortak Tailwind preset'i (`tailwind-preset.cjs`) tasarim token'larini merkezilestirir.
- `packages/api-client`: Frontend app'lerin API gateway ile konustugu type-safe client.
  `API_GATEWAY_URL` env'inden base URL cozer; health/version, internal DB/Redis health (token-gated),
  platform auth, admin store/plan ve Faz 2A catalog/inventory helper'lari sunar. Hatada gateway
  `code`/`status` tasiyan tipli `ApiError` firlatir ve frontend'in tek kanaldan erismesi icin gerekli
  kontrat tiplerini re-export eder. admin-web bu client'i BFF route handler'lari icinde kullanir;
  store-admin-web Faz 2B'de catalog/inventory helper'larini ayni sekilde BFF icinde tuketir.
- `packages/i18n`: Frontend i18n altyapisi. Basit, tipli sozluk sistemi; varsayilan urun dili
  Turkce'dir. Tum gorunur UI metni buradan okunur (hardcoded gorunur metin yasaktir). TypeScript
  kaynak olarak yayinlanir; app'ler `transpilePackages` ile derler. Yeni bagimlilik eklenmez.

### packages/i18n yapisi

```
packages/i18n/
  package.json
  tsconfig.json
  turbo.json
  src/
    index.ts            # defaultLocale, supportedLocales, Locale, getDictionary, getDefaultDictionary,
                        # isSupportedLocale, format, allDictionaries,
                        # localeCookieName, localeCookieMaxAge,
                        # resolveLocaleFromCookieValue, localeCookieString
    locales/
      tr/               # KAYNAK sozluk (tip parite kaynagi)
        common.ts  admin.ts  storeAdmin.ts  storefront.ts
      en/               # tr sekline tip-bagli ayna (key parity zorunlu)
        common.ts  admin.ts  storeAdmin.ts  storefront.ts
  test/
    i18n.test.ts        # defaultLocale, supportedLocales, parity, fallback testleri
    locale-cookie.test.ts  # cookie cozumleme, cookie dizesi, switcher copy paritesi
```

- `defaultLocale = "tr"`, `supportedLocales = ["tr", "en"]`, `type Locale = "tr" | "en"`.
- `getDictionary(locale?)` desteklenmeyen/eksik locale'de guvenli sekilde Turkce'ye duser.
- EN sozlukleri TR tipine (`AdminDictionary` vb.) bagli yazilir; derleme zamani key parity garantisi.

### Runtime locale switch (Faz 2E)

Kullanici arayuz dilini TR/EN arasinda degistirebilir. Akis (bkz. ADR-026):

- Secim `commerce_os_locale` cookie'sinde tutulur (`localeCookieName`). Auth token degildir;
  `sameSite=lax`, `path=/`, uzun `max-age`, HTTPS'te `Secure`. URL prefix (`/tr`, `/en`) yoktur.
- **Sunucu** (server components / layout / metadata): her app'in `lib/i18n.ts` modulu
  `next/headers` `cookies()` ile `getRequestLocale()` cozer; `resolveLocaleFromCookieValue`
  gecersiz/bos degeri Turkce'ye duser. Kok layout `<html lang>` ve sozlugu bu locale ile secer.
- **Istemci** (client components): kok layout cozulen locale'i `@commerce-os/ui` `LocaleProvider`
  ile istemci agacina (login dahil) tasir; bilesenler `useLocale()` + `getDictionary(locale)`
  kullanir. Saglayicisiz render varsayilan dile (Turkce) duser.
- **Switch**: `@commerce-os/ui` `LanguageSwitcher` cookie'yi `localeCookieString` ile yazar ve tam
  sayfa yenilemesiyle sunucu-render sozlugu yeniden uretir. Auth/session/CSRF cookie'leri korunur.
- API hata mesajlari `messageForError(error, locale)` ile aktif dilde gosterilir; ham kod sizmaz.

Kapsam disi (bilincli): `/tr`-`/en` route prefix, tarayici dil tespiti, DB/kullanici locale tercihi,
Next middleware. Bunlar `docs/TODO.md` ve `docs/TECHNICAL_DEBT.md` altinda takip edilir.

## Frontend Stack

- Next.js App Router, React 19, TypeScript strict.
- Tailwind CSS v3, ortak preset `packages/ui/tailwind-preset.cjs` uzerinden.
- Light-first premium SaaS gorunum; dark theme, neon/AI look ve agir gradient kullanilmaz.
- Accent rengi tek merkezi noktadan yonetilir: ortak preset'teki `brand` skalasi (anchor
  `brand-600 = #9743CD`, olculu menekse). Componentler yalnizca `brand-*` token'i tuketir; CTA,
  aktif durum ve accent rozetlerinde kullanilir, govde metni/genis yuzeyler notr slate kalir
  (bkz. ADR-019).
- Tasarim-first calisma: yeni ana ekranlar once kisa "Claude Design Plan" ile tasarlanir
  (bkz. `docs/PROMPT_RULES.md`).
- i18n-first: varsayilan UI dili Turkce'dir. Tum gorunur UI metni `packages/i18n` sozlugunden gelir;
  bilesenlerde hardcoded gorunur metin yazilmaz. Her app'te locale cozumleme `lib/i18n.ts` icinde tek
  noktada toplanir (su an varsayilan `tr`).

## DB

Baslangicta tek PostgreSQL 16 cluster kullanilir. Prisma schema `packages/db/prisma/schema.prisma`
altindadir. Model platform user, platform session, store, store user, domain, plan, subscription,
audit log, event log, queue job log ve Faz 2A katalog/stok foundation varliklarini icerir.

### Catalog / Inventory Foundation (Faz 2A)

- `Product`: store-scoped urun kaydi; `slug` store bazinda unique, `status` ile arsivleme.
  Faz 2D ile urun bazli sales model alanlari eklenir: `salesMode`, `priceVisibility`,
  `primaryAction`, yardimci flow flag'leri, `purchasable`, min/max order quantity ve CTA not/template
  alanlari. Varsayilan `ONLINE/VISIBLE/ADD_TO_CART/purchasable=true` mevcut urun davranisini korur.
- `ProductVariant`: store-scoped varyant; `sku` store bazinda unique, fiyatlar integer minor unit
  (`priceMinor`, `compareAtMinor`) ve `currency` ile saklanir. `storeId` tenant guard icin bilincli
  denormalized tutulur.
- `ProductCategory`: store-scoped kategori agaci; `slug` store bazinda unique, `parentId` ayni store
  icinde validate edilir.
- `ProductCategoryAssignment`: urun-kategori baglantisi; storeId ile tenant sorgulari ve unique guard
  net tutulur.
- `Product.primaryCategoryId` (Faz 1A, ADR-067): urunun TEK ana kategorisi; dinamik attribute semasinin,
  breadcrumb'in ve kanonik kategori URL'inin kaynagi. Nullable + FK `onDelete: Restrict`; M:N `assignments`
  korunur, ana kategori assignments'tan biri olmalidir (service transaction guard).
- `InventoryItem`: varyant basina tek stok kaydi; `quantityAvailable` DB'de kolon degildir, response'ta
  `quantityOnHand - quantityReserved` olarak hesaplanir.
- `InventoryMovement`: her manual adjustment icin ledger kaydi; `quantityDelta`, reason/reference ve
  actor id metadata'si tutulur.

Order core Faz 2C'de gateway icindeki gecici commerce uygulamasina eklendi. Faz 2D'de order create,
line add/update ve place akislari product sales modelini dogrular; `INQUIRY`, `APPOINTMENT`,
`WHATSAPP` ve `CATALOG_ONLY` urunler online order line'a eklenemez. Cart, checkout, payment,
shipping, marketplace sync, media/images, product options modeli, import/export, inquiry/appointment
talep modelleri, WhatsApp store contact config ve storefront resolver/render davranisi kapsam disidir.
Faz 2F'de store-admin UI sales model alanlarina baglandi: urun listesinde kompakt "Satis" kolonu
(salesMode rozeti + priceVisibility/primaryAction metni + purchasable gostergesi) ve create/update
formundaki "Satis davranisi" bolumu. Form, salesMode degisiminde backend `isConsistentSalesModel`
kurallariyla uyumlu guvenli default'lar uygular ve client-side min/max adet + uzunluk validasyonu
yapar; tutarsizliklarda gateway `VALIDATION_ERROR`'i ve sales-model guard kodlari (`PRODUCT_*`) UI'da
TR/EN lokalize gosterilir. Yeni alanlar store-admin BFF route handler'larinda body pass-through ile
ek kod olmadan gateway'e tasinir; storefront CTA render ve inquiry/appointment/WhatsApp kayit
modelleri hala kapsam disidir.

Platform session raw token saklamaz; secret ile hashlenmis `tokenHash`, `expiresAt`, opsiyonel
revoke/user-agent/ip placeholder alanlari tutulur.

### Attribute Catalog Foundation (Faz 1B, ADR-067)

Kategoriye-bagli dinamik urun ozelliklerinin KATALOG TANIM temeli. Bu faz yalniz tanim katmanidir; urun/varyant
DEGER tablolari (`ProductAttributeValue`/`VariantAttributeValue`), dinamik form, varyant kombinasyon motoru,
PDP tablo ve faceted search Faz 2+'ye aittir.

- `AttributeDefinition`: attribute TANIMI. `scope` = `PLATFORM` (tum magazalar, `storeId=null`, yalniz
  `SUPER_ADMIN`) veya `STORE` (tek magaza, `storeId` zorunlu, ilgili store admin). `code` ve `dataType`
  service-katmaninda immutable (`code` her zaman; `dataType` yalniz kullanim baslamissa — kategori baglantisi
  VEYA secenek varsa). 13 `dataType` (`TEXT/TEXTAREA/RICH_TEXT/INTEGER/DECIMAL/BOOLEAN/DATE/URL/SELECT/
  MULTI_SELECT/COLOR/IMAGE/FILE`). Davranis TASIMAZ. `@@unique([storeId, code])` (STORE cakismasi DB'de;
  PLATFORM null-storeId icin route on-kontrolu).
- `AttributeGroup`: store-scoped sunum/organizasyon kabi. `CategoryAttribute` opsiyonel olarak bir gruba baglanir.
- `AttributeOption`: `SELECT`/`MULTI_SELECT`/`COLOR` secenekleri. `storeId` STORE seceneginde magaza, PLATFORM
  seceneginde null. `value` bir tanim icinde benzersiz (`@@unique([attributeDefinitionId, value])`). `colorHex`
  yalniz COLOR.
- `CategoryAttribute`: bir attribute'un bir KATEGORI kapsamindaki davranisinin **TEK SAHIBI**. `required`,
  `filterable`, `searchable`, `comparable`, `variantDefining`, `visibleOnProductPage`, `visibleOnListing` +
  `displayOrder` + `validationRules` (Json). `@@unique([categoryId, attributeDefinitionId])` — bir attribute bir
  kategoriye en fazla bir kez. **Kategori mirasi ve `overrideMode` UYGULANMAZ** (ADR-067 md.7, YAGNI).

Gateway'de attribute uclari ayri bir modulde (`apps/api-gateway/src/attributes/`) yasar: `AttributeDataAccess`
(prisma-backed, DI ile enjekte edilebilir — hero/kampanya deseni) + iki route grubu. STORE uclari
(`/stores/:storeId/attributes`, `.../attribute-groups`, `.../categories/:categoryId/attributes`)
`requireStorePlatformAdmin` ile korunur ve magaza kendi STORE tanimlarini yonetir + PLATFORM tanimlarini OKUR.
PLATFORM uclari (`/admin/attributes`) yeni `requireSuperAdmin` guard'i ile yalniz `SUPER_ADMIN`'e aciktir
(mevcut `requirePlatformAdmin` SUPPORT_ADMIN'e de izin verir; yeni guard onu daraltir, mevcut yetkiler bozulmaz).
store-admin'de "Katalog → Ozellikler" ekrani tanim/grup/secenek CRUD'unu, kategori ekranindaki modal ise
CategoryAttribute davranis baglamayi sunar. Migration additive (`20260714120000_add_attribute_catalog`); urun
formu, storefront, checkout, order, inventory, search ve marketplace DEGISMEDI.

### Attribute Value Layer (Faz 2A, ADR-068)

Faz 1B katalog TANIMINI tuketip urun/varyantlarin gercek attribute DEGERLERINI saklayan cekirdek veri +
dogrulama katmani. Dinamik urun formu, varyant kombinasyon motoru (`combinationKey`), otomatik varyant, PDP
attribute tablosu, faceted search ve marketplace mapping Faz 2B+'ye aittir.

- `ProductAttributeValue`: bir urunun bir attribute icin DEGERI. **Tip guvenli saklama** (JSON yok): her `dataType`
  ayri kolona yazilir — `TEXT/TEXTAREA/RICH_TEXT/URL → valueText`, `INTEGER → valueInteger`, `DECIMAL → valueDecimal`
  (`Decimal(20,6)`), `BOOLEAN → valueBoolean`, `DATE → valueDate`, `SELECT/COLOR → optionId`, `IMAGE/FILE → mediaId`,
  `MULTI_SELECT → ProductAttributeValueOption` junction. `@@unique([productId, attributeDefinitionId])`.
- `VariantAttributeValue`: yalniz **variantDefining** attribute'lar; deger yalnizca `valueText` veya `optionId`.
  `@@unique([variantId, attributeDefinitionId])`. `combinationKey` UYGULANMAZ (Faz 2B).
- `ProductAttributeValueOption`: MULTI_SELECT junction (JSON yerine iliskisel; ileride faceted-filtre icin sorgulanabilir).
- **CHECK constraint**: her deger satirinda en fazla bir deger kolonu dolu (`<= 1`; MULTI_SELECT satiri 0 dolu → kapsanir).
  Cross-table datatype eslemesi DB'ye TASINMAZ (serviste). FK: definition/option/media `Restrict`, product/variant/store `Cascade`.

**`attributeValueService`** (`apps/api-gateway/src/attribute-values/`) — ProductAttributeValue/VariantAttributeValue yazan
**TEK otorite** (hicbir route dogrudan Prisma'ya deger yazmaz). STABIL kodlarla dogrular (tenant, mevcut/archived, kategori
bagi, required, dataType↔alan, option/media tenant, variantDefining tablo yonlendirme); `prepare*` read-only doguru (create'ten
once) + `persist*` replace-set yazim. Urun/varyant create-update GOMULU opsiyonel `attributeValues` alani (`undefined` = eski
davranis, geriye donuk uyumlu) + dedike internal uclar (`GET/PUT .../products/:id/attribute-values`, `.../variants/:id/attribute-values`).
Migration additive (`20260714130000_add_product_attribute_values`); urun formu, storefront, checkout, order, inventory, search
ve marketplace DEGISMEDI.

### Dinamik Urun Formu (Faz 2B, ADR-069)

store-admin urun Create/Edit ekrani React Hook Form + Zod'a tasindi ve kategoriye gore dinamik attribute alanlariyla
calisir. Cekirdek alanlar (title/slug/marka/satis modeli/kargo/galeri) davranisini KORUR; varyant kombinasyon motoru,
PDP tablosu, storefront ve faceted search KAPSAM DISI (Faz 2C+).

- **Form katmani** (`apps/store-admin-web/app/(app)/products/`): `product-form.tsx` (tek `useForm`), `product-form-schema.ts`
  (Zod core `superRefine` + `ProductFormValues` + varsayilan/mapper'lar + birlesik resolver). Cekirdek Zod ile, dinamik
  attribute alanlari backend-sekilli kurallarla ayri dogrulanip `createProductFormResolver`'da birlesir. UI kit
  `Input/Select/Textarea` RHF `register` icin `forwardRef`'e cevrildi (additive).
- **Attribute alt-sistemi** (`.../products/attributes/`): `useCategoryAttributes` (ana kategori seciminde CategoryAttribute +
  tanim + secenek + grup uclarini cekip client-side join; displayOrder→name sirasi; grup basliklari; **memoization** — kategori
  degismezse yeniden fetch yok), `attribute-section.tsx` (grup kartlari + RHF Controller), `attribute-field.tsx` (dataType→widget
  **registry**; 13 tip), `value-mapping.ts` (form↔Faz 2A input donusumu + required/validationRules dogrulama + server-hata→alan),
  `types.ts` (ResolvedAttribute + validationRules ayikleme).
- **Sema kaynagi**: `primaryCategoryId` — backend deger dogrulamasi da bu bag uzerinden yapildigindan UI ayni otoriteyi izler.
  Yalniz urun-seviyesi (variantDefining=false) attribute'lar render edilir.
- **Round-trip**: duzenlemede yeni BFF GET `.../products/:id/attribute-values` (+ `storeApi.getProductAttributeValues`) mevcut
  degerleri doldurur. **Save**: gomulu `attributeValues` (product create/update) replace-set formatinda, yalniz kategori attribute
  tanimliysa — aksi halde `undefined` → legacy urunler bozulmaz. Backend attribute hatasi `error.details.attributeDefinitionId`
  ile ilgili alana baglanir. Migration YOK; yalniz UI + gomulu akisa additive hata-detayi.

### Varyant Motoru TEMELI — eksen secimi (Faz 2C-1, ADR-070)

Variant Engine'in yalniz VERI MODELI + admin secim ekrani. Bir urunun hangi attribute'lari EKSEN (axis) olarak
kullanacagini ve her eksende hangi option'lari kapsayacagini NORMALIZE saklar. Bu katman **KOMBINASYON URETMEZ**:
`ProductVariant`, Cartesian, `combinationKey`, SKU matris, storefront/search/inventory/order snapshot Faz 2C-2+'ye aittir.
`ProductVariant.optionValues Json?` (legacy) DEGISMEDI.

- **Modeller** (`packages/db/prisma/schema.prisma`): `ProductVariantAttribute` (urunde secilen variant-defining EKSEN;
  `@@unique([productId, attributeDefinitionId])`, `position`; `attributeDefinitionId → Restrict`, product/store → Cascade) +
  `ProductVariantOptionSelection` (eksen altinda kapsanan `AttributeOption`; `@@unique([productVariantAttributeId, optionId])`,
  `position`; `optionId → Restrict`, parent/store → Cascade). JSON YOK — iliskisel butunluk + gelecekte Cartesian sorgusu icin.
- **`variantSelectionService`** (`apps/api-gateway/src/variant-selections/`) — `ProductVariantAttribute`/`ProductVariantOptionSelection`
  yazan TEK otorite (Faz 2A `attributeValueService` deseni: prepare read-only + persist replace-set transactional). STABIL kodlarla
  dogrular: tenant izolasyonu, attribute mevcut/archived, primaryCategory bagi, **variantDefining=true**, **option-tabanli (SELECT/
  COLOR)** — varyant ekseni tek-secimli olmali, duplicate, her eksende **≥1 option**, option attribute/tenant/archived. Gomulu
  opsiyonel `variantSelections` (product create/update; `undefined`=legacy, `[]`=temizle) + dedike `GET/PUT .../products/:id/
  variant-selections`. Mevcut Product API/`optionValues` DEGISMEDI.
- **UI** (`.../products/variant-attributes/`): `useVariantAttributes` (variantDefining=true + option-tabanli; `useCategoryAttributes`
  bunlari DISLAR), `variant-attribute-section.tsx` (eksen checkbox → option checkbox'lari; COLOR swatch; archived option gizli),
  `variant-selection-mapping.ts` (form↔input donusumu + ≥1-option client dogrulama + server-hata→eksen). Kategori variant-defining
  option-tabanli attribute tanimlamamissa bolum gizli + payload `undefined` (legacy korunur).

## Auth / Session

Faz 1A/1C'de platform admin auth bearer session token ile calisir. `/auth/platform/login` demo seed
admin parolasini scrypt hash uzerinden dogrular, session TTL'ini `SESSION_TTL_SECONDS` env'inden
alir ve raw token'i yalnizca response'ta dondurur. `/auth/platform/me` ve admin endpointleri token'i
`SESSION_SECRET` ile hashleyip DB'deki aktif session ile eslestirir. `/auth/platform/logout` session'i
revoke eder. Login brute-force korumasi IP + normalize e-posta bazli proses ici sayaçla uygulanir
(`AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`); basarili login ilgili
sayaçlari sifirlar.

### admin-web auth akisi (Faz 1B/1C BFF)

admin-web tarayicisi gateway'e dogrudan gitmez (gateway'de CORS yok ve token istemciye sizdirilmez).
Bunun yerine ayni-origin Next route handler'lari (BFF) kullanilir:

1. Login: tarayici `POST /api/auth/login` cagirir; handler gateway `/auth/platform/login`'i cagirir,
   donen bearer token'i **httpOnly cookie**'ye (`ADMIN_SESSION_COOKIE_NAME`, sameSite=lax, prod'da secure)
   yazar ve istemciye yalnizca kullanici bilgisini doner (token govdede/log'da yer almaz).
2. Oturum dogrulama: `(app)` route group server tarafinda once session cookie varligini kontrol eder;
   mount'ta `GET /api/auth/me` cagirir ve handler cookie token'i ile gateway `/auth/platform/me`'yi
   dogrular. Oturum yoksa `/login`'e yonlendirir; login sayfasi cookie varsa erken panele gider.
3. Admin islemleri: `/api/admin/stores`, `/api/admin/plans` (+`/:id`) handler'lari cookie token'i ile
   gateway admin endpointlerine proxy yapar; gateway hata `code`'u i18n ile Turkce mesaja cevrilir.
   Mutating BFF istekleri double-submit CSRF ister: `/api/auth/csrf` token/header adini verir,
   logout ve stores/plans create/update bu header ile gelir. GET istekleri CSRF istemez.
4. Logout: `POST /api/auth/logout` CSRF dogrular, cookie'yi temizler ve gateway `/auth/platform/logout`
   ile session'i revoke eder.
5. System health: `/api/system/health` public gateway health/version'i proxy'ler; `/api/system/internal`
   yalnizca admin-web sunucu env'inde `INTERNAL_API_TOKEN` tanimliysa timeout kontrollu DB/Redis
   durumunu doner, aksi halde "dahili token gerektirir" durumu gosterilir (secret client'a girmez).

### store-admin-web auth + store context akisi (Faz 2B BFF)

store-admin-web ayni BFF desenini kullanir (ADR-023); store-user auth henuz olmadigi icin demo
asamasinda platform admin login'i vekaleten kullanir:

1. Login: `POST /api/auth/login` gateway platform login'i proxy'ler ve bearer token'i store-admin'e
   ozel **httpOnly cookie**'ye (`STORE_ADMIN_SESSION_COOKIE_NAME`, varsayilan
   `commerce_os_store_admin_session`) yazar; istemciye yalnizca kullanici doner. Cookie adi
   admin-web'den ayridir.
2. Store context: catalog/inventory/dashboard handler'lari her istekte `requireStoreContext` ile
   cookie token'i dogrular ve hedef mağazayi gateway `admin.stores.list`'ten server-side cozer
   (`STORE_ADMIN_DEMO_STORE_SLUG`, varsayilan `demo-store`; yoksa ilk mağaza). `storeId` istemciden
   gelmez; `GET /api/store/context` UI'a yalnizca mağaza meta'sini (id/ad/slug/durum) doner.
3. Katalog islemleri: `/api/catalog/categories`, `/api/catalog/products` (+`/:id`),
   `.../variants` (+`/:id`), `/api/catalog/inventory` (+`/:variantId/adjust`) cozulen `storeId` ve
   cookie token ile gateway store-scoped endpointlerine proxy yapar. `/api/dashboard/summary` urun/
   kategori/stok ozetini server-side hesaplar. Mutating route'lar double-submit CSRF ister
   (`/api/auth/csrf`); GET istemez. Gateway hata `code`'u `storeAdmin.errors` ile Turkce mesaja cevrilir.
4. Logout: `POST /api/auth/logout` CSRF dogrular, cookie'yi temizler, gateway session'i revoke eder.

Host makineden dogrudan Prisma CLI kullanilirken `127.0.0.1` tabanli `DATABASE_URL` gerekir. Root
`db:migrate`, `db:seed` ve `db:verify-seed` scriptleri ise Docker Compose icindeki `api-gateway`
container'inda calisir ve container network servis adlarini kullanir.

## Frontend Docker runtime

Backend (postgres/redis/api-gateway/worker) yaninda uc frontend app de Docker Compose ile ayaga
kalkar: admin-web (3001), store-admin-web (3002), storefront-web (3000). Hepsi backend ile ayni
paylasimli `infra/docker/node.Dockerfile` imajini kullanip `pnpm --filter <app> dev` ile Next.js dev
runtime olarak calisir; her servisin `/api/health` liveness'i compose healthcheck'tir. compose icinde
`API_GATEWAY_URL=http://api-gateway:4000` verilir; admin-web BFF gateway'e container network uzerinden
erisir. `INTERNAL_API_TOKEN` yalnizca admin-web server env'inde tutulur, client bundle'a girmez.
Production-grade image, reverse proxy ve SSL kapsam disidir (bkz. ADR-019, TODO-028).

## Redis ve Queue

Redis, Faz 0'da cache/queue foundation runtime'i olarak konumlanir. BullMQ queue altyapisi
`packages/queues` icinde merkezilesir. Worker uygulamasi background job islemek icin hedef runtime'dir.

## Logger

Ortak logger davranisi `packages/logger` icinde tutulur. Servisler uygulama adi ve context bilgisiyle
logger uretmelidir. Secret, token ve credential degerleri loglanmaz.

## Config

Environment config `packages/config` icinde Zod tabanli validation ile okunur. `.env` lokal gelistirme
icin kullanilir ve commitlenmez. `.env.example` secret olmayan placeholder degerler tasir.

## Contracts

Paylasimli kontratlar `packages/contracts` icinde tutulur. Servisler arasi veri sekli, API response
formatlari ve event payload'lari burada tip guvencesiyle tanimlanmalidir.

## Order / Reservation Domain (Faz 2C)

Faz 2C order/reservation cekirdegi henuz ayri `commerce-service` runtime'ina tasinmadi; mevcut
gateway icinde store-scoped API olarak uygulanir. Veri modeli `Customer`, `CustomerAddress`,
`Order`, `OrderLine`, `OrderAddress`, `OrderEvent`, `InventoryReservation` ve
`OrderNumberCounter` tablolarindan olusur. Her tablo `storeId` tasir ve gateway route'lari explicit
`/stores/:storeId/*` tenant guard'i ile calisir.

Order DRAFT olarak lines ile olusur. Line snapshot'i product/variant aktifken alinan sku, product
title, variant title, minor-unit unit price ve currency degerlerini saklar; katalog fiyat/title
degisikligi mevcut order line'i degistirmez. Place islemi PostgreSQL row-level lock ile
`InventoryItem` satirini kilitler, available stogu kontrol eder, `quantityReserved` artirir ve
`InventoryReservation ACTIVE` olusturur. Cancel aktif reservation'lari `RELEASED` yapar ve reserved
stogu geri dusurur; double cancel idempotenttir. `CONSUMED`, fulfillment fazinda onHand dusumu icin
hazir tutulur.

Bu domain payment capture, cart/checkout session, shipment, invoice, notification ve marketplace
sync davranisini sahiplenmez; bu akislara ait state machine'ler sonraki servis/faz sinirlarinda
eklenecektir.

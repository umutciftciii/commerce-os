# ANALIZ-2C4 — Identity Management Engine (TODO-150 / ADR-073)

Bu doküman, kod yazmadan önce yapılan zorunlu analizi ve alınan tasarım kararlarını içerir. Bu faz
mevcut varyant persistence altyapısını (2C-1 eksen seçimi · 2C-2 SAF combination engine · 2C-3
kalıcı ProductVariant + normalize `ProductVariantOptionValue`) KULLANIR ve **hiçbirini değiştirmez**.
Yeni katman tamamen **kimlik (identity) alanları** üzerinedir: SKU · Barcode · Variant Title.

> Combination Engine (`variant-combinations/engine.ts`) ve generation service (`variant-generation/*`)
> DOKUNULMAZ. Identity Engine ayrı bir modüldür (`identity-engine/`) ve yeni bir HTTP ucudur.

---

## 1. Mevcut sistem (incelenen)

- **`ProductVariant`** (schema.prisma:776): `sku` **NOT NULL** + `@@unique([storeId, sku])`,
  `barcode String?` (**unique YOK**), `title String`, ayrıca `combinationKey?`,
  `generationSource (MANUAL|ATTRIBUTE_COMBINATION)`, `status (DRAFT|ACTIVE|ARCHIVED)`, `archivedAt?`.
- **Üretilmiş varyant başlangıcı** (2C-3): `sku = "V-<productId>-<hash(combinationKey)>"` (deterministik
  placeholder), `title = "Red / M"` (`deriveTitle`, option label'ları `" / "` ile). barcode boş.
  → Bu placeholder'lar tam da Identity Engine'in **düzelteceği** alanlardır.
- **`ProductVariantOptionValue`** (schema:2409): üretilmiş varyantın çözülmüş `attributeDefinitionId →
  optionId` normalize kaydı (JSON değil). ATTRIBUTE token çözümünün authoritative kaynağı budur.
- **`AttributeDefinition.code`** (örn. `color`, `size`) + `@@unique([storeId, code])`;
  **`AttributeOption`** `value` (makine, örn. `RED`) + `label` (insan, örn. `Kırmızı`). Identity token
  çözümü: kimlik alanlarında (SKU/barcode) `value`, başlıkta `label` kullanılır.
- Route deseni: `requireStorePlatformAdmin(request, reply, storeId)` → `access.session.platformUser.id`;
  saf servis + `dataAccess` + DI (`dependencies.*DataAccess`), advisory-lock + tek transaction (2C-3).
- Store-admin: ürün formunda `VariantAttributeSection` → `CombinationPreview` → `GenerateVariantsAction`
  zinciri; BFF proxy (`app/api/catalog/products/[productId]/...`), `storeApi.*`, `@commerce-os/i18n`
  `storeAdmin.products.variantAttributes.*` sözlüğü.
- **Config**: `MAX_PREVIEW_COMBINATIONS` (default 1000). Yeni guard `IDENTITY_MAX_VARIANTS` (default 5000)
  eklenir (magic number değil).

---

## 2. On sorulara cevaplar

### 1. SKU kullanıcı tarafından mı yönetilmeli, otomatik mi?
**Hibrit.** Toplu üretim **pattern (kural) tabanlı otomatiktir** (1000 varyantı elle yazmak ölçeklenmez,
tutarsız ve tekrar edilemez); ama her SKU tekil olarak **mevcut varyant PATCH ucundan elle
düzenlenebilir** (kaçış kapağı). Motor bir "öneri + toplu uygulama" aracıdır, zorlayıcı değil: kullanıcı
preview'i görür, onaylar, uygular. Deterministik placeholder SKU (2C-3) bu motorla anlamlı SKU'ya çevrilir.

### 2. Pattern sistemi neden gerekli?
Elle tek tek SKU girişi: ölçeklenmez (1000 varyant), hataya açık, tutarsız (aynı üründe farklı format),
tekrar edilemez. Pattern: **tutarlılık** (mağaza konvansiyonu), **tekrarlanabilirlik**, **preview +
collision güvenliği** ve **toplu uygulama** sağlar. GTIN/ERP/marketplace'e giden yol da pattern
tabanlıdır (alan-agnostik motor).

### 3. Barcode zorunlu mu?
**Hayır.** DB'de `barcode String?` (nullable, unique YOK). Bu fazda barcode **elle düzenlenebilir**;
Rule Engine **altyapısı hazırdır** (aynı evaluator barcode pattern'ını da değerlendirir) ama zorunlu
değildir. GTIN/EAN check-digit üretimi gelecektir (bu fazda düz string; check-digit YOK).

### 4. Title otomatik üretimi nasıl olmalı?
Manuel string birleştirme DEĞİL — **Rule ile** (`{PRODUCT} - {COLOR} - {SIZE}` → `Premium T-Shirt -
Kırmızı - XL`). Başlıkta token'lar **label** (insan okunur) çözer. **Override koruması:**
`ProductVariant.titleIsCustom` (Boolean, additive). Motor bir başlık yazınca `titleIsCustom=false`
(motor-yönetimli). Kullanıcı başlığı varyant formundan elle düzenleyince PATCH `titleIsCustom=true`
işaretler. Title apply, `regenerateCustomTitles=false` (varsayılan) iken **korumalı (custom) başlıkları
atlar** (`skipped: protected`); `true` ile override edilebilir. → "Title override edilirse yeniden
generate edilmemeli" birebir karşılanır.

### 5. Identity Rule ileride GTIN'e nasıl genişletilir?
Token grameri + evaluator **alan-agnostiktir**. `VariantIdentityField` enum'u bugün `SKU|BARCODE|TITLE`;
GTIN/EAN/UPC yeni birer **hedef alan** olarak eklenir + yeni token'lar (`{GTIN}`) + saf bir
`checkDigit()` adımı (evaluator içinde, DB'siz). Pattern-per-field yapısı ve `VariantIdentityChange.field`
enum'u bu genişlemeyi zaten öngörür. Rezerve token'lar (ID/YEAR/MONTH) grameri kirletmeden hazır bekler.

### 6. Marketplace SKU neden ayrı tutulmalı?
Marketplace SKU'ları **kanal-başına dış eşlemelerdir** (Trendyol/Hepsiburada farklı, mağaza SKU
uzayında tekil olamaz, kanala özgü format gerektirir). Kanonik `sku` alanına karıştırmak
`@@unique([storeId, sku])` invariantını ve ERP eşlemesini bozar. Gelecekteki `VariantExternalIdentity`
(variantId, channel, externalSku) tablosuna aittir. Bu faz kapsamı dışıdır ama motorun alan-hedefli
tasarımı bunu öngörür.

### 7. Collision çözümü nasıl yapılmalı?
**Preview-first + fail-closed.** Preview iki tür SKU collision tespit eder:
(a) **iç (internal)** — aynı preview kümesinde iki varyant aynı SKU üretir,
(b) **dış (external)** — üretilen SKU, kümede olmayan **başka** bir varyantın mevcut SKU'suyla çakışır
(`@@unique([storeId, sku])` zaten reddederdi). Apply, herhangi bir SKU collision veya bloklayan
validation hatası varsa **tamamen reddedilir** (422 `IDENTITY_APPLY_BLOCKED`; kısmi yazım YOK, atomik).
Kullanıcı pattern'a `{SEQ}` ekleyerek veya eksen ekleyerek çözer (SEQ birincil collision-önleme aracıdır).
Barcode duplicate'i **uyarıdır** (DB izin verir; bloklamaz).

### 8. Undo nasıl mümkün olur?
Bulk Apply **tek transaction**tur. Her değişen alan için append-only `VariantIdentityChange` audit
satırı yazılır (`oldValue → newValue`, `field`, `pattern`, `changedByPlatformUserId`) ve hepsi tek bir
`batchId` (apply başına bir cuid) paylaşır. Geri almak: bir batch'i yükle, her değişikliği ters yönde
yaz (gelecekteki reverse-apply). **Metadata bu fazda kalıcıdır; tam undo UI gelecektir** (görev: "tam
undo UI gerekmiyor, ama gerekli metadata bırakılmalı").

### 9. Preview neden zorunlu?
Toplu kimlik değişimi SKU uzayına (tekillik) ve downstream ERP/marketplace referanslarına karşı
**geri-dönüşü zor**dur. Preview-first: kullanıcı işlemeden ÖNCE doğrular, collision'ları ve validation
hatalarını yakalar. **Deterministik** olduğundan preview == apply sonucu (aynı reçete → aynı çıktı);
apply istemci preview'ine güvenmez, sunucuda **yeniden** değerlendirir (server-authoritative).

### 10. Rule Engine neden string replace olmamalı?
Naive `String.replace`: token argümanı çözemez (`{ATTRIBUTE:color}`), SEQ'in **konumsal sayaç + padding**
mantığını yapamaz, kaçış (`{{`, `}}`) ve dengesiz parantez / bilinmeyen token / recursive token
**validation**'ını yapamaz, typo'da sessizce yanlış çıktı üretir. **Tokenizer → parser → evaluator**
hattı: **stable error kodları**, **deterministik** değerlendirme, ve GTIN/check-digit için **genişleme
noktası** verir. Parser SAFtır (DB/HTTP bilmez) → izole test edilebilir.

---

## 3. Mimari

Yeni modül: `apps/api-gateway/src/identity-engine/`

| Dosya | Sorumluluk | Saflık |
|---|---|---|
| `tokenizer.ts` | Pattern string → token akışı (lexer); kaçış + dengeli parantez + charset | **SAF** |
| `parser.ts` | Token akışı → AST (`Segment[]`); bilinmeyen/rezerve token, arg zorunluluğu | **SAF** |
| `evaluator.ts` | AST + `EvaluationContext` → çözülmüş string; ATTRIBUTE/SEQ/PRODUCT/... | **SAF** |
| `collision.ts` | Değerlendirilmiş satırlar → iç/dış collision + duplicate haritası | **SAF** |
| `preview.ts` | Pattern derleme + satır bazında değerlendirme + validation + collision orkestrası | **SAF** |
| `service.ts` | DB okuma (batch; N+1 yok) · advisory-lock + tek transaction apply · audit | DB-aware |
| `data.ts` | Prisma-backed `IdentityDataAccess` (DI arayüzü + fake test) | DB-aware |
| `routes.ts` | `GET /identity/preview` · `POST /identity/apply` | HTTP |

Parser/tokenizer/evaluator/collision/preview **Prisma · HTTP · Date · Math.random BİLMEZ.** SEQ değeri ve
`preferLabel` gibi tüm semantik girdiler `EvaluationContext`'e **dışarıdan** enjekte edilir → determinizm
+ izole test.

---

## 4. Pattern dili (grammar)

```
pattern   := segment*
segment   := literal | escaped | token
escaped   := "{{"  → "{"   |   "}}"  → "}"
token     := "{" NAME (":" ARG)? "}"
NAME      := [A-Z]+                 (yalnız büyük harf)
ARG       := [A-Za-z0-9_-]+
literal   := "{" "}" dışı karakter
```

**Token'lar:**

| Token | Faz durumu | Çözüm (identifier modu / title modu) |
|---|---|---|
| `{PRODUCT}` | aktif | ürün slug'ı (upper) / ürün adı |
| `{CATEGORY}` | aktif | kategori code (upper) / kategori adı — yoksa `missing` |
| `{ATTRIBUTE:code}` | aktif | varyantın o eksen option `value` (upper) / `label` — yoksa `missing` |
| `{COLOR}` | aktif | `{ATTRIBUTE:color}` alias |
| `{SIZE}` | aktif | `{ATTRIBUTE:size}` alias |
| `{SEQ}` / `{SEQ:n}` | aktif | 1-tabanlı satır sayacı, `n` haneli sıfır-dolgulu (varsayılan 3) |
| `{ID}` `{YEAR}` `{MONTH}` | **rezerve** | grameri kirletmez; bu fazda `IDENTITY_TOKEN_NOT_SUPPORTED` |

**Örnek:** `TSH-{COLOR}-{SIZE}` (identifier modu) → `TSH-RED-S`, `TSH-RED-M`, `TSH-BLUE-S` …
**Başlık:** `{PRODUCT} - {COLOR} - {SIZE}` (title modu) → `Premium T-Shirt - Kırmızı - XL`.

**Stable hata kodları** (parser/tokenizer):
`IDENTITY_PATTERN_EMPTY` · `IDENTITY_EMPTY_TOKEN` (`{}`) · `IDENTITY_UNCLOSED_TOKEN` (`{` kapanmadı) ·
`IDENTITY_UNEXPECTED_CLOSE` (`}` açılmadan) · `IDENTITY_NESTED_TOKEN` (token içinde `{` — "recursive") ·
`IDENTITY_UNKNOWN_TOKEN` · `IDENTITY_TOKEN_ARG_REQUIRED` (ATTRIBUTE argsız) ·
`IDENTITY_TOKEN_ARG_UNEXPECTED` (arg almayan token'a arg) · `IDENTITY_SEQ_PADDING_INVALID` ·
`IDENTITY_TOKEN_NOT_SUPPORTED` (rezerve token).

**Değer validation'ı** (değerlendirme sonrası, satır bazında):
- **SKU**: boş olamaz · `max 64` · charset `^[A-Za-z0-9._\-\/]+$` → `SKU_EMPTY|SKU_TOO_LONG|SKU_INVALID_CHARS`
- **Barcode**: `max 64` (boş = barcode yok) → `BARCODE_TOO_LONG`; duplicate = **uyarı**
- **Title**: boş olamaz (uygulanıyorsa) · `max 200` → `TITLE_EMPTY|TITLE_TOO_LONG`

---

## 5. Collision algoritması (SAF, O(n+m))

```
evaluate → rows[i].sku            // O(n · pattern-uzunluğu)
skuCount = Map<sku, count>        // O(n)   iç duplicate: count > 1
externalHits = { existing (id,sku) | sku ∈ candidateSet, id ∉ targetIds }   // tek `in` sorgusu, O(m)
row collision(sku) = (skuCount.get(sku) > 1) || externalHits.has(sku)
```
Nested O(n·m) YOK. Dış collision için mağazanın **tüm** SKU'ları yüklenmez; yalnız aday SKU kümesiyle
eşleşenler `where sku in (candidates)` (indexli) çekilir. Barcode duplicate haritası aynı biçimde ama
non-blocking.

---

## 6. Bulk Apply

- `POST /identity/apply` — gövde: `{ sku?, barcode?, title?, seqStart?, seqPadding?,
  regenerateCustomTitles?, expectedVariantIds? }` (her pattern opsiyonel; en az biri zorunlu).
- **Server-authoritative**: preview yeniden hesaplanır (istemciye güvenilmez).
- **Advisory xact lock** (`pg_advisory_xact_lock(hashtext(productId))`, `$executeRaw` — 2C-3 dersi) →
  aynı ürün için apply'lar serileşir.
- **Fail-closed**: bloklayan issue (SKU collision / validation) varsa **hiçbir şey yazılmaz** → 422.
- **Yalnız değişen** varyantlar yazılır (`next != current` ve —title için— korumalı değilse). Değişmeyen
  = `skipped`. Korumalı title = `skipped: protected`.
- Her değişen alan → `VariantIdentityChange` audit satırı (tek `batchId`). Title yazımında
  `titleIsCustom=false`.
- Beklenmedik `P2002` (unique) → 409 `IDENTITY_SKU_CONFLICT` (advisory lock normalde önler; savunmacı).
- Yanıt: `{ batchId, updated, skipped, collisions, preview }`.

---

## 7. Variant Title Engine
Title patternı **label modunda** değerlendirilir. Override koruması: `titleIsCustom`
(default `false` = motor-yönetimli; varyant PATCH `title` verilince `true` işaretler). `regenerateCustomTitles`
ile custom başlıklar da yenilenebilir. Motor title yazınca `titleIsCustom=false` set eder → sonraki
apply'da (kullanıcı elle değiştirmediyse) yine yönetebilir.

## 8. SKU Engine
Identifier modu: token'lar `value` çözer + **upper-case** normalize (`RED`, `S`). `{SEQ}` collision
kırıcı. Sonuç `@@unique([storeId, sku])` ile korunur; apply öncesi preview collision'ı yakalar.

## 9. Barcode desteği
Aynı evaluator + identifier modu; opsiyonel. Boş → barcode kaldırılmaz (yalnız pattern verilirse yazılır).
Duplicate uyarı (DB unique yok). Elle düzenleme birincil yol (varyant PATCH).

---

## 10-12. Performans · Big-O · Bellek
- **Preview** (1000 varyant): 2-3 batch sorgu (varyant+optionValue+definition; ürün+kategori; dış-SKU `in`)
  + O(n·L) saf değerlendirme (L = pattern token sayısı, küçük sabit). Yazım YOK. Hedef **<200ms** rahat.
- **Big-O**: tokenize/parse O(P) (P=pattern uzunluğu, pattern başına bir kez derlenir); değerlendirme
  O(n·L); collision O(n+m); apply yazımı O(değişen). Toplam **O(n + m + P)** — nested tarama YOK, **N+1 YOK**.
- **Bellek**: O(n) satır + O(distinct sku) collision haritası + O(P) AST (üç pattern için sabit). Odometer
  yok (Cartesian 2C-2'de); burada düz satır listesi.

---

## Reddedilen alternatifler (ADR-073 özeti)
- **String replace / regex zinciri** → validation yok, arg/SEQ/kaçış yok, sessiz yanlış çıktı.
- **Random SKU / timestamp SKU** → deterministik değil, tekrar edilemez, preview==apply garantisi yok,
  ERP eşlemesi kırılgan.
- **Manuel tek tek edit (bulk yok)** → ölçeklenmez, tutarsız, tekrar edilemez.
- **Preview'siz doğrudan apply** → collision/validation sürprizi, geri-dönüşü zor SKU değişimi.
- **Rule'u DB'de kalıcı tutmak (IdentityRule tablosu)** → bu faz kapsam dışı; pattern request-scoped
  (stateless preview). Gelecekte per-store default rule eklenebilir (infra alan-hedefli).

## Şema değişiklikleri (additive, non-destructive)
1. `ProductVariant.titleIsCustom Boolean @default(false)` — varyant PATCH `title` verince `true`.
2. `enum VariantIdentityField { SKU BARCODE TITLE }`.
3. `model VariantIdentityChange` (append-only audit): `id, storeId, productId, variantId, batchId,
   field, oldValue?, newValue?, pattern?, changedByPlatformUserId?, createdAt`; index: storeId·productId·
   variantId·batchId. FK store/product/variant Cascade; changedByPlatformUserId **scalar** (kullanıcı
   silinse de audit korunur — ProductPriceChange deseni).
Migration timestamp: `20260718130000_add_identity_management_engine`. Down migration yok (repo standardı).

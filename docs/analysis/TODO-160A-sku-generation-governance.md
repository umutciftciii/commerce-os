# TODO-160A — SKU Generation & Governance · Ön Analiz

**Tarih:** 2026-07-24 · **Faz:** Catalog Integrity (TODO-160'tan sonra, TODO-161'den önce)
**Kapsam:** Varyant-seviyesi SKU tek otoritesi + deterministik otomatik üretim + mağaza-içi
benzersizlik + çakışma yönetimi + governance (audit + kontrollü backfill) + SKU↔barcode ayrımı.

Bu doküman uygulama öncesi mevcut durumu (kod referanslarıyla) tespit eder ve tasarım kararlarını
gerekçelendirir. ADR karşılığı `docs/DECISIONS.md` ADR-109…ADR-113'tür.

---

## 1. Mevcut durum tespiti (kanıtlı)

### 1.1 SKU zorunlu mu? Boş SKU oluşabiliyor mu?

- `ProductVariant.sku` **NOT NULL** (`packages/db/prisma/schema.prisma:961` — `sku String`). Yani
  tip düzeyinde SKU zorunludur; `null` yazılamaz.
- **Ama boş string (`""`) yazılabilir** — DB NOT NULL boş string'i engellemez. Kontrat
  (`packages/contracts/src/index.ts:12` `skuSchema = z.string().min(1)...`) manuel create/patch'te boşluğu
  reddeder; fakat seed/script/generation yolları kontratı atlayabilir. Boş SKU governance riski = **audit
  kapsamı** (bkz. §10).
- Sonuç: "boş SKU oluşamaz" invariantı **kontrat düzeyinde** vardır, **DB düzeyinde CHECK yoktur**.

### 1.2 Duplicate SKU DB seviyesinde engelleniyor mu?

- **Evet, mağaza-scoped.** `@@unique([storeId, sku])` (`schema.prisma:1026`,
  index `ProductVariant_storeId_sku_key`). Aynı SKU farklı mağazalarda serbest; **aynı mağaza içinde tek**.
- Bu, tenant-izolasyonlu benzersizliğin **zaten var olan** temelidir; yeniden üretilmeyecek (§15).
- P2002 (unique conflict) manuel create/patch'te 409'a çevrilir (`server.ts:7536`, `7617-7620`); generation
  ve identity engine'de de yakalanır (`VARIANT_GENERATION_CONFLICT` / `IDENTITY_SKU_CONFLICT`).

### 1.3 Ürün mü varyant mı SKU otoritesi?

- **Varyant.** `Product` modelinde `sku` **yoktur** (`schema.prisma:862-954`). Yalnız `ProductVariant`
  taşır. Basit ürün bile tek `ProductVariant` üzerinden SKU taşır. → **Zaten varyant-seviyesi tek otorite**;
  bu ADR-109 ile açıkça sabitlenecek (paralel Product.sku alanı ASLA eklenmeyecek).

### 1.4 Mevcut generator SKU'yu nasıl üretiyor?

İki farklı üretim yolu var:

1. **Varyant üretim motoru (ADR-072, `variant-generation/service.ts:80-93`)** — kombinasyon üretiminde
   her yeni varyanta **opak deterministik** SKU verir:
   ```
   deterministicSku(productId, combinationKey) → `V-<productId>-<base36 hash>`
   ```
   Okunabilir DEĞİL (`V-clx…-1a2b3c`). Deterministik + random'sız. **Boşluk/ADR-160A hedefi:** bunu
   okunabilir `{PRODUCT_CODE}-{OPTION_CODES}-{SEQUENCE}` formatına çevirmek (§3).

2. **Identity Management Engine (ADR-073, `identity-engine/*`)** — **pattern tabanlı toplu** SKU/Barcode/
   Title motoru. Admin `TSH-{COLOR}-{SEQ:3}` gibi bir pattern yazar; motor tokenizer→parser→evaluator→
   collision→preview→apply zinciriyle uygular. Güçlü ama **sıfır-config değil** (pattern gerektirir) ve
   evaluator normalizasyonu yalnız `trim + UPPER` (`evaluator.ts:51-53`) — **transliteration YOK**
   (Türkçe karakter yalnız `{PRODUCT}` slug kaynağı üzerinden `slugify()` ile çözülür).

**Manuel varyant create/patch** (`server.ts:7471-7556`, `7558-7663`): istemcinin gönderdiği SKU **birebir**
yazılır; boşsa kontrat reddeder (auto-üretim YOK). Dupe önce `findVariantBySku` ile, sonra P2002 ile 409.

### 1.5 Import SKU'yu nasıl ele alıyor?

- **Ürün/varyant import/export sistemi YOK.** (`apps/*`, `services/*`, `packages/*` genelinde ürün/varyant
  CSV/bulk-import ucu yok; yalnız shipping rate-plan CSV import'u ve influencer-analytics export'u var.)
- Sonuç: §9 (import davranışı) **greenfield**. Bu fazda tam import sistemi kurulmaz; bunun yerine saf
  generator + collision servisi **import-hazır** tasarlanır ve import-side kuralları ADR/dokümanda sabitlenir.
  Böylece gelecekteki import motoru SKU üretimini/collision'ı yeniden yazmaz.

### 1.6 SKU değişince sipariş geçmişi etkileniyor mu?

- **Hayır (yapısal olarak).** `OrderLine.sku` **kendi snapshot kolonudur** (`schema.prisma:1534`,
  NOT NULL). Sipariş anında `variant.sku`'dan kopyalanır (`server.ts:4084` createOrder;
  `server.ts:4277` add-line). `ProductVariant.sku` sonradan değişse bile OrderLine.sku **değişmez** (FK
  değil, snapshot). Bu immutability ADR-113 ile sabitlenir + regresyon testiyle korunur.

### 1.7 SKU ↔ barcode ayrımı

- Ayrı alanlar: `sku String` (`:961`) vs `barcode String?` (`:962`). Barcode nullable, **unique DEĞİL**,
  index yok. Biri diğerini türetmez. ADR-110 bunu açıkça sabitler.

### 1.8 Search projection & audit trail

- `ProductSearchDocument` **sku içermez** (`schema.prisma:3250` civarı). Admin varyant seçicide SKU araması
  canlı SQL `ILIKE` iledir (`server.ts:2503`), projection üzerinden değil. → SKU değişimi search projection'ı
  **doğrudan** etkilemez; yine de tutarlılık için SKU yazımından sonra `reindexProduct` tetiklenir (mevcut
  identity/generation deseni; ADR-079).
- SKU değişim audit'i şu an `VariantIdentityChange` (append-only, batchId gruplu, `schema.prisma:3160`)
  üzerinden tutulur. TODO-160A ek olarak **generic `AuditLog`** (§12) yazar (görev şartı; genel gözlemlenebilirlik).

---

## 2. Mevcut altyapı — yeniden kullanım envanteri

| Bileşen | Konum | TODO-160A'da rol |
|---|---|---|
| DB `@@unique([storeId, sku])` | schema.prisma:1026 | Benzersizlik temeli (KORUNUR, yeniden üretilmez) |
| Advisory lock deseni | variant-generation/data.ts:119 | Concurrency serileştirme (yeniden kullanılır) |
| P2002→409 dönüşümü | server.ts:7536 | Unique conflict kullanıcıya 500 sızmasın |
| `slugify()` + transliteration | packages/utils/src/slug.ts | SKU generator transliteration referansı |
| Identity Engine collision (pure) | identity-engine/collision.ts | Collision kavram/kod referansı |
| OrderLine.sku snapshot | schema.prisma:1534 | Immutability (KORUNUR + test) |
| AuditLog + createAuditLog port | server.ts:4700 | SKU değişim audit'i |
| `findVariantBySku` | server.ts:3612 | Uniqueness kontrolü |

---

## 3. Tasarım kararları (özet — detay ADR-109…113)

1. **SKU otoritesi = ProductVariant (tek).** Product.sku ASLA eklenmez. (ADR-109)
2. **Deterministik okunabilir format:** `{PREFIX?}-{PRODUCT_CODE}-{OPTION_CODES…}-{SEQUENCE?}`, yalnız
   `A-Z0-9-`, ASCII, Türkçe transliteration, max 64, ardışık/baş-son ayraç yok, boş sonuç üretilemez
   (fallback). (ADR-111)
3. **Saf generator modülü** `packages/utils/src/sku.ts` — çerçeve-bağımsız (Prisma/HTTP/Date/random YOK).
   Collision çözümü **servis katmanında** (injected `isTaken` predikatı). (ADR-111)
4. **Collision policy:** in-batch + DB-wide kontrol; çakışmada zero-padded sekans soneki `-002`, `-003`…;
   retry üst sınırı; DB unique nihai guard; P2002→kontrollü conflict. (ADR-112)
5. **skuSource additive alanı** `AUTO | MANUAL | IMPORTED` (default `MANUAL` — mevcut satırlar için güvenli:
   otomatik regenerate onları EZMEZ). (ADR-110)
6. **Otomatik üretim:** manuel create'te SKU boşsa server-side üretilir (source=AUTO); varyant üretim
   motorunda opak SKU yerine okunabilir SKU (source=AUTO). Manuel SKU verilirse source=MANUAL, server-side
   doğrulanır. Manuel SKU sessizce yeniden üretilmez (regenerate `force` ister).
7. **Order snapshot immutability** sabittir; SKU değişimi OrderLine'a dokunmaz. (ADR-113)
8. **Governance:** salt-okunur audit script + dry-run-varsayılan backfill script (guard'lı) + AuditLog.

---

## 4. Kapsam sınırı (bu fazda YAPILMAYAN)

- Tam ürün/varyant import/export sistemi (yok; import-hazır tasarım + kural dokümantasyonu yapılır).
- GTIN/EAN/UPC üretim/check-digit (identity engine'de rezerve; yazılmaz).
- Gelişmiş SKU şablon dili (identity engine pattern motoru zaten var; genişletilmez).
- Barcode benzersizlik zorlaması (kasıtlı; barcode non-unique kalır — ADR-110).
- Search projection'a sku eklenmesi (gerekmez; admin araması canlı SQL ile).

---

## 5. Riskler & azaltımlar

| Risk | Azaltım |
|---|---|
| Okunabilir SKU'da transliteration çakışması (Şık/Sik→SIK) | in-batch + DB collision + zero-pad sekans soneki |
| Concurrency: iki create aynı SKU | advisory lock + DB unique + P2002→retry/conflict |
| Backfill'in geçerli SKU'ları ezmesi | dry-run default + yalnız boş/açık-seçilmiş + geçerli SKU'ya dokunma + row-count breaker |
| Mevcut opak `V-…` SKU'ların audit'te "geçersiz" sayılması | audit ayrı "opaque/system" sınıfı; backfill onları EZMEZ (geçerli sayılır) |
| Manuel SKU'nun option değişince ezilmesi | skuSource=MANUAL → regenerate `force` gerektirir |
| Migration default'un yanlış kaynak ataması | default MANUAL (en güvenli: regenerate koruması) |

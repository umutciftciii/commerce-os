# TODO-153 — Variant Media Engine · Analiz

**Tarih:** 2026-07-18 · **İlgili ADR:** ADR-078 · **Faz:** 2C-7 · **Durum:** Mimari onaylandı (kod YOK)

Bu belge; mevcut Product / Variant / Media mimarisini analiz eder, referans sistemlerle (Amazon,
Shopify Plus, commercetools) karşılaştırır, seçilen "media-defining axis" mimarisini ve trade-off'larını
kayda geçirir. Kod yazılmadan önce mimari onay çıktısıdır. Kararlar ADR-078'de normatif hâlde.

---

## 1. Mevcut Mimari (bugün)

### 1.1 Veri modeli

| Katman | Durum |
|---|---|
| Media havuzu | `MediaAsset(storeId, context, storageKey @unique, mimeType, width/height, altText, checksum)` — merkezî, tenant-scoped |
| Ürün galerisi | `ProductImage(productId, mediaId, position)` · `@@unique([productId, mediaId])` · `position=0` = kapak · **ürün-scoped, varyant bağı YOK** |
| Varyant | `ProductVariant` — **hiçbir media/image ilişkisi yok** |
| Varyant eksen çözümü | `ProductVariantOptionValue(variantId, attributeDefinitionId, optionId)` · `@@unique([variantId, attributeDefinitionId])` — normalize, otoriter |
| Renk | `AttributeOption.colorHex` — renk değeri burada; görsel alanı YOK |
| Attribute↔media | Yalnız `ProductAttributeValue.mediaId` (product-level). `VariantAttributeValue` IMAGE/FILE'ı kasıtlı dışlar |

### 1.2 Media backend (ADR-065)
- Prensip: **"storageKey sakla, URL türet"**. `mediaId/storageKey/checksum/createdBy` public projeksiyona **sızmaz** (allowlist).
- `listProductImages(storeId, productIds[], coverOnly)` batched, **N+1-siz**; `buildProductCoverUrlMap` DI'lı yardımcı (yalnız `Map<productId, url>`).
- `buildStorageKey` entity-id **içermez** (`stores/<storeId>/products/<uuid>.webp`) → varyant bağlama **dosya taşımaz**, tamamen ilişkiseldir.
- MEDIA_IN_USE 409 guard: silme öncesi 5 tabloyu sayar (`productImage`, `heroSlide`, `storeSettings`, `productCategory`, `productAttributeValue`).

### 1.3 Storefront PDP (kritik boşluk)
- Görseller yalnız ürün seviyesinde. `publicProductImageSchema = { url, altText, position }`; `publicProductVariantSchema`'da görsel alanı **yok**, varyant **düz** gelir (tek `title`, eksen ayrışması yok).
- `BuyBox` (seçili varyant state) ile `ProductGallery` (seçili görsel index state) **izole kardeş adalar** — aralarında paylaşılan state/prop kanalı **yok**. Varyant seçmek görseli değiştirmez.
- Varsayılan varyant = en ucuz (`cheapestVariantId`). Per-varyant kampanya tahmini zaten client'ta motor formülünü aynalıyor → **reaktif per-variant türetme deseni mevcut**.

### 1.4 Admin UI
- Ürün editörü sekmeleri: Genel / Fiyatlandırma / Stok. Galeri "Ürün Galerisi" bloğunda `MediaUpload(context=PRODUCT, mode=multiple)` — çoklu yükleme + ok-tuşu sıralama + implicit kapak (index 0). Kalıcılık ürün kaydında (`imageMediaIds`).
- Varyant hattı: eksen seçimi (2C-1) → kombinasyon önizleme (2C-2) → generation (2C-3) → SKU/Identity matrisi (2C-4). "Renk" ekseni SELECT/COLOR attribute'undan gelir; `colorHex` swatch.

### 1.5 Net boşluk
> Media ürün-scoped; varyant-media diye bir şey yok; PDP'de varyant ve görsel state'leri bağlı değil; public varyant DTO'su eksen bilgisi taşımıyor.
> Greenfield ama **çok temiz temeller** var (media havuzu + normalize eksen çözümü + batched projeksiyon + DI + allowlist).

---

## 2. Referans Sistemler

| Sistem | Model | Ders |
|---|---|---|
| Shopify (Plus) | Media ürün havuzunda; her varyantın **tek** `image_id`'si havuza işaret eder. Media 2.0 → image/video/3D. | Havuz + varyant→görsel işaretçisi; basit, geriye-uyumlu; tek görsel/varyant dar. |
| Amazon | Parent-child ASIN + **variation theme** (genelde Color); görseller renk seçince yüklenir. | Gruplama tek eksen (Color) üzerinden → kombinatoryal patlama yok. |
| commercetools | Her varyant **kendi `images[]`** dizisine sahip (tam varyant-scoped). | En esnek ama her SKU'ya görsel → Size×Color tekrar/patlama; SMB için ağır. |

**Çıkarım:** Amazon'un "variation theme = tek media-tanımlayıcı eksen" modeli, commercetools patlamasını önlerken Shopify havuz + geriye-uyumluluğunu korur ve bu platformun normalize eksen çözümüne (`ProductVariantOptionValue` + `AttributeOption`) birebir oturur.

---

## 3. Seçilen Mimari — "Media-Defining Axis"

**Görselleri tek bir media-tanımlayıcı eksene (öncelikle Renk) etiketle; varyant galerisini bu eksenden türet.**

```
Product.mediaDefiningAttributeId        → hangi eksen görseli belirler (genelde Renk); null = klasik ürün galerisi
ProductImage.optionId (+ attributeDefinitionId) → bu görsel hangi Renk; null = "tüm varyantlar" (paylaşılan)
Varyant galerisi = (varyantın o eksendeki optionId'sine etiketli görseller) + (etiketsiz paylaşılan görseller)
Primary image    = o grubun en düşük position'ı
```

| Hedef | Karşılık |
|---|---|
| Product ↔ Variant media ayrımı | Etiketli (`optionId≠null`) = varyant medyası; etiketsiz = ürün medyası |
| Her varyantın kendi galerisi | Varyantın renginden **türetilir** (Size görsel değiştirmez → patlama yok) |
| Primary Image | Grup içi `position=0` |
| Gallery sıralaması | Mevcut `position` semantiği |
| Alt text | Mevcut `MediaAsset.altText` |
| Video/360/3D/AR genişletme | Assoc katmanı **media-agnostic**; medya-türü alanı ileride additive |
| Renk ↔ media eşlemesi | `ProductImage.optionId → AttributeOption` |
| PDP anında değişim | State lift + client filtreleme (per-variant tahmin deseni gibi) |
| Backward compat | `mediaDefiningAttributeId=null` → tek grup = bugünkü davranış |
| Additive migration | Yeni sütunlar nullable, backfill yok |

---

## 4. Trade-off'lar (kullanıcı onaylı)

- **Granülerlik: eksen-değeri (Renk) — SEÇİLDİ.** Merchant kırmızı fotoğrafı bir kez yükler; tüm kırmızı bedenler paylaşır. Per-SKU (commercetools) reddedildi (tekrar + admin yükü). **Hibrit/per-SKU override bu fazda uygulanmaz**; mimari ileride *additive* açık kalır.
- **Şema: `ProductImage` nullable sütun — SEÇİLDİ.** 1 görsel → en fazla 1 renk (%95 senaryo); sıfır ekstra sorgu; tam additive. **Servis/repo katmanı ilişki soyutlamasıyla yazılır** → gelecekte `ProductImageOption` join tablosuna geçiş yalnız persistence katmanını değiştirsin, iş kuralları (gruplama/primary/fallback) değişmesin. Bu fazda gereksiz esneklik yok.
- **Medya türü: image-only — SEÇİLDİ.** Motor MediaAsset-türünden bağımsız kurulur; `mediaKind`/video encoding/streaming/storefront `<video>` bu faz **kapsam dışı** (ayrı Epic).
- **Primary: position-türevi.** Grup içi `position=0`; mevcut semantiği yeniden kullanır, ekstra alan yok.
- **PDP state: lift.** Küçük client wrapper ile seçili-varyant state lift; mevcut ada mimarisini minimum bozar.

---

## 5. Veritabanı Tasarımı (additive)

```prisma
model Product {
  mediaDefiningAttributeId String?   // null = klasik ürün galerisi (backward compat)
  mediaDefiningAttribute   AttributeDefinition? @relation("ProductMediaAxis", fields:[mediaDefiningAttributeId], references:[id], onDelete: SetNull)
}

model ProductImage {
  // mevcut: id, storeId, productId, mediaId, position, createdAt
  attributeDefinitionId String?     // media-tanımlayıcı eksen (denormalize, doğrulama için)
  optionId              String?      // hangi Renk; null = paylaşılan/tüm varyantlar
  attributeDefinition   AttributeDefinition? @relation(fields:[attributeDefinitionId], references:[id], onDelete: Restrict)
  option                AttributeOption?     @relation(fields:[optionId], references:[id], onDelete: Restrict)
  @@index([productId, optionId])
}
```

- Migration: yalnız `ADD COLUMN` (nullable) + index → **backfill yok**, geriye-uyumlu.
- `onDelete: Restrict` (option/definition) → MEDIA_IN_USE deseniyle tutarlı; kullanımdaki rengin silinmesi engellenir.
- Doğrulama (server): `optionId`, seçilen `mediaDefiningAttributeId` eksenine ait olmalı + tenant-scoped (mevcut `assertMediaAttachable` deseni genişler).

---

## 6. API Değişiklikleri

**Admin:**
- `PATCH product`: `imageMediaIds` → `images: [{ mediaId, optionId? }]` + `mediaDefiningAttributeId`. Yazımdan önce eksen/option/tenant doğrulaması.
- `GET product (detail)`: her image `optionId` taşır + product `mediaDefiningAttributeId`.

**Public (allowlist korunur):**
- `publicProductImageSchema` → `+ variantOptionId: string | null` (yalnız option id; media içi bilgi sızmaz).
- `publicProductVariantSchema` → `+ mediaOptionId: string | null` (varyantın media-eksenindeki değeri; `ProductVariantOptionValue`'dan türetilir).
- `listProductImages` **aynı satırı** okur → `optionId` select'e eklenir → **sıfır ekstra sorgu, N+1 yok**.

---

## 7. Admin UI Akışı

1. Varyant-attribute bölümünde bir eksen **"media-tanımlayıcı"** olarak işaretlenir (genelde Renk; yalnız SELECT/COLOR eksenlerde görünür — guided UX).
2. "Ürün Galerisi"nde her görsele bir **"Renk" seçici** (etiketsiz = "Tüm varyantlar"). `MediaUpload` yeniden kullanılır, item başına option dropdown eklenir.
3. Görseller renge göre **görsel gruplanır** (swatch başlıklı). Kalıcılık ürün kaydında.
4. `mediaDefiningAttributeId` yoksa → renk seçici gizli → bugünkü galeri aynen çalışır.

---

## 8. Storefront Davranışı

- `BuyBox` + `ProductGallery`'yi saran küçük client wrapper ile **seçili varyant state lift**.
- Varyant değişince galeri, varyantın `mediaOptionId`'sine etiketli + paylaşılan görsellerle **anında filtrelenir**.
- **SSR** ilk render varsayılan (en ucuz) varyantın renk grubuyla → layout shift yok, hydration öncesi doğru kapak.
- `shouldShowThumbnailStrip` grup-başına yeniden hesaplanır.

---

## 9. Performans Etkisi

- Detail: `optionId` mevcut `ProductImage` satırından → **ekstra sorgu yok, N+1 yok**.
- PLP kapak: değişmez (`position=0` ürün kapağı).
- Payload: görsel başına 1 option id + varyant başına 1 option id → ihmal edilebilir.
- Bundle: galeri adası hafifçe büyür (gruplama) → ihmal edilebilir.
- Backward compat: `mediaDefiningAttributeId=null` → tek grup → bugünkü davranış birebir; regresyon riski minimum.

---

## 10. Fazlar

| Faz | Kapsam |
|---|---|
| F0 | Bu analiz + ADR-078 (kod YOK) |
| F1 | Additive migration + server doğrulama (`db:generate` + `--filter` gate) |
| F2 | API backend: admin read/write projeksiyon + public DTO + `assertMediaAttachable` genişletme (MEDIA_IN_USE değişmez) |
| F3 | Admin UI: media-tanımlayıcı eksen wiring + galeride renk etiketleme + gruplu görünüm |
| F4 | Storefront: state lift + varyant-reaktif galeri + SSR default grup + docker rebuild + smoke |
| F5 (ertelenmiş) | Video/360/3D/AR: `mediaKind` + upload/işleme + storefront oynatma — ayrı Epic |

Her faz: docker rebuild + runtime smoke + backward-compat regresyon (etiketsiz ürün = bugünkü davranış).

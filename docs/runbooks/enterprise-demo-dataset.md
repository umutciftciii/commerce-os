# Runbook — Enterprise Demo Commerce Dataset (TODO-157 / ADR-085)

Search, autocomplete, dynamic facet, campaign projection, variant filtering ve inventory
state'lerini **gerçekçi ölçekte** test etmek için deterministik demo veri seti.

- **Scope (izolasyon):** yalnız `enterprise-demo` store (`storeId = edm-store`).
  Mevcut `demo-store` production seed'i ve üretim/müşteri verisi ASLA etkilenmez.
- **Determinizm:** tek sabit tohum (`ROOT_SEED`) → tekrar çalıştırmada birebir aynı
  slug/SKU/fiyat/stok. Kayan tarih/`Math.random`/`Date.now` kullanılmaz.
- **Idempotency:** "kontrollü temizle + yeniden oluştur" (yalnız enterprise-demo scope'u
  FK-güvenli silinir, sonra toplu `createMany`). Tekrar seed → duplicate YOK, aynı duruma yakınsar.

## Dosyalar

| Dosya | Rol |
|---|---|
| `packages/db/scripts/enterprise/prng.mjs` | Deterministik PRNG (mulberry32) + yardımcılar |
| `packages/db/scripts/enterprise/constants.mjs` | Store scope, ID şeması, tarih ankorları, ölçek |
| `packages/db/scripts/enterprise/taxonomy.mjs` | Kategori ağacı, marka evreni, attribute kataloğu |
| `packages/db/scripts/enterprise/profiles.mjs` | Yaprak-kategori üretim profilleri (fiyat/eksen/attr) |
| `packages/db/scripts/enterprise/catalog.mjs` | SAF üretici (tam nesne grafiği) |
| `packages/db/scripts/enterprise/summary.mjs` | SAF dağılım/özet hesaplayıcı |
| `packages/db/scripts/enterprise/persist.mjs` | Store-scope'lu idempotent DB persistansı |
| `packages/db/scripts/enterprise-seed.mjs` | Seed entrypoint (`--dry-run`/`--summary`/`--json`) |
| `packages/db/scripts/verify-enterprise-seed.mjs` | Seed sonrası invariant doğrulaması |
| `packages/db/test/enterprise-dataset.test.ts` | SAF üretici testleri (DB'siz, 43 test) |

## Kullanım

Docker stack ayakta olmalı (`postgres` + `api-gateway`). Root script'leri docker exec sarmalıdır:

```bash
# 1) Dağılımı yazmadan gör (DB gerekmez)
pnpm db:seed-enterprise:dry

# 2) Seed (enterprise-demo scope'u temizler + yeniden oluşturur)
pnpm db:seed-enterprise

# 3) Search read-model'i doldur (facet + autocomplete + kampanya rozeti kaynağı)
pnpm db:backfill-enterprise

# 4) Invariant doğrulaması
pnpm db:verify-enterprise
```

`api-gateway` imajı kaynağı build-time'da içine kopyalar (bind-mount yok); yeni script'lerle
çalışmadan önce imaj yeniden build edilmeli **veya** geliştirme sırasında dosyalar
`docker cp` ile container'a kopyalanmalıdır. Postgres host'a publish edildiğinden (`5432`)
alternatif olarak host'ta generated Prisma client ile de çalıştırılabilir.

## Veri kapsamı (ölçek)

| Boyut | Değer |
|---|---|
| Kategori (toplam / yaprak) | 37 / 29 |
| Marka (kullanılan) | 66 |
| Ürün | 471 (ACTIVE 418 · DRAFT 22 · ARCHIVED 31) |
| Varyant | 2.202 (ACTIVE 2.138 · ARCHIVED 64) |
| Attribute (tanım / option / kategori-bağ) | 25 / 111 / 76 |
| Kampanya | 14 (aktif 11 · yaklaşan 1 · sona ermiş 1 · arşiv 1) |
| Depo | 2 (İstanbul varsayılan + Ankara) |

Kategori ağacı: Elektronik (Telefon, Dizüstü, Masaüstü, Monitör, Kulaklık, Akıllı Saat, Tablet,
Bileşenler→RAM/SSD/Ekran Kartı), Moda (Kadın/Erkek Giyim, Ayakkabı, Çanta), Ev ve Yaşam
(Küçük Ev Aletleri, Mutfak, Ev Tekstili, Dekorasyon), Kişisel Bakım (Cilt/Saç/Parfüm),
Spor ve Outdoor (Fitness, Outdoor Giyim, Bisiklet), Anne ve Bebek (Bez, Giyim, Oyuncak),
Ofis ve Kırtasiye (Kırtasiye, Ofis Mobilyası).

### Dağılımlar

- **Marka:** dengesiz — birkaç major (Samsung/Apple/Arçelik…), orta yoğunluk + niş markalar.
  `Nova*`, `Art*`, `Sun*`, `Sam*` prefix aileleri autocomplete prefix testleri için bilerek eklendi.
- **Envanter:** ~%70 stokta · ~%13 düşük stok (≤ reorderPoint) · ~%12 stokta yok (onHand 0) · ~%5 yüksek.
  `InventoryItem` varsayılan-depo otoritesi ile `InventoryBalance` senkron; `reserved` hep 0 (sistem-kontrollü).
- **Fiyat:** kategoriye göre gerçekçi bantlar (kuruş); ~%35 varyantta `compareAt > price` (liste farkı);
  `cost ≤ price`; `net + KDV = brüt`. Negatif/sıfır fiyat yok.
- **Kampanya:** yüzde + sabit; ürün/kategori/marka (marka = markanın ürün id'lerine genişletilir) kapsamları;
  aktif kampanyalar geniş sabit tarih ankoruyla (2020→2099) her zaman pencere-içi kalır (deterministik + doğru sınıflanır).

## Arama / Autocomplete test sorguları (canlı doğrulanmış)

`GET /public/stores/enterprise-demo/search?q=...` (main davranışı; auth yok):

| Sorgu | Sonuç | Sorgu | Sonuç |
|---|---|---|---|
| samsung | 11 | ram | 49 |
| apple | 19 | bluetooth | 20 |
| laptop | 29 | kadın | 33 |
| gaming | 44 | erkek | 35 |
| siyah | 290 | sneaker | 22 |
| 16 gb | 49 | kahve makinesi | 2 |
| 512 gb | 92 | *(zero-result)* zzzxq… | 0 |
| ssd | 50 | | |

Facet grupları attribute dağılımıyla uyumlu döner (ör. `ram_kapasitesi`, `ssd_kapasitesi`,
`islemci`, `ekran_karti`, `renk`, `materyal` — disjunctive facet sayaçlarıyla). Aktif "Sepette %5"
kampanyası tüm ACTIVE ürünlere rozet basar → autocomplete/PLP rozet testleri beslenir.

## Doğrulama (invariant'lar)

`verify-enterprise-seed.mjs` 21 kontrol: ürün/kategori/marka/varyant sayıları, duplicate SKU/slug yok,
orphan variant/inventory yok, kategori-atama tutarlılığı, attribute değer↔tanım uyumu, required attribute
kapsamı, variant-defining kombinasyon tutarlılığı (VOV sayısı = eksen sayısı), negatif stok yok,
fiyat invariant'ları, aktif public rozet kampanyası, search doküman kapsamı (= ACTIVE ürün),
facet üretimi, kampanya rozeti projeksiyonu. **Backfill sonrası çalıştırın** (`--skip-search` ile
search kontrolleri atlanabilir).

## Bilinen sınırlamalar

- **TD-066** — Per-renk swatch görselleri üretilmez; ürünler tek domain-yer tutucu kapak alır
  (swatch listesi kapak görseline fallback eder). `VariantAttributeValue` (searchText yolu) doldurulmaz;
  renk/kapasite aranabilirliği açıklama anahtar-kelimeleriyle + `ProductVariantOptionValue` facet'iyle sağlanır.
- **TD-067** — Enterprise seed script'leri `.mjs` (tsc typecheck kapsamı dışında); SAF üretici vitest + eslint ile korunur.

## PR #94 merge sonrası yapılacak final doğrulama

PR #94 (autocomplete UX / suggest ucu) merge olduğunda:

1. `GET /public/stores/enterprise-demo/suggest?q=...` (yeni suggest ucu) ile
   **brand / category / product** öneri gruplarının aynı anda döndüğünü doğrula (ör. `nova`, `art`, `sun` prefix'leri).
2. Aktif kampanya rozetinin autocomplete öğelerinde göründüğünü UI'da doğrula.
3. Prefix-collision senaryolarını (`Nova*`, `Sam*`) suggest highlight/debounce ile smoke et.
4. Facet UI'sinin disjunctive sayaçlarla enterprise dağılımını doğru gösterdiğini doğrula.

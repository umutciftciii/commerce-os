# TODO-152A — Inventory UX Birleştirme · Analiz

**Tarih:** 2026-07-18 · **İlgili ADR:** ADR-077 (ADR-076 devamı) · **Durum:** Uygulandı (commit/deploy YOK)

Faz 2C-6 (Warehouse-Aware Inventory Engine, ADR-076) kullanıcıya sunulurken üç UX tutarsızlığı kaldı.
Bu belge her problemi analiz eder, seçilen çözümü ve güvenli geçiş gerekçesini kayda geçirir.

---

## Problem 1 — İki farklı stok ekranı

**Bulgu.** İki paralel stok deneyimi vardı:

| | Sol menü `/inventory` (legacy) | Product Detail > Stok sekmesi (yeni motor) |
|---|---|---|
| Kaynak | `InventoryItem` (`listInventory`) | Inventory Engine matrisi (`getInventoryMatrix`) |
| Kolonlar | Eldeki · Rezerve · Kullanılabilir · Eşik | Depo · Elde · Rezerve · Satılabilir · Gelen · Güvenlik · Reorder · Durum |
| Yazma | "Stok düzelt" modalı (`adjustInventory`) | Quick Edit · Bulk · Preview · Apply |
| Depo | yok (tek boyut) | depo seçici + KPI |

**Motor kısıtı.** Inventory Engine sert biçimde **product-scoped**'tur: `matrix`/`preview`/`apply` uçları
`productId` + product+warehouse advisory-lock ister; satırlar ürün kimliği taşımaz. Global tam-düzenleme
tablosu ancak (a) ürünler-arası fan-out yazma (per-product transaction/lock modelini bozar) ya da
(b) yeni cross-product motor (kapsam patlaması) ile mümkün olurdu.

**Karar (kullanıcı onayı).** Global Stok = **izleme & operasyon merkezi**; tam düzenleme **Product Detail >
Stok sekmesinde kalır**. Fan-out yazma REDDEDİLDİ (ADR-076 korunur). Global ekran:
- depo seçici · 6 KPI · arama · durum filtresi · tüm motor kolonları (Ürün dahil) · durum rozeti;
- her satır → `/products/:id?tab=inventory` derin-link (tek tık düzenlemeye geçiş);
- güvenli tek-satır hızlı işlem (+10/−10/sıfırla) — **mevcut ürün-bazlı preview→apply** ile (yeni yol yok);
  preview `blocked` ise uygulanmaz (uyarı).

**Yeni SALT-OKUMA uç.** `GET /stores/:storeId/inventory/matrix?warehouseId=` — tüm non-archived varyantları
(ürün kimliğiyle) seçili depoda current bakiye + SAF `computeCalc` ile döndürür → durum/satılabilir Product
Detail sekmesiyle **birebir**. Yazma/lock/fingerprint yok. Motor SAF fonksiyonları (availability/calculator)
tek doğruluk kaynağı olarak yeniden kullanılır (kopya mantık yok).

---

## Problem 2 — Duplicate stok alanı ("Kritik stok eşiği")

Varyant Düzenle modalındaki legacy "Kritik stok eşiği" alanının tam analizi:

| Soru | Bulgu |
|---|---|
| Yalnız legacy UI mı? | Alan yalnız variant modalında YAZILIYORDU (edit modunda prefill bile edilmiyordu → `useState("")`). |
| DB'de tutuluyor mu? | Evet — `InventoryItem.lowStockThreshold Int?` (nullable). `ProductVariant`'ta DEĞİL. |
| Runtime'da kullanılıyor mu? | **Yazma:** variant modalı + gateway `createVariant`/`updateVariant`. **Karar okuma (tek):** dashboard "kritik stok" KPI'ı + legacy global sayfa rozeti. **Storefront/checkout:** KULLANMIYOR (storefront hardcoded `LOW_STOCK=5`; stok haritası `onHand−reserved`). |
| reorderPoint'e taşınmış mı? | HAYIR — engine migration `reorderPoint=0` bırakıyordu; backfill yoktu. Yeni motor LOW_STOCK'u yalnız `reorderPoint`'ten türetir (`sellable ≤ reorderPoint > 0`); `lowStockThreshold`'ı hiç okumaz. |

**En güvenli geçiş (uygulanan).**
1. **Backfill (idempotent, non-destructive).** `20260718160000_backfill_reorder_point`: yalnız DEFAULT depo
   bakiyesinde `reorderPoint=0` iken ve `lowStockThreshold IS NOT NULL AND > 0` iken değeri taşır. Manuel
   reorderPoint'leri EZMEZ; re-run güvenli. Böylece mevcut kritik-stok sinyali kaybolmaz.
2. **Yazma yolu tamamen kaldırıldı.** variant modalı alanı + gateway create/update yazımı + contract
   create/update **request** alanları çıkarıldı → alan artık asla yeni değer almaz.
3. **Tek karar-reader taşındı.** Dashboard KPI'ı yeni store matrisinden LOW_STOCK sayar (=reorderPoint).
   Legacy global sayfa tamamen kaldırıldı (Problem 1).
4. **Kolon KORUNDU (dormant).** `lowStockThreshold` kolonu + `inventoryItemSchema` yanıt alanı + legacy list
   serileştirmesi drop EDİLMEDİ (additive felsefe; ADR-076 destructive-migration reddi). Tam emeklilik ayrı
   bir dikkatli iş olarak TECHNICAL_DEBT'e yazıldı.

**Sonuç.** `InventoryBalance.reorderPoint` stok eşiğinin **tek authority**'sidir; `lowStockThreshold`'ın
tüm runtime kullanımı (yazma + karar okuma) kaldırıldı; veri kaybı yok.

---

## Problem 3 — Sekmeler görünmüyor (dark theme)

**Bulgu.** Ürün detay sekmeleri (`Genel/Fiyatlandırma/Stok`) yalnız `border-b-2` + `text-white/45` ile
underline-only'di; ikon yoktu → dark tema'da düşük kontrast.

**Çözüm.** Belirgin pill: aktif = indigo dolgu (`bg-indigo-500/[0.22]`) + border + ikon + `text-white` yüksek
kontrast + hafif ring; inaktif = yumuşak border + hover (bg + text). Mobilde `overflow-x-auto` yatay kaydırma.
Her sekmeye ikon (Genel→ProductIcon, Fiyatlandırma→PaymentIcon, Stok→InventoryIcon). `?tab=` query param ilk
sekmeyi belirler (global izleme ekranından derin-link).

---

## Değişen dosyalar (özet)

- **contracts:** `inventoryStoreMatrixRow/Response` (+); variant create/update `lowStockThreshold` (−).
- **api-gateway:** `inventory-engine/{data,service,routes}.ts` (`listStoreVariants`/`storeMatrix`/matrix route);
  `server.ts` variant create/update lowStockThreshold yazımı (−).
- **db:** migration `20260718160000_backfill_reorder_point` (idempotent backfill).
- **api-client:** `admin.inventory.storeMatrix` + tip re-export.
- **store-admin-web:** `app/(app)/inventory/page.tsx` (yeniden yazıldı); `products/inventory/shared.tsx` (+);
  `products/inventory/inventory-workspace.tsx` (paylaşılan atomlara geçti); `products/[id]/page.tsx` (sekme +
  `?tab=`); `products/variants-manager.tsx` (eşik alanı −); `api/dashboard/summary` (KPI→reorderPoint);
  `api/catalog/inventory/matrix/route.ts` (+); `lib/client/api.ts` (`getStoreInventoryMatrix`).
- **i18n:** tr+en `storeAdmin.inventory` yeniden yazıldı; `variants.form.lowStock*` (−).
- **testler:** inventory-engine +2, store-admin inventory yeniden yazıldı, dashboard KPI + i18n copy uyarlandı.

## Kapsam dışı / kalan
Backfill migration deploy + docker rebuild + auth'lu runtime görsel smoke · lowStockThreshold kolon tam-drop ·
store matris pagination/virtualization · global toplu (fan-out) yazma. (TECHNICAL_DEBT.md · TD-047.)

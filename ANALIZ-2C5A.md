# ANALİZ — Faz 2C-5A · Commercial UX Refinement (TODO-151A / ADR-075)

> Bu belge YALNIZ Store Admin kullanıcı deneyimi yeniden tasarımını kapsar.
> Commercial Engine (Faz 2C-5 / ADR-074) motoru, hesaplama, preview, apply, audit,
> stale-guard, advisory-lock, tenant izolasyonu ve API kontratı **DEĞİŞMEDİ**.

## 1. Mevcut (2C-5) durumun problem analizi

Faz 2C-5 teknik motoru doğru çalışıyor; ancak Store Admin sunumu anlaşılır değildi:

1. **Sıkışık gömülü kart.** `CommercialMatrix`, ürün formunun içinde `DetailLayout`'un ⅔
   ana kolonuna (≈760px) sıkışan küçük bir kartı olarak render ediliyordu.
2. **Alan israfı + yatay scroll.** 11+ kolonlu tablo dar alana sıkışıp gereksiz yatay
   scroll üretiyordu; 1440px+ ekranlarda alan boştu.
3. **Teknik dil.** "Ticari matris", "deterministik", "server-derived" gibi ifadeler son
   kullanıcı için belirsizdi.
4. **Belirsiz fiyat kavramları.** "Fiyat" ile "Liste fiyatı" farkı; "İndirim" başlığının
   sistemin uyguladığı bir kampanya gibi algılanması.
5. **Zayıf değişiklik gösterimi.** Yalnız yeşil yeni değer; mevcut↔yeni ilişkisi belirsiz.
6. **Dar önizleme.** Özet yalnız satış fiyatı aralığına odaklı; liste/maliyet/KDV değişimi
   yeterince açıklanmıyordu.
7. **Yönlendirmesiz toplu işlem.** Kullanıcı önce `targetField` + `operation` enum seçmek
   zorundaydı; seçim/işlem ilişkisi net değildi.
8. **Tema.** Ekrana dağılmış `text-white/xx` sihirli değerleri; kontrast/hiyerarşi zayıf.

## 2. Çözüm mimarisi

| Katman | Değişiklik | Motor etkisi |
|---|---|---|
| `products/[id]/page.tsx` | Sekme mimarisi (Genel · Fiyatlandırma); Pricing tam genişlik | Yok |
| `products/pricing/pricing-workspace.tsx` | **YENİ** tam genişlik çalışma alanı | Yok (hook'u tüketir) |
| `products/pricing/guided-operations.ts` | **YENİ** senaryo → (targetField, operation) eşlemesi | Yok |
| `products/pricing/pricing-tokens.ts` | **YENİ** semantik token sınıfları | Yok |
| `products/commercial/use-commercial-matrix.ts` | varsayılan mod `direct`; `setSelection` | Yok (kontrat sabit) |
| `products/commercial/commercial-matrix.tsx` | **SİLİNDİ** (eski gömülü sunum) | Yok |
| `products/product-form.tsx` | `CommercialMatrix` çıkarıldı | Yok |
| `globals.css` | `.pricing-workspace` token katmanı (+light türetme) | Yok |
| i18n tr/en `storeAdmin` | `products.pricing` + `products.detail.tabs` | Yok |

## 3. Kilit kararlar (ADR-075 özet)

- **Ayrı Pricing tab + full-width:** sıkışık kart yerine tam genişlik; shell `max-w-6xl`
  disiplini korunur (per-tab breakout bilinçli olarak yapılmadı — kırılganlık/tutarsızlık).
- **Hızlı düzenleme varsayılan:** günlük iş; Toplu işlem ayrı, yönlendirmeli mod.
- **Guided bulk:** "Ne yapmak istiyorsunuz?" senaryoları saf UI katmanında kontrata çevrilir.
- **"İndirim" → "Liste fiyatına göre indirim":** yalnız hesaplanan metrik; kampanya değil.
- **old → new gösterim + alan-bazlı preview özeti.**
- **Semantik tema token'ları:** renk anlamı token'dan; yalnız-renk değil (ikon+başlık+metin).
- **Engine dokunulmadı:** UI mevcut hook üzerinden motoru/kontratı tüketir.

## 4. Commercial Engine korunma kanıtı

- api-gateway `commercial-engine/*`, `packages/db` (schema/migration), `packages/contracts`
  `commercial*Schema`, `packages/api-client` `...commercial.*` **hiç değiştirilmedi**
  (`git status` yalnız store-admin + i18n gösterir).
- Hook sözleşmesi aynı: preview yalnız-okuma + deterministik; apply server-authoritative
  (baseFingerprint stale-guard). Guided bulk, `runPreview`/`apply`'ı DEĞİŞTİRMEDEN besler.
- `pricing-workspace.test.tsx`, `previewCommercial`/`applyCommercial` çağrılarının kontrat
  şekline (rule.targetField/operation/percentBps/valueBps + selectedVariantIds + baseFingerprint)
  uyduğunu doğrular.

## 5. Test & gate özeti

- store-admin: **305/305** yeşil (14 yeni pricing + 4 guided + 2 sekme testi dahil).
- i18n: 47 yeşil; `tsc` build ile EN⇔TR yapısal eşleşme doğrulandı.
- store-admin `tsc --noEmit` TEMİZ · `eslint` TEMİZ · `next build` başarılı · `git diff --check` temiz.

## 6. Kapsam dışı / teknik borç (TD-046)

Panel geneli light/dark toggle · 1440px+ per-tab breakout · eski `commercialMatrix` i18n
bloğunun tamamen taşınması · sekme-değişiminde kaydedilmemiş-değişiklik uyarısı · docker
runtime görsel smoke (auth'lu piksel-smoke bu ortamda credential engeli nedeniyle yapılamaz).

commit / push / PR / merge / deploy **bu görevde YAPILMADI** (görev kuralı).

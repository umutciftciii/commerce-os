# BUG-CART-004 — Checkout Store-Credit (Alışveriş Bakiyesi) UX

**Durum:** ✅ CLOSED & DEPLOYED (PR #198)
**Tarih:** 2026-08-08
**Kapsam:** storefront-web (checkout) + packages/i18n. Backend/gateway DEĞİŞMEDİ (tahsis zaten doğru).
**İlişki:** TODO-174B (ADR-282) store credit checkout allocation sonrası UX kusuru.

## Belirti (kullanıcı bildirimi + kanıtlanan)

1. **"Alışveriş bakiyemi kullan" seçili ama fiyata hiç etki etmiyor.**
2. **Kontrol çok kötü konumda** — ödeme kartının en altında, kolayca gözden kaçıyor.

## Kök neden (kanıtlı)

- Toggle (`checkout-form.tsx`) **koşulsuz** render ediliyordu — müşterinin kullanılabilir bakiyesine
  bakmıyordu (kod yorumu bile "bakiye 0 ise no-op" diyordu). Bug'ı bildiren müşterinin hesabı
  `cachedAvailableMinor=0` (tüm lotlar CONSUMED — önceki siparişte harcanmış); bakiye SIFIR olduğundan
  toggle'ın etki etmemesi **doğruydu**, ama UI bunu hiç iletmiyordu → kullanıcı etki bekliyor, göremiyor.
- Kontrol ödeme kartının en altındaydı (adres/kargo/fatura'dan sonra) → keşfedilebilirliği düşük.
- Ayrıca bakiye>0 olsa bile checkout **özeti** etkiyi göstermiyordu (kredi ödeme yöntemi olarak sipariş
  oluşturma anında uygulanır; özet değişmezdi) → "fiyata etki etmiyor" algısı bakiyeli kullanıcıda da olurdu.
- **Backend/gateway allocation DOĞRU çalışıyor** (izole smoke ile kanıtlandı; aşağı bkz.) — sorun tamamen UX.

## Düzeltme

- **Gate:** kredi kontrolü YALNIZ `availableCreditMinor > 0` iken gösterilir (0 bakiyede hiç görünmez →
  "seçili ama etkisiz" yanılgısı imkânsız). Checkout page `getShoppingBalance()` çağırır, `availableCreditMinor`
  formu besler.
- **Konum:** kontrol ödeme kartından ÇIKARILDI, **sipariş özetine** (sticky sağ kolon, paranın gösterildiği yer)
  taşındı — prominent + mantıklı.
- **Bilgi + canlı önizleme:** "Alışveriş bakiyen ₺X" gösterilir; "Bu siparişte kullan" işaretlenince özet
  CANLI günceller: "Alışveriş bakiyesi −₺Y" + **"Ödenecek ₺Z"** (Z = Genel toplam − min(bakiye, toplam)).
  Kredi indirim DEĞİL → **Genel toplam korunur**; yalnız ödenecek düşer. Saf `computeShoppingCreditPreview`
  (min(available, payable)) gateway ADR-282 kuralını birebir yansıtır. `CartSummaryView.grandTotalMinor`
  (ham) eklendi (önizleme hesabı için).

## Testler (TDD)

- `apps/storefront-web/test/credit-preview.test.ts` (5) — computeShoppingCreditPreview (kısmi/tam/0/negatif-clamp).
- `apps/storefront-web/test/checkout-form-render.test.tsx` (+2) — kredi kontrolü bakiye>0'da gösterilir/tutarı;
  bakiye 0'da HİÇ gösterilmez.

## İzole canlı kanıt (worktree gateway :4100 + storefront :3100, gerçek commerce_os, izole müşteri)

- **Görünürlük + konum:** sipariş özetinde "Alışveriş bakiyen ₺500,00" + "Bu siparişte kullan" (0-bakiye müşteride HİÇ yok).
- **Canlı önizleme:** işaretleyince Genel toplam ₺8.072,19 SABİT; "Alışveriş bakiyesi −₺500,00"; **Ödenecek ₺7.572,19**.
- **Gerçek tahsis (backend doğru):** HTTP checkout `useShoppingCredit:true` → sipariş oluştu, kredi lot
  `50000 ACTIVE → 0 CONSUMED`, hesap `cachedAvailableMinor 50000 → 0`, kalan ₺7.572,19 PSP ödeme path'ine.
- Fixture FK-güvenli temizlendi; enterprise-demo PRISTINE (471 ürün).

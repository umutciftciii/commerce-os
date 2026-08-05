# Per-line Discount Refund Accuracy (TD-FR-7)

- **Durum:** KARARLI — sıradaki iş (henüz UYGULANMADI). 2026-08-06.
- **Karar (ürün sahibi):** İade tutarı, müşterinin o **kaleme fiilen ödediği** (indirim uygulanmışsa
  indirimli, değilse tam) tutar olmalı. **Oransal indirim dağıtımı YANLIŞ** — bunlar resmi/finansal işlem;
  her kalem cebinden çıkanı taşımalı ve gerektiğinde onu iade etmeli.
- **Builds on / etkiler:** ADR-269 §6 (`returns/refund-calc.ts`, ADR-066 `allocateOrderDiscount`), ADR-272
  (OrderRefund ledger — yanlış tutarı gerçek para hareketine çevirir), F4A/ADR-058..062 (kampanya/indirim snapshot).

## Kanıt (OS-000004 / R000001)

`OrderDiscount` = "Seçili Ürünlerde %20", `discountAmountMinor=396024`, `scopeSummary.eligibleSubtotalMinor=1980120`
= tam olarak Karaca Robot Süpürge (₺19.801,20). Yani indirim **yalnız Karaca'ya** uygulandı.

| Ürün | Liste (brüt) | Gerçek indirim | **Fiilen ödenen** | Motorun oransal payı | Motorun iadesi |
|---|---|---|---|---|---|
| Karaca Robot Süpürge | ₺19.801,20 | −₺3.960,24 | ₺15.840,96 | −₺2.419,86 | ₺17.381,34 (**+₺1.540,38 fazla**) |
| Casper Ekran Kartı | ₺6.313,50 | −₺0,00 | **₺6.313,50** | −₺771,55 | **₺5.541,95 (−₺771,55 eksik)** |
| Artesan Bel Çantası | ₺6.291,10 | −₺0,00 | ₺6.291,10 | −₺768,82 | ₺5.522,28 (−₺768,82 eksik) |
| Toplam | ₺32.405,80 | −₺3.960,24 | ₺28.445,56 | −₺3.960,24 | ₺28.445,56 |

Toplam korunur ama **kalem bazında yanlış**: indirimsiz kalemde eksik-iade, indirimli kalemde fazla-iade.
KDV ile ilgisi yok (fark %12,2 — oransal indirim payı).

## Kök neden

1. **Veri modeli boşluğu:** sipariş anında indirim **kalem-bazında snapshot'lanmıyor.** `OrderDiscount` yalnız
   sipariş düzeyi `discountAmountMinor` + `scopeSummary.eligibleSubtotalMinor` tutar; "hangi kaleme ne düştü" yok.
2. **refund-calc** bu eksik veriyle indirimi tüm kalemlere **brüt-ağırlıkla oransal** dağıtır (ADR-066) —
   scope'lu (ürün-özel) kampanyada yanlış.

## Karar & tasarım

1. **Şema (additive):** `OrderLine.discountAllocatedMinor Int?` — KDV-**dahil**, o kaleme fiilen düşen indirim.
   Kalemin fiilen ödenen tutarı = `lineChargedMinor = lineGrossAmountMinor − discountAllocatedMinor`.
   Invariant: `Σ OrderLine.discountAllocatedMinor == Order.discountAmount`.
2. **Kaynak doğrusu = checkout/kampanya motoru.** İndirimi hesaplayan motor eligible kalemleri + kalem-payını
   bilir → order placement'ta `discountAllocatedMinor`'ı snapshot'lar. Yeni siparişler her zaman doğru.
3. **refund-calc:** oransal `allocateOrderDiscount` bırakılır; ürün iadesi
   `round((lineGrossAmountMinor − discountAllocatedMinor) × returnedQty / lineQty)`. **Disclosed KDV** de
   indirim-**sonrası** taban üzerinden hesaplanır (ADR-269 §6'daki "disclosed tax pre-discount" tutarsızlığını
   da çözer: OS-000004 Casper örneğinde ₺1.052,25 → ₺923,66).
4. **Migration + backfill:** kolon nullable. `null` → legacy oransal fallback (geriye uyumlu); set → exact.
   Backfill best-effort: `scopeSummary.eligibleSubtotalMinor`'dan eligible kalemler kesin tespit edilebiliyorsa
   (ör. tek kalemle birebir eşleşme) exact dağıt; edilemezse null bırak (legacy, belgeli). Yeni siparişler snapshot'lı.
5. **Testler (gerçek-DB + saf):** scope'lu indirim (OS-000004 deseni) → indirimsiz kalem TAM fiyat iade,
   indirimli kalem indirimli iade; multi-line eligible dağıtım; invariant Σ==order.discount; legacy null fallback;
   kısmi-adet iade; Financial Reporting net gelir düşüşü kalem-doğru.

## Açık / migrasyon notu

- **R000001 (Casper, açık iade):** fix landing sonrası doğru tutar **₺6.313,50** olmalı (şu an `RefundIntent`
  ₺5.541,95 PENDING). Fix öncesi elle düzeltme mi, fix sonrası intent yeniden-hesap mı — ürün kararı.
- Ayrı ticket/ADR (finansal doğruluk); checkout motoru + refund-calc + migration/backfill + testler kapsar.

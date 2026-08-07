# ADR-274 — Reverse Shipment (Return Flow Simplification PR3)

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #188 merge `3f01ccc`). CI (lint·test·build) yeşil; merge commit
(squash/rebase yok). Split-ship: test-infra hardening ayrı PR #187 (`cb70738`) ÖNCE merge edildi (CI-determinizmi),
sonra bu PR. Deploy: `prisma migrate deploy` → production `commerce_os` (todo173 uygulandı, up-to-date) + api-gateway
& store-admin-web & storefront-web main'den rebuild/recreate (`--no-deps --force-recreate`; admin-web/worker/postgres/
redis/volume DOKUNULMADI). Post-deploy smoke (deployed :4000) PASS 13/13: disposition create + cap 409 · reverse
create + direction · reverse dup 409 · stale 409 · IN_TRANSIT → DELIVERED · disposition COMPLETED · cross-store 404;
SQL izolasyon (order FULFILLED/PAID değişmez · OrderRefund/RefundIntent/inventory 0 · outbound teslim ankoru intact).
İzole fixture temizlendi; production demo verisi dokunulmadı. Baseline `e15e50e`.

**İlişkili:** [ADR-269](ADR-269-returns-authority-and-lifecycle.md) (Returns Foundation — inspection/
rejectedQuantity),
[ADR-272](ADR-272-refund-ledger-and-payment-reversal.md) (Refund Ledger — semantiği KORUNUR, dokunulmaz),
[ADR-273](ADR-273-fast-refund-controls.md) (Fast Refund — PR2),
`docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md` (§ PR3 / K1–K4),
`docs/analysis/REVERSE-SHIPMENT.md` (denetim + spec).

**Kapsam dışı:** Marketplace, Gift Card/Store Credit, Social Login, gerçek online carrier label transportu,
reverse shipment SLA, reverse shipment maliyet muhasebesi (hepsi FUTURE).

---

## Bağlam

İnceleme (ADR-269) sonucu bir iade kaleminin bir kısmı **reddedilebilir** (`ReturnItem.rejectedQuantity =
quantity − approvedQuantity`, kısmi onayda set edilir). Reddedilen ürün fiziksel olarak mağazadadır
(müşteri iade kargosuyla göndermiştir) ve müşteriye geri gönderilmesi gerekebilir. TODO-171/172 öncesi
reddedilen adet için **hiçbir disposition kavramı yoktu**: `rejectedQuantity` yalnız bir tamsayıydı, aşağı
akış yoktu; reddedince UI tüm kalemlere `restockDecision=DO_NOT_RESTOCK` yazıp sessiz no-op bırakıyordu.

`ReturnRestockDecision` enum'u (`RESTOCK_AS_SELLABLE`/`RESTOCK_AS_DAMAGED`/`DO_NOT_RESTOCK`/`RETURN_TO_VENDOR`/
`DISPOSE`) **yalnız kabul edilen (received) adedin stok kararıdır** ve yalnız `RESTOCK_AS_SELLABLE` envanter
hareketi üretir; diğerleri no-op. Bu enum reddedilen-adet disposition'ı için semantik olarak uygun değildir
(5 disposition seçeneği 1:1 oturmaz).

`Shipment` modeli bugün **tek yönlüdür** (implicit outbound-to-customer): `direction` alanı yok; `referenceId
= order.orderNumber` + `@@unique([storeId, referenceId])`; duplicate guard `findActiveShipment` DELIVERED'ı
"aktif" sayar; order fulfillment rozeti / FULFILLED-on-DELIVERED / müşteri tracking / iade penceresi teslim
anchor'ı / admin liste-KPI hepsi ayrımsız `Shipment.status` okur. Bir ters gönderi bu projeksiyonları kirletir.

Müşteri→mağaza iade kargosu bacağı bugün `Shipment` DEĞİL; `ReturnRequest.returnCarrier/returnTrackingNumber/
shippedAt` string alanlarıdır.

## Karar

### K4-düzeltme — Üç yönlü `ShipmentDirection` enum baştan
```
enum ShipmentDirection { OUTBOUND_TO_CUSTOMER, CUSTOMER_RETURN_TO_STORE, STORE_RETURN_TO_CUSTOMER }
```
Genel/belirsiz "OUTBOUND"/"RETURN" KULLANILMAZ. `Shipment.direction @default(OUTBOUND_TO_CUSTOMER)`; mevcut
tüm kayıtlar default ile `OUTBOUND_TO_CUSTOMER` (geri uyumlu, backfill gerektirmez). Bu PR'da yalnız
`STORE_RETURN_TO_CUSTOMER` gerçek akışı uygulanır; `CUSTOMER_RETURN_TO_STORE` **reserved domain value**dır
(§FUTURE). Tüm projeksiyon/guard direction-aware olur; yeni ters gönderiler doğru bucketlenir.

> **DECISIONS.md K4 düzeltmesi:** Önceki plan notu "`ReturnRestockDecision`'a `STORE_RETURN_TO_CUSTOMER`
> ekle" diyordu. Denetim bunu reddetti (restock kabul-adet-scoped). Yerine ayrı disposition domain'i (K1).

### K1 — Ayrı reddedilen-adet disposition domain'i (`ReturnRestockDecision` GENİŞLETİLMEZ)
```
enum ReturnRejectedDisposition { RETURN_TO_CUSTOMER, DESTROY, SEND_TO_VENDOR, KEEP_IN_STORE, CONTACT_CUSTOMER }
enum ReturnDispositionStatus   { PENDING, COMPLETED, CANCELLED }

model ReturnItemDisposition {
  id, storeId, returnRequestId, returnItemId,
  type ReturnRejectedDisposition, quantity Int, reason String?,
  status ReturnDispositionStatus @default(PENDING),
  createdByPlatformUserId String?, version Int, createdAt, updatedAt
}
```
Kurallar (backend-enforce):
- Yalnız `rejectedQuantity` üzerinde çalışır; `approvedQuantity` ile karışmaz.
- `Σ(quantity) where status != CANCELLED, returnItemId` ≤ `rejectedQuantity` (cap invariant).
- Aynı reddedilen adet iki (aktif) disposition altında olamaz (cap invariant bunu garanti eder).
- `RETURN_TO_CUSTOMER` → reverse shipment üretebilir; diğerleri shipment üretmez (lojistik/audit no-op).
- Her karar append-only `ReturnStatusHistory` (`eventType`/`metadata` — ADR-273 deseni) + `AuditLog`.
- **CANCELLED** disposition quantity'yi tekrar kullanılabilir yapar (cap'ten düşer).
- **COMPLETED** disposition immutable (değiştirilemez/iptal edilemez).
- `ReturnRestockDecision` yalnız kabul edilen adet + stok kararı için KALIR (dokunulmaz).

### K5 — Reverse shipment `Shipment` modelini REUSE eder (direction discriminator); provider nullable
Ayrı `ReverseShipment` tablosu kurulmaz. `Shipment`'e additive:
`direction`, `returnRequestId?`, `returnItemId?`, `returnQuantity?`, `sourceShipmentId?` (self-relation orijinal
outbound'a), `reverseShipmentReason?`, `createdByPlatformUserId?`. Reverse shipment **manueldir** (carrier
entegrasyonu yok) → `provider`/`providerConfigId` **nullable** yapıldı (DROP NOT NULL; mevcut satırlar değerini
korur). Sync/webhook/barcode worker'ları reverse shipment'ı SEÇMEZ (provider null + nextSyncAt null). Manuel
lifecycle mevcut `ShipmentStatus` + `shipping/status-map.ts` state-machine ile (yeni sahte makine yok).
`referenceId` direction-nitelikli üretilir (`<orderNumber>-RTC-<shortId>`; `@@unique([storeId,referenceId])`
korunur).

### K5-invariant — Reverse-shippable quantity
Her `ReturnItem` için:
```
Σ(reverse shipment.returnQuantity where direction=STORE_RETURN_TO_CUSTOMER, status ∉ {CANCELLED,FAILED}, returnItemId)
  ≤ Σ(disposition.quantity where type=RETURN_TO_CUSTOMER, status != CANCELLED, returnItemId)
  ≤ rejectedQuantity
```
- CANCELLED/FAILED reverse shipment quantity tekrar kullanılabilir.
- SHIPPED/DELIVERED (aktif/terminal) quantity tekrar kullanılamaz.
- Concurrent create race: order+returnItem düzeyinde **PostgreSQL advisory lock** + version guard.
- Client quantity authority DEĞİLDİR; stale version → 409; duplicate referans güvenli.

### K3 — Yetki = `requireStoreAdmin` (refund/payment yetkisinden ayrık)
Store-scoped admin; cross-store 404; disabled/invalid admin reddedilir; `expectedVersion` zorunlu; cap +
duplicate guard backend-enforce; `AuditLog` + `ReturnStatusHistory`; internal reason müşteriye sızmaz.
Reverse shipment **OrderRefund/RefundIntent ÜRETMEZ**, paymentStatus/inventory/finance değiştirmez. SUPER_ADMIN
yalnız gelecekteki istisna (carrier override, manuel ücret, force-cancel/complete) için düşünülür.

### Normal fulfillment izolasyonu (direction-aware projeksiyonlar)
Aşağıdakiler `direction = OUTBOUND_TO_CUSTOMER` ile filtrelenir: order badge (`pickOrderShipmentStatus`
tüketicileri), FULFILLED-on-DELIVERED, müşteri tracking, iade penceresi teslim anchor'ı (`resolveDeliveryAnchor`),
admin liste/KPI (default OUTBOUND; direction filtresi eklenir). `findActiveShipment` duplicate guard direction-
aware (yalnız aynı yöndeki aktif gönderiyi bloklar). Reverse shipment: siparişi FULFILLED yapmaz, delivered
item count'u değiştirmez, normal SLA/rozeti kirletmez.

### Müşteri UX — refund'dan açık ayrım
Müşteri return + order detayında "Ürün size geri gönderiliyor" + taşıyıcı/takip/tarih/durum; teknik disposition
kodu / internal note GÖSTERİLMEZ. Semantik açık: "Para iadesi yapılmadı — ürün müşteriye geri gönderiliyor."

## Sonuçlar

- Reddedilen ürün için ilk-sınıf, denetlenebilir, güvenli geri-gönderim temeli.
- Normal fulfillment/finance/inventory tümüyle izole (kanıtlı direction filtreleri + testler).
- `ShipmentDirection` üç yönlü → gelecekteki müşteri-iade Shipment göçü için hazır zemin (§FUTURE).
- Ek karmaşıklık: her yeni Shipment projeksiyonu artık direction-aware olmalı (test + review checklist).

## FUTURE (bu PR'a sıkıştırılmaz — ayrı migration + regresyon fazı)
- `CUSTOMER_RETURN_TO_STORE`: mevcut `ReturnRequest.returnCarrier/returnTrackingNumber/shippedAt` tracking'ini
  `Shipment` modeline taşıma; dual-write → backfill → storefront/admin projection migration → legacy field
  deprecation → gerçek carrier/label entegrasyonu.
- Reverse shipment gerçek carrier label automation.
- Reverse shipment SLA + maliyet muhasebesi.
- Yüksek-maliyetli carrier override / manuel ücret / force-cancel-complete için SUPER_ADMIN istisna yönetimi.

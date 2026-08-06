# ADR-273 — Fast Refund Controls (TODO-172)

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #185 merge `14fbb8c`). CI (lint·test·build) yeşil; merge
commit (squash/rebase yok). Deploy: `prisma migrate deploy` (no pending — smoke'ta uygulanmıştı) + api-gateway
& store-admin-web main'den rebuild/recreate (`--no-deps --force-recreate`; storefront/worker/admin-web/postgres/
redis/volume DOKUNULMADI). Post-deploy smoke (deployed :4000) PASS: positive (AWAITING_SHIPMENT happy → OrderRefund
SUCCEEDED → COMPLETED; string wire; yapısal eventType/metadata) + negatifler (SUPPORT 403 · number PATCH 400 ·
stale 409 · cross-store 404 · limit-exceeded 409 · duplicate 409). İzole fixture temizlendi; production DB pristine.

**İlişkili:** [ADR-269](ADR-269-returns-authority-and-lifecycle.md) (Returns Foundation),
[ADR-272](ADR-272-refund-ledger-and-payment-reversal.md) (Refund Ledger — semantiği KORUNDU),
TODO-171 (Return Decision Flow Faz 1), `docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md` (§ PR2 / K3).

**Kapsam dışı:** Marketplace, Gift Card/Store Credit, Social Login, Reverse Shipment (PR3), gerçek
online provider refund transportu.

---

## Bağlam

TODO-171 (Return Decision Flow) admin'in yalnız gerçek kararları vermesini sağladı ama her iade hâlâ
teslim alma + inceleme adımlarından geçmek zorundaydı. Düşük-değerli veya güven-öncelikli iadelerde
mağaza, ürünü beklemeden/incelemeden müşteriye doğrudan para iadesi yapmak isteyebilir. Bu, finansal ve
fraud riski taşır; bu yüzden **permission + store-configurable limit + zorunlu gerekçe + audit** ile
sınırlanmış kontrollü bir "Hızlı iade" akışı gerekir.

Mevcut yetki modeli **rol-tabanlıdır** (granular `RETURN_*` permission tablosu YOK): iki rol enum'u
(`PlatformUserRole` = SUPER_ADMIN/SUPPORT_ADMIN, `StoreUserRole`). Refund `manual-complete` ucunda
"AYRI güçlü yetki = SUPER_ADMIN" için `requireStoreSuperAdmin` deseni zaten mevcut.

## Karar

### 1. Permission — `RETURN_FAST_REFUND` = SUPER_ADMIN role-gate (yeni tablo YOK)
Mevcut rol-tabanlı yetki sistemi **reuse** edildi; paralel bir permission tablosu kurulmadı. Fast Refund
ucu `requireStoreSuperAdmin` guard'ıyla korunur (refund manual-complete deseninin birebir mirror'ı;
store scope + cross-store 404 `requireStorePlatformAdmin`'den, SUPER_ADMIN daraltması guard'da). SUPPORT_ADMIN
→ 403. Backend-enforced; UI gizlemesi tek başına yeterli değildir. Fast Refund, iade domenine ilk
granular yetkiyi getirir (gelecekte approve/reject rol ayrımı + yüksek-tutar çift onay değerlendirilebilir).

### 2. Store-config = StoreSettings additive alanları (ayrı return-config tablosu YOK)
- `fastRefundEnabled Boolean @default(false)` — false: UI gizli + backend reddeder.
- `fastRefundMaxAmountMinor BigInt?` — **null = hızlı iade KAPALI (sınırsız DEĞİL)**; limit set edilene
  kadar aksiyon reddedilir. Şemadaki ilk BigInt kolonu (mevcut para alanları INTEGER minor-unit
  konvansiyonu). **API kontratında KANONİK ONDALIK STRING olarak taşınır** (`Number(bigint)`/`parseInt`
  precision kaybı ve `JSON.stringify` BigInt hatası önlenir; 2^53 üstü korunur). Ortak güvenli helper
  `@commerce-os/utils` (`parseMinorString`/`minorToCanonicalString`/`compareMinorStrings`/`formatMinorMoney`
  — hepsi BigInt tabanlı, **float YOK**). Aynı string sözleşme fast-refund-context tutarları için de
  geçerli (`refundAmountMinor`/`limitMinor`/`orderTotalMinor` string). Server string→BigInt doğrular
  (non-negatif, kanonik regex); client yalnız display/karşılaştırma için güvenli BigInt helper kullanır.
- `fastRefundCurrency String?` — null: limit sipariş para biriminde yorumlanır; set edilirse sipariş
  para birimiyle **birebir eşleşmeli** (aksi `FAST_REFUND_CURRENCY_MISMATCH`, normal akışa yönlendir).
- Fast Refund ayarlarını yalnız **SUPER_ADMIN** düzenler (PATCH `/settings` route-seviyesi guard;
  aksiyonla aynı yetki sınıfı). Ayar değişiklikleri auditlenir (`AuditLog.metadata.fields`).
- Mevcut store'larda özellik OTOMATİK AÇILMAZ (default kapalı).

### 3. Kaynak durumlar — AWAITING_SHIPMENT + RECEIVED (APPROVED ve RETURN_SHIPPED hariç)
Faz 1'de approve **aynı tx'te otomatik AWAITING_SHIPMENT'e** ilerler (BUG-RETURN-DEEPLINK düzeltmesi) —
iade APPROVED'de dinlenmez. "Onaylandı, henüz teslim alınmadı"nın gerçek kaynak durumu bu yüzden
**AWAITING_SHIPMENT**'tir. RETURN_SHIPPED (ürün yolda) izinli DEĞİLDİR: yoldayken iade ayrı ve daha
riskli bir ürün kararıdır.
- **AWAITING_SHIPMENT** → skippedSteps `[CUSTOMER_RETURN_SHIPMENT, STORE_RECEIPT, INSPECTION]`.
- **RECEIVED** → skippedSteps `[INSPECTION]`.

Bu geçişler state-machine tablosunda (`RETURN_TRANSITIONS`) **kasıtlı olarak YOKTUR**;
`evaluateReturnTransition` çağrılmaz. Fast Refund, kendi açık-allowlist'li (`FAST_REFUND_SOURCE_STATUSES`)
**yetkilendirilmiş bir bypass**'tır. Aksi halde generic `/transition` bu kenarı permission/limit atlayarak
açar ve para hareketi olmadan REFUND_PENDING üretirdi (Faz 1'de yapısal olarak engellenen "sessiz
tutarsızlık"). Fast Refund tek meşru giriş noktasıdır.

### 4. Orchestration — tek admin aksiyonu, iki-aşamalı (initiateRefund REUSE)
Tek UI aksiyonu "Hızlı iade yap". Backend:
1. permission (`requireStoreSuperAdmin`),
2. `startFastRefundToRefundPending` (tek tx): kaynak/çözüm/intent/limit/currency saf uygunluk +
   optimistic **version-guard'lı** updateMany → REFUND_PENDING + append-only history YAPISAL alanlarla
   (`eventType = RETURN_FAST_REFUND_STARTED` + `metadata` Json: sourceStatus/skippedSteps/amountMinor/
   limitMinor/reason/permission; `note` yalnız insan-okur). Domain sorgusu (son-90-gün sayımı) note
   substring'e DEĞİL, exact `eventType`'a dayanır (ReturnStatusHistory'ye additive `eventType`/`metadata`
   kolonları + `[storeId, eventType, createdAt]` index eklendi),
3. `AuditLog` `return.fast_refund.started` (storeId/actorId/amount/limit/skippedSteps/reason),
4. tx **commit sonrası** `initiateRefund` (TODO-170 otoritesi; provider I/O asla DB-tx içinde değil),
5. sonuç mevcut OrderRefund lifecycle'ına girer; `SUCCEEDED` → otomatik COMPLETED.

**Idempotent:** çift tıklama → ikinci çağrı durum artık kaynak-durum olmadığından `FAST_REFUND_INVALID_STATE`
veya `VERSION_CONFLICT`; ayrıca `initiateRefund`'ın advisory-lock + active-guard'ı duplicate OrderRefund'u
önler. **Gerçek refund (OrderRefund SUCCEEDED) olmadan ReturnRequest COMPLETED olmaz** (provider async
red → FAILED ledger + REFUND_PENDING korunur, retry mümkün; başlatma 200 ama COMPLETED olmaz).

Tutar/currency **sunucu-otoriter** (RefundIntent + Order.currency); client tutar/limit göndermez (şemada
yok, gönderilse yok sayılır). Limit karşılaştırması: `refundTotalMinor <= fastRefundMaxAmountMinor` (sınır
dahil); aşımda `FAST_REFUND_LIMIT_EXCEEDED` (409) → normal akış.

### 5. Risk görünürlüğü — bounded summary (fraud scoring YOK)
`GET /returns/:id/fast-refund-context` (herhangi platform admin okur; `permitted` = viewer SUPER_ADMIN):
refund tutarı, sipariş toplamı, müşteri sipariş/iade sayısı, son 90 gün hızlı iade sayısı (ReturnStatusHistory
marker sorgusu — yeni kolon yok), teslim/inceleme durumu, atlanan adımlar, uygunluk (eligible + reasonCode).
UI confirmation modalı bunu gösterir; limit aşımında CTA gizlenmez, neden + "Normal iade akışına devam edin"
gösterilir.

### 6. Customer UX — değişmedi
Müşteri tarafında "fast refund" teknik etiketi YOK. Mevcut maskeli refund durumları (TODO-170: Para iadesi
başlatıldı/işleniyor/tamamlandı + tutar + tarih) değişmeden akar. İç audit gerekçesi müşteriye sızmaz.

## Sonuçlar

- Kontrollü, düşük-riskli hızlı iade; finansal otorite (TODO-170) ve state guard'ları korunur.
- İlk granular return-permission; ileride genişletilebilir.
- Migration: iki additive migration (geri uyumlu, default kapalı): `20260807090000_todo172_fast_refund_controls`
  (StoreSettings 3 kolon) + `20260807120000_todo172_return_history_structured_metadata` (ReturnStatusHistory
  `eventType`/`metadata` + index).
- **Gelecek (PLANNED):** Reverse Shipment (PR3), yüksek-tutar çift onay, fraud scoring, per-role return
  permissions.

## Ship Hardening (2026-08-07) — üç blocker kapatıldı

1. **BigInt finansal serialization:** `Number(bigint)`/`parseInt` yerine **kanonik ondalık string** kontrat
   + ortak BigInt-tabanlı `@commerce-os/utils` money helper (float YOK). TD-194 CLOSED (güvenli sözleşme
   artık borç değil). Test: 0/eşit/üstü/`MAX_SAFE_INTEGER`+1/invalid/negative/leading-zero/round-trip
   (`packages/utils/test/money.test.ts`).
2. **Structured history metadata:** note-JSON substring yerine `eventType` (exact) + `metadata` (Json)
   kolonları; domain sorgusu artık serbest-metne bağlı değil.
3. **Flaky store-admin testleri (KÖK NEDEN):** `userEvent` varsayılan `delay: 0` her tuşta bir
   `setTimeout(0)` macrotask planlar; en ağır iki form akışı (~67 tuş) tam-suite fork-oversubscription
   altında 5000ms test timeout'unu aşıyordu. Fix (maske DEĞİL): (a) o iki dosyada
   `userEvent.setup({ delay: null })` (async waitFor/findBy assertion'ları güvenli); (b) `apps/store-admin-web/
   vitest.config.ts` havuz sınırı `maxForks = çekirdek−2` (event-loop başı-boşluğu; zamanlama düzeltmesi).
   Ayrıca `products-form-primary-category` senkron-assertion latent race'i `findByText` (async) ile kalıcı
   giderildi. Doğrulama: store-admin suite arka arkaya 5× tam yeşil.

## Test / doğrulama

- Saf uygunluk: 17 birim (`returns-fast-refund-pure.test.ts`).
- Gerçek-DB orchestration: 20 entegrasyon (`returns-fast-refund.integration.test.ts`) — permission
  (SUPER_ADMIN/SUPPORT_ADMIN/cross-store), settings (disabled/null/eşit/aşan/currency), kaynak durum
  (AWAITING_SHIPMENT/RECEIVED izinli; REQUESTED/RETURN_SHIPPED/duplicate reddi), orchestration (başarı/
  provider-decline/çift-tıklama/stale), security (client tutar yok sayılır/reason zorunlu), risk context.
- Contracts, gateway suite, store-admin suite yeşil. Browser/HTTP smoke: izole fixture (bkz. OPERATIONS).

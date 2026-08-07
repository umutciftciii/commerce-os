# İade Akışı Sadeleştirme — Revize Tasarım & Implementasyon Planı

**Tarih:** 2026-08-06
**Durum:** Faz 1 (PR1) **CLOSED & DEPLOYED (PR #183)** (2026-08-06) — kod tamamlandı, tüm review temiz, 2396
test yeşil; **commit/push/PR/merge/deploy YOK**, migration YOK (K2). **PR2 (Fast Refund Controls / TODO-172)
CLOSED & DEPLOYED (2026-08-07; ADR-273; PR #185)** — kaynak durumlar **AWAITING_SHIPMENT + RECEIVED**
(APPROVED Faz 1'de geçici/ulaşılamaz olduğundan allowlist dışı; kullanıcı kararı 2026-08-07), SUPER_ADMIN
role-gate, StoreSettings 3 additive alan, yetkilendirilmiş bypass + `initiateRefund` REUSE, risk context,
iki additive migration. **Ship-hardening:** BigInt→kanonik string kontrat (float YOK; TD-194 CLOSED),
yapısal history `eventType`/`metadata`, flaky store-admin kök-neden fix (5× yeşil; TD-199 CLOSED). Saf 17 +
gerçek-DB 20 + utils money test yeşil. **PR3 (Reverse Shipment / TODO-173) CLOSED & DEPLOYED** (PR #188 `3f01ccc`)
(2026-08-07; ADR-274 · `docs/analysis/REVERSE-SHIPMENT.md`) — ayrı disposition domain'i (K1 düzeltmesi:
`ReturnRestockDecision` GENİŞLETİLMEDİ), `STORE_RETURN_TO_CUSTOMER`-only (K2), `requireStoreAdmin` (K3),
`Shipment` REUSE + provider config REUSE (K5); direction-aware projeksiyon izolasyonu; additive migration
replay ✓ + gerçek-DB concurrency + 20 yeni test; tam gate yeşil (2453). Commit/deploy YOK. K1–K4 kararlandı
2026-08-06, K1/K5 rafine 2026-08-07 (bkz. §12 + DECISIONS.md K4 düzeltmesi).
**İlgili:** TODO-169 (Returns Foundation), TODO-170 (Refund Ledger — semantiği KORUNUR, dokunulmadı),
TODO-171 (Faz 1 roadmap kaydı), ADR-269, ADR-270, ADR-272, TD-FR-7
**Kapsam dışı:** Marketplace, Gift Card/Store Credit, Social Login, gerçek online provider refund transportu

> Bu belge, dört yüzeyde yürütülen kanıtlı kod denetimine (state-machine · refund
> lifecycle · shipment/inspection · finansal projeksiyon) dayanır. Dosya:satır
> referansları o denetimden gelir ve iddiaları doğrular.

---

## 1. Amaç

- Admin yalnız **gerçek kararları** versin; gereksiz "ilerlet" tıkları kalksın.
- Refund gerçekleşmeden iadenin **sessizce kapanması yapısal olarak engellensin**.
- **İnceleme = karar merkezi** olsun (kalem/adet bazlı; kabul → refund, red → gerekçe).
- Gerçekleşen refund **tüm finansal yüzeylerde** görünsün.
- Reddedilen ürünlerin müşteriye geri gönderilmesi için **güvenli ters-kargo temeli**.

## 2. Kanıtlı denetim — mevcut akışın kök nedenleri

### 2.1 "Kapat" tuzağı (R000001) — açık ve korumasız
- `REFUND_PENDING → CLOSED` state-machine'de **izinli ve guard'sız** ADMIN geçişi
  (`returns/status-map.ts:49`). `evaluateReturnTransition` yalnız aktör/terminal
  kontrolü yapar, "refund settled mı?" sormaz.
- Admin `POST /returns/:id/transition {targetStatus:"CLOSED"}` (`returns/routes-admin.ts:177-212`)
  → `applyReturnTransition(..., "CLOSED", ADMIN)` (`returns/service.ts:400-467`).
- CLOSED, `TERMINAL_NON_REFUND_STATUSES` içinde (`service.ts:41-46`) → R1 mantığı
  `cancelPendingRefundIntent` çağırır (`service.ts:457-463`); reason =
  `"Return CLOSED: refund not settled."` (`service.ts:461`).
- `refundIntent.updateMany({where:{status:"PENDING"}, data:{status:"CANCELLED"}})`
  (`service.ts:53-63`). `initiateRefund` hiç çağrılmadığı için **OrderRefund satırı
  oluşmaz**, `reprojectOrderPaymentStatus` tetiklenmez → `Order.paymentStatus` **PAID
  kalır** (`refunds/service.ts:112-131`). Talep CLOSED (terminal) → refund artık
  başlatılamaz. **Sessiz finansal tutarsızlık.** (Gerçek vaka: OS-000004/R000001,
  DB'de doğrulandı — intent CANCELLED, ledger boş, paymentStatus PAID.)
- Frontend: "Kapat" butonu `canCloseReturn = REFUND_PENDING || REPLACEMENT_PENDING ||
  COMPLETED` (`store-admin-web/.../orders/order-shared.ts:237-238`) → `REFUND_PENDING`'de
  görünür (`page.tsx:264-278`); gerçek iade adımı ise ayrı panelde (`refund-panel.tsx:224-226`).

### 2.2 Zaten mevcut otomasyonlar (korunacak, yeniden yapılmayacak)
- `APPROVED/PARTIALLY_APPROVED → AWAITING_SHIPMENT` **zaten otomatik**, aynı tx
  (`returns/routes-admin.ts:270-301`). Ayrı "Gönderim bekleniyor" butonu artıktır.
- `REFUND_PENDING → COMPLETED` **zaten otomatik**: refund SUCCEEDED → `tryCompleteReturn`
  Σ SUCCEEDED ≥ intentTotal ise ilerletir, history actor SYSTEM (`refunds/service.ts:137-180`).
- **İki-aşamalı refund orchestration zaten var**: `initiateRefund` decision tx'i
  (advisory lock + cap invariant + OrderRefund PENDING + RefundIntent CONSUMED) commit
  eder; provider I/O **transaction dışında** kilitsiz çalışır; sonuç `applyOutcome`
  ayrı tx'inde persist edilir (`refunds/service.ts:372-506`). Idempotency çift-katmanlı
  (`@@unique idempotencyKey` + `@@unique provider/providerRefundId`).

### 2.3 Manuel/atık noktalar
- `REQUESTED → UNDER_REVIEW` manuel opsiyonel ("İncelemeye al", `canReviewReturn`);
  approve zaten REQUESTED'ten yapılabilir → ara adım atıl.
- `COMPLETED → CLOSED` manuel arşivleme (kaldırılacak — bkz. 3.1).
- Ücret Özeti'nde refund satırı **yok** (`orders/sales-summary.ts:122-133`; UI
  `store-admin-web/.../orders/[id]/page.tsx:200-236`) — refund yalnız ayrı "İadeler"
  bölümünde ve intent-gate'li.
- **Order-level refund-context endpoint yazılmış ama UI'da hiç tüketilmiyor**
  (`GET /orders/:orderId/refund-context`, `refunds/routes-admin.ts:215-248`; client
  `getOrderRefundContext` sıfır tüketici). "Ortak projeksiyon" hazır, sadece bağlı değil.
- **Stale copy (dürüstlük hatası):** 3 yüzeyde hâlâ "gerçek refund TODO-170 / tutar
  raporlanmaz" yazıyor (admin order detail `page.tsx:378-379`, storefront order detail,
  finance `reports/page.tsx:361`) — TODO-170 kapandı.

## 3. Revize ürün kararları

### 3.1 `COMPLETED` terminal olur
- Refund SUCCEEDED → ReturnRequest `COMPLETED` (zaten böyle). **Otomatik COMPLETED→CLOSED
  YAPILMAZ.** Yeni akışta `CLOSED` **üretilmez**.
- `CLOSED` yalnız legacy kayıtlar için okunur kalır (mevcut CLOSED iadeler bozulmaz).
- Admin UI'daki manuel **"Kapat" aksiyonu tamamen kaldırılır**.
- Backend: `REFUND_PENDING → CLOSED` ve `COMPLETED → CLOSED` **admin route yolu kapatılır**
  (guard). CLOSED, state-machine tablosunda kalabilir ama admin aktörüne kapatılır.

### 3.2 `REQUESTED` sahte otomatik ilerlemez
- Talep `REQUESTED` kalır. "İncelemeye al" butonu kaldırılır; admin doğrudan
  **Onayla / Reddet** görür. Müşteriye admin görmeden "incelemede" gösterilmez.
- **Review başlangıcı = history event (K2, kolon YOK):** İlk gerçek admin kararında
  (approve/reject transaction'ı içinde) tek bir append-only `RETURN_REVIEW_STARTED`
  event yazılır — actor **ADMIN**, metadata `{ action:"RETURN_REVIEW_STARTED",
  sourceStatus, decisionType, platformUserId }`. İlk karar anı = event `createdAt`.
  Aynı talepte ikinci kez üretilmez (idempotent). Transaction rollback olursa event de
  rollback olur. Projection gerekirse ilk `RETURN_REVIEW_STARTED` event'inden türetir.
  Ayrı `reviewStartedAt` kolonu / ikinci tarih otoritesi **oluşturulmaz**.

### 3.3 İnceleme = tek karar merkezi (kalem/adet bazlı)
- İnceleme kalem/adet bazlı kalır (mevcut: `conditionStatus`, `inspectionResult`,
  `restockDecision`, `approvedQuantity`/`rejectedQuantity` — `schema.prisma:5129-5156`).
- Her ReturnItem quantity için: **kabul (refund)** veya **red**; stok kararı; kondisyon;
  red için zorunlu gerekçe.
- **Faz 1 kapsamı (K1):**
  - ReturnItem seviyesinde `approvedQuantity` / `rejectedQuantity` **net kaydedilir**.
  - Kabul edilen quantity refund akışına girer.
  - Reddedilen quantity refund hesabına **dahil edilmez**.
  - Kısmi kabul/red **finansal projeksiyonda doğru ayrılır** (refund yalnız kabul edilen
    adet üzerinden).
  - Reddedilen quantity için **bağımsız disposition state'i veya ters-kargo
    oluşturulmaz.** Faz 1, yeni bir ReturnItem state machine ile büyütülmez.
- **Faz 3'e bırakılan (K1):** item-level red disposition · `STORE_RETURN_TO_CUSTOMER` ·
  `returnItemId + quantity` bağlantısı · duplicate reverse-shipment guard · müşteri
  tracking · normal fulfillment ve stoktan bağımsızlık. (Bugünkü sınır: `REJECTED` tüm
  talebi kapsıyor — `routes-admin.ts:215-233`; kalem-bağımsız red Faz 3 modelidir.)

### 3.4 Tek UI aksiyonu, iki-aşamalı orchestration
- "İadeyi yap" admin'e tek aksiyon görünür; arkada:
  1. inspection decision transaction'da kaydedilir,
  2. ReturnRequest `REFUND_PENDING`,
  3. RefundIntent doğrulanır,
  4. OrderRefund PENDING oluşturulur / intent CONSUME edilir,
  5. transaction **commit**,
  6. provider/manual execution transaction **dışında** başlatılır,
  7. sonuç ayrı lifecycle ile işlenir.
- Bu akış **zaten `initiateRefund`'da mevcut** (2.2); yeni iş, inspection "kabul" kararını
  bu tek aksiyona bağlamak (INSPECTED→REFUND_PENDING + initiateRefund birleşik UI).
- Kurallar: idempotent, optimistic version guard, provider çağrısı uzun tx içinde değil,
  FAILED'da ledger/history korunur, timeout'ta kör retry yok. (Denetim: hepsi sağlanıyor.)

### 3.5 Onay sonrası otomasyon (koru)
- `APPROVED → AWAITING_SHIPMENT` otomatik (zaten var), actor SYSTEM, müşteri ship-back
  talimatını hemen görür. Ayrı "Gönderim bekleniyor" butonu UI'dan kaldırılır.

### 3.6 Refund tamamlanmadan kapanış yok
- RefundIntent PENDING/CONSUMED tek başına tamamlanmış sayılmaz; yalnız **OrderRefund
  SUCCEEDED** refund çözümünü tamamlar (zaten `isCompletionAllowed`, `service.ts:364-387`).
- Manuel refund yalnız güçlü yetki (`requireStoreSuperAdmin`) + reference + note ile
  SUCCEEDED olur (zaten `refunds/routes-admin.ts:319-321`, `service.ts:570-613`).
- FAILED/PROCESSING'de ReturnRequest `REFUND_PENDING` kalır. **Refund'suz sessiz kapatma
  yolu yok** (3.1 guard'ı ile).

## 4. Fazlama ve PR sınırları

> Git kuralı: bu belge onaylanana ve her faz uygulanana kadar **commit/push/PR/merge/
> deploy YOK**. Her faz: implementasyon → tam gate (test/build/lint/typecheck) → gerçek
> browser/HTTP smoke → DUR.

### PR 1 — Return Decision Flow Simplification (+ finansal görünürlük)
- "İncelemeye al" kaldır; `REQUESTED` koru; additive `reviewStartedAt`.
- Admin doğrudan onay/red; onay sonrası otomatik `AWAITING_SHIPMENT` (koru).
- İnceleme kalem/adet karar merkezi; olumlu → refund orchestration (tek aksiyon);
  olumsuz → zorunlu gerekçe ile `REJECTED`.
- Manuel "Kapat" butonunu kaldır; `REFUND_PENDING/COMPLETED → CLOSED` admin yolunu
  guard ile kapat; `COMPLETED` terminal.
- **Finansal görünürlük:** atıl `order-level refund-context`'i Ücret Özeti'ne bağla;
  "Gerçekleşen iade (−)" + "İade sonrası net tahsilat" satırları; stale copy'leri
  düzelt (3 dosya). Ortak `computeNetCollectedMinor(captured, succeeded)` saf fonksiyonu.
- Bağımsız değer taşır; ters-kargo modelini gerektirmez.

### PR 2 — Fast Refund Controls
- Yeni permission `RETURN_FAST_REFUND`; varsayılan yalnız `SUPER_ADMIN`.
- **Store-config = StoreSettings (K3), additive alanlar:**
  - `fastRefundEnabled Boolean @default(false)`
  - `fastRefundMaxAmountMinor BigInt?` (minor-unit; **client'ta hesaplanmaz**)
  - gerekirse `fastRefundCurrency String?` (yalnız gerçek multi-currency ihtiyacında)
  - Kurallar: refund currency, store/order currency ile birebir eşleşmeli;
    `fastRefundEnabled=false` → aksiyon görünmez + backend 403/409; **limit `null` →
    hızlı iade KAPALI** (sınırsız yorumlanmaz); limit aşılırsa normal iade akışına
    yönlenir; StoreSettings güncellemesi auditlenir; yalnız yetkili değiştirir. Ayrı
    return-config tablosu kurulmaz.
- Zorunlu gerekçe; audit; atlanan adımlar (teslim/inceleme) history'ye açıkça yazılır;
  müşteri/sipariş risk özeti; tekrar eden hızlı iadeler görünür.
- İzin verilen kaynak durumlar: `APPROVED` (tercihen `RECEIVED`).
- UI onayı: "Teslim alma ve inceleme adımları atlanarak müşteriye doğrudan para iadesi
  yapılacak."
- Not: İade yetkisi bugün kaba-taneli (yalnız platform rolü; `RETURN_*` permission yok
  — `server.ts:7599-7607`). Fast refund, ilk granular return-permission'ı getirir.

### PR 3 — Reverse Shipment
- **Direction enum baştan üç yönlü (K4)** — genel "OUTBOUND" belirsiz ismi
  KULLANILMAZ; yön domain dilinde açık:
  - `OUTBOUND_TO_CUSTOMER` — normal sipariş gönderileri (mevcut satırlar buraya migrate)
  - `CUSTOMER_RETURN_TO_STORE` — müşterinin iade için mağazaya gönderdiği kargo
  - `STORE_RETURN_TO_CUSTOMER` — reddedilen ürünün mağazadan müşteriye geri gönderimi
- Additive migration: `Shipment.direction ShipmentDirection @default(OUTBOUND_TO_CUSTOMER)`
  + opsiyonel `returnRequestId?`, `returnItemId?` (nullable FK). Mevcut satırlar
  `OUTBOUND_TO_CUSTOMER` — geri uyumlu.
- Disposition kararı: red edilen adet için admin seçer — müşteriye geri gönder / imha /
  tedarikçiye gönder / mağazada tut / iletişim gerekli. `ReturnRestockDecision`'a
  `STORE_RETURN_TO_CUSTOMER` eklenir (`RETURN_TO_VENDOR`, `DISPOSE` zaten var).
- **Her direction için ayrı davranış (K4):**
  - create guard **direction-aware** çalışır; duplicate kontrolü direction-aware.
  - sipariş **fulfillment projeksiyonu yalnız `OUTBOUND_TO_CUSTOMER`** üzerinden.
  - müşteri iade tracking'i `CUSTOMER_RETURN_TO_STORE` üzerinden.
  - ters gönderi tracking'i `STORE_RETURN_TO_CUSTOMER` üzerinden.
  - stok hareketi direction'a göre açıkça ayrılır.
  - normal teslimat rozeti ve sipariş shipment KPI'ları reverse shipment'larla kirlenmez.
- Ters gönderi (`STORE_RETURN_TO_CUSTOMER`): returnRequestId/returnItemId ile bağlı;
  yalnız reddedilen quantity kadar; duplicate guard; normal order fulfillment status'unu
  değiştirmez; stok düşmez; refund ledger ile karışmaz; customer address snapshot
  (mevcut recipient türetme, `routes.ts:1086`).
- **Create-guard gevşetmesi:** `findActiveShipment` (`shipping/routes.ts:831-853`)
  direction-aware yapılır (yalnız aynı yöndeki aktif gönderiyi engelle) ki DELIVERED bir
  `OUTBOUND_TO_CUSTOMER` gönderisi yeni bir ters gönderiyi bloklamasın (409).
- **Projeksiyon filtreleri (kritik):** üç yüzey direction-aware yapılır — müşteri tracking
  (`customers/index.ts:1025`), sipariş rozeti (`customers/index.ts:914`), admin liste/KPI
  (`shipping/routes.ts:1386`).
- Shipment state-machine yeniden yazılmaz (mevcut durum akışı her yönde geçerli).
- Not: Mevcut müşteri iade kargosu (RETURN_SHIPPED tracking) bugün Shipment entity'si
  değil; `CUSTOMER_RETURN_TO_STORE` bunu Faz 3'te modele bağlama fırsatı — Faz 3
  planında kapsam netleştirilir.

## 5. Finansal görünürlük (ortak projeksiyon)

Tek kaynak = **order-level refund-context** (`loadOrderMoney` + refund-context endpoint,
`refunds/routes-admin.ts:96-113,215-248`) — `captured / succeeded / active /
refundableRemaining` + refund satırlarını zaten döndürür.

**Yüzeyler → figürler:**
| Yüzey | Figürler | Kaynak |
|---|---|---|
| Admin sipariş detayı Ücret Özeti | orijinal toplam · gerçekleşen iade (−) · iade sonrası net tahsilat · kalan refundable | order refund-context (bağlanacak) |
| Admin iade detayı (Refund Panel) | captured / önceden iade / refundable + intent kırılımı | return refund-context (mevcut) |
| Müşteri sipariş/iade | maskeli gerçekleşen iade | buildCustomerRefundSummary + ReturnOrderSummary (mevcut) |
| Sipariş listesi | REFUNDED / PARTIALLY_REFUNDED rozeti | resolveRefundedPaymentStatus (mevcut) |
| Finans raporu | SUCCEEDED refund tutarı (net'e gömülü + açık KPI) | finance/data.ts (mevcut; KPI ekle) |

**Kurallar:** yalnız `OrderRefund SUCCEEDED` gerçekleşen finansal iade; RefundIntent
finansal figürlerde kullanılmaz; PENDING/PROCESSING gelirden düşmez; inclusive KDV iki
kez düşmez (denetim: `metrics.ts:186-189` doğru); currency izole; partial/full doğru;
`refundAmountsSupported=true` korunur. Ayrı gösterilecek figürler: orijinal toplam /
bekleyen (PENDING) / işlenen (PROCESSING) / gerçekleşen (SUCCEEDED) / kalan net tahsilat /
kalan refundable. (Denetim: 6 figürden 4 hesaplanıyor, PROCESSING ayrıştırılacak,
"iade sonrası net tahsilat" yeni türetilecek.)

## 6. State-machine ve backend guard'ları (kodla enforce)
- REQUESTED → doğrudan approve/reject.
- APPROVED → sistem otomatik AWAITING_SHIPMENT (koru).
- **REFUND_PENDING → CLOSED admin yolu YASAK** (yeni guard; `REFUND_UNSETTLED` sentinel
  veya route-seviyesi ret). COMPLETED → CLOSED admin yolu da kapalı.
- COMPLETED terminal, immutable.
- Refund çözümünde SUCCEEDED OrderRefund olmadan COMPLETED yasak (zaten
  `isCompletionAllowed`).
- Replacement fulfillment olmadan COMPLETED yasak (zaten false).
- Fast refund permission/limit kontrolü (PR2).
- Reverse shipment yalnız rejected quantity; duplicate reverse yasak (PR3).
- Partial decision toplamları request quantity'yi aşamaz (zaten
  `INVALID_APPROVED_QUANTITY`).
- Optimistic `expectedVersion` zorunlu (zaten); tüm otomatik geçişler append-only history.

## 7. Migration ihtiyacı
- **PR1:** **Şema/migration YOK** (K2 — `reviewStartedAt` kolonu eklenmez; review
  başlangıcı append-only history event'i ile tutulur). Değişiklik salt kod + UI +
  finansal görünürlük bağlama.
- **PR2:** `StoreSettings`'e additive alanlar (K3): `fastRefundEnabled Boolean
  @default(false)`, `fastRefundMaxAmountMinor BigInt?`, (gerekirse) `fastRefundCurrency
  String?`. `RETURN_FAST_REFUND` permission kod-seviyesi rol modeliyle. Ayrı return-config
  tablosu yok.
- **PR3:** additive `Shipment.direction ShipmentDirection @default(OUTBOUND_TO_CUSTOMER)`
  + enum `{ OUTBOUND_TO_CUSTOMER, CUSTOMER_RETURN_TO_STORE, STORE_RETURN_TO_CUSTOMER }`
  (K4); opsiyonel `Shipment.returnRequestId?`, `returnItemId?` (nullable FK);
  `ReturnRestockDecision`'a `STORE_RETURN_TO_CUSTOMER` (`ALTER TYPE ADD VALUE` — ayrı
  migration adımı, aynı migration'da kullanılamaz). Hepsi nullable/default → geri uyumlu.
- Backfill yok; legacy kayıtlar (CLOSED iadeler dahil) korunur.

## 8. Test stratejisi
- **State-machine (saf):** REQUESTED→APPROVED/REJECTED; approve→auto AWAITING_SHIPMENT;
  REFUND_PENDING→CLOSED admin **yasak**; SUCCEEDED refund→COMPLETED; COMPLETED terminal;
  legacy CLOSED okunabilir.
- **Inspection orchestration:** full accept→refund; full reject; partial accept+reject;
  accepted quantity→intent/OrderRefund; rejected quantity refund'a girmez; provider
  failure decision'ı silmez; timeout duplicate refund üretmez.
- **Fast refund:** permission yok→403; limit üstü→409/validation; gerekçe zorunlu; audit;
  successful refund; duplicate idempotency.
- **Reverse shipment:** yalnız rejected quantity; duplicate guard; direction; normal
  fulfillment korunur; stok düşmez; customer tracking; cross-store 404.
- **Financial:** SUCCEEDED order summary'de görünür; PENDING/PROCESSING görünür ama netten
  düşmez; partial/full; Financial Reporting tutarlılığı; inclusive tax; currency isolation.

## 9. Browser/HTTP smoke (izole çok-kalemli fixture)
1) REQUESTED doğrudan Onayla/Reddet · 2) approve→auto AWAITING_SHIPMENT · 3) customer
tracking · 4) admin receive · 5) inspection · 6-7) bir quantity accept + bir quantity
reject · 8) accepted refund orchestration · 9) provider success · 10) COMPLETED · 11)
"Kapat" görünmüyor · 12) order summary refund satırı · 13) customer refund görünümü · 14)
Financial Reporting net düşüş · 15) fast refund permission/limit · 16) reverse shipment
creation · 17) customer reverse tracking · 18) duplicate guards · 19) stale version 409 ·
20) cross-store isolation. Responsive: 375/768/1024/1440. A11y: karar modalı focus trap,
quantity label'lı, status renk+metin, destructive confirmation, error summary/focus,
erişilebilir timeline. (Faz başına ilgili alt-küme.)

## 10. Dokümantasyon
- Bu spec ACCEPTED'a çekilir. Güncellenecek: ADR-269, ADR-272, ROADMAP, TODO,
  TECHNICAL_DEBT, OPERATIONS, DECISIONS, Returns analizi, Refund Ledger analizi,
  Shipment analizi. Yeni başlıklar: Return Decision Flow Simplification · Fast Refund
  Controls · Reverse Shipment · Return Financial Visibility. TODO-170 semantiği korunur;
  yeni TODO numaraları repo audit sonrası çakışmasız belirlenir.

## 11. Teknik borç / gelecek (denetimden)
- **TD:** PROCESSING refund'lar için otomatik reconcile scheduler yok (yalnız admin
  `refresh`). MOCK/manuel modda sorun değil; gerçek async provider gelince gerekli.
- **TD:** `RefundIntentStatus.PROCESSED` enum'da tanımlı ama hiç yazılmıyor (ölü durum).
- **TD:** İade yetkisi kaba-taneli; PR2 ilk granular permission'ı getirir, ileride
  approve/reject için de rol ayrımı + yüksek tutarda çift onay değerlendirilebilir.
- **TD:** `executeAutomatic` PROCESSING geçişi guard'sız bare update (pratikte deduped
  guard ile zararsız).

## 12. Kararlar (K1–K4, 2026-08-06 — çözüldü)
- **K1 → Faz 3.** Faz 1: ReturnItem `approvedQuantity`/`rejectedQuantity` net kayıt +
  kabul→refund + red refund'a girmez + kısmi finansal ayrım; reddedilen adet için
  bağımsız disposition/ters-kargo YOK. Item-level red disposition +
  `STORE_RETURN_TO_CUSTOMER` + returnItemId/quantity bağı + duplicate guard + müşteri
  tracking + fulfillment/stok bağımsızlığı Faz 3'te birlikte. Faz 1 yeni ReturnItem state
  machine ile büyütülmez.
- **K2 → Yalnız history event.** `RETURN_REVIEW_STARTED` append-only event (actor ADMIN;
  metadata action/sourceStatus/decisionType/platformUserId; idempotent; tx-bağlı rollback;
  ilk karar anı = createdAt). Kolon/ikinci tarih otoritesi yok.
- **K3 → StoreSettings.** `fastRefundEnabled` (default false) + `fastRefundMaxAmountMinor`
  (null = kapalı, sınırsız değil) + gerekirse `fastRefundCurrency`. Server-side; currency
  eşleşme; audit; ayrı return-config yok.
- **K4 → Üç yönlü enum baştan.** `OUTBOUND_TO_CUSTOMER` / `CUSTOMER_RETURN_TO_STORE` /
  `STORE_RETURN_TO_CUSTOMER`; direction-aware guard/duplicate/projeksiyon/stok; genel
  "OUTBOUND" kullanılmaz.

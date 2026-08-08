# TODO

## Yakin Isler

- **TODO-175 Refund Destination Choice — 🟡 IMPLEMENTED (gate green; PR açık)** (ADR-285/286; 2026-08-08). Müşteri iade/iptalinde geri ödemenin **orijinal ödeme yöntemine** mi yoksa **alışveriş bakiyesine** mi gideceğini seçebilir. **Ürün invariant'ları:** `STORE_CREDIT value cannot be converted to cash/original PSP refund.` + `Customer may voluntarily convert eligible externally-paid refund into Shopping Balance.` **Çekirdek model:** her refund `R`, kalan refundable havuzlara **oransal** olarak `Rc` (credit-origin → HER ZAMAN shopping balance restore) + `Re` (external-origin → müşteri seçer) bileşenlerine ayrılır (`refunds/destination-calc.ts`; BigInt ara matematik + safe-integer guard). **Şema (additive migration `20260808110000_todo175...`):** `RefundDestination` enum; `ReturnResolutionType += REFUND` (nötr; legacy `REFUND_TO_ORIGINAL_PAYMENT` korunur, `isRefundResolution`/`resolveEffectiveRefundDestination` ile map); `CustomerCreditLot.expiresAt` **nullable** (null=non-expiring refund-origin credit); `ReturnRequest.{refundDestination,SelectedBy=CUSTOMER,SelectedAt}` immutable snapshot; `OrderRefund.refundDestination`; `RefundExecutionMode += INTERNAL_CREDIT`; `CreditSourceType += ORDER_RETURN`; `CreditLedgerType += RETURN_CREDIT_RESTORE`. **Execution:** SHOPPING_BALANCE external legi = PSP çağrısı YOK → `OrderRefund` INTERNAL_CREDIT tx-içi SUCCEEDED + `issueCreditInTx(expiresAt=null, REFUND_RESTORE)`; ORIGINAL_PAYMENT = mevcut PSP akışı (Re tutarında); credit-origin `Rc` cancellation→`restoreCreditForOrderInTx` (expired no-revive korunur), return→`restoreCreditAmountForOrderInTx` (**expired original lot → cash'e çevirmeden yeni non-expiring reissue**, ADR-286). **İki-ledger completion:** `Σ SUCCEEDED OrderRefund + Σ return credit restore ≥ intent.total`. **Düzeltmeler:** (A) geçersiz hedef SESSIZ fallback YOK → `INVALID_DESTINATION`/`REFUND_DESTINATION_INVALID`; (B) `expiryDays=null` yalnız allowlisted refund-origin sistem yolu; (C) safe-integer BigInt money; (D) adoption rate paydası yalnız choice-eligible refund. **UI:** storefront cancel modal (koşullu "İade yöntemi" adımı + split confirm) + return wizard (REFUND + destination alt-seçimi) + İadelerim/Alışveriş Bakiyem (refund-origin copy, raw enum yok); store-admin return/cancellation detail (destination + INTERNAL_CREDIT allocation) + unified İadeler kolonu. **TDD:** 109 yeni/genişletilmiş TODO-175 test (pure allocation/expiry/provenance + integration cancellation×5/return×8/credit-restore×4/create×3/visibility×adoption; gerçek-DB, store/customer izolasyon). **Gate:** db:generate + fresh migration replay (throwaway DB) + existing DB upgrade + full workspace typecheck + lint 0 hata + targeted 109 + **workspace test Run1+Run2 (42/42 task; api-gateway 2652)** + build 27/27 + `git diff --check` temiz. **Real-env doğrulama:** worktree :4100/:3100 gerçek-auth izole fixture — mixed order cancel-eligibility gateway'den doğru split döndürdü (`externalRefundableMinor:70000` + `creditRestorableMinor:30000` + `offerOriginalPayment/Balance:true`) + `/me` auth; fixture FK-güvenli temizlendi (enterprise-demo PRISTINE). **Açık:** merge + prod deploy + tam 4-viewport UI browser click-through (ad-hoc kurulumda STORE_SLUG çözümleme quirk'i nedeniyle standart smoke harness'ında tamamlanmalı). Bkz. [ADR-285](adr/ADR-285-refund-destination-choice.md), [ADR-286](adr/ADR-286-refund-origin-non-expiring-credit.md), `docs/superpowers/specs/2026-08-08-todo-175-refund-destination-choice-design.md`.
- **TD-174B-1/2/3 Order Experience & Store Credit — order-detail kartı + raporlama + smoke — ✅ CLOSED & DEPLOYED** (PR #201 merge `ec5b248`; 2026-08-08). CI (lint·test·build) 5m18s PASS. Deploy: yeni migration YOK (şema değişmedi); docker `api-gateway`+`store-admin-web` main'den (`ec5b248`) rebuild+recreate (`--no-deps --force-recreate`; postgres/redis/worker/admin-web/**storefront-web DOKUNULMADI** — uptime'lar korundu) → 2 servis healthy. Post-deploy smoke (deployed :4000/:3002): api-gateway `/health` 200 · yeni uçlar `order-experience/orders/:id` + `order-experience/report` + `finance/credit-report` → **401** (wired + admin-gated, 404 DEĞİL) · store-admin `/order-experience` + `/finance/reports` → 307 (auth redirect). TODO-174B kapanışının 3 açık borcu; finansal çekirdek/FEFO ledger/PaymentAttempt semantiği/migration'lara DOKUNULMADI (yalnız additive read/UI). **TD-174B-1 (order-detail):** Store Admin sipariş detayında **Ödeme dağılımı** (BUG-CART-005 `buildPaymentAllocations` REUSE → serializeOrder additive `paymentAllocations`; STORE_CREDIT→"Mağaza bakiyesi", CARD→maskeli kart; toplam=captured invariant; ham PAN/enum sızmaz) + **Sipariş Deneyimi kartı** (rating/yorum/recovery durumu/atanan/tanımlanan goodwill + geri kazanım detayına köprü; tek-sipariş özet ucu `GET .../order-experience/orders/:orderId`, review yoksa 200+null fail-open). **TD-174B-2 (raporlama):** (a) Finans>Raporlar yeni **Alışveriş Bakiyesi** sekmesi (`GET .../finance/credit-report`): NOKTA-ANLIK outstanding liability (canlı lot Σ remaining, expiresAt>now) + dönem-içi issued/spent/restored/expired/recovery-goodwill/adjustments-net; tek para birimi (H-2 mixed-currency guard uyumlu). (b) Sipariş Deneyimi sayfası yeni **Geri kazanım raporu** (`GET .../order-experience/report`): puan trendi (zero-fill gün serisi) + ort. ilk temas / ort. çözüm süresi + ulaşma oranı + outcome dağılımı + goodwill; KPI grid'e goodwill kartı. Aralık çözümü finance date-range REUSE (bounded/tz-aware). **TD-174B-3 (smoke):** 4-viewport (375/768/1024/1440) gerçek-auth izole-fixture browser smoke — order-detail dağılım (Mağaza bakiyesi ₺300 + Visa ••••4242 ₺700 = ₺1000 invariant) + deneyim kartı (1★/Açık/goodwill ₺250) · credit raporu outstanding ₺1.729,36 = issued ₺10.555 − spent ₺8.825,64 (invariant) + recovery goodwill ₺250 · recovery raporu trend/timing · 4 viewport yatay taşma YOK · fixture FK-güvenli temizlendi (enterprise-demo PRISTINE 471). **TDD:** 6 yeni gerçek-DB test (getOrderExperienceForOrder + recoveryReport + creditReport; store-izolasyon dahil). **Gate:** db:generate + migration status temiz (şema değişmedi) + full workspace typecheck + lint 0 hata + workspace test Run1+Run2 (42/42 task; api-gateway 2598) + build 27/27 + `git diff --check` temiz. Yeni migration YOK. **TD-174B-1/2/3 RESOLVED**; Gift Card + storefront credit-used satırı hâlâ FUTURE.
- **BUG-CART-004 Checkout Store-Credit (Alışveriş Bakiyesi) UX — ✅ CLOSED & DEPLOYED** (PR #198; 2026-08-08). TODO-174B store credit checkout sonrası UX kusuru; kullanıcı bildirdi. **Belirti:** "Alışveriş bakiyemi kullan" seçili ama fiyata etki etmiyor + kontrol çok kötü konumda (ödeme kartının dibinde). **Kök neden:** toggle KOŞULSUZ render ediliyordu (bakiyeye bakmıyordu); bildiren müşterinin bakiyesi SIFIR (tüm lot CONSUMED) → etki etmemesi doğru ama UI iletmiyor; ayrıca bakiye>0'da bile özet etkiyi göstermiyordu (kredi ödeme yöntemi, sipariş anında uygulanır). **Backend/gateway allocation DOĞRU** (sorun tamamen UX). **Fix:** (1) kredi kontrolü YALNIZ bakiye>0'da gösterilir (0'da "seçili ama etkisiz" yanılgısı yok); checkout page `getShoppingBalance()` ile besler; (2) kontrol ödeme kartından **sipariş özetine** taşındı (prominent, para gösterilen yer); (3) "Alışveriş bakiyen ₺X" + işaretlenince CANLI "Alışveriş bakiyesi −₺Y" + **"Ödenecek ₺Z"** (Genel toplam SABİT, kredi indirim değil ödeme yöntemi); saf `computeShoppingCreditPreview` min(available,payable) gateway ADR-282 kuralını yansıtır; `CartSummaryView.grandTotalMinor` eklendi. **TDD:** credit-preview(5) + checkout-form-render(+2 gating). **Gate:** typecheck 0 · lint 0 · workspace test Run1+Run2 (storefront 564) · build 27/27 · diff-check temiz. **İzole browser smoke** (worktree :4100/:3100, gerçek commerce_os, izole müşteri ₺500 kredi): özet "Alışveriş bakiyen ₺500,00"+toggle · işaretle→Genel toplam ₺8.072,19 SABİT + "−₺500,00" + Ödenecek ₺7.572,19 · 0-bakiye müşteride kontrol HİÇ yok · HTTP checkout `useShoppingCredit:true`→lot 50000 ACTIVE→0 CONSUMED (gerçek tahsis) · fixture FK-güvenli temizlendi (enterprise-demo PRISTINE). Bkz. `docs/analysis/BUG-CART-004-checkout-store-credit-ux.md`.
- **BUG-CART-003 Variant Media / Coupon Repricing / Checkout Cart Identity — ✅ CLOSED & DEPLOYED** (PR #197; 2026-08-08). Persistent-cart (TODO-167) sonrası 3 regresyon; videoda doğrulandı (`EDM-SHO-0266` + `WELCOME10`). **BUG 1 (gateway):** sepet kapağı productId ile (position-0) çözülüyordu → varyantın renk/media eksenini yok sayıp yanlış renk thumbnail; fix saf `pickVariantCoverImage`+`buildCartVariantCoverUrlMap` (variantId-keyed; öncelik renk-görseli→ürün kapağı; Variant Media Engine ile tutarlı; N+1 yok). **BUG 2 (gateway wiring+storefront):** auth cart READ (`GET /customer/cart`→projectCart) `couponCode`'u motora geçirmiyordu (TD-174) → explicit kupon totals'i değiştirmiyordu; fix GET `?coupon/shippingOption/claimed` query threading + storefront resolver'ı kupon/kargo'yu taşır → anonim yolla AYNI reprice (stackability kuralı değişmedi). **BUG 3 (storefront):** `checkout/page.tsx` yalnız cookie okuyup "Sepetiniz boş" gösteriyordu (login-merge cookie'yi temizler); fix `resolveCheckoutView` auth-first (DB cart otoriter, cart sayfasıyla aynı) — UI guard'ı gizlenmedi. **TDD:** cart-variant-cover(7) + customer-cart-routes(+2) + cart-resolver(+4). **Gate:** typecheck 0 · lint 0 hata · workspace test Run1+Run2 (api-gateway 2443 · storefront 557) · build 27/27 · `git diff --check` temiz. **İzole browser smoke** (worktree :4100/:3100, gerçek commerce_os okundu, izole müşteri): BUG1 Gümüş `b99396`/Yeşil `733c8` renk-farklı · BUG2 %5(89.691)→WELCOME10 %10(179.382) cart+checkout reprice · BUG3 checkout ürün+kupon görünür, boş değil · responsive 375/768/1024/1440 · TODO-174B credit toggle sepet kimliğini bozmadan mevcut · fixture FK-güvenli temizlendi (enterprise-demo PRISTINE 471 ürün). **TD-174 KISMEN ÇÖZÜLDÜ** (kupon/kargo READ threading; cross-device persist future). Bkz. `docs/analysis/BUG-CART-003-variant-media-coupon-checkout.md`.
- **TODO-174B Order Experience Recovery Operations + Customer Shopping Balance — ✅ CLOSED & DEPLOYED** (PR #194 merge `fab4a43`; ADR-281…284; 2026-08-07). CI (lint·test·build) 6m3s PASS. Deploy: migration `20260807160000_todo174b...` deployed DB'de canlı ("schema up to date"; no pending); docker `api-gateway`+`storefront-web`+`store-admin-web` main'den rebuild+recreate (`--no-deps --force-recreate`; postgres/redis/worker/admin-web DOKUNULMADI) → 3 servis healthy. Post-deploy smoke (deployed :4000/:3000/:3002): api-gateway `/health` 200 · yeni admin uçları order-experience list/kpi + customer credit → 401 (wired + admin-gated, 404 DEĞİL) · yeni müşteri ucu customer balance → 401 (session-gated) · storefront `/account` 307 · store-admin `/order-experience` 307. `OrderExperienceReview` verisini gerçek operasyona dönüştürür + gerçek TL alışveriş bakiyesi (store credit) foundation ekler. **Recovery (F4):** `OrderRecoveryCase`/`OrderRecoveryActivity` (lifecycle + append-only history + version guard); 1-2★ review→AUTO case (atomik hook), 3★→manuel, 4-5★→yok; Store Admin `Müşteri Deneyimi > Sipariş Deneyimi` (liste [case opsiyonel] + KPI + case detay/lifecycle + goodwill credit modal); ProductReview/aggregate'e SIFIR dokunuş. **Store Credit (F1-F3):** 3-tablo lot-tabanlı FEFO immutable ledger (`CustomerCreditAccount`/`CustomerCreditLot`/`CustomerCreditLedgerEntry`; BigInt minor-money, advisory-lock + version guard + idempotency dedup; bakiye=Σ canlı lot remaining `expiresAt>now`); admin goodwill credit endpoint + `StoreSettings.maxGoodwillCreditPerActionMinor` policy (null=kapalı, SUPER_ADMIN override); expiry ZORUNLU (30/60/120/180 gün, lot-seviyesi, FEFO); expiry worker default-OFF (housekeeping; available zaten expiresAt>now ile doğru). **Checkout (F5):** STORE_CREDIT MANUAL PaymentAttempt (status PAID reuse; yeni status YOK) + Order snapshot; `useShoppingCredit` toggle → server `min(available,payable)` (kısmi giriş yok); tam-credit→PAID+SALE_COMMIT, kısmi→external kalan PSP'ye; storefront `Alışveriş Bakiyem` + hareket geçmişi (semantik-key TR/EN, raw enum yok). **Cancellation (F6):** credit kısmı bakiyeye restore (canlı lot revive; süresi geçmiş revive edilmez; idempotent), kart kısmı PSP'ye (`prepareCancellationRefund` STORE_CREDIT hariç). Migration additive `20260807160000_todo174b...` (dev+test DB uygulandı; fresh replay OK; drift temiz). **Gate:** db:generate + fresh replay + typecheck (turbo build 27/27) + lint (0 hata) + workspace test iki run yeşil (api-gateway 2563 · storefront 553 · store-admin 368 · +hepsi ~4000) + `git diff --check` temiz. Yeni testler: 14 saf FEFO/expiry + 11 credit ledger integration + 8 recovery + 5 checkout/cancellation (mixed split dahil). **Kapsam dışı (FUTURE):** Gift Card Purchase / Code Redemption (spec §13). Açık borç: TD-174B-1 (order-detail deneyim kartı + credit-used satırı), TD-174B-2 (gelişmiş credit reporting), TD-174B-3 (4-viewport browser smoke merge-öncesi). **TD-174A-1 RESOLVED** (admin görünürlük/recovery shipped).
- **TODO-174A Cancellation UX & Refund Visibility — ✅ CLOSED & DEPLOYED** (PR #192 merge `43f4e6b`; ADR-279/280; 2026-08-07). CI (lint·test·build) 6m2s PASS. Deploy: docker `api-gateway`+`storefront-web`+`store-admin-web` main'den rebuild+recreate (`--no-deps --force-recreate`; postgres/redis/worker/admin-web DOKUNULMADI); migration `20260807150000_todo174a...` deployed DB'de zaten canlı (no pending). Post-deploy smoke (deployed :4000, container-içi forge oturum): müşteri birleşik İadelerim (OS-000003 iptal SUCCEEDED + R000001 iade CLOSED) · order-experience OS-000003 uygun · admin birleşik 2 satır + KAYNAK filtresi (ORDER_CANCELLATION→1) · storefront :3000 / store-admin :3002 307 (auth redirect = ayakta). Forge oturumlar temizlendi (enterprise-demo pristine). TODO-174 sonrası 3 UX/ürün eksiği. **(1) Cancelled order review CTA:** iptal edilmiş (teslim EDİLMEMİŞ) siparişte ürün-review CTA'sı disabled kalıyordu → ayrı `OrderExperienceReview` domaini (ProductReview/aggregate'e HİÇ dokunmaz; `(storeId,orderId,customerId)` unique = duplicate koruması); vitrin CTA "Sipariş deneyimini değerlendir" (aktif, ürün yorumu gibi görünmez), gönderim sonrası "Deneyimini değerlendirdin". **(2) Reason label sızıntısı:** store-admin sipariş detayında "Müşteri bilgileri" rail'i ham `cancelReason` (ör. `WILL_NOT_ARRIVE_IN_TIME`) basıyordu → kaldırıldı (neden zaten "İptal detayı" kartında çözümlenmiş label ile gösteriliyor); storefront `CancelledBlock`'a OTHER için not satırı eklendi; ham enum hiçbir yüzeye sızmaz. **(3) Cancellation refund görünürlüğü:** cancellation kaynaklı OrderRefund'lar hem Store Admin > İadeler hem vitrin > İadelerim'de görünmüyordu → `RefundOrigin` enum kolonu (additive; backfill `returnRequestId IS NULL → ORDER_CANCELLATION`) + PROJEKSİYON birleşimi (domain tabloları birleştirilmez): admin birleşik liste + **KAYNAK** filtresi (İade talebi/Sipariş iptali) + maskeli yöntem/tutar/durum/insani neden; vitrin birleşik "İadelerim" cancellation refund kartı (maskeli, status copy işleniyor/tamamlandı/tamamlanamadı+destek). Migration additive `20260807150000_todo174a...`; iki DB'ye (commerce_os + commerce_os_test) uygulandı. Gate: db:generate + drift temiz + typecheck (4/4·0) + lint (0 hata) + workspace test iki run yeşil (api-gateway 2525) + build (27/27) + `git diff --check` temiz. Browser smoke (worktree :4100/:3100/:3200, gerçek enterprise-demo verisi, forge oturum): vitrin İadelerim (OS-000003 iptal refund "Zamanında gelmeyecek"/MASTERCARD ••0008/₺15.840,96/GERİ ÖDEME TAMAMLANDI + R000001 iade) · review CTA aktif→panel→POST 201/duplicate 409/not-eligible 404→"değerlendirdin" · store-admin İadeler birleşik 2 satır + KAYNAK filtresi (ORDER_CANCELLATION→1) · order detail ham kod YOK · responsive 375/1440 taşmasız. Fixture temizlendi (enterprise-demo pristine). TODO-174 REOPEN edilmedi (ayrı follow-up).
- **TODO-174 Customer Self-Service Order Cancellation — ✅ CLOSED & DEPLOYED** (PR #191 merge `5ce426d`; ADR-275…278; 2026-08-07). CI (lint·test·build) 4m13s PASS. Deploy: docker `api-gateway`+`storefront-web`+`store-admin-web` main'den rebuild+recreate (`--no-deps --force-recreate`; postgres/redis/worker/admin-web DOKUNULMADI); migration `20260807140000_todo174...` zaten `migrate deploy` ile canlı (No pending). Post-deploy smoke (deployed :4000, gerçek login + izole fixture): ELIG→ALLOWED / TRANSIT→BLOCKED_IN_TRANSIT / DELIVERED→BLOCKED_DELIVERED · POST cancel→CANCELLED+source=CUSTOMER+intent'siz OrderRefund SUCCEEDED (paymentStatus REFUNDED) · duplicate 200 (idempotent) · OTHER-no-note 400 · nonexistent 404 · reports/cancellations 401 (admin-gated, wired) · storefront :3000 200 / store-admin :3002 307. Fixture FK-güvenli temizlendi (enterprise-demo pristine). Müşteri kendi
  siparişini self-servis iptal eder (`POST /public/stores/:slug/customer/orders/:orderNumber/cancel` +
  `GET .../cancel-eligibility`; 2 adımlı storefront modali). **Uygunluk = CARRIER HANDOFF** (shipment varlığı
  DEĞİL; ADR-275): ALLOWED (handoff yok) / BLOCKED_IN_TRANSIT ("kargoya verildi") / BLOCKED_DELIVERED (→ Return
  Flow) / NOT_CANCELLABLE. Başarılı iptal: Order→CANCELLED + cancelSource=CUSTOMER + reason kodu/kategori/not +
  rezervasyon release (paylaşılan helper) + pre-handoff outbound shipment CANCELLED + coupon/campaign rollback
  (ADR-277) + PAID'de tam refundable bakiye (kargo dahil) üzerinden **intent'siz OrderRefund** otomatik refund
  (ADR-276) + OrderEvent/AuditLog. Refund tutarı client'tan KABUL EDİLMEZ. Refund başarısızlığı order'ı CANCELLED
  bırakır. Concurrency: advisory lock + shipment FOR UPDATE + `Order.version` guard + `/status`/create-yolu
  handoff sertleştirme (yalnız biri kazanır; CANCELLED sipariş IN_TRANSIT/fulfillment edilemez). Taksonomi
  platform-tanımlı (Prisma enum + contracts registry + i18n; Store Admin CRUD YOK; ADR-278). Store Admin: iptal
  detay paneli + Finans>Raporlar "İptal Raporu" sekmesi (count/rate/ciro/reason dağılımı/trend/ödeme+kargo/kaynak/
  top ürün + filtreler). Migration additive `20260807140000_todo174...` (Order 4 kolon + version, 3 enum; fresh
  replay + existing DB upgrade doğrulandı). **Gate YEŞİL:** build 27/27 · lint 0 hata · typecheck · test Run1+Run2
  (api-gateway 2504 [+51 iptal], storefront 550, store-admin 368) · `git diff --check` temiz. Browser smoke
  (gerçek auth + izole fixture, FK-güvenli teardown, enterprise-demo pristine): storefront eligible cancel/2-step
  modal/OTHER validation/refund özeti/success+ayrı refund durumu/IN_TRANSIT mesajı/DELIVERED no-CTA + store-admin
  iptal paneli/rapor, 375/768/1024/1440 taşma yok. ADR-275…278.

- **TODO-169 Returns Management Foundation — ✅ CLOSED & DEPLOYED** (PR #171 merge `360fb96`; ADR-269; 2026-08-04).
  api-gateway + storefront-web + store-admin-web main'den rebuild+recreate (`--no-deps`; postgres/redis/worker/
  admin-web DOKUNULMADI, volume korundu); migration `20260804090000_todo169...` `migrate deploy`; post-deploy
  smoke PASS (deployed :4000 eligibility/create/approve→RefundIntent PENDING/inspect→restock/tenant 401-404/
  private media 404/refundAmountsSupported=false; fixture temizlendi). CI (lint·test·build) yeşil.
  Müşteri iade talebi + Store Admin iade operasyon süreci. İade **OrderLine + quantity** seviyesinde
  (bir sipariş N `ReturnRequest`, her request N `ReturnItem`; kısmi/tekrarlı iade). İlk faz çözüm:
  `REFUND_TO_ORIGINAL_PAYMENT` + `REPLACEMENT` (Store Credit/Gift Card = FUTURE). **Eligibility server-side**
  (fail-closed): sipariş DELIVERED (shipment-seviyesi) + teslim ankoru `Shipment.deliveredAt` (additive; DELIVERED
  geçişinde set, migration `updatedAt` backfill) + returnWindowDays içinde + kalan iade edilebilir qty > 0
  (red/iptal/expire adedi havuza döner). Mağaza politikası `StoreSettings`'e additive 5 alan (returnWindowDays=14
  TR mesafeli · requiresApproval · customerPaysShipping · allowReplacement · allowOriginalPaymentRefund; güvenli
  default). Saf state-machine (`returns/status-map.ts`, 17 durum, terminal immutable, aktör yetkisi). **RefundIntent
  PENDING finansa DOKUNMAZ** (`refundAmountsSupported=false` KALIR; ADR-268 §5 `OrderRefund` upstream'i, TODO-170
  işleyecek); tutar immutable OrderLine snapshot + iade oranı + order-discount dağıtımı (son-satır remainder) +
  inclusive KDV (2. kez eklenmez) + kargo yalnız politika/admin kararıyla. Restock yalnız `RESTOCK_AS_SELLABLE`
  (idempotent; `InventoryMovement RETURN` + `InventoryAdjustment RETURN_RESTOCK`). Attachment PRIVATE
  (`MediaContext.RETURN_ATTACHMENT`; public `/media/*` guard'la 404; auth-gate'li stream; `StorageDriver.read`).
  Bildirim post-commit fail-open (gerçek email teslimi platform-geneli placeholder). Backend: `apps/api-gateway/src/returns/`
  (status-map · eligibility · refund-calc SAF+testli · service · routes-customer/admin/attachment · serialize),
  contracts return şemaları, StoreSettings politika wiring, `Shipment.deliveredAt`. Migration
  `20260804090000_todo169_returns_management_foundation`. Backend gate: gateway typecheck **0 hata**, 36/36 birim test.
  UI: storefront müşteri sihirbazı + admin `Siparişler > İadeler`. Karar `docs/adr/ADR-269-returns-authority-and-lifecycle.md`;
  analiz `docs/analysis/RETURNS-management-foundation.md`. **Kapsam dışı:** gerçek provider refund (TODO-170),
  Gift Card/Store Credit, Marketplace repo, otomatik iade etiketi. Kalan: UI gate + browser smoke + commit.

- **TODO-169.1 Returns — Customer & Order Integration Recovery — ✅ CLOSED & DEPLOYED** (PR #173 merge `eef32e0`;
  commit `d3172bd`; ADR-269; 2026-08-04). api-gateway + storefront-web + store-admin-web main'den rebuild+recreate
  (`--no-deps --force-recreate`; postgres/redis/worker/admin-web DOKUNULMADI, media-data volume korundu); **ek
  migration YOK** (foundation `20260804090000...` zaten uygulanmış; `migrate status` = up to date). CI (lint·test·
  build) yeşil (5m44s). Post-deploy smoke PASS (deployed :4000 window/badge/create→approve→RefundIntent PENDING/
  AWAITING→SHIPPED→RECEIVED→inspect+RESTOCK_AS_SELLABLE/REFUND_PENDING/admin imageUrl non-null/pending finansal
  etki customer+admin/`refundAmountsSupported=false` değişmedi; security: cross-store 404 · illegal 409 · duplicate-
  qty 409 · public return media 404; izole SMOKE fixture + restock envanteri geri alınarak temizlendi, demo-store
  pristine). Post-deploy kabul denetiminde çıkan 6 blocker additive düzeltildi (davranış additive; migration YOK):
  **(1) İade penceresi görünürlüğü** — eligibility yanıtı + ortak projeksiyon artık `deliveredAt`/`returnWindowDays`/
  `returnWindowEndsAt`/`remainingDays`/`windowState` taşır; başlangıç otoritesi `Shipment.deliveredAt` (satın alma
  DEĞİL); storefront etiketleri (`… tarihine kadar iade edilebilir` / `… gün kaldı` / `süre doldu`) sipariş listesi +
  detay + sihirbaz + iade takip yüzeylerinde. **(2) Özet CTA taşması** — sihirbaz özet rail'i tam-genişlik alt-alta
  (`Geri` secondary + `İade talebini gönder` primary); 320/375/1024 taşma yok. **(3) Store Admin iade görseli** —
  `serialize.ts` artık ortak `resolveReturnItemCovers` (store-scoped ProductImage; storefront ile AYNI semantik) ile
  `imageUrl` doldurur (eski sabit `null` kaldırıldı); yoksa monogram placeholder; cross-store medya asla. **(4) Geri
  kargo UX** — müşteri iade detayında belirgin "Ürünü geri gönderin" bloğu (kim öder + talimat + son tarih + takip
  girişi) + aşama açıklamaları. **(5) Sipariş listesi iade rozeti** — teslim rozeti KORUNUR, iade durumu AYRI rozet
  (`latestStatus` + adet) + "İade durumunu görüntüle"; review paneli regresyonu düzeltildi (panel action-bar DIŞINA
  taşındı → iade CTA sabit). **(6) Sipariş detayı iade entegrasyonu** — müşteri + Store Admin sipariş detayında
  `İadeler` bölümü + **pending finansal etki** (onaylanan RefundIntent niyeti vs gerçekleşen; `hasPendingFinancialImpact`;
  gerçek refund YOK → "beklenen"/provisional; gross satış düşülmez). **Ortak return projection** (`returns/projection.ts`,
  SAF+testli) tek server-side otorite: customer list/detail + admin order detail + return summary AYNI özeti kullanır
  (React'te hesap YOK; fail-open → hatası order görünümünü bozmaz). Yeni admin ucu `GET /stores/:storeId/orders/:orderId/
  return-summary`. Gate: build+lint+typecheck 0 hata, **4229 test yeşil** (projection+returns-summary birim testleri eklendi).
  Browser smoke: izole `SMOKE-10` 3-ürün DELIVERED sipariş → pencere/rozet/create/approve→RefundIntent PENDING/
  admin imageUrl non-null/pending finansal etki/CTA 320-375-1024 PASS; fixture temizlendi. **TODO-169 ancak bununla
  IMPLEMENTED sayılır.** (Post-audit güncelleme 2026-08-04: TODO-170 önce UNBLOCKED sanıldı; cross-module review
  finansal invariant açıkları buldu → **TODO-170 yeniden ⛔ BLOCKED**; aşağıya bak. Hardening ile R1–R5/P1-P2
  düzeltildi ama commit/deploy YOK, dolayısıyla TODO-170 hâlâ başlanmamalı.)

- **Pre-Refund UX Recovery (Returns UX + Pending Work + Return-Shipment) — ✅ CLOSED & DEPLOYED** (PR #175
  merge `064a44d`; ADR-270; 2026-08-04). api-gateway + storefront-web + store-admin-web main'den rebuild+recreate
  (`--no-deps --force-recreate`; postgres/redis/worker/admin-web dokunulmadı); migration YOK; post-deploy smoke PASS. TODO-169 sonrası 3 production-facing blocker kapatıldı (item
  1/2/4); **migration YOK** (hesaplanan alanlar + mevcut kolonlarda `groupBy`). (1) **BUG-RETURN-DEEPLINK:**
  `/account?section=returns` geçersiz section → Orders'a düşüyordu; projeksiyon `primaryReturnNumber` + tek
  canonical `resolveReturnCtaHref` (tek aktif iade → `/account/returns/{no}`, çok iade → `/account/orders/{no}#returns`);
  order-detail `#returns` erişilebilir focus (scroll-mt + focusable heading + `ReturnsDeepLinkFocus` island;
  refresh/back güvenli). (2) **Pending Work Indicators:** gateway `GET /stores/:id/pending-work-summary` (2
  `groupBy`, bounded, N+1 yok) → sidebar rozetleri (Değerlendirmeler/İadeler; 0 gizli, `99+`, erişilebilir ad)
  + Dashboard "Bekleyen İşler" kartı (tür/adet/en eski/filtreli link); mutation event-bridge ile ANINDA tazeleme
  (approve → 3→2 canlı doğrulandı). Platform Admin'e mağaza-op sayacı EKLENMEDİ (bilinçli). (4) **Return-shipment:**
  approve → aynı tx'te otomatik `AWAITING_SHIPMENT` (SYSTEM/ADMIN guard, append-only history) → çıkmaz kalktı;
  "Ürünü geri gönderin" `shipByDate`(approvedAt+7) + paketleme + a11y; tracking → `RETURN_SHIPPED` (idempotent,
  duplicate 409, tenant 401/404); admin "Müşteri tarafından gönderildi" + "Teslim alındı"→`receivedAt`. Gate
  GREEN (typecheck 0 · lint 42/42 0 err · test 42/42 gw 2279 +18 yeni · build 27/27). Browser smoke worktree
  :4100/:3100/:3202 postgres :5432 enterprise-demo PASS (responsive 375/768/1024/1440). **Item 3 Unified Session
  Policy YALNIZ tasarım** (ADR-271). Git kuralı: commit/push/PR/merge/deploy YOK.

- **Unified Session Policy — ✅ CLOSED & DEPLOYED (2026-08-05, PR #177)** (ADR-271 §7 + **§8 hardening**).
  Multi-tab logout + false-expiry reconciliation gerçek tarayıcıda doğrulandı; migrate-before-app uygulandı; docker
  stack rebuild/recreate; post-deploy smoke yeşil. Tek policy kaynağı `packages/config/src/session-policy.ts` (remember-off idle 30dk/abs
  8 saat · remember-on idle 7g/abs 30g; env override + default-tolerant). Additive migration
  (`20260804160000_...`: `lastActivityAt`/`absoluteExpiresAt?`/`rememberMe`/`rotatedFromSessionId`; backfill;
  replay-safe; canlı DB'de 79 oturum backfill). Gateway dual-gate `min(idle,absolute)` + throttle'lı sliding
  refresh (anlamlı aktivite; mousemove değil) + extend uçları (platform `/auth/platform/extend`, customer
  `/public/.../customer/extend`; aktif-only, token rotation, absolute SABİT, CSRF/rate-limit, audit). 3 app
  remember-me UI + cookie policy'den (rememberMe→persistent, off→session; hardcoded 30d/8h KALDIRILDI) + ortak
  `SessionGuard` (a11y modal + aria-live geri sayım + `me()`-teyitli expiry + BroadcastChannel `*_session_sync`) +
  safe returnTo + expiry mesajı. **`expiresAt` REPURPOSE EDİLMEDİ** (korundu; idle hesaplanır). store-admin
  PlatformSession'a biner. Token httpOnly (JS/localStorage'da YOK — browser'da doğrulandı). Login autocomplete
  zaten doğru. Analiz: `docs/analysis/ADR-271-session-analysis.md`. Git kuralı: commit/push/PR/merge/deploy YOK.
  **Post-audit hardening (2026-08-04; ADR-271 §8):** M1 policyVersion legacy cutover (sessiz kitlesel-logout önlendi),
  M2 fast-default migration (full-table lock yok — §7 backfill'i büyük tabloda kilitleyebilir, düşük trafik/maintenance
  penceresinde deploy), M3 ölü `absoluteExpiresAt` index drop, S1 `/me`/logout/extend `countAsActivity=false`,
  S2 multi-tab false-expiry `me()`-teyitli, S4 logout CSRF cookie temizliği. Follow-up migration
  `20260804170000_adr271_returns_session_hardening`. Gerçek-DB testleri (`session-legacy.integration.test.ts`)
  `commerce_os_test` DB'ye `DATABASE_URL` ile koşar; CI'da (DB yok) SKIP.

- **Private Media Hardening — ✅ CLOSED & DEPLOYED (C1; 2026-08-05, PR #177; post-deploy encoded-path smoke yeşil)**. Eski guard ham URL'de `/returns/` substring
  arıyordu → `%2F`/`%252F`/`%5C`/mixed-case ile BYPASS ediliyordu (fastifyStatic decode edip 200 servis ediyordu).
  Yeni guard `apps/api-gateway/src/media/private-guard.ts` (`classifyMediaRequestPath`) path'i TAM (iteratif) decode
  eder, backslash normalize eder, SEGMENT bazında `returns` arar; malformed/traversal → 400, private → 404. Private
  stream response'a `X-Content-Type-Options: nosniff` + `Content-Disposition: inline` + `Cache-Control: private,no-store`
  eklendi. Kalan borç: gerçek private-bucket/signed-URL ileriye ertelendi (TECHNICAL_DEBT).

- **Return Financial Invariants — ✅ CLOSED & DEPLOYED (R1–R5, P1/P2; 2026-08-05, PR #177; ADR-269 Post-Audit Hardening)**.
  R1: refund'suz terminal geçişte PENDING `RefundIntent` AYNI tx'te CANCELLED (silinmez; additive `cancelledAt`/
  `cancellationReason`; projection yalnız PENDING'i pending-financial-impact sayar). R2: `createReturnRequest`
  `pg_advisory_xact_lock(storeId:orderNumber)` ile serileşir (çift-talep over-claim etmez). R3: admin mutation'larına
  zorunlu `expectedVersion` + ATOMİK optimistic lock (updateMany where version=expected; count=0 → 409
  `VERSION_CONFLICT`, yan etki yok; UI reload+dostça mesaj). R5: `COMPLETED` kodla enforce edilen guard'a tabi
  (REFUND için intent PROCESSED, REPLACEMENT için fulfillment doğrulanmadan → 409 `COMPLETION_NOT_ALLOWED`;
  TODO-170'e kadar en ileri finansal durum `REFUND_PENDING`/`REPLACEMENT_PENDING`). P1/P2: pending-work "actionable"
  artık açık admin-actionable allowlist (settled-olmayan her şey DEĞİL); INSPECTED artık inspection bucket'ında;
  invariant sidebar actionable == dashboard bucket toplamı. Testler: `returns-lifecycle.integration.test.ts`
  (`commerce_os_test` DB, CI'da SKIP).

- **TODO-170 Refund Ledger & Payment Reversal — ✅ CLOSED & DEPLOYED (2026-08-05; ADR-272; PR #179 merge `9023d3d`)**. Append-only
  `OrderRefund` + `OrderRefundEvent` ledger; yalnız `SUCCEEDED` finansa yansır. Partial + çoklu refund; cap invariant
  `Σ SUCCEEDED + Σ active ≤ captured` (`pg_advisory_xact_lock` + version guard). RefundIntent additive `CONSUMED`
  (atomik, bir kez; R5 COMPLETED guard artık SUCCEEDED OrderRefund'a bakar). Capability DÜRÜST: MOCK→otomatik,
  gerçek online provider→MANUAL_OFFLINE (transport/native-webhook yok; sahte başarı YOK), offline→manuel (SUPER_ADMIN).
  Async/timeout/retry + duplicate providerRefundId koruması (unique + DUPLICATE_CALLBACK). Order paymentStatus
  PROJEKSİYON (REFUNDED/PARTIALLY_REFUNDED; attempt REFUNDED'a çevrilmez). Finance: SUCCEEDED refund'lar
  `completedAt` (tz) bucketlenip Net/Total'dan TEK kez düşülür; `refundAmountsSupported=true` (**TD-FR-1 closure candidate**).
  Migration `20260805100000_todo170_refund_ledger_payment_reversal` (additive; deploy edildi commerce_os + commerce_os_test).
  Store-admin refund paneli (başlat/yenile/tekrar/manuel/iptal) + storefront maskeli müşteri refund durumu. Testler:
  `refunds-ledger.integration` (16/16 gerçek-DB) + `refunds-pure` + finance/projection güncellemeleri yeşil. Backend:
  `apps/api-gateway/src/refunds/` (capability · cap-calc · provider-port · mock-refund · service · serialize · routes-admin).

- **TODO-171 Return Decision Flow Simplification — Faz 1 (PR1) — CLOSED & DEPLOYED (PR #183) (2026-08-06)**.
  Kanıtlı denetim (4 yüzey: state-machine · refund lifecycle · shipment/inspection · finansal projeksiyon;
  K1–K4 kararlandı) admin'in yalnız gerçek kararlar vermesini sağladı: "Kapat" tuzağı (`REFUND_PENDING →
  CLOSED` guard'sız admin geçişi → RefundIntent sessizce CANCELLED, ledger boş, `Order.paymentStatus` PAID
  kalıyordu) **yapısal olarak engellendi** — `evaluateReturnTransition` `to==="CLOSED" && actor==="ADMIN" &&
  from∈{REFUND_PENDING,COMPLETED}` → yeni ret sebebi `REFUND_UNSETTLED` (409); `REPLACEMENT_PENDING → CLOSED`
  admin arşivleme serbest KALDI (dead-end önlenir). `COMPLETED` yeni akışta terminal (otomatik `COMPLETED →
  CLOSED` YOK; yeni return `CLOSED` ÜRETMEZ; legacy `CLOSED` kayıtlar okunur kalır). "İncelemeye al" +
  "Gönderim bekleniyor" + "Kapat" butonları store-admin UI'dan kaldırıldı (`order-shared.ts`
  `canCloseReturn`/`canReviewReturn`/`canAwaitShipment` kaldırıldı); approve→`AWAITING_SHIPMENT` otomasyonu
  (ADR-270, mevcut) korundu. İlk gerçek admin kararında (approve/reject) idempotent `RETURN_REVIEW_STARTED`
  append-only history event yazılır (`returns/review-event.ts` `writeReviewStartedEvent`; yapısal exact-match
  idempotency `fromStatus=toStatus=sourceStatus` — substring/serbest-metin arama DEĞİL; ayrı kolon/tarih
  otoritesi YOK, K2). **İnceleme = tek karar merkezi:** kalem/adet bazlı kabul (`approvedQuantity`) admin'e
  TEK "İadeyi yap" aksiyonuyla (`POST /stores/:storeId/returns/:returnId/inspect-decision`) mevcut
  iki-aşamalı `initiateRefund` orchestration'ına bağlanır (decision tx commit → provider I/O tx DIŞINDA;
  `initiateRefund` başarısız dönerse inceleme kararı geri alınmaz ama admin'e sessiz-başarı YOK — aynı
  `HTTP_BY_CODE` eşlemesi reuse edilip açık 4xx döner); red (`rejectedQuantity`) refund hesabına HİÇ girmez
  + `DO_NOT_RESTOCK` (phantom envanter önlenir). **Finansal görünürlük:** atıl `GET
  /stores/:storeId/orders/:orderId/refund-context` (`loadOrderMoney`, daha önce yazılmış ama UI'da hiç
  tüketilmiyordu) admin sipariş detayı Ücret Özeti'ne bağlandı ("Gerçekleşen iade (−)" + "İade sonrası net
  tahsilat", yalnız `succeededRefundMinor>0` iken); saf `computeNetCollectedMinor(captured,succeeded)=
  max(0,captured−succeeded)` eklendi (`payments/payment-state.ts`); 3 stale copy düzeltildi (admin sipariş
  detayı, storefront sipariş detayı, finans raporu — "gerçek refund TODO-170'te" artık YANLIŞ, TODO-170
  kapandı). **TODO-170 (Refund Ledger) semantiği KORUNUR** — `OrderRefund`/`RefundIntent`/cap invariant/
  `CONSUMED`'a DOKUNULMADI, yalnız reuse edildi. Migration **YOK** (K2). Durum: kod tamamlandı, tüm review
  temiz, **2396 test yeşil**; **commit/push/PR/merge/deploy YOK**. Karar: ADR-269 (§ "Faz 1 Revizyonu") +
  ADR-272 (§ "Faz 1 Revizyonu") güncellendi. Analiz: `docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md` (ACCEPTED)
  + `docs/analysis/RETURNS-FLOW-PHASE1-PLAN.md`. **PR2 (Fast Refund Controls) ve PR3 (Reverse Shipment) bu
  fazda PLANNED** — implementasyon YAPILMADI (bkz. ROADMAP).

- **TODO-172 Fast Refund Controls (Return Flow Faz 2 / PR2) — CLOSED & DEPLOYED (2026-08-07; PR #185 merge 14fbb8c)**.
  Teslim alma + inceleme adımlarını atlayarak refund başlatan **kontrollü "Hızlı iade" akışı**; finansal/
  fraud riski permission + store-configurable limit + zorunlu gerekçe + audit ile sınırlandı. ADR-273.
  **Permission = SUPER_ADMIN role-gate** (mevcut rol-tabanlı sistem reuse; refund `manual-complete`
  `requireStoreSuperAdmin` deseni birebir mirror; yeni yetki tablosu YOK; SUPPORT_ADMIN 403; cross-store
  404). **StoreSettings additive** `fastRefundEnabled` (default false) + `fastRefundMaxAmountMinor BigInt?`
  (**null=KAPALI, sınırsız DEĞİL**) + `fastRefundCurrency String?` (set edilirse order currency ile birebir
  eşleşmeli); ayarları yalnız SUPER_ADMIN düzenler; auditlenir. **Kaynak durumlar = AWAITING_SHIPMENT +
  RECEIVED** (Faz 1'de approve otomatik AWAITING_SHIPMENT'e ilerlediğinden "onaylandı, teslim alınmadı"nın
  gerçek durumu; APPROVED ve RETURN_SHIPPED hariç). Bu kenarlar state-machine'e EKLENMEZ; Fast Refund kendi
  açık-allowlist + version-guard'lı **tek meşru giriş noktası** (generic `/transition`'ın permission/limit
  atlayarak REFUND_PENDING üretmesi engellenir). **Orchestration:** `POST /stores/:id/returns/:id/fast-refund`
  → tx (guard'lı REFUND_PENDING + `RETURN_FAST_REFUND_STARTED` history marker: skippedSteps/reason JSON) →
  audit `return.fast_refund.started` → commit sonrası `initiateRefund` (TODO-170 REUSE; provider I/O tx
  DIŞINDA). Idempotent (çift tıklama INVALID_STATE/VERSION_CONFLICT; initiateRefund advisory-lock). Gerçek
  refund (OrderRefund SUCCEEDED) olmadan COMPLETED olmaz. **Risk görünürlüğü:** `GET .../fast-refund-context`
  bounded özet (tutar/limit/müşteri sipariş+iade sayısı/son-90-gün hızlı iade/atlanan adımlar/uygunluk);
  fraud scoring YOK. **Store-admin UX:** "Hızlı iade yap" CTA (permission+enabled+kaynak durum) + onay modalı
  (zorunlu gerekçe + atlanan adımlar + tutar/limit + risk özeti + açık uyarı ⚠ renk-tek-başına DEĞİL; limit
  aşımında CTA gizlenmez, neden + "Normal iade akışına devam edin"). **Customer UX değişmedi** (maskeli refund
  durumu TODO-170 korunur; "fast" etiketi sızmaz). Migration additive `20260807090000_todo172_fast_refund_controls`
  (3 kolon, default kapalı, mevcut store'larda otomatik açılmaz). Testler: saf 17 (`returns-fast-refund-pure`)
  + gerçek-DB 20 (`returns-fast-refund.integration`) yeşil; gateway/store-admin/contracts suite yeşil.
  **Ship-hardening (2026-08-07):** (1) BigInt finansal serialization → **kanonik ondalık string kontrat** +
  ortak `@commerce-os/utils` money helper (float YOK; TD-194 CLOSED); (2) history note-JSON → **yapısal
  `eventType`+`metadata`** kolonları (domain sorgusu exact-match; 2. additive migration); (3) **flaky
  store-admin testleri kök-neden çözüldü** (`userEvent delay:null` + `vitest.config.ts maxForks=çekirdek−2`
  + `findByText`; store-admin 5× tam yeşil; TD-199 CLOSED). **commit/push/PR/merge/deploy YOK.** Detay:
  `docs/adr/ADR-273-fast-refund-controls.md`. **PR3 (Reverse Shipment) → TODO-173 IMPLEMENTED (aşağıda).**

- **TODO-173 Reverse Shipment (Return Flow PR3) — ✅ CLOSED & DEPLOYED** (PR #188 `3f01ccc`; test-infra PR #187 `cb70738`) (ADR-274,
  `docs/analysis/REVERSE-SHIPMENT.md`). İncelemede reddedilen ürünün mağazadan müşteriye güvenli geri
  gönderimi; normal fulfillment / müşteri-iade kargosu / refund ledger'dan AYRIK. Üç yönlü `ShipmentDirection`
  (yalnız `STORE_RETURN_TO_CUSTOMER` gerçek akış; `CUSTOMER_RETURN_TO_STORE` reserved — K2). Ayrı disposition
  domain'i (`ReturnRejectedDisposition` + `ReturnItemDisposition`; `ReturnRestockDecision` GENİŞLETİLMEDİ —
  K1 düzeltmesi). Reverse shipment `Shipment` REUSE + provider config REUSE (K5), OrderRefund/RefundIntent/
  envanter/paymentStatus ÜRETMEZ, `requireStoreAdmin` (K3). Direction-aware duplicate/fulfillment/tracking/
  KPI/iade-penceresi izolasyonu. Additive migration replay ✓; gerçek-DB concurrency (advisory lock) + 20 yeni
  test + tam gate yeşil (2453 api-gateway, 0 regresyon). **commit/push/PR/merge/deploy YOK.**

- **Financial Reporting Foundation — ✅ CLOSED & DEPLOYED** (PR #168 merge `9a4c8db` + currency-selector fix
  PR #169 `eb31cc3`; 2026-08-03). api-gateway + store-admin-web main'den rebuild+recreate (`--no-deps`;
  postgres/redis/worker/storefront/admin-web DOKUNULMADI, volume korundu); migration YOK, schema up to date.
  Post-deploy smoke PASS (izole fixture reconciliation birebir; currency dropdown fix; responsive; fixture temizlendi).
  Store-Admin **Finans > Raporlar**:
  sipariş snapshot'larından türetilen mağaza-geneli finansal raporlar (satış özeti + ürün/varyant + kategori/marka
  + ödeme + indirim + CSV). Backend: `apps/api-gateway/src/finance/` (`metrics.ts` SAF sözlük · `date-range.ts`
  tz preset'leri · `data.ts` `$queryRaw` agregasyon · `csv.ts` BOM+injection · `routes.ts` 9 uç), contracts finance
  şemaları, api-client `admin.finance.*`, BFF `app/api/finance/*`, UI `app/(app)/finance/reports`, nav "Finans".
  KDV inclusive; per-currency (FX yok); satış≠tahsilat; reconciliation (özet=Σgünlük) yapıca+test. **Refund tutarı
  uydurulmaz** (adet + `refundAmountsSupported=false`; min `OrderRefund` ADR-268 §5). Kârlılık kapsam-kapılı
  (cost snapshot var). Migration YOK. Gate GREEN (build 27/27 · typecheck · lint 0 · test 2219/31 finans).
  Kalan: gerçek browser smoke (fixture) + commit. Karar ADR-268; analiz `docs/analysis/FINANCIAL-reporting-foundation.md`.
  **Gift Cards & Store Credit = FUTURE BACKLOG** (bu fazda geliştirilmedi; sahte kart gösterilmez).

- **BUG-CART-002 — PDP availability, cart badge & line-selection consistency — ✅ CLOSED & DEPLOYED**
  (PR #167 MERGED, main merge `cf6823a` / fix `37a30de`; 2026-08-03). api-gateway + storefront-web main'den
  rebuild+recreate; migrate status "up to date" (yeni migration yok); postgres/redis/worker/admin/store-admin
  DOKUNULMADI, volume'lar korundu. Post-deploy smoke PASS (:4000/:3000): OOS varyant disabled+üstü-çizili+aria
  "… — Tükendi" (deployed :4000 artık `available:0,inStock:false` — fail-open giderildi); stoklu add → badge
  refresh'siz + "Sepete eklendi"; deselect → "0 ürün / Kargo — / ₺0,00 / checkout disabled", re-select geri
  döner; remove → badge temizlenir; mobil layout temiz.
  TODO-167/168 sonrası production-critical regresyon: (A) PDP fail-open bounded stok projeksiyonu →
  tükenmiş varyant "eklenebilir" görünüyordu (+ add endpoint stok kontrolü yoktu + optimistic başarı toast'ı);
  (B) header badge add sonrası refresh gerektiriyordu; (C) auth checkbox kendini yeniden seçiyordu + "0 ürün +
  ₺49,90" özeti. Düzeltmeler: variant-scoped fail-CLOSED stok (`loadPublicStockMapForVariants`), add-guard
  `409 VARIANT_OUT_OF_STOCK`/`VARIANT_STOCK_LIMIT`, `router.refresh()` badge senkronu, auth deselection
  threading (`?deselected=` + checkout), kargo `subtotal>0` kapısı. Analiz:
  `docs/analysis/BUG-CART-002-availability-badge-selection.md`. Açık follow-up: **TD-177** (PLP/home hâlâ
  bounded stok, kozmetik) · **TD-174** (cross-device deselection persist). **Gift Card blocker KALDIRILDI**
  (BUG-CART-002 CLOSED; Gift Card artık başlayabilir). TODO-168 durumu DEĞİŞMEDİ.

- **TODO-159G: Demo Data Safety & Recovery (HOTFIX — ADR-108 / TD-116).** (DONE — recovery + önleme
  tamamlandı; commit/PR/deploy YAPILMADI.) 2026-07-23 yıkıcı `prisma db push` enterprise-demo
  kataloğunu (471 ürün/2202 varyant) sildi. **Recovery:** deterministik `db:seed-enterprise` +
  `db:backfill-enterprise` → verify-enterprise 21/21, demo-store korundu, storefront smoke PASS.
  **Önleme:** `packages/db/scripts/enterprise/safety.mjs` — environment guard (prod/staging/host
  allowlist), store-scope guard, row-count circuit breaker (`ALLOW_DESTRUCTIVE_DEMO_RESET`), backup
  guard (`pnpm db:backup` / `infra/scripts/db-backup.zsh`) + `pnpm db:reseed-enterprise` zinciri
  (eski ad `db:restore-enterprise` → deprecation köprüsü; gerçek DR restore DEĞİL, ADR-166).
  20 birim + 3 statik-invariant test + 3 canlı guard testi (no-flag durur / flag geçer / prod-URL
  reddedilir). Runbook: docs/OPERATIONS.md "Demo veri güvenliği". Not: yerel DB'de `_prisma_migrations`
  yok (şema `db push` kurulmuş, TD-116-a); guard'lar imaj rebuild sonrası canlı (TD-116-b).
- **TODO-166 — Slug & Redirect Management (ADR-265) — ✅ CLOSED & DEPLOYED (PR #164, main `e253fa7`; 2026-08-03).**
  (Tam gate + GERÇEK browser + post-deploy smoke doğrulandı; api-gateway/store-admin-web/storefront-web main'den
  rebuild+recreate, migrate deploy no-op + status up-to-date, canlı ürün&marka eski URL → 301 Location canonical.)
  Store-admin "SEO > Slug ve Yönlendirmeler" modülü:
  mevcut motoru (SlugHistory/Redirect + `@commerce-os/utils` SAF resolver) YÖNETİR, yeni motor kurmaz.
  Yeni gateway uçları `/stores/:storeId/seo/redirects` (list/create/detail/patch/delete) +
  `/stores/:storeId/seo/slugs[/:type/:id]` (`CATALOG` core-gate); api-client + BFF proxy; DataGrid
  tabanlı Slug/Yönlendirme ekranları + detay drawer + manuel redirect formu. **BRAND** eklendi
  (`SlugEntityType += BRAND`, `brandUrlPath`, atomik `recordSlugChange`). `Redirect.origin`
  (AUTOMATIC/MANUAL) — otomatik salt-toggle, manuel tam CRUD. Manuel doğrulama: source≠target /
  reserved-shadow / off-site / loop / canlı-entity-shadow / kaynak-tekilliği; hedef query'si korunur.
  **404 önerileri:** ertelendi (yakalama altyapısı YOK) → future. **Kategori runtime redirect:** TD-064
  sınırı korunur (query-tabanlı). TD-057 KAPANDI. Bkz. `docs/analysis/SLUG-redirect-management.md`.
- TODO-001: Faz 0 commit.
- TODO-002: Faz 1 multi-tenant API plani.
- TODO-003: Claude frontend/admin foundation promptu. (DONE — UI foundation eklendi)
- TODO-004: Store admin UI foundation. (DONE — apps/store-admin-web shell)
- TODO-005: Super admin UI foundation. (DONE — apps/admin-web shell)
- TODO-006: Tenant guard gercek endpointlere uygulanacak. (PARTIAL — platform admin guard Faz 1A'da
  admin store/plan endpointlerinde uygulandi; store-admin endpointleri bekliyor)
- TODO-007: Auth/session gercek implementasyon. (DONE — platform admin login/me/logout/session revoke)
- TODO-008: Storefront UI foundation. (DONE — apps/storefront-web shell)
- TODO-009: API client'a auth/token ve per-domain resource'lari eklemek. (PARTIAL — auth, admin
  stores/plans, Faz 2A catalog/inventory ve Faz 2C order lifecycle helper'lari eklendi; checkout/
  storefront public resource'lari bekliyor)
- TODO-010: Frontend ekranlarini gercek API'ye baglamak (TD-010).
- TODO-011: Storefront store slug/domain resolver (TD-011).
- TODO-012: Frontend app'ler icin Docker Compose servisleri (TD-008). (DONE — admin-web/store-admin-web/
  storefront-web compose servisleri eklendi, paylasimli node.Dockerfile + `next dev`, compose ici
  `API_GATEWAY_URL=http://api-gateway:4000`, `/api/health` healthcheck; smoke gecti; TD-008 RESOLVED)
- TODO-013: Frontend etkilesim/erisilebilirlik testleri (jsdom + Testing Library) (TD-012).
- TODO-014: Frontend UI dil/tasarim revizyonu — varsayilan Turkce + premium SaaS polish.
  (DONE — uc app Turkce'ye cevrildi, packages/ui rafine edildi; TD-013 RESOLVED)
- TODO-015: i18n foundation — packages/i18n tipli sozluk, tr/en parity, getDictionary.
  (DONE — defaultLocale "tr", supportedLocales ["tr","en"], parity testleri)
- TODO-016: Runtime locale switcher ve UI'da dil secimi (TD-014).
- TODO-017: URL locale stratejisi (`/tr`-`/en` prefix) ve/veya tarayici dil tespiti (TD-014).
- TODO-018: Kullanici ve mağaza bazli locale tercihi (gerekirse DB locale alani) (TD-014).
- TODO-019: UI polish takibi — gercek veri baglandikca StatCard trend/delta, tablo ve liste
  gorunumleri, loading/skeleton durumlari (TD-010 ile birlikte).
- TODO-020: Faz 1B admin-web login/me/logout akisi ve stores/plans liste/formlarini backend
  endpointlerine baglamak (TD-016). (DONE — BFF proxy + httpOnly cookie + canli stores/plans/health)
- TODO-021: Auth rate limit, cookie hardening, CSRF ve production session security kararlarini
  netlestirmek (TD-015, TD-017). (PARTIAL — gateway login rate limit, BFF CSRF, cookie env hardening
  ve server-side cookie guard eklendi; refresh/dagitik rate limit Faz 2)
- TODO-022: Store-admin backend endpointleri geldiginde `requireStoreAccess`/`assertStoreRole`
  helper'larini gercek store-scoped route'larda zorunlu kilmak.
- TODO-023: admin-web etkilesim testleri (jsdom + Testing Library): login form submit, oturum guard
  redirect, stores/plans modal create/update, system health durum render (TD-012). (PARTIAL — login
  validation/hata, stores/plans create modal ve logout flow eklendi; update/system-health daha sonra)
- TODO-024: Faz 1C dahili health guvenli ops baglamasi — admin-web container env'ine `INTERNAL_API_TOKEN`
  vermek (frontend compose servisiyle, TD-008) veya ayri ops ekrani; gateway hata kodlarini paylasimli
  kaynaktan turetmek (TD-017). (PARTIAL — server-side proxy timeout ve token yok/var testleri eklendi;
  compose secret dagitimi bekliyor)
- TODO-025: admin-web stores listesinde domain gosterimi — gateway store list/get response'u `domain`
  dondurmuyor (StoreDomain ayri tablo). Gerekirse contract'i genisletip UI'da domain kolonu eklemek.
  (DONE — contract response `domain: string | null`, gateway list/get ve UI domain kolonu eklendi)
- TODO-026: Admin stores/plans icin sayfalama UI'si (gateway limit/offset destekliyor; UI su an ilk
  sayfayi gosterir) ve liste arama/filtre.
- TODO-027: Faz 2 store-admin-web ve storefront-web gercek API baglama (TD-010, TD-011). (PARTIAL —
  store-admin-web Faz 2B'de canli baglandi; storefront-web resolver bekliyor (TODO-031).)
- TODO-028: Production deploy hattI — frontend icin Next.js standalone/production image (non-root,
  optimize layer), Nginx reverse proxy + domain routing + SSL/TLS, ortam bazli env yonetimi ve
  deploy pipeline. Su an compose frontend servisleri `next dev` ile calisir (gelistirme runtime'i);
  production image optimizasyonu ve reverse proxy/SSL bilincli olarak sonraya birakildi (bkz. ADR-019).
- TODO-029: Faz 2B store-admin UI baglama — category/product/variant/inventory endpointlerini
  `apps/store-admin-web` BFF/form/list ekranlarina baglamak; store-user auth/context kararini
  netlestirmek (TD-019). (DONE — dashboard/categories/products/variants/inventory canli baglandi,
  guvenli BFF + server-side store context (ADR-023), CSRF, TL<->minor unit, Turkce hata esleme,
  tr/en parity, BFF + jsdom UI testleri. Store-user auth gecici platform-admin context ile vekaleten
  cozuldu; gercek store-user auth TODO-033'te acik.)
- TODO-030: Faz 2C order core — order/customer temel modelleri, fiyat snapshot, stok rezervasyonu
  (`SALE_RESERVATION`/`SALE_RELEASE`) ve audit/event davranisini eklemek (TD-021). (DONE — backend
  modeller/API/contracts/api-client/test/docs eklendi; UI/checkout/payment kapsam disi.)
- TODO-031: Faz 3 storefront resolver / checkout plani — domain/slug -> store cozumleme, public
  catalog read API, storefront-web veri baglama, cart/checkout taslagi ve cache stratejisi (TD-022,
  TD-025).
- TODO-032: Catalog media/options/import backlog — product image/media, zengin option modeli,
  metafields/collections/tags ve bulk import/export ihtiyaclarini ayri fazlara bolmek (TD-020).
- TODO-033: Store-user auth + role guard — store-scoped session/token tipi, granular store role
  permission matrisi; store-admin-web login proxy'sini gercek store-user akisina, server-side store
  context'i store-user erisim listesine baglamak (cok-mağazali secici), catalog/inventory
  endpointlerinde `requireStoreAccess`/role guard'i zorunlu kilmak (TD-019, ADR-023).
- TODO-034: Store-admin dashboard pagination-aware aggregation — aktif urun ve kritik stok sayilari
  su an ilk sayfa uzerinden hesaplanir; gateway sayim/aggregate ucu veya api-client limit/offset ile
  tam sayim (TD-024).
- TODO-035: Faz 2D Product Sales Model Foundation — product sales model enum/kurallari:
  `ONLINE`, `INQUIRY`, `APPOINTMENT`, `WHATSAPP`, `CATALOG_ONLY`; price visibility ve CTA behavior
  backend contract/model kararlarini eklemek. (DONE — F2D backend/model/contract/API foundation,
  order purchasability guard ve seed/verify eklendi; UI/storefront baglama kapsam disi.)
- TODO-036: Faz 2E Runtime Language Switch — TR/EN switch, locale cookie ve admin-web,
  store-admin-web, storefront-web entegrasyonu. (DONE — `commerce_os_locale` cookie, `packages/i18n`
  locale yardimcilari, `packages/ui` `LocaleProvider`/`useLocale`/`LanguageSwitcher`, uc app server+
  client entegrasyonu, TR varsayilan + TR fallback, key parity korundu; bkz. ADR-026, TD-028.)
- TODO-044: User/DB locale preference — store-user auth (TD-019) tamamlandiginda kalici, store-scoped
  kullanici dil tercihini DB'ye yazmak ve cookie ile birlikte cozumleme onceligini tanimlamak (TD-028).
- TODO-045: URL locale prefix / public i18n routing — ileride public SEO/i18n gerekirse `/tr`-`/en`
  (veya domain/locale negotiation) routing, middleware ve canonical kararlarini ayri is olarak ele
  almak; mevcut prefix'siz cookie stratejisinin uzerine katmanlanir (TD-028).
- TODO-046: Faz 2F Store-admin Product Sales Model UI. (DONE — F2D alanlari urun listesi rozetlerine
  ve create/update formundaki "Satis davranisi" bolumune baglandi; dinamik default'lar, client
  validasyon ve lokalize guard hatalari eklendi.)
- TODO-037: Faz 2F Store-admin Product Sales Model UI — F2D product sales model alanlarini store-admin
  urun formuna baglamak; sales mode, price visibility, CTA behavior ve tutarlilik hatalarini Turkce
  gostermek. (DONE — TR/EN paritesiyle; backend business/catalog/order logic degismedi.)
- TODO-038: Faz 2G Store-admin Orders UI. (DONE — `/orders` canli API'ye baglandi; list status/payment/
  fulfillment rozetleri, detay modal (lines/tutar/adres/rezervasyon/events), DRAFT place / PLACED
  cancel, lean taslak sipariş olusturma, yeni BFF route'lari CSRF + server-side store context ile,
  TR/EN order copy. Backend order/catalog logic degismedi.)
- TODO-047: Faz 3 Storefront checkout/cart + public CTA davranisi — sirada. Storefront'ta sepet/cart
  modeli, checkout akisi ve product sales model'e gore CTA render (sepete ekle / fiyat sor / randevu /
  WhatsApp / katalog-only). (TODO-043 ile iliskili.)
- TODO-048: Store-admin orders UI sonraki tur — payment/shipping/fulfillment UI, invoice/refund/return,
  placed-order satir duzenleme ve sipariş arama/filtre/pagination (su an list pagination UI yok). Bu
  faz disinda birakildi (TD-029).
- TODO-049: Manual draft order creation UI ileri tur — F2G'de lean (inventory varyant secimli) create
  modali eklendi; musteri secimi (customerId), adres girisi ve coklu kalem UX iyilestirmesi sonraya
  birakildi.
- TODO-039: Faz 4 payment — payment provider abstraction, authorization/capture, webhook/idempotency,
  refund durumlari ve `paymentStatus` lifecycle entegrasyonu (TD-025).
- TODO-040: Product inquiry request model — `INQUIRY` urunleri icin tenant-scoped talep kaydi,
  durum akisi, audit/event ve store-admin listeleme.
- TODO-041: Appointment request model — `APPOINTMENT` urunleri icin randevu talebi, musaitlik ve
  store-admin takip akisi.
- TODO-042: WhatsApp redirect/store contact config — store-level public contact/WhatsApp telefon
  ayarlari ve product `whatsappMessageTemplate` render kurali.
- TODO-043: Faz 3A Storefront Resolver ve CTA behavior. (DONE — storefront-web canli katalog
  verisine baglandi; home/listing/detail gercek urun/varyant/stok gosterir; CTA sales-model'e gore
  degisir (ONLINE/INQUIRY/APPOINTMENT/WHATSAPP/CATALOG_ONLY) ve fiyat gorunurlugu uygulanir;
  detail = satin alma karar merkezi iskeleti (ADR-029); cart/checkout musteri-dostu placeholder;
  sunucu-tarafi resolver + token gizliligi (TD-032); TR/EN parite; backend/kontrat degismedi.)
- TODO-044: Faz 2H Entity Detail Pages Route Standardization. (DONE — sipariş detayi `/orders/[id]`,
  ürün detay/düzenleme `/products/[id]` route'una tasindi; liste detay/düzenle aksiyonlari route'a
  linklenir; kisa create/adjust modallari korundu; kural ADR-027 + PROMPT_RULES'a yazildi; TR/EN
  detail copy; backend/BFF kontratlari degismedi.)
- TODO-050: Customer detail dedicated route `/customers/[id]` — müşteri profili, iletişim, adresler ve
  sipariş geçmişi. (Bekliyor — customers ekrani henuz placeholder; canli olunca route/page olur,
  modal degil; bkz. ADR-027.)
- TODO-051: Inventory detail dedicated route `/inventory/items/[id]` (veya `/inventory/[id]`) — varyant
  stok detayi, hareketler ve rezervasyonlar. (Bekliyor — kisa stok adjust modali kalir; detay
  route/page olur.)
- TODO-052: Variant detail dedicated route `/products/[id]/variants/[variantId]` — varyant yonetimi
  su an ürün detay sayfasinda inline bölum; gerekirse ayri detail route'a tasinir.
- TODO-053: admin-web store detail dedicated route `/stores/[id]` — mağaza detayi (su an create/edit
  modali). (Bekliyor — admin-web ayri faz; TD-031.)
- TODO-054: admin-web plan detail dedicated route `/plans/[id]` — plan detayi (su an create/edit
  modali). (Bekliyor — TD-031.)
- TODO-055: Faz 2I Store-admin Products & Orders Premium UI Polish. (DONE — `/products`,
  `/products/[id]`, `/orders`, `/orders/[id]` glass-inspired premium dile tasindi; app-local premium
  primitive'ler eklendi; ozet/metric tile'lar canli listeden hesaplanir; product/order detail hero +
  iki kolon + baglam rayi; TR/EN summary/rail copy; entity detail route standardi ADR-027 korundu;
  backend/BFF kontratlari degismedi; bkz. ADR-028.)
- TODO-056: Premium primitive'lerin (`SurfaceCard`/`DetailHero`/`MetricTile`/`DetailLayout`/`RailCard`/
  `Timeline`) admin-web'de de kullanilmasi gerekirse `packages/ui`'ye tasinmasi ve ortak design token
  haline getirilmesi. (Bekliyor — su an store-admin app-local; ortaklasma ihtiyaci dogunca.)
- TODO-057: Categories/inventory/dashboard ekranlarinin da ayni glass-inspired premium dile
  hizalanmasi (F2I yalniz products/orders kapsadi). (Bekliyor — gorsel tutarlilik icin.)
- TODO-058: Faz 3B Storefront cart + checkout — gercek sepet cekirdegi (oturum/anon cart), satir/
  adet/toplam, order create/place akisinin storefront'tan baglanmasi. (DONE — F3B.1: imzali httpOnly
  cookie cart (yalniz {variantId, quantity} referansi), gateway public `POST /public/stores/:slug/cart`
  (sunucu-otoriter cozumleme) + `POST /public/stores/:slug/checkout` (createOrder→placeOrder, stok
  rezervasyonu, PLACED/UNPAID); ONLINE disi + gizli fiyat sepete/siparise dusmez; fiyat/baslik/salesMode
  istemciden kabul edilmez; allowlist DTO; tenant izolasyonu iki katmanli; cart/checkout sayfalari
  gercek veriye bagli (empty/error/success/quantity/remove/reconcile); TR/EN parite; bkz. ADR-031, TD-033.)
- TODO-059: Storefront payment + shipping + fulfillment — odeme provider, kargo/teslimat secimi ve
  vergi hesaplamasinin checkout'a baglanmasi (TODO-039/payment ile birlikte). NOT: F3B.1 UX
  revizyonunda gateway'e SUNUCU-OTORITER DEMO ozet eklendi (KDV %20 dahil, kargo ₺750 ustu ucretsiz/
  alti ₺49,90, `DEMO10` %10 kupon); shipping/discount siparise yazilir. Bunlar "demo calculation";
  gercek shipping/tax/coupon motoru bu TODO'da yapilacak (bkz. ADR-031 revizyon notu).
- TODO-060: Storefront review + Q&A + seller rating modeli — gercek yorum/soru-cevap/satici puani
  veri modeli ve store-admin moderasyonu (F3A'da yer tutucu); ardindan recommendation/recently-viewed
  ve "birlikte alinanlar" oneri motoru.
- TODO-061: Gateway public-read katalog ucu — auth gerektirmeyen, store-scoped, yalniz ACTIVE/yayinda
  urun donen public katalog uclari; storefront resolver'in platform-admin token'i birakmasi (TD-032).
  (DONE — F3A.1: `GET /public/stores/:storeSlug/products` + `/:productSlug`, `publicProduct*` allowlist
  DTO, fiyat gizliligi gateway'de uygulanir; vitrin token'siz okur, platform-admin resolver kaldirildi;
  TD-032 RESOLVED, ADR-030)
- TODO-062: Storefront medya/gorsel pipeline — gercek urun gorseli yukleme/CDN ve detay galeri
  zoom/lightbox/video (F3A'da galeri placeholder).
- TODO-063: Faz 3B.2 Payment Operations Foundation. (DONE — provider abstraction + admin provider
  yonetimi (`/payment-providers`) + resolver/fallback + TEST/LIVE mode + credential encryption-at-rest
  (AES-256-GCM) + masking + checkout resolver (additive) + token-korumalı MOCK test odeme akisi +
  webhook shell (idempotency) + PaymentAttempt/PaymentProviderEvent log. CANLI odeme YOK; gercek
  provider HTTP adaptorleri ayri maddelerde (TODO-066..069). Bkz. ADR-033, Faz 3B.2 phase log.)
- TODO-066: iyzico canli/sandbox HTTP AKTIVASYONU — provider-specific adapter iskeleti hazir
  (`contracts/iyzico.ts`: Checkout Form initialize/detail request builder + response parser + IYZWSv2
  imza + status mapping + credential validation). Kalan: `PAYMENT_SANDBOX_HTTP_ENABLED=true` ile gercek
  sandbox/live cagriyi test/kanit + buyer/sepet zenginlestirme + gercek callback imza dogrulama (TODO-071).
- TODO-067: Stripe canli/sandbox HTTP AKTIVASYONU — adapter iskeleti hazir (`contracts/stripe.ts`:
  PaymentIntents request/response/status mapping + Bearer auth + credential format). Kalan: gercek
  sandbox cagri + Stripe-Signature webhook dogrulama (TODO-071).
- TODO-068: PayTR canli/sandbox HTTP AKTIVASYONU — adapter iskeleti hazir (`contracts/paytr.ts`:
  get-token request + paytr_token hash + callback status mapping). Kalan: gercek cagri + callback hash
  dogrulama (TODO-071).
- TODO-069: Banka sanal POS (GENERIC_REDIRECT) HTTP AKTIVASYONU — iskelet hazir
  (`contracts/generic-redirect.ts`: redirect create + callback status mapping). Kalan: gercek PSP
  endpoint/imza entegrasyonu.
- TODO-070: Refund/dispute/settlement fazi — refundPayment canli implementasyonu, mutabakat raporlari,
  iade/itiraz is akislari ve ayri `/payments` (operations) operasyon ekrani (musteri odeme hareketleri).
- TODO-071: Gercek webhook signature verification — F3B.2 webhook shell imzayi placeholder olarak
  kabul eder; provider basina HMAC/imza dogrulamasi ve raw-body koruma eklenecek.
- TODO-064: Public checkout atomicligi — F3B.1'de createOrder (DRAFT) ve placeOrder (rezervasyon) iki
  ayri transaction; placeOrder basarisiz olursa DRAFT siparis kalir. Tek transaction'da create+place
  yapan public-checkout data-access metodu ve/veya basarisiz place'te DRAFT temizleme/expiry (TD-033).
- TODO-065: Anonim sepet/rezervasyon yasam dongusu — anonim checkout'ta stok PLACED ile rezerve
  edilir; odeme alinmadan terk edilen siparisler icin reservation expiry/iptal job'i (worker) ve
  abandoned-order temizligi (TD-033).
- TODO-072: F3B.2 follow-up UI polish — DONE (2026-06-28). Manuel izole smoke'ta gozlemlenen, F3B.2'yi
  bloke ETMEYEN ufak UI/UX eksikleri toplu ele alindi (MOCK simulasyon; gercek provider/iyzico/3DS
  redirect KAPSAM DISI — bkz. ADR-036). Cozulen maddeler:
  - Inventory-aware PDP quantity: buy box adet secici secili varyantin `available` stok limitine duyarli
    (`maxPurchasableQuantity` saf turetme; magaza max ile stok limitinin kucugu). Stok limitinde `+`
    disabled + "Bu üründen en fazla N adet ekleyebilirsiniz." uyarisi; varyant degisince adet yeni
    limite normalize edilir (useEffect clamp); stok yoksa adet kontrolu + sepete ekle disabled + "Bu
    ürün şu an stokta yok." Gateway public DTO zaten `available` tasiyordu (DTO degisikligi gerekmedi);
    server reconcile son guvenlik olarak korunur.
  - 3D Secure test akisi: "3DS gerekli" kart artik ANINDA PAID olmaz. Ilk submit REQUIRES_ACTION → ayri
    gercekci banka dogrulama simulasyon ekrani (ThreeDsChallenge): "Doğrulamayı başarılı tamamla" → PAID,
    "Doğrulamayı başarısız yap" → FAILED (THREE_DS_FAILED) + retry. MOCK adapter `threeDsOutcome`
    (success/fail) ile fail yolu eklendi; `publicPaymentSubmitRequest.threeDsAction` alani. Store-admin
    order detail payment panelinde 3DS durumu (Gerekli/Doğrulama bekleniyor/Doğrulandı/Başarısız) +
    success ekraninda "3D Secure: Doğrulandı". `publicPaymentInfo.threeDsApplied` (safe boolean) eklendi.
  - Taksit UX: odeme adiminda taksit ozeti ("N taksit × ₺X" + toplam + "Vade farksız"), success ekrani
    ve store-admin panelinde ayni ozet. SAHTE oran/faiz YOK — toplam degismez, esit bolunur (computed UI
    alani; yeni DB alani yok, mevcut `installmentCount` kullanildi).
  - Payment success ekrani zenginlestirildi: siparis no, urunler (varyant/adet/birim/satir toplami),
    odeme (saglayici/yontem/maskeli kart/3DS/taksit ozeti/islem no/tarih), teslimat + fatura ozeti, test
    modu notu, "Siparişlerime git" + "Alışverişe devam et" CTA. Full PAN/CVC/token ASLA serialize edilmez.
  - i18n TR/EN paritesi: stok limit/stokta yok, 3DS dogrulama aksiyonlari, taksit ozeti/vade farksiz,
    siparislerime git eklendi. Testler: PDP clamp (saf + SSR out-of-stock), MOCK 3DS fail, store-admin
    3DS paneli, taksit ozeti. Docker smoke (worktree context) healthy; public DTO `available` dogrulandi.
- TODO-073: Store-admin orders filters — DONE (2026-06-28). Store-admin `/orders` listesine operasyonel
  filtre bar eklendi: siparis durumu, odeme durumu, karsilama durumu (mevcut enum'lar; "Basarisiz/kismi
  iade" enum'da yok), tarih araligi (gun bazli, UTC sinir), musteri/e-posta/siparis-no arama. Filtreler
  DB tarafinda (gateway `listOrders` where), store-scope korunur; cross-store sizmaz. URL query string =
  tek dogruluk kaynagi (yenilemede korunur), "Filtrele"/"Temizle" CTA + aktif filtre ozeti, filtreye
  duyarli bos durum ("Bu filtrelere uyan siparis bulunamadi."). Layout regression (siparis no nowrap,
  badge hizasi) korundu. Kapsam disi/ertelendi: toplam tutar araligi (min/max) — opsiyonel, ayri TODO.
  Sozlesme: `orderListQuerySchema`/`OrderListQuery` (contracts), api-client `orders.list(storeId,query,
  token)`. i18n TR/EN `orders.filters.*` paritesi eklendi.

- F3B.3: Customer Account Auth + Checkout Guard + Address Book Foundation. (DONE — bkz. ADR-034 +
  Faz 3B.3 phase log. Mevcut `Customer` storefront uyelik hesabi olacak sekilde genisletildi;
  CustomerCredential/Session/OtpVerification/Iban/CommunicationPreference; checkout guard + adres
  defteri; `/auth/login`, `/auth/register` (3 adim OTP), `/account` shell + dropdown. Migration
  20260628120000.)
- TODO-074: E-posta/telefon DEGISIKLIGI OTP dogrulamasi — Uyelik Bilgilerim'de e-posta/telefon su an
  salt-okunur (+"dogrulama gerekir" notu). Gercek degisiklik icin OTP akisi (REGISTER ile ayni altyapi,
  purpose=VERIFY_CONTACT zaten sema'da) sonraki faz.
- TODO-075: Musteri SELF-SERVICE "sifremi unuttum" akisi (F3B.3 kapsam disiydi). OTP/e-posta ile
  musteri kendi reset talebini baslatir + yeni sifre. ACIK. TODO-087 ile gelen admin-tetikli
  aktivasyon/reset FOUNDATION'i (CustomerCredentialToken + `POST /public/.../customer/activate` +
  storefront `/auth/activate`) bu akista yeniden kullanilabilir; eksik olan musteri-tetikli token
  uretimi (kendi e-posta/telefonuna gonderim) ve teslimat (TODO-076).
- TODO-076: Gercek SMS/e-posta OTP/aktivasyon teslimat saglayici entegrasyonu. Su an provider-ready
  dev/mock; `CUSTOMER_OTP_DEV_CODE` yalniz development/test bypass'i (plain kod loglanmaz). TODO-087'de
  aktivasyon/reset linki mail provider olmadigi icin admin UI'da TEK SEFERLIK gosterilir (ADR-035);
  gercek e-posta gonderimi bu TODO ile gelir.
- TODO-078: Store-admin customers DETAIL route — DONE (F3B.3 Store-Admin Customer Management Fix).
  Dedicated route `/customers/[id]` (modal degil); gateway `GET/PATCH /stores/:storeId/customers/:customerId`
  + adres/IBAN/iletisim tercihleri alt uclari (CustomerDataAccess yeniden kullanildi). Profil/durum
  guncelleme, adres CRUD + default, IBAN ekle/sil + default (maskeli), iletisim tercihleri, siparis
  ozeti. PII minimizasyonu korunur (hash/token/OTP/plain secret yok; TCKN/VKN/IBAN maskeli).
- TODO-087: Store-admin customer creation and credential management — DONE (2026-06-28). Panelden yeni
  musteri olusturma (`POST /stores/:storeId/customers`; Ad Soyad + e-posta/telefon + durum + opsiyonel
  uyelik), admin-tetikli credential/oturum yonetimi ve guvenli aktivasyon/reset yaklasimi. ADR-035
  karari: admin KALICI SIFRE BELIRLEMEZ; `CustomerCredentialToken` (purpose ADMIN_ACTIVATION /
  ADMIN_PASSWORD_RESET, sha256 tokenHash, expiresAt, consumedAt, createdByUserId) uretir. Raw token
  yalniz uretim response'unda TEK SEFERLIK doner ve admin UI'da bir kez gosterilir (mail provider yok).
  Public `POST /public/stores/:storeSlug/customer/activate` token'i tuketir, parolayi set eder, ACTIVATION
  ise musteriyi ACTIVE yapar, mevcut tum oturumlari revoke eder. Storefront `/auth/activate?token=` sayfasi.
  Credential token uclari: `POST .../credential` (uyelik yoksa), `.../credential/reset` (uyelik varsa),
  `.../sessions/revoke` (tum oturumlari sonlandir). Detail response'a `security` blogu (hasCredential,
  passwordChangedAt, activeSessionCount; hash ASLA donmez). Status PASSIVE/BLOCKED login/session/checkout'u
  zaten engelliyordu (test ile dogrulandi). Iliski: TODO-075 (musteri self-service) ve TODO-076 (gercek
  e-posta/SMS teslimat) ACIK kalir.
- TODO-088: Store-admin orders — tutar araligi (min/max total) filtresi. TODO-073'te erteleme: temel 5
  filtre (siparis/odeme/karsilama durumu, tarih, arama) tamamlandi; tutar araligi opsiyoneldi ve scope'u
  buyutmemek icin ertelendi. Gateway `orderListQuerySchema`'ya `minTotal`/`maxTotal` + where (`totalAmount`
  gte/lte), UI'da iki sayisal alan + URL query. Kucuk ek; ayri PR.
- TODO-077: Guest gecmis siparis baglama — F3B.3'te yalniz checkout anindaki yeni siparis customerId'ye
  baglanir; mevcut guest order'larin (customerEmail ile) hesaba retro baglanmasi sonraki faz.
- TODO-079: Account orders detail and post-order actions — DONE (2026-06-28). Hesabim > Siparislerim
  musteri-facing operasyonel seviyeye cikarildi. Ust baslik + aciklama; URL query ile korunan 3 sekme
  (Siparisler / Tekrar Satin Al / Henuz Kargoya Verilmedi: `?section=orders&tab=all|buy-again|not-shipped`)
  ve "tum siparislerde ara" (sipariş no / urun adi / varyant / SKU; `&q=`, dogal dilli arama-bos durumu).
  Sipariş karti: durum/odeme/karsilama rozetleri (musteri-facing dürüst label), tutar, satirlar (gorsel
  ALTYAPISI YOK → harf placeholder), post-order CTA'lar. Dedicated detay route `/account/orders/[orderNumber]`
  (yalniz kendi siparisi; baska musteri/yok → notFound 404): tutar kirilimi, satirlar, teslimat adresi,
  fatura ozeti (taxId MASKELI), odeme GÜVENLI alanlari (saglayici/maskeli kart/taksit/islem no/3DS/odeme
  tarihi; PAN/CVC/token/hash YOK). Backend: `GET /public/stores/:slug/customer/orders` genisletildi
  (fulfillmentStatus + line variantId/productSlug/sku), yeni `GET .../customer/orders/:orderNumber` (allowlist
  + own-only). "Tekrar satin al" storefront Server Action: order satirlarini GÜNCEL katalogdan dogrular
  (`resolveCart`); yalniz hala satilabilir + stokta varyantlari uygun adetle sepete ekler, mevcut olmayan
  urunler icin "Bazı ürünler artık mevcut değil." uyarisi (eski sipariş FIYATINA güvenilmez — bkz. DECISIONS
  buy-again karari). Iade/destek/yorum CTA'lari bu fazda PLACEHOLDER (gercek lifecycle yok): iade 15 gün
  penceresi + FULFILLED/PARTIAL kosulu UI'da uygulanir, süre dolunca "İade süresi doldu" notu; yorum yalniz
  teslimat (FULFILLED) sonrasi aktif. i18n TR/EN paritesi (sekme/arama/kart/detay/iade/destek/yorum/buy-again/
  rozet/bos durumlar). Testler: gateway (own-list, detay own + GÜVENLI ödeme alanlari + maskeli taxId, baska
  musteri detay 404, guest 401), storefront saf fonksiyonlar (sekme/arama/iade penceresi/yorum). Gercek
  iade=TODO-081 (F3C/F3K), gercek destek ticket=TODO-080 (F3K), gercek review=TODO-082 (F3E), gercek kargo
  takip=TODO-083 ile baglandi.
- TODO-080: Musteri destek / "Bize Ulasin" ticket sistemi (F3K). TODO-079'da "Ürün desteği al" CTA dürüst
  placeholder ("yakında aktif olacak"); gercek ticket olusturma + `?section=contact&topic=order-support&
  order=...` hedef bolumu bu faz. ACIK.
- TODO-081: Gercek iade talebi lifecycle (F3C/F3K). TODO-079'da iade CTA yalniz 15 gün penceresi + FULFILLED/
  PARTIAL gorunurluk kurali (placeholder panel). Gercek iade workflow (talep olusturma, durum, onay/red,
  stok/odeme iadesi) bu faz. ACIK.
- TODO-082: Gercek urun degerlendirme/yorum modeli (F3E). TODO-079'da "Ürün yorumu yaz" CTA teslimat sonrasi
  aktif placeholder; gercek review entity + form + moderasyon bu faz. ACIK.
- TODO-083: Gercek kargo takip saglayici entegrasyonu. TODO-079 fulfillment rozetleri enum'dan türetilir
  (takip no üretilmez); gercek kargo provider + takip no/link bu faz. ACIK.
- TODO-089: Storefront RSC cookie serialization audit. TODO-079 smoke'unda gozlemlendi (pre-existing,
  F3B.3 deseni): Next `force-dynamic` + `cookies()` kullanan account sayfalari icin istemcinin KENDI httpOnly
  oturum cookie'sinin RSC flight payload'una serialize edildigi raporlanmisti (`addresses`/`profile`/`orders`).
  (DONE — denetim sonucu: uygulama kodu raw oturum jetonunu/cookie DEGERINI HICBIR yere sizdirmiyor.
  (1) Statik analiz: jeton yalniz sunucuda `readCustomerToken()` ile okunur ve YALNIZCA `x-customer-session`
  fetch header'ina konur (`lib/server/customer-cookie.ts`, `customer.ts`, `gateway.ts`); hicbir client
  component prop'una, Server Action donus degerine veya render agacina girmiyor. `loginAction`/
  `registerCompleteAction` jetonu yalniz `writeCustomerToken` ile httpOnly cookie'ye yazar, sonuc `{ ok }`
  dondurur. `CustomerAccount` view model'inde jeton/hash alani yok. (2) Build grep: `apps/storefront-web/.next/static`
  (client'a teslim edilen chunk'lar) MARKER'lardan tamamen temiz; `commerce_os_customer_session` yalniz
  server-only `.next/server/chunks` icinde LITERAL COOKIE ADI sabiti olarak gecer (raw deger degil).
  (3) Sentinel test: `test/account-session-boundary.test.tsx` — cookie'ye SENTINEL jeton konur; tum account
  bolumlerinin render ciktisi ve `loginAction` sonucu jetonu ICERMEZ, ama gateway fetch header'i jetonu
  TASIR (jeton'un dogru sekilde sunucu-yanli kullanildigi kaniti). Sonuc: orijinal gozlem buyuk olasilikla
  RSC navigation (`?_rsc=`) ISTEK Cookie header'inin (tarayicinin same-origin httpOnly cookie'yi otomatik
  gondermesi — httpOnly amacina UYGUN) YANIT payload'u ile karistirilmasidir; uygulama kaynakli sizinti yok.
  KARAR: logged-in full runtime RSC smoke YAPILMADI — gerekce: shared api-gateway restart + gecici OTP
  dev-code gerektirir, operasyonel risk ek kanit degerinden yuksek; statik analiz + build grep + sentinel
  test + guest redirect/health smoke yeterli. Ileride gerekirse izole stack ya da dev OTP'li ayri smoke ile
  yapilabilir.)
- TODO-090: Storefront client bundle'indan api-client VALUE import'larini cikar. TODO-079 smoke'unda
  gozlemlendi (pre-existing, F3B.3): `apps/storefront-web/components/account/sections/address-manager.tsx`
  ve `iban-manager.tsx` `@commerce-os/api-client`'tan VALUE import yapiyor (`isValidTckn`/`isValidTaxNumber`/
  `isValidTrPhone`/`isValidIban`); bu "use client" component'lerinde tum api-client (gateway'e baglanan
  `createApiClient` dahil) client bundle'a giriyor. Guvenlik etkisi dusuk (client gateway'e dogrudan
  baglanmaz; olu/tree-shake edilmemis util — secret icermez) ama proje kurali "createApiClient client
  bundle'da olmamali". Cozum: TR validator'lari client-safe bagimsiz bir alt-modulden export et
  (`@commerce-os/api-client/validators` veya contracts saf modulu) ve client component'leri ona gecir.
  Dogrulama: build sonrasi `grep -rE createApiClient apps/storefront-web/.next/static` bos donmeli.
  (DONE — commit de66ae3: TR validator'lar saf `@commerce-os/contracts/validators` modulune tasindi,
  `@commerce-os/api-client/validators` alt-yolu eklendi, 5 client component (address/iban/checkout/
  payment-tester/register-flow) ona gecirildi; classifyIdentifier zod'dan arindirildi. Dogrulama:
  `grep createApiClient .next/static` bos; secret/token grep bos; typecheck/lint/test/build yesil.)
- TODO-094: F3C.1 Shipping provider foundation (DHL eCommerce + Geliver + MOCK). Mağaza-scoped opsiyonel
  kargo saglayici altyapisi: ShippingProviderConfig/Credential/Shipment/ShipmentEvent/ShipmentQuote modelleri
  + migration; ayri SHIPPING_ENCRYPTION_KEY (AES-256-GCM, fallback YOK → CONFIG_MISSING); provider-bagimsiz
  adapter sozlesmesi + MOCK/DHL/Geliver adapter foundation; gateway store-admin uclari (provider CRUD +
  credential upsert/clear + test + order rate/create-order/create-barcode + CBS preview); api-client +
  contracts; destructive guard'lar (createOrder/createbarcode/label-purchase varsayilan 409); unit testler.
  Isimlendirme: UI "DHL eCommerce", teknik "MNG/api.mngkargo.com.tr". (DONE — bkz. ADR-039..042, PHASE_LOG
  F3C.1 Faz A + Faz B. Faz A backend foundation + Faz B store-admin Kargo Sağlayıcıları ayar sayfası + sipariş
  detayı kargo paneli + BFF + i18n + testler + docker runtime smoke tamam. Canlı destructive operasyonlar
  varsayılan guard altında; controlled rollout TODO-095..097'de. Geliver REST yolları SDK'dan türetildi,
  canlı doğrulanmadı.)
- TODO-094B: Shipping provider safe external verification. (1) UI/backend dürüstlük düzeltmesi (DONE):
  testConnection artık GERÇEK provider HTTP yanıtı alınmadan "OK" dönmez — SHIPPING_SANDBOX_HTTP_ENABLED=false
  iken `status=HTTP_DISABLED`, `lastTestStatus` OK yerine HTTP_DISABLED/SKIPPED/FAILED yazılır; provider config
  yanıtına `credentialStatus` (CONFIGURED/INCOMPLETE/MISSING) ve `connectionStatus` (UNTESTED/OK/FAILED/
  HTTP_DISABLED/SKIPPED) + `lastProviderHttpStatus/TestType/TestAt/ErrorCode` eklendi (migration
  20260629120000); UI "Kimlik bilgileri kayıtlı; gerçek API çağrısı yapılmadı." gösterir; sipariş paneli
  HTTP kapalı uyarısı; sepetteki ₺49,90'ın provider quote DEĞİL sabit mağaza kuralı olduğu netleştirildi.
  (2) GERÇEK external verification (DONE — 2026-06-29): credential dosyası
  (.secrets/commerce-os-shipping.local.env, değerler yazdırılmadan process env olarak) ile güvenli read-only
  doğrulama yapıldı (testapi.mngkargo.com.tr + x-api-version). Sonuç: DHL Identity token POST /mngapi/api/token
  → HTTP 200 (JWT alındı) ✓; CBS getcities/getdistricts → HTTP 401 (IBM gateway product auth: CBS_INFO ürünü
  bu X-IBM anahtarı için sandbox'ta abone değil); Standard Query /calculate → HTTP 401 (Bearer ile bile;
  STANDARD_QUERY ürünü abone değil). Geliver Bearer auth GEÇERLİ (GET /api/v1/providers, /shipments,
  /transactions → 200); adapter'daki /geo/cities yolu 404'tü → testConnection /providers'a düzeltildi.
  createOrder/createbarcode/createRecipient/acceptOffer ÇALIŞTIRILMADI.
- TODO-094C: F3C.1 DHL TEST/LIVE base URL + x-api-version + Plus Command (DONE — 2026-06-29). DHL adapter artık
  mode'a göre host çözer: TEST → DHL_ECOMMERCE_TEST_BASE_URL (yoksa TEST_BASE_URL_MISSING, CANLI host'a fallback
  YOK), LIVE → DHL_ECOMMERCE_LIVE_BASE_URL; tüm DHL isteklerine zorunlu x-api-version (DHL_ECOMMERCE_API_VERSION)
  header'ı eklendi. ShippingCredentialType enum'a PLUS_COMMAND, ShippingProviderConfig'e allowRecipientCreate
  (migration 20260629130000); createRecipient adapter skeleton + RECIPIENT_CREATE_DISABLED guard (env flag +
  config.allowRecipientCreate + explicitConfirm üçlüsü; default KAPALI — bu turda canlı/sandbox createRecipient
  YOK). Cart provider quote contract'ı (cartShippingQuoteResponseSchema: provider/source/status/amountMinor/
  currency/errorCode/message/calculatedAt) eklendi. Store-admin'e allowRecipientCreate toggle.
- TODO-094D: Cart/checkout provider shipping quote uygulaması — GERİ ÇEKİLDİ / F3C.2'ye TAŞINDI (2026-06-29).
  KARAR: DHL eCommerce bir OPERASYON sağlayıcısıdır (Identity, CBS, createRecipient, createOrder, createbarcode,
  tracking); DHL `calculate` cart/checkout kargo fiyatı için KULLANILMAYACAK. Bu nedenle sepet/checkout kargo
  bedeli provider'dan CANLI çekilmeyecek; ayrı bir faz olan F3C.2 Shipping Price Engine ile çözülecek (bkz.
  TODO-108). cartShippingQuoteResponseSchema yalnızca contract seviyesinde bırakıldı (storefront/backend
  uygulaması YOK). Mevcut sabit kargo kuralı provider quote DEĞİLDİR; güncel kargo fiyat listeleri mağaza/admin
  tarafından F3C.2'de girilecek.
- TODO-095: DHL eCommerce canli createOrder controlled rollout. Env+config+explicitConfirm guard'i ile gercek
  Standard Command /createOrder; idempotent referenceId, hata sinifları, sipariş→Shipment yasam dongusu.
- TODO-096: DHL eCommerce canli createbarcode controlled rollout. Barcode Command /createbarcode (faturalastirma
  → shipmentId/invoiceId/barcodes); etiket URL/PDF saklama; updateshipment/cancelshipment guard'li akis.
- TODO-097: Geliver canli etiket satin alma (transactions.acceptOffer) controlled rollout. Offer polling →
  normalized rate, acceptOffer guard kaldirma kriterleri, createReturn.
- TODO-098: Checkout shipping price engine. Sepette/checkout'ta tahmini kargo ucreti (calculate/offer) — su an
  checkout'a BAGLANMADI.
- TODO-099: Customer-facing kargo takip UI (storefront). DONE — TODO-117 ile kapandı (storefront sipariş
  detayında shipment takip kartı + "işlem noktası" timeline; allowlist DTO, secret yok). Canlı provider
  trackShipment/status SYNC'i ayrı kalır (TODO-100/104).
- TODO-100: DHL Bulk Query toplu gonderi sync (getShipmentByDate/getStatusChangedShipments) runtime entegrasyonu.
  (KISMEN DONE — 2026-07-03, ADR-048: provider-agnostic toplu sync RUNTIME YOLU eklendi:
  `POST /stores/:storeId/shipping/shipments/sync-all` terminal olmayan gonderileri mevcut applySync
  (getShipmentStatus+trackShipment, adapter dispatch) ile senkronlar; limit≤50, DISABLED provider skipped,
  gonderi basina hata kod bazli rapor. KALAN: DHL Bulk Query saglayici-ozel toplu ucun bu ucun arkasina
  takilmasi — sandbox'ta STANDARD_QUERY/BULK_QUERY urunleri abone olmadigi icin canli dogrulanamiyor
  (bkz. TODO-107); zamanlanmis otomatik sync worker job'i TODO-129.)
- TODO-101: DHL Finance Query fatura/komisyon mutabakat entegrasyonu.
- TODO-102: DHL CBS sehir/ilce/mahalle kod cache/sync production hardening (su an read-only preview).
- TODO-103: DHL Identity token refresh akisi (OpenAPI /refresh belirsiz) + kalici/dagitik token cache.
- TODO-104: Shipping webhook production verification — DONE (2026-07-03, ADR-048). Public uc
  `POST /public/shipping/webhooks/:webhookToken` platform-normalize sozlesme
  (shippingWebhookEventRequestSchema) kabul eder; kullanici auth YOK ama her istekte HMAC-SHA256 imza
  (`x-shipping-signature` + `x-shipping-timestamp`, RAW BODY uzerinden, timingSafeEqual/constant-time)
  ZORUNLU. Eksik/gecersiz imza → 401 + DB yazimi yok; timestamp toleransi 300 sn (replay penceresi);
  pencere ici duplicate/replay'i `ShipmentWebhookInbox` unique (providerConfigId, eventKey) keser —
  shipment guncelleme + WEBHOOK_RECEIVED event ATOMIK transaction, duplicate yeni event uretmez.
  Secret/token admin `POST .../providers/:id/webhook/rotate` ile uretilir (AES-256-GCM saklanir, yalniz
  rotate yanitinda BIR KEZ plain; config DTO'sunda yalniz `webhookConfigured` boolean). Bilinmeyen
  statusCode durumu DEGISTIRMEZ (ADR-045 regres korumasi); eslesmeyen gonderi/bozuk payload audit'li
  IGNORED inbox kaydi + 200 ACK; shipment aramasi {storeId, providerConfigId} scoped → cross-store
  mutasyon imkansiz. KALAN: DHL/Geliver HAM webhook format + provider imza semasi adaptorleri TODO-130
  (canli abonelik/dogrulama sonrasi); store-admin webhook yonetim UI TODO-128. Payment webhook imzasi
  (TODO-071) bagimsiz ACIK.
- TODO-105: Marketplace alanları — Trendyol (TRND) + N11 entegrasyon desteği (ürün/sipariş/stok senkron alanları,
  provider abstraction'a marketplace tipi). Henüz tasarım aşamasında.
- TODO-106: ZPL render/print desteği — Barcode Command /createbarcode çıktısındaki ZPL'i önizleme/yazdırma
  (label PDF/PNG render + yazıcı akışı). TODO-096 ile bağlantılı.
- TODO-107: DHL production static IP authorization checklist — canlı (api.mngkargo.com.tr) erişim için sabit IP
  beyanı/whitelist süreci, API Zone abonelik onayı (CBS_INFO/STANDARD_QUERY/STANDARD_COMMAND/BARCODE_COMMAND/
  PLUS_COMMAND ürünleri), callback URL kaydı doğrulaması.
- TODO-108: F3C.2 Shipping Price Engine — DONE (ADR-044). Kargo bedeli mağaza TARİFE planından hesaplanır
  (ShippingRatePlan + ShippingRateRule; price-engine.ts saf fonksiyon). Admin tarife yönetimi UI
  (/shipping/rates), storefront cart/checkout kargo satırı (ADDRESS_REQUIRED/NO_RATE_PLAN/free/amount), sipariş
  kargo snapshot'ı, demo store default rate plan seed (eski ₺49,90/₺750 buraya taşındı). DHL eCommerce operasyon
  sağlayıcısı olarak kalır; fiyat motoru ondan bağımsızdır.
- TODO-109: Kargo bölge yönetimi UI + şehir/ilçe → bölge (regionCode) eşleme. DESI_AND_REGION_TABLE modeli
  destekler ama admin UI ilk sürümde minimal (şehir/ilçe kodu serbest metin); regionCode storefront adresinden
  henüz türetilmiyor (EngineAddress.regionCode = null). DHL CBS geo kod cache'iyle (TODO-102) entegre edilebilir.
- TODO-110: Ürün/varyant kargo ölçümü admin UI alanları — DONE. Ürün formuna (product-form.tsx) ve varyant
  editörüne (variants-manager.tsx) "Kargo ölçüleri" bölümü eklendi (shippingWeightKg / shippingDesi; >0 doğrulama,
  boş=null). Contracts product/variant create/update + response şemaları alanları kabul/dönüyor; serialize Decimal→
  number; cart hesaplaması varyant→ürün fallback (resolveShippingDims). i18n TR/EN, testler (contracts validation,
  resolveShippingDims, UI render, i18n parity) ve runtime smoke (demo-tote checkout kargo hesaplandı; dims yoksa
  MISSING_SHIPPING_DIMENSIONS → ödeme bloke). KALAN (yeni TODO-115): gerçek en/boy/yükseklik boyut alanları +
  volumetrik desi otomatik hesabı (en×boy×yükseklik / divisor, default 3000); şimdilik kullanıcı hesaplanmış desiyi
  girer (billableWeight = max(kg, desi) precomputed shippingDesi ile çalışır).
- TODO-115: Gerçek ürün boyut alanları (en/boy/yükseklik) + otomatik volumetrik desi (divisor default 3000). Şu an
  admin yalnız hesaplanmış desi/ağırlık girer; ölçü alanlarından otomatik desi türetme ileride.
- TODO-111: Kargo tarife matris girişi + CSV import — KISMEN DONE (F3C.4). Matris/grid girişi (DESİ × Tarife
  I/II/III ve DESİ/KG × zone), DHL şablonu (tier yoksa Tarife I/II/III otomatik oluşturur), CSV **paste** import
  (server-side parse, TR ondalık 116,99/₺116,99, ; ve TAB ayraç), değişiklik önizleme/özet (oluştur/güncelle/
  değişmeyen/boş) ve apply DONE. Backend authoritative, store-scoped, transaction'lı; YALNIZ upsert (matris
  kapsamı dışındaki özel/gelişmiş kurallar korunur). Uçlar: POST .../matrix/{preview,apply} ve .../import/
  {preview,apply}. UI: store-admin /shipping/rates → "Matris" sekmesi (ana akış), Basit/Gelişmiş korunur.
  KALAN (sonraki faz): (a) CSV/Excel **file upload** (şu an yalnız paste), (b) toplu **export**, (c) zone için
  generic şablon butonu. Gelişmiş kural editörü hâlâ tekil/istisnai kurallar + surcharge için mevcut.
- TODO-113: 30+/31+ satır semantiği provider teyidi. F3C.4'te matris UI'da 30+ satırı için **davranış seçimi**
  eklendi: "Eşik üstü birim ücret" (PER_ADDITIONAL_KG_OR_DESI; varsayılan) veya "Sabit toplam ücret" (FLAT,
  maxDesi/maxWeightKg=null = "ve üzeri"). Admin gerekirse satır bazında değiştirir. DHL/Aras resmi tarifesinden
  "30+/31+" satırının TOPLAM mı yoksa ek-birim mi olduğu teyit edilince varsayılan/yorum netleştirilecek.
- TODO-114: Adres → zon (zoneCode) çözümleme. EngineAddress.zoneCode şu an null (server city→zone maplemiyor);
  zoneId'li kurallar yalnız zoneCode upstream çözülünce eşleşir. Şehir/ilçe → zon eşleme tablosu (Aras bölge
  tanımları / DHL CBS geo cache TODO-102) ile doldurulacak.
- TODO-112: Sipariş sonrası DHL operasyon otomasyonu — checkout sonrası createRecipient/createOrder/createbarcode
  akışının (admin onaylı veya otomatik) tarife motoruyla ilişkilendirilmesi. Marketplace TRND/N11 kargo alanları
  (bkz. TODO-105) bu akışa bağlanır.
- TODO-116 (ÇÖZÜLDÜ — DHL yanıtı): DHL kargo İPTAL endpoint'i teyit edildi →
  `PUT /mngapi/api/barcodecmdapi/cancelshipment`, gövde `{ referenceId, shipmentId }`.
  `DhlEcommerceAdapter.cancelShipment` implement edildi (guard: env DHL_ECOMMERCE_ALLOW_CANCEL +
  providerConfig + explicitConfirm; shipmentId yoksa CANCEL_REQUIRES_SHIPMENT_ID). `/dhl/cancel` route
  status→CANCELLED + CANCELLED event yazar; UI iptal aksiyonu shipmentId varsa aktif (onay copy'li).
  ENDPOINT_UNRESOLVED kaldırıldı. Kalan: canlı (production) iptal davranışı TODO-118 rollout ile.
- TODO-117: Müşteri tarafı kargo takip UI'si — DONE (TODO-117). Storefront müşteri sipariş detayına
  (`/account/orders/[orderNumber]`) kargo takip kartı eklendi: sağlayıcı (ad + logo / baş harf fallback),
  müşteri-facing durum rozeti, takip no + harici takip linki, 4 adımlı stepper (Hazırlanıyor → Yolda →
  Dağıtımda → Teslim edildi) ve "işlem noktası" timeline'ı. Gateway müşteri sipariş detayı
  (`GET /public/stores/:slug/customer/orders/:orderNumber`) en güncel shipment'ı ALLOWLIST DTO ile döner
  (`customerOrderShipmentSchema`): yalnız providerName/logoUrl/logoAlt/status/trackingNumber/trackingUrl/
  lastLocation/updatedAt/events. SECRET/iç alan (barkod/ZPL, labelUrl, externalOrderId/ShipmentId,
  referenceId, rawSafeJson, alıcı PII) ÇEKİLMEZ/sızmaz; operasyonel-iç event'ler (barkod/webhook/iç oluşturma)
  konum taşımıyorsa müşteri timeline'ından dışlanır. ADR-045 KORUNUR: "Kargoya verildi" otomatik üretilmez
  (ORDER_CREATED hazırlık adımı; teslim yalnız DELIVERED), konum kesin varış değil → "işlem noktası". Own-only
  izolasyon zaten getOrderDetail'de (store+customer+orderNumber); shipment additive nullable, mevcut akış
  bozulmaz. i18n TR/EN paritesi (`account.orders.detail.tracking.*`). Testler: gateway (shipment allowlist +
  secret yok + event filtresi + status passthrough; shipment yoksa null), filtre unit (isCustomerVisibleShipmentEvent),
  storefront saf helper (step index / tone / problem-cancel / initials). TODO-099 (eski kopya) bu işle kapanır.
  KALAN: gerçek kargo provider canlı tracking sync (TODO-100/104) ve checkout'ta provider seçimi/logo (TODO-125).
- TODO-118: DHL canlı (production) rollout checklist — statik IP / client onayı, LIVE base URL geçişi,
  guard flag'lerinin (ALLOW_ORDER/BARCODE/RECIPIENT/CANCEL) canlıda kontrollü açılması, gerçek müşteri adresi →
  MNG cityCode/districtCode çözümleme (CBS geo cache, TODO-102). NOT: barcode "hat kodu" hatası artık
  BARCODE_RETRYABLE_ERROR + BARCODE_FAILED event ile retryable (ADR-045); rollout'ta retry/uyarı UX'i + boş
  yanıt (LABEL_PENDING) için otomatik retry/backoff (bkz. TODO-123) doğrulanmalı.
- TODO-119 (ÇÖZÜLDÜ): Sağlayıcı HTTP timeout env-configurable (DHL_ECOMMERCE_HTTP_TIMEOUT_MS,
  default 60000; timeout→SHIPPING_HTTP_TIMEOUT 504). F3C.3 runtime smoke'ta MNG sandbox ~15s
  latency'sinin sabit 15s timeout'u sınırda abort etmesi üzerine eklendi.
- TODO-120 (ÇÖZÜLDÜ — DHL yanıtı geldi, uygulandı): DHL operasyon finalizasyonu yapıldı.
  Uygulanan aksiyonlar: (a) statusCode 0-7 normalize eşlemesi + regresyon koruması; (b) createbarcode boş
  200 → LABEL_PENDING + BARCODE_PENDING event (tracking/ZPL set edilmez, retry mümkün); (c) hat kodu hatası →
  BARCODE_FAILED event + BARCODE_RETRYABLE_ERROR (createOrder tekrar çağrılmaz); (d) cancel endpoint
  (TODO-116); (e) location "işlem noktası" UI label; (f) "Kargoya verildi" otomatik kullanılmaz; (g) additive
  enum migration. Provider-agnostic refactor HARİÇ (TODO-121). createRecipient boş 200 body başarı sayılır.
- TODO-121 (F3C.5 — UI/domain ayrımı UYGULANDI; tam engine refactor KISMİ): Provider-agnostic **Shipment
  Operations UI + Shipment domain** ayrımı yapıldı (ADR-046). Uygulanan: (a) DB additive
  `ShippingProviderConfig.logoUrl/logoAlt` + `ShipmentEventType.MANUAL_TRACKING` (migration
  `20260630160000`); (b) gateway store-level uçlar `GET /shipping/shipments` (filtre + KPI), `GET
  /shipping/shipments/:id` (order+müşteri+provider+generic capability), generic aksiyon alias'ları
  `create-label`/`sync`/`cancel`/`manual-tracking` (mevcut DHL adapter/aksiyon mantığı `applyCreateLabel/
  applySync/applyCancel/applyManualTracking` helper'larına çıkarıldı, order-scoped DHL route'ları da bunları
  paylaşır); (c) generic capability projeksiyonu `computeShipmentActionCapabilities`
  (canPrepare/canCreateLabel/canSync/canCancel/canManualTracking) + KPI kovaları + provider gorunum DTO; (d)
  store-admin **shipment list** `/shipping/shipments`, **shipment detail** `/shipping/shipments/[id]`
  (provider-safe stepper, "İşlem noktası" timeline, generic action paneli), **order özet kartı** (tam DHL
  operasyon paneli KALDIRILDI → salt-okunur özet + "Kargo Detayına Git" CTA);
  (e) provider logo desteği (config UI create/edit + preview + initials fallback; liste/detay/özet/sağlayıcı
  ekranlarında gösterim); (f) nav linki + TR/EN i18n. KAPSAM DIŞI (sonraki tur): cancel için dedike
  `providerConfig.allowCancel` toggle (şu an `allowOrderCreate` + `DHL_ECOMMERCE_ALLOW_CANCEL` env kapısı),
  tam provider-agnostic engine/registry (UI generic ama backend dispatch hâlâ DHL adapter'a), "Müşteriye
  Bildirim Gönder" (UI'da pasif + not), manuel shipment ana akışı, **tarife detail-page refactor**
  (`/shipping/rates` matris/şablon gelişmiş akışı — F3C.4 üzerine, ayrı tur), storefront provider logo
  (checkout'ta provider SEÇİMİ yok → yalnız altyapı + TODO).
  - **F3C.5 manuel inceleme fix (5dc3cfb üzerine):** (a) manuel takip no girişi artık hazırlık aşamasındaki
    (DRAFT/ORDER_CREATED/LABEL_PENDING/LABEL_CREATED) gönderiyi `IN_TRANSIT`'e ilerletir (regres yok),
    `MANUAL_TRACKING` event "Manuel takip numarası eklendi." — yalnız explicit manuel aksiyon, DHL createbarcode
    otomatik handoff DEĞİL (ADR-046); (b) order özet kartı dış sağlayıcıya İSTEK ATMAZ → destructive inline
    create form kaldırıldı, shipment yoksa güvenli özet + "Kargo Gönderileri" linki, varsa "Kargo Detayına Git";
    (c) guard copy'lerinden yanıltıcı "Canlı" kelimesi kaldırıldı → "güvenlik kilidi" çerçevesi (TR/EN); (d)
    list/detail/order summary tek status helper + takip no yoksa "Henüz oluşmadı" fallback.
  - **Tarife UI borcu (F3C.4B — `/shipping/rates` detail-page refactor, AYRI TUR):** inline edit KALDIRILACAK;
    `/shipping/rates/new` ve `/shipping/rates/[id]` sayfaları yapılacak; "DHL şablonu oluştur" ana buton OLMAYACAK
    (bu turda copy "Şablon seç" yapıldı); ana aksiyon "Şablon seç" olacak; DHL yalnız preset olacak. (Bu tur sadece
    copy düzeltildi; backend/matrix engine'e dokunulmadı.)
- TODO-125 — Checkout kargo SAĞLAYICI/SEÇENEK seçimi + storefront provider/logo akışı. Durum: **DONE**
  (ADR-047). Bir "kargo seçeneği" = AKTİF `ShippingRatePlan` + price-engine ücreti (store TARİFE'si, ADR-044;
  provider canlı quote DEĞİL) + (varsa) ENABLED `ShippingProviderConfig` görünüm bilgisi (ad + public logo).
  Paralel kargo modeli YOK. Uygulanan: (a) DB additive — `Order.shippingProvider/shippingProviderName/
  shippingLogoUrl/shippingEtaText` + `ShippingRatePlan.deliveryEstimate` (migration `20260701120000`); (b) public
  uçlar `POST /public/stores/:slug/cart` ve `/checkout` artık `shipping.options[]` + `selectedOptionId` döner
  (müşteri-güvenli ALLOWLIST: secret/credential/account no/label/barcode YOK); istek `shippingOptionId` kabul eder;
  (c) checkout SUNUCU-OTORİTER doğrular: ücreti seçilen plandan YENİDEN hesaplar (istemci fiyatına güvenmez —
  tamper imkânsız, body'de fiyat alanı yok ve strip edilir), cross-store/inactive/bilinmeyen id `SHIPPING_OPTION_INVALID`,
  çoklu seçenek + seçimsiz `SHIPPING_OPTION_REQUIRED`, uygun seçenek yok `SHIPPING_QUOTE_UNAVAILABLE` (NO_RATE_PLAN
  geriye dönük korunur), tek seçenek otomatik seçilir; (d) sipariş SNAPSHOT'i (provider/hizmet/ücret/para/logo/ETA)
  `createOrder`'a yazılır → tarihsel sabitlik; (e) sipariş onayı (`shippingOption`), müşteri sipariş detayı
  (`shippingSelection`, shipment canlı takibinden AYRI) ve store-admin sipariş detayı (özet satırı + `orderSchema.
  shippingSelection`) seçimi gösterir; (f) storefront checkout'ta seçilebilir provider kartları (radio, dropdown
  DEĞİL; logo veya baş-harf fallback, fiyat/ETA, seçim cookie'ye yazılıp sayfa revalidate ile toplamı günceller);
  tek/çok/yok durumları + net TR mesajlar; (g) store-admin tarife formu `deliveryEstimate` alanı; seed demo verisi
  (2 ENABLED provider + 2 aktif tarife). i18n TR/EN paritesi. Testler: gateway (çoklu seçenek listesi + provider
  ad/logo, seçim→ücret/snapshot, toplam değişimi, tamper-yok, cross-store red, tek-seçenek auto), saf builder
  (`checkout-options`: default/en-ucuz/requested seçim, fiyatlanamayan plan dışlanır, adres yok→fiyatsız, provider
  fallback), storefront helper (logo/initials). TODO-117 shipment takip testleri yeşil kalır.
  KALAN: provider logo dosya UPLOAD/asset storage (artık TODO-127); şu an `logoUrl` manuel public URL.
- TODO-127 — Provider logo upload/storage. Durum: TODO (eski TODO-125'ten ayrıldı). `ShippingProviderConfig.logoUrl`
  şu an manuel public URL (geçici MVP, dış bağımlılık). İleride dosya upload / asset storage / media library ile
  yönetilmeli; `logoAlt` korunur. Checkout/success/admin'de logo gösterimi TODO-125 ile zaten devrede.
- TODO-126 — Manuel gönderi (online-first fallback). Durum: **UYGULANDI** (online-first revizyonuyla). Karar
  revize edildi: order CTA artık online-first (createRecipient + createOrder) + güvenli fallback. Uygulanan:
  (a) `POST .../orders/:orderId/shipping/shipment-draft` — provider'a İSTEK ATMAZ, yerel ORDER_CREATED shipment
  (recipient/pieces siparişten) + manuel işaretli event; (b) order özet kartı "Gönderi Oluştur" online dener,
  sağlayıcı hatasında "Geçici sağlayıcı hatası… Manuel Gönderi Hazırla" CTA'sına düşer; (c) başarıda shipment
  detayına yönlendirir. KALAN/opsiyonel: generic createOrder shipment id döndürmediğinden detaya yönlendirme
  refetch ile yapılıyor (DHL prepare id döndürür); ileride generic createOrder da id döndürebilir.
- TODO-122 — Docker dev image clean-build gap. Durum: ÇÖZÜLDÜ (TODO-137, 2026-07-03). Tracked `infra/docker/node.Dockerfile`
  `pnpm build` ÇALIŞTIRMIYOR (yalnız `pnpm install` + `pnpm db:generate`); api-gateway dev runtime bazı
  workspace paketlerini (`@commerce-os/config` `dist/index.js`, `@commerce-os/db` `dist/src/index.js`,
  contracts/api-client) `dist/` üzerinden çözüyor. Temiz checkout / build context içinde `dist/` yoksa
  image ayağa kalkmayabilir (api-gateway `ERR_MODULE_NOT_FOUND`). F3C.4 Docker/main-context smoke host'ta
  derlenmiş `dist/` bulunduğu için geçti (önceki worktree-docker smoke'larıyla aynı pattern). CI/deploy
  öncesi: Dockerfile'a build adımı eklenmeli VEYA workspace paketlerine `development` export koşulu (src'den
  çözme) stratejisi netleştirilmeli. Kapsam: Repo infra / Docker. Bloklayıcı: F3C.4 için HAYIR;
  deploy/CI hardening için EVET.
- TODO-128 (DONE — 2026-07-04): Store-admin webhook yönetim/gözlem UI. Kargo Sağlayıcıları
  sayfasına "Webhook" modalı eklendi: webhook durum rozeti, tam webhook URL (kopyala butonu),
  secret rotate CTA (yeni secret YALNIZ BİR KEZ gösterim + uyarı + kopyala; ADR-035 deseni) ve
  son webhook olayları tablosu (receivedAt/provider/eventKey/outcome/shipmentId; RAW payload/imza/
  secret/payloadHash GÖSTERİLMEZ). Yeni yetkili tekil uç `GET /stores/:storeId/shipping/providers/
  :id/webhook` (mağaza+provider SCOPED inbox projeksiyonu, limit default 20/max 50, güvenli DTO
  allowlist'i). Webhook URL, yeni `PUBLIC_WEBHOOK_BASE_URL` env'inden üretilir; tanımsızsa panel
  net uyarı gösterir (URL üretmez). Token bulk config DTO'suna EKLENMEZ (TODO-104 sızıntı testi
  yeşil kalır); tam URL yalnız bu tekil uçta döner (rotate ile aynı admin-görünür token deseni).
  HMAC/timestamp/idempotency/rotate semantiği DEĞİŞMEDİ. Rotate BFF + `webhookInfo` api-client
  metodu + storeApi wrapper'ları eklendi. Testler: api-gateway 8 + store-admin 6.
- TODO-129: Zamanlanmış shipment sync worker'ı (DONE — 2026-07-04, ADR-051). Provider-agnostic çekirdek
  `sync-service.ts` (uygun gönderi seçimi + adapter dispatch + regresyon korumalı durum ilerletme + event
  idempotency) hem yeni zamanlanmış döngü (`sync-worker.ts`, api-gateway süreci içinde; gerekçe ADR-051)
  hem manuel `sync-all`/tekil sync uçları tarafından kullanılır (drift yok). `Shipment`'a minimal sync
  metadata'sı eklendi (`lastSyncAt/nextSyncAt/syncAttempts/lastSyncErrorCode` + 2 index; migration
  `20260704120000_add_shipment_sync_metadata`). Env: `SHIPMENT_SYNC_ENABLED` (varsayılan false; docker dev
  compose açık) + `SHIPMENT_SYNC_INTERVAL_SECONDS/BATCH_SIZE/STALE_AFTER_MINUTES/MAX_ATTEMPTS` — hepsi
  PR #15 boş-string desenine toleranslı. STATUS_CHANGED artık yalnız gerçek değişimde yazılır (tekrarlanan
  polling duplicate event üretmez; `lastSyncedAt` DTO'su `Shipment.lastSyncAt`'ten beslenir). Sync
  desteklemeyen sağlayıcı (MOCK/GELIVER) `PROVIDER_SYNC_UNSUPPORTED` ile güvenle atlanır; gönderi başına
  hata batch'i durdurmaz; DELIVERED/terminal asla regres etmez; NOT_FOUND/4xx/5xx durumu İLERLETMEZ
  (backoff + sanitize hata kodu). Testler: `shipping-sync-service.test.ts` (25). Kalan: TODO-123 (barcode
  retry) aynı çekirdek/worker desenini paylaşabilir; ham provider webhook adapter'ları TODO-130'da.
- TODO-130 (DONE — 2026-07-04, ADR-055; Geliver ham format ÖRNEK BEKLİYOR): Provider HAM webhook payload
  adapter katmanı (`webhook-adapters.ts`). İmza doğrulama SONRASI çalışan saf normalize fonksiyonu:
  PLATFORM sözleşmesi (ADR-048) tüm sağlayıcılar için aynen çalışır (geriye uyum); DHL_ECOMMERCE(=MNG)
  için yalnız repoda GROUNDED şekiller çözülür (getshipmentstatus-benzeri durum push'u + trackshipment-
  benzeri kümülatif hareket push'u; alan adları mappers.ts OpenAPI eşlemeleriyle birebir — uydurma alan
  yok). Eşleştirme önceliği externalShipmentId → trackingNumber → referenceId ({storeId, providerConfigId}
  scoped; PII/adresle eşleşme ve webhook'tan shipment yaratma YOK). Idempotency: PLATFORM yolu mevcut
  anahtarı korur (evt:/sha256:), ham şekiller volatil alansız normalize deterministik `nrm:` hash;
  inbox unique (providerConfigId, eventKey) dedupe kapısı DEĞİŞMEDİ. Durum eşleme sync ile AYNI
  `mapProviderStatusToShipmentStatus` fold'u (bilinmeyen kod ilerletmez, terminal regres etmez); çoklu
  hareketler doğal anahtarla (shipmentTrackingEventKey, TRACKING_UPDATED∪WEBHOOK_RECEIVED) dedupe edilip
  ek WEBHOOK_RECEIVED yazılır. Migration YOK, kontrat değişikliği YOK. KALAN: (1) Geliver ham formatı =
  güvenli IGNORED_UNSUPPORTED ("örnek payload gerekli") — gerçek örnek gelince adapter doldurulacak;
  (2) sağlayıcının KENDİ imza şeması (platform HMAC yerine) canlı callback kaydı/abonelik (TODO-107)
  sonrası ayrı iş — güvenlik modeli zayıflatılmadan mevcut HMAC korunur. Testler:
  `shipping-webhook-adapters.test.ts` (18), mevcut `shipping-webhook.test.ts` (17) yeşil.
- TODO-123 (DONE — 2026-07-04, ADR-054): Barkod retry/backoff (transient otomatik, veri-hatası admin
  düzeltmesi bekler). Üç sınıf (`barcode-service.ts`): RETRYABLE (timeout/5xx/network) → üssel backoff
  (`stale·2^(deneme-1)`, 6 saat cap, `BARCODE_RETRY_MAX_ATTEMPTS` sonra `MAX_ATTEMPTS` blok); DATA_FIX
  (`DESTINATION_BRANCH_NOT_FOUND`, `ADDRESS_DISTRICT_CODE_REQUIRED`, `CBS_CODE_INVALID`, `RECIPIENT_EMAIL_*`)
  → otomatik denenmez; TERMINAL (`AUTH_FAILED`/`*_DISABLED`) → otomatik denenmez. Ayrı additive Shipment
  metadata (`barcodeRetryCount`/`barcodeNextRetryAt`/`barcodeLastAttemptAt`/`barcodeRetryBlockedReason`;
  TODO-129 sync alanlarından bağımsız). Manuel "Barkod/Etiket Oluştur" + zamanlanmış
  `barcode-retry-worker.ts` (TODO-129 deseni; `BARCODE_RETRY_ENABLED=false` varsayılan) AYNI `attemptBarcode`
  çekirdeğini kullanır. **TODO-124/TODO-139 etkileşimi:** repair-destination + adres düzenleme
  `lastBarcodeErrorCode` + retry blok/sayaç/backoff'u sıfırlar → DATA_FIX bloğu kalkar, deneme yeniden
  anlamlı. Idempotent `BARCODE_FAILED` (ilk hata/kod değişimi/yeni blok). Sahte başarı yok; durum yalnız
  barkod kanıtıyla ilerler; duplicate guard + CustomerAddress bozulmaz. UI: retry durumu (sonraki deneme/
  sayaç/blok nedeni) + "Şimdi Tekrar Dene" + DATA_FIX CTA. Testler: `shipping-barcode-retry.test.ts` (28),
  `shipping-barcode-route.test.ts` (2), `shipment-screens.test.tsx` retry UI (4).
- TODO-124: CBS il/ilçe kod eşleme + admin varış onarımı (DONE — 2026-07-04, ADR-052). Kök neden (OS-000053):
  UI recipient'ı sipariş adresinden yalnız cityName/districtName ile kuruyordu, cityCode/districtCode hiç
  gönderilmiyordu; adres metni ilçe seçimiyle tutarsız olunca MNG createOrder'ı kabul edip createbarcode'da
  500 kod 20001 "VARIŞ ŞUBESİ BULUNAMADI" veriyordu. Uygulanan: (1) `cbs-resolver.ts` — TR-güvenli normalize
  (tr-TR lower + diakritik katlama; İstanbul/ISTANBUL/uskudar/kucukcekmece) ile CBS il/ilçe listesinden YALNIZ
  exact-match kod çözümü (fuzzy YOK; aynı ada farklı kodlu çift = muğlak = eşleşmedi), providerConfig-bazlı
  6 saat TTL in-memory cache (CBS aşırı çağrılmaz); (2) prepare + generic create-order (DHL) sağlayıcı
  çağrısından ÖNCE kodları çözer: geçerli saklı kod (>0) aynen korunur (OS-000050 yolu), 0/geçersiz kod asla
  gönderilmez (TODO-132 korunur), CBS verisi varken il/ilçe eşleşmezse sağlayıcı ÇAĞRILMADAN 422
  ADDRESS_DISTRICT_CODE_REQUIRED; CBS erişilemezse/ilçe metni yoksa eski isim-bazlı davranış sürer
  (OS-000041/43 regresyonu korunur); serbest adres metninden ilçe TAHMİN EDİLMEZ; (3) barkod 20001/"VARIŞ
  ŞUBESİ" → `DESTINATION_BRANCH_NOT_FOUND` sınıflandırması: BARCODE_FAILED event (rawSafeJson.errorCode +
  admin-güvenli TR statusText), yeni `Shipment.lastBarcodeErrorCode` kolonu (başarı/pending/onarım sıfırlar),
  route 409 PROVIDER_DESTINATION_BRANCH_UNRESOLVED (retryable; durum İLERLEMEZ, sahte başarı YOK — ADR-045
  korunur); (4) admin onarım: `POST /stores/:id/shipping/shipments/:sid/repair-destination` — kod CBS'e karşı
  SUNUCUDA yeniden doğrulanır (CBS_CODE_INVALID), Shipment recipient SNAPSHOT'ı güncellenir (sipariş/müşteri
  adresi mutasyona uğramaz), aynı referenceId ile createRecipient sağlayıcıya yeniden iletilir; reddedilirse
  yerel düzeltme korunur + providerResent=false döner (UI sınırlamayı açıkça söyler: mevcut kargo kaydı
  otomatik güncellenmeyebilir); DESTINATION_REPAIRED event yazılır; (5) yeni CBS ilçe ucu
  `POST .../shipping/dhl/cbs/districts` (+mevcut cities/preview ucu cache'e bağlandı); (6) store-admin
  shipment detayında "Varış İl/İlçe Eşlemesi" kartı: il/ilçe + kargo il/ilçe kodları + eşleşme rozeti +
  "Adres İl/İlçe Eşlemesini Düzelt" paneli (CBS dropdown, "CBS'den Eşleştir" otomatik ön seçim,
  kaydet+yeniden ilet, retry rehberi); capability `canRepairDestination` (yalnız DHL + ORDER_CREATED/
  LABEL_PENDING); order kartı 422'yi spesifik mesajla gösterir. Migration:
  `20260704130000_add_shipment_destination_repair` (enum DESTINATION_REPAIRED + Shipment.lastBarcodeErrorCode;
  additive-only). Duplicate guard / webhook HMAC / sync worker / ödeme guard'ına DOKUNULMADI. Testler:
  `shipping-cbs-mapping.test.ts` (28). KALAN/SINIRLAMA: MNG'nin mevcut sipariş kaydında varış güncellemesini
  kabul ettiği garanti değil; OS-000053/54/55 gibi takılı sandbox kayıtları onarım+retry ile düzelmezse yeni
  sipariş/gönderi gerekebilir (barkod öncesi cancelshipment shipmentId olmadığından çağrılamaz). TODO-123
  retry/backoff bu sınıflandırmayı tüketmelidir.
- TODO-131: F3C.6 DHL sandbox verification & hardening (DONE — 2026-07-03, ADR-049). Sağlanan 6 OpenAPI dokümanı
  (Identity/CBS/Plus/Standard Command/Standard Query/Barcode) mevcut adapter'la satır satır karşılaştırıldı +
  güvenli read-only sandbox smoke yapıldı (Identity token 200, getcities 200/82 şehir, getdistricts/34 200/40 ilçe,
  bilinmeyen referans getshipmentstatus/trackshipment 404 ProblemDetails, calculate → aşağıda). Düzeltilen kusurlar:
  (1) `parseProviderDate` dd-MM-yyyy (tire) formatını `Date.parse`'ın ABD MM-DD tuzağına düşürüyordu → regex önce,
  ayraç [./-], saat opsiyonel; (2) trackshipment KÜMÜLATİF liste her sync'te yeniden TRACKING_UPDATED yazıyordu →
  insert-seviyesi dedupe (`shipmentTrackingEventKey`) + müşteri timeline ardışık-duplikasyon filtresi
  (`dedupeConsecutiveShipmentEvents`); (3) HTTP >=400 sorgu/operasyon yanıtı başarı gibi parse ediliyordu (404 →
  junk STATUS_CHANGED, calculate 4xx → 0 TL quote, createOrder 400 → null-id sahte başarı) → status-aware normalize:
  404 sorgu → PROVIDER_SHIPMENT_NOT_FOUND (404), diğer → PROVIDER_QUERY_FAILED (502) / PROVIDER_OPERATION_FAILED
  (redaksiyonlu mesaj); (4) SANDBOX↔DOKÜMAN ÇELİŞKİSİ: calculate binder'ı cityCode/districtCode'u STRING ister
  (OpenAPI integer der; integer → 400 code 4002 "System.String") → string gönderiliyor; (5) MNG hata zarfı gerçekte
  `{error:{code|Code,message|Message,description|Description}}` nested/PascalCase → extractProviderErrorMessage
  genişletildi; (6) .env.example eksik DHL değişkenleri eklendi; (7) statusCode 8 (Destek_Gerekiyor) bilerek
  eşlenmemiş — bilinmeyen kod durumu İLERLETMEZ (testle sabitlendi). KALAN: calculate sandbox'ta HTTP 500 code 20001
  "<WERR>[] NOLU ŞUBENİN İLİ BULUNAMADI" döner (test müşteri hesabında şube ataması yok — hesap/provizyon kısıtı;
  ADR-044 gereği calculate checkout fiyatı için kullanılmadığından etki düşük). createOrder/createbarcode/cancel bu
  turda ÇAĞIRILMADI (dokümanlar faturasız/güvenli olduğunu belirtmiyor; F3C.3'te zaten uçtan uca doğrulanmıştı).
  Webhook formatı dokümanlarda YOK → provider-özel webhook adaptörü eklenmedi; TODO-130 AÇIK kalır.
- TODO-132: MNG/DHL createRecipient e-posta çözümleme + payload doğrulama (DONE — 2026-07-03). Runtime bulgu:
  store-admin "Gönderi Oluştur" 502 (PROVIDER_OPERATION_FAILED) veriyordu; MNG sandbox createRecipient'ı 400 kod
  26039 ("'Recipient. Email' geçerli bir e-posta adresi değil") ile reddediyordu çünkü adapter `email: ""`
  gönderiyordu (UI recipient'ı sipariş adresinden e-postasız kuruyor, sipariş e-postası hiç kullanılmıyordu).
  Fix: (1) alıcı e-postası SUNUCU-otoriter çözülür — Order.customerEmail → Customer.email fallback (trim +
  format doğrulama); geçerli e-posta yoksa sağlayıcı ÇAĞRILMADAN 422 RECIPIENT_EMAIL_REQUIRED/INVALID;
  (2) DHL builder'ları (`buildDhlRecipientBody`) boş/geçersiz e-postayla istek ÜRETMEZ (email:""/null imkansız);
  (3) cityCode/districtCode 0 GÖNDERİLMEZ — bilinmiyorsa alan atlanır (OpenAPI: opsiyonel int32, CBS'ten alınır;
  ad alanları yeterli — sandbox 200 doğrulandı); (4) telefon MNG doküman örneğindeki yerel 10 haneye normalize
  (+90/0 öneki soyulur); (5) MNG 26039 → RECIPIENT_EMAIL_INVALID normalize + `extractProviderErrorCode` (kod
  mesaja güvenli işlenir); (6) i18n TR/EN + order kargo kartında spesifik aksiyon mesajı. İKİNCİ runtime bulgu:
  createOrder `content: ""` ile açıklamasız 400 veriyordu — OpenAPI Order.content+description REQUIRED →
  boşsa referenceId fallback gönderilir (sandbox 200). Sandbox doğrulama: OS-000054 prepare → HTTP 201,
  Shipment ORDER_CREATED (createRecipient 200 + createOrder 200); barkod/iptal ÇAĞIRILMADI. KALAN: TODO-124
  (CBS otomatik kod eşleme) açık; kullanıcı stack'inde docker api-gateway rebuild gerekir.
- TODO-133 — Prepare başarısını shipment/order durum özetine yansıt (DONE — 2026-07-03). NOT: iş kalemi
  brief'te "TODO-127" olarak adlandırıldı; ancak repo'daki TODO-127 = "Provider logo upload/storage" (AÇIK,
  farklı iş) olduğundan numara çakışmasını önlemek için bu düzeltme TODO-133 olarak kaydedildi. Kök neden:
  state reflection/copy hatası — backend prepare/createOrder başarısında zaten `Shipment.status=ORDER_CREATED`
  yazıyor + `ORDER_CREATED` event kaydediyor ve `Order.status`'u DEĞİŞTİRMİYOR (doğru), ancak UI kopyası
  yanıltıcıydı: durum etiketi "Gönderi kaydı oluşturuldu" idi ve "kargonun alımı bekleniyor" ipucu yoktu.
  ADR-045/049 semantiği korunur (createOrder başarısı = kargo firmasında KAYIT açıldı; kargoya verildi/yolda/
  teslim DEĞİL). Uygulanan (yalnız yansıtma/kopya, mimari değişmez): (a) store-admin `shipment-ui`
  ORDER_CREATED etiketi → "Gönderi oluşturuldu"/"Shipment created", açıklaması → "Kargonun alımı bekleniyor.
  Kargo firmasında kayıt açıldı."/"Waiting for carrier pickup…"; yeni `isAwaitingPickupStatus` yardımcısı;
  order özet kartı hazırlık durumunda bekleme ipucunu gösterir; (b) müşteri storefront i18n TR/EN
  `statusValues`/`eventValues` ORDER_CREATED → "Gönderi oluşturuldu" + yeni `preparedNote` "Kargonun alımı
  bekleniyor."; takip kartı hazırlık aşamasında bu notu gösterir; (c) müşteri-güvenli: gateway customer DTO
  ORDER_CREATED event `statusText`'ini null'lar (admin operasyonel metni "…(DHL gönderi kaydı)" sızmaz →
  i18n kullanılır); iç id/secret/ham payload YOK. Testler: store-admin `shipment-ui`/order özet, storefront
  `shipment` + i18n kopya, gateway `customerSafeShipmentEventStatusText`; duplicate prepare 409 +
  event/status tekrarsızlığı ve "prepare success ≠ shipped/in-transit/delivered" mevcut testlerle korunur.
- TODO-135 — Sipariş listesi/başlık karşılama rozetlerini shipment hazırlık durumuna yansıt (DONE —
  2026-07-03). Kök neden: TODO-133 shipment DETAY kartını düzeltti ama sipariş ÖZET/liste rozetleri hâlâ
  `Order.fulfillmentStatus`'u DOĞRUDAN okuyordu (`Shipment.status`'tan türetilmiyordu) → prepare başarısına
  (ORDER_CREATED) rağmen store-admin liste/başlık "Gönderilmedi", storefront hesabım listesi "Henüz kargoya
  verilmedi" gösteriyordu. Backend prepare/mimari DEĞİŞMEZ; yalnız gösterim yansıtması. Uygulanan: (a) yeni
  paylaşılan SAF helper `getOrderFulfillmentDisplay(fulfillmentStatus, shipmentStatus)` + `pickOrderShipmentStatus`
  (`@commerce-os/contracts`, api-client'tan re-export) — öncelik: iptal>DELIVERED>IN_TRANSIT/OUT_FOR_DELIVERY>
  ORDER_CREATED/DRAFT/LABEL_* → SHIPMENT_CREATED, aksi halde fulfillment; ORDER_CREATED asla shipped/transit/
  delivered sayılmaz (ADR-045). (b) DTO allowlist: admin `orderSchema` + `customerOrderSummarySchema`'ya yalnız
  temsili `shipmentStatus` DURUM enum'u eklendi (statusText/iç ID/ham payload YOK; gateway `orderSelect`/
  `listOrders` `shipments.status` çeker, birden çok gönderide en ileri durum seçilir). (c) UI: store-admin
  liste + detay hero rozeti ve storefront `OrderStatusBadges` display helper üzerinden çözülür; yeni i18n
  `fulfillmentDisplayLabels` (store-admin TR/EN) + `fulfillmentDisplay` (storefront TR/EN) — "Gönderi
  oluşturuldu"/"Shipment created". `Order.status`/`Order.fulfillmentStatus` MUTATE EDİLMEZ. Testler: contracts
  helper/DTO allowlist (11), store-admin liste/detay rozet (ORDER_CREATED→"Gönderi oluşturuldu", shipment
  yok→"Gönderilmedi", IN_TRANSIT→"Yolda"), storefront `order-badges` (ORDER_CREATED, no-shipment, IN_TRANSIT/
  DELIVERED). KALAN: kullanıcı stack'inde docker api-gateway + store-admin-web + storefront-web REBUILD gerekir;
  runtime doğrulama (OS-000054/OS-000055) merge/rebuild sonrası.
- TODO-136 — Karşılama durum kopyasını netleştir + ödemesiz siparişe gönderi guard'ı (DONE — 2026-07-03). İki
  parça. (A) Kopya: TODO-135'in tek `SHIPMENT_CREATED` gösterim durumu operasyonel olarak yetersizdi; hazırlık
  aşaması iki nete ayrıldı — ORDER_CREATED/LABEL_PENDING → `AWAITING_PICKUP` ("Kargonun Alınması Bekleniyor"),
  LABEL_CREATED → `PACKED` ("Kargo İçin Paketlendi"); OUT_FOR_DELIVERY artık IN_TRANSIT'e çökmez (`OUT_FOR_DELIVERY`
  → "Dağıtımda"); kargo kaydı yok → NOT_SHIPPED etiketi "Hazırlanıyor" oldu ("Gönderilmedi"/"Henüz kargoya
  verilmedi" kaldırıldı). Aynı sözlük tüm yüzeylerde: store-admin liste "Karşılama Durumu", detay hero, kargo
  özet kartı + shipment detay/liste rozeti (`SHIPMENT_STATUS_LABEL`), storefront hesap listesi + takip
  `statusValues`, "Hazırlanıyor" sekmesi; i18n TR/EN. `getOrderFulfillmentDisplay` yeniden eşlendi (ADR-045
  korunur: ORDER_CREATED asla shipped/transit/delivered). "Henüz Teslim Alınmadı" etiketi bilinçli olarak OTOMATİK
  türetilmedi (mevcut mimaride ORDER_CREATED/LABEL_CREATED'ten ayıran ayrı provider sinyali yok; müşteri teslim
  durumuyla karışma riski — brief uyarısı). (B) Guard: ödemesi alınmamış sipariş kargoya VERİLEMEZ. Yeni SAF
  helper `isOrderPaidForShipment(paymentStatus)` (PAID/AUTHORIZED uygun; UNPAID/REFUNDED engelli — mevcut domain
  `succeeded` semantiği, ADR-050). Backend NİHAİ otorite: `create-order` + `dhl/prepare` + `shipment-draft`
  uçları sağlayıcı çağrısından/Shipment/ShipmentEvent yaratımından ÖNCE 409 `ORDER_PAYMENT_REQUIRED` döner.
  Store-admin kargo kartı ödemesiz siparişte "Gönderi Oluştur"u pasifleştirir + "Ödeme alınmadan gönderi
  oluşturulamaz." yardımcı metni. Ödeme provider/checkout/DHL/MNG/webhook mimarisi DEĞİŞMEZ. Testler: contracts
  helper (`isOrderPaidForShipment` + gösterim eşlemesi), api-gateway `shipping-payment-guard` (unpaid create-order/
  prepare/draft → 409, Shipment/ShipmentEvent YOK; paid guard'ı geçer), store-admin `order-shipment-summary`
  (unpaid buton pasif + yardımcı metin; paid aktif) + liste/hero rozet, storefront `order-badges`/`shipment`
  kopya. Tüm mevcut TODO-117/125/132/133/135 testleri yeşil. KALAN: kullanıcı stack'inde docker api-gateway +
  store-admin-web + storefront-web REBUILD; runtime doğrulama merge/rebuild sonrası.
- TODO-137 — Docker deterministik clean-build + cache hijyeni (DONE — 2026-07-03). TODO-122'nin çözümü;
  TODO-135/136 runtime rebuild'lerinde ortaya çıkan gerçek altyapı boşluğu. Kök neden: `infra/docker/
  node.Dockerfile` yalnız `pnpm install` + `pnpm db:generate` yapıyor, `pnpm build` YOK; ayrıca `.dockerignore`
  yoktu → `COPY apps/packages/services` host'tan üretilmiş artifact'leri (bayat `packages/*/dist`, host
  `node_modules` [darwin/arm64], `apps/*/.next`, `.turbo`) imaja sızdırıyordu. Dev container'ları paketleri
  derlenmiş `dist/`'ten import ettiği için bayat host `dist` → `does not provide an export named
  'pickOrderShipmentStatus'` çökmesi (TODO-135 rebuild). Workaround: host'ta önce `pnpm db:generate && pnpm build`
  — kırılgan. Çözüm: (A) `.dockerignore` eklendi — `node_modules`/`**/node_modules`, `dist`/`**/dist`, `.next`/
  `**/.next`, `build`, `*.tsbuildinfo`, `packages/db/generated`, `**/.prisma`, `.turbo`, `coverage`, `.env*`
  (`!.env.example`), `.git`, `.claude` (iç içe worktree'ler — dev), `docs`, `*.log`, `.DS_Store` dışlandı;
  kaynak/manifest/lockfile/Prisma şema+migration/Next config KORUNDU. (B) Dockerfile artifact'leri İMAJ İÇİNDE
  üretir: `pnpm install --frozen-lockfile` (lockfile'dan deterministik, pnpm store cache mount) → `pnpm
  db:generate` → `pnpm exec turbo run build --filter="./packages/*"` (paylaşılan paket `dist`'leri; backend app
  `tsx watch` kaynaktan, web app `next dev` — app bundle gerekmez ama ikisi de paketleri `dist`'ten import eder).
  Runtime komutları (`pnpm --filter <ws> dev`) DEĞİŞMEDİ — yalnız build katmanı. Doğrulama: host gate'leri yeşil
  (typecheck 0, lint 34/34, test 355 passed, `git diff --check` temiz); Docker clean-build — api-gateway +
  store-admin-web + storefront-web imajları paylaşılan Dockerfile'dan build oldu (12 paket İMAJ İÇİNDE taze
  derlendi, 0 cached), build context host artifact sızıntısı OLMADAN 2.98MB'a düştü; imaj-içi kanıt: api-gateway
  bağlamında `import('@commerce-os/contracts').pickOrderShipmentStatus === 'function'` (bayat-export senaryosu
  çözüldü), `@commerce-os/db` import OK (Prisma client pnpm sanal store'da), web-app bağlamında
  `@commerce-os/api-client` import OK; container platformu linux/arm64 (host darwin sızıntısı yok). App/domain
  mantığı DEĞİŞMEDİ — yalnız Docker/build hijyeni. Cache hijyeni: bkz. docs/OPERATIONS.md (clean build + `docker
  builder/image/container prune`; volume'lara DOKUNULMAZ). KALAN: main'e merge sonrası kullanıcı ana `docker`
  stack'ini `--no-cache` gerekmeden rebuild edebilir; host'ta önce `pnpm build` ARTIK GEREKMEZ.
- TODO-139 — Sipariş teslimat adresi snapshot düzenleme (DONE — 2026-07-04). İş problemi: sipariş oluştuktan
  sonra yanlış/tutarsız adres kalan siparişlerde admin'in teslimat adresini — gönderi henüz taşınmaya
  başlamadan — güvenle düzeltebilmesi. Kök neden: TODO-124 repair YALNIZ `Shipment` il/ilçe KODLARINI düzeltir;
  `OrderAddress(SHIPPING)` snapshot'ı ile ad/telefon/adres satırı/il-ilçe İSİMLERİ düzenlenemiyordu (Order
  snapshot bayat kalıyordu). Snapshot kaynak-otoritesi: sipariş adresi = `OrderAddress(SHIPPING)` (kargo kodu
  YOK); kargo kodları/operasyon = `Shipment.recipient*`. Uygulanan: yeni `PATCH /stores/:storeId/orders/
  :orderId/shipping/address` (shipping/routes.ts) — ownership + store-admin auth; güvenli durum guard'ı
  (`ADDRESS_EDITABLE_SHIPMENT_STATUSES = DRAFT|ORDER_CREATED|LABEL_PENDING`; aktif gönderi başka durumdaysa 409
  `SHIPMENT_ADDRESS_LOCKED` — LABEL_CREATED/IN_TRANSIT/…/DELIVERED/RETURNED/CANCELLED KİLİTLİ; TODO-124 repair
  guard'ıyla birebir tutarlı). İşlem: (1) `OrderAddress(SHIPPING)` transaction'da güncellenir/oluşturulur;
  (2) `OrderEvent(type="SHIPPING_ADDRESS_UPDATED")` yazılır (String — migration YOK); (3) gönderi düzenlenebilirse
  `Shipment` alıcı snapshot'ı da güncellenir; (4) DHL ise CBS il/ilçe çözümü/doğrulaması — client'tan gelen
  cityCode/districtCode CBS'e karşı YENİDEN doğrulanır (`validateCodes`; körü körüne güvenilmez), kod
  verilmezse yeni isimden EXACT-match (`resolveRecipientGeo`; fuzzy YOK), eşleşmezse bayat kod NULL'lanır
  (0/negatif ASLA persist); (5) geçerli kod eşleşince `lastBarcodeErrorCode` temizlenir; (6) `ShipmentEvent`
  DESTINATION_REPAIRED yeniden kullanılır (yeni enum YOK). Sağlayıcı onarımı: DHL + güvenli + geçerli kodlu ise
  `createRecipient` yeniden iletilir (TODO-124 guard deseni); başarısız/desteklenmezse yerel snapshot KORUNUR,
  `providerResent:false`/`providerRepairSupported:false` döner (sahte başarı YOK). Duplicate shipment guard'a
  DOKUNULMAZ (yeni gönderi OLUŞTURULMAZ); MÜŞTERİ adres defteri (CustomerAddress) global mutasyona UĞRAMAZ —
  yalnız BU sipariş. UI: order detay kargo kartına (`order-shipment-summary` → yeni `edit-shipping-address`)
  "Teslimat Adresini Düzenle" + CBS il/ilçe dropdown'ları + kapsam uyarısı + kilit kopyası + `providerResent:false`
  sınırlama kopyası; kayıt sonrası `router.refresh()` + kart yeniden yükleme. Migration: HAYIR. Testler:
  api-gateway `shipping-address-update` (9: no-shipment→yalnız OrderAddress, ORDER_CREATED/LABEL_PENDING→her iki
  snapshot + DESTINATION_REPAIRED event, IN_TRANSIT/DELIVERED/LABEL_CREATED→locked, ownership 404, non-admin 401,
  duplicate guard/customer-address dokunulmaz), CBS kod doğrulama guarantee'leri `shipping-cbs-mapping` (validateCodes
  CBS_CODE_INVALID + isValidGeoCode(0)=false) ile korunur; store-admin `edit-shipping-address` (5: güvenli/kilit
  durum, CBS dropdown, kayıt→onSaved refresh, providerResent:false sınırlama kopyası). TODO-124/129/132/135/136
  testleri yeşil; TODO-123 sınırı DEĞİŞMEZ. NOT (TODO-123): retry job adres snapshot onarımından SONRA çalışmalı
  (düzeltilmiş kodlarla). KALAN: main'e merge sonrası docker api-gateway + store-admin-web REBUILD + runtime
  doğrulama (yanlış adresli/taşınmamış sipariş → geçerli Kadıköy adresi → snapshot+CBS+barkod retry; kilitli
  siparişte engel; müşteri adres defteri değişmez).
- TODO-140 — Kargo HAREKET metniyle Shipment.status ilerletme (DONE — 2026-07-04). İş problemi: TODO-130 ham
  webhook adapter'ından SONRA, gönderi timeline'ı "SMOKE AKTARMADA"/"SMOKE TRANSFER MERKEZİNDE" hareketleri
  gösterirken üst rozet "Kargo İçin Paketlendi" (PACKED) ve "Kargonun alımı bekleniyor." ipucunda TAKILI
  kalıyordu. Kök neden: `mapProviderStatusToShipmentStatus` YALNIZ `statusCode`+`isDelivered` bakıyordu;
  MNG/DHL sandbox hareket push'ları kod TAŞIMADAN yalnız `eventStatus` METNİ gönderdiğinden kod null →
  ilerleme yok. Müşteri/store-admin gösterimi zaten `Shipment.status`'tan doğru türetiyordu (IN_TRANSIT →
  "Yolda"); sorun kaynak-otorite durumun bayat kalmasıydı. Çözüm: `status-map.ts` içine paylaşılan saf
  `inferShipmentStatusFromTrackingText(text)` — Türkçe büyük/küçük + diakritik BAĞIMSIZ (NFD + noktalı/noktasız
  i sabitleme + ASCII fold) normalize eder; güçlü kanıt önceliğiyle TESLİM EDİLDİ→DELIVERED, DAĞITIMA
  ÇIKTI/DAĞITIMDA→OUT_FOR_DELIVERY, TRANSFER/AKTARMA/TAŞIMA/YOLDA/HUB/SORTING/DAĞITIM MERKEZ→IN_TRANSIT;
  zayıf metin (oluşturuldu/etiket/barkod/paketlendi/"teslim ALINDI") → null. `mapProviderStatusToShipmentStatus`
  artık kod + metin adaylarından EN İLERİ olanı (rank) seçer; terminal/regresyon koruması AYNEN korunur.
  KAPSAM: metin çıkarımı YALNIZ HAREKET (trackshipment / DHL_TRACKING) push'una uygulanır — DURUM push'u
  (getshipmentstatus / DHL_STATUS) ve PLATFORM sözleşmesi kod-güdümlü kalır (TODO-130'un "status-push metni
  tek başına kanıt değil" kuralı korunur). Webhook (`webhook-routes.ts`) ve zamanlanmış sync (`sync-service.ts`)
  AYNI yardımcıyı kullanır (drift yok); sync ayrıca `trackShipment` hareketlerini katarak ilerletir (önceden
  yalnız getShipmentStatus snapshot'ı ilerletiyordu). Idempotency/dedupe DEĞİŞMEDİ (event fingerprint durum
  metnini zaten taşıyordu; türetilen durum değil). Migration: HAYIR. Kontrat/DTO değişikliği: HAYIR (müşteri
  DTO allowlist'i olduğu gibi — ham payload dışarı sızmaz, statusText timeline-güvenli alan). Testler:
  `shipping-mappers.test.ts` (+6: metin→durum + kod-yok/terminal-koruma), `shipping-webhook.test.ts` (+4:
  DHL_TRACKING transfer→IN_TRANSIT, duplicate spam yok, zayıf metin durumu değiştirmez, TESLİM→DELIVERED),
  `shipping-sync-service.test.ts` (+2: hareket metniyle IN_TRANSIT, ileri durum geri çekilmez),
  `storefront-web/shipment.test.ts` (+1: IN_TRANSIT→"Yolda" adımı + bekleme ipucu yok). TODO-130/129/123/135/136
  testleri yeşil (882/882). KALAN: main'e merge sonrası docker api-gateway REBUILD + runtime doğrulama (SMOKE
  AKTARMADA hareketli mevcut gönderi → DB Shipment.status=IN_TRANSIT + müşteri/order rozet "Yolda").
- TODO-141 — Kargo UI cilası: tarih biçimi + durum yardımcı kopyası (DONE — 2026-07-05). Sorun: müşteri
  vitrini kargo hareket tarihlerini locale'siz `toLocaleString()` ile US biçiminde gösteriyordu
  (`7/4/2026, 6:00 PM`); store-admin ise `toLocaleString(locale)` ile saniye taşıyordu. Çözüm: yeni
  paylaşılan `formatDateTime(value, locale)` (`@commerce-os/i18n`) — 24 saat, saniyesiz, geçersiz→"—";
  TR `04.07.2026 18:00`, EN `en-GB` (AM/PM yok). Timezone'a DOKUNULMADI (yalnız biçim). Müşteri kartı:
  timeline `formatDateTime`'a taşındı + `locale` prop; dağınık üç not (prepared/problem/cancelled) tek,
  duruma-göre tutarlı `statusHelp` satırıyla birleşti (PACKED/AWAITING_PICKUP semantiği korundu, ADR-045).
  Admin: `[id]` detay (lastSync/event/retry×2), gönderi listesi (lastSync), order özet kartı (lastUpdate)
  → `formatDateTime`. Backend/domain/status-map/webhook/sync/retry DEĞİŞMEDİ; ham payload sızmaz. Testler:
  `storefront-web/shipment-tracking.test.tsx` (+7 render), `shipment.test.ts` (statusHelp), `i18n.test.ts`
  (+6 formatDateTime), `store-admin-web/shipment-screens.test.tsx` (+1 admin tarih). Gate'ler yeşil
  (db:generate, pnpm -r build, typecheck, lint, test 34/34, git diff --check temiz). ADR YOK (mimari karar
  yok). KALAN: merge sonrası storefront-web (+ değiştiyse store-admin-web) REBUILD + runtime doğrulama.
- TODO-141b — Müşteri sipariş SALT-tarih alanları US MM/DD/YYYY düzeltmesi (DONE — 2026-07-05). TODO-141
  timeline'ı düzeltti ama sipariş başlığı/liste/ödeme tarihleri hâlâ locale'siz `toLocaleDateString()` ile
  US `7/4/2026` gösteriyordu (kullanıcı başlıkta fark etti). Çözüm: `formatDateTime` ile aynı kaynağa salt-tarih
  kardeşi `formatDate(value, locale)` (`@commerce-os/i18n`) — TR `04.07.2026`, EN `04/07/2026` (US değil),
  geçersiz→"—". Nerede: `[orderNumber]/page.tsx` (başlık createdAt + PaymentBlock paidAt), `account/page.tsx`
  (locale threading → OrdersSection), `orders-section.tsx` OrderCard (createdAt). `payment-tester.tsx` zaten
  tr-TR (dev aracı, kapsam dışı). Backend/DTO değişmedi. Testler: `i18n.test.ts` (+5 formatDate). Gate'ler
  yeşil (34/34). ADR YOK. KALAN: merge sonrası storefront-web REBUILD + runtime doğrulama.
- TD-036 — Config empty-string normalizasyon temizliği (DONE — 2026-07-05, ADR-057). Sorun: `env_file`'da
  `KEY=` bırakılan OPSİYONEL değerler Zod `url()`/`regex()`/enum/`coerce.number()` doğrulamasına takılıp
  api-gateway boot'unu çökertme sınıfıydı (PR #10/#15 nokta-atışı düzeltmişti; desen inline tekrar ediyordu).
  Çözüm: paylaşılan helper `packages/config/src/env.ts` (`emptyToUndefined`, `optionalEnv`, `optionalUrlEnv`,
  `optionalBooleanEnv`, `optionalNumberEnv`) — opsiyonel boş/whitespace → varsayılan/undefined; şema
  (`index.ts`) yeniden yazıldı, inline `z.preprocess` tekrarı kaldırıldı; `loadConfig` `safeParse` +
  `ConfigValidationError` (yalnız anahtar+mesaj, env değeri basılmaz → secret sızmaz). Strict kalanlar:
  `DATABASE_URL`/`REDIS_URL`/`INTERNAL_API_TOKEN`/`SESSION_SECRET`. Secret'lar dokunulmadı. İş mantığı/
  shipment/webhook/sync davranışı DEĞİŞMEDİ. Testler: `config.test.ts` (24, +20). Gate'ler yeşil
  (db:generate, build, typecheck, lint, config 24/24 + api-gateway 494/494, git diff --check). KALAN:
  merge sonrası docker api-gateway rebuild + boş opsiyonel env'lerle boot doğrulama.
- TODO-142 — Kargo sandbox uçtan uca smoke runbook + kontrol listesi (DONE — 2026-07-05). İş: kargo temeli
  (gönderi/DHL-MNG sandbox/CBS/adres/barkod/retry/sync/webhook/UI) büyük ölçüde tamam; kampanya MVP'sinden
  önce operatörün tekrarlanabilir bir smoke akışına ihtiyacı vardı. Çözüm: yeni `docs/runbooks/
  shipping-sandbox-smoke.md` — 11 bölüm (ön koşullar, ödeme uygunluğu `ORDER_PAYMENT_REQUIRED`, CBS/varış
  onarımı + 20001, prepare/duplicate, barkod 3 sınıf RETRYABLE/DATA_FIX/TERMINAL + manuel retry, sync
  worker + manuel sync-all + terminal hariç, webhook rotate/imza/duplicate/ham-payload sızmaz, müşteri UI
  TR-tarih/"Yolda"/"Kargonuz taşıma sürecinde.", admin UI, güvenlik kuralları, kopyala-yapıştır final rapor
  şablonu). OPERATIONS.md'ye kısa link/bölüm + web request-time env kuralı eklendi. Kod/domain DEĞİŞMEDİ
  (yalnız doküman). KALAN: yok (runbook operasyoneldir; ilk gerçek sandbox koşusunda TD-035 varış şubesi
  boşluğu 20001 olarak beklenir).
- TD-038 — Web app request-time env boş-string normalizasyonu (DONE — 2026-07-05). Sorun: TD-036 boot-time
  config'i normalize etti ama web app'lerin Next.js server bağlamında `process.env.X ?? default` ile
  okuduğu OPSİYONEL env'ler kapsam dışıydı; `API_GATEWAY_URL=` boş string `??` fallback'ini bypass edip
  boş/bozuk gateway URL'e (bozuk göreli fetch) düşebiliyordu. Çözüm: duz-string helper `optionalEnvString`
  (`packages/utils`) — `undefined|null|""|whitespace` → undefined (config'in zod `optionalEnv`'inin
  karşılığı; web bundle'a zod/`loadConfig` taşımaz). Gateway URL tek noktada düzeltildi:
  `resolveApiGatewayUrl` (`packages/api-client`) boş/whitespace `API_GATEWAY_URL`'yi "yok" sayar;
  storefront `gatewayBaseUrl()` buraya delege edildi (store-admin/admin zaten `createApiClient` üzerinden
  kullanıyor). Helper ile sarılanlar: cookie/CSRF adları (store-admin+admin session/csrf), demo mağaza
  slug'ları (storefront `env.ts`, store-admin `store-context.ts`), `STOREFRONT_BASE_URL` (aktivasyon
  linki — whitespace artık bozuk mutlak URL üretmez), `STOREFRONT_CART_SECRET`. Strict kalan:
  `INTERNAL_API_TOKEN`. Karşılaştırmalı okumalar (`NODE_ENV`/`ADMIN_COOKIE_SECURE`/`ADMIN_COOKIE_SAME_SITE`)
  zaten güvenli, dokunulmadı. `@commerce-os/utils` web app + api-client'a workspace dep olarak eklendi
  (zero-dep, bundle-safe; yeni ağır/zod bağımlılığı yok → ADR gerekmez). Testler: `utils/env.test.ts` (+6),
  `api-client` gateway URL (+6: undefined/""/whitespace/valid/explicit), `store-admin-web/activation-link.test.ts`
  (+4). Gate'ler yeşil (db:generate, pnpm -r build, typecheck, lint, test — utils 6/6, api-client 19/19,
  store-admin 161/161, storefront 101/101, admin 24/24, api-gateway 494/494; git diff --check temiz).
  KALAN: merge sonrası storefront/store-admin/admin-web rebuild + `API_GATEWAY_URL=` boş env ile boot/login
  redirect doğrulama.
- F4A — Kampanyalar & Kuponlar MVP (DONE — 2026-07-05, ADR-058). İş: Amazon/Hepsiburada kalıplarından
  esinlenen, güvenli kapsamlı kampanya/kupon temeli. Veri modeli: `Campaign` (DRAFT/ACTIVE/PAUSED/ARCHIVED;
  COUPON_CODE/AUTOMATIC_CART/PRODUCT_DISCOUNT/CATEGORY_DISCOUNT + BUY_X_GET_Y/FREE_SHIPPING/MEMBERSHIP_ONLY
  yalnız enum rezervi; PERCENT/FIXED_AMOUNT, max/min tutar, pencere, toplam+müşteri-başı limit, stackable,
  priority, usageCount) + `Coupon` (normalizedCode `@@unique([storeId, normalizedCode])` — mağazalar arası
  aynı kod serbest) + `CampaignProduct`/`CampaignCategory` kapsamı + `CampaignRedemption`
  (`@@unique([campaignId, orderId])`) + `OrderDiscount` (immutable sipariş indirim SNAPSHOT satırı).
  Migration: `20260705120000_add_campaigns_coupons` (additive). Motor: `apps/api-gateway/src/campaigns/
  discount-engine.ts` — SAF/deterministik (Math.round yüzde, eligible+kalan-subtotal cap, kupon önce,
  stackable=false seçilince başka kampanya yok, stackable'lar birleşir); kupon normalizasyonu locale-BAĞIMSIZ
  uppercase (TR-I tuzağı yok) + `[A-Z0-9_-]` format. DEMO10 hardcoded kuponu KALDIRILDI; public cart/checkout
  gerçek motoru kullanır (`couponReason` + `discountLines` public özet alanları eklendi; kampanya iç
  metadata'sı sızmaz). Checkout: geçersiz kupon 409 `COUPON_INVALID` (sessiz sıfır-indirim yok); createOrder
  transaction'ında limitler ATOMIK yeniden doğrulanır (koşullu updateMany + redemption COUNT; ihlal → rollback,
  sipariş oluşmaz), OrderDiscount + CampaignRedemption aynı transaction'da yazılır. Admin: `/stores/:storeId/
  campaigns` CRUD + activate/pause/archive (platform-admin + store scope; ARCHIVED düzenlenemez/terminal;
  detayda maskeli e-posta ile son kullanımlar + istatistik). Store-admin UI: `/campaigns` (liste/form/detay,
  kapsam seçici, nav + TR/EN i18n). Storefront: mevcut kupon input/apply/remove korunmuş; neden-bazlı TR/EN
  hata kopyaları (NOT_FOUND/INACTIVE aynı genel kopya — varlık sızdırmaz) + çoklu indirim satırı gösterimi;
  checkout 409 kupon hatası ayrı banner. Testler: motor 19 birim + gateway F4A API 10 + storefront kupon UI 4
  + store-admin sayfa 3; regresyon: api-gateway 523/523, storefront 105/105, store-admin 164/164. Gate'ler
  yeşil (db:generate, pnpm -r build, typecheck, lint, test, git diff --check). KALAN: merge sonrası docker
  rebuild (api-gateway + storefront-web + store-admin-web) + migration deploy + runtime smoke (TEST250
  senaryosu); ürün kartı kampanya rozeti ("Sepette %20", "Kuponlu ürün") bilinçli follow-up (public listing
  sözleşmesine dokunulmadı); iptal/refund'ta redemption iadesi YOK (kompanzasyon deseni yokken tarihsel kalır
  — ADR-058'de dokümante).
- F4A.1 + F4A.2 — Kampanya görünürlüğü, otomatik kupon kodu, sipariş kampanya paneli, kampanya analitiği
  (DONE — 2026-07-05, ADR-059). F4A.1: public ürün liste/detay DTO'suna additive `campaign` rozet alanı
  (`publicCampaignBadgeSchema` allowlist: kind/discountType/discountValue/minOrderAmountMinor; yalnız
  ACTIVE + isPublic + pencere açık + limiti dolmamış kampanyalar; kapsam eşlemesi ürün/kategori; seçim
  deterministik priority→id; iç metadata/kapsam listesi sızmaz — isPublic=false özel kupon public'te
  GÖRÜNMEZ). Paylaşılan etiket helper'ları `@commerce-os/utils` `getCampaignPublicLabel`/
  `getCampaignBadgeText` ("Sepette %10 indirim", "₺250 kupon", "Kuponlu ürün"). Vitrin: ürün kartı rozeti
  (kampanya > compareAt önceliği), ürün detayda fiyat yanı kampanya kutusu ("Sepette uygulanır" /
  "Kupon kodu gerektirir" / "₺X üzeri geçerli"), sepet+checkout indirim satırları kampanya ADIYLA
  (geçersiz kuponda otomatik kampanya satırı görünür kalır). Store-admin kampanya formunda "Otomatik
  Oluştur" kupon kodu üretici (TR→ASCII önek + indirim ipucu + 4'lü rastgele sonek; alan düzenlenebilir;
  benzersizlik kaynağı backend DUPLICATE_COUPON_CODE). F4A.2: `orderSchema.discounts` additive
  OrderDiscount SNAPSHOT satırları (id/campaignId/code/label/discountType/discountValue/
  discountAmountMinor/createdAt; scopeSummary raw sızmaz) + store-admin sipariş detayında "Kampanya /
  Kupon Bilgisi" kartı (tip rozeti kupon/otomatik, kod, indirim tip/değer, uygulanan tutar, öncesi/
  sonrası ara toplam, kargo, genel toplam, kullanım tarihi, snapshot notu; indirimsizde nötr metin).
  Kampanya detayına snapshot-tabanlı analitik (`campaignAnalyticsSchema`: kullanım, tekil müşteri,
  toplam indirim, ciro öncesi/sonrası, ortalama indirim/sipariş, ortalama sipariş tutarı, son kullanım)
  + son kullanımlar sipariş detayına LİNKLİ (orderTotal + maskeli e-posta ile). Kaynak doğrusu:
  OrderDiscount + CampaignRedemption (ADR-059; iptal edilen siparişler tarihsel olarak dahil, UI notu
  var). Migration YOK (tümü additive DTO/UI). Testler: utils etiket 10, gateway public-badge 15 +
  entegrasyon 2, storefront kart/detay 6+3, store-admin üretici 11 + form UI 2 + sipariş paneli 4 +
  analitik 2. KALAN: merge sonrası docker rebuild (api-gateway + storefront-web + store-admin-web) +
  runtime smoke; kampanya LİSTE kolonlarına toplam indirim/ciro (groupBy) ve tarih-aralıklı rapor sayfası
  + CSV export follow-up; analitik bellekte toplanır — yüksek hacimde SQL aggregate follow-up.
- F4A.3 — Kupon vs sepet indirimi UX düzeltmesi + kalıcı müşteri kupon cüzdanı (DONE — 2026-07-05,
  ADR-060). Gösterim taksonomisi: public rozet DTO'suna additive `displayKind`
  (AUTOMATIC_CART_DISCOUNT | PUBLIC_COUPON), `requiresCouponCode`, `couponCode` (nullable, yalnız public+
  ACTIVE+pencere geçerli iken), `couponAction` (CLAIM/APPLY/COPY/MANUAL_ONLY), `endsAt`. Otomatik: kart
  "Sepette %10", detay "Kod gerekmez"; public kupon: kart "Kuponlu ürün", detay KUPON KARTI (kod + "Kuponu
  ekle"/"Kodu kopyala" + alt limit + son kullanma). Private (isPublic=false) kupon hiçbir public yüzeyde
  görünmez; iç metadata sızmaz. Kalıcı cüzdan: `CustomerCoupon` (additive migration; customerId/email,
  status AVAILABLE/APPLIED/USED/REVOKED, source ADMIN_ASSIGNED/PUBLIC_CLAIMED/CODE_CLAIMED). Sepet
  "Kuponlar" alanı: kullanılabilir kupon kartları (Kullan/Uygulandı/Alt limit eksik) + iki adımlı "Kupon
  Kodu Ekle" (claim → sonra Kullan). Gateway uçları: `POST .../cart/coupons/claim|apply|remove`; sepet
  quote'una `availableCoupons`; sipariş transaction'ında cüzdan USED işaretleme (rollback güvenli).
  Store-admin: kampanya detayı (email ile) + müşteri detayı (kupon seçerek) kupon atama — ortak backend
  (`assignCoupon`); cross-store engeli; maskeli e-posta. İndirim kaynak doğrusu değişmedi (couponCode +
  motor; ADR-058); checkout semantiği/limit transaction korundu. Testler: utils discountText 2, gateway
  public-badge taksonomi + private dışlama + wallet projeksiyon/claim eval (yeni campaigns-wallet suite) +
  health public coupon 1, storefront kart/detay/sepet Kuponlar 7. KALAN: merge sonrası docker rebuild
  (api-gateway + storefront-web + store-admin-web) + runtime smoke; "Tüm Kuponlar" listeleme sayfası
  follow-up (dead link eklenmedi); misafire ATANAN kupon checkout email'ine kadar görünmez (kimlik boşluğu);
  store-admin atama UI'si için otomatik test follow-up (backend gateway testiyle kapsanıyor).

- F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi (DONE — 2026-07-05, ADR-060 devamı; yeni ADR
  yok). F4A.3'ten sonra eksik olan UX katmanı: müşteri kuponları keşfeder, görür, ekler ve kullanır.
  Rota: mevcut hesap konvansiyonu (`/account?section=coupons`) — sidebar/header menüsü + placeholder zaten
  bağlıydı; ayrı bir route açılmadı. Oturum zorunlu (misafir → mevcut `/auth/login` redirect'i). Yeni uç
  (müşteri-scoped + store-scoped): `GET /public/stores/:slug/customer/coupons` → allowlist'li kupon merkezi
  kartları: kullanılabilir (PUBLIC isPublic+ACTIVE + bu müşteri/email cüzdanı ASSIGNED/CLAIMED) + kullanıldı
  (kendi USED geçmişi; usedAt + kendi sipariş no). SEPET-BAĞIMSIZ: alt limit burada hesaplanmaz (kart
  AVAILABLE/EXPIRED); uygulama durumu (APPLIED) sepet couponCode cookie'sinden işaretlenir. Kullanılmış kod
  "Kullanılabilir"den düşürülür. Sayfa: başlık "Kuponlarım", sekmeler (Tüm Kuponlar / Kullanılabilir / Sana
  Özel / Kullanıldı + kupon varsa Süresi Doldu), arama ("Kupon ara" — kod/indirim metni), "Kupon Kodu Ekle"
  (mevcut claimCouponAction + router.refresh), kupon kartları (indirim/alt limit/geçerlilik/kaynak/durum/
  Kullan-Sepete Git-Kodu kopyala-Siparişi gör). "Kullan" → mevcut applyWalletCouponAction (indirim istemcide
  hesaplanmaz). Sepet "Kuponlar" alanına "Tüm Kuponlar" bağlantısı eklendi (dead link giderildi). Güvenlik:
  iç id/limit/istatistik/priority/stackable/redemption sızmaz; private kupon yalnız atanmış/claim edilmişse
  görünür; cross-store yok; USED yalnız kendi müşteri/email. Küçük güvenli additive: `listUsedWalletEntries
  ForIdentity` (yalnız okuma; migration YOK). Testler: gateway `projectCouponCenter` 6 (allowlist + USED
  dışlama + sepet-bağımsız alt limit), storefront kupon merkezi UI 8 + cart "Tüm Kuponlar" link 1. Gate:
  db:generate + `pnpm -r build` + typecheck + lint + test (35 task) + `git diff --check` yeşil. KALAN: merge
  sonrası docker rebuild (api-gateway + storefront-web) + runtime smoke; kategori çip filtresi bilinçli
  follow-up (kampanya categoryIds var ama kategori-ad çözümlemesi + kod tarafında kapsam eşleşmesi ayrı iş);
  çok-kullanımlı public kupon bir kez kullanıldığında "Kullanılabilir"den düşer (MVP kabulü).
- F4A.4 — Kampanya/kupon oluşturma seçenekleri + kriter genişletme (DONE — 2026-07-05, ADR-061). Amaç:
  store-admin'in production-grade kupon kartları/kampanyalar tanımlayabilmesi. TEMEL KURAL: sunum alanları
  indirim hesabından AYRI (motor DEĞİŞMEDİ). Additive migration `20260705140000_add_campaign_presentation_
  fields` (nullable/varsayılan; backfill YOK; mevcut kampanyalar null ile çalışır). Yeni Campaign SUNUM
  alanları: displayTitle/shortDescription/terms/badgeLabel/badgeVariant/cardStyle/displayPriority. Yeni
  enumlar: CampaignBadgeVariant (DEFAULT/SUPER/LIMITED_TIME/PERSONAL/WEEKEND/NEW_CUSTOMER), CampaignCardStyle
  (STANDARD/FEATURED/PERSONAL), CampaignAccessModel (AUTO_VISIBLE/PUBLIC_CLAIMABLE/CODE_CLAIMED/ADMIN_
  ASSIGNED). `isPublic` accessModel'den TÜRETİLİR (authoritative gate; `deriveIsPublicFromAccessModel`);
  admin isPublic'i ayrı input olarak görmez. Public projeksiyon allowlist'i genişletildi (badge + wallet +
  coupon-center'a sunum alan paketi); private veri güvenliği korundu (yoksa UI fallback). Store-admin formu
  6 bölüm (Görünüm/İndirim/Geçerlilik/Erişim/Kapsam/Önizleme) + kupon kartı önizlemesi (gerçek hesap YOK).
  Vitrin: ürün rozeti + kupon merkezi kartı displayTitle/badgeLabel/terms tüketir (fallback'li). HARİÇ:
  "Takip et kazan"/store-follow/seller-follow hiçbir yerde yok; reserved segmentler (ilk sipariş/geri dönen/
  e-posta) enforce edilemediği için enum/forma eklenmedi; marka/vendor scope yok (Product.brand/vendor
  serbest metin, first-class değil — follow-up); coupon-seviyesi sunum alanı yok. Testler: contracts
  doğrulama 10 (uzunluk/enum/follow reddi/türetim/partial), gateway rozet+merkez sunum taşıma/allowlist,
  store-admin 5 (6 bölüm+preview / follow yok / erişim seçenekleri / alan kaydı / null edit), storefront
  kupon merkezi 3 (display kullanımı/fallback/follow yok). Gate: db:generate + `pnpm -r build` + typecheck +
  lint + turbo test (35 task; api-gateway 575, storefront 129, store-admin 12) + `git diff --check` yeşil.
  KALAN: merge sonrası migrate deploy + docker rebuild (api-gateway + store-admin-web + storefront-web) +
  runtime smoke (OPERATIONS F4A.4). Follow-up: marka/vendor scope, reserved segment enforcement.
- F4A.6 — Vitrin ürün kartı "Sepette" fiyat gösterimi + smoke/stale kampanya denetimi (DONE — 2026-07-05,
  ADR-062; migration YOK). Amaç: otomatik sepet indirimi uygulanan ürün kartlarında referans e-ticaret gibi
  "üstü çizili normal fiyat + Sepette + %badge + güvenli nihai fiyat" bloğu; kupon kampanyaları "Kuponlu ürün"
  kartı olarak AYRI kalır (kod gerekir izlenimi verilmez). Public rozete additive `estimatedDiscountMinor` /
  `estimatedFinalUnitPriceMinor` (yalnız otomatik + PERCENT + tek-fiyatlı ürün + min-order eşiği karşılanınca;
  formül motorla aynı: round(unit*yüzde), maxDiscount cap). FIXED_AMOUNT/aralık/min-order belirsizinde SAHTE
  fiyat YOK → yalnız "Sepette %X" + "₺X üzeri" notu. `publicProductSchema.secondaryCoupon` additive:
  stackable-duyarlı gösterim — tüm uygun kampanyalar stackable ise otomatik birincil + kupon ikincil ÇİP
  birlikte; biri non-stackable ise yalnız öncelik kazananı. `displayKind` yine type'tan türetilir (accessModel
  AUTO_VISIBLE default'u kuponu otomatiğe ÇEVİRMEZ). RUNTIME DENETİM: demo-store'da aktif TEST250 (public kupon,
  bilinçli) + Sepette %10 (otomatik, 2 ürün kapsamı) — ikisi de non-stackable, bu yüzden kartta TEST250 kazanır
  (kural gereği doğru). "Eski smoke indirim" aslında demo-hoodie varyantındaki compareAt (₺1.299/₺1.499)
  mock artığı; kampanya DEĞİL → maliyet/marj + liste fiyatı ayrımı + fiyat audit'i F4B'ye taşındı (checkout
  semantiği korunsun diye). f4a-smoke-test-store'daki artık smoke kampanyalar KALDI (demo storefront'u
  etkilemiyor). HARİÇ: motor/checkout/OrderDiscount/cüzdan/analitik/kargo değişmedi; DB reset/seed/silme yok.
  Testler: gateway public-badge birim (tahmin safe/unsafe/FIXED/maxCap/kupon-null + stackable both/priority +
  accessModel-default kupon=PUBLIC_COUPON), gateway health entegrasyon (kart tahmin + no-leak), storefront
  product-card 5 (Sepette blok/final/min-order notu/ikincil çip/no-campaign) + detay 1 (belirgin Sepette blok).
  Gate: db:generate + `pnpm -r build` + typecheck + lint + turbo test (api-gateway 587, storefront 131,
  store-admin 188) + `git diff --check` yeşil. KALAN: merge sonrası docker rebuild (api-gateway + storefront-web)
  + runtime doğrulama. Follow-up: F4B — ürün maliyet/marj + liste fiyatı + fiyat değişikliği audit (son 30 gün
  en düşük fiyat); demo-store kampanyalarını stackable yapıp Sepette bloğunu canlı sergileme (veri kararı).
- F4B — Ürün maliyet/marj + liste fiyatı ayrımı + fiyat değişikliği audit'i (DONE — 2026-07-05, PR #32
  ad273ee; migration 20260705150000; docs kaydı F4C sırasında geri dolduruldu). `ProductVariant.costMinor`
  (satış priceMinor KALIR; cost yalnız iç marj/kâr için, public'e sızmaz; kural: cost ≤ compareAt ?? price) +
  append-only `ProductPriceChange` audit'i + EU Omnibus "son 30 günün en düşük fiyatı" public
  `lowestPriceMinor` + admin varyant formunda marj/markup göstergesi + fiyat geçmişi.
- F4C — Varyant kart fiyatı + Kaydet CTA bugfix + KDV temeli + sipariş satış özeti (DONE — 2026-07-06,
  ADR-063/ADR-064; migration 20260706120000_add_variant_vat_and_order_snapshots). (1) BUGFIX kart fiyatı:
  vitrin kartı artık fiyat ARALIĞI ("min – max") göstermez; en ucuz aktif varyantın KDV dahil fiyatı tek
  başına gösterilir; gateway kampanya "Sepette" tahmini de aynı en-ucuz tabandan hesaplanır (F4A.6'daki
  "yalnız tek-fiyatlı ürün" kuralı bilinçli genişletildi — kart tek fiyat gösterdiği için tahmin artık
  yanıltıcı değil). (2) BUGFIX Kaydet CTA: ürün/varyant formlarında setSaving(false) yalnız catch'teydi;
  finally'e alındı — başarıda buton "Kaydediliyor…"da takılı kalmıyor, double-submit disabled korunuyor.
  (3) KDV temeli (ADR-063): admin varyantta KDV HARİÇ net fiyat + oran (%0/%1/%10/%20; bps) girer; KDV
  tutarı + KDV dahil brüt SUNUCUDA hesaplanır (vat=round(net·bps/10000)); `priceMinor` KDV DAHİL brüt satış
  fiyatı olarak KALIR (vitrin/sepet/checkout sıfır regresyon). Backfill: net=round(brüt·10000/12000) — mevcut
  görünen fiyatlar birebir korundu, sürpriz fiyat değişikliği YOK. (4) Sipariş snapshot + satış özeti
  (ADR-064): OrderLine'a additive net/oran/KDV/brüt/liste/maliyet birim+satır snapshot kolonları; admin
  sipariş detayında Bölüm A (Ara toplam/İndirim+etiket/Kargo/Ödenmesi gereken/Net ödenen/Kalan bakiye) +
  Bölüm B (Liste fiyatı/KDV %X ve karma oran dağılımı/Vergisiz net/Maliyet/Brüt kâr/Kampanya indirimi/
  vurgulu Net kâr) YALNIZ snapshot'lardan türetilir; eski siparişler "eski format" bilgisiyle güvenli kısmi
  durumda, yanıltıcı sıfır yok; maliyet snapshot'sız satır varsa kâr "—". HARİÇ: sepet/checkout toplamları,
  kampanya semantiği, kargo, `taxIncludedMinor` bilgi satırı (hâlâ %20 legacy çıkarım — follow-up)
  DEĞİŞMEDİ; public DTO'ya net/KDV/maliyet SIZMAZ. Testler: utils vat 28, gateway health F4C 4 entegrasyon +
  orders-sales-summary 13 birim + kart-en-ucuz/no-leak, storefront kart en-ucuz 2, store-admin CTA 2 +
  KDV UI 1 + satış özeti 4. Gate: db:generate + pnpm -r build + typecheck + lint + test + git diff --check.
  KALAN: merge sonrası migrate deploy + docker rebuild (api-gateway + storefront-web + store-admin-web) +
  runtime doğrulama (OPERATIONS F4C). Follow-up: sepet/checkout "KDV (dahil)" bilgi satırını satır
  oranlarından türetme; fatura üretimi (alanlar hazır).
- TODO-143 — Faz 1A: Ürün ana kategorisi (`primaryCategoryId`) temeli (DONE — 2026-07-13, ADR-067). İş:
  kategoriye-bağlı dinamik attribute altyapısının ilk adımı; M:N `ProductCategoryAssignment` belirsizliğini
  gidermek için her ürüne tek ana kategori. Çözüm: (1) additive nullable `Product.primaryCategoryId` FK
  `onDelete: Restrict` + `@@index([storeId, primaryCategoryId])` + tarihli migration
  `20260713120000_add_product_primary_category` (deterministik backfill: en eski assignment `createdAt ASC`,
  eşitlikte `categoryId ASC` — `ProductCategoryAssignment` surrogate id taşımadığı için `assignment.id ASC`
  yerine categoryId, ürün içinde unique olduğundan deterministik; tek→o kategori; kategorisiz→null; NOT NULL
  YOK). Migration history nedeniyle BİR KEZ uygulanır; backfill `WHERE ... IS NULL` ile RE-RUN güvenlidir. (2) contracts: `primaryCategoryId` (response nullable; create/update opsiyonel) + saf
  `resolvePrimaryCategorySelection` kural fonksiyonu. (3) gateway service guard: `resolvePrimaryCategory`
  route helper — assignment+primary tek `$transaction`; stabil kodlar `PRIMARY_CATEGORY_REQUIRED/NOT_ASSIGNED/
  STORE_MISMATCH/ARCHIVED/ASSIGNMENT_CONFLICT`; ana kategori sessizce kaldırılamaz. (4) `publicCategoryLabel`
  önce primary, yoksa "ilk assignment" fallback (storefront geriye uyumlu). (5) store-admin form: "Ana
  kategori" işaretleyici (tek kategori otomatik ana; ana kaldırılınca yeni ana zorunlu; edit hydration;
  server hata bağlama) + i18n TR/EN. (6) seed hoodie/tote primary; `db:audit-primary-category` review
  script'i (dry-run default, `--apply` idempotent). Runtime kategori mirası UYGULANMADI (MVP; `overrideMode`
  yok). Testler: contracts 73 (resolve* + şema), gateway health 132 (4 yeni), store-admin 232 (4 yeni ana
  kategori component). Merge-öncesi DOĞRULAMA (2026-07-13): (a) izole PostgreSQL (ayrı container :5433, proje
  volume'una dokunulmadan) — pre-Faz1A zinciri + fixture + `prisma migrate deploy` + backfill; senaryolar
  A(tek→cat) B(çok/en-eski createdAt) C(eşit createdAt→categoryId ASC) D(kategorisiz→null) E(önceden-primary
  ezilmez) F(cross-store yok) G(FK RESTRICT) HEPSİ doğru; backfill re-run=UPDATE 0; audit dry-run↔DB uyumu;
  `--apply` migration ile birebir aynı; 2. `--apply`=applied 0. (b) runtime smoke (gerçek Fastify+Prisma+izole
  PG): API create/update kuralları + regresyon 15/15; public label primary-önceliği/flip/no-leak 4/4. (c)
  typecheck main(c2067b3) vs branch: her ikisinde AYNI tek hata (`checkout-form-render.test.tsx` CartLineView,
  ÖNCEDEN mevcut) → branch 0 YENİ hata. Gate: db:generate + build + typecheck + lint + prisma validate +
  `git diff --check` temiz. KALAN: merge sonrası HEDEF DB'de `prisma migrate deploy` + docker rebuild
  (api-gateway + store-admin-web + storefront-web) + prod-benzeri runtime smoke; Faz 1B (attribute tabloları)
  ayrı iş.
- TODO-144 — Faz 1B: Attribute katalog çekirdeği (DONE — 2026-07-14, ADR-067 genişletildi). İş: kategoriye-bağlı
  dinamik ürün özelliklerinin KATALOG temeli. Yalnız tanım katmanı; ürün/varyant DEĞER tabloları, dinamik form,
  varyant kombinasyon motoru, storefront, checkout, order, search ve marketplace KAPSAM DIŞI. Çözüm:
  (1) Prisma: 3 enum (`AttributeScope` PLATFORM/STORE, `AttributeDataType` 13 tip, `AttributeStatus`) + 4 model
  `AttributeDefinition` (scope tek tablo; storeId nullable; code + dataType service-immutable; davranış TAŞIMAZ),
  `AttributeGroup` (store-scoped sunum kabı), `AttributeOption` (SELECT/MULTI_SELECT/COLOR; `@@unique([attributeDefinitionId, value])`),
  `CategoryAttribute` (davranışın TEK SAHİBİ: required/filterable/searchable/comparable/variantDefining/
  visibleOnProductPage/visibleOnListing + displayOrder + validationRules Json; `@@unique([categoryId, attributeDefinitionId])`).
  Kategori mirası ve overrideMode YOK (YAGNI). (2) Migration `20260714120000_add_attribute_catalog` TAMAMEN ADDITIVE
  (yeni enum + tablo; mevcut şemaya dokunulmaz); izole shadow-DB `migrate diff` = "empty" (şemayla birebir; drift yok).
  (3) contracts: definition/group/option/categoryAttribute + create/update/list şemaları; scope+storeId GÖVDEDE YOK
  (route türer → spoof engellenir); code her zaman immutable, dataType kullanımda immutable (route stabil kodlar).
  (4) gateway `src/attributes/` ayrı data-access + route modülü (hero/kampanya deseni; DI ile dev MemoryDataAccess'e
  dokunulmadan test): STORE uçları `requireStorePlatformAdmin` (kendi STORE + PLATFORM okuma), PLATFORM uçları YENİ
  `requireSuperAdmin` (yalnız SUPER_ADMIN; mevcut yetkiler bozulmadı). Stabil kodlar: `ATTRIBUTE_CODE_EXISTS/
  CODE_IMMUTABLE/DATATYPE_IMMUTABLE/OPTIONS_NOT_SUPPORTED/ARCHIVED`, `ATTRIBUTE_OPTION_VALUE_EXISTS`,
  `CATEGORY_ARCHIVED`, `CATEGORY_ATTRIBUTE_EXISTS`, `*_NOT_FOUND`. (5) api-client + Next BFF proxy (8 route) +
  storeApi client. (6) store-admin: yeni **Katalog → Özellikler** ekranı (tanım + grup + seçenek CRUD; PLATFORM
  salt-okunur) + kategori ekranından CategoryAttribute bağlama modalı (davranış bayrakları) + i18n TR kaynak + EN.
  Ürün formu/storefront/checkout/order/inventory/search/marketplace DEĞİŞMEDİ. Testler: gateway `attributes.test.ts`
  21 (scope/immutable/duplicate/tenant/option/group/categoryAttribute/platform 403), contracts `attribute-contracts.test.ts`
  8, store-admin `attributes-page.test.tsx` 3 → 32 yeni; api-gateway 716/716, contracts 81/81, store-admin 235/235.
  Gate: db:generate + prisma format/validate + contracts/api-client/i18n build + api-gateway build + store-admin
  tsc/eslint temiz. KALAN: merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri
  runtime smoke. Faz 2 (ProductAttributeValue / dinamik form / varyant motoru / PDP tablo / faceted search) ayrı iş.
- TODO-145 — Faz 2A: Ürün/varyant attribute DEĞER temeli (DONE — 2026-07-14, ADR-068). İş: Faz 1B katalog TANIMINI
  tüketip ürün/varyantların gerçek attribute DEĞERLERİNİ saklayan çekirdek veri katmanı. Dinamik ürün formu, varyant
  kombinasyon motoru/`combinationKey`, otomatik varyant, PDP attribute tablosu, faceted search, marketplace mapping,
  order snapshot KAPSAM DIŞI. Storefront/checkout/order/inventory/search/marketplace ve ürün formu DEĞİŞMEDİ. Çözüm:
  (1) Prisma: 3 model `ProductAttributeValue` (tip başına ayrı kolon: valueText/Integer/Decimal/Boolean/Date +
  optionId + mediaId; `@@unique([productId, attributeDefinitionId])`), `VariantAttributeValue` (yalnız valueText +
  optionId; variantDefining), `ProductAttributeValueOption` (MULTI_SELECT junction — JSON YOK). definition/option/media
  FK `onDelete: Restrict` (kullanımda olan tanım/seçenek/görsel silinemez), product/variant/store `Cascade`. (2) Migration
  `20260714130000_add_product_attribute_values` TAMAMEN ADDITIVE; iki **CHECK constraint** ("bir satırda en fazla bir
  değer kolonu dolu"; MULTI_SELECT satırı 0 dolu → `<= 1` kapsar; cross-table datatype kontrolü DB'ye TAŞINMAZ, serviste).
  İzole shadow-DB `migrate diff` = "No difference" (şemayla birebir; drift yok; index adı 63-char kırpma dahil). (3)
  **attributeValueService** — ProductAttributeValue/VariantAttributeValue yazan TEK nokta (route Prisma'ya yazmaz).
  Dogrulama STABIL kodlarla (zod refine değil): tenant izolasyonu, attribute mevcut/archived, primaryCategoryId +
  CategoryAttribute bağı, required (yalnız değer sağlanınca), dataType↔alan eşlemesi + "en fazla bir alan", option
  attribute/tenant/archived, media tenant, variantDefining tablo yönlendirme (product-level→variant tablosuna, variant→product
  tablosuna YAZILAMAZ). Kodlar: `ATTRIBUTE_NOT_FOUND/ARCHIVED/TENANT_MISMATCH/NOT_IN_CATEGORY/DUPLICATE/VALUE_MISSING/
  MULTIPLE_VALUES/VALUE_TYPE_MISMATCH/OPTION_INVALID/OPTION_ARCHIVED/OPTION_TENANT_MISMATCH/MEDIA_NOT_FOUND/
  REQUIRED_MISSING/IS_VARIANT_DEFINING/NOT_VARIANT_DEFINING`, `PRODUCT_CATEGORY_REQUIRED`, `PRODUCT/VARIANT_NOT_FOUND`.
  read-only `prepare*` (create'ten ÖNCE doğrula) + `persist*` (sonra yaz, replace-set: [] tümünü temizler). (4) gateway
  `src/attribute-values/` ayrı data-access + service + route modülü (attributes/ deseni; DI). Product/Variant create-update
  GÖMÜLÜ `attributeValues` alanı (opsiyonel; undefined=eski davranış → geriye dönük uyumlu; create'te ürün oluşmadan önce
  doğrulanır) + dedike internal replace uçları (`GET/PUT .../products/:id/attribute-values` ve `.../variants/:id/attribute-values`).
  Media silme in-use guard'ına `ProductAttributeValue.mediaId` eklendi (Restrict FK → aksi halde P2003/500). (5) contracts:
  `productAttributeValueInputSchema` (MULTI_SELECT için optionIds), `variantAttributeValueInputSchema`, read + replace-request
  şemaları; product/variant create/update'e opsiyonel `attributeValues`. (6) api-client: `admin.products.attributeValues.{get,replace}`
  + `admin.products.variants.attributeValues.{get,replace}`. Store admin ürün formu DEĞİŞMEDİ (API hazır; UI Faz 2B). Testler:
  gateway `attribute-values.test.ts` 30 (typed/tenant/option/required/archived/variantDefining/MULTI_SELECT/replace-set +
  dedike route round-trip/403/404) + media-delete 1 yeni, contracts `attribute-value-contracts.test.ts` 12 (şema + geriye
  uyum), db `attribute-value-migration.test.ts` 8 (CHECK/junction/FK DDL). api-gateway 747/747, contracts 93/93, api-client
  23/23, db 8/8. Canlı DB smoke (izole): `migrate deploy` OK; CHECK iki-değer REDDETTİ, sıfır-değer (MULTI_SELECT) FK'ye
  düştü (CHECK geçti), variant CHECK ikili değeri reddetti. Gate: db:generate + build (contracts/db/api-client/api-gateway) +
  typecheck (değişen paketler temiz; storefront `checkout-form-render` hatası ÖNCEDEN mevcut) + lint + migrate diff drift-yok.
  KALAN: merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri runtime smoke. Faz 2B
  (dinamik ürün formu / attribute renderer / kategori-değişince-form / varyant kombinasyon motoru) ayrı iş.
- TODO-146 — Faz 2B: Dinamik ürün formu temeli (DONE — 2026-07-17, ADR-069). İş: store-admin ürün oluştur/düzenle
  ekranını Faz 2A backend'iyle çalışır dinamik forma çevirmek. Varyant motoru/PDP/storefront/search KAPSAM DIŞI.
  (1) **RHF + Zod göçü.** `product-form.tsx` ~25 dağınık useState → tek `useForm<ProductFormValues>`; çekirdek
  doğrulama Zod `superRefine` ile (mevcut elle onSubmit ile BİREBİR: title/slug/min-max qty/CTA-şablon uzunlukları/
  kargo>0/çok-kategoride-primary-zorunlu). Dinamik attribute alanları backend-şekilli kurallarla ayrı doğrulanıp
  birleşik resolver'da (`createProductFormResolver`) birleştirilir. Çekirdek alan davranışı KORUNDU (mevcut 235 test
  yeşil). UI kit `Input/Select/Textarea` `forwardRef`'e çevrildi (RHF `register` ref bağlar; additive). (2) **Kategori-
  güdümlü attribute.** Ana kategori (primaryCategoryId) attribute ŞEMASINI sürer (backend değer doğrulaması da
  primaryCategoryId+CategoryAttribute bağına göre). `useCategoryAttributes` hook'u CategoryAttribute (self-describing
  DEĞİL) + tanım + seçenek + grup uçlarını çekip client-side join eder; sıralama displayOrder ASC → name ASC; gruplar
  AttributeGroup.sortOrder (grupsuz "General attributes" önce). Memoization: kategori-bağımsız veriler tek sefer,
  kategori-attribute join'i kategori başına cache (kategori değişmezse yeniden fetch YOK). (3) **Dinamik renderer.**
  `AttributeSection`/`AttributeField` + dataType→widget registry (switch-case cehennemi YOK); 13 tip: TEXT/TEXTAREA/
  RICH_TEXT(düz textarea, TD)/INTEGER/DECIMAL/BOOLEAN/DATE/URL/SELECT/MULTI_SELECT/COLOR(swatch)/IMAGE/FILE(MediaUpload
  single). Grup başlıkları + required işareti + validationRules (min/max/minLength/maxLength/pattern/step/placeholder/
  helperText; desteklenmeyen sessizce yok sayılır). (4) **Round-trip.** Düzenlemede yeni BFF GET `.../products/:id/
  attribute-values` (+ `storeApi.getProductAttributeValues`) mevcut değerleri form haritasına doldurur (kayıpsız).
  (5) **Save.** Gömülü `attributeValues` (product create/update; attributeValueService'ten geçer) Faz 2A replace-set
  formatında; YALNIZ kategori attribute tanımlıysa gönderilir (aksi halde undefined → legacy ürünler bozulmaz). BOOLEAN
  her zaman gönderilir (false anlamlı), diğerleri boşsa atlanır. (6) **Sunucu hata → alan.** Gömülü akış artık
  `error.details.attributeDefinitionId` taşır (server.ts create+update; dedike PUT ile tutarlı bilgi); `UiError` +
  `call()` bunu okur; form catch'i attribute kodunu (ATTRIBUTE_OPTION_INVALID/REQUIRED_MISSING/...) ilgili alana bağlar,
  aksi halde genel Alert. (7) **api-client.** `AttributeDataType`/`ProductAttributeValueInput`/`ProductAttributeValueResponse`
  type re-export (apps yalnız api-client kanalı). Testler: store-admin `products-form-attributes.test.tsx` 8 (kategori-
  değişince fetch+gruplu/sıralı render / required / validationRules / save payload / edit round-trip / boş-legacy kategori /
  sunucu hata eşleme / memoization) + `attribute-value-mapping.test.ts` 12 (tip matrisi / round-trip / required+rules /
  parseValidationRules / server-error tanıma) + mevcut iki form testi (stub eklendi, davranış aynen yeşil). store-admin
  255/255, api-gateway 747/747, api-client 23/23, contracts 93/93. Gate: db:generate + build (contracts/utils/api-client) +
  typecheck (değişen paketler TEMİZ; storefront `checkout-form-render` hatası ÖNCEDEN mevcut — Faz 2A'da da not edildi,
  benim işimle alakasız) + lint + `next build` store-admin (/products, /products/[id] derlendi). KALAN: docker rebuild +
  prod-benzeri auth'lu runtime smoke (canlı attribute'lu ürün oluştur/düzenle). Faz 2C (varyant kombinasyon motoru /
  combinationKey / SKU matris) ayrı iş.

- TODO-147 — Faz 2C-1: Varyant motoru TEMELI + varyant attribute seçimi (DONE — 2026-07-17, ADR-070). İş: Variant Engine'in
  YALNIZ veri modelini + admin seçim ekranını kurmak. **KESİNLİKLE varyant/kombinasyon üretilmez**: ProductVariant, Cartesian,
  combinationKey, SKU matris, bulk edit, varyant görselleri, storefront/search/inventory/order snapshot KAPSAM DIŞI.
  (1) **Veri modeli (JSON YOK, normalize).** İki additive tablo: `ProductVariantAttribute` (üründe EKSEN olarak seçilen
  variantDefining attribute; `@@unique([productId, attributeDefinitionId])`, `position`, storeId denormalize; `attributeDefinitionId
  → Restrict`, product/store → Cascade) + `ProductVariantOptionSelection` (eksen altında kapsanan AttributeOption; `@@unique(
  [productVariantAttributeId, optionId])`, `position`, `optionId → Restrict`, parent/store → Cascade). `ProductVariant.optionValues
  Json?` (legacy) DOKUNULMADI. Migration `20260717120000_add_product_variant_selection` TAMAMEN ADDITIVE. (2) **`variantSelectionService`
  (tek yazma otoritesi).** Faz 2A `attributeValueService` deseni: prepare(read-only, create'ten önce) + persist(replace-set,
  transactional); STABIL kodlarla doğrular (zod refine DEĞİL): tenant izolasyonu, attribute mevcut/archived, primaryCategory bağı,
  **variantDefining=true**, **option-tabanlı (SELECT/COLOR)** — varyant ekseni tek-seçimli, MULTI_SELECT/metin eksen OLAMAZ,
  duplicate, her eksende **≥1 option**, option attribute/tenant/archived. (3) **API.** Gömülü opsiyonel `variantSelections` (product
  create/update; undefined=legacy korunur, []=temizle) + dedike `GET/PUT /stores/:id/products/:id/variant-selections`. contracts +
  api-client (`admin.products.variantSelections.{get,replace}`) + tipler. Mevcut Product API/`optionValues` DEĞİŞMEDİ. (4) **UI.**
  store-admin ürün formuna **"Variant Attributes"** bölümü; `useVariantAttributes` (variantDefining=true + option-tabanlı; mevcut
  `useCategoryAttributes` bunları dışlar) + `VariantAttributeSection` (eksen checkbox → seçince option checkbox'ları: Siyah ✓ /
  Beyaz ✓ / Mavi ☐). Form state `variantSelections: Record<defId, {enabled, optionIds}>`; enabled-eksende ≥1 option client
  doğrulaması; server hata `error.details.attributeDefinitionId` ile eksene bağlanır (Faz 2B deseni). Dinamik form mimarisi bozulmadı.
  i18n tr+en. (5) **Testler.** api-gateway `variant-selections.test.ts` 24 (seçim/deterministiklik/idempotency/1000-option stress + seçim/duplicate/archived/tenant/variantDefining/option-
  tabanlı/kategori-bağı/≥1-option/replace-set + route GET/PUT/404/403), contracts `variant-selection-contracts.test.ts` 8, store-admin
  `products-form-variant-attributes.test.tsx` 7 (render filtre/option seç/≥1-option blok/archived gizle/legacy/edit round-trip/server
  hata) + `variant-selection-mapping.test.ts` 7, db `variant-selection-migration.test.ts` 8 (additive/Restrict/Cascade/JSON-yok).
  Regresyon: store-admin 269/269, api-gateway 771/771, api-client 23/23, contracts 101/101, db 16/16. Gate: db:generate + build
  (contracts/api-client) + typecheck (değişen paketler TEMİZ; storefront `checkout-form-render` ÖNCEDEN mevcut/TD-040) + lint +
  `next build` store-admin OK. KALAN: docker rebuild + prod-benzeri auth'lu runtime smoke. Faz 2C-2 (Combination Engine: Cartesian →
  combinationKey → ProductVariant + SKU matris) AYRI iş.

- TODO-148 — Faz 2C-2: Deterministik Combination Engine + kombinasyon önizlemesi (DONE — 2026-07-17, ADR-071). İş: 2C-1 eksen
  reçetesinden (`ProductVariantAttribute` × `ProductVariantOptionSelection`) **oluşacak varyant kombinasyonlarının ÖNİZLEMESİNİ**
  üreten **tamamen SAF** bir motor + salt-okunur önizleme ucu/ekranı. **KESİNLİKLE kombinasyon YAZILMAZ**: ProductVariant, SKU,
  barcode, price, inventory, bulk edit, varyant görselleri, storefront/search/marketplace, order snapshot KAPSAM DIŞI;
  `combinationKey` üretilir ama **DB'ye YAZILMAZ** (kalıcılığı Faz 2C-3). (1) **Saf motor** (`apps/api-gateway/src/variant-combinations/
  engine.ts`) `generateVariantCombinations(axes, {maxCombinations})` — Prisma/DB/network/logger/`Date`/`Math.random` YOK, girdiyi
  mutasyona uğratmaz; deterministik + idempotent. **Canonical ordering**: eksen `position ASC → attributeDefinitionId ASC`, option
  `position ASC → optionId ASC`. **Duplicate önleme**: duplicate option tekilleştirilir, duplicate axis option-union'lanır. Archived
  option elenir, empty axis düşürülür, eksen yoksa 0 kombinasyon. **Cartesian**: iteratif odometer (`O(k)` bellek). **`combinationKey`**:
  `v1|attrId:optId|...` (ID-tabanlı, segmentler attrId'ye sıralı — rename/position bağımsız). **`previewId`**: `pv_<cyrb53(key)>`
  (deterministik, random DEĞİL). (2) **Runtime guard** `MAX_PREVIEW_COMBINATIONS` (config `optionalNumberEnv` default 1000; magic
  number DEĞİL); Cartesian materialize edilmeden hesaplanır, aşımda `PREVIEW_LIMIT_EXCEEDED` (route 422). (3) **API.** Salt-okunur
  `GET /stores/:id/products/:id/variant-combinations/preview` (WRITE YOK; legacy variant-selections + `optionValues` DEĞİŞMEDİ).
  contracts (`variantCombinationPreview*` şema/tip) + api-client (`admin.products.variantCombinations.preview`). (4) **UI.** store-admin
  ürün formuna salt-okunur **"Oluşacak Kombinasyonlar"** paneli (`useVariantCombinationPreview` + `CombinationPreview`); yalnız
  düzenleme modu + kategori varyant-defining eksen tanımladıysa; kaydedilmiş reçeteyi yansıtır (her kaydetmede yeniden çeker). DÜZENLEME
  YOK. i18n tr+en. (5) **Testler.** api-gateway `variant-combinations.test.ts` 31 (saf motor: tek/çok eksen, 2×10=100, 3-eksen=100,
  5-eksen=1024, canonical ordering, determinizm/idempotency/input-order-bağımsızlık, duplicate option/axis, archived, empty axis,
  combinationKey format/stabilite, previewId determinizm/benzersizlik, guard limit + service tenant/boş/archived + route 200/404/422/403),
  store-admin `combination-preview.test.tsx` 7 (liste/sayı, null→optionId, guard uyarı, hata, spinner, 0→render-yok, veri-yok→render-yok).
  Regresyon: store-admin 269/269 (+7 yeni dosya), api-gateway 802/802, contracts 101/101, config 24/24, i18n 47/47. Gate: db:generate +
  build (contracts/config/i18n/api-client) + typecheck (api-gateway tsc + store-admin tsc TEMİZ) + tüm testler yeşil. Migration YOK
  (şema değişmedi). KALAN: docker rebuild + prod-benzeri auth'lu runtime smoke. Faz 2C-3 (kalıcı ProductVariant + SKU matris; combinationKey
  DB'ye yazımı) AYRI iş.
- TODO-149 — Faz 2C-3: ProductVariant persistence + incremental diff motoru (DONE — 2026-07-18, ADR-072). İş: Faz 2C-2 SAF Combination
  Engine'inden (`combinationKey` üretir, DB'ye YAZMAZ) **kalıcı `ProductVariant` üretimi** — kaydedilmiş eksen reçetesinden hedef
  kombinasyonlar üretilir ve mevcut varyantlarla **diff'lenir** → create/keep/restore/archive. Deterministik · idempotent · transaction-
  safe · concurrency-safe · tenant-safe · tekrar-çalıştırılabilir. **SKU Matrix DEĞİL** (fiyat/stok/barcode/inline düzenleme, variant image,
  storefront selector, marketplace KAPSAM DIŞI). (1) **Veri modeli (additive).** `ProductVariant` + `generationSource`
  (enum MANUAL|ATTRIBUTE_COMBINATION @default MANUAL) + `combinationKey String?` + `archivedAt DateTime?`;
  `@@unique([productId, combinationKey])` (Postgres NULL-distinct). Yeni tablo `ProductVariantOptionValue` (variantId,
  attributeDefinitionId, optionId; unique(variantId, attributeDefinitionId)) — normalize eksen→option seçimi (2A `VariantAttributeValue`'dan
  AYRI; `optionValues` JSON authoritative DEĞİL). Migration additive (yeni enum + 3 kolon + tablo + 1 unique index; backfill YOK).
  (2) **Saf diff motoru** (`variant-generation/diff-engine.ts`) Prisma/DB/Date/random BİLMEZ, girdiyi mutasyona uğratmaz; Map/Set ~O(P+E)
  (nested O(P×E) YOK); `{toCreate, toKeep, toRestore, toArchive, manualVariants}` deterministik. (3) **Persistence** (`data.ts`+`service.ts`)
  tek `prisma.$transaction`; başında **advisory xact lock** (`pg_advisory_xact_lock(hashtext(productId))`) + DB unique → yarışta P2002 →
  `VARIANT_GENERATION_CONFLICT`. keep=write YOK (idempotent); restore=aynı ID/SKU/price, yalnız status flip; archive=soft (`status=ARCHIVED`+
  `archivedAt`; hard-delete YASAK); create=DRAFT + deterministik SKU `V-<productId>-<hash(combinationKey)>` (random/timestamp YOK) +
  normalize selection; InventoryItem/price-audit yazılmaz. (4) **API.** `POST /stores/:id/products/:id/variant-combinations/generate`
  (gövdesiz; kaynak DB reçetesi). Yanıt `{totalTarget, created, kept, restored, archived, manualVariantsUntouched, variants[]}`. Stabil
  hatalar PRODUCT_NOT_FOUND(404) / VARIANT_SELECTION_EMPTY / INVALID_VARIANT_SELECTION / PREVIEW_LIMIT_EXCEEDED / ATTRIBUTE_OPTION_NOT_FOUND(422)
  / VARIANT_GENERATION_CONFLICT(409). contracts `variantGenerationResponseSchema` + api-client `...variantCombinations.generate`. Preview
  ucu (GET) BOZULMAZ. (5) **UI.** Ürün formuna **"Varyantları Oluştur"** aksiyonu + sonuç özeti (`useVariantGeneration` +
  `GenerateVariantsAction`; yalnız düzenleme + eksen varsa görünür; preview limiti/loading'de pasif); başarıda önizleme yeniden çekilir.
  i18n tr+en. (6) **Boş reçete.** Eksen yoksa `VARIANT_SELECTION_EMPTY` (sessiz archive YOK); tüm option archived → `INVALID_VARIANT_SELECTION`.
  (7) **Testler.** api-gateway `variant-generation.test.ts` 36 (saf diff + service tüm senaryolar + route), contracts 3, store-admin
  `generate-variants-action.test.tsx` 9. Regresyon: api-gateway 838/838, contracts 104/104, store-admin 285/285, api-client 23/23,
  db 16/16. Gate: prisma format/validate/generate + migration SQL review + typecheck + lint + build (api-gateway tsc + store-admin Next) +
  `git diff --check` temiz. KALAN: docker rebuild + `migrate deploy` + prod-benzeri auth'lu runtime smoke; gerçek-PG concurrency
  integration testi (TD-043). Faz 2C-4 (SKU Matrix) AYRI iş.

- TODO-150 — Faz 2C-4: Identity Management Engine (SKU/Barcode/Variant Title pattern motoru) (DONE — 2026-07-18, ADR-073;
  commit/merge/deploy YAPILMADI — final rapor sonrası durum). İş: 2C-3 persistence altyapısını (kalıcı `ProductVariant`,
  `combinationKey`, `ProductVariantOptionValue`, deterministik placeholder SKU) tüketip **pattern tabanlı kimlik motoru** ekler.
  Bu faz yalnız **SKU · Barcode · Variant Title** aktif (GTIN/EAN/UPC/ERP/marketplace altyapı olarak öngörülür, YAZILMAZ). SKU Matrix
  ekranı DEĞİL; **Identity Matrix** (pattern editörü + preview tablosu + collision paneli + apply). (1) **SAF motor**
  (`identity-engine/`): `tokenizer.ts` (lexer; kaçış `{{`/`}}` + charset + dengeli/iç-içe parantez) · `parser.ts` (token semantiği +
  AST; PRODUCT/CATEGORY/ATTRIBUTE:code/COLOR/SIZE/SEQ aktif, ID/YEAR/MONTH rezerve → `IDENTITY_TOKEN_NOT_SUPPORTED`) · `evaluator.ts`
  (identifier modu=value+UPPER / title modu=label; SEQ padding; eksik token=missing) · `collision.ts` (internal+external, O(n+m)) ·
  `preview.ts` (değerlendirme+validation+collision orkestrası; blocking bayrağı). Hepsi Prisma/HTTP/Date/`Math.random` BİLMEZ.
  (2) **Veri modeli (additive).** `ProductVariant.titleIsCustom Boolean @default(false)` (title override koruması; varyant PATCH
  `title` verince true) + `enum VariantIdentityField (SKU|BARCODE|TITLE)` + append-only `VariantIdentityChange` (batchId gruplu undo
  metadata; oldValue/newValue/field/pattern/changedByPlatformUserId scalar). Migration additive (1 kolon + enum + tablo + 4 index +
  3 FK; backfill YOK). (3) **Servis** (`service.ts`+`data.ts`): preview yalnız-okuma + deterministik; apply **server-authoritative**
  (preview'i yeniden hesaplar) + tek `prisma.$transaction` + **advisory xact lock** (`$executeRaw`) + yalnız-değişen yazım + audit.
  Fail-closed: blocked (SKU collision / sert validation) → hiçbir yazım (422 `IDENTITY_APPLY_BLOCKED`). Idempotent (ikinci apply →
  updated=0). Dış-SKU sahipleri tek `in` sorgusu (N+1 YOK). (4) **API.** `GET .../identity/preview` (query: sku/barcode/title/seqStart/
  regenerateCustomTitles) + `POST .../identity/apply`. Yanıt `{rows[], collisions[], blocked, counts, patterns, variantCount}` /
  apply `{batchId, updated, skipped, collisions, preview}`. Stabil hatalar PRODUCT_NOT_FOUND(404) / IDENTITY_NO_PATTERN /
  IDENTITY_PATTERN_INVALID / IDENTITY_APPLY_BLOCKED(422) / IDENTITY_SKU_CONFLICT(409). contracts `identity*Schema` + api-client
  `...identity.{preview,apply}`. Combination/generation uçları BOZULMAZ. (5) **UI.** Ürün formuna **Identity Matrix** bölümü
  (`useIdentityMatrix` + `IdentityMatrix`; yalnız düzenleme + eksen varsa görünür): debounce'lu canlı preview, pattern editörü (SKU/
  Barcode/Title + seqStart + regenerateCustomTitles), preview tablosu (mevcut→yeni + değişim/çakışma rozetleri), collision paneli,
  apply (blocked/değişiklik yok iken pasif). BFF proxy `.../identity/{preview,apply}`. i18n tr+en (`identityMatrix`). (6) **Testler.**
  api-gateway `identity-engine.test.ts` (~46: tokenizer/parser/evaluator/collision/preview saf + service in-memory fake + route).
  Regresyon: api-gateway 878/878, store-admin 285/285; full `pnpm -r build` PASS (25/25 proje). Gate: prisma format/generate +
  migration SQL + full build + typecheck + tests. KALAN: docker rebuild + `migrate deploy` + auth'lu runtime smoke; gerçek-PG
  concurrency integration (TD-044). GTIN/ERP/Marketplace/Price Matrix/Inventory Matrix/Variant Media KAPSAM DIŞI.
- TODO-151 — Faz 2C-5: Commercial Engine (Price/Compare-at/Cost/VAT preview-first bulk pricing) (DONE — 2026-07-18, ADR-074;
  commit/merge/deploy YAPILMADI — final rapor sonrası durum). İş: 2C-4 Identity Engine desenini `ProductVariant`'ın **ticari** alanlarına
  taşır. Aktif alanlar: **Price · Compare-at · Cost · VAT**; hesaplanan/salt-okunur: **Gross Profit · Margin% · Markup% · Discount%**.
  (1) **SAF motor** (`commercial-engine/`): `types.ts` (field/operation/rounding enum + state) · `money.ts` (integer minor aritmetiği:
  yüzde/sabit/markup/compareAt-türetme/rounding/price-ending/overflow; float YASAK) · `calculator.ts` (margin/markup/discount, division-by-
  zero güvenli) · `fingerprint.ts` (FNV-1a stale-guard) · `rule.ts` (yapısal rule normalize+validate; operation↔field uyumu) · `evaluator.ts`
  (rule/direct-edit → hedef state) · `validation.ts` (blocking/warning sınıflama) · `diff-engine.ts` (alan-bazlı O(n·f) diff) · `preview.ts`
  (rows+summary+fingerprint orkestrası). Hepsi Prisma/HTTP/Date/`Math.random` BİLMEZ. (2) **Veri modeli (additive).** `enum CommercialField
  (PRICE|COMPARE_AT_PRICE|COST|VAT_RATE)` + `enum CommercialChangeSource (DIRECT_EDIT|BULK_RULE)` + append-only `VariantCommercialChange`
  (batchId gruplu; oldValue/newValue [money=minor, VAT=bps] + currency + source + ruleSnapshot + changedByPlatformUserId scalar). Migration
  `20260718140000_add_commercial_engine` (2 enum + tablo + 5 index + 3 FK; mevcut fiyat kolonları DEĞİŞMEZ; backfill/down YOK). `ProductPriceChange`
  (F4B) BOZULMAZ. (3) **Servis** (`service.ts`+`data.ts`): preview yalnız-okuma + deterministik; apply **server-authoritative** (preview'i
  yeniden hesaplar) + tek `prisma.$transaction` + **advisory xact lock** (`$executeRaw`) + **stale-preview fingerprint kontrolü** + yalnız-
  değişen yazım (PRICE/VAT değişince net/KDV F4C üçlüsü `splitGrossByVat` ile türetilir; brüt SABİT) + audit. Fail-closed: blocked/stale →
  hiçbir yazım. Idempotent (ikinci apply → updated=0). ARCHIVED kapsam dışı; apply status DEĞİŞTİRMEZ. (4) **API.** `GET .../commercial`
  (matris) + `POST .../commercial/preview` + `POST .../commercial/apply`. Rule VEYA direct-edit + selectedVariantIds (tenant/scope guard).
  Stabil hatalar PRODUCT_NOT_FOUND(404) / COMMERCIAL_VARIANT_NOT_FOUND(404) / COMMERCIAL_PREVIEW_STALE(409) / COMMERCIAL_CONFLICT(409) /
  COMMERCIAL_INVALID_RULE / COMMERCIAL_SELECTION_EMPTY / COMMERCIAL_APPLY_BLOCKED(422). contracts `commercial*Schema` + api-client
  `...commercial.{get,preview,apply}`. Identity/combination/generation uçları BOZULMAZ. (5) **UI.** Ürün formuna **Commercial Matrix**
  (`useCommercialMatrix` + `CommercialMatrix`; kaydedilmiş her üründe görünür): mod anahtarı (toplu kural / hücre düzenle), rule paneli
  (targetField/operation/amount/rounding/price-ending), seçim (tümü/temizle), preview tablosu (mevcut→hedef + margin/markup/discount +
  değişim/warning/error rozetleri), özet paneli, apply (blocked/değişiklik-yok iken pasif; autosave YOK). BFF proxy `.../commercial/{,preview,apply}`
  (apply CSRF'li). i18n tr+en (`commercialMatrix`). (6) **Testler.** api-gateway `commercial-engine.test.ts` (66: money/calculator/rule/
  evaluator/fingerprint/diff/preview SAF + service in-memory fake [matrix/preview/apply/idempotent/stale/blocked/tenant/empty-selection/
  invalid-rule/VAT-gross-sabit/P2002]). Regresyon: api-gateway **944/944**, store-admin **285/285**; contracts 104, api-client 23, db 16.
  Gate: prisma format/validate/generate + migration SQL + api-gateway/store-admin typecheck TEMİZ + lint + tests yeşil + git diff --check.
  KALAN: docker rebuild + `migrate deploy` + auth'lu runtime smoke; gerçek-PG concurrency integration (TD-045). Inventory/Variant Media/
  currency conversion/rule persistence/undo UI/scheduled pricing/1000+ row virtualization KAPSAM DIŞI.
- TODO-151A — Faz 2C-5A: Commercial UX Refinement — tam genişlik "Fiyatlandırma" sekmesi + anlaşılır fiyat dili + yönlendirmeli toplu işlem
  (DONE — 2026-07-18, ADR-075; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). **Yalnız Store Admin UX**; Commercial Engine
  (money/calculator/margin/markup/discount/fingerprint/stale-guard/diff/transaction/advisory-lock/audit/tenant/net-KDV türetme/changed-only) ve
  API kontratı **DEĞİŞMEDİ**. (1) **Bağımsız Pricing tab.** `products/[id]/page.tsx` artık iki sekme (Genel · Fiyatlandırma); ticari alan Genel
  formun içindeki küçük gömülü karttan (`CommercialMatrix`) çıkarıldı → tam genişlik çalışma alanı. Eski `commercial/commercial-matrix.tsx`
  SİLİNDİ; `use-commercial-matrix.ts` KORUNDU (varsayılan mod artık `direct`=Hızlı düzenleme; `setSelection` helper eklendi — motor/kontrat
  etkisi yok). (2) **Yeni workspace** (`products/pricing/`): `pricing-workspace.tsx` (KPI kartları · Hızlı düzenleme[varsayılan] vs Toplu işlem
  modu · tam genişlik tablo · alan-bazlı önizleme özeti · old→new gösterim · seçim UX · uyarı/engelleyici ayrımı · loading/empty/error/allArchived/
  noSelection/noChanges/stale/success state) · `guided-operations.ts` (senaryo → [targetField,operation] eşlemesi; motor değişmeden) ·
  `pricing-tokens.ts` (semantik token sınıfları). (3) **Dil.** "Ticari matris"/"İndirim" gibi teknik/yanıltıcı ifadeler UI'dan kaldırıldı;
  "Liste fiyatına göre indirim" + kolon tooltip'leri (satış/liste/maliyet/KDV/marj/markup) + insan-dostu hata mesajları (`issueMessages`; ham
  stable kod yalnız "Teknik detay"). i18n tr+en `products.pricing` + `products.detail.tabs` (EN yapısal olarak TR ile eşleşir — i18n build yeşil).
  (4) **Tema.** `globals.css` `.pricing-workspace` semantik token katmanı (ink/surface/line/success/warning/danger…); renk anlamı token'dan gelir,
  ikon+başlık+metin ile eşlenir (yalnız-renk değil); `[data-theme="light"]` açık tema türetmesi hazır (panel geri kalanı bilinçli koyu-tek-tema
  kalır — @commerce-os/ui'ye dokunulmadı). (5) **Testler.** store-admin `pricing-workspace.test.tsx` (14) + `guided-operations.test.ts` (4) +
  `product-detail-page.test.tsx` sekme testleri (2 yeni); toplam store-admin **305/305**, i18n 47. Gate: store-admin typecheck+lint+build TEMİZ,
  git diff --check temiz. KALAN: docker rebuild + auth'lu runtime görsel smoke (screenshot checklist final raporda). Backend engine/DB/API/checkout/
  storefront/inventory/scheduled-pricing/approval/autosave/1440px+ per-tab breakout KAPSAM DIŞI.

- TODO-152 — Faz 2C-6: Warehouse-Aware Inventory Engine (depo/onHand/reserved/available/incoming/safety/reorder preview-first bulk)
  (DONE — 2026-07-18, ADR-076; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). Mevcut `InventoryItem`/reservation/movement,
  checkout/sipariş (`placeOrder`/`cancelOrder` + `FOR UPDATE`) ve storefront **DEĞİŞMEDİ** (sıfır regresyon; additive). (1) **DB.** Yeni enum
  `WarehouseStatus`/`InventoryAdjustmentField`(reserved YOK)/`InventoryAdjustmentSource`; model `Warehouse` (store-scoped, partial-unique default),
  `InventoryBalance` (variant×warehouse, `@@unique([warehouseId,variantId])`), `InventoryAdjustment` (append-only ledger). Migration
  `20260718150000` additive + deterministik/idempotent backfill (store başına default depo + InventoryItem→balance BİREBİR; `ON CONFLICT DO NOTHING`).
  (2) **Engine** (`apps/api-gateway/src/inventory-engine/`): SAF `availability`(available=onHand−reserved−safetyStock; incoming HARİÇ)/`calculator`/
  `validation`/`fingerprint`(reserved dahil)/`diff-engine`/`preview` + IO `data`(advisory-lock `$executeRaw` · InventoryItem köprüsü: default depoda
  onHand/reserved canlı overlay + onHand→InventoryItem senkron · changed-only + audit)/`service`(stale-guard + INACTIVE fail-closed)/
  `reservation-service`(SAF foundation, order flow'a bağlı DEĞİL — Alternatif A)/`routes`. (3) **API.** `GET …/warehouses` · `GET/POST …/products/
  :productId/inventory{,/preview,/apply}`; stable error kodları (INVENTORY_PREVIEW_STALE/APPLY_BLOCKED/WAREHOUSE_INACTIVE/…). contracts+api-client.
  (4) **Store Admin.** Bağımsız tam-genişlik **Stok** sekmesi (`products/inventory/*`; pricing token'ları yeniden kullanıldı): depo seçici+default
  rozet+INACTIVE uyarı · 6 KPI · Hızlı düzenleme (reserved **salt-okunur**) vs Toplu işlem (8 yönlendirmeli senaryo + "Stoğu sıfırla" uyarı) ·
  alan-bazlı preview özeti (old→new) · warning/blocking humanize. Autosave YOK. i18n tr+en `products.inventory` + `detail.tabs.inventory` (parity).
  (5) **Testler.** api-gateway `inventory-engine.test.ts` (64) + store-admin `inventory-workspace.test.tsx` (6); regresyon api-gateway **1008/1008**,
  store-admin **312/312**, contracts 104, api-client 23, i18n 47. Gate: prisma format/validate/generate + build + tsc + eslint + git diff --check
  TEMİZ; prisma package.json/lockfile bump GERİ ALINDI. KALAN: migration deploy + docker rebuild + auth'lu runtime görsel smoke (final raporda).
  KAPSAM DIŞI (TD-047): warehouse-aware reservation/checkout/allocation · checkout safety-stock uygulaması · warehouse CRUD UI · fulfillment commit
  · transfer/PO/lot/serial/bin/expiry/cycle-count/reconciliation/ERP/marketplace · low-stock notification · gerçek-PG concurrency integration · 1000+
  satır virtualization.

- TODO-152A — Faz 2C-6 devamı: Inventory UX Birleştirme (global izleme merkezi + reorderPoint tek authority + sekme kontrastı)
  (DONE — 2026-07-18, ADR-077; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası durum). Motor/şema/transaction mimarisi DEĞİŞMEDİ.
  (1) **Global Stok = izleme & operasyon merkezi.** Legacy `InventoryItem` liste + "Stok düzelt" modalı KALDIRILDI; `app/(app)/inventory/page.tsx`
  yeniden yazıldı: depo seçici + 6 KPI + arama + durum filtresi + tablo (Ürün/Varyant/SKU/Elde/Rezerve/Güvenlik/Satılabilir/Gelen/**Yeniden sipariş
  noktası**/Durum) + satır→`/products/:id?tab=inventory` derin-link + güvenli tek-satır hızlı işlem (+10/−10/sıfırla, ürün-bazlı preview→apply; blocked→uyarı).
  Quick Edit/Bulk/Preview/Apply YALNIZ Product Detail > Stok'ta (ADR-076 per-product transaction korunur; fan-out yazma REDDEDİLDİ). (2) **Yeni SALT-OKUMA
  uç.** `GET …/inventory/matrix?warehouseId=` (data `listStoreVariants` batched N+1-siz · service `storeMatrix` SAF `computeCalc` durum paritesi · contracts
  `inventoryStoreMatrix*` · api-client `admin.inventory.storeMatrix` · BFF `catalog/inventory/matrix` · `storeApi.getStoreInventoryMatrix`). (3) **reorderPoint
  tek authority.** Varyant modalı "Kritik stok eşiği" + gateway create/update `lowStockThreshold` yazımı + contract create/update request alanları KALDIRILDI;
  dashboard "kritik stok" KPI'ı motor LOW_STOCK'undan (=reorderPoint) türetilir. Kolon DROP EDİLMEDİ (dormant; additive). Idempotent backfill
  `20260718160000_backfill_reorder_point` (default depo · reorderPoint=0 · eşik>0 → taşı; manuel değerleri ezmez). (4) **Paylaşılan atomlar** `products/
  inventory/shared.tsx` (Kpi/WarehouseSelector/StatusBadge/fmt) → global + Product Detail AYNI componentler. (5) **Sekme kontrastı** underline→pill (indigo
  dolgu + border + ikon + hover + mobil kaydırma; `?tab=` derin-link). i18n tr+en `storeAdmin.inventory` yeniden yazıldı, `variants.form.lowStock*` kaldırıldı.
  (6) **Testler.** api-gateway `inventory-engine.test.ts` +2 (storeMatrix span/exclude-archived + WAREHOUSE_NOT_FOUND) → **1010/1010**; store-admin
  inventory testleri yeni global sayfaya göre yeniden yazıldı (izleme + quick +10 preview→apply + blocked-guard) → **313/313**; contracts 104, api-client 23,
  i18n 47. Gate: build (contracts/api-client/i18n/api-gateway tsc + store-admin/storefront/worker) + eslint TEMİZ. KALAN: backfill migration deploy + docker
  rebuild + auth'lu runtime görsel smoke (final raporda). KAPSAM DIŞI: global fan-out yazma · lowStockThreshold kolon drop · warehouse CRUD UI (TD-047).

- TODO-153 — Faz 2C-7: Variant Media Engine — Media-Defining Axis ile Renk-bazlı varyant galerisi
  (DONE — 2026-07-18, ADR-078; commit/push/PR/merge/deploy YAPILMADI — final rapor sonrası). Mevcut Product/Variant/Media mimarisi + ADR-065 galeri +
  checkout/inventory/pricing/variant-generation/storefront-availability **DEĞİŞMEDİ** (additive + backward compatible; `mediaDefiningAttributeId=null` →
  klasik galeri birebir). (1) **DB (additive migration 20260718170000).** `Product.mediaDefiningAttributeId` (nullable FK→AttributeDefinition, SetNull);
  `ProductImage.attributeDefinitionId`+`optionId` (nullable FK Restrict) + index `[productId,optionId]`. Backfill YOK. (2) **API.** contracts:
  `productImageSchema.optionId`/`productSchema.mediaDefiningAttributeId` (default null); update `imageBindings:[{mediaId,optionId?}]`+`mediaDefiningAttributeId`;
  public `publicProductImageSchema.variantOptionId`+`publicProductVariantSchema.mediaOptionId`+`publicProductSchema.mediaDefiningAttributeId` (yalnız id'ler;
  mediaId/storageKey SIZMAZ). gateway `ProductImageBinding` soyutlaması (persistence-only join-tablo geçişi); `listProductImages` optionId (EKSTRA SORGU YOK);
  detay `resolveVariantMediaOptions` (TEK batched, yalnız eksen varsa; PLP sorgu sayısı değişmez); guard `assertMediaDefiningAxis`(INVALID_MEDIA_AXIS)+
  `prepareProductImageBindings`(INVALID_MEDIA_OPTION/MEDIA_AXIS_REQUIRED); MEDIA_IN_USE DEĞİŞMEDİ. (3) **Admin UI.** galeri bölümünde media-eksen seçici (yalnız
  etkin SELECT/COLOR varyant eksenleri) + görsel-başı renk etiketleme (gruplu; "Tüm varyantlar"=paylaşılan); eksen değişince etiket sıfırlama; MediaUpload
  primitive'i korundu. (4) **Storefront.** `PdpSelectionProvider` (context) ile BuyBox↔`VariantGallery` state lift; `galleryImagesForVariant` saf helper (eşleşen
  renk+paylaşılan; fallback tüm-dizi); SSR default=en ucuz varyant grubu (hidrasyon sıçraması yok); PLP kapak değişmedi. (5) **Testler.** api-gateway +1 entegrasyon
  → 1011/1011; storefront +variant-media.test.ts → 202/202; store-admin gallery→imageBindings → 313/313; contracts +3 → 107/107. i18n TR/EN parity. Gate:
  tsc/eslint/build/prisma-validate/git-diff TEMİZ (istisna: önceden var olan checkout-form-render.test.tsx tsc — kapsam dışı). KALAN: migrate deploy + docker
  rebuild + auth'lu görsel smoke (final rapor). KAPSAM DIŞI: per-SKU/hibrit override · ProductImageOption join tablo · video/360/3D/AR/mediaKind (TD-048).

- TODO-154 — Faz 2C-8A: Search Read-Model Foundation (arama/filtreleme altyapısı — YALNIZ temel)
  (DONE + MERGED + DEPLOYED — 2026-07-19, ADR-079; PR #80 feat `15f8425` merge `0aaea08` + docker build fix
  PR #81 `279ab69` merge `0b1a63c`=main; CI yeşil, 7/7 healthy, deployed smoke ALL PASS). Public search/facet uçları, storefront filtre UI, URL senkronu,
  autocomplete/synonym KAPSAM DIŞI (Faz B+). Mevcut public katalog uçları + allowlist + checkout/inventory/pricing DEĞİŞMEDİ (additive). (1) **DB (additive
  migration 20260719120000).** `ProductSearchDocument` (ACTIVE ürün/1 satır; `searchVector tsvector` GENERATED STORED + min/max fiyat + hasStock/availability +
  revision) + `ProductFacetValue` (flat `(ürün×filterable attr×değer)`; single-value CHECK) + enum `SearchAvailabilityState`; `pg_trgm` + GIN(searchVector) +
  GIN trgm(title) + btree kompozit; Store/Product Cascade. Inline veri taşıma YOK (runtime backfill). (2) **search-service.** `SearchProvider` portu +
  `PostgresSearchProvider` + deterministik SAF `buildSearchDocument` + bounded-batch `data.ts` (N+1 yok) + backfill CLI (`--store|--all|--dry-run`,
  resumable/idempotent/non-truncating). Facet YALNIZ `CategoryAttribute.filterable`; ARCHIVED def/option hariç; dedupe; IMAGE/FILE hariç. (3) **queues/contracts.**
  `search-index` kuyruğu + `enqueueSearchIndexJob` (OTOMATİK jobId — deterministik jobId change-stream'i bozuyordu) + `searchIndexJobSchema`. (4) **worker.**
  `search-index` işleyici (provider dispatch; idempotent + retry/backoff; poison log). (5) **api-gateway.** fire-and-forget emitter (Redis down→mutation
  etkilenmez) + 10 mutation noktasında reindex tetiği (product/variant/inventory/attribute-value/eksen/generation/identity/commercial + categoryAttribute/STORE
  attribute+option şema → store-batch). (6) **Testler.** search-service 35 + queues 6 + api-gateway trigger 6; api-gateway tam suite 1017 (regresyon yok). Gerçek-PG
  smoke (index/fiyat/stok/facet-replace/archive→removed/tsvector FTS/EXPLAIN Index-Only-Scan/cascade) + event-driven smoke (enqueue→worker→read-model) + backfill
  smoke (DRAFT hariç + idempotent) hepsi PASS. Gate: prisma format/validate/generate + turbo build 24/24 + lint 36/36 + test 36/36 + git-diff TEMİZ; CI yeşil. DEPLOY:
  api-gateway+worker merged-main'den rebuild, migrate deploy (up to date), 7/7 healthy, deployed event-driven smoke (container worker) ALL PASS. KAPSAM DIŞI: public
  search/facet uç · storefront PLP/filtre · URL sync · autocomplete/synonym · OpenSearch · AI ranking · kampanya-etkin fiyat facet'i · PLATFORM attribute global fan-out (TD-049).

- TODO-155 — Faz 2C-8B: Public Search & Facet API (DONE + MERGED + DEPLOYED — 2026-07-19, ADR-079 Faz B;
  feat `5a5e597`, PR #83, merge `04264ae`=main; CI lint·test·build yeşil (3m37s); deploy: merged-main'den api-gateway+worker rebuild,
  migrate deploy up-to-date (YENİ MIGRATION YOK), 4/4 healthy, post-merge runtime smoke ALL PASS).
  YALNIZ read-model'den okur (Product/EAV re-join YOK); Faz A read-model'i üstüne okuma katmanı. (1) **search-service.**
  `SearchProvider.search` + provider-bağımsız port tipleri (`SearchQuery`/`SearchFilter`/`SearchResult`/`SearchFacet`/`SearchError`); `search-query.ts` =
  read-model üzerinde bounded/parametreli/tenant-scoped raw SQL (result + disjunctive facet count/range + pagination + facet meta) + SAF yardımcılar
  (`assembleFacets`/`computePagination`/`deriveSelectionMode`/`escapeLike`). (2) **contracts.** `publicSearchResponseSchema` (ALLOWLIST). (3) **api-gateway.**
  `GET /public/stores/:storeSlug/search`; `search/query-parser.ts` (SAF; `filter[code]`+`[min]`/`[max]` bracket → düz-anahtar regex — Fastify default parser)
  + `search/routes.ts` (SearchError→HTTP; kategori adı + kapak görseli bounded page-hidrasyonu; allowlist); `searchProvider` DI seam. **Kararlar:** subtree
  DAHİL (recursive CTE); disjunctive facet (OR-içi/AND-arası/kendi-hariç, COUNT DISTINCT); relevance = exact→prefix→FTS rank→trigram→productId; taban fiyat
  range overlap (kampanyalı fiyat kapsam dışı); numaralı pagination (PUBLIC_CATALOG_MAX kullanılmaz); hata kodları (INVALID_SEARCH_QUERY/SORT/PAGINATION/FILTER/
  FILTER_VALUE, CATEGORY_NOT_FOUND, ATTRIBUTE_NOT_FILTERABLE); cache ERTELENDİ (read-model = materialized cache). (4) **Testler.** search-service 49 (+14) +
  api-gateway 1047 (+30) + contracts 107 + queues 8; tüm build/lint temiz. Docker gerçek-PG üretim-kod smoke 31/31 PASS + HTTP endpoint uçtan uca + EXPLAIN
  index doğrulaması + allowlist sıfır sızıntı; 4/4 healthy; smoke verisi temizlendi (cascade → read-model 0/0). KAPSAM DIŞI: storefront PLP/filter sidebar/
  mobile/URL sync UI · "daha fazla yükle" · autocomplete/suggest/synonym · search analytics · OpenSearch · AI ranking · best_selling/most_viewed sort ·
  promotion-aware price · Redis facet cache (Faz C+/E/F).

- TODO-156 — Faz 2C-8C: Storefront Search & Filter UI (PLANLANDI — henüz başlanmadı). Faz B public arama/facet ucunu (`GET /public/stores/:slug/search`)
  tüketen storefront PLP: kategori rotaları + URL-driven filtre (query-param), filter sidebar (dinamik facet render + count), mobile drawer, aktif-filtre çipleri,
  breadcrumb, result count, numaralı pagination (+opsiyonel "daha fazla yükle" progressive enhancement), SSR/ISR + cache tag. Autocomplete/synonym (Faz E),
  OpenSearch (Faz F) AYRI. Bu faza BAŞLANMADI.

- TODO-156A — Storefront Search Experience Mimarisi (ANALİZ, kod yok). Mevcut storefront + tamamlanmış search backend analizi → enterprise PLP/filter/URL-state/SEO/
  a11y/component mimarisi + fazlara bölünmüş plan (156B/156C/156D). Çıktı: `ANALIZ-156A.md`. **R1 riski** (arama kartının ticari/görsel zenginlik kaybı) → TODO-155.1.

- TODO-155.1 — Faz 2C-9: Search Listing Projection Enrichment (ADR-079 Ek). **DONE + MERGED + DEPLOYED** (feat `dbeeac0`, PR #85, merge `42bc9c7`=main; CI pass 3m34s; merged-main deploy 4/4 healthy + post-merge smoke ALL PASS). TODO-156A R1'i çözer:
  arama kartı için bounded/tenant-safe/public-safe listing projection'ı **index anında** snapshot'lanarak read-model'de tutulur (ikinci hydration turu YOK; read-model-only
  korunur). `ProductSearchDocument` additive: `compareAtMinor`/`discountPercent`/`omnibusPreviousPriceMinor` (typed) + `listing` jsonb (primary/secondary görsel +
  swatches[] + swatchTotalCount). Migration `20260719130000` **additive**. Ticari snapshot (tek indirim formülü; Omnibus yalnız indirim aktifken, sahte yok) + swatch
  (media-tanımlayıcı eksen; ACTIVE option ∩ ACTIVE varyant; dedupe/sortOrder/archived-inactive hariç/görsel fallback/deterministik default/bounded 8+total) + görsel
  (storageKey IÇ; url route'ta türetilir; eski resolveCovers sorgusu kaldırıldı). DTO additive + allowlist (storageKey/mediaId sızmaz). **Gate:** search-service 70
  (+21) · contracts 110 (+3) · api-gateway 1047 · full build 24/24 · typecheck · lint TEMİZ. **Docker gerçek-PG smoke ALL PASS** (backfill 3 indexed · 3-swatch gerçek
  veri · compareAt→discount%20 yansıma · idempotency revision 0→1 · allowlist sıfır sızıntı; smoke verisi geri alındı). **KAPSAM DIŞI (→155.2):** kampanya/indirim rozeti
  snapshot'ı (F4A motoru paylaşımı) · zamanlanmış reconciliation sweep kodu (strateji dokümante) · promotion-aware filter/sort · Redis cache. Bkz. TD-050.

- TODO-155.2 — Faz 2C-9B: Search Listing Semantic Completion (**DONE · worktree · gate + docker smoke ALL PASS; commit/PR YAPILMADI — TODO-156C ile birleşik ship bekliyor**).
  İKİ gerçek tutarsızlık kapatıldı: (A) **PDP↔PLP kampanya**: pure `selectPublicCampaignDisplay` + `CampaignRecord`/`CampaignCouponRecord` + `toCouponDisplayFields` **paylaşılan pakete
  taşındı** (`@commerce-os/contracts`; PDP + indexer AYNI "tek formül"). `selectIndexableCampaignSnapshot` index-anı birincil rozet + kazanan pencere → `ProductSearchDocument.campaign`
  (jsonb) + `campaignStartsAt/EndsAt` (additive migration `20260719140000`); read-time `isCampaignSnapshotDisplayable` bastırma + lifecycle reindex (`onCampaignChanged→reindexStore`)
  + reconciliation sweep (`CAMPAIGN_RECONCILE_ENABLED`, in-process setTimeout, default off). (B) **Swatch↔Facet**: variantDefining+filterable eksen seçimleri (`ProductVariantOptionValue`)
  artık `ProductFacetValue`'ya index'lenir (`buildFacets` VAV **+** variant eksen option birleşik dedupe) → Demo Hoodie Renk facet'i ELLE SEED OLMADAN üretilir. checkout otoriter KALIR
  (PLP fiyatı bilgilendirici tahmin; ADR-062). **Gate:** full build 25/25 · search-service 78 · api-gateway 1057 · storefront 317 · i18n 47 · lint · next build · diff-check TEMİZ.
  **Docker smoke ALL PASS** (gerçek Demo Hoodie: PLP kartı ₺1.349,10 %10 "Sepette" = PDP ile birebir · Renk facet auto Siyah/Kırmızı/Mavi · disjunctive filtre · canlı read-time
  suppression · allowlist sıfır sızıntı · regresyon home/cart/pdp 200; geçici endsAt mutasyonu backfill ile geri alındı). Bkz. ADR-079 Ek + PHASE_LOG Faz 2C-9B + TD-050.1/051.3 (RESOLVED)
  + TD-053.5 (kısmen) + TD-054. **Sıradaki: TODO-155.2 + TODO-156C birleşik final review + ship.**

- TODO-156B — Faz 2C-8C: Storefront Search Experience Foundation (DONE · **MERGED + DEPLOYED**; feat `415a0cd`, PR #87, merge `77042e4`=main; 5/5 healthy + post-merge runtime smoke ALL PASS). PLP (`/products`) URL-state + RSC + public
  search endpoint temeline geçti: tek-otorite URL codec (`lib/search/url-state.ts`, gateway parser'ıyla birebir + kanonik serialize), sunucu-yalnız BFF (allowlist parse),
  biçimleme-yalnız listing adapter, search-özel ProductCard (swatch preview + secondary hover; varyant seçimi yok), numaralı SSR pagination (Load More ertelendi), gerçek
  header arama (mock kaldırıldı), loading/empty(4 durum)/error(route boundary) UX, SEO temeli (noindex arama+filtre / canonical). Eski `ProductListingView` (istemci
  filtre/slice) silindi; catalog/PDP/eski `.../products` ucu KORUNDU. Gate: storefront 273/273 (+75 test) · i18n 47 (TR/EN parity) · contracts 110 · next build yeşil ·
  lint temiz · **Docker runtime smoke ALL PASS** (PLP SSR · header arama · sort · pagination · geri/ileri · swatch · mobil 2-kolon · PDP/katalog regresyon). YENİ MIGRATION
  YOK. **KAPSAM DIŞI:** facet UI (→156C) · Load More (→156C/D) · kampanya rozeti (→155.2) · kategori SEO landing + JSON-LD (→156D) · autocomplete/suggest/recent (backend yok).
  Bkz. PHASE_LOG Faz 2C-8C + TD-051.

- TODO-156C — Faz 2C-8D: Dynamic Facet Experience (**DONE · gate + worktree docker smoke ALL PASS; commit/PR bekliyor**). Storefront facet UI eklendi: veri-güdümlü
  `FacetRenderer` registry (`resolveFacetKind`: selectionMode birincil / dataType sunum → checkbox/color/boolean/range/date; bilinmeyen → checkbox fallback; switch-case YOK)
  + desktop kalıcı `FilterRail` (sticky) + mobil tam-yükseklik `FilterDrawer` (role=dialog/aria-modal/ESC/scroll-lock/focus-trap; **rail ile AYNI `FacetList` renderer**) +
  `ActiveFilterChips` (YALNIZ URL-türevli; tekil kaldır kanonik removeHref + tümünü temizle) + Fiyat/Stok top-level facet + collapse/"daha fazla göster" + disjunctive count/
  selected yansıması. URL mutasyonları SAF tek yazma noktası (`url-state.ts`: toggle/removeValue/removeFilter/setRange/withPrice/withInStock/clearedFiltersOnly); **yerel filtre
  state YOK** (her etkileşim → URL replace → RSC SSR refetch). +39 test (312/312) · i18n +25 anahtar (parity 47) · `next build` yeşil · lint temiz · **YENİ MIGRATION YOK**.
  Docker smoke: desktop tık→disjunctive→çip, mobil drawer+ESC+focus dönüş, deep-link/refresh/share 3 kombine filtre, geri; seed verisi geri alındı. Bilinçli kapsam dışı:
  slider (TD-053.2) · Load More (156C/D) · DATE canlı (TD-053.4) · kampanya rozeti (155.2). Bkz. PHASE_LOG Faz 2C-8D + TD-051.1 (RESOLVED) + TD-053. Sıradaki: TODO-156D.
- TODO-156D — SEO URL Governance, Category SEO, JSON-LD & Accessibility Hardening (**DONE · worktree · gate + `next build` doğrulandı; commit/PR/deploy YAPILMADI — brief kuralı**).
  ADR-080/081/082/083. Pure domain motorları (`@commerce-os/utils`: slug + redirect, çerçeve-bağımsız, +50 test) · storefront SEO katmanı (`lib/seo/`: site-url/routes/breadcrumb/
  metadata/json-ld/product-seo, TEK otorite) · JSON-LD (Organization/WebSite+SearchAction/BreadcrumbList/ItemList/Product+Offer) · **PDP generateMetadata YOK'tan VAR** (canonical/OG/
  robots + Product/BreadcrumbList JSON-LD + `notFound()` 404 + React cache) · robots.ts/sitemap.ts/not-found.tsx · kategori-farkında H1+breadcrumb · public `seoTitle/seoDescription`
  (additive) · SlugHistory+Redirect tablo temeli (migration `20260719150000`, gateway/UI'ya bağlı DEĞİL) · a11y breadcrumb semantik düzeltmesi. **KARAR SAPMASI (belgeli, ADR-080):**
  kategori surface = PLP `/products?category=slug` (ayrı `/categories/[slug]` REDDEDİLDİ → soft-404+duplicate önlenir). **KAPSAM DIŞI (brief):** autocomplete/analytics/AI search/
  merchandising/Admin UI · rel prev/next (canonical page-self yeterli). Gate: unit 2070/2070 · `next build` 17 route temiz. Bkz. PHASE_LOG TODO-156D + TD-055…063.
- TODO-156D tamamlama — SlugHistory Write Path & Runtime Redirect Resolution (**DONE · worktree · gate + `next build` doğrulandı; commit/PR/deploy YAPILMADI**). TD-058 + TD-059
  KAPANDI. (1) Write path: ürün/kategori PATCH transaction'ında slug gerçekten değişince `recordSlugChange` (gateway `src/seo/slug-governance.ts`) → SlugHistory (immutable/idempotent)
  + otomatik **301** redirect + **chain collapse** (A→B,B→C ⇒ A→C; back-rename/loop tohumu temizliği) atomik. (2) Runtime: storefront `middleware.ts` 404'ten ÖNCE public
  `GET /public/stores/:slug/redirects` (enabled-only + enum→sayısal allowlist, TTL-cache'li) → SAF `resolveRedirect` (chain/loop guard) → doğru 301/302/307/308; broken/loop/missing → geçiş
  (soft redirect YOK). Path tek kaynak `@commerce-os/utils` productUrlPath/categoryUrlPath. **Sınır (TD-064):** kategori runtime redirect query-param olduğu için hariç (`/categories/[slug]`
  bekliyor); ürün tam çalışır. Gate: **unit 2097/2097** · storefront tsc TAM temiz (TD-056 + latent fixture'lar düzeltildi) · `next build` + `ƒ Middleware` kayıtlı · MIGRATION YOK.
  Docker smoke (gerçek DB PATCH→satır + middleware 301) = deploy adımı (TD-063). Sıradaki: ayrı shipping promptu.
- TODO-156E — Faz 2C-8E: Enterprise Search Autocomplete & Discovery (**DONE · worktree · gate + `next build` + Docker/tarayıcı smoke doğrulandı; commit/PR/merge/deploy YAPILMADI — brief kuralı**).
  ADR-084. **AYRI hafif suggest yolu** (`SearchProvider.suggest`; tam search motorunu çağırmaz — facet/pagination YOK; provider-bağımsız → OpenSearch AYNI imza) · `suggest-query.ts` bounded
  motor (products relevance-sıralı + brands DISTINCT/COUNT + categories breadcrumb'lı recursive-CTE + SAF query-suggestions) · gateway `GET /public/stores/:slug/autocomplete` +
  hafif process-yerel TTL cache (Redis YOK; `x-autocomplete-cache` hit/miss) · `publicAutocompleteResponseSchema` ALLOWLIST (storageKey/internal SIZMAZ) · storefront `/api/autocomplete`
  proxy (gateway URL sunucu-yalnız) · **combobox** (ARIA listbox: aria-expanded/controls/activedescendant, ↑↓/Enter/ESC/Home/End/Tab, hover↔aktif, aria-live) · **debounce 180ms +
  AbortController + RACE guard + client cache** · XSS-güvenli highlight (Türkçe fold) · empty (recent localStorage + popüler placeholder) / results (4 grup + "tüm sonuçlar") / zero-result
  kurtarma · **mobil tam-ekran drawer** (autofocus/scroll-lock/ESC/safe-area) · no-JS native GET fallback korundu. **KAPSAM DIŞI (Çalışma Sınırı):** AI/semantik arama · typo tolerance ·
  synonym · click/impression analytics · ranking motoru · personalization · recent-search sunucu persistence · popüler-arama analytics. Migration YOK; eski search/SSR/SEO DEĞİŞMEDİ.
  Gate: **search-service 87/87 · api-gateway 1081/1081 · storefront 386/386** (yeni: +9 suggest, +14 gateway ac, +23 storefront ac) · tsc temiz · `next build` 18 route (`/api/autocomplete`
  kayıtlı). **Docker smoke (gerçek PG + tarayıcı):** autocomplete/desktop/mobil/klavye(aria-activedescendant + Enter→PDP)/cache(miss→hit)/kategori(breadcrumb)/marka/ürün/allowlist(0
  storageKey sızıntısı)/hata(400/404) HEPSİ PASS. Bkz. PHASE_LOG Faz 2C-8E + TD-066…071.
  **UX Rafinasyonu (2. geçiş):** fiyat KALDIRILDI (keşif ekranı) · ürün kartı ad→marka→kategori + Yeni/Kampanya nötr rozet (categoryLabel route-resolved; Çok Satan=TD-072) · grup sırası
  Öneriler→Kategoriler→Markalar→Ürünler (boş grup gizli) · "tüm sonuçları görüntüle (N)" (SuggestResult.total) · empty "tüm ürünlere göz at" (popüler kategoriler=TD-073) · aktif satır
  belirginleşti (sol ink çubuğu, tek-accent korundu). Gate: 87+1081+392 test · +6 panel testi · tsc temiz · `next build` 18 route · Docker+tarayıcı smoke (fiyat-yok/rozet/grup-sırası/total) PASS.
- TODO-157 — Enterprise Demo Commerce Dataset (**DONE · worktree · seed+backfill+verify canlı doğrulandı; commit/PR/deploy YAPILMADI — brief kuralı**).
  Deterministik demo veri seti (`enterprise-demo` store / `edm-store` scope; production `demo-store` izole). Ölçek: 37 kategori (29 yaprak) ·
  66 marka · 471 ürün · 2.202 varyant · 25 attribute (111 option) · 14 kampanya · 2 depo. Tek sabit tohum → idempotent (2× seed birebir aynı;
  duplicate yok). Search/facet/autocomplete/campaign-badge canlı doğrulandı (`/public/stores/enterprise-demo/search` + `search:backfill`).
  Script'ler: `packages/db/scripts/enterprise/*` + `enterprise-seed.mjs` + `verify-enterprise-seed.mjs`; komutlar `db:seed-enterprise` / `:dry` /
  `db:backfill-enterprise` / `db:verify-enterprise`. Runbook: `docs/runbooks/enterprise-demo-dataset.md`. Karar: ADR-085. Sınırlar: TD-066, TD-067.
  Gate: SAF üretici vitest 43/43 · eslint clean · verify 21/21 · db test 59/59. **PR #94 sonrası:** autocomplete `suggest` ucuyla brand/category/product
  öneri gruplarının final UX smoke'u (runbook §PR #94). PR #94'e bağımlı test EKLENMEDİ (main davranışıyla doğrulandı).
- TODO-158A: Storefront CMS Foundation — Home Experience Platform. (DONE — worktree'de; commit/PR YOK, brief kuralı)
  Polimorfik `HomeSection` (String type + JSON config → yeni tip migration'sız) + 3 çocuk tablo; additive migration
  `20260720120000_add_home_experience`. Gateway: section CRUD + hero/featured/showcase-manuel uçları + MANUAL/DYNAMIC
  showcase motoru (6 kural) + tek public composed `GET /public/stores/:slug/home`. Store-admin "Ana Sayfa Deneyimi"
  modülü (`/home` + `/home/[sectionId]`; section CRUD + yukarı/aşağı + tip-özel çocuk yöneticileri + MediaUpload).
  Storefront ana sayfası tümüyle `/home`'dan beslenir; hardcoded mock KALDIRILDI (fallback: generic hero + gerçek ürün).
  Full-width hero slider (mobil görsel + autoplay). Kart yoğunluğu iyileştirildi. Enterprise seed 8 section ekler.
  Media MEDIA_IN_USE guard'ı hero/featured görsellerini kapsar. Karar ADR-086; sınırlar TD-074…TD-079.
  Gate: gateway 1092 test · store-admin 313 · storefront 392 · contracts 110 · i18n 47 · api-client 23 · lint clean ·
  storefront+store-admin next build PASS · runtime `/home` smoke PASS (8 section, tüm showcase dolu, campaign restore edildi).

## TODO-158B — Enterprise Theme Engine & Design Token Architecture (ADR-087)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Yeni paket: `@commerce-os/theme` — versiyonlu `ThemeDocument` (design/semantic/component katmanları),
  token resolver (döngü/derinlik korumalı), CSS Variable motoru (storefront uyum varları + `--ds-*` zengin
  katman), 10 preset, `buildThemeDocument` (semantic/component otomatik türer), variant kataloğu, custom-CSS
  sanitize, import/export (schemaVersion migrasyon kancası). 99 birim test.
- DB: `Theme` + `ThemeVersion` (migration `20260720140000_add_theme_engine`, additive). Store başına tek
  PUBLISHED; tema başına tek DRAFT + tek PUBLISHED; publish → yeni immutable versiyon + taze draft; rollback.
- Contracts + api-client: theme admin DTO'ları (belge OPAK; gateway doğrular) + `admin.theme.*` + public
  `PublicTheme`.
- Gateway: `src/theme/{data,routes}.ts` (CRUD+versiyon+publish/rollback+import/export+canlı önizleme+preset) +
  inline public `GET /public/stores/:slug/theme` (sunucu-çözülmüş CSS, allowlist). 13 route testi.
- Storefront: `getStoreTheme()` + layout `<style>` `:root[data-theme]` enjeksiyonu → mevcut bileşenler
  (header/footer/hero/button/badge/product-card/category-card/section-title) otomatik yeniden temalanır.
  Varsayılan tema globals.css ile birebir (geriye-uyumlu).
- Store-admin: Theme Studio modülü (`/theme` + `/api/theme/*` BFF, CSRF) — liste, preset'ten oluştur, token
  editörü, istemci-tarafı canlı önizleme, taslak kaydet, yayınla, import/export, rollback.
- Seed: enterprise-demo 1 published "Varsayılan" + 10 preset teması (Theme Studio ilk açılışta dolu).
- Sınırlar: TD-080…TD-086 (çok-app tüketim, @font-face yükleme, editör kapsamı, variant render, iframe
  önizleme, CSS AST sandbox, otomatik tema provizyonu).

## TODO-158C — Enterprise Storefront Experience Redesign Faz 1 (ADR-088)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Theme Engine (ADR-087) üzerine storefront UX/UI/IA/responsive/a11y/perf yükseltmesi; 0 hardcoded design value.
- **Token temeli:** globals.css medya-üzeri semantic katman (`--scrim-*`, `--on-media*`, `--control-*`,
  `--hero-h-*`, `shadow-lg`) + `.scrim-media`/`.on-media`/`.control-*`/`.overlay-scrim`/`.hero-frame` yardımcı
  sınıfları. Tailwind yalnız layout; tasarım değerleri CSS var'dan (tema-override edilebilir).
- **Hero:** sabit yükseklik (`.hero-frame`), container-hizalı `rounded-md` contained banner, belirgin CTA,
  tokenize ok/pagination (dokunmatikte görünür ok), LCP eager/high-priority görsel.
- **Navigation:** `sticky-header` (scroll gölge kondensi), `category-menu` mega menü (FEATURED_CATEGORIES,
  `getNavCategories`+`getHome` cache), mobil kategori akordeonu, tokenize campaign-bar, accent aksiyon/rozet.
- **Homepage:** `home-sections` ritmi/whitespace + tokenize featured overlay + "Tümünü gör"; `home/editorial`
  (`ValueProps`+`EditorialBanner`) fallback'te.
- **Product Card:** kompakt/premium; kampanya/indirim/yeni/TÜKENDİ rozet; tokenize wishlist/quick-view/modal;
  `product-media` placeholder token'landı (ham hex kaldırıldı). PDP benzer-ürünler → `StorefrontProductCard`.
- **Category:** `category-chips` PLP navigasyonu; premium featured grid; mega menü.
- **Footer:** premium IA — marka+social[MOCK] · Alışveriş/Yardım/Kurumsal/Yasal · güven+ödeme şeridi.
- Gate: `next build` PASS + tip geçerli · eslint temiz · 392 storefront + 47 i18n testi yeşil · canlı headless
  render (masaüstü/mobil) PASS. Analiz: `docs/analysis/TODO-158C-storefront-redesign.md`. Sınırlar TD-087…TD-090.

## TODO-159B — Admin Searchable Selectors & Media Library Scalability (ADR-090)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı). **TD-093 ve TD-095 KAPANDI.**
- Amaç: Store Admin'deki sabit limitli SEÇİM yüzeylerini (ürün/kategori/medya) ortak, sunucu-taraflı
  aranabilir bir seçici standardına taşımak ve medya kütüphanesinin sahte sayfalamasını gerçek
  sayfalamayla değiştirmek. (TD-091 envanter matrisi bu fazın kapsamı DIŞINDA — dokunulmadı.)
- **Denetim:** `docs/analysis/TODO-159B-admin-selectors-media-audit.md` — 9 seçim yüzeyi tek tek çıkarıldı
  (uç, limit, arama, sayfalama, seçili kaydın limit dışı davranışı, dataset istemciye alınıyor mu, tenant
  izolasyonu, payload/N+1 riski). Ana bulgu: seçili kayıtlar KAYBOLMUYOR (form id dizisini aynen geri
  gönderiyor) ama GÖRÜNMÜYOR — dolayısıyla kaldırılamıyor ve sayaç görünenden fazlasını söylüyor.
  Tespit edilen sabitler: kampanya/home seçicileri 25 (argümansız çağrı), ürün filtresi + kategori ebeveyn
  seçici 100, medya ucu sabit `take:100` (+ `offset` HİÇ uygulanmıyor), attribute IMAGE önizlemesi 100.
- **Query standardı (contracts):** `adminSelectorQueryBaseSchema` = ADR-089 tabanı + `ids`.
  `?ids=a,b,c` → ÇÖZÜM MODU: arama/sayfalama yok sayılır, yalnız o id'ler (mağaza içinde, en çok
  `ADMIN_SELECTOR_MAX_IDS`=100, istemcinin verdiği sırada) döner. Response ADR-089 meta'sının aynısıdır.
- **Yeni uçlar:** `GET /stores/:id/products/selector` (hafif projeksiyon: id/title/slug/status/sku/imageUrl/
  priceMinor/currency/stockAvailable/variantCount — ürün detay payload'ı TAŞINMAZ; `sku` yalnız tek aktif
  varyantlı üründe dolu) · `GET /stores/:id/categories/selector` (`path` = kökten kendine ad zinciri).
- **Kategori yolu N+1'siz:** sayfadaki satırların ebeveynleri SEVİYE SEVİYE, her seviyede TEK batched
  `findCategoriesByIds` ile çözülür (sorgu sayısı satır sayısına değil ağaç derinliğine bağlı; MAX_DEPTH=10
  hem üst sınır hem döngü guard'ı). Tüm kategori ağacı hiçbir istekte yüklenmez.
- **Paylaşılan SQL:** `buildAdminProductScanSql` — liste (`listProductsAdmin`) ve seçici
  (`listProductSelector`) AYNI filtre/sıralama üretecini kullanır; "listede var, seçicide yok" yapısal
  olarak imkânsız.
- **Ortak UI:** `apps/store-admin-web/components/selector/` — `useSelectorSearch` (300 ms debounce, sayfa,
  loading/empty/filtreli-empty/error+retry, `sourceKey` ile kaynak değişiminde yeniden çekim),
  `useSelectedItems` (batched `ids` çözümü + id-bazlı önbellek; listeden seçim EK İSTEK üretmez),
  `EntitySelectorField` (çipler + kaldır + tümünü kaldır + çözülemeyen id uyarısı),
  `EntitySelectorModal` (listbox deseni: `role="listbox"/"option"`, `aria-selected`,
  `aria-activedescendant`, ArrowUp/Down/Home/End/Enter, `aria-live` durum, Escape + odak yönetimi).
  Sayfalama çubuğu ADR-089'un `DataGridPagination`'ı. Yeni palet/token/hardcoded renk YOK.
- **Taşınan yüzeyler:** kampanya ürün + kategori kapsamı · Home Showcase ürünleri · Home öne çıkan
  kategoriler · ürün formu kategori ataması (★ ana kategori kuralları BİREBİR korundu; `ProductCategoryField`)
  · ürün listesi kategori filtresi (Data Grid araç çubuğuna `kind:"entity"` filtresi eklendi) · kategori
  ebeveyn seçici + liste ebeveyn adı çözümü · attribute IMAGE/FILE önizlemesi (`ids` moduna geçti).
  `ProductForm`'un `categories` prop'u KALDIRILDI (form artık kataloğu prop olarak almaz).
- **Medya (TD-095):** sabit `take:100` kaldırıldı; `page/pageSize/search/context/sortBy/sortOrder/ids` +
  ortak meta (legacy `limit/offset/total` KORUNDU). Sıralama allowlist'i modelde GERÇEKTEN olan alanlarla
  sınırlı (`createdAt`/`altText`/`byteSize`); `mimeType` filtresi eklenMEDİ (her görsel webp'e normalize
  edilir → sahte filtre olurdu). Picker'da context KİLİTLİ (cross-context bağlama guard'ı reddederdi).
  `admin.media.list` imzası `(storeId, query, token)` oldu.
- **Migration:** `20260722190000_add_media_pagination_index` — TAMAMEN ADDITIVE, geri alınabilir:
  `MediaAsset(storeId, createdAt)`. `EXPLAIN` ölçümü (60k sentetik satır, `page=5&pageSize=25`):
  indekssiz Parallel Seq Scan + top-N heapsort 7.524 ms / 1549 buffer → indeksli Index Scan Backward
  0.065 ms / 11 buffer. `context` filtresi de AYNI indeksi kullanıyor → ayrı bileşik index eklenmedi.
- Gate: build + typecheck + lint temiz · 1141 gateway (20 yeni) + 351 store-admin (22 yeni) testi yeşil ·
  `git diff --check` temiz.
- **Canlı doğrulama (enterprise-demo, gerçek Postgres):** 471 ürünün TAMAMI 5 sayfada erişilebilir
  (benzersiz 471/471) · alfabetik son sıradaki ürün arandı, KLAVYE ile seçildi, kaydedildi ve yeniden
  açıldığında korundu · mevcut kampanyanın 13 ürünlük kapsamı düzenleme ekranında eksiksiz göründü ve
  değişiklik yapılmadan kaydedilip yeniden açıldığında aynen kaldı · kategori yolu
  "Elektronik / Bilgisayar Bileşenleri / Ekran Kartı" olarak doğru üretildi · 139 medya kaydıyla
  `page=1`/`page=2` kesişimi 0, birleşim tam; 100'ün ötesindeki görsel `ids` ile çözüldü · başka mağazanın
  ürün/kategori/medya id'leri ÇÖZÜLMEDİ · `pageSize=500` ve `sortBy=hack` 400 döndü · `search=%` 0 kayıt
  (kontrolsüz wildcard yok) · response'ta `storageKey`/`checksum`/`createdBy` sızıntısı YOK.
- Sınırlar: TD-096 (medya araması yalnız `altText`; trigram yok) · TD-097 (picker'da context filtresi yok;
  ayrı Medya Kütüphanesi ekranı yok) · TD-098 (seçici fiyat/stok özeti iki LATERAL join; read-model'e
  bağlanabilir). TD-091'e DOKUNULMADI.

## TODO-159A — Enterprise Admin Data Grid Foundation (ADR-089)

- Durum: DONE (worktree; commit/PR/deploy YAPILMADI — brief kuralı).
- Amaç: Store Admin liste ekranlarını tek tek yamamak yerine ORTAK, yeniden kullanılabilir bir veri
  listeleme standardı kurmak; `/products`'ı bu standarda TAM taşımak.
- **Denetim:** `docs/analysis/TODO-159A-admin-data-grid-audit.md` — 29 liste yüzeyi (tam sayfa + modal)
  tek tek çıkarıldı (veri çekme, SS/CS, arama/filtre/sıralama/sayfalama/URL state/durumlar/toplu seçim/risk).
  Ana bulgu: "sessiz ilk sayfa" defekti — `listProducts()/listCategories()/listCustomers()` argümansız
  çağrılıyor, gateway varsayılanı `limit=50` sessizce uygulanıyordu; 471 ürünlük mağazada kataloğun %89'u
  panelden ERİŞİLEMEZDİ ve kullanıcıya bunun bir sayfa olduğu hiçbir yerde söylenmiyordu.
- **Query standardı (contracts):** `page`/`pageSize`/`search`/`sortBy`/`sortOrder` + modüle özel filtreler;
  `sortBy` her modülde KENDİ allowlist enum'u. `pageSize` üst sınırı (100) SUNUCUDA zorlanır. Response
  meta'sı `items`(data) + `page`/`pageSize`/`totalItems`/`totalPages`; legacy `limit`/`offset`/`total`
  AYNEN korunur (geriye uyumlu). Tek türetme: `buildAdminListPagination` / `resolveAdminListPage`.
- **Gateway:** `listProductsAdmin` (tek parametreli raw SQL → id + total, ardından mevcut `productSelect`
  ile hidrasyon; `LEFT JOIN LATERAL` yalnız fiyat/stok gerektiğinde; LIKE metakarakter kaçırma; sıralama
  kapalı allowlist'ten) + `listProductFilterOptions` (yeni `GET .../products/filter-options`).
  Kategori/müşteri uçlarına arama+durum filtresi+sıralama; sipariş ucuna sıralama.
- **Ortak UI:** `apps/store-admin-web/components/data-grid/` — `useDataGridQuery` (URL state motoru;
  filtre/arama/sıralama/pageSize değişince page 1'e döner, varsayılanlar URL'e yazılmaz), `DataGridToolbar`
  (görünür arama + filtre popover + kaldırılabilir aktif filtre çipleri + sıralama), `DataGrid` (yapışkan
  başlık, `aria-sort` sıralanabilir kolonlar, loading/empty/filtreli-empty/error, opsiyonel satır seçimi),
  `DataGridPagination` (aralık + toplam + önceki/sonraki + doğrudan sayfa + 25/50/100). Mevcut koyu cam kiti
  SARMALANIR; tek yeni token `--dg-header-surface` (yapışkan başlık opaklığı) — bileşende sabit renk yok.
- **Ürünler (tam uygulama):** arama (ad/slug/SKU/barkod/marka/tedarikçi) · filtreler (durum, satış tipi,
  satın alınabilirlik, kategori, marka, tedarikçi, stok durumu, fiyat aralığı) · sıralama (en yeni/en eski,
  ad A–Z/Z–A, fiyat artan/azalan, stok artan/azalan) · sayfalama 25/50/100 + toplam + aralık · tam URL state.
  NOT: modelde ayrı "yayın durumu" kolonu YOK — `status` yayın otoritesidir (uydurma kavram eklenmedi).
- **Ayrıca taşınanlar:** Kategoriler (arama/durum/sıralama/sayfalama) · Müşteriler (arama/durum/üyelik/
  sıralama/sayfalama) · Siparişler (sayfalama + sıralama + ortak sayfalama çubuğu; mevcut zengin filtre
  paneli KORUNDU). Sayfa-türevi özet metrikler kaldırıldı/işaretlendi (sunucu-taraflı sayfalamada yanıltıcı).
- **Migration:** `20260722120000_add_admin_list_indexes` — TAMAMEN ADDITIVE, geri alınabilir:
  `Product(storeId, createdAt)` + `Order(storeId, createdAt)`. `EXPLAIN` ile `Index Scan Backward` doğrulandı.
- Gate: build + typecheck + lint temiz · 1121 gateway (15 yeni) + 329 store-admin (16 yeni) testi yeşil ·
  `git diff --check` temiz. Canlı doğrulama gerçek enterprise-demo (471 ürün): toplam/sayfa/arama/filtre/
  sıralama/allowlist-400/pageSize-tavanı/tenant izolasyonu PASS.
- Sınırlar: TD-091 (envanter matrisi sınırsız) · TD-092 (sayfalamasız koleksiyon uçları) · TD-093 (ürün/
  kategori seçicileri hâlâ 100 ile sınırlı → arama tabanlı seçici gerek) · TD-094 (ILIKE araması için trigram
  indeksi) · TD-095 (medya kütüphanesi sabit 100 + yanıltıcı meta).

## TODO-159C — Inventory Matrix Scalability (ADR-092) — TAMAMLANDI

- Durum: **DONE — commit'e hazır (PR/deploy YAPILMADI).** TD-091 KAPANDI. Analiz:
  `docs/analysis/TODO-159C-inventory-matrix-scalability.md`; karar: ADR-092.
- Uygulanan: `GET /stores/:id/inventory/matrix` sunucu-otoriter (ADR-089 Data Grid). Query
  `page`/`pageSize`(≤100)/`search`/`sortBy`(allowlist)/`sortOrder` + `warehouseId`/`stockStatus`/`reserved`/
  `variantStatus`/`productStatus`; response `warehouse` + sayfa `rows` + `pagination` + sayfadan bağımsız
  `summary`. `listStoreVariants` → tek raw SQL CTE tarama (LIMIT/OFFSET + aggregate + attribute hidrasyonu;
  3 sorgu, N+1 yok). Çift otorite (ADR-076) SQL'de korundu; satır `currentCalc` SAF `computeCalc` ile.
  Ekran `useDataGridQuery` + Data Grid bileşenleri; KPI'lar server `summary`'den. Dashboard özeti de
  `summary`'ye taşındı. Additive `ProductVariant(storeId,status)` indeksi (migration `20260723120000`).
  Değişen dosyalar: contracts, api-client, inventory-engine (data/service/routes), BFF (list-query + matrix
  route + dashboard summary), store-admin `/inventory` page + client, i18n (tr+en), Prisma schema+migration;
  testler: contract + inventory-engine service + store-admin interactions + bff-security.
- Canlı doğrulama (enterprise-demo edm-store, 2.138 varyant): sorgu 5.7 ms, payload 819 KB → 9.7 KB (~84×),
  filtre↔summary paritesi (LOW_STOCK 187), tenant sızıntısı 0, non-default depoda item overlay yok.
- Ertelenen sınırlar: **TD-099** (kategori/marka/tedarikçi facet filtreleri — additive), **TD-100** (stok
  formülü SQL+JS iki dilde; parite testli). Gate'ler yeşil.
- Orijinal planlanan kapsam (referans):
  1. `inventory/matrix` ucuna sayfalama sözleşmesi (`page`/`pageSize` + ortak `adminListPaginationSchema`
     meta'sı; legacy yanıt alanları geriye-uyumlu korunur).
  2. SKU / barkod / ürün adı / varyant başlığı araması (sunucu-taraflı).
  3. Depo (warehouse) filtresi.
  4. Stok durumu filtresi (ör. stokta / tükendi / rezerve).
  5. Düşük stok filtresi (`reorderPoint` otoritesi TODO-152A'da netleşti — yeni kavram üretilmeyecek).
  6. `onHand` / `reserved` / `available` sıralaması (kapalı allowlist).
  7. Tam URL state (ADR-089 `useDataGridQuery`).
  8. 25/50/100 sayfa boyu; `pageSize` tavanı SUNUCUDA zorlanır.
  9. Batched minimum projeksiyon — satır başına ek sorgu YOK.
  10. Tenant izolasyonu (tüm sorgularda `storeId` zorunlu).
  11. N+1 kontrolü (`EXPLAIN` ile doğrulama; gerekiyorsa additive index).
  12. Toplu (bulk) envanter işlemlerinin sayfalamayla uyumluluğu — "görünen sayfa" ile "filtreye uyan tüm
      kayıtlar" ayrımı açıkça tanımlanacak; sessiz kısmi uygulama OLMAYACAK.
  13. TD-091 kapanışı.
- Ön koşul notu (TD-091'den, aynen geçerli): bu yalnız bir UI değişikliği DEĞİLDİR —
  `inventoryStoreMatrixResponseSchema` sayfalama meta'sı taşımıyor, `listStoreVariants` sayfalanabilir
  değil ve TODO-152A'nın "stok izleme merkezi" semantiği tüm satırların aynı anda görünmesine dayanıyor.
  Sözleşme değişikliği bu üçünü BİRLİKTE ele almalı.
- Kapsam dışı: envanter iş mantığı (rezervasyon, hareket ledger'ı, safety/reorder hesapları), depo CRUD,
  yeni stok kavramı, search read-model'e bağlanma (TD-094 ön koşulu).

## TODO-159D — Customer Lists & Wishlist (Customer Lifecycle · ADR-093)

- Durum: **DONE — tüm katmanlar + gate + canlı doğrulama YEŞİL; commit'e hazır (commit/PR/deploy
  YAPILMADI).** Sıra: TODO-159C'den SONRA, TODO-159E'den ÖNCE. Analiz:
  `docs/analysis/TODO-159D-customer-lists-wishlist.md`. Ertelenen sınırlar: TD-101…TD-105.
- Amaç: Favori (wishlist) + alışveriş listelerini ORTAK, tenant-safe `CustomerList` altyapısı üzerine
  kurmak; storefront'ta gerçek (mock olmayan) favori davranışı + Customer Account liste yönetimi.
- Domain: `CustomerList` (storeId, customerId, name, type, visibility, isDefault) + `CustomerListItem`
  (storeId, listId, productId, variantId?, addedAt, note?, quantity?, sortOrder?). Enum `CustomerListType`
  {WISHLIST, SHOPPING_LIST}, `CustomerListVisibility` {PRIVATE}.
- Varsayılan wishlist kuralı: her müşteri+mağaza için TAM bir adet default WISHLIST; ilk erişimde
  lazy-create; silinemez; yeniden adlandırılamaz. Aynı ürün/varyant aynı listeye iki kez eklenemez.
- Guest wishlist: first-party signed cookie (yalnız productId/variantId; fiyat/PII yok; maks. kayıt sınırı;
  bozuk/eski id toleransı). Login'de default wishlist'e idempotent merge + guest temizliği; kısmi hatada
  sessiz veri kaybı YOK. Cart-cookie/claimed-coupons merge deseni referans alınır (körlemesine kopya YOK).
- Favori davranışı: PLP · Home showcase · PDP · Quick View product-card yüzeyleri; gerçek backend durumu;
  optimistic + rollback; idempotent; `aria-pressed` + SR metni; batched status resolver (tüm katalog
  çekilmez, N+1 yok).
- Alışveriş listeleri (Customer Account): liste CRUD + item ekle/kaldır/taşı/kopyala + tekli/toplu sepete
  ekleme. Toplu sepete eklemede stokta olmayan/pasif ürün ATLANIR + sonuç özeti. Canlı ürün/variant/stok
  otoritesi (snapshot'a güvenilmez). Ekranlar: `/account/lists`, `/account/lists/[listId]`, wishlist kısa
  yolu. Liste detayı ADR-089 Data Grid pagination (varsayılan 25; 25/50/100; totalItems/totalPages).
- API (customer-scoped, `requireStore`+`requireCustomer`): list/create/get/rename/delete list · add/remove/
  move/copy item · batch-add-to-cart · wishlist status by ids · merge guest wishlist. Contracts paketinde
  şema. Müşteri yalnız kendi listelerine erişir; ID enumeration sızdırmaz; write öncesi ownership doğrulanır;
  batch üst sınırı sunucuda.
- Store Admin: MVP'de tam düzenleme YOK; müşteri detayında salt-okunur özet (liste sayısı, wishlist öğe
  sayısı, son eklenen tarih).
- Kapsam dışı (MVP): paylaşımlı/public liste, fiyat-düşüş bildirimi, admin liste analitiği.

## TODO-162 — Manual Shipment Status & Fulfillment (Operations · ADR-101)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL).** Operasyonel açık: entegre kargo süreci
  DIŞINDA yönetilen gönderiler `DELIVERED` olamıyordu (yalnız sağlayıcı sync'ten geliyordu) ve
  `order.fulfillmentStatus` kargo durumundan beslenmiyordu → sipariş "teslim edildi" işaretlenemiyordu.
- Çözüm: Operatör manuel durum ilerletme aksiyonu (`POST .../shipping/shipments/:id/status`). Saf kural
  `evaluateManualStatusChange` (monotonic + terminal-kilit + izinli hedef). Hedefler: IN_TRANSIT /
  OUT_FOR_DELIVERY / DELIVERED / DELIVERY_FAILED / RETURNED. Sağlayıcıya ÇAĞRI YOK.
- Karar (kullanıcı): DELIVERED → sipariş de FULFILLED (fulfillmentStatus + status; iptal korunur);
  her gönderide operatör override (terminal-kilit sync çakışmasını önler).
- Gönderi detay sayfasında "Kargo Durumunu İşaretle" (dropdown ileri hedefler + not); ShipmentEvent
  MANUAL_STATUS + OrderEvent ORDER_FULFILLED + AuditLog. Migration 20260723180000 (additive).
- Testler: `shipping-manual-status.test.ts` (8, saf transition).

## TODO-159F — Order Payment Recovery & Collection (Payment · ADR-095…100)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL; commit/PR/deploy YAPILMADI).** Sıra: TODO-159E'den
  SONRA, TODO-160'tan ÖNCE (kritik ödeme açığı). Analiz: `docs/analysis/TODO-159F-order-payment-recovery.md`.
  Ertelenen sınırlar: TD-110…TD-112.
- Migration `20260723170000_add_order_payment_recovery` (ADDITIVE): `PaymentStatus` +PAYMENT_PENDING/
  PARTIALLY_REFUNDED/PAYMENT_FAILED/CANCELLED; `PaymentAttemptType` + `PaymentManualMethod` enum;
  `PaymentAttempt` genişletme (type, nullable provider/mode/providerConfigId→SetNull, idempotencyKey unique,
  paymentUrl, expiresAt, initiatedBy, manual alanları). Backfill YOK.
- Durum makinesi tek otorite `payments/payment-state.ts` (SAF): canStartCollection · isAttemptActive ·
  resolveOrderPaymentTransition (monotonic; PAID sonrası geç FAILED webhook geriye çevirmez).
- Admin: `GET .../orders/:id/payment` (kalan bakiye + uygun sağlayıcılar + aktif deneme + geçmiş) +
  `payment-link` (oluştur) + `payment-link/regenerate` + `payment-link/email` + `manual-payment`. Store-admin
  sipariş detayında `OrderPaymentActions` paneli (link oluştur/kopyala/yenile/gönder + manuel modal).
- Public: opaque `GET/POST /public/pay/:token` (hash + TTL + tek-store; enumeration yok). Storefront
  `/pay/[token]` sayfası (MOCK sandbox tamamlama). E-posta dispatcher no-op (TD-110).
- Idempotency: sipariş başına tek aktif online link (`active-link:{orderId}` + DB unique; P2002→mevcut link).
  Manuel/online yarışı ve çift tahsilat engellenir; overpayment/kısmi manuel reddedilir.
- Shipment guard korunur (PAID/AUTHORIZED); ödeme sonrası yenilemede gönderi aksiyonu açılır.
- Testler: gateway payment-state saf (17) + sales-summary regresyon + store-admin `OrderPaymentActions`
  render (3) + webhook response shape güncellemesi. Tüm suite YEŞİL.

## TODO-159E — Product Reviews & Ratings (Customer Lifecycle · ADR-094)

- Durum: **DONE (tüm katmanlar + gate + testler YEŞİL; commit/PR/deploy YAPILMADI).** Sıra: TODO-159D'den
  SONRA, TODO-160'tan ÖNCE. Analiz: `docs/analysis/TODO-159E-product-reviews-ratings.md`. Ertelenen
  sınırlar: TD-106…TD-108.
- Migration `20260723160000_add_product_reviews_ratings` (additive; `ProductReviewStatus` enum + `ProductReview`
  + `ProductReviewHelpful` + `ProductRatingAggregate` + index/FK). Gerçek PostgreSQL'de uygulanıp doğrulandı.
- Uygunluk sunucu-otoriter (OrderLine↔Order↔Shipment). Aggregate = projection (tek yazma yolu
  `recomputeAggregate`; yalnız APPROVED; tamsayı toplam → float drift yok). Public projeksiyon ALLOWLIST.
- Moderasyon durum makinesi (PENDING/APPROVED/REJECTED/HIDDEN) + Store Admin `/reviews` + AuditLog. Storefront
  PDP değerlendirme bölümü + Account "Değerlendirmelerim" + 3 kart yüzeyi gerçek batched rating (mock KALDIRILDI).
- Helpful (idempotent, kendi-yorumu engeli, rate-limit). Testler: gateway route (20) + aggregate saf (6) +
  storefront rating-provider (4).
- Eski PLANLANDI kaydı (referans):
- Amaç: Ürünlere yıldız puanı + metin yorum; doğrulanmış alışveriş temelli güven; PDP rating özeti + yorum
  listesi; Store Admin moderasyonu.
- Kapsam (taslak): yıldız + metin yorum · sipariş kalemi bazlı yorum uygunluğu · doğrulanmış alışveriş
  rozeti · tekrar yorum koruması (ürün+müşteri tekil) · moderasyon durumları (PENDING/APPROVED/REJECTED) ·
  Store Admin moderasyon ekranı · PDP rating summary (ortalama + yıldız dağılımı) + yorum listesi · "faydalı
  buldum" · spam/rate-limit · iade/iptal sonrası doğrulama kuralı.
- Sonraki faz: görsel/video yorumu · satıcı yanıtı.
- Kabul kriterleri (taslak): yorum uygunluğu SUNUCU-otoriter (satın alma kanıtı doğrulanır); aynı müşteri
  aynı ürüne tek yorum; onaylanmadan PDP'de görünmez; tüm sorgular tenant-izole.
- **NOT:** TODO-159D görevinde yorum sistemi KODU yazılmaz; yalnız bu planlama kaydı.

## TODO-160 — Influencer Tracking & Attribution (Growth & Monetization)

- Durum: **DONE / SHIPPED (2026-07-24) — PR #113 MERGED (47a330e).** Analiz:
  `docs/analysis/TODO-160-influencer-tracking-attribution.md`. ADR-102…107 (+ADR-091 KABUL). Kapsam:
  Influencer/Campaign/TrackingLink CRUD · public `/t/:token` (gateway-imzalı opak grant + güvenli
  redirect) · first-party attribution cookie (last-click) · order snapshot (sunucu-otoriter) · iade/iptal
  net-gelir (append-only defter, idempotent) · bot/dedupe/rate-limit · dashboard + CSV export ·
  store-admin ekranları · KVKK hash minimizasyonu. **Tracking token HASH'li saklanır** (ADR-102
  ship-öncesi revizyon; plain URL tek-seferlik + rotasyon). Migration `20260724120000` (ADDITIVE).
  HTTP E2E (gerçek servisler) 33/33 PASS. Ertelenen: TD-113/114/115.
- Durum (özgün): **PLANLANDI — implementasyon YAPILMADI.** Sıra: TODO-159C'den SONRA.
- Amaç: Influencer/iş ortağı kaynaklı trafiği ölçülebilir, tenant-izole ve KVKK/GDPR uyumlu bir attribution
  zinciriyle gelire bağlamak: link → tıklama → oturum → sepet → checkout → sipariş → net gelir.
- Kapsam: Influencer CRUD · kampanya bazlı takip linkleri · güvenli kısa tracking token · click ve unique
  visitor ölçümü · first-party attribution cookie · last-click MVP · cart ve checkout attribution · order
  attribution snapshot · iptal/iade/refund sonrası net gelir düzeltmesi · attribution window · UTM ve kupon
  ilişkilendirmesi · dashboard · click / conversion / order / gross-net revenue / AOV metrikleri · CSV
  export · temel bot/fraud filtreleri · tenant isolation · KVKK/GDPR uyumlu veri saklama.
- **MVP:** Influencer CRUD · Tracking Link CRUD · click tracking · attribution cookie · last-click order
  attribution · temel dashboard · CSV export.
- **Sonraki faz:** Kupon attribution · multi-touch attribution · komisyon ve ödeme · fraud detection ·
  influencer portalı.
- Planlama notları (karar ADR-091, uygulama fazında netleşecek):
  - Attribution SUNUCU-otoriterdir ve sipariş anında SNAPSHOT'lanır; rapor sorgusu sonradan yeniden
    hesaplama YAPMAZ (fiyat/kampanya snapshot deseninin aynısı — bkz. ADR-047/ADR-058).
  - Tracking token tahmin edilemez olmalı; artan id / sayaç sızdırmamalı.
  - Refund/iptal net geliri DÜZELTİR ama gross'u geriye dönük bozmaz — iki metrik ayrı taşınır.
  - Attribution window ve cookie ömrü yapılandırılabilir; varsayılan dokümante edilir.
  - Kişisel veri minimizasyonu (IP/UA saklama politikası + saklama süresi) tasarımın parçasıdır, sonradan
    eklenen bir katman değil.
- Kapsam dışı (MVP): komisyon hesabı/ödeme akışı, influencer self-service portalı, gelişmiş fraud skorlama,
  multi-touch modelleri, dış reklam platformu entegrasyonu.

## TODO-160A — SKU Generation & Governance (Catalog Integrity)

- Durum: **DONE — KOD TAMAM (2026-07-24); commit/PR YAPILMADI (git kuralı).** ADR-109…113; analiz
  `docs/analysis/TODO-160A-sku-generation-governance.md`; migration `20260724130000_add_sku_source`
  (gerçek PG'ye uygulandı). SAF generator `@commerce-os/utils/sku` (34 test) · sku-engine
  (`apps/api-gateway/src/sku-engine/*`, preview/regenerate/validate/audit, 29 test) · variant üretim
  motoru okunabilir SKU + `skuSource=AUTO` · manuel create'te boş SKU AUTO üretim · audit/backfill CLI
  (`packages/db/scripts/{audit,backfill}-sku.mjs`, enterprise-demo canlı doğrulandı) · store-admin Otomatik
  SKU paneli + kaynak rozeti. Gate: build/typecheck/lint/test PASS. Ertelenen: TD-117 (import greenfield),
  TD-118 (docker canlı smoke). Sıra: TODO-160'tan SONRA, TODO-161'den ÖNCE.
- Amaç: SKU'yu varyant-seviyesi TEK OTORİTE yapmak; deterministik otomatik üretim + mağaza-içi benzersizlik
  garantisi + çakışma yönetimi + governance (audit + güvenli backfill). SKU ↔ barcode ayrı kavramlar.
- Kapsam: SKU varyant-seviyesi tek otorite · ürün/varyant oluştururken otomatik SKU · toplu varyant
  generator entegrasyonu · mağaza içi unique garanti (DB seviyesi) · manuel override · format ve uzunluk
  validation · Türkçe karakter transliteration + özel karakter normalizasyonu · ürün + variant option
  kodlarından deterministic üretim · collision → kontrollü sequence/suffix · preview + regenerate · import
  sırasında mevcut GEÇERLİ SKU'yu koruma · boş/tekrarlı/geçersiz mevcut SKU audit raporu · opsiyonel güvenli
  backfill · SKU değişikliklerini AuditLog'a yazma · OrderLine snapshot'taki eski SKU'yu koruma · SKU ↔
  barcode ayrımı · concurrency/idempotency · tenant isolation.
- **Zorunlu kurallar (kabul kriteri):** (1) Deterministik üretim (aynı girdi → aynı SKU) + DB-seviyesi
  store-unique. (2) Otomatik üretim mevcut GEÇERLİ SKU'ları EZMEZ (import/backfill koruma). (3) OrderLine
  SKU snapshot'ı sonradan DEĞİŞMEZ. (4) SKU ↔ barcode ayrı; biri diğerini türetmez. (5) Tenant-izole +
  AuditLog.
- **MVP:** varyant-seviyesi tek otorite · deterministik otomatik SKU · store-unique · collision suffix ·
  manuel override · preview/regenerate · format/transliteration validation · audit raporu.
- **Sonraki faz:** güvenli otomatik backfill (büyük katalog) · gelişmiş SKU şablon dili · barcode
  üretim/doğrulama (GTIN) entegrasyonu.
- Planlama notu: Uygulama fazında ADR (SKU otorite + deterministik üretim + governance) yazılacaktır.

## TODO-161 — Sponsored Product Management (Growth & Monetization)

- Durum: **DONE / KOD TAMAM (2026-07-24) — commit/PR YAPILMADI (git kuralı §18).** Analiz:
  `docs/analysis/TODO-161-sponsored-product-management.md`. ADR-114…120. Migration
  `20260724171728_add_sponsored_product_management` (gerçek PG'ye uygulandı + EXPLAIN doğrulandı). 7 zorunlu
  kural sağlandı: (1) `Sponsorlu` rozeti storefront'ta ZORUNLU, (2) organik ranking DEĞİŞMEZ (enjeksiyon
  organik-sonrası katman), (3) ayrı slotlar, (4) organik-tekrar dedupe, (5) sunucu-otoriter yoğunluk tavanı
  (search cap=2/1.sayfa, home maxItems, campaign maxSlots), (6) relevancy eşiği (keyword+ürün-metni /
  kategori), (7) kampanya bitince iz kalmaz. Ölçüm TODO-160 event/attribution katmanını yeniden kullanır;
  Influencer domaini AYRI (ADR-120 coexistence). Gate'ler: build/typecheck/lint/test PASS (1321 gateway
  test). Ertelenen: TD-119…122. Sıra: TODO-160A'dan SONRA; sıradaki = final enterprise UI/design polish.
- Amaç: Mağaza içi ürün öne çıkarmayı, organik arama kalitesini bozmadan, kullanıcıya açıkça etiketlenmiş
  ve ölçülebilir bir yerleşim (placement) sistemine dönüştürmek.
- Kapsam: Sponsored Campaign CRUD · sponsorlu ürün seçimi · başlangıç/bitiş tarihi · öncelik ve aktiflik ·
  ana sayfa sponsorlu vitrin · Home Experience (ADR-086) entegrasyonu · search sonuçlarında kontrollü
  sponsorlu slotlar · query ve kategori hedefleme · impression / click / cart / order / revenue ölçümü ·
  kampanya dashboard'u · tenant isolation · stokta olmayan/pasif ürünlerin otomatik elenmesi.
- **Zorunlu kurallar (pazarlıksız — kabul kriteri):**
  1. Kullanıcıya açıkça `Sponsorlu` etiketi gösterilir.
  2. Organik search sıralaması KALICI olarak bozulmaz; sponsorluk organik skoru değiştirmez.
  3. Sponsorlu sonuçlar AYRI slotlarda enjekte edilir.
  4. Aynı ürün sponsorlu ve organik olarak İKİ KEZ gösterilmez (dedupe garantili).
  5. Sponsorlu yoğunluk sınırlıdır (sayfa/sonuç kümesi başına tavan, sunucuda zorlanır).
  6. Arama sorgusuyla İLGİSİZ ürün gösterilmez — sponsorluk alaka eşiğini atlatamaz.
  7. Kampanya bitince ürün organik davranışına döner; kalıcı iz bırakmaz.
- **MVP:** Campaign CRUD · ürün seçimi · tarih/öncelik · homepage showcase · search sponsored slots ·
  sponsorlu etiketi · impression/click/order attribution · temel raporlama.
- **Sonraki faz:** CPC/CPM · bütçe · keyword bidding · placement yönetimi · vendor self-service ·
  faturalandırma.
- Planlama notları (karar ADR-091, uygulama fazında netleşecek):
  - Enjeksiyon, organik sonuç kümesi ÜRETİLDİKTEN SONRA ayrı bir katmanda yapılır; `ProductSearchDocument`
    read-model'inin sıralama skoruna dokunulmaz (ADR-079 read-model-only ilkesi korunur).
  - Ürün seçimi ADR-090'ın ortak seçici sözleşmesini (`products/selector` + `ids` çözüm modu) kullanır —
    yeni bir seçici deseni üretilmez.
  - Ana sayfa vitrini ADR-086'nın polimorfik `HomeSection` altyapısına yeni bir tip olarak oturur
    (migration'sız genişleme; bkz. TD-089).
  - Uygunluk (stok/durum) filtresi RENDER anında uygulanır; süresi dolmuş veya elenmiş ürün için impression
    kaydedilmez.
- Kapsam dışı (MVP): teklif/açık artırma mekaniği, bütçe tüketimi ve faturalandırma, satıcı self-service
  arayüzü, dış reklam ağı entegrasyonu.

## TODO-161A — Sponsorship Agreements, Billing & Settlement (Growth & Monetization)

- Durum: **DONE / KOD TAMAM (2026-07-25) — commit/PR YAPILMADI (git kuralı §17).** Analiz:
  `docs/analysis/TODO-161A-sponsorship-commercial-operations.md`. ADR-121…127. Migration
  `20260725090000_add_sponsorship_billing_settlement` (gerçek PG'ye uygulandı; ADDITIVE; search
  index'leri korundu). TODO-161 placement/attribution altyapısını TÜKETİR; gösterim motorunu yeniden
  yazmaz.
- Amaç: Sponsor firma anlaşmalarını, ücretlendirme modellerini, tahakkukları, tahsilatları ve kampanya
  mutabakatını tenant-safe biçimde yönetmek.
- Teslim: `SponsorAccount` + `SponsorshipAgreement` (+ Campaign bağı) + `SponsorshipSettlement` +
  `SponsorshipCharge` + `SponsorshipPayment`. SAF çekirdek `sponsorship/billing-core.ts` (pricing +
  tax + balance + overdue + budget + lifecycle + coverage + refund adjustment; 59 test) +
  `delivery-guard.ts` (ticari teslim WHERE). `sponsorship/data.ts` (Prisma, tenant-izole) +
  `sponsorship/routes.ts` (store-admin; public uç YOK; 13 HTTP test). Store-admin: `/sponsors`,
  `/sponsors/[id]`, `/sponsorship-agreements`, `/sponsorship-agreements/[id]`,
  `/sponsorship-settlements`, `/sponsorship-payments` (Data Grid + BFF proxy + CSV).
- Gate'ler: build/typecheck/lint/test PASS. Canlı doğrulama: 17 adım / 31 assertion PASS. Ertelenen:
  TD-123…126. Sıra: sıradaki = final enterprise UI/design polish.

## TODO-161A.2 — Unified Sponsorship Commercial Flow / Birleşik Sponsorluk Ticari Akışı (Growth & Monetization — stabilization/hotfix)

- Durum: **DONE (2026-07-27) — MERGED + DEPLOYED.** Commit `2be74d9`; PR `#124`; merge commit `947557d`;
  deploy `api-gateway + store-admin-web` (main'den rebuild + recreate); auth'lu 75.000 TL smoke **25/25 PASS**;
  **TD-126 CLOSED**. TODO-161/TODO-161A ürün modelini tek ve tutarlı sponsorluk akışına dönüştüren
  STABİLİZASYON/HOTFIX fazıdır (yeni bağımsız feature DEĞİL). ADR-128/129. Migration
  `20260726120000_add_sponsorship_advance_allocation` (ADDITIVE; uygulanmış dosya immutable — gerçek PG'de doğrulandı).
- Kök problem: sponsorlu gösterim (TODO-161) ile ticari/finans (TODO-161A) iki kopuk silo; anlaşma-kapılı
  aktivasyon guard'ı (ADR-124 Katman 1) dokümanlı ama WIRE EDİLMEMİŞ; `commercialMode` kampanya formunda
  seçilemiyor (hep INTERNAL_PROMOTION); avans/mahsup iş mantığı yok; menüde "Sponsorlu Ürünler" yanlış
  grupta (Satış).
- Teslim:
  - Şema (ADDITIVE): `SponsorshipAdvanceAllocation` (append-only avans mahsup defteri) +
    `SponsorshipAgreement.approvedAt/approvedByUserId` (onay metası).
  - Domain (`billing-core.ts` SAF): `computeAdvanceAvailableMinor`, `isWithinAdvanceBalance`,
    `isAdvanceAllocationValid`, `mapIneligibilityToActivationError`, `CampaignActivationError`.
  - Domain (`sponsorship/data.ts`): `createFixedFeeCharge` (settlement'sız FIXED_FEE tahakkuk),
    `createAdvance`, `allocateAdvance` (advisory-lock + iyimser kilit), `listAvailableAdvances`,
    `listOpenCharges`, `listEligibleAgreements`, `getCampaignCommercialSummary`; alacak hesabına avans
    mahsupları dahil; onay damgası `updateAgreement`'ta.
  - Yazma guard (`sponsored/`): kampanya create/update'te `commercialMode` + opsiyonel `agreementId`
    bağlama + `SPONSORED`+`ACTIVE` için aktivasyon guard'ı (409 domain kodları); server.ts DI köprüsü.
  - Contracts + api-client + store-admin BFF + UI: menü yeniden gruplama (Sponsorlu Kampanyalar →
    Sponsorluk grubu), kampanya formu tip/sponsor/anlaşma seçimi, kampanya detay ticari kart, anlaşma
    detay avans/mahsup/FIXED_FEE aksiyonları, sponsor detay kullanılmamış avans.
- **Zorunlu kurallar (sağlandı):** (1) sponsor yoksa anlaşma yok, anlaşma yoksa ticari kampanya
  aktifleşmez; (2) INTERNAL_PROMOTION muaf; (3) kampanya tarihi anlaşma aralığında; (4) aynı kampanya
  tek aktif anlaşmaya bağlı; (5) admin write guard = public delivery guard; (6) alacak = tahakkuk −
  mahsup edilmiş tahsilat; (7) avans açık işlemle mahsup (sessiz dağıtım yok); (8) aşırı tahsilat/mahsup
  + over-allocation reddi; (9) eşzamanlılık advisory-lock; (10) append-only defterler; (11) para birimi
  bazında ayrı; (12) geçmiş event/settlement/tahakkuk/ödeme SİLİNMEZ.
- Gate'ler: build/typecheck/lint/test/`git diff --check`. Canlı 75.000 TL senaryosu: §17 (deploy'lu
  store-admin). Canlı auth'lu tümleşik akış (yerel dev api-gateway :4100 + store-admin :3102, gerçek migrate
  edilmiş PG/enterprise-demo; kullanıcı girişi) 25/25 adım DOĞRULANDI → **TD-126 KAPANDI (2026-07-27)**. Smoke'ta
  bulunan 3 UI metni düzeltildi (başlık "Sponsorlu Kampanyalar"; "Append-only"/"OVERDUE" jargonları Türkçeleştirildi).

## TODO-161A.1 — Commercial Automation & Data Retention (Growth & Monetization — stabilization) — DONE / MERGED + DEPLOYED

- Durum: **DONE — MERGED + DEPLOYED (2026-07-27).** Commit `a6c607b` · PR `#126` · merge commit `36b188b` ·
  deploy `api-gateway + store-admin-web`. Analiz:
  `docs/analysis/TODO-161A.1-commercial-automation-retention.md`. ADR-130…136. **TD-125 / TD-121 / TD-113 CLOSED.**
  Ertelenen teknik borçları operasyonel otomasyona ve veri saklama hijyenine bağladı. Yeni ticari yüzey EKLEMEDİ.
  Zamanlayıcı eşzamanlılığı **dağıtık PostgreSQL advisory lock** (session `connection_limit=1`) + 409
  `JOB_ALREADY_RUNNING`; job yaşam döngüsü `QueueJobLog`'a yazılır.
  Canlı doğrulama (gerçek PostgreSQL, izole veri) 17/17 PASS; 42 yeni birim/route testi PASS; buildler temiz.
- Doğrulama borcu: **TD-127 ✅ CLOSED (2026-07-27)** — auth'lu `/operations` UI click-through smoke; fixture-session
  (30 dk TTL, demo admin + edm-store, secret dışarı çıkmadan) ile deployed store-admin üzerinde settlement
  dry-run/run (+ duplicate/FINALIZED korunması), retention dry-run/apply (181g sil / 179g + recommendation +
  finans koru), 6 QueueJobLog durumu, SKIPPED_LOCKED (409 JOB_ALREADY_RUNNING), güvenlik (401/redirect · 404 ·
  sunucu-otoritesi · açık onay · stack sızmıyor) ve TR/EN doğrulandı. Kod defekti yok → docs-only kapanış.
- **TD-125 — Automatic Settlement Scheduling:**
  - Haftalık / aylık / campaign-end dönemlerinde **DRAFT** settlement üretimi.
  - **Otomatik finalize YOK** (tahakkuk yine admin onayıyla).
  - Idempotency (aynı dönem iki kez üretilmez).
  - Scheduler overlap kilidi (advisory-lock; overlapping tur yok).
  - Timezone-aware dönem hesaplama.
  - Retry + job audit.
  - Hata alan bir anlaşma diğerlerini **BLOKLAMAZ** (izole hata).
  - Desen: TODO-129 shipment-sync worker (provider-agnostic; api-gateway içi; default kapalı env bayrağı).
- **TD-121 + TD-113 — Attribution Event Retention & Purge:**
  - Sponsored (TODO-161) + influencer (TODO-160) **ham event** saklama politikası.
  - Domain tabloları AYRI kalır; **ortak purge yardımcıları** kullanılabilir.
  - Finansal attribution / order / refund / settlement **snapshot'ları SİLİNMEZ**.
  - Varsayılan **dry-run** + explicit `--apply` bayrağı.
  - Store scope + batch delete + circuit breaker + environment guard + operasyon raporu.
  - Başlangıç retention: **180 gün**.
- **Kapsam DIŞI:** e-Fatura, muhasebe entegrasyonu (TD-124), bidding, advertiser portal, sponsor-influencer ticari
  birleşimi, yeni placement tipleri (TD-120).
- Sıra: **TODO-161A.2'den SONRA — TAMAMLANDI**; sonraki hotfix = BUG-PDP-001; sonraki faz = TODO-161B
  (Recently Viewed & Product Recommendations).

## BUG-PDP-001 — PDP Quantity Changes Displayed Unit Price (hotfix) — DONE / KOD TAMAM

- Durum: **DONE / KOD TAMAM (2026-07-27) — commit/PR YAPILMADI (git kuralı §8).** PDP artık daima seçili
  varyantın tek adet birim fiyatını gösterir; adet değişimi fiyat gösterimini etkilemez.
- **Kök neden:** `apps/storefront-web/components/buy-box.tsx` — standart (otomatik-kampanya olmayan) fiyat
  bloğu `unitMinor * quantity` + `compareMinor * quantity` ile ARA TOPLAM gösteriyordu. Otomatik kampanya
  bloğu (`showAutoPriceBlock`) birim fiyatı çarpmıyordu → render-yolu ayrımı.
- **Artesan vs Xiaomi:** Artesan `campaign.displayKind=PUBLIC_COUPON` → otomatik blok DEVREDE DEĞİL → standart
  blok → adetle çarpım (629110×2=1.258.220 = ₺12.582,20, bug raporuyla birebir). Xiaomi
  `displayKind=AUTOMATIC_CART_DISCOUNT+PERCENT` → otomatik blok → birim fiyat çarpılmaz → zaten doğruydu.
- **Fix:** SAF `resolveUnitPriceLabels` (`apps/storefront-web/lib/money.ts`; quantity parametresi ALMAZ);
  standart blokta `*quantity` çarpanları + adete bağlı "Birim fiyat" notu KALDIRILDI. `quantity` yalnız
  `addToCartAction` payload'ında. Fiyat otoritesi `selectedVariant.unitPrice`.
- **Sunucu otoritesi (değişmedi):** sepet cookie'si yalnız `{variantId, quantity}`; gateway kendi fiyatını
  çözer (`server.ts:4106`). Cart/checkout/order/payment sunucuda.
- **Test/gate:** yeni `test/buy-box-unit-price.test.ts` (7 test); build 25/25 · typecheck · lint 38/38 ·
  test 1478 api-gateway + storefront · `git diff --check` temiz.
- **Canlı smoke (enterprise-demo):** Artesan adet 1→2→5 fiyat sabit ₺6.291,10; sepet satır toplamı sunucuda
  ₺31.455,50 (=6.291,10×5). Xiaomi adet 1→2 sabit; varyant değişince birim fiyat ₺56.896,50→₺68.705,20 (adet
  2 sabit, 2× değil). İki-ürün sepeti tutarlı (genel toplam ₺155.124,86). Checkout auth gerektirir (parola
  girilemez → non-interactive); grand/payment total sepet özetinde sunucu-otoriter doğrulandı. Demo bütün.
- Sıra: **BUG-PDP-001 (bu) tamamlandı → TODO-161B → final enterprise UI/design polish.**

## TODO-161B — Recently Viewed & Product Recommendations (Growth & Monetization) — DONE / MERGED + DEPLOYED

- Durum: **DONE / MERGED + DEPLOYED (PR #130, `a223beb`/`8e2e804`). Launch Audit 2026-07-27 ile doğrulandı —
  bayat "commit YOK" kaydı düzeltildi.** Analiz: `docs/analysis/TODO-161B-recently-viewed-product-recommendations.md`.
  ADR-137…143.
- İki AYRI capability: (1) Recently Viewed — sunucu-tarafı, KVKK-uyumlu görüntüleme geçmişi
  (`RecentlyViewedProduct`; dual-key customerId|visitorHash, kısmi unique + XOR CHECK; HAM IP/UA saklanmaz;
  visitorHash = HMAC(SESSION_SECRET, `commerce_os_vid`); bot/prefetch elenir; max 50/kimlik; guest→customer
  idempotent merge; 90-gün retention TODO-161A.1 SAF altyapı reuse + ayrı worker). (2) Similar Products —
  geçmişten BAĞIMSIZ açıklanabilir ağırlıklı skor (SAF `similarity-core.ts`; kategori/marka/fiyat/salesMode/
  ortak-attribute; read-model aday sorgusu bounded; sponsored/organik ranking'e DOKUNMAZ; fallback katmanları).
- API (public/customer): `POST/GET/DELETE .../recently-viewed`, `POST .../recently-viewed/merge`,
  `GET .../products/:productId/similar`. Kartlar read-model `listing` snapshot'ından (publicSearchProductSchema).
- Yüzeyler: PDP "Benzer Ürünler" (statik related grid → açıklanabilir motor client island) + PDP görüntüleme
  izleyici · Home "Son İncelediklerin" client şerit (CMS-section DEĞİL; ADR-141) · Cart düşük-yoğunluk şerit
  (sepet ürünleri hariç) · Hesabım "Görüntüleme Geçmişi" bölümü (temizle + bounded liste). i18n TR+EN.
- **Pre-ship hardening (2026-07-27):** (1) **TD-128 CLOSED** — öneri kartlarında wishlist kalbi GERÇEK
  (island'lar `WishlistProvider initialSavedIds` ile sarılı; BFF GET yanıtları `getWishlistStatus` → `savedIds`;
  auth→gateway, guest→cookie; optimistic+rollback). (2) **Similarity candidate KATMANLI** (ADR-142 revize) —
  tek OR + global createdAt LIMIT yerine per-tier-kotalı (SIMILAR_PER_TIER=120) katmanlı sorgu (alt/üst kategori,
  marka+fiyat, ortak facet, fallback); ilgisiz ilk-N sonucu bozmaz + katalog-sonundaki ilgili aday bulunur.
  Additive index `ProductSearchDocument(storeId, brand)` (migration `20260727140000`). Canlı 200-boundary smoke +
  EXPLAIN doğrulandı.
- Migration: `20260727130000_add_recently_viewed_products` + `20260727140000_add_search_brand_index` (additive;
  gerçek Postgres'te uygulandı + doğrulandı; `prisma migrate status` up to date).
- Testler: 51 yeni backend test + api-gateway suite yeşil (1529 test) + storefront (435 test, 5 yeni UI);
  storefront tsc temiz. Gate'ler: build/typecheck/lint/test/git-diff/migrate-status — hepsi yeşil.
- TD durumu: **TD-128 CLOSED**; TD-129 (Home şeridi CMS-yönetimli değil) + TD-130 (recommendation ölçümü) AÇIK.
- Sıra: **TODO-161B (bu) → Final enterprise UI/design polish.**

## TD-129 + TD-130 — Recommendation Surface Governance & Measurement (ADR-144…148) — DONE / MERGED + DEPLOYED

TODO-161B'nin iki açık teknik borcunu kapatan governance/ölçüm fazı. **DONE / MERGED + DEPLOYED (PR #131,
`1ea9f19`/`c7817d0`). Launch Audit 2026-07-27 ile doğrulandı — bayat "commit YOK" kaydı düzeltildi.** Final
enterprise UI/design polish HÂLÂ son faz.

- **TD-129 CLOSED (ADR-144)** — Home "Son İncelediklerin" artık yönetilebilir bir `HomeSection` tipi: `RECENTLY_VIEWED`.
  `type=String` olduğu için **migration GEREKMEZ** (SPONSORED_SHOWCASE deseni). Config (JSONB): `{ layout, maxItems≤50,
  titleTr?, titleEn? }`. ADR-141 gerilimi: section YALNIZ sunum config'i taşır → `/home` cacheable/viewer-agnostic
  kalır; veri storefront istemcisinde `/recently-viewed` ucundan hidrasyon (TODO-161B altyapısı değişmedi). Public
  compose `RECENTLY_VIEWED`'i boş-atlama olmadan emit eder (geçmiş kararı client'ta; geçmiş yoksa şerit render olmaz).
  Katmanlar: contracts (enum + config + public union) → gateway (home data/routes parseConfig + server.ts compose) →
  store-admin (form + detail info + TR/EN başlık; base title/subtitle bu tipte gizli) → storefront (catalog-types +
  getHome locale başlık çözümü + home-sections render). Eski manuel iki sabit `RecentlyViewedRail` (CMS + fallback)
  KALDIRILDI (duplicate yok).
- **TD-130 CLOSED (ADR-145…148)** — Recommendation Measurement. AYRI davranış-event domaini: `RecommendationEvent`
  tablosu (migration `20260727150000`; yalnız Store FK; productId/anchorProductId plain; visitorHash/sessionHash HMAC;
  bot/prefetch satır YAZMAZ; `dedupeKey` add-to-cart idempotency). Modül `apps/api-gateway/src/recommendation-events/`
  (event-core SAF + data + routes + retention üçlüsü). Uçlar: `POST /public/stores/:slug/recommendation-events`
  (impression/click/add-to-cart ingest) + `GET /stores/:storeId/recommendation-events/summary` (platform-admin funnel).
  source (`RECENTLY_VIEWED`/`SIMILAR_PRODUCTS`) + placement (`HOME`/`PDP`/`CART`/`ACCOUNT`) + type ALLOWLIST;
  sunucu-otoritesi (store slug'dan, kimlik hash, createdAt sunucu, ürün+anchor store-sahipliği, rate limit). UI wiring:
  `RecommendationCard` wrapper (IntersectionObserver %50 → impression; onClickCapture → click + sessionStorage
  attribution) Home/PDP/Cart/Account'ta; buy-box başarılı add-to-cart'ta son-öneri-tıklama attribution tüketir (sahte
  aksiyon yok). Dedupe: impression 30 dk, click 30 sn, add-to-cart dedupeKey. Retention 180 gün (ayrı worker/jobType,
  `RETENTION_TABLE_SPECS`'e dokunmaz; env gate default kapalı). Store-admin görünürlük: `/home/insights`.
- Migration: `20260727150000_add_recommendation_events` (additive; gerçek Postgres'te uygulandı + doğrulandı).
- Testler: yeni backend (event-core + retention + routes) + home RECENTLY_VIEWED + storefront attribution;
  gateway 1566 · storefront 439 · store-admin 356 — hepsi yeşil; tüm tsc temiz.
- Sıra: **TD-129/130 (bu) → Final enterprise UI/design polish (SON faz).**

## TD-131 — Customer Data Erasure Workflow (Compliance / KVKK-GDPR) — DONE / MERGED + DEPLOYED

- Durum: **DONE / MERGED + DEPLOYED (PR #132, `cd48c87`/`f184b89`; migration `20260727160000` main'de). Launch
  Audit 2026-07-27 ile doğrulandı — bayat "commit YOK" kaydı düzeltildi.** Kalan: **TD-132** (yasal-kimlik
  süre-sonu purge) yalnız EXTERNAL DECISION. Analiz:
  `docs/analysis/TD-131-customer-data-erasure-workflow.md`. ADR-149…155.
- **İki ayrı aksiyon (karıştırılmaz):** DEACTIVATE (status→PASSIVE + oturum revoke; veri korunur, geri alınabilir)
  ve ERASE_PERSONAL_DATA (status→ERASED terminal; kişisel+davranışsal veri silinir/anonimleşir; finansal/yasal
  korunur; geri alınamaz; müşteri yeniden aktifleştirilemez/giriş yapamaz).
- **Migration:** `20260727160000_customer_erasure` (additive: `CustomerStatus.ERASED` + `Customer.erasedAt/
  erasedByUserId/eraseReason`; gerçek PostgreSQL'de uygulandı + doğrulandı).
- **Domain:** `apps/api-gateway/src/customer-erasure/` (core/data/service/routes). Dry-run preview (YAZMA YOK) +
  apply (müşteri-izole advisory lock `customer-erasure:<storeId>`/`<customerId>` + tek transaction + kilit-altı
  ikinci okuma → idempotent) + deactivate. Hata kodları: `CONFIRMATION_REQUIRED`/`REASON_REQUIRED`/
  `ERASURE_IN_PROGRESS`/`CUSTOMER_ALREADY_ERASED`/`CUSTOMER_NOT_FOUND`.
- **Sil:** session/credential/token/OTP/IBAN/commPref/address/wishlist(+item)/coupon/recentlyViewed/reviewHelpful
  + FK'siz `RecommendationEvent` (deleteForCustomer). **Anonimleştir:** Customer (name/email→placeholder/phone→null/
  birthDate/gender/verified) + Order (customerEmail→placeholder, billingEmail→null) + OrderAddress (fullName/phone/
  adres satırları) + CampaignRedemption.email. **Koru:** Order/OrderLine/PaymentAttempt/redemption mali + Order
  yasal fatura kimliği (`billingTaxId` vb. — asgari saklama; süre-sonu purge = TD-132). **Review:** KORU+ANONİM
  (silinmez; yazar Customer'dan türer; helpfulCount recompute). Guest/cross-store DOKUNULMAZ; audit PII-SIZ.
- **UI:** Store-admin müşteri detayı Danger Zone kartı + geri-alınamaz danger modal (dry-run özeti + confirmation
  phrase `KİŞİSEL VERİLERİ SİL` + reason). ERASED müşteri "Silinmiş" rozeti; düzenlenemez; giriş yapamaz. TR/EN.
- **Testler:** 25 birim (customer-erasure core 6 / service 10 / data 9) + **47/47 canlı erasure smoke** (gerçek
  PostgreSQL, enterprise-demo). gateway 1594 · store-admin 356 — yeşil; build/typecheck/lint temiz; `git diff --check` temiz.
- Kalan borç: **TD-132** (yasal-kimlik süre-sonu retention purge). Doğrulama borcu **TD-127** (auth'lu `/operations`
  UI click-through) → **✅ CLOSED (2026-07-27)** ayrı docs-only turda; bkz. `docs/TECHNICAL_DEBT.md` TD-127.

## Launch Readiness — Production Gap Audit iş kalemleri (2026-07-27)

Kaynak: `docs/analysis/launch-readiness-product-gap-audit.md`. Bu tur **yalnız analiz** (kod/migration/UI
değişikliği yok). İş kalemleri öncelik sırasıyla:

- **LR-PB-1 (PROD BLOCKER) — Ödeme webhook imza zorunluluğu → ✅ CLOSED / MERGED + DEPLOYED (2026-07-27; PR #135,
  merge `382e1c8`; ADR-156/157/158).** Eski client-otoriteli `/payments/webhooks/:provider` KALDIRILDI; doğrulanmış
  `POST /public/payments/webhooks/:webhookToken` (HMAC + store token'dan + attempt provider reference'tan +
  amount/currency invariant + monotonik + idempotency; fail-closed). Migration `20260727170000` deploy edildi.
  30 test + 14/14 canlı + **21/21 production-stack** exploit regresyonu. Analiz:
  `docs/analysis/PB-1-payment-webhook-authenticity.md`. **Kalan (EX-1'e bağlı):** TD-137 sağlayıcı-native imza,
  TD-138 provisioning UI. Gerçek ödeme yalnız EX-1+TD-137 sonrası.
- **LR-PB-2 — Felaket kurtarma restore yolu. ✅ CLOSED (2026-07-28).** `@commerce-os/backup` + `database-backup`
  worker + CLI'lar (`db:backup:run`/`db:restore`/`db:verify-restore`/`db:backup:retention`): gerçek `pg_dump -Fc` +
  AES-256-GCM (fail-closed) + S3-uyumlu offsite (SigV4/private/remote-doğrulama) + GFS retention + gerçek restore +
  izole restore-verification. Canlı DR smoke (`infra/scripts/dr-smoke.zsh`) MinIO+boş-postgres PASS. `db:restore-enterprise`
  → `db:reseed-enterprise` (ADR-166). ADR-159…166; runbook `docs/runbooks/database-backup-restore.md`. Bkz. TD-135.
- **LR-PB-3 — Offsite backup otomasyonu. ⚠️ IMPLEMENTED-BUT-NOT-CONFIGURED (OPEN).** Zamanlama/retention/offsite
  adapter kod+test+smoke tamam AMA gerçek **production offsite provider'ı yapılandırılmadı** + production'dan doğrulanmış
  remote backup yok (yalnız MinIO/local smoke). Gerçek provider config + ilk production backup doğrulaması gelene dek
  **OPEN / launch blocker**. Bkz. **TD-139** (+ TD-140 media volume, TD-141 verify-target).
- **LR-H-1 (HIGH) — Tema token XSS. ✅ ÇÖZÜLDÜ (2026-07-28, ADR-180, TD-134 CLOSED).** Typed token registry +
  parse-tabanlı validators + render-time (serializer geçersizi atlar) + save-time (`THEME_TOKEN_*`/`THEME_PUBLISH_BLOCKED`)
  savunma; font/shadow preset policy; customCss sertleştirme; store-admin field-level TR/EN; legacy tarama scripti; canlı
  smoke (vuln→fix) PASS. Kalan: storefront CSP (**TD-147**, MEDIUM). Bkz. `docs/analysis/H-1-theme-token-stored-xss.md`.
- **LR-H-2 (HIGH) — Revenue-share currency guard. ✅ ÇÖZÜLDÜ (2026-07-28, ADR-181…186, TD-133 CLOSED).** Gelir toplamları
  agreement currency'ye filtrelenir (snapshot tek-para); karışık-para dönem → **fail-closed** (`REVENUE_CURRENCY_MISMATCH`/
  `AGREEMENT_CURRENCY_REQUIRED`/`SETTLEMENT_CURRENCY_MISMATCH`), sessiz dışlama yok; currency-aware dashboard + audit
  (PII-free) + store-admin uyarı; scheduler fail-closed; salt-okuma tarama (`db:scan-sponsorship-currency`); canlı smoke
  21/21 PASS. FX kapsam dışı (**TD-148** FUTURE). Bkz. `docs/analysis/H-2-revenue-share-currency-guard.md`.
- **LR-H-3 (HIGH) — Rezervasyon expiry. ✅ ÇÖZÜLDÜ (2026-07-29, ADR-187…193, TD-136 CLOSED).** Rezervasyon lifecycle
  (ACTIVE→CONSUMED/RELEASED/EXPIRED) + TTL (`RESERVATION_TTL_MINUTES`=15) + read-time expiry add-back
  (`findExpiredReservedByVariant`; süresi dolmuş rezervasyon stoğu azaltmaz) + write-time lazy-expiry (`placeOrder`,
  `FOR UPDATE`) + consume/release idempotent (PAID→`SALE_COMMIT`; CANCELLED→release; PAYMENT_FAILED retryable bırakılmaz)
  + `inventory-reservation-expiry` worker (advisory lock + `FOR UPDATE SKIP LOCKED` + dry-run/apply + circuit breaker +
  QueueJobLog) + orphan DRAFT/PLACED-UNPAID kontrollü CANCELLED (silmez) + payment-vs-expiry fail-closed
  (`LATE_PAYMENT_AFTER_EXPIRY`) + salt-okuma reconciliation + store-admin uçları. Migration `20260729120000` gerçek PG'de
  uygulandı (backfill PAID+ACTIVE'e dokunmadı; baseline temiz); 25 test + 18/18 canlı smoke PASS. **Pre-ship hardening
  (ADR-194…196):** süpürücü api-gateway runtime'ından `@commerce-os/inventory` paketi + `apps/worker` BullMQ Job
  Scheduler'a taşındı (gateway yalnız enqueue/status/reconcile-scan; setTimeout kalmadı); PAID+ACTIVE reconcile servisi
  (dry-run varsayılan, SALE_COMMIT yalnız-eksikse, belirsiz→MANUAL_REVIEW); lock-ordering (Reservation→Item) + stok
  counter invariant; 35 test + 13/13 hardening canlı smoke (PG+Redis) PASS. TD-033'te yalnız single-tx create+place
  atomiklik dilimi açık kalır (stok-kilitlenmesi dilimi CLOSED). Çok-depolu/waitlist + refund-on-restock FUTURE
  (ADR-193). Bkz. `docs/analysis/H-3-reservation-expiry-orphan-draft-cleanup.md`.
- **LR-H-4 (HIGH) — Para-yolu auth'lu smoke. ✅ DOĞRULANDI (2026-07-29, TD-122 CLOSED).** Deployed gateway'de
  imzalı payment webhook 10/10 (legacy→404, unsigned/wrong-sig/old-ts→401, amount/currency/reference mismatch→
  no-mutation, valid→PAID applied, duplicate→idempotent, PAID sonrası late FAILED→no rollback); fixture
  `CustomerSession` auth (200/401/401) + cross-store isolation (401 `CUSTOMER_UNAUTHORIZED`); consume-on-paid iki
  ödeme yolunda wired (`server.ts:4744`/`:6610`); Sponsored funnel/revenue-share/settlement/attribution/refund
  gateway suite'leriyle kapsandı. Gate'ler yeşil (build/typecheck/lint + **1793 test PASS**); veri bütünlüğü
  clean-except-legacy (2 pre-H-3 PAID+ACTIVE reservation kalıntısı → reconcile uyarısı, kod defekti değil).
  **Kod defekti bulunmadı → docs-only kapanış.** Residual: store-admin UI-piksel click-through Final UI Polish'e
  devredildi (parola; non-interactive). Bkz. `docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`.
- **LR-MEDIUM:** dağıtık rate-limit (TD-015), dev seed APP_ENV guard, migrate-on-release gate, worker dağıtık kilit,
  search reconciliation süpürücü, kategori runtime redirect (TD-064), mail altyapısı, admin-web Settings inert sayfa.
- **LR-FINAL-POLISH:** ERASED müşteri ACTIVE seçeneği (server 409-guard'lı), `JOB_ALREADY_RUNNING` i18n eşlemesi,
  öneri kartı rating yıldızları, parola-değişimi diğer-session revoke, internal-token constant-time, shipping bildirim butonu.
- **LR-EXTERNAL DECISION:** canlı ödeme sağlayıcısı (TD-034), yasal-saklama süre-sonu purge (**TD-132**), ürün import
  launch-kapısı GTM segmenti (TD-117).
- **Bayat kayıt temizliği (yapıldı):** TODO-161B / TD-129/130 / TD-131 "commit YOK" → MERGED olarak düzeltildi.
  **TODO-159G:** recovery (`cb0fe74`) + seed-koruma (`f9834c9`) main'de → "commit/PR/deploy YAPILMADI" notu bayat;
  kalan yalnız TD-116-b (guard'lar imaj-rebuild sonrası canlı).

## Influencer Campaign Lifecycle & Granular Analytics (2026-07-28, ADR-170…176) — KOD TAMAM / commit YOK

TODO-160 çekirdeği üzerine iki kusur + yaşam döngüsü + granüler analitik. Analiz:
`docs/analysis/influencer-campaign-lifecycle-and-analytics.md`.

- **Yaşam döngüsü.** Campaign enum `DRAFT/ACTIVE/PAUSED/ENDED/CANCELLED` (+legacy ARCHIVED); link `ACTIVE/PAUSED/REVOKED`
  (+legacy INACTIVE). Additive migration `20260728120000_influencer_campaign_lifecycle` (gerçek PG'ye uygulandı+doğrulandı).
  Link alanları `utmContent/utmTerm/customLabel/activatedAt/pausedAt/revokedAt` eklendi.
- **Redirect (ADR-171/172).** Saf `evaluateRedirectEligibility` (store+influencer+campaign+link+tarih+target). Uygun
  değilse `available:false` (hedef sızmaz) → storefront `/campaign-unavailable?state=<bucket>` (200+noindex). Terminal
  sayfa attribution EVENT'i değil. Gateway `POST /public/.../track/:token` yanıtına `available/reason/bucket` eklendi.
- **Attribution (ADR-173).** Saf `evaluateConversionEligibility`; PAUSED/ENDED pencere-içi eski session convert eder;
  CANCELLED/DRAFT + REVOKED link etmez. `resolveAttributionForCheckout` yeniden yazıldı (+link REVOKED engeli + link↔
  campaign tutarlılık).
- **Analitik (ADR-174/176).** `apps/api-gateway/src/influencers/analytics.ts` (aggregate/campaign/link, N+1 yok,
  per-currency) + `serialize.ts`. 3 yeni gateway ucu + api-client + store-admin BFF + UI (kampanya kartı metrik + drill-down,
  kampanya detay + link detay sayfaları). Multi-currency ayrı toplam.
- **Test.** `influencer-lifecycle.test.ts` (26) + `influencer-serialize.test.ts` (13) + mevcut route testleri güncellendi.
  Tüm suite yeşil.
- **Sıra:** commit'e hazır → ardından **H-1 Theme Token Stored XSS**. Kalan: canlı smoke (TD-143), UTM per-currency (TD-144),
  create formu yeni UTM alanları (TD-145), günlük seri grafiği (TD-146).

## H-1 — Theme Token Stored XSS (2026-07-28) — ADR-180 · TD-134 CLOSED

Kök neden: Theme Engine (ADR-087) token değerleri `z.string().min(1)` ile doğrulanıp serializer'da ham olarak
`<style dangerouslySetInnerHTML>`'e basılıyordu → public storefront stored XSS (`#fff</style><script>…`); `.passthrough()`
bilinmeyen anahtar da sızdırıyordu. Üç render sink (storefront layout, gateway `/preview`, store-admin canlı önizleme) tek
serializer'a bağlı.

- **Registry + validators** (`packages/theme/src/registry.ts`, `validate.ts`): 8 tip (COLOR/LENGTH/NUMBER/
  FONT_FAMILY_PRESET/FONT_WEIGHT/SHADOW_PRESET/DURATION/EASING); parse+range+canonical-normalize; generic string yok;
  bilinmeyen primitive anahtar reddedilir.
- **Render-time defense** (`css.ts`): serializer her değeri tipine göre validate eder, geçersizi atlar; bozuk ref
  render'ı çökertmez; bilinmeyen anahtar yayınlanmaz.
- **Save-time defense** (gateway `theme/routes.ts`): draft/publish/import token doğrulaması + `THEME_TOKEN_UNKNOWN/
  INVALID_VALUE/TYPE_MISMATCH/UNSAFE_VALUE` + `THEME_PUBLISH_BLOCKED`; yanıt ham payload/regex taşımaz.
- **Font/shadow preset policy**: ham font-family/box-shadow kabul edilmez → preset ID + kanonik allowlist.
- **customCss sertleştirme** (`custom-css.ts`): yorum-strip + tüm `<` kaldırma + fixpoint döngü.
- **Store-admin** (`theme-studio.tsx`): field-level doğrulama (renk/radius kırmızı işaret), publish-blocked state, font
  preset selector, `messageForError` (lokalize); i18n TR/EN `THEME_TOKEN_*`/`THEME_PUBLISH_BLOCKED`.
- **Legacy tarama**: salt-okuma `packages/db/scripts/security/scan-theme-tokens.mjs` (payload loglamaz).
- **Test**: 147 theme (validate/registry/custom-css/css) + 6 gateway integration (XSS regression). **Canlı smoke**
  (enterprise-demo): vuln doğrulandı (8× DOM breakout) → fix payload'ı düşürdü → fixture geri yüklendi.
- **Kalan**: storefront CSP (**TD-147**, MEDIUM).
- **Sıra**: kod/test/smoke/docs TAMAM → commit'e hazır (git işlemleri bu turda YOK).

## Influencer Analytics Demo Completion (2026-07-28) — TD-143/144/145/146 CLOSED

Analytics demo tamamlama fazı: currency-aware UTM (TD-144), tam tracking link formu + customLabel (TD-145), günlük
zaman serisi grafiği (TD-146), deterministik demo fixture + runbook + canlı smoke (TD-143). ADR-177…179. Yeni backend:
`analytics-range.ts` (tz-aware bounded range + zero-fill, birim-testli); `analytics.ts` currency-aware daily/UTM;
store-admin `analytics-chart.tsx` + `date-range-picker.tsx`. Fixture `packages/db/scripts/influencer-demo-seed.mjs`;
runbook `docs/runbooks/influencer-analytics-demo.md`. Gate'ler yeşil; SHIP hazır → ardından **H-1 Theme Token Stored XSS**.

## TODO-162 Storefront Discovery & Merchandising (2026-07-30) — TÜM DİLİMLER TESLİM (commit YOK)

Home Experience'ı eligibility-driven keşif yüzeyine dönüştürme fazı. Bir section yalnız gerçek/doğrulanmış
sinyal eşiğini karşılarsa render edilir; aksi halde DOM'a hiç eklenmez (boş başlık/spacing/impression yok);
kişiselleştirilmişte fallback yasak. Mevcut Home/Recently Viewed/Wishlist/Cart/Orders/Campaign/Sponsored
altyapıları REUSE; paralel CMS yok.

**Teslim (build+test yeşil):** analiz (`docs/analysis/TODO-162-...md`) · eligibility motoru
(`home/eligibility-core.ts` + `SECTION_BOUNDS` + `resolveDiscoveryGrid`, 25 test) · analytics çekirdek
(`home/discovery-event-core.ts`, 9 test) · kontrat allowlist (10 yeni tip + config şemaları) + gateway config
validation · `HomeDiscoveryEvent` ADDITIVE migration (`20260730120000`, gerçek Postgres'te uygulandı+doğrulandı).
ADR-197…ADR-206.

**Kalan:** Katman B `POST .../home/discovery` resolver+endpoint (cart-recs/personalized-deals/repurchase/
similar-to-purchased/wishlist-deals/continue-browsing data-access) · DISCOVERY_GRID + fold-altı lazy island'lar ·
Category Shortcuts boş-kategori fix · analytics ingest + retention worker · store-admin SectionEditor+preview ·
entegrasyon/UI test · enterprise-demo canlı smoke. Bkz. TD-149…TD-152.

**Sıra:** kalan implementasyon → gate → canlı smoke (git işlemleri SHIP aşamasında; bu turda YOK).

### TD-149 CLOSED (2026-07-30) — Katman B discovery resolver+endpoint CANLI

`POST /public/stores/:storeSlug/home/discovery` uygulandı + enterprise-demo canlı smoke (guest 13/13 + grid + auth
Repurchase/Similar + personalized/wishlist + dedupe + cache privacy + cross-store). 8 data-access yolu mevcut modülleri
REUSE eder; orchestration saf çekirdek (12 test). Grid-filter defect bulundu+düzeltildi. api-gateway 1743 test PASS.
Kalan TODO-162: storefront UI (TD-150), analytics ingest (TD-151), store-admin/preview (TD-152).

### TD-150 CLOSED (2026-07-30) — storefront Discovery UI CANLI

`getDiscovery` (SSR, flash yok) + `discovery-sections.tsx` (grid/rail/editorial/sponsored) + home page paralel
fetch (Hero→Discovery→public) + i18n TR/EN default başlıklar + Category Shortcuts boş-kategori fix. Canlı smoke
(next dev @3001 → gateway 4001, enterprise-demo): guest home SSR "Günün fırsatları" 12 indirimli + kategoriler +
showcase; no-signal personalized YOK; cookie'li ziyaretçide CB/personalized/grid. Gate: storefront typecheck+lint 0,
gateway build 0, 59 home test, migrate up-to-date. Kalan TODO-162: TD-151 (analytics ingest), TD-152 (admin/preview).

### TD-151 CLOSED (2026-07-30) — Discovery analytics ingest + storefront emit + retention

Public ingest ucu `POST /public/stores/:storeSlug/home/discovery-events` (`home/discovery-event-{data,routes}.ts`):
SECTION_IMPRESSION/CARD_IMPRESSION/PRODUCT_CLICK/CTA_CLICK/ADD_TO_CART. Sunucu-otoriter: bot/prefetch/kimliksiz
elenir; eventType+sectionType+eligibilitySource allowlist (SECTION_BOUNDS'tan türetilir); sectionId GERÇEK
yayınlanmış (enabled) section'a karşı doğrulanır (uydurma reddi) + claimed↔actual type çapraz-doğrulama; ürün
store-sahipliği; impression zaman-pencere dedupe + ADD_TO_CART dedupeKey idempotency; KVKK hash kimlik. Admin funnel
özeti `GET /stores/:storeId/home/discovery-events/summary` (platform-admin; sectionType/eligibilitySource kırılımı +
CTR). Storefront: BFF proxy `app/api/discovery/event/route.ts` + pasif client tracker (`discovery-tracker.tsx` +
`lib/discovery/track.ts`) — IntersectionObserver impression + click delegation (flash yok). Retention: ayrı jobType
`home-discovery-event-retention` (env-gated, default kapalı; advisory-lock + circuit-breaker + batch; RETENTION_TABLE_SPECS'e
dokunmaz). ADD_TO_CART discovery kart yüzeyinde emit EDİLMEZ (kart PDP'ye götürür; model/pipeline destekler).
Gate: api-gateway 1775 test PASS (+32 yeni: data 5/routes 20/retention 7), gateway build 0, storefront tsc+lint 0.
Kalan TODO-162: TD-152 (store-admin SectionEditor yeni tipler + preview).

### TD-152 CLOSED (2026-07-30) — store-admin yönetim UI + keşif önizleme

Store-admin Home SectionEditor (`app/(app)/home/page.tsx` + `labels.ts`) 10 yeni keşif tipini yönetir: rail'ler
(TR/EN başlık + düzen + maxItems tavanı + guest/authSupported + fallbackDisabled), DISCOVERY_GRID (TR/EN başlık +
kart sırası düzenleyici ↑↓/ekle/kaldır + guest/auth), EDITORIAL_CAMPAIGN (TR/EN başlık+metin+CTA+mediaId+linkedCampaignId).
Salt-görünüm `DISCOVERY_BOUNDS` aynası her tipin min/max/auth/fallback iş-kuralını ipucu gösterir (admin min düşüremez —
motor kelepçeler). Başlık TR/EN config ile yönetilir (base title gizli). **Gateway tamamlaması:** discovery endpoint
section başlığını artık config `titleTr/titleEn`'den locale'e göre çözer (RecentlyViewed deseni; rail/sponsored/grid),
boşsa storefront i18n default'a düşer. **Keşif önizleme** (`home/preview/page.tsx` + `discovery-preview-logic.ts`):
5 senaryo (misafir sinyalsiz / geçmişli / sepetli / üye geçmişsiz / üye sipariş geçmişli) × yapılandırılmış keşif
bölümleri için eligible/hidden + sebep simülasyonu — ÖRNEK sinyal, açıkça etiketli disclaimer (gerçek veri değil;
nihai kararı sunucu verir). Gate: gateway build 0 + 1775 test PASS (regresyon yok), store-admin tsc+lint 0.
**TODO-162 tüm dilimler (foundation + TD-149/150/151/152) TESLİM** — commit/PR/merge SHIP aşamasında (bu turda YOK).

### Pre-ship: Discovery→PDP→add-to-cart attribution (2026-07-30)

TD-151 emit'i tamamlandı: keşif kartından PDP'ye geçişte first-party attribution bağlamı taşınır (mirror
recommendation deseni, AYRI sessionStorage anahtarı `commerce_os_discovery_attr`). `lib/discovery/track.ts`:
`rememberDiscoveryClick` (PRODUCT_CLICK'te, discovery-tracker'da) + `consumeDiscoveryAttribution` +
`trackDiscoveryAddToCart`. `buy-box.tsx` başarılı `addToCartAction` sonrası (addToCart+buyNow) `ADD_TO_CART`
emit eder (bağlam tazeyse; dedupeKey=`atc:${clickId}` → duplicate dönüşüm sayılmaz; bağlam TÜKETİLİR). Kurallar:
kısa TTL (30dk), product-scoped, tek-kullanımlık, ham kimlik yok, query-string'de veri yok, doğrudan PDP →
sahte attribution yok, cart API başarısız → event yok. Sponsored ayrımı: discovery ADD_TO_CART analytics'e yazılır
(sponsoredCampaignId client'ta null), OTORİTATİF sponsorship ölçümü AYRI token yolunda (çift finansal attribution yok).
**Regresyon fix:** `locale-smoke.test.tsx` catalog mock'una `getDiscovery` eklendi (TD-150 page.tsx paralel fetch
değişikliğinden kalan; tam storefront vitest suite bu turda koşulunca yakalandı). Gate: storefront 446 test PASS +
build 0, gateway/store-admin/worker build 0, migrate status up-to-date, diff --check temiz.
**Canlı ingest smoke PASS:** yerel gateway (@4001, docker postgres/redis) + fixture CONTINUE_BROWSING section + guest;
11/11 senaryo doğru (impression/click/add-to-cart recorded; dup impression + dup ADD_TO_CART dedupe; bad type /
fabricated section / cross-store / bot / no-identity reddedildi). DB: 4 satır, visitorHash HMAC (ham vid değil),
customerId null → KVKK hash + PII temiz. Retention worker "disabled" logu main.js wiring'i canlı doğruladı. Fixture
temizlendi, gateway durduruldu. **KALAN (SHIP):** storefront/store-admin canlı TARAYICI smoke (§6-11) + analytics
tarayıcı smoke (§8) + commit/PR/CI/merge/deploy (§15-18) — insan-sürücülü tarayıcı (store-admin parola TD-126) + prod.

### TODO-163 Faz 3 — Capability Enforcement Closure (CLOSED, 2026-07-30)

TODO-163 KAPANDI. Faz 3 dört kalan dilimi tamamladı (ADR-214/215):
- **TD-153 Worker per-store skip** — paylaşılan `capabilities/worker-gate.ts` (prisma-backed, store-scoped,
  bounded TTL, fail-closed, tenant-safe) `main.ts`'te TEK kez kurulup 6 OPSİYONEL worker'a enjekte edildi
  (recommendation/recently-viewed/discovery retention · attribution retention per-tablo · settlement
  scheduler · campaign reconcile emit-site). Kapalı store → mutation yok + `SKIPPED_DISABLED` (QueueJobLog
  payload.outcome, status COMPLETED = hata değil, retry yok). CORE worker'lar gate'siz.
- **TD-155 Store-admin direct-URL guard** — `lib/store-modules.ts` (route→modül tek otorite) + `lib/server/
  module-access.ts` + `components/module-guard.tsx` (server component) + 14 route `layout.tsx`. Kapalı modül
  sayfası doğrudan URL ile de data fetch/render YAPMAZ.
- **TD-156 Kalan storefront gate'leri** — PDP tracker/similar/reviews, home discovery/ratings/sponsored/
  recently-viewed, PLP/discovery-list ratings+wishlist, cart rail, nested WishlistProvider'lar, influencer
  `/t/[token]` fail-closed; gateway sponsored TOKEN üretimi (home/discovery/search) SPONSORED_PRODUCTS'a bağlı.
- **TD-154 Plan → capability editörü** — SAF `plan-capabilities.ts` (required/optional/unavailable + doğrulama
  + preview + merge) + gateway `/admin/plans/:id/capabilities` (platform-admin, audit, cache clear) + api-client
  + platform-admin PlanEditor UI. Effective sıra: store override > plan default > baseline > dependency.

**Gate:** api-gateway 1831 · storefront 446 · store-admin 360 · admin-web 24 test PASS; build 27/27 · lint 0
error · migrate status up-to-date · `git diff --check` temiz. **Canlı smoke (enterprise-demo → docker postgres):**
worker gate dependency-cascade + core-korumalı; plan capability preview/merge (seeded metadata KORUNDU) + subscriber
count; disable/re-enable veri korunur; enterprise-demo FULL_PLATFORM'a döndürüldü. **KALAN (opsiyonel):** store-
admin/storefront canlı TARAYICI click-through (store-admin parola TD-126 → Final UI Polish) + commit/PR/deploy.
Git kuralı gereği bu aşamada commit/push/PR/merge/deploy YAPILMADI.

### TODO-164 — Tenant Theme Architecture (CLOSED & DEPLOYED, 2026-07-30)

Üç katmanlı tenant tema mimarisi mevcut Enterprise Theme Engine (ADR-087) + H-1 üstüne. **ADR-216…224.**
- **`@commerce-os/theme` (yeni modüller):** `slots.ts` (8 slot contract, typed variant allowlist,
  presentation-only), `layout-presets.ts` (5 preset, slot→variant + token preset), `custom-package.ts`
  (versioned manifest + `validateCustomThemePackage` + `demo-aurora`), `theme-registry.ts` (theme-key TEK
  otorite; unknown reddi), `compatibility.ts` (themeApiVersion/semver/slot/status; publish gate), `config.ts`
  (draft/publish/rollback slot config; katman önceliği preset→paket→override→default). 180 unit test.
- **DB:** additive migration `20260730140000_tenant_theme_architecture` — `Theme.themeKey/layoutPreset/
  themeApiVersion` + `ThemeVersion.config/themeKey/layoutPreset/publishedBy`. Backfill BASE_COMMERCE (görünüm
  korunur; immutable).
- **Gateway:** public resolver (published custom/preset → base fallback) + ALLOWLIST projeksiyon (css +
  colorScheme + layoutPreset + slots) + store-scoped bounded TTL cache (30s) + publish/assign/**modül-değişimi**
  invalidation; publish compatibility gate (409 THEME_INCOMPATIBLE, HAM config'e bakar); Platform Admin
  `GET/PUT /admin/stores/:id/theme-binding` (platform-admin auth, capability'den bağımsız). `assignThemeBinding`
  yeni PUBLISHED versiyon üretir (immutable snapshot).
- **Storefront:** `components/theme/theme-slots.tsx` (`ThemeSlotsProvider`/`useSlotVariant`; sunucu-otoriter,
  client override yok) + `data-layout-preset`/`data-*variant` + globals.css gerçek CSS variant farkları
  (ProductCard compact/premium, Header solid/minimal/floating, Hero full/editorial/split, Footer minimal,
  MobileNav fullscreen).
- **UI:** store-admin Theme Studio layout preset `<Select>` (config gönderir); platform-admin "Tema ve Marka"
  paneli (`components/theme-binding-panel.tsx`) — aktif tema/versiyon/uyum/revision/rollback/capability + atama.
- **Güvenlik:** H-1 kararları korunur (typed token + customCss sanitize + render-time defense); slot/variant
  allowlist; custom package manifest strict server-side validate; client theme-key override YAPAMAZ; cross-store
  izolasyon (storeId-scoped); public projeksiyon iç config/draft/audit SIZDIRMAZ; audit yalnız id.

**Canlı smoke (enterprise-demo → docker postgres, gateway+storefront worktree'den rebuild):**
1. **Base** — public theme BASE_COMMERCE + tam slot haritası + css. ✓
2. **Draft** — FASHION_MINIMAL (productCard:compact) draft kaydedildi; PRODUCTION storefront BASE kaldı (draft sızmadı). ✓
3. **Publish** — storefront FASHION_MINIMAL (header:minimal, productCard:compact, hero:editorial); cache anında; demo-store BASE (izolasyon). ✓
4. **Rollback** — v1'e rollback + publish → storefront BASE'e döndü; geçmiş revizyon silinmedi. ✓
5. **Capability** — THEME_STUDIO disable → storefront base; theme verisi DB'de KORUNDU (FASHION_MINIMAL|PUBLISHED); re-enable → published tema geri. ✓ (modül-değişimi resolver cache invalidation ile anında)
6. **Compatibility** — bilinmeyen theme-key/izinsiz variant publish 409; uyumsuz PUBLISHED config → storefront base fallback (crash yok). ✓

**Gate:** `@commerce-os/theme` 180 · api-gateway theme/capability route testleri PASS; contracts/api-client/
theme/gateway build + 4 app typecheck (storefront/store-admin/admin-web) temiz; migrate status up-to-date.
**Shipping:** commit `ae4ac80` → **PR #149 MERGED** (merge commit `b4c43928`) → CI (lint·test·build) yeşil →
4 servis (api-gateway/storefront-web/store-admin-web/admin-web) main'den rebuild+recreate healthy (worker
DEĞİŞMEDİ; postgres/redis volume korundu) → migrate deploy "no pending" → **deploy-sonrası smoke 6/6 + security
PASS** (enterprise-demo, BASE_COMMERCE'e restore). **KALAN (opsiyonel):** auth'lu TARAYICI click-through
(store-admin parola TD-126). **TODO-164 CLOSED & DEPLOYED.**

**Takip (2026-07-30) — Tema Yönetimi ayrı yüzey:** Kullanıcı geri bildirimi üzerine platform-admin tema
yönetimi mağaza **Düzenle** modalından çıkarılıp AYRI `/themes` sayfasına taşındı (sol menü "Tema Yönetimi" +
fleet tablosu: mağaza·aktif tema·preset·uyumluluk·Theme Studio·Yönet). Yeni fleet ucu `GET /admin/theme-bindings`
(store-scope'suz platform admin, N+1 yok). **PR #151 MERGED** (merge `2dfbc9a`) → api-gateway+admin-web deploy
healthy → post-deploy fleet smoke PASS (2 mağaza, atama yansıdı, no-auth 401). Sebep: önemli yönetim modülünü
ilgisiz modala gömmek çok-mağazalı kontrolü zorlaştırıyordu.

### TODO-164A — Custom Theme Builder (CLOSED & DEPLOYED, 2026-07-31)

Görsel tema oluşturucu; ortak engine + slot contract + H-1 ÜSTÜNE (paralel motor YOK). **ADR-225…231.**
Analiz: `docs/analysis/TODO-164A-custom-theme-builder.md`.
- **`@commerce-os/theme`:** `builder-config.ts` (genişletilmiş strict/bounded/H-1 config; slotVariants→slots
  merge; unknown key/izinsiz variant/güvensiz değer reddi), `contrast.ts` (WCAG publish gate; buton 3:1,
  metin 4.5:1), `builder-css.ts` (`--tb-*` + sistem breakpoint `@media`; arbitrary media query YOK),
  `starting-points.ts` (BASE/FASHION_MINIMAL/FASHION_EDITORIAL/PREMIUM_BOUTIQUE/EMPTY; registry MUTATE etmez),
  `slots.ts` variant genişleme (her slot ≥3 adlandırılmış; eski+default korunur; `builderVariants` UI menüsü).
- **DB:** additive `20260730160000_custom_theme_builder` (`Theme.duplicatedFrom/createdBy/updatedBy` nullable).
- **Gateway:** create `startingPoint`; duplicate/archive/preview-token; draft/publish builder config doğrulama
  + contrast gate (THEME_CONTRAST_FAILED); public projeksiyon builder CSS ekler + slotVariants merge; public
  preview projeksiyonu (imzalı token `preview-token.ts`, prod cache'ten AYRI); binding draftThemeCount/
  sourcePreset/lastUpdatedAt.
- **Storefront:** 8 slot TAM bağlı (productListingLayout/productDetailLayout/homeSectionFrame + PLP/PDP/home
  wiring — nested async RSC yerine prop); UNLAYERED variant CSS (gerçek grid/flex/layout farkı); `--tb-*`
  tüketimi; middleware+cookie preview (draft render; prod değişmez).
- **Store-admin:** Theme Studio görsel builder (Yapı/Stil/Önizleme; startingPoint; Kopyala/Arşivle; 3-viewport +
  gerçek vitrin iframe); BFF duplicate/archive/preview-token route'ları; storeApi metodları.
- **Platform-admin:** binding paneli draftThemeCount/sourcePreset/lastUpdatedAt.
- **Gate:** theme 229 · contracts 115 · api-client 23 · gateway 1850 · storefront 446 · store-admin 360 ·
  admin-web 24 — TÜMÜ PASS; build/typecheck/lint temiz; git diff --check temiz.
- **Canlı smoke (enterprise-demo, gerçek stack+tarayıcı):** migrate deploy (additive, mevcut korundu) + 8 slot
  DOM/CSS farkı + preview izolasyonu (token 401) + publish/rollback + ikinci tema + duplicate/archive +
  capability disable→base/re-enable + güvenlik (XSS/unsafe/unknown-key/variant 400) + contrast 409 + responsive
  taşma yok. **CLOSED & DEPLOYED.**
- **Canlı düzeltme:** link contrast `blocking:false` (shipped preset yayınlanabilir); `--tb-gutter` storefront
  `.max-w-grid` padding'e bağlandı. TD-160 CLOSED (compose `NEXT_PUBLIC_STOREFRONT_URL`). Açık: TD-159
  (responsiveOverrides UI-future), TD-161 (token çift-kaynak).

### TODO-164B — Theme Builder Productization & Role Separation (Dilim 1 IMPLEMENTASYON TAMAM, commit YOK)

Rol ayrımı (Platform Designer & Library ↔ Store Brand Customizer) + store override policy + font/palet kütüphaneleri.
**ADR-232…237.** Analiz: `docs/analysis/TODO-164B-theme-productization.md`. Kararlar: (1) platform temaları sistem
mağazasında (`systemPurpose=THEME_LIBRARY`); (2) fazlı — Dilim 1 temel, Dilim 2 platform 9-sekme Designer + versiyon
upgrade + full-screen preview; (3) logo/favicon tek otorite = StoreSettings.
- **`@commerce-os/theme`:** `override-policy.ts` (FieldPolicy editable/locked/inherited/required/hidden +
  `enforceOverridePolicy` server-side + `isPolicyExplicit`), `font-library.ts` (16 aile / 18 preset / 8 kategori;
  validate.ts ADDITIVE genişleme), `color-palettes.ts` (8 WCAG-güvenli palet + `applyPaletteToDocument`),
  `field-labels.ts` (teknik yol → kullanıcı dili + previewTarget).
- **DB:** additive `20260731120000_theme_productization_role_separation` (`Store.systemPurpose`,
  `Theme.ownerScope/overridePolicy/sourceThemeId/sourceThemeVersion`; mevcut veri korunur).
- **Gateway:** save/publish override policy enforcement (409 THEME_FIELD_LOCKED / FONT / LAYOUT / POLICY_INCOMPLETE +
  publish 2. kapı); `serializeDetail` ownerScope/overridePolicy/fieldPolicyProjection/sourceThemeVersion/updateAvailable;
  binding assign override policy; sistem mağazası dışlama (resolvePublicStore 404 + listStores + fleet).
- **Store-admin:** Theme Studio → "Marka ve Görünüm" (Marka/Renkler/Tipografi/Görseller/Hazır düzen/Önizleme/Yayınlama);
  `ColorField` (picker+hex+kontrast+açıklama+son renkler+highlight); teknik slot/token/version/config KALDIRILDI;
  nav+başlık TR/EN; yeni hata mesajları.
- **Storefront:** `ThemePreviewHighlight` (postMessage; yalnız preview cookie).
- **Gate:** theme 268 · gateway 1857 · store-admin 365 · contracts/api-client/storefront/admin-web build — TÜMÜ PASS;
  build 27/27 · lint temiz · typecheck temiz · git diff --check temiz.
- **Dilim 1:** SHIPPED & DEPLOYED (PR #156, merge `4ed0629`).

**Dilim 2 — Platform Theme Library, Designer & Controlled Rollout (IMPLEMENTASYON TAMAM, commit YOK).** ADR-238…245.
- **`@commerce-os/theme`:** `theme-diff.ts` (`summarizeThemeChanges` — kullanıcı-dostu before/after: color/typography/
  layout/slot/media/policy kategorileri, raw JSON yok), `library.ts` (kütüphane store kimliği, `computeUpdateAvailable`,
  rollout modları + `summarizeRollout`).
- **DB:** additive `20260731130000_theme_library_designer_rollout` (`Theme.policyRevision`, `ThemeVersion.
  stagedLogoMediaId/stagedFaviconMediaId/assetSnapshot`).
- **Gateway:** `theme/library-routes.ts` (SUPER_ADMIN) — kütüphane CRUD + designer draft + `PUT .../policy` matris
  (strict validate → 400 THEME_POLICY_INVALID) + publish (null/eksik policy → 409 THEME_POLICY_INCOMPLETE) + archive/
  duplicate/rollback + version-scoped `preview-token` + `diff` + `usage` + `assignable-stores` + `assign/preview`
  (dry-run) + `assign` + `update/apply` (per-store success/failed/skipped). TD-162 logo staging: `publishTheme`
  atomik StoreSettings + `assetSnapshot`, `rollbackToVersion` snapshot restore. Store-admin `theme/platform-status`.
- **api-client/contracts:** `admin.themeLibrary.*` + `admin.theme.platformStatus`; library/policy/diff/usage/rollout/
  preview şemaları + tipleri.
- **admin-web:** "Tema Kütüphanesi" nav+icon+i18n; liste (`/theme-library`); 9-sekme Designer (`/theme-library/[id]`);
  `PolicyMatrix`, `AssignmentDialog` (rollout), `PreviewFrame` (çok-sayfa/çok-viewport/before-after), `BeforeAfter`,
  `Tabs`, `ColorField`, `NativeSelect`; 15 BFF route + `proxy.ts` helper.
- **store-admin:** `PlatformThemeBanner` (aktif platform teması + current/template version + update-available +
  editable/locked; salt-okuma — Platform Designer yetkisine erişmez). **storefront:** version-scoped preview token +
  middleware request-cookie forward (ilk yükte de draft/hedef sürüm).
- **Gate:** theme 287 · gateway 1866 (9 yeni) · admin-web 30 (6 yeni) · store-admin 365 · contracts 115 · api-client 23 ·
  storefront 446 — TÜMÜ PASS; 3 Next app build + tüm paket build PASS · lint temiz · typecheck temiz · git diff --check temiz.
- **TD:** TD-162 **CLOSED** · TD-163 **CLOSED** · TD-164 OPEN (non-blocking).
- **AÇIK:** gerçek browser smoke (canlı stack, deploy sonrası). **commit/push/PR/merge/deploy YOK** (bu aşamada).
- **Sonuç:** **TODO-164B tüm dilimler TAMAM** (Dilim 1 deployed + Dilim 2 implemented). Sıradaki: **TODO-165**.

### TODO-165 — Fashion Vertical Foundation (IMPLEMENTED — uçtan uca smoke geçti, commit YOK)

**ADR-246…252.** Analiz: `docs/analysis/TODO-165-fashion-vertical-foundation.md`. Moda/tekstil dikeyi,
`FASHION_VERTICAL` capability kontrollü (opt-in). Kapalıyken çekirdek commerce aynen korunur.

- **Backend/domain:** capability (opt-in) · typed size-system registry (10 sistem) · kanonik fashion attribute
  katalogu (EAV reuse, yeni motor yok) · additive migration `20260731140000_fashion_vertical_foundation`
  (SizeChart×3 + OrderLine 7 snapshot kolonu) → **gerçek DB'ye deploy+status PASS, mevcut veri korundu** ·
  size-chart backend (capability-gated, tenant-scoped, XSS-guard, advisory-lock publish/rollback) · order snapshot
  wiring (createOrder/addOrderLine + customers serializer + contracts) · public DTO capability-aware fashion projeksiyonu.
- **Storefront:** fashion PDP (renk swatch + beden seçici + **OOS disabled** + auto-heal + size-chart modal + medya +
  materyal/kalıp/sezon + ATC engeli) · PLP fashion facetleri (renk/beden/sezon/koleksiyon/materyal/fit). Fashion-dışı/
  kapalı → klasik davranış.
- **Store Admin:** `admin.sizeCharts.*` + Beden Tabloları sayfası (CRUD/publish/rollback/bağla) + 10-adım fashion
  wizard (Stepper; capability kapalı → klasik form).
- **Seed:** `fashion-demo-seed.mjs` (idempotent) → 3 kategori/12 ürün/155 varyant/size chart; `edm-store` ENABLED,
  `demo-store` KAPALI. Search backfill (facet).
- **Smoke (GERÇEK browser + DB):** PDP swatch/beden/OOS/auto-heal/size-chart · PLP facet · **sipariş OS-000005 →
  color/size snapshot + immutability PASS** · capability disable/re-enable + veri korundu · store-admin chart+wizard ·
  responsive 375px (taşma yok).
- **Gate:** api-gateway **1893** test · contracts **130** · build+lint+diff-check temiz.
- **DURUM (2026-08-02 düzeltildi):** ✅ **CLOSED & DEPLOYED** — PR #158, main `83bcd8e`. (Önceki
  "commit YOK" bayattı; Final Polish readiness audit ile doğrulandı.)

### TODO-165A — Product Data Governance & Editing UX Recovery — ✅ CLOSED & DEPLOYED (PR #160, merge `bfb88f2`)

**ADR-253…258.** Analiz: `docs/analysis/TODO-165A-product-data-governance.md`. TODO-165'in serbest-metin
`Product.brand`'ini + sabit-kod fashion sözlüklerini store-yönetilebilir governance'a taşır; size-chart
bağlamayı raw-ID input'tan searchable selector'a geçirir. Mevcut EAV/capability/size-chart/tenant/selector
(ADR-090) REUSE — paralel sistem yok.

- **Brand:** store-scoped `Brand` modeli + `Product.brandId` (relation `governedBrand`); legacy `brand` string
  DORMANT dual-write; public DTO additive `brandRef` (ACTIVE-only); search read-model brand denormalize →
  PLP facet + `/markalar/[slug]`. `CATALOG` (core) gate — tüm mağazalar. Store-admin "Markalar" modülü.
- **Fashion taksonomileri:** `ProductTaxonomyValue` (governance otoritesi) ↔ store-scoped `AttributeOption`
  (1:1, atama/facet kimliği); her mağaza kendi opsiyonunu sahiplenir; governed opsiyon mutasyonu yalnız
  taxonomy servisinden (409 `ATTRIBUTE_OPTION_GOVERNED`); iki partial unique index (global/store); okuma
  önceliği store-scoped>global. `FASHION_VERTICAL` gate. Store-admin "Ürün Sözlükleri" (tip-sekme, quick-create/
  arşiv/usageCount/reorder) + ürün formu taxonomy-backed searchable select+quick-add.
- **Bootstrap:** migration-time backfill (`20260801130000`,`20260801140000`) + PLATFORM fashion-definition
  provisioning (`20260802120000`, 11 tanım, idempotent, mağaza-bağımsız) + runtime
  `ensureStoreTaxonomyDefaults` DISABLED→ENABLED'de fail-closed + lazy safety-net (list/quick-create).
- **Size-chart selector:** yeni `GET .../size-charts/selector` (dual-mode); `resolveEffective` TEK precedence
  (PDP+admin paylaşır); merkezi `AssignModal`+ürün formu raw ID → `EntitySelectorModal`. **TODO-165'te bulunan
  2 gerçek bug düzeltildi:** `assign()` PUBLISHED-guard eksikti (`SIZE_CHART_ASSIGN_NOT_PUBLISHED` eklendi);
  `upsertAssignment` yanlış anahtarla (sizeChartId dahil) lookup yapıyordu (gerçek `@@unique`'e göre düzeltildi
  → ikinci ürün bağlaması ilkinin yerini alır).
- **Selector'lar:** Brand/Category/Product/Size-chart hepsi ADR-090 desenini reuse eder (`?ids=`+arama); raw ID
  input hiçbir ekranda yok (grep-clean).
- **Gate (tam, GREEN):** `db:generate`+build **27/27** · `tsc --noEmit` **exit 0** · test **3320/3320** ·
  `migrate status` **74** · `git diff --check` temiz · search reindex **430/430**.
- **Gerçek browser smoke (izole stack, GERÇEK DB):** `/markalar` dizini · brand facet canlı · Brands admin
  liste+create · Ürün Sözlükleri tab+usageCount+reorder · ürün formu Fashion Özellikleri round-trip+quick-add ·
  merkezi size-chart AssignModal (raw ID YOK) · responsive 375px.
- **DURUM (2026-08-02 düzeltildi):** ✅ **CLOSED & DEPLOYED** — PR #160 (merge `bfb88f2`). (Önceki
  "commit YOK" bayattı.) Ertelenen küçük borçlar `docs/TECHNICAL_DEBT.md`'de.

## TODO-165B — PDP, Catalog Projection & Slug Lifecycle Recovery (ADR-259…264) — ✅ CLOSED & DEPLOYED (PR #161, main `83bcd8e`)

TODO-165A ship edilmeden bulunan 6 storefront/katalog blocker'ı aynı recovery fazında çözer. Yeni motor
KURULMAZ (projection/search-read-model/redirect/theme-slot altyapısı reuse). Analiz:
`docs/analysis/TODO-165B-pdp-catalog-recovery.md`.

- **Blocker 1 — PDP galeri:** Amazon-tarzı düzen (desktop dikey thumbnail + kontrollü ana görsel, mobile yatax);
  `ProductMediaFrame variant="gallery-main"` (contain + max boyut + nötr zemin); zoom lightbox + share + klavye.
  Kök neden: ana görsel frame'inde max sınır yoktu → `GALLERY_FIRST`'te devasa. (ADR-259)
- **Blocker 6 — Kart görselleri:** ortak `ProductMediaFrame` primitive (fit/aspect/padding TEK yerde); ürün
  kartları `cover`→`contain` (aşırı-zoom/crop giderildi). Hero/kategori-karosu kapsam dışı. (ADR-260)
- **Blocker 2 — Varyant fiyat kartları:** projeksiyon option'a `startingPriceMinor/compareAtMinor/priceCurrency/
  inStock` (server-authoritative, ACTIVE+görünür varyant min, mixed-currency fail-safe, inactive-sızıntı filtresi).
  Buy-box: çok-renk→renk kartı fiyatı, tek-renk→beden kartı fiyatı, renk+beden→renk özeti+buy-box kesin. (ADR-261)
- **Blocker 3 — Slug yaşam döngüsü:** `Product.slugLocked` migration + SAF `resolveProductSlugOnUpdate`
  (otomatik/manuel/regenerate) + `recordSlugChange` reuse (301+SlugHistory, chain-collapse). Store-admin form:
  otomatik/manuel toggle + "adından yeniden üret" + 301 önizleme. Canlı kanıt: `edm-prod-0266` title=Camper
  slug=puma → düzeltilecek. (ADR-262)
- **Blocker 4 — Kategori PLP:** `ProductSearchDocument.categoryIds/categorySlugs` (primary+secondary, GIN);
  PLP array-overlap filtresi (duplicate yok); kategori/marka rename reindex; idempotent fashion-kategori backfill
  (28+39+35=102 assignment; moda-ayakkabi 0→25 ürün). (ADR-263)
- **Blocker 5 — Beden tablosu:** buton görünürlüğü `fashion.sizeChart` varlığına bağlı (axis-kind bağımsız);
  `axisKind` normalize (numara/beden→size, yalnız UX). `resolveEffective` precedence reuse; PDP cache'siz. (ADR-264)
- **Migration:** `20260802130000_todo165b_slug_lock_and_category_arrays` (additive; slugLocked + categoryIds/Slugs
  + 2 GIN index).
- **DURUM (2026-08-02 düzeltildi):** ✅ **CLOSED & DEPLOYED** — PR #161, main `83bcd8e`. (Önceki
  "commit YOK" bayattı.)

---

## Final Enterprise UI Polish — Readiness Audit (2026-08-02) — SIRADAKİ AKTİF İŞ

`main == origin/main == 83bcd8e`, çalışma ağacı temiz, çalışan docker servisleri merge commit'inden
build (2026-08-02), migration `76` uygulanmış (1 tarihsel rolled-back kayıt = benign), 3 mağaza
(demo-store, enterprise-demo, sistem `__theme-library__` platform listesinden DIŞLANMIŞ). 3 yüzey gerçek
browser smoke + kod/doküman denetimi. **Karar: READY** (açık UI PROD blocker yok; tek açık PROD BLOCKER =
PB-3/TD-139 offsite backup, altyapı config — UI-polish blocker'ı değil).

- **Bu turda yapılan UI recovery'leri** (worktree, typecheck+lint+test yeşil, browser-doğrulandı, commit YOK):
  TD-024 dashboard aktif-ürün undercount (24→418), Store Admin beden-tablosu raw enum rozeti, Store Admin
  marka arama "slug" sızıntısı, Platform Admin tema sürüm raw enum rozeti, storefront tükenen-beden a11y
  (`aria-label`). Detay: `docs/TECHNICAL_DEBT.md` "Final Enterprise UI Polish — Readiness Audit (2026-08-02)".
- **Final Polish kapsamı:** TD-170, TD-173, TD-157, C1 (form `aria-describedby`), D1 (Modal focus-trap),
  B1 (storefront buton/input token birleştirme).
- **Doküman hijyeni:** duplicate TD-039 → TD-039B; ROADMAP/TODO'da 165/165A/165B "commit YOK" bayat
  kayıtları CLOSED & DEPLOYED olarak düzeltildi. (Geri kalan roadmap staleness — 164B vb. — pre-existing;
  ayrı hijyen turu önerilir.)

- **Final Enterprise UI Polish — IMPLEMENTED (2026-08-02, worktree, commit YOK):** Foundation (z-index+portal Tooltip / B1 buton-input / C1 form-aria / D1 modal focus-trap), PDP (hover-zoom + layout dengesi + Reviews 4. tab + hash), §5 Ana Sayfa duplicate (`/hero`→`/home` redirect, data korundu), TD-170 brand facet, FP-3 rating (rail'ler). Gate: typecheck+lint+test(1199)+build(9/9)+diff-check YEŞİL; browser smoke desktop+mobil. Detay: `docs/analysis/FINAL-enterprise-ui-polish.md`.
  - **Follow-up (bu turda kısmi):** TD-173 cart/order media-frame, TD-157 orphaned `--tb-*` var wiring + preview doğrulaması, Platform/Store Admin geniş görsel tarama (raw enum/slug), responsive tam matris (768/1024).

- **Final Enterprise UI Polish — CLOSED & DEPLOYED (2026-08-02):** Foundation (z-index+portal Tooltip / B1 / C1 aria / D1 focus-trap), PDP (hover-zoom+layout+Reviews tab), §5 duplicate-home temizliği, TD-170 brand facet, FP-3 rating, TD-173 ProductMediaFrame, TD-157 theme wiring + inclusive-VAT order-detail düzeltmesi. PR #163 (merge 1dd7d71). Detay: docs/analysis/FINAL-enterprise-ui-polish.md.

- **Final Polish acceptance durumu (2026-08-02): CLOSED & DEPLOYED.** Üç smoke İZOLE test verisiyle TAM GEÇTİ: (1) hover-zoom regresyonu çözüldü+browser; (2) theme publish/rollback throwaway store'da tam lifecycle + immutable revision + cache invalidation + tenant isolation; (3) authenticated checkout izole müşteri (env-driven parola) ile order PAID + account detail (reservation invariant + snapshot immutable + KDV doğru). docker 4 web/gateway servisi main'den rebuild + post-deploy smoke PASS; izole veri FK-güvenli temizlendi.

## TODO-167 — Persistent Cart & Cross-Device Foundation (Faz A)

**DURUM: IN_PROGRESS → IMPLEMENTED (worktree, commit YOK).** Hibrit cart (anon=cookie / auth=DB cross-device);
Cart+CartLine additive migration + partial-unique ACTIVE; version/409 CART_STALE; login-merge deterministik;
checkout DB-cart otoriter + CONVERTED; env-gated 90-gün expiry sweep. ADR-266. Gate YEŞİL (build/lint/test).
Detay: `docs/analysis/PERSISTENT-cart-implementation.md`.

## TODO-168 — Cart Change Awareness — CLOSED & DEPLOYED (2026-08-03)

**PR #166 MERGED** (merge commit `65c7ca1`). api-gateway + storefront-web main'den rebuild + recreate
(docker `--no-deps`; store-admin/admin/worker/postgres/redis DOKUNULMADI); migration
`20260803150000_todo168_cart_change_awareness` gerçek commerce_os'a `migrate deploy` ("schema up to date";
CartChangeAck + CartChangeEvent + CartLine snapshot kolonları canlı doğrulandı). **Post-deploy smoke PASS**
(deployed gateway :4000, anon changeContext = prod-safe): INFO(PRICE_DECREASED) · WARN(PRICE_INCREASED) ·
checkout 409 CART_CHANGED · ack sonrası gate açıldı · VARIANT_BACK_IN_STOCK · VARIANT_OUT_OF_STOCK BLOCKING
(demo-store stok geçici 0→25 geri alındı) · analytics recorded+dedupe(KVKK-hash) · auth ack ucu 401(wired) ·
storefront :3000 /cart 200. Mobil cart-line taşma fix (320/375/768/1024/1440 taşmasız) pre-merge canlı +
merged kodda doğrulandı; task_203ad8ee RESOLVED. Test analytics kayıtları temizlendi; **enterprise-demo
PRISTINE** (471 ürün / 9 sipariş). ADR-267 ACCEPTED. Açık: **TD-176** future. Worktree kaldırıldı.

--- (implementasyon kaydı) ---

**DURUM: IMPLEMENTED + FULL GATE GREEN.** ADR-267 ACCEPTED
(`docs/adr/ADR-267-cart-change-semantics.md`). Additive migration `20260803150000_todo168_cart_change_awareness`
(CartLine snapshot kolonları + CartChangeAck + CartChangeEvent; drop/backfill YOK).

**Ne yapıldı:** Ortak SAF change-engine (`apps/api-gateway/src/cart-changes/change-engine.ts`, kimlik-agnostik)
+ projection köprüsü + ack-data + event-data + analytics ingest route (`/cart-change-events`). Snapshot/ack
otoritesi identity-split: **auth = DB** (CartLine snapshot kolonları lazy-baseline + `CartChangeAck`,
**cross-device ack IMPLEMENTED**); **anon = imzalı `commerce_os_cart_meta` cookie** (versiyonlu, byte-bütçeli,
severity-farkında budama, orphan temizliği, malformed→fail-safe). Checkout 3-seviye: INFO bloklamaz · WARN
`409 CART_CHANGED` ack'e kadar · BLOCKING mevcut `409 CART_NOT_READY`. Ack = **fingerprint invalidation**
(snapshot mutasyonu YOK; ADR-267 §6). Cart projection'a `changes/unacknowledgedChangeCount/hasBlockingChanges/
hasWarnings/requiresAcknowledgement` eklendi; UI CartChangeBar + satır işaretleri + TR/EN + a11y (role=status/
alert, aria-live, not-color-only, erişilebilir kapat). `CartChangeEvent` best-effort analytics (RecommendationEvent
kalıbı, KVKK-hash, `(storeId,dedupeKey)` idempotent, read side-effect-free).

**Gate YEŞİL:** build 27/27 · lint 42/42 · typecheck · test (gateway 2184 [+52 yeni: engine 31 / projection 8 /
ack-routes 6 / event-routes 7], storefront 534 [+8 meta], store-admin 364) · `git diff --check` temiz.

**Açık borç / future:** `FREE_SHIPPING_ELIGIBILITY_CHANGED` + `SELLER_CHANGED` (marketplace) = future;
`CartChangeEvent` retention worker = future (tablo/ingest hazır); cookie size politikası ADR-267 §Consequences.
Tasarım: `docs/analysis/CART-change-awareness.md` + `docs/analysis/PERSISTENT-CART-roadmap.md` Faz B.

## TODO-167 Persistent Cart — CLOSED & DEPLOYED (2026-08-03)

PR #165 merged (merge commit `0a602d2`). api-gateway + storefront-web rebuilt from main; migration
`20260803140000_todo167_persistent_cart` applied via `migrate deploy` (partial ACTIVE index verified live).
Post-deploy smoke 20/20 PASS (deployed gateway :4000): cart mechanics · CART_STALE concurrency · login merge ·
checkout DB-cart authority · convert-on-paid (settlement) · failed-payment→ACTIVE · DB invariants. Temp fixtures
FK-safe cleaned + inventory restored; enterprise-demo pristine (473 products / 9 orders unchanged). ADR-266
ACCEPTED. **TODO-168 (Cart Change Awareness) UNBLOCKED.** TD-174 open future; cart hard-delete/anonymization
future; cross-device Cart-Change acknowledgement = TODO-168 scope.

## Post-PR163 Returns/Refund/Reverse Shipment UI Alignment — 2026-08-07

Ayrı polish işi (B1/C1/D1/TD-170/TD-173/TD-157/FP-3'ü YENİDEN AÇMAZ). PR #163 sonrası eklenen Returns/Refund/
Fast-Refund/Reverse-Shipment yüzeyleri (TODO-169…173) enterprise UI standardına hizalandı. Delta audit →
yalnız doğrulanan drift/eksik uygulandı (9 dosya). Store Admin: friendly ödeme rozeti + reverse iptal onay
modalleri (danger) + responsive/modal/badge tutarlılığı + Alert dismiss ghost + SLA checkbox focus ring.
Storefront: reverse-shipment section i18n sözlüğü + wizard aria-label/çift-hata + badge parite + boş-state CTA +
`Row` uzun-değer taşma fix. Gate tam yeşil; izole fixture browser smoke 375/768/1024/1440 (store-admin +
storefront), FK-güvenli teardown. Detay: `docs/TECHNICAL_DEBT.md`. **Backend/API/migration değişmedi.**

**CLOSED & DEPLOYED (2026-08-07):** PR #190 (merge `ab1bbec`); CI lint·test·build 5m59s PASS. Deploy: docker `storefront-web` + `store-admin-web` main'den rebuild+recreate (api-gateway/worker/postgres/redis DOKUNULMADI — i18n reverseShipment/wizard yalnız web dict). Post-deploy smoke: store-admin returns list + R000001 detay production build render + SA-1 friendly ödeme rozeti + taşma yok; storefront home/PLP 200, account/returns login-render, reverseShipment key deployed bundle'da. İzole browser-smoke fixture FK-güvenli temizlendi (enterprise-demo R000001 değişmedi).

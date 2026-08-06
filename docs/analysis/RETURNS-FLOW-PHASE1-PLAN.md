# Return Decision Flow Simplification — Faz 1 (PR1) Implementasyon Planı

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development veya
> superpowers:executing-plans ile task-by-task uygula. Adımlar checkbox (`- [ ]`).

**Goal:** İade akışını karar-odaklı hale getir — "Kapat" tuzağını yapısal olarak yok et,
inceleme=karar merkezi (kalem/adet kabul→refund, red→gerekçe), COMPLETED terminal, ve
gerçekleşen refund'ı sipariş Ücret Özeti'nde görünür yap.

**Architecture:** State-machine guard'ları + admin route değişiklikleri (backend) + inspection
"İadeyi yap" tek aksiyonu (mevcut iki-aşamalı `initiateRefund`'ı tetikler) + store-admin UI
sadeleştirme + atıl `order-level refund-context`'in Ücret Özeti'ne bağlanması. Migration YOK.

**Tech Stack:** Fastify + Prisma (api-gateway), Next.js (store-admin-web), Vitest, TypeScript.

## Global Constraints

- **COMMIT/PUSH/PR/MERGE/DEPLOY YOK.** Plandaki hiçbir adım commit içermez. Her task kendi
  testiyle biter; faz sonunda tam gate (test/build/lint/typecheck) + gerçek browser/HTTP smoke
  çalıştırılır, sonra DURULUR.
- **Migration YOK** (K2: `reviewStartedAt` kolonu değil history event). Şema değişmez.
- Para: minor-unit (kuruş) integer; client'ta finansal hesap YOK; kaynak = server.
- Yalnız `OrderRefund SUCCEEDED` gerçekleşen finansal iade; `RefundIntent` finansal figürde
  kullanılmaz; PENDING/PROCESSING netten düşmez; inclusive KDV iki kez düşmez.
- Optimistic `expectedVersion` zorunlu; tüm geçişler append-only history.
- Worktree gate ön-koşulu: `pnpm install --frozen-lockfile` + `pnpm --filter @commerce-os/db
  db:generate` + bağımlı paket build (`pnpm --filter "@commerce-os/api-gateway^..." build`).
- Test DB: `DATABASE_URL=postgresql://commerce_os:commerce_os_password@localhost:5432/commerce_os_test?schema=public`.

---

## Dosya Haritası

**Backend (api-gateway)**
- `src/returns/status-map.ts` — `REFUND_PENDING→CLOSED` ve `COMPLETED→CLOSED` admin yolunu
  kapatan guard (yeni saf kural). Değişir.
- `src/returns/service.ts` — `applyReturnTransition` içinde CLOSED admin-yolu reddi; review
  event yazımı. Değişir.
- `src/returns/routes-admin.ts` — `/transition` CLOSED targetStatus reddi; inspection "kabul→
  refund" orchestration bağı; `RETURN_REVIEW_STARTED` event. Değişir.
- `src/returns/review-event.ts` — **YENİ**: `writeReviewStartedEvent(tx, ...)` idempotent helper.
- `src/payments/payment-state.ts` — **YENİ saf fn** `computeNetCollectedMinor(captured, succeeded)`.
- Test: `test/returns-flow-guards.test.ts` (YENİ, saf state-machine), `test/returns-review-event.integration.test.ts`
  (YENİ, gerçek-DB), `test/returns-inspection-refund.integration.test.ts` (YENİ), mevcut
  `test/returns-lifecycle.integration.test.ts` (güncelle).

**Frontend (store-admin-web)**
- `app/(app)/orders/order-shared.ts` — `canCloseReturn` kaldır; `canReviewReturn` kaldır. Değişir.
- `app/(app)/orders/returns/[id]/page.tsx` — "Kapat" + "İncelemeye al" + "Gönderim bekleniyor"
  butonlarını kaldır; inspection ekranını karar merkezine dönüştür ("İadeyi yap"/"Reddet").
  Değişir.
- `app/(app)/orders/[id]/page.tsx` — `PaymentSummaryPanel`'e refund satırları; `getOrderRefundContext`
  bağlama; stale copy düzelt. Değişir.
- `app/(app)/orders/returns/[id]/refund-panel.tsx` — stale copy düzelt. Değişir.

---

## Task 1: State-machine — CLOSED admin yolunu kapatan saf guard

**Files:**
- Modify: `apps/api-gateway/src/returns/status-map.ts`
- Test: `apps/api-gateway/test/returns-flow-guards.test.ts` (create)

**Interfaces:**
- Produces: `isAdminCloseBlocked(from: ReturnStatus): boolean` — `REFUND_PENDING` ve
  `COMPLETED`'tan admin CLOSED'u bloklar. `evaluateReturnTransition` bu kuralı `ADMIN` aktör +
  `to==="CLOSED"` iken uygular ve yeni ret sebebi `REFUND_UNSETTLED` döner.

- [ ] **Step 1: Failing test yaz** — `test/returns-flow-guards.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { evaluateReturnTransition } from "../src/returns/status-map";

describe("TD return flow guards — admin CLOSE blocked (K: no silent close)", () => {
  it("REFUND_PENDING → CLOSED by ADMIN is blocked with REFUND_UNSETTLED", () => {
    const r = evaluateReturnTransition("REFUND_PENDING", "CLOSED", "ADMIN");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("REFUND_UNSETTLED");
  });
  it("COMPLETED → CLOSED by ADMIN is blocked (COMPLETED terminal in new flow)", () => {
    const r = evaluateReturnTransition("COMPLETED", "CLOSED", "ADMIN");
    expect(r.ok).toBe(false);
  });
  it("SYSTEM close path still allowed (legacy/archival)", () => {
    const r = evaluateReturnTransition("REFUND_PENDING", "CLOSED", "SYSTEM");
    // SYSTEM archival korunur; yalnız ADMIN yolu kapanır
    expect(r.ok).toBe(true);
  });
  it("REFUND_PENDING → COMPLETED by ADMIN still allowed (refund settle path)", () => {
    expect(evaluateReturnTransition("REFUND_PENDING", "COMPLETED", "ADMIN").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `cd apps/api-gateway && npx vitest run test/returns-flow-guards.test.ts`
Expected: FAIL — `REFUND_UNSETTLED` reason yok; ADMIN CLOSED şu an `ok:true`.

- [ ] **Step 3: `status-map.ts`'e guard ekle**

`ReturnTransitionRejection` union'a `"REFUND_UNSETTLED"` ekle. `SYSTEM_TRANSITIONS`'a
`REFUND_PENDING->CLOSED`, `REPLACEMENT_PENDING->CLOSED`, `COMPLETED->CLOSED` ekle (arşivleme
sistemsel olur). `evaluateReturnTransition` içinde, illegal/terminal kontrolünden sonra, aktör
kontrolünden önce:

```typescript
// K (no silent close): CLOSED artık admin yolu değil — REFUND_PENDING/COMPLETED/
// REPLACEMENT_PENDING'ten admin CLOSE bloke; refund settle → COMPLETED (terminal) yolu izlenir.
if (to === "CLOSED" && actor === "ADMIN") {
  return { ok: false, reason: "REFUND_UNSETTLED" };
}
```

Not: `RETURN_TRANSITIONS` tablosunda `COMPLETED → CLOSED` ve `REFUND_PENDING → CLOSED` geçişleri
KALIR (SYSTEM/legacy için); yalnız ADMIN aktörüne kapanır. `transitionActor` map'ine yukarıdaki
üç geçiş SYSTEM olarak eklenince `isActorAllowed` zaten ADMIN'i reddeder — ancak açık
`REFUND_UNSETTLED` sebebi UX için tercih edilir; iki yaklaşımdan **açık guard** kullanılır.

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `cd apps/api-gateway && npx vitest run test/returns-flow-guards.test.ts`
Expected: PASS (4/4). Diğer state-machine testleri (`returns-status-map` varsa) hâlâ yeşil.

---

## Task 2: Route — `/transition` CLOSED admin reddi HTTP eşlemesi

**Files:**
- Modify: `apps/api-gateway/src/returns/routes-admin.ts` (`finishTransition` / transition route,
  ~`:177-212` ve `:382-395`)
- Modify: `apps/api-gateway/src/returns/service.ts` (`applyReturnTransition` ret kodu geçişi)
- Test: `apps/api-gateway/test/returns-lifecycle.integration.test.ts` (yeni case)

**Interfaces:**
- Consumes: `evaluateReturnTransition` (Task 1) `REFUND_UNSETTLED`.
- Produces: `POST /returns/:id/transition {targetStatus:"CLOSED"}` → **409** `REFUND_UNSETTLED`.

- [ ] **Step 1: Failing integration test** — `returns-lifecycle.integration.test.ts`'e ekle
(helper `seedDeliveredOrder` + `driveToRefundPending` mevcut):

```typescript
it("admin cannot CLOSE a REFUND_PENDING return (no silent close)", async () => {
  seeded = await seedDeliveredOrder();
  const app = buildReturnAdminApp();
  const rrId = await createRefundReturn(seeded);
  await driveToRefundPending(app, seeded, rrId); // approve→…→INSPECTED→REFUND_PENDING
  const v = await currentReturnVersion(seeded.storeId, rrId);
  const res = await app.inject({
    method: "POST", url: `/stores/${seeded.storeId}/returns/${rrId}/transition`,
    payload: { targetStatus: "CLOSED", expectedVersion: v },
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().error.code).toBe("REFUND_UNSETTLED");
  // intent hâlâ PENDING (iptal edilmedi), talep hâlâ REFUND_PENDING
  const st = await loadReturnState(seeded.storeId, rrId);
  expect(st?.status).toBe("REFUND_PENDING");
  await app.close();
});
```

- [ ] **Step 2: Çalıştır, FAIL gör**

Run: `cd apps/api-gateway && DATABASE_URL=…/commerce_os_test npx vitest run test/returns-lifecycle.integration.test.ts -t "no silent close"`
Expected: FAIL — şu an 200 dönüyor, talep CLOSED, intent CANCELLED.

- [ ] **Step 3: `applyReturnTransition` + route ret eşlemesi**

`service.ts`: `evaluateReturnTransition` sonucu `!ok` ise `reason`'ı çağırana taşı (mevcut yapı
zaten reason döndürüyorsa dokunma). `routes-admin.ts` `finishTransition` HTTP map'ine ekle:

```typescript
if (reason === "REFUND_UNSETTLED")
  return reply.code(409).send(errorBody("REFUND_UNSETTLED",
    "Bu iade, para iadesi tamamlanmadan kapatılamaz. 'İadeyi yap' ile iadeyi tamamlayın."));
```

Ayrıca `/transition` route'unda `targetStatus` allowlist'inden CLOSED çıkarılabilir (defansif);
ama asıl guard state-machine'de. Emin ol: CLOSED targetStatus geldiğinde `applyReturnTransition`
`REFUND_UNSETTLED` döndürüyor ve `cancelPendingRefundIntent` ÇAĞRILMIYOR (transaction guard'dan
önce reddediyor).

- [ ] **Step 4: Çalıştır, PASS gör** — hem yeni case hem mevcut lifecycle suite yeşil.

Run: `cd apps/api-gateway && DATABASE_URL=…/commerce_os_test npx vitest run test/returns-lifecycle.integration.test.ts`

---

## Task 3: Review-started event (K2 — kolon yok, idempotent history)

**Files:**
- Create: `apps/api-gateway/src/returns/review-event.ts`
- Modify: `apps/api-gateway/src/returns/routes-admin.ts` (approve + reject onCommit)
- Test: `apps/api-gateway/test/returns-review-event.integration.test.ts` (create)

**Interfaces:**
- Produces: `writeReviewStartedEvent(tx, { storeId, returnRequestId, sourceStatus, decisionType,
  platformUserId }): Promise<void>` — ilk gerçek admin kararında bir kez `RETURN_REVIEW_STARTED`
  yazar (ReturnStatusHistory veya mevcut event tablosuna; actor ADMIN). İkinci çağrı no-op.

- [ ] **Step 1: Failing test** — `returns-review-event.integration.test.ts`:

```typescript
it("first admin decision writes exactly one RETURN_REVIEW_STARTED event", async () => {
  seeded = await seedDeliveredOrder();
  const app = buildReturnAdminApp();
  const rrId = await createRefundReturn(seeded);
  await adminReturnAction(app, seeded.storeId, rrId, "approve", {}); // ilk karar
  // ikinci bir admin geçişi daha
  await applyReturnTransition(seeded.storeId, rrId, "RETURN_SHIPPED", { type:"CUSTOMER", id: seeded.customerId });
  const count = await countReviewStartedEvents(seeded.storeId, rrId); // helper (aşağıda)
  expect(count).toBe(1);
  await app.close();
});
```

`countReviewStartedEvents` helper'ını `helpers/returns-db.ts`'e ekle: ReturnStatusHistory'de
`note`/metadata'da `RETURN_REVIEW_STARTED` ara (event modeline göre).

- [ ] **Step 2: Çalıştır, FAIL gör** (helper + event yok).

- [ ] **Step 3: `review-event.ts` implement + approve/reject'e bağla**

```typescript
// review-event.ts
import type { Prisma } from "@prisma/client";
export async function writeReviewStartedEvent(
  tx: Prisma.TransactionClient,
  args: { storeId: string; returnRequestId: string; sourceStatus: string; decisionType: "APPROVE"|"REJECT"; platformUserId: string },
): Promise<void> {
  const existing = await tx.returnStatusHistory.count({
    where: { storeId: args.storeId, returnRequestId: args.returnRequestId, toStatus: "UNDER_REVIEW", note: { contains: "RETURN_REVIEW_STARTED" } },
  });
  if (existing > 0) return; // idempotent
  await tx.returnStatusHistory.create({
    data: {
      storeId: args.storeId, returnRequestId: args.returnRequestId,
      fromStatus: args.sourceStatus as any, toStatus: "UNDER_REVIEW",
      actorType: "ADMIN",
      note: `RETURN_REVIEW_STARTED decisionType=${args.decisionType} platformUserId=${args.platformUserId}`,
    },
  });
}
```

Not: metadata JSON alanı varsa `note` yerine yapısal metadata kullan. approve (`routes-admin.ts`
onCommit) ve reject onCommit'inde, ana geçişten ÖNCE `writeReviewStartedEvent` çağır (aynı tx →
rollback'te birlikte geri alınır). `sourceStatus` = mevcut status; `platformUserId` =
`requireStoreAdmin` sonucu actorUserId.

- [ ] **Step 4: Çalıştır, PASS gör** (count === 1).

---

## Task 4: Inspection "kabul → İadeyi yap" tek aksiyon orchestration

**Files:**
- Modify: `apps/api-gateway/src/returns/routes-admin.ts` (`/inspect` route + yeni refund tetikleme)
- Test: `apps/api-gateway/test/returns-inspection-refund.integration.test.ts` (create)

**Interfaces:**
- Consumes: mevcut `initiateRefund` (`refunds/service.ts:372`), inspect route (`:309-358`).
- Produces: inspection kararı "kabul" olduğunda tek çağrıda `INSPECTED → REFUND_PENDING` +
  `initiateRefund` tetiklenir; kısmi kabul refund tutarına `approvedQuantity` üzerinden yansır;
  reddedilen quantity refund'a girmez.

- [ ] **Step 1: Failing test** — çok kalemli, kısmi kabul/red:

```typescript
it("inspection accept triggers refund for approved qty only (partial)", async () => {
  // 2 kalemli sipariş: A qty2, B qty1. Inspect: A 2 accept, B reject.
  const s = await seedTwoLineDeliveredOrder(); // helper (aşağıda)
  const app = buildReturnAdminApp();
  const rrId = await createTwoLineRefundReturn(s);
  await driveToInspected(app, s, rrId);
  // İnceleme + kabul(A)+red(B) + İadeyi yap (tek aksiyon)
  const res = await inspectAndRefund(app, s, rrId, {
    items: [
      { orderLineId: s.lineAId, approvedQuantity: 2, inspectionResult: "PASSED", restockDecision: "RESTOCK_AS_SELLABLE" },
      { orderLineId: s.lineBId, approvedQuantity: 0, inspectionResult: "FAILED", restockDecision: "DO_NOT_RESTOCK", reason: "hasarlı" },
    ],
  });
  expect(res.statusCode).toBe(200);
  const st = await loadReturnState(s.storeId, rrId);
  // Refund yalnız A'nın 2 adedi üzerinden; B refund'a girmez
  const intent = await loadRefundIntent(s.storeId, rrId);
  expect(intent.totalRefundMinor).toBe(s.lineAGross); // yalnız A
  // OrderRefund SUCCEEDED (MOCK provider) → COMPLETED
  expect(st?.status).toBe("COMPLETED");
  await app.close();
});
```

- [ ] **Step 2: Çalıştır, FAIL gör** (helper'lar + orchestration yok).

- [ ] **Step 3: Orchestration implement**

`routes-admin.ts`'e `POST /returns/:id/inspect-refund` (veya inspect route'una `refund:true`
parametresi) ekle. Akış (tek HTTP, mevcut parçaları çağırır):
1. inspect kararını kaydet (mevcut inspect onCommit: approved/rejected quantity, condition,
   restock).
2. Aynı tx içinde `INSPECTED → REFUND_PENDING` (`applyReturnTransition`) + `upsertRefundIntentForReturn`
   (approved quantity ile — mevcut `approvedQuantity ?? quantity`).
3. tx commit sonrası `initiateRefund(returnId, {expectedReturnVersion})` çağır (provider execution
   tx dışında — mevcut iki-aşamalı yapı).
4. MOCK provider → SUCCEEDED → `tryCompleteReturn` otomatik COMPLETED.

Kritik: refund tutarı `upsertRefundIntentForReturn`'ün `approvedQuantity` kullanımıyla kısmiye
saygılı (denetim: `service.ts:566,586,592`). Reddedilen quantity `rejectedQuantity`'ye yazılır,
refund hesabına girmez.

- [ ] **Step 4: Çalıştır, PASS gör** — kısmi refund doğru; COMPLETED; B refund'da yok.

---

## Task 5: Net-collected saf fonksiyonu (finansal görünürlük temeli)

**Files:**
- Modify: `apps/api-gateway/src/payments/payment-state.ts`
- Test: `apps/api-gateway/test/payment-state.test.ts` (mevcut; case ekle)

**Interfaces:**
- Produces: `computeNetCollectedMinor(capturedMinor: number, succeededRefundMinor: number): number`
  = `max(0, captured - succeeded)`. Ücret Özeti "iade sonrası net tahsilat".

- [ ] **Step 1: Failing test**:

```typescript
import { computeNetCollectedMinor } from "../src/payments/payment-state";
it("net collected = captured - succeeded refund (never negative)", () => {
  expect(computeNetCollectedMinor(2844556, 631350)).toBe(2213206);
  expect(computeNetCollectedMinor(1000, 0)).toBe(1000);
  expect(computeNetCollectedMinor(1000, 1500)).toBe(0);
});
```

- [ ] **Step 2: Çalıştır, FAIL gör.**
- [ ] **Step 3: Implement**:

```typescript
export function computeNetCollectedMinor(capturedMinor: number, succeededRefundMinor: number): number {
  return Math.max(0, capturedMinor - succeededRefundMinor);
}
```

- [ ] **Step 4: Çalıştır, PASS gör.**

---

## Task 6: Ücret Özeti'ne refund satırları (order-level refund-context bağla)

**Files:**
- Modify: `apps/store-admin-web/app/(app)/orders/[id]/page.tsx` (`PaymentSummaryPanel` ~`:200-236`)
- Modify: `apps/store-admin-web/lib/client/api.ts` (`getOrderRefundContext` zaten var — tüket)
- Modify: `apps/store-admin-web/app/(app)/orders/returns/[id]/refund-panel.tsx` (stale copy)

**Interfaces:**
- Consumes: `getOrderRefundContext(orderId)` → `{ capturedMinor, succeededRefundMinor,
  refundableRemainingMinor, ... }` (mevcut endpoint `refunds/routes-admin.ts:215-248`).
- Produces: Ücret Özeti'nde "Gerçekleşen iade (−)" + "İade sonrası net tahsilat" satırları
  (yalnız `succeededRefundMinor > 0` iken).

- [ ] **Step 1:** Sipariş detay sayfası mount'unda `getOrderRefundContext(orderId)` çağır (mevcut
  proxy route `app/api/orders/[id]/refund-context`). `PaymentSummaryPanel`'e `refundContext` prop
  geçir.
- [ ] **Step 2:** `PaymentSummaryPanel`'de, mevcut satırların altına ekle (koşullu):

```tsx
{refundContext && refundContext.succeededRefundMinor > 0 ? (
  <>
    <SummaryRow label="Gerçekleşen iade" value={`− ${formatMinor(refundContext.succeededRefundMinor, currency)}`} tone="warning" />
    <SummaryRow label="İade sonrası net tahsilat"
      value={formatMinor(Math.max(0, refundContext.capturedMinor - refundContext.succeededRefundMinor), currency)} strong />
  </>
) : null}
```

- [ ] **Step 3:** Stale copy düzelt: `orders/[id]/page.tsx:378-379` ("Henüz tahsilattan düşülmedi
  (gerçek refund TODO-170)") → "Gerçekleşen iade tahsilattan düşülmüştür." `refund-panel.tsx`
  ve finance `reports/page.tsx:361` stale metinleri de güncelle.
- [ ] **Step 4:** Browser smoke'ta doğrula (Faz sonu smoke, adım 12): tam iade edilmiş siparişte
  Ücret Özeti "Gerçekleşen iade" + "İade sonrası net" gösteriyor.

---

## Task 7: Admin UI — "Kapat" / "İncelemeye al" / "Gönderim bekleniyor" kaldır

**Files:**
- Modify: `apps/store-admin-web/app/(app)/orders/order-shared.ts` (`canCloseReturn`,
  `canReviewReturn`, `canAwaitShipment`)
- Modify: `apps/store-admin-web/app/(app)/orders/returns/[id]/page.tsx` (actions bloğu `:177-280`)

**Interfaces:**
- Consumes: yeni backend guard'ları (Task 1-2) — "Kapat" backend'de zaten 409.
- Produces: `REFUND_PENDING`'de yalnız Refund Panel otorite; `REQUESTED`'te yalnız Onayla/Reddet;
  onay sonrası ayrı "Gönderim bekleniyor" butonu yok.

- [ ] **Step 1:** `order-shared.ts`: `canCloseReturn` fonksiyonunu **kaldır** (veya `() => false`).
  `canReviewReturn` kaldır (REQUESTED'te doğrudan onay/red). `canAwaitShipment` kaldır (otomatik).
- [ ] **Step 2:** `page.tsx` actions: `canReviewReturn`/`canAwaitShipment`/`canCloseReturn`
  bloklarını sil. Kalan: Onayla/Kısmi onayla, Teslim alındı, İnceleme sonucu gir, Reddet.
  `REFUND_PENDING`'de üst actions'ta hiçbir yıkıcı buton yok — refund panel tek otorite.
- [ ] **Step 3:** Manuel doğrulama (smoke adım 11): `REFUND_PENDING` iade detayında "Kapat"
  görünmüyor; refund paneli "Para iadesini başlat" birincil.

---

## Faz 1 Gate + Smoke (commit YOK — sonunda DUR)

- [ ] **Gate 1: Prisma + build**
Run: `pnpm --filter @commerce-os/db db:generate && pnpm --filter "@commerce-os/api-gateway^..." build`

- [ ] **Gate 2: api-gateway typecheck + lint + full suite**
Run: `cd apps/api-gateway && pnpm build && pnpm lint && DATABASE_URL=…/commerce_os_test pnpm test`
Expected: 0 error; tüm suite yeşil (yeni testler dahil).

- [ ] **Gate 3: store-admin-web typecheck + lint**
Run: `cd apps/store-admin-web && pnpm build && pnpm lint`

- [ ] **Gate 4: Docker eşitle (yalnız smoke için; deploy DEĞİL)**
Run: `cd infra/docker && docker compose build api-gateway store-admin-web && docker compose up -d --no-deps api-gateway store-admin-web`
Health bekle.

- [ ] **Gate 5: Browser/HTTP smoke (Faz 1 alt-kümesi)** — izole çok-kalemli fixture:
  1) REQUESTED doğrudan Onayla/Reddet · 2) approve→auto AWAITING_SHIPMENT · 3) customer tracking ·
  4) admin receive · 5) inspection · 6-7) bir qty accept + bir qty reject · 8) accepted refund
  orchestration · 9) provider success · 10) COMPLETED · 11) "Kapat" görünmüyor · 12) order summary
  refund satırı · 13) customer refund görünümü · 14) Financial Reporting net düşüş · 19) stale
  version 409 · 20) cross-store isolation.
  Responsive 375/768/1024/1440; a11y (karar modalı focus trap, quantity label, status renk+metin,
  destructive confirmation).

- [ ] **DUR.** Commit/push/PR/merge/deploy YOK. Sonuçları final raporla (spec §Final rapor).

---

## Self-Review (spec karşılaştırması)
- **Spec §3.1 COMPLETED terminal** → Task 1-2 (CLOSED admin bloke). ✓
- **§3.2 REQUESTED + review event** → Task 3. ✓
- **§3.3 kalem/adet kabul-red + refund ayrımı** → Task 4. ✓
- **§3.4 tek aksiyon orchestration** → Task 4. ✓
- **§3.5 approve→await otomatik** → mevcut (Task 7 UI temizliği). ✓
- **§3.6 refund'suz kapanış yok** → Task 1-2. ✓
- **§5 finansal görünürlük** → Task 5-6. ✓
- **Migration yok** → hiçbir task şema değiştirmiyor. ✓
- PR2 (fast refund) / PR3 (reverse shipment) → ayrı plan (bu plan yalnız PR1).

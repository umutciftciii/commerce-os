# TODO-175 Refund Destination Choice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Müşteri iade/iptalinde geri ödemenin orijinal ödeme yöntemine mi yoksa alışveriş bakiyesine mi gideceğini seçebilsin; server-authoritative allocation ile STORE_CREDIT değeri asla cash'e dönmesin.

**Architecture:** Her refund tutarı `R`, kalan refundable havuzlara oransal olarak `Re` (external-origin) + `Rc` (credit-origin) ikisine bölünür. `Rc` her zaman shopping balance'a (original lot restore); `Re` müşteri seçimine göre PSP refund (ORIGINAL_PAYMENT) veya non-expiring credit (SHOPPING_BALANCE). Tüm domain mantığı `apps/api-gateway/src/` içinde; iki ledger (OrderRefund + CustomerCredit) `groupKey` ile reconcile.

**Tech Stack:** TypeScript, Fastify (api-gateway), Prisma (`packages/db`), Next.js (storefront-web + store-admin-web), Zod (`packages/contracts`), Vitest, pnpm workspaces + turbo.

## Global Constraints

- **Para birimi:** Tüm tutarlar minor-unit tamsayı. Refund ledger tarafı `number` minor; credit ledger tarafı `bigint` minor. Sınırda dönüşüm açık yapılır; float YOK.
- **Server-authoritative:** Client hiçbir zaman refund tutarı göndermez; tutar order snapshot + ledger state'inden hesaplanır.
- **Ürün invariant:** `STORE_CREDIT` değeri asla cash/kart/PSP refund'a dönüşmez — yalnız shopping balance'a restore. External-paid uygun tutar müşteri isterse shopping balance'a yönlendirilebilir.
- **Expiry asimetrisi:** Goodwill 30/60/120/180 gün (değişmez). Refund-origin credit `expiresAt = null` (non-expiring). Cancellation credit-restore: expired lot revive YOK (skip). Approved-return credit-restore: expired lot → cash'e çevirmeden yeni non-expiring lot (reissue).
- **Idempotency:** Her para hareketi deterministik idempotency key; concurrent execution advisory lock `refund:<storeId>:<orderId>` + version guard + unique constraint ile güvenli.
- **Isolation:** Tüm sorgular `storeId` (+ customer sahiplik) scoped. İlgisiz domain (ProductReview vb.) ellenmez.
- **Copy:** Müşteri-facing yerlerde raw enum gösterilmez; semantic description key → i18n copy. TR+EN zorunlu.
- **Düzeltme A — Invalid destination reject:** Geçersiz/eligible-olmayan refund destination için SESSIZ fallback YOK. Sunucu `INVALID_DESTINATION` sentinel'i ile reddeder (örn. external=0 iken ORIGINAL_PAYMENT). UI eligibility'yi zaten gösterir; execution yine de sunucu tarafında doğrular.
- **Düzeltme B — expiryDays=null allowlist:** `expiryDays=null` (non-expiring) yalnız ALLOWLISTED internal refund-origin sistem yollarında mümkün: `REFUND_ORIGIN_SYSTEM_SOURCE_TYPES = { ORDER_REFUND, ORDER_CANCELLATION, ORDER_RETURN }` + `actor.type === "SYSTEM"` + açık `refundOriginSystemPath: true` bayrağı. Goodwill/admin/route yolları asla null geçemez (`INVALID_EXPIRY`).
- **Düzeltme C — Safe-integer money math:** Proportional split ara matematiği `BigInt` ile yapılır; girdi/çıktıya `Number.isSafeInteger` guard. Overflow/precision riski yok.
- **Düzeltme D — Adoption rate paydası:** Shopping-balance adoption rate paydası yalnız müşterinin GERÇEK destination seçimi yapabildiği refund'ları içerir: `externalComponentMinor > 0` VE `offerOriginalPayment && offerShoppingBalance` (iki seçenek de sunulmuş). Credit-only / external=0 refund'lar payda dışı.
- **Gate/worktree:** Komutlar worktree kökünden; Edit'ler worktree path ile. `pnpm -r`/`--filter` turbo tuzağına dikkat (memory: worktree-path-and-turbo-gotcha).
- **Referans spec:** `docs/superpowers/specs/2026-08-08-todo-175-refund-destination-choice-design.md` (bölüm numaraları §N ile atıflanır).

---

## Task Sıralaması (özet)

1. Şema migration (enums, nullable expiresAt, ReturnRequest/OrderRefund alanları, provenance)
2. Contracts (destination enum, resolution enum, return-create/cancellation/preview şemaları)
3. `ledger-calc.ts` nullable expiry (pure)
4. `ledger-calc.ts` `planReturnRestore` (pure, expired→reissue)
5. `destination-calc.ts` allocation + eligibility + preview (pure, yeni)
6. `isRefundResolution` helper + legacy mapping (pure)
7. `issueCredit` non-expiring path (credit service)
8. `restoreCreditAmountForOrderInTx` (partial return restore + reissue, credit service)
9. Cancellation execution + projection split
10. Return execution (initiateRefund Re-only + INTERNAL_CREDIT + credit-origin restore + completion guard)
11. Return create: destination persist + routes + eligibility preview endpoint
12. Admin visibility + reporting (visibility.ts, report.ts, allocation DTO)
13. Cancellation modal destination step + confirm split (storefront)
14. Return wizard destination sub-choice (storefront)
15. Store Admin return/cancellation detail + unified list filter/reporting
16. Storefront İadelerim + Alışveriş Bakiyem + i18n copy
17. Full gate
18. Browser smoke
19. Docs (ROADMAP/TODO/DECISIONS-ADR/TECHNICAL_DEBT)

---

## Task 1: Şema migration — enums, nullable expiry, model alanları

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (enum `ReturnResolutionType` ~5458; `RefundDestination` yeni; `RefundExecutionMode` ~5771; `CreditSourceType` ~3260; `CreditLedgerType` ~3271; `CustomerCreditLot.expiresAt` ~3313; `ReturnRequest` ~5557; `OrderRefund` ~5805)
- Create: `packages/db/prisma/migrations/<ts>_todo175_refund_destination_choice/migration.sql`

**Interfaces:**
- Produces: enum `RefundDestination { ORIGINAL_PAYMENT, SHOPPING_BALANCE }`; `ReturnResolutionType += REFUND`; `RefundExecutionMode += INTERNAL_CREDIT`; `CreditSourceType += ORDER_RETURN`; `CreditLedgerType += RETURN_CREDIT_RESTORE`; `CustomerCreditLot.expiresAt: DateTime?`; `ReturnRequest.{refundDestination RefundDestination?, refundDestinationSelectedBy ReturnActorType?, refundDestinationSelectedAt DateTime?}`; `OrderRefund.refundDestination RefundDestination?`.

- [ ] **Step 1: Schema düzenle** — yukarıdaki enum/alan eklemeleri. `expiresAt DateTime` → `DateTime?`. `@default` eklenmez (nullable additive). Yeni enum değerleri mevcut enum bloklarının SONUNA eklenir (Postgres enum ordering güvenli).

- [ ] **Step 2: Prisma validate + generate**

Run: `pnpm --filter @commerce-os/db exec prisma validate && pnpm --filter @commerce-os/db exec prisma generate`
Expected: geçerli şema, client üretildi.

- [ ] **Step 3: Migration üret**

Run: `pnpm --filter @commerce-os/db exec prisma migrate dev --name todo175_refund_destination_choice --create-only`
Beklenen SQL: yeni enumlar (`CREATE TYPE "RefundDestination"`), `ALTER TYPE ... ADD VALUE` (REFUND, INTERNAL_CREDIT, ORDER_RETURN, RETURN_CREDIT_RESTORE), `ALTER TABLE "CustomerCreditLot" ALTER COLUMN "expiresAt" DROP NOT NULL`, `ALTER TABLE "ReturnRequest" ADD COLUMN ...`, `ALTER TABLE "OrderRefund" ADD COLUMN "refundDestination"`.

- [ ] **Step 4: SQL doğrula** — `expiresAt` için `DROP NOT NULL` (veri kaybı yok, mevcut satırlar korunur). `ADD VALUE` ifadeleri ayrı statement (Postgres enum add value transaction sınırı). Migration idempotent replay için temiz.

- [ ] **Step 5: Migration replay testi**

Run: `pnpm --filter @commerce-os/db exec prisma migrate reset --force --skip-seed` (izole test DB) sonra `prisma migrate deploy`
Expected: tüm migration'lar temiz uygulanır.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): TODO-175 refund destination schema (enums, nullable credit expiry, return/refund fields)"
```

---

## Task 2: Contracts — destination/resolution/return-create/cancellation/preview şemaları

**Files:**
- Modify: `packages/contracts/src/index.ts` (`returnResolutionTypeSchema` ~12091; `customerReturnCreateRequestSchema` ~12380; cancellation request şeması; yeni destination/preview şemaları)
- Test: `packages/contracts/test/refund-destination.test.ts` (yeni)

**Interfaces:**
- Produces: `refundDestinationSchema = z.enum(["ORIGINAL_PAYMENT","SHOPPING_BALANCE"])`; `RefundDestinationValue` type; `returnResolutionTypeSchema` → `["REFUND","REFUND_TO_ORIGINAL_PAYMENT","REPLACEMENT"]`; `customerReturnCreateRequestSchema.refundDestination?`; `refundDestinationPreviewSchema` (`{ totalRefundableMinor, externalComponentMinor, creditComponentMinor, offerOriginalPayment, offerShoppingBalance }`).

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from "vitest";
import { refundDestinationSchema, returnResolutionTypeSchema, customerReturnCreateRequestSchema } from "../src/index";

describe("refund destination contracts", () => {
  it("accepts both destinations", () => {
    expect(refundDestinationSchema.parse("ORIGINAL_PAYMENT")).toBe("ORIGINAL_PAYMENT");
    expect(refundDestinationSchema.parse("SHOPPING_BALANCE")).toBe("SHOPPING_BALANCE");
  });
  it("resolution enum keeps legacy + adds neutral REFUND", () => {
    expect(returnResolutionTypeSchema.parse("REFUND")).toBe("REFUND");
    expect(returnResolutionTypeSchema.parse("REFUND_TO_ORIGINAL_PAYMENT")).toBe("REFUND_TO_ORIGINAL_PAYMENT");
    expect(returnResolutionTypeSchema.parse("REPLACEMENT")).toBe("REPLACEMENT");
  });
  it("return create requires destination when resolution is REFUND", () => {
    const base = { orderNumber: "OS-1", resolutionType: "REFUND", items: [{ orderLineId: "l1", quantity: 1, reason: "DEFECTIVE" }] };
    expect(() => customerReturnCreateRequestSchema.parse(base)).toThrow();
    expect(customerReturnCreateRequestSchema.parse({ ...base, refundDestination: "SHOPPING_BALANCE" }).refundDestination).toBe("SHOPPING_BALANCE");
  });
  it("return create allows missing destination for REPLACEMENT", () => {
    const r = customerReturnCreateRequestSchema.parse({ orderNumber: "OS-1", resolutionType: "REPLACEMENT", items: [{ orderLineId: "l1", quantity: 1, reason: "DEFECTIVE" }] });
    expect(r.refundDestination).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/contracts test -- refund-destination`
Expected: FAIL (`refundDestinationSchema` yok / REFUND kabul edilmiyor).

- [ ] **Step 3: Implement** — `refundDestinationSchema` + type export; `returnResolutionTypeSchema` enum'a `REFUND` ekle (dizinin başına, okunabilirlik); `customerReturnCreateRequestSchema`'ya `refundDestination: refundDestinationSchema.optional()` + `.superRefine` ile `resolutionType === "REFUND"` iken zorunlu; cancellation request şemasına (`cancelOrderRequestSchema` benzeri, ara → mevcut cancellation schema) `refundDestination: refundDestinationSchema.optional()`; `refundDestinationPreviewSchema` ekle. Not: `REFUND_TO_ORIGINAL_PAYMENT` için destination zorunlu değil (legacy path).

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/contracts test -- refund-destination`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts packages/contracts/test/refund-destination.test.ts
git commit -m "feat(contracts): TODO-175 refund destination + neutral REFUND resolution schemas"
```

---

## Task 3: `ledger-calc.ts` — nullable expiry (pure)

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/ledger-calc.ts` (`CreditLotView.expiresAt` 31; `isLotSpendable` 36-38; `sortFefo` 50-60; `planRestore` 122-134; `expiredSweepCandidates` 137-141)
- Test: `apps/api-gateway/src/customer-credit/ledger-calc.test.ts` (mevcut dosya → non-expiring case ekle; yoksa oluştur)

**Interfaces:**
- Produces: `CreditLotView.expiresAt: Date | null` (null = non-expiring). `isLotSpendable`/`sortFefo`/`availableBalanceMinor`/`allocateFefo`/`planRestore`/`expiredSweepCandidates` null'ı doğru ele alır.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from "vitest";
import { isLotSpendable, sortFefo, availableBalanceMinor, expiredSweepCandidates } from "./ledger-calc";

const now = new Date("2026-08-08T00:00:00Z");
const lot = (id: string, remaining: bigint, expiresAt: Date | null, status: any = "ACTIVE", createdAt = now) =>
  ({ id, remainingAmountMinor: remaining, expiresAt, status, createdAt });

describe("nullable expiry", () => {
  it("null expiry lot is spendable", () => {
    expect(isLotSpendable(lot("a", 100n, null), now)).toBe(true);
  });
  it("null expiry counts in available balance", () => {
    expect(availableBalanceMinor([lot("a", 100n, null), lot("b", 50n, new Date("2026-09-01"))], now)).toBe(150n);
  });
  it("null expiry sorts LAST in FEFO (consumed last)", () => {
    const sorted = sortFefo([lot("nn", 10n, null), lot("soon", 10n, new Date("2026-08-10"))]);
    expect(sorted.map((l) => l.id)).toEqual(["soon", "nn"]);
  });
  it("null expiry never a sweep candidate", () => {
    expect(expiredSweepCandidates([lot("a", 100n, null)], new Date("2030-01-01"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- ledger-calc`
Expected: FAIL (null expiry `expiresAt.getTime()` üzerinde patlar / type hatası).

- [ ] **Step 3: Implement**

```ts
// CreditLotView
expiresAt: Date | null; // null = non-expiring

// isLotSpendable
export function isLotSpendable(lot: CreditLotView, now: Date): boolean {
  return lot.status === "ACTIVE" && lot.remainingAmountMinor > 0n &&
    (lot.expiresAt === null || lot.expiresAt.getTime() > now.getTime());
}

// sortFefo — null expiry en sona
export function sortFefo(lots: readonly CreditLotView[]): CreditLotView[] {
  return [...lots].sort((a, b) => {
    const ae = a.expiresAt === null ? Number.POSITIVE_INFINITY : a.expiresAt.getTime();
    const be = b.expiresAt === null ? Number.POSITIVE_INFINITY : b.expiresAt.getTime();
    if (ae !== be) return ae - be;
    const ac = a.createdAt.getTime(); const bc = b.createdAt.getTime();
    if (ac !== bc) return ac - bc;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// expiredSweepCandidates — null asla süre dolmuş değil
export function expiredSweepCandidates(lots: readonly CreditLotView[], now: Date): CreditLotView[] {
  return lots.filter((l) => l.status === "ACTIVE" && l.remainingAmountMinor > 0n &&
    l.expiresAt !== null && l.expiresAt.getTime() <= now.getTime());
}

// planRestore — lotById expiresAt: Date | null; null alive
const alive = lot ? (lot.expiresAt === null || lot.expiresAt.getTime() > now.getTime()) : false;
```
`planRestore`'un `lotById` tipini `ReadonlyMap<string, { expiresAt: Date | null }>` yap.

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- ledger-calc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/customer-credit/ledger-calc.ts apps/api-gateway/src/customer-credit/ledger-calc.test.ts
git commit -m "feat(credit): TODO-175 nullable credit lot expiry (null = non-expiring)"
```

---

## Task 4: `ledger-calc.ts` — `planReturnRestore` (pure, expired→reissue)

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/ledger-calc.ts`
- Test: `apps/api-gateway/src/customer-credit/ledger-calc.test.ts`

**Interfaces:**
- Consumes: `RestoreCandidate` (mevcut). 
- Produces: `interface ReturnRestoreDecision { lotId: string; restoreMinor: bigint; reissueMinor: bigint }` ve `planReturnRestore(debits, lotById, now): ReturnRestoreDecision[]` — original lot alive → `restoreMinor`; expired/silinmiş → `reissueMinor` (skip DEĞİL). Cancellation `planRestore` kullanmaya devam eder (değişmez).

- [ ] **Step 1: Failing test yaz**

```ts
import { planReturnRestore } from "./ledger-calc";
describe("planReturnRestore (return: expired -> reissue)", () => {
  const now = new Date("2026-08-08T00:00:00Z");
  it("alive lot restores to same lot", () => {
    const m = new Map([["l1", { expiresAt: new Date("2026-12-01") }]]);
    expect(planReturnRestore([{ lotId: "l1", amountMinor: 60n }], m, now))
      .toEqual([{ lotId: "l1", restoreMinor: 60n, reissueMinor: 0n }]);
  });
  it("expired lot reissues (value preserved, not skipped)", () => {
    const m = new Map([["l1", { expiresAt: new Date("2026-01-01") }]]);
    expect(planReturnRestore([{ lotId: "l1", amountMinor: 60n }], m, now))
      .toEqual([{ lotId: "l1", restoreMinor: 0n, reissueMinor: 60n }]);
  });
  it("null-expiry original lot restores (alive)", () => {
    const m = new Map([["l1", { expiresAt: null }]]);
    expect(planReturnRestore([{ lotId: "l1", amountMinor: 5n }], m, now))
      .toEqual([{ lotId: "l1", restoreMinor: 5n, reissueMinor: 0n }]);
  });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- ledger-calc`
Expected: FAIL (`planReturnRestore` yok).

- [ ] **Step 3: Implement**

```ts
export interface ReturnRestoreDecision {
  lotId: string;
  restoreMinor: bigint;   // original lot revive (expiry korunur)
  reissueMinor: bigint;   // expired original lot → yeni non-expiring lot
}

/**
 * Return credit-origin restore (Düzeltme 2): cancellation'dan FARKLI — expired lot
 * değer kaybetmez; reissueMinor olarak yeni non-expiring lot'a taşınır (§5.1).
 */
export function planReturnRestore(
  debits: readonly RestoreCandidate[],
  lotById: ReadonlyMap<string, { expiresAt: Date | null }>,
  now: Date,
): ReturnRestoreDecision[] {
  return debits.map((d) => {
    const lot = lotById.get(d.lotId);
    const alive = lot ? (lot.expiresAt === null || lot.expiresAt.getTime() > now.getTime()) : false;
    return alive
      ? { lotId: d.lotId, restoreMinor: d.amountMinor, reissueMinor: 0n }
      : { lotId: d.lotId, restoreMinor: 0n, reissueMinor: d.amountMinor };
  });
}
```

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- ledger-calc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/customer-credit/ledger-calc.ts apps/api-gateway/src/customer-credit/ledger-calc.test.ts
git commit -m "feat(credit): TODO-175 planReturnRestore (approved-return expired lot reissue)"
```

---

## Task 5: `destination-calc.ts` — allocation + eligibility + preview (pure, yeni)

**Files:**
- Create: `apps/api-gateway/src/refunds/destination-calc.ts`
- Test: `apps/api-gateway/src/refunds/destination-calc.test.ts`

**Interfaces:**
- Produces:
  - `computeRefundSourceSplit(input: { externalRefundableRemaining: number; creditRestorableRemaining: number; refundAmountMinor: number }): { externalPortionMinor: number; creditPortionMinor: number }`
  - `resolveDestinationEligibility(input: { externalRefundableRemaining: number; totalRefundableMinor: number }): { offerOriginalPayment: boolean; offerShoppingBalance: boolean }`
  - `buildRefundDestinationPreview(input: { externalRefundableRemaining: number; creditRestorableRemaining: number; refundAmountMinor: number }): { totalRefundableMinor: number; externalComponentMinor: number; creditComponentMinor: number; offerOriginalPayment: boolean; offerShoppingBalance: boolean }`
- Tüm değerler `number` minor (refund domain). Çağıran taraf `creditPortionMinor`'ı `BigInt(...)` ile credit ledger'a taşır.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from "vitest";
import { computeRefundSourceSplit, resolveDestinationEligibility, buildRefundDestinationPreview } from "./destination-calc";

describe("computeRefundSourceSplit (proportional, residual to credit)", () => {
  it("full refund mixed splits by pool ratio", () => {
    // 300 credit + 700 external, full 1000
    expect(computeRefundSourceSplit({ externalRefundableRemaining: 700, creditRestorableRemaining: 300, refundAmountMinor: 1000 }))
      .toEqual({ externalPortionMinor: 700, creditPortionMinor: 300 });
  });
  it("partial 200 on 300/700 order -> 140 external + 60 credit", () => {
    expect(computeRefundSourceSplit({ externalRefundableRemaining: 700, creditRestorableRemaining: 300, refundAmountMinor: 200 }))
      .toEqual({ externalPortionMinor: 140, creditPortionMinor: 60 });
  });
  it("card-only order -> all external", () => {
    expect(computeRefundSourceSplit({ externalRefundableRemaining: 500, creditRestorableRemaining: 0, refundAmountMinor: 500 }))
      .toEqual({ externalPortionMinor: 500, creditPortionMinor: 0 });
  });
  it("credit-only order -> all credit", () => {
    expect(computeRefundSourceSplit({ externalRefundableRemaining: 0, creditRestorableRemaining: 500, refundAmountMinor: 500 }))
      .toEqual({ externalPortionMinor: 0, creditPortionMinor: 500 });
  });
  it("rounding residual goes to credit; external floored; never exceeds pools", () => {
    // ratio 1/3 external -> 100*1/3 = 33.3 -> external 33, credit 67
    const r = computeRefundSourceSplit({ externalRefundableRemaining: 100, creditRestorableRemaining: 200, refundAmountMinor: 100 });
    expect(r.externalPortionMinor + r.creditPortionMinor).toBe(100);
    expect(r.externalPortionMinor).toBe(33);
    expect(r.creditPortionMinor).toBe(67);
    expect(r.externalPortionMinor).toBeLessThanOrEqual(100);
    expect(r.creditPortionMinor).toBeLessThanOrEqual(200);
  });
  it("external portion capped by external pool, overflow to credit", () => {
    // external pool 50 but proportional would want more
    const r = computeRefundSourceSplit({ externalRefundableRemaining: 50, creditRestorableRemaining: 50, refundAmountMinor: 100 });
    expect(r).toEqual({ externalPortionMinor: 50, creditPortionMinor: 50 });
  });
  it("large minor amounts stay exact (BigInt intermediate, no precision loss)", () => {
    const ext = 9_000_000_000, credit = 1_000_000_000, R = 10_000_000_000;
    const r = computeRefundSourceSplit({ externalRefundableRemaining: ext, creditRestorableRemaining: credit, refundAmountMinor: R });
    expect(r.externalPortionMinor + r.creditPortionMinor).toBe(R);
    expect(r.externalPortionMinor).toBe(9_000_000_000);
  });
  it("rejects non-safe-integer / negative input", () => {
    expect(() => computeRefundSourceSplit({ externalRefundableRemaining: Number.MAX_SAFE_INTEGER + 1, creditRestorableRemaining: 0, refundAmountMinor: 1 })).toThrow();
    expect(() => computeRefundSourceSplit({ externalRefundableRemaining: -1, creditRestorableRemaining: 0, refundAmountMinor: 1 })).toThrow();
  });
});

describe("resolveDestinationEligibility", () => {
  it("offers original payment only when external remaining > 0", () => {
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 700, totalRefundableMinor: 1000 }))
      .toEqual({ offerOriginalPayment: true, offerShoppingBalance: true });
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 0, totalRefundableMinor: 300 }))
      .toEqual({ offerOriginalPayment: false, offerShoppingBalance: true });
  });
  it("no refundable -> neither", () => {
    expect(resolveDestinationEligibility({ externalRefundableRemaining: 0, totalRefundableMinor: 0 }))
      .toEqual({ offerOriginalPayment: false, offerShoppingBalance: false });
  });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- destination-calc`
Expected: FAIL (modül yok).

- [ ] **Step 3: Implement**

```ts
/**
 * TODO-175 (ADR-285) — Refund destination allocation (SAF; finansal invariant otoritesi).
 *
 * Refund tutarı R iki KALAN refundable havuza oransal bölünür:
 *   external-origin (Re) ve credit-origin (Rc). external floor + residual credit'e.
 * Cap: Re ≤ extPool, Rc ≤ creditPool; taşan taraf diğerine kaydırılır. R ≤ extPool+creditPool (çağıran garanti eder).
 * Tüm değerler number minor (refund domain). STORE_CREDIT değeri asla external'a sayılmaz.
 */
export interface RefundSourceSplitInput {
  externalRefundableRemaining: number;
  creditRestorableRemaining: number;
  refundAmountMinor: number;
}
export interface RefundSourceSplit {
  externalPortionMinor: number;
  creditPortionMinor: number;
}

function assertSafeMinor(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`destination-calc: ${label} must be a non-negative safe integer (got ${n})`);
  }
}

export function computeRefundSourceSplit(input: RefundSourceSplitInput): RefundSourceSplit {
  // Düzeltme C: girdiler safe-integer; ara matematik BigInt.
  assertSafeMinor(input.externalRefundableRemaining, "externalRefundableRemaining");
  assertSafeMinor(input.creditRestorableRemaining, "creditRestorableRemaining");
  assertSafeMinor(input.refundAmountMinor, "refundAmountMinor");

  const ext = BigInt(input.externalRefundableRemaining);
  const credit = BigInt(input.creditRestorableRemaining);
  const total = ext + credit;
  const R = input.refundAmountMinor > input.externalRefundableRemaining + input.creditRestorableRemaining
    ? total
    : BigInt(input.refundAmountMinor);
  if (R === 0n || total === 0n) return { externalPortionMinor: 0, creditPortionMinor: 0 };

  // Oransal, external floor (BigInt bölme zaten floor); residual credit'e.
  let externalPortion = (R * ext) / total;
  if (externalPortion > ext) externalPortion = ext; // defensive cap
  let creditPortion = R - externalPortion;
  // Credit havuzu aşarsa fazlayı external'a kaydır (external hâlâ havuzunu aşmasın).
  if (creditPortion > credit) {
    const overflow = creditPortion - credit;
    creditPortion = credit;
    externalPortion = externalPortion + overflow > ext ? ext : externalPortion + overflow;
  }
  return { externalPortionMinor: Number(externalPortion), creditPortionMinor: Number(creditPortion) };
}

export interface DestinationEligibilityInput {
  externalRefundableRemaining: number;
  totalRefundableMinor: number;
}
export function resolveDestinationEligibility(input: DestinationEligibilityInput) {
  return {
    offerOriginalPayment: input.externalRefundableRemaining > 0,
    offerShoppingBalance: input.totalRefundableMinor > 0,
  };
}

export function buildRefundDestinationPreview(input: RefundSourceSplitInput) {
  const split = computeRefundSourceSplit(input);
  const totalRefundableMinor = split.externalPortionMinor + split.creditPortionMinor;
  const elig = resolveDestinationEligibility({
    externalRefundableRemaining: input.externalRefundableRemaining,
    totalRefundableMinor,
  });
  return {
    totalRefundableMinor,
    externalComponentMinor: split.externalPortionMinor,
    creditComponentMinor: split.creditPortionMinor,
    ...elig,
  };
}
```

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- destination-calc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/refunds/destination-calc.ts apps/api-gateway/src/refunds/destination-calc.test.ts
git commit -m "feat(refunds): TODO-175 destination-calc (proportional external/credit split + eligibility)"
```

---

## Task 6: `isRefundResolution` helper + legacy mapping (pure)

**Files:**
- Modify: `apps/api-gateway/src/returns/status-map.ts` (helper export)
- Test: `apps/api-gateway/src/returns/status-map.test.ts` (mevcut → ekle; yoksa oluştur)

**Interfaces:**
- Produces: `isRefundResolution(type: ReturnResolutionType): boolean` — `type === "REFUND" || type === "REFUND_TO_ORIGINAL_PAYMENT"`. `resolveEffectiveRefundDestination(req: { resolutionType; refundDestination: RefundDestination | null }): RefundDestination | null` — legacy `REFUND_TO_ORIGINAL_PAYMENT` + null → `ORIGINAL_PAYMENT`; aksi halde `refundDestination`.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from "vitest";
import { isRefundResolution, resolveEffectiveRefundDestination } from "./status-map";

describe("isRefundResolution", () => {
  it("true for REFUND and legacy", () => {
    expect(isRefundResolution("REFUND")).toBe(true);
    expect(isRefundResolution("REFUND_TO_ORIGINAL_PAYMENT")).toBe(true);
  });
  it("false for REPLACEMENT", () => {
    expect(isRefundResolution("REPLACEMENT")).toBe(false);
  });
});
describe("resolveEffectiveRefundDestination", () => {
  it("legacy maps to ORIGINAL_PAYMENT", () => {
    expect(resolveEffectiveRefundDestination({ resolutionType: "REFUND_TO_ORIGINAL_PAYMENT", refundDestination: null })).toBe("ORIGINAL_PAYMENT");
  });
  it("new REFUND uses stored destination", () => {
    expect(resolveEffectiveRefundDestination({ resolutionType: "REFUND", refundDestination: "SHOPPING_BALANCE" })).toBe("SHOPPING_BALANCE");
  });
  it("replacement has no destination", () => {
    expect(resolveEffectiveRefundDestination({ resolutionType: "REPLACEMENT", refundDestination: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- status-map`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { ReturnResolutionType, RefundDestination } from "@prisma/client";

export function isRefundResolution(type: ReturnResolutionType): boolean {
  return type === "REFUND" || type === "REFUND_TO_ORIGINAL_PAYMENT";
}

export function resolveEffectiveRefundDestination(
  req: { resolutionType: ReturnResolutionType; refundDestination: RefundDestination | null },
): RefundDestination | null {
  if (!isRefundResolution(req.resolutionType)) return null;
  if (req.refundDestination) return req.refundDestination;
  // legacy REFUND_TO_ORIGINAL_PAYMENT (destination alanı yokken oluşmuş)
  return "ORIGINAL_PAYMENT";
}
```

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- status-map`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/returns/status-map.ts apps/api-gateway/src/returns/status-map.test.ts
git commit -m "feat(returns): TODO-175 isRefundResolution + legacy destination mapping"
```

---

## Task 7: `issueCredit` non-expiring path (credit service)

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/service.ts` (`issueCredit` ~113-212; `IssueCreditParams`)
- Test: `apps/api-gateway/src/customer-credit/service.test.ts` (mevcut integration test pattern'i izle; yoksa DB'li test harness reuse)

**Interfaces:**
- Consumes: mevcut `issueCredit` imzası.
- Produces: `IssueCreditParams.expiryDays: CreditExpiryDays | null` + `IssueCreditParams.refundOriginSystemPath?: boolean` — `null` yalnız Düzeltme B allowlist'i sağlandığında kabul edilir; aksi halde `INVALID_EXPIRY`. Goodwill yolu (route) hâlâ 30/60/120/180 zorunlu.
- `REFUND_ORIGIN_SYSTEM_SOURCE_TYPES = new Set(["ORDER_REFUND","ORDER_CANCELLATION","ORDER_RETURN"])` export edilir (allowlist).

- [ ] **Step 1: Failing test yaz** — mevcut credit servis test harness'ını (izole test DB / prisma mock) kullanarak: `issueCredit({..., expiryDays: null, sourceType: "ORDER_REFUND", ledgerType: "REFUND_RESTORE"})` çağır; oluşan lot'un `expiresAt` null ve `availableBalanceMinor` içinde sayıldığını doğrula. (Test dosyası mevcut `service.test.ts` desenine göre; DB harness yoksa `expireLotsForStore`+`issueCredit` çevresindeki mevcut testleri referans al.)

```ts
it("issueCredit expiryDays=null needs allowlisted refund-origin system path", async () => {
  const res = await issueCredit({ storeId, customerId, currency: "TRY", amountMinor: 500n,
    expiryDays: null, refundOriginSystemPath: true, sourceType: "ORDER_REFUND", ledgerType: "REFUND_RESTORE",
    description: "credit.returnRefund", actor: { type: "SYSTEM", id: "sys" },
    idempotencyKey: "return-refund:R1" });
  expect(res.ok).toBe(true);
  const lot = await prisma.customerCreditLot.findFirstOrThrow({ where: { sourceType: "ORDER_REFUND" } });
  expect(lot.expiresAt).toBeNull();
});
it("issueCredit expiryDays=null REJECTED without allowlist (goodwill cannot bypass)", async () => {
  const res = await issueCredit({ storeId, customerId, currency: "TRY", amountMinor: 500n,
    expiryDays: null, sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT",
    description: "credit.goodwill", actor: { type: "PLATFORM_USER", id: "u1" }, idempotencyKey: "g:1" });
  expect(res).toEqual({ ok: false, code: "INVALID_EXPIRY" });
});
it("issueCredit expiryDays=null REJECTED when source not in allowlist even if flag set", async () => {
  const res = await issueCredit({ storeId, customerId, currency: "TRY", amountMinor: 500n,
    expiryDays: null, refundOriginSystemPath: true, sourceType: "ADMIN_ADJUSTMENT", ledgerType: "ADMIN_ADJUSTMENT_CREDIT",
    description: "credit.adjustment", actor: { type: "SYSTEM", id: "s" }, idempotencyKey: "a:1" });
  expect(res).toEqual({ ok: false, code: "INVALID_EXPIRY" });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- customer-credit/service`
Expected: FAIL (expiryDays null tipi kabul edilmiyor / `computeExpiresAt` patlar / `INVALID_EXPIRY`).

- [ ] **Step 3: Implement** — `IssueCreditParams.expiryDays: CreditExpiryDays | null` + `refundOriginSystemPath?: boolean`. Allowlist guard:
```ts
export const REFUND_ORIGIN_SYSTEM_SOURCE_TYPES = new Set<CreditSourceType>(["ORDER_REFUND","ORDER_CANCELLATION","ORDER_RETURN"]);
// issueCredit başında:
if (params.expiryDays === null) {
  const allowed = params.refundOriginSystemPath === true
    && params.actor.type === "SYSTEM"
    && REFUND_ORIGIN_SYSTEM_SOURCE_TYPES.has(params.sourceType);
  if (!allowed) return { ok: false, code: "INVALID_EXPIRY" };
} else if (!isValidExpiryDays(params.expiryDays)) {
  return { ok: false, code: "INVALID_EXPIRY" };
}
const expiresAt = params.expiryDays === null ? null : computeExpiresAt(now, params.expiryDays);
```
Non-expiring yolda policy check (`policyMaxMinor`) atlanır (allowlisted sistem yolu). Lot create'te `expiresAt` null geçilir (şema nullable). Ledger entry aynen.

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- customer-credit/service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/customer-credit/service.ts apps/api-gateway/src/customer-credit/service.test.ts
git commit -m "feat(credit): TODO-175 issueCredit non-expiring path (expiryDays=null)"
```

---

## Task 8: `restoreCreditAmountForOrderInTx` (partial return restore + reissue)

**Files:**
- Modify: `apps/api-gateway/src/customer-credit/service.ts` (mevcut `restoreCreditForOrderInTx` ~436-528 yanına yeni fonksiyon)
- Test: `apps/api-gateway/src/customer-credit/service.test.ts`

**Interfaces:**
- Consumes: `planReturnRestore` (Task 4), `spendCreditInTx` lot debit kayıtları (`ORDER_PAYMENT_DEBIT` groupKey `credit-spend:<orderId>`), `issueCredit` non-expiring (Task 7).
- Produces: `restoreCreditAmountForOrderInTx(tx, params: { storeId; customerId; orderId; returnRequestId; amountMinor: bigint; currency; actor }): Promise<{ ok: true; restoredMinor: bigint; reissuedMinor: bigint } | { ok: false; code: string }>`.

**Algoritma (§5.1 return):**
1. Order'ın `ORDER_PAYMENT_DEBIT` ledger satırlarından lot bazında harcanan miktarları ve önceki return-restore'ları oku → her lot için `remainingRestorable = spentOnLot − alreadyRestoredForOrder(lot)`.
2. `amountMinor`'ı bu lot'lara FEFO/deterministik dağıt (RestoreCandidate[]).
3. `planReturnRestore(candidates, lotById(expiresAt), now)`:
   - `restoreMinor > 0` → o lot'u revive (`remainingAmountMinor += restoreMinor`, status ACTIVE), ledger `RETURN_CREDIT_RESTORE`/source `ORDER_RETURN`/desc `credit.returnCreditRestore`, idempotencyKey `return-credit-restore:<returnId>:<lotId>`.
   - `reissueMinor > 0` → `issueCredit(expiryDays: null, sourceType ORDER_RETURN, ledgerType RETURN_CREDIT_RESTORE, desc credit.returnCreditReissued, idempotencyKey return-credit-reissue:<returnId>:<lotId>)`.
4. `groupKey = credit-return-restore:<returnId>`. Toplam idempotent.

- [ ] **Step 1: Failing test yaz** (izole DB harness):

```ts
it("return restore revives alive original lot", async () => {
  // sipariş store-credit ile ödendi (alive lot), sonra kısmi return 60
  const r = await prisma.$transaction((tx) => restoreCreditAmountForOrderInTx(tx, { storeId, customerId, orderId, returnRequestId: "R1", amountMinor: 60n, currency: "TRY", actor: { type: "SYSTEM", id: "s" } }));
  expect(r.ok && r.restoredMinor).toBe(60n);
  expect(r.ok && r.reissuedMinor).toBe(0n);
});
it("return restore reissues non-expiring when original lot expired", async () => {
  // original lot süresi geçmiş
  const r = await prisma.$transaction((tx) => restoreCreditAmountForOrderInTx(tx, { storeId, customerId, orderId, returnRequestId: "R2", amountMinor: 60n, currency: "TRY", actor: { type: "SYSTEM", id: "s" } }));
  expect(r.ok && r.reissuedMinor).toBe(60n);
  const reissued = await prisma.customerCreditLot.findFirstOrThrow({ where: { sourceType: "ORDER_RETURN", expiresAt: null } });
  expect(reissued.remainingAmountMinor).toBe(60n);
});
it("is idempotent on repeated execution", async () => {
  const call = () => prisma.$transaction((tx) => restoreCreditAmountForOrderInTx(tx, { storeId, customerId, orderId, returnRequestId: "R3", amountMinor: 60n, currency: "TRY", actor: { type: "SYSTEM", id: "s" } }));
  await call(); await call();
  const entries = await prisma.customerCreditLedgerEntry.count({ where: { groupKey: "credit-return-restore:R3" } });
  expect(entries).toBe(1); // ikinci çağrı yeni hareket yaratmaz
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- customer-credit/service`
Expected: FAIL (fonksiyon yok).

- [ ] **Step 3: Implement** — yukarıdaki algoritma. `restoreCreditForOrderInTx`'in lot okuma/advisory-lock desenini reuse et; `planRestore` yerine `planReturnRestore`; expired dalında `issueCredit(expiryDays:null)`. Idempotency: her lot işlemi conditional `updateMany`/`findUnique(idempotencyKey)` ile korunur (mevcut `credit-restore:<orderId>:<lotId>` deseni → `return-credit-restore:<returnId>:<lotId>`).

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- customer-credit/service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/customer-credit/service.ts apps/api-gateway/src/customer-credit/service.test.ts
git commit -m "feat(credit): TODO-175 restoreCreditAmountForOrderInTx (partial return restore + expired reissue)"
```

---

## Task 9: Cancellation execution + projection split

**Files:**
- Modify: `apps/api-gateway/src/orders/cancellation/service.ts` (`cancelCustomerOrder` ~91; refund prep çağrısı ~231)
- Modify: `apps/api-gateway/src/refunds/service.ts` (`prepareCancellationRefund` ~676-775 — destination param + INTERNAL_CREDIT dalı)
- Modify: `apps/api-gateway/src/orders/cancellation/projection.ts` (`estimatedRefundMinor` ~124 → split)
- Test: `apps/api-gateway/src/orders/cancellation/service.test.ts`, `apps/api-gateway/src/refunds/service.test.ts`

**Interfaces:**
- Consumes: `computeRefundSourceSplit`, `resolveDestinationEligibility` (Task 5), `restoreCreditForOrderInTx` (cancellation restore, mevcut), `issueCredit` non-expiring (Task 7).
- Produces: `CancelOrderInput.refundDestination?: RefundDestination`. `prepareCancellationRefund` external legi: `ORIGINAL_PAYMENT` → OrderRefund PROVIDER/MANUAL (mevcut); `SHOPPING_BALANCE` → OrderRefund `executionMode INTERNAL_CREDIT, status SUCCEEDED` tx-içi + `issueCredit(expiryDays:null, sourceType ORDER_CANCELLATION, ledgerType REFUND_RESTORE, desc credit.cancellationRefund)`. Projection `computeCancellationOrderSummaries` → `{ externalRefundableMinor, creditRestorableMinor, totalMinor }`.

**Notlar:**
- Credit-origin restore cancellation'da **mevcut** `restoreCreditForOrderInTx` (expired-skip) korunur; destinationdan bağımsız çalışır (her zaman).
- Destination yalnız external portion'a uygulanır. `SHOPPING_BALANCE` iken PSP çağrısı YOK; INTERNAL_CREDIT legi external cap'e sayılır.
- Unpaid → refund yok, destination sorulmaz.

- [ ] **Step 1: Failing test yaz** — 4 senaryo: card-only ORIGINAL_PAYMENT (OrderRefund PROVIDER, credit issue yok), card-only SHOPPING_BALANCE (OrderRefund INTERNAL_CREDIT SUCCEEDED + non-expiring credit, PSP çağrısı yok), mixed ORIGINAL_PAYMENT (external OrderRefund + credit restore), mixed SHOPPING_BALANCE (external→non-expiring credit + credit restore). Ayrıca duplicate cancellation no-op ve provider failure → credit duplicate yok.

```ts
it("card-only cancellation SHOPPING_BALANCE issues non-expiring credit, no PSP", async () => {
  const res = await cancelCustomerOrder({ ...input, refundDestination: "SHOPPING_BALANCE" }, deps);
  expect(providerPort.createRefund).not.toHaveBeenCalled();
  const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId } });
  expect(refund.executionMode).toBe("INTERNAL_CREDIT");
  expect(refund.status).toBe("SUCCEEDED");
  const lot = await prisma.customerCreditLot.findFirstOrThrow({ where: { sourceType: "ORDER_CANCELLATION", expiresAt: null } });
  expect(lot.remainingAmountMinor).toBeGreaterThan(0n);
});
it("mixed cancellation ORIGINAL_PAYMENT splits external to PSP, credit restore", async () => { /* ... */ });
it("credit-only order rejects ORIGINAL_PAYMENT with INVALID_DESTINATION (no silent fallback)", async () => {
  const res = await cancelCustomerOrder({ ...creditOnlyInput, refundDestination: "ORIGINAL_PAYMENT" }, deps);
  expect(res).toMatchObject({ ok: false, code: "INVALID_DESTINATION" });
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- cancellation/service`
Expected: FAIL.

- [ ] **Step 3: Implement** — `CancelOrderInput.refundDestination` ekle; `cancelCustomerOrder` bunu `prepareCancellationRefund`'a geçirir (persisted validated input, UI'ya değil). `prepareCancellationRefund`: external captured (`excludeStoreCredit:true`) = external pool; `resolveDestinationEligibility` ile **Düzeltme A: geçersiz seçim SESSIZ fallback YOK → `{ ok: false, code: "INVALID_DESTINATION" }`** (external=0 iken ORIGINAL_PAYMENT seçilirse reddet; credit-only akış zaten destination sormaz ve default SHOPPING_BALANCE gelir). `SHOPPING_BALANCE` dalı: OrderRefund INTERNAL_CREDIT SUCCEEDED tx-içi + `issueCredit(expiryDays:null, refundOriginSystemPath:true, sourceType ORDER_CANCELLATION)`. `ORIGINAL_PAYMENT`: mevcut PSP dalı. Projection split döndür.

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- cancellation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/orders/cancellation apps/api-gateway/src/refunds/service.ts apps/api-gateway/src/**/*.test.ts
git commit -m "feat(cancellation): TODO-175 destination-aware cancellation refund (INTERNAL_CREDIT + split projection)"
```

---

## Task 10: Return execution — Re-only PSP + INTERNAL_CREDIT + credit restore + completion guard

**Files:**
- Modify: `apps/api-gateway/src/refunds/service.ts` (`initiateRefund` ~381-518 — OrderRefund tutarı = Re; SHOPPING_BALANCE dalı; destination param)
- Modify: `apps/api-gateway/src/returns/service.ts` (`upsertRefundIntentForReturn` ~903; `isCompletionAllowed` ~386-409 → iki-ledger settlement; `isRefundResolution` kullan)
- Test: `apps/api-gateway/src/refunds/service.test.ts`, `apps/api-gateway/src/returns/service.test.ts`

**Interfaces:**
- Consumes: `computeRefundSourceSplit`, `resolveEffectiveRefundDestination` (Task 6), `restoreCreditAmountForOrderInTx` (Task 8), `issueCredit` non-expiring.
- Produces: `initiateRefund` artık `refundDestination`'a göre external legi işler; `RefundIntent.totalRefundMinor` = Re+Rc; OrderRefund(external) = Re; credit restore = Rc ayrı. `isCompletionAllowed`: `Σ SUCCEEDED OrderRefund(external incl INTERNAL_CREDIT) + Σ return credit restore ≥ intent.total`.

- [ ] **Step 1: Failing test yaz** — senaryolar: card-only full return ORIGINAL_PAYMENT & SHOPPING_BALANCE; mixed full return her iki destination; partial return ORIGINAL_PAYMENT (Re PSP + Rc restore); partial SHOPPING_BALANCE (hepsi balance); store-credit-origin asla PSP'ye; prior partial refund cap respected; repeated execution safe; completion guard iki-ledger.

```ts
it("mixed full return ORIGINAL_PAYMENT: external to PSP, credit-origin restored", async () => {
  await approveAndInitiate(returnId, "REFUND", "ORIGINAL_PAYMENT");
  const ext = await prisma.orderRefund.findFirstOrThrow({ where: { returnRequestId: returnId } });
  expect(ext.totalRefundMinor).toBe(700); // Re
  const restored = await prisma.customerCreditLedgerEntry.findFirst({ where: { type: "RETURN_CREDIT_RESTORE" } });
  expect(restored).not.toBeNull();
});
it("completion allowed only when external + credit restore >= intent total", async () => { /* ... */ });
it("store-credit-origin never becomes PSP refund", async () => {
  await approveAndInitiate(creditOnlyReturnId, "REFUND", "SHOPPING_BALANCE");
  expect(providerPort.createRefund).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Test fail doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- refunds/service`
Expected: FAIL.

- [ ] **Step 3: Implement** — `initiateRefund`: `resolveEffectiveRefundDestination(returnRequest)` ile destination al; external pool + credit pool hesapla (`cap-calc` + credit ledger); **Düzeltme A: `resolveDestinationEligibility` ile geçersiz seçim → `{ ok:false, code:"INVALID_DESTINATION" }` (sessiz fallback yok)**; `computeRefundSourceSplit(intent.totalRefundMinor)` → Re/Rc. Tx-içinde: Rc>0 → `restoreCreditAmountForOrderInTx`; Re>0 → destination ORIGINAL_PAYMENT ise OrderRefund PENDING (tutar Re) + post-commit provider (mevcut), SHOPPING_BALANCE ise OrderRefund INTERNAL_CREDIT SUCCEEDED + `issueCredit(expiryDays:null, refundOriginSystemPath:true, sourceType ORDER_RETURN, REFUND_RESTORE, desc credit.returnRefund)`. `initiateRefund`'ün `resolutionType === "REFUND_TO_ORIGINAL_PAYMENT"` guard'ı (satır ~419) `isRefundResolution` ile değiştir. `isCompletionAllowed`: credit restore toplamını da say.

- [ ] **Step 4: Test pass doğrula**

Run: `pnpm --filter @commerce-os/api-gateway test -- refunds returns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/refunds/service.ts apps/api-gateway/src/returns/service.ts apps/api-gateway/src/**/*.test.ts
git commit -m "feat(refunds): TODO-175 destination-aware return execution (Re/Rc split, INTERNAL_CREDIT, two-ledger completion)"
```

---

## Task 11: Return create — destination persist + routes + eligibility preview endpoint

**Files:**
- Modify: `apps/api-gateway/src/returns/service.ts` (`createReturnRequest` ~239-366 — `refundDestination` persist + `REFUND` resolution + `selectedBy=CUSTOMER`)
- Modify: `apps/api-gateway/src/returns/routes-customer.ts` (create ~191; yeni `GET .../returns/eligibility?order=` refund preview)
- Modify: `apps/storefront-web/lib/server/returns.ts` (eligibility fetch), `apps/storefront-web/app/account/returns/new/page.tsx` (preview server-load)
- Test: `apps/api-gateway/src/returns/service.test.ts`, `apps/api-gateway/src/returns/routes-customer.test.ts`

**Interfaces:**
- Consumes: `customerReturnCreateRequestSchema` (Task 2), `buildRefundDestinationPreview` (Task 5).
- Produces: `createReturnRequest` `refundDestination`'ı immutable saklar; `REFUND` resolution yazar (legacy `REFUND_TO_ORIGINAL_PAYMENT` yalnız eski kayıtlarda). Yeni endpoint refund preview DTO döndürür (server-authoritative).

- [ ] **Step 1: Failing test yaz** — create ile `refundDestination: SHOPPING_BALANCE` gönderilince ReturnRequest'te `refundDestination/selectedBy=CUSTOMER/selectedAt` set; resolution `REFUND`. Eligibility endpoint mixed order için `offerOriginalPayment:true`, credit-only için `false`.

- [ ] **Step 2: Test fail doğrula** — Run: `pnpm --filter @commerce-os/api-gateway test -- returns/routes-customer` → FAIL.

- [ ] **Step 3: Implement** — `createReturnRequest` payload'dan `refundDestination` al, `isRefundResolution` iken zorunlu (server validation, client'a güvenme), `resolutionType` normalize (`REFUND`), alanları yaz. Eligibility route: order snapshot + ledger'dan `externalRefundableRemaining`/`creditRestorableRemaining` hesapla → `buildRefundDestinationPreview`.

- [ ] **Step 4: Test pass doğrula** — Run: `pnpm --filter @commerce-os/api-gateway test -- returns` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/returns apps/storefront-web/lib/server/returns.ts apps/storefront-web/app/account/returns/new/page.tsx
git commit -m "feat(returns): TODO-175 persist immutable refund destination + eligibility preview endpoint"
```

---

## Task 12: Admin visibility + reporting (allocation DTO)

**Files:**
- Modify: `apps/api-gateway/src/refunds/visibility.ts` (destination + actual allocation alanları; destination filter)
- Modify: `apps/api-gateway/src/refunds/serialize.ts` (~80,104 — allocation DTO)
- Modify: `apps/api-gateway/src/customer-credit/report.ts` (refund-to-balance bucket, adoption rate)
- Modify: `apps/api-gateway/src/returns/routes-admin.ts` (~137 list — destination filter param)
- Test: `apps/api-gateway/src/refunds/visibility.test.ts`, `apps/api-gateway/src/customer-credit/report.test.ts`

**Interfaces:**
- Produces: `RefundVisibilityItem += { refundDestination, actualAllocation: { externalRefundMinor, creditRestoreMinor, shoppingBalanceRefundMinor }, choiceEligible: boolean, ... }`; list `destination` filtresi; reporting: `refundToOriginalMinor`, `refundToShoppingBalanceMinor`, `shoppingBalanceAdoptionRate`, `cancellationVsReturnBreakdown`.
- **Düzeltme D — adoption rate paydası:** `choiceEligible = externalComponentMinor > 0 && offerOriginalPayment && offerShoppingBalance` (müşteri gerçek seçim yapabildi). `shoppingBalanceAdoptionRate = count(choiceEligible && destination==SHOPPING_BALANCE) / count(choiceEligible)`. Credit-only / external=0 refund'lar paydaya girmez. Payda 0 ise oran `null` (NaN değil).

- [ ] **Step 1: Failing test yaz** — allocation DTO OrderRefund(external legs) + credit ledger(restore+balance) `groupKey`/`returnRequestId`/`orderId` ile birleştirir; reporting bucket'ları doğru toplar; destination filter yalnız eşleşenleri döndürür; **adoption rate paydası yalnız `choiceEligible` refund'ları sayar (credit-only refund payda dışı; payda 0 → null)**.

```ts
it("adoption rate denominator only counts choice-eligible refunds", () => {
  const rate = computeAdoptionRate([
    { choiceEligible: true, destination: "SHOPPING_BALANCE" },
    { choiceEligible: true, destination: "ORIGINAL_PAYMENT" },
    { choiceEligible: false, destination: "SHOPPING_BALANCE" }, // credit-only, payda dışı
  ]);
  expect(rate).toBe(0.5);
  expect(computeAdoptionRate([{ choiceEligible: false, destination: "SHOPPING_BALANCE" }])).toBeNull();
});
```

- [ ] **Step 2: Test fail doğrula** — Run: `pnpm --filter @commerce-os/api-gateway test -- visibility report` → FAIL.

- [ ] **Step 3: Implement** — allocation assembler (server-side); report bucket'ları; filter.

- [ ] **Step 4: Test pass doğrula** — Run: `pnpm --filter @commerce-os/api-gateway test -- visibility report` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/refunds/visibility.ts apps/api-gateway/src/refunds/serialize.ts apps/api-gateway/src/customer-credit/report.ts apps/api-gateway/src/returns/routes-admin.ts
git commit -m "feat(admin): TODO-175 refund destination visibility, allocation DTO, reporting buckets"
```

---

## Task 13: Cancellation modal destination step + confirm split (storefront)

**Files:**
- Modify: `apps/storefront-web/components/account/cancellations/cancel-order-modal.tsx` (Stepper: reason → **destination** → confirm; ConfirmStep split)
- Modify: `apps/storefront-web/lib/server/cancellations.ts` / `cancellation-actions.ts` (summary preview split + destination submit)
- Modify: `packages/i18n/src/locales/{tr,en}/storefront.ts` (destination copy)
- Test: `apps/storefront-web/test/cancel-order-modal.test.tsx` (mevcut pattern)

**Interfaces:**
- Consumes: eligibility/preview DTO (Task 9 projection split via summary prop).
- Produces: modal `refundDestination` seçer (yalnız `isPaid && externalRefundableRemaining>0` iken adım gösterilir), submit payload'a ekler; ConfirmStep split gösterir.

- [ ] **Step 1: Failing test yaz** — mixed order: destination adımı görünür; ORIGINAL_PAYMENT seçilince confirm "Alışveriş bakiyesi: ₺300 / Kredi kartı ••••1234: ₺700" gösterir; credit-only order: adım atlanır, "Alışveriş bakiyenize eklenecek" gösterir; unpaid: refund bölümü yok.

- [ ] **Step 2: Test fail doğrula** — Run: `pnpm --filter @commerce-os/storefront-web test -- cancel-order-modal` → FAIL.

- [ ] **Step 3: Implement** — Stepper'a koşullu destination adımı; i18n key'leri; ConfirmStep split render; submit `{ reasonCode, reasonNote?, expectedVersion, refundDestination? }`.

- [ ] **Step 4: Test pass doğrula** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-web/components/account/cancellations apps/storefront-web/lib/server packages/i18n/src/locales
git commit -m "feat(storefront): TODO-175 cancellation destination step + split confirm summary"
```

---

## Task 14: Return wizard destination sub-choice (storefront)

**Files:**
- Modify: `apps/storefront-web/components/account/returns/return-wizard.tsx` (StepResolution ~544 — REFUND altında destination alt-seçimi; submit payload)
- Modify: `packages/i18n/src/locales/{tr,en}/storefront.ts`
- Test: `apps/storefront-web/test/return-wizard.test.tsx`

**Interfaces:**
- Consumes: eligibility preview (Task 11 endpoint), `refundDestinationSchema`.
- Produces: wizard `REFUND` seçilince destination alt-seçimi (eligibility'ye göre); submit `refundDestination` ekler.

- [ ] **Step 1: Failing test yaz** — mixed order: her iki destination görünür; credit-only: yalnız SHOPPING_BALANCE; submit payload `refundDestination` içerir; resolution `REFUND`.

- [ ] **Step 2: Test fail doğrula** — FAIL.

- [ ] **Step 3: Implement** — StepResolution genişlet; `resolutionOptions` `REFUND` + destination alt-radyo; submit map.

- [ ] **Step 4: Test pass doğrula** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-web/components/account/returns/return-wizard.tsx packages/i18n/src/locales
git commit -m "feat(storefront): TODO-175 return wizard refund destination selection"
```

---

## Task 15: Store Admin return/cancellation detail + unified list filter/reporting

**Files:**
- Modify: `apps/store-admin-web/app/(app)/orders/returns/[id]/page.tsx` (~397 — `isRefundResolution` render koşulu; destination + allocation gösterimi) + `refund-panel.tsx` (allocation satırları)
- Modify: `apps/store-admin-web/app/(app)/orders/[id]/page.tsx` (`OrderCancellationSection` ~597 — destination/restore/external/balance ayrı satır)
- Modify: `apps/store-admin-web/app/(app)/orders/returns/page.tsx` (destination filtresi + reporting tile)
- Modify: `apps/store-admin-web/app/(app)/orders/order-shared.ts` (destination label/tone)
- Test: ilgili `*.test.tsx` (mevcut pattern) veya render smoke

**Interfaces:**
- Consumes: allocation DTO + reporting (Task 12).
- Produces: admin return/cancellation detay: müşteri tercihi + total + destination + actual allocation + status; unified list destination filter + tile'lar.

- [ ] **Step 1: Failing test yaz** — return detail SHOPPING_BALANCE tercihi + allocation satırlarını gösterir; RefundPanel `REFUND` (legacy+yeni) için render olur; cancellation detail restore vs external vs balance ayrı; list destination filtresi çalışır.

- [ ] **Step 2: Test fail doğrula** — FAIL.

- [ ] **Step 3: Implement** — render koşulunu `isRefundResolution` (client mirror helper) yap; allocation satırları; `order-shared.ts` label; list filter + tile.

- [ ] **Step 4: Test pass doğrula** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/store-admin-web/app/\(app\)/orders
git commit -m "feat(store-admin): TODO-175 refund destination + allocation visibility, list filter/reporting"
```

---

## Task 16: Storefront İadelerim + Alışveriş Bakiyem + i18n copy

**Files:**
- Modify: `apps/storefront-web/app/account/returns/page.tsx` + `[returnNumber]/page.tsx` (destination + amount + status + allocation)
- Modify: `apps/storefront-web/components/account/sections/balance-section.tsx` (~8-21 DESC — yeni semantic key copy)
- Modify: `packages/i18n/src/locales/{tr,en}/storefront.ts`
- Test: `apps/storefront-web/test/balance-section.test.tsx`, returns list render test

**Interfaces:**
- Consumes: allocation DTO; yeni description key'ler (`credit.cancellationRefund`, `credit.returnRefund`, `credit.returnCreditRestore`, `credit.returnCreditReissued`).
- Produces: İadelerim destination/allocation gösterir; Alışveriş Bakiyem refund-origin hareketleri anında + doğru copy; raw enum yok.

- [ ] **Step 1: Failing test yaz** — balance-section yeni key'leri TR/EN doğru render eder (`OS-123 sipariş iptali iadesi`, `OS-124 ürün iadesi`, restore copy); İadelerim satırı destination+allocation gösterir.

- [ ] **Step 2: Test fail doğrula** — FAIL.

- [ ] **Step 3: Implement** — `DESC` map'e yeni key'ler (`{n}` order-number interpolation); İadelerim destination/allocation alanları.

- [ ] **Step 4: Test pass doğrula** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-web/app/account/returns apps/storefront-web/components/account/sections/balance-section.tsx packages/i18n/src/locales
git commit -m "feat(storefront): TODO-175 İadelerim allocation + Alışveriş Bakiyem refund-origin copy"
```

---

## Task 17: Full gate

**Files:** yok (doğrulama).

- [ ] **Step 1: db generate** — `pnpm --filter @commerce-os/db exec prisma generate`
- [ ] **Step 2: migration replay (izole)** — `prisma migrate reset --force --skip-seed` + `migrate deploy` temiz.
- [ ] **Step 3: existing DB upgrade** — dev DB'de `prisma migrate deploy` sorunsuz (veri korunur).
- [ ] **Step 4: typecheck** — `pnpm -w typecheck` (veya `turbo run typecheck`). Beklenen: 0 hata.
- [ ] **Step 5: lint** — `pnpm -w lint`. 0 hata.
- [ ] **Step 6: targeted tests** — Task 1-16 test dosyaları yeşil.
- [ ] **Step 7: workspace test Run 1** — `pnpm -w test`. Yeşil.
- [ ] **Step 8: workspace test Run 2** — `pnpm -w test` (flaky-guard). Yeşil.
- [ ] **Step 9: build** — `pnpm -w build`. Başarılı.
- [ ] **Step 10: git diff --check** — whitespace/conflict marker yok.
- [ ] **Step 11: Commit (varsa lint/format düzeltmeleri)**

```bash
git add -A && git commit -m "chore(todo-175): gate green (typecheck/lint/test x2/build)" || echo "no changes"
```

---

## Task 18: Browser smoke

**Ön koşul:** worktree next dev (storefront :3100) + izole fixture (enterprise-demo pristine kalır). Gerçek auth (`x-customer-session`).

- [ ] **Step 1:** 10 senaryoyu 375/768/1024/1440'te sürücü ile çalıştır (spec §10). Kanıt: her senaryo için ekran görüntüsü/DOM assert.
  1. card-only cancellation → original payment
  2. card-only cancellation → shopping balance
  3. mixed cancellation → original split
  4. mixed cancellation → full shopping balance
  5. return flow → destination selection
  6. partial return
  7. storefront İadelerim visibility
  8. Alışveriş Bakiyem movement (refund-origin anında)
  9. Store Admin return/cancellation detail
  10. reporting/filter
- [ ] **Step 2:** Regression: cart/checkout, paymentAllocations, store-credit checkout, cancellation, returns, refund visibility.
- [ ] **Step 3:** Fixture cleanup; enterprise-demo pristine doğrula.
- [ ] **Step 4:** Smoke runbook/kanıt not düş (varsa `docs/` smoke notu).

---

## Task 19: Docs

**Files:**
- Modify: `docs/ROADMAP*.md`, `docs/TODO.md`, `docs/DECISIONS.md` (ADR-285/286), `docs/TECHNICAL_DEBT.md`

- [ ] **Step 1: ADR-285** (Refund Destination Choice) + **ADR-286** (refund-origin non-expiring credit & expiry asimetrisi) yaz.
- [ ] **Step 2:** Ürün invariant'larını belgele: `STORE_CREDIT value cannot be converted to cash/original PSP refund.` ve `Customer may voluntarily convert eligible externally-paid refund into Shopping Balance.` + expiry asimetrisi (cancellation no-revive / return reissue).
- [ ] **Step 3:** ROADMAP/TODO TODO-175 durum güncelle (ship sonrası CLOSED & DEPLOYED).
- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(todo-175): ADR-285/286 + refund destination invariants (ROADMAP/TODO/TECHNICAL_DEBT)"
```

---

## Ship (gate + smoke green sonrası)

1. Push branch → PR aç (base `main`). 2. CI yeşil. 3. Merge commit (squash/rebase/force YOK). 4. Migration deploy. 5. Yalnız değişen servis rebuild/recreate. 6. Post-deploy smoke. 7. Docs CLOSED & DEPLOYED. 8. Worktree cleanup. 9. Memory güncelle (todo-175 kaydı).

---

## Self-Review (yazım sonrası — spec kapsam kontrolü)

- **§3 şema:** Task 1 ✓ (enums, nullable expiry, ReturnRequest/OrderRefund alanları, provenance).
- **§4 allocation:** Task 5 ✓ (proportional split, eligibility, preview).
- **§5.1 credit restore asimetrisi:** Task 4 (planReturnRestore) + Task 8 (restoreCreditAmountForOrderInTx) + Task 9 (cancellation mevcut restore) ✓.
- **§5.2 external execution:** Task 9 (cancellation) + Task 10 (return) ✓ (INTERNAL_CREDIT + PSP).
- **§5.3 completion guard:** Task 10 ✓.
- **§5.4 provider failure:** Task 9/10 test senaryoları ✓.
- **§5.5 projection split:** Task 9 ✓.
- **§3.2 resolution mapping:** Task 2 (contracts) + Task 6 (helper) + Task 10/15 (kullanım) ✓.
- **§6 UX:** Task 13 (cancel modal) + Task 14 (wizard) + Task 15 (admin) + Task 16 (storefront) ✓.
- **§7 invariants:** allocation cap (Task 5), STORE_CREDIT no-cash (Task 8/9/10), idempotency (Task 8/9/10), isolation (route scoping tüm task'lar) ✓.
- **§8 persistence:** Task 1 (alanlar) + Task 11 (persist) + Task 12 (allocation DTO) ✓.
- **§9 test matrisi:** Task 3-16 test adımları kapsar; §9'un tüm satırları Task 8/9/10/16 testlerinde ✓.
- **§10 smoke:** Task 18 ✓. **§11 gate:** Task 17 ✓. **§12 docs:** Task 19 ✓.

Tip tutarlılığı: `computeRefundSourceSplit` (number) → credit tarafı `BigInt()` ile (Task 8/9/10 sınır dönüşümü açık). `isRefundResolution`/`resolveEffectiveRefundDestination` isimleri Task 6'da tanımlı, Task 10/11/15'te aynı isimle kullanılıyor. `restoreCreditAmountForOrderInTx` imzası Task 8'de tanımlı, Task 10'da tüketiliyor.

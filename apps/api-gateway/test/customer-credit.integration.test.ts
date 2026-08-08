/**
 * TODO-174B (ADR-281/284) — Store Credit ledger GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL=...commerce_os_test... verilmezse SKIP (CI-safe). store.delete cascade cleanup.
 * Finansal invariant: cachedAvailable == Σ ACTIVE non-expired lot remaining == available read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@commerce-os/db";
import {
  adminAdjustBalance,
  getAvailableBalanceMinor,
  getCustomerBalance,
  expireLotsForStore,
  issueCredit,
  restoreCreditForOrderInTx,
  restoreCreditAmountForOrderInTx,
  spendCreditInTx,
} from "../src/customer-credit/service.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const dayMs = 24 * 60 * 60 * 1000;

interface Fixture {
  storeId: string;
  customerId: string;
}
const created: string[] = [];

async function seed(): Promise<Fixture> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `cc-store-${sfx}`;
  const customerId = `cc-cust-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `CC ${sfx}`, slug: `cc-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `cc-${sfx}@example.test`, firstName: "Cc", lastName: "Test" },
  });
  created.push(storeId);
  return { storeId, customerId };
}

async function issue(f: Fixture, amount: bigint, expiryDays: 30 | 60 | 120 | 180, key: string, opts?: { policyMaxMinor?: bigint | null; overridePolicy?: boolean }) {
  return issueCredit({
    storeId: f.storeId,
    customerId: f.customerId,
    currency: "TRY",
    amountMinor: amount,
    expiryDays,
    sourceType: "ADMIN_GOODWILL",
    ledgerType: "ADMIN_GOODWILL_CREDIT",
    description: "credit.goodwill",
    actor: { type: "PLATFORM_USER", id: "admin-1" },
    idempotencyKey: key,
    ...opts,
  });
}

/** Invariant: cachedAvailable == available read == Σ ledger CREDIT − DEBIT (canlı lot bazında değil, cache doğrulaması). */
async function assertCacheMatchesLots(f: Fixture) {
  const account = await prisma.customerCreditAccount.findUnique({
    where: { storeId_customerId_currency: { storeId: f.storeId, customerId: f.customerId, currency: "TRY" } },
    select: { cachedAvailableMinor: true },
  });
  const available = await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY");
  expect(account?.cachedAvailableMinor).toBe(available);
}

describe.skipIf(!hasTestDb)("Store Credit ledger (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("yeni hesap: bakiye 0", async () => {
    const f = await seed();
    const bal = await getCustomerBalance(f.storeId, f.customerId, "TRY");
    expect(bal.availableMinor).toBe(0n);
    expect(bal.entries).toHaveLength(0);
  });

  it("admin credit: lot + ledger + cache doğru", async () => {
    const f = await seed();
    const r = await issue(f, 50000n, 30, "k1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.balanceAfterMinor).toBe(50000n);
    const bal = await getCustomerBalance(f.storeId, f.customerId, "TRY");
    expect(bal.availableMinor).toBe(50000n);
    expect(bal.entries).toHaveLength(1);
    expect(bal.entries[0]?.type).toBe("ADMIN_GOODWILL_CREDIT");
    await assertCacheMatchesLots(f);
  });

  it("idempotency: aynı key iki kez → tek lot, dedup", async () => {
    const f = await seed();
    const a = await issue(f, 10000n, 30, "dup");
    const b = await issue(f, 10000n, 30, "dup");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.deduped).toBe(true);
    const lots = await prisma.customerCreditLot.count({ where: { storeId: f.storeId } });
    expect(lots).toBe(1);
    const bal = await getCustomerBalance(f.storeId, f.customerId, "TRY");
    expect(bal.availableMinor).toBe(10000n);
  });

  it("policy: kapalı (null) reddedilir; limit aşımı reddedilir; override geçer", async () => {
    const f = await seed();
    const disabled = await issue(f, 5000n, 30, "p1", { policyMaxMinor: null });
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) expect(disabled.code).toBe("POLICY_DISABLED");
    const exceeds = await issue(f, 20000n, 30, "p2", { policyMaxMinor: 10000n });
    expect(exceeds.ok).toBe(false);
    if (!exceeds.ok) expect(exceeds.code).toBe("EXCEEDS_POLICY_LIMIT");
    const overridden = await issue(f, 20000n, 30, "p3", { policyMaxMinor: 10000n, overridePolicy: true });
    expect(overridden.ok).toBe(true);
  });

  it("geçersiz expiry reddedilir", async () => {
    const f = await seed();
    const r = await issueCredit({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", amountMinor: 1000n,
      expiryDays: 45, sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT",
      description: "credit.goodwill", actor: { type: "PLATFORM_USER", id: "a" }, idempotencyKey: "e1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_EXPIRY");
  });

  it("FEFO spend: erken biten lot önce; snapshot doğru", async () => {
    const f = await seed();
    // İki lot: biri 30 gün (erken), biri 180 gün (geç). issue expiry gün olarak; 30 önce tüketilmeli.
    await issue(f, 20000n, 180, "late");
    await issue(f, 20000n, 30, "early");
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    const res = await prisma.$transaction((tx) =>
      spendCreditInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY",
        requestedMinor: 30000n, orderId, actor: { type: "CUSTOMER", id: f.customerId },
        description: "credit.orderPayment",
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.usedMinor).toBe(30000n);
      // early lot (20000) tamamen + late lot 10000.
      const earlyLot = await prisma.customerCreditLot.findFirst({ where: { storeId: f.storeId, expiresAt: { lte: new Date(Date.now() + 31 * dayMs) } } });
      expect(earlyLot?.remainingAmountMinor).toBe(0n);
      expect(earlyLot?.status).toBe("CONSUMED");
    }
    const bal = await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY");
    expect(bal).toBe(10000n);
    await assertCacheMatchesLots(f);
  });

  it("yetersiz bakiye harcaması reddedilir (kısmi yok)", async () => {
    const f = await seed();
    await issue(f, 10000n, 30, "s1");
    const res = await prisma.$transaction((tx) =>
      spendCreditInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY",
        requestedMinor: 15000n, orderId: `o-${randomUUID().slice(0, 6)}`,
        actor: { type: "CUSTOMER", id: f.customerId }, description: "credit.orderPayment",
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("iptal restore: canlı lot geri yüklenir + ACTIVE; idempotent (duplicate yok)", async () => {
    const f = await seed();
    await issue(f, 30000n, 60, "r1");
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await prisma.$transaction((tx) =>
      spendCreditInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", requestedMinor: 30000n,
        orderId, actor: { type: "CUSTOMER", id: f.customerId }, description: "credit.orderPayment",
      }),
    );
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
    const restore1 = await prisma.$transaction((tx) =>
      restoreCreditForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE", sourceType: "ORDER_CANCELLATION",
        actor: { type: "SYSTEM", id: null }, description: "credit.cancellationRestore",
      }),
    );
    expect(restore1.restoredMinor).toBe(30000n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(30000n);
    const lot = await prisma.customerCreditLot.findFirst({ where: { storeId: f.storeId } });
    expect(lot?.status).toBe("ACTIVE");
    // Idempotent: ikinci restore duplicate üretmez.
    const restore2 = await prisma.$transaction((tx) =>
      restoreCreditForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE", sourceType: "ORDER_CANCELLATION",
        actor: { type: "SYSTEM", id: null }, description: "credit.cancellationRestore",
      }),
    );
    expect(restore2.restoredMinor).toBe(0n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(30000n);
  });

  it("süresi geçmiş lot restore'da CANLANMAZ (skippedExpired)", async () => {
    const f = await seed();
    await issue(f, 20000n, 30, "x1");
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await prisma.$transaction((tx) =>
      spendCreditInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", requestedMinor: 20000n,
        orderId, actor: { type: "CUSTOMER", id: f.customerId }, description: "credit.orderPayment",
      }),
    );
    // Lot'u geçmişte sona erdir (harcama sonrası remaining=0, CONSUMED). Restore öncesi expiry'yi geçmişe çek.
    await prisma.customerCreditLot.updateMany({ where: { storeId: f.storeId }, data: { expiresAt: new Date(Date.now() - dayMs) } });
    const restore = await prisma.$transaction((tx) =>
      restoreCreditForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId,
        ledgerType: "ORDER_CANCELLATION_RESTORE", sourceType: "ORDER_CANCELLATION",
        actor: { type: "SYSTEM", id: null }, description: "credit.cancellationRestore",
      }),
    );
    expect(restore.restoredMinor).toBe(0n);
    expect(restore.skippedExpiredMinor).toBe(20000n);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
  });

  it("expire worker: süresi dolmuş lot EXPIRED + EXPIRE entry; available zaten 0", async () => {
    const f = await seed();
    await issue(f, 15000n, 30, "exp1");
    // Süresi dolmuş yap.
    await prisma.customerCreditLot.updateMany({ where: { storeId: f.storeId }, data: { expiresAt: new Date(Date.now() - dayMs) } });
    // available zaten 0 (expiresAt<=now).
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
    const processed = await expireLotsForStore(f.storeId);
    expect(processed).toBe(1);
    const lot = await prisma.customerCreditLot.findFirst({ where: { storeId: f.storeId } });
    expect(lot?.status).toBe("EXPIRED");
    const expireEntry = await prisma.customerCreditLedgerEntry.findFirst({ where: { storeId: f.storeId, type: "EXPIRE" } });
    expect(expireEntry?.amountMinor).toBe(15000n);
    // İkinci çağrı idempotent (tekrar EXPIRE yazmaz).
    expect(await expireLotsForStore(f.storeId)).toBe(0);
  });

  it("cross-store izolasyon: bir mağazanın bakiyesi diğerine sızmaz", async () => {
    const a = await seed();
    const b = await seed();
    await issue(a, 40000n, 30, "iso-a");
    expect(await getAvailableBalanceMinor(prisma, a.storeId, a.customerId, "TRY")).toBe(40000n);
    expect(await getAvailableBalanceMinor(prisma, b.storeId, b.customerId, "TRY")).toBe(0n);
  });

  it("admin adjust DEBIT: hatalı yüklemeyi geri alır (FEFO azaltma; no-negative)", async () => {
    const f = await seed();
    await issue(f, 25000n, 60, "adj1"); // ₺250 yüklendi (hatalı)
    const res = await adminAdjustBalance({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", direction: "DEBIT",
      amountMinor: 25000n, reason: "CORRECTION", actor: { type: "PLATFORM_USER", id: "sa" }, idempotencyKey: "corr-1",
    });
    expect(res.ok).toBe(true);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
    const debit = await prisma.customerCreditLedgerEntry.findFirst({ where: { storeId: f.storeId, type: "ADMIN_ADJUSTMENT_DEBIT" } });
    expect(debit?.amountMinor).toBe(25000n);
  });

  it("admin adjust DEBIT: bakiyeyi aşamaz (INSUFFICIENT_BALANCE)", async () => {
    const f = await seed();
    await issue(f, 10000n, 60, "adj2");
    const res = await adminAdjustBalance({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", direction: "DEBIT",
      amountMinor: 15000n, reason: "CORRECTION", actor: { type: "PLATFORM_USER", id: "sa" }, idempotencyKey: "corr-2",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INSUFFICIENT_BALANCE");
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(10000n);
  });

  it("admin adjust DEBIT: idempotent (aynı key tekrar → çift debit yok)", async () => {
    const f = await seed();
    await issue(f, 30000n, 60, "adj3");
    const p = { storeId: f.storeId, customerId: f.customerId, currency: "TRY", direction: "DEBIT" as const, amountMinor: 10000n, reason: "CORRECTION", actor: { type: "PLATFORM_USER" as const, id: "sa" }, idempotencyKey: "corr-3" };
    await adminAdjustBalance(p);
    const second = await adminAdjustBalance(p);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.deduped).toBe(true);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(20000n); // yalnız bir kez düştü
  });

  it("admin adjust CREDIT: bakiye artırır (expiry zorunlu)", async () => {
    const f = await seed();
    const res = await adminAdjustBalance({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", direction: "CREDIT",
      amountMinor: 5000n, reason: "PRICE_ADJUSTMENT", actor: { type: "PLATFORM_USER", id: "sa" }, idempotencyKey: "adjc-1", expiryDays: 90 as never,
    });
    expect(res.ok).toBe(false); // 90 geçersiz expiry
    const ok = await adminAdjustBalance({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", direction: "CREDIT",
      amountMinor: 5000n, reason: "PRICE_ADJUSTMENT", actor: { type: "PLATFORM_USER", id: "sa" }, idempotencyKey: "adjc-2", expiryDays: 120,
    });
    expect(ok.ok).toBe(true);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(5000n);
  });

  it("TODO-175: expiryDays=null non-expiring lot (allowlisted refund-origin system path)", async () => {
    const f = await seed();
    const res = await issueCredit({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", amountMinor: 500n,
      expiryDays: null, refundOriginSystemPath: true, sourceType: "ORDER_REFUND", ledgerType: "REFUND_RESTORE",
      description: "credit.returnRefund", actor: { type: "SYSTEM", id: "sys" }, idempotencyKey: "return-refund:R1",
    });
    expect(res.ok).toBe(true);
    const lot = await prisma.customerCreditLot.findFirstOrThrow({ where: { storeId: f.storeId, sourceType: "ORDER_REFUND" } });
    expect(lot.expiresAt).toBeNull();
    // Non-expiring lot bakiyeye girer ve gelecekte de spendable kalır.
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(500n);
  });

  it("TODO-175: expiryDays=null REJECTED without allowlist (goodwill cannot bypass)", async () => {
    const f = await seed();
    const res = await issueCredit({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", amountMinor: 500n,
      expiryDays: null, sourceType: "ADMIN_GOODWILL", ledgerType: "ADMIN_GOODWILL_CREDIT",
      description: "credit.goodwill", actor: { type: "PLATFORM_USER", id: "u1" }, idempotencyKey: "g-null-1",
    });
    expect(res).toEqual({ ok: false, code: "INVALID_EXPIRY" });
  });

  it("TODO-175: expiryDays=null REJECTED when sourceType not allowlisted even with flag", async () => {
    const f = await seed();
    const res = await issueCredit({
      storeId: f.storeId, customerId: f.customerId, currency: "TRY", amountMinor: 500n,
      expiryDays: null, refundOriginSystemPath: true, sourceType: "ADMIN_ADJUSTMENT", ledgerType: "ADMIN_ADJUSTMENT_CREDIT",
      description: "credit.adjustment", actor: { type: "SYSTEM", id: "s" }, idempotencyKey: "a-null-1",
    });
    expect(res).toEqual({ ok: false, code: "INVALID_EXPIRY" });
  });

  // --- TODO-175: restoreCreditAmountForOrderInTx (partial return restore + reissue) ---
  async function spendAll(f: Fixture, amount: bigint, expiryDays: 30 | 60 | 120 | 180, key: string, orderId: string) {
    await issue(f, amount, expiryDays, key);
    await prisma.$transaction((tx) =>
      spendCreditInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", requestedMinor: amount,
        orderId, actor: { type: "CUSTOMER", id: f.customerId }, description: "credit.orderPayment",
      }),
    );
  }
  const restoreAmount = (f: Fixture, orderId: string, returnRequestId: string, amountMinor: bigint) =>
    prisma.$transaction((tx) =>
      restoreCreditAmountForOrderInTx(tx, {
        storeId: f.storeId, customerId: f.customerId, currency: "TRY", orderId, returnRequestId, amountMinor,
        actor: { type: "SYSTEM", id: null },
      }),
    );

  it("TODO-175: return partial restore revives alive original lot", async () => {
    const f = await seed();
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await spendAll(f, 30000n, 60, "cr1", orderId);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(0n);
    const r = await restoreAmount(f, orderId, "R1", 6000n);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.restoredMinor).toBe(6000n);
      expect(r.reissuedMinor).toBe(0n);
    }
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(6000n);
    await assertCacheMatchesLots(f);
  });

  it("TODO-175: return restore REISSUES non-expiring when original lot expired (value preserved)", async () => {
    const f = await seed();
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await spendAll(f, 30000n, 30, "cr2", orderId);
    // Original lot'un süresini geçmişe çek (satın alma sonrası promosyon lot süresi doldu senaryosu).
    await prisma.customerCreditLot.updateMany({ where: { storeId: f.storeId }, data: { expiresAt: new Date(Date.now() - dayMs) } });
    const r = await restoreAmount(f, orderId, "R2", 6000n);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.restoredMinor).toBe(0n);
      expect(r.reissuedMinor).toBe(6000n);
    }
    const reissued = await prisma.customerCreditLot.findFirstOrThrow({ where: { storeId: f.storeId, sourceType: "ORDER_RETURN", expiresAt: null } });
    expect(reissued.remainingAmountMinor).toBe(6000n);
    // Non-expiring reissue bakiyeye girer.
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(6000n);
  });

  it("TODO-175: return restore is idempotent per returnRequestId (no duplicate)", async () => {
    const f = await seed();
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await spendAll(f, 30000n, 60, "cr3", orderId);
    await restoreAmount(f, orderId, "R3", 6000n);
    const second = await restoreAmount(f, orderId, "R3", 6000n);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.deduped).toBe(true);
      expect(second.restoredMinor).toBe(6000n);
    }
    const entries = await prisma.customerCreditLedgerEntry.count({ where: { storeId: f.storeId, groupKey: "credit-return-restore:R3" } });
    expect(entries).toBe(1);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(6000n);
  });

  it("TODO-175: successive return restores respect per-order restorable cap", async () => {
    const f = await seed();
    const orderId = `ord-${randomUUID().slice(0, 8)}`;
    await spendAll(f, 30000n, 60, "cr4", orderId);
    const r1 = await restoreAmount(f, orderId, "R4a", 20000n);
    expect(r1.ok).toBe(true);
    // Kalan restorable 10000; 20000 talebi reddedilir.
    const r2 = await restoreAmount(f, orderId, "R4b", 20000n);
    expect(r2).toEqual({ ok: false, code: "EXCEEDS_RESTORABLE" });
    // Kalan tam 10000 restore edilebilir.
    const r3 = await restoreAmount(f, orderId, "R4c", 10000n);
    expect(r3.ok).toBe(true);
    expect(await getAvailableBalanceMinor(prisma, f.storeId, f.customerId, "TRY")).toBe(30000n);
  });
});

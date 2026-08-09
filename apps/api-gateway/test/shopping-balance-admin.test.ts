/**
 * Shopping Balance Admin — projeksiyon GERÇEK-DB entegrasyon testleri.
 *
 * CALISTIRMA: DATABASE_URL verilmezse SKIP (CI-safe). store.delete cascade cleanup.
 * Finansal invariant: available = Σ canlı lot remaining (expired hariç); lifetime bucket'lar
 * append-only ledger'dan tip bazında; storeId-first izolasyon (cross-store sızıntı yok).
 */
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "@commerce-os/db";
import type { CreditLedgerType, CreditSourceType, CreditLotStatus } from "@prisma/client";
import {
  listCustomerBalances,
  shoppingBalanceSummary,
  getCustomerBalanceDetail,
} from "../src/customer-credit/admin-projection.js";
import { registerShoppingBalanceAdminRoutes } from "../src/customer-credit/admin-routes.js";

const hasTestDb = Boolean(process.env.DATABASE_URL);
const dayMs = 24 * 60 * 60 * 1000;
const created: string[] = [];

interface Store {
  storeId: string;
}

async function makeStore(): Promise<Store> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `sba-store-${sfx}`;
  await prisma.store.create({ data: { id: storeId, name: `SBA ${sfx}`, slug: `sba-${sfx}` } });
  created.push(storeId);
  return { storeId };
}

async function makeCustomer(storeId: string, over?: { firstName?: string; lastName?: string; email?: string }) {
  const sfx = randomUUID().slice(0, 12);
  const customerId = `sba-cust-${sfx}`;
  await prisma.customer.create({
    data: {
      id: customerId,
      storeId,
      email: over?.email ?? `sba-${sfx}@example.test`,
      firstName: over?.firstName ?? "Sba",
      lastName: over?.lastName ?? "Test",
    },
  });
  return customerId;
}

async function ensureAccount(storeId: string, customerId: string, currency = "TRY"): Promise<string> {
  const acc = await prisma.customerCreditAccount.upsert({
    where: { storeId_customerId_currency: { storeId, customerId, currency } },
    create: { storeId, customerId, currency },
    update: {},
    select: { id: true },
  });
  return acc.id;
}

async function addLot(
  storeId: string,
  customerId: string,
  accountId: string,
  o: { original: bigint; remaining: bigint; expiresAt: Date | null; status?: CreditLotStatus; sourceType: CreditSourceType },
): Promise<void> {
  await prisma.customerCreditLot.create({
    data: {
      storeId,
      customerId,
      accountId,
      currency: "TRY",
      originalAmountMinor: o.original,
      remainingAmountMinor: o.remaining,
      expiresAt: o.expiresAt,
      status: o.status ?? "ACTIVE",
      sourceType: o.sourceType,
    },
  });
}

async function addLedger(
  storeId: string,
  customerId: string,
  accountId: string,
  o: { type: CreditLedgerType; direction: "CREDIT" | "DEBIT"; amount: bigint; sourceType: CreditSourceType },
): Promise<void> {
  await prisma.customerCreditLedgerEntry.create({
    data: {
      storeId,
      customerId,
      accountId,
      type: o.type,
      direction: o.direction,
      amountMinor: o.amount,
      balanceAfterMinor: 0n,
      currency: "TRY",
      sourceType: o.sourceType,
      description: "test",
      idempotencyKey: `sba-${randomUUID()}`,
    },
  });
}

/**
 * Zengin senaryo: cA1 (goodwill canlı + refund-origin non-expiring + expired goodwill + spent),
 * cA2 (küçük yakında-dolacak goodwill), cA3 (sıfır bakiye), Store B izolasyon müşterisi.
 */
async function seedScenario() {
  const A = await makeStore();
  const B = await makeStore();
  const now = new Date();

  const cA1 = await makeCustomer(A.storeId, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" });
  const cA2 = await makeCustomer(A.storeId, { firstName: "Bob", lastName: "Bee", email: "bob@example.test" });
  const cA3 = await makeCustomer(A.storeId, { firstName: "Zero", lastName: "Zed", email: "zero@example.test" });
  const cB1 = await makeCustomer(B.storeId, { email: "leak@example.test" });

  // cA1
  const a1 = await ensureAccount(A.storeId, cA1);
  await addLot(A.storeId, cA1, a1, { original: 50000n, remaining: 50000n, expiresAt: new Date(now.getTime() + 40 * dayMs), sourceType: "ADMIN_GOODWILL" });
  await addLot(A.storeId, cA1, a1, { original: 20000n, remaining: 20000n, expiresAt: null, sourceType: "ORDER_REFUND" });
  await addLot(A.storeId, cA1, a1, { original: 30000n, remaining: 30000n, expiresAt: new Date(now.getTime() - 1 * dayMs), sourceType: "ADMIN_GOODWILL" }); // expired → available'a girmez
  await addLedger(A.storeId, cA1, a1, { type: "ADMIN_GOODWILL_CREDIT", direction: "CREDIT", amount: 50000n, sourceType: "ADMIN_GOODWILL" });
  await addLedger(A.storeId, cA1, a1, { type: "REFUND_RESTORE", direction: "CREDIT", amount: 20000n, sourceType: "ORDER_REFUND" });
  await addLedger(A.storeId, cA1, a1, { type: "ADMIN_GOODWILL_CREDIT", direction: "CREDIT", amount: 30000n, sourceType: "ADMIN_GOODWILL" });
  await addLedger(A.storeId, cA1, a1, { type: "EXPIRE", direction: "DEBIT", amount: 30000n, sourceType: "EXPIRY" });
  await addLedger(A.storeId, cA1, a1, { type: "ORDER_PAYMENT_DEBIT", direction: "DEBIT", amount: 10000n, sourceType: "ORDER_PAYMENT" });

  // cA2 — yakında dolacak (10 gün)
  const a2 = await ensureAccount(A.storeId, cA2);
  await addLot(A.storeId, cA2, a2, { original: 5000n, remaining: 5000n, expiresAt: new Date(now.getTime() + 10 * dayMs), sourceType: "ADMIN_GOODWILL" });
  await addLedger(A.storeId, cA2, a2, { type: "ADMIN_GOODWILL_CREDIT", direction: "CREDIT", amount: 5000n, sourceType: "ADMIN_GOODWILL" });

  // cA3 — hesap var ama canlı bakiye 0 (tüketilmiş lot)
  const a3 = await ensureAccount(A.storeId, cA3);
  await addLot(A.storeId, cA3, a3, { original: 8000n, remaining: 0n, expiresAt: new Date(now.getTime() + 20 * dayMs), status: "CONSUMED", sourceType: "ADMIN_GOODWILL" });
  await addLedger(A.storeId, cA3, a3, { type: "ADMIN_GOODWILL_CREDIT", direction: "CREDIT", amount: 8000n, sourceType: "ADMIN_GOODWILL" });
  await addLedger(A.storeId, cA3, a3, { type: "ORDER_PAYMENT_DEBIT", direction: "DEBIT", amount: 8000n, sourceType: "ORDER_PAYMENT" });

  // Store B — izolasyon
  const b1 = await ensureAccount(B.storeId, cB1);
  await addLot(B.storeId, cB1, b1, { original: 99999n, remaining: 99999n, expiresAt: new Date(now.getTime() + 40 * dayMs), sourceType: "ADMIN_GOODWILL" });
  await addLedger(B.storeId, cB1, b1, { type: "ADMIN_GOODWILL_CREDIT", direction: "CREDIT", amount: 99999n, sourceType: "ADMIN_GOODWILL" });

  return { A, B, cA1, cA2, cA3, cB1, now };
}

describe.skipIf(!hasTestDb)("Shopping Balance Admin projections (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("liste: available = Σ canlı lot (expired hariç), bucket'lar doğru, cross-store izole", async () => {
    const s = await seedScenario();
    const res = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, sortBy: "available", sortOrder: "desc" });

    expect(res.total).toBe(3); // cA1, cA2, cA3 — Store B sızmaz
    expect(res.rows.map((r) => r.customerEmail)).not.toContain("leak@example.test");

    const a1 = res.rows.find((r) => r.customerId === s.cA1)!;
    expect(a1.availableMinor).toBe(70000n); // 50000 + 20000 (30000 expired hariç)
    expect(a1.customerName).toBe("Ada Lovelace");
    expect(a1.issuedMinor).toBe(100000n); // tüm CREDIT
    expect(a1.spentMinor).toBe(10000n);
    expect(a1.refundOriginMinor).toBe(20000n);
    expect(a1.goodwillMinor).toBe(80000n); // 50000 + 30000
    expect(a1.expiredMinor).toBe(30000n);
    expect(a1.restoredMinor).toBe(0n);
    expect(a1.nearestExpiryAt).not.toBeNull();
  });

  it("liste: sort available desc + balancePositiveOnly sıfır bakiyeyi düşürür", async () => {
    const s = await seedScenario();
    const all = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, sortBy: "available", sortOrder: "desc" });
    expect(all.rows[0]!.customerId).toBe(s.cA1); // 70000 en büyük

    const positive = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, balancePositiveOnly: true });
    expect(positive.total).toBe(2); // cA3 (0) düşer
    expect(positive.rows.map((r) => r.customerId)).not.toContain(s.cA3);
  });

  it("liste: search müşteri email/adına göre filtreler", async () => {
    const s = await seedScenario();
    const res = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, search: "bob@example" });
    expect(res.total).toBe(1);
    expect(res.rows[0]!.customerId).toBe(s.cA2);
  });

  it("liste: source=REFUND_ORIGIN yalnız refund-origin canlı bakiyesi olanları getirir", async () => {
    const s = await seedScenario();
    const res = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, source: "REFUND_ORIGIN" });
    expect(res.rows.map((r) => r.customerId)).toEqual([s.cA1]);
  });

  it("liste: expiringWithinDays=14 yalnız 14 gün içinde dolacakları getirir (non-expiring hariç)", async () => {
    const s = await seedScenario();
    const res = await listCustomerBalances({ storeId: s.A.storeId, limit: 50, offset: 0, expiringWithinDays: 14 });
    // cA2 (10 gün) girer; cA1'in canlı lot'ları 40 gün / non-expiring → 14g penceresine girmez
    expect(res.rows.map((r) => r.customerId)).toEqual([s.cA2]);
  });

  it("özet: outstanding/goodwill/refund-origin/expiring-soon KPI'ları doğru", async () => {
    const s = await seedScenario();
    const sum = await shoppingBalanceSummary({ storeId: s.A.storeId });
    expect(sum.outstandingLiabilityMinor).toBe(75000n); // 70000 + 5000
    expect(sum.customersWithBalance).toBe(2); // cA1, cA2 (cA3 sıfır)
    expect(sum.goodwillBalanceMinor).toBe(55000n); // cA1 50000 + cA2 5000 (expired 30000 hariç)
    expect(sum.refundOriginBalanceMinor).toBe(20000n);
    expect(sum.expiringSoonMinor).toBe(5000n); // sadece cA2 (10 gün ≤ 30)
  });

  it("özet: expiringWithinDays=60 cA1 (40 gün) lot'unu da kapsar", async () => {
    const s = await seedScenario();
    const sum = await shoppingBalanceSummary({ storeId: s.A.storeId, expiringWithinDays: 60 });
    expect(sum.expiringSoonMinor).toBe(55000n); // cA1 50000 (40g) + cA2 5000 (10g); non-expiring 20000 hariç
  });

  it("detay: summary liste satırıyla tutarlı, lotlar listelenir, ledger yeniden-eskiye", async () => {
    const s = await seedScenario();
    const detail = await getCustomerBalanceDetail({ storeId: s.A.storeId, customerId: s.cA1 });
    expect(detail).not.toBeNull();
    expect(detail!.summary.availableMinor).toBe(70000n);
    expect(detail!.summary.goodwillMinor).toBe(80000n);
    expect(detail!.summary.refundOriginMinor).toBe(20000n);
    expect(detail!.lots).toHaveLength(3);
    // ledger createdAt DESC
    const times = detail!.ledger.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("detay: bilinmeyen müşteri ve cross-store müşteri null döner", async () => {
    const s = await seedScenario();
    expect(await getCustomerBalanceDetail({ storeId: s.A.storeId, customerId: "yok-123" })).toBeNull();
    // Store B müşterisi Store A scope'unda null
    expect(await getCustomerBalanceDetail({ storeId: s.A.storeId, customerId: s.cB1 })).toBeNull();
  });
});

// --- Route-level (Fastify inject; guard stub) -------------------------------

function buildApp(access: { actorUserId: string; isSuperAdmin: boolean } | null): FastifyInstance {
  const app = Fastify();
  registerShoppingBalanceAdminRoutes(app, {
    requireStoreAdmin: async (_req, reply) => {
      if (!access) {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "yetki yok" } });
        return null;
      }
      return access;
    },
  });
  return app;
}

const admin = { actorUserId: "admin-1", isSuperAdmin: false };

describe.skipIf(!hasTestDb)("Shopping Balance Admin routes (integration)", () => {
  afterEach(async () => {
    for (const storeId of created.splice(0)) {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    }
  });

  it("GET liste: data + summary + pagination; para STRING", async () => {
    const s = await seedScenario();
    const app = buildApp(admin);
    const res = await app.inject({ method: "GET", url: `/stores/${s.A.storeId}/shopping-balance` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.totalItems).toBe(3);
    expect(body.summary.outstandingLiabilityMinor).toBe("75000");
    expect(body.summary.expiringSoonMinor).toBe("5000");
    const a1 = body.data.find((r: { customerId: string }) => r.customerId === s.cA1);
    expect(typeof a1.availableMinor).toBe("string");
    expect(a1.availableMinor).toBe("70000");
    await app.close();
  });

  it("GET liste: guard reddederse 403", async () => {
    const s = await seedScenario();
    const app = buildApp(null);
    const res = await app.inject({ method: "GET", url: `/stores/${s.A.storeId}/shopping-balance` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("GET detay: lot + ledger döner", async () => {
    const s = await seedScenario();
    const app = buildApp(admin);
    const res = await app.inject({ method: "GET", url: `/stores/${s.A.storeId}/shopping-balance/${s.cA1}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.availableMinor).toBe("70000");
    expect(body.lots).toHaveLength(3);
    expect(body.ledger).toHaveLength(5);
    await app.close();
  });

  it("GET detay: bilinmeyen müşteri 404; cross-store müşteri 404 (leak-free)", async () => {
    const s = await seedScenario();
    const app = buildApp(admin);
    const r1 = await app.inject({ method: "GET", url: `/stores/${s.A.storeId}/shopping-balance/yok-123` });
    expect(r1.statusCode).toBe(404);
    const r2 = await app.inject({ method: "GET", url: `/stores/${s.A.storeId}/shopping-balance/${s.cB1}` });
    expect(r2.statusCode).toBe(404);
    await app.close();
  });
});

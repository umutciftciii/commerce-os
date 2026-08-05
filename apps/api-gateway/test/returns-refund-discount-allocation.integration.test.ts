/**
 * TD-FR-7 (per-line discount refund accuracy) — GERÇEK-DB wiring testi.
 *
 * Saf refund-calc testleri (returns-refund-calc) mantığı kanıtlar ama WIRING'i kanıtlamaz:
 * OrderLine.discountAllocatedMinor snapshot'ının DB'de saklandığını + approve akışının
 * (upsertRefundIntentForReturn) bu kolonu okuyup RefundIntent.totalRefundMinor'ı DOĞRU
 * hesapladığını burada uçtan uca doğrularız.
 *
 * Senaryo = OS-000004 / R000001: "Seçili Ürünlerde %20" YALNIZ pahalı kaleme (Karaca)
 * uygulandı; ikinci kaleme (Casper) indirim YOK → müşteri ona TAM fiyat ödedi. Yalnız
 * Casper iade edilince iade TAM fiyat olmalı — oransal dağıtım (legacy) haksız pay
 * yükleyip EKSİK-iade hesaplardı.
 *
 * DATABASE_URL verilmezse SKIP (CI-safe).
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import { createReturnRequest } from "../src/returns/service.js";
import {
  adminReturnAction,
  buildReturnAdminApp,
  hasTestDb,
  loadReturnState,
} from "./helpers/returns-db.js";

interface TwoLineSeed {
  storeId: string;
  customerId: string;
  orderNumber: string;
  karacaLineId: string;
  casperLineId: string;
  cleanup: () => Promise<void>;
}

// Karaca (indirimli) ve Casper (indirimsiz) kalemleri; opsiyonel snapshot.
async function seedScopedDiscountOrder(withSnapshot: boolean): Promise<TwoLineSeed> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `test-store-${sfx}`;
  const customerId = `test-cust-${sfx}`;
  const orderId = `test-order-${sfx}`;
  const orderNumber = `TEST-${sfx.toUpperCase()}`;
  const currency = "TRY";
  const deliveredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Karaca: brüt 1.980.120; %20 indirim (396.024) YALNIZ bu kaleme düştü.
  const karacaGross = 1980120;
  const karacaDiscount = 396024;
  // Casper: brüt 631.350; indirim YOK → tam fiyat ödendi.
  const casperGross = 631350;
  const orderDiscount = karacaDiscount;

  await prisma.store.create({ data: { id: storeId, name: `Test ${sfx}`, slug: `test-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c-${sfx}@example.test`, firstName: "Test", lastName: "Customer" },
  });
  const providerConfig = await prisma.shippingProviderConfig.create({
    data: { id: `test-cfg-${sfx}`, storeId, provider: "MOCK", displayName: "Test Mock" },
  });

  const lineIds: Record<string, string> = {};
  async function makeLine(kind: "karaca" | "casper", gross: number, discountAllocatedMinor: number | null) {
    const productId = `test-prod-${kind}-${sfx}`;
    const variantId = `test-var-${kind}-${sfx}`;
    const lineId = `test-line-${kind}-${sfx}`;
    lineIds[kind] = lineId;
    await prisma.product.create({ data: { id: productId, storeId, title: `${kind} ${sfx}`, slug: `${kind}-${sfx}` } });
    await prisma.productVariant.create({
      data: { id: variantId, productId, storeId, title: "Default", sku: `SKU-${kind}-${sfx}`, priceMinor: gross, currency },
    });
    await prisma.orderLine.create({
      data: {
        id: lineId,
        storeId,
        orderId,
        productId,
        variantId,
        sku: `SKU-${kind}-${sfx}`,
        title: `${kind} ${sfx}`,
        variantTitle: "Default",
        quantity: 1,
        unitPriceAmount: gross,
        totalAmount: gross,
        currency,
        lineGrossAmountMinor: gross,
        discountAllocatedMinor,
      },
    });
  }

  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber,
      customerEmail: `c-${sfx}@example.test`,
      currency,
      subtotalAmount: karacaGross + casperGross,
      discountAmount: orderDiscount,
      totalAmount: karacaGross + casperGross - orderDiscount,
    },
  });
  await makeLine("karaca", karacaGross, withSnapshot ? karacaDiscount : null);
  await makeLine("casper", casperGross, withSnapshot ? 0 : null);

  await prisma.shipment.create({
    data: {
      id: `test-ship-${sfx}`,
      storeId,
      orderId,
      providerConfigId: providerConfig.id,
      provider: "MOCK",
      referenceId: `REF-${sfx}`,
      status: "DELIVERED",
      deliveredAt,
    },
  });
  await prisma.paymentAttempt.create({
    data: {
      id: `test-pay-${sfx}`,
      storeId,
      orderId,
      method: "CARD",
      amount: karacaGross + casperGross - orderDiscount,
      currency,
      status: "PAID",
    },
  });

  return {
    storeId,
    customerId,
    orderNumber,
    karacaLineId: lineIds.karaca,
    casperLineId: lineIds.casper,
    cleanup: async () => {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    },
  };
}

describe.skipIf(!hasTestDb)("TD-FR-7 refund uses per-line discount snapshot (live DB)", () => {
  let seed: TwoLineSeed | null = null;
  afterEach(async () => {
    if (seed) await seed.cleanup();
    seed = null;
  });

  async function approveCasperRefund(s: TwoLineSeed) {
    const res = await createReturnRequest(
      {
        storeId: s.storeId,
        customerId: s.customerId,
        orderNumber: s.orderNumber,
        resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
        items: [{ orderLineId: s.casperLineId, quantity: 1, reason: "NO_LONGER_NEEDED" }],
      },
      new Date(),
    );
    if (!res.ok) throw new Error(`createReturnRequest failed: ${res.code}`);
    const app = buildReturnAdminApp();
    const approve = await adminReturnAction(app, s.storeId, res.returnRequestId, "approve", {});
    expect(approve.statusCode).toBe(200);
    const state = await loadReturnState(s.storeId, res.returnRequestId);
    await app.close();
    return state;
  }

  it("snapshot present: undiscounted line (Casper) refunds FULL price, not proportional", async () => {
    seed = await seedScopedDiscountOrder(true);
    const state = await approveCasperRefund(seed);
    expect(state?.refundIntent?.status).toBe("PENDING");
    // Casper'a indirim düşmedi → TAM fiyat. Oransal (legacy) 535.611 hesaplardı.
    expect(state?.refundIntent?.totalRefundMinor).toBe(631350);
    expect(state?.refundIntent?.totalRefundMinor).not.toBe(535607);
  });

  it("legacy (no snapshot): falls back to proportional allocation (backward-compat)", async () => {
    seed = await seedScopedDiscountOrder(false);
    const state = await approveCasperRefund(seed);
    // Snapshot yok → gross-ağırlıklı oransal: Casper base = 631350 - floor(396024*631350/2611470)=631350-95739.
    expect(state?.refundIntent?.totalRefundMinor).toBe(535607);
  });
});

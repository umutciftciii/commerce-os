/**
 * TODO-173 (ADR-274) — Reverse Shipment GERÇEK-DB entegrasyon testleri.
 *
 * DATABASE_URL yoksa SKIP (CI-safe). Kapsam: disposition cap invariant · reverse shipment quantity cap ·
 * duplicate guard · cancelled disposition/shipment quantity serbest bırakma · delivered immutable ·
 * cross-store 404 · stale version 409 · CONCURRENT create (advisory lock) · normal fulfillment/finance/
 * inventory izolasyonu (order badge/paymentStatus/OrderRefund/inventory değişmez).
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@commerce-os/db";
import {
  hasTestDb,
  buildReturnAdminApp,
  seedTwoLineDeliveredOrder,
  createTwoLineRefundReturn,
  returnItemIdByLine,
  currentReturnVersion,
  type SeededTwoLineOrder,
} from "./helpers/returns-db.js";

const d = describe.skipIf(!hasTestDb);

async function post(app: ReturnType<typeof buildReturnAdminApp>, url: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url, payload });
}

// Bir kalemin bir kısmını reddederek rejectedQuantity üretir (partial approve → auto AWAITING_SHIPMENT).
async function seedPartiallyRejected(): Promise<{
  order: SeededTwoLineOrder;
  returnId: string;
  itemAId: string;
  app: ReturnType<typeof buildReturnAdminApp>;
}> {
  const order = await seedTwoLineDeliveredOrder({ quantityA: 2, quantityB: 1 });
  // Reverse shipment alıcısı = OrderAddress(type=SHIPPING) snapshot'ı (seed helper eklemiyor).
  await prisma.orderAddress.create({
    data: {
      storeId: order.storeId,
      orderId: order.orderId,
      type: "SHIPPING",
      fullName: "Test Customer",
      phone: "+905550000000",
      countryCode: "TR",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Test Mah. No:1",
      postalCode: "34000",
    },
  });
  const returnId = await createTwoLineRefundReturn(order);
  const itemAId = await returnItemIdByLine(order.storeId, returnId, order.lineAId);
  const itemBId = await returnItemIdByLine(order.storeId, returnId, order.lineBId);
  const app = buildReturnAdminApp();
  // A: 2'den 1 onay → rejectedQuantity=1; B: tam onay.
  const version = await currentReturnVersion(order.storeId, returnId);
  const res = await post(app, `/stores/${order.storeId}/returns/${returnId}/approve`, {
    items: [
      { returnItemId: itemAId, approvedQuantity: 1 },
      { returnItemId: itemBId, approvedQuantity: 1 },
    ],
    expectedVersion: version,
  });
  expect(res.statusCode).toBe(200);
  const item = await prisma.returnItem.findFirstOrThrow({ where: { id: itemAId } });
  expect(item.rejectedQuantity).toBe(1);
  return { order, returnId, itemAId, app };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

d("Reverse shipment — disposition + invariant", () => {
  it("disposition cap: Σ > rejectedQuantity → 409", async () => {
    const { order, returnId, itemAId, app } = await seedPartiallyRejected();
    cleanups.push(order.cleanup);
    let v = await currentReturnVersion(order.storeId, returnId);
    const ok = await post(app, `/stores/${order.storeId}/returns/${returnId}/dispositions`, {
      returnItemId: itemAId,
      type: "RETURN_TO_CUSTOMER",
      quantity: 1,
      expectedVersion: v,
    });
    expect(ok.statusCode).toBe(200);
    v = await currentReturnVersion(order.storeId, returnId);
    const over = await post(app, `/stores/${order.storeId}/returns/${returnId}/dispositions`, {
      returnItemId: itemAId,
      type: "DESTROY",
      quantity: 1,
      expectedVersion: v,
    });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe("DISPOSITION_QUANTITY_EXCEEDED");
  });

  it("cancelled disposition quantity'yi serbest bırakır (yeniden dispose edilebilir)", async () => {
    const { order, returnId, itemAId, app } = await seedPartiallyRejected();
    cleanups.push(order.cleanup);
    let v = await currentReturnVersion(order.storeId, returnId);
    const created = await post(app, `/stores/${order.storeId}/returns/${returnId}/dispositions`, {
      returnItemId: itemAId,
      type: "RETURN_TO_CUSTOMER",
      quantity: 1,
      expectedVersion: v,
    });
    expect(created.statusCode).toBe(200);
    const disp = await prisma.returnItemDisposition.findFirstOrThrow({ where: { returnItemId: itemAId } });
    v = await currentReturnVersion(order.storeId, returnId);
    const cancelled = await post(
      app,
      `/stores/${order.storeId}/returns/${returnId}/dispositions/${disp.id}/cancel`,
      { expectedVersion: v },
    );
    expect(cancelled.statusCode).toBe(200);
    // Şimdi tekrar 1 dispose edilebilir (cap serbest).
    v = await currentReturnVersion(order.storeId, returnId);
    const again = await post(app, `/stores/${order.storeId}/returns/${returnId}/dispositions`, {
      returnItemId: itemAId,
      type: "DESTROY",
      quantity: 1,
      expectedVersion: v,
    });
    expect(again.statusCode).toBe(200);
  });
});

d("Reverse shipment — create + lifecycle + isolation", () => {
  async function setupWithDisposition() {
    const s = await seedPartiallyRejected();
    cleanups.push(s.order.cleanup);
    const v = await currentReturnVersion(s.order.storeId, s.returnId);
    const disp = await post(s.app, `/stores/${s.order.storeId}/returns/${s.returnId}/dispositions`, {
      returnItemId: s.itemAId,
      type: "RETURN_TO_CUSTOMER",
      quantity: 1,
      expectedVersion: v,
    });
    expect(disp.statusCode).toBe(200);
    return s;
  }

  it("REVERSE_NO_DISPOSITION: RETURN_TO_CUSTOMER disposition olmadan reddedilir", async () => {
    const { order, returnId, itemAId, app } = await seedPartiallyRejected();
    cleanups.push(order.cleanup);
    const v = await currentReturnVersion(order.storeId, returnId);
    const res = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "Reddedilen ürün müşteriye geri gönderilecek",
      expectedVersion: v,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("REVERSE_NO_DISPOSITION");
  });

  it("happy path: reverse shipment oluşur (STORE_RETURN_TO_CUSTOMER, provider REUSE, address snapshot)", async () => {
    const { order, returnId, itemAId, app } = await setupWithDisposition();
    const v = await currentReturnVersion(order.storeId, returnId);
    const res = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      carrierName: "Yurtiçi Kargo",
      trackingNumber: "TRK-123",
      reason: "Reddedilen ürün müşteriye geri gönderiliyor",
      expectedVersion: v,
    });
    expect(res.statusCode).toBe(200);
    const ship = await prisma.shipment.findFirstOrThrow({
      where: { returnItemId: itemAId, direction: "STORE_RETURN_TO_CUSTOMER" },
    });
    expect(ship.status).toBe("DRAFT");
    expect(ship.returnQuantity).toBe(1);
    expect(ship.carrierName).toBe("Yurtiçi Kargo");
    expect(ship.provider).toBe("MOCK"); // outbound config REUSE
    expect(ship.providerConfigId).toBeTruthy();
    expect(ship.sourceShipmentId).toBeTruthy();
    expect(ship.recipientName).toBeTruthy(); // address snapshot
  });

  it("duplicate/quantity cap: kalan gönderilebilir aşılırsa 409", async () => {
    const { order, returnId, itemAId, app } = await setupWithDisposition();
    let v = await currentReturnVersion(order.storeId, returnId);
    const first = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "ilk gönderi",
      expectedVersion: v,
    });
    expect(first.statusCode).toBe(200);
    v = await currentReturnVersion(order.storeId, returnId);
    const second = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "ikinci gönderi (cap aşımı)",
      expectedVersion: v,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("REVERSE_QUANTITY_EXCEEDED");
  });

  it("lifecycle + izolasyon: DELIVERED disposition'ı COMPLETED yapar; order/finance/inventory değişmez", async () => {
    const { order, returnId, itemAId, app } = await setupWithDisposition();
    const v = await currentReturnVersion(order.storeId, returnId);
    const created = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "geri gönderim",
      expectedVersion: v,
    });
    expect(created.statusCode).toBe(200);
    const ship = await prisma.shipment.findFirstOrThrow({
      where: { returnItemId: itemAId, direction: "STORE_RETURN_TO_CUSTOMER" },
    });
    const orderBefore = await prisma.order.findFirstOrThrow({ where: { id: order.orderId } });
    const url = `/stores/${order.storeId}/returns/${returnId}/reverse-shipments/${ship.id}/status`;
    expect((await post(app, url, { status: "IN_TRANSIT" })).statusCode).toBe(200);
    expect((await post(app, url, { status: "DELIVERED" })).statusCode).toBe(200);

    const shipAfter = await prisma.shipment.findFirstOrThrow({ where: { id: ship.id } });
    expect(shipAfter.status).toBe("DELIVERED");
    expect(shipAfter.deliveredAt).not.toBeNull();
    const disp = await prisma.returnItemDisposition.findFirstOrThrow({ where: { returnItemId: itemAId } });
    expect(disp.status).toBe("COMPLETED"); // immutable

    // İzolasyon: order fulfillment/payment/badge değişmez, OrderRefund yok, inventory hareketi yok.
    const orderAfter = await prisma.order.findFirstOrThrow({ where: { id: order.orderId } });
    expect(orderAfter.fulfillmentStatus).toBe(orderBefore.fulfillmentStatus);
    expect(orderAfter.status).toBe(orderBefore.status);
    expect(orderAfter.paymentStatus).toBe(orderBefore.paymentStatus);
    const refunds = await prisma.orderRefund.count({ where: { orderId: order.orderId } });
    expect(refunds).toBe(0);
    const movements = await prisma.inventoryMovement.count({ where: { storeId: order.storeId } });
    expect(movements).toBe(0);
    // Outbound shipment (teslim ankoru) hâlâ tek DELIVERED outbound → iade penceresi kaymaz.
    const outboundDelivered = await prisma.shipment.count({
      where: { orderId: order.orderId, direction: "OUTBOUND_TO_CUSTOMER", status: "DELIVERED" },
    });
    expect(outboundDelivered).toBe(1);
  });

  it("cross-store: yabancı storeId ile reverse create 404", async () => {
    const { returnId, itemAId } = await setupWithDisposition();
    const foreign = buildReturnAdminApp();
    const res = await post(foreign, `/stores/foreign-store/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "cross-store",
      expectedVersion: 999,
    });
    // returnItem foreign-store'da bulunmaz → RETURN_ITEM_NOT_FOUND (404).
    expect(res.statusCode).toBe(404);
    // Sızıntı yok: order'ın gerçek storeId'sinde yeni shipment oluşmadı.
    const leaked = await prisma.shipment.count({
      where: { returnItemId: itemAId, direction: "STORE_RETURN_TO_CUSTOMER" },
    });
    expect(leaked).toBe(0);
  });

  it("stale version → 409", async () => {
    const { order, returnId, itemAId, app } = await setupWithDisposition();
    const res = await post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
      returnItemId: itemAId,
      quantity: 1,
      reason: "stale",
      expectedVersion: 0, // bayat (approve+disposition version'u artırdı)
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("VERSION_CONFLICT");
  });

  it("CONCURRENT create: aynı kalan-1 kapasite için iki paralel istek → yalnız biri başarılı", async () => {
    const { order, returnId, itemAId, app } = await setupWithDisposition();
    const v = await currentReturnVersion(order.storeId, returnId);
    // İkisi de AYNI version'ı okur; advisory lock + invariant yalnız birini geçirir.
    const [a, b] = await Promise.all([
      post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
        returnItemId: itemAId,
        quantity: 1,
        reason: "yarış A",
        expectedVersion: v,
      }),
      post(app, `/stores/${order.storeId}/returns/${returnId}/reverse-shipments`, {
        returnItemId: itemAId,
        quantity: 1,
        reason: "yarış B",
        expectedVersion: v,
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const shipments = await prisma.shipment.count({
      where: { returnItemId: itemAId, direction: "STORE_RETURN_TO_CUSTOMER", status: { notIn: ["CANCELLED", "FAILED"] } },
    });
    expect(shipments).toBe(1);
  });
});

/**
 * TODO-174 (ADR-275/276/277/278) — Customer Self-Service Order Cancellation · GERÇEK-DB entegrasyon.
 *
 * cancelCustomerOrder'ı gerçek prisma'ya karşı çağırır (DI yok; global prisma). DATABASE_URL yoksa SKIP
 * (CI-safe). Her test kendi store'unu seed'ler + store.delete cascade ile temizler (enterprise-demo'ya
 * DOKUNMAZ). MOCK refund provider default → SUCCEEDED; scenario "refund_fail" → FAILED.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import type { ShipmentStatus } from "@prisma/client";
import { createRefundProviderPort } from "../src/refunds/mock-refund.js";
import { cancelCustomerOrder } from "../src/orders/cancellation/service.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const deps = { providerPort: createRefundProviderPort() };

interface SeedOpts {
  paid?: boolean;
  paymentScenario?: string | null;
  shipmentStatus?: ShipmentStatus | null;
  reverseShipmentStatus?: ShipmentStatus | null;
  unit?: number;
  quantity?: number;
  shippingAmount?: number;
  taxAmount?: number;
  reserve?: boolean;
  withCoupon?: { campaignActive: boolean; campaignEndsAt?: Date | null } | null;
}

interface Seeded {
  storeId: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
  orderLineId: string;
  variantId: string;
  campaignId?: string;
  couponId?: string;
  customerCouponId?: string;
  redemptionId?: string;
  cleanup: () => Promise<void>;
}

async function seed(opts: SeedOpts = {}): Promise<Seeded> {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `tcxl-store-${sfx}`;
  const customerId = `tcxl-cust-${sfx}`;
  const orderId = `tcxl-order-${sfx}`;
  const orderNumber = `TCXL-${sfx.toUpperCase()}`;
  const productId = `tcxl-prod-${sfx}`;
  const variantId = `tcxl-var-${sfx}`;
  const currency = "TRY";
  const unit = opts.unit ?? 10000;
  const quantity = opts.quantity ?? 1;
  const shippingAmount = opts.shippingAmount ?? 0;
  const taxAmount = opts.taxAmount ?? 0;
  const orderLineId = `tcxl-line-${sfx}`;
  const subtotal = unit * quantity;
  const total = subtotal + shippingAmount;

  await prisma.store.create({ data: { id: storeId, name: `T ${sfx}`, slug: `tcxl-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c-${sfx}@x.test`, firstName: "T", lastName: "C" },
  });
  await prisma.product.create({ data: { id: productId, storeId, title: `P ${sfx}`, slug: `p-${sfx}` } });
  await prisma.productVariant.create({
    data: { id: variantId, productId, storeId, title: "Default", sku: `SKU-${sfx}`, priceMinor: unit, currency },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber,
      customerEmail: `c-${sfx}@x.test`,
      currency,
      status: "PLACED",
      paymentStatus: opts.paid ? "PAID" : "UNPAID",
      subtotalAmount: subtotal,
      shippingAmount,
      taxAmount,
      totalAmount: total,
      placedAt: new Date(),
    },
  });
  await prisma.orderLine.create({
    data: {
      id: orderLineId,
      storeId,
      orderId,
      productId,
      variantId,
      sku: `SKU-${sfx}`,
      title: `P ${sfx}`,
      variantTitle: "Default",
      quantity,
      unitPriceAmount: unit,
      totalAmount: subtotal,
      currency,
    },
  });

  if (opts.reserve) {
    await prisma.inventoryItem.create({
      data: { storeId, variantId, quantityOnHand: 100, quantityReserved: quantity },
    });
    await prisma.inventoryReservation.create({
      data: {
        storeId,
        orderId,
        orderLineId,
        variantId,
        quantity,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  }

  let cfgId: string | undefined;
  if (opts.shipmentStatus || opts.reverseShipmentStatus) {
    const cfg = await prisma.shippingProviderConfig.create({
      data: { id: `tcxl-cfg-${sfx}`, storeId, provider: "MOCK", displayName: "Mock" },
    });
    cfgId = cfg.id;
  }
  if (opts.shipmentStatus) {
    await prisma.shipment.create({
      data: {
        id: `tcxl-ship-${sfx}`,
        storeId,
        orderId,
        providerConfigId: cfgId!,
        provider: "MOCK",
        direction: "OUTBOUND_TO_CUSTOMER",
        referenceId: `REF-${sfx}`,
        status: opts.shipmentStatus,
        ...(opts.shipmentStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });
  }
  if (opts.reverseShipmentStatus) {
    await prisma.shipment.create({
      data: {
        id: `tcxl-rship-${sfx}`,
        storeId,
        orderId,
        providerConfigId: cfgId!,
        provider: "MOCK",
        direction: "CUSTOMER_RETURN_TO_STORE",
        referenceId: `RREF-${sfx}`,
        status: opts.reverseShipmentStatus,
      },
    });
  }

  if (opts.paid) {
    await prisma.paymentAttempt.create({
      data: {
        id: `tcxl-pay-${sfx}`,
        storeId,
        orderId,
        type: "ONLINE",
        provider: "MOCK",
        method: "CARD",
        amount: total,
        currency,
        status: "PAID",
        scenario: opts.paymentScenario ?? null,
      },
    });
  }

  let campaignId: string | undefined;
  let couponId: string | undefined;
  let customerCouponId: string | undefined;
  let redemptionId: string | undefined;
  if (opts.withCoupon) {
    const campaign = await prisma.campaign.create({
      data: {
        id: `tcxl-camp-${sfx}`,
        storeId,
        name: `Camp ${sfx}`,
        status: opts.withCoupon.campaignActive ? "ACTIVE" : "PAUSED",
        type: "COUPON_CODE",
        discountType: "PERCENT",
        discountValue: 10,
        usageCount: 1,
        endsAt: opts.withCoupon.campaignEndsAt ?? null,
      },
    });
    campaignId = campaign.id;
    const coupon = await prisma.coupon.create({
      data: {
        id: `tcxl-coup-${sfx}`,
        storeId,
        campaignId: campaign.id,
        code: `CODE-${sfx}`,
        normalizedCode: `CODE-${sfx}`.toUpperCase(),
        status: "ACTIVE",
        usageCount: 1,
      },
    });
    couponId = coupon.id;
    const redemption = await prisma.campaignRedemption.create({
      data: { storeId, campaignId: campaign.id, couponId: coupon.id, orderId, customerId, discountAmountMinor: 500 },
    });
    redemptionId = redemption.id;
    const cc = await prisma.customerCoupon.create({
      data: {
        storeId,
        couponId: coupon.id,
        campaignId: campaign.id,
        customerId,
        source: "CODE_CLAIMED",
        status: "USED",
        usedAt: new Date(),
        orderId,
      },
    });
    customerCouponId = cc.id;
  }

  return {
    storeId,
    customerId,
    orderId,
    orderNumber,
    orderLineId,
    variantId,
    campaignId,
    couponId,
    customerCouponId,
    redemptionId,
    cleanup: async () => {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    },
  };
}

describe.skipIf(!hasDb)("cancelCustomerOrder (ADR-275/276/277/278) — real DB", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  const track = (s: Seeded) => {
    cleanups.push(s.cleanup);
    return s;
  };

  it("unpaid + no shipment → CANCELLED, no refund", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.refund.status).toBe("SKIPPED_NO_CAPTURE");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelSource).toBe("CUSTOMER");
    expect(order.cancelReasonCode).toBe("CHANGED_MIND");
    expect(order.cancelReasonCategory).toBe("PRODUCT_DECISION");
    const refunds = await prisma.orderRefund.count({ where: { orderId: s.orderId } });
    expect(refunds).toBe(0);
  });

  it("paid + no shipment → CANCELLED + automatic refund SUCCEEDED + paymentStatus REFUNDED", async () => {
    const s = track(await seed({ paid: true, unit: 10000 }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "NO_LONGER_NEEDED" },
      deps,
    );
    expect(res.ok).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("CANCELLED");
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.status).toBe("SUCCEEDED");
    expect(refund.totalRefundMinor).toBe(10000);
    expect(refund.returnRequestId).toBeNull();
    expect(refund.refundIntentId).toBeNull();
    expect(order.paymentStatus).toBe("REFUNDED");
  });

  it("shipping fee is included in refundable balance", async () => {
    const s = track(await seed({ paid: true, unit: 10000, shippingAmount: 2500, taxAmount: 1800 }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "SHIPPING_FEE_TOO_HIGH" },
      deps,
    );
    expect(res.ok).toBe(true);
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.totalRefundMinor).toBe(12500);
    expect(refund.shippingRefundMinor).toBe(2500);
    expect(refund.productRefundMinor).toBe(10000);
    expect(refund.taxRefundMinor).toBe(1800);
  });

  it("paid + DRAFT outbound shipment → shipment CANCELLED + refund", async () => {
    const s = track(await seed({ paid: true, shipmentStatus: "DRAFT" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "WRONG_PRODUCT" },
      deps,
    );
    expect(res.ok).toBe(true);
    const ship = await prisma.shipment.findFirstOrThrow({ where: { orderId: s.orderId, direction: "OUTBOUND_TO_CUSTOMER" } });
    expect(ship.status).toBe("CANCELLED");
    const evt = await prisma.shipmentEvent.count({ where: { shipmentId: ship.id, eventType: "CANCELLED" } });
    expect(evt).toBeGreaterThan(0);
  });

  it("packing (LABEL_CREATED, no handoff) → ALLOWED, shipment cancelled", async () => {
    const s = track(await seed({ paid: true, shipmentStatus: "LABEL_CREATED" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "DUPLICATE_ORDER" },
      deps,
    );
    expect(res.ok).toBe(true);
    const ship = await prisma.shipment.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(ship.status).toBe("CANCELLED");
  });

  it("IN_TRANSIT outbound → BLOCKED_IN_TRANSIT (order untouched)", async () => {
    const s = track(await seed({ paid: true, shipmentStatus: "IN_TRANSIT" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BLOCKED_IN_TRANSIT");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("PLACED");
  });

  it("DELIVERED outbound → BLOCKED_DELIVERED", async () => {
    const s = track(await seed({ paid: true, shipmentStatus: "DELIVERED" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BLOCKED_DELIVERED");
  });

  it("reverse shipment IN_TRANSIT does NOT block cancellation", async () => {
    const s = track(await seed({ paid: true, reverseShipmentStatus: "IN_TRANSIT" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(true);
  });

  it("reservation release: reservation RELEASED + quantityReserved decremented + SALE_RELEASE movement", async () => {
    const s = track(await seed({ paid: false, reserve: true, quantity: 2 }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "ACCIDENTAL_ORDER" },
      deps,
    );
    expect(res.ok).toBe(true);
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(reservation.status).toBe("RELEASED");
    expect(reservation.releaseReason).toBe("ORDER_CANCELLED");
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { storeId: s.storeId, variantId: s.variantId } });
    expect(item.quantityReserved).toBe(0);
    const movements = await prisma.inventoryMovement.count({
      where: { storeId: s.storeId, variantId: s.variantId, type: "SALE_RELEASE" },
    });
    expect(movements).toBe(1);
  });

  it("expired reservation → no duplicate movement", async () => {
    const s = track(await seed({ paid: false, quantity: 1 }));
    // Manually create an already-EXPIRED reservation (terminal): release helper must skip it.
    await prisma.inventoryItem.create({
      data: { storeId: s.storeId, variantId: s.variantId, quantityOnHand: 10, quantityReserved: 0 },
    });
    await prisma.inventoryReservation.create({
      data: {
        storeId: s.storeId,
        orderId: s.orderId,
        orderLineId: s.orderLineId,
        variantId: s.variantId,
        quantity: 1,
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(true);
    const movements = await prisma.inventoryMovement.count({
      where: { storeId: s.storeId, variantId: s.variantId, type: "SALE_RELEASE" },
    });
    expect(movements).toBe(0);
  });

  it("duplicate cancel → idempotent (alreadyCancelled, single refund)", async () => {
    const s = track(await seed({ paid: true }));
    const first = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(first.ok).toBe(true);
    const second = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyCancelled).toBe(true);
    const refunds = await prisma.orderRefund.count({ where: { orderId: s.orderId } });
    expect(refunds).toBe(1);
  });

  it("refund failure leaves order CANCELLED + ledger FAILED", async () => {
    const s = track(await seed({ paid: true, paymentScenario: "refund_failure" }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "PAYMENT_CONCERN" },
      deps,
    );
    expect(res.ok).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("CANCELLED"); // stays cancelled
    const refund = await prisma.orderRefund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund.status).toBe("FAILED");
    expect(order.paymentStatus).toBe("PAID"); // not refunded
  });

  it("coupon release: redemption deleted + counters decremented + wallet AVAILABLE (active campaign)", async () => {
    const s = track(await seed({ paid: false, withCoupon: { campaignActive: true } }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(true);
    const redemptions = await prisma.campaignRedemption.count({ where: { orderId: s.orderId } });
    expect(redemptions).toBe(0);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: s.campaignId! } });
    expect(campaign.usageCount).toBe(0);
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { id: s.couponId! } });
    expect(coupon.usageCount).toBe(0);
    const cc = await prisma.customerCoupon.findUniqueOrThrow({ where: { id: s.customerCouponId! } });
    expect(cc.status).toBe("AVAILABLE");
    expect(cc.orderId).toBeNull();
  });

  it("coupon release with EXPIRED campaign → wallet REVOKED (not revived)", async () => {
    const s = track(
      await seed({
        paid: false,
        withCoupon: { campaignActive: true, campaignEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    );
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(true);
    const cc = await prisma.customerCoupon.findUniqueOrThrow({ where: { id: s.customerCouponId! } });
    expect(cc.status).toBe("REVOKED");
    // counter still released (other customers not blocked)
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: s.campaignId! } });
    expect(campaign.usageCount).toBe(0);
  });

  it("OTHER without note → NOTE_REQUIRED (order untouched)", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "OTHER" },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOTE_REQUIRED");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("PLACED");
  });

  it("OTHER with note → CANCELLED, note stored", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      {
        storeId: s.storeId,
        customerId: s.customerId,
        orderNumber: s.orderNumber,
        reasonCode: "OTHER",
        reasonNote: "Sipariş yanlış adrese gidiyordu.",
      },
      deps,
    );
    expect(res.ok).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelReasonNote).toBe("Sipariş yanlış adrese gidiyordu.");
  });

  it("inactive/unknown reason code → INVALID_REASON", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "NOT_A_REAL_CODE" as never },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_REASON");
  });

  it("cross-customer → ORDER_NOT_FOUND", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      { storeId: s.storeId, customerId: "someone-else", orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ORDER_NOT_FOUND");
  });

  it("cross-store → ORDER_NOT_FOUND", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      { storeId: "another-store", customerId: s.customerId, orderNumber: s.orderNumber, reasonCode: "CHANGED_MIND" },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ORDER_NOT_FOUND");
  });

  it("version conflict (stale expectedVersion) → CANCEL_CONFLICT", async () => {
    const s = track(await seed({ paid: false }));
    const res = await cancelCustomerOrder(
      {
        storeId: s.storeId,
        customerId: s.customerId,
        orderNumber: s.orderNumber,
        reasonCode: "CHANGED_MIND",
        expectedVersion: 999,
      },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CANCEL_CONFLICT");
  });
});

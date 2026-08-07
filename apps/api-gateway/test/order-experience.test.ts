/**
 * TODO-174A (ADR-279) — Sipariş deneyimi değerlendirmesi. Saf uygunluk/sanitize testleri + gerçek-DB
 * entegrasyon (DATABASE_URL yoksa SKIP). ProductReview/aggregate akışına DOKUNMAZ.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@commerce-os/db";
import type { ShipmentStatus } from "@prisma/client";
import {
  createOrderExperienceReview,
  findOrderExperienceReview,
  isOrderExperienceEligible,
  listOrderExperienceEligibility,
  resolveOrderForExperience,
  sanitizeExperienceComment,
} from "../src/order-experience/service.js";

describe("isOrderExperienceEligible (saf)", () => {
  it("iptal + teslim-edilmemiş → uygun", () => {
    expect(isOrderExperienceEligible({ status: "CANCELLED", hasDeliveredOutboundShipment: false })).toBe(true);
  });
  it("iptal ama teslim edilmiş → uygun DEĞİL", () => {
    expect(isOrderExperienceEligible({ status: "CANCELLED", hasDeliveredOutboundShipment: true })).toBe(false);
  });
  it("iptal edilmemiş → uygun DEĞİL", () => {
    expect(isOrderExperienceEligible({ status: "PLACED", hasDeliveredOutboundShipment: false })).toBe(false);
  });
});

describe("sanitizeExperienceComment (saf)", () => {
  it("HTML etiketlerini kaldırır, trim'ler", () => {
    expect(sanitizeExperienceComment("  <b>iyi</b> deneyim  ")).toBe("iyi deneyim");
  });
  it("boşluklu < korunur (metin bozulmaz)", () => {
    expect(sanitizeExperienceComment("a < b")).toBe("a < b");
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

interface SeedOpts {
  status?: string;
  deliveredOutbound?: boolean;
}

async function seed(opts: SeedOpts = {}) {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `tcxl-oe-store-${sfx}`;
  const customerId = `tcxl-oe-cust-${sfx}`;
  const orderId = `tcxl-oe-order-${sfx}`;
  const orderNumber = `TCXLOE-${sfx.toUpperCase()}`;
  await prisma.store.create({ data: { id: storeId, name: `T ${sfx}`, slug: `tcxl-oe-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c-${sfx}@x.test`, firstName: "T", lastName: "C" },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber,
      customerEmail: `c-${sfx}@x.test`,
      currency: "TRY",
      status: (opts.status ?? "CANCELLED") as never,
      paymentStatus: "PAID",
      subtotalAmount: 1000,
      totalAmount: 1000,
      placedAt: new Date(),
      ...(opts.status === "CANCELLED" || opts.status === undefined
        ? { cancelledAt: new Date(), cancelSource: "CUSTOMER", cancelReasonCode: "CHANGED_MIND" }
        : {}),
    },
  });
  if (opts.deliveredOutbound) {
    const cfg = await prisma.shippingProviderConfig.create({
      data: { id: `tcxl-oe-cfg-${sfx}`, storeId, provider: "MOCK", displayName: "Mock" },
    });
    await prisma.shipment.create({
      data: {
        id: `tcxl-oe-ship-${sfx}`,
        storeId,
        orderId,
        providerConfigId: cfg.id,
        provider: "MOCK",
        direction: "OUTBOUND_TO_CUSTOMER",
        referenceId: `REF-${sfx}`,
        status: "DELIVERED" as ShipmentStatus,
        deliveredAt: new Date(),
      },
    });
  }
  return {
    storeId,
    customerId,
    orderId,
    orderNumber,
    cleanup: () => prisma.store.delete({ where: { id: storeId } }),
  };
}

describe.skipIf(!hasDb)("order-experience service — gerçek DB", () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  it("iptal + teslim-edilmemiş sipariş uygunluk listesinde (submitted false)", async () => {
    const s = await seed();
    cleanups.push(s.cleanup);
    const rows = await listOrderExperienceEligibility(s.storeId, s.customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderNumber: s.orderNumber, submitted: false, rating: null });
  });

  it("teslim edilmiş (DELIVERED outbound) iptal → uygunluk listesinde YOK", async () => {
    const s = await seed({ deliveredOutbound: true });
    cleanups.push(s.cleanup);
    expect(await listOrderExperienceEligibility(s.storeId, s.customerId)).toHaveLength(0);
    expect(await resolveOrderForExperience(s.storeId, s.customerId, s.orderNumber)).toBeNull();
  });

  it("iptal edilmemiş sipariş → uygun değil", async () => {
    const s = await seed({ status: "PLACED" });
    cleanups.push(s.cleanup);
    expect(await resolveOrderForExperience(s.storeId, s.customerId, s.orderNumber)).toBeNull();
  });

  it("create + duplicate koruması (aynı sipariş ikinci kez → P2002)", async () => {
    const s = await seed();
    cleanups.push(s.cleanup);
    const order = await resolveOrderForExperience(s.storeId, s.customerId, s.orderNumber);
    expect(order).not.toBeNull();
    await createOrderExperienceReview({
      storeId: s.storeId,
      orderId: order!.id,
      customerId: s.customerId,
      rating: 4,
      comment: "iyi",
    });
    // submitted artık true + rating yansır.
    const rows = await listOrderExperienceEligibility(s.storeId, s.customerId);
    expect(rows[0]).toMatchObject({ submitted: true, rating: 4 });
    expect(await findOrderExperienceReview(s.storeId, order!.id, s.customerId)).not.toBeNull();
    // İkinci kez → unique ihlali.
    await expect(
      createOrderExperienceReview({
        storeId: s.storeId,
        orderId: order!.id,
        customerId: s.customerId,
        rating: 2,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-customer izolasyonu — başka müşteri siparişi çözülemez", async () => {
    const s = await seed();
    cleanups.push(s.cleanup);
    const other = `tcxl-oe-other-${randomUUID().slice(0, 8)}`;
    await prisma.customer.create({
      data: { id: other, storeId: s.storeId, email: `o-${other}@x.test`, firstName: "O", lastName: "X" },
    });
    expect(await resolveOrderForExperience(s.storeId, other, s.orderNumber)).toBeNull();
    expect(await listOrderExperienceEligibility(s.storeId, other)).toHaveLength(0);
  });
});

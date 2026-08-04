/**
 * TODO-169 / ADR-269 post-audit hardening — GERÇEK-DB returns entegrasyon test yardimcisi.
 *
 * api-gateway'de gercek-DB test presedani yoktu (tum testler DI'li in-memory fake). Bu helper
 * `packages/db/test/*` kalibini (paylasilan `prisma` singleton'i + `describe.skipIf(!DATABASE_URL)`
 * + store-scope `afterAll` cleanup) api-gateway'e tasir. Returns servis fonksiyonlari global
 * `prisma`'yi dogrudan import ettigi icin (DI yok) bunlari gercek DB'ye karsi cagirabiliriz.
 *
 * CALISTIRMA: `DATABASE_URL=postgresql://commerce_os:commerce_os_password@localhost:5432/commerce_os_test?schema=public`
 * verilmeden testler SKIP olur (CI'da DB yok → yesil kalir). Temizlik: `store.delete` cascade.
 */
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "@commerce-os/db";
import { registerReturnAdminRoutes } from "../../src/returns/routes-admin.js";

/** DATABASE_URL yoksa gercek-DB testleri atlanir (CI-safe). */
export const hasTestDb = Boolean(process.env.DATABASE_URL);

export interface SeedOptions {
  /** Satin alinan adet (order line quantity). Varsayilan 1. */
  lineQuantity?: number;
  /** Teslim kac gun once (iade penceresi icinde kalmak icin). Varsayilan 1. */
  deliveredDaysAgo?: number;
  /** Basarili odeme attempt'i eklensin mi (refund intent paymentAttemptId icin). Varsayilan true. */
  withPaidPayment?: boolean;
  /** Satir birim fiyat (minor). Varsayilan 10000. */
  unitPriceMinor?: number;
}

export interface SeededOrder {
  storeId: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
  orderLineId: string;
  variantId: string;
  productId: string;
  lineQuantity: number;
  /** Store'u (ve cascade ile tum alt kayitlari) siler. afterEach/afterAll'da cagir. */
  cleanup: () => Promise<void>;
}

/**
 * Teslim edilmis (DELIVERED, pencere ICI) tek satirli bir siparis + musteri + urun/varyant +
 * kargo saglayici config'i seed'ler. Iade akisi (createReturnRequest → transitions) icin yeterli
 * minimal graf. Tum kayitlar tek store'a bagli; cleanup store.delete cascade ile temizler.
 */
export async function seedDeliveredOrder(opts: SeedOptions = {}): Promise<SeededOrder> {
  const lineQuantity = opts.lineQuantity ?? 1;
  const deliveredDaysAgo = opts.deliveredDaysAgo ?? 1;
  const withPaidPayment = opts.withPaidPayment ?? true;
  const unit = opts.unitPriceMinor ?? 10000;
  const sfx = randomUUID().slice(0, 12);
  const storeId = `test-store-${sfx}`;
  const customerId = `test-cust-${sfx}`;
  const orderId = `test-order-${sfx}`;
  const orderNumber = `TEST-${sfx.toUpperCase()}`;
  const productId = `test-prod-${sfx}`;
  const variantId = `test-var-${sfx}`;
  const orderLineId = `test-line-${sfx}`;
  const currency = "TRY";
  const deliveredAt = new Date(Date.now() - deliveredDaysAgo * 24 * 60 * 60 * 1000);

  await prisma.store.create({ data: { id: storeId, name: `Test ${sfx}`, slug: `test-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c-${sfx}@example.test`, firstName: "Test", lastName: "Customer" },
  });
  await prisma.product.create({
    data: { id: productId, storeId, title: `Product ${sfx}`, slug: `product-${sfx}` },
  });
  await prisma.productVariant.create({
    data: { id: variantId, productId, storeId, title: "Default", sku: `SKU-${sfx}`, priceMinor: unit, currency },
  });
  const providerConfig = await prisma.shippingProviderConfig.create({
    data: { id: `test-cfg-${sfx}`, storeId, provider: "MOCK", displayName: "Test Mock" },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber,
      customerEmail: `c-${sfx}@example.test`,
      currency,
      subtotalAmount: unit * lineQuantity,
      totalAmount: unit * lineQuantity,
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
      title: `Product ${sfx}`,
      variantTitle: "Default",
      quantity: lineQuantity,
      unitPriceAmount: unit,
      totalAmount: unit * lineQuantity,
      currency,
    },
  });
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
  if (withPaidPayment) {
    await prisma.paymentAttempt.create({
      data: {
        id: `test-pay-${sfx}`,
        storeId,
        orderId,
        method: "CARD",
        amount: unit * lineQuantity,
        currency,
        status: "PAID",
      },
    });
  }

  return {
    storeId,
    customerId,
    orderId,
    orderNumber,
    orderLineId,
    variantId,
    productId,
    lineQuantity,
    cleanup: async () => {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    },
  };
}

/**
 * Return admin route'larini gercek test DB'ye karsi `app.inject()` ile surmek icin minimal Fastify.
 * `requireStoreAdmin` stub'lanir (sabit actorUserId); route'lar zaten global `prisma`'yi kullanir,
 * boylece tum orchestration (intent create/cancel, auto-advance, restock, version guard) gercek
 * DB'ye karsi kosar. recordAudit no-op.
 */
export function buildReturnAdminApp(actorUserId = "test-admin"): FastifyInstance {
  const app = Fastify({ logger: false });
  registerReturnAdminRoutes(app, {
    requireStoreAdmin: async () => ({ actorUserId }),
    recordAudit: async () => {},
    mediaBaseUrl: undefined,
  });
  return app;
}

/** Bir iade talebinin guncel optimistic version'ini dondurur. */
export async function currentReturnVersion(storeId: string, returnId: string): Promise<number> {
  const rr = await prisma.returnRequest.findFirst({ where: { id: returnId, storeId }, select: { version: true } });
  if (!rr) throw new Error("return request not found");
  return rr.version;
}

/**
 * Admin aksiyonunu (approve/reject/inspect/transition) GUNCEL version ile gonderir (R3 zorunlu
 * expectedVersion). Optimistic-conflict'i KASITLI test etmek isteyen yerler dogrudan app.inject
 * kullanip stale bir version gecebilir.
 */
export async function adminReturnAction(
  app: FastifyInstance,
  storeId: string,
  returnId: string,
  action: "approve" | "reject" | "inspect" | "transition",
  body: Record<string, unknown> = {},
) {
  const version = await currentReturnVersion(storeId, returnId);
  return app.inject({
    method: "POST",
    url: `/stores/${storeId}/returns/${returnId}/${action}`,
    payload: { ...body, expectedVersion: version },
  });
}

/** Bir iade talebinin durumunu + (varsa) refund intent'ini dondurur (assertion kolayligi). */
export async function loadReturnState(storeId: string, returnRequestId: string) {
  return prisma.returnRequest.findFirst({
    where: { id: returnRequestId, storeId },
    select: {
      id: true,
      status: true,
      version: true,
      refundIntent: {
        select: { status: true, cancelledAt: true, cancellationReason: true, totalRefundMinor: true },
      },
      history: { select: { fromStatus: true, toStatus: true, note: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

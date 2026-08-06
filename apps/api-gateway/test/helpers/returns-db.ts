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
import { createReturnRequest } from "../../src/returns/service.js";

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
export interface TwoLineSeedOptions {
  /** Teslim kac gun once. Varsayilan 1. */
  deliveredDaysAgo?: number;
  /** A/B satir adetleri. Varsayilan 2/1. */
  quantityA?: number;
  quantityB?: number;
  /** A/B satir birim fiyat (minor). Varsayilan 10000/5000. */
  unitPriceMinorA?: number;
  unitPriceMinorB?: number;
  /**
   * MOCK provider odeme senaryosu (orn. "refund_failure") — PaymentAttempt.scenario'ya yazilir.
   * initiateRefund → executeAutomatic bu alani okur (bkz. refunds/mock-refund.ts).
   */
  paymentScenario?: string | null;
}

export interface SeededTwoLineOrder {
  storeId: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
  lineAId: string;
  lineBId: string;
  variantAId: string;
  variantBId: string;
  productAId: string;
  productBId: string;
  quantityA: number;
  quantityB: number;
  unitPriceMinorA: number;
  unitPriceMinorB: number;
  paymentAttemptId: string;
  cleanup: () => Promise<void>;
}

/**
 * TD-FR-7 Faz 1 / Task 4 — Inspection→refund orchestration testleri icin IKI satirli (A/B) teslim
 * edilmis siparis. `seedDeliveredOrder`'dan FARKLI: odeme attempt'i `provider: "MOCK"` ile PAID
 * (initiateRefund → executeAutomatic PROVIDER_AUTOMATIC yolunu gercekten tetiklesin diye —
 * seedDeliveredOrder'in provider'siz attempt'i resolveRefundCapability'de MANUAL_OFFLINE'a duser,
 * otomatik yurutulmez).
 */
export async function seedTwoLineDeliveredOrder(opts: TwoLineSeedOptions = {}): Promise<SeededTwoLineOrder> {
  const deliveredDaysAgo = opts.deliveredDaysAgo ?? 1;
  const quantityA = opts.quantityA ?? 2;
  const quantityB = opts.quantityB ?? 1;
  const unitA = opts.unitPriceMinorA ?? 10000;
  const unitB = opts.unitPriceMinorB ?? 5000;
  const sfx = randomUUID().slice(0, 12);
  const storeId = `test-store2-${sfx}`;
  const customerId = `test-cust2-${sfx}`;
  const orderId = `test-order2-${sfx}`;
  const orderNumber = `TEST2-${sfx.toUpperCase()}`;
  const productAId = `test-prodA-${sfx}`;
  const productBId = `test-prodB-${sfx}`;
  const variantAId = `test-varA-${sfx}`;
  const variantBId = `test-varB-${sfx}`;
  const lineAId = `test-lineA-${sfx}`;
  const lineBId = `test-lineB-${sfx}`;
  const currency = "TRY";
  const deliveredAt = new Date(Date.now() - deliveredDaysAgo * 24 * 60 * 60 * 1000);
  const totalAmount = unitA * quantityA + unitB * quantityB;

  await prisma.store.create({ data: { id: storeId, name: `Test2 ${sfx}`, slug: `test2-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c2-${sfx}@example.test`, firstName: "Test", lastName: "Customer" },
  });
  await prisma.product.create({ data: { id: productAId, storeId, title: `Product A ${sfx}`, slug: `product-a-${sfx}` } });
  await prisma.product.create({ data: { id: productBId, storeId, title: `Product B ${sfx}`, slug: `product-b-${sfx}` } });
  await prisma.productVariant.create({
    data: { id: variantAId, productId: productAId, storeId, title: "Default", sku: `SKU-A-${sfx}`, priceMinor: unitA, currency },
  });
  await prisma.productVariant.create({
    data: { id: variantBId, productId: productBId, storeId, title: "Default", sku: `SKU-B-${sfx}`, priceMinor: unitB, currency },
  });
  const providerConfig = await prisma.shippingProviderConfig.create({
    data: { id: `test-cfg2-${sfx}`, storeId, provider: "MOCK", displayName: "Test Mock" },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber,
      customerEmail: `c2-${sfx}@example.test`,
      currency,
      subtotalAmount: totalAmount,
      totalAmount,
    },
  });
  await prisma.orderLine.create({
    data: {
      id: lineAId,
      storeId,
      orderId,
      productId: productAId,
      variantId: variantAId,
      sku: `SKU-A-${sfx}`,
      title: `Product A ${sfx}`,
      variantTitle: "Default",
      quantity: quantityA,
      unitPriceAmount: unitA,
      totalAmount: unitA * quantityA,
      currency,
    },
  });
  await prisma.orderLine.create({
    data: {
      id: lineBId,
      storeId,
      orderId,
      productId: productBId,
      variantId: variantBId,
      sku: `SKU-B-${sfx}`,
      title: `Product B ${sfx}`,
      variantTitle: "Default",
      quantity: quantityB,
      unitPriceAmount: unitB,
      totalAmount: unitB * quantityB,
      currency,
    },
  });
  await prisma.shipment.create({
    data: {
      id: `test-ship2-${sfx}`,
      storeId,
      orderId,
      providerConfigId: providerConfig.id,
      provider: "MOCK",
      referenceId: `REF2-${sfx}`,
      status: "DELIVERED",
      deliveredAt,
    },
  });
  const paymentAttempt = await prisma.paymentAttempt.create({
    data: {
      id: `test-pay2-${sfx}`,
      storeId,
      orderId,
      type: "ONLINE",
      provider: "MOCK",
      method: "CARD",
      amount: totalAmount,
      currency,
      status: "PAID",
      scenario: opts.paymentScenario ?? null,
    },
  });

  return {
    storeId,
    customerId,
    orderId,
    orderNumber,
    lineAId,
    lineBId,
    variantAId,
    variantBId,
    productAId,
    productBId,
    quantityA,
    quantityB,
    unitPriceMinorA: unitA,
    unitPriceMinorB: unitB,
    paymentAttemptId: paymentAttempt.id,
    cleanup: async () => {
      await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    },
  };
}

/**
 * `seedTwoLineDeliveredOrder` siparisi icin iki kalemli REFUND_TO_ORIGINAL_PAYMENT iade talebi
 * olusturur (A + B, satin alinan tam adetle). approvedQuantity/red karari sonradan /approve ile
 * verilir — bu yalnizca REQUESTED talebi olusturur.
 */
export async function createTwoLineRefundReturn(s: SeededTwoLineOrder): Promise<string> {
  const res = await createReturnRequest(
    {
      storeId: s.storeId,
      customerId: s.customerId,
      orderNumber: s.orderNumber,
      resolutionType: "REFUND_TO_ORIGINAL_PAYMENT",
      items: [
        { orderLineId: s.lineAId, quantity: s.quantityA, reason: "NO_LONGER_NEEDED" },
        { orderLineId: s.lineBId, quantity: s.quantityB, reason: "NO_LONGER_NEEDED" },
      ],
    },
    new Date(),
  );
  if (!res.ok) throw new Error(`createReturnRequest failed: ${res.code}`);
  return res.returnRequestId;
}

/** Bir iade talebinde belirli bir order line'a ait ReturnItem id'sini dondurur. */
export async function returnItemIdByLine(
  storeId: string,
  returnRequestId: string,
  orderLineId: string,
): Promise<string> {
  const item = await prisma.returnItem.findFirst({
    where: { storeId, returnRequestId, orderLineId },
    select: { id: true },
  });
  if (!item) throw new Error(`return item not found for line ${orderLineId}`);
  return item.id;
}

/** Bir iade talebine bagli OrderRefund satirlari (ledger) — durum/tutar/hata kodu ile. */
export async function loadOrderRefunds(storeId: string, returnRequestId: string) {
  return prisma.orderRefund.findMany({
    where: { storeId, returnRequestId },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, totalRefundMinor: true, failureCode: true, version: true },
  });
}

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
  action: "approve" | "reject" | "inspect" | "inspect-decision" | "transition",
  body: Record<string, unknown> = {},
) {
  const version = await currentReturnVersion(storeId, returnId);
  return app.inject({
    method: "POST",
    url: `/stores/${storeId}/returns/${returnId}/${action}`,
    payload: { ...body, expectedVersion: version },
  });
}

/**
 * TD-FR-7 Faz 1 / Task 2 — RETURN_REVIEW_STARTED audit izi sayaci. Depolama yeri ReturnStatusHistory
 * (metadata kolonu yok → note icinde JSON isaretci, yalniz insan-okur amacli); bkz.
 * src/returns/review-event.ts. Sayim ARTIK substring/note aramasi DEGIL, uretim kodundakiyle ayni
 * YAPISAL kosula gore yapilir: actorType=ADMIN AND fromStatus IS NOT NULL AND fromStatus=toStatus
 * (gercek bir durum gecisi asla from===to olamaz — bkz. status-map.ts NO_CHANGE fail-closed).
 */
export async function countReviewStartedEvents(storeId: string, returnRequestId: string): Promise<number> {
  const rows = await prisma.returnStatusHistory.findMany({
    where: { storeId, returnRequestId, actorType: "ADMIN" },
    select: { fromStatus: true, toStatus: true },
  });
  return rows.filter((r) => r.fromStatus !== null && r.fromStatus === r.toStatus).length;
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

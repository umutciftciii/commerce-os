/**
 * TODO-177 (ADR-289) — Ürün Desteği gerçek-DB integration suite.
 * DATABASE_URL=postgresql://commerce_os:commerce_os_password@localhost:5432/commerce_os_test?schema=public
 * Her test kendi store'unu random-suffix ile seed'ler + store.delete cascade ile temizler
 * (enterprise-demo'ya DOKUNMAZ). Tests within this file run serially (support global-state safe).
 */

import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { prisma } from "@commerce-os/db";
import { createLogSupportNotificationDispatcher } from "../src/product-support/notification";
import { classifyMediaRequestPath } from "../src/media/private-guard";
import {
  resolveSupportContext,
  createTicketFromGuidedFlow,
  listCustomerTickets,
  getCustomerTicketDetail,
  addCustomerMessage,
  addAdminMessage,
  applyAdminAction,
  reopenTicket,
  getAdminTicketDetail,
  listAdminTickets,
} from "../src/product-support/service";
import {
  createQuestionSet,
  createVersion,
  editDraftVersion,
  publishVersion,
  upsertMapping,
  upsertTopicDefault,
} from "../src/product-support/question-service";
import { registerSupportAttachmentServeRoutes } from "../src/product-support/routes-attachment";

const hasDb = Boolean(process.env.DATABASE_URL);
const dispatcher = createLogSupportNotificationDispatcher({ info: () => {} });
const DAY = 86_400_000;

const createdStores: string[] = [];
const createdQuestionSets: string[] = [];

afterEach(async () => {
  for (const id of createdStores.splice(0)) await prisma.store.delete({ where: { id } }).catch(() => {});
  for (const id of createdQuestionSets.splice(0))
    await prisma.supportQuestionSet.delete({ where: { id } }).catch(() => {});
});

async function seedBase(opts: { warrantyMonths?: number | null; delivered?: boolean } = {}) {
  const sfx = randomUUID().slice(0, 12);
  const storeId = `st-${sfx}`;
  const customerId = `cu-${sfx}`;
  const productId = `pr-${sfx}`;
  const variantId = `va-${sfx}`;
  const orderId = `or-${sfx}`;
  const orderLineId = `ol-${sfx}`;
  const categoryId = `ca-${sfx}`;
  const parentCategoryId = `cap-${sfx}`;
  createdStores.push(storeId);

  await prisma.store.create({ data: { id: storeId, name: `T ${sfx}`, slug: `t-${sfx}` } });
  await prisma.customer.create({
    data: { id: customerId, storeId, email: `c-${sfx}@ex.test`, firstName: "Ada", lastName: "Lovelace" },
  });
  await prisma.productCategory.create({ data: { id: parentCategoryId, storeId, name: "Parent", slug: `p-${sfx}` } });
  await prisma.productCategory.create({
    data: { id: categoryId, storeId, name: "Child", slug: `c-${sfx}`, parentId: parentCategoryId },
  });
  await prisma.product.create({
    data: {
      id: productId,
      storeId,
      title: `Product ${sfx}`,
      slug: `product-${sfx}`,
      primaryCategoryId: categoryId,
      warrantyMonths: opts.warrantyMonths === undefined ? 12 : opts.warrantyMonths,
    },
  });
  await prisma.productVariant.create({
    data: { id: variantId, productId, storeId, title: "Default", sku: `SKU-${sfx}`, priceMinor: 10000, currency: "TRY" },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      storeId,
      customerId,
      orderNumber: `O-${sfx}`,
      customerEmail: `c-${sfx}@ex.test`,
      currency: "TRY",
      subtotalAmount: 10000,
      totalAmount: 10000,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
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
      quantity: 1,
      unitPriceAmount: 10000,
      totalAmount: 10000,
      currency: "TRY",
    },
  });
  if (opts.delivered) {
    const cfg = await prisma.shippingProviderConfig.create({
      data: { storeId, provider: "MOCK", displayName: "Mock" },
      select: { id: true },
    });
    await prisma.shipment.create({
      data: {
        storeId,
        orderId,
        providerConfigId: cfg.id,
        provider: "MOCK",
        referenceId: `SHP-${sfx}`,
        status: "DELIVERED",
        deliveredAt: new Date("2026-02-10T00:00:00.000Z"),
      },
    });
  }
  return { sfx, storeId, customerId, productId, variantId, orderId, orderNumber: `O-${sfx}`, orderLineId, categoryId, parentCategoryId };
}

// Valid published question set: entry SINGLE_SELECT (self→RESULT, DEFAULT→ESCALATE) + result node.
async function seedPublishedSet(sfx: string): Promise<{ questionSetId: string; versionId: string }> {
  const set = await createQuestionSet({ key: `qs-${sfx}`, title: `Set ${sfx}` });
  if (!set.ok) throw new Error("seed set failed");
  createdQuestionSets.push(set.id);
  const ver = await createVersion(set.id);
  if (!ver.ok) throw new Error("seed version failed");
  await editDraftVersion(ver.versionId, {
    questions: [
      {
        key: "entry",
        type: "SINGLE_SELECT",
        prompt: "Sorun ne?",
        sortOrder: 0,
        isEntry: true,
        options: [
          { key: "self", label: "Kendim çözerim", sortOrder: 0 },
          { key: "help", label: "Yardım", sortOrder: 1 },
        ],
      },
      { key: "result", type: "SELF_SERVICE_RESULT", prompt: "Şunu deneyin.", sortOrder: 1 },
    ],
    transitions: [
      { fromKey: "entry", matchKind: "OPTION", matchOptionKey: "self", action: "GO_TO_RESULT", toKey: "result", sortOrder: 0 },
      { fromKey: "entry", matchKind: "DEFAULT", action: "ESCALATE", sortOrder: 1 },
    ],
  });
  const pub = await publishVersion(ver.versionId);
  if (!pub.ok) throw new Error(`publish failed: ${JSON.stringify(pub)}`);
  return { questionSetId: set.id, versionId: ver.versionId };
}

async function seedTicket(base: Awaited<ReturnType<typeof seedBase>>, versionId: string, topic = "PRODUCT_NOT_WORKING" as const) {
  const r = await createTicketFromGuidedFlow(
    {
      storeId: base.storeId,
      customerId: base.customerId,
      orderNumber: base.orderNumber,
      orderLineId: base.orderLineId,
      topic,
      questionSetVersionId: versionId,
      answers: [{ questionKey: "entry", value: { optionKeys: ["help"] } }],
      attemptedResolutionText: "denedim",
    },
    dispatcher,
    new Date(),
  );
  if (!r.ok) throw new Error(`seedTicket failed: ${r.code}`);
  return r.ticketNumber;
}

describe.skipIf(!hasDb)("Product Support — service (live DB)", () => {
  it("re-validates orderLine ownership (wrong customer → ORDER_LINE_NOT_FOUND)", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await upsertMapping(base.storeId, { scope: "PRODUCT", targetId: base.productId, topic: "PRODUCT_NOT_WORKING", questionSetId: (await prisma.supportQuestionSetVersion.findUnique({ where: { id: versionId }, select: { questionSetId: true } }))!.questionSetId });
    const res = await resolveSupportContext({
      storeId: base.storeId,
      customerId: "someone-else",
      orderNumber: base.orderNumber,
      orderLineId: base.orderLineId,
      topic: "PRODUCT_NOT_WORKING",
      now: new Date(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ORDER_LINE_NOT_FOUND");
  });

  it("resolves via PRODUCT mapping and snapshots warranty from deliveredAt", async () => {
    const base = await seedBase({ warrantyMonths: 12, delivered: true });
    const { questionSetId, versionId } = await seedPublishedSet(base.sfx);
    await upsertMapping(base.storeId, { scope: "PRODUCT", targetId: base.productId, topic: "PRODUCT_NOT_WORKING", questionSetId });
    const res = await resolveSupportContext({
      storeId: base.storeId,
      customerId: base.customerId,
      orderNumber: base.orderNumber,
      orderLineId: base.orderLineId,
      topic: "PRODUCT_NOT_WORKING",
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.graph.questionSetVersionId).toBe(versionId);
      expect(res.graph.entryQuestionKey).toBe("entry");
      expect(res.warranty.anchorSource).toBe("SHIPMENT_DELIVERED");
      expect(res.warranty.warrantyEndsAt).toBe("2027-02-10T00:00:00.000Z");
      expect(res.warranty.inWarranty).toBe(true);
    }
  });

  it("creates a ticket with immutable answer/context/sla/history snapshots", async () => {
    const base = await seedBase({ delivered: true });
    const { versionId } = await seedPublishedSet(base.sfx);
    const ticketNumber = await seedTicket(base, versionId);
    expect(ticketNumber).toBe("S000001");

    const ticket = await prisma.supportTicket.findFirst({
      where: { storeId: base.storeId, ticketNumber },
      include: { answers: true, slaSnapshots: true, statusHistory: true },
    });
    expect(ticket).toBeTruthy();
    expect(ticket!.orderLineId).toBe(base.orderLineId);
    expect(ticket!.productId).toBe(base.productId);
    expect(ticket!.questionSetVersionId).toBe(versionId);
    expect(ticket!.warrantyAnchorSource).toBe("SHIPMENT_DELIVERED");
    expect(ticket!.answers).toHaveLength(1);
    expect(ticket!.answers[0].questionPrompt).toBe("Sorun ne?");
    expect(ticket!.answers[0].questionType).toBe("SINGLE_SELECT");
    expect(ticket!.slaSnapshots).toHaveLength(1);
    expect(ticket!.slaSnapshots[0].cycle).toBe(1);
    expect(ticket!.statusHistory[0].toStatus).toBe("OPEN");
    expect(ticket!.statusHistory[0].eventType).toBe("TICKET_OPENED");
  });

  it("generates unique sequential ticket numbers under concurrency", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const results = await Promise.all([
      seedTicket(base, versionId),
      seedTicket(base, versionId),
      seedTicket(base, versionId),
    ]);
    expect(new Set(results).size).toBe(3);
    expect([...results].sort()).toEqual(["S000001", "S000002", "S000003"]);
  });

  it("customer message moves OPEN → WAITING_STORE (append-only history)", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const r = await addCustomerMessage(
      { storeId: base.storeId, customerId: base.customerId, ticketNumber: tn, body: "hâlâ sorunlu" },
      dispatcher,
      new Date(),
    );
    expect(r.ok).toBe(true);
    const t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { status: true } });
    expect(t!.status).toBe("WAITING_STORE");
  });

  it("admin reply sets firstResponse + moves to WAITING_CUSTOMER and marks SLA met", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const t0 = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true } });
    const r = await addAdminMessage(
      { storeId: base.storeId, ticketId: t0!.id, actorUserId: "admin-1", body: "yardımcı olalım" },
      dispatcher,
      new Date(),
    );
    expect(r.ok).toBe(true);
    const t = await prisma.supportTicket.findFirst({
      where: { id: t0!.id },
      include: { slaSnapshots: true },
    });
    expect(t!.status).toBe("WAITING_CUSTOMER");
    expect(t!.firstResponseAt).not.toBeNull();
    expect(t!.slaSnapshots[0].firstResponseMetAt).not.toBeNull();
  });

  it("assigns (me) and rejects a stale version conflict", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const t0 = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true, version: true } });
    const ok = await applyAdminAction(
      { kind: "ASSIGN", storeId: base.storeId, ticketId: t0!.id, actorUserId: "admin-9", expectedVersion: t0!.version, assigneePlatformUserId: "me" },
      dispatcher,
    );
    expect(ok.ok).toBe(true);
    const assigned = await prisma.supportTicket.findUnique({ where: { id: t0!.id }, select: { assigneePlatformUserId: true } });
    expect(assigned!.assigneePlatformUserId).toBe("admin-9");

    const stale = await applyAdminAction(
      { kind: "SET_STATUS", storeId: base.storeId, ticketId: t0!.id, actorUserId: "admin-9", expectedVersion: t0!.version, toStatus: "RESOLVED", now: new Date() },
      dispatcher,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("VERSION_CONFLICT");
  });

  it("resolves then reopens within 7 days as a fresh SLA cycle", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    let t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true, version: true } });
    const resolvedAt = new Date();
    const res = await applyAdminAction(
      { kind: "SET_STATUS", storeId: base.storeId, ticketId: t!.id, actorUserId: "admin-1", expectedVersion: t!.version, toStatus: "RESOLVED", now: resolvedAt },
      dispatcher,
    );
    expect(res.ok).toBe(true);

    const reopen = await reopenTicket(
      { storeId: base.storeId, customerId: base.customerId, ticketNumber: tn },
      dispatcher,
      new Date(resolvedAt.getTime() + 3 * DAY),
    );
    expect(reopen.ok).toBe(true);
    t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true, version: true, status: true, reopenCount: true } });
    expect(t!.status).toBe("OPEN");
    const snaps = await prisma.supportSlaSnapshot.findMany({ where: { ticketId: t!.id }, orderBy: { cycle: "asc" } });
    expect(snaps.map((s) => s.cycle)).toEqual([1, 2]);
  });

  it("rejects reopen after the 7-day window", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true, version: true } });
    const resolvedAt = new Date();
    await applyAdminAction(
      { kind: "SET_STATUS", storeId: base.storeId, ticketId: t!.id, actorUserId: "a", expectedVersion: t!.version, toStatus: "RESOLVED", now: resolvedAt },
      dispatcher,
    );
    const reopen = await reopenTicket(
      { storeId: base.storeId, customerId: base.customerId, ticketNumber: tn },
      dispatcher,
      new Date(resolvedAt.getTime() + 8 * DAY),
    );
    expect(reopen.ok).toBe(false);
    if (!reopen.ok) expect(reopen.code).toBe("REOPEN_WINDOW_EXPIRED");
  });

  it("CLOSED tickets cannot be reopened", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true, version: true } });
    await applyAdminAction(
      { kind: "SET_STATUS", storeId: base.storeId, ticketId: t!.id, actorUserId: "a", expectedVersion: t!.version, toStatus: "CLOSED", now: new Date() },
      dispatcher,
    );
    const reopen = await reopenTicket({ storeId: base.storeId, customerId: base.customerId, ticketNumber: tn }, dispatcher, new Date());
    expect(reopen.ok).toBe(false);
    if (!reopen.ok) expect(reopen.code).toBe("CLOSED_CANNOT_REOPEN");
  });

  it("isolates across stores and customers (detail returns null)", async () => {
    const base = await seedBase();
    const other = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const t = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true } });

    // cross-store admin detail
    expect(await getAdminTicketDetail(other.storeId, t!.id, "/x", new Date())).toBeNull();
    // cross-customer customer detail
    expect(
      await getCustomerTicketDetail(base.storeId, other.customerId, tn, () => "/x", new Date()),
    ).toBeNull();
    // owner sees it
    expect(
      await getCustomerTicketDetail(base.storeId, base.customerId, tn, () => "/x", new Date()),
    ).not.toBeNull();
    // admin list is store-scoped
    const list = await listAdminTickets(other.storeId, { page: 1, pageSize: 20, now: new Date() });
    expect(list.total).toBe(0);
  });

  it("warranty null → no gating (anchorSource NONE) but escalation still possible", async () => {
    const base = await seedBase({ warrantyMonths: null });
    const { questionSetId, versionId } = await seedPublishedSet(base.sfx);
    await upsertMapping(base.storeId, { scope: "PRODUCT", targetId: base.productId, topic: "WARRANTY_SERVICE", questionSetId });
    const res = await resolveSupportContext({
      storeId: base.storeId,
      customerId: base.customerId,
      orderNumber: base.orderNumber,
      orderLineId: base.orderLineId,
      topic: "WARRANTY_SERVICE",
      now: new Date(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warranty.anchorSource).toBe("NONE");
      expect(res.warranty.warrantyEndsAt).toBeNull();
      expect(res.warranty.inWarranty).toBeNull();
    }
    // escalation path exists regardless
    const tn = await seedTicket(base, versionId, "WARRANTY_SERVICE");
    expect(tn).toBe("S000001");
  });

  it("resolves PRODUCT over CATEGORY over DEFAULT (DB integration)", async () => {
    const base = await seedBase();
    const setProduct = await seedPublishedSet(`${base.sfx}-p`);
    const setCategory = await seedPublishedSet(`${base.sfx}-c`);
    const setDefault = await seedPublishedSet(`${base.sfx}-d`);
    const topic = "SETUP_USAGE" as const;

    // DEFAULT only (this file is the sole mutator of SupportTopicDefault → serial-safe)
    await upsertTopicDefault({ topic, questionSetId: setDefault.questionSetId });
    let res = await resolveSupportContext({ storeId: base.storeId, customerId: base.customerId, orderNumber: base.orderNumber, orderLineId: base.orderLineId, topic, now: new Date() });
    expect(res.ok && res.graph.questionSetVersionId).toBe(setDefault.versionId);

    // add CATEGORY (child) → wins over default
    await upsertMapping(base.storeId, { scope: "CATEGORY", targetId: base.categoryId, topic, questionSetId: setCategory.questionSetId });
    res = await resolveSupportContext({ storeId: base.storeId, customerId: base.customerId, orderNumber: base.orderNumber, orderLineId: base.orderLineId, topic, now: new Date() });
    expect(res.ok && res.graph.questionSetVersionId).toBe(setCategory.versionId);

    // add PRODUCT → wins over category
    await upsertMapping(base.storeId, { scope: "PRODUCT", targetId: base.productId, topic, questionSetId: setProduct.questionSetId });
    res = await resolveSupportContext({ storeId: base.storeId, customerId: base.customerId, orderNumber: base.orderNumber, orderLineId: base.orderLineId, topic, now: new Date() });
    expect(res.ok && res.graph.questionSetVersionId).toBe(setProduct.versionId);
  });

  it("publish rejects an invalid graph (dead-end)", async () => {
    const set = await createQuestionSet({ key: `qs-bad-${randomUUID().slice(0, 8)}`, title: "Bad" });
    if (!set.ok) throw new Error("set");
    createdQuestionSets.push(set.id);
    const ver = await createVersion(set.id);
    if (!ver.ok) throw new Error("ver");
    await editDraftVersion(ver.versionId, {
      questions: [{ key: "entry", type: "SHORT_TEXT", prompt: "?", sortOrder: 0, isEntry: true }],
      transitions: [], // dead-end: no forward, no escalate
    });
    const pub = await publishVersion(ver.versionId);
    expect(pub.ok).toBe(false);
    if (!pub.ok) expect(pub.code).toBe("GRAPH_INVALID");
  });

  it("does not touch return/refund/cancel/recovery domains", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await seedTicket(base, versionId);
    const [returns, refunds, recovery] = await Promise.all([
      prisma.returnRequest.count({ where: { storeId: base.storeId } }),
      prisma.orderRefund.count({ where: { storeId: base.storeId } }),
      prisma.orderRecoveryCase.count({ where: { storeId: base.storeId } }),
    ]);
    expect(returns).toBe(0);
    expect(refunds).toBe(0);
    expect(recovery).toBe(0);
  });

  it("private media guard blocks /media support segment (no public leak)", () => {
    expect(classifyMediaRequestPath("/media/stores/x/support/y.pdf")).toBe("private");
    expect(classifyMediaRequestPath("/media/stores/x/support/y.webp")).toBe("private");
    expect(classifyMediaRequestPath("/media/stores/x/products/y.webp")).toBe("ok");
  });

  it("attachment serve is scoped (cross-customer/cross-store → 404, owner → 200)", async () => {
    const base = await seedBase();
    const other = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    const tn = await seedTicket(base, versionId);
    const ticket = await prisma.supportTicket.findFirst({ where: { storeId: base.storeId, ticketNumber: tn }, select: { id: true } });
    // seed a support media asset + attachment
    const asset = await prisma.mediaAsset.create({
      data: { storeId: base.storeId, context: "SUPPORT_ATTACHMENT", storageKey: `stores/${base.storeId}/support/${randomUUID()}.pdf`, mimeType: "application/pdf", byteSize: 3, createdBy: `customer:${base.customerId}` },
      select: { id: true },
    });
    const att = await prisma.supportTicketAttachment.create({
      data: { storeId: base.storeId, ticketId: ticket!.id, mediaAssetId: asset.id, type: "PDF" },
      select: { id: true },
    });

    const storage = { read: async () => Buffer.from("pdf"), put: async () => {}, delete: async () => {}, exists: async () => true } as unknown as Parameters<typeof registerSupportAttachmentServeRoutes>[1]["storage"];
    const app = Fastify({ logger: false });
    registerSupportAttachmentServeRoutes(app, {
      storage,
      requireStoreAdmin: async (_req, reply, storeId) => {
        if (storeId === base.storeId) return { actorUserId: "a" };
        await reply.code(404).send({ error: { code: "STORE_ACCESS_DENIED", message: "no" } });
        return null;
      },
      resolveCustomer: async (req) => {
        const id = (req.headers["x-customer-session"] as string) || "";
        return id ? { id } : null;
      },
      resolvePublicStore: async (slug) => {
        const s = await prisma.store.findFirst({ where: { slug }, select: { id: true, slug: true } });
        return s;
      },
    });

    const base404 = await app.inject({
      method: "GET",
      url: `/public/stores/t-${base.sfx}/customer/support/tickets/${tn}/attachments/${att.id}`,
      headers: { "x-customer-session": other.customerId },
    });
    expect(base404.statusCode).toBe(404); // cross-customer

    const ownerOk = await app.inject({
      method: "GET",
      url: `/public/stores/t-${base.sfx}/customer/support/tickets/${tn}/attachments/${att.id}`,
      headers: { "x-customer-session": base.customerId },
    });
    expect(ownerOk.statusCode).toBe(200);

    const crossStore = await app.inject({
      method: "GET",
      url: `/stores/${other.storeId}/support/tickets/${ticket!.id}/attachments/${att.id}`,
    });
    expect(crossStore.statusCode).toBe(404); // cross-store admin → guard 404 (STORE_ACCESS_DENIED)
    await app.close();
  });

  it("question-set writes are platform-only (guard denies non-platform)", async () => {
    const { registerSupportPlatformRoutes } = await import("../src/product-support/routes-platform");
    const app = Fastify({ logger: false });
    app.setErrorHandler(async (error, _req, reply) => {
      const { z } = await import("zod");
      if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: "VALIDATION", message: "x" } });
      return reply.code(500).send({ error: { code: "INTERNAL", message: "x" } });
    });
    // guard simulates a non-platform actor → 403, returns null (no write path)
    registerSupportPlatformRoutes(app, {
      requirePlatform: async (_req, reply) => {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "platform only" } });
        return null;
      },
    });
    const before = await prisma.supportQuestionSet.count();
    const res = await app.inject({
      method: "POST",
      url: "/platform/support/question-sets",
      payload: { key: `should-not-${randomUUID().slice(0, 8)}`, title: "nope" },
    });
    expect(res.statusCode).toBe(403);
    expect(await prisma.supportQuestionSet.count()).toBe(before); // no write happened
    await app.close();
  });

  it("customer ticket list is scoped to the owner", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await seedTicket(base, versionId);
    const mine = await listCustomerTickets(base.storeId, base.customerId);
    expect(mine).toHaveLength(1);
    const others = await listCustomerTickets(base.storeId, "nobody");
    expect(others).toHaveLength(0);
  });
});

/**
 * TD-177-2 — Admin inbox `slaRisk` filtresi YALNIZ live (en yüksek) SupportSlaSnapshot cycle'ını
 * değerlendirmeli. Reopen ile oluşan eski (historical) cycle'lar overdue olsa bile — o cycle
 * resolved edildiği için — false-positive üretmemeli. Filtre, inbox SLA rozetiyle (live snapshot
 * + slaStateFor) aynı kanonik OVERDUE kavramını kullanır.
 */
describe.skipIf(!hasDb)("Product Support — TD-177-2 SLA risk (live cycle only)", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");
  const PAST = new Date("2026-05-01T00:00:00.000Z");
  const FUTURE = new Date("2026-07-01T00:00:00.000Z");

  type Snap = { cycle: number; frDue: Date; frMet: Date | null; resDue: Date; resolved: Date | null };

  async function ticketWith(
    base: Awaited<ReturnType<typeof seedBase>>,
    versionId: string,
    snapshots: Snap[],
    status: "OPEN" | "WAITING_STORE" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED",
  ) {
    const tn = await seedTicket(base, versionId);
    const t = await prisma.supportTicket.findFirstOrThrow({
      where: { storeId: base.storeId, ticketNumber: tn },
      select: { id: true },
    });
    // createTicketFromGuidedFlow cycle 1 kurdu → kaldırıp senaryonun snapshot'larını kur.
    await prisma.supportSlaSnapshot.deleteMany({ where: { ticketId: t.id } });
    for (const s of snapshots) {
      await prisma.supportSlaSnapshot.create({
        data: {
          storeId: base.storeId,
          ticketId: t.id,
          cycle: s.cycle,
          topic: "PRODUCT_NOT_WORKING",
          firstResponseDueAt: s.frDue,
          firstResponseMetAt: s.frMet,
          resolutionDueAt: s.resDue,
          resolvedAt: s.resolved,
        },
      });
    }
    await prisma.supportTicket.update({ where: { id: t.id }, data: { status } });
    return t.id;
  }

  it("historical overdue-resolved cycle → risk DEĞİL (live cycle temiz)", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await ticketWith(
      base,
      versionId,
      [
        { cycle: 1, frDue: PAST, frMet: PAST, resDue: PAST, resolved: PAST }, // eski, overdue AMA resolved
        { cycle: 2, frDue: FUTURE, frMet: NOW, resDue: FUTURE, resolved: null }, // live, temiz
      ],
      "OPEN",
    );
    const list = await listAdminTickets(base.storeId, { slaRisk: true, page: 1, pageSize: 20, now: NOW });
    expect(list.total).toBe(0);
  });

  it("live cycle resolution overdue → risk", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await ticketWith(
      base,
      versionId,
      [{ cycle: 1, frDue: PAST, frMet: PAST, resDue: PAST, resolved: null }],
      "WAITING_STORE",
    );
    const list = await listAdminTickets(base.storeId, { slaRisk: true, page: 1, pageSize: 20, now: NOW });
    expect(list.total).toBe(1);
    expect(list.items[0].resolutionState).toBe("OVERDUE");
  });

  it("live cycle first-response overdue (yanıtsız) → risk (badge ile tutarlı)", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await ticketWith(
      base,
      versionId,
      [{ cycle: 1, frDue: PAST, frMet: null, resDue: FUTURE, resolved: null }],
      "OPEN",
    );
    const list = await listAdminTickets(base.storeId, { slaRisk: true, page: 1, pageSize: 20, now: NOW });
    expect(list.total).toBe(1);
    expect(list.items[0].firstResponseState).toBe("OVERDUE");
  });

  it("terminal ticket (RESOLVED/CLOSED) → risk DEĞİL (aktif status kapısı)", async () => {
    const base = await seedBase();
    const { versionId } = await seedPublishedSet(base.sfx);
    await ticketWith(
      base,
      versionId,
      [{ cycle: 1, frDue: PAST, frMet: null, resDue: PAST, resolved: null }],
      "RESOLVED",
    );
    const list = await listAdminTickets(base.storeId, { slaRisk: true, page: 1, pageSize: 20, now: NOW });
    expect(list.total).toBe(0);
  });
});

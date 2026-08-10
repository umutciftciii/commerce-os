/**
 * TODO-177 (ADR-289) — Ürün Desteği ticket lifecycle servisi (framework-agnostik).
 *
 * storeId-first explicit scoping; sentinel-result hata stili; optimistic `version` guard;
 * append-only status history; immutable answer/version snapshot; taze SLA döngüsü (reopen).
 * Tüm client-verili order/line context sunucuda (storeId, customerId)'ye karşı YENİDEN doğrulanır.
 */

import { prisma } from "@commerce-os/db";
import type { Prisma, PrismaClient, SupportTopic, SupportTicketStatus } from "@prisma/client";
import {
  DEFAULT_TICKET_SLA_POLICY,
  resolveTicketSlaTarget,
  computeTicketDueAts,
} from "@commerce-os/config";
import { resolveQuestionSet } from "./resolution.js";
import { computeWarrantyEligibility } from "./warranty.js";
import { evaluateStatusTransition, evaluateReopen, type SupportActor } from "./status-map.js";
import { liveSlaSnapshot, slaStateFor } from "./sla.js";
import {
  projectGraph,
  projectCustomerTicketDetail,
  projectAdminTicketDetail,
  type TicketDetailRow,
  type AdminTicketDetailRow,
} from "./serialize.js";
import type {
  SupportNotificationDispatcher,
  SupportNotificationEvent,
} from "./notification.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export const ACTIVE_TICKET_STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "WAITING_STORE",
  "WAITING_CUSTOMER",
];

// ---------- sentinel results ----------
type Err<C extends string> = { ok: false; code: C };
export type ResolveContextResult =
  | { ok: true; graph: ReturnType<typeof projectGraph>; context: ContextView; warranty: WarrantyView }
  | Err<"ORDER_LINE_NOT_FOUND" | "QUESTION_SET_UNAVAILABLE">;

interface ContextView {
  orderNumber: string;
  orderLineId: string;
  productTitle: string;
  variantTitle: string | null;
  topic: SupportTopic;
}
interface WarrantyView {
  warrantyEndsAt: string | null;
  anchorSource: "SHIPMENT_DELIVERED" | "ORDER_CREATED" | "NONE";
  inWarranty: boolean | null;
}

// ---------- shared loaders ----------

const detailInclude = {
  product: { select: { title: true } },
  order: { select: { orderNumber: true } },
  answers: true,
  messages: { include: { attachments: { select: { id: true, type: true } } } },
  attachments: { select: { id: true, type: true } },
  slaSnapshots: true,
} satisfies Prisma.SupportTicketInclude;

const adminDetailInclude = {
  ...detailInclude,
  variant: { select: { title: true } },
  customer: { select: { firstName: true, lastName: true, email: true } },
  statusHistory: true,
} satisfies Prisma.SupportTicketInclude;

async function categoryAncestry(
  db: Tx,
  storeId: string,
  primaryCategoryId: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  let current = primaryCategoryId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    ids.push(current);
    const cat: { parentId: string | null } | null = await db.productCategory.findFirst({
      where: { id: current, storeId },
      select: { parentId: true },
    });
    current = cat?.parentId ?? null;
  }
  return ids;
}

async function loadLatestPublishedVersionId(db: Tx, questionSetId: string): Promise<string | null> {
  const v = await db.supportQuestionSetVersion.findFirst({
    where: { questionSetId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return v?.id ?? null;
}

async function loadVersionGraph(db: Tx, versionId: string) {
  return db.supportQuestionSetVersion.findUnique({
    where: { id: versionId },
    include: { questions: { include: { options: true } }, transitions: true },
  });
}

/** Product → Category-ancestry → DEFAULT; sonra o setin son PUBLISHED versiyonu (yoksa DEFAULT'a düş). */
async function resolvePublishedVersionId(
  db: Tx,
  storeId: string,
  productId: string,
  ancestry: string[],
  topic: SupportTopic,
): Promise<string | null> {
  const mappings = await db.supportQuestionSetMapping.findMany({
    where: {
      storeId,
      topic,
      OR: [
        { scope: "PRODUCT", targetId: productId },
        { scope: "CATEGORY", targetId: { in: ancestry.length ? ancestry : ["__none__"] } },
      ],
    },
    select: { scope: true, targetId: true, questionSetId: true },
  });
  const topicDefaultRow = await db.supportTopicDefault.findUnique({
    where: { topic },
    select: { questionSetId: true },
  });
  const productMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  for (const m of mappings) {
    if (m.scope === "PRODUCT") productMap.set(`${m.targetId}:${topic}`, m.questionSetId);
    else categoryMap.set(`${m.targetId}:${topic}`, m.questionSetId);
  }
  const topicDefault = new Map<SupportTopic, string>();
  if (topicDefaultRow) topicDefault.set(topic, topicDefaultRow.questionSetId);

  let resolvedSetId: string;
  try {
    resolvedSetId = resolveQuestionSet({
      topic,
      productId,
      categoryAncestryIds: ancestry,
      productMap,
      categoryMap,
      topicDefault,
    }).questionSetId;
  } catch {
    return null; // MISSING_TOPIC_DEFAULT (seed invariant broken)
  }
  const published = await loadLatestPublishedVersionId(db, resolvedSetId);
  if (published) return published;
  // fallback: topic default set's published (dead-end guard)
  if (topicDefaultRow && topicDefaultRow.questionSetId !== resolvedSetId) {
    return loadLatestPublishedVersionId(db, topicDefaultRow.questionSetId);
  }
  return null;
}

interface OrderLineContext {
  orderLineId: string;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: Date;
  productId: string;
  productTitle: string;
  productWarrantyMonths: number | null;
  primaryCategoryId: string | null;
  variantId: string | null;
  variantTitle: string | null;
  variantWarrantyMonths: number | null;
}

/** Ownership re-validation: orderLine (storeId, customerId, orderNumber) eşleşmezse null. */
async function loadOwnedOrderLine(
  db: Tx,
  storeId: string,
  customerId: string,
  orderNumber: string,
  orderLineId: string,
): Promise<OrderLineContext | null> {
  const line = await db.orderLine.findFirst({
    where: { id: orderLineId, storeId, order: { orderNumber, customerId, storeId } },
    select: {
      id: true,
      orderId: true,
      productId: true,
      variantId: true,
      order: { select: { orderNumber: true, createdAt: true } },
      product: { select: { title: true, warrantyMonths: true, primaryCategoryId: true } },
      variant: { select: { title: true, warrantyMonths: true } },
    },
  });
  if (!line) return null;
  return {
    orderLineId: line.id,
    orderId: line.orderId,
    orderNumber: line.order.orderNumber,
    orderCreatedAt: line.order.createdAt,
    productId: line.productId,
    productTitle: line.product.title,
    productWarrantyMonths: line.product.warrantyMonths,
    primaryCategoryId: line.product.primaryCategoryId,
    variantId: line.variantId,
    variantTitle: line.variant?.title ?? null,
    variantWarrantyMonths: line.variant?.warrantyMonths ?? null,
  };
}

async function maxDeliveredAt(db: Tx, storeId: string, orderId: string): Promise<Date | null> {
  const agg = await db.shipment.aggregate({
    where: { storeId, orderId, status: "DELIVERED" },
    _max: { deliveredAt: true },
  });
  return agg._max.deliveredAt ?? null;
}

async function computeWarranty(db: Tx, storeId: string, ctx: OrderLineContext, now: Date) {
  const months = ctx.variantWarrantyMonths ?? ctx.productWarrantyMonths;
  const deliveredAt = await maxDeliveredAt(db, storeId, ctx.orderId);
  return computeWarrantyEligibility({
    warrantyMonths: months,
    deliveredAt,
    orderCreatedAt: ctx.orderCreatedAt,
    now,
  });
}

// ---------- customer: resolve guided context ----------

export async function resolveSupportContext(input: {
  storeId: string;
  customerId: string;
  orderNumber: string;
  orderLineId: string;
  topic: SupportTopic;
  now: Date;
}): Promise<ResolveContextResult> {
  const ctx = await loadOwnedOrderLine(
    prisma,
    input.storeId,
    input.customerId,
    input.orderNumber,
    input.orderLineId,
  );
  if (!ctx) return { ok: false, code: "ORDER_LINE_NOT_FOUND" };

  const ancestry = await categoryAncestry(prisma, input.storeId, ctx.primaryCategoryId);
  const versionId = await resolvePublishedVersionId(
    prisma,
    input.storeId,
    ctx.productId,
    ancestry,
    input.topic,
  );
  if (!versionId) return { ok: false, code: "QUESTION_SET_UNAVAILABLE" };
  const version = await loadVersionGraph(prisma, versionId);
  if (!version) return { ok: false, code: "QUESTION_SET_UNAVAILABLE" };

  const warranty = await computeWarranty(prisma, input.storeId, ctx, input.now);
  return {
    ok: true,
    graph: projectGraph(version),
    context: {
      orderNumber: ctx.orderNumber,
      orderLineId: ctx.orderLineId,
      productTitle: ctx.productTitle,
      variantTitle: ctx.variantTitle,
      topic: input.topic,
    },
    warranty: {
      warrantyEndsAt: warranty.warrantyEndsAt ? warranty.warrantyEndsAt.toISOString() : null,
      anchorSource: warranty.anchorSource,
      inWarranty: warranty.inWarranty,
    },
  };
}

// ---------- attachment validation ----------

async function validateAttachments(
  db: Tx,
  storeId: string,
  mediaIds: string[],
  requireCreatedBy: string | null,
): Promise<{ ok: true; assets: Array<{ id: string; mimeType: string }> } | Err<"ATTACHMENT_NOT_FOUND">> {
  if (mediaIds.length === 0) return { ok: true, assets: [] };
  const unique = [...new Set(mediaIds)];
  const assets = await db.mediaAsset.findMany({
    where: {
      id: { in: unique },
      storeId,
      context: "SUPPORT_ATTACHMENT",
      ...(requireCreatedBy ? { createdBy: requireCreatedBy } : {}),
    },
    select: { id: true, mimeType: true },
  });
  if (assets.length !== unique.length) return { ok: false, code: "ATTACHMENT_NOT_FOUND" };
  return { ok: true, assets };
}

function attachmentType(mimeType: string): "PHOTO" | "PDF" {
  return mimeType === "application/pdf" ? "PDF" : "PHOTO";
}

// ---------- ticket number ----------

async function nextTicketNumber(tx: Prisma.TransactionClient, storeId: string): Promise<string> {
  const counter = await tx.supportTicketNumberCounter.upsert({
    where: { storeId },
    create: { storeId, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return `S${String(counter.lastValue).padStart(6, "0")}`;
}

async function writeSlaSnapshot(
  tx: Prisma.TransactionClient,
  storeId: string,
  ticketId: string,
  cycle: number,
  topic: SupportTopic,
  now: Date,
) {
  const target = resolveTicketSlaTarget(DEFAULT_TICKET_SLA_POLICY, topic);
  const { firstResponseDueAt, resolutionDueAt } = computeTicketDueAts(now, target);
  await tx.supportSlaSnapshot.create({
    data: { storeId, ticketId, cycle, topic, firstResponseDueAt, resolutionDueAt },
  });
}

// ---------- create from guided flow ----------

export type CreateTicketResult =
  | { ok: true; ticketNumber: string }
  | Err<"ORDER_LINE_NOT_FOUND" | "QUESTION_SET_UNAVAILABLE" | "VERSION_NOT_PUBLISHED" | "ATTACHMENT_NOT_FOUND">;

export interface CreateTicketInput {
  storeId: string;
  customerId: string;
  orderNumber: string;
  orderLineId: string;
  topic: SupportTopic;
  questionSetVersionId: string;
  answers: Array<{ questionKey: string; value: unknown }>;
  attachments?: string[];
  attemptedResolutionKey?: string;
  attemptedResolutionText?: string;
}

export async function createTicketFromGuidedFlow(
  input: CreateTicketInput,
  dispatcher: SupportNotificationDispatcher,
  now: Date,
): Promise<CreateTicketResult> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support:${input.storeId}`}))`;

    const ctx = await loadOwnedOrderLine(
      tx,
      input.storeId,
      input.customerId,
      input.orderNumber,
      input.orderLineId,
    );
    if (!ctx) return { ok: false, code: "ORDER_LINE_NOT_FOUND" } as const;

    // Version must be PUBLISHED (immutable snapshot ref); load its questions for prompt/type snapshot.
    const version = await loadVersionGraph(tx, input.questionSetVersionId);
    if (!version) return { ok: false, code: "QUESTION_SET_UNAVAILABLE" } as const;
    if (version.status !== "PUBLISHED") return { ok: false, code: "VERSION_NOT_PUBLISHED" } as const;

    const attachCheck = await validateAttachments(
      tx,
      input.storeId,
      input.attachments ?? [],
      `customer:${input.customerId}`,
    );
    if (!attachCheck.ok) return attachCheck;

    const questionByKey = new Map(version.questions.map((q) => [q.key, q]));
    const warranty = await computeWarranty(tx, input.storeId, ctx, now);
    const ticketNumber = await nextTicketNumber(tx, input.storeId);

    const ticket = await tx.supportTicket.create({
      data: {
        storeId: input.storeId,
        ticketNumber,
        customerId: input.customerId,
        orderId: ctx.orderId,
        orderLineId: ctx.orderLineId,
        productId: ctx.productId,
        variantId: ctx.variantId,
        questionSetVersionId: version.id,
        topic: input.topic,
        warrantyEndsAt: warranty.warrantyEndsAt,
        warrantyAnchorSource: warranty.anchorSource,
        suggestedResolutionKey: input.attemptedResolutionKey ?? null,
        suggestedResolutionText: input.attemptedResolutionText ?? null,
        status: "OPEN",
        lastActivityAt: now,
        answers: {
          create: input.answers.map((a, idx) => {
            const q = questionByKey.get(a.questionKey);
            return {
              storeId: input.storeId,
              questionKey: a.questionKey,
              questionPrompt: q?.prompt ?? a.questionKey,
              questionType: q?.type ?? "SHORT_TEXT",
              answerValue: (a.value ?? {}) as Prisma.InputJsonValue,
              sortOrder: q?.sortOrder ?? idx,
            };
          }),
        },
        statusHistory: {
          create: {
            storeId: input.storeId,
            fromStatus: null,
            toStatus: "OPEN",
            actorType: "CUSTOMER",
            actorId: input.customerId,
            eventType: "TICKET_OPENED",
          },
        },
      },
      select: { id: true, ticketNumber: true },
    });

    if (attachCheck.assets.length > 0) {
      await tx.supportTicketAttachment.createMany({
        data: attachCheck.assets.map((a) => ({
          storeId: input.storeId,
          ticketId: ticket.id,
          mediaAssetId: a.id,
          type: attachmentType(a.mimeType),
        })),
      });
    }

    await writeSlaSnapshot(tx, input.storeId, ticket.id, 1, input.topic, now);
    return { ok: true, ticketId: ticket.id, ticketNumber: ticket.ticketNumber } as const;
  });

  if (result.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      ticketId: result.ticketId,
      ticketNumber: result.ticketNumber,
      event: "TICKET_OPENED",
      recipient: "STORE_ADMIN",
    });
    return { ok: true, ticketNumber: result.ticketNumber };
  }
  return result;
}

// ---------- customer reads ----------

export async function listCustomerTickets(storeId: string, customerId: string) {
  const rows = await prisma.supportTicket.findMany({
    where: { storeId, customerId },
    orderBy: { lastActivityAt: "desc" },
    select: {
      ticketNumber: true,
      status: true,
      topic: true,
      lastActivityAt: true,
      createdAt: true,
      product: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    ticketNumber: r.ticketNumber,
    status: r.status,
    topic: r.topic,
    productTitle: r.product.title,
    lastActivityAt: r.lastActivityAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getCustomerTicketDetail(
  storeId: string,
  customerId: string,
  ticketNumber: string,
  attachmentBaseFor: (ticketNumber: string) => string,
  now: Date,
) {
  const row = await prisma.supportTicket.findFirst({
    where: { storeId, customerId, ticketNumber },
    include: detailInclude,
  });
  if (!row) return null;
  return projectCustomerTicketDetail(
    row as unknown as TicketDetailRow,
    attachmentBaseFor(ticketNumber),
    now,
  );
}

// ---------- customer message ----------

export type MessageResult =
  | { ok: true }
  | Err<"TICKET_NOT_FOUND" | "TICKET_CLOSED" | "ATTACHMENT_NOT_FOUND" | "VERSION_CONFLICT">;

export async function addCustomerMessage(
  input: {
    storeId: string;
    customerId: string;
    ticketNumber: string;
    body: string;
    attachments?: string[];
  },
  dispatcher: SupportNotificationDispatcher,
  now: Date,
): Promise<MessageResult> {
  const out = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { storeId: input.storeId, customerId: input.customerId, ticketNumber: input.ticketNumber },
      select: { id: true, status: true, version: true },
    });
    if (!ticket) return { ok: false, code: "TICKET_NOT_FOUND" } as const;
    if (ticket.status === "CLOSED") return { ok: false, code: "TICKET_CLOSED" } as const;

    const attachCheck = await validateAttachments(
      tx,
      input.storeId,
      input.attachments ?? [],
      `customer:${input.customerId}`,
    );
    if (!attachCheck.ok) return attachCheck;

    const message = await tx.supportTicketMessage.create({
      data: {
        storeId: input.storeId,
        ticketId: ticket.id,
        actorType: "CUSTOMER",
        actorId: input.customerId,
        body: input.body,
      },
      select: { id: true },
    });
    if (attachCheck.assets.length > 0) {
      await tx.supportTicketAttachment.createMany({
        data: attachCheck.assets.map((a) => ({
          storeId: input.storeId,
          ticketId: ticket.id,
          ticketMessageId: message.id,
          mediaAssetId: a.id,
          type: attachmentType(a.mimeType),
        })),
      });
    }

    // customer reply on a resolved/waiting-customer ticket moves it to WAITING_STORE (server-authoritative)
    const target: SupportTicketStatus | null =
      ticket.status === "WAITING_CUSTOMER" || ticket.status === "OPEN" ? "WAITING_STORE" : null;
    const updated = await tx.supportTicket.updateMany({
      where: { id: ticket.id, storeId: input.storeId, version: ticket.version },
      data: {
        lastActivityAt: now,
        version: { increment: 1 },
        ...(target ? { status: target } : {}),
      },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    if (target) {
      await tx.supportTicketStatusHistory.create({
        data: {
          storeId: input.storeId,
          ticketId: ticket.id,
          fromStatus: ticket.status,
          toStatus: target,
          actorType: "CUSTOMER",
          actorId: input.customerId,
          eventType: "TICKET_CUSTOMER_REPLY",
        },
      });
    }
    return { ok: true, ticketId: ticket.id } as const;
  });

  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      ticketId: out.ticketId,
      ticketNumber: input.ticketNumber,
      event: "TICKET_CUSTOMER_REPLY",
      recipient: "STORE_ADMIN",
    });
    return { ok: true };
  }
  return out;
}

// ---------- reopen ----------

export type ReopenResult =
  | { ok: true }
  | Err<"TICKET_NOT_FOUND" | "REOPEN_WINDOW_EXPIRED" | "CLOSED_CANNOT_REOPEN" | "INVALID_TRANSITION" | "NOT_OWNER" | "VERSION_CONFLICT">;

export async function reopenTicket(
  input: { storeId: string; customerId: string; ticketNumber: string },
  dispatcher: SupportNotificationDispatcher,
  now: Date,
): Promise<ReopenResult> {
  const out = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { storeId: input.storeId, ticketNumber: input.ticketNumber },
      select: { id: true, status: true, resolvedAt: true, version: true, topic: true, customerId: true },
    });
    if (!ticket) return { ok: false, code: "TICKET_NOT_FOUND" } as const;
    const isOwner = ticket.customerId === input.customerId;
    const check = evaluateReopen(ticket.status, ticket.resolvedAt, now, isOwner);
    if (!check.ok) {
      // check.ok=false olduğunda code asla "OK" değildir (ReopenResult error kümesi).
      return { ok: false, code: check.code as Exclude<typeof check.code, "OK"> } as const;
    }

    const nextCycle = (await tx.supportSlaSnapshot.aggregate({
      where: { storeId: input.storeId, ticketId: ticket.id },
      _max: { cycle: true },
    }))._max.cycle;
    const updated = await tx.supportTicket.updateMany({
      where: { id: ticket.id, storeId: input.storeId, version: ticket.version },
      data: {
        status: "OPEN",
        reopenCount: { increment: 1 },
        resolvedAt: null,
        lastActivityAt: now,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;

    await tx.supportTicketStatusHistory.create({
      data: {
        storeId: input.storeId,
        ticketId: ticket.id,
        fromStatus: "RESOLVED",
        toStatus: "OPEN",
        actorType: "CUSTOMER",
        actorId: input.customerId,
        eventType: "TICKET_REOPENED",
      },
    });
    // fresh SLA cycle (ADR-289 §7)
    await writeSlaSnapshot(tx, input.storeId, ticket.id, (nextCycle ?? 1) + 1, ticket.topic, now);
    return { ok: true, ticketId: ticket.id } as const;
  });

  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      ticketId: out.ticketId,
      ticketNumber: input.ticketNumber,
      event: "TICKET_REOPENED",
      recipient: "STORE_ADMIN",
    });
    return { ok: true };
  }
  return out;
}

// ---------- admin: list ----------

export interface AdminListFilters {
  status?: SupportTicketStatus;
  assigneePlatformUserId?: string;
  topic?: SupportTopic;
  slaRisk?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  now: Date;
}

export async function listAdminTickets(storeId: string, f: AdminListFilters) {
  const where: Prisma.SupportTicketWhereInput = { storeId };
  if (f.status) where.status = f.status;
  if (f.assigneePlatformUserId) where.assigneePlatformUserId = f.assigneePlatformUserId;
  if (f.topic) where.topic = f.topic;
  if (f.slaRisk) {
    // TD-177-2: yalnız LIVE (en yüksek) cycle değerlendirilir. Aktif bir ticket'ta live snapshot,
    // tek `resolvedAt:null` olan snapshot'tır — reopen ancak RESOLVED sonrası olur, dolayısıyla
    // önceki cycle'lar resolved (resolvedAt≠null) olur. `resolvedAt:null` koşulu historical
    // overdue-resolved cycle'ları eler → reopen'lı ticket'larda false-positive yok. Risk =
    // live snapshot'ta resolution VEYA first-response OVERDUE; bu, inbox SLA rozetinin kanonik
    // hesabıyla (live snapshot + slaStateFor "OVERDUE") birebir aynıdır.
    where.status = { in: ACTIVE_TICKET_STATUSES };
    where.slaSnapshots = {
      some: {
        resolvedAt: null,
        OR: [
          { resolutionDueAt: { lt: f.now } },
          { firstResponseMetAt: null, firstResponseDueAt: { lt: f.now } },
        ],
      },
    };
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim();
    where.OR = [
      { ticketNumber: { contains: q, mode: "insensitive" } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { product: { title: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        ticketNumber: true,
        topic: true,
        status: true,
        lastActivityAt: true,
        assigneePlatformUserId: true,
        customer: { select: { firstName: true, lastName: true, email: true } },
        product: { select: { title: true } },
        order: { select: { orderNumber: true } },
        slaSnapshots: {
          select: { cycle: true, firstResponseDueAt: true, resolutionDueAt: true, firstResponseMetAt: true, resolvedAt: true },
        },
      },
    }),
  ]);

  const assigneeIds = [...new Set(rows.map((r) => r.assigneePlatformUserId).filter(Boolean))] as string[];
  const assignees = assigneeIds.length
    ? await prisma.platformUser.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : [];
  const assigneeName = new Map(assignees.map((a) => [a.id, a.name]));

  const items = rows.map((r) => {
    const terminal = r.status === "RESOLVED" || r.status === "CLOSED";
    // TD-177-2: SLA rozeti yalnız live (en yüksek) cycle'dan; historical cycle'lar KPI'ya girmez.
    const live = liveSlaSnapshot(r.slaSnapshots);
    return {
      ticketId: r.id,
      ticketNumber: r.ticketNumber,
      customerName: fullNameOf(r.customer),
      customerEmail: r.customer.email,
      productTitle: r.product.title,
      orderNumber: r.order.orderNumber,
      topic: r.topic,
      status: r.status,
      assigneeName: r.assigneePlatformUserId ? (assigneeName.get(r.assigneePlatformUserId) ?? null) : null,
      firstResponseState: live
        ? slaStateFor(live.firstResponseDueAt, live.firstResponseMetAt, f.now, terminal)
        : ("DONE" as const),
      resolutionState: live
        ? slaStateFor(live.resolutionDueAt, live.resolvedAt, f.now, terminal)
        : ("DONE" as const),
      lastActivityAt: r.lastActivityAt.toISOString(),
    };
  });
  return { items, page: f.page, pageSize: f.pageSize, total };
}

function fullNameOf(c: { firstName: string | null; lastName: string | null }): string | null {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n.length ? n : null;
}

// ---------- admin: detail ----------

export async function getAdminTicketDetail(
  storeId: string,
  ticketId: string,
  attachmentBase: string,
  now: Date,
) {
  const row = await prisma.supportTicket.findFirst({
    where: { id: ticketId, storeId },
    include: adminDetailInclude,
  });
  if (!row) return null;
  const assignee = row.assigneePlatformUserId
    ? await prisma.platformUser.findUnique({ where: { id: row.assigneePlatformUserId }, select: { name: true } })
    : null;
  return projectAdminTicketDetail(
    row as unknown as AdminTicketDetailRow,
    attachmentBase,
    assignee?.name ?? null,
    now,
  );
}

// ---------- admin: message ----------

export async function addAdminMessage(
  input: {
    storeId: string;
    ticketId: string;
    actorUserId: string;
    body: string;
    attachments?: string[];
  },
  dispatcher: SupportNotificationDispatcher,
  now: Date,
): Promise<MessageResult> {
  const out = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { id: input.ticketId, storeId: input.storeId },
      select: { id: true, ticketNumber: true, status: true, version: true, firstResponseAt: true },
    });
    if (!ticket) return { ok: false, code: "TICKET_NOT_FOUND" } as const;
    if (ticket.status === "CLOSED") return { ok: false, code: "TICKET_CLOSED" } as const;

    const attachCheck = await validateAttachments(tx, input.storeId, input.attachments ?? [], null);
    if (!attachCheck.ok) return attachCheck;

    const message = await tx.supportTicketMessage.create({
      data: {
        storeId: input.storeId,
        ticketId: ticket.id,
        actorType: "STORE_ADMIN",
        actorId: input.actorUserId,
        body: input.body,
      },
      select: { id: true },
    });
    if (attachCheck.assets.length > 0) {
      await tx.supportTicketAttachment.createMany({
        data: attachCheck.assets.map((a) => ({
          storeId: input.storeId,
          ticketId: ticket.id,
          ticketMessageId: message.id,
          mediaAssetId: a.id,
          type: attachmentType(a.mimeType),
        })),
      });
    }

    const firstResponse = ticket.firstResponseAt == null;
    const target: SupportTicketStatus | null =
      ticket.status === "OPEN" || ticket.status === "WAITING_STORE" ? "WAITING_CUSTOMER" : null;
    const updated = await tx.supportTicket.updateMany({
      where: { id: ticket.id, storeId: input.storeId, version: ticket.version },
      data: {
        lastActivityAt: now,
        version: { increment: 1 },
        ...(firstResponse ? { firstResponseAt: now } : {}),
        ...(target ? { status: target } : {}),
      },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;

    if (firstResponse) {
      const live = await tx.supportSlaSnapshot.findFirst({
        where: { storeId: input.storeId, ticketId: ticket.id },
        orderBy: { cycle: "desc" },
        select: { id: true, firstResponseMetAt: true },
      });
      if (live && live.firstResponseMetAt == null) {
        await tx.supportSlaSnapshot.update({
          where: { id: live.id },
          data: { firstResponseMetAt: now },
        });
      }
    }
    if (target) {
      await tx.supportTicketStatusHistory.create({
        data: {
          storeId: input.storeId,
          ticketId: ticket.id,
          fromStatus: ticket.status,
          toStatus: target,
          actorType: "STORE_ADMIN",
          actorId: input.actorUserId,
          eventType: "TICKET_STORE_REPLY",
        },
      });
    }
    return { ok: true, ticketId: ticket.id, ticketNumber: ticket.ticketNumber } as const;
  });

  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      ticketId: out.ticketId,
      ticketNumber: out.ticketNumber,
      event: "TICKET_STORE_REPLY",
      recipient: "CUSTOMER",
    });
    return { ok: true };
  }
  return out;
}

// ---------- admin: action (assign / set status) ----------

export type AdminActionResult =
  | { ok: true }
  | Err<"TICKET_NOT_FOUND" | "INVALID_TRANSITION" | "VERSION_CONFLICT">;

export async function applyAdminAction(
  input:
    | { kind: "ASSIGN"; storeId: string; ticketId: string; actorUserId: string; expectedVersion: number; assigneePlatformUserId: string }
    | { kind: "SET_STATUS"; storeId: string; ticketId: string; actorUserId: string; expectedVersion: number; toStatus: SupportTicketStatus; note?: string; now: Date },
  dispatcher: SupportNotificationDispatcher,
): Promise<AdminActionResult> {
  const out = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { id: input.ticketId, storeId: input.storeId },
      select: { id: true, ticketNumber: true, status: true, version: true },
    });
    if (!ticket) return { ok: false, code: "TICKET_NOT_FOUND" } as const;

    if (input.kind === "ASSIGN") {
      const assignee =
        input.assigneePlatformUserId === "me" ? input.actorUserId : input.assigneePlatformUserId;
      const updated = await tx.supportTicket.updateMany({
        where: { id: ticket.id, storeId: input.storeId, version: input.expectedVersion },
        data: { assigneePlatformUserId: assignee, version: { increment: 1 } },
      });
      if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
      await tx.supportTicketStatusHistory.create({
        data: {
          storeId: input.storeId,
          ticketId: ticket.id,
          fromStatus: ticket.status,
          toStatus: ticket.status,
          actorType: "STORE_ADMIN",
          actorId: input.actorUserId,
          eventType: "TICKET_ASSIGNED",
          metadata: { assigneePlatformUserId: assignee } as Prisma.InputJsonValue,
        },
      });
      return { ok: true } as const;
    }

    // SET_STATUS
    const actor: SupportActor = "STORE_ADMIN";
    const check = evaluateStatusTransition(ticket.status, input.toStatus, actor);
    if (!check.ok) return { ok: false, code: "INVALID_TRANSITION" } as const;
    const now = input.now;
    const updated = await tx.supportTicket.updateMany({
      where: { id: ticket.id, storeId: input.storeId, version: input.expectedVersion },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        lastActivityAt: now,
        ...(input.toStatus === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(input.toStatus === "CLOSED" ? { closedAt: now } : {}),
      },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;

    const eventType =
      input.toStatus === "RESOLVED" ? "TICKET_RESOLVED" : `TICKET_STATUS_${input.toStatus}`;
    await tx.supportTicketStatusHistory.create({
      data: {
        storeId: input.storeId,
        ticketId: ticket.id,
        fromStatus: ticket.status,
        toStatus: input.toStatus,
        actorType: "STORE_ADMIN",
        actorId: input.actorUserId,
        eventType,
        note: input.note?.trim() || null,
      },
    });
    if (input.toStatus === "RESOLVED") {
      const live = await tx.supportSlaSnapshot.findFirst({
        where: { storeId: input.storeId, ticketId: ticket.id },
        orderBy: { cycle: "desc" },
        select: { id: true },
      });
      if (live) await tx.supportSlaSnapshot.update({ where: { id: live.id }, data: { resolvedAt: now } });
    }
    return { ok: true, resolved: input.toStatus === "RESOLVED", ticketNumber: ticket.ticketNumber, ticketId: ticket.id } as const;
  });

  if (out.ok && "resolved" in out && out.resolved) {
    await notify(dispatcher, {
      storeId: input.storeId,
      ticketId: out.ticketId,
      ticketNumber: out.ticketNumber,
      event: "TICKET_RESOLVED",
      recipient: "CUSTOMER",
    });
  }
  return out.ok ? { ok: true } : out;
}

// ---------- notification helper (best-effort, post-commit, never throws) ----------

async function notify(
  dispatcher: SupportNotificationDispatcher,
  input: {
    storeId: string;
    ticketId: string;
    ticketNumber: string;
    event: SupportNotificationEvent;
    recipient: "CUSTOMER" | "STORE_ADMIN";
  },
): Promise<void> {
  try {
    await dispatcher.sendTicketNotification(input);
  } catch {
    // in-app history/message zaten yazıldı; e-posta best-effort — hata ticket'ı ETKİLEMEZ.
  }
}

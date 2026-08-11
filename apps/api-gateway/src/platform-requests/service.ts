/**
 * TODO-178 (Faz B) — Store→Platform Request lifecycle servisi (framework-agnostik).
 *
 * storeId-first explicit scoping; sentinel-result hata stili; optimistic `version` guard (conditional
 * updateMany); append-only history AYNI transaction'da; global PR-###### numarası advisory-lock +
 * singleton counter ile; SLA cycle snapshot'ları; notification post-commit best-effort (rollback YOK).
 * Product Support tablolarını/enum'larını REUSE ETMEZ — yalnız desen. INTERNAL içerik store yüzeyine
 * ASLA sızmaz (serialize.ts allowlist projeksiyonu).
 */

import { prisma } from "@commerce-os/db";
import type {
  Prisma,
  PlatformRequestStatus,
  PlatformRequestPriority,
  PlatformRequestStoreImpact,
  PlatformRequestCloseReason,
  PlatformRequestContextKind,
  PlatformRequestActorKind,
} from "@prisma/client";
import {
  DEFAULT_PLATFORM_REQUEST_SLA_POLICY,
  resolvePlatformRequestSlaTarget,
  computePlatformRequestDueAts,
  deriveInitialPriority,
  formatPlatformRequestNumber,
} from "@commerce-os/config";
import { PLATFORM_REQUEST_UNASSIGNED_FILTER } from "@commerce-os/contracts";
import {
  evaluateTransition,
  evaluateClose,
  evaluateReopen,
} from "./status-map.js";
import {
  projectStoreListItem,
  projectStoreRequestDetail,
  projectStoreTimeline,
  projectStoreAttachments,
  projectPlatformAttachments,
  projectPlatformListItem,
  projectPlatformRequestDetail,
  type StoreRequestDetailRow,
  type PlatformRequestDetailRow,
} from "./serialize.js";
import type { PlatformRequestNotificationDispatcher } from "./notification.js";

type Err<C extends string> = { ok: false; code: C };

const GLOBAL_COUNTER_ID = "global";

export const ACTIVE_REQUEST_STATUSES: PlatformRequestStatus[] = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_STORE",
];

// ---------- number allocation (GLOBAL; advisory-lock + singleton counter) ----------

async function nextRequestNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Tek global anahtar → tüm store'lar arası sıralı, çakışmasız (tx commit/rollback'te otomatik salınır).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"platform-request:number"}))`;
  const counter = await tx.platformRequestNumberCounter.upsert({
    where: { id: GLOBAL_COUNTER_ID },
    create: { id: GLOBAL_COUNTER_ID, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return formatPlatformRequestNumber(counter.lastValue);
}

// ---------- SLA snapshot ----------

async function writeSlaSnapshot(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string;
    requestId: string;
    cycle: number;
    categoryKey: string;
    slaPolicyKey: string;
    priority: PlatformRequestPriority;
    now: Date;
  },
) {
  const target = resolvePlatformRequestSlaTarget(DEFAULT_PLATFORM_REQUEST_SLA_POLICY, args.slaPolicyKey);
  const { firstResponseDueAt, resolutionDueAt } = computePlatformRequestDueAts(args.now, target);
  await tx.platformRequestSlaSnapshot.create({
    data: {
      storeId: args.storeId,
      requestId: args.requestId,
      cycle: args.cycle,
      categoryKey: args.categoryKey,
      priority: args.priority,
      firstResponseDueAt,
      resolutionDueAt,
    },
  });
}

// Canonical first-response marker: live cycle'ın firstResponseMetAt'ini (null ise) işaretler.
// INTERNAL note ASLA çağırmaz (yalnız platform STORE_VISIBLE reply veya TRIAGED aksiyonu).
async function markLiveFirstResponse(tx: Prisma.TransactionClient, storeId: string, requestId: string, now: Date) {
  const live = await tx.platformRequestSlaSnapshot.findFirst({
    where: { storeId, requestId },
    orderBy: { cycle: "desc" },
    select: { id: true, firstResponseMetAt: true },
  });
  if (live && live.firstResponseMetAt == null) {
    await tx.platformRequestSlaSnapshot.update({ where: { id: live.id }, data: { firstResponseMetAt: now } });
  }
}

// ---------- notification helper (best-effort, post-commit, never throws) ----------

async function notify(
  dispatcher: PlatformRequestNotificationDispatcher,
  input: Parameters<PlatformRequestNotificationDispatcher["sendRequestNotification"]>[0],
): Promise<void> {
  try {
    await dispatcher.sendRequestNotification(input);
  } catch {
    // in-app history/message zaten yazıldı; e-posta best-effort — domain'i ETKİLEMEZ.
  }
}

// ---------- create ----------

export type CreateRequestResult =
  | { ok: true; requestId: string; requestNumber: string }
  | Err<"CATEGORY_NOT_FOUND" | "CATEGORY_INACTIVE">;

export interface CreateRequestInput {
  storeId: string;
  categoryKey: string;
  subject: string;
  description: string;
  storeImpact?: PlatformRequestStoreImpact;
  contextKind?: PlatformRequestContextKind;
  contextSnapshot?: unknown;
  // name/email verilmezse acting PlatformUser'dan doldurulur (route yalnız {kind,id} geçebilir).
  actor: { kind: PlatformRequestActorKind; id: string; name?: string; email?: string };
}

export async function createRequest(
  input: CreateRequestInput,
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<CreateRequestResult> {
  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.platformRequestCategory.findUnique({
      where: { key: input.categoryKey },
      select: { id: true, key: true, labelTr: true, labelEn: true, defaultPriority: true, slaPolicyKey: true, active: true },
    });
    if (!category) return { ok: false, code: "CATEGORY_NOT_FOUND" } as const;
    if (!category.active) return { ok: false, code: "CATEGORY_INACTIVE" } as const;

    // Creator snapshot: name/email verilmemişse acting PlatformUser'dan (auth gerçekliği) çözülür.
    let createdByName = input.actor.name;
    let createdByEmail = input.actor.email;
    if (!createdByName || !createdByEmail) {
      const u = await tx.platformUser.findUnique({
        where: { id: input.actor.id },
        select: { name: true, email: true },
      });
      createdByName = createdByName || u?.name || input.actor.id;
      createdByEmail = createdByEmail || u?.email || "";
    }

    const priority = deriveInitialPriority(category.defaultPriority, input.storeImpact);
    const requestNumber = await nextRequestNumber(tx);

    const request = await tx.platformRequest.create({
      data: {
        storeId: input.storeId,
        requestNumber,
        categoryId: category.id,
        categoryKey: category.key,
        categoryLabel: category.labelTr,
        categoryLabelEn: category.labelEn,
        subject: input.subject,
        description: input.description,
        status: "OPEN",
        priority,
        storeImpact: input.storeImpact ?? null,
        contextKind: input.contextKind ?? "NONE",
        contextSnapshot: (input.contextSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        createdByActorKind: input.actor.kind,
        createdByActorId: input.actor.id,
        createdByName,
        createdByEmail,
        lastActivityAt: now,
        history: {
          create: {
            storeId: input.storeId,
            eventType: "REQUEST_OPENED",
            fromStatus: null,
            toStatus: "OPEN",
            actorType: "STORE",
            actorId: input.actor.id,
          },
        },
      },
      select: { id: true, requestNumber: true },
    });

    await writeSlaSnapshot(tx, {
      storeId: input.storeId,
      requestId: request.id,
      cycle: 1,
      categoryKey: category.key,
      slaPolicyKey: category.slaPolicyKey,
      priority,
      now,
    });
    return { ok: true, requestId: request.id, requestNumber: request.requestNumber } as const;
  });

  if (result.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      requestId: result.requestId,
      requestNumber: result.requestNumber,
      event: "REQUEST_OPENED",
      recipient: "PLATFORM",
    });
  }
  return result;
}

// ---------- store reads ----------

export interface StoreListFilters {
  status?: PlatformRequestStatus;
  categoryKey?: string;
  slaRisk?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  now: Date;
}

export async function listStoreRequests(storeId: string, f: StoreListFilters) {
  const where: Prisma.PlatformRequestWhereInput = { storeId };
  if (f.status) where.status = f.status;
  // TD-178-4: kategori filtresi CURRENT kategori (relation) üzerinden — snapshot değil.
  if (f.categoryKey) where.category = { key: f.categoryKey };
  if (f.slaRisk) {
    // TODO-178 (Faz D) — platform inbox slaRisk paritesi: yalnız LIVE (resolvedAt:null) cycle;
    // aktif request'lerde first-response veya resolution vadesi geçmiş olanlar. Store-scoped.
    where.status = { in: ACTIVE_REQUEST_STATUSES };
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
      { requestNumber: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.platformRequest.count({ where }),
    prisma.platformRequest.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        requestNumber: true,
        subject: true,
        status: true,
        priority: true,
        storeImpact: true,
        assigneePlatformUserId: true,
        createdAt: true,
        lastActivityAt: true,
        category: { select: { key: true, labelTr: true, labelEn: true } },
        slaSnapshots: true,
      },
    }),
  ]);

  // TD-178-6 paritesi: assignee adı ayrı sorgu ile çözülür (raw id store DTO'suna GİRMEZ). Silinmiş
  // kullanıcı → map'te yok → null (güvenli fallback). N+1 yok: tek toplu findMany.
  const assigneeIds = [...new Set(rows.map((r) => r.assigneePlatformUserId).filter(Boolean))] as string[];
  const assignees = assigneeIds.length
    ? await prisma.platformUser.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(assignees.map((a) => [a.id, a.name]));

  const items = rows.map((r) =>
    projectStoreListItem(
      {
        id: r.id,
        requestNumber: r.requestNumber,
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        storeImpact: r.storeImpact,
        createdAt: r.createdAt,
        lastActivityAt: r.lastActivityAt,
        category: r.category,
        slaSnapshots: r.slaSnapshots,
        assigneeName: r.assigneePlatformUserId
          ? nameById.get(r.assigneePlatformUserId) ?? null
          : null,
      },
      f.now,
    ),
  );
  return { items, page: f.page, pageSize: f.pageSize, total };
}

export async function getStoreRequestDetail(storeId: string, requestId: string, now: Date) {
  const row = await prisma.platformRequest.findFirst({
    where: { id: requestId, storeId },
    include: {
      messages: true,
      slaSnapshots: true,
      category: { select: { key: true, labelTr: true, labelEn: true } },
      history: true,
      // TODO-178 (Faz E) — serializer YALNIZ STORE_VISIBLE'ı yansıtır (defense-in-depth: DB'den hepsi gelse de).
      attachments: { select: { id: true, type: true, visibility: true, createdAt: true } },
    },
  });
  if (!row) return null;
  // TODO-178 (Faz D) — assignee adı çözümü (raw id store DTO'suna GİRMEZ); silinmiş/atanmamış → null.
  const assigneeName = row.assigneePlatformUserId
    ? (
        await prisma.platformUser.findUnique({
          where: { id: row.assigneePlatformUserId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  // TODO-178 (Faz D follow-up) — Store audit timeline. History satırındaki ASSIGNED/RECATEGORIZED
  // event'lerinin ham id'leri (metadata) YALNIZ ad/label'a çözülür; raw id/note/metadata store'a GİRMEZ.
  const tlAssigneeIds = new Set<string>();
  const tlCategoryIds = new Set<string>();
  for (const h of row.history) {
    const m = h.metadata && typeof h.metadata === "object" ? (h.metadata as Record<string, unknown>) : {};
    if (h.eventType === "REQUEST_ASSIGNED" && typeof m.assigneePlatformUserId === "string") {
      tlAssigneeIds.add(m.assigneePlatformUserId);
    }
    if (h.eventType === "REQUEST_RECATEGORIZED" && typeof m.toCategoryId === "string") {
      tlCategoryIds.add(m.toCategoryId);
    }
  }
  const [tlAssignees, tlCategories] = await Promise.all([
    tlAssigneeIds.size
      ? prisma.platformUser.findMany({ where: { id: { in: [...tlAssigneeIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    tlCategoryIds.size
      ? prisma.platformRequestCategory.findMany({
          where: { id: { in: [...tlCategoryIds] } },
          select: { id: true, key: true, labelTr: true, labelEn: true },
        })
      : Promise.resolve([]),
  ]);
  // Ghost/isimsiz (name null) → map dışı → serializer güvenli fallback (null) verir.
  const tlAssigneeName = new Map<string, string>(
    tlAssignees.flatMap((a) => (a.name != null ? [[a.id, a.name] as [string, string]] : [])),
  );
  const tlCategoryById = new Map(
    tlCategories.map((c) => [c.id, { key: c.key, labelTr: c.labelTr, labelEn: c.labelEn }]),
  );
  const timeline = projectStoreTimeline(row.history, tlAssigneeName, tlCategoryById);
  const attachments = projectStoreAttachments(row.attachments);

  return projectStoreRequestDetail(row as unknown as StoreRequestDetailRow, assigneeName, timeline, attachments, now);
}

// TODO-178 (Faz D) — Store create/filtre için YALNIZ AKTİF taksonomi (raw operasyonel alanlar —
// defaultPriority/slaPolicyKey/active — store'a dönmez; minimal {key,labelTr,labelEn} projeksiyon).
export async function listActiveStoreRequestCategories() {
  return prisma.platformRequestCategory.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    select: { key: true, labelTr: true, labelEn: true },
  });
}

// ---------- store: message ----------

export type StoreMessageResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "REQUEST_CLOSED" | "VERSION_CONFLICT">;

export async function addStoreVisibleMessage(
  input: { storeId: string; requestId: string; actorId: string; body: string },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<StoreMessageResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findFirst({
      where: { id: input.requestId, storeId: input.storeId },
      select: { id: true, status: true, version: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    if (request.status === "CLOSED") return { ok: false, code: "REQUEST_CLOSED" } as const;

    await tx.platformRequestMessage.create({
      data: {
        storeId: input.storeId,
        requestId: request.id,
        authorType: "STORE",
        actorId: input.actorId,
        visibility: "STORE_VISIBLE", // server-authoritative: store yazarı DAİMA STORE_VISIBLE
        body: input.body,
      },
    });

    // Store cevabı WAITING_STORE'dan gelirse server-authoritative IN_PROGRESS'e döner.
    const target: PlatformRequestStatus | null = request.status === "WAITING_STORE" ? "IN_PROGRESS" : null;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, storeId: input.storeId, version: request.version },
      data: { lastActivityAt: now, version: { increment: 1 }, ...(target ? { status: target } : {}) },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    if (target) {
      await tx.platformRequestHistory.create({
        data: {
          storeId: input.storeId,
          requestId: request.id,
          eventType: "REQUEST_STORE_REPLY",
          fromStatus: request.status,
          toStatus: target,
          actorType: "STORE",
          actorId: input.actorId,
        },
      });
    } else {
      await tx.platformRequestHistory.create({
        data: {
          storeId: input.storeId,
          requestId: request.id,
          eventType: "REQUEST_STORE_REPLY",
          actorType: "STORE",
          actorId: input.actorId,
        },
      });
    }
    return { ok: true, requestId: request.id } as const;
  });

  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      requestId: out.requestId,
      requestNumber: "",
      event: "REQUEST_STORE_REPLY",
      recipient: "PLATFORM",
    });
    return { ok: true };
  }
  return out;
}

// ---------- store: withdraw / confirm-close / reopen ----------

export type StoreCloseResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "CANNOT_WITHDRAW" | "VERSION_CONFLICT">;

export async function withdrawRequest(
  input: { storeId: string; requestId: string; actorId: string; expectedVersion: number },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<StoreCloseResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findFirst({
      where: { id: input.requestId, storeId: input.storeId },
      select: { id: true, requestNumber: true, status: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    const verdict = evaluateClose(request.status, "STORE", "WITHDRAWN_BY_STORE");
    if (!verdict.ok) return { ok: false, code: "CANNOT_WITHDRAW" } as const;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, storeId: input.storeId, version: input.expectedVersion },
      data: { status: "CLOSED", closeReason: "WITHDRAWN_BY_STORE", closedAt: now, lastActivityAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: input.storeId,
        requestId: request.id,
        eventType: "REQUEST_CLOSED",
        fromStatus: request.status,
        toStatus: "CLOSED",
        actorType: "STORE",
        actorId: input.actorId,
        metadata: { closeReason: "WITHDRAWN_BY_STORE" } as Prisma.InputJsonValue,
      },
    });
    return { ok: true, requestId: request.id, requestNumber: request.requestNumber } as const;
  });
  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_CLOSED",
      recipient: "PLATFORM",
    });
    return { ok: true };
  }
  return out;
}

export type ConfirmCloseResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "CANNOT_CONFIRM_CLOSE" | "VERSION_CONFLICT">;

export async function confirmClose(
  input: { storeId: string; requestId: string; actorId: string; expectedVersion: number },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<ConfirmCloseResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findFirst({
      where: { id: input.requestId, storeId: input.storeId },
      select: { id: true, requestNumber: true, status: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    const verdict = evaluateClose(request.status, "STORE", "COMPLETED");
    if (!verdict.ok) return { ok: false, code: "CANNOT_CONFIRM_CLOSE" } as const;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, storeId: input.storeId, version: input.expectedVersion },
      data: { status: "CLOSED", closeReason: "COMPLETED", closedAt: now, lastActivityAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: input.storeId,
        requestId: request.id,
        eventType: "REQUEST_CLOSED",
        fromStatus: request.status,
        toStatus: "CLOSED",
        actorType: "STORE",
        actorId: input.actorId,
        metadata: { closeReason: "COMPLETED" } as Prisma.InputJsonValue,
      },
    });
    return { ok: true, requestId: request.id, requestNumber: request.requestNumber } as const;
  });
  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_CLOSED",
      recipient: "PLATFORM",
    });
    return { ok: true };
  }
  return out;
}

export type ReopenResult =
  | { ok: true }
  | Err<
      | "REQUEST_NOT_FOUND"
      | "REOPEN_WINDOW_EXPIRED"
      | "CLOSED_CANNOT_REOPEN"
      | "INVALID_TRANSITION"
      | "NOT_OWNER"
      | "VERSION_CONFLICT"
    >;

export async function reopenRequest(
  input: { storeId: string; requestId: string; actorId: string; expectedVersion: number },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<ReopenResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findFirst({
      where: { id: input.requestId, storeId: input.storeId },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        resolvedAt: true,
        version: true,
        priority: true,
        // TD-178-4: taze SLA döngüsü CURRENT kategoriden (relation) türetilir, snapshot'tan değil.
        category: { select: { key: true, slaPolicyKey: true } },
      },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    // Store-scoped erişim = talep eden mağaza → owner. evaluateReopen owner param'ı true.
    const check = evaluateReopen(request.status, request.resolvedAt, now, true);
    if (!check.ok) {
      return { ok: false, code: check.code as Exclude<typeof check.code, "OK"> } as const;
    }
    const maxCycle = (
      await tx.platformRequestSlaSnapshot.aggregate({
        where: { storeId: input.storeId, requestId: request.id },
        _max: { cycle: true },
      })
    )._max.cycle;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, storeId: input.storeId, version: input.expectedVersion },
      data: { status: "IN_PROGRESS", reopenCount: { increment: 1 }, resolvedAt: null, lastActivityAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: input.storeId,
        requestId: request.id,
        eventType: "REQUEST_REOPENED",
        fromStatus: "RESOLVED",
        toStatus: "IN_PROGRESS",
        actorType: "STORE",
        actorId: input.actorId,
      },
    });
    await writeSlaSnapshot(tx, {
      storeId: input.storeId,
      requestId: request.id,
      cycle: (maxCycle ?? 1) + 1,
      categoryKey: request.category.key,
      slaPolicyKey: request.category.slaPolicyKey,
      priority: request.priority,
      now,
    });
    return { ok: true, requestId: request.id, requestNumber: request.requestNumber } as const;
  });
  if (out.ok) {
    await notify(dispatcher, {
      storeId: input.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_REOPENED",
      recipient: "PLATFORM",
    });
    return { ok: true };
  }
  return out;
}

// ---------- platform reads ----------

export interface PlatformListFilters {
  status?: PlatformRequestStatus;
  priority?: PlatformRequestPriority;
  categoryKey?: string;
  assigneePlatformUserId?: string;
  storeId?: string;
  slaRisk?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  now: Date;
}

export async function listPlatformRequests(f: PlatformListFilters) {
  const where: Prisma.PlatformRequestWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.priority) where.priority = f.priority;
  // TD-178-4: CURRENT kategori (relation) üzerinden filtre — snapshot değil.
  if (f.categoryKey) where.category = { key: f.categoryKey };
  // TD-178-6: assignee filtresi — sentinel "__unassigned__" → atanmamış (null); aksi id eşitliği.
  if (f.assigneePlatformUserId === PLATFORM_REQUEST_UNASSIGNED_FILTER) {
    where.assigneePlatformUserId = null;
  } else if (f.assigneePlatformUserId) {
    where.assigneePlatformUserId = f.assigneePlatformUserId;
  }
  if (f.storeId) where.storeId = f.storeId;
  if (f.slaRisk) {
    // Yalnız LIVE (en yüksek) cycle; aktif request'te live snapshot = tek `resolvedAt:null` olan
    // (reopen ancak RESOLVED sonrası → önceki cycle'lar resolved). Product Support slaRisk paritesi.
    where.status = { in: ACTIVE_REQUEST_STATUSES };
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
      { requestNumber: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.platformRequest.count({ where }),
    prisma.platformRequest.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        requestNumber: true,
        storeId: true,
        subject: true,
        priority: true,
        status: true,
        assigneePlatformUserId: true,
        lastActivityAt: true,
        store: { select: { name: true } },
        category: { select: { key: true, labelTr: true, labelEn: true } },
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

  const items = rows.map((r) =>
    projectPlatformListItem(
      {
        id: r.id,
        requestNumber: r.requestNumber,
        storeId: r.storeId,
        category: r.category,
        subject: r.subject,
        priority: r.priority,
        status: r.status,
        assigneePlatformUserId: r.assigneePlatformUserId,
        lastActivityAt: r.lastActivityAt,
        slaSnapshots: r.slaSnapshots as never,
        storeName: r.store.name,
        assigneeName: r.assigneePlatformUserId ? (assigneeName.get(r.assigneePlatformUserId) ?? null) : null,
      },
      f.now,
    ),
  );
  return { items, page: f.page, pageSize: f.pageSize, total };
}

export async function getPlatformRequestDetail(requestId: string, now: Date) {
  const row = await prisma.platformRequest.findUnique({
    where: { id: requestId },
    include: {
      messages: true,
      slaSnapshots: true,
      history: true,
      store: { select: { name: true } },
      category: { select: { key: true, labelTr: true, labelEn: true } },
      // TODO-178 (Faz E) — platform tam yüzey: STORE_VISIBLE + INTERNAL ekler.
      attachments: { select: { id: true, type: true, visibility: true, createdAt: true } },
    },
  });
  if (!row) return null;
  const assignee = row.assigneePlatformUserId
    ? await prisma.platformUser.findUnique({ where: { id: row.assigneePlatformUserId }, select: { name: true } })
    : null;
  const detailRow = { ...row, timeline: row.history } as unknown as PlatformRequestDetailRow;
  const attachments = projectPlatformAttachments(row.attachments);
  return projectPlatformRequestDetail(detailRow, assignee?.name ?? null, row.store.name, attachments, now);
}

// ---------- platform: assign / priority / status / recategorize ----------

export type AssignResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "ASSIGNEE_NOT_FOUND" | "VERSION_CONFLICT">;

export async function assignRequest(
  input: {
    requestId: string;
    actorUserId: string;
    expectedVersion: number;
    assigneePlatformUserId: string;
  },
  dispatcher: PlatformRequestNotificationDispatcher,
): Promise<AssignResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, storeId: true, requestNumber: true, status: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;

    // "me" = actor (guard'dan geçmiş platform admin). Aksi hâlde gerçek PlatformUser doğrulanır.
    const assignee = input.assigneePlatformUserId === "me" ? input.actorUserId : input.assigneePlatformUserId;
    if (input.assigneePlatformUserId !== "me") {
      const exists = await tx.platformUser.findUnique({ where: { id: assignee }, select: { id: true } });
      if (!exists) return { ok: false, code: "ASSIGNEE_NOT_FOUND" } as const;
    }
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, version: input.expectedVersion },
      data: { assigneePlatformUserId: assignee, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        eventType: "REQUEST_ASSIGNED",
        actorType: "PLATFORM",
        actorId: input.actorUserId,
        metadata: { assigneePlatformUserId: assignee } as Prisma.InputJsonValue,
      },
    });
    return { ok: true, storeId: request.storeId, requestId: request.id, requestNumber: request.requestNumber } as const;
  });

  // TODO-178 (Faz E §7) — assigned event bildirimi (best-effort, post-commit; store'a "talebiniz
  // bir temsilciye atandı"). Payload safe (requestNumber + event); raw body/PII taşımaz.
  if (out.ok) {
    await notify(dispatcher, {
      storeId: out.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_ASSIGNED",
      recipient: "STORE",
    });
  }
  return out.ok ? { ok: true } : out;
}

export type PriorityResult = { ok: true } | Err<"REQUEST_NOT_FOUND" | "VERSION_CONFLICT">;

export async function setPriority(input: {
  requestId: string;
  actorUserId: string;
  expectedVersion: number;
  priority: PlatformRequestPriority;
}): Promise<PriorityResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, storeId: true, priority: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, version: input.expectedVersion },
      data: { priority: input.priority, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        eventType: "REQUEST_PRIORITY_CHANGED",
        actorType: "PLATFORM",
        actorId: input.actorUserId,
        metadata: { from: request.priority, to: input.priority } as Prisma.InputJsonValue,
      },
    });
    return { ok: true } as const;
  });
}

export type SetStatusResult =
  | { ok: true }
  | Err<
      | "REQUEST_NOT_FOUND"
      | "INVALID_TRANSITION"
      | "CLOSE_REASON_REQUIRED"
      | "INVALID_CLOSE_REASON"
      | "ACTOR_NOT_ALLOWED"
      | "ALREADY_CLOSED"
      | "VERSION_CONFLICT"
    >;

export async function setStatus(
  input: {
    requestId: string;
    actorUserId: string;
    expectedVersion: number;
    toStatus: PlatformRequestStatus;
    closeReason?: PlatformRequestCloseReason;
    note?: string;
  },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<SetStatusResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, storeId: true, requestNumber: true, status: true, firstResponseAt: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;

    // CLOSED → generic transition BYPASS edilmez; evaluateClose (reason zorunlu).
    if (input.toStatus === "CLOSED") {
      if (!input.closeReason) return { ok: false, code: "CLOSE_REASON_REQUIRED" } as const;
      const verdict = evaluateClose(request.status, "PLATFORM", input.closeReason);
      if (!verdict.ok) return { ok: false, code: verdict.code as Exclude<typeof verdict.code, "OK"> } as const;
    } else {
      const verdict = evaluateTransition(request.status, input.toStatus, "PLATFORM");
      if (!verdict.ok) return { ok: false, code: "INVALID_TRANSITION" } as const;
    }

    const resolving = input.toStatus === "RESOLVED";
    const closing = input.toStatus === "CLOSED";
    // TRIAGED (ilk platform aksiyonu) da canonical first-response sayılır.
    const marksFirstResponse = input.toStatus === "TRIAGED" && request.firstResponseAt == null;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, version: input.expectedVersion },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        lastActivityAt: now,
        ...(marksFirstResponse ? { firstResponseAt: now } : {}),
        ...(resolving ? { resolvedAt: now } : {}),
        ...(closing ? { closedAt: now, closeReason: input.closeReason } : {}),
      },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;

    if (marksFirstResponse) await markLiveFirstResponse(tx, request.storeId, request.id, now);
    if (resolving) {
      const live = await tx.platformRequestSlaSnapshot.findFirst({
        where: { storeId: request.storeId, requestId: request.id },
        orderBy: { cycle: "desc" },
        select: { id: true },
      });
      if (live) await tx.platformRequestSlaSnapshot.update({ where: { id: live.id }, data: { resolvedAt: now } });
    }

    const eventType = resolving
      ? "REQUEST_RESOLVED"
      : closing
        ? "REQUEST_CLOSED"
        : `REQUEST_STATUS_${input.toStatus}`;
    await tx.platformRequestHistory.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        eventType,
        fromStatus: request.status,
        toStatus: input.toStatus,
        actorType: "PLATFORM",
        actorId: input.actorUserId,
        note: input.note?.trim() || null,
        ...(closing ? { metadata: { closeReason: input.closeReason } as Prisma.InputJsonValue } : {}),
      },
    });
    return { ok: true, resolving, storeId: request.storeId, requestId: request.id, requestNumber: request.requestNumber } as const;
  });

  if (out.ok && out.resolving) {
    await notify(dispatcher, {
      storeId: out.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_RESOLVED",
      recipient: "STORE",
    });
  }
  return out.ok ? { ok: true } : out;
}

export type RecategorizeResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "CATEGORY_NOT_FOUND" | "CATEGORY_INACTIVE" | "VERSION_CONFLICT">;

export async function recategorize(input: {
  requestId: string;
  actorUserId: string;
  expectedVersion: number;
  categoryKey: string;
}): Promise<RecategorizeResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, storeId: true, categoryId: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    const category = await tx.platformRequestCategory.findUnique({
      where: { key: input.categoryKey },
      select: { id: true, active: true },
    });
    if (!category) return { ok: false, code: "CATEGORY_NOT_FOUND" } as const;
    if (!category.active) return { ok: false, code: "CATEGORY_INACTIVE" } as const;

    // Snapshot (categoryKey/categoryLabel) IMMUTABLE — yalnız current FK (categoryId) taşınır.
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, version: input.expectedVersion },
      data: { categoryId: category.id, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    await tx.platformRequestHistory.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        eventType: "REQUEST_RECATEGORIZED",
        actorType: "PLATFORM",
        actorId: input.actorUserId,
        metadata: { fromCategoryId: request.categoryId, toCategoryId: category.id } as Prisma.InputJsonValue,
      },
    });
    return { ok: true } as const;
  });
}

// ---------- platform: message (visible reply | internal note) ----------

export type PlatformMessageResult =
  | { ok: true }
  | Err<"REQUEST_NOT_FOUND" | "REQUEST_CLOSED" | "VERSION_CONFLICT">;

export async function addPlatformMessage(
  input: {
    requestId: string;
    actorUserId: string;
    body: string;
    visibility: "STORE_VISIBLE" | "INTERNAL";
  },
  dispatcher: PlatformRequestNotificationDispatcher,
  now: Date,
): Promise<PlatformMessageResult> {
  const out = await prisma.$transaction(async (tx) => {
    const request = await tx.platformRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true, storeId: true, requestNumber: true, status: true, version: true, firstResponseAt: true },
    });
    if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" } as const;
    if (request.status === "CLOSED") return { ok: false, code: "REQUEST_CLOSED" } as const;

    await tx.platformRequestMessage.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        authorType: "PLATFORM",
        actorId: input.actorUserId,
        visibility: input.visibility,
        body: input.body,
      },
    });

    const visible = input.visibility === "STORE_VISIBLE";
    // INTERNAL note: status DEĞİŞMEZ, first-response SAYILMAZ. Yalnız STORE_VISIBLE reply işaretler.
    const marksFirstResponse = visible && request.firstResponseAt == null;
    const updated = await tx.platformRequest.updateMany({
      where: { id: request.id, version: request.version },
      data: { lastActivityAt: now, version: { increment: 1 }, ...(marksFirstResponse ? { firstResponseAt: now } : {}) },
    });
    if (updated.count !== 1) return { ok: false, code: "VERSION_CONFLICT" } as const;
    if (marksFirstResponse) await markLiveFirstResponse(tx, request.storeId, request.id, now);

    await tx.platformRequestHistory.create({
      data: {
        storeId: request.storeId,
        requestId: request.id,
        eventType: visible ? "REQUEST_PLATFORM_REPLY" : "REQUEST_INTERNAL_NOTE",
        actorType: "PLATFORM",
        actorId: input.actorUserId,
      },
    });
    return { ok: true, visible, storeId: request.storeId, requestId: request.id, requestNumber: request.requestNumber } as const;
  });

  if (out.ok && out.visible) {
    await notify(dispatcher, {
      storeId: out.storeId,
      requestId: out.requestId,
      requestNumber: out.requestNumber,
      event: "REQUEST_PLATFORM_REPLY",
      recipient: "STORE",
    });
  }
  return out.ok ? { ok: true } : out;
}

// ---------- TD-178-6: assignable PlatformUser directory (read-only) ----------

export interface AssignableUserFilters {
  search?: string;
  page: number;
  pageSize: number;
}

// Atama için uygun PlatformUser dizini. Yalnız id/name/email/role döner; passwordHash/session
// gibi hassas alanlar ASLA select edilmez (server-side allowlist). Store yüzeyine açılmaz (route guard).
export async function listAssignablePlatformUsers(f: AssignableUserFilters) {
  const where: Prisma.PlatformUserWhereInput = {};
  if (f.search && f.search.trim()) {
    const q = f.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.platformUser.count({ where }),
    prisma.platformUser.findMany({
      where,
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);
  return { items, page: f.page, pageSize: f.pageSize, total };
}

// ---------- taxonomy (platform-managed category) ----------

export async function listCategories() {
  const rows = await prisma.platformRequestCategory.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { key: "asc" }],
    select: { id: true, key: true, labelTr: true, labelEn: true, defaultPriority: true, slaPolicyKey: true, active: true, sortOrder: true },
  });
  return rows;
}

export type CreateCategoryResult = { ok: true; id: string } | Err<"CATEGORY_KEY_EXISTS">;

export async function createCategory(input: {
  key: string;
  labelTr: string;
  labelEn: string;
  defaultPriority?: PlatformRequestPriority;
  slaPolicyKey?: string;
  sortOrder?: number;
  active?: boolean;
}): Promise<CreateCategoryResult> {
  const existing = await prisma.platformRequestCategory.findUnique({ where: { key: input.key }, select: { id: true } });
  if (existing) return { ok: false, code: "CATEGORY_KEY_EXISTS" };
  const created = await prisma.platformRequestCategory.create({
    data: {
      id: `prcat_${input.key.toLowerCase()}`,
      key: input.key,
      labelTr: input.labelTr,
      labelEn: input.labelEn,
      defaultPriority: input.defaultPriority ?? "NORMAL",
      slaPolicyKey: input.slaPolicyKey ?? "DEFAULT",
      sortOrder: input.sortOrder ?? 100,
      active: input.active ?? true,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

export type UpdateCategoryResult = { ok: true } | Err<"CATEGORY_NOT_FOUND">;

export async function updateCategory(
  id: string,
  input: {
    labelTr?: string;
    labelEn?: string;
    defaultPriority?: PlatformRequestPriority;
    slaPolicyKey?: string;
    sortOrder?: number;
    active?: boolean;
  },
): Promise<UpdateCategoryResult> {
  const existing = await prisma.platformRequestCategory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, code: "CATEGORY_NOT_FOUND" };
  await prisma.platformRequestCategory.update({
    where: { id },
    data: {
      ...(input.labelTr !== undefined ? { labelTr: input.labelTr } : {}),
      ...(input.labelEn !== undefined ? { labelEn: input.labelEn } : {}),
      ...(input.defaultPriority !== undefined ? { defaultPriority: input.defaultPriority } : {}),
      ...(input.slaPolicyKey !== undefined ? { slaPolicyKey: input.slaPolicyKey } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  return { ok: true };
}

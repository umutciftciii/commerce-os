/**
 * TODO-174B (ADR-283) — Order Experience Recovery Store-Admin route'ları.
 *
 * storeId-first scoped; cross-store 404. Mutating aksiyonlar append-only activity + version guard.
 * Internal note yalnız case detayında (admin). ProductReview/aggregate'e SIFIR dokunuş.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuditAction } from "@prisma/client";
import {
  assignableUsersResponseSchema,
  experienceKpiSchema,
  experienceListResponseSchema,
  manualOpenCaseRequestSchema,
  orderExperienceSummarySchema,
  recoveryActionRequestSchema,
  recoveryCaseDetailSchema,
  recoveryReportSchema,
} from "@commerce-os/contracts";
import { prisma } from "@commerce-os/db";
import {
  experienceKpi,
  getOrderExperienceForOrder,
  getRecoveryCaseDetail,
  listAssignableUsers,
  listExperienceReviews,
  recoveryReport,
  resolveReviewForManualCase,
  type ExperienceListFilters,
} from "./recovery-read.js";
import { applyRecoveryAction, openRecoveryCaseForReview, type RecoveryErrorCode } from "./recovery-service.js";
import { resolveFinanceRange, type FinancePeriodPreset } from "../finance/date-range.js";

interface StoreAdminAccess {
  actorUserId: string;
}
export interface RecoveryAdminRoutesDeps {
  requireStoreAdmin: (request: FastifyRequest, reply: FastifyReply, storeId: string) => Promise<StoreAdminAccess | null>;
  recordAudit: (input: {
    storeId: string;
    platformUserId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
  /** TD-174B-2 — Recovery raporu tarih aralığı için mağaza tz'si. */
  getStoreTimezone: (storeId: string) => Promise<string>;
  /** Test enjeksiyonu; default Date.now. */
  now?: () => number;
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });
const storeParam = z.object({ storeId: z.string().min(1) });
const caseParam = z.object({ storeId: z.string().min(1), caseId: z.string().min(1) });
const orderParam = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });
const reportQuery = z.object({
  period: z.enum(["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "thisYear", "custom"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const listQuery = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  ratingBucket: z.enum(["ONE_TWO", "THREE", "FOUR_FIVE"]).optional(),
  orderStatus: z.string().optional(),
  cancelReasonCode: z.string().optional(),
  recoveryStatus: z
    .enum(["OPEN", "ASSIGNED", "CONTACT_ATTEMPTED", "CUSTOMER_REACHED", "ACTION_REQUIRED", "RESOLVED", "CLOSED", "UNREACHABLE", "NO_ACTION_REQUIRED"])
    .optional(),
  assigneePlatformUserId: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const RECOVERY_HTTP: Record<RecoveryErrorCode, { status: number; message: string }> = {
  CASE_NOT_FOUND: { status: 404, message: "Recovery kaydı bulunamadı." },
  CASE_CLOSED: { status: 409, message: "Kapatılmış case üzerinde işlem yapılamaz." },
  VERSION_CONFLICT: { status: 409, message: "Kayıt bu sırada değişti; yenileyin." },
  NOTE_REQUIRED: { status: 400, message: "Bu işlem için not zorunludur." },
  RESOLUTION_REQUIRED: { status: 400, message: "Çözüm türü zorunludur." },
  ASSIGNEE_REQUIRED: { status: 400, message: "Atanacak kullanıcı zorunludur." },
};

export function registerRecoveryAdminRoutes(app: FastifyInstance, deps: RecoveryAdminRoutesDeps): void {
  // Liste (Sipariş Deneyimi).
  app.get("/stores/:storeId/order-experience", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const query = listQuery.parse(request.query);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const filters: ExperienceListFilters = {
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      ratingBucket: query.ratingBucket,
      orderStatus: query.orderStatus,
      cancelReasonCode: query.cancelReasonCode,
      recoveryStatus: query.recoveryStatus,
      assigneePlatformUserId: query.assigneePlatformUserId,
      overdueOnly: query.overdueOnly,
    };
    const result = await listExperienceReviews(params.storeId, filters, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    await reply.send(experienceListResponseSchema.parse(result));
  });

  // KPI.
  app.get("/stores/:storeId/order-experience/kpi", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const query = z.object({ dateFrom: z.string().datetime().optional(), dateTo: z.string().datetime().optional() }).parse(request.query);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const kpi = await experienceKpi(params.storeId, {
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
    await reply.send(experienceKpiSchema.parse(kpi));
  });

  // "Kullanıcıya ata" dropdown'u — store'un yetkili kullanıcıları (storeId-scoped; cross-store sızmaz).
  app.get("/stores/:storeId/order-experience/assignable-users", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const users = await listAssignableUsers(params.storeId);
    await reply.send(assignableUsersResponseSchema.parse(users));
  });

  // TD-174B-2 — Recovery raporu (trend + zamanlama + outcome + goodwill; bounded aralık).
  app.get("/stores/:storeId/order-experience/report", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const query = reportQuery.parse(request.query);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const timezone = await deps.getStoreTimezone(params.storeId);
    const preset: FinancePeriodPreset = query.period ?? (query.dateFrom || query.dateTo ? "custom" : "last30");
    const range = resolveFinanceRange({
      preset,
      timezone,
      nowMs: deps.now ? deps.now() : Date.now(),
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const report = await recoveryReport(params.storeId, range.current);
    await reply.send(recoveryReportSchema.parse(report));
  });

  // TD-174B-1 — Tek-sipariş "Sipariş Deneyimi" özeti (store-admin sipariş detayı kartı).
  // Review yoksa 200 + null (kart gizlenir). Cross-store 404 requireStoreAdmin ile.
  app.get("/stores/:storeId/order-experience/orders/:orderId", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const summary = await getOrderExperienceForOrder(params.storeId, params.orderId);
    await reply.send(summary ? orderExperienceSummarySchema.parse(summary) : null);
  });

  // Case detay.
  app.get("/stores/:storeId/order-experience/cases/:caseId", async (request, reply) => {
    const params = caseParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const detail = await getRecoveryCaseDetail(params.storeId, params.caseId);
    if (!detail) {
      await reply.code(404).send(errorBody("NOT_FOUND", "Recovery kaydı bulunamadı."));
      return;
    }
    await reply.send(recoveryCaseDetailSchema.parse(detail));
  });

  // Lifecycle aksiyonu.
  app.post("/stores/:storeId/order-experience/cases/:caseId/actions", async (request, reply) => {
    const params = caseParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = recoveryActionRequestSchema.parse(request.body);
    const result = await applyRecoveryAction({
      storeId: params.storeId,
      caseId: params.caseId,
      action: input.action,
      actorPlatformUserId: access.actorUserId,
      expectedVersion: input.expectedVersion,
      assigneePlatformUserId: input.assigneePlatformUserId ?? undefined,
      outcome: input.outcome ?? undefined,
      resolutionType: input.resolutionType ?? undefined,
      note: input.note ?? undefined,
    });
    if (!result.ok) {
      const http = RECOVERY_HTTP[result.code];
      await reply.code(http.status).send(errorBody(result.code, http.message));
      return;
    }
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "UPDATE",
      entityType: "OrderRecoveryCase",
      entityId: params.caseId,
      metadata: { action: input.action, outcome: input.outcome ?? null, resolutionType: input.resolutionType ?? null },
    });
    const detail = await getRecoveryCaseDetail(params.storeId, params.caseId);
    await reply.send(recoveryCaseDetailSchema.parse(detail));
  });

  // Manuel case açma (3★).
  app.post("/stores/:storeId/order-experience/cases", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = manualOpenCaseRequestSchema.parse(request.body);
    const resolved = await resolveReviewForManualCase(params.storeId, input.reviewId);
    if (!resolved.ok) {
      const map: Record<string, { status: number; message: string }> = {
        REVIEW_NOT_FOUND: { status: 404, message: "Değerlendirme bulunamadı." },
        NOT_THREE_STAR: { status: 400, message: "Yalnız 3 yıldızlı değerlendirme için manuel case açılabilir." },
        CASE_EXISTS: { status: 409, message: "Bu değerlendirme için zaten bir case var." },
      };
      const http = map[resolved.code];
      await reply.code(http.status).send(errorBody(resolved.code, http.message));
      return;
    }
    const created = await prisma.$transaction((tx) =>
      openRecoveryCaseForReview(tx, {
        storeId: params.storeId,
        orderExperienceReviewId: input.reviewId,
        customerId: resolved.customerId,
        orderId: resolved.orderId,
        rating: resolved.rating,
        mode: "MANUAL",
        createdByPlatformUserId: access.actorUserId,
      }),
    );
    if (!created) {
      await reply.code(400).send(errorBody("INVALID", "Case açılamadı."));
      return;
    }
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "CREATE",
      entityType: "OrderRecoveryCase",
      entityId: created.id,
      metadata: { reviewId: input.reviewId, mode: "MANUAL" },
    });
    const detail = await getRecoveryCaseDetail(params.storeId, created.id);
    await reply.code(created.created ? 201 : 200).send(recoveryCaseDetailSchema.parse(detail));
  });
}

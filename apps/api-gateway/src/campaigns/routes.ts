/**
 * F4A — Store-admin kampanya/kupon yonetim uclari (ADR-058).
 *
 * Guvenlik:
 *  - Tum uclar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tum sorgular {id, storeId} scoped; baska store'un
 *    kampanyasi gorunmez (404). Kapsam id'leri ayni store'da dogrulanir.
 *  - Kampanya verisi secret icermez; admin detayda musteri e-postasi MASKELI doner.
 *  - ARCHIVED kampanya duzenlenemez (yalniz goruntulenir); ARCHIVED terminaldir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  campaignCreateRequestSchema,
  campaignDetailResponseSchema,
  campaignListResponseSchema,
  campaignSchema,
  campaignUpdateRequestSchema,
} from "@commerce-os/contracts";
import { z } from "zod";
import {
  maskEmail,
  serializeCampaign,
  type CampaignDataAccess,
  type CampaignDetailRecord,
  type CampaignMutationError,
} from "./data.js";

export interface CampaignAdminRoutesDeps {
  dataAccess: CampaignDataAccess;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  /**
   * TODO-155.2 — Kampanya lifecycle değişince (create/update/activate/pause/archive) search read-model'i
   * tazele. Kampanya kapsamı hangi ürünlerin rozet gösterdiğini belirler → attribute ŞEMA değişimi gibi
   * STORE reindex tetiklenir (her zaman doğru + bounded; scoped-kampanya granüler reindex ileri optimizasyon).
   * Fire-and-forget (opsiyonel; testte no-op). Enqueue hatası mutasyonu ETKİLEMEZ.
   */
  onCampaignChanged?: (storeId: string) => void;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const campaignParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

const MUTATION_ERROR_RESPONSES: Record<CampaignMutationError, { status: number; message: string }> = {
  DUPLICATE_COUPON_CODE: { status: 409, message: "Coupon code already exists in this store." },
  SCOPE_PRODUCT_NOT_FOUND: { status: 400, message: "Scope contains unknown products." },
  SCOPE_CATEGORY_NOT_FOUND: { status: 400, message: "Scope contains unknown categories." },
  ARCHIVED_IMMUTABLE: { status: 409, message: "Archived campaigns cannot be edited." },
  INVALID_STATUS_TRANSITION: { status: 409, message: "Status transition is not allowed." },
};

function isMutationError(value: unknown): value is CampaignMutationError {
  return typeof value === "string" && value in MUTATION_ERROR_RESPONSES;
}

function sendMutationError(reply: FastifyReply, error: CampaignMutationError) {
  const mapped = MUTATION_ERROR_RESPONSES[error];
  return reply.code(mapped.status).send(errorBody(error, mapped.message));
}

function serializeDetail(record: CampaignDetailRecord) {
  return campaignDetailResponseSchema.parse({
    ...serializeCampaign(record),
    recentRedemptions: record.recentRedemptions.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      couponCode: item.couponCode,
      maskedEmail: maskEmail(item.email),
      discountAmountMinor: item.discountAmountMinor,
      orderTotalMinor: item.orderTotalMinor,
      createdAt: item.createdAt.toISOString(),
    })),
    totalRedemptionCount: record.totalRedemptionCount,
    totalDiscountMinor: record.totalDiscountMinor,
    // F4A.2 (ADR-059) — Snapshot-tabanli analitik; e-posta MASKELI bile tasinmaz
    // (yalniz sayisal ozetler).
    analytics: {
      redemptionCount: record.analytics.redemptionCount,
      uniqueCustomerCount: record.analytics.uniqueCustomerCount,
      totalDiscountMinor: record.analytics.totalDiscountMinor,
      ordersSubtotalMinor: record.analytics.ordersSubtotalMinor,
      ordersTotalMinor: record.analytics.ordersTotalMinor,
      avgDiscountPerOrderMinor: record.analytics.avgDiscountPerOrderMinor,
      avgOrderTotalMinor: record.analytics.avgOrderTotalMinor,
      lastRedemptionAt: record.analytics.lastRedemptionAt
        ? record.analytics.lastRedemptionAt.toISOString()
        : null,
    },
  });
}

export function registerCampaignAdminRoutes(app: FastifyInstance, deps: CampaignAdminRoutesDeps) {
  const { dataAccess, requireStoreAdmin, recordAudit } = deps;
  const notifyCampaignChanged = (storeId: string) => deps.onCampaignChanged?.(storeId);

  app.get("/stores/:storeId/campaigns", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const campaigns = await dataAccess.listCampaigns(params.storeId);
    return campaignListResponseSchema.parse({ data: campaigns.map(serializeCampaign) });
  });

  app.post("/stores/:storeId/campaigns", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = campaignCreateRequestSchema.parse(request.body);
    const result = await dataAccess.createCampaign(params.storeId, body);
    if (isMutationError(result)) return sendMutationError(reply, result);
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "Campaign",
      entityId: result.id,
      metadata: { type: result.type, discountType: result.discountType },
    });
    notifyCampaignChanged(params.storeId);
    return reply.code(201).send(campaignSchema.parse(serializeCampaign(result)));
  });

  app.get("/stores/:storeId/campaigns/:id", async (request, reply) => {
    const params = campaignParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const campaign = await dataAccess.findCampaignById(params.storeId, params.id);
    if (!campaign) return reply.code(404).send(errorBody("CAMPAIGN_NOT_FOUND", "Campaign not found."));
    return serializeDetail(campaign);
  });

  app.patch("/stores/:storeId/campaigns/:id", async (request, reply) => {
    const params = campaignParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = campaignUpdateRequestSchema.parse(request.body ?? {});
    const result = await dataAccess.updateCampaign(params.storeId, params.id, body);
    if (result === null) return reply.code(404).send(errorBody("CAMPAIGN_NOT_FOUND", "Campaign not found."));
    if (isMutationError(result)) return sendMutationError(reply, result);
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "Campaign",
      entityId: result.id,
    });
    notifyCampaignChanged(params.storeId);
    return campaignSchema.parse(serializeCampaign(result));
  });

  // Durum gecisleri: activate / pause / archive (ARCHIVED terminal).
  for (const [action, status] of [
    ["activate", "ACTIVE"],
    ["pause", "PAUSED"],
    ["archive", "ARCHIVED"],
  ] as const) {
    app.post(`/stores/:storeId/campaigns/:id/${action}`, async (request, reply) => {
      const params = campaignParam.parse(request.params);
      const access = await requireStoreAdmin(request, reply, params.storeId);
      if (!access) return;
      const result = await dataAccess.setCampaignStatus(params.storeId, params.id, status);
      if (result === null) return reply.code(404).send(errorBody("CAMPAIGN_NOT_FOUND", "Campaign not found."));
      if (isMutationError(result)) return sendMutationError(reply, result);
      await recordAudit({
        action: "UPDATE",
        platformUserId: access.actorUserId,
        storeId: params.storeId,
        entityType: "Campaign",
        entityId: result.id,
        metadata: { statusAction: action },
      });
      notifyCampaignChanged(params.storeId);
      return campaignSchema.parse(serializeCampaign(result));
    });
  }
}

/**
 * F4A.3 — Store-admin kupon atama / musteri cuzdani uclari (ADR-060).
 *
 * Guvenlik:
 *  - Tum uclar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: kupon/musteri {id, storeId} scoped dogrulanir; cross-store
 *    atama REDDEDILIR.
 *  - Musteri e-postasi listelerde MASKELI doner (PII sizdirilmaz).
 *  - Kampanya detayi ve musteri detayi AYNI backend servisini (assignCoupon) kullanir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  couponAssignmentRequestSchema,
  customerCouponAssignmentListResponseSchema,
  customerCouponAssignmentSchema,
} from "@commerce-os/contracts";
import type { WalletAssignmentRecord, WalletDataAccess } from "./wallet-data.js";

export interface WalletAdminRoutesDeps {
  wallet: WalletDataAccess;
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
}

const storeParam = z.object({ storeId: z.string().min(1) });
const campaignParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });
const customerParam = z.object({ storeId: z.string().min(1), customerId: z.string().min(1) });

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function serializeAssignment(record: WalletAssignmentRecord) {
  return customerCouponAssignmentSchema.parse({
    id: record.id,
    couponId: record.couponId,
    couponCode: record.couponCode,
    campaignId: record.campaignId,
    campaignName: record.campaignName,
    customerId: record.customerId,
    customerName: record.customerName,
    maskedEmail: record.email,
    status: record.status,
    source: record.source,
    claimedAt: record.claimedAt.toISOString(),
    appliedAt: record.appliedAt ? record.appliedAt.toISOString() : null,
    usedAt: record.usedAt ? record.usedAt.toISOString() : null,
    orderId: record.orderId,
    orderNumber: record.orderNumber,
  });
}

const ASSIGN_ERRORS = {
  COUPON_NOT_FOUND: { status: 404, message: "Coupon not found in this store." },
  CUSTOMER_NOT_FOUND: { status: 404, message: "Customer not found in this store." },
} as const;

export function registerWalletAdminRoutes(app: FastifyInstance, deps: WalletAdminRoutesDeps) {
  const { wallet, requireStoreAdmin, recordAudit } = deps;

  // Kampanya detayindan atama listesi.
  app.get("/stores/:storeId/campaigns/:id/assignments", async (request, reply) => {
    const params = campaignParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const rows = await wallet.listCampaignAssignments(params.storeId, params.id);
    return customerCouponAssignmentListResponseSchema.parse({ data: rows.map(serializeAssignment) });
  });

  // Kampanya detayindan atama (couponId + customerId veya email).
  app.post("/stores/:storeId/campaigns/:id/assignments", async (request, reply) => {
    const params = campaignParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = couponAssignmentRequestSchema.parse(request.body);
    const result = await wallet.assignCoupon(params.storeId, {
      couponId: body.couponId,
      customerId: body.customerId ?? null,
      email: body.email ?? null,
    });
    if (typeof result === "string") {
      const mapped = ASSIGN_ERRORS[result];
      return reply.code(mapped.status).send(errorBody(result, mapped.message));
    }
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "CustomerCoupon",
      entityId: result.id,
      metadata: { couponId: result.couponId, source: result.source },
    });
    return reply.code(201).send(serializeAssignment(result));
  });

  // Musteri detayindan kupon listesi.
  app.get("/stores/:storeId/customers/:customerId/coupons", async (request, reply) => {
    const params = customerParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const rows = await wallet.listCustomerAssignments(params.storeId, params.customerId);
    return customerCouponAssignmentListResponseSchema.parse({ data: rows.map(serializeAssignment) });
  });

  // Musteri detayindan atama (couponId; hedef = bu musteri).
  app.post("/stores/:storeId/customers/:customerId/coupons", async (request, reply) => {
    const params = customerParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = z.object({ couponId: z.string().min(1) }).parse(request.body);
    const result = await wallet.assignCoupon(params.storeId, {
      couponId: body.couponId,
      customerId: params.customerId,
      email: null,
    });
    if (typeof result === "string") {
      const mapped = ASSIGN_ERRORS[result];
      return reply.code(mapped.status).send(errorBody(result, mapped.message));
    }
    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "CustomerCoupon",
      entityId: result.id,
      metadata: { couponId: result.couponId, source: result.source },
    });
    return reply.code(201).send(serializeAssignment(result));
  });

  void storeParam;
}

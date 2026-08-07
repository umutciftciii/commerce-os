/**
 * TODO-174B (ADR-281) — Customer Shopping Balance / Store Credit · Store-Admin route'ları.
 *
 * Tüm sorgular storeId-first scoped (cross-store 404). Goodwill kredi: normal operatör mağaza
 * politikası (maxGoodwillCreditPerActionMinor) sınırında; SUPER_ADMIN override eder. Client tutarına
 * kör güven YOK (server-side policy validation). description CUSTOMER-FACING KEY'dir; internal note
 * yalnız AuditLog'a gider (storefront'a ASLA sızmaz).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@commerce-os/db";
import type { AuditAction } from "@prisma/client";
import { parseMinorString, minorToCanonicalString } from "@commerce-os/utils";
import {
  adminIssueCreditRequestSchema,
  customerCreditBalanceResponseSchema,
} from "@commerce-os/contracts";
import { getCustomerBalance, issueCredit, type CreditErrorCode, type CustomerBalanceView } from "./service.js";

const DEFAULT_CURRENCY = "TRY";

interface StoreAdminAccess {
  actorUserId: string;
  isSuperAdmin: boolean;
}

export interface CustomerCreditAdminRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<StoreAdminAccess | null>;
  recordAudit: (input: {
    storeId: string;
    platformUserId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });
const customerParam = z.object({ storeId: z.string().min(1), customerId: z.string().min(1) });
const balanceQuery = z.object({ currency: z.string().min(3).max(3).optional() });

const CREDIT_HTTP: Record<CreditErrorCode, { status: number; message: string }> = {
  INVALID_AMOUNT: { status: 400, message: "Geçersiz tutar." },
  INVALID_EXPIRY: { status: 400, message: "Geçersiz son kullanım süresi (30/60/120/180 gün)." },
  POLICY_DISABLED: { status: 403, message: "Alışveriş bakiyesi tanımlama bu mağazada kapalı." },
  EXCEEDS_POLICY_LIMIT: { status: 403, message: "Tutar aksiyon başına izin verilen sınırı aşıyor." },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Bakiye hesabı bulunamadı." },
  INSUFFICIENT_BALANCE: { status: 409, message: "Yetersiz bakiye." },
  CURRENCY_MISMATCH: { status: 409, message: "Para birimi uyuşmuyor." },
};

/** Ledger view → contract DTO (orderId → orderNumber çözümü ile). */
async function serializeBalance(storeId: string, view: CustomerBalanceView) {
  const orderIds = [...new Set(view.entries.map((e) => e.orderId).filter((v): v is string => !!v))];
  const orderRows = orderIds.length
    ? await prisma.order.findMany({ where: { storeId, id: { in: orderIds } }, select: { id: true, orderNumber: true } })
    : [];
  const orderNumberById = new Map(orderRows.map((o) => [o.id, o.orderNumber]));
  return customerCreditBalanceResponseSchema.parse({
    currency: view.currency,
    availableMinor: minorToCanonicalString(view.availableMinor),
    entries: view.entries.map((e) => ({
      id: e.id,
      type: e.type,
      direction: e.direction,
      amountMinor: minorToCanonicalString(e.amountMinor),
      balanceAfterMinor: minorToCanonicalString(e.balanceAfterMinor),
      currency: e.currency,
      description: e.description,
      orderId: e.orderId,
      orderNumber: e.orderId ? orderNumberById.get(e.orderId) ?? null : null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export function registerCustomerCreditAdminRoutes(app: FastifyInstance, deps: CustomerCreditAdminRoutesDeps): void {
  // GET — müşteri bakiyesi + hareket geçmişi.
  app.get("/stores/:storeId/customers/:customerId/credit", async (request, reply) => {
    const params = customerParam.parse(request.params);
    const query = balanceQuery.parse(request.query);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const customer = await prisma.customer.findFirst({
      where: { id: params.customerId, storeId: params.storeId },
      select: { id: true },
    });
    if (!customer) {
      await reply.code(404).send(errorBody("NOT_FOUND", "Müşteri bulunamadı."));
      return;
    }
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: params.storeId },
      select: { goodwillCreditCurrency: true },
    });
    const currency = query.currency ?? settings?.goodwillCreditCurrency ?? DEFAULT_CURRENCY;
    const view = await getCustomerBalance(params.storeId, params.customerId, currency);
    await reply.send(await serializeBalance(params.storeId, view));
  });

  // POST — goodwill kredi tanımla (policy-gated; idempotent).
  app.post("/stores/:storeId/customers/:customerId/credit", async (request, reply) => {
    const params = customerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = adminIssueCreditRequestSchema.parse(request.body);

    const customer = await prisma.customer.findFirst({
      where: { id: params.customerId, storeId: params.storeId },
      select: { id: true },
    });
    if (!customer) {
      await reply.code(404).send(errorBody("NOT_FOUND", "Müşteri bulunamadı."));
      return;
    }

    const settings = await prisma.storeSettings.findUnique({
      where: { storeId: params.storeId },
      select: { maxGoodwillCreditPerActionMinor: true, goodwillCreditCurrency: true },
    });
    const currency = settings?.goodwillCreditCurrency ?? DEFAULT_CURRENCY;
    const policyMax = settings?.maxGoodwillCreditPerActionMinor ?? null;

    // Recovery case bağı (opsiyonel): storeId+customerId doğrula → recovery-bazlı idempotency (case
    // başına duplicate credit engeli). Yoksa admin doğrudan kredi (client idempotencyKey).
    let sourceType: "ADMIN_GOODWILL" | "RECOVERY_GOODWILL" = "ADMIN_GOODWILL";
    let ledgerType: "ADMIN_GOODWILL_CREDIT" | "RECOVERY_GOODWILL_CREDIT" = "ADMIN_GOODWILL_CREDIT";
    let sourceId: string | null = null;
    let idempotencyKey = `admin-credit:${params.storeId}:${input.idempotencyKey}`;
    if (input.recoveryCaseId) {
      const kase = await prisma.orderRecoveryCase.findFirst({
        where: { id: input.recoveryCaseId, storeId: params.storeId, customerId: params.customerId },
        select: { id: true },
      });
      if (!kase) {
        await reply.code(404).send(errorBody("NOT_FOUND", "Recovery kaydı bulunamadı."));
        return;
      }
      sourceType = "RECOVERY_GOODWILL";
      ledgerType = "RECOVERY_GOODWILL_CREDIT";
      sourceId = kase.id;
      idempotencyKey = `recovery-credit:${kase.id}`;
    }

    const result = await issueCredit({
      storeId: params.storeId,
      customerId: params.customerId,
      currency,
      amountMinor: parseMinorString(input.amountMinor),
      expiryDays: input.expiryDays,
      sourceType,
      sourceId,
      ledgerType,
      description: "credit.goodwill",
      actor: { type: "PLATFORM_USER", id: access.actorUserId },
      idempotencyKey,
      policyMaxMinor: policyMax,
      overridePolicy: access.isSuperAdmin,
    });

    if (!result.ok) {
      const http = CREDIT_HTTP[result.code];
      await reply.code(http.status).send(errorBody(result.code, http.message));
      return;
    }

    // AuditLog (internal — reason/note burada; müşteriye sızmaz). deduped ise de idempotent kayıt.
    await deps.recordAudit({
      storeId: params.storeId,
      platformUserId: access.actorUserId,
      action: "CREATE",
      entityType: "CustomerCreditLedgerEntry",
      entityId: result.entryId,
      metadata: {
        customerId: params.customerId,
        amountMinor: input.amountMinor,
        currency,
        expiryDays: input.expiryDays,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
        recoveryCaseId: input.recoveryCaseId ?? null,
        deduped: result.deduped,
        overridePolicy: access.isSuperAdmin,
      },
    });

    const view = await getCustomerBalance(params.storeId, params.customerId, currency);
    await reply.code(result.deduped ? 200 : 201).send(await serializeBalance(params.storeId, view));
  });
}

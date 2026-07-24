/**
 * TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement — HTTP route katmanı.
 *
 * TAMAMI store-admin yüzeyidir; **public uç YOKTUR** (vergi no / iletişim / fatura adresi /
 * sözleşme belgesi hiçbir public response'a çıkmaz). Her uç `/stores/:storeId/...` + storeId
 * URL'den + `requireStoreAdmin` guard'ı; her sorgu tenant-izole (cross-store → 404).
 *
 * Tüm ticari matematik SAF `billing-core.ts` + `data.ts` içindedir; route yalnız doğrular,
 * serialize eder ve AuditLog'a yazar. Tahsilat tutarı istemciden OTORİTE kabul edilmez.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  buildAdminListPagination,
  resolveAdminListPage,
  sponsorAccountCreateRequestSchema,
  sponsorAccountDetailResponseSchema,
  sponsorAccountListQuerySchema,
  sponsorAccountListResponseSchema,
  sponsorAccountUpdateRequestSchema,
  sponsorshipAgreementCampaignLinkRequestSchema,
  sponsorshipAgreementCreateRequestSchema,
  sponsorshipAgreementDetailResponseSchema,
  sponsorshipAgreementListQuerySchema,
  sponsorshipAgreementListResponseSchema,
  sponsorshipAgreementUpdateRequestSchema,
  sponsorshipChargeCancelRequestSchema,
  sponsorshipChargeCreateRequestSchema,
  sponsorshipChargeDetailResponseSchema,
  sponsorshipChargeIssueRequestSchema,
  sponsorshipChargeListQuerySchema,
  sponsorshipChargeListResponseSchema,
  sponsorshipDashboardQuerySchema,
  sponsorshipDashboardResponseSchema,
  sponsorshipPaymentCreateRequestSchema,
  sponsorshipPaymentDetailResponseSchema,
  sponsorshipPaymentListQuerySchema,
  sponsorshipPaymentListResponseSchema,
  sponsorshipPaymentReverseRequestSchema,
  sponsorshipSettlementDetailResponseSchema,
  sponsorshipSettlementListQuerySchema,
  sponsorshipSettlementListResponseSchema,
  sponsorshipSettlementPreviewRequestSchema,
  type SponsorshipChargeDisplayStatus,
} from "@commerce-os/contracts";
import type {
  AgreementDetailRow,
  AgreementRow,
  ChargeRow,
  PaymentRow,
  SettlementRow,
  SponsorAccountDetailRow,
  SponsorAccountRow,
  SponsorshipData,
  SponsorshipListPage,
} from "./data.js";
import { resolveChargeDisplayStatus } from "./billing-core.js";

type AuditFn = (input: {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

export interface SponsorshipAdminRoutesDeps {
  data: SponsorshipData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: AuditFn;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function toListPage(q: { sortBy?: string; sortOrder?: "asc" | "desc"; search?: string }, page: { limit: number; offset: number }): SponsorshipListPage {
  return { limit: page.limit, offset: page.offset, sortBy: q.sortBy ?? "createdAt", sortOrder: q.sortOrder ?? "desc", search: q.search };
}

function parseDay(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `YYYY-MM-DD` verildiyse gün sonuna genişletir (dahil aralık için). */
function expandDateTo(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return d;
}

/** CSV injection + ayraç/quote güvenli hücre (formül-önek prefix + kaçış). */
function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ── Serialize (record → contract DTO; Date → ISO; iç alan sızmaz) ─────────────
function serializeSponsor(r: SponsorAccountRow) {
  return {
    id: r.id,
    companyName: r.companyName,
    contactName: r.contactName,
    email: r.email,
    phone: r.phone,
    status: r.status,
    agreementCount: r.agreementCount,
    activeAgreementCount: r.activeAgreementCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeSponsorDetail(r: SponsorAccountDetailRow) {
  return {
    ...serializeSponsor(r),
    taxOffice: r.taxOffice,
    taxNumber: r.taxNumber,
    billingAddress: r.billingAddress,
    notes: r.notes,
    balances: r.balances,
  };
}

function serializeAgreement(r: AgreementRow) {
  return {
    id: r.id,
    agreementNumber: r.agreementNumber,
    title: r.title,
    status: r.status,
    sponsorAccountId: r.sponsorAccountId,
    sponsorCompanyName: r.sponsorCompanyName,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    currency: r.currency,
    pricingModel: r.pricingModel,
    settlementPeriod: r.settlementPeriod,
    agreedAmountMinor: r.agreedAmountMinor,
    unitPriceMinor: r.unitPriceMinor,
    revenueSharePercentBp: r.revenueSharePercentBp,
    budgetLimitMinor: r.budgetLimitMinor,
    paymentTermDays: r.paymentTermDays,
    taxRateBp: r.taxRateBp,
    campaignCount: r.campaignCount,
    chargedMinor: r.chargedMinor,
    paidMinor: r.paidMinor,
    outstandingMinor: r.outstandingMinor,
    hasOverdueCharge: r.hasOverdueCharge,
    budgetExhausted: r.budgetExhausted,
    commerciallyEligible: r.commerciallyEligible,
    ineligibilityReason: r.ineligibilityReason,
    signedAt: r.signedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeAgreementDetail(r: AgreementDetailRow) {
  return {
    ...serializeAgreement(r),
    documentUrl: r.documentUrl,
    notes: r.notes,
    campaigns: r.campaigns.map((c) => ({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      placement: c.placement,
      campaignStatus: c.campaignStatus,
      commercialMode: c.commercialMode,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      allocationAmountMinor: c.allocationAmountMinor,
    })),
  };
}

function serializeSettlement(r: SettlementRow) {
  return {
    id: r.id,
    agreementId: r.agreementId,
    agreementNumber: r.agreementNumber,
    agreementTitle: r.agreementTitle,
    sponsorCompanyName: r.sponsorCompanyName,
    periodKind: r.periodKind,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    impressions: r.impressions,
    billableImpressions: r.billableImpressions,
    clicks: r.clicks,
    billableClicks: r.billableClicks,
    orders: r.orders,
    grossRevenueMinor: r.grossRevenueMinor,
    refundedRevenueMinor: r.refundedRevenueMinor,
    netRevenueMinor: r.netRevenueMinor,
    calculatedChargeMinor: r.calculatedChargeMinor,
    currency: r.currency,
    pricingModel: r.pricingModel,
    status: r.status,
    chargeId: r.chargeId,
    createdAt: r.createdAt.toISOString(),
    finalizedAt: r.finalizedAt?.toISOString() ?? null,
  };
}

function serializeCharge(r: ChargeRow, now: Date) {
  const displayStatus: SponsorshipChargeDisplayStatus = resolveChargeDisplayStatus(r.status, r.dueAt, r.remainingMinor, now);
  return {
    id: r.id,
    chargeNumber: r.chargeNumber,
    agreementId: r.agreementId,
    agreementNumber: r.agreementNumber,
    sponsorAccountId: r.sponsorAccountId,
    sponsorCompanyName: r.sponsorCompanyName,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    settlementId: r.settlementId,
    chargeType: r.chargeType,
    pricingModel: r.pricingModel,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    quantity: r.quantity,
    unitPriceMinor: r.unitPriceMinor,
    subtotalMinor: r.subtotalMinor,
    taxRateBp: r.taxRateBp,
    taxAmountMinor: r.taxAmountMinor,
    totalAmountMinor: r.totalAmountMinor,
    paidMinor: r.paidMinor,
    remainingMinor: r.remainingMinor,
    currency: r.currency,
    status: r.status,
    displayStatus,
    isOverdue: r.isOverdue,
    daysOverdue: r.daysOverdue,
    notes: r.notes,
    generatedAt: r.generatedAt.toISOString(),
    issuedAt: r.issuedAt?.toISOString() ?? null,
    dueAt: r.dueAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

function serializePayment(r: PaymentRow) {
  return {
    id: r.id,
    agreementId: r.agreementId,
    agreementNumber: r.agreementNumber,
    sponsorCompanyName: r.sponsorCompanyName,
    chargeId: r.chargeId,
    chargeNumber: r.chargeNumber,
    amountMinor: r.amountMinor,
    currency: r.currency,
    method: r.method,
    providerReference: r.providerReference,
    manualReference: r.manualReference,
    paidAt: r.paidAt.toISOString(),
    notes: r.notes,
    isReversal: r.isReversal,
    reversalOfPaymentId: r.reversalOfPaymentId,
    reversalReason: r.reversalReason,
    reversed: r.reversed,
    createdAt: r.createdAt.toISOString(),
  };
}

// ── Hata → HTTP eşlemesi ──────────────────────────────────────────────────────
const AGREEMENT_ERROR_STATUS: Record<string, { code: number; message: string }> = {
  SPONSOR_NOT_FOUND: { code: 404, message: "Sponsor account not found." },
  DUPLICATE_NUMBER: { code: 409, message: "Agreement number already exists." },
  INVALID_WINDOW: { code: 400, message: "endsAt must be after startsAt." },
  INVALID_PRICING: { code: 400, message: "Pricing parameters are inconsistent with the pricing model." },
  INVALID_STATUS_TRANSITION: { code: 409, message: "Illegal agreement status transition." },
  CURRENCY_LOCKED: { code: 409, message: "Currency cannot change after charges exist." },
};
const LINK_ERROR_STATUS: Record<string, { code: number; message: string }> = {
  AGREEMENT_NOT_FOUND: { code: 404, message: "Agreement not found." },
  CAMPAIGN_NOT_FOUND: { code: 404, message: "Campaign not found." },
  CAMPAIGN_ALREADY_LINKED: { code: 409, message: "Campaign is already linked to an agreement." },
  CAMPAIGN_WINDOW_NOT_COVERED: { code: 400, message: "Agreement window must fully cover the campaign window." },
};
const SETTLEMENT_ERROR_STATUS: Record<string, { code: number; message: string }> = {
  AGREEMENT_NOT_FOUND: { code: 404, message: "Agreement not found." },
  INVALID_PERIOD: { code: 400, message: "periodEnd must be after periodStart." },
  PERIOD_ALREADY_FINALIZED: { code: 409, message: "This period is already finalized and immutable." },
  CURRENCY_MISMATCH: { code: 400, message: "Currency mismatch." },
};
const CHARGE_ERROR_STATUS: Record<string, { code: number; message: string }> = {
  SETTLEMENT_NOT_FOUND: { code: 404, message: "Settlement not found." },
  SETTLEMENT_NOT_FINALIZED: { code: 409, message: "Settlement must be finalized before charging." },
  CHARGE_ALREADY_EXISTS: { code: 409, message: "A charge already exists for this settlement." },
  CHARGE_NOT_FOUND: { code: 404, message: "Charge not found." },
  INVALID_STATUS: { code: 409, message: "Charge is not in a valid state for this action." },
};
const PAYMENT_ERROR_STATUS: Record<string, { code: number; message: string }> = {
  CHARGE_NOT_FOUND: { code: 404, message: "Charge not found." },
  PAYMENT_NOT_FOUND: { code: 404, message: "Payment not found." },
  CHARGE_NOT_COLLECTIBLE: { code: 409, message: "Charge cannot be collected in its current state." },
  CURRENCY_MISMATCH: { code: 400, message: "Payment currency must match the charge currency." },
  OVERPAYMENT: { code: 400, message: "Amount exceeds the remaining balance." },
  ALREADY_REVERSED: { code: 409, message: "Payment has already been reversed." },
  NOT_REVERSIBLE: { code: 409, message: "Payment cannot be reversed." },
};

export function registerSponsorshipAdminRoutes(app: FastifyInstance, deps: SponsorshipAdminRoutesDeps): void {
  const { data, requireStoreAdmin, recordAudit } = deps;

  // ─────────────────────────── Sponsor cari ───────────────────────────
  app.get("/stores/:storeId/sponsors", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorAccountListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listSponsors(storeId, { status: q.status }, toListPage(q, pageInfo));
    return reply.send(
      sponsorAccountListResponseSchema.parse({
        data: items.map(serializeSponsor),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/sponsors", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorAccountCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid sponsor."));
    const result = await data.createSponsor(storeId, parsed.data);
    if (result === "DUPLICATE_COMPANY") return reply.code(409).send(errorBody("DUPLICATE_COMPANY", "A sponsor with this company name already exists."));
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorAccount", entityId: result.id });
    return reply.code(201).send(sponsorAccountDetailResponseSchema.parse({ data: serializeSponsorDetail((await data.getSponsorDetail(storeId, result.id, new Date()))!) }));
  });

  app.get("/stores/:storeId/sponsors/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await data.getSponsorDetail(storeId, id, new Date());
    if (!detail) return reply.code(404).send(errorBody("NOT_FOUND", "Sponsor not found."));
    return reply.send(sponsorAccountDetailResponseSchema.parse({ data: serializeSponsorDetail(detail) }));
  });

  app.patch("/stores/:storeId/sponsors/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorAccountUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid sponsor."));
    const result = await data.updateSponsor(storeId, id, parsed.data);
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Sponsor not found."));
    if (result === "DUPLICATE_COMPANY") return reply.code(409).send(errorBody("DUPLICATE_COMPANY", "A sponsor with this company name already exists."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorAccount", entityId: id });
    return reply.send(sponsorAccountDetailResponseSchema.parse({ data: serializeSponsorDetail((await data.getSponsorDetail(storeId, id, new Date()))!) }));
  });

  // ─────────────────────────── Anlaşma ───────────────────────────
  app.get("/stores/:storeId/sponsorship-agreements", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipAgreementListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const now = new Date();
    const { items, total } = await data.listAgreements(
      storeId,
      { status: q.status, sponsorAccountId: q.sponsorAccountId, pricingModel: q.pricingModel },
      toListPage(q, pageInfo),
      now,
    );
    return reply.send(
      sponsorshipAgreementListResponseSchema.parse({
        data: items.map(serializeAgreement),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.post("/stores/:storeId/sponsorship-agreements", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipAgreementCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid agreement."));
    const b = parsed.data;
    const result = await data.createAgreement(
      storeId,
      {
        sponsorAccountId: b.sponsorAccountId,
        agreementNumber: b.agreementNumber,
        title: b.title,
        status: b.status,
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        currency: b.currency,
        pricingModel: b.pricingModel,
        settlementPeriod: b.settlementPeriod,
        agreedAmountMinor: b.agreedAmountMinor ?? null,
        unitPriceMinor: b.unitPriceMinor ?? null,
        revenueSharePercentBp: b.revenueSharePercentBp ?? null,
        budgetLimitMinor: b.budgetLimitMinor ?? null,
        paymentTermDays: b.paymentTermDays,
        taxRateBp: b.taxRateBp,
        signedAt: b.signedAt ? new Date(b.signedAt) : b.signedAt === null ? null : undefined,
        documentUrl: b.documentUrl,
        notes: b.notes,
      },
      new Date(),
    );
    if (typeof result === "string") {
      const e = AGREEMENT_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipAgreement", entityId: result.id, metadata: { pricingModel: result.pricingModel } });
    return reply.code(201).send(sponsorshipAgreementDetailResponseSchema.parse({ data: serializeAgreementDetail((await data.getAgreementDetail(storeId, result.id, new Date()))!) }));
  });

  app.get("/stores/:storeId/sponsorship-agreements/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await data.getAgreementDetail(storeId, id, new Date());
    if (!detail) return reply.code(404).send(errorBody("NOT_FOUND", "Agreement not found."));
    return reply.send(sponsorshipAgreementDetailResponseSchema.parse({ data: serializeAgreementDetail(detail) }));
  });

  app.patch("/stores/:storeId/sponsorship-agreements/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipAgreementUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid agreement."));
    const b = parsed.data;
    const result = await data.updateAgreement(
      storeId,
      id,
      {
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.startsAt !== undefined ? { startsAt: new Date(b.startsAt) } : {}),
        ...(b.endsAt !== undefined ? { endsAt: new Date(b.endsAt) } : {}),
        ...(b.currency !== undefined ? { currency: b.currency } : {}),
        ...(b.pricingModel !== undefined ? { pricingModel: b.pricingModel } : {}),
        ...(b.settlementPeriod !== undefined ? { settlementPeriod: b.settlementPeriod } : {}),
        ...(b.agreedAmountMinor !== undefined ? { agreedAmountMinor: b.agreedAmountMinor } : {}),
        ...(b.unitPriceMinor !== undefined ? { unitPriceMinor: b.unitPriceMinor } : {}),
        ...(b.revenueSharePercentBp !== undefined ? { revenueSharePercentBp: b.revenueSharePercentBp } : {}),
        ...(b.budgetLimitMinor !== undefined ? { budgetLimitMinor: b.budgetLimitMinor } : {}),
        ...(b.paymentTermDays !== undefined ? { paymentTermDays: b.paymentTermDays } : {}),
        ...(b.taxRateBp !== undefined ? { taxRateBp: b.taxRateBp } : {}),
        ...(b.signedAt !== undefined ? { signedAt: b.signedAt ? new Date(b.signedAt) : null } : {}),
        ...(b.documentUrl !== undefined ? { documentUrl: b.documentUrl } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
      },
      new Date(),
    );
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Agreement not found."));
    if (typeof result === "string") {
      const e = AGREEMENT_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipAgreement", entityId: id });
    return reply.send(sponsorshipAgreementDetailResponseSchema.parse({ data: serializeAgreementDetail((await data.getAgreementDetail(storeId, id, new Date()))!) }));
  });

  app.post("/stores/:storeId/sponsorship-agreements/:id/campaigns", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipAgreementCampaignLinkRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid link."));
    const result = await data.linkCampaign(storeId, id, parsed.data.campaignId, parsed.data.allocationAmountMinor ?? null);
    if (typeof result === "string") {
      const e = LINK_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipAgreement", entityId: id, metadata: { linkedCampaign: parsed.data.campaignId } });
    return reply.send(sponsorshipAgreementDetailResponseSchema.parse({ data: serializeAgreementDetail(result) }));
  });

  app.delete("/stores/:storeId/sponsorship-agreements/:id/campaigns/:campaignId", async (request, reply) => {
    const { storeId, id, campaignId } = request.params as { storeId: string; id: string; campaignId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const result = await data.unlinkCampaign(storeId, id, campaignId, new Date());
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Link not found."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipAgreement", entityId: id, metadata: { unlinkedCampaign: campaignId } });
    return reply.send(sponsorshipAgreementDetailResponseSchema.parse({ data: serializeAgreementDetail(result) }));
  });

  // ─────────────────────────── Mutabakat (settlement) ───────────────────────────
  app.post("/stores/:storeId/sponsorship-agreements/:id/settlements/preview", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipSettlementPreviewRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid period."));
    const b = parsed.data;
    const result = await data.previewSettlement(
      storeId,
      id,
      { periodStart: new Date(b.periodStart), periodEnd: new Date(b.periodEnd), periodKind: b.periodKind ?? "MANUAL" },
      new Date(),
    );
    if (typeof result === "string") {
      const e = SETTLEMENT_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    return reply.send(sponsorshipSettlementDetailResponseSchema.parse({ data: serializeSettlement(result) }));
  });

  app.get("/stores/:storeId/sponsorship-settlements", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipSettlementListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listSettlements(storeId, { status: q.status, agreementId: q.agreementId }, toListPage(q, pageInfo));
    return reply.send(
      sponsorshipSettlementListResponseSchema.parse({
        data: items.map(serializeSettlement),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.get("/stores/:storeId/sponsorship-settlements/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const settlement = await data.getSettlement(storeId, id);
    if (!settlement) return reply.code(404).send(errorBody("NOT_FOUND", "Settlement not found."));
    return reply.send(sponsorshipSettlementDetailResponseSchema.parse({ data: serializeSettlement(settlement) }));
  });

  app.post("/stores/:storeId/sponsorship-settlements/:id/finalize", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const result = await data.finalizeSettlement(storeId, id, new Date());
    if (result === null) return reply.code(404).send(errorBody("NOT_FOUND", "Settlement not found."));
    if (result === "ALREADY_FINALIZED") return reply.code(409).send(errorBody("ALREADY_FINALIZED", "Settlement is already finalized."));
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipSettlement", entityId: id, metadata: { finalized: true } });
    return reply.send(sponsorshipSettlementDetailResponseSchema.parse({ data: serializeSettlement(result) }));
  });

  app.delete("/stores/:storeId/sponsorship-settlements/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const result = await data.deleteSettlement(storeId, id);
    if (result === "NOT_FOUND") return reply.code(404).send(errorBody("NOT_FOUND", "Settlement not found."));
    if (result === "FINALIZED") return reply.code(409).send(errorBody("SETTLEMENT_FINALIZED", "Finalized settlement is immutable and cannot be deleted."));
    await recordAudit({ action: "DELETE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipSettlement", entityId: id });
    return reply.code(204).send();
  });

  app.post("/stores/:storeId/sponsorship-settlements/:id/charge", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipChargeCreateRequestSchema.safeParse({ settlementId: id, ...(request.body as object) });
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid charge request."));
    const now = new Date();
    const result = await data.createChargeFromSettlement(storeId, id, { notes: parsed.data.notes ?? null, issue: parsed.data.issue ?? true }, now);
    if (typeof result === "string") {
      const e = CHARGE_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipCharge", entityId: result.id, metadata: { settlementId: id, totalAmountMinor: result.totalAmountMinor } });
    return reply.code(201).send(sponsorshipChargeDetailResponseSchema.parse({ data: serializeCharge(result, now) }));
  });

  app.post("/stores/:storeId/sponsorship-settlements/:id/refund-adjustment", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const now = new Date();
    const result = await data.createRefundAdjustment(storeId, id, now);
    if (result === null) return reply.send({ data: null }); // etki yok (0) → yeni belge açılmadı
    if (typeof result === "string") {
      const e = CHARGE_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipCharge", entityId: result.id, metadata: { adjustment: true, subtotalMinor: result.subtotalMinor } });
    return reply.code(201).send(sponsorshipChargeDetailResponseSchema.parse({ data: serializeCharge(result, now) }));
  });

  // ─────────────────────────── Tahakkuk (charge) ───────────────────────────
  app.get("/stores/:storeId/sponsorship-charges", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipChargeListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const now = new Date();
    const { items, total } = await data.listCharges(
      storeId,
      {
        status: q.status,
        agreementId: q.agreementId,
        sponsorAccountId: q.sponsorAccountId,
        chargeType: q.chargeType,
        overdueOnly: q.overdueOnly === "true",
        dateFrom: parseDay(q.dateFrom),
        dateTo: expandDateTo(q.dateTo),
      },
      toListPage(q, pageInfo),
      now,
    );
    return reply.send(
      sponsorshipChargeListResponseSchema.parse({
        data: items.map((c) => serializeCharge(c, now)),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.get("/stores/:storeId/sponsorship-charges/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipChargeListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const now = new Date();
    const { items } = await data.listCharges(
      storeId,
      {
        status: q.status,
        agreementId: q.agreementId,
        sponsorAccountId: q.sponsorAccountId,
        chargeType: q.chargeType,
        overdueOnly: q.overdueOnly === "true",
        dateFrom: parseDay(q.dateFrom),
        dateTo: expandDateTo(q.dateTo),
      },
      { limit: 10000, offset: 0, sortBy: "createdAt", sortOrder: "desc" },
      now,
    );
    const header = ["chargeNumber", "sponsor", "agreementNumber", "chargeType", "status", "displayStatus", "periodStart", "periodEnd", "currency", "subtotalMinor", "taxAmountMinor", "totalAmountMinor", "paidMinor", "remainingMinor", "dueAt"];
    const lines = [header.join(",")];
    for (const c of items) {
      const display = resolveChargeDisplayStatus(c.status, c.dueAt, c.remainingMinor, now);
      lines.push(
        [
          csvCell(c.chargeNumber),
          csvCell(c.sponsorCompanyName),
          csvCell(c.agreementNumber),
          csvCell(c.chargeType),
          csvCell(c.status),
          csvCell(display),
          csvCell(c.periodStart.toISOString()),
          csvCell(c.periodEnd.toISOString()),
          csvCell(c.currency),
          String(c.subtotalMinor),
          String(c.taxAmountMinor),
          String(c.totalAmountMinor),
          String(c.paidMinor),
          String(c.remainingMinor),
          csvCell(c.dueAt.toISOString()),
        ].join(","),
      );
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="sponsorship-charges.csv"`);
    return reply.send(lines.join("\r\n"));
  });

  app.get("/stores/:storeId/sponsorship-charges/:id", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const now = new Date();
    const charge = await data.getCharge(storeId, id, now);
    if (!charge) return reply.code(404).send(errorBody("NOT_FOUND", "Charge not found."));
    return reply.send(sponsorshipChargeDetailResponseSchema.parse({ data: serializeCharge(charge, now) }));
  });

  app.post("/stores/:storeId/sponsorship-charges/:id/issue", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipChargeIssueRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid request."));
    const now = new Date();
    const result = await data.issueCharge(storeId, id, parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : now, now);
    if (typeof result === "string") {
      const e = CHARGE_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipCharge", entityId: id, metadata: { issued: true } });
    return reply.send(sponsorshipChargeDetailResponseSchema.parse({ data: serializeCharge(result, now) }));
  });

  app.post("/stores/:storeId/sponsorship-charges/:id/cancel", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipChargeCancelRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid request."));
    const now = new Date();
    const result = await data.cancelCharge(storeId, id, parsed.data.reason ?? null, now);
    if (typeof result === "string") {
      const e = CHARGE_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipCharge", entityId: id, metadata: { cancelled: true } });
    return reply.send(sponsorshipChargeDetailResponseSchema.parse({ data: serializeCharge(result, now) }));
  });

  // ─────────────────────────── Tahsilat (payment) ───────────────────────────
  app.post("/stores/:storeId/sponsorship-charges/:id/payments", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipPaymentCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid payment."));
    const b = parsed.data;
    const result = await data.recordPayment(
      storeId,
      id,
      {
        amountMinor: b.amountMinor,
        currency: b.currency,
        method: b.method,
        paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
        providerReference: b.providerReference ?? null,
        manualReference: b.manualReference ?? null,
        notes: b.notes ?? null,
        idempotencyKey: b.idempotencyKey,
        recordedByUserId: access.actorUserId,
      },
    );
    if (typeof result === "string") {
      const e = PAYMENT_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "CREATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipPayment", entityId: result.id, metadata: { chargeId: id, amountMinor: result.amountMinor } });
    return reply.code(201).send(sponsorshipPaymentDetailResponseSchema.parse({ data: serializePayment(result) }));
  });

  app.get("/stores/:storeId/sponsorship-payments", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipPaymentListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const pageInfo = resolveAdminListPage(q, ADMIN_LIST_DEFAULT_PAGE_SIZE);
    const { items, total } = await data.listPayments(
      storeId,
      { agreementId: q.agreementId, sponsorAccountId: q.sponsorAccountId, chargeId: q.chargeId, method: q.method, dateFrom: parseDay(q.dateFrom), dateTo: expandDateTo(q.dateTo) },
      toListPage(q, pageInfo),
    );
    return reply.send(
      sponsorshipPaymentListResponseSchema.parse({
        data: items.map(serializePayment),
        pagination: buildAdminListPagination({ page: pageInfo.page, pageSize: pageInfo.pageSize, totalItems: total }),
      }),
    );
  });

  app.get("/stores/:storeId/sponsorship-payments/export", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipPaymentListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const { items } = await data.listPayments(
      storeId,
      { agreementId: q.agreementId, sponsorAccountId: q.sponsorAccountId, chargeId: q.chargeId, method: q.method, dateFrom: parseDay(q.dateFrom), dateTo: expandDateTo(q.dateTo) },
      { limit: 10000, offset: 0, sortBy: "paidAt", sortOrder: "desc" },
    );
    const header = ["paidAt", "sponsor", "agreementNumber", "chargeNumber", "method", "currency", "amountMinor", "isReversal", "reference"];
    const lines = [header.join(",")];
    for (const p of items) {
      lines.push(
        [
          csvCell(p.paidAt.toISOString()),
          csvCell(p.sponsorCompanyName),
          csvCell(p.agreementNumber),
          csvCell(p.chargeNumber ?? ""),
          csvCell(p.method),
          csvCell(p.currency),
          String(p.amountMinor),
          csvCell(p.isReversal ? "true" : "false"),
          csvCell(p.providerReference ?? p.manualReference ?? ""),
        ].join(","),
      );
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="sponsorship-payments.csv"`);
    return reply.send(lines.join("\r\n"));
  });

  app.post("/stores/:storeId/sponsorship-payments/:id/reverse", async (request, reply) => {
    const { storeId, id } = request.params as { storeId: string; id: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipPaymentReverseRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid request."));
    const result = await data.reversePayment(storeId, id, parsed.data.reason ?? null, access.actorUserId, new Date());
    if (typeof result === "string") {
      const e = PAYMENT_ERROR_STATUS[result];
      return reply.code(e.code).send(errorBody(result, e.message));
    }
    await recordAudit({ action: "UPDATE", platformUserId: access.actorUserId, storeId, entityType: "SponsorshipPayment", entityId: id, metadata: { reversed: true } });
    return reply.code(201).send(sponsorshipPaymentDetailResponseSchema.parse({ data: serializePayment(result) }));
  });

  // ─────────────────────────── Dashboard ───────────────────────────
  app.get("/stores/:storeId/sponsorship-dashboard", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = sponsorshipDashboardQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_QUERY", "Invalid query."));
    const q = parsed.data;
    const result = await data.getDashboard(
      storeId,
      { dateFrom: parseDay(q.dateFrom), dateTo: expandDateTo(q.dateTo), sponsorAccountId: q.sponsorAccountId, agreementId: q.agreementId },
      new Date(),
    );
    return reply.send(sponsorshipDashboardResponseSchema.parse({ data: result }));
  });
}

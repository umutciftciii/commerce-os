/**
 * Shopping Balance Admin (Müşteri Bakiye Yönetimi) — Store-Admin route'ları.
 *
 * GET /stores/:storeId/shopping-balance            → per-müşteri liste + mağaza-geneli KPI özeti
 * GET /stores/:storeId/shopping-balance/:customerId → müşteri detayı (lot + bucket + ledger)
 *
 * SALT-OKUNUR. Tüm sorgular storeId-first scoped; cross-store 404 (leak-free). Guard =
 * requireStoreAdmin (platform-admin + store scope) — customer-credit routes.ts ile aynı DI.
 * Para KANONİK MINOR STRING; client'tan bakiye/kaynak güveni YOK (server projeksiyon otoritesi).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@commerce-os/db";
import { minorToCanonicalString } from "@commerce-os/utils";
import {
  resolveAdminListPage,
  buildAdminListPagination,
  shoppingBalanceListQuerySchema,
  shoppingBalanceListResponseSchema,
  shoppingBalanceDetailSchema,
} from "@commerce-os/contracts";
import {
  listCustomerBalances,
  shoppingBalanceSummary,
  getCustomerBalanceDetail,
  EXPIRING_SOON_DEFAULT_DAYS,
  type ShoppingBalanceRow,
  type ShoppingBalanceBuckets,
  type CreditLotDetail,
} from "./admin-projection.js";
import type { CreditLedgerEntryView } from "./service.js";

interface StoreAdminAccess {
  actorUserId: string;
  isSuperAdmin: boolean;
}

export interface ShoppingBalanceAdminRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<StoreAdminAccess | null>;
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });
const storeParam = z.object({ storeId: z.string().min(1) });
const customerParam = z.object({ storeId: z.string().min(1), customerId: z.string().min(1) });

const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

const serializeBuckets = (b: ShoppingBalanceBuckets) => ({
  availableMinor: minorToCanonicalString(b.availableMinor),
  issuedMinor: minorToCanonicalString(b.issuedMinor),
  spentMinor: minorToCanonicalString(b.spentMinor),
  refundOriginMinor: minorToCanonicalString(b.refundOriginMinor),
  restoredMinor: minorToCanonicalString(b.restoredMinor),
  goodwillMinor: minorToCanonicalString(b.goodwillMinor),
  expiredMinor: minorToCanonicalString(b.expiredMinor),
  nearestExpiryAt: isoOrNull(b.nearestExpiryAt),
  lastMovementAt: isoOrNull(b.lastMovementAt),
});

const serializeRow = (r: ShoppingBalanceRow) => ({
  customerId: r.customerId,
  customerName: r.customerName,
  customerEmail: r.customerEmail,
  currency: r.currency,
  ...serializeBuckets(r),
});

const serializeLot = (l: CreditLotDetail) => ({
  id: l.id,
  sourceType: l.sourceType,
  sourceId: l.sourceId,
  originalAmountMinor: minorToCanonicalString(l.originalAmountMinor),
  remainingAmountMinor: minorToCanonicalString(l.remainingAmountMinor),
  status: l.status,
  issuedAt: l.issuedAt.toISOString(),
  expiresAt: isoOrNull(l.expiresAt),
});

/** Ledger view → DTO (orderId → orderNumber çözümü ile; description SEMANTİK KEY kalır). */
async function serializeLedger(storeId: string, entries: CreditLedgerEntryView[]) {
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter((v): v is string => !!v))];
  const orderRows = orderIds.length
    ? await prisma.order.findMany({ where: { storeId, id: { in: orderIds } }, select: { id: true, orderNumber: true } })
    : [];
  const orderNumberById = new Map(orderRows.map((o) => [o.id, o.orderNumber]));
  return entries.map((e) => ({
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
  }));
}

export function registerShoppingBalanceAdminRoutes(
  app: FastifyInstance,
  deps: ShoppingBalanceAdminRoutesDeps,
): void {
  // Liste + KPI özeti.
  app.get("/stores/:storeId/shopping-balance", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const query = shoppingBalanceListQuerySchema.parse(request.query);
    const { page, pageSize, limit, offset } = resolveAdminListPage(query);
    const expiringWithinDays = query.expiringWithinDays ?? EXPIRING_SOON_DEFAULT_DAYS;

    const [list, summary] = await Promise.all([
      listCustomerBalances({
        storeId: params.storeId,
        search: query.search,
        balancePositiveOnly: query.balancePositive,
        source: query.source,
        expiringWithinDays: query.expiringWithinDays ?? null,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        limit,
        offset,
      }),
      shoppingBalanceSummary({ storeId: params.storeId, expiringWithinDays }),
    ]);

    const body = shoppingBalanceListResponseSchema.parse({
      data: list.rows.map(serializeRow),
      summary: {
        currency: summary.currency,
        outstandingLiabilityMinor: minorToCanonicalString(summary.outstandingLiabilityMinor),
        customersWithBalance: summary.customersWithBalance,
        goodwillBalanceMinor: minorToCanonicalString(summary.goodwillBalanceMinor),
        refundOriginBalanceMinor: minorToCanonicalString(summary.refundOriginBalanceMinor),
        expiringSoonMinor: minorToCanonicalString(summary.expiringSoonMinor),
        expiringWithinDays,
      },
      pagination: buildAdminListPagination({ page, pageSize, totalItems: list.total }),
    });
    await reply.send(body);
  });

  // Müşteri detayı (lot + bucket + ledger).
  app.get("/stores/:storeId/shopping-balance/:customerId", async (request, reply) => {
    const params = customerParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;

    const detail = await getCustomerBalanceDetail({
      storeId: params.storeId,
      customerId: params.customerId,
    });
    if (!detail) {
      await reply.code(404).send(errorBody("NOT_FOUND", "Bakiye hesabı bulunamadı."));
      return;
    }

    const body = shoppingBalanceDetailSchema.parse({
      customerId: detail.customerId,
      customerName: detail.customerName,
      customerEmail: detail.customerEmail,
      currency: detail.currency,
      summary: serializeBuckets(detail.summary),
      lots: detail.lots.map(serializeLot),
      ledger: await serializeLedger(params.storeId, detail.ledger),
    });
    await reply.send(body);
  });
}

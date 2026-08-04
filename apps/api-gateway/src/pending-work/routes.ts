/**
 * TODO-170-recovery — Store Admin Bekleyen İş Özeti ucu. Store-scoped, role-aware, bounded
 * aggregate: iki groupBy sorgusu (reviews + returns), her menü item için ayrı istek YOK.
 * requireStoreAdmin ile korunur; başka store'un sayıları ASLA sızmaz.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import { z } from "zod";
import { pendingWorkSummarySchema } from "@commerce-os/contracts";
import { buildPendingWorkSummary, type StatusCountRow } from "./summary.js";
import type { ReturnStatus, ProductReviewStatus } from "@prisma/client";

export interface PendingWorkRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
}

const storeParam = z.object({ storeId: z.string().min(1) });

export function registerPendingWorkRoutes(app: FastifyInstance, deps: PendingWorkRoutesDeps): void {
  app.get("/stores/:storeId/pending-work-summary", async (request, reply) => {
    const { storeId } = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return;

    const [reviewGroups, returnGroups] = await Promise.all([
      prisma.productReview.groupBy({
        by: ["status"],
        where: { storeId, status: "PENDING" },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      prisma.returnRequest.groupBy({
        by: ["status"],
        where: { storeId },
        _count: { _all: true },
        _min: { requestedAt: true },
      }),
    ]);

    const reviewRows: StatusCountRow<ProductReviewStatus>[] = reviewGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
      oldest: g._min.createdAt,
    }));
    const returnRows: StatusCountRow<ReturnStatus>[] = returnGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
      oldest: g._min.requestedAt,
    }));

    return pendingWorkSummarySchema.parse(buildPendingWorkSummary(reviewRows, returnRows));
  });
}

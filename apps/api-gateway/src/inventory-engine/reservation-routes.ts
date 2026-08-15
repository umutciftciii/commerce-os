/**
 * H-3 pre-ship (ADR-191…194) — Rezervasyon süre-aşımı / reconciliation HTTP route katmanı (store-admin;
 * public YOK). Her uç `/stores/:storeId/inventory/reservations/...` + `requireStoreAdmin` → tenant-izole.
 *
 * Sunucu otoritesi:
 *  - api-gateway süpürücüyü ÇALIŞTIRMAZ: manuel expiry/reconcile job'unu apps/worker kuyruğuna ENQUEUE eder
 *    (yürütme worker'da; advisory lock manuel↔zamanlanmış çakışmasını çözer). Status + reconcile-scan salt-okunur.
 *  - TTL/cutoff SUNUCU config'inden; istemci gönderemez (yalnız `dryRun` bayrağı).
 *  - Manuel çalıştırma VARSAYILAN DRY-RUN; APPLY yalnız `dryRun:false` ile explicit (yıkıcı → onaylı).
 *  - Client rezervasyon status/expiry DEĞİŞTİREMEZ (yalnız güvenli süpürücü/reconcile tetikler).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { InventoryMaintenanceJobData } from "@commerce-os/queues";
import {
  getLatestJobRun,
  scanReservationReconciliation,
  reservationVisibilitySummary,
  INVENTORY_RESERVATION_EXPIRY_JOB,
  INVENTORY_RESERVATION_RECONCILE_JOB,
  type JobLogClient,
} from "@commerce-os/inventory";
import type { StoreAuditActor } from "../store-auth/guard.js";

type AuditFn = (input: StoreAuditActor & {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

export interface ReservationRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string; audit: StoreAuditActor } | null>;
  prisma: PrismaClient;
  jobLog: JobLogClient;
  /** apps/worker kuyruğuna manuel bakım job'u enqueue eder; jobId döner. */
  enqueueMaintenanceJob: (data: InventoryMaintenanceJobData) => Promise<string>;
  recordAudit: AuditFn;
  orphanDraftMaxAgeMinutes: number;
}

function draftCutoffFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function registerReservationRoutes(app: FastifyInstance, deps: ReservationRoutesDeps): void {
  const { requireStoreAdmin, prisma, jobLog, enqueueMaintenanceJob, recordAudit, orphanDraftMaxAgeMinutes } = deps;

  // ── Operasyon görünürlüğü (salt-okunur): sayaçlar + son job'lar + reconciliation özeti. ────────
  app.get("/stores/:storeId/inventory/reservations/status", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const now = new Date();
    const draftCutoff = draftCutoffFrom(now, orphanDraftMaxAgeMinutes);
    const [summary, reconciliation, lastExpiry, lastReconcile] = await Promise.all([
      reservationVisibilitySummary(prisma, storeId, now, draftCutoff),
      scanReservationReconciliation(prisma, storeId, now),
      getLatestJobRun(jobLog, storeId, INVENTORY_RESERVATION_EXPIRY_JOB),
      getLatestJobRun(jobLog, storeId, INVENTORY_RESERVATION_RECONCILE_JOB),
    ]);
    return reply.send({
      summary,
      reconciliation,
      lastExpiryJob: lastExpiry
        ? { status: lastExpiry.status, at: lastExpiry.createdAt.toISOString(), report: lastExpiry.report ?? null }
        : null,
      lastReconcileJob: lastReconcile
        ? { status: lastReconcile.status, at: lastReconcile.createdAt.toISOString(), report: lastReconcile.report ?? null }
        : null,
    });
  });

  // ── Reconciliation (salt-okunur tarama). ────────────────────────────────────────────────────
  app.get("/stores/:storeId/inventory/reservations/reconcile", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const report = await scanReservationReconciliation(prisma, storeId, new Date());
    return reply.send(report);
  });

  // ── Manuel EXPIRY tetik (enqueue → worker). VARSAYILAN DRY-RUN; APPLY yalnız dryRun:false. ─────
  app.post("/stores/:storeId/inventory/reservations/expiry/run", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = (request.body ?? {}) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false;
    const jobId = await enqueueMaintenanceJob({ jobType: "expiry", trigger: "MANUAL", storeId, dryRun });
    await recordAudit({
      action: "SYSTEM",
      ...access.audit,
      storeId,
      entityType: "InventoryReservationExpiry",
      metadata: { mode: dryRun ? "dry-run" : "apply", jobId },
    });
    return reply.code(202).send({ enqueued: true, jobType: "expiry", mode: dryRun ? "dry-run" : "apply", jobId });
  });

  // ── Manuel RECONCILE tetik (PAID+ACTIVE; enqueue → worker). VARSAYILAN DRY-RUN. ────────────────
  app.post("/stores/:storeId/inventory/reservations/reconcile/run", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = (request.body ?? {}) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false;
    const jobId = await enqueueMaintenanceJob({ jobType: "reconcile", trigger: "MANUAL", storeId, dryRun });
    await recordAudit({
      action: "SYSTEM",
      ...access.audit,
      storeId,
      entityType: "InventoryReservationReconcile",
      metadata: { mode: dryRun ? "dry-run" : "apply", jobId },
    });
    return reply.code(202).send({ enqueued: true, jobType: "reconcile", mode: dryRun ? "dry-run" : "apply", jobId });
  });
}

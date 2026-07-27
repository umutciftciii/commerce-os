/**
 * TODO-161A.1 (ADR-136) — Commercial Automation & Retention HTTP route katmanı.
 *
 * TAMAMI store-admin yüzeyidir; public uç YOKTUR. Her uç `/stores/:storeId/commercial-automation/...`
 * + `requireStoreAdmin` guard'ı (platform SUPER_ADMIN/SUPPORT_ADMIN + store scope) → tenant-izole.
 *
 * Sunucu otoritesi:
 *  - storeId URL'den gelir; her iki servis de o store'a scope'lanır (cross-store imkânsız).
 *  - Retention cutoff/gün SUNUCU config'inden; istemci cutoff GÖNDEREMEZ (yalnız dryRun bayrağı).
 *  - Retention manuel varsayılan DRY-RUN; APPLY yalnız `dryRun:false` ile explicit (yıkıcı → onaylı).
 *  - Settlement scheduler manuel varsayılan RUN (apply); DRAFT üretimi yıkıcı değildir (finalize YOK).
 *  - Allowlist: yalnız bu iki job tipi tetiklenebilir (rastgele job adı yok).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  commercialAutomationRunRequestSchema,
  commercialAutomationStatusResponseSchema,
  settlementSchedulerRunResponseSchema,
  retentionRunResponseSchema,
} from "@commerce-os/contracts";
import type { SettlementSchedulerService } from "./settlement-scheduler-service.js";
import type { RetentionService } from "./retention-service.js";
import {
  getLatestJobRun,
  SETTLEMENT_SCHEDULER_JOB,
  ATTRIBUTION_RETENTION_JOB,
  type JobLogClient,
  type JobRunRow,
} from "./job-log.js";

type AuditFn = (input: {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

export interface CommercialAutomationRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  settlementScheduler: SettlementSchedulerService;
  retention: RetentionService;
  jobLog: JobLogClient;
  recordAudit: AuditFn;
  retentionConfig: {
    sponsoredEventRetentionDays: number;
    influencerClickRetentionDays: number;
    maxDeletePerRun: number;
  };
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function serializeJobRun(row: JobRunRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    attempts: row.attempts,
    at: row.createdAt.toISOString(),
    report: row.report ?? null,
  };
}

export function registerCommercialAutomationRoutes(
  app: FastifyInstance,
  deps: CommercialAutomationRoutesDeps,
): void {
  const { requireStoreAdmin, settlementScheduler, retention, jobLog, recordAudit, retentionConfig } = deps;

  // ── Operasyon görünürlüğü (salt-okunur) ────────────────────────────────────────────────
  app.get("/stores/:storeId/commercial-automation/status", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const [settlement, retentionRun] = await Promise.all([
      getLatestJobRun(jobLog, storeId, SETTLEMENT_SCHEDULER_JOB),
      getLatestJobRun(jobLog, storeId, ATTRIBUTION_RETENTION_JOB),
    ]);
    return reply.send(
      commercialAutomationStatusResponseSchema.parse({
        data: {
          settlementScheduler: serializeJobRun(settlement),
          attributionRetention: serializeJobRun(retentionRun),
          retentionConfig: {
            sponsoredEventRetentionDays: retentionConfig.sponsoredEventRetentionDays,
            influencerClickRetentionDays: retentionConfig.influencerClickRetentionDays,
            maxDeletePerRun: retentionConfig.maxDeletePerRun,
          },
        },
      }),
    );
  });

  // ── Settlement scheduler manuel tetik (dry-run / run) ──────────────────────────────────
  app.post("/stores/:storeId/commercial-automation/settlement-scheduler/run", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = commercialAutomationRunRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid request."));
    // Settlement varsayılanı RUN (apply); dryRun=true ise yalnız aday raporlanır.
    const apply = parsed.data.dryRun !== true;
    const summary = await settlementScheduler.runOnce({ storeId, apply });
    if (summary.skippedLocked > 0) {
      // Dağıtık kilit başka bir tetik/instance'ta → kontrollü 409 (500 sızmaz).
      return reply.code(409).send(errorBody("JOB_ALREADY_RUNNING", "Settlement scheduler is already running for this store."));
    }
    await recordAudit({
      action: apply ? "CREATE" : "SYSTEM",
      platformUserId: access.actorUserId,
      storeId,
      entityType: "CommercialAutomation",
      metadata: {
        job: SETTLEMENT_SCHEDULER_JOB,
        mode: apply ? "apply" : "dry-run",
        createdDrafts: summary.createdDrafts,
        candidateDrafts: summary.candidateDrafts,
        erroredAgreements: summary.erroredAgreements,
      },
    });
    return reply.send(
      settlementSchedulerRunResponseSchema.parse({
        data: {
          mode: summary.mode,
          stores: summary.stores,
          scannedAgreements: summary.scannedAgreements,
          createdDrafts: summary.createdDrafts,
          candidateDrafts: summary.candidateDrafts,
          erroredAgreements: summary.erroredAgreements,
          skippedLocked: summary.skippedLocked,
          perStore: summary.perStore,
        },
      }),
    );
  });

  // ── Retention manuel tetik (dry-run varsayılan / apply explicit) ────────────────────────
  app.post("/stores/:storeId/commercial-automation/retention/run", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const parsed = commercialAutomationRunRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody("INVALID_BODY", "Invalid request."));
    // Retention varsayılanı DRY-RUN (yıkıcı); APPLY yalnız dryRun:false ile explicit.
    const apply = parsed.data.dryRun === false;
    const summary = await retention.runOnce({ storeId, apply });
    if (summary.skippedLocked > 0) {
      return reply.code(409).send(errorBody("JOB_ALREADY_RUNNING", "Attribution retention is already running for this store."));
    }
    await recordAudit({
      action: apply ? "DELETE" : "SYSTEM",
      platformUserId: access.actorUserId,
      storeId,
      entityType: "CommercialAutomation",
      metadata: {
        job: ATTRIBUTION_RETENTION_JOB,
        mode: apply ? "apply" : "dry-run",
        totalCandidates: summary.totalCandidates,
        totalDeleted: summary.totalDeleted,
      },
    });
    return reply.send(
      retentionRunResponseSchema.parse({
        data: {
          mode: summary.mode,
          stores: summary.stores,
          totalCandidates: summary.totalCandidates,
          totalDeleted: summary.totalDeleted,
          skippedLocked: summary.skippedLocked,
          perStore: summary.perStore,
        },
      }),
    );
  });
}

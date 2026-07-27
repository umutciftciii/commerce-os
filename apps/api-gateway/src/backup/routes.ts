/**
 * PB-2/PB-3 — Backup görünürlük + manuel tetik HTTP route'ları (spec §1, §8, §14).
 *
 * TAMAMI internal-token guard'lı (BFF INTERNAL_API_TOKEN ekler); public/store yüzeyi YOK. Backup YÜRÜTMESİ
 * bu süreçte DEĞİL — manuel `run` yalnız worker kuyruğuna one-off job ENQUEUE eder (periyodik zamanlama
 * tamamen worker'da). Manuel RESTORE ucu YOKTUR (restore yalnız CLI/runbook). API secret/object key/
 * connection string DÖNDÜRMEZ.
 *  - GET  /internal/backup/health  → readiness (HEALTHY/DEGRADED → 200; CRITICAL/NOT_CONFIGURED → 503)
 *  - GET  /internal/backup/status  → health + son çalışmalar + retention + RPO/RTO hedefleri
 *  - POST /internal/backup/run     → worker'a enqueue (202); varsayılan DRY-RUN, gerçek backup {"dryRun":false}
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "@commerce-os/logger";
import {
  computeBackupHealth,
  isBackupHealthReady,
  getRecentBackupRuns,
  DATABASE_BACKUP_JOB,
  RESTORE_VERIFICATION_JOB,
  type BackupConfig,
  type BackupJobLogClient,
} from "@commerce-os/backup";

export interface BackupRoutesDeps {
  guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  backupConfig: BackupConfig;
  jobLog: BackupJobLogClient;
  /** Worker kuyruğuna one-off backup job enqueue eder; jobId döndürür. */
  enqueue: (data: { trigger: "MANUAL"; dryRun: boolean }) => Promise<string>;
  logger: Logger;
  now?: () => Date;
}

export function registerBackupRoutes(app: FastifyInstance, deps: BackupRoutesDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get("/internal/backup/health", { preHandler: deps.guard }, async (_request, reply) => {
    const health = await computeBackupHealth(deps.jobLog, deps.backupConfig, now);
    return reply.code(isBackupHealthReady(health.status) ? 200 : 503).send(health);
  });

  app.get("/internal/backup/status", { preHandler: deps.guard }, async (_request, reply) => {
    const health = await computeBackupHealth(deps.jobLog, deps.backupConfig, now);
    const recentBackups = await getRecentBackupRuns(deps.jobLog, DATABASE_BACKUP_JOB, 10);
    const recentVerifications = await getRecentBackupRuns(deps.jobLog, RESTORE_VERIFICATION_JOB, 5);
    return reply.code(200).send({
      health,
      retention: deps.backupConfig.retention,
      offsite: deps.backupConfig.storage
        ? { configured: true, describe: `bucket:${deps.backupConfig.storage.bucket}` }
        : { configured: false },
      recentBackups: recentBackups.map(serializeRun),
      recentVerifications: recentVerifications.map(serializeRun),
    });
  });

  app.post("/internal/backup/run", { preHandler: deps.guard }, async (request, reply) => {
    const body = (request.body ?? {}) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false; // varsayılan DRY-RUN; gerçek backup açık {"dryRun":false}
    const jobId = await deps.enqueue({ trigger: "MANUAL", dryRun });
    // Backup worker'da çalışır (bu süreçte DEĞİL) → 202 Accepted.
    return reply.code(202).send({ enqueued: true, jobId, dryRun });
  });
}

function serializeRun(run: { outcome: string; report: Record<string, unknown>; createdAt: Date }) {
  const r = run.report;
  return {
    outcome: run.outcome,
    createdAt: run.createdAt.toISOString(),
    base: (r.base as string) ?? null,
    trigger: (r.trigger as string) ?? null,
    durationMs: (r.durationMs as number) ?? null,
    encryptedSize: (r.encryptedSize as number) ?? null,
    remoteVerified: (r.remoteVerified as boolean) ?? null,
  };
}

/**
 * H-3 (ADR-191/192) — inventory-reservation-expiry SERVİSİ (DB orkestrasyon; DI-testable).
 *
 * Tur akışı (STORE BAŞINA):
 *  1. Kapsam çözülür (sweep: tümü; manuel: tek store).
 *  2. (jobType, storeId) advisory lock. Alınamazsa SKIPPED_LOCKED.
 *  3. QueueJobLog STARTED satırı.
 *  4. Expired ACTIVE rezervasyon adayları sayılır. Circuit breaker: aday > maxReleasePerRun → APPLY
 *     reddedilir (CIRCUIT_BROKEN); dry-run her zaman raporlar.
 *  5. APPLY: bounded batch döngüsü — her aday kilit altında yeniden okunur (payment-vs-expiry):
 *     order PAID/AUTHORIZED → CONSUME (reconcile), aksi halde EXPIRE (stok geri).
 *  6. Süresi dolmuş rezervasyonlu PLACED+UNPAID siparişler kontrollü CANCELLED'a alınır (silinmez).
 *  7. Orphan DRAFT (ödeme yok + eski) kontrollü CANCELLED'a alınır.
 *  8. QueueJobLog terminal update. Kilit release.
 */
import type { Logger } from "@commerce-os/logger";
import {
  startJobRun,
  finishJobRun,
  recordSkippedLockedRun,
  INVENTORY_RESERVATION_EXPIRY_JOB,
  type JobLogClient,
  type JobTrigger,
  type TerminalJobOutcome,
} from "./reservation-job-log.js";
import type { StoreJobLocker } from "@commerce-os/db";

export interface ExpiredBatchResult {
  /** Bu batch'te işlenen (kilitlenen) aday sayısı. */
  processed: number;
  /** ACTIVE → EXPIRED (stok geri verilen). */
  expired: number;
  /** PAID/AUTHORIZED + ACTIVE → CONSUMED (reconcile). */
  reconciledConsumed: number;
  /** Durumu değişmiş/atlanmış (idempotent). */
  skipped: number;
}

/** DB erişim portu (fake ile birim-test edilebilir). Tüm sorgular bounded / store-scoped / UTC. */
export interface ReservationExpiryPersistence {
  listStores(storeId: string | undefined): Promise<string[]>;
  /** cutoff'tan önce süresi dolmuş ACTIVE rezervasyon adayı sayısı (circuit breaker + dry-run). */
  countExpiredReservations(storeId: string, cutoff: Date): Promise<number>;
  /** APPLY: tek bounded batch işler (FOR UPDATE SKIP LOCKED). Boş batch → processed=0 (döngü biter). */
  processExpiredBatch(storeId: string, cutoff: Date, now: Date, batchSize: number): Promise<ExpiredBatchResult>;
  /** Süresi dolmuş rezervasyonlu PLACED+UNPAID siparişleri kontrollü CANCELLED yapar (bounded). Kapatılan sayısı. */
  cancelExpiredOrdersBatch(storeId: string, now: Date, batchSize: number): Promise<number>;
  /** draftCutoff'tan eski, ödeme attempt'i olmayan DRAFT siparişleri sayar (dry-run). */
  countOrphanDrafts(storeId: string, draftCutoff: Date): Promise<number>;
  /** Orphan DRAFT'ları kontrollü CANCELLED yapar (bounded). Kapatılan sayısı. */
  cancelOrphanDraftsBatch(storeId: string, draftCutoff: Date, now: Date, batchSize: number): Promise<number>;
}

export interface StoreExpiryReport {
  storeId: string;
  mode: "dry-run" | "apply";
  outcome: TerminalJobOutcome;
  expiredCandidates: number;
  expiredReleased: number;
  reconciledConsumed: number;
  ordersCancelled: number;
  orphanDraftCandidates: number;
  orphanDraftsCancelled: number;
  circuitBroken: boolean;
}

export interface ReservationExpirySummary {
  stores: number;
  mode: "dry-run" | "apply";
  expiredCandidates: number;
  expiredReleased: number;
  reconciledConsumed: number;
  ordersCancelled: number;
  orphanDraftsCancelled: number;
  skippedLocked: number;
  circuitBroken: number;
  perStore: StoreExpiryReport[];
}

export interface ReservationExpiryServiceDeps {
  persistence: ReservationExpiryPersistence;
  jobLog: JobLogClient;
  logger: Logger;
  lock: StoreJobLocker;
  batchSize: number;
  /** Circuit breaker: tur başına store başına maksimum bırakılabilir rezervasyon. */
  maxReleasePerRun: number;
  /** Orphan DRAFT yaş eşiği (dk). */
  orphanDraftMaxAgeMinutes: number;
  clock?: () => Date;
}

export interface ReservationExpiryRunOptions {
  now?: Date;
  storeId?: string;
  /** false → dry-run (yazma YOK, yalnız aday raporlanır). Zamanlanmış tur varsayılan true. */
  apply?: boolean;
}

export interface ReservationExpiryService {
  runOnce(options?: ReservationExpiryRunOptions): Promise<ReservationExpirySummary>;
}

/** Sonsuz döngü backstop: aday/batch oranı + 1. */
function maxBatches(candidates: number, batchSize: number): number {
  return Math.ceil(Math.max(candidates, 1) / batchSize) + 1;
}

export function createReservationExpiryService(deps: ReservationExpiryServiceDeps): ReservationExpiryService {
  const { persistence, jobLog, logger, lock, batchSize, maxReleasePerRun, orphanDraftMaxAgeMinutes } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<ReservationExpirySummary> {
      const now = options?.now ?? new Date();
      const scopedStoreId = options?.storeId;
      const trigger: JobTrigger = scopedStoreId != null ? "MANUAL" : "SCHEDULED";
      const apply = options?.apply !== false;
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";
      const draftCutoff = new Date(now.getTime() - orphanDraftMaxAgeMinutes * 60_000);

      const stores = await persistence.listStores(scopedStoreId);
      const summary: ReservationExpirySummary = {
        stores: 0,
        mode,
        expiredCandidates: 0,
        expiredReleased: 0,
        reconciledConsumed: 0,
        ordersCancelled: 0,
        orphanDraftsCancelled: 0,
        skippedLocked: 0,
        circuitBroken: 0,
        perStore: [],
      };

      for (const storeId of stores) {
        const lockResult = await lock(INVENTORY_RESERVATION_EXPIRY_JOB, storeId, async () => {
          const startedAt = clock();
          const jobRunId = await startJobRun(jobLog, { storeId, trigger, startedAt });
          const report: StoreExpiryReport = {
            storeId,
            mode,
            outcome: mode === "dry-run" ? "DRY_RUN" : "COMPLETED",
            expiredCandidates: 0,
            expiredReleased: 0,
            reconciledConsumed: 0,
            ordersCancelled: 0,
            orphanDraftCandidates: 0,
            orphanDraftsCancelled: 0,
            circuitBroken: false,
          };
          let errored = false;

          try {
            // 1) Expired rezervasyon adayları (cutoff = now: expiresAt <= now).
            report.expiredCandidates = await persistence.countExpiredReservations(storeId, now);
            report.orphanDraftCandidates = await persistence.countOrphanDrafts(storeId, draftCutoff);

            if (!apply) {
              report.outcome = "DRY_RUN";
            } else if (report.expiredCandidates > maxReleasePerRun) {
              // Circuit breaker: kontrolsüz kütlesel expiry engellenir; APPLY reddedilir.
              report.circuitBroken = true;
              report.outcome = "CIRCUIT_BROKEN";
              logger.warn("reservation expiry circuit breaker tripped — apply skipped", {
                storeId,
                candidates: report.expiredCandidates,
                maxReleasePerRun,
              });
            } else {
              // 2) Rezervasyon expiry/reconcile (bounded batch döngüsü).
              const rLimit = maxBatches(report.expiredCandidates, batchSize);
              for (let i = 0; i < rLimit; i += 1) {
                const b = await persistence.processExpiredBatch(storeId, now, now, batchSize);
                report.expiredReleased += b.expired;
                report.reconciledConsumed += b.reconciledConsumed;
                if (b.processed < batchSize) break;
              }
              // 3) Süresi dolmuş rezervasyonlu PLACED+UNPAID siparişler → CANCELLED.
              const oLimit = maxBatches(report.expiredCandidates, batchSize);
              for (let i = 0; i < oLimit; i += 1) {
                const cancelled = await persistence.cancelExpiredOrdersBatch(storeId, now, batchSize);
                report.ordersCancelled += cancelled;
                if (cancelled < batchSize) break;
              }
              // 4) Orphan DRAFT temizliği.
              const dLimit = maxBatches(report.orphanDraftCandidates, batchSize);
              for (let i = 0; i < dLimit; i += 1) {
                const cancelled = await persistence.cancelOrphanDraftsBatch(storeId, draftCutoff, now, batchSize);
                report.orphanDraftsCancelled += cancelled;
                if (cancelled < batchSize) break;
              }
              report.outcome = "COMPLETED";
            }
          } catch (error) {
            errored = true;
            report.outcome = "FAILED";
            logger.error("reservation expiry store cycle failed", { storeId, error: error as Error });
          }

          await finishJobRun(jobLog, jobRunId, {
            outcome: report.outcome,
            trigger,
            startedAt,
            completedAt: clock(),
            report: {
              mode,
              expiredCandidates: report.expiredCandidates,
              expiredReleased: report.expiredReleased,
              reconciledConsumed: report.reconciledConsumed,
              ordersCancelled: report.ordersCancelled,
              orphanDraftCandidates: report.orphanDraftCandidates,
              orphanDraftsCancelled: report.orphanDraftsCancelled,
              circuitBroken: report.circuitBroken,
            },
            error: errored ? { failed: true } : undefined,
          });
          return report;
        });

        if (!lockResult.acquired) {
          const at = clock();
          await recordSkippedLockedRun(jobLog, { storeId, trigger, startedAt: at, completedAt: at });
          summary.skippedLocked += 1;
          summary.stores += 1;
          summary.perStore.push({
            storeId,
            mode,
            outcome: "SKIPPED_LOCKED",
            expiredCandidates: 0,
            expiredReleased: 0,
            reconciledConsumed: 0,
            ordersCancelled: 0,
            orphanDraftCandidates: 0,
            orphanDraftsCancelled: 0,
            circuitBroken: false,
          });
          logger.warn("reservation expiry store skipped (locked)", { storeId });
          continue;
        }

        const report = lockResult.result;
        summary.stores += 1;
        summary.expiredCandidates += report.expiredCandidates;
        summary.expiredReleased += report.expiredReleased;
        summary.reconciledConsumed += report.reconciledConsumed;
        summary.ordersCancelled += report.ordersCancelled;
        summary.orphanDraftsCancelled += report.orphanDraftsCancelled;
        if (report.circuitBroken) summary.circuitBroken += 1;
        summary.perStore.push(report);
      }

      if (
        summary.expiredReleased > 0 ||
        summary.reconciledConsumed > 0 ||
        summary.ordersCancelled > 0 ||
        summary.orphanDraftsCancelled > 0 ||
        summary.skippedLocked > 0 ||
        summary.circuitBroken > 0
      ) {
        logger.info("reservation expiry cycle completed", {
          mode,
          stores: summary.stores,
          expiredReleased: summary.expiredReleased,
          reconciledConsumed: summary.reconciledConsumed,
          ordersCancelled: summary.ordersCancelled,
          orphanDraftsCancelled: summary.orphanDraftsCancelled,
          skippedLocked: summary.skippedLocked,
          circuitBroken: summary.circuitBroken,
        });
      }
      return summary;
    },
  };
}

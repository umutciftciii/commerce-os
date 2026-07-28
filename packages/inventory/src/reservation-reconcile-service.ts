/**
 * H-3 pre-ship (ADR-194) — PAID/AUTHORIZED + ACTIVE rezervasyon RECONCILE servisi (DI-testable).
 *
 * Ürün kararı: PAID/AUTHORIZED siparişe bağlı ACTIVE rezervasyon CONSUMED olmalıdır (consume yolu
 * kaçırılmış legacy kayıtlar). Bu servis expiry'den AYRIDIR: expiry süresi dolmuş adayları işler;
 * reconcile ise (expiresAt'tan BAĞIMSIZ) PAID+ACTIVE'i güvenli commit eder. VARSAYILAN DRY-RUN.
 *
 * Güvenlik: order gerçekten PAID/AUTHORIZED; reservation.qty == orderLine.qty; inventory item var;
 * sayaçlar yeterli → CONSUMED + SALE_COMMIT (yalnız ACTIVE→CONSUMED geçişinde, duplicate movement yok).
 * Belirsiz (qty mismatch / eksik line / eksik item / sayaç yetersiz) → MUTATE ETME → MANUAL_REVIEW.
 */
import type { Logger } from "@commerce-os/logger";
import type { StoreJobLocker } from "@commerce-os/db";
import {
  startJobRun,
  finishJobRun,
  recordSkippedLockedRun,
  type JobLogClient,
  type JobTrigger,
  type TerminalJobOutcome,
} from "./reservation-job-log.js";

export const INVENTORY_RESERVATION_RECONCILE_JOB = "inventory-reservation-reconcile";

export interface ReconcileBatchResult {
  processed: number;
  reconciled: number;
  manualReview: number;
  skipped: number;
}

export interface ReservationReconcilePersistence {
  listStores(storeId: string | undefined): Promise<string[]>;
  /** PAID/AUTHORIZED sipariş + ACTIVE rezervasyon adayı sayısı (dry-run + döngü sınırı). */
  countReconcileCandidates(storeId: string): Promise<number>;
  /** APPLY: tek bounded batch (FOR UPDATE SKIP LOCKED). Boş → processed=0. */
  processReconcileBatch(storeId: string, now: Date, batchSize: number): Promise<ReconcileBatchResult>;
}

export interface StoreReconcileReport {
  storeId: string;
  mode: "dry-run" | "apply";
  outcome: TerminalJobOutcome;
  candidates: number;
  reconciled: number;
  manualReview: number;
}

export interface ReservationReconcileSummary {
  stores: number;
  mode: "dry-run" | "apply";
  candidates: number;
  reconciled: number;
  manualReview: number;
  skippedLocked: number;
  perStore: StoreReconcileReport[];
}

export interface ReservationReconcileServiceDeps {
  persistence: ReservationReconcilePersistence;
  jobLog: JobLogClient;
  logger: Logger;
  lock: StoreJobLocker;
  batchSize: number;
  /** Circuit breaker: aday > bu değer → APPLY reddedilir (dry-run raporlar). */
  maxReconcilePerRun: number;
  clock?: () => Date;
}

export interface ReservationReconcileRunOptions {
  now?: Date;
  storeId?: string;
  /** false → dry-run (yazma YOK). Manuel tetik varsayılan dry-run (apply explicit). */
  apply?: boolean;
}

export interface ReservationReconcileService {
  runOnce(options?: ReservationReconcileRunOptions): Promise<ReservationReconcileSummary>;
}

function maxBatches(candidates: number, batchSize: number): number {
  return Math.ceil(Math.max(candidates, 1) / batchSize) + 1;
}

export function createReservationReconcileService(
  deps: ReservationReconcileServiceDeps,
): ReservationReconcileService {
  const { persistence, jobLog, logger, lock, batchSize, maxReconcilePerRun } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<ReservationReconcileSummary> {
      const now = options?.now ?? new Date();
      const scopedStoreId = options?.storeId;
      const trigger: JobTrigger = scopedStoreId != null ? "MANUAL" : "SCHEDULED";
      const apply = options?.apply === true; // reconcile VARSAYILAN dry-run (yıkıcı → explicit apply)
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";

      const stores = await persistence.listStores(scopedStoreId);
      const summary: ReservationReconcileSummary = {
        stores: 0,
        mode,
        candidates: 0,
        reconciled: 0,
        manualReview: 0,
        skippedLocked: 0,
        perStore: [],
      };

      for (const storeId of stores) {
        const lockResult = await lock(INVENTORY_RESERVATION_RECONCILE_JOB, storeId, async () => {
          const startedAt = clock();
          const jobRunId = await startJobRun(jobLog, { storeId, trigger, startedAt, jobName: INVENTORY_RESERVATION_RECONCILE_JOB });
          const report: StoreReconcileReport = {
            storeId,
            mode,
            outcome: mode === "dry-run" ? "DRY_RUN" : "COMPLETED",
            candidates: 0,
            reconciled: 0,
            manualReview: 0,
          };
          let errored = false;
          try {
            report.candidates = await persistence.countReconcileCandidates(storeId);
            if (!apply) {
              report.outcome = "DRY_RUN";
            } else if (report.candidates > maxReconcilePerRun) {
              report.outcome = "CIRCUIT_BROKEN";
              logger.warn("reservation reconcile circuit breaker tripped — apply skipped", {
                storeId,
                candidates: report.candidates,
                maxReconcilePerRun,
              });
            } else {
              const limit = maxBatches(report.candidates, batchSize);
              for (let i = 0; i < limit; i += 1) {
                const b = await persistence.processReconcileBatch(storeId, now, batchSize);
                report.reconciled += b.reconciled;
                report.manualReview += b.manualReview;
                if (b.processed < batchSize) break;
              }
              report.outcome = report.manualReview > 0 ? "PARTIAL_SUCCESS" : "COMPLETED";
            }
          } catch (error) {
            errored = true;
            report.outcome = "FAILED";
            logger.error("reservation reconcile store cycle failed", { storeId, error: error as Error });
          }
          await finishJobRun(jobLog, jobRunId, {
            outcome: report.outcome,
            trigger,
            startedAt,
            completedAt: clock(),
            jobName: INVENTORY_RESERVATION_RECONCILE_JOB,
            report: {
              mode,
              candidates: report.candidates,
              reconciled: report.reconciled,
              manualReview: report.manualReview,
            },
            error: errored ? { failed: true } : undefined,
          });
          return report;
        });

        if (!lockResult.acquired) {
          const at = clock();
          await recordSkippedLockedRun(jobLog, { storeId, trigger, startedAt: at, completedAt: at, jobName: INVENTORY_RESERVATION_RECONCILE_JOB });
          summary.skippedLocked += 1;
          summary.stores += 1;
          summary.perStore.push({
            storeId, mode, outcome: "SKIPPED_LOCKED", candidates: 0, reconciled: 0, manualReview: 0,
          });
          logger.warn("reservation reconcile store skipped (locked)", { storeId });
          continue;
        }

        const report = lockResult.result;
        summary.stores += 1;
        summary.candidates += report.candidates;
        summary.reconciled += report.reconciled;
        summary.manualReview += report.manualReview;
        summary.perStore.push(report);
      }

      if (summary.reconciled > 0 || summary.manualReview > 0 || summary.skippedLocked > 0) {
        logger.info("reservation reconcile cycle completed", {
          mode,
          stores: summary.stores,
          reconciled: summary.reconciled,
          manualReview: summary.manualReview,
          skippedLocked: summary.skippedLocked,
        });
      }
      return summary;
    },
  };
}

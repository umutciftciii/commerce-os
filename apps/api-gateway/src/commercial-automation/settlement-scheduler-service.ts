/**
 * TODO-161A.1 (ADR-130/131/136) — Otomatik settlement zamanlayıcı SERVİSİ (DB orkestrasyon; DI-testable).
 *
 * Akış (tur başına, STORE BAŞINA):
 *  1. Kapsamdaki store'lar çözülür (sweep: tümü; manuel: tek store). Her store için timezone bulunur.
 *  2. Her store için (jobType, storeId) DAĞITIK advisory lock alınır (ADR-136). Alınamazsa SKIPPED_LOCKED
 *     (manuel + scheduled aynı anahtar → çakışma engellenir; farklı store/job paralel).
 *  3. Uygun anlaşmalar (ACTIVE/COMPLETED + WEEKLY/MONTHLY/CAMPAIGN_END) bounded listelenir.
 *  4. Her anlaşma için kapanmış dönem çözülür (SAF core). Uygun değilse ATLANIR.
 *  5. O dönem için settlement zaten varsa (DRAFT/FINALIZED) ATLANIR → duplicate YOK, FINALIZED dokunulmaz.
 *  6. Yoksa `previewSettlement` ile DRAFT üretilir (fiyat matematiği SAF billing-core; otomatik finalize YOK).
 *  7. Anlaşma-başına hata İZOLE edilir. Store başına TEK QueueJobLog satırı (STARTED→terminal update).
 */
import type { Logger } from "@commerce-os/logger";
import {
  resolvePeriodForAgreement,
  type PeriodSkipReason,
  type SchedulableAgreement,
} from "./settlement-schedule-core.js";
import {
  startJobRun,
  finishJobRun,
  recordSkippedLockedRun,
  SETTLEMENT_SCHEDULER_JOB,
  type JobLogClient,
  type TerminalJobOutcome,
} from "./job-log.js";
import type { StoreJobLocker } from "./advisory-lock.js";

export type CreateDraftOutcome =
  | { ok: true; settlementId: string }
  | { ok: false; code: string };

/** DB erişim portu (fake ile birim-test edilebilir). Tüm sorgular bounded / store-scoped. */
export interface SettlementSchedulerPersistence {
  /** Kapsamdaki store'lar + timezone. `storeId` verilirse yalnız o store (yoksa tümü). */
  listStoreTimezones(storeId: string | undefined): Promise<Array<{ storeId: string; timeZone: string }>>;
  /** Uygun anlaşmalar (ACTIVE/COMPLETED + WEEKLY/MONTHLY/CAMPAIGN_END), bounded. */
  listSchedulableAgreements(storeId: string, limit: number): Promise<SchedulableAgreement[]>;
  /** Bu dönem için var olan settlement (idempotency/duplicate-guard). */
  findSettlementForPeriod(
    agreementId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ id: string; status: "DRAFT" | "FINALIZED" } | null>;
  /** DRAFT settlement üretir (previewSettlement reuse). */
  createDraftSettlement(
    storeId: string,
    agreementId: string,
    input: { periodStart: Date; periodEnd: Date; periodKind: "WEEKLY" | "MONTHLY" | "CAMPAIGN_END" },
    now: Date,
  ): Promise<CreateDraftOutcome>;
}

export interface StoreSettlementReport {
  storeId: string;
  timeZone: string;
  mode: "dry-run" | "apply";
  outcome: TerminalJobOutcome;
  scannedAgreements: number;
  createdDrafts: number;
  candidateDrafts: number;
  skipped: number;
  skippedByReason: Record<string, number>;
  erroredAgreements: number;
  errors: Array<{ agreementId: string; code: string }>;
  createdSettlementIds: string[];
}

export interface SettlementSchedulerSummary {
  stores: number;
  mode: "dry-run" | "apply";
  scannedAgreements: number;
  createdDrafts: number;
  candidateDrafts: number;
  erroredAgreements: number;
  /** Advisory lock alınamadığı için işlenmeyen store sayısı. */
  skippedLocked: number;
  perStore: StoreSettlementReport[];
}

export interface SettlementSchedulerServiceDeps {
  persistence: SettlementSchedulerPersistence;
  jobLog: JobLogClient;
  logger: Logger;
  /** Dağıtık (jobType, storeId) overlap kilidi (PostgreSQL advisory lock). */
  lock: StoreJobLocker;
  /** Store timezone çözülemezse fallback (config.COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE). */
  defaultTimeZone: string;
  /** Tur başına store başına en fazla anlaşma (bounded). */
  batchSize: number;
  /** Test enjeksiyonu: tur zaman kaynağı (log timing). */
  clock?: () => Date;
}

export interface SettlementSchedulerRunOptions {
  now?: Date;
  /** Verilirse yalnız bu store işlenir (manuel tetik); yoksa tüm store'lar (zamanlanmış sweep). */
  storeId?: string;
  /** false → dry-run (DRAFT ÜRETİLMEZ, yalnız aday raporlanır). Zamanlanmış tur varsayılan true. */
  apply?: boolean;
}

export interface SettlementSchedulerService {
  runOnce(options?: SettlementSchedulerRunOptions): Promise<SettlementSchedulerSummary>;
}

function emptyReport(storeId: string, timeZone: string, mode: "dry-run" | "apply"): StoreSettlementReport {
  return {
    storeId,
    timeZone,
    mode,
    outcome: mode === "dry-run" ? "DRY_RUN" : "COMPLETED",
    scannedAgreements: 0,
    createdDrafts: 0,
    candidateDrafts: 0,
    skipped: 0,
    skippedByReason: {},
    erroredAgreements: 0,
    errors: [],
    createdSettlementIds: [],
  };
}

function bumpSkip(report: StoreSettlementReport, reason: PeriodSkipReason | string): void {
  report.skipped += 1;
  report.skippedByReason[reason] = (report.skippedByReason[reason] ?? 0) + 1;
}

function resolveOutcome(report: StoreSettlementReport, mode: "dry-run" | "apply"): TerminalJobOutcome {
  if (mode === "dry-run") return "DRY_RUN";
  if (report.erroredAgreements > 0) return report.createdDrafts > 0 ? "PARTIAL_SUCCESS" : "FAILED";
  return "COMPLETED";
}

export function createSettlementSchedulerService(
  deps: SettlementSchedulerServiceDeps,
): SettlementSchedulerService {
  const { persistence, jobLog, logger, lock, defaultTimeZone, batchSize } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<SettlementSchedulerSummary> {
      const now = options?.now ?? new Date();
      const scopedStoreId = options?.storeId;
      const trigger = scopedStoreId != null ? "MANUAL" : "SCHEDULED";
      const apply = options?.apply !== false; // zamanlanmış tur varsayılan APPLY; manuel dry-run false geçer
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";

      const stores = await persistence.listStoreTimezones(scopedStoreId);
      const summary: SettlementSchedulerSummary = {
        stores: 0,
        mode,
        scannedAgreements: 0,
        createdDrafts: 0,
        candidateDrafts: 0,
        erroredAgreements: 0,
        skippedLocked: 0,
        perStore: [],
      };

      for (const store of stores) {
        const timeZone = store.timeZone || defaultTimeZone;

        const lockResult = await lock(SETTLEMENT_SCHEDULER_JOB, store.storeId, async () => {
          const startedAt = clock();
          const jobRunId = await startJobRun(jobLog, {
            storeId: store.storeId,
            jobName: SETTLEMENT_SCHEDULER_JOB,
            trigger,
            startedAt,
          });
          const report = emptyReport(store.storeId, timeZone, mode);

          const agreements = await persistence.listSchedulableAgreements(store.storeId, batchSize);
          report.scannedAgreements = agreements.length;

          for (const agreement of agreements) {
            try {
              const resolution = resolvePeriodForAgreement(agreement, now, timeZone);
              if (!resolution.ok) {
                bumpSkip(report, resolution.reason);
                continue;
              }
              const { period, kind } = resolution;

              const existing = await persistence.findSettlementForPeriod(
                agreement.id,
                period.periodStart,
                period.periodEnd,
              );
              if (existing) {
                bumpSkip(report, existing.status === "FINALIZED" ? "EXISTING_FINALIZED" : "EXISTING_DRAFT");
                continue;
              }

              if (!apply) {
                report.candidateDrafts += 1; // DRY-RUN: aday sayılır, yazma YOK
                continue;
              }

              const outcome = await persistence.createDraftSettlement(
                store.storeId,
                agreement.id,
                {
                  periodStart: period.periodStart,
                  periodEnd: period.periodEnd,
                  periodKind: kind as "WEEKLY" | "MONTHLY" | "CAMPAIGN_END",
                },
                now,
              );
              if (outcome.ok) {
                report.createdDrafts += 1;
                report.createdSettlementIds.push(outcome.settlementId);
              } else if (outcome.code === "PERIOD_ALREADY_FINALIZED") {
                bumpSkip(report, "EXISTING_FINALIZED"); // yarış → atlanır, hata değil
              } else {
                report.erroredAgreements += 1;
                report.errors.push({ agreementId: agreement.id, code: outcome.code });
              }
            } catch (error) {
              // Anlaşma-başına hata izolasyonu: biri patlar, diğerleri devam.
              report.erroredAgreements += 1;
              report.errors.push({ agreementId: agreement.id, code: error instanceof Error ? error.name : "UNKNOWN" });
              logger.error("settlement scheduler agreement failed", {
                storeId: store.storeId,
                agreementId: agreement.id,
                error: error as Error,
              });
            }
          }

          report.outcome = resolveOutcome(report, mode);
          await finishJobRun(jobLog, jobRunId, {
            outcome: report.outcome,
            trigger,
            startedAt,
            completedAt: clock(),
            report: {
              mode,
              timeZone: report.timeZone,
              period: { kind: "per-agreement" },
              scannedAgreements: report.scannedAgreements,
              createdDrafts: report.createdDrafts,
              candidateDrafts: report.candidateDrafts,
              skipped: report.skipped,
              skippedByReason: report.skippedByReason,
              erroredAgreements: report.erroredAgreements,
              errors: report.errors,
              createdSettlementIds: report.createdSettlementIds,
            },
            error: report.erroredAgreements > 0 ? { erroredAgreements: report.erroredAgreements, errors: report.errors } : undefined,
          });
          return report;
        });

        if (!lockResult.acquired) {
          // Dağıtık kilit başka bir instance/tetiktede → kontrollü SKIPPED_LOCKED.
          const at = clock();
          await recordSkippedLockedRun(jobLog, {
            storeId: store.storeId,
            jobName: SETTLEMENT_SCHEDULER_JOB,
            trigger,
            startedAt: at,
            completedAt: at,
          });
          summary.skippedLocked += 1;
          summary.stores += 1;
          summary.perStore.push({ ...emptyReport(store.storeId, timeZone, mode), outcome: "SKIPPED_LOCKED" });
          logger.warn("settlement scheduler store skipped (locked)", { storeId: store.storeId });
          continue;
        }

        const report = lockResult.result;
        summary.stores += 1;
        summary.scannedAgreements += report.scannedAgreements;
        summary.createdDrafts += report.createdDrafts;
        summary.candidateDrafts += report.candidateDrafts;
        summary.erroredAgreements += report.erroredAgreements;
        summary.perStore.push(report);
      }

      if (summary.createdDrafts > 0 || summary.candidateDrafts > 0 || summary.erroredAgreements > 0 || summary.skippedLocked > 0) {
        logger.info("settlement scheduler cycle completed", {
          mode,
          stores: summary.stores,
          createdDrafts: summary.createdDrafts,
          candidateDrafts: summary.candidateDrafts,
          erroredAgreements: summary.erroredAgreements,
          skippedLocked: summary.skippedLocked,
        });
      }
      return summary;
    },
  };
}

/**
 * TODO-161A.1 (ADR-133/134/135/136) — Attribution ham event retention SERVİSİ (DB orkestrasyon; DI-testable).
 *
 * Akış (tur başına, STORE BAŞINA, tablo başına):
 *  1. Her store için (jobType, storeId) DAĞITIK advisory lock (ADR-136). Alınamazsa SKIPPED_LOCKED
 *     (aynı store'da paralel apply çakışmaz → candidate/deleted çift yazılmaz).
 *  2. cutoff = now - retentionDays (retentionDays SUNUCU config'i; istemci gönderemez).
 *  3. Aday satır sayılır (storeId + createdAt < cutoff; index-backed).
 *  4. DRY-RUN (varsayılan): yalnız sayım, HİÇBİR yazma yok.
 *  5. APPLY (explicit): circuit-breaker aşılmadıysa batch-DELETE (take → deleteMany(id in); bounded).
 *  6. Store başına TEK QueueJobLog satırı (STARTED→terminal). Global unscoped deleteMany({}) ASLA.
 */
import type { Logger } from "@commerce-os/logger";
import {
  computeCutoff,
  isCircuitBreakerTripped,
  RETENTION_TABLE_SPECS,
  type RetentionDomain,
  type RetentionTable,
} from "./retention-core.js";
import {
  startJobRun,
  finishJobRun,
  recordSkippedLockedRun,
  ATTRIBUTION_RETENTION_JOB,
  type JobLogClient,
  type TerminalJobOutcome,
} from "./job-log.js";
import type { StoreJobLocker } from "./advisory-lock.js";
import type { WorkerCapabilityGate } from "../capabilities/worker-gate.js";

// TODO-163 Faz 3 (TD-153) — retention domain'i → gateway modül anahtarı (per-tablo capability gate).
const DOMAIN_MODULE: Record<RetentionDomain, string> = {
  sponsored: "SPONSORED_PRODUCTS",
  influencer: "INFLUENCER_TRACKING",
};

/** DB erişim portu (fake ile birim-test edilebilir). Tüm sorgular store + cutoff scope'lu. */
export interface RetentionPersistence {
  /** İşlenecek store'lar. `storeId` verilirse [storeId]; yoksa event'i olan DISTINCT store'lar. */
  listStoreScope(storeId: string | undefined): Promise<string[]>;
  /** storeId + createdAt < cutoff aday satır sayısı (silmeden). */
  countExpired(table: RetentionTable, storeId: string, cutoff: Date): Promise<number>;
  /** Tek batch DELETE (bounded: en fazla `batchSize`). Silinen satır sayısını döndürür. */
  deleteExpiredBatch(
    table: RetentionTable,
    storeId: string,
    cutoff: Date,
    batchSize: number,
  ): Promise<number>;
}

export interface TableRetentionResult {
  table: RetentionTable;
  domain: RetentionDomain;
  retentionDays: number;
  cutoff: string;
  candidates: number;
  deleted: number;
  circuitBreakerTripped: boolean;
  // TODO-163 Faz 3 (TD-153) — bu domain modülü store için KAPALI → tablo atlandı (sayım/silme yok).
  skippedDisabled: boolean;
}

export interface StoreRetentionReport {
  storeId: string;
  mode: "dry-run" | "apply";
  outcome: TerminalJobOutcome;
  tables: TableRetentionResult[];
  totalCandidates: number;
  totalDeleted: number;
  anyCircuitBreakerTripped: boolean;
}

export interface RetentionSummary {
  stores: number;
  totalCandidates: number;
  totalDeleted: number;
  mode: "dry-run" | "apply";
  /** Advisory lock alınamadığı için işlenmeyen store sayısı. */
  skippedLocked: number;
  /** TODO-163 Faz 3 (TD-153) — modülü kapalı olduğundan atlanan (store,tablo) sayısı. */
  skippedDisabledTables: number;
  perStore: StoreRetentionReport[];
}

export interface RetentionServiceConfig {
  /** Tablo başına retention gün sayısı (SUNUCU config otoritesi). */
  retentionDaysByTable: Record<RetentionTable, number>;
  /** Tek DELETE statement'ının en fazla sildiği satır (bounded). */
  batchSize: number;
  /** Circuit breaker eşiği: bir tablo bu kadar adayı aşarsa APPLY reddedilir. */
  maxDeletePerRun: number;
}

export interface RetentionServiceDeps {
  persistence: RetentionPersistence;
  jobLog: JobLogClient;
  logger: Logger;
  /** Dağıtık (jobType, storeId) overlap kilidi (PostgreSQL advisory lock). */
  lock: StoreJobLocker;
  config: RetentionServiceConfig;
  /** Test enjeksiyonu: log timing kaynağı. */
  clock?: () => Date;
  // TODO-163 Faz 3 (TD-153) — verildiyse: domain modülü kapalı store'da o tablo ATLANIR (per-tablo).
  capabilityGate?: WorkerCapabilityGate;
}

export interface RetentionRunOptions {
  now?: Date;
  /** Verilirse yalnız bu store (manuel); yoksa tüm store'lar (sweep). */
  storeId?: string;
  /** true → gerçek DELETE; false/omit → dry-run (yalnız sayım). */
  apply?: boolean;
}

export interface RetentionService {
  runOnce(options?: RetentionRunOptions): Promise<RetentionSummary>;
}

export function createRetentionService(deps: RetentionServiceDeps): RetentionService {
  const { persistence, jobLog, logger, lock, config } = deps;
  const { retentionDaysByTable, batchSize, maxDeletePerRun } = config;
  const clock = deps.clock ?? (() => new Date());

  return {
    async runOnce(options): Promise<RetentionSummary> {
      const now = options?.now ?? new Date();
      const apply = options?.apply === true;
      const mode: "dry-run" | "apply" = apply ? "apply" : "dry-run";
      const trigger = options?.storeId != null ? "MANUAL" : "SCHEDULED";

      const storeIds = await persistence.listStoreScope(options?.storeId);
      const summary: RetentionSummary = {
        stores: 0,
        totalCandidates: 0,
        totalDeleted: 0,
        mode,
        skippedLocked: 0,
        skippedDisabledTables: 0,
        perStore: [],
      };

      for (const storeId of storeIds) {
        const lockResult = await lock(ATTRIBUTION_RETENTION_JOB, storeId, async () => {
          const startedAt = clock();
          const jobRunId = await startJobRun(jobLog, {
            storeId,
            jobName: ATTRIBUTION_RETENTION_JOB,
            trigger,
            startedAt,
          });

          const report: StoreRetentionReport = {
            storeId,
            mode,
            outcome: mode === "dry-run" ? "DRY_RUN" : "COMPLETED",
            tables: [],
            totalCandidates: 0,
            totalDeleted: 0,
            anyCircuitBreakerTripped: false,
          };

          for (const spec of RETENTION_TABLE_SPECS) {
            const retentionDays = retentionDaysByTable[spec.table];
            // TODO-163 Faz 3 (TD-153) — bu domain modülü store için KAPALI → tablo ATLANIR (sayım/silme
            // YOK). Diğer tablo (domain) etkilenmez; per-tablo audit report.tables[].skippedDisabled.
            if (deps.capabilityGate && !(await deps.capabilityGate.isEnabled(storeId, DOMAIN_MODULE[spec.domain]))) {
              report.tables.push({
                table: spec.table,
                domain: spec.domain,
                retentionDays,
                cutoff: "",
                candidates: 0,
                deleted: 0,
                circuitBreakerTripped: false,
                skippedDisabled: true,
              });
              continue;
            }
            const cutoff = computeCutoff(now, retentionDays);
            const candidates = await persistence.countExpired(spec.table, storeId, cutoff);

            let deleted = 0;
            let tripped = false;
            if (apply && candidates > 0) {
              if (isCircuitBreakerTripped(candidates, maxDeletePerRun)) {
                tripped = true;
                logger.warn("retention circuit breaker tripped — apply skipped for table", {
                  storeId,
                  table: spec.table,
                  candidates,
                  maxDeletePerRun,
                });
              } else {
                // Bounded batch döngüsü: her statement en fazla batchSize; batch boşalınca durur.
                const maxBatches = Math.ceil(candidates / batchSize) + 1;
                for (let i = 0; i < maxBatches; i += 1) {
                  const removed = await persistence.deleteExpiredBatch(spec.table, storeId, cutoff, batchSize);
                  deleted += removed;
                  if (removed < batchSize) break;
                }
              }
            }

            report.tables.push({
              table: spec.table,
              domain: spec.domain,
              retentionDays,
              cutoff: cutoff.toISOString(),
              candidates,
              deleted,
              circuitBreakerTripped: tripped,
              skippedDisabled: false,
            });
            report.totalCandidates += candidates;
            report.totalDeleted += deleted;
            if (tripped) report.anyCircuitBreakerTripped = true;
          }

          report.outcome = mode === "dry-run" ? "DRY_RUN" : report.anyCircuitBreakerTripped ? "PARTIAL_SUCCESS" : "COMPLETED";
          await finishJobRun(jobLog, jobRunId, {
            outcome: report.outcome,
            trigger,
            startedAt,
            completedAt: clock(),
            report: {
              mode,
              totalCandidates: report.totalCandidates,
              totalDeleted: report.totalDeleted,
              anyCircuitBreakerTripped: report.anyCircuitBreakerTripped,
              tables: report.tables,
            },
            error: report.anyCircuitBreakerTripped
              ? { circuitBreaker: "tripped", maxDeletePerRun }
              : undefined,
          });
          return report;
        });

        if (!lockResult.acquired) {
          const at = clock();
          await recordSkippedLockedRun(jobLog, {
            storeId,
            jobName: ATTRIBUTION_RETENTION_JOB,
            trigger,
            startedAt: at,
            completedAt: at,
          });
          summary.skippedLocked += 1;
          summary.stores += 1;
          summary.perStore.push({
            storeId,
            mode,
            outcome: "SKIPPED_LOCKED",
            tables: [],
            totalCandidates: 0,
            totalDeleted: 0,
            anyCircuitBreakerTripped: false,
          });
          logger.warn("attribution retention store skipped (locked)", { storeId });
          continue;
        }

        const report = lockResult.result;
        summary.stores += 1;
        summary.totalCandidates += report.totalCandidates;
        summary.totalDeleted += report.totalDeleted;
        summary.skippedDisabledTables += report.tables.filter((t) => t.skippedDisabled).length;
        summary.perStore.push(report);
      }

      if (summary.totalDeleted > 0 || summary.totalCandidates > 0 || summary.skippedLocked > 0) {
        logger.info("attribution retention cycle completed", {
          mode,
          stores: summary.stores,
          totalCandidates: summary.totalCandidates,
          totalDeleted: summary.totalDeleted,
          skippedLocked: summary.skippedLocked,
        });
      }
      return summary;
    },
  };
}

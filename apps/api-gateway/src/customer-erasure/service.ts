/**
 * TD-131 (ADR-149…155) — Customer Data Erasure servis katmanı (ince orkestrasyon).
 *
 * Sorumluluk: onay ifadesi + neden doğrulama → advisory lock (eşzamanlı erase reddi)
 * → veri katmanı (transaction + kilit-altı ikinci okuma) → PII-SIZ audit. İş mantığı
 * (silinecek/anonimleşecek) veri katmanındadır; kilit ADR-150 (TODO-161A.1 SAF
 * altyapısı reuse), audit ADR-154 (PII metadata'ya YAZILMAZ).
 */
import {
  CUSTOMER_ERASURE_CONFIRMATION_PHRASE,
  isValidErasureConfirmation,
  totalDeleted,
} from "./core.js";
import type {
  ApplyErasureResult,
  CustomerErasureData,
  CustomerErasurePreviewData,
} from "./data.js";
import type { StoreJobLocker } from "../commercial-automation/advisory-lock.js";

type AuditFn = (input: {
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "SYSTEM";
  platformUserId?: string;
  storeId?: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown>;

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface CustomerErasureServiceDeps {
  data: CustomerErasureData;
  locker: StoreJobLocker;
  recordAudit: AuditFn;
  logger: Logger;
}

/** Kilit anahtarı: müşteri başına izole (aynı mağazada farklı müşteriler paralel silinebilir). */
export const CUSTOMER_ERASURE_JOB = "customer-erasure";

export type PreviewResult =
  | { kind: "OK"; report: CustomerErasurePreviewData & { confirmationPhrase: string } }
  | { kind: "NOT_FOUND" };

export type ApplyResult =
  | { kind: "CONFIRMATION_REQUIRED" }
  | { kind: "REASON_REQUIRED" }
  | { kind: "IN_PROGRESS" }
  | { kind: "NOT_FOUND" }
  | { kind: "ALREADY_ERASED"; erasedAt: Date | null; erasedByUserId: string | null; eraseReason: string | null }
  | { kind: "ERASED"; result: Extract<ApplyErasureResult, { kind: "ERASED" }> };

export type DeactivateServiceResult =
  | { kind: "NOT_FOUND" }
  | { kind: "ALREADY_ERASED" }
  | { kind: "DEACTIVATED"; revokedCount: number };

export interface CustomerErasureService {
  preview(storeId: string, customerId: string, actorUserId: string): Promise<PreviewResult>;
  apply(
    storeId: string,
    customerId: string,
    input: { actorUserId: string; reason: string; confirmationPhrase: string },
  ): Promise<ApplyResult>;
  deactivate(storeId: string, customerId: string, actorUserId: string): Promise<DeactivateServiceResult>;
}

export function createCustomerErasureService(deps: CustomerErasureServiceDeps): CustomerErasureService {
  const { data, locker, recordAudit, logger } = deps;

  return {
    async preview(storeId, customerId, actorUserId) {
      const report = await data.preview(storeId, customerId);
      if (!report) return { kind: "NOT_FOUND" };
      // Dry-run da operasyon kaydına düşer (ADR-154). PII yok — yalnız mod + toplamlar.
      await recordAudit({
        action: "SYSTEM",
        platformUserId: actorUserId,
        storeId,
        entityType: "Customer",
        entityId: customerId,
        metadata: {
          operation: "erasure",
          mode: "dry-run",
          alreadyErased: report.status === "ERASED",
          deleteTotal: totalDeleted(report.deleteCounts),
          preserveOrders: report.preserveCounts.orders,
          reviewsAnonymized: report.reviewAnonymizeCount,
        },
      });
      return {
        kind: "OK",
        report: { ...report, confirmationPhrase: CUSTOMER_ERASURE_CONFIRMATION_PHRASE },
      };
    },

    async apply(storeId, customerId, input) {
      if (!isValidErasureConfirmation(input.confirmationPhrase)) {
        return { kind: "CONFIRMATION_REQUIRED" };
      }
      const reason = input.reason?.trim() ?? "";
      if (reason.length === 0) return { kind: "REASON_REQUIRED" };

      const outcome = await locker(`${CUSTOMER_ERASURE_JOB}:${storeId}`, customerId, () =>
        data.applyErasure(storeId, customerId, {
          actorUserId: input.actorUserId,
          reason,
          now: new Date(),
        }),
      );

      if (!outcome.acquired) {
        logger.warn("customer erasure already in progress", { customerId });
        return { kind: "IN_PROGRESS" };
      }

      const result = outcome.result;
      if (result.kind === "NOT_FOUND") return { kind: "NOT_FOUND" };
      if (result.kind === "ALREADY_ERASED") {
        return {
          kind: "ALREADY_ERASED",
          erasedAt: result.state.erasedAt,
          erasedByUserId: result.state.erasedByUserId,
          eraseReason: result.state.eraseReason,
        };
      }

      // Apply — kalıcı operasyon kaydı (ADR-154). Ham PII (email/telefon/TCKN/IBAN)
      // ASLA metadata'ya yazılmaz; yalnız sayaçlar + anonimleştirilen ALAN ADLARI.
      await recordAudit({
        action: "DELETE",
        platformUserId: input.actorUserId,
        storeId,
        entityType: "Customer",
        entityId: customerId,
        metadata: {
          operation: "erasure",
          mode: "apply",
          reason,
          deleted: result.deleted,
          deleteTotal: totalDeleted(result.deleted),
          anonymized: result.anonymized,
          reviewsAnonymized: result.reviewAnonymizeCount,
        },
      });
      logger.info("customer personal data erased", {
        customerId,
        deleteTotal: totalDeleted(result.deleted),
      });
      return { kind: "ERASED", result };
    },

    async deactivate(storeId, customerId, actorUserId) {
      const result = await data.deactivate(storeId, customerId);
      if (result.kind === "NOT_FOUND") return { kind: "NOT_FOUND" };
      if (result.kind === "ALREADY_ERASED") return { kind: "ALREADY_ERASED" };
      await recordAudit({
        action: "UPDATE",
        platformUserId: actorUserId,
        storeId,
        entityType: "Customer",
        entityId: customerId,
        metadata: { operation: "deactivate", status: "PASSIVE", revokedSessions: result.revokedCount },
      });
      logger.info("customer deactivated", { customerId, revokedCount: result.revokedCount });
      return { kind: "DEACTIVATED", revokedCount: result.revokedCount };
    },
  };
}

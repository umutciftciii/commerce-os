/**
 * TODO-161A.1 — Settlement scheduler için Prisma persistence (gerçek çalıştırma). DRAFT üretimi
 * `SponsorshipData.previewSettlement` reuse eder → fiyat matematiği (SAF billing-core) bölünmez,
 * DRAFT-only + FINALIZED-immutable + unique-dönem garantileri tek yerde kalır.
 */
import type { PrismaClient } from "@prisma/client";
import type { SponsorshipData } from "../sponsorship/data.js";
import type { SchedulableAgreement } from "./settlement-schedule-core.js";
import type {
  CreateDraftOutcome,
  SettlementSchedulerPersistence,
} from "./settlement-scheduler-service.js";

/** previewSettlement kadarı yeter (dar yüzey → test/mock kolay). */
export type SettlementPreviewer = Pick<SponsorshipData, "previewSettlement">;

export function createPrismaSettlementSchedulerPersistence(
  db: PrismaClient,
  sponsorship: SettlementPreviewer,
  defaultTimeZone: string,
): SettlementSchedulerPersistence {
  return {
    async listStoreTimezones(storeId) {
      const rows = await db.store.findMany({
        where: storeId ? { id: storeId } : {},
        select: { id: true, settings: { select: { timezone: true } } },
      });
      return rows.map((r) => ({ storeId: r.id, timeZone: r.settings?.timezone ?? defaultTimeZone }));
    },

    async listSchedulableAgreements(storeId, limit): Promise<SchedulableAgreement[]> {
      const rows = await db.sponsorshipAgreement.findMany({
        where: {
          storeId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          settlementPeriod: { in: ["WEEKLY", "MONTHLY", "CAMPAIGN_END"] },
        },
        select: { id: true, storeId: true, status: true, settlementPeriod: true, startsAt: true, endsAt: true },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id,
        storeId: r.storeId,
        status: r.status,
        settlementPeriod: r.settlementPeriod,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      }));
    },

    async findSettlementForPeriod(agreementId, periodStart, periodEnd) {
      const row = await db.sponsorshipSettlement.findFirst({
        where: { agreementId, periodStart, periodEnd },
        select: { id: true, status: true },
      });
      return row ? { id: row.id, status: row.status } : null;
    },

    async createDraftSettlement(storeId, agreementId, input, now): Promise<CreateDraftOutcome> {
      const result = await sponsorship.previewSettlement(storeId, agreementId, input, now);
      if (typeof result === "string") {
        return { ok: false, code: result };
      }
      return { ok: true, settlementId: result.id };
    },
  };
}

/**
 * TODO-161A.1 (ADR-130/131/132) — Otomatik settlement zamanlama ÇEKİRDEĞİ (SAF; prisma/fastify yok).
 *
 * Sorumluluk: bir anlaşmanın schedule tercihine (`settlementPeriod`) ve store timezone'una göre HANGİ
 * kapanmış dönem için DRAFT settlement üretileceğine karar vermek. Gerçek yazma/metrik toplama DB
 * katmanındadır (`data.previewSettlement` reuse). Bu dosya yalnız dönem sınırı + uygunluk kararıdır →
 * tam birim-test edilebilir (billing-core deseni).
 *
 * Politika (ADR-130):
 *  - Yalnız `ACTIVE` veya `COMPLETED` anlaşmalar.
 *  - Yalnız `WEEKLY` / `MONTHLY` / `CAMPAIGN_END` schedule (MANUAL asla otomatik üretilmez).
 *  - Weekly/Monthly: store timezone'da EN SON KAPANMIŞ dönem; dönem anlaşma [startsAt, endsAt] ile
 *    örtüşmüyorsa atlanır.
 *  - Campaign-end: anlaşma dönemi tamamlandıktan sonra (`endsAt <= now`), bir kez; dönem = [startsAt, endsAt].
 *  - Üretim DAİMA DRAFT'tır; otomatik finalize YOK (ADR-131).
 */
import {
  lastClosedWeekPeriod,
  previousCalendarMonthPeriod,
  type Period,
} from "./timezone.js";

export type AgreementStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "COMPLETED"
  | "CANCELLED";

export type SettlementPeriodKind = "CAMPAIGN_END" | "WEEKLY" | "MONTHLY" | "MANUAL";

/** Zamanlama kararı için gereken minimum anlaşma görünümü. */
export interface SchedulableAgreement {
  id: string;
  storeId: string;
  status: AgreementStatus;
  settlementPeriod: SettlementPeriodKind;
  startsAt: Date;
  endsAt: Date;
}

/** Otomatik settlement üretimine uygun anlaşma statüleri (ADR-130). */
export function isSchedulableStatus(status: AgreementStatus): boolean {
  return status === "ACTIVE" || status === "COMPLETED";
}

/** Otomatik üretilebilir schedule türleri (MANUAL hariç). */
export function isScheduledPeriodKind(period: SettlementPeriodKind): boolean {
  return period === "WEEKLY" || period === "MONTHLY" || period === "CAMPAIGN_END";
}

export type PeriodResolution =
  | { ok: true; kind: SettlementPeriodKind; period: Period }
  | { ok: false; reason: PeriodSkipReason };

export type PeriodSkipReason =
  | "NOT_SCHEDULABLE_STATUS"
  | "MANUAL_SCHEDULE"
  | "AGREEMENT_NOT_ENDED"
  | "PERIOD_OUTSIDE_AGREEMENT_WINDOW";

/** İki yarı-açık aralık [aStart, aEnd) ve [bStart, bEnd) örtüşüyor mu? */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/**
 * Anlaşma için işlenecek kapanmış dönemi çözer. Uygun değilse `ok:false` + sebep döner (atlanır).
 * `timeZone` weekly/monthly için kullanılır; campaign-end store instant'larını kullanır (tz gerekmez).
 */
export function resolvePeriodForAgreement(
  agreement: SchedulableAgreement,
  now: Date,
  timeZone: string,
): PeriodResolution {
  if (!isSchedulableStatus(agreement.status)) {
    return { ok: false, reason: "NOT_SCHEDULABLE_STATUS" };
  }

  switch (agreement.settlementPeriod) {
    case "MANUAL":
      return { ok: false, reason: "MANUAL_SCHEDULE" };

    case "WEEKLY": {
      const period = lastClosedWeekPeriod(now, timeZone);
      if (!overlaps(period.periodStart, period.periodEnd, agreement.startsAt, agreement.endsAt)) {
        return { ok: false, reason: "PERIOD_OUTSIDE_AGREEMENT_WINDOW" };
      }
      return { ok: true, kind: "WEEKLY", period };
    }

    case "MONTHLY": {
      const period = previousCalendarMonthPeriod(now, timeZone);
      if (!overlaps(period.periodStart, period.periodEnd, agreement.startsAt, agreement.endsAt)) {
        return { ok: false, reason: "PERIOD_OUTSIDE_AGREEMENT_WINDOW" };
      }
      return { ok: true, kind: "MONTHLY", period };
    }

    case "CAMPAIGN_END": {
      // Anlaşma dönemi tamamlandıktan sonra bir kez. periodEnd hariç (exclusive) tutulur ama
      // campaign-end doğal olarak [startsAt, endsAt] tam aralığıdır; endsAt henüz gelmediyse atlanır.
      if (agreement.endsAt.getTime() > now.getTime()) {
        return { ok: false, reason: "AGREEMENT_NOT_ENDED" };
      }
      return {
        ok: true,
        kind: "CAMPAIGN_END",
        period: { periodStart: agreement.startsAt, periodEnd: agreement.endsAt },
      };
    }
  }
}

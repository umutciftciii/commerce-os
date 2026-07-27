/**
 * TODO-161A.1 — Timezone dönem sınırı + settlement uygunluk ÇEKİRDEĞİ (SAF) birim testleri.
 */
import { describe, expect, it } from "vitest";
import {
  lastClosedWeekPeriod,
  previousCalendarMonthPeriod,
  zonedWallTimeToUtc,
  getZonedDate,
  isValidTimeZone,
} from "../src/commercial-automation/timezone.js";
import {
  resolvePeriodForAgreement,
  isSchedulableStatus,
  isScheduledPeriodKind,
  type SchedulableAgreement,
} from "../src/commercial-automation/settlement-schedule-core.js";

const IST = "Europe/Istanbul"; // UTC+3 sabit (2016'dan beri DST yok)

function wallClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

describe("timezone helpers", () => {
  it("zonedWallTimeToUtc: TR 00:00 → UTC 21:00 önceki gün (+03:00)", () => {
    const utc = zonedWallTimeToUtc(IST, 2026, 7, 20, 0, 0, 0);
    expect(utc.toISOString()).toBe("2026-07-19T21:00:00.000Z");
  });

  it("getZonedDate: UTC instant'ın TR takvim tarihi", () => {
    // 2026-07-19T21:30Z = 2026-07-20 00:30 TR
    expect(getZonedDate(new Date("2026-07-19T21:30:00Z"), IST)).toEqual({ year: 2026, month: 7, day: 20 });
  });

  it("isValidTimeZone: geçerli/geçersiz", () => {
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});

describe("lastClosedWeekPeriod", () => {
  it("en son KAPANMIŞ hafta Pazartesi 00:00 → Pazartesi 00:00 (TR)", () => {
    // 2026-07-29 Çarşamba 12:00 TR → içinde bulunulan hafta Pzt 2026-07-27; kapanmış hafta 07-20..07-27
    const now = new Date("2026-07-29T09:00:00Z"); // 12:00 TR
    const { periodStart, periodEnd } = lastClosedWeekPeriod(now, IST);
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(7 * 86_400_000);
    expect(periodEnd.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(wallClock(periodStart, IST)).toBe("Mon 00:00");
    expect(wallClock(periodEnd, IST)).toBe("Mon 00:00");
    expect(periodStart.toISOString()).toBe("2026-07-19T21:00:00.000Z"); // 07-20 00:00 TR
    expect(periodEnd.toISOString()).toBe("2026-07-26T21:00:00.000Z"); // 07-27 00:00 TR
  });

  it("açık (içinde bulunulan) hafta işlenmez — periodEnd geçmişte", () => {
    const now = new Date("2026-07-27T21:30:00Z"); // Salı 00:30 TR
    const { periodEnd } = lastClosedWeekPeriod(now, IST);
    expect(periodEnd.getTime()).toBeLessThan(now.getTime());
  });
});

describe("previousCalendarMonthPeriod", () => {
  it("önceki takvim ayı (TR)", () => {
    const now = new Date("2026-07-15T09:00:00Z"); // 12:00 TR, Temmuz
    const { periodStart, periodEnd } = previousCalendarMonthPeriod(now, IST);
    expect(periodStart.toISOString()).toBe("2026-05-31T21:00:00.000Z"); // 06-01 00:00 TR
    expect(periodEnd.toISOString()).toBe("2026-06-30T21:00:00.000Z"); // 07-01 00:00 TR
  });

  it("Ocak → önceki yıl Aralık", () => {
    const now = new Date("2026-01-10T09:00:00Z");
    const { periodStart, periodEnd } = previousCalendarMonthPeriod(now, IST);
    expect(periodStart.toISOString()).toBe("2025-11-30T21:00:00.000Z"); // 2025-12-01 TR
    expect(periodEnd.toISOString()).toBe("2025-12-31T21:00:00.000Z"); // 2026-01-01 TR
  });
});

function agreement(over: Partial<SchedulableAgreement> = {}): SchedulableAgreement {
  return {
    id: "ag_1",
    storeId: "store_a",
    status: "ACTIVE",
    settlementPeriod: "WEEKLY",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2027-01-01T00:00:00Z"),
    ...over,
  };
}

describe("resolvePeriodForAgreement", () => {
  const now = new Date("2026-07-29T09:00:00Z");

  it("uygunluk yüklemleri", () => {
    expect(isSchedulableStatus("ACTIVE")).toBe(true);
    expect(isSchedulableStatus("COMPLETED")).toBe(true);
    expect(isSchedulableStatus("DRAFT")).toBe(false);
    expect(isSchedulableStatus("CANCELLED")).toBe(false);
    expect(isScheduledPeriodKind("WEEKLY")).toBe(true);
    expect(isScheduledPeriodKind("MANUAL")).toBe(false);
  });

  it("uygun olmayan statü atlanır", () => {
    const r = resolvePeriodForAgreement(agreement({ status: "DRAFT" }), now, IST);
    expect(r).toEqual({ ok: false, reason: "NOT_SCHEDULABLE_STATUS" });
  });

  it("MANUAL asla otomatik üretilmez", () => {
    const r = resolvePeriodForAgreement(agreement({ settlementPeriod: "MANUAL" }), now, IST);
    expect(r).toEqual({ ok: false, reason: "MANUAL_SCHEDULE" });
  });

  it("WEEKLY pencere içi → kapanmış hafta", () => {
    const r = resolvePeriodForAgreement(agreement({ settlementPeriod: "WEEKLY" }), now, IST);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("WEEKLY");
  });

  it("WEEKLY pencere dışı (gelecekte başlayan anlaşma) → atlanır", () => {
    const r = resolvePeriodForAgreement(
      agreement({ settlementPeriod: "WEEKLY", startsAt: new Date("2026-12-01T00:00:00Z") }),
      now,
      IST,
    );
    expect(r).toEqual({ ok: false, reason: "PERIOD_OUTSIDE_AGREEMENT_WINDOW" });
  });

  it("MONTHLY pencere içi → önceki ay", () => {
    const r = resolvePeriodForAgreement(agreement({ settlementPeriod: "MONTHLY" }), now, IST);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("MONTHLY");
  });

  it("CAMPAIGN_END henüz bitmemiş → atlanır", () => {
    const r = resolvePeriodForAgreement(
      agreement({ settlementPeriod: "CAMPAIGN_END", endsAt: new Date("2099-01-01T00:00:00Z") }),
      now,
      IST,
    );
    expect(r).toEqual({ ok: false, reason: "AGREEMENT_NOT_ENDED" });
  });

  it("CAMPAIGN_END bitmiş → [startsAt, endsAt]", () => {
    const startsAt = new Date("2026-06-01T00:00:00Z");
    const endsAt = new Date("2026-06-30T00:00:00Z");
    const r = resolvePeriodForAgreement(
      agreement({ settlementPeriod: "CAMPAIGN_END", startsAt, endsAt }),
      now,
      IST,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("CAMPAIGN_END");
      expect(r.period.periodStart).toEqual(startsAt);
      expect(r.period.periodEnd).toEqual(endsAt);
    }
  });
});

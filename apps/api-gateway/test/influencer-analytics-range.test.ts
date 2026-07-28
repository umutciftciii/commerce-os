/**
 * TD-146/ADR-178 — Analytics tarih aralığı çözümü (SAF, tz-aware, bounded, zero-fill).
 */
import { describe, expect, it } from "vitest";
import {
  enumerateDays,
  resolveRange,
  timezoneOffsetMinutes,
  zonedDayString,
} from "../src/influencers/analytics-range.js";

// 2026-07-15 10:00 UTC → İstanbul (UTC+3) 13:00 aynı gün.
const NOW = Date.UTC(2026, 6, 15, 10, 0, 0);
const IST = "Europe/Istanbul";

describe("timezone offset", () => {
  it("İstanbul +180 dk, UTC 0", () => {
    expect(timezoneOffsetMinutes(NOW, IST)).toBe(180);
    expect(timezoneOffsetMinutes(NOW, "UTC")).toBe(0);
  });
  it("tz-yerel gün stringi", () => {
    expect(zonedDayString(NOW, IST)).toBe("2026-07-15");
    // 2026-07-15 22:30 UTC → İstanbul ertesi gün 01:30.
    expect(zonedDayString(Date.UTC(2026, 6, 15, 22, 30), IST)).toBe("2026-07-16");
  });
});

describe("enumerateDays", () => {
  it("dahil aralık", () => {
    expect(enumerateDays("2026-07-01", "2026-07-03")).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });
  it("ters aralık boş", () => {
    expect(enumerateDays("2026-07-03", "2026-07-01")).toEqual([]);
  });
});

describe("resolveRange", () => {
  const base = { timezone: IST, defaultDays: 30, maxDays: 366, nowMs: NOW };

  it("varsayılan son 30 gün", () => {
    const r = resolveRange({ ...base });
    expect(r.dayStrings).toHaveLength(30);
    expect(r.dayStrings[r.dayStrings.length - 1]).toBe("2026-07-15");
    expect(r.dayStrings[0]).toBe("2026-06-16");
    // fromUtc = İstanbul 2026-06-16 00:00 = 2026-06-15T21:00Z
    expect(r.fromUtc.toISOString()).toBe("2026-06-15T21:00:00.000Z");
    // toUtcExclusive = İstanbul 2026-07-16 00:00 = 2026-07-15T21:00Z
    expect(r.toUtcExclusive.toISOString()).toBe("2026-07-15T21:00:00.000Z");
  });

  it("7 gün ön ayar", () => {
    const r = resolveRange({ ...base, dateFrom: "2026-07-09", dateTo: "2026-07-15" });
    expect(r.dayStrings).toHaveLength(7);
  });

  it("gelecek dateTo bugüne kırpılır", () => {
    const r = resolveRange({ ...base, dateTo: "2026-12-31" });
    expect(r.dayStrings[r.dayStrings.length - 1]).toBe("2026-07-15");
  });

  it("aralık maxDays'i aşarsa alt sınır kırpılır", () => {
    const r = resolveRange({ ...base, dateFrom: "2020-01-01", dateTo: "2026-07-15", maxDays: 90 });
    expect(r.dayStrings).toHaveLength(90);
    expect(r.dayStrings[r.dayStrings.length - 1]).toBe("2026-07-15");
    expect(r.dayStrings[0]).toBe("2026-04-17");
  });

  it("özel aralık", () => {
    const r = resolveRange({ ...base, dateFrom: "2026-07-10", dateTo: "2026-07-12" });
    expect(r.dayStrings).toEqual(["2026-07-10", "2026-07-11", "2026-07-12"]);
  });

  it("geçersiz dateFrom → varsayılan", () => {
    const r = resolveRange({ ...base, dateFrom: "not-a-date" });
    expect(r.dayStrings).toHaveLength(30);
  });
});

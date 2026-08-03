/**
 * ADR-268 §5 — dönem/tarih-aralığı çözümü testleri (tz-aware, bounded, deterministik).
 * nowMs enjekte edilir (Date.now'a bağımlı değil).
 */
import { describe, expect, it } from "vitest";
import { resolveFinanceRange, resolvePresetRange } from "../src/finance/date-range.js";

const TZ = "Europe/Istanbul";
// 2026-08-03 09:00 UTC → İstanbul (UTC+3) 12:00, aynı takvim günü.
const NOW = Date.UTC(2026, 7, 3, 9, 0, 0);

describe("resolvePresetRange", () => {
  it("today / yesterday", () => {
    expect(resolvePresetRange("today", TZ, NOW)).toEqual({ dateFrom: "2026-08-03", dateTo: "2026-08-03" });
    expect(resolvePresetRange("yesterday", TZ, NOW)).toEqual({ dateFrom: "2026-08-02", dateTo: "2026-08-02" });
  });
  it("last7 / last30 (bugün dahil)", () => {
    expect(resolvePresetRange("last7", TZ, NOW)).toEqual({ dateFrom: "2026-07-28", dateTo: "2026-08-03" });
    expect(resolvePresetRange("last30", TZ, NOW)).toEqual({ dateFrom: "2026-07-05", dateTo: "2026-08-03" });
  });
  it("thisMonth / lastMonth / thisYear", () => {
    expect(resolvePresetRange("thisMonth", TZ, NOW)).toEqual({ dateFrom: "2026-08-01", dateTo: "2026-08-03" });
    expect(resolvePresetRange("lastMonth", TZ, NOW)).toEqual({ dateFrom: "2026-07-01", dateTo: "2026-07-31" });
    expect(resolvePresetRange("thisYear", TZ, NOW)).toEqual({ dateFrom: "2026-01-01", dateTo: "2026-08-03" });
  });
  it("lastMonth yıl sınırını doğru geçer (Ocak → önceki Aralık)", () => {
    const jan = Date.UTC(2026, 0, 15, 9, 0, 0);
    expect(resolvePresetRange("lastMonth", TZ, jan)).toEqual({ dateFrom: "2025-12-01", dateTo: "2025-12-31" });
  });
});

describe("resolveFinanceRange — current + önceki eşit-uzunluklu dönem", () => {
  it("last7: current 7 gün, previous hemen önceki 7 gün", () => {
    const r = resolveFinanceRange({ preset: "last7", timezone: TZ, nowMs: NOW });
    expect(r.current.dayStrings).toHaveLength(7);
    expect(r.current.dayStrings[0]).toBe("2026-07-28");
    expect(r.current.dayStrings[6]).toBe("2026-08-03");
    expect(r.previous.dayStrings).toHaveLength(7);
    expect(r.previous.dayStrings[0]).toBe("2026-07-21");
    expect(r.previous.dayStrings[6]).toBe("2026-07-27");
  });
  it("today: current 1 gün, previous dün", () => {
    const r = resolveFinanceRange({ preset: "today", timezone: TZ, nowMs: NOW });
    expect(r.current.dayStrings).toEqual(["2026-08-03"]);
    expect(r.previous.dayStrings).toEqual(["2026-08-02"]);
  });
  it("custom aralık geçirilir; gelecek gün bugüne kırpılır", () => {
    const r = resolveFinanceRange({ preset: "custom", timezone: TZ, nowMs: NOW, dateFrom: "2026-08-01", dateTo: "2026-12-31" });
    expect(r.current.dayStrings[0]).toBe("2026-08-01");
    expect(r.current.dayStrings[r.current.dayStrings.length - 1]).toBe("2026-08-03"); // bugüne kırpıldı
  });
  it("UTC sınırları tz-yerel gün başlangıcıdır (İstanbul 00:00 = UTC 21:00 önceki gün)", () => {
    const r = resolveFinanceRange({ preset: "today", timezone: TZ, nowMs: NOW });
    // 2026-08-03 00:00 +03:00 = 2026-08-02T21:00:00Z
    expect(r.current.fromUtc.toISOString()).toBe("2026-08-02T21:00:00.000Z");
    expect(r.current.toUtcExclusive.toISOString()).toBe("2026-08-03T21:00:00.000Z");
  });
});

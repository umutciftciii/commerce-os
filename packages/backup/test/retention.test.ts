import { describe, it, expect } from "vitest";
import { selectRetention, isoWeekKey, type RetentionItem } from "../src/retention.js";

function day(n: number): Date {
  // 2026-01-01 + n gün (UTC 12:00 — DST-bağımsız)
  return new Date(Date.UTC(2026, 0, 1 + n, 12, 0, 0));
}

describe("isoWeekKey", () => {
  it("UTC ISO hafta anahtarı", () => {
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toMatch(/^2026-W\d{2}$/);
  });
});

describe("selectRetention (GFS)", () => {
  it("günlük katman: en yeni N distinct günü korur, gerisini purge eder", () => {
    const items: RetentionItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `b${i}`,
      date: day(i),
      status: "COMPLETED",
    }));
    const d = selectRetention(items, { daily: 14, weekly: 0, monthly: 0, minKeep: 1 });
    expect(d.retain).toHaveLength(14);
    // En yeni (day 29) korunmalı.
    expect(d.retain.map((r) => r.id)).toContain("b29");
    expect(d.purge).toHaveLength(16);
  });

  it("en yeni başarılı backup ASLA purge edilmez (min-guard)", () => {
    const items: RetentionItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      date: day(i),
      status: "COMPLETED",
    }));
    const d = selectRetention(items, { daily: 0, weekly: 0, monthly: 0, minKeep: 3 });
    expect(d.retain.map((r) => r.id).sort()).toEqual(["b2", "b3", "b4"]);
    expect(d.purge.map((r) => r.id).sort()).toEqual(["b0", "b1"]);
    expect(d.retain.map((r) => r.id)).toContain("b4"); // en yeni
  });

  it("başarısız/yarım backup retention'a girmez (incomplete olarak raporlanır)", () => {
    const items: RetentionItem[] = [
      { id: "ok1", date: day(2), status: "COMPLETED" },
      { id: "fail1", date: day(3), status: "FAILED" },
      { id: "part1", date: day(4), status: "PARTIAL" },
    ];
    const d = selectRetention(items, { daily: 14, weekly: 8, monthly: 12, minKeep: 1 });
    expect(d.retain.map((r) => r.id)).toEqual(["ok1"]);
    expect(d.incomplete.map((r) => r.id).sort()).toEqual(["fail1", "part1"]);
    // Başarısız olan en yeni olsa bile retain'e min-guard ile GİRMEZ.
    expect(d.retain.map((r) => r.id)).not.toContain("fail1");
  });

  it("haftalık/aylık katmanlar distinct period'ın en-yenisini korur", () => {
    // 12 hafta boyunca haftada bir backup (7 gün arayla).
    const items: RetentionItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      date: day(i * 7),
      status: "COMPLETED",
    }));
    const d = selectRetention(items, { daily: 0, weekly: 4, monthly: 0, minKeep: 1 });
    // 4 distinct hafta korunur (en yeni 4).
    expect(d.retain).toHaveLength(4);
    expect(d.retain.map((r) => r.id)).toContain("w11");
  });

  it("purge listesi retain ile kesişmez", () => {
    const items: RetentionItem[] = Array.from({ length: 40 }, (_, i) => ({
      id: `b${i}`,
      date: day(i),
      status: "COMPLETED",
    }));
    const d = selectRetention(items, { daily: 14, weekly: 8, monthly: 12, minKeep: 3 });
    const retainIds = new Set(d.retain.map((r) => r.id));
    expect(d.purge.every((p) => !retainIds.has(p.id))).toBe(true);
  });
});

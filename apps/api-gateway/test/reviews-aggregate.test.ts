import { describe, expect, it } from "vitest";
import { computeAggregate, displayAverage } from "../src/reviews/data.js";

/**
 * TODO-159E (ADR-094) — Rating aggregate SAF hesap testi (DB'siz).
 *
 * Tamsayı toplamlar → float drift YOK. `averageTimes100 = round(sumRating*100/reviewCount)`;
 * gösterim ortalaması `displayAverage` ile 1 ondalık. Dağılım (count1..count5) korunur.
 */

function counts(list: number[]) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const r of list) c[r as 1 | 2 | 3 | 4 | 5] += 1;
  return c;
}

describe("reviews aggregate — saf hesap", () => {
  it("[5,4,4] → ortalama 4.3, dağılım {4:2,5:1}", () => {
    const agg = computeAggregate(counts([5, 4, 4]));
    expect(agg.reviewCount).toBe(3);
    expect(agg.sumRating).toBe(13);
    expect(agg.averageTimes100).toBe(433);
    expect(displayAverage(agg.averageTimes100)).toBe(4.3);
    expect(agg.count4).toBe(2);
    expect(agg.count5).toBe(1);
    expect(agg.count1 + agg.count2 + agg.count3).toBe(0);
  });

  it("[3,4] → ortalama tam 3.5 (float güvenli)", () => {
    const agg = computeAggregate(counts([3, 4]));
    expect(agg.averageTimes100).toBe(350);
    expect(displayAverage(agg.averageTimes100)).toBe(3.5);
  });

  it("[1,2,3,4,5] → ortalama 3.0", () => {
    const agg = computeAggregate(counts([1, 2, 3, 4, 5]));
    expect(agg.reviewCount).toBe(5);
    expect(agg.sumRating).toBe(15);
    expect(displayAverage(agg.averageTimes100)).toBe(3);
  });

  it("tek [5] → 5.0", () => {
    const agg = computeAggregate(counts([5]));
    expect(displayAverage(agg.averageTimes100)).toBe(5);
  });

  it("boş → sıfır (reviewCount 0, averageTimes100 0)", () => {
    const agg = computeAggregate(counts([]));
    expect(agg.reviewCount).toBe(0);
    expect(agg.averageTimes100).toBe(0);
    expect(displayAverage(agg.averageTimes100)).toBe(0);
  });

  it("[4,4,4,5] → 4.25 → gösterim 4.3 (yuvarlama)", () => {
    const agg = computeAggregate(counts([4, 4, 4, 5]));
    expect(agg.averageTimes100).toBe(425);
    expect(displayAverage(agg.averageTimes100)).toBe(4.3);
  });
});

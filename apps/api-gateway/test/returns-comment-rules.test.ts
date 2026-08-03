import { describe, it, expect } from "vitest";
import { returnReasonRequiresComment } from "@commerce-os/contracts";

describe("returns comment-required rules (ADR-269 §4 / spec §4)", () => {
  it("defect / damage / wrong-item / mismatch / missing-parts / OTHER require a comment", () => {
    for (const reason of [
      "NOT_AS_DESCRIBED",
      "WRONG_ITEM_RECEIVED",
      "DEFECTIVE_OR_NOT_WORKING",
      "DAMAGED_PRODUCT",
      "DAMAGED_PACKAGING",
      "MISSING_PARTS_OR_ACCESSORIES",
      "OTHER",
    ] as const) {
      expect(returnReasonRequiresComment(reason)).toBe(true);
    }
  });

  it("simple withdrawal reasons do NOT require a comment", () => {
    for (const reason of [
      "NO_LONGER_NEEDED",
      "ORDERED_BY_MISTAKE",
      "BETTER_PRICE_AVAILABLE",
      "QUALITY_NOT_EXPECTED",
      "SIZE_OR_FIT_ISSUE",
      "DELIVERY_TOO_LATE",
      "UNAUTHORIZED_PURCHASE",
    ] as const) {
      expect(returnReasonRequiresComment(reason)).toBe(false);
    }
  });
});

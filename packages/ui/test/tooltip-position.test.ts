import { describe, expect, it } from "vitest";
import { computeTooltipPosition, type Rect } from "../src/tooltip-position";

const viewport = { width: 1000, height: 800 };

describe("computeTooltipPosition", () => {
  it("places the tooltip above and horizontally centered on the anchor when it fits", () => {
    const anchor: Rect = { top: 400, left: 480, width: 40, height: 20 };
    const pos = computeTooltipPosition(anchor, { width: 120, height: 32 }, viewport, "top", 8);
    expect(pos.side).toBe("top");
    // Center: anchor centerX = 500; tip left = 500 - 60 = 440
    expect(pos.left).toBe(440);
    // Top: 400 - 8 - 32 = 360
    expect(pos.top).toBe(360);
  });

  it("flips to bottom when there is no room above (collision detection)", () => {
    const anchor: Rect = { top: 4, left: 480, width: 40, height: 20 };
    const pos = computeTooltipPosition(anchor, { width: 120, height: 32 }, viewport, "top", 8);
    expect(pos.side).toBe("bottom");
    // Bottom: 4 + 20 + 8 = 32
    expect(pos.top).toBe(32);
  });

  it("clamps the tooltip within the viewport padding near the right edge", () => {
    const anchor: Rect = { top: 400, left: 980, width: 16, height: 16 };
    const pos = computeTooltipPosition(anchor, { width: 200, height: 40 }, viewport, "top", 8, 8);
    // Right-clamped: max left = 1000 - 200 - 8 = 792
    expect(pos.left).toBe(792);
  });

  it("clamps near the left edge to the padding, never going negative", () => {
    const anchor: Rect = { top: 400, left: 2, width: 16, height: 16 };
    const pos = computeTooltipPosition(anchor, { width: 200, height: 40 }, viewport, "top", 8, 8);
    expect(pos.left).toBe(8);
  });

  it("flips a left-preferred tooltip to the right when it would overflow the left edge", () => {
    const anchor: Rect = { top: 400, left: 10, width: 20, height: 20 };
    const pos = computeTooltipPosition(anchor, { width: 120, height: 32 }, viewport, "left", 8);
    expect(pos.side).toBe("right");
    // Right: 10 + 20 + 8 = 38
    expect(pos.left).toBe(38);
  });
});

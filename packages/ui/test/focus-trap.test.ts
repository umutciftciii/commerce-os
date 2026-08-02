import { describe, expect, it } from "vitest";
import { computeTrapFocusIndex } from "../src/focus-trap";

describe("computeTrapFocusIndex", () => {
  it("wraps to the first element when Tab is pressed on the last", () => {
    expect(computeTrapFocusIndex(3, 2, false)).toBe(0);
  });

  it("wraps to the last element when Shift+Tab is pressed on the first", () => {
    expect(computeTrapFocusIndex(3, 0, true)).toBe(2);
  });

  it("lets the browser handle Tab in the middle of the sequence", () => {
    expect(computeTrapFocusIndex(3, 1, false)).toBeNull();
    expect(computeTrapFocusIndex(3, 1, true)).toBeNull();
  });

  it("wraps to the first element when focus is outside the container and Tab is pressed", () => {
    expect(computeTrapFocusIndex(3, -1, false)).toBe(0);
  });

  it("wraps to the last element when focus is outside and Shift+Tab is pressed", () => {
    expect(computeTrapFocusIndex(3, -1, true)).toBe(2);
  });

  it("returns null when there are no focusable elements", () => {
    expect(computeTrapFocusIndex(0, -1, false)).toBeNull();
  });
});

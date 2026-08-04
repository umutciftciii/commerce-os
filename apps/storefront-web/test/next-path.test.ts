import { describe, expect, it } from "vitest";
import { safeNextPath } from "../lib/next-path";

/** ADR-271 — güçlendirilmiş safeNextPath (open-redirect savunması). */
describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/account/orders")).toBe("/account/orders");
    expect(safeNextPath("/checkout")).toBe("/checkout");
  });
  it("falls back for external/protocol-relative/scheme/backslash/encoded", () => {
    expect(safeNextPath("https://evil.com")).toBe("/account");
    expect(safeNextPath("//evil.com")).toBe("/account");
    expect(safeNextPath("javascript:alert(1)")).toBe("/account");
    expect(safeNextPath("/\\evil.com")).toBe("/account");
    expect(safeNextPath("/%2F%2Fevil.com")).toBe("/account");
  });
  it("falls back for nullish/empty/non-slash and /auth loop", () => {
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath("")).toBe("/account");
    expect(safeNextPath("relative")).toBe("/account");
    expect(safeNextPath("/auth/login")).toBe("/account");
  });
  it("honours a custom fallback", () => {
    expect(safeNextPath("//evil", "/")).toBe("/");
  });
});

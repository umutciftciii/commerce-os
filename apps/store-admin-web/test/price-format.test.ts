import { describe, expect, it } from "vitest";
import { formatMinor, inputToMinor, minorToInput } from "../lib/client/format.js";

describe("price helpers — input (lira) -> minor unit (kuruş)", () => {
  it("parses plain decimals with dot or comma", () => {
    expect(inputToMinor("199.90")).toBe(19990);
    expect(inputToMinor("199,90")).toBe(19990);
    expect(inputToMinor("0")).toBe(0);
    expect(inputToMinor("12")).toBe(1200);
  });

  it("parses Turkish thousands separator (dot) with comma decimal", () => {
    expect(inputToMinor("1.234,56")).toBe(123456);
  });

  it("rejects invalid or negative input", () => {
    expect(inputToMinor("")).toBeNull();
    expect(inputToMinor("abc")).toBeNull();
    expect(inputToMinor("-5")).toBeNull();
    expect(inputToMinor("1.999")).toBeNull();
  });
});

describe("price helpers — minor unit -> form input", () => {
  it("renders a two-decimal lira string", () => {
    expect(minorToInput(19990)).toBe("199.90");
    expect(minorToInput(0)).toBe("0.00");
  });

  it("returns empty string for null/undefined", () => {
    expect(minorToInput(null)).toBe("");
    expect(minorToInput(undefined)).toBe("");
  });
});

describe("price helpers — display formatting", () => {
  it("formats minor units as TRY currency", () => {
    const formatted = formatMinor(19990, "TRY");
    expect(formatted).toContain("199");
    expect(formatted).toContain("₺");
  });
});

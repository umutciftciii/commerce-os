import { describe, it, expect } from "vitest";
import {
  isCanonicalMinorString,
  parseMinorString,
  minorToCanonicalString,
  compareMinorStrings,
  minorToMajorParts,
  formatMinorMoney,
} from "../src/money";

/**
 * TODO-172 (ADR-273) — minor-unit BigInt finansal string sözleşmesi. Number/float YOK; 2^53 üstü
 * precision korunur. Spec test kümesi: 0 / limit-eşit / limit-üstü / MAX_SAFE+1 / invalid decimal /
 * negative / leading zero / round-trip.
 */

describe("isCanonicalMinorString", () => {
  it("accepts 0 and positive canonical integers", () => {
    expect(isCanonicalMinorString("0")).toBe(true);
    expect(isCanonicalMinorString("25000")).toBe(true);
    expect(isCanonicalMinorString("9007199254740993")).toBe(true); // MAX_SAFE_INTEGER + 2
  });
  it("rejects leading zeros, negatives, decimals, empty, whitespace, non-digits", () => {
    for (const bad of ["007", "-1", "1.5", "", " 1", "1 ", "1e3", "abc", "+1", "0.0", "12,5"]) {
      expect(isCanonicalMinorString(bad)).toBe(false);
    }
  });
});

describe("parseMinorString", () => {
  it("parses 0 and large values beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
    expect(parseMinorString("0")).toBe(0n);
    expect(parseMinorString("25000")).toBe(25000n);
    // Number(9007199254740993) === 9007199254740992 (LOSSY) — BigInt keeps it exact.
    expect(parseMinorString("9007199254740993")).toBe(9007199254740993n);
    expect(parseMinorString("9007199254740993")).not.toBe(BigInt(Number("9007199254740993")));
  });
  it("throws on invalid / leading zero / negative / decimal (no silent coercion)", () => {
    for (const bad of ["007", "-1", "1.5", "", "abc"]) {
      expect(() => parseMinorString(bad)).toThrow(RangeError);
    }
  });
});

describe("minorToCanonicalString round-trip", () => {
  it("BigInt → string → BigInt is stable, canonical (no leading zeros)", () => {
    for (const v of [0n, 1n, 25000n, 9007199254740993n, 123456789012345678901234567890n]) {
      const s = minorToCanonicalString(v);
      expect(isCanonicalMinorString(s)).toBe(true);
      expect(parseMinorString(s)).toBe(v);
    }
  });
  it("rejects negative BigInt", () => {
    expect(() => minorToCanonicalString(-1n)).toThrow(RangeError);
  });
});

describe("compareMinorStrings (limit boundary semantics)", () => {
  it("equal to limit → 0; over → 1; under → -1 (no float)", () => {
    expect(compareMinorStrings("25000", "25000")).toBe(0); // equal
    expect(compareMinorStrings("25001", "25000")).toBe(1); // over
    expect(compareMinorStrings("24999", "25000")).toBe(-1); // under
    // Precision beyond 2^53: 2^53 vs 2^53+1 must not collapse.
    expect(compareMinorStrings("9007199254740993", "9007199254740992")).toBe(1);
  });
});

describe("minorToMajorParts (BigInt division, no float)", () => {
  it("splits into major + 2-digit fraction", () => {
    expect(minorToMajorParts("25000")).toEqual({ major: "250", fraction: "00" });
    expect(minorToMajorParts("1234567")).toEqual({ major: "12345", fraction: "67" });
    expect(minorToMajorParts("5")).toEqual({ major: "0", fraction: "05" });
    expect(minorToMajorParts("0")).toEqual({ major: "0", fraction: "00" });
  });
});

describe("formatMinorMoney", () => {
  it("formats TRY tr-style with grouping (₺1.234,56)", () => {
    expect(formatMinorMoney("25000", "TRY", "tr")).toBe("₺250,00");
    expect(formatMinorMoney("123456", "TRY", "tr")).toBe("₺1.234,56");
    expect(formatMinorMoney(1234567n, "TRY", "tr")).toBe("₺12.345,67");
  });
  it("formats USD en-style with grouping ($1,234.56)", () => {
    expect(formatMinorMoney("123456", "USD", "en")).toBe("$1,234.56");
  });
  it("unknown currency → code prefix", () => {
    expect(formatMinorMoney("25000", "SEK", "en")).toBe("SEK 250.00");
  });
});

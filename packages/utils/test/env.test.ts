import { describe, expect, it } from "vitest";
import { optionalEnvString } from "../src/index.js";

describe("optionalEnvString (TD-038)", () => {
  it("treats undefined as absent", () => {
    expect(optionalEnvString(undefined)).toBeUndefined();
  });

  it("treats null as absent", () => {
    expect(optionalEnvString(null)).toBeUndefined();
  });

  it("treats an empty string as absent", () => {
    expect(optionalEnvString("")).toBeUndefined();
  });

  it("treats a whitespace-only string as absent", () => {
    expect(optionalEnvString("   ")).toBeUndefined();
    expect(optionalEnvString("\t\n ")).toBeUndefined();
  });

  it("returns a non-empty value unchanged (no trimming)", () => {
    expect(optionalEnvString("http://api-gateway:4000")).toBe("http://api-gateway:4000");
    expect(optionalEnvString("demo-store")).toBe("demo-store");
    // Bos OLMAYAN deger, ic bosluklariyla birlikte oldugu gibi korunur.
    expect(optionalEnvString(" value ")).toBe(" value ");
  });

  it("supports the `?? default` fallback pattern for optional envs", () => {
    const resolve = (raw: string | undefined) => optionalEnvString(raw) ?? "default";
    expect(resolve(undefined)).toBe("default");
    expect(resolve("")).toBe("default");
    expect(resolve("   ")).toBe("default");
    expect(resolve("explicit")).toBe("explicit");
  });
});

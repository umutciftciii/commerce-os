// Faz 2B (TODO-146) — Attribute değer dönüşümleri + doğrulama saf birim testleri.
import { describe, expect, it } from "vitest";
import type { AttributeDataType, ProductAttributeValueResponse } from "@commerce-os/api-client";
import {
  attributeValuesToInputs,
  buildAttributeValueMap,
  isAttributeServerError,
  validateAttributeValue,
  type AttributeValidationMessages,
} from "../app/(app)/products/attributes/value-mapping";
import { parseValidationRules, type ResolvedAttribute } from "../app/(app)/products/attributes/types";

function attr(
  id: string,
  dataType: AttributeDataType,
  overrides: Partial<ResolvedAttribute> = {},
): ResolvedAttribute {
  return {
    categoryAttributeId: `ca_${id}`,
    attributeDefinitionId: id,
    code: id,
    name: id,
    description: null,
    dataType,
    unit: null,
    required: false,
    displayOrder: 0,
    groupId: null,
    options: [],
    rules: {},
    ...overrides,
  };
}

const MESSAGES: AttributeValidationMessages = {
  required: "required",
  invalidNumber: "invalidNumber",
  invalidInteger: "invalidInteger",
  invalidUrl: "invalidUrl",
  min: (n) => `min:${n}`,
  max: (n) => `max:${n}`,
  minLength: (n) => `minLength:${n}`,
  maxLength: (n) => `maxLength:${n}`,
  pattern: "pattern",
};

function readValue(overrides: Partial<ProductAttributeValueResponse>): ProductAttributeValueResponse {
  return {
    id: "v1",
    attributeDefinitionId: "x",
    dataType: "TEXT",
    valueText: null,
    valueInteger: null,
    valueDecimal: null,
    valueBoolean: null,
    valueDate: null,
    optionId: null,
    optionIds: [],
    mediaId: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("attributeValuesToInputs (save payload / Faz 2A format)", () => {
  it("maps each dataType to the correct value field and omits empty optionals", () => {
    const resolved = [
      attr("t", "TEXT"),
      attr("i", "INTEGER"),
      attr("d", "DECIMAL"),
      attr("b", "BOOLEAN"),
      attr("dt", "DATE"),
      attr("s", "SELECT"),
      attr("ms", "MULTI_SELECT"),
      attr("img", "IMAGE"),
      attr("empty", "TEXT"), // boş → gönderilmez
    ];
    const inputs = attributeValuesToInputs(resolved, {
      t: "  Cotton  ",
      i: "42",
      d: "3.5",
      b: false,
      dt: "2026-07-17",
      s: "opt_red",
      ms: ["a", "b", "a"],
      img: "media_1",
      empty: "   ",
    });

    const byId = new Map(inputs.map((input) => [input.attributeDefinitionId, input]));
    expect(byId.get("t")).toEqual({ attributeDefinitionId: "t", valueText: "Cotton" });
    expect(byId.get("i")).toEqual({ attributeDefinitionId: "i", valueInteger: 42 });
    expect(byId.get("d")).toEqual({ attributeDefinitionId: "d", valueDecimal: 3.5 });
    // BOOLEAN her zaman gönderilir (false anlamlı).
    expect(byId.get("b")).toEqual({ attributeDefinitionId: "b", valueBoolean: false });
    expect(byId.get("dt")?.valueDate).toBe("2026-07-17T00:00:00.000Z");
    expect(byId.get("s")).toEqual({ attributeDefinitionId: "s", optionId: "opt_red" });
    expect(byId.get("ms")).toEqual({ attributeDefinitionId: "ms", optionIds: ["a", "b"] }); // dedupe
    expect(byId.get("img")).toEqual({ attributeDefinitionId: "img", mediaId: "media_1" });
    // boş metin gönderilmez
    expect(byId.has("empty")).toBe(false);
  });

  it("omits empty MULTI_SELECT / SELECT / IMAGE", () => {
    const resolved = [attr("s", "SELECT"), attr("ms", "MULTI_SELECT"), attr("img", "IMAGE")];
    const inputs = attributeValuesToInputs(resolved, { s: "", ms: [], img: "" });
    expect(inputs).toEqual([]);
  });
});

describe("buildAttributeValueMap (edit round-trip)", () => {
  it("hydrates each dataType from the read projection; missing values start empty", () => {
    const resolved = [
      attr("t", "TEXT"),
      attr("i", "INTEGER"),
      attr("b", "BOOLEAN"),
      attr("dt", "DATE"),
      attr("s", "SELECT"),
      attr("ms", "MULTI_SELECT"),
      attr("img", "IMAGE"),
      attr("missing", "TEXT"),
    ];
    const map = buildAttributeValueMap(resolved, [
      readValue({ attributeDefinitionId: "t", dataType: "TEXT", valueText: "Wool" }),
      readValue({ attributeDefinitionId: "i", dataType: "INTEGER", valueInteger: 7 }),
      readValue({ attributeDefinitionId: "b", dataType: "BOOLEAN", valueBoolean: true }),
      readValue({ attributeDefinitionId: "dt", dataType: "DATE", valueDate: "2026-05-01T00:00:00.000Z" }),
      readValue({ attributeDefinitionId: "s", dataType: "SELECT", optionId: "opt_red" }),
      readValue({ attributeDefinitionId: "ms", dataType: "MULTI_SELECT", optionIds: ["a", "b"] }),
      readValue({ attributeDefinitionId: "img", dataType: "IMAGE", mediaId: "media_9" }),
    ]);
    expect(map.t).toBe("Wool");
    expect(map.i).toBe("7");
    expect(map.b).toBe(true);
    expect(map.dt).toBe("2026-05-01"); // ISO → yyyy-mm-dd
    expect(map.s).toBe("opt_red");
    expect(map.ms).toEqual(["a", "b"]);
    expect(map.img).toBe("media_9");
    expect(map.missing).toBe(""); // eksik değer boş başlar
  });

  it("round-trips without loss (read → form → input)", () => {
    const resolved = [attr("t", "TEXT"), attr("ms", "MULTI_SELECT")];
    const map = buildAttributeValueMap(resolved, [
      readValue({ attributeDefinitionId: "t", dataType: "TEXT", valueText: "Silk" }),
      readValue({ attributeDefinitionId: "ms", dataType: "MULTI_SELECT", optionIds: ["x", "y"] }),
    ]);
    const inputs = attributeValuesToInputs(resolved, map);
    expect(inputs).toContainEqual({ attributeDefinitionId: "t", valueText: "Silk" });
    expect(inputs).toContainEqual({ attributeDefinitionId: "ms", optionIds: ["x", "y"] });
  });
});

describe("validateAttributeValue (required + validationRules)", () => {
  it("flags required empty and passes required filled", () => {
    const required = attr("t", "TEXT", { required: true });
    expect(validateAttributeValue(required, "", MESSAGES)).toBe("required");
    expect(validateAttributeValue(required, "hi", MESSAGES)).toBeNull();
  });

  it("optional empty is valid", () => {
    expect(validateAttributeValue(attr("t", "TEXT"), "", MESSAGES)).toBeNull();
    expect(validateAttributeValue(attr("ms", "MULTI_SELECT"), [], MESSAGES)).toBeNull();
  });

  it("applies minLength / maxLength / pattern to text", () => {
    const a = attr("t", "TEXT", { rules: { minLength: 3, maxLength: 5, pattern: "^[a-z]+$" } });
    expect(validateAttributeValue(a, "ab", MESSAGES)).toBe("minLength:3");
    expect(validateAttributeValue(a, "abcdef", MESSAGES)).toBe("maxLength:5");
    expect(validateAttributeValue(a, "AB1", MESSAGES)).toBe("pattern"); // uzunluk OK, desen başarısız
    expect(validateAttributeValue(a, "abc", MESSAGES)).toBeNull();
  });

  it("applies min / max and integer/number checks", () => {
    const i = attr("i", "INTEGER", { rules: { min: 1, max: 10 } });
    expect(validateAttributeValue(i, "0", MESSAGES)).toBe("min:1");
    expect(validateAttributeValue(i, "11", MESSAGES)).toBe("max:10");
    expect(validateAttributeValue(i, "3.5", MESSAGES)).toBe("invalidInteger");
    expect(validateAttributeValue(i, "5", MESSAGES)).toBeNull();
    const d = attr("d", "DECIMAL", { rules: { min: 0 } });
    expect(validateAttributeValue(d, "abc", MESSAGES)).toBe("invalidNumber");
    expect(validateAttributeValue(d, "-1", MESSAGES)).toBe("min:0");
  });

  it("validates URL format", () => {
    const u = attr("u", "URL");
    expect(validateAttributeValue(u, "not a url", MESSAGES)).toBe("invalidUrl");
    expect(validateAttributeValue(u, "https://example.com", MESSAGES)).toBeNull();
  });
});

describe("parseValidationRules", () => {
  it("keeps supported keys and ignores unsupported / wrong-typed", () => {
    const rules = parseValidationRules({
      min: 1,
      max: "nope",
      minLength: 3,
      pattern: "^x$",
      placeholder: "ph",
      helperText: "help",
      unknown: 42,
    });
    expect(rules).toEqual({ min: 1, minLength: 3, pattern: "^x$", placeholder: "ph", helperText: "help" });
  });

  it("returns empty object for non-objects", () => {
    expect(parseValidationRules(null)).toEqual({});
    expect(parseValidationRules("x")).toEqual({});
  });
});

describe("isAttributeServerError", () => {
  it("recognizes attribute error codes and rejects others", () => {
    expect(isAttributeServerError("ATTRIBUTE_REQUIRED_MISSING")).toBe(true);
    expect(isAttributeServerError("ATTRIBUTE_OPTION_INVALID")).toBe(true);
    expect(isAttributeServerError("ATTRIBUTE_NOT_IN_CATEGORY")).toBe(true);
    expect(isAttributeServerError("PRODUCT_NOT_FOUND")).toBe(false);
    expect(isAttributeServerError("NETWORK")).toBe(false);
  });
});

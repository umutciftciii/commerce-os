import { describe, it, expect } from "vitest";
import { resolveQuestionSet, type ResolutionInput } from "../src/product-support/resolution";

function base(over: Partial<ResolutionInput> = {}): ResolutionInput {
  return {
    topic: "SETUP_USAGE",
    productId: "prod-1",
    categoryAncestryIds: ["cat-child", "cat-root"],
    productMap: new Map(),
    categoryMap: new Map(),
    topicDefault: new Map([["SETUP_USAGE", "qs-default"]]),
    ...over,
  };
}

describe("resolution hierarchy (ADR-289 §6: product > category > DEFAULT)", () => {
  it("product mapping wins over everything", () => {
    const i = base({
      productMap: new Map([["prod-1:SETUP_USAGE", "qs-product"]]),
      categoryMap: new Map([["cat-child:SETUP_USAGE", "qs-category"]]),
    });
    expect(resolveQuestionSet(i)).toEqual({ questionSetId: "qs-product", tier: "PRODUCT" });
  });

  it("category mapping wins when there is no product mapping", () => {
    const i = base({ categoryMap: new Map([["cat-child:SETUP_USAGE", "qs-category"]]) });
    expect(resolveQuestionSet(i)).toEqual({ questionSetId: "qs-category", tier: "CATEGORY" });
  });

  it("nearest ancestor category wins over the root", () => {
    const i = base({
      categoryMap: new Map([
        ["cat-child:SETUP_USAGE", "qs-child"],
        ["cat-root:SETUP_USAGE", "qs-root"],
      ]),
    });
    expect(resolveQuestionSet(i)).toEqual({ questionSetId: "qs-child", tier: "CATEGORY" });
  });

  it("uses the root category mapping when the child has none", () => {
    const i = base({ categoryMap: new Map([["cat-root:SETUP_USAGE", "qs-root"]]) });
    expect(resolveQuestionSet(i)).toEqual({ questionSetId: "qs-root", tier: "CATEGORY" });
  });

  it("falls back to the platform DEFAULT when neither product nor category matches", () => {
    expect(resolveQuestionSet(base())).toEqual({ questionSetId: "qs-default", tier: "DEFAULT" });
  });

  it("mappings are topic-scoped (a different topic does not match)", () => {
    const i = base({
      topic: "WARRANTY_SERVICE",
      productMap: new Map([["prod-1:SETUP_USAGE", "qs-wrong"]]),
      topicDefault: new Map([["WARRANTY_SERVICE", "qs-warranty-default"]]),
    });
    expect(resolveQuestionSet(i)).toEqual({
      questionSetId: "qs-warranty-default",
      tier: "DEFAULT",
    });
  });

  it("throws MISSING_TOPIC_DEFAULT when the mandatory default is absent (seed invariant guard)", () => {
    const i = base({ topicDefault: new Map() });
    expect(() => resolveQuestionSet(i)).toThrowError(/MISSING_TOPIC_DEFAULT/);
  });
});

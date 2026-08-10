import { describe, expect, it } from "vitest";
import type { SupportQuestionGraphDto } from "@commerce-os/contracts";
import { entryQuestion, isTerminalResult, nextStep, questionByKey } from "../lib/support/flow";

/**
 * TODO-177 (ADR-289) Faz D — Vitrin guided wizard'ın client-side graf gezinme mantığı,
 * gateway question-engine `nextStep`'in SADIK AYNASIDIR (backend re-validate eder; client
 * yalnız UX akışını sürdürür). Transitionlar sortOrder sırasıyla değerlendirilir, ilk
 * eşleşen kazanır. Published graf dead-end içermez; yine de defensive fail-safe = ESCALATE
 * (destek CTA'sı asla kapanmaz).
 */

const GRAPH: SupportQuestionGraphDto = {
  questionSetId: "qs-1",
  questionSetVersionId: "qsv-1",
  version: 1,
  entryQuestionKey: "q_type",
  questions: [
    {
      key: "q_type",
      type: "SINGLE_SELECT",
      prompt: "Sorun nedir?",
      helpText: null,
      sortOrder: 0,
      required: true,
      isEntry: true,
      options: [
        { key: "opt_broken", label: "Çalışmıyor", sortOrder: 0 },
        { key: "opt_damaged", label: "Hasarlı", sortOrder: 1 },
        { key: "opt_other", label: "Diğer", sortOrder: 2 },
      ],
    },
    {
      key: "q_tried",
      type: "BOOLEAN",
      prompt: "Yeniden başlatmayı denediniz mi?",
      helpText: null,
      sortOrder: 1,
      required: true,
      isEntry: false,
      options: [],
    },
    {
      key: "r_solution",
      type: "SELF_SERVICE_RESULT",
      prompt: "Şu adımları deneyin…",
      helpText: null,
      sortOrder: 2,
      required: false,
      isEntry: false,
      options: [],
    },
    {
      key: "r_generic",
      type: "SELF_SERVICE_RESULT",
      prompt: "Genel öneri",
      helpText: null,
      sortOrder: 3,
      required: false,
      isEntry: false,
      options: [],
    },
  ],
  transitions: [
    { fromKey: "q_type", matchKind: "OPTION", matchOptionKey: "opt_broken", action: "GO_TO_QUESTION", toKey: "q_tried", sortOrder: 0 },
    { fromKey: "q_type", matchKind: "OPTION", matchOptionKey: "opt_damaged", action: "ESCALATE", toKey: null, sortOrder: 1 },
    { fromKey: "q_type", matchKind: "DEFAULT", matchOptionKey: null, action: "GO_TO_RESULT", toKey: "r_generic", sortOrder: 2 },
    { fromKey: "q_tried", matchKind: "BOOLEAN_TRUE", matchOptionKey: null, action: "GO_TO_RESULT", toKey: "r_solution", sortOrder: 0 },
    { fromKey: "q_tried", matchKind: "BOOLEAN_FALSE", matchOptionKey: null, action: "ESCALATE", toKey: null, sortOrder: 1 },
  ],
};

describe("entryQuestion / questionByKey", () => {
  it("entryQuestionKey'e karşılık gelen soruyu döner", () => {
    expect(entryQuestion(GRAPH)?.key).toBe("q_type");
  });
  it("questionByKey verilen anahtarı bulur, yoksa undefined", () => {
    expect(questionByKey(GRAPH, "q_tried")?.type).toBe("BOOLEAN");
    expect(questionByKey(GRAPH, "yok")).toBeUndefined();
  });
});

describe("isTerminalResult", () => {
  it("SELF_SERVICE_RESULT terminaldir, diğerleri değil", () => {
    expect(isTerminalResult(questionByKey(GRAPH, "r_solution")!)).toBe(true);
    expect(isTerminalResult(questionByKey(GRAPH, "q_type")!)).toBe(false);
    expect(isTerminalResult(questionByKey(GRAPH, "q_tried")!)).toBe(false);
  });
});

describe("nextStep", () => {
  it("OPTION eşleşmesi → GO_TO_QUESTION", () => {
    expect(nextStep(GRAPH, "q_type", { optionKeys: ["opt_broken"] })).toEqual({ kind: "QUESTION", key: "q_tried" });
  });
  it("OPTION eşleşmesi → ESCALATE", () => {
    expect(nextStep(GRAPH, "q_type", { optionKeys: ["opt_damaged"] })).toEqual({ kind: "ESCALATE" });
  });
  it("hiçbir OPTION eşleşmezse DEFAULT → GO_TO_RESULT", () => {
    expect(nextStep(GRAPH, "q_type", { optionKeys: ["opt_other"] })).toEqual({ kind: "RESULT", key: "r_generic" });
  });
  it("BOOLEAN_TRUE → GO_TO_RESULT", () => {
    expect(nextStep(GRAPH, "q_tried", { boolean: true })).toEqual({ kind: "RESULT", key: "r_solution" });
  });
  it("BOOLEAN_FALSE → ESCALATE", () => {
    expect(nextStep(GRAPH, "q_tried", { boolean: false })).toEqual({ kind: "ESCALATE" });
  });
  it("first-match-wins: düşük sortOrder kazanır", () => {
    // opt_broken hem sortOrder 0 (QUESTION) — daha yüksek bir DEFAULT'tan önce gelir
    expect(nextStep(GRAPH, "q_type", { optionKeys: ["opt_broken"] })).toEqual({ kind: "QUESTION", key: "q_tried" });
  });
  it("fail-safe: eşleşen transition yoksa ESCALATE (dead-end güvenliği)", () => {
    expect(nextStep(GRAPH, "r_solution", {})).toEqual({ kind: "ESCALATE" });
    expect(nextStep(GRAPH, "q_tried", {})).toEqual({ kind: "ESCALATE" });
  });
});

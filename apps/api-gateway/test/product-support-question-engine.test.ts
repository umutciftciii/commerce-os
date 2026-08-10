import { describe, it, expect } from "vitest";
import {
  validateQuestionGraph,
  nextStep,
  type QuestionGraph,
  type EngineQuestion,
  type EngineTransition,
} from "../src/product-support/question-engine";

// --- tiny builders -----------------------------------------------------------
function q(
  key: string,
  type: EngineQuestion["type"],
  opts: Partial<EngineQuestion> = {},
): EngineQuestion {
  return { key, type, isEntry: false, optionKeys: [], ...opts };
}
function t(
  fromKey: string,
  matchKind: EngineTransition["matchKind"],
  action: EngineTransition["action"],
  extra: Partial<EngineTransition> = {},
): EngineTransition {
  return { fromKey, matchKind, matchOptionKey: null, action, toKey: null, sortOrder: 0, ...extra };
}

// A canonical VALID graph:
//   entry(SINGLE_SELECT: broken|other)
//     broken -> result(RESULT node) [self-service]
//     other  -> ESCALATE
function validGraph(): QuestionGraph {
  return {
    questions: [
      q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["broken", "other"] }),
      q("result", "SELF_SERVICE_RESULT"),
    ],
    transitions: [
      t("entry", "OPTION", "GO_TO_RESULT", { matchOptionKey: "broken", toKey: "result", sortOrder: 0 }),
      t("entry", "DEFAULT", "ESCALATE", { sortOrder: 1 }),
    ],
  };
}

describe("question graph validation (ADR-289 §5)", () => {
  it("accepts a valid graph", () => {
    expect(validateQuestionGraph(validGraph())).toEqual({ ok: true });
  });

  it("rejects when there is no entry question", () => {
    const g = validGraph();
    g.questions[0].isEntry = false;
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("NO_ENTRY");
  });

  it("rejects multiple entry questions", () => {
    const g = validGraph();
    g.questions[1] = q("result", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a"] });
    g.transitions.push(t("result", "DEFAULT", "ESCALATE", { sortOrder: 0 }));
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("MULTIPLE_ENTRY");
  });

  it("rejects duplicate question keys", () => {
    const g = validGraph();
    g.questions.push(q("entry", "SELF_SERVICE_RESULT"));
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("DUPLICATE_KEY");
  });

  it("rejects a SINGLE_SELECT with an uncovered option and no DEFAULT", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a", "b"] }),
        q("r", "SELF_SERVICE_RESULT"),
      ],
      transitions: [
        t("entry", "OPTION", "GO_TO_RESULT", { matchOptionKey: "a", toKey: "r", sortOrder: 0 }),
        // "b" uncovered, no DEFAULT
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("UNCOVERED_OPTION");
  });

  it("rejects a BOOLEAN missing the false branch and no DEFAULT", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "BOOLEAN", { isEntry: true }),
        q("r", "SELF_SERVICE_RESULT"),
      ],
      transitions: [
        t("entry", "BOOLEAN_TRUE", "GO_TO_RESULT", { toKey: "r", sortOrder: 0 }),
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("UNCOVERED_OPTION");
  });

  it("rejects a cycle", () => {
    const g: QuestionGraph = {
      questions: [
        q("a", "SINGLE_SELECT", { isEntry: true, optionKeys: ["x"] }),
        q("b", "SINGLE_SELECT", { optionKeys: ["x"] }),
      ],
      transitions: [
        t("a", "DEFAULT", "GO_TO_QUESTION", { toKey: "b", sortOrder: 0 }),
        t("b", "DEFAULT", "GO_TO_QUESTION", { toKey: "a", sortOrder: 0 }), // cycle
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("CYCLE");
  });

  it("rejects a non-terminal question with no outgoing transition (dead-end)", () => {
    const g: QuestionGraph = {
      questions: [q("entry", "SHORT_TEXT", { isEntry: true })],
      transitions: [],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("DEAD_END");
  });

  it("rejects an unreachable question", () => {
    const g = validGraph();
    g.questions.push(q("orphan", "SELF_SERVICE_RESULT"));
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("UNREACHABLE");
  });

  it("rejects a transition to a missing target", () => {
    const g = validGraph();
    g.transitions[0].toKey = "does-not-exist";
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("BAD_TARGET");
  });

  it("rejects GO_TO_RESULT pointing at a non-result node", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a"] }),
        q("mid", "SHORT_TEXT"),
      ],
      transitions: [
        t("entry", "DEFAULT", "GO_TO_RESULT", { toKey: "mid", sortOrder: 0 }), // mid is not a RESULT
        t("mid", "DEFAULT", "ESCALATE", { sortOrder: 0 }),
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("BAD_TARGET");
  });

  it("rejects an OPTION transition referencing an unknown option key", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a"] }),
        q("r", "SELF_SERVICE_RESULT"),
      ],
      transitions: [
        t("entry", "OPTION", "GO_TO_RESULT", { matchOptionKey: "ghost", toKey: "r", sortOrder: 0 }),
        t("entry", "DEFAULT", "ESCALATE", { sortOrder: 1 }),
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("BAD_TARGET");
  });

  it("rejects a graph with no reachable escalation path", () => {
    // entry -> result, but result offers no escalate AND there is no ESCALATE edge... however a
    // SELF_SERVICE_RESULT inherently offers escalate, so to trigger NO_ESCALATION_PATH we make the
    // only terminal an INFO loop-free dead structure is impossible; use a graph whose sole terminal
    // is unreachable-escalate. Simplest: entry is INFO with DEFAULT to itself is a cycle; instead
    // craft entry(INFO)->result where result is INFO (never terminal, never escalate).
    const g: QuestionGraph = {
      questions: [
        q("entry", "INFO", { isEntry: true }),
        q("info2", "INFO"),
      ],
      transitions: [
        t("entry", "DEFAULT", "GO_TO_QUESTION", { toKey: "info2", sortOrder: 0 }),
        // info2 has no outgoing -> DEAD_END, and no escalation anywhere
      ],
    };
    const r = validateQuestionGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.errors.map((e) => e.code);
      expect(codes).toContain("NO_ESCALATION_PATH");
    }
  });
});

describe("question graph traversal (deterministic, first-match-by-sortOrder)", () => {
  it("follows the matching OPTION transition", () => {
    expect(nextStep(validGraph(), "entry", { optionKeys: ["broken"] })).toEqual({
      kind: "RESULT",
      key: "result",
    });
  });

  it("falls through to DEFAULT when no OPTION matches", () => {
    expect(nextStep(validGraph(), "entry", { optionKeys: ["other"] })).toEqual({
      kind: "ESCALATE",
    });
  });

  it("evaluates transitions in sortOrder (first match wins)", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a"] }),
        q("r1", "SELF_SERVICE_RESULT"),
        q("r2", "SELF_SERVICE_RESULT"),
      ],
      transitions: [
        t("entry", "OPTION", "GO_TO_RESULT", { matchOptionKey: "a", toKey: "r1", sortOrder: 0 }),
        t("entry", "DEFAULT", "GO_TO_RESULT", { toKey: "r2", sortOrder: 1 }),
      ],
    };
    expect(nextStep(g, "entry", { optionKeys: ["a"] })).toEqual({ kind: "RESULT", key: "r1" });
  });

  it("handles BOOLEAN_TRUE / BOOLEAN_FALSE", () => {
    const g: QuestionGraph = {
      questions: [
        q("entry", "BOOLEAN", { isEntry: true }),
        q("r", "SELF_SERVICE_RESULT"),
      ],
      transitions: [
        t("entry", "BOOLEAN_TRUE", "GO_TO_RESULT", { toKey: "r", sortOrder: 0 }),
        t("entry", "BOOLEAN_FALSE", "ESCALATE", { sortOrder: 1 }),
      ],
    };
    expect(nextStep(g, "entry", { boolean: true })).toEqual({ kind: "RESULT", key: "r" });
    expect(nextStep(g, "entry", { boolean: false })).toEqual({ kind: "ESCALATE" });
  });

  it("returns ESCALATE as the safe fallback when nothing matches (never dead-ends)", () => {
    const g: QuestionGraph = {
      questions: [q("entry", "SINGLE_SELECT", { isEntry: true, optionKeys: ["a"] })],
      transitions: [
        t("entry", "OPTION", "GO_TO_QUESTION", { matchOptionKey: "a", toKey: "entry", sortOrder: 0 }),
      ],
    };
    expect(nextStep(g, "entry", { optionKeys: ["nomatch"] })).toEqual({ kind: "ESCALATE" });
  });
});

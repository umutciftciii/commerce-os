import { describe, expect, it } from "vitest";
import {
  toDraft,
  toPayload,
  answerKeysFor,
  nextKey,
  type DraftQuestion,
} from "../components/question-sets/graph-model";
import type { PlatformSupportVersionDto } from "@commerce-os/api-client";

function q(over: Partial<DraftQuestion> & Pick<DraftQuestion, "key" | "type">): DraftQuestion {
  return { prompt: "", helpText: "", required: true, isEntry: false, options: [], ...over };
}

describe("question-set graph-model (branch → transition conversion)", () => {
  it("nextKey skips taken keys", () => {
    expect(nextKey("q", new Set(["q1", "q2"]))).toBe("q3");
    expect(nextKey("o", new Set())).toBe("o1");
  });

  it("answerKeysFor enumerates options + default for SINGLE_SELECT", () => {
    const question = q({ key: "e", type: "SINGLE_SELECT", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] });
    expect(answerKeysFor(question)).toEqual(["a", "b", "__default__"]);
  });
  it("answerKeysFor yields true/false for BOOLEAN and default for text", () => {
    expect(answerKeysFor(q({ key: "b", type: "BOOLEAN" }))).toEqual(["__true__", "__false__"]);
    expect(answerKeysFor(q({ key: "t", type: "SHORT_TEXT" }))).toEqual(["__default__"]);
  });

  it("derives GO_TO_RESULT when the target is a SELF_SERVICE_RESULT, GO_TO_QUESTION otherwise, ESCALATE for the sentinel", () => {
    const questions: DraftQuestion[] = [
      q({ key: "entry", type: "SINGLE_SELECT", isEntry: true, options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] }),
      q({ key: "mid", type: "SHORT_TEXT" }),
      q({ key: "res", type: "SELF_SERVICE_RESULT" }),
    ];
    const branches = {
      "entry::a": "res", // → result
      "entry::b": "mid", // → question
      "entry::__default__": "__escalate__", // → escalate
      "mid::__default__": "__escalate__",
    };
    const payload = toPayload(questions, branches);
    const byFromAnswer = (fromKey: string, matchOptionKey: string | null, matchKind: string) =>
      payload.transitions.find((t) => t.fromKey === fromKey && t.matchOptionKey === matchOptionKey && t.matchKind === matchKind);

    expect(byFromAnswer("entry", "a", "OPTION")!.action).toBe("GO_TO_RESULT");
    expect(byFromAnswer("entry", "a", "OPTION")!.toKey).toBe("res");
    expect(byFromAnswer("entry", "b", "OPTION")!.action).toBe("GO_TO_QUESTION");
    expect(byFromAnswer("entry", null, "DEFAULT")!.action).toBe("ESCALATE");
    expect(byFromAnswer("entry", null, "DEFAULT")!.toKey).toBeNull();
    // terminal node produces no outgoing transitions
    expect(payload.transitions.some((t) => t.fromKey === "res")).toBe(false);
    // options carry sortOrder; sortOrder mirrors array order
    expect(payload.questions[0].sortOrder).toBe(0);
    expect(payload.questions[0].options.map((o) => o.key)).toEqual(["a", "b"]);
  });

  it("round-trips a DB version graph through toDraft → toPayload", () => {
    const version: PlatformSupportVersionDto = {
      id: "v1",
      version: 1,
      status: "DRAFT",
      publishedAt: null,
      questions: [
        { key: "entry", type: "SINGLE_SELECT", prompt: "?", helpText: null, sortOrder: 0, required: true, isEntry: true, options: [{ key: "self", label: "Self", sortOrder: 0 }] },
        { key: "res", type: "SELF_SERVICE_RESULT", prompt: "Do X", helpText: null, sortOrder: 1, required: false, isEntry: false, options: [] },
      ],
      transitions: [
        { fromKey: "entry", matchKind: "OPTION", matchOptionKey: "self", action: "GO_TO_RESULT", toKey: "res", sortOrder: 0 },
        { fromKey: "entry", matchKind: "DEFAULT", matchOptionKey: null, action: "ESCALATE", toKey: null, sortOrder: 1 },
      ],
    };
    const draft = toDraft(version);
    expect(draft.questions.map((x) => x.key)).toEqual(["entry", "res"]);
    expect(draft.branches["entry::self"]).toBe("res");
    expect(draft.branches["entry::__default__"]).toBe("__escalate__");

    const payload = toPayload(draft.questions, draft.branches);
    const t = payload.transitions.find((x) => x.matchKind === "OPTION");
    expect(t?.action).toBe("GO_TO_RESULT");
    expect(payload.transitions.find((x) => x.matchKind === "DEFAULT")?.action).toBe("ESCALATE");
  });

  it("omits branches with no target and drops options for non-option question types", () => {
    const questions: DraftQuestion[] = [q({ key: "e", type: "SHORT_TEXT", isEntry: true, options: [{ key: "x", label: "X" }] })];
    const payload = toPayload(questions, {}); // no branch set
    expect(payload.transitions).toHaveLength(0);
    expect(payload.questions[0].options).toEqual([]); // SHORT_TEXT drops options
  });
});

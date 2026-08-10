import { describe, expect, it } from "vitest";
import {
  topicLabel,
  questionTypeLabel,
  versionStatusLabel,
  setStatusLabel,
  validationErrorLabel,
  versionStatusTone,
  TOPIC_KEYS,
  QUESTION_TYPE_KEYS,
} from "../components/question-sets/labels";

describe("question-set labels (no raw enum leak; human-readable)", () => {
  it("maps every topic to a non-raw tr + en label", () => {
    for (const k of TOPIC_KEYS) {
      const tr = topicLabel(k, "tr");
      const en = topicLabel(k, "en");
      expect(tr).not.toBe(k); // never the raw SCREAMING_SNAKE code
      expect(en).not.toBe(k);
      expect(tr).not.toMatch(/_/);
    }
  });

  it("maps every question type to a friendly label", () => {
    for (const k of QUESTION_TYPE_KEYS) {
      expect(questionTypeLabel(k, "tr")).not.toMatch(/_/);
      expect(questionTypeLabel(k, "en")).not.toBe(k);
    }
    expect(questionTypeLabel("SELF_SERVICE_RESULT", "tr")).toBe("Çözüm sayfası");
    expect(questionTypeLabel("BOOLEAN", "en")).toBe("Yes / No");
  });

  it("renders version + set status human-readably", () => {
    expect(versionStatusLabel("PUBLISHED", "tr")).toBe("Yayında");
    expect(versionStatusLabel("DRAFT", "en")).toBe("Draft");
    expect(setStatusLabel("ACTIVE", "tr")).toBe("Aktif");
    expect(versionStatusTone("PUBLISHED")).toBe("success");
    expect(versionStatusTone("ARCHIVED")).toBe("neutral");
  });

  it("renders each validation error code as a human sentence (not the raw code)", () => {
    for (const code of [
      "NO_ENTRY",
      "MULTIPLE_ENTRY",
      "CYCLE",
      "DEAD_END",
      "UNCOVERED_OPTION",
      "UNREACHABLE",
      "NO_ESCALATION_PATH",
      "BAD_TARGET",
    ]) {
      const tr = validationErrorLabel(code, "tr");
      expect(tr).not.toBe(code);
      expect(tr.length).toBeGreaterThan(8);
    }
  });

  it("humanize fallback never leaks a raw SNAKE_CASE code for unknown values", () => {
    expect(topicLabel("SOME_FUTURE_TOPIC", "tr")).toBe("Some Future Topic");
    expect(validationErrorLabel("BRAND_NEW_CODE", "en")).toBe("Brand New Code");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  validateQuestionGraph,
  type QuestionGraph,
  type EngineQuestion,
} from "../src/product-support/question-engine";

// Read the shared seed data (single source of truth; also consumed by the packages/db seed).
const SEED_PATH = fileURLToPath(
  new URL("../../../packages/db/prisma/support-default-question-sets.json", import.meta.url),
);

interface SeedOption {
  key: string;
  label: string;
  sortOrder: number;
}
interface SeedQuestion {
  key: string;
  type: EngineQuestion["type"];
  prompt: string;
  sortOrder: number;
  required: boolean;
  isEntry: boolean;
  options: SeedOption[];
}
interface SeedSet {
  key: string;
  topic: string;
  title: string;
  questions: SeedQuestion[];
  transitions: QuestionGraph["transitions"];
}

const data = JSON.parse(readFileSync(SEED_PATH, "utf8")) as { sets: SeedSet[] };

function toGraph(set: SeedSet): QuestionGraph {
  return {
    questions: set.questions.map((q) => ({
      key: q.key,
      type: q.type,
      isEntry: q.isEntry,
      optionKeys: q.options.map((o) => o.key),
    })),
    transitions: set.transitions,
  };
}

const TOPICS = [
  "PRODUCT_NOT_WORKING",
  "DAMAGED_OR_MISSING",
  "SETUP_USAGE",
  "WARRANTY_SERVICE",
  "PRODUCT_INFO",
  "INVOICE_DOCUMENT",
  "OTHER",
];

describe("seed default question graphs (ADR-289: no dead-end, escalation always possible)", () => {
  it("covers exactly the seven topics with unique keys", () => {
    expect(data.sets).toHaveLength(7);
    expect([...new Set(data.sets.map((s) => s.topic))].sort()).toEqual([...TOPICS].sort());
    expect(new Set(data.sets.map((s) => s.key)).size).toBe(7);
  });

  it.each(data.sets.map((s) => [s.key, s] as const))(
    "%s is a valid graph (validateQuestionGraph ok)",
    (_key, set) => {
      const result = validateQuestionGraph(toGraph(set));
      // surface the concrete errors if it fails
      expect(result.ok ? [] : result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  it.each(data.sets.map((s) => [s.key, s] as const))(
    "%s has at least one SELF_SERVICE_RESULT node",
    (_key, set) => {
      expect(set.questions.some((q) => q.type === "SELF_SERVICE_RESULT")).toBe(true);
    },
  );

  it.each(data.sets.map((s) => [s.key, s] as const))(
    "%s has exactly one entry question",
    (_key, set) => {
      expect(set.questions.filter((q) => q.isEntry)).toHaveLength(1);
    },
  );
});

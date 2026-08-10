// TODO-177 (ADR-289) — Soru seti editörü SAF graf modeli (React'sız, test edilebilir).
// Local draft ↔ contract payload dönüşümü; branch → transition (hedef tipinden action türetilir).

import type { PlatformSupportVersionDto, SupportQuestionDto } from "@commerce-os/api-client";

export type QuestionType = SupportQuestionDto["type"];

export interface DraftOption {
  key: string;
  label: string;
}
export interface DraftQuestion {
  key: string;
  type: QuestionType;
  prompt: string;
  helpText: string;
  required: boolean;
  isEntry: boolean;
  options: DraftOption[];
}

export const ESCALATE = "__escalate__";
export const DEFAULT_ANSWER = "__default__";
export const TRUE_ANSWER = "__true__";
export const FALSE_ANSWER = "__false__";

export const TERMINAL = (t: string): boolean => t === "SELF_SERVICE_RESULT";
export const HAS_OPTIONS = (t: string): boolean => t === "SINGLE_SELECT" || t === "MULTI_SELECT";

export function nextKey(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function answerKeysFor(q: DraftQuestion): string[] {
  if (q.type === "SINGLE_SELECT") return [...q.options.map((o) => o.key), DEFAULT_ANSWER];
  if (q.type === "BOOLEAN") return [TRUE_ANSWER, FALSE_ANSWER];
  return [DEFAULT_ANSWER];
}

/** DB sürüm grafiği → local draft (questions + branch map). */
export function toDraft(version: PlatformSupportVersionDto): {
  questions: DraftQuestion[];
  branches: Record<string, string>;
} {
  const questions: DraftQuestion[] = version.questions
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => ({
      key: q.key,
      type: q.type,
      prompt: q.prompt,
      helpText: q.helpText ?? "",
      required: q.required,
      isEntry: q.isEntry,
      options: q.options.map((o) => ({ key: o.key, label: o.label })),
    }));
  const branches: Record<string, string> = {};
  for (const t of version.transitions) {
    const answerKey =
      t.matchKind === "OPTION"
        ? (t.matchOptionKey ?? DEFAULT_ANSWER)
        : t.matchKind === "BOOLEAN_TRUE"
          ? TRUE_ANSWER
          : t.matchKind === "BOOLEAN_FALSE"
            ? FALSE_ANSWER
            : DEFAULT_ANSWER;
    branches[`${t.fromKey}::${answerKey}`] = t.action === "ESCALATE" ? ESCALATE : (t.toKey ?? "");
  }
  return { questions, branches };
}

export interface GraphPayload {
  questions: Array<{
    key: string;
    type: QuestionType;
    prompt: string;
    helpText: string | null;
    sortOrder: number;
    required: boolean;
    isEntry: boolean;
    options: Array<{ key: string; label: string; sortOrder: number }>;
  }>;
  transitions: Array<{
    fromKey: string;
    matchKind: "OPTION" | "BOOLEAN_TRUE" | "BOOLEAN_FALSE" | "DEFAULT";
    matchOptionKey: string | null;
    action: "GO_TO_QUESTION" | "GO_TO_RESULT" | "ESCALATE";
    toKey: string | null;
    sortOrder: number;
  }>;
}

/** Local draft → contract payload. Hedef bir SELF_SERVICE_RESULT ise action=GO_TO_RESULT. */
export function toPayload(
  questions: DraftQuestion[],
  branches: Record<string, string>,
): GraphPayload {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const outQuestions = questions.map((q, i) => ({
    key: q.key,
    type: q.type,
    prompt: q.prompt,
    helpText: q.helpText.trim() ? q.helpText.trim() : null,
    sortOrder: i,
    required: q.required,
    isEntry: q.isEntry,
    options: HAS_OPTIONS(q.type)
      ? q.options.map((o, oi) => ({ key: o.key, label: o.label, sortOrder: oi }))
      : [],
  }));
  const transitions: GraphPayload["transitions"] = [];
  for (const q of questions) {
    if (TERMINAL(q.type)) continue;
    answerKeysFor(q).forEach((answerKey, idx) => {
      const target = branches[`${q.key}::${answerKey}`];
      if (!target) return;
      const matchKind =
        answerKey === DEFAULT_ANSWER
          ? "DEFAULT"
          : answerKey === TRUE_ANSWER
            ? "BOOLEAN_TRUE"
            : answerKey === FALSE_ANSWER
              ? "BOOLEAN_FALSE"
              : "OPTION";
      const matchOptionKey = matchKind === "OPTION" ? answerKey : null;
      if (target === ESCALATE) {
        transitions.push({ fromKey: q.key, matchKind, matchOptionKey, action: "ESCALATE", toKey: null, sortOrder: idx });
      } else {
        const targetQ = byKey.get(target);
        const action = targetQ && TERMINAL(targetQ.type) ? "GO_TO_RESULT" : "GO_TO_QUESTION";
        transitions.push({ fromKey: q.key, matchKind, matchOptionKey, action, toKey: target, sortOrder: idx });
      }
    });
  }
  return { questions: outQuestions, transitions };
}

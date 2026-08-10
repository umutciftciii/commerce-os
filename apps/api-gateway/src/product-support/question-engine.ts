/**
 * ADR-289 (TODO-177) §5 — Deterministik guided soru motoru (SAF modul).
 *
 * İki sorumluluk:
 *   1) `validateQuestionGraph` — publish-time graf dogrulamasi (cycle/dead-end/uncovered/unreachable/
 *      bad-target/no-escalation). PUBLISHED yalniz `{ ok: true }` grafla mumkundur.
 *   2) `nextStep` — runtime traversal: cevaba gore sonraki soru / self-service result / escalate.
 *      Transition'lar `sortOrder`'da degerlendirilir, ILK ESLESEN kazanir. Hicbir sey eslesmezse
 *      ESCALATE (guvenli fallback — ASLA dead-end degil). Expression engine / script YOK.
 *
 * Enum tipleri `@prisma/client`'tan type-only (runtime'da erased) → modul saf/test-edilebilir kalir.
 * Terminal dugum = SELF_SERVICE_RESULT (kullaniciya cozum sunar; "cozulmedi" UI aksiyonu escalate eder).
 * INFO terminal DEGILDIR (bir DEFAULT ileri-yol gerektirir).
 */

import type {
  SupportQuestionType,
  SupportTransitionMatchKind,
  SupportTransitionAction,
} from "@prisma/client";

export interface EngineQuestion {
  key: string;
  type: SupportQuestionType;
  isEntry: boolean;
  /** SINGLE_SELECT/MULTI_SELECT icin gecerli option key'leri (digerlerinde bos). */
  optionKeys: string[];
}

export interface EngineTransition {
  fromKey: string;
  matchKind: SupportTransitionMatchKind;
  matchOptionKey: string | null;
  action: SupportTransitionAction;
  toKey: string | null;
  sortOrder: number;
}

export interface QuestionGraph {
  questions: EngineQuestion[];
  transitions: EngineTransition[];
}

export type GraphErrorCode =
  | "NO_ENTRY"
  | "MULTIPLE_ENTRY"
  | "DUPLICATE_KEY"
  | "CYCLE"
  | "DEAD_END"
  | "UNCOVERED_OPTION"
  | "UNREACHABLE"
  | "NO_ESCALATION_PATH"
  | "BAD_TARGET";

export type GraphValidation =
  | { ok: true }
  | { ok: false; errors: Array<{ code: GraphErrorCode; detail: string }> };

export type NextStep =
  | { kind: "QUESTION"; key: string }
  | { kind: "RESULT"; key: string }
  | { kind: "ESCALATE" };

const isTerminal = (q: EngineQuestion): boolean => q.type === "SELF_SERVICE_RESULT";

export function validateQuestionGraph(graph: QuestionGraph): GraphValidation {
  const errors: Array<{ code: GraphErrorCode; detail: string }> = [];
  const { questions, transitions } = graph;

  // 1) unique keys
  const byKey = new Map<string, EngineQuestion>();
  for (const q of questions) {
    if (byKey.has(q.key)) errors.push({ code: "DUPLICATE_KEY", detail: q.key });
    byKey.set(q.key, q);
  }

  // 2) exactly one entry
  const entries = questions.filter((q) => q.isEntry);
  if (entries.length === 0) errors.push({ code: "NO_ENTRY", detail: "no isEntry question" });
  if (entries.length > 1)
    errors.push({ code: "MULTIPLE_ENTRY", detail: entries.map((e) => e.key).join(",") });

  // group transitions by fromKey (sortOrder ascending)
  const outByFrom = new Map<string, EngineTransition[]>();
  for (const tr of transitions) {
    const list = outByFrom.get(tr.fromKey) ?? [];
    list.push(tr);
    outByFrom.set(tr.fromKey, list);
  }
  for (const list of outByFrom.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  // 3) per-question target + coverage validation
  for (const q of questions) {
    const outs = outByFrom.get(q.key) ?? [];
    for (const tr of outs) {
      if (tr.matchKind === "OPTION") {
        if (tr.matchOptionKey == null || !q.optionKeys.includes(tr.matchOptionKey))
          errors.push({
            code: "BAD_TARGET",
            detail: `${q.key} OPTION -> unknown option ${tr.matchOptionKey ?? "null"}`,
          });
      }
      if (tr.action === "GO_TO_QUESTION") {
        if (!tr.toKey || !byKey.has(tr.toKey))
          errors.push({ code: "BAD_TARGET", detail: `${q.key} GO_TO_QUESTION -> ${tr.toKey ?? "null"}` });
      } else if (tr.action === "GO_TO_RESULT") {
        const target = tr.toKey ? byKey.get(tr.toKey) : undefined;
        if (!target || !isTerminal(target))
          errors.push({ code: "BAD_TARGET", detail: `${q.key} GO_TO_RESULT -> ${tr.toKey ?? "null"}` });
      }
    }

    if (isTerminal(q)) continue; // terminal: no outgoing required

    if (outs.length === 0) {
      errors.push({ code: "DEAD_END", detail: q.key });
      continue;
    }
    const hasDefault = outs.some((tr) => tr.matchKind === "DEFAULT");
    if (q.type === "SINGLE_SELECT") {
      if (!hasDefault) {
        for (const ok of q.optionKeys) {
          const covered = outs.some((tr) => tr.matchKind === "OPTION" && tr.matchOptionKey === ok);
          if (!covered) errors.push({ code: "UNCOVERED_OPTION", detail: `${q.key}:${ok}` });
        }
      }
    } else if (q.type === "BOOLEAN") {
      if (!hasDefault) {
        if (!outs.some((tr) => tr.matchKind === "BOOLEAN_TRUE"))
          errors.push({ code: "UNCOVERED_OPTION", detail: `${q.key}:true` });
        if (!outs.some((tr) => tr.matchKind === "BOOLEAN_FALSE"))
          errors.push({ code: "UNCOVERED_OPTION", detail: `${q.key}:false` });
      }
    } else {
      // MULTI_SELECT / SHORT_TEXT / LONG_TEXT / INFO — deterministik tek DEFAULT yol zorunlu.
      if (!hasDefault) errors.push({ code: "UNCOVERED_OPTION", detail: `${q.key}:DEFAULT-required` });
    }
  }

  // 4) reachability + cycle (DFS from entry) + escalation-reachable
  if (entries.length === 1) {
    const color = new Map<string, 1 | 2>(); // 1 gray(on-path), 2 black(done)
    const reachable = new Set<string>();
    let cycle = false;
    let hasEscalation = false;

    const dfs = (key: string): void => {
      const node = byKey.get(key);
      if (!node) return;
      reachable.add(key);
      if (isTerminal(node)) {
        // SELF_SERVICE_RESULT inherently offers an escalate UI action → ticket always possible.
        hasEscalation = true;
        color.set(key, 2);
        return;
      }
      color.set(key, 1);
      for (const tr of outByFrom.get(key) ?? []) {
        if (tr.action === "ESCALATE") {
          hasEscalation = true;
          continue;
        }
        if (tr.action === "GO_TO_RESULT") {
          if (tr.toKey && byKey.has(tr.toKey)) {
            reachable.add(tr.toKey);
            hasEscalation = true;
          }
          continue;
        }
        // GO_TO_QUESTION
        if (!tr.toKey || !byKey.has(tr.toKey)) continue; // BAD_TARGET already recorded
        const c = color.get(tr.toKey);
        if (c === 1) cycle = true;
        else if (c === undefined) dfs(tr.toKey);
        // c === 2 (black): fully explored, skip
      }
      color.set(key, 2);
    };
    dfs(entries[0].key);

    if (cycle) errors.push({ code: "CYCLE", detail: "path revisits a question" });
    for (const q of questions) {
      if (!reachable.has(q.key)) errors.push({ code: "UNREACHABLE", detail: q.key });
    }
    if (!hasEscalation)
      errors.push({ code: "NO_ESCALATION_PATH", detail: "no self-service result or escalate reachable" });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Runtime traversal. `sortOrder`'da ilk eslesen transition kazanir. Eslesme yoksa ESCALATE
 * (guvenli fallback — valid grafta DEFAULT hep vardir; bu yalniz savunma amaclidir, ASLA dead-end).
 */
export function nextStep(
  graph: QuestionGraph,
  fromKey: string,
  answer: { optionKeys?: string[]; boolean?: boolean },
): NextStep {
  const outs = graph.transitions
    .filter((tr) => tr.fromKey === fromKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const tr of outs) {
    let match = false;
    switch (tr.matchKind) {
      case "DEFAULT":
        match = true;
        break;
      case "OPTION":
        match =
          !!answer.optionKeys &&
          tr.matchOptionKey != null &&
          answer.optionKeys.includes(tr.matchOptionKey);
        break;
      case "BOOLEAN_TRUE":
        match = answer.boolean === true;
        break;
      case "BOOLEAN_FALSE":
        match = answer.boolean === false;
        break;
    }
    if (match) {
      if (tr.action === "GO_TO_QUESTION" && tr.toKey) return { kind: "QUESTION", key: tr.toKey };
      if (tr.action === "GO_TO_RESULT" && tr.toKey) return { kind: "RESULT", key: tr.toKey };
      return { kind: "ESCALATE" };
    }
  }
  return { kind: "ESCALATE" };
}

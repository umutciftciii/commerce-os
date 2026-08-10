/**
 * TODO-177 (ADR-289) Faz D — Vitrin guided wizard graf gezinme mantığı (saf, istemci-güvenli).
 *
 * Gateway `product-support/question-engine.ts` `nextStep`'inin SADIK AYNASIDIR: yalnız UX
 * akışını sürdürür (bir sonraki soruyu/sonucu belirler). Otorite SUNUCUDADIR — ticket
 * oluşturulurken gateway question graph'ı + published versiyonu yeniden doğrular. Bu modül
 * hiçbir I/O yapmaz; yalnız `resolve` yanıtındaki grafı gezer.
 *
 * Kural: bir sorunun transitionları `sortOrder` sırasıyla değerlendirilir, İLK eşleşen
 * kazanır. Published graf dead-end içermez (validateQuestionGraph publish'te engeller);
 * yine de defensive fail-safe = ESCALATE — böylece destek CTA'sı asla dead-end'de kapanmaz.
 */
import type { SupportQuestionGraphDto } from "@commerce-os/contracts";

export type SupportQuestion = SupportQuestionGraphDto["questions"][number];
type SupportTransition = SupportQuestionGraphDto["transitions"][number];

/** Cevabın gezinmeyi ilgilendiren kısmı (text içeriği transition eşleşmesini etkilemez). */
export type FlowAnswerValue = { optionKeys?: string[]; boolean?: boolean; text?: string };

export type FlowStep =
  | { kind: "QUESTION"; key: string }
  | { kind: "RESULT"; key: string }
  | { kind: "ESCALATE" };

/** Giriş sorusu (entryQuestionKey). */
export function entryQuestion(graph: SupportQuestionGraphDto): SupportQuestion | null {
  return graph.questions.find((q) => q.key === graph.entryQuestionKey) ?? null;
}

/** Anahtara göre soru. */
export function questionByKey(
  graph: SupportQuestionGraphDto,
  key: string,
): SupportQuestion | undefined {
  return graph.questions.find((q) => q.key === key);
}

/** SELF_SERVICE_RESULT terminaldir → wizard "Çözüldü / Çözülmedi" ekranı gösterir. */
export function isTerminalResult(question: SupportQuestion): boolean {
  return question.type === "SELF_SERVICE_RESULT";
}

function transitionMatches(transition: SupportTransition, value: FlowAnswerValue): boolean {
  switch (transition.matchKind) {
    case "OPTION":
      return Boolean(transition.matchOptionKey && value.optionKeys?.includes(transition.matchOptionKey));
    case "BOOLEAN_TRUE":
      return value.boolean === true;
    case "BOOLEAN_FALSE":
      return value.boolean === false;
    case "DEFAULT":
      return true;
    default:
      return false;
  }
}

/**
 * `fromKey` sorusuna verilen cevaba göre bir sonraki adım. Transitionlar sortOrder
 * sırasıyla, ilk eşleşen kazanır. Eşleşme yoksa fail-safe ESCALATE.
 */
export function nextStep(
  graph: SupportQuestionGraphDto,
  fromKey: string,
  value: FlowAnswerValue,
): FlowStep {
  const transitions = graph.transitions
    .filter((t) => t.fromKey === fromKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const transition of transitions) {
    if (!transitionMatches(transition, value)) continue;
    if (transition.action === "ESCALATE") return { kind: "ESCALATE" };
    if (transition.action === "GO_TO_RESULT" && transition.toKey) {
      return { kind: "RESULT", key: transition.toKey };
    }
    if (transition.action === "GO_TO_QUESTION" && transition.toKey) {
      return { kind: "QUESTION", key: transition.toKey };
    }
  }
  return { kind: "ESCALATE" };
}

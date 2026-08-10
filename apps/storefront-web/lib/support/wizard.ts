/**
 * TODO-177 (ADR-289) Faz D — Guided wizard saf state-machine'i (istemci-güvenli, I/O yok).
 *
 * Component (`guided-wizard.tsx`) yalnız bu reducer'ı `useReducer` ile sarar; resolve/submit
 * async çağrılar dışarıda. Gezinme `flow.nextStep` (gateway question-engine aynası) ile yapılır.
 * Cevaplar `answers` map'inde KORUNUR — GERİ navigasyonu silmez; ileri gidince eski cevap
 * tekrar gösterilir. Self-service "çözüldü" ticket AÇMAZ; "çözülmedi" guided cevapları
 * koruyarak escalation'a geçer (attemptedResolution snapshot'ı ile).
 */
import type { SupportAnswerValue, SupportQuestionGraphDto, SupportTopicDto } from "@commerce-os/contracts";
import { nextStep, type FlowAnswerValue } from "./flow";

export type WizardPhase = "topic" | "question" | "result" | "escalation" | "solved";

export interface WizardState {
  phase: WizardPhase;
  topic: SupportTopicDto | null;
  graph: SupportQuestionGraphDto | null;
  /** Ziyaret edilen soru anahtarları (GERİ için stack). Son eleman = mevcut soru. */
  path: string[];
  /** questionKey → cevap. GERİ silmez (preservation). */
  answers: Record<string, FlowAnswerValue>;
  /** Ulaşılan self-service sonuç sorusu (SELF_SERVICE_RESULT). */
  resultKey: string | null;
  attemptedResolutionKey: string | null;
  attemptedResolutionText: string | null;
}

export type WizardAction =
  | { type: "SELECT_TOPIC"; topic: SupportTopicDto }
  | { type: "GRAPH_RESOLVED"; graph: SupportQuestionGraphDto }
  | { type: "ANSWER"; questionKey: string; value: FlowAnswerValue }
  | { type: "BACK" }
  | { type: "MARK_SOLVED" }
  | { type: "MARK_UNSOLVED"; resolutionText: string };

export function initialWizardState(): WizardState {
  return {
    phase: "topic",
    topic: null,
    graph: null,
    path: [],
    answers: {},
    resultKey: null,
    attemptedResolutionKey: null,
    attemptedResolutionText: null,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SELECT_TOPIC":
      return { ...state, topic: action.topic };

    case "GRAPH_RESOLVED":
      // Yeni graf (topic çözüldü) → entry sorudan taze başla; önceki cevaplar temizlenir.
      return {
        ...state,
        graph: action.graph,
        phase: "question",
        path: [action.graph.entryQuestionKey],
        answers: {},
        resultKey: null,
        attemptedResolutionKey: null,
        attemptedResolutionText: null,
      };

    case "ANSWER": {
      if (!state.graph) return state;
      const answers = { ...state.answers, [action.questionKey]: action.value };
      const step = nextStep(state.graph, action.questionKey, action.value);
      if (step.kind === "ESCALATE") {
        // Guided escalate (self-service sonucu değil) → attemptedResolution YOK.
        return { ...state, answers, phase: "escalation", resultKey: null, attemptedResolutionKey: null, attemptedResolutionText: null };
      }
      if (step.kind === "RESULT") {
        return { ...state, answers, phase: "result", resultKey: step.key };
      }
      // QUESTION — path'e ekle (aynı anahtar zaten sondaysa tekrar etme).
      const path = state.path[state.path.length - 1] === step.key ? state.path : [...state.path, step.key];
      return { ...state, answers, phase: "question", path };
    }

    case "BACK": {
      if (state.phase === "result") {
        // Sonuçtan geri → sonucu üreten (son) soruya dön.
        return { ...state, phase: "question", resultKey: null };
      }
      if (state.phase === "escalation") {
        // Escalation'a self-service sonucundan geldiysek result'a, aksi halde son soruya dön.
        if (state.resultKey) {
          return { ...state, phase: "result", attemptedResolutionKey: null, attemptedResolutionText: null };
        }
        return { ...state, phase: "question" };
      }
      if (state.phase === "question") {
        if (state.path.length <= 1) {
          // Entry sorudan geri → topic seçimine dön.
          return { ...state, phase: "topic" };
        }
        return { ...state, path: state.path.slice(0, -1) };
      }
      return state;
    }

    case "MARK_SOLVED":
      return { ...state, phase: "solved" };

    case "MARK_UNSOLVED":
      // Self-service çözmedi → guided cevaplar KORUNUR; denenen çözüm snapshot'ı taşınır.
      return {
        ...state,
        phase: "escalation",
        attemptedResolutionKey: state.resultKey,
        attemptedResolutionText: action.resolutionText,
      };

    default:
      return state;
  }
}

/**
 * Ticket create payload'ı için cevapları soru tipine göre kanonik `SupportAnswerValue`'ya
 * daraltır (SINGLE/MULTI→optionKeys, BOOLEAN→boolean, SHORT/LONG→text). INFO/SELF_SERVICE_RESULT
 * gibi cevapsız tipler ve `answers`'ta olmayan sorular dahil edilmez. graf sortOrder'ıyla sıralı.
 */
export function buildTicketAnswers(
  graph: SupportQuestionGraphDto,
  answers: Record<string, FlowAnswerValue>,
): Array<{ questionKey: string; value: SupportAnswerValue }> {
  const out: Array<{ questionKey: string; value: SupportAnswerValue }> = [];
  const ordered = [...graph.questions].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const question of ordered) {
    const raw = answers[question.key];
    if (!raw) continue;
    switch (question.type) {
      case "SINGLE_SELECT":
      case "MULTI_SELECT":
        out.push({ questionKey: question.key, value: { optionKeys: raw.optionKeys ?? [] } });
        break;
      case "BOOLEAN":
        out.push({ questionKey: question.key, value: { boolean: raw.boolean ?? false } });
        break;
      case "SHORT_TEXT":
      case "LONG_TEXT":
        out.push({ questionKey: question.key, value: { text: raw.text ?? "" } });
        break;
      default:
        // INFO / SELF_SERVICE_RESULT → cevap taşımaz.
        break;
    }
  }
  return out;
}

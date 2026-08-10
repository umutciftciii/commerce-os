import { describe, expect, it } from "vitest";
import type { SupportQuestionGraphDto } from "@commerce-os/contracts";
import {
  buildTicketAnswers,
  initialWizardState,
  wizardReducer,
  type WizardState,
} from "../lib/support/wizard";

/**
 * TODO-177 (ADR-289) Faz D — Guided wizard state-machine'i saf reducer'a indirildi; böylece
 * branching, GERİ navigasyonunda cevap korunması, self-service "çözüldü → ticket YOK",
 * "çözülmedi → escalation (guided cevaplar korunur)" davranışları interaction olmadan test
 * edilir. Component yalnız bu reducer'ı + async resolve/submit'i sarar.
 */

const GRAPH: SupportQuestionGraphDto = {
  questionSetId: "qs-1",
  questionSetVersionId: "qsv-1",
  version: 1,
  entryQuestionKey: "q_type",
  questions: [
    { key: "q_type", type: "SINGLE_SELECT", prompt: "Sorun?", helpText: null, sortOrder: 0, required: true, isEntry: true,
      options: [
        { key: "opt_broken", label: "Çalışmıyor", sortOrder: 0 },
        { key: "opt_damaged", label: "Hasarlı", sortOrder: 1 },
      ] },
    { key: "q_tried", type: "BOOLEAN", prompt: "Denediniz mi?", helpText: null, sortOrder: 1, required: true, isEntry: false, options: [] },
    { key: "q_note", type: "SHORT_TEXT", prompt: "Not", helpText: null, sortOrder: 2, required: false, isEntry: false, options: [] },
    { key: "r_solution", type: "SELF_SERVICE_RESULT", prompt: "Şunu deneyin", helpText: null, sortOrder: 3, required: false, isEntry: false, options: [] },
  ],
  transitions: [
    { fromKey: "q_type", matchKind: "OPTION", matchOptionKey: "opt_broken", action: "GO_TO_QUESTION", toKey: "q_tried", sortOrder: 0 },
    { fromKey: "q_type", matchKind: "OPTION", matchOptionKey: "opt_damaged", action: "ESCALATE", toKey: null, sortOrder: 1 },
    { fromKey: "q_tried", matchKind: "BOOLEAN_TRUE", matchOptionKey: null, action: "GO_TO_RESULT", toKey: "r_solution", sortOrder: 0 },
    { fromKey: "q_tried", matchKind: "BOOLEAN_FALSE", matchOptionKey: null, action: "ESCALATE", toKey: null, sortOrder: 1 },
  ],
};

function resolved(): WizardState {
  const s = wizardReducer(initialWizardState(), { type: "SELECT_TOPIC", topic: "PRODUCT_NOT_WORKING" });
  return wizardReducer(s, { type: "GRAPH_RESOLVED", graph: GRAPH });
}

describe("wizardReducer — akış", () => {
  it("başlangıç phase 'topic'", () => {
    expect(initialWizardState().phase).toBe("topic");
  });

  it("SELECT_TOPIC + GRAPH_RESOLVED → entry sorusuna geçer", () => {
    const s = resolved();
    expect(s.phase).toBe("question");
    expect(s.topic).toBe("PRODUCT_NOT_WORKING");
    expect(s.path).toEqual(["q_type"]);
    expect(s.answers).toEqual({});
  });

  it("branching: OPTION eşleşmesi → sonraki soruya (path büyür)", () => {
    const s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_broken"] } });
    expect(s.phase).toBe("question");
    expect(s.path).toEqual(["q_type", "q_tried"]);
    expect(s.answers.q_type).toEqual({ optionKeys: ["opt_broken"] });
  });

  it("branching: guided ESCALATE → escalation (attemptedResolution YOK)", () => {
    const s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_damaged"] } });
    expect(s.phase).toBe("escalation");
    expect(s.attemptedResolutionKey).toBeNull();
  });

  it("BOOLEAN_TRUE → self-service result", () => {
    let s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_broken"] } });
    s = wizardReducer(s, { type: "ANSWER", questionKey: "q_tried", value: { boolean: true } });
    expect(s.phase).toBe("result");
    expect(s.resultKey).toBe("r_solution");
  });

  it("GERİ: cevaplar korunur (answer preservation)", () => {
    let s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_broken"] } });
    s = wizardReducer(s, { type: "ANSWER", questionKey: "q_tried", value: { boolean: false } }); // → escalation
    s = wizardReducer(s, { type: "BACK" }); // escalation → son soru (q_tried)
    expect(s.phase).toBe("question");
    expect(s.path).toEqual(["q_type", "q_tried"]);
    // her iki cevap da korunmuş olmalı
    expect(s.answers.q_type).toEqual({ optionKeys: ["opt_broken"] });
    expect(s.answers.q_tried).toEqual({ boolean: false });
  });

  it("GERİ: entry sorudan geri → topic seçimine döner", () => {
    const s = wizardReducer(resolved(), { type: "BACK" });
    expect(s.phase).toBe("topic");
  });

  it("self-service ÇÖZÜLDÜ → 'solved' (ticket YOK)", () => {
    let s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_broken"] } });
    s = wizardReducer(s, { type: "ANSWER", questionKey: "q_tried", value: { boolean: true } }); // result
    s = wizardReducer(s, { type: "MARK_SOLVED" });
    expect(s.phase).toBe("solved");
  });

  it("self-service ÇÖZÜLMEDİ → escalation (attemptedResolution korunur, guided cevaplar durur)", () => {
    let s = wizardReducer(resolved(), { type: "ANSWER", questionKey: "q_type", value: { optionKeys: ["opt_broken"] } });
    s = wizardReducer(s, { type: "ANSWER", questionKey: "q_tried", value: { boolean: true } }); // result r_solution
    s = wizardReducer(s, { type: "MARK_UNSOLVED", resolutionText: "Şunu deneyin" });
    expect(s.phase).toBe("escalation");
    expect(s.attemptedResolutionKey).toBe("r_solution");
    expect(s.attemptedResolutionText).toBe("Şunu deneyin");
    expect(s.answers.q_tried).toEqual({ boolean: true }); // guided cevaplar korunur
  });
});

describe("buildTicketAnswers — snapshot payload", () => {
  it("cevapları soru tipine göre daraltır; INFO/RESULT dahil edilmez; sortOrder sıralı", () => {
    const answers = {
      q_type: { optionKeys: ["opt_broken"] },
      q_tried: { boolean: true },
      q_note: { text: "kısa not" },
    };
    expect(buildTicketAnswers(GRAPH, answers)).toEqual([
      { questionKey: "q_type", value: { optionKeys: ["opt_broken"] } },
      { questionKey: "q_tried", value: { boolean: true } },
      { questionKey: "q_note", value: { text: "kısa not" } },
    ]);
  });

  it("cevaplanmamış sorular payload'a girmez", () => {
    const answers = { q_type: { optionKeys: ["opt_damaged"] } };
    expect(buildTicketAnswers(GRAPH, answers)).toEqual([
      { questionKey: "q_type", value: { optionKeys: ["opt_damaged"] } },
    ]);
  });
});

"use client";

import { useEffect, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDate, type Locale, type StorefrontDictionary } from "@commerce-os/i18n";
import type { SupportResolveResponse, SupportTopicDto } from "@commerce-os/contracts";
import { Alert, Button, ButtonLink } from "../../ui";
import { PhotoUpload, type PhotoUploadResult } from "../../ui/photo-upload";
import { SUPPORT_ATTACHMENT_MIME_TYPES } from "../../../lib/attachment";
import { questionByKey, type FlowAnswerValue, type SupportQuestion } from "../../../lib/support/flow";
import { supportErrorMessage, topicLabel, warrantyText } from "../../../lib/support/labels";
import {
  buildTicketAnswers,
  initialWizardState,
  wizardReducer,
} from "../../../lib/support/wizard";
import {
  createSupportTicketAction,
  resolveSupportAction,
  sendSupportMessageAction,
  uploadSupportAttachmentAction,
} from "../../../lib/server/support-actions";

type SupportDict = StorefrontDictionary["account"]["support"];

export interface SupportWizardContext {
  orderNumber: string;
  orderLineId: string;
  productTitle: string;
  variantTitle: string | null;
}

/**
 * TODO-177 (ADR-289) Faz D — Guided support sihirbazı (istemci). Bağlam order-line'dan
 * OTOMATİK gelir (müşteri ürün/sipariş/varyant TEKRAR SEÇMEZ); backend orderLineId+storeId+
 * customerId'yi yine de her çağrıda doğrular. Gezinme test edilmiş saf reducer + flow ile;
 * self-service çözüldü → ticket AÇMAZ; çözülmedi/escalate → guided cevaplar korunur. Teknik
 * graf/enum kavramları GÖSTERİLMEZ. Double-submit: `useTransition` + submit guard + redirect.
 */
export function SupportGuidedWizard({
  context,
  topics,
  t,
  locale,
}: {
  context: SupportWizardContext;
  topics: SupportTopicDto[];
  t: SupportDict;
  locale: Locale;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [warranty, setWarranty] = useState<SupportResolveResponse["warranty"] | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, startResolve] = useTransition();

  const currentKey = state.phase === "question" ? state.path[state.path.length - 1] : null;
  const currentQuestion = state.graph && currentKey ? questionByKey(state.graph, currentKey) : undefined;

  const [draft, setDraft] = useState<FlowAnswerValue>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  // Yalnız mevcut soru anahtarı değişince taslağı senkronla (answers kasıtlı olarak bağımlılık
  // DEĞİL — GERİ/İLERİ'de önceki cevap korunur, her render'da sıfırlanmaz).
  useEffect(() => {
    if (currentKey) setDraft(state.answers[currentKey] ?? {});
    setValidationError(null);
  }, [currentKey]);

  // Escalation formu
  const [description, setDescription] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const showWarranty = state.topic === "WARRANTY_SERVICE" && warranty !== null;

  function selectTopicAndResolve() {
    if (!state.topic) return;
    setResolveError(null);
    const topic = state.topic;
    startResolve(async () => {
      const res = await resolveSupportAction({
        orderNumber: context.orderNumber,
        orderLineId: context.orderLineId,
        topic,
      });
      if (res.status === "ok") {
        setWarranty(res.data.warranty);
        dispatch({ type: "GRAPH_RESOLVED", graph: res.data.graph });
      } else {
        setResolveError(supportErrorMessage(res.code, t));
      }
    });
  }

  function validateDraft(question: SupportQuestion): string | null {
    if (!question.required) return null;
    switch (question.type) {
      case "SINGLE_SELECT":
        return draft.optionKeys && draft.optionKeys.length === 1 ? null : t.wizard.selectOne;
      case "MULTI_SELECT":
        return draft.optionKeys && draft.optionKeys.length >= 1 ? null : t.wizard.selectAtLeastOne;
      case "BOOLEAN":
        return typeof draft.boolean === "boolean" ? null : t.wizard.required;
      case "SHORT_TEXT":
      case "LONG_TEXT":
        return draft.text && draft.text.trim().length > 0 ? null : t.wizard.required;
      default:
        return null;
    }
  }

  function submitAnswer() {
    if (!currentQuestion || !currentKey) return;
    const error = validateDraft(currentQuestion);
    if (error) {
      setValidationError(error);
      return;
    }
    dispatch({ type: "ANSWER", questionKey: currentKey, value: draft });
  }

  async function handleUpload(file: File): Promise<PhotoUploadResult> {
    const form = new FormData();
    form.append("file", file);
    const res = await uploadSupportAttachmentAction(form);
    return res.ok ? { ok: true, mediaId: res.mediaId } : { ok: false };
  }

  async function submitTicket() {
    if (submitting || !state.graph || !state.topic) return;
    setSubmitting(true);
    setSubmitError(null);
    const trimmed = description.trim();
    const res = await createSupportTicketAction({
      orderNumber: context.orderNumber,
      orderLineId: context.orderLineId,
      topic: state.topic,
      questionSetVersionId: state.graph.questionSetVersionId,
      answers: buildTicketAnswers(state.graph, state.answers),
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      attemptedResolutionKey: state.attemptedResolutionKey ?? undefined,
      attemptedResolutionText: state.attemptedResolutionText ?? undefined,
    });
    if (res.status !== "success") {
      setSubmitError(supportErrorMessage(res.code, t));
      setSubmitting(false);
      return;
    }
    // Müşterinin kendi kısa açıklaması → ilk mesaj (opsiyonel; başarısızlığı ticket'ı bozmaz).
    if (trimmed.length > 0) {
      await sendSupportMessageAction(res.ticketNumber, { body: trimmed });
    }
    // Redirect → aynı sihirbazdan tekrar submit (double-submit/refresh) engellenir.
    router.push(`/account/support/${encodeURIComponent(res.ticketNumber)}`);
  }

  return (
    <div className="space-y-6" data-testid="support-wizard">
      <ContextHeader context={context} t={t} />

      {showWarranty && warranty ? (
        <Alert tone={warranty.inWarranty === false ? "warning" : "info"}>
          <span className="font-medium">{t.warranty.heading}: </span>
          {warrantyText(warranty, t, (iso) => formatDate(iso, locale))}
        </Alert>
      ) : null}

      {state.phase === "topic" ? (
        <TopicStep
          topics={topics}
          selected={state.topic}
          onSelect={(topic) => dispatch({ type: "SELECT_TOPIC", topic })}
          onContinue={selectTopicAndResolve}
          resolving={resolving}
          error={resolveError}
          t={t}
        />
      ) : null}

      {state.phase === "question" && currentQuestion ? (
        <QuestionStep
          question={currentQuestion}
          draft={draft}
          setDraft={setDraft}
          onBack={() => dispatch({ type: "BACK" })}
          onNext={submitAnswer}
          validationError={validationError}
          stepNumber={state.path.length}
          t={t}
        />
      ) : null}

      {state.phase === "result" && state.graph && state.resultKey ? (
        <ResultStep
          question={questionByKey(state.graph, state.resultKey)}
          onSolved={() => dispatch({ type: "MARK_SOLVED" })}
          onUnsolved={(text) => dispatch({ type: "MARK_UNSOLVED", resolutionText: text })}
          onBack={() => dispatch({ type: "BACK" })}
          t={t}
        />
      ) : null}

      {state.phase === "escalation" && state.graph ? (
        <EscalationStep
          graph={state.graph}
          answers={state.answers}
          description={description}
          setDescription={setDescription}
          onUpload={handleUpload}
          onAttachmentsChange={setAttachmentIds}
          onBack={() => dispatch({ type: "BACK" })}
          onSubmit={submitTicket}
          submitting={submitting}
          submitError={submitError}
          t={t}
        />
      ) : null}

      {state.phase === "solved" ? (
        <div className="space-y-3 border border-line p-4" data-testid="support-solved">
          <p className="text-sm font-medium text-ink">{t.result.solvedThanks}</p>
          <p className="text-sm text-ink-muted">{t.result.solvedDone}</p>
          <ButtonLink href="/account?section=orders" variant="secondary" size="sm">
            {t.result.solvedBackToOrders}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

export function ContextHeader({ context, t }: { context: SupportWizardContext; t: SupportDict }) {
  return (
    <div className="border border-line bg-surface-muted p-4" data-testid="support-context">
      <p className="text-xs uppercase tracking-wideish text-ink-subtle">{t.new.contextHeading}</p>
      <p className="mt-1 text-sm font-medium text-ink" data-testid="support-context-product">
        {context.productTitle}
        {context.variantTitle ? <span className="text-ink-subtle"> · {context.variantTitle}</span> : null}
      </p>
      <p className="text-xs text-ink-muted">
        {t.new.orderLabel}: {context.orderNumber}
      </p>
    </div>
  );
}

export function TopicStep({
  topics,
  selected,
  onSelect,
  onContinue,
  resolving,
  error,
  t,
}: {
  topics: SupportTopicDto[];
  selected: SupportTopicDto | null;
  onSelect: (topic: SupportTopicDto) => void;
  onContinue: () => void;
  resolving: boolean;
  error: string | null;
  t: SupportDict;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{t.new.topicHeading}</h2>
        <p className="text-xs text-ink-muted">{t.new.topicHelp}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="sr-only">{t.new.topicHeading}</legend>
        {topics.map((topic) => (
          <label
            key={topic}
            data-testid={`support-topic-${topic}`}
            className={`flex cursor-pointer items-center gap-3 border p-3 text-sm transition-colors ${
              selected === topic ? "border-ink bg-surface-muted" : "border-line hover:border-ink-subtle"
            }`}
          >
            <input
              type="radio"
              name="support-topic"
              checked={selected === topic}
              onChange={() => onSelect(topic)}
            />
            <span className="text-ink">{topicLabel(topic, t)}</span>
          </label>
        ))}
      </fieldset>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        size="sm"
        onClick={onContinue}
        disabled={!selected || resolving}
        data-testid="support-topic-continue"
      >
        {resolving ? t.wizard.loadingResolve : t.new.start}
      </Button>
    </div>
  );
}

export function QuestionStep({
  question,
  draft,
  setDraft,
  onBack,
  onNext,
  validationError,
  stepNumber,
  t,
}: {
  question: SupportQuestion;
  draft: FlowAnswerValue;
  setDraft: (value: FlowAnswerValue) => void;
  onBack: () => void;
  onNext: () => void;
  validationError: string | null;
  stepNumber: number;
  t: SupportDict;
}) {
  return (
    <div className="space-y-4" data-testid={`support-question-${question.key}`}>
      <p className="text-xs uppercase tracking-wideish text-ink-subtle">
        {format(t.wizard.stepLabel, { current: stepNumber })}
      </p>
      <div>
        <h2 className="text-sm font-semibold text-ink">{question.prompt}</h2>
        {question.helpText ? <p className="mt-1 text-xs text-ink-muted">{question.helpText}</p> : null}
      </div>

      {question.type === "SINGLE_SELECT" ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">{question.prompt}</legend>
          {question.options.map((opt) => (
            <label key={opt.key} className="flex cursor-pointer items-center gap-3 border border-line p-2.5 text-sm">
              <input
                type="radio"
                name={question.key}
                checked={draft.optionKeys?.[0] === opt.key}
                onChange={() => setDraft({ optionKeys: [opt.key] })}
              />
              <span className="text-ink">{opt.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {question.type === "MULTI_SELECT" ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">{question.prompt}</legend>
          {question.options.map((opt) => {
            const checked = draft.optionKeys?.includes(opt.key) ?? false;
            return (
              <label key={opt.key} className="flex cursor-pointer items-center gap-3 border border-line p-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const set = new Set(draft.optionKeys ?? []);
                    if (checked) set.delete(opt.key);
                    else set.add(opt.key);
                    setDraft({ optionKeys: [...set] });
                  }}
                />
                <span className="text-ink">{opt.label}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {question.type === "BOOLEAN" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft({ boolean: true })}
            className={`h-9 flex-1 border text-sm ${draft.boolean === true ? "border-ink bg-ink text-surface" : "border-line text-ink"}`}
          >
            {t.wizard.booleanYes}
          </button>
          <button
            type="button"
            onClick={() => setDraft({ boolean: false })}
            className={`h-9 flex-1 border text-sm ${draft.boolean === false ? "border-ink bg-ink text-surface" : "border-line text-ink"}`}
          >
            {t.wizard.booleanNo}
          </button>
        </div>
      ) : null}

      {question.type === "SHORT_TEXT" ? (
        <input
          type="text"
          value={draft.text ?? ""}
          onChange={(e) => setDraft({ text: e.target.value })}
          placeholder={t.wizard.textPlaceholder}
          className="w-full border border-line px-3 py-2 text-sm"
        />
      ) : null}

      {question.type === "LONG_TEXT" ? (
        <textarea
          value={draft.text ?? ""}
          onChange={(e) => setDraft({ text: e.target.value })}
          placeholder={t.wizard.textPlaceholder}
          rows={4}
          className="w-full border border-line px-3 py-2 text-sm"
        />
      ) : null}

      {validationError ? <p className="text-xs text-red-600">{validationError}</p> : null}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onBack} data-testid="support-wizard-back">
          {t.wizard.back}
        </Button>
        <Button size="sm" onClick={onNext} data-testid="support-wizard-next">
          {t.wizard.next}
        </Button>
      </div>
    </div>
  );
}

export function ResultStep({
  question,
  onSolved,
  onUnsolved,
  onBack,
  t,
}: {
  question: SupportQuestion | undefined;
  onSolved: () => void;
  onUnsolved: (text: string) => void;
  onBack: () => void;
  t: SupportDict;
}) {
  return (
    <div className="space-y-4 border border-line p-4" data-testid="support-result">
      <h2 className="text-sm font-semibold text-ink">{t.result.heading}</h2>
      {question ? (
        <div className="space-y-1 text-sm text-ink-muted">
          <p>{question.prompt}</p>
          {question.helpText ? <p className="text-xs text-ink-subtle">{question.helpText}</p> : null}
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink">{t.result.solvedQuestion}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSolved} data-testid="support-result-solved">
          {t.result.solved}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onUnsolved(question?.prompt ?? "")}
          data-testid="support-result-unsolved"
        >
          {t.result.unsolved}
        </Button>
      </div>
      <Button variant="link" size="sm" onClick={onBack} data-testid="support-wizard-back">
        {t.wizard.back}
      </Button>
    </div>
  );
}

function EscalationStep({
  graph,
  answers,
  description,
  setDescription,
  onUpload,
  onAttachmentsChange,
  onBack,
  onSubmit,
  submitting,
  submitError,
  t,
}: {
  graph: SupportResolveResponse["graph"];
  answers: Record<string, FlowAnswerValue>;
  description: string;
  setDescription: (value: string) => void;
  onUpload: (file: File) => Promise<PhotoUploadResult>;
  onAttachmentsChange: (ids: string[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  t: SupportDict;
}) {
  const summary = buildAnswerSummary(graph, answers);
  return (
    <div className="space-y-4 border border-line p-4" data-testid="support-escalation">
      <div>
        <h2 className="text-sm font-semibold text-ink">{t.escalation.heading}</h2>
        <p className="text-xs text-ink-muted">{t.escalation.help}</p>
      </div>

      {summary.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wideish text-ink-subtle">
            {t.escalation.summaryHeading}
          </p>
          <ul className="space-y-0.5 text-xs text-ink-muted">
            {summary.map((row) => (
              <li key={row.key}>
                <span className="text-ink">{row.prompt}:</span> {row.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="support-description" className="text-xs font-medium text-ink">
          {t.escalation.descriptionLabel}
        </label>
        <textarea
          id="support-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.escalation.descriptionPlaceholder}
          rows={4}
          maxLength={4000}
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-ink">{t.escalation.attachmentsLabel}</p>
        <PhotoUpload
          labels={t.photo}
          accept={SUPPORT_ATTACHMENT_MIME_TYPES}
          onUpload={onUpload}
          onChange={onAttachmentsChange}
        />
      </div>

      {submitError ? <Alert tone="error">{submitError}</Alert> : null}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onBack} data-testid="support-wizard-back">
          {t.wizard.back}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={submitting} data-testid="support-escalation-submit">
          {submitting ? t.escalation.submitting : t.escalation.submit}
        </Button>
      </div>
    </div>
  );
}

function buildAnswerSummary(
  graph: SupportResolveResponse["graph"],
  answers: Record<string, FlowAnswerValue>,
): Array<{ key: string; prompt: string; value: string }> {
  const rows: Array<{ key: string; prompt: string; value: string }> = [];
  const ordered = [...graph.questions].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const question of ordered) {
    const answer = answers[question.key];
    if (!answer) continue;
    let value = "";
    if (answer.optionKeys && answer.optionKeys.length > 0) {
      value = answer.optionKeys
        .map((key) => question.options.find((o) => o.key === key)?.label ?? key)
        .join(", ");
    } else if (typeof answer.boolean === "boolean") {
      value = answer.boolean ? "✓" : "✗";
    } else if (answer.text) {
      value = answer.text;
    }
    if (value) rows.push({ key: question.key, prompt: question.prompt, value });
  }
  return rows;
}

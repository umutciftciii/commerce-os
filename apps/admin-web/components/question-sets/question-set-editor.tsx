"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  SectionCard,
  Select,
  Textarea,
  useLocale,
} from "@commerce-os/ui";
import type {
  PlatformSupportQuestionSetDetail,
  PlatformSupportVersionDto,
} from "@commerce-os/api-client";
import { adminApi } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";
import { Tabs, TabPanel } from "../theme-library/tabs";
import { MappingsPanel } from "./mappings-panel";
import {
  QUESTION_TYPE_KEYS,
  questionTypeLabel,
  validationErrorLabel,
  versionStatusLabel,
  versionStatusTone,
} from "./labels";
import {
  answerKeysFor,
  toDraft,
  toPayload,
  nextKey,
  TERMINAL,
  HAS_OPTIONS,
  ESCALATE,
  DEFAULT_ANSWER,
  TRUE_ANSWER,
  FALSE_ANSWER,
  type DraftQuestion,
} from "./graph-model";

function answerLabel(q: DraftQuestion, answerKey: string, locale: "tr" | "en"): string {
  if (answerKey === DEFAULT_ANSWER) return locale === "tr" ? "Diğer cevaplar (varsayılan)" : "Other answers (default)";
  if (answerKey === TRUE_ANSWER) return locale === "tr" ? "Evet" : "Yes";
  if (answerKey === FALSE_ANSWER) return locale === "tr" ? "Hayır" : "No";
  return q.options.find((o) => o.key === answerKey)?.label ?? answerKey;
}

export function QuestionSetEditor({ initial }: { initial: PlatformSupportQuestionSetDetail }) {
  const locale = useLocale() as "tr" | "en";
  const [detail, setDetail] = useState(initial);
  const [selectedVersionId, setSelectedVersionId] = useState(
    initial.versions.find((v) => v.status === "DRAFT")?.id ?? initial.versions[0]?.id ?? "",
  );
  const selected = detail.versions.find((v) => v.id === selectedVersionId) ?? null;
  const isDraft = selected?.status === "DRAFT";

  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("questions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{ code: string; detail: string }> | null>(null);

  const reload = useCallback(async () => {
    const fresh = await adminApi.getQuestionSet(detail.id);
    setDetail(fresh.questionSet);
    return fresh.questionSet;
  }, [detail.id]);

  useEffect(() => {
    if (selected) {
      const d = toDraft(selected);
      setQuestions(d.questions);
      setBranches(d.branches);
      setDirty(false);
      setValidationErrors(null);
    }
  }, [selectedVersionId, selected]);

  const t = useMemo(
    () => ({
      newDraft: locale === "tr" ? "Yeni taslak sürüm" : "New draft version",
      cloneDraft: locale === "tr" ? "Bu sürümden yeni taslak" : "New draft from this version",
      save: locale === "tr" ? "Taslağı kaydet" : "Save draft",
      validate: locale === "tr" ? "Doğrula" : "Validate",
      publish: locale === "tr" ? "Yayınla" : "Publish",
      archive: locale === "tr" ? "Arşivle" : "Archive",
      addQuestion: locale === "tr" ? "Soru ekle" : "Add question",
      immutable:
        locale === "tr"
          ? "Yayınlanmış sürüm değiştirilemez. Düzenlemek için yeni taslak oluşturun."
          : "Published versions are immutable. Create a new draft to edit.",
      valid: locale === "tr" ? "Akış geçerli." : "Flow is valid.",
    }),
    [locale],
  );

  function markDirty(updater: () => void) {
    updater();
    setDirty(true);
    setValidationErrors(null);
  }

  // ---- question ops ----
  function addQuestion(type: DraftQuestion["type"]) {
    markDirty(() =>
      setQuestions((qs) => {
        const taken = new Set(qs.map((q) => q.key));
        const key = nextKey("q", taken);
        const isEntry = qs.length === 0;
        return [
          ...qs,
          {
            key,
            type,
            prompt: "",
            helpText: "",
            required: true,
            isEntry,
            options: HAS_OPTIONS(type)
              ? [
                  { key: "o1", label: "" },
                  { key: "o2", label: "" },
                ]
              : [],
          },
        ];
      }),
    );
  }
  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    markDirty(() =>
      setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q))),
    );
  }
  function setEntry(idx: number) {
    markDirty(() => setQuestions((qs) => qs.map((q, i) => ({ ...q, isEntry: i === idx }))));
  }
  function removeQuestion(idx: number) {
    markDirty(() => setQuestions((qs) => qs.filter((_, i) => i !== idx)));
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    markDirty(() =>
      setQuestions((qs) => {
        const next = [...qs];
        const j = idx + dir;
        if (j < 0 || j >= next.length) return qs;
        [next[idx], next[j]] = [next[j], next[idx]];
        return next;
      }),
    );
  }
  function addOption(qIdx: number) {
    markDirty(() =>
      setQuestions((qs) =>
        qs.map((q, i) => {
          if (i !== qIdx) return q;
          const taken = new Set(q.options.map((o) => o.key));
          return { ...q, options: [...q.options, { key: nextKey("o", taken), label: "" }] };
        }),
      ),
    );
  }
  function updateOption(qIdx: number, oIdx: number, label: string) {
    markDirty(() =>
      setQuestions((qs) =>
        qs.map((q, i) =>
          i === qIdx ? { ...q, options: q.options.map((o, j) => (j === oIdx ? { ...o, label } : o)) } : q,
        ),
      ),
    );
  }
  function removeOption(qIdx: number, oIdx: number) {
    markDirty(() =>
      setQuestions((qs) =>
        qs.map((q, i) => (i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q)),
      ),
    );
  }
  function setBranch(fromKey: string, answerKey: string, target: string) {
    markDirty(() => setBranches((b) => ({ ...b, [`${fromKey}::${answerKey}`]: target })));
  }

  // ---- version actions ----
  async function run<T>(fn: () => Promise<T>, successMsg?: string): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (successMsg) setNotice(successMsg);
      return r;
    } catch (e) {
      setError(messageForError(e, locale));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<boolean> {
    if (!selected) return false;
    const payload = toPayload(questions, branches);
    const r = await run(
      () => adminApi.editQuestionSetVersion(selected.id, payload as never),
      locale === "tr" ? "Taslak kaydedildi." : "Draft saved.",
    );
    if (r) {
      setDirty(false);
      await reload();
      return true;
    }
    return false;
  }

  async function validate() {
    if (!selected) return;
    if (dirty && !(await saveDraft())) return;
    const r = await run(() => adminApi.validateQuestionSetVersion(selected.id));
    if (r) {
      setValidationErrors(r.errors);
      if (r.ok) setNotice(t.valid);
    }
  }

  async function publish() {
    if (!selected) return;
    if (dirty && !(await saveDraft())) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.publishQuestionSetVersion(selected.id);
      setNotice(locale === "tr" ? "Sürüm yayınlandı." : "Version published.");
      setValidationErrors(null);
      const fresh = await reload();
      setSelectedVersionId(selected.id);
      void fresh;
    } catch (e) {
      // publish 422 GRAPH_INVALID → fetch validation detail for human-readable errors
      const r = await adminApi.validateQuestionSetVersion(selected.id).catch(() => null);
      if (r) setValidationErrors(r.errors);
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected) return;
    await run(
      () => adminApi.archiveQuestionSetVersion(selected.id),
      locale === "tr" ? "Sürüm arşivlendi." : "Version archived.",
    );
    await reload();
  }

  async function newDraft(cloneFromVersionId?: string) {
    const r = await run(() =>
      adminApi.createQuestionSetVersion(detail.id, cloneFromVersionId ? { cloneFromVersionId } : {}),
    );
    if (r) {
      setDetail(r.questionSet);
      const newest = r.questionSet.versions.find((v) => v.status === "DRAFT");
      if (newest) setSelectedVersionId(newest.id);
    }
  }

  const questionOptionsForTarget = (excludeKey: string) =>
    questions.filter((q) => q.key !== excludeKey);

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <SectionCard
        title={locale === "tr" ? "Sürümler" : "Versions"}
        description={
          locale === "tr"
            ? "Yayınlanmış sürüm değiştirilemez; düzenleme için yeni taslak açın."
            : "Published versions are immutable; open a new draft to edit."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {detail.versions.map((v: PlatformSupportVersionDto) => (
            <button
              key={v.id}
              onClick={() => setSelectedVersionId(v.id)}
              className={[
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                v.id === selectedVersionId
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              <span className="font-mono text-xs text-slate-500">v{v.version}</span>
              <Badge tone={versionStatusTone(v.status)}>{versionStatusLabel(v.status, locale)}</Badge>
              {v.publishedAt ? (
                <span className="text-xs text-slate-400">
                  {new Date(v.publishedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB")}
                </span>
              ) : null}
            </button>
          ))}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void newDraft(detail.versions.find((v) => v.status === "PUBLISHED")?.id)}>
            {t.newDraft}
          </Button>
        </div>
      </SectionCard>

      {!selected ? null : (
        <SectionCard
          title={locale === "tr" ? `Sürüm v${selected.version}` : `Version v${selected.version}`}
          actions={
            isDraft ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={busy || !dirty} onClick={() => void saveDraft()}>
                  {t.save}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void validate()}>
                  {t.validate}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void publish()}>
                  {t.publish}
                </Button>
              </div>
            ) : selected.status === "PUBLISHED" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void newDraft(selected.id)}>
                  {t.cloneDraft}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void archive()}>
                  {t.archive}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void newDraft(selected.id)}>
                {t.cloneDraft}
              </Button>
            )
          }
        >
          {!isDraft ? <Alert tone="info">{t.immutable}</Alert> : null}

          {validationErrors && validationErrors.length > 0 ? (
            <div className="mt-2">
              <Alert tone="error">
                <ul className="list-disc space-y-1 pl-4">
                  {validationErrors.map((e, i) => (
                    <li key={i}>{validationErrorLabel(e.code, locale)}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}

          <div className="mt-4">
            <Tabs
              tabs={[
                { id: "questions", label: locale === "tr" ? "Sorular" : "Questions" },
                { id: "branches", label: locale === "tr" ? "Akış" : "Flow" },
                { id: "mappings", label: locale === "tr" ? "Eşleştirmeler" : "Mappings" },
              ]}
              active={tab}
              onChange={setTab}
              ariaLabel={locale === "tr" ? "Soru seti editörü" : "Question set editor"}
            />

            <TabPanel id="questions" active={tab}>
              <QuestionsTab
                locale={locale}
                readOnly={!isDraft}
                questions={questions}
                onAdd={addQuestion}
                onUpdate={updateQuestion}
                onSetEntry={setEntry}
                onRemove={removeQuestion}
                onMove={moveQuestion}
                onAddOption={addOption}
                onUpdateOption={updateOption}
                onRemoveOption={removeOption}
                addLabel={t.addQuestion}
              />
            </TabPanel>

            <TabPanel id="branches" active={tab}>
              <BranchesTab
                locale={locale}
                readOnly={!isDraft}
                questions={questions}
                branches={branches}
                onSetBranch={setBranch}
                targetsFor={questionOptionsForTarget}
              />
            </TabPanel>

            <TabPanel id="mappings" active={tab}>
              <MappingsPanel questionSetId={detail.id} isDefault={detail.isDefault} />
            </TabPanel>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------- Questions tab ----------
function QuestionsTab(props: {
  locale: "tr" | "en";
  readOnly: boolean;
  questions: DraftQuestion[];
  onAdd: (type: DraftQuestion["type"]) => void;
  onUpdate: (idx: number, patch: Partial<DraftQuestion>) => void;
  onSetEntry: (idx: number) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onAddOption: (qIdx: number) => void;
  onUpdateOption: (qIdx: number, oIdx: number, label: string) => void;
  onRemoveOption: (qIdx: number, oIdx: number) => void;
  addLabel: string;
}) {
  const { locale, readOnly, questions } = props;
  const [newType, setNewType] = useState<DraftQuestion["type"]>("SINGLE_SELECT");
  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={q.key} className="rounded-md border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <Input
                label={locale === "tr" ? "Soru metni" : "Question text"}
                value={q.prompt}
                disabled={readOnly}
                onChange={(e) => props.onUpdate(idx, { prompt: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm">
                  <span className="mr-1 text-slate-500">{locale === "tr" ? "Tür:" : "Type:"}</span>
                  <Select
                    aria-label={locale === "tr" ? "Soru türü" : "Question type"}
                    value={q.type}
                    disabled={readOnly}
                    onChange={(e) => props.onUpdate(idx, { type: e.target.value as DraftQuestion["type"], options: HAS_OPTIONS(e.target.value) ? q.options : [] })}
                    options={QUESTION_TYPE_KEYS.map((k) => ({ value: k, label: questionTypeLabel(k, locale) }))}
                  />
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" name="entry" checked={q.isEntry} disabled={readOnly} onChange={() => props.onSetEntry(idx)} />
                  {locale === "tr" ? "Başlangıç sorusu" : "Entry question"}
                </label>
                {!TERMINAL(q.type) ? (
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={q.required} disabled={readOnly} onChange={(e) => props.onUpdate(idx, { required: e.target.checked })} />
                    {locale === "tr" ? "Zorunlu" : "Required"}
                  </label>
                ) : null}
              </div>
              {HAS_OPTIONS(q.type) ? (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">{locale === "tr" ? "Seçenekler" : "Options"}</span>
                  {q.options.map((o, oIdx) => (
                    <div key={o.key} className="flex items-center gap-2">
                      <Input aria-label={locale === "tr" ? "Seçenek" : "Option"} value={o.label} disabled={readOnly} onChange={(e) => props.onUpdateOption(idx, oIdx, e.target.value)} />
                      {!readOnly ? (
                        <Button variant="ghost" size="sm" onClick={() => props.onRemoveOption(idx, oIdx)}>✕</Button>
                      ) : null}
                    </div>
                  ))}
                  {!readOnly ? (
                    <Button variant="ghost" size="sm" onClick={() => props.onAddOption(idx)}>
                      + {locale === "tr" ? "Seçenek ekle" : "Add option"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <Textarea
                label={locale === "tr" ? "Yardım metni (opsiyonel)" : "Help text (optional)"}
                value={q.helpText}
                disabled={readOnly}
                rows={2}
                onChange={(e) => props.onUpdate(idx, { helpText: e.target.value })}
              />
            </div>
            {!readOnly ? (
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" onClick={() => props.onMove(idx, -1)}>↑</Button>
                <Button variant="ghost" size="sm" onClick={() => props.onMove(idx, 1)}>↓</Button>
                <Button variant="ghost" size="sm" onClick={() => props.onRemove(idx)}>🗑</Button>
              </div>
            ) : null}
          </div>
        </div>
      ))}
      {!readOnly ? (
        <div className="flex items-center gap-2">
          <Select
            aria-label={locale === "tr" ? "Yeni soru türü" : "New question type"}
            value={newType}
            onChange={(e) => setNewType(e.target.value as DraftQuestion["type"])}
            options={QUESTION_TYPE_KEYS.map((k) => ({ value: k, label: questionTypeLabel(k, locale) }))}
          />
          <Button variant="secondary" size="sm" onClick={() => props.onAdd(newType)}>
            + {props.addLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Branches tab ----------
function BranchesTab(props: {
  locale: "tr" | "en";
  readOnly: boolean;
  questions: DraftQuestion[];
  branches: Record<string, string>;
  onSetBranch: (fromKey: string, answerKey: string, target: string) => void;
  targetsFor: (excludeKey: string) => DraftQuestion[];
}) {
  const { locale, readOnly, questions, branches } = props;
  const nonTerminal = questions.filter((q) => !TERMINAL(q.type));
  if (nonTerminal.length === 0) {
    return <p className="text-sm text-slate-500">{locale === "tr" ? "Önce soru ekleyin." : "Add questions first."}</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {locale === "tr"
          ? "Her cevap için sonraki adımı seçin: başka bir soru, bir çözüm sayfası ya da talep oluşturma."
          : "For each answer choose the next step: another question, a solution page, or create a ticket."}
      </p>
      {nonTerminal.map((q) => (
        <div key={q.key} className="rounded-md border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium">{q.prompt || (locale === "tr" ? "(metinsiz soru)" : "(untitled question)")}</p>
          <div className="space-y-2">
            {answerKeysFor(q).map((answerKey) => {
              const targets = props.targetsFor(q.key);
              const value = branches[`${q.key}::${answerKey}`] ?? "";
              return (
                <div key={answerKey} className="flex items-center gap-2">
                  <span className="w-48 shrink-0 text-sm text-slate-600">{answerLabel(q, answerKey, locale)}</span>
                  <span className="text-slate-400">→</span>
                  <Select
                    aria-label={locale === "tr" ? "Sonraki adım" : "Next step"}
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => props.onSetBranch(q.key, answerKey, e.target.value)}
                    options={[
                      { value: "", label: locale === "tr" ? "— seçin —" : "— choose —" },
                      { value: ESCALATE, label: locale === "tr" ? "Talep oluştur (destek ekibine)" : "Create ticket (to support)" },
                      ...targets
                        .filter((tq) => TERMINAL(tq.type))
                        .map((tq) => ({ value: tq.key, label: `${locale === "tr" ? "Çözüm: " : "Solution: "}${tq.prompt || tq.key}` })),
                      ...targets
                        .filter((tq) => !TERMINAL(tq.type))
                        .map((tq) => ({ value: tq.key, label: `${locale === "tr" ? "Soru: " : "Question: "}${tq.prompt || tq.key}` })),
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

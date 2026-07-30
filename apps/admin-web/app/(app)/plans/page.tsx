"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  Plan,
  PlanCreateRequest,
  PlanCapabilityMatrixEntry,
  PlanCapabilityStatus,
  PlanCapabilityPreviewResponse,
} from "@commerce-os/api-client";
import { PlanIcon } from "../../../components/icons";
import { adminApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plans: Plan[]; total: number };
type Editor = { mode: "create" } | { mode: "edit"; plan: Plan } | null;

const CODE_PATTERN = /^[a-z0-9-]{2,}$/;

export default function PlansPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.plans;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  // TODO-163 Faz 3 (TD-154) — Plan → Capability editörü (ayrı modal; plan id gerekir → edit-only).
  const [capsPlan, setCapsPlan] = useState<Plan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const capsLabel = locale === "tr" ? "Modüller" : "Modules";

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await adminApi.listPlans();
      setState({ status: "ready", plans: result.data, total: result.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<Plan>[] = [
    {
      header: t.table.code,
      cell: (plan) => <span className="font-mono text-xs text-slate-500">{plan.code}</span>,
    },
    { header: t.table.name, cell: (plan) => <span className="font-medium text-slate-900">{plan.name}</span> },
    {
      header: t.table.description,
      cell: (plan) => (
        <span className="text-slate-500">{plan.description ?? t.noDescription}</span>
      ),
    },
    { header: t.table.created, cell: (plan) => <span className="text-slate-500">{formatDate(plan.createdAt)}</span> },
    {
      header: t.table.actions,
      align: "right",
      cell: (plan) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCapsPlan(plan)}>
            {capsLabel}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", plan })}>
            {t.editAction}
          </Button>
        </div>
      ),
    },
  ];

  function onSaved(message: string) {
    setEditor(null);
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newPlan}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert tone="success" action={<button type="button" className="text-emerald-700 underline" onClick={() => setNotice(null)}>{c.actions.dismiss}</button>}>
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<PlanIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && state.plans.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<PlanIcon />}
            action={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{t.emptyAction}</Button>}
          />
        ) : null}

        {state.status === "ready" && state.plans.length > 0 ? (
          <DataTable columns={columns} rows={state.plans} rowKey={(plan) => plan.id} caption={t.cardTitle} />
        ) : null}
      </SectionCard>

      {editor ? (
        <PlanEditor editor={editor} onClose={() => setEditor(null)} onSaved={onSaved} />
      ) : null}

      {capsPlan ? (
        <PlanCapabilityEditor
          plan={capsPlan}
          onClose={() => setCapsPlan(null)}
          onSaved={(message) => {
            setCapsPlan(null);
            setNotice(message);
          }}
        />
      ) : null}
    </>
  );
}

function PlanEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.plans;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";

  const [code, setCode] = useState(isEdit ? editor.plan.code : "");
  const [name, setName] = useState(isEdit ? editor.plan.name : "");
  const [description, setDescription] = useState(isEdit ? (editor.plan.description ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isEdit && !CODE_PATTERN.test(code)) {
      setError(f.requiredCode);
      return;
    }
    if (name.trim().length === 0) {
      setError(f.requiredName);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await adminApi.updatePlan(editor.plan.id, {
          name: name.trim(),
          description: description.trim().length > 0 ? description.trim() : null,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: PlanCreateRequest = { code: code.trim(), name: name.trim() };
        if (description.trim().length > 0) payload.description = description.trim();
        await adminApi.createPlan(payload);
        onSaved(t.createdToast);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? f.editTitle : f.createTitle}
      description={isEdit ? f.editSubtitle : f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="plan-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Input
            id="plan-code"
            label={f.codeLabel}
            placeholder={f.codePlaceholder}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={saving || isEdit}
            required={!isEdit}
          />
          <p className="mt-1.5 text-xs text-slate-400">{isEdit ? f.codeLockedHint : f.codeHint}</p>
        </div>
        <Input
          id="plan-name"
          label={f.nameLabel}
          placeholder={f.namePlaceholder}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          required
        />
        <Textarea
          id="plan-description"
          label={f.descriptionLabel}
          placeholder={f.descriptionPlaceholder}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}

// TODO-163 Faz 3 (TD-154 · ADR-215) — Plan → Capability editörü. Bir planın opsiyonel modül
// default'larını (required/optional/unavailable) yönetir. Doğrulama + dependency preview SUNUCU-otoriter
// (core kapatılamaz / invalid dependency 400). Apply MERGE eder (diğer metadata korunur); mağaza
// override'larına dokunmaz (resolver'da override > plan). Etki özeti: değişen modüller + abonelik sayısı.
type PreviewData = PlanCapabilityPreviewResponse["data"];

const CAP_STRINGS = {
  tr: {
    title: "Plan Modülleri",
    subtitle: "Bu planın varsayılan modül durumlarını yönetin. Mağazaya özel override'lar bundan üstündür.",
    required: "Zorunlu",
    optional: "Opsiyonel",
    unavailable: "Kapalı",
    core: "Çekirdek",
    dependsOn: "Gerektirir",
    changed: "Değişen modüller",
    depDisabled: "Bağımlılık nedeniyle kapanan",
    noChange: "Değişiklik yok.",
    subscribers: (n: number) => `Bu plana bağlı ${n} mağaza etkilenebilir (mağaza override'ları korunur).`,
    errorsTitle: "Kaydedilemez",
    errUnknown: (k: string) => `Bilinmeyen modül: ${k}`,
    errCore: (k: string) => `Çekirdek modül kapatılamaz: ${k}`,
    errDep: (k: string, r: string) => `${k} zorunlu iken gerektirdiği ${r} kapatılamaz`,
    apply: "Uygula",
    saving: "Kaydediliyor…",
    close: "Kapat",
    loadError: "Modül matrisi yüklenemedi.",
    savedToast: "Plan modülleri güncellendi.",
    effectiveOff: "Etkin: kapalı",
  },
  en: {
    title: "Plan Modules",
    subtitle: "Manage this plan's default module states. Store-specific overrides take precedence.",
    required: "Required",
    optional: "Optional",
    unavailable: "Unavailable",
    core: "Core",
    dependsOn: "Requires",
    changed: "Changed modules",
    depDisabled: "Disabled by dependency",
    noChange: "No changes.",
    subscribers: (n: number) => `${n} store(s) on this plan may be affected (store overrides preserved).`,
    errorsTitle: "Cannot save",
    errUnknown: (k: string) => `Unknown module: ${k}`,
    errCore: (k: string) => `Core module cannot be disabled: ${k}`,
    errDep: (k: string, r: string) => `${k} is required but its dependency ${r} cannot be disabled`,
    apply: "Apply",
    saving: "Saving…",
    close: "Close",
    loadError: "Failed to load module matrix.",
    savedToast: "Plan modules updated.",
    effectiveOff: "Effective: off",
  },
} as const;

function PlanCapabilityEditor({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const c = getDictionary(locale).common;
  const s = locale === "tr" ? CAP_STRINGS.tr : CAP_STRINGS.en;

  const [matrix, setMatrix] = useState<PlanCapabilityMatrixEntry[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PlanCapabilityStatus>>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .getPlanCapabilities(plan.id)
      .then((res) => {
        if (!active) return;
        setMatrix(res.data.modules);
        const seed: Record<string, PlanCapabilityStatus> = {};
        for (const m of res.data.modules) if (!m.core) seed[m.key] = m.status;
        setStatuses(seed);
      })
      .catch(() => {
        if (active) setError(s.loadError);
      });
    return () => {
      active = false;
    };
  }, [plan.id, s.loadError]);

  const refreshPreview = useCallback(
    async (next: Record<string, PlanCapabilityStatus>) => {
      try {
        const res = await adminApi.previewPlanCapabilities(plan.id, { statuses: next });
        setPreview(res.data);
      } catch {
        setPreview(null);
      }
    },
    [plan.id],
  );

  function setStatus(key: string, value: PlanCapabilityStatus) {
    const next = { ...statuses, [key]: value };
    setStatuses(next);
    void refreshPreview(next);
  }

  async function onApply() {
    setError(null);
    setSaving(true);
    try {
      await adminApi.applyPlanCapabilities(plan.id, { statuses });
      onSaved(s.savedToast);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  const errorEntries = preview?.errors ?? [];
  const hasErrors = errorEntries.length > 0;
  const effectiveOff = new Map((preview?.entries ?? []).map((e) => [e.key, !e.effectivePlanEnabled]));

  return (
    <Modal
      open
      onClose={onClose}
      title={`${s.title} · ${plan.name}`}
      description={s.subtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {s.close}
          </Button>
          <Button type="button" onClick={() => void onApply()} disabled={saving || hasErrors || !matrix}>
            {saving ? s.saving : s.apply}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!matrix ? (
          <SkeletonRows rows={6} />
        ) : (
          <>
            {hasErrors ? (
              <Alert tone="error" title={s.errorsTitle}>
                <ul className="list-disc pl-4 text-xs">
                  {errorEntries.map((e, i) => (
                    <li key={i}>
                      {e.code === "UNKNOWN_MODULE"
                        ? s.errUnknown(e.key)
                        : e.code === "CORE_UNAVAILABLE"
                          ? s.errCore(e.key)
                          : s.errDep(e.key, e.requires ?? "")}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <tbody>
                  {matrix.map((m) => {
                    const label = locale === "tr" ? m.labelTr : m.labelEn;
                    const off = effectiveOff.get(m.key) === true;
                    return (
                      <tr key={m.key} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{label}</div>
                          <div className="text-[11px] text-slate-400">
                            {m.key}
                            {m.requires.length > 0 ? ` · ${s.dependsOn}: ${m.requires.join(", ")}` : ""}
                          </div>
                          {off && !m.core ? (
                            <div className="text-[11px] font-medium text-amber-600">
                              {s.effectiveOff}
                              {preview?.entries.find((e) => e.key === m.key)?.blockedBy
                                ? ` (${preview.entries.find((e) => e.key === m.key)?.blockedBy})`
                                : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {m.core ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              {s.core}
                            </span>
                          ) : (
                            <select
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                              value={statuses[m.key] ?? "optional"}
                              onChange={(event) => setStatus(m.key, event.target.value as PlanCapabilityStatus)}
                              disabled={saving}
                            >
                              <option value="required">{s.required}</option>
                              <option value="optional">{s.optional}</option>
                              <option value="unavailable">{s.unavailable}</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview ? (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <p>{s.subscribers(preview.subscriberCount)}</p>
                <p className="mt-1">
                  <span className="font-semibold">{s.changed}:</span>{" "}
                  {preview.changedModules.length > 0 ? preview.changedModules.join(", ") : s.noChange}
                </p>
                {preview.dependencyDisabled.length > 0 ? (
                  <p className="mt-1 text-amber-700">
                    <span className="font-semibold">{s.depDisabled}:</span>{" "}
                    {preview.dependencyDisabled.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

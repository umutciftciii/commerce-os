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
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { Plan, PlanCreateRequest } from "@commerce-os/api-client";
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
  const dict = getDictionary();
  const t = dict.admin.plans;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await adminApi.listPlans();
      setState({ status: "ready", plans: result.data, total: result.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error) });
    }
  }, []);

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
        <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", plan })}>
          {t.editAction}
        </Button>
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
  const dict = getDictionary();
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
      setError(messageForError(caught));
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

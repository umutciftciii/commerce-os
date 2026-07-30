"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { AdminStore, AdminStoreCreateRequest } from "@commerce-os/api-client";
import { StoreIcon } from "../../../components/icons";
import { adminApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";

type StoreStatus = AdminStore["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: AdminStore[]; total: number };
type Editor = { mode: "create" } | { mode: "edit"; store: AdminStore } | null;

const STATUS_TONES: Record<StoreStatus, "success" | "neutral" | "warning" | "danger"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  SUSPENDED: "warning",
  CLOSED: "danger",
};

const SLUG_PATTERN = /^[a-z0-9-]{3,}$/;

export default function StoresPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.stores;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<StoreStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await adminApi.listStores();
      setState({
        status: "ready",
        stores: result.data,
        total: result.pagination.total,
      });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(statusLabels) as StoreStatus[]).map((value) => ({
        value,
        label: statusLabels[value],
      })),
    [statusLabels],
  );

  const columns: DataTableColumn<AdminStore>[] = [
    { header: t.table.name, cell: (store) => <span className="font-medium text-slate-900">{store.name}</span> },
    {
      header: t.table.slug,
      cell: (store) => <span className="font-mono text-xs text-slate-500">{store.slug}</span>,
    },
    {
      header: t.table.domain,
      cell: (store) => <span className="font-mono text-xs text-slate-500">{store.domain ?? "—"}</span>,
    },
    {
      header: t.table.status,
      cell: (store) => <Badge tone={STATUS_TONES[store.status]}>{statusLabels[store.status]}</Badge>,
    },
    { header: t.table.created, cell: (store) => <span className="text-slate-500">{formatDate(store.createdAt)}</span> },
    {
      header: t.table.actions,
      align: "right",
      cell: (store) => (
        <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", store })}>
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
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newStore}</Button>}
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
        icon={<StoreIcon />}
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

        {state.status === "ready" && state.stores.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<StoreIcon />}
            action={<Button size="sm" onClick={() => setEditor({ mode: "create" })}>{t.emptyAction}</Button>}
          />
        ) : null}

        {state.status === "ready" && state.stores.length > 0 ? (
          <DataTable columns={columns} rows={state.stores} rowKey={(store) => store.id} caption={t.cardTitle} />
        ) : null}
      </SectionCard>

      {editor ? (
        <StoreEditor
          editor={editor}
          statusOptions={statusOptions}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function StoreEditor({
  editor,
  statusOptions,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  statusOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.admin.stores;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";

  const [name, setName] = useState(isEdit ? editor.store.name : "");
  const [slug, setSlug] = useState(isEdit ? editor.store.slug : "");
  const [status, setStatus] = useState<StoreStatus>(isEdit ? editor.store.status : "DRAFT");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError(f.requiredName);
      return;
    }
    if (!isEdit && !SLUG_PATTERN.test(slug)) {
      setError(f.requiredSlug);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await adminApi.updateStore(editor.store.id, { name: name.trim(), status });
        onSaved(t.updatedToast);
      } else {
        const payload: AdminStoreCreateRequest = {
          name: name.trim(),
          slug: slug.trim(),
          status,
        };
        if (domain.trim().length > 0) payload.domain = domain.trim();
        await adminApi.createStore(payload);
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
          <Button type="submit" form="store-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="store-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="store-name"
          label={f.nameLabel}
          placeholder={f.namePlaceholder}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          required
        />
        <div>
          <Input
            id="store-slug"
            label={f.slugLabel}
            placeholder={f.slugPlaceholder}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            disabled={saving || isEdit}
            required={!isEdit}
          />
          <p className="mt-1.5 text-xs text-slate-400">{isEdit ? f.slugLockedHint : f.slugHint}</p>
        </div>
        <Select
          id="store-status"
          label={f.statusLabel}
          options={statusOptions}
          value={status}
          onChange={(event) => setStatus(event.target.value as StoreStatus)}
          disabled={saving}
        />
        {!isEdit ? (
          <Input
            id="store-domain"
            label={f.domainLabel}
            placeholder={f.domainPlaceholder}
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            disabled={saving}
          />
        ) : null}
      </form>
    </Modal>
  );
}

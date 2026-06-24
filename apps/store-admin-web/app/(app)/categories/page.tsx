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
import type { ProductCategory, ProductCategoryCreateRequest } from "@commerce-os/api-client";
import { CategoryIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type CategoryStatus = ProductCategory["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; categories: ProductCategory[]; total: number };
type Editor = { mode: "create" } | { mode: "edit"; category: ProductCategory } | null;

const STATUS_TONES: Record<CategoryStatus, "success" | "neutral"> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function CategoriesPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.categories;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<CategoryStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listCategories();
      setState({ status: "ready", categories: result.data, total: result.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = state.status === "ready" ? state.categories : [];
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const columns: DataTableColumn<ProductCategory>[] = [
    {
      header: t.table.name,
      cell: (category) => <span className="font-medium text-slate-900">{category.name}</span>,
    },
    {
      header: t.table.slug,
      cell: (category) => <span className="font-mono text-xs text-slate-500">{category.slug}</span>,
    },
    {
      header: t.table.parent,
      cell: (category) => (
        <span className="text-slate-500">
          {category.parentId ? (nameById.get(category.parentId) ?? category.parentId) : t.noParent}
        </span>
      ),
    },
    {
      header: t.table.sortOrder,
      align: "right",
      cell: (category) => <span className="text-slate-500">{category.sortOrder}</span>,
    },
    {
      header: t.table.status,
      cell: (category) => (
        <Badge tone={STATUS_TONES[category.status]}>{statusLabels[category.status]}</Badge>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (category) => (
        <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", category })}>
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
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newCategory}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-700 underline"
                onClick={() => setNotice(null)}
              >
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<CategoryIcon />}
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

        {state.status === "ready" && categories.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<CategoryIcon />}
            action={
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && categories.length > 0 ? (
          <DataTable
            columns={columns}
            rows={categories}
            rowKey={(category) => category.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SectionCard>

      {editor ? (
        <CategoryEditor
          editor={editor}
          categories={categories}
          statusLabels={statusLabels}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function CategoryEditor({
  editor,
  categories,
  statusLabels,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  categories: ProductCategory[];
  statusLabels: Record<CategoryStatus, string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.categories;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";

  const [name, setName] = useState(isEdit ? editor.category.name : "");
  const [slug, setSlug] = useState(isEdit ? editor.category.slug : "");
  const [parentId, setParentId] = useState(isEdit ? (editor.category.parentId ?? "") : "");
  const [sortOrder, setSortOrder] = useState(isEdit ? String(editor.category.sortOrder) : "0");
  const [status, setStatus] = useState<CategoryStatus>(isEdit ? editor.category.status : "ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parentOptions = useMemo(() => {
    const options = [{ value: "", label: f.parentNone }];
    for (const category of categories) {
      if (isEdit && category.id === editor.category.id) continue;
      options.push({ value: category.id, label: category.name });
    }
    return options;
  }, [categories, editor, f.parentNone, isEdit]);

  const statusOptions = (Object.keys(statusLabels) as CategoryStatus[]).map((value) => ({
    value,
    label: statusLabels[value],
  }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError(f.requiredName);
      return;
    }
    if (!isEdit && !SLUG_PATTERN.test(slug.trim())) {
      setError(f.requiredSlug);
      return;
    }

    const parsedSort = Number.parseInt(sortOrder, 10);
    const safeSort = Number.isNaN(parsedSort) ? 0 : parsedSort;

    setSaving(true);
    try {
      if (isEdit) {
        await storeApi.updateCategory(editor.category.id, {
          name: name.trim(),
          parentId: parentId === "" ? null : parentId,
          sortOrder: safeSort,
          status,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: ProductCategoryCreateRequest = {
          name: name.trim(),
          slug: slug.trim(),
          sortOrder: safeSort,
          status,
        };
        if (parentId !== "") payload.parentId = parentId;
        await storeApi.createCategory(payload);
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
          <Button type="submit" form="category-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="category-name"
          label={f.nameLabel}
          placeholder={f.namePlaceholder}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          required
        />
        <div>
          <Input
            id="category-slug"
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
          id="category-parent"
          label={f.parentLabel}
          options={parentOptions}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          disabled={saving}
        />
        <div>
          <Input
            id="category-sort"
            type="number"
            label={f.sortOrderLabel}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-slate-400">{f.sortOrderHint}</p>
        </div>
        <Select
          id="category-status"
          label={f.statusLabel}
          options={statusOptions}
          value={status}
          onChange={(event) => setStatus(event.target.value as CategoryStatus)}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}

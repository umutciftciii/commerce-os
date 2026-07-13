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
} from "../../../components/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AttributeDefinition,
  AttributeGroup,
  CategoryAttribute,
  CategoryAttributeCreateRequest,
  ProductCategory,
  ProductCategoryCreateRequest,
} from "@commerce-os/api-client";
import { CategoryIcon } from "../../../components/icons";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
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
  // Faz 1B (ADR-067) — kategoriye attribute davranışı bağlama modalı.
  const [attributesFor, setAttributesFor] = useState<ProductCategory | null>(null);
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
      cell: (category) => <span className="font-medium text-white/90">{category.name}</span>,
    },
    {
      header: t.table.slug,
      cell: (category) => <span className="font-mono text-xs text-white/45">{category.slug}</span>,
    },
    {
      header: t.table.parent,
      cell: (category) => (
        <span className="text-white/45">
          {category.parentId ? (nameById.get(category.parentId) ?? category.parentId) : t.noParent}
        </span>
      ),
    },
    {
      header: t.table.sortOrder,
      align: "right",
      cell: (category) => <span className="text-white/45">{category.sortOrder}</span>,
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
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAttributesFor(category)}>
            {t.attributesAction}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", category })}>
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
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.newCategory}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-300 underline"
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

      {attributesFor ? (
        <CategoryAttributesModal
          category={attributesFor}
          onClose={() => setAttributesFor(null)}
          onNotice={setNotice}
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
  // ADR-065 (Faz 2/Dilim 3) — MediaUpload single mode value[] biçimini bekler;
  // edit'te mevcut görsel (imageId+imageUrl) ile başlatılır, create'te boş.
  const [image, setImage] = useState<MediaItem[]>(
    isEdit && editor.category.imageId && editor.category.imageUrl
      ? [{ id: editor.category.imageId, url: editor.category.imageUrl, altText: null }]
      : [],
  );
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
          // null = görseli kaldır (FK NULL); id = bağla/değiştir.
          imageId: image[0]?.id ?? null,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: ProductCategoryCreateRequest = {
          name: name.trim(),
          slug: slug.trim(),
          sortOrder: safeSort,
          status,
          imageId: image[0]?.id ?? null,
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
          <p className="mt-1.5 text-xs text-white/30">{isEdit ? f.slugLockedHint : f.slugHint}</p>
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
          <span className="mb-1.5 block text-sm font-medium text-white/70">{f.imageLabel}</span>
          <MediaUpload
            context="CATEGORY"
            mode="single"
            value={image}
            onAttach={(asset) => setImage([{ id: asset.id, url: asset.url, altText: asset.altText }])}
            onRemove={() => setImage([])}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-white/30">{f.imageHint}</p>
        </div>
        <div>
          <Input
            id="category-sort"
            type="number"
            label={f.sortOrderLabel}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-white/30">{f.sortOrderHint}</p>
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

// Faz 1B (ADR-067) — Bir kategoriye attribute davranışı bağlama modalı. Davranışın
// tek sahibi CategoryAttribute'tur; bu modal link ekler/kaldırır (davranış bayraklarıyla).
type BehaviorKey =
  | "required"
  | "filterable"
  | "searchable"
  | "comparable"
  | "variantDefining"
  | "visibleOnProductPage"
  | "visibleOnListing";

const BEHAVIOR_KEYS: BehaviorKey[] = [
  "required",
  "filterable",
  "searchable",
  "comparable",
  "variantDefining",
  "visibleOnProductPage",
  "visibleOnListing",
];

function CategoryAttributesModal({
  category,
  onClose,
  onNotice,
}: {
  category: ProductCategory;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.categoryAttributes;
  const at = dict.storeAdmin.attributes;
  const c = dict.common;
  const dataTypeLabels = at.dataTypeLabels as Record<AttributeDefinition["dataType"], string>;
  const behaviorLabels = t.behaviors as Record<BehaviorKey, string>;

  const [links, setLinks] = useState<CategoryAttribute[]>([]);
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [groups, setGroups] = useState<AttributeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add formu durumu.
  const [selectedAttr, setSelectedAttr] = useState("");
  const [groupId, setGroupId] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [behaviors, setBehaviors] = useState<Record<BehaviorKey, boolean>>({
    required: false,
    filterable: false,
    searchable: false,
    comparable: false,
    variantDefining: false,
    visibleOnProductPage: true,
    visibleOnListing: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linkRes, attrRes, groupRes] = await Promise.all([
        storeApi.listCategoryAttributes(category.id),
        storeApi.listAttributes(),
        storeApi.listAttributeGroups(),
      ]);
      setLinks(linkRes.data);
      setAttributes(attrRes.data);
      setGroups(groupRes.data);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [category.id, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const attrById = useMemo(() => {
    const map = new Map<string, AttributeDefinition>();
    for (const a of attributes) map.set(a.id, a);
    return map;
  }, [attributes]);

  // Zaten bağlı olmayan + arşivli olmayan attribute'lar bağlanabilir.
  const available = useMemo(() => {
    const linked = new Set(links.map((l) => l.attributeDefinitionId));
    return attributes.filter((a) => !linked.has(a.id) && a.status === "ACTIVE");
  }, [attributes, links]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (selectedAttr === "") return;
    const parsed = Number.parseInt(displayOrder, 10);
    setSaving(true);
    try {
      const payload: CategoryAttributeCreateRequest = {
        attributeDefinitionId: selectedAttr,
        groupId: groupId === "" ? null : groupId,
        displayOrder: Number.isNaN(parsed) ? 0 : parsed,
        // Faz 1B: kural motoru Faz 2 kapsamında; şimdilik boş obje (gateway default'u).
        validationRules: {},
        ...behaviors,
      };
      await storeApi.createCategoryAttribute(category.id, payload);
      setSelectedAttr("");
      setGroupId("");
      setDisplayOrder("0");
      onNotice(t.savedToast);
      await load();
    } catch (error) {
      setFormError(messageForError(error, locale));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(link: CategoryAttribute) {
    try {
      await storeApi.removeCategoryAttribute(category.id, link.id);
      onNotice(t.removedToast);
      await load();
    } catch (error) {
      setLoadError(messageForError(error, locale));
    }
  }

  const columns: DataTableColumn<CategoryAttribute>[] = [
    {
      header: t.table.attribute,
      cell: (link) => {
        const a = attrById.get(link.attributeDefinitionId);
        return (
          <span className="font-medium text-white/90">
            {a ? a.name : link.attributeDefinitionId}
            {a ? <span className="ml-2 text-xs text-white/35">{dataTypeLabels[a.dataType]}</span> : null}
          </span>
        );
      },
    },
    {
      header: t.table.behaviors,
      cell: (link) => {
        const active = BEHAVIOR_KEYS.filter((k) => link[k]);
        return active.length === 0 ? (
          <span className="text-white/30">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {active.map((k) => (
              <Badge key={k} tone="neutral">
                {behaviorLabels[k]}
              </Badge>
            ))}
          </span>
        );
      },
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (link) => (
        <Button variant="secondary" size="sm" onClick={() => void onRemove(link)}>
          {t.removeAction}
        </Button>
      ),
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={t.title}
      description={format(t.subtitle, { name: category.name })}
      closeLabel={c.actions.dismiss}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {c.actions.dismiss}
        </Button>
      }
    >
      <div className="space-y-4">
        {loadError ? <Alert tone="error">{loadError}</Alert> : null}
        {loading ? (
          <SkeletonRows rows={2} />
        ) : links.length === 0 ? (
          <p className="text-sm text-white/40">{t.empty}</p>
        ) : (
          <DataTable columns={columns} rows={links} rowKey={(l) => l.id} caption={t.linkedCard} />
        )}

        <form onSubmit={onAdd} className="space-y-3 border-t border-white/[0.06] pt-4" noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          {available.length === 0 && !loading ? (
            <p className="text-sm text-white/40">{t.noAvailable}</p>
          ) : (
            <>
              <Select
                id="link-attribute"
                label={t.addAttributeLabel}
                options={[
                  { value: "", label: t.addAttributePlaceholder },
                  ...available.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` })),
                ]}
                value={selectedAttr}
                onChange={(e) => setSelectedAttr(e.target.value)}
                disabled={saving}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  id="link-group"
                  label={t.groupLabel}
                  options={[
                    { value: "", label: t.groupNone },
                    ...groups.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  disabled={saving}
                />
                <Input
                  id="link-order"
                  type="number"
                  label={t.displayOrderLabel}
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BEHAVIOR_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={behaviors[k]}
                      onChange={(e) => setBehaviors((prev) => ({ ...prev, [k]: e.target.checked }))}
                      disabled={saving}
                      className="h-4 w-4 rounded border-white/20 bg-white/[0.06] accent-indigo-500"
                    />
                    {behaviorLabels[k]}
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={saving || selectedAttr === ""}>
                  {saving ? c.states.saving : t.addAction}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </Modal>
  );
}

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
  Textarea,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
  ProductCreateRequest,
} from "@commerce-os/api-client";
import { ProductIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { VariantsManager } from "./variants-manager";

type ProductStatus = Product["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: Product[]; total: number };
type Editor = { mode: "create" } | { mode: "edit"; product: Product } | null;

const STATUS_TONES: Record<ProductStatus, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function ProductsPage() {
  const dict = getDictionary();
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<ProductStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [variantsFor, setVariantsFor] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [products, cats] = await Promise.all([
        storeApi.listProducts(),
        storeApi.listCategories(),
      ]);
      setCategories(cats.data);
      setState({ status: "ready", products: products.data, total: products.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const products = state.status === "ready" ? state.products : [];
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const columns: DataTableColumn<Product>[] = [
    {
      header: t.table.title,
      cell: (product) => (
        <div>
          <p className="font-medium text-slate-900">{product.title}</p>
          <p className="font-mono text-xs text-slate-400">{product.slug}</p>
        </div>
      ),
    },
    {
      header: t.table.status,
      cell: (product) => (
        <Badge tone={STATUS_TONES[product.status]}>{statusLabels[product.status]}</Badge>
      ),
    },
    {
      header: t.table.brand,
      cell: (product) => (
        <span className="text-slate-500">{product.brand ?? product.vendor ?? t.noBrand}</span>
      ),
    },
    {
      header: t.table.categories,
      cell: (product) => (
        <span className="text-slate-500">
          {product.categoryIds.length === 0
            ? "—"
            : product.categoryIds
                .map((id) => categoryNameById.get(id) ?? id)
                .join(", ")}
        </span>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (product) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setVariantsFor(product)}>
            {t.manageVariants}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", product })}>
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
        actions={<Button onClick={() => setEditor({ mode: "create" })}>{t.addProduct}</Button>}
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
        icon={<ProductIcon />}
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

        {state.status === "ready" && products.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<ProductIcon />}
            action={
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && products.length > 0 ? (
          <DataTable
            columns={columns}
            rows={products}
            rowKey={(product) => product.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SectionCard>

      {editor ? (
        <ProductEditor
          editor={editor}
          categories={categories}
          statusLabels={statusLabels}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}

      {variantsFor ? (
        <VariantsManager product={variantsFor} onClose={() => setVariantsFor(null)} />
      ) : null}
    </>
  );
}

function ProductEditor({
  editor,
  categories,
  statusLabels,
  onClose,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  categories: ProductCategory[];
  statusLabels: Record<ProductStatus, string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dict = getDictionary();
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const f = t.form;
  const isEdit = editor.mode === "edit";

  const [title, setTitle] = useState(isEdit ? editor.product.title : "");
  const [slug, setSlug] = useState(isEdit ? editor.product.slug : "");
  const [status, setStatus] = useState<ProductStatus>(isEdit ? editor.product.status : "DRAFT");
  const [brand, setBrand] = useState(isEdit ? (editor.product.brand ?? "") : "");
  const [vendor, setVendor] = useState(isEdit ? (editor.product.vendor ?? "") : "");
  const [description, setDescription] = useState(isEdit ? (editor.product.description ?? "") : "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    isEdit ? editor.product.categoryIds : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const statusOptions = (Object.keys(statusLabels) as ProductStatus[]).map((value) => ({
    value,
    label: statusLabels[value],
  }));

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length === 0) {
      setError(f.requiredTitle);
      return;
    }
    if (!isEdit && !SLUG_PATTERN.test(slug.trim())) {
      setError(f.requiredSlug);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await storeApi.updateProduct(editor.product.id, {
          title: title.trim(),
          status,
          brand: brand.trim() === "" ? null : brand.trim(),
          vendor: vendor.trim() === "" ? null : vendor.trim(),
          description: description.trim() === "" ? null : description.trim(),
          categoryIds,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: ProductCreateRequest = {
          title: title.trim(),
          slug: slug.trim(),
          status,
          type: "PHYSICAL",
          categoryIds,
        };
        if (brand.trim() !== "") payload.brand = brand.trim();
        if (vendor.trim() !== "") payload.vendor = vendor.trim();
        if (description.trim() !== "") payload.description = description.trim();
        await storeApi.createProduct(payload);
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
          <Button type="submit" form="product-form" disabled={saving}>
            {saving ? c.states.saving : isEdit ? f.submitEdit : f.submitCreate}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="product-title"
          label={f.titleLabel}
          placeholder={f.titlePlaceholder}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
          required
        />
        <div>
          <Input
            id="product-slug"
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
          id="product-status"
          label={f.statusLabel}
          options={statusOptions}
          value={status}
          onChange={(event) => setStatus(event.target.value as ProductStatus)}
          disabled={saving}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="product-brand"
            label={f.brandLabel}
            placeholder={f.brandPlaceholder}
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            disabled={saving}
          />
          <Input
            id="product-vendor"
            label={f.vendorLabel}
            placeholder={f.vendorPlaceholder}
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            disabled={saving}
          />
        </div>
        <Textarea
          id="product-description"
          label={f.descriptionLabel}
          placeholder={f.descriptionPlaceholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
          rows={3}
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            {f.categoriesLabel}
          </span>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">{f.categoriesEmpty}</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">{f.categoriesHint}</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const checked = categoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                        checked
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-brand-600"
                        checked={checked}
                        onChange={() => toggleCategory(category.id)}
                        disabled={saving}
                      />
                      {category.name}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

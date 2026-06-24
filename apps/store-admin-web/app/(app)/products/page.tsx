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
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
  ProductCreateRequest,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
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

const SALES_MODE_TONES: Record<ProductSalesMode, "success" | "info" | "warning" | "neutral"> = {
  ONLINE: "success",
  INQUIRY: "info",
  APPOINTMENT: "warning",
  WHATSAPP: "success",
  CATALOG_ONLY: "neutral",
};

const SALES_MODES: ProductSalesMode[] = [
  "ONLINE",
  "INQUIRY",
  "APPOINTMENT",
  "WHATSAPP",
  "CATALOG_ONLY",
];
const PRICE_VISIBILITIES: ProductPriceVisibility[] = [
  "VISIBLE",
  "HIDDEN",
  "STARTING_FROM",
  "ON_REQUEST",
];
const PRIMARY_ACTIONS: ProductPrimaryAction[] = [
  "ADD_TO_CART",
  "REQUEST_PRICE",
  "BOOK_APPOINTMENT",
  "WHATSAPP",
  "CONTACT_FORM",
  "NONE",
];

// Sozlukten gelen string sabitleri (CTA/sablon uzunluk siniri kontrat ile ayni).
const CTA_MAX = 120;
const WHATSAPP_MAX = 500;
const INQUIRY_TITLE_MAX = 160;
const APPOINTMENT_NOTE_MAX = 500;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function ProductsPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const sm = t.salesModel;
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
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

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
      header: sm.columnHeader,
      cell: (product) => {
        // Eski (F2D oncesi) kayitlar icin guvenli varsayilanlar.
        const mode = (product.salesMode ?? "ONLINE") as ProductSalesMode;
        const visibility = (product.priceVisibility ?? "VISIBLE") as ProductPriceVisibility;
        const action = (product.primaryAction ?? "ADD_TO_CART") as ProductPrimaryAction;
        const purchasable = product.purchasable ?? true;
        return (
          <div className="space-y-1">
            <Badge tone={SALES_MODE_TONES[mode]}>{sm.modeLabels[mode]}</Badge>
            <p className="text-xs text-slate-400">
              {sm.priceVisibilityLabels[visibility]} · {sm.actionLabels[action]}
            </p>
            {!purchasable ? (
              <p className="text-xs font-medium text-amber-600">{sm.notPurchasableBadge}</p>
            ) : mode === "ONLINE" ? (
              <p className="text-xs font-medium text-emerald-600">{sm.purchasableBadge}</p>
            ) : null}
          </div>
        );
      },
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
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const f = t.form;
  const sm = t.salesModel;
  const isEdit = editor.mode === "edit";
  const initial = isEdit ? editor.product : null;

  const [title, setTitle] = useState(isEdit ? editor.product.title : "");
  const [slug, setSlug] = useState(isEdit ? editor.product.slug : "");
  const [status, setStatus] = useState<ProductStatus>(isEdit ? editor.product.status : "DRAFT");
  const [brand, setBrand] = useState(isEdit ? (editor.product.brand ?? "") : "");
  const [vendor, setVendor] = useState(isEdit ? (editor.product.vendor ?? "") : "");
  const [description, setDescription] = useState(isEdit ? (editor.product.description ?? "") : "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    isEdit ? editor.product.categoryIds : [],
  );

  // Satis davranisi (F2D alanlari).
  const [salesMode, setSalesMode] = useState<ProductSalesMode>(initial?.salesMode ?? "ONLINE");
  const [priceVisibility, setPriceVisibility] = useState<ProductPriceVisibility>(
    initial?.priceVisibility ?? "VISIBLE",
  );
  const [primaryAction, setPrimaryAction] = useState<ProductPrimaryAction>(
    initial?.primaryAction ?? "ADD_TO_CART",
  );
  const [purchasable, setPurchasable] = useState<boolean>(initial?.purchasable ?? true);
  const [inquiryEnabled, setInquiryEnabled] = useState<boolean>(initial?.inquiryEnabled ?? false);
  const [appointmentRequired, setAppointmentRequired] = useState<boolean>(
    initial?.appointmentRequired ?? false,
  );
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(initial?.whatsappEnabled ?? false);
  const [minOrderQuantity, setMinOrderQuantity] = useState<string>(
    String(initial?.minOrderQuantity ?? 1),
  );
  const [maxOrderQuantity, setMaxOrderQuantity] = useState<string>(
    initial?.maxOrderQuantity != null ? String(initial.maxOrderQuantity) : "",
  );
  const [callToActionLabel, setCallToActionLabel] = useState(initial?.callToActionLabel ?? "");
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState(
    initial?.whatsappMessageTemplate ?? "",
  );
  const [inquiryFormTitle, setInquiryFormTitle] = useState(initial?.inquiryFormTitle ?? "");
  const [appointmentNote, setAppointmentNote] = useState(initial?.appointmentNote ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Satis tipi degisince backend tutarlilik kurallarina uyumlu guvenli
  // varsayilanlar uygulanir; kullanicinin yazdigi metin alanlari ezilmez.
  function changeSalesMode(mode: ProductSalesMode) {
    setSalesMode(mode);
    if (mode === "ONLINE") {
      setPurchasable(true);
      setPrimaryAction("ADD_TO_CART");
      setPriceVisibility((current) =>
        current === "VISIBLE" || current === "STARTING_FROM" ? current : "VISIBLE",
      );
    } else if (mode === "INQUIRY") {
      setPurchasable(false);
      setPrimaryAction("REQUEST_PRICE");
      setInquiryEnabled(true);
    } else if (mode === "APPOINTMENT") {
      setPurchasable(false);
      setPrimaryAction("BOOK_APPOINTMENT");
      setAppointmentRequired(true);
    } else if (mode === "WHATSAPP") {
      setPurchasable(false);
      setPrimaryAction("WHATSAPP");
      setWhatsappEnabled(true);
    } else if (mode === "CATALOG_ONLY") {
      setPurchasable(false);
      setPrimaryAction("NONE");
    }
  }

  // Gizli/talep-uzerine fiyat gorunurlugunde online satin alma kapatilir.
  function changePriceVisibility(value: ProductPriceVisibility) {
    setPriceVisibility(value);
    if (value === "HIDDEN" || value === "ON_REQUEST") setPurchasable(false);
  }

  const showInquiryTitle = salesMode === "INQUIRY" || inquiryEnabled;
  const showAppointmentNote = salesMode === "APPOINTMENT" || appointmentRequired;
  const showWhatsappTemplate = salesMode === "WHATSAPP" || whatsappEnabled;

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

    // Satis davranisi client-side dogrulama (backend nihai otorite).
    const min = Number(minOrderQuantity);
    if (!Number.isInteger(min) || min < 1) {
      setError(sm.minQtyError);
      return;
    }
    let max: number | null = null;
    if (maxOrderQuantity.trim() !== "") {
      max = Number(maxOrderQuantity);
      if (!Number.isInteger(max) || max < min) {
        setError(sm.maxQtyError);
        return;
      }
    }
    if (callToActionLabel.trim().length > CTA_MAX) {
      setError(sm.ctaTooLong);
      return;
    }
    if (whatsappMessageTemplate.trim().length > WHATSAPP_MAX) {
      setError(sm.whatsappTooLong);
      return;
    }
    if (inquiryFormTitle.trim().length > INQUIRY_TITLE_MAX) {
      setError(sm.inquiryTitleTooLong);
      return;
    }
    if (appointmentNote.trim().length > APPOINTMENT_NOTE_MAX) {
      setError(sm.appointmentNoteTooLong);
      return;
    }

    const salesFields = {
      salesMode,
      priceVisibility,
      primaryAction,
      purchasable,
      inquiryEnabled,
      appointmentRequired,
      whatsappEnabled,
      minOrderQuantity: min,
      maxOrderQuantity: max,
      callToActionLabel: callToActionLabel.trim() === "" ? null : callToActionLabel.trim(),
      whatsappMessageTemplate:
        whatsappMessageTemplate.trim() === "" ? null : whatsappMessageTemplate.trim(),
      inquiryFormTitle: inquiryFormTitle.trim() === "" ? null : inquiryFormTitle.trim(),
      appointmentNote: appointmentNote.trim() === "" ? null : appointmentNote.trim(),
    };

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
          ...salesFields,
        });
        onSaved(t.updatedToast);
      } else {
        const payload: ProductCreateRequest = {
          title: title.trim(),
          slug: slug.trim(),
          status,
          type: "PHYSICAL",
          categoryIds,
          ...salesFields,
        };
        if (brand.trim() !== "") payload.brand = brand.trim();
        if (vendor.trim() !== "") payload.vendor = vendor.trim();
        if (description.trim() !== "") payload.description = description.trim();
        await storeApi.createProduct(payload);
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

        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{sm.sectionTitle}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{sm.sectionSubtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              id="product-sales-mode"
              label={sm.modeLabel}
              value={salesMode}
              onChange={(event) => changeSalesMode(event.target.value as ProductSalesMode)}
              disabled={saving}
              options={SALES_MODES.map((value) => ({ value, label: sm.modeLabels[value] }))}
            />
            <Select
              id="product-price-visibility"
              label={sm.priceVisibilityLabel}
              value={priceVisibility}
              onChange={(event) =>
                changePriceVisibility(event.target.value as ProductPriceVisibility)
              }
              disabled={saving}
              options={PRICE_VISIBILITIES.map((value) => ({
                value,
                label: sm.priceVisibilityLabels[value],
              }))}
            />
            <Select
              id="product-primary-action"
              label={sm.actionLabel}
              value={primaryAction}
              onChange={(event) => setPrimaryAction(event.target.value as ProductPrimaryAction)}
              disabled={saving}
              options={PRIMARY_ACTIONS.map((value) => ({
                value,
                label: sm.actionLabels[value],
              }))}
            />
          </div>

          {!purchasable ? (
            <Alert tone="info">
              {salesMode === "ONLINE" ? sm.onlineNotPurchasableHint : sm.notPurchasableHint}
            </Alert>
          ) : null}
          {priceVisibility === "HIDDEN" || priceVisibility === "ON_REQUEST" ? (
            <Alert tone="info">{sm.hiddenPriceHint}</Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SalesToggle
              id="product-purchasable"
              label={sm.purchasableToggle}
              checked={purchasable}
              onChange={setPurchasable}
              disabled={saving}
            />
            <SalesToggle
              id="product-inquiry-enabled"
              label={sm.inquiryEnabledToggle}
              checked={inquiryEnabled}
              onChange={setInquiryEnabled}
              disabled={saving}
            />
            <SalesToggle
              id="product-appointment-required"
              label={sm.appointmentRequiredToggle}
              checked={appointmentRequired}
              onChange={setAppointmentRequired}
              disabled={saving}
            />
            <SalesToggle
              id="product-whatsapp-enabled"
              label={sm.whatsappEnabledToggle}
              checked={whatsappEnabled}
              onChange={setWhatsappEnabled}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="product-min-qty"
              type="number"
              min={1}
              label={sm.minQtyLabel}
              value={minOrderQuantity}
              onChange={(event) => setMinOrderQuantity(event.target.value)}
              disabled={saving}
            />
            <Input
              id="product-max-qty"
              type="number"
              min={1}
              label={sm.maxQtyLabel}
              placeholder={sm.maxQtyPlaceholder}
              value={maxOrderQuantity}
              onChange={(event) => setMaxOrderQuantity(event.target.value)}
              disabled={saving}
            />
          </div>

          <Input
            id="product-cta-label"
            label={sm.ctaLabelLabel}
            placeholder={sm.ctaLabelPlaceholder}
            value={callToActionLabel}
            onChange={(event) => setCallToActionLabel(event.target.value)}
            disabled={saving}
            maxLength={CTA_MAX}
          />

          {showInquiryTitle ? (
            <Input
              id="product-inquiry-title"
              label={sm.inquiryTitleLabel}
              placeholder={sm.inquiryTitlePlaceholder}
              value={inquiryFormTitle}
              onChange={(event) => setInquiryFormTitle(event.target.value)}
              disabled={saving}
              maxLength={INQUIRY_TITLE_MAX}
            />
          ) : null}

          {showAppointmentNote ? (
            <Textarea
              id="product-appointment-note"
              label={sm.appointmentNoteLabel}
              placeholder={sm.appointmentNotePlaceholder}
              value={appointmentNote}
              onChange={(event) => setAppointmentNote(event.target.value)}
              disabled={saving}
              rows={2}
              maxLength={APPOINTMENT_NOTE_MAX}
            />
          ) : null}

          {showWhatsappTemplate ? (
            <Textarea
              id="product-whatsapp-template"
              label={sm.whatsappTemplateLabel}
              placeholder={sm.whatsappTemplatePlaceholder}
              value={whatsappMessageTemplate}
              onChange={(event) => setWhatsappMessageTemplate(event.target.value)}
              disabled={saving}
              rows={2}
              maxLength={WHATSAPP_MAX}
            />
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function SalesToggle({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        checked ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 accent-brand-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      {label}
    </label>
  );
}

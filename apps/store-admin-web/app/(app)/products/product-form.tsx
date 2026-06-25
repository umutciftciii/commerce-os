"use client";

import { useState, type FormEvent } from "react";
import { Alert, Input, Select, Textarea, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
  ProductCreateRequest,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type ProductStatus = Product["status"];

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

/**
 * Ürün oluşturma/düzenleme formu. Modal (create) ve dedicated detail page (edit)
 * tarafından paylaşılır; gönder butonu `form={formId}` ile dışarıdan bağlanır.
 * Kaydetme durumu {@link onSavingChange} ile dışarı bildirilir.
 */
export function ProductForm({
  mode,
  product,
  categories,
  statusLabels,
  formId,
  onSaved,
  onSavingChange,
}: {
  mode: "create" | "edit";
  product?: Product;
  categories: ProductCategory[];
  statusLabels: Record<ProductStatus, string>;
  formId: string;
  onSaved: (message: string, product: Product) => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const f = t.form;
  const sm = t.salesModel;
  const isEdit = mode === "edit";
  const initial = isEdit ? (product ?? null) : null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [status, setStatus] = useState<ProductStatus>(initial?.status ?? "DRAFT");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categoryIds ?? []);

  // Satis davranisi (F2D/F2F alanlari).
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
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(
    initial?.whatsappEnabled ?? false,
  );
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
  const [saving, setSavingState] = useState(false);

  function setSaving(value: boolean) {
    setSavingState(value);
    onSavingChange?.(value);
  }

  // Satis tipi degisince backend tutarlilik kurallarina uyumlu guvenli
  // varsayilanlar uygulanir; kullanicinin yazdigi metin alanlari ezilmez.
  function changeSalesMode(value: ProductSalesMode) {
    setSalesMode(value);
    if (value === "ONLINE") {
      setPurchasable(true);
      setPrimaryAction("ADD_TO_CART");
      setPriceVisibility((current) =>
        current === "VISIBLE" || current === "STARTING_FROM" ? current : "VISIBLE",
      );
    } else if (value === "INQUIRY") {
      setPurchasable(false);
      setPrimaryAction("REQUEST_PRICE");
      setInquiryEnabled(true);
    } else if (value === "APPOINTMENT") {
      setPurchasable(false);
      setPrimaryAction("BOOK_APPOINTMENT");
      setAppointmentRequired(true);
    } else if (value === "WHATSAPP") {
      setPurchasable(false);
      setPrimaryAction("WHATSAPP");
      setWhatsappEnabled(true);
    } else if (value === "CATALOG_ONLY") {
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
      if (isEdit && product) {
        const updated = await storeApi.updateProduct(product.id, {
          title: title.trim(),
          status,
          brand: brand.trim() === "" ? null : brand.trim(),
          vendor: vendor.trim() === "" ? null : vendor.trim(),
          description: description.trim() === "" ? null : description.trim(),
          categoryIds,
          ...salesFields,
        });
        onSaved(dict.storeAdmin.products.detail.savedToast, updated);
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
        const created = await storeApi.createProduct(payload);
        onSaved(t.createdToast, created);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <span className="mb-1.5 block text-sm font-medium text-slate-700">{f.categoriesLabel}</span>
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

      <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-brand-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{sm.sectionTitle}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{sm.sectionSubtitle}</p>
          </div>
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
            onChange={(event) => changePriceVisibility(event.target.value as ProductPriceVisibility)}
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

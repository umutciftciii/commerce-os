"use client";

import { useState, type FormEvent } from "react";
import { Alert, Input, Select, Textarea, useLocale } from "../../../components/ui";
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
import { MediaUpload, type MediaItem } from "../../../components/media-upload";

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
  // Faz 1A (ADR-067) — Ana kategori. Backfill edilmis/mevcut deger hydrate edilir.
  // Tek kategori seçilince otomatik ana olur; ana kaldırılırken yeni ana zorunludur.
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(
    initial?.primaryCategoryId ?? null,
  );

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

  // F3C.2 — Kargo ölçüleri (ürün-seviyesi; varyat fallback'i). String tutulur (boş = null).
  const [shippingWeightKg, setShippingWeightKg] = useState<string>(
    initial?.shippingWeightKg != null ? String(initial.shippingWeightKg) : "",
  );
  const [shippingDesi, setShippingDesi] = useState<string>(
    initial?.shippingDesi != null ? String(initial.shippingDesi) : "",
  );

  // ADR-065 (Faz 2/Dilim 2) — ürün galerisi (yalnız edit; R5). KRİTİK invariant:
  // MediaItem.id = ProductImage'in mediaId'si (ProductImage.id DEĞİL). "Zaten ekli"
  // rozeti ve kütüphane seçimi listMedia'nın döndürdüğü asset.id'ye karşı çalışır;
  // yanlış id kullanılırsa rozet ve reuse kırılır. images[0] = kapak (position 0).
  const [images, setImages] = useState<MediaItem[]>(
    isEdit && initial?.images
      ? initial.images.map((image) => ({ id: image.mediaId, url: image.url, altText: image.altText }))
      : [],
  );

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

  // Faz 1A (ADR-067) — Kategori seçimi ana kategori farkındalığıyla. Backend nihai
  // otoritedir (resolvePrimaryCategorySelection); burada UX tutarlılığı sağlanır:
  //  - tek kategori seçilince otomatik ana olur,
  //  - ana kategori kaldırılırsa tek kategori kaldıysa o otomatik ana; yoksa null
  //    (submit'te "ana kategori seçin" uyarısı çıkar).
  function toggleCategory(id: string) {
    const isRemoving = categoryIds.includes(id);
    const nextIds = isRemoving
      ? categoryIds.filter((value) => value !== id)
      : [...categoryIds, id];
    setCategoryIds(nextIds);
    if (isRemoving) {
      if (primaryCategoryId === id) {
        setPrimaryCategoryId(nextIds.length === 1 ? nextIds[0]! : null);
      }
    } else if (primaryCategoryId === null && nextIds.length === 1) {
      setPrimaryCategoryId(id);
    }
  }

  function selectPrimaryCategory(id: string) {
    if (categoryIds.includes(id)) setPrimaryCategoryId(id);
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

    // Faz 1A (ADR-067) — birden çok kategori seçiliyken ana kategori zorunlu (backend
    // de REQUIRED döner; bu erken/anlaşılır UX içindir).
    if (categoryIds.length > 1 && !primaryCategoryId) {
      setError(f.primaryCategoryRequired);
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

    // Kargo ölçüleri: boş = null; doluysa > 0 olmalı (backend nihai otorite).
    const parseDim = (raw: string): number | null | "ERR" => {
      const value = raw.trim();
      if (value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : "ERR";
    };
    const weightValue = parseDim(shippingWeightKg);
    const desiValue = parseDim(shippingDesi);
    if (weightValue === "ERR" || desiValue === "ERR") {
      setError(f.shippingPositiveError);
      return;
    }
    const shippingFields = { shippingWeightKg: weightValue, shippingDesi: desiValue };

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
          // Faz 1A (ADR-067) — ana kategori (categoryIds ile birlikte gönderilir;
          // backend assignment+primary tutarlılığını tek transaction'da doğrular).
          primaryCategoryId,
          // ADR-065 (Faz 2/Dilim 2) — sıralı galeri; sunucu diff'ler. id = mediaId
          // (invariant). [] gönderilirse galeri temizlenir (R6, toplu kaydet).
          imageMediaIds: images.map((item) => item.id),
          ...salesFields,
          ...shippingFields,
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
          ...shippingFields,
        };
        if (brand.trim() !== "") payload.brand = brand.trim();
        if (vendor.trim() !== "") payload.vendor = vendor.trim();
        if (description.trim() !== "") payload.description = description.trim();
        // Faz 1A (ADR-067) — ana kategori yalnız seçiliyse gönderilir (kategorisiz
        // üründe null; backend tek kategoriyi normalize eder).
        if (primaryCategoryId) payload.primaryCategoryId = primaryCategoryId;
        const created = await storeApi.createProduct(payload);
        onSaved(t.createdToast, created);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
    } finally {
      // F4C bugfix — BAŞARIDA da sıfırla: eskiden yalnız catch'te sıfırlanıyordu
      // ve buton "Kaydediliyor..."da takılı kalıyordu. finally her iki yolda da
      // (başarı/hata) loading'i kapatır; kaydetme sırasında double-submit yine
      // `disabled={saving}` ile engellidir.
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
        <p className="mt-1.5 text-xs text-white/30">{isEdit ? f.slugLockedHint : f.slugHint}</p>
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
        <span className="mb-1.5 block text-sm font-medium text-white/70">{f.categoriesLabel}</span>
        {categories.length === 0 ? (
          <p className="text-sm text-white/30">{f.categoriesEmpty}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-white/30">{f.categoriesHint}</p>
            {/* Faz 1A (ADR-067) — seçili kategorilerden biri "Ana kategori" işaretlenir.
                Tek kategori otomatik ana olur; ana kategori görsel olarak ayırt edilir. */}
            <div className="flex flex-col gap-1.5">
              {categories.map((category) => {
                const checked = categoryIds.includes(category.id);
                const isPrimary = primaryCategoryId === category.id;
                return (
                  <div
                    key={category.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      checked
                        ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                        : "border-white/10 text-white/60"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-indigo-500"
                        checked={checked}
                        onChange={() => toggleCategory(category.id)}
                        disabled={saving}
                      />
                      {category.name}
                    </label>
                    {checked ? (
                      <button
                        type="button"
                        onClick={() => selectPrimaryCategory(category.id)}
                        disabled={saving || isPrimary}
                        aria-pressed={isPrimary}
                        title={f.primaryCategoryHint}
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                          isPrimary
                            ? "bg-indigo-500/30 text-indigo-100"
                            : "border border-white/15 text-white/50 hover:text-white/80"
                        }`}
                      >
                        {isPrimary ? `★ ${f.primaryCategoryBadge}` : f.primaryCategorySet}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-white/30">{f.primaryCategoryHint}</p>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
          <div>
            <h3 className="text-sm font-semibold text-white/90">{sm.sectionTitle}</h3>
            <p className="mt-0.5 text-xs text-white/45">{sm.sectionSubtitle}</p>
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

      <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
          <div>
            <h3 className="text-sm font-semibold text-white/90">{f.shippingSectionTitle}</h3>
            <p className="mt-0.5 text-xs text-white/45">{f.shippingSectionSubtitle}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="product-shipping-weight"
            type="number"
            min={0}
            step="0.001"
            label={f.shippingWeightLabel}
            value={shippingWeightKg}
            onChange={(event) => setShippingWeightKg(event.target.value)}
            disabled={saving}
          />
          <Input
            id="product-shipping-desi"
            type="number"
            min={0}
            step="0.01"
            label={f.shippingDesiLabel}
            value={shippingDesi}
            onChange={(event) => setShippingDesi(event.target.value)}
            disabled={saving}
          />
        </div>
        <p className="text-xs text-white/30">{f.shippingDesiHint}</p>
      </div>

      {/* ADR-065 (Faz 2/Dilim 2) — Görseller. Yalnız edit sayfasında (R5): create'te
          ürün id'si henüz yoktur, ProductImage bağlanamaz. Sıralama/çıkarma/ekleme
          local state'i günceller; kalıcılık toplu "Kaydet"te imageMediaIds ile (R6). */}
      {isEdit ? (
        <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
            <div>
              <h3 className="text-sm font-semibold text-white/90">{f.gallerySectionTitle}</h3>
              <p className="mt-0.5 text-xs text-white/45">{f.gallerySectionSubtitle}</p>
            </div>
          </div>
          <MediaUpload
            context="PRODUCT"
            mode="multiple"
            value={images}
            onAttach={(asset) =>
              setImages((prev) => [...prev, { id: asset.id, url: asset.url, altText: asset.altText }])
            }
            onRemove={(id) => setImages((prev) => prev.filter((item) => item.id !== id))}
            onReorder={(orderedIds) =>
              setImages((prev) => orderedIds.map((id) => prev.find((item) => item.id === id)!))
            }
            disabled={saving}
          />
          <p className="text-xs text-white/30">{f.galleryHint}</p>
        </div>
      ) : null}
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
        checked ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-white/60"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 accent-indigo-500"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      {label}
    </label>
  );
}

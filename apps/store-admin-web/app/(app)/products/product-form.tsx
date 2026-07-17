"use client";

// Faz 2B (TODO-146) — Ürün oluşturma/düzenleme formu. React Hook Form + Zod'a
// taşındı; dağınık useState kaldırıldı. Çekirdek alanlar (title/slug/marka/satış/
// kargo/galeri) davranışını KORUR; kategoriye göre dinamik attribute alanları eklenir
// (ana kategori attribute şemasını sürer). Modal (create) ve detay sayfası (edit)
// tarafından paylaşılır; gönder butonu `form={formId}` ile dışarıdan bağlanır.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Input, Select, Textarea, useLocale } from "../../../components/ui";
import { getDictionary } from "@commerce-os/i18n";
import type {
  Product,
  ProductCategory,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
} from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { MediaUpload } from "../../../components/media-upload";
import {
  buildCreatePayload,
  buildDefaultValues,
  buildUpdatePayload,
  createProductFormResolver,
  CTA_MAX,
  INQUIRY_TITLE_MAX,
  APPOINTMENT_NOTE_MAX,
  WHATSAPP_MAX,
  type CoreValidationMessages,
  type ProductFormValues,
} from "./product-form-schema";
import { useCategoryAttributes } from "./attributes/use-category-attributes";
import { AttributeSection } from "./attributes/attribute-section";
import {
  attributeValuesToInputs,
  buildAttributeValueMap,
  isAttributeServerError,
  type AttributeValidationMessages,
} from "./attributes/value-mapping";
import { emptyAttributeValue, type AttributeValueMap, type ResolvedAttribute } from "./attributes/types";
import { useVariantAttributes } from "./variant-attributes/use-variant-attributes";
import { VariantAttributeSection } from "./variant-attributes/variant-attribute-section";
import { useVariantCombinationPreview } from "./variant-attributes/use-variant-combination-preview";
import { CombinationPreview } from "./variant-attributes/combination-preview";
import { useVariantGeneration } from "./variant-attributes/use-variant-generation";
import { GenerateVariantsAction } from "./variant-attributes/generate-variants-action";
import {
  buildVariantSelectionMap,
  emptyVariantSelectionMap,
  isVariantSelectionServerError,
  validateVariantSelections,
  variantSelectionsToInputs,
} from "./variant-attributes/variant-selection-mapping";
import type { ResolvedVariantAttribute } from "./variant-attributes/types";

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

function formatTemplate(template: string, value: number): string {
  return template.replace("{value}", String(value));
}

/**
 * Ürün oluşturma/düzenleme formu (RHF). Public API (props) Faz 2A ile birebir korunur:
 * mevcut sayfa/modal ve testler değişmeden çalışır.
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
  const a = t.attributes;
  const va = t.variantAttributes;
  const isEdit = mode === "edit";

  const [rootError, setRootError] = useState<string | null>(null);
  // Faz 2C-1 — varyant eksen (attributeDefinitionId → mesaj) client/server hataları.
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  // Faz 2C-2 — Combination Engine önizlemesini yeniden çekmek için sinyal (her kaydetmede artar).
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);

  // Kategori-güdümlü attribute şeması, güncel çözümlenmiş liste resolver'a ref ile geçer.
  const attributesRef = useRef<ResolvedAttribute[]>([]);
  // Faz 2C-1 — güncel çözümlenmiş varyant eksenleri (submit'te payload derlemek için).
  const variantAttributesRef = useRef<ResolvedVariantAttribute[]>([]);

  const coreMessages = useMemo<CoreValidationMessages>(
    () => ({
      requiredTitle: f.requiredTitle,
      requiredSlug: f.requiredSlug,
      primaryCategoryRequired: f.primaryCategoryRequired,
      minQtyError: sm.minQtyError,
      maxQtyError: sm.maxQtyError,
      ctaTooLong: sm.ctaTooLong,
      whatsappTooLong: sm.whatsappTooLong,
      inquiryTitleTooLong: sm.inquiryTitleTooLong,
      appointmentNoteTooLong: sm.appointmentNoteTooLong,
      shippingPositiveError: f.shippingPositiveError,
    }),
    [f, sm],
  );

  const attributeMessages = useMemo<AttributeValidationMessages>(
    () => ({
      required: a.validation.required,
      invalidNumber: a.validation.invalidNumber,
      invalidInteger: a.validation.invalidInteger,
      invalidUrl: a.validation.invalidUrl,
      min: (limit) => formatTemplate(a.validation.min, limit),
      max: (limit) => formatTemplate(a.validation.max, limit),
      minLength: (limit) => formatTemplate(a.validation.minLength, limit),
      maxLength: (limit) => formatTemplate(a.validation.maxLength, limit),
      pattern: a.validation.pattern,
    }),
    [a],
  );

  const resolver = useMemo(
    () =>
      createProductFormResolver(
        mode,
        coreMessages,
        () => attributesRef.current,
        attributeMessages,
      ),
    [mode, coreMessages, attributeMessages],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    defaultValues: buildDefaultValues(mode, product),
    resolver,
    mode: "onSubmit",
  });

  useEffect(() => {
    onSavingChange?.(isSubmitting);
  }, [isSubmitting, onSavingChange]);

  const salesMode = watch("salesMode");
  const priceVisibility = watch("priceVisibility");
  const primaryAction = watch("primaryAction");
  const purchasable = watch("purchasable");
  const inquiryEnabled = watch("inquiryEnabled");
  const appointmentRequired = watch("appointmentRequired");
  const whatsappEnabled = watch("whatsappEnabled");
  const status = watch("status");
  const categoryIds = watch("categoryIds");
  const primaryCategoryId = watch("primaryCategoryId");
  const images = watch("images");
  const variantSelections = watch("variantSelections");

  // Ana kategori attribute şemasını sürer (memoized fetch/join; md.13).
  const attrState = useCategoryAttributes(primaryCategoryId, { groupLabel: a.generalGroup });
  attributesRef.current = attrState.attributes;

  // Faz 2C-1 — ana kategori VARYANT eksen şemasını sürer (variantDefining=true + option-tabanlı).
  const variantAttrState = useVariantAttributes(primaryCategoryId);
  variantAttributesRef.current = variantAttrState.attributes;

  // Faz 2C-2 — ürünün KALICI eksen reçetesinden ÜRETİLECEK kombinasyonların önizlemesi (yalnız
  // düzenleme modunda VE kategori varyant-defining eksen tanımladıysa; kaydedilmiş seçimi yansıtır).
  // Eksen yoksa preview de yok (bölüm gizli) → mevcut/legacy akış birebir korunur. ProductVariant ÜRETMEZ.
  const hasVariantAxes = variantAttrState.attributes.length > 0;
  const combinationPreview = useVariantCombinationPreview(
    isEdit && product && hasVariantAxes ? product.id : null,
    previewRefreshToken,
  );

  // Faz 2C-3 — kalıcı varyant ÜRETİMİ. Başarıda önizlemeyi güncel reçeteden yeniden çeker.
  const variantGeneration = useVariantGeneration(
    isEdit && product && hasVariantAxes ? product.id : null,
    () => setPreviewRefreshToken((token) => token + 1),
  );

  // Attribute şeması değişince form `attributes` alanını başlat. Düzenlemede İLK
  // yükleme (kategori = ürünün mevcut ana kategorisi) mevcut değerleri round-trip'ler.
  const hydratedCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (attrState.loading) return;
    const resolved = attrState.attributes;
    if (resolved.length === 0) {
      if (Object.keys(getValues("attributes")).length > 0) {
        setValue("attributes", {}, { shouldValidate: false });
      }
      return;
    }

    const base: AttributeValueMap = {};
    for (const attr of resolved) base[attr.attributeDefinitionId] = emptyAttributeValue(attr.dataType);

    const isInitialEditCategory =
      isEdit && product != null && primaryCategoryId === product.primaryCategoryId;

    if (isInitialEditCategory && hydratedCategoryRef.current !== primaryCategoryId) {
      hydratedCategoryRef.current = primaryCategoryId;
      let cancelled = false;
      void storeApi
        .getProductAttributeValues(product.id)
        .then((response) => {
          if (cancelled) return;
          setValue("attributes", buildAttributeValueMap(resolved, response.data), {
            shouldValidate: false,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setValue("attributes", base, { shouldValidate: false });
        });
      return () => {
        cancelled = true;
      };
    }

    // Kategori farklı bir değere değiştiyse taze (boş) şema.
    setValue("attributes", base, { shouldValidate: false });
    return;
  }, [attrState.attributes, attrState.loading]);

  // Faz 2C-1 — Varyant eksen şeması değişince form `variantSelections` alanını başlat.
  // Düzenlemede İLK yükleme (kategori = ürünün mevcut ana kategorisi) mevcut seçimi round-trip'ler.
  const variantHydratedCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (variantAttrState.loading) return;
    const resolved = variantAttrState.attributes;
    setVariantErrors({});
    if (resolved.length === 0) {
      if (Object.keys(getValues("variantSelections")).length > 0) {
        setValue("variantSelections", {}, { shouldValidate: false });
      }
      return;
    }

    const base = emptyVariantSelectionMap(resolved);

    const isInitialEditCategory =
      isEdit && product != null && primaryCategoryId === product.primaryCategoryId;

    if (isInitialEditCategory && variantHydratedCategoryRef.current !== primaryCategoryId) {
      variantHydratedCategoryRef.current = primaryCategoryId;
      let cancelled = false;
      void storeApi
        .getProductVariantSelections(product.id)
        .then((response) => {
          if (cancelled) return;
          setValue("variantSelections", buildVariantSelectionMap(resolved, response.data), {
            shouldValidate: false,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setValue("variantSelections", base, { shouldValidate: false });
        });
      return () => {
        cancelled = true;
      };
    }

    // Kategori farklı bir değere değiştiyse taze (boş) şema.
    setValue("variantSelections", base, { shouldValidate: false });
    return;
  }, [variantAttrState.attributes, variantAttrState.loading]);

  // ─── Cross-field handler'lar (mevcut davranış birebir) ───
  const changeSalesMode = useCallback(
    (value: ProductSalesMode) => {
      setValue("salesMode", value, { shouldDirty: true });
      if (value === "ONLINE") {
        setValue("purchasable", true);
        setValue("primaryAction", "ADD_TO_CART");
        const current = getValues("priceVisibility");
        setValue(
          "priceVisibility",
          current === "VISIBLE" || current === "STARTING_FROM" ? current : "VISIBLE",
        );
      } else if (value === "INQUIRY") {
        setValue("purchasable", false);
        setValue("primaryAction", "REQUEST_PRICE");
        setValue("inquiryEnabled", true);
      } else if (value === "APPOINTMENT") {
        setValue("purchasable", false);
        setValue("primaryAction", "BOOK_APPOINTMENT");
        setValue("appointmentRequired", true);
      } else if (value === "WHATSAPP") {
        setValue("purchasable", false);
        setValue("primaryAction", "WHATSAPP");
        setValue("whatsappEnabled", true);
      } else if (value === "CATALOG_ONLY") {
        setValue("purchasable", false);
        setValue("primaryAction", "NONE");
      }
    },
    [setValue, getValues],
  );

  const changePriceVisibility = useCallback(
    (value: ProductPriceVisibility) => {
      setValue("priceVisibility", value, { shouldDirty: true });
      if (value === "HIDDEN" || value === "ON_REQUEST") setValue("purchasable", false);
    },
    [setValue],
  );

  const toggleCategory = useCallback(
    (id: string) => {
      const currentIds = getValues("categoryIds");
      const currentPrimary = getValues("primaryCategoryId");
      const isRemoving = currentIds.includes(id);
      const nextIds = isRemoving ? currentIds.filter((value) => value !== id) : [...currentIds, id];
      setValue("categoryIds", nextIds, { shouldDirty: true });
      if (isRemoving) {
        if (currentPrimary === id) {
          setValue("primaryCategoryId", nextIds.length === 1 ? nextIds[0]! : null);
        }
      } else if (currentPrimary === null && nextIds.length === 1) {
        setValue("primaryCategoryId", id);
      }
    },
    [getValues, setValue],
  );

  const selectPrimaryCategory = useCallback(
    (id: string) => {
      if (getValues("categoryIds").includes(id)) setValue("primaryCategoryId", id, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  // Faz 2C-1 — Varyant eksen aç/kapat (attribute'u eksen olarak seç/kaldır). Option'lar korunur.
  const clearVariantError = useCallback((defId: string) => {
    setVariantErrors((prev) => {
      if (!(defId in prev)) return prev;
      const next = { ...prev };
      delete next[defId];
      return next;
    });
  }, []);

  const toggleVariantAxis = useCallback(
    (defId: string) => {
      const current = getValues("variantSelections");
      const entry = current[defId] ?? { enabled: false, optionIds: [] };
      setValue(
        "variantSelections",
        { ...current, [defId]: { ...entry, enabled: !entry.enabled } },
        { shouldDirty: true },
      );
      clearVariantError(defId);
    },
    [getValues, setValue, clearVariantError],
  );

  // Faz 2C-1 — Bir eksen altında option seç/kaldır.
  const toggleVariantOption = useCallback(
    (defId: string, optionId: string) => {
      const current = getValues("variantSelections");
      const entry = current[defId] ?? { enabled: true, optionIds: [] };
      const optionIds = entry.optionIds.includes(optionId)
        ? entry.optionIds.filter((id) => id !== optionId)
        : [...entry.optionIds, optionId];
      setValue(
        "variantSelections",
        { ...current, [defId]: { ...entry, optionIds } },
        { shouldDirty: true },
      );
      clearVariantError(defId);
    },
    [getValues, setValue, clearVariantError],
  );

  const showInquiryTitle = salesMode === "INQUIRY" || inquiryEnabled;
  const showAppointmentNote = salesMode === "APPOINTMENT" || appointmentRequired;
  const showWhatsappTemplate = salesMode === "WHATSAPP" || whatsappEnabled;

  const statusOptions = (Object.keys(statusLabels) as ProductStatus[]).map((value) => ({
    value,
    label: statusLabels[value],
  }));

  const attributeServerMessage = useCallback(
    (code: string): string => {
      const map = a.serverErrors as Record<string, string>;
      return map[code] ?? map.default;
    },
    [a],
  );

  const variantServerMessage = useCallback(
    (code: string): string => {
      const map = va.serverErrors as Record<string, string>;
      return map[code] ?? map.default;
    },
    [va],
  );

  const onValid = async (values: ProductFormValues) => {
    setRootError(null);
    const resolved = attributesRef.current;
    // Kategori attribute tanımlamamışsa attributeValues GÖNDERİLMEZ (undefined) →
    // legacy davranış korunur (md.12). Aksi halde replace-set (dolu değerler).
    const attributeValues = resolved.length > 0 ? attributeValuesToInputs(resolved, values.attributes) : undefined;

    // Faz 2C-1 — varyant eksen seçimi: kategori variantDefining attribute tanımlamamışsa
    // GÖNDERİLMEZ (undefined → legacy korunur). Aksi halde yalnız enabled eksenler (replace-set).
    const variantResolved = variantAttributesRef.current;
    let variantSelectionsInput: ReturnType<typeof variantSelectionsToInputs> | undefined;
    if (variantResolved.length > 0) {
      // Client-side: her etkin eksende ≥1 option (backend VARIANT_OPTION_REQUIRED'ı erken yakala).
      const clientErrors = validateVariantSelections(variantResolved, values.variantSelections, va.optionRequired);
      if (Object.keys(clientErrors).length > 0) {
        setVariantErrors(clientErrors);
        return;
      }
      variantSelectionsInput = variantSelectionsToInputs(variantResolved, values.variantSelections);
    }

    try {
      if (isEdit && product) {
        const updated = await storeApi.updateProduct(
          product.id,
          buildUpdatePayload(values, attributeValues, variantSelectionsInput),
        );
        // Kalıcı seçim değişmiş olabilir → önizlemeyi güncel reçeteden yeniden çek.
        setPreviewRefreshToken((token) => token + 1);
        onSaved(t.detail.savedToast, updated);
      } else {
        const created = await storeApi.createProduct(
          buildCreatePayload(values, attributeValues, variantSelectionsInput),
        );
        onSaved(t.createdToast, created);
      }
    } catch (caught) {
      // Backend attribute hatası → mümkünse alan-seviyesine bağla (md.11).
      if (
        caught instanceof UiError &&
        isAttributeServerError(caught.code) &&
        caught.details?.attributeDefinitionId
      ) {
        setError(`attributes.${caught.details.attributeDefinitionId}` as never, {
          type: "server",
          message: attributeServerMessage(caught.code),
        });
        return;
      }
      // Faz 2C-1 — Backend varyant seçim hatası → ilgili eksene bağla.
      if (
        caught instanceof UiError &&
        isVariantSelectionServerError(caught.code) &&
        caught.details?.attributeDefinitionId
      ) {
        const defId = caught.details.attributeDefinitionId;
        setVariantErrors((prev) => ({ ...prev, [defId]: variantServerMessage(caught.code) }));
        return;
      }
      setRootError(messageForError(caught, locale));
    }
  };

  const fieldError = (name: keyof ProductFormValues): string | undefined => {
    const entry = errors[name] as { message?: string } | undefined;
    return entry?.message;
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <div>
        <Input
          id="product-title"
          label={f.titleLabel}
          placeholder={f.titlePlaceholder}
          disabled={isSubmitting}
          required
          aria-invalid={fieldError("title") ? true : undefined}
          {...register("title")}
        />
        {fieldError("title") ? (
          <p role="alert" className="mt-1 text-xs text-rose-300">
            {fieldError("title")}
          </p>
        ) : null}
      </div>

      <div>
        <Input
          id="product-slug"
          label={f.slugLabel}
          placeholder={f.slugPlaceholder}
          disabled={isSubmitting || isEdit}
          required={!isEdit}
          aria-invalid={fieldError("slug") ? true : undefined}
          {...register("slug")}
        />
        <p className="mt-1.5 text-xs text-white/30">{isEdit ? f.slugLockedHint : f.slugHint}</p>
        {fieldError("slug") ? (
          <p role="alert" className="mt-1 text-xs text-rose-300">
            {fieldError("slug")}
          </p>
        ) : null}
      </div>

      <Select
        id="product-status"
        label={f.statusLabel}
        options={statusOptions}
        value={status}
        onChange={(event) => setValue("status", event.target.value as ProductStatus, { shouldDirty: true })}
        disabled={isSubmitting}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="product-brand"
          label={f.brandLabel}
          placeholder={f.brandPlaceholder}
          disabled={isSubmitting}
          {...register("brand")}
        />
        <Input
          id="product-vendor"
          label={f.vendorLabel}
          placeholder={f.vendorPlaceholder}
          disabled={isSubmitting}
          {...register("vendor")}
        />
      </div>

      <Textarea
        id="product-description"
        label={f.descriptionLabel}
        placeholder={f.descriptionPlaceholder}
        disabled={isSubmitting}
        rows={3}
        {...register("description")}
      />

      <div>
        <span className="mb-1.5 block text-sm font-medium text-white/70">{f.categoriesLabel}</span>
        {categories.length === 0 ? (
          <p className="text-sm text-white/30">{f.categoriesEmpty}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-white/30">{f.categoriesHint}</p>
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
                        disabled={isSubmitting}
                      />
                      {category.name}
                    </label>
                    {checked ? (
                      <button
                        type="button"
                        onClick={() => selectPrimaryCategory(category.id)}
                        disabled={isSubmitting || isPrimary}
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
            {fieldError("primaryCategoryId") ? (
              <p role="alert" className="mt-1 text-xs text-rose-300">
                {fieldError("primaryCategoryId")}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Faz 2B — Kategori-güdümlü dinamik attribute alanları. Legacy kategoride
          (attribute tanımlı değil) hiçbir şey render edilmez. */}
      <AttributeSection
        control={control}
        state={attrState}
        disabled={isSubmitting}
        labels={{
          sectionTitle: a.generalGroup,
          loadingLabel: a.loading,
          errorLabel: a.loadError,
          requiredHint: a.requiredHint,
          optionalHint: a.optionalHint,
        }}
      />

      {/* Faz 2C-1 (ADR-070) — Varyant EKSEN seçimi. Kategori variantDefining + option-tabanlı
          attribute tanımlamamışsa hiçbir şey render edilmez. KOMBINASYON URETMEZ. */}
      <VariantAttributeSection
        state={variantAttrState}
        value={variantSelections}
        errors={variantErrors}
        disabled={isSubmitting}
        onToggleAxis={toggleVariantAxis}
        onToggleOption={toggleVariantOption}
        labels={{
          sectionTitle: va.sectionTitle,
          sectionSubtitle: va.sectionSubtitle,
          loadingLabel: va.loading,
          errorLabel: va.loadError,
          optionsLabel: va.optionsLabel,
          optionRequired: va.optionRequired,
        }}
      />

      {/* Faz 2C-2 (ADR-071) — Oluşacak varyant kombinasyonlarının SALT-OKUNUR önizlemesi
          (yalnız düzenleme; kaydedilmiş reçeteden). DÜZENLEME/YAZMA YOK; ProductVariant ÜRETMEZ. */}
      <CombinationPreview
        state={combinationPreview}
        labels={{
          sectionTitle: va.previewTitle,
          sectionSubtitle: va.previewSubtitle,
          loadingLabel: va.previewLoading,
          errorLabel: va.previewError,
          limitLabel: va.previewLimit,
          countLabel: (count) => formatTemplate(va.previewCount, count),
          emptyLabel: va.previewEmpty,
        }}
      />

      {/* Faz 2C-3 (ADR-072) — "Varyantları Oluştur" aksiyonu + sonuç özeti. Yalnız düzenleme + eksen
          varsa görünür; preview limiti aşıldıysa / yükleniyorsa pasif. SKU Matrix DEĞİL. */}
      <GenerateVariantsAction
        visible={Boolean(isEdit && product && hasVariantAxes)}
        disabled={
          combinationPreview.loading ||
          combinationPreview.errorCode !== null ||
          !combinationPreview.data ||
          combinationPreview.data.totalCombinations === 0
        }
        controller={variantGeneration}
        labels={{
          sectionTitle: va.generateTitle,
          sectionSubtitle: va.generateSubtitle,
          button: va.generateButton,
          generating: va.generating,
          summaryTitle: va.generateSummaryTitle,
          createdLabel: (count) => formatTemplate(va.generatedCreated, count),
          keptLabel: (count) => formatTemplate(va.generatedKept, count),
          restoredLabel: (count) => formatTemplate(va.generatedRestored, count),
          archivedLabel: (count) => formatTemplate(va.generatedArchived, count),
          manualLabel: (count) => formatTemplate(va.generatedManual, count),
          serverErrors: va.generateServerErrors,
        }}
      />

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
            disabled={isSubmitting}
            options={SALES_MODES.map((value) => ({ value, label: sm.modeLabels[value] }))}
          />
          <Select
            id="product-price-visibility"
            label={sm.priceVisibilityLabel}
            value={priceVisibility}
            onChange={(event) => changePriceVisibility(event.target.value as ProductPriceVisibility)}
            disabled={isSubmitting}
            options={PRICE_VISIBILITIES.map((value) => ({
              value,
              label: sm.priceVisibilityLabels[value],
            }))}
          />
          <Select
            id="product-primary-action"
            label={sm.actionLabel}
            value={primaryAction}
            onChange={(event) =>
              setValue("primaryAction", event.target.value as ProductPrimaryAction, { shouldDirty: true })
            }
            disabled={isSubmitting}
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
            onChange={(value) => setValue("purchasable", value, { shouldDirty: true })}
            disabled={isSubmitting}
          />
          <SalesToggle
            id="product-inquiry-enabled"
            label={sm.inquiryEnabledToggle}
            checked={inquiryEnabled}
            onChange={(value) => setValue("inquiryEnabled", value, { shouldDirty: true })}
            disabled={isSubmitting}
          />
          <SalesToggle
            id="product-appointment-required"
            label={sm.appointmentRequiredToggle}
            checked={appointmentRequired}
            onChange={(value) => setValue("appointmentRequired", value, { shouldDirty: true })}
            disabled={isSubmitting}
          />
          <SalesToggle
            id="product-whatsapp-enabled"
            label={sm.whatsappEnabledToggle}
            checked={whatsappEnabled}
            onChange={(value) => setValue("whatsappEnabled", value, { shouldDirty: true })}
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              id="product-min-qty"
              type="number"
              min={1}
              label={sm.minQtyLabel}
              disabled={isSubmitting}
              {...register("minOrderQuantity")}
            />
            {fieldError("minOrderQuantity") ? (
              <p role="alert" className="mt-1 text-xs text-rose-300">
                {fieldError("minOrderQuantity")}
              </p>
            ) : null}
          </div>
          <div>
            <Input
              id="product-max-qty"
              type="number"
              min={1}
              label={sm.maxQtyLabel}
              placeholder={sm.maxQtyPlaceholder}
              disabled={isSubmitting}
              {...register("maxOrderQuantity")}
            />
            {fieldError("maxOrderQuantity") ? (
              <p role="alert" className="mt-1 text-xs text-rose-300">
                {fieldError("maxOrderQuantity")}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <Input
            id="product-cta-label"
            label={sm.ctaLabelLabel}
            placeholder={sm.ctaLabelPlaceholder}
            disabled={isSubmitting}
            maxLength={CTA_MAX}
            {...register("callToActionLabel")}
          />
          {fieldError("callToActionLabel") ? (
            <p role="alert" className="mt-1 text-xs text-rose-300">
              {fieldError("callToActionLabel")}
            </p>
          ) : null}
        </div>

        {showInquiryTitle ? (
          <Input
            id="product-inquiry-title"
            label={sm.inquiryTitleLabel}
            placeholder={sm.inquiryTitlePlaceholder}
            disabled={isSubmitting}
            maxLength={INQUIRY_TITLE_MAX}
            {...register("inquiryFormTitle")}
          />
        ) : null}

        {showAppointmentNote ? (
          <Textarea
            id="product-appointment-note"
            label={sm.appointmentNoteLabel}
            placeholder={sm.appointmentNotePlaceholder}
            disabled={isSubmitting}
            rows={2}
            maxLength={APPOINTMENT_NOTE_MAX}
            {...register("appointmentNote")}
          />
        ) : null}

        {showWhatsappTemplate ? (
          <Textarea
            id="product-whatsapp-template"
            label={sm.whatsappTemplateLabel}
            placeholder={sm.whatsappTemplatePlaceholder}
            disabled={isSubmitting}
            rows={2}
            maxLength={WHATSAPP_MAX}
            {...register("whatsappMessageTemplate")}
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
            disabled={isSubmitting}
            aria-invalid={fieldError("shippingWeightKg") ? true : undefined}
            {...register("shippingWeightKg")}
          />
          <Input
            id="product-shipping-desi"
            type="number"
            min={0}
            step="0.01"
            label={f.shippingDesiLabel}
            disabled={isSubmitting}
            {...register("shippingDesi")}
          />
        </div>
        {fieldError("shippingWeightKg") ? (
          <p role="alert" className="text-xs text-rose-300">
            {fieldError("shippingWeightKg")}
          </p>
        ) : (
          <p className="text-xs text-white/30">{f.shippingDesiHint}</p>
        )}
      </div>

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
              setValue("images", [...getValues("images"), { id: asset.id, url: asset.url, altText: asset.altText }], {
                shouldDirty: true,
              })
            }
            onRemove={(id) =>
              setValue(
                "images",
                getValues("images").filter((item) => item.id !== id),
                { shouldDirty: true },
              )
            }
            onReorder={(orderedIds) =>
              setValue(
                "images",
                orderedIds.map((id) => getValues("images").find((item) => item.id === id)!),
                { shouldDirty: true },
              )
            }
            disabled={isSubmitting}
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

// Faz 2B (TODO-146) — Ürün formu Zod şeması + tipler + varsayılan/mapper'lar +
// birleşik resolver. Çekirdek alanlar Zod ile doğrulanır (mevcut elle onSubmit
// doğrulamasının birebir karşılığı); dinamik attribute alanları backend-şekilli
// kurallarla ayrıca doğrulanır (validateAttributeValue) ve resolver'da birleştirilir.

import { z } from "zod";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type {
  Product,
  ProductCreateRequest,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
  ProductUpdateRequest,
} from "@commerce-os/api-client";
import type { MediaItem } from "../../../components/media-upload";
import type { AttributeValueMap, ResolvedAttribute } from "./attributes/types";
import {
  validateAttributeValue,
  type AttributeValidationMessages,
} from "./attributes/value-mapping";

type ProductStatus = Product["status"];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Kontrat ile aynı uzunluk sınırları (Faz 2F satış davranışı).
export const CTA_MAX = 120;
export const WHATSAPP_MAX = 500;
export const INQUIRY_TITLE_MAX = 160;
export const APPOINTMENT_NOTE_MAX = 500;

export interface ProductFormValues {
  title: string;
  slug: string;
  status: ProductStatus;
  brand: string;
  vendor: string;
  description: string;
  categoryIds: string[];
  primaryCategoryId: string | null;
  salesMode: ProductSalesMode;
  priceVisibility: ProductPriceVisibility;
  primaryAction: ProductPrimaryAction;
  purchasable: boolean;
  inquiryEnabled: boolean;
  appointmentRequired: boolean;
  whatsappEnabled: boolean;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  callToActionLabel: string;
  whatsappMessageTemplate: string;
  inquiryFormTitle: string;
  appointmentNote: string;
  shippingWeightKg: string;
  shippingDesi: string;
  images: MediaItem[];
  attributes: AttributeValueMap;
}

/** Çekirdek doğrulama mesajları (i18n'den enjekte edilir). */
export interface CoreValidationMessages {
  requiredTitle: string;
  requiredSlug: string;
  primaryCategoryRequired: string;
  minQtyError: string;
  maxQtyError: string;
  ctaTooLong: string;
  whatsappTooLong: string;
  inquiryTitleTooLong: string;
  appointmentNoteTooLong: string;
  shippingPositiveError: string;
}

/** "" → null; doluysa > 0 sonlu sayı; aksi halde "ERR". */
function parseDimension(raw: string): number | null | "ERR" {
  const value = raw.trim();
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "ERR";
}

/**
 * Çekirdek alan şeması. Alanlar gevşek tutulur; tüm iş kuralları tek superRefine'da
 * uygulanır (mevcut onSubmit ile birebir). Bilinmeyen anahtarlar (images/attributes/
 * boolean'lar) yok sayılır — resolver başarıda ham değerleri döndürür, bu yüzden
 * strip önemli değildir.
 */
export function buildCoreSchema(mode: "create" | "edit", messages: CoreValidationMessages) {
  return z
    .object({
      title: z.string(),
      slug: z.string(),
      categoryIds: z.array(z.string()),
      primaryCategoryId: z.string().nullable(),
      minOrderQuantity: z.string(),
      maxOrderQuantity: z.string(),
      callToActionLabel: z.string(),
      whatsappMessageTemplate: z.string(),
      inquiryFormTitle: z.string(),
      appointmentNote: z.string(),
      shippingWeightKg: z.string(),
      shippingDesi: z.string(),
    })
    .superRefine((value, ctx) => {
      if (value.title.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: messages.requiredTitle });
      }
      if (mode === "create" && !SLUG_PATTERN.test(value.slug.trim())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["slug"], message: messages.requiredSlug });
      }
      if (value.categoryIds.length > 1 && !value.primaryCategoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["primaryCategoryId"],
          message: messages.primaryCategoryRequired,
        });
      }
      const min = Number(value.minOrderQuantity);
      if (!Number.isInteger(min) || min < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minOrderQuantity"],
          message: messages.minQtyError,
        });
      }
      if (value.maxOrderQuantity.trim() !== "") {
        const max = Number(value.maxOrderQuantity);
        if (!Number.isInteger(max) || max < min) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["maxOrderQuantity"],
            message: messages.maxQtyError,
          });
        }
      }
      if (value.callToActionLabel.trim().length > CTA_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["callToActionLabel"],
          message: messages.ctaTooLong,
        });
      }
      if (value.whatsappMessageTemplate.trim().length > WHATSAPP_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["whatsappMessageTemplate"],
          message: messages.whatsappTooLong,
        });
      }
      if (value.inquiryFormTitle.trim().length > INQUIRY_TITLE_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inquiryFormTitle"],
          message: messages.inquiryTitleTooLong,
        });
      }
      if (value.appointmentNote.trim().length > APPOINTMENT_NOTE_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["appointmentNote"],
          message: messages.appointmentNoteTooLong,
        });
      }
      if (parseDimension(value.shippingWeightKg) === "ERR" || parseDimension(value.shippingDesi) === "ERR") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shippingWeightKg"],
          message: messages.shippingPositiveError,
        });
      }
    });
}

/**
 * Çekirdek Zod + dinamik attribute doğrulamasını birleştiren RHF resolver. Attribute
 * kuralları güncel çözümlenmiş şemadan (ref) okunur; kategori değişince yeni resolver
 * oluşturmaya gerek kalmaz.
 */
export function createProductFormResolver(
  mode: "create" | "edit",
  coreMessages: CoreValidationMessages,
  getAttributes: () => ResolvedAttribute[],
  attributeMessages: AttributeValidationMessages,
): Resolver<ProductFormValues> {
  const coreResolver = zodResolver(buildCoreSchema(mode, coreMessages)) as Resolver<ProductFormValues>;
  return async (values, context, options) => {
    const base = await coreResolver(values, context, options);
    const errors: Record<string, unknown> = { ...base.errors };
    const attributeErrors: Record<string, { type: string; message: string }> = {};

    for (const attr of getAttributes()) {
      const raw = values.attributes?.[attr.attributeDefinitionId];
      const message = validateAttributeValue(
        attr,
        raw ?? (Array.isArray(raw) ? [] : ""),
        attributeMessages,
      );
      if (message) {
        attributeErrors[attr.attributeDefinitionId] = { type: "validate", message };
      }
    }
    if (Object.keys(attributeErrors).length > 0) {
      errors.attributes = attributeErrors;
    }

    const hasErrors = Object.keys(errors).length > 0;
    return {
      values: hasErrors ? {} : values,
      errors: errors as never,
    };
  };
}

/** Bir ürün/moda göre başlangıç form değerleri (mevcut useState başlangıçları ile birebir). */
export function buildDefaultValues(mode: "create" | "edit", product?: Product): ProductFormValues {
  const initial = mode === "edit" ? (product ?? null) : null;
  return {
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    status: initial?.status ?? "DRAFT",
    brand: initial?.brand ?? "",
    vendor: initial?.vendor ?? "",
    description: initial?.description ?? "",
    categoryIds: initial?.categoryIds ?? [],
    primaryCategoryId: initial?.primaryCategoryId ?? null,
    salesMode: initial?.salesMode ?? "ONLINE",
    priceVisibility: initial?.priceVisibility ?? "VISIBLE",
    primaryAction: initial?.primaryAction ?? "ADD_TO_CART",
    purchasable: initial?.purchasable ?? true,
    inquiryEnabled: initial?.inquiryEnabled ?? false,
    appointmentRequired: initial?.appointmentRequired ?? false,
    whatsappEnabled: initial?.whatsappEnabled ?? false,
    minOrderQuantity: String(initial?.minOrderQuantity ?? 1),
    maxOrderQuantity: initial?.maxOrderQuantity != null ? String(initial.maxOrderQuantity) : "",
    callToActionLabel: initial?.callToActionLabel ?? "",
    whatsappMessageTemplate: initial?.whatsappMessageTemplate ?? "",
    inquiryFormTitle: initial?.inquiryFormTitle ?? "",
    appointmentNote: initial?.appointmentNote ?? "",
    shippingWeightKg: initial?.shippingWeightKg != null ? String(initial.shippingWeightKg) : "",
    shippingDesi: initial?.shippingDesi != null ? String(initial.shippingDesi) : "",
    images:
      mode === "edit" && initial?.images
        ? initial.images.map((image) => ({ id: image.mediaId, url: image.url, altText: image.altText }))
        : [],
    attributes: {},
  };
}

/** Satış davranışı alt-payload'ı (create + update ortak). */
function salesFields(values: ProductFormValues) {
  const min = Number(values.minOrderQuantity);
  const max = values.maxOrderQuantity.trim() === "" ? null : Number(values.maxOrderQuantity);
  const trimOrNull = (raw: string) => (raw.trim() === "" ? null : raw.trim());
  return {
    salesMode: values.salesMode,
    priceVisibility: values.priceVisibility,
    primaryAction: values.primaryAction,
    purchasable: values.purchasable,
    inquiryEnabled: values.inquiryEnabled,
    appointmentRequired: values.appointmentRequired,
    whatsappEnabled: values.whatsappEnabled,
    minOrderQuantity: min,
    maxOrderQuantity: max,
    callToActionLabel: trimOrNull(values.callToActionLabel),
    whatsappMessageTemplate: trimOrNull(values.whatsappMessageTemplate),
    inquiryFormTitle: trimOrNull(values.inquiryFormTitle),
    appointmentNote: trimOrNull(values.appointmentNote),
  };
}

function shippingFields(values: ProductFormValues) {
  const parse = (raw: string): number | null => {
    const value = raw.trim();
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return { shippingWeightKg: parse(values.shippingWeightKg), shippingDesi: parse(values.shippingDesi) };
}

/**
 * Güncelleme payload'ı. `attributeValues` YALNIZCA çağıran verdiğinde eklenir
 * (kategori attribute şeması boşsa undefined → eski davranış korunur; legacy ürünler
 * bozulmaz).
 */
export function buildUpdatePayload(
  values: ProductFormValues,
  attributeValues?: ProductUpdateRequest["attributeValues"],
): ProductUpdateRequest {
  const payload: ProductUpdateRequest = {
    title: values.title.trim(),
    status: values.status,
    brand: values.brand.trim() === "" ? null : values.brand.trim(),
    vendor: values.vendor.trim() === "" ? null : values.vendor.trim(),
    description: values.description.trim() === "" ? null : values.description.trim(),
    categoryIds: values.categoryIds,
    primaryCategoryId: values.primaryCategoryId,
    imageMediaIds: values.images.map((item) => item.id),
    ...salesFields(values),
    ...shippingFields(values),
  };
  if (attributeValues !== undefined) payload.attributeValues = attributeValues;
  return payload;
}

/** Oluşturma payload'ı (mevcut onSubmit ile birebir; opsiyonel attributeValues). */
export function buildCreatePayload(
  values: ProductFormValues,
  attributeValues?: ProductCreateRequest["attributeValues"],
): ProductCreateRequest {
  const payload: ProductCreateRequest = {
    title: values.title.trim(),
    slug: values.slug.trim(),
    status: values.status,
    type: "PHYSICAL",
    categoryIds: values.categoryIds,
    ...salesFields(values),
    ...shippingFields(values),
  };
  if (values.brand.trim() !== "") payload.brand = values.brand.trim();
  if (values.vendor.trim() !== "") payload.vendor = values.vendor.trim();
  if (values.description.trim() !== "") payload.description = values.description.trim();
  if (values.primaryCategoryId) payload.primaryCategoryId = values.primaryCategoryId;
  if (attributeValues !== undefined) payload.attributeValues = attributeValues;
  return payload;
}

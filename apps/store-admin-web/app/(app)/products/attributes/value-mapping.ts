// Faz 2B (TODO-146) — Attribute DEĞER dönüşümleri (form ↔ Faz 2A API) + client-side
// doğrulama + sunucu hata eşlemesi.
//
// Yazma otoritesi backend'dedir (attributeValueService, STABIL kodlar). Bu modül
// yalnızca (1) düzenlemede round-trip için okuma projeksiyonunu form haritasına,
// (2) kaydetmede form haritasını Faz 2A replace-set girdisine çevirir, (3) required
// + validationRules'u erken UX için client-side uygular, (4) backend attribute hata
// kodlarını alan-seviyesine eşler.

import type {
  AttributeDataType,
  ProductAttributeValueInput,
  ProductAttributeValueResponse,
} from "@commerce-os/api-client";
import {
  emptyAttributeValue,
  isMediaType,
  isSingleOption,
  isTextLike,
  type AttributeInputValue,
  type AttributeValueMap,
  type ResolvedAttribute,
} from "./types";

/**
 * Okuma projeksiyonunu (dedike GET .../attribute-values) form haritasına çevirir.
 * Çözümlenmiş şemadaki HER attribute için bir anahtar üretir (var olmayan değerler
 * boş başlar) → round-trip kayıpsız ve kontrollü input'lar tanımlı kalır.
 */
export function buildAttributeValueMap(
  resolved: ResolvedAttribute[],
  responses: ProductAttributeValueResponse[],
): AttributeValueMap {
  const byDef = new Map<string, ProductAttributeValueResponse>(
    responses.map((response) => [response.attributeDefinitionId, response]),
  );
  const map: AttributeValueMap = {};
  for (const attr of resolved) {
    const response = byDef.get(attr.attributeDefinitionId);
    map[attr.attributeDefinitionId] = response
      ? responseToInputValue(attr.dataType, response)
      : emptyAttributeValue(attr.dataType);
  }
  return map;
}

/** Tek bir okuma projeksiyonunu dataType'a göre ham form değerine çevirir. */
function responseToInputValue(
  dataType: AttributeDataType,
  response: ProductAttributeValueResponse,
): AttributeInputValue {
  switch (dataType) {
    case "TEXT":
    case "TEXTAREA":
    case "RICH_TEXT":
    case "URL":
      return response.valueText ?? "";
    case "INTEGER":
      return response.valueInteger != null ? String(response.valueInteger) : "";
    case "DECIMAL":
      return response.valueDecimal != null ? String(response.valueDecimal) : "";
    case "BOOLEAN":
      return response.valueBoolean ?? false;
    case "DATE":
      // ISO datetime → <input type="date"> için yyyy-mm-dd.
      return response.valueDate ? response.valueDate.slice(0, 10) : "";
    case "SELECT":
    case "COLOR":
      return response.optionId ?? "";
    case "MULTI_SELECT":
      return [...response.optionIds];
    case "IMAGE":
    case "FILE":
      return response.mediaId ?? "";
    default:
      return "";
  }
}

/** Bir attribute değerinin (dataType bağlamında) "boş" olup olmadığı. */
export function isAttributeEmpty(dataType: AttributeDataType, value: AttributeInputValue): boolean {
  if (dataType === "MULTI_SELECT") {
    return !Array.isArray(value) || value.length === 0;
  }
  if (dataType === "BOOLEAN") {
    // Zorunlu boolean için "boş" = işaretlenmemiş (onay-kutusu semantiği).
    return value !== true;
  }
  return typeof value !== "string" || value.trim() === "";
}

/**
 * Form haritasını Faz 2A replace-set girdisine çevirir. Yalnızca DOLU değerler
 * gönderilir (replace-set: gönderilmeyen = temizlenir). BOOLEAN istisnadır: true/false
 * ikisi de anlamlıdır, bu yüzden şemadaki her boolean her zaman gönderilir.
 * Yalnız ürün-seviyesi (variantDefining olmayan) attribute'lar ele alınır — varyat
 * değerleri bu fazın kapsamı dışıdır ve çözümlenmiş listeye zaten dahil edilmez.
 */
export function attributeValuesToInputs(
  resolved: ResolvedAttribute[],
  valueMap: AttributeValueMap,
): ProductAttributeValueInput[] {
  const inputs: ProductAttributeValueInput[] = [];
  for (const attr of resolved) {
    const raw = valueMap[attr.attributeDefinitionId];
    if (raw === undefined) continue;
    const input = toInput(attr, raw);
    if (input) inputs.push(input);
  }
  return inputs;
}

function toInput(
  attr: ResolvedAttribute,
  raw: AttributeInputValue,
): ProductAttributeValueInput | null {
  const base = { attributeDefinitionId: attr.attributeDefinitionId };
  const dataType = attr.dataType;

  if (dataType === "BOOLEAN") {
    return { ...base, valueBoolean: raw === true };
  }
  if (isTextLike(dataType)) {
    const text = typeof raw === "string" ? raw.trim() : "";
    return text === "" ? null : { ...base, valueText: text };
  }
  if (dataType === "INTEGER") {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") return null;
    const num = Number(text);
    return Number.isInteger(num) ? { ...base, valueInteger: num } : null;
  }
  if (dataType === "DECIMAL") {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") return null;
    const num = Number(text);
    return Number.isFinite(num) ? { ...base, valueDecimal: num } : null;
  }
  if (dataType === "DATE") {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") return null;
    // yyyy-mm-dd → ISO datetime (contract .datetime() gerektirir; servis Date'e çevirir).
    const iso = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(iso.getTime()) ? null : { ...base, valueDate: iso.toISOString() };
  }
  if (isSingleOption(dataType)) {
    const optionId = typeof raw === "string" ? raw : "";
    return optionId === "" ? null : { ...base, optionId };
  }
  if (isMediaType(dataType)) {
    const mediaId = typeof raw === "string" ? raw : "";
    return mediaId === "" ? null : { ...base, mediaId };
  }
  if (dataType === "MULTI_SELECT") {
    const ids = Array.isArray(raw) ? raw.filter((id) => id !== "") : [];
    return ids.length === 0 ? null : { ...base, optionIds: [...new Set(ids)] };
  }
  return null;
}

/** Client-side doğrulama için i18n bağımsız mesaj sağlayıcı. */
export interface AttributeValidationMessages {
  required: string;
  invalidNumber: string;
  invalidInteger: string;
  invalidUrl: string;
  min: (limit: number) => string;
  max: (limit: number) => string;
  minLength: (limit: number) => string;
  maxLength: (limit: number) => string;
  pattern: string;
}

/**
 * Tek bir attribute değerini required + validationRules'a göre doğrular. Backend
 * nihai otoritedir; bu yalnız erken/anlaşılır UX içindir. Geçerliyse null döner.
 */
export function validateAttributeValue(
  attr: ResolvedAttribute,
  raw: AttributeInputValue,
  messages: AttributeValidationMessages,
): string | null {
  const empty = isAttributeEmpty(attr.dataType, raw);
  if (empty) {
    return attr.required ? messages.required : null;
  }

  const rules = attr.rules;

  if (isTextLike(attr.dataType) && typeof raw === "string") {
    const text = raw.trim();
    if (rules.minLength !== undefined && text.length < rules.minLength) {
      return messages.minLength(rules.minLength);
    }
    if (rules.maxLength !== undefined && text.length > rules.maxLength) {
      return messages.maxLength(rules.maxLength);
    }
    if (rules.pattern !== undefined && !safeRegexTest(rules.pattern, text)) {
      return messages.pattern;
    }
    if (attr.dataType === "URL" && !isLikelyUrl(text)) {
      return messages.invalidUrl;
    }
  }

  if ((attr.dataType === "INTEGER" || attr.dataType === "DECIMAL") && typeof raw === "string") {
    const num = Number(raw.trim());
    if (!Number.isFinite(num)) {
      return attr.dataType === "INTEGER" ? messages.invalidInteger : messages.invalidNumber;
    }
    if (attr.dataType === "INTEGER" && !Number.isInteger(num)) {
      return messages.invalidInteger;
    }
    if (rules.min !== undefined && num < rules.min) return messages.min(rules.min);
    if (rules.max !== undefined && num > rules.max) return messages.max(rules.max);
  }

  return null;
}

function safeRegexTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    // Geçersiz pattern → sessizce yok say (desteklenmeyen kural gibi davran).
    return true;
  }
}

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Backend attribute hata kodları → alan-seviyesi mesaj. `attributeDefinitionId`
 * hata zarfında bulunur (routes.ts sendServiceError) ve doğru alana bağlamak için
 * kullanılır. Ürün-seviyesi olmayan kodlar (PRODUCT_NOT_FOUND vb.) null döner →
 * çağıran genel (toast) yola düşer.
 */
export const ATTRIBUTE_SERVER_ERROR_CODES = new Set<string>([
  "ATTRIBUTE_NOT_FOUND",
  "ATTRIBUTE_ARCHIVED",
  "ATTRIBUTE_TENANT_MISMATCH",
  "ATTRIBUTE_NOT_IN_CATEGORY",
  "ATTRIBUTE_DUPLICATE",
  "ATTRIBUTE_VALUE_MISSING",
  "ATTRIBUTE_MULTIPLE_VALUES",
  "ATTRIBUTE_VALUE_TYPE_MISMATCH",
  "ATTRIBUTE_OPTION_INVALID",
  "ATTRIBUTE_OPTION_ARCHIVED",
  "ATTRIBUTE_OPTION_TENANT_MISMATCH",
  "ATTRIBUTE_MEDIA_NOT_FOUND",
  "ATTRIBUTE_REQUIRED_MISSING",
  "ATTRIBUTE_IS_VARIANT_DEFINING",
  "ATTRIBUTE_NOT_VARIANT_DEFINING",
]);

export function isAttributeServerError(code: string): boolean {
  return ATTRIBUTE_SERVER_ERROR_CODES.has(code);
}

// Faz 2B (TODO-146) — Dinamik ürün formu attribute tipleri.
//
// Backend katmanları (Faz 1B/2A) attribute TANIMINI (AttributeDefinition), kategori
// DAVRANIŞINI (CategoryAttribute: required/displayOrder/groupId/validationRules) ve
// DEĞER şemasını (ProductAttributeValue) ayrı tutar. CategoryAttribute serializer'ı
// self-describing DEĞİLDİR: yalnız attributeDefinitionId + davranış bayrakları döner.
// Bu yüzden UI, tanım + seçenek + grup uçlarını ayrı çekip client-side join eder.
// `ResolvedAttribute` bu join'in tek, render'a hazır sonucudur.

import type { AttributeDataType } from "@commerce-os/api-client";

/**
 * Faz 2A'da CategoryAttribute'a eklenen serbest-biçimli `validationRules` JSON'unun
 * UI'da DESTEKLENEN alt kümesi. Backend hiçbir iç şekil dayatmaz (z.record(unknown));
 * desteklenmeyen anahtarlar sessizce yok sayılır (TODO-146 md.8).
 */
export interface AttributeValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  step?: number;
  placeholder?: string;
  helperText?: string;
}

/** Bir attribute'un SELECT/MULTI_SELECT/COLOR seçeneği (tanım + join sonrası). */
export interface ResolvedAttributeOption {
  id: string;
  value: string;
  label: string;
  colorHex: string | null;
}

/**
 * Kategori + tanım + seçenek + grup join'inin render'a hazır tek sonucu. Ürün formu
 * yalnızca ürün-seviyesi (variantDefining=false) attribute'ları render eder; varyat
 * motoru bu fazın KAPSAMI DIŞINDADIR.
 */
export interface ResolvedAttribute {
  categoryAttributeId: string;
  attributeDefinitionId: string;
  code: string;
  name: string;
  description: string | null;
  dataType: AttributeDataType;
  unit: string | null;
  required: boolean;
  displayOrder: number;
  groupId: string | null;
  options: ResolvedAttributeOption[];
  rules: AttributeValidationRules;
}

/** Attribute'ların sunum kabı. `id=null` → sentetik "General Attributes" kovası. */
export interface ResolvedAttributeGroup {
  id: string | null;
  name: string;
  sortOrder: number;
  attributes: ResolvedAttribute[];
}

/**
 * Formda tek bir attribute değerinin ham temsili. dataType renderer tarafından
 * bilindiği için yorum belirsiz değildir:
 *  - metin/sayı/tarih/tek-seçenek/medya → string
 *  - MULTI_SELECT → string[] (optionId listesi)
 *  - BOOLEAN → boolean
 */
export type AttributeInputValue = string | string[] | boolean;

/** Tüm attribute değerleri: attributeDefinitionId → ham değer. */
export type AttributeValueMap = Record<string, AttributeInputValue>;

/** dataType → boş/başlangıç ham değeri. */
export function emptyAttributeValue(dataType: AttributeDataType): AttributeInputValue {
  switch (dataType) {
    case "MULTI_SELECT":
      return [];
    case "BOOLEAN":
      return false;
    default:
      return "";
  }
}

/** Metin-benzeri (tek `valueText` kolonuna yazılan) tipler. */
export function isTextLike(dataType: AttributeDataType): boolean {
  return (
    dataType === "TEXT" ||
    dataType === "TEXTAREA" ||
    dataType === "RICH_TEXT" ||
    dataType === "URL"
  );
}

/** Tek `optionId` (SELECT/COLOR) tutan tipler. */
export function isSingleOption(dataType: AttributeDataType): boolean {
  return dataType === "SELECT" || dataType === "COLOR";
}

/** `mediaId` (IMAGE/FILE) tutan tipler. */
export function isMediaType(dataType: AttributeDataType): boolean {
  return dataType === "IMAGE" || dataType === "FILE";
}

/**
 * Serbest JSON'dan desteklenen kuralları defensif ayıklar. Yanlış tipli değerler
 * (ör. `min: "abc"`) sessizce atlanır — backend nihai otoritedir.
 */
export function parseValidationRules(raw: unknown): AttributeValidationRules {
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const rules: AttributeValidationRules = {};
  const num = (key: keyof AttributeValidationRules) => {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      (rules[key] as number) = value;
    }
  };
  num("min");
  num("max");
  num("minLength");
  num("maxLength");
  num("step");
  if (typeof record.pattern === "string" && record.pattern.length > 0) {
    rules.pattern = record.pattern;
  }
  if (typeof record.placeholder === "string") rules.placeholder = record.placeholder;
  if (typeof record.helperText === "string") rules.helperText = record.helperText;
  return rules;
}

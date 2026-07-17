// Faz 2C-1 (ADR-070) — Varyant eksen seçimi dönüşümleri (form ↔ API) + client-side
// doğrulama + sunucu hata eşlemesi.
//
// Yazma otoritesi backend'dedir (variantSelectionService, STABIL kodlar). Bu modül yalnız:
// (1) düzenlemede round-trip için okuma projeksiyonunu form haritasına,
// (2) kaydetmede form haritasını gömülü `variantSelections` girdisine (yalnız enabled eksenler),
// (3) "her eksende ≥1 option" kuralını erken UX için client-side uygular,
// (4) backend hata kodlarını alan-seviyesine eşler. KOMBINASYON URETMEZ.

import type {
  ProductVariantSelectionInput,
  ProductVariantSelectionResponse,
} from "@commerce-os/api-client";
import type { ResolvedVariantAttribute, VariantSelectionMap } from "./types";

/**
 * Çözümlenmiş varyant eksenleri için boş başlangıç haritası (her attribute enabled=false).
 * Kontrollü checkbox'lar için her eksenin anahtarı tanımlı olmalıdır.
 */
export function emptyVariantSelectionMap(attributes: ResolvedVariantAttribute[]): VariantSelectionMap {
  const map: VariantSelectionMap = {};
  for (const attr of attributes) map[attr.attributeDefinitionId] = { enabled: false, optionIds: [] };
  return map;
}

/**
 * Okuma projeksiyonunu (dedike GET .../variant-selections) form haritasına çevirir. Çözümlenmiş
 * şemadaki HER eksen için bir anahtar üretir; sunucuda seçili olan eksenler enabled=true olur ve
 * yalnız hâlâ AKTİF olan (çözümlenmiş şemada bulunan) option'ları taşınır (arşivlenen option
 * sessizce düşer — kaydetmede yeniden gönderilmez). Round-trip kayıpsız + kontrollü.
 */
export function buildVariantSelectionMap(
  attributes: ResolvedVariantAttribute[],
  responses: ProductVariantSelectionResponse[],
): VariantSelectionMap {
  const byDef = new Map<string, ProductVariantSelectionResponse>(
    responses.map((response) => [response.attributeDefinitionId, response]),
  );
  const map: VariantSelectionMap = {};
  for (const attr of attributes) {
    const response = byDef.get(attr.attributeDefinitionId);
    if (!response) {
      map[attr.attributeDefinitionId] = { enabled: false, optionIds: [] };
      continue;
    }
    const validOptionIds = new Set(attr.options.map((option) => option.id));
    map[attr.attributeDefinitionId] = {
      enabled: true,
      optionIds: response.optionIds.filter((id) => validOptionIds.has(id)),
    };
  }
  return map;
}

/**
 * Form haritasını gömülü `variantSelections` girdisine çevirir. YALNIZ enabled eksenler + o eksenin
 * ÇÖZÜMLENMİŞ şemada hâlâ geçerli option'ları gönderilir (replace-set: TAM istenen küme). enabled +
 * boş option → backend VARIANT_OPTION_REQUIRED döndürür; bu zaten client-side de yakalanır.
 */
export function variantSelectionsToInputs(
  attributes: ResolvedVariantAttribute[],
  valueMap: VariantSelectionMap,
): ProductVariantSelectionInput[] {
  const inputs: ProductVariantSelectionInput[] = [];
  for (const attr of attributes) {
    const entry = valueMap[attr.attributeDefinitionId];
    if (!entry || !entry.enabled) continue;
    const validOptionIds = new Set(attr.options.map((option) => option.id));
    const optionIds = [...new Set(entry.optionIds.filter((id) => validOptionIds.has(id)))];
    inputs.push({ attributeDefinitionId: attr.attributeDefinitionId, optionIds });
  }
  return inputs;
}

/**
 * Client-side doğrulama: her ETKİN eksende en az bir option seçili olmalı. Geçersiz eksenlerin
 * attributeDefinitionId → mesaj haritasını döndürür (boş = geçerli). Backend nihai otoritedir.
 */
export function validateVariantSelections(
  attributes: ResolvedVariantAttribute[],
  valueMap: VariantSelectionMap,
  optionRequiredMessage: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const attr of attributes) {
    const entry = valueMap[attr.attributeDefinitionId];
    if (!entry || !entry.enabled) continue;
    const validOptionIds = new Set(attr.options.map((option) => option.id));
    const chosen = entry.optionIds.filter((id) => validOptionIds.has(id));
    if (chosen.length === 0) errors[attr.attributeDefinitionId] = optionRequiredMessage;
  }
  return errors;
}

/**
 * Backend varyant seçim hata kodları → alan-seviyesi bağlama için tanınan küme. `attributeDefinitionId`
 * hata zarfında bulunur (routes.ts sendServiceError). Ürün-seviyesi olmayan kodlar (PRODUCT_NOT_FOUND)
 * dahil değil → çağıran genel (toast) yola düşer.
 */
export const VARIANT_SELECTION_SERVER_ERROR_CODES = new Set<string>([
  "VARIANT_ATTRIBUTE_NOT_FOUND",
  "VARIANT_ATTRIBUTE_ARCHIVED",
  "VARIANT_ATTRIBUTE_TENANT_MISMATCH",
  "VARIANT_ATTRIBUTE_NOT_IN_CATEGORY",
  "VARIANT_ATTRIBUTE_NOT_VARIANT_DEFINING",
  "VARIANT_ATTRIBUTE_NOT_OPTION_BASED",
  "VARIANT_ATTRIBUTE_DUPLICATE",
  "VARIANT_OPTION_REQUIRED",
  "VARIANT_OPTION_INVALID",
  "VARIANT_OPTION_ARCHIVED",
  "VARIANT_OPTION_TENANT_MISMATCH",
]);

export function isVariantSelectionServerError(code: string): boolean {
  return VARIANT_SELECTION_SERVER_ERROR_CODES.has(code);
}

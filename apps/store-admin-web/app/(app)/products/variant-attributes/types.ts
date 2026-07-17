// Faz 2C-1 (ADR-070) — Varyant EKSEN seçimi UI tipleri.
//
// Ürün formundaki "Variant Attributes" bölümü YALNIZ variantDefining=true + option-tabanlı
// (SELECT/COLOR) CategoryAttribute'ları listeler. Admin bir attribute'u EKSEN olarak seçer
// (checkbox) ve altındaki option'ları işaretler (Siyah ✓ / Beyaz ✓ / Mavi ☐). Bu faz HİÇBİR
// varyant/kombinasyon üretmez — yalnız "eksenler + option'lar" reçetesi ürün seviyesinde saklanır.

import type { AttributeDataType } from "@commerce-os/api-client";

/** Bir varyant ekseni option'ı (tanım + join sonrası). */
export interface VariantAttributeOption {
  id: string;
  value: string;
  label: string;
  colorHex: string | null;
}

/**
 * Kategori + tanım + seçenek join'inin render'a hazır tek sonucu (yalnız variantDefining +
 * option-tabanlı attribute'lar). Ürün-seviyesi (variantDefining=false) attribute'lar bu
 * listeye DAHİL DEĞİLDİR — onlar `AttributeSection`'da render edilir.
 */
export interface ResolvedVariantAttribute {
  categoryAttributeId: string;
  attributeDefinitionId: string;
  code: string;
  name: string;
  dataType: AttributeDataType; // SELECT | COLOR
  displayOrder: number;
  options: VariantAttributeOption[];
}

/**
 * Form state'inde tek bir eksenin temsili. `enabled` = admin bu attribute'u eksen olarak
 * seçti mi; `optionIds` = seçilen option'lar. `enabled=true` + boş `optionIds` client-side
 * hatadır (her eksen ≥1 option; backend VARIANT_OPTION_REQUIRED).
 */
export interface VariantSelectionEntry {
  enabled: boolean;
  optionIds: string[];
}

/** Tüm varyant eksen seçimi: attributeDefinitionId → seçim. */
export type VariantSelectionMap = Record<string, VariantSelectionEntry>;

export interface VariantAttributesState {
  attributes: ResolvedVariantAttribute[];
  loading: boolean;
  error: boolean;
}

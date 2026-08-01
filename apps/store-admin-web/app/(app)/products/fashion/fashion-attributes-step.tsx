"use client";

// TODO-165A (ADR-165A) Task 22/23 — Ürün formu "Fashion Özellikleri" adımı.
//
// Kategori attribute şeması (`useCategoryAttributes`) HER kategori için AYNI kalır —
// governed moda kodları (fashion.season/collection/material/fit/pattern/collar_type/
// sleeve_type/length/care/sustainability/color_family) SIRADAN kategori attribute'ları
// gibi tanımlanır (Faz 2A). Bu bileşen o listeyi code'a göre İKİYE ayırır:
//   - governed → taksonomi-güdümlü aranabilir tekli/çoklu seçim + satır-içi hızlı-ekle
//     (`TaxonomySelectField`),
//   - geri kalan (governed OLMAYAN) → MEVCUT generic `<AttributeSection>` (dokunulmadı).
//
// `attribute-section.tsx`/`attribute-field.tsx`/`use-category-attributes.ts` DEĞİŞMEDİ —
// yalnız governed olmayan attribute'ları taşıyan FİLTRELENMİŞ bir `CategoryAttributesState`
// ile çağrılır → generic yol (SELECT/MULTI_SELECT/TEXT/... governed olmayan tüm tipler)
// BİREBİR korunur.
//
// code → ProductTaxonomyType eşlemesi `TAXONOMY_TYPE_REGISTRY[type].definitionCode`'dan
// TÜRETİLİR (gateway'in `taxonomy-map.ts`'iyle AYNI mantık, yalnız client tarafında
// yeniden üretilir — o dosya app-internal, store-admin-web'den import EDİLEMEZ).

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { Alert, Spinner, useLocale } from "../../../../components/ui";
import {
  PRODUCT_TAXONOMY_TYPES,
  TAXONOMY_TYPE_REGISTRY,
  type ProductTaxonomyType,
} from "@commerce-os/contracts/product-taxonomy";
import type { ProductFormValues } from "../product-form-schema";
import type { CategoryAttributesState } from "../attributes/use-category-attributes";
import { AttributeSection, type AttributeSectionLabels } from "../attributes/attribute-section";
import type { AttributeInputValue, ResolvedAttribute, ResolvedAttributeGroup } from "../attributes/types";
import { TaxonomySelectField } from "./taxonomy-select-field";

/** code (fashion.*) → ProductTaxonomyType — registry'nin ters çevrimi (client-safe). */
const CODE_TO_TAXONOMY_TYPE: ReadonlyMap<string, ProductTaxonomyType> = new Map(
  PRODUCT_TAXONOMY_TYPES.map((type) => [TAXONOMY_TYPE_REGISTRY[type].definitionCode, type]),
);

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export interface FashionAttributesStepLabels extends AttributeSectionLabels {
  /** Governed moda bölümünün başlığı (generic "General Attributes" bölümünden AYRI). */
  governedSectionTitle: string;
}

export interface FashionAttributesStepProps {
  control: Control<ProductFormValues>;
  state: CategoryAttributesState;
  disabled?: boolean;
  labels: FashionAttributesStepLabels;
}

/**
 * Governed (fashion.*) attribute'ları taksonomi-güdümlü kontrollerle, geri kalanını
 * mevcut generic `<AttributeSection>` ile render eder. Kategori attribute
 * TANIMLAMAMIŞSA (legacy davranış, md.12) hiçbir şey render EDİLMEZ.
 */
export function FashionAttributesStep({ control, state, disabled, labels }: FashionAttributesStepProps) {
  const locale = useLocale();

  if (state.loading) {
    return (
      <SectionShell title={labels.sectionTitle}>
        <Spinner label={labels.loadingLabel} size="sm" />
      </SectionShell>
    );
  }

  if (state.error) {
    return (
      <SectionShell title={labels.sectionTitle}>
        <Alert tone="error">{labels.errorLabel}</Alert>
      </SectionShell>
    );
  }

  if (state.attributes.length === 0) return null;

  const governed: ResolvedAttribute[] = [];
  const governedIds = new Set<string>();
  for (const attr of state.attributes) {
    if (CODE_TO_TAXONOMY_TYPE.has(attr.code)) {
      governed.push(attr);
      governedIds.add(attr.attributeDefinitionId);
    }
  }

  // Generic bölüme yalnız governed OLMAYAN attribute'lar gider (grup kabuğu korunur,
  // boşalan gruplar düşürülür). `use-category-attributes.ts` DEĞİŞMEDİ — burada salt
  // zaten çözümlenmiş listenin bir FİLTRESİ kuruluyor.
  const genericGroups: ResolvedAttributeGroup[] = state.groups
    .map((group) => ({ ...group, attributes: group.attributes.filter((attr) => !governedIds.has(attr.attributeDefinitionId)) }))
    .filter((group) => group.attributes.length > 0);
  const genericState: CategoryAttributesState = {
    loading: false,
    error: false,
    attributes: state.attributes.filter((attr) => !governedIds.has(attr.attributeDefinitionId)),
    groups: genericGroups,
  };

  return (
    <>
      {governed.length > 0 ? (
        <SectionShell title={labels.governedSectionTitle}>
          <div className="space-y-4">
            {governed.map((attr) => {
              const taxonomyType = CODE_TO_TAXONOMY_TYPE.get(attr.code)!;
              const multi = attr.dataType === "MULTI_SELECT";
              const name = `attributes.${attr.attributeDefinitionId}` as FieldPath<ProductFormValues>;
              return (
                <Controller
                  key={attr.attributeDefinitionId}
                  control={control}
                  name={name}
                  render={({ field, fieldState }) => (
                    <TaxonomySelectField
                      attr={attr}
                      taxonomyType={taxonomyType}
                      multi={multi}
                      value={(field.value ?? (multi ? [] : "")) as AttributeInputValue}
                      onChange={field.onChange}
                      disabled={disabled}
                      error={fieldState.error?.message}
                      requiredHint={labels.requiredHint}
                      optionalHint={labels.optionalHint}
                      locale={locale}
                    />
                  )}
                />
              );
            })}
          </div>
        </SectionShell>
      ) : null}

      <AttributeSection control={control} state={genericState} disabled={disabled} labels={labels} />
    </>
  );
}

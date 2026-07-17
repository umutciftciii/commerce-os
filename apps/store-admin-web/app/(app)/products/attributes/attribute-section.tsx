"use client";

// Faz 2B (TODO-146) — Kategori-güdümlü attribute bölümü. Çözümlenmiş grupları
// (displayOrder/grup sırası korunmuş) sunum kartlarına döker ve her attribute'u
// RHF Controller ile `attributes.<attributeDefinitionId>` alanına bağlar.
//
// Legacy uyumluluk (md.12): kategori attribute tanımlamamışsa (attributes boş) VE
// yükleme/hata yoksa HİÇBİR ŞEY render edilmez → eski ürün formu gibi davranır.

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { Alert, Spinner } from "../../../../components/ui";
import type { ProductFormValues } from "../product-form-schema";
import type { CategoryAttributesState } from "./use-category-attributes";
import { AttributeField } from "./attribute-field";
import type { AttributeInputValue } from "./types";

export interface AttributeSectionLabels {
  sectionTitle: string;
  loadingLabel: string;
  errorLabel: string;
  requiredHint: string;
  optionalHint: string;
}

export interface AttributeSectionProps {
  control: Control<ProductFormValues>;
  state: CategoryAttributesState;
  disabled?: boolean;
  labels: AttributeSectionLabels;
}

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

export function AttributeSection({ control, state, disabled, labels }: AttributeSectionProps) {
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

  // Legacy: attribute tanımlı değilse hiçbir şey render etme.
  if (state.attributes.length === 0) return null;

  return (
    <>
      {state.groups.map((group) => (
        <SectionShell key={group.id ?? "__general__"} title={group.name}>
          <div className="space-y-4">
            {group.attributes.map((attr) => {
              const name = `attributes.${attr.attributeDefinitionId}` as FieldPath<ProductFormValues>;
              return (
                <Controller
                  key={attr.attributeDefinitionId}
                  control={control}
                  name={name}
                  render={({ field, fieldState }) => (
                    <AttributeField
                      attr={attr}
                      value={(field.value ?? "") as AttributeInputValue}
                      onChange={field.onChange}
                      disabled={disabled}
                      error={fieldState.error?.message}
                      requiredHint={labels.requiredHint}
                      optionalHint={labels.optionalHint}
                    />
                  )}
                />
              );
            })}
          </div>
        </SectionShell>
      ))}
    </>
  );
}

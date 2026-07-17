"use client";

// Faz 2C-1 (ADR-070) — "Variant Attributes" bölümü. YALNIZ variantDefining=true + option-tabanlı
// (SELECT/COLOR) attribute'ları listeler. Admin bir attribute'u EKSEN olarak seçer (checkbox);
// seçince altındaki option'lar (Siyah ✓ / Beyaz ✓ / Mavi ☐) görünür. Bu faz HİÇBİR varyant/
// kombinasyon üretmez — yalnız seçim toplanır.
//
// Legacy uyumluluk: kategori variantDefining attribute tanımlamamışsa (VE yükleme/hata yoksa)
// HİÇBİR ŞEY render edilmez → eski ürün formu gibi davranır.

import { Alert, Spinner } from "../../../../components/ui";
import type { ResolvedVariantAttribute, VariantAttributesState, VariantSelectionMap } from "./types";

export interface VariantAttributeSectionLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  loadingLabel: string;
  errorLabel: string;
  optionsLabel: string;
  optionRequired: string;
}

export interface VariantAttributeSectionProps {
  state: VariantAttributesState;
  value: VariantSelectionMap;
  errors: Record<string, string>;
  disabled?: boolean;
  onToggleAxis: (attributeDefinitionId: string) => void;
  onToggleOption: (attributeDefinitionId: string, optionId: string) => void;
  labels: VariantAttributeSectionLabels;
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
        <div>
          <h3 className="text-sm font-semibold text-white/90">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function VariantAttributeSection({
  state,
  value,
  errors,
  disabled,
  onToggleAxis,
  onToggleOption,
  labels,
}: VariantAttributeSectionProps) {
  if (state.loading) {
    return (
      <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
        <Spinner label={labels.loadingLabel} size="sm" />
      </SectionShell>
    );
  }

  if (state.error) {
    return (
      <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
        <Alert tone="error">{labels.errorLabel}</Alert>
      </SectionShell>
    );
  }

  // Legacy: kategori variantDefining attribute tanımlamamışsa hiçbir şey render etme.
  if (state.attributes.length === 0) return null;

  return (
    <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
      <div className="space-y-3">
        {state.attributes.map((attr) => (
          <VariantAxisRow
            key={attr.attributeDefinitionId}
            attr={attr}
            entry={value[attr.attributeDefinitionId] ?? { enabled: false, optionIds: [] }}
            error={errors[attr.attributeDefinitionId]}
            disabled={disabled}
            optionsLabel={labels.optionsLabel}
            optionRequired={labels.optionRequired}
            onToggleAxis={() => onToggleAxis(attr.attributeDefinitionId)}
            onToggleOption={(optionId) => onToggleOption(attr.attributeDefinitionId, optionId)}
          />
        ))}
      </div>
    </SectionShell>
  );
}

function VariantAxisRow({
  attr,
  entry,
  error,
  disabled,
  optionsLabel,
  optionRequired,
  onToggleAxis,
  onToggleOption,
}: {
  attr: ResolvedVariantAttribute;
  entry: { enabled: boolean; optionIds: string[] };
  error?: string;
  disabled?: boolean;
  optionsLabel: string;
  optionRequired: string;
  onToggleAxis: () => void;
  onToggleOption: (optionId: string) => void;
}) {
  const axisInputId = `variant-axis-${attr.attributeDefinitionId}`;
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        entry.enabled ? "border-indigo-400/40 bg-indigo-500/[0.08]" : "border-white/10"
      }`}
    >
      <label htmlFor={axisInputId} className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          id={axisInputId}
          type="checkbox"
          className="h-3.5 w-3.5 accent-indigo-500"
          checked={entry.enabled}
          onChange={onToggleAxis}
          disabled={disabled}
        />
        <span className={entry.enabled ? "font-medium text-indigo-100" : "text-white/70"}>{attr.name}</span>
      </label>

      {entry.enabled ? (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <span className="mb-1.5 block text-xs font-medium text-white/45">{optionsLabel}</span>
          {attr.options.length === 0 ? (
            <p className="text-xs text-white/30">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {attr.options.map((option) => {
                const checked = entry.optionIds.includes(option.id);
                const optionInputId = `variant-option-${attr.attributeDefinitionId}-${option.id}`;
                return (
                  <label
                    key={option.id}
                    htmlFor={optionInputId}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                      checked
                        ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                        : "border-white/10 text-white/60"
                    }`}
                  >
                    <input
                      id={optionInputId}
                      type="checkbox"
                      className="h-3 w-3 accent-indigo-500"
                      checked={checked}
                      onChange={() => onToggleOption(option.id)}
                      disabled={disabled}
                    />
                    {attr.dataType === "COLOR" && option.colorHex ? (
                      <span
                        aria-hidden
                        className="h-3 w-3 rounded-full border border-white/20"
                        style={{ backgroundColor: option.colorHex }}
                      />
                    ) : null}
                    {option.label}
                  </label>
                );
              })}
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-rose-300">
              {error ?? optionRequired}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

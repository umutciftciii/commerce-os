"use client";

// Faz 2C-2 (ADR-071) — "Oluşacak Kombinasyonlar" ÖNİZLEME bölümü.
//
// Ürünün KALICI varyant eksen reçetesinden ÜRETİLECEK varyant kombinasyonlarını SALT-OKUNUR listeler.
// DÜZENLEME YOK: bu faz yalnız oluşacak kombinasyonları gösterir (ProductVariant/SKU henüz YOK).
// Guard aşımında (PREVIEW_LIMIT_EXCEEDED) liste yerine uyarı gösterilir. Kategori varyant-defining
// attribute tanımlamamışsa / seçim yoksa hiçbir şey render edilmez (legacy davranış korunur).

import { Alert, Spinner } from "../../../../components/ui";
import type { VariantCombinationPreviewState } from "./use-variant-combination-preview";

export interface CombinationPreviewLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  loadingLabel: string;
  errorLabel: string;
  limitLabel: string;
  countLabel: (count: number) => string;
  emptyLabel: string;
}

export interface CombinationPreviewProps {
  state: VariantCombinationPreviewState;
  labels: CombinationPreviewLabels;
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

export function CombinationPreview({ state, labels }: CombinationPreviewProps) {
  if (state.loading) {
    return (
      <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
        <Spinner label={labels.loadingLabel} size="sm" />
      </SectionShell>
    );
  }

  if (state.errorCode === "PREVIEW_LIMIT_EXCEEDED") {
    return (
      <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
        <Alert tone="warning">{labels.limitLabel}</Alert>
      </SectionShell>
    );
  }

  if (state.errorCode === "ERROR") {
    return (
      <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
        <Alert tone="error">{labels.errorLabel}</Alert>
      </SectionShell>
    );
  }

  // Seçim yok / kombinasyon üretilmiyor → legacy davranış: hiçbir şey render etme.
  if (!state.data || state.data.totalCombinations === 0) return null;

  return (
    <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
      <p className="text-xs font-medium text-white/45">
        {labels.countLabel(state.data.totalCombinations)}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {state.data.combinations.map((combination) => (
          <li
            key={combination.previewId}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/70"
          >
            {combination.optionLabels
              .map((label, index) => label ?? combination.optionIds[index])
              .join(" · ")}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

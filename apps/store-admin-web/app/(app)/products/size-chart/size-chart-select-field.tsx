"use client";

/**
 * TODO-165A Tasks 25/26 — Ürün formu beden tablosu SEÇİM alanı.
 *
 * Paylaşılan `EntitySelectorField` TEK-seçim modunda (ADR-090 deseni; `brand-field.tsx`
 * ile AYNI — ikinci bir arama çözümü YAZILMAZ). Yalnız YAYINLANMIŞ (status=PUBLISHED)
 * tablolar listelenir (§9: DRAFT/ARCHIVED bir ürüne BAĞLANAMAZ) — filtre `extraQuery`
 * ile uca taşınır, ikinci bir istemci-taraf filtre YOK.
 *
 * Bu bileşen SADECE seçimi taşır ("hangi tablo seçili"); gerçek bağlama (assign) eylemi
 * `size-chart-step.tsx`'in "Bağla" aksiyonundadır — seçim tek başına bir yan etki üretmez.
 */

import { getDictionary, type Locale } from "@commerce-os/i18n";
import { EntitySelectorField, useSizeChartSelectorBinding } from "../../../../components/selector";
import { messageForError } from "../../../../lib/client/messages";

export interface SizeChartSelectFieldProps {
  locale: Locale;
  label: string;
  hint?: string;
  /** Seçili (henüz bağlanmamış olabilir) beden tablosu id'si; null = seçim yok. */
  value: string | null;
  onChange: (chartId: string | null) => void;
  disabled?: boolean;
}

export function SizeChartSelectField({
  locale,
  label,
  hint,
  value,
  onChange,
  disabled,
}: SizeChartSelectFieldProps) {
  const dict = getDictionary(locale).storeAdmin;
  const binding = useSizeChartSelectorBinding(locale, { status: "PUBLISHED" });

  return (
    <EntitySelectorField
      label={label}
      hint={hint ?? dict.selector.sizeChart.description}
      multiple={false}
      value={value ? [value] : []}
      onChange={(ids) => onChange(ids[0] ?? null)}
      source={binding.source}
      presenter={binding.presenter}
      labels={binding.labels}
      toMessage={(cause) => messageForError(cause, locale)}
      modalTitle={binding.title}
      modalDescription={binding.description}
      disabled={disabled}
    />
  );
}

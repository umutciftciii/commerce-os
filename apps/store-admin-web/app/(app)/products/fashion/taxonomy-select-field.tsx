"use client";

// TODO-165A (ADR-165A) Task 22/23 — Governed moda özniteliği (Sezon/Koleksiyon/Materyal/
// Kalıp/Desen/Yaka/Kol/Boy/Bakım/Sürdürülebilirlik/Renk Ailesi) için taksonomi-güdümlü
// aranabilir tekli/çoklu seçim + satır-içi "＋ Yeni ekle".
//
// KRİTİK (Task 23 — tek yazma yolu): Bu bileşen `attribute-field.tsx`'in generic
// SELECT/MULTI_SELECT widget'larının YERİNE geçer ama AYNI ham form değeri şeklini
// üretir (SELECT/COLOR → tek `optionId` string'i; MULTI_SELECT → `optionId[]`) ve
// `attributes.<attributeDefinitionId>` RHF alanına YAZAR. `value-mapping.ts`'in
// `attributeValuesToInputs`'ı (ve dolayısıyla backend `attributeValueService`) HİÇBİR
// DEĞİŞİKLİK GEREKTİRMEDEN bu değeri okur — paralel bir gönderim yolu YOKTUR.
//
// Seçenekler taksonomi LISTESINDEN gelir (yalnız ACTIVE; gateway T8 çözümleyicisi zaten
// mağaza-güdümlü-governed > global-canonical önceliğiyle DEDUPE eder) — her seçeneğin
// gönderilen DEĞERİ taksonomi değerinin `attributeOptionId`'sidir (mağaza-kapsamlı
// AttributeOption). Sabit-kodlu seçenek dizisi YOKTUR.
//
// Legacy okunabilirlik: bu store'da bir taksonomi override'ı varsa, eski (global-canonical)
// AttributeOption id'si artık taksonomi listesinde GÖRÜNMEYEBİLİR. Halihazırda seçili bir
// optionId taksonomi listesinde yoksa, `fallbackOptions` (kategori attribute'unun TÜM
// çözümlenmiş seçenekleri — `use-category-attributes.ts` zaten bunları çeker) üzerinden
// etiketi geri çözülür → değer HER ZAMAN doğru etiketle okunur, seçim kaybolmaz.

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@commerce-os/i18n";
import type { ProductTaxonomyValue } from "@commerce-os/api-client";
import { TAXONOMY_TYPE_REGISTRY, type ProductTaxonomyType } from "@commerce-os/contracts/product-taxonomy";
import { Alert, Button, Spinner, cn } from "../../../../components/ui";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import type { AttributeInputValue, ResolvedAttribute } from "../attributes/types";
import { TaxonomyQuickCreate } from "./taxonomy-quick-create";

export interface TaxonomySelectFieldProps {
  attr: ResolvedAttribute;
  taxonomyType: ProductTaxonomyType;
  multi: boolean;
  value: AttributeInputValue;
  onChange: (value: AttributeInputValue) => void;
  disabled?: boolean;
  error?: string;
  requiredHint: string;
  optionalHint: string;
  locale: Locale;
}

interface FlatOption {
  optionId: string;
  label: string;
  legacy: boolean;
}

const fieldBase =
  "w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] text-[13px] text-white/80 placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 h-9 px-3";

export function TaxonomySelectField({
  attr,
  taxonomyType,
  multi,
  value,
  onChange,
  disabled,
  error,
  requiredHint,
  optionalHint,
  locale,
}: TaxonomySelectFieldProps) {
  const fieldId = `taxonomy-attribute-${attr.attributeDefinitionId}`;
  const invalid = Boolean(error);
  const helper = attr.rules.helperText ?? attr.description ?? undefined;
  const typeLabel = locale === "tr" ? TAXONOMY_TYPE_REGISTRY[taxonomyType].labelTr : TAXONOMY_TYPE_REGISTRY[taxonomyType].labelEn;

  const [options, setOptions] = useState<FlatOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void storeApi
      .listProductTaxonomy({ type: taxonomyType, status: "ACTIVE", pageSize: 100 })
      .then((response) => {
        if (cancelled) return;
        setOptions(
          response.data.map((entry: ProductTaxonomyValue) => ({
            optionId: entry.attributeOptionId,
            label: entry.name,
            legacy: false,
          })),
        );
        setLoading(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setLoadError(messageForError(caught, locale));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxonomyType, locale]);

  const selectedIds = useMemo<string[]>(() => {
    if (multi) return Array.isArray(value) ? value : [];
    return typeof value === "string" && value !== "" ? [value] : [];
  }, [multi, value]);

  // Legacy (global-canonical) atamalar: taksonomi listesinde artık görünmeyen ama
  // bu attribute'un TÜM çözümlenmiş seçenekleri arasında olan seçili id'ler → etiket
  // oradan geri çözülür (bkz. dosya başı yorumu).
  const allOptions = useMemo<FlatOption[]>(() => {
    const known = new Set(options.map((option) => option.optionId));
    const legacy: FlatOption[] = [];
    for (const id of selectedIds) {
      if (known.has(id)) continue;
      const fallback = attr.options.find((option) => option.id === id);
      legacy.push({ optionId: id, label: fallback?.label ?? id, legacy: true });
    }
    return [...options, ...legacy];
  }, [options, selectedIds, attr.options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (q === "") return allOptions;
    return allOptions.filter((option) => option.label.toLocaleLowerCase().includes(q));
  }, [allOptions, search]);

  function select(optionId: string) {
    if (disabled) return;
    if (multi) {
      const set = new Set(selectedIds);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      onChange([...set]);
    } else {
      onChange(selectedIds.includes(optionId) ? "" : optionId);
    }
  }

  function addAndSelect(optionId: string, label: string) {
    setOptions((prev) => (prev.some((option) => option.optionId === optionId) ? prev : [...prev, { optionId, label, legacy: false }]));
    if (multi) {
      const set = new Set(selectedIds);
      set.add(optionId);
      onChange([...set]);
    } else {
      onChange(optionId);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label htmlFor={fieldId} className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          {attr.name}
          {attr.unit ? <span className="ml-1 normal-case text-white/25">({attr.unit})</span> : null}
        </label>
        <span className={cn("text-[10px] font-medium", attr.required ? "text-rose-300/80" : "text-white/25")}>
          {attr.required ? requiredHint : optionalHint}
        </span>
      </div>

      <input
        id={fieldId}
        type="search"
        role="searchbox"
        aria-label={`${attr.name} ara`}
        placeholder="Ara…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={disabled || loading}
        className={cn(fieldBase, invalid ? "border-rose-400/60" : "")}
        aria-invalid={invalid || undefined}
      />

      <div className="mt-2">
        {loading ? (
          <Spinner label="Yükleniyor…" size="sm" />
        ) : loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : (
          <ul
            role="listbox"
            aria-label={attr.name}
            aria-multiselectable={multi}
            className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.08] p-1.5"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-white/35">Sonuç yok.</li>
            ) : (
              filtered.map((option) => {
                const selected = selectedIds.includes(option.optionId);
                return (
                  <li
                    key={option.optionId}
                    role="option"
                    aria-selected={selected}
                    onClick={() => select(option.optionId)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      selected
                        ? "border border-indigo-400/40 bg-indigo-500/15 text-indigo-100"
                        : "border border-transparent text-white/65 hover:bg-white/[0.05]",
                    )}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      checked={selected}
                      readOnly
                      tabIndex={-1}
                      className="h-3.5 w-3.5 shrink-0 accent-indigo-500"
                      aria-label={option.label}
                      name={multi ? undefined : fieldId}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.legacy ? (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-white/30">
                        eski
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      <div className="mt-2">
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setQuickCreateOpen(true)}>
          ＋ Yeni ekle
        </Button>
      </div>

      {quickCreateOpen ? (
        <TaxonomyQuickCreate
          type={taxonomyType}
          typeLabel={typeLabel}
          locale={locale}
          labels={{
            title: "Yeni Değer",
            description: (label) => `${label} sözlüğüne yeni bir değer ekleyin.`,
            nameLabel: "Ad",
            namePlaceholder: "Örn. Pamuk",
            slugPreview: (slug) => `Kısa ad (slug) otomatik oluşturulacak: ${slug}`,
            slugHint: "Kısa ad (slug) addan otomatik oluşturulur ve sonradan değiştirilemez.",
            nameRequired: "Ad zorunludur.",
            cancel: "İptal",
            create: "Oluştur",
            creating: "Kaydediliyor…",
          }}
          onClose={() => setQuickCreateOpen(false)}
          onCreated={(created) => {
            addAndSelect(created.attributeOptionId, created.name);
            setQuickCreateOpen(false);
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : helper ? (
        <p className="mt-1 text-xs text-white/30">{helper}</p>
      ) : null}
    </div>
  );
}

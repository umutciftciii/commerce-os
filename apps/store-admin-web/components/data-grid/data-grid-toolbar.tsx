"use client";

/**
 * TODO-159A (ADR-089) — Ortak Data Grid araç çubuğu.
 *
 * UX kuralı: filtre alanı tabloyu boğmaz. Arama HER ZAMAN görünür; filtreler bir
 * popover içinde açılır; uygulanan filtreler tablonun hemen üstünde tek tek
 * kaldırılabilir çipler olarak görünür. Böylece "neden bu sonuçları görüyorum?"
 * sorusu ekrandan okunur.
 */

import { useEffect, useRef, useState } from "react";
import { format } from "@commerce-os/i18n";
import { Button, Select, cn } from "../ui";

export interface DataGridFilterOption {
  value: string;
  label: string;
}

export type DataGridFilterDef =
  | {
      kind: "select";
      key: string;
      label: string;
      options: DataGridFilterOption[];
    }
  | {
      kind: "number-range";
      /** Alt/üst sınır için AYRI query anahtarları (örn. priceMin / priceMax). */
      minKey: string;
      maxKey: string;
      label: string;
      minPlaceholder?: string;
      maxPlaceholder?: string;
    };

export interface DataGridSortOption {
  /** `sortBy:sortOrder` bileşik değeri — tek bir açılırda sunulur. */
  value: string;
  label: string;
}

export interface DataGridToolbarLabels {
  searchPlaceholder: string;
  searchLabel: string;
  searchSubmit: string;
  filters: string;
  filtersApply: string;
  filtersClear: string;
  filterAll: string;
  removeFilter: string;
  sortLabel: string;
}

export interface DataGridToolbarProps {
  labels: DataGridToolbarLabels;
  search: string;
  onSearchChange: (value: string) => void;
  filters: DataGridFilterDef[];
  /** Etkin filtre değerleri (query anahtarı → değer). */
  values: Record<string, string>;
  onFiltersChange: (next: Record<string, string>) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  sortOptions: DataGridSortOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  /** Araç çubuğunun sağına eklenen sayfaya özel aksiyonlar (opsiyonel). */
  actions?: React.ReactNode;
}

function optionLabel(def: DataGridFilterDef, value: string): string {
  if (def.kind !== "select") return value;
  return def.options.find((option) => option.value === value)?.label ?? value;
}

export function DataGridToolbar({
  labels,
  search,
  onSearchChange,
  filters,
  values,
  onFiltersChange,
  onClearFilters,
  activeFilterCount,
  sortOptions,
  sortValue,
  onSortChange,
  actions,
}: DataGridToolbarProps) {
  // Arama kutusu yerel taslak tutar; URL'e YALNIZ submit'te yazılır. Her tuş
  // vuruşunda istek atmak (ve geçmişe kayıt düşmek) bilinçli olarak yapılmaz.
  const [draft, setDraft] = useState(search);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  // Dışarı tıklama + Escape ile kapanma (klavye erişilebilirliği).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const def of filters) {
    if (def.kind === "select") {
      const value = values[def.key];
      if (value) {
        chips.push({
          key: def.key,
          label: `${def.label}: ${optionLabel(def, value)}`,
          onRemove: () => onFiltersChange({ [def.key]: "" }),
        });
      }
      continue;
    }
    const min = values[def.minKey];
    const max = values[def.maxKey];
    if (min || max) {
      chips.push({
        key: `${def.minKey}-${def.maxKey}`,
        label: `${def.label}: ${min || "…"} – ${max || "…"}`,
        onRemove: () => onFiltersChange({ [def.minKey]: "", [def.maxKey]: "" }),
      });
    }
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex min-w-[14rem] flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchChange(draft);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">{labels.searchLabel}</span>
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="h-9 w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 text-[13px] text-white/80 placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            {labels.searchSubmit}
          </Button>
        </form>

        {filters.length > 0 ? (
          <div className="relative" ref={popoverRef}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen((previous) => !previous)}
            >
              {labels.filters}
              {activeFilterCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-indigo-400/20 px-1.5 text-[11px] font-semibold text-indigo-200">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            {open ? (
              <div
                role="dialog"
                aria-label={labels.filters}
                className="absolute right-0 z-30 mt-2 w-[20rem] space-y-3 rounded-xl border border-white/[0.11] bg-[color:var(--dg-header-surface)] p-4 shadow-2xl"
              >
                {filters.map((def) =>
                  def.kind === "select" ? (
                    <Select
                      key={def.key}
                      label={def.label}
                      value={values[def.key] ?? ""}
                      onChange={(event) => onFiltersChange({ [def.key]: event.target.value })}
                      // Boş değer = "Tümü" (filtre uygulanmaz).
                      options={[{ value: "", label: labels.filterAll }, ...def.options]}
                    />
                  ) : (
                    <fieldset key={`${def.minKey}-${def.maxKey}`}>
                      <legend className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/35">
                        {def.label}
                      </legend>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={def.minPlaceholder ?? def.label}
                          placeholder={def.minPlaceholder}
                          value={values[def.minKey] ?? ""}
                          onChange={(event) => onFiltersChange({ [def.minKey]: event.target.value })}
                          className="h-9 w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 text-[13px] text-white/80 focus:border-indigo-400/60 focus:outline-none"
                        />
                        <span aria-hidden="true" className="text-white/30">
                          –
                        </span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={def.maxPlaceholder ?? def.label}
                          placeholder={def.maxPlaceholder}
                          value={values[def.maxKey] ?? ""}
                          onChange={(event) => onFiltersChange({ [def.maxKey]: event.target.value })}
                          className="h-9 w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 text-[13px] text-white/80 focus:border-indigo-400/60 focus:outline-none"
                        />
                      </div>
                    </fieldset>
                  ),
                )}
                <div className="flex justify-between gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
                    {labels.filtersClear}
                  </Button>
                  <Button type="button" size="sm" onClick={() => setOpen(false)}>
                    {labels.filtersApply}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {sortOptions.length > 0 ? (
          <label className="min-w-[11rem]">
            <span className="sr-only">{labels.sortLabel}</span>
            <select
              value={sortValue}
              onChange={(event) => onSortChange(event.target.value)}
              aria-label={labels.sortLabel}
              className="h-9 w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 text-[13px] text-white/80 focus:border-indigo-400/60 focus:outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {actions ? <div className="flex items-end gap-2">{actions}</div> : null}
      </div>

      {chips.length > 0 || search ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {search ? (
            <Chip
              label={`${labels.searchLabel}: ${search}`}
              removeLabel={format(labels.removeFilter, { label: labels.searchLabel })}
              onRemove={() => onSearchChange("")}
            />
          ) : null}
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              removeLabel={format(labels.removeFilter, { label: chip.label })}
              onRemove={chip.onRemove}
            />
          ))}
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-1 text-[11px] font-semibold text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
          >
            {labels.filtersClear}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/[0.11] bg-white/[0.06] py-1 pl-2.5 pr-1.5",
        "text-[11px] font-medium text-white/70",
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex h-4 w-4 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

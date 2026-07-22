"use client";

/**
 * TODO-159B (ADR-090) — Ürün kategori ataması alanı.
 *
 * Neden ortak `EntitySelectorField` DEĞİL: burada seçim listesi domain'e özgü bir
 * ek karar taşır — ★ ANA KATEGORİ. Ana kategori ürünün dinamik attribute şemasını
 * sürdüğü için (ADR-067) seçili satırların yanında görünür olmak zorundadır.
 * Bu yüzden alan kendi seçili listesini çizer; ARAMA/SAYFALAMA/KLAVYE yüzeyi ise
 * ortak `EntitySelectorModal`'dır (ikinci bir arama çözümü YAZILMAZ).
 *
 * Eski davranış: kategoriler `listCategories()` ile (ilk 25) çekilip işaretli kutu
 * listesi olarak basılıyordu — 26. kategoriden sonrası ürüne ATANAMIYOR, hâlihazırda
 * atanmış olan da GÖRÜNMÜYORDU (TD-093). Artık seçili kayıtlar `ids` çözüm moduyla
 * ayrıca getirilir; kaçıncı sayfada oldukları önemsizdir.
 */

import { useState } from "react";
import { format, getDictionary, type Locale } from "@commerce-os/i18n";
import { Button, Spinner, cn } from "../../../components/ui";
import {
  EntitySelectorModal,
  useCategorySelectorBinding,
  useSelectedItems,
} from "../../../components/selector";
import { messageForError } from "../../../lib/client/messages";

export interface ProductCategoryFieldProps {
  locale: Locale;
  label: string;
  hint: string;
  primaryHint: string;
  value: string[];
  primaryId: string | null;
  /** Modaldan gelen TAM liste (ana kategori kuralları çağıranda uygulanır). */
  onChange: (ids: string[]) => void;
  onSelectPrimary: (id: string) => void;
  disabled?: boolean;
  error?: string | null;
}

export function ProductCategoryField({
  locale,
  label,
  hint,
  primaryHint,
  value,
  primaryId,
  onChange,
  onSelectPrimary,
  disabled,
  error,
}: ProductCategoryFieldProps) {
  const dict = getDictionary(locale).storeAdmin;
  const s = dict.selector;
  const c = s.category;
  const binding = useCategorySelectorBinding(locale);
  const [open, setOpen] = useState(false);
  const selected = useSelectedItems({ ids: value, source: binding.source });

  const remove = (id: string) => onChange(value.filter((entry) => entry !== id));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white/70">{label}</span>
        <span className="text-[11px] text-white/30">
          {format(s.selectedCount, { count: value.length })}
        </span>
      </div>
      <p className="mb-2 text-xs text-white/30">{hint}</p>

      {value.length === 0 ? (
        <p className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/30">
          {s.selectedEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {selected.items.map((category) => {
            const isPrimary = primaryId === category.id;
            const path = category.path.join(" / ");
            return (
              <li
                key={category.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm",
                  isPrimary
                    ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                    : "border-white/10 text-white/70",
                )}
              >
                <span className="min-w-0 truncate" title={path}>
                  {path}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectPrimary(category.id)}
                    disabled={disabled || isPrimary}
                    aria-pressed={isPrimary}
                    title={primaryHint}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      isPrimary
                        ? "bg-indigo-500/30 text-indigo-100"
                        : "border border-white/15 text-white/50 hover:text-white/80",
                    )}
                  >
                    {isPrimary ? `★ ${c.primaryBadge}` : c.setPrimary}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(category.id)}
                    disabled={disabled}
                    aria-label={format(s.removeSelection, { label: path })}
                    className="flex h-5 w-5 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden>
                      <path
                        d="M5 5l10 10M15 5L5 15"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {selected.resolving ? (
        <p className="mt-1.5">
          <Spinner size="sm" label={s.resolving} />
        </p>
      ) : null}

      {!selected.resolving && selected.unresolvedIds.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-amber-300/80">
          {format(s.unresolvedNotice, { count: selected.unresolvedIds.length })}
        </p>
      ) : null}

      <div className="mt-2">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {s.openSelector}
        </Button>
      </div>

      <p className="mt-2 text-xs text-white/30">{primaryHint}</p>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {open ? (
        <EntitySelectorModal
          open
          onClose={() => setOpen(false)}
          title={binding.title}
          description={binding.description}
          multiple
          selectedIds={value}
          onChange={onChange}
          source={binding.source}
          presenter={binding.presenter}
          labels={binding.labels}
          toMessage={(cause) => messageForError(cause, locale)}
          onItemsLoaded={selected.remember}
        />
      ) : null}
    </div>
  );
}

"use client";

/**
 * TODO-159B (ADR-090) — Ortak "aranabilir seçici" bileşeni.
 *
 * Store Admin'deki HER ürün/kategori seçimi buradan geçer; modal başına ayrı
 * arama/sayfalama çözümü YAZILMAZ. Görsel dil store-admin koyu cam kiti +
 * ADR-089 Data Grid dilidir — yeni palet/token üretilmez, hardcoded renk yoktur
 * (mevcut sınıf sözlüğü aynen kullanılır).
 *
 * Bileşen iki parçadır:
 *  - `EntitySelectorField`: formdaki ALAN. Seçili kayıtları çip olarak gösterir
 *    (arama sonucunda olmasalar bile — `ids` çözüm modu sayesinde) ve modalı açar.
 *  - `EntitySelectorModal`: arama + sayfalama + klavye navigasyonu olan seçim
 *    yüzeyi. Listbox deseni: `role="listbox"` + `role="option"` + `aria-selected`,
 *    `aria-activedescendant` ile klavye odağı, `aria-live` ile durum duyurusu.
 *
 * Escape ile kapanma ve odak hapsi paylaşılan `Modal`'dan gelir; arama kutusunun
 * odağı Modal'ın panel odağından SONRA (bir makro-görev gecikmesiyle) alınır —
 * aksi halde panel odağı kutudan odağı çalardı.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "@commerce-os/i18n";
import { Alert, Badge, Button, Modal, SkeletonRows, Spinner, cn } from "../ui";
import { DataGridPagination, type DataGridPaginationLabels } from "../data-grid";
import {
  useSelectedItems,
  useSelectorSearch,
  type SelectorSource,
} from "./use-selector-search";

/** Satırın nasıl okunacağı — kaynak başına küçük bir sunum sözleşmesi. */
export interface SelectorPresenter<Item> {
  primaryText: (item: Item) => string;
  /** İkincil satır (SKU, slug, hiyerarşi yolu…). null = gösterme. */
  secondaryText?: (item: Item) => string | null;
  /** Satırın sağ ucu (durum rozeti, fiyat, stok özeti…). */
  meta?: (item: Item) => ReactNode;
  /** 32px küçük görsel; null = harf yer tutucusu. */
  imageUrl?: (item: Item) => string | null;
}

export interface EntitySelectorLabels {
  searchLabel: string;
  searchPlaceholder: string;
  listLabel: string;
  loading: string;
  errorTitle: string;
  retry: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyFilteredTitle: string;
  emptyFilteredDescription: string;
  selectedTitle: string;
  selectedEmpty: string;
  selectedCount: string;
  removeSelection: string;
  clearAll: string;
  openSelector: string;
  close: string;
  done: string;
  selectOption: string;
  deselectOption: string;
  resolving: string;
  unresolvedNotice: string;
  pagination: DataGridPaginationLabels;
}

/* ──────────────────────────────── Satır ──────────────────────────────── */

function OptionRow<Item>({
  item,
  presenter,
  selected,
  active,
  optionId,
  labels,
  onToggle,
  multiple,
}: {
  item: Item;
  presenter: SelectorPresenter<Item>;
  selected: boolean;
  active: boolean;
  optionId: string;
  labels: EntitySelectorLabels;
  onToggle: () => void;
  multiple: boolean;
}) {
  const primary = presenter.primaryText(item);
  const secondary = presenter.secondaryText?.(item) ?? null;
  const imageUrl = presenter.imageUrl?.(item) ?? null;
  return (
    <li
      id={optionId}
      role="option"
      aria-selected={selected}
      // Fare ile seçim: satırın tamamı tıklanabilir. Klavye yolu input'taki
      // ArrowUp/Down + Enter'dır (odak arama kutusunda kalır — combobox deseni).
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
        active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
        selected ? "text-white/90" : "text-white/70",
      )}
    >
      <input
        type={multiple ? "checkbox" : "radio"}
        checked={selected}
        readOnly
        tabIndex={-1}
        aria-label={format(selected ? labels.deselectOption : labels.selectOption, {
          label: primary,
        })}
        className="h-3.5 w-3.5 shrink-0 accent-indigo-400"
      />
      {presenter.imageUrl ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/35">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            primary.slice(0, 1).toUpperCase()
          )}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{primary}</span>
        {secondary ? (
          <span className="block truncate text-[11px] text-white/35">{secondary}</span>
        ) : null}
      </span>
      {presenter.meta ? (
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-white/45">
          {presenter.meta(item)}
        </span>
      ) : null}
    </li>
  );
}

/* ──────────────────────────────── Modal ──────────────────────────────── */

export interface EntitySelectorModalProps<Item> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  multiple: boolean;
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  source: SelectorSource<Item>;
  presenter: SelectorPresenter<Item>;
  labels: EntitySelectorLabels;
  toMessage: (error: unknown) => string;
  /** Sayfa sonuçlarını alan bileşenin seçili-önbelleğine aktarır. */
  onItemsLoaded?: (items: Item[]) => void;
}

export function EntitySelectorModal<Item>({
  open,
  onClose,
  title,
  description,
  multiple,
  selectedIds,
  onChange,
  source,
  presenter,
  labels,
  toMessage,
  onItemsLoaded,
}: EntitySelectorModalProps<Item>) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const search = useSelectorSearch<Item>({
    source,
    enabled: open,
    toMessage,
    onItemsLoaded,
  });

  // Modal paneli açılışta kendine odaklanır (paylaşılan Modal davranışı). Arama
  // kutusunun odağı bir makro-görev SONRA alınır ki panel odağı onu çalmasın.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = search.items;
  useEffect(() => {
    // Yeni sonuç kümesinde klavye imleci başa döner (aksi halde görünmeyen bir
    // satır "etkin" kalırdı).
    setActiveIndex(0);
  }, [items]);

  const toggle = useCallback(
    (id: string) => {
      if (!multiple) {
        onChange(selectedIds.includes(id) ? [] : [id]);
        return;
      }
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter((entry) => entry !== id)
          : [...selectedIds, id],
      );
    },
    [multiple, onChange, selectedIds],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) toggle(source.keyOf(item));
    }
  };

  const filtered = search.appliedSearch.trim().length > 0;
  const activeItem = items[activeIndex];
  const activeOptionId = activeItem ? `${listId}-opt-${source.keyOf(activeItem)}` : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeLabel={labels.close}
      className="max-w-2xl"
      footer={
        <>
          <span className="mr-auto text-[11px] text-white/40">
            {format(labels.selectedCount, { count: selectedIds.length })}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {labels.done}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="sr-only">{labels.searchLabel}</span>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-label={labels.searchLabel}
            placeholder={labels.searchPlaceholder}
            value={search.search}
            onChange={(event) => search.setSearch(event.target.value)}
            onKeyDown={onKeyDown}
            className="h-10 w-full rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 text-[13px] text-white/80 placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
          />
        </label>

        {search.status === "loading" ? (
          <div role="status" aria-live="polite" aria-label={labels.loading}>
            <SkeletonRows rows={4} />
          </div>
        ) : null}

        {search.status === "error" ? (
          <Alert
            tone="error"
            title={labels.errorTitle}
            action={
              <Button variant="secondary" size="sm" onClick={search.retry}>
                {labels.retry}
              </Button>
            }
          >
            {search.errorMessage}
          </Alert>
        ) : null}

        {search.status === "ready" && items.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-white/80">
              {filtered ? labels.emptyFilteredTitle : labels.emptyTitle}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {filtered ? labels.emptyFilteredDescription : labels.emptyDescription}
            </p>
          </div>
        ) : null}

        {search.status === "ready" && items.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={labels.listLabel}
            aria-multiselectable={multiple}
            className="max-h-[22rem] space-y-0.5 overflow-y-auto rounded-xl border border-white/[0.06] p-1"
          >
            {items.map((item, index) => {
              const id = source.keyOf(item);
              return (
                <OptionRow
                  key={id}
                  optionId={`${listId}-opt-${id}`}
                  item={item}
                  presenter={presenter}
                  selected={selectedIds.includes(id)}
                  active={index === activeIndex}
                  labels={labels}
                  multiple={multiple}
                  onToggle={() => toggle(id)}
                />
              );
            })}
          </ul>
        ) : null}

        {search.status !== "loading" ? (
          <DataGridPagination
            labels={labels.pagination}
            page={search.pagination.page}
            pageSize={search.pagination.pageSize}
            totalItems={search.pagination.totalItems}
            totalPages={search.pagination.totalPages}
            onPageChange={search.setPage}
            onPageSizeChange={search.setPageSize}
          />
        ) : null}
      </div>
    </Modal>
  );
}

/* ──────────────────────────────── Alan ───────────────────────────────── */

export interface EntitySelectorFieldProps<Item> {
  label: string;
  hint?: string;
  multiple: boolean;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  source: SelectorSource<Item>;
  presenter: SelectorPresenter<Item>;
  labels: EntitySelectorLabels;
  toMessage: (error: unknown) => string;
  modalTitle: string;
  modalDescription?: string;
  disabled?: boolean;
}

export function EntitySelectorField<Item>({
  label,
  hint,
  multiple,
  value,
  onChange,
  source,
  presenter,
  labels,
  toMessage,
  modalTitle,
  modalDescription,
  disabled,
}: EntitySelectorFieldProps<Item>) {
  const [open, setOpen] = useState(false);
  // KRİTİK: seçili kayıtlar SAYFADAN BAĞIMSIZ çözülür. 100. sıradan sonraki bir
  // ürün seçili olsa bile çipi görünür ve kaldırılabilir olur (TD-093'ün özü).
  const selected = useSelectedItems<Item>({ ids: value, source });

  const chips = useMemo(
    () =>
      selected.items.map((item) => ({
        id: source.keyOf(item),
        label: presenter.primaryText(item),
        secondary: presenter.secondaryText?.(item) ?? null,
      })),
    [selected.items, source, presenter],
  );

  const remove = (id: string) => onChange(value.filter((entry) => entry !== id));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          {label}
        </span>
        <span className="text-[11px] text-white/30">
          {format(labels.selectedCount, { count: value.length })}
        </span>
      </div>

      <div className="rounded-xl border border-white/[0.09] bg-white/[0.03] p-2">
        {chips.length === 0 && selected.unresolvedIds.length === 0 ? (
          <p className="px-1 py-1.5 text-xs text-white/30">{labels.selectedEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] py-1 pl-2.5 pr-1 text-xs text-white/75"
              >
                <span className="truncate" title={chip.secondary ?? chip.label}>
                  {chip.label}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(chip.id)}
                  aria-label={format(labels.removeSelection, { label: chip.label })}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/15 hover:text-white/80 disabled:pointer-events-none disabled:opacity-40"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-2.5 w-2.5" aria-hidden>
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected.resolving ? (
          <p className="mt-1.5 px-1">
            <Spinner size="sm" label={labels.resolving} />
          </p>
        ) : null}

        {/* Çözülemeyen id: kayıt silinmiş olabilir. Sessizce YUTMAK yerine
            görünür kılınır — kullanıcı neden eksik gördüğünü bilir. */}
        {!selected.resolving && selected.unresolvedIds.length > 0 ? (
          <p className="mt-1.5 px-1 text-[11px] text-amber-300/80">
            {format(labels.unresolvedNotice, { count: selected.unresolvedIds.length })}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
            {labels.openSelector}
          </Button>
          {value.length > 0 ? (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([])}>
              {labels.clearAll}
            </Button>
          ) : null}
        </div>
      </div>

      {hint ? <p className="mt-1.5 text-xs text-white/30">{hint}</p> : null}

      {open ? (
        <EntitySelectorModal
          open
          onClose={() => setOpen(false)}
          title={modalTitle}
          description={modalDescription}
          multiple={multiple}
          selectedIds={value}
          onChange={onChange}
          source={source}
          presenter={presenter}
          labels={labels}
          toMessage={toMessage}
          onItemsLoaded={selected.remember}
        />
      ) : null}
    </div>
  );
}

/** Seçici satırlarında durum rozeti — liste ekranlarıyla AYNI ton sözlüğü. */
export function SelectorStatusBadge({ tone, children }: { tone: "neutral" | "success" | "warning"; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

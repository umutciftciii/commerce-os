"use client";

/**
 * TODO-159A (ADR-089) — Ortak Admin Data Grid tablosu.
 *
 * Mevcut `components/ui` DataTable'ın yerine geçmez; onu SARMALAYAN daha yüksek
 * seviyeli bir kabuktur: yükleme / boş / hata durumları, yapışkan başlık,
 * (opsiyonel) satır seçimi ve sıralanabilir kolon başlıkları tek yerde yaşar.
 * Görsel dil store-admin koyu cam kitiyle AYNIdır — yeni palet/token üretilmez.
 */

import type { ReactNode } from "react";
import { Alert, Button, EmptyState, SkeletonRows, cn } from "../ui";

export interface DataGridColumn<Row> {
  /** Kolon kimliği; sıralanabilir kolonlarda sunucu `sortBy` değeriyle AYNI olmalıdır. */
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** true ise başlık tıklanabilir sıralama düğmesine dönüşür. */
  sortable?: boolean;
}

export interface DataGridLabels {
  loading: string;
  errorTitle: string;
  retry: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyFilteredTitle: string;
  emptyFilteredDescription: string;
  selectRow: string;
  selectAll: string;
}

export interface DataGridProps<Row> {
  columns: DataGridColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  status: "loading" | "error" | "ready";
  errorMessage?: string;
  onRetry?: () => void;
  /** Arama/filtre etkinken boş sonuç FARKLI anlatılır (kullanıcı "hiç kayıt yok" sanmasın). */
  filtered?: boolean;
  labels: DataGridLabels;
  caption: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (sortBy: string, sortOrder: "asc" | "desc") => void;
  /** Satır seçimi YALNIZ gerçek bir toplu aksiyon varsa etkinleştirilir (sahte bulk yok). */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

/**
 * Yapışkan başlık: uzun listelerde kolon adları kayıtlarla birlikte kaybolmaz.
 * Arka plan OPAK olmalı (altından satır sızmasın) → `--dg-header-surface` token'ı.
 */
const HEAD_CELL =
  "sticky top-0 z-10 border-b border-[color:var(--dg-header-border)] bg-[color:var(--dg-header-surface)] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white/[0.26]";

export function DataGrid<Row>({
  columns,
  rows,
  rowKey,
  status,
  errorMessage,
  onRetry,
  filtered = false,
  labels,
  caption,
  emptyAction,
  emptyIcon,
  sortBy,
  sortOrder = "desc",
  onSortChange,
  selectedIds,
  onSelectionChange,
}: DataGridProps<Row>) {
  if (status === "loading") {
    return (
      <div role="status" aria-live="polite" aria-label={labels.loading}>
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <Alert
        tone="error"
        title={labels.errorTitle}
        action={
          onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {labels.retry}
            </Button>
          ) : undefined
        }
      >
        {errorMessage}
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? labels.emptyFilteredTitle : labels.emptyTitle}
        description={filtered ? labels.emptyFilteredDescription : labels.emptyDescription}
        icon={emptyIcon}
        action={filtered ? undefined : emptyAction}
      />
    );
  }

  const selectable = selectedIds !== undefined && onSelectionChange !== undefined;
  const pageIds = rows.map(rowKey);
  const allSelected = selectable && pageIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (!selectable) return;
    onSelectionChange(
      allSelected
        ? selectedIds.filter((id) => !pageIds.includes(id))
        : [...new Set([...selectedIds, ...pageIds])],
    );
  };

  const toggleRow = (id: string) => {
    if (!selectable) return;
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id],
    );
  };

  return (
    // Mobilde yatay taşma KONTROLLÜ: kaydırma tablonun kendi kabında kalır,
    // sayfa gövdesi yatay kaymaz.
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-white/[0.06]">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left">
            {selectable ? (
              <th scope="col" className={cn(HEAD_CELL, "w-10")}>
                <input
                  type="checkbox"
                  aria-label={labels.selectAll}
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer accent-indigo-400"
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const isSorted = sortBy === column.key;
              const canSort = column.sortable && onSortChange;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    HEAD_CELL,
                    column.align === "right" ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange(column.key, isSorted && sortOrder === "asc" ? "desc" : "asc")
                      }
                      className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                    >
                      {column.header}
                      <span aria-hidden="true" className={isSorted ? "text-indigo-300" : "text-white/20"}>
                        {isSorted ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            return (
              <tr key={id} className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.02]">
                {selectable ? (
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="checkbox"
                      aria-label={labels.selectRow}
                      checked={selectedIds.includes(id)}
                      onChange={() => toggleRow(id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-indigo-400"
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 align-middle text-white/70",
                      column.align === "right" ? "text-right" : "text-left",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

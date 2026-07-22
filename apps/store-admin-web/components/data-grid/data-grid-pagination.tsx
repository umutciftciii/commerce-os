"use client";

/**
 * TODO-159A (ADR-089) — Ortak Data Grid sayfalama çubuğu.
 *
 * Tablonun ALTINDA net biçimde durur ve üç soruyu birden yanıtlar: kaç kayıt var,
 * şu an hangi aralığı görüyorum, nereye gidebilirim. Aralık metni sunucudan gelen
 * `totalItems`'a dayanır — istemcide sayılmaz.
 */

import { ADMIN_LIST_PAGE_SIZE_OPTIONS } from "@commerce-os/api-client";
import { format } from "@commerce-os/i18n";
import { Button } from "../ui";

export interface DataGridPaginationLabels {
  rangeLabel: string;
  rangeEmpty: string;
  previousPage: string;
  nextPage: string;
  pageSizeLabel: string;
  goToPage: string;
  pageOf: string;
}

export interface DataGridPaginationProps {
  labels: DataGridPaginationLabels;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function DataGridPagination({
  labels,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: DataGridPaginationProps) {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const canPrevious = page > 1;
  const canNext = totalPages > 0 && page < totalPages;

  return (
    <nav
      aria-label={labels.goToPage}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3"
    >
      <p aria-live="polite" className="text-xs text-white/45">
        {totalItems === 0
          ? labels.rangeEmpty
          : format(labels.rangeLabel, { from, to, total: totalItems })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-white/40">
          {labels.pageSizeLabel}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-[9px] border border-white/[0.12] bg-white/[0.05] px-2 text-xs text-white/75 focus:border-indigo-400/60 focus:outline-none"
          >
            {ADMIN_LIST_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canPrevious}
            onClick={() => onPageChange(page - 1)}
          >
            {labels.previousPage}
          </Button>
          {/* Doğrudan sayfa geçişi: uzun listelerde tek tek ilerlemek gerekmez. */}
          <label className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="sr-only">{labels.goToPage}</span>
            <input
              type="number"
              min={1}
              max={Math.max(totalPages, 1)}
              value={page}
              aria-label={labels.goToPage}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(next)) return;
                onPageChange(Math.min(Math.max(next, 1), Math.max(totalPages, 1)));
              }}
              className="h-8 w-14 rounded-[9px] border border-white/[0.12] bg-white/[0.05] px-2 text-center text-xs tabular-nums text-white/75 focus:border-indigo-400/60 focus:outline-none"
            />
            <span className="tabular-nums">
              {format(labels.pageOf, { page, totalPages: Math.max(totalPages, 1) })}
            </span>
          </label>
          <Button variant="secondary" size="sm" disabled={!canNext} onClick={() => onPageChange(page + 1)}>
            {labels.nextPage}
          </Button>
        </div>
      </div>
    </nav>
  );
}

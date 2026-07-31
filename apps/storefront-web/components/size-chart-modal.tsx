"use client";

// TODO-165 Fashion Vertical — Beden tablosu modalı. Yalnız fashion PDP'de, published
// beden tablosu (StorefrontFashionSizeChart) varsa buy box'tan açılır. İçerik SUNUCU'dan
// gelen salt-metin (columns/rows); ASLA dangerouslySetInnerHTML kullanılmaz. Erişilebilirlik:
// role=dialog + aria-modal, ESC ile kapanma, backdrop tıklaması ile kapanma, açıkken body scroll
// kilidi. Fiyat/stok TAŞIMAZ (yalnız ölçü referansı).

import { useEffect } from "react";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontFashionSizeChart } from "../lib/catalog-types";

export function SizeChartModal({
  chart,
  open,
  onClose,
  t,
}: {
  chart: StorefrontFashionSizeChart;
  open: boolean;
  onClose: () => void;
  t: StorefrontDictionary["detail"]["fashion"];
}) {
  // ESC ile kapat + açıkken arka plan scroll'unu kilitle (modal odağı korunur).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Sütun anahtarları: ilk sütun beden adı, ardından tablo sütunları (label + opsiyonel birim).
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={chart.name}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden border border-line bg-surface shadow-xl sm:max-h-[80vh]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{chart.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.sizeGuideClose}
            className="inline-flex h-8 w-8 items-center justify-center border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <div className="max-h-[calc(85vh-8rem)] overflow-auto px-5 py-4 sm:max-h-[calc(80vh-8rem)]">
          {chart.measurementUnit ? (
            <p className="mb-3 text-xs text-ink-subtle">
              {format(t.sizeGuideUnit, { unit: chart.measurementUnit })}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left">
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-ink">
                    {t.sizeColumn}
                  </th>
                  {chart.columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 font-semibold text-ink"
                    >
                      {column.label}
                      {column.unit ? (
                        <span className="ml-1 text-xs font-normal text-ink-subtle">({column.unit})</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((row) => (
                  <tr key={row.size} className="border-b border-line last:border-b-0">
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-ink">
                      {row.size}
                    </th>
                    {chart.columns.map((column) => (
                      <td key={column.key} className="whitespace-nowrap px-3 py-2 text-ink-muted">
                        {cellText(row.cells[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hücreyi düz metne çevirir (string/number/eksik). ASLA HTML olarak enjekte edilmez. */
function cellText(value: string | number | undefined): string {
  if (value === undefined || value === null) return "—";
  return String(value);
}

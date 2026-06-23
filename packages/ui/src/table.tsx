import type { ReactNode } from "react";
import { cn } from "./cn";

export interface DataTableColumn<Row> {
  /** Sutun basligi (gorunur metin cagiran taraftan, i18n'den gelir). */
  header: string;
  /** Satirdan hucre icerigini uretir. */
  cell: (row: Row) => ReactNode;
  /** Hucre/baslik hizalamasi. */
  align?: "left" | "right";
  className?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Her satir icin kararli React key. */
  rowKey: (row: Row) => string;
  /** Satira tiklaninca cagrilir (satir aksiyonu). */
  onRowClick?: (row: Row) => void;
  caption?: string;
  className?: string;
}

/**
 * Sade, kurumsal SaaS gorunumunde sunum amacli veri tablosu. Domain veya network
 * bilgisi tasimaz; satir/sutun icerigini tamamen cagiran taraf belirler.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  className,
}: DataTableProps<Row>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={cn(
                  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400",
                  column.align === "right" ? "text-right" : "text-left",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors",
                onRowClick ? "cursor-pointer hover:bg-slate-50" : undefined,
              )}
            >
              {columns.map((column, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-4 py-3 align-middle text-slate-700",
                    column.align === "right" ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

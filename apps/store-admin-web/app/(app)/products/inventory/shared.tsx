"use client";

// TODO-152A — Inventory Engine PAYLAŞILAN sunum atomları.
//
// Hem Product Detail > Stok sekmesi (ürün-bazlı düzenleme workspace'i) hem de global Stok
// izleme merkezi (mağaza-geneli, salt-okuma + tek-satır hızlı işlem) AYNI atomları kullanır:
// böylece iki ekran tek görsel dil + tek durum semantiği paylaşır. Renk anlamı Fiyatlandırma ile
// aynı semantik token'lardan (pw / .pricing-workspace) gelir. Bileşenler PURE + dict'ten bağımsızdır
// (etiketler prop olarak geçilir) — iki farklı i18n namespace'iyle de çalışır.

import type { InventoryStockStatus, InventoryWarehouse } from "@commerce-os/api-client";
import type { Locale } from "@commerce-os/i18n";
import { Badge } from "../../../../components/ui";
import { pw } from "../pricing/pricing-tokens";

/* ───────────────────────────── formatlama ───────────────────────────── */

export function fmt(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "en" ? "en-US" : "tr-TR");
}

export function fmtSigned(value: number, locale: Locale): string {
  const s = fmt(Math.abs(value), locale);
  if (value > 0) return `+${s}`;
  if (value < 0) return `−${s}`;
  return s;
}

/* ───────────────────────────── durum semantiği ───────────────────────────── */

export const INVENTORY_STATUS_TONE: Record<
  InventoryStockStatus,
  "success" | "warning" | "neutral" | "info"
> = {
  IN_STOCK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "warning",
  INCOMING: "info",
  NEGATIVE: "warning",
  NO_BALANCE: "neutral",
};

export function StatusBadge({ status, label }: { status: InventoryStockStatus; label: string }) {
  return <Badge tone={INVENTORY_STATUS_TONE[status]}>{label}</Badge>;
}

/* ───────────────────────────── KPI kartı ───────────────────────────── */

export function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const toneClass =
    tone === "success"
      ? pw.success
      : tone === "warning"
        ? pw.warning
        : tone === "info"
          ? pw.accent
          : pw.ink;
  return (
    <div className={`rounded-lg border ${pw.line} ${pw.surface} p-3`}>
      <p className={`text-xs font-medium ${pw.faint}`}>{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

/* ───────────────────────────── depo seçici ───────────────────────────── */

export interface WarehouseSelectorLabels {
  label: string;
  defaultBadge: string;
  inactiveBadge: string;
  none: string;
}

export function WarehouseSelector({
  labels,
  warehouses,
  active,
  onSelect,
}: {
  labels: WarehouseSelectorLabels;
  warehouses: InventoryWarehouse[];
  active: InventoryWarehouse | null;
  onSelect: (id: string) => void;
}) {
  if (warehouses.length === 0 && !active) {
    return <p className={`text-sm ${pw.muted}`}>{labels.none}</p>;
  }
  const list = warehouses.length > 0 ? warehouses : active ? [active] : [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-sm font-medium ${pw.muted}`}>{labels.label}:</span>
      {list.map((w) => {
        const isActive = active?.id === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect(w.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? `${pw.lineStrong} ${pw.selected} ${pw.ink}`
                : `${pw.line} ${pw.muted} ${pw.hover}`
            }`}
          >
            <span className="font-medium">{w.name}</span>
            {w.isDefault ? <Badge tone="info">{labels.defaultBadge}</Badge> : null}
            {w.status === "INACTIVE" ? <Badge tone="warning">{labels.inactiveBadge}</Badge> : null}
          </button>
        );
      })}
    </div>
  );
}

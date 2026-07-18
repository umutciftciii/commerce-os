"use client";

// TODO-152A — GLOBAL STOK: mağaza-geneli izleme & operasyon merkezi.
//
// Eski legacy liste + "Stok düzelt" modalı KALDIRILDI. Bu ekran Inventory Engine'in mağaza-geneli
// SALT-OKUMA matrisini (tüm ürünler × seçili depo) gösterir; durum/satılabilir SAF motordan gelir →
// Product Detail > Stok sekmesiyle BİREBİR aynı semantik + aynı paylaşılan componentler (./products/
// inventory/shared). Düzenleme (Quick Edit / Bulk / Preview / Apply) ADR-076 gereği ürün-bazlı kalır:
// her satır o ürünün Stok sekmesine tek-tık geçer. Ek olarak güvenli tek-satır hızlı işlemler (+/−/
// sıfırla) mevcut ürün-bazlı preview→apply uçlarını kullanır (yeni fan-out yazma motoru YOK).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getDictionary } from "@commerce-os/i18n";
import type {
  InventoryStockStatus,
  InventoryStoreMatrixRow,
  InventoryWarehouse,
} from "@commerce-os/api-client";
import { Alert, Button, Input, PageHeader, useLocale } from "../../../components/ui";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { pw, PRICING_ROOT } from "../products/pricing/pricing-tokens";
import {
  fmt,
  Kpi,
  StatusBadge,
  WarehouseSelector,
} from "../products/inventory/shared";

/** Tek-satır hızlı işlem adımı (onHand +/−). Sıfırla = SET_ABSOLUTE 0. */
const QUICK_STEP = 10;

type StatusFilter = "ALL" | InventoryStockStatus;
const FILTER_ORDER: StatusFilter[] = [
  "ALL",
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "INCOMING",
  "NEGATIVE",
  "NO_BALANCE",
];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

export default function InventoryPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.inventory;
  const c = dict.common;

  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [warehouse, setWarehouse] = useState<InventoryWarehouse | null>(null);
  const [rows, setRows] = useState<InventoryStoreMatrixRow[]>([]);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingVariantId, setActingVariantId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<InventoryStoreMatrixRow | null>(null);

  const load = useCallback(
    async (targetWarehouseId?: string) => {
      setState({ status: "loading" });
      setError(null);
      try {
        const [whList, matrix] = await Promise.all([
          warehouses.length === 0
            ? storeApi.listWarehouses()
            : Promise.resolve({ data: warehouses }),
          storeApi.getStoreInventoryMatrix(targetWarehouseId),
        ]);
        if (whList.data.length > 0 && warehouses.length === 0) setWarehouses(whList.data);
        setRows(matrix.rows);
        setWarehouse(matrix.warehouse);
        setState({ status: "ready" });
      } catch (err) {
        setState({ status: "error", message: messageForError(err, locale) });
      }
    },
    [locale, warehouses],
  );

  // İlk yükleme yalnız bir kez; depo değişimi ayrı switchWarehouse ile yönetilir. `load` bilinçli
  // olarak bağımlılık dışı (warehouses referansı değiştikçe yeniden tetiklenmesin — ilk-yükleme tek sefer).
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void loadRef.current();
  }, []);

  const switchWarehouse = (id: string) => {
    if (id === warehouse?.id) return;
    void load(id);
  };

  /* ── KPI (seçili depo genelinde) ── */
  const kpi = useMemo(() => {
    let onHand = 0;
    let reserved = 0;
    let sellable = 0;
    let incoming = 0;
    let low = 0;
    let out = 0;
    for (const r of rows) {
      onHand += r.current.onHand;
      reserved += r.current.reserved;
      sellable += r.currentCalc.sellableAvailable;
      incoming += r.current.incoming;
      if (r.currentCalc.status === "LOW_STOCK") low++;
      if (
        r.currentCalc.status === "OUT_OF_STOCK" ||
        r.currentCalc.status === "INCOMING" ||
        r.currentCalc.status === "NEGATIVE"
      ) {
        out++;
      }
    }
    return { onHand, reserved, sellable, incoming, low, out };
  }, [rows]);

  /* ── arama + filtre (istemci tarafı) ── */
  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale === "en" ? "en-US" : "tr-TR");
    return rows.filter((r) => {
      if (filter !== "ALL" && r.currentCalc.status !== filter) return false;
      if (q === "") return true;
      const variantLabel =
        r.attributes.length > 0 ? r.attributes.map((a) => a.label).join(" ") : r.title;
      const haystack = `${r.productTitle} ${variantLabel} ${r.sku}`.toLocaleLowerCase(
        locale === "en" ? "en-US" : "tr-TR",
      );
      return haystack.includes(q);
    });
  }, [rows, search, filter, locale]);

  const warehouseInactive = warehouse?.status === "INACTIVE";

  /* ── güvenli tek-satır hızlı işlem: ürün-bazlı preview→apply (ADR-076 korunur) ── */
  const runQuickAdjust = useCallback(
    async (row: InventoryStoreMatrixRow, nextOnHand: number) => {
      if (!warehouse) return;
      setActingVariantId(row.variantId);
      setError(null);
      setNotice(null);
      try {
        const edits = [{ variantId: row.variantId, onHand: nextOnHand }];
        const preview = await storeApi.previewInventory(row.productId, {
          warehouseId: warehouse.id,
          edits,
        });
        if (preview.blocked) {
          setError(t.quick.blockedToast);
          return;
        }
        await storeApi.applyInventory(row.productId, {
          warehouseId: warehouse.id,
          baseFingerprint: preview.fingerprint,
          edits,
        });
        setNotice(
          t.quick.appliedToast
            .replace("{title}", row.productTitle)
            .replace("{old}", fmt(row.current.onHand, locale))
            .replace("{new}", fmt(nextOnHand, locale)),
        );
        await load(warehouse.id);
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setActingVariantId(null);
      }
    },
    [warehouse, locale, t, load],
  );

  const onReset = (row: InventoryStoreMatrixRow) => setResetTarget(row);
  const confirmReset = async () => {
    const row = resetTarget;
    setResetTarget(null);
    if (row) await runQuickAdjust(row, 0);
  };

  /* ───────────────────────────── render ───────────────────────────── */

  return (
    <div className={`${PRICING_ROOT} ${pw.ink}`}>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className={pw.accent} onClick={() => setNotice(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert tone="error" action={<button type="button" className={pw.accent} onClick={() => setError(null)}>{c.actions.dismiss}</button>}>
            {error}
          </Alert>
        </div>
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          title={t.states.loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load(warehouse?.id)}>
              {c.actions.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
      ) : null}

      {state.status === "loading" ? (
        <p className={`${pw.muted} py-10 text-center text-sm`}>{t.states.loading}</p>
      ) : null}

      {state.status === "ready" ? (
        <div className="space-y-5">
          {/* Depo seçici (Product Detail > Stok ile ortak component) */}
          <WarehouseSelector
            labels={{
              label: t.warehouse.label,
              defaultBadge: t.warehouse.defaultBadge,
              inactiveBadge: t.warehouse.statusInactive,
              none: t.warehouse.none,
            }}
            warehouses={warehouses}
            active={warehouse}
            onSelect={switchWarehouse}
          />

          {warehouseInactive ? <Alert tone="warning">{t.warehouse.inactiveNote}</Alert> : null}

          {/* KPI kartları */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label={t.kpi.onHand} value={fmt(kpi.onHand, locale)} />
            <Kpi label={t.kpi.reserved} value={fmt(kpi.reserved, locale)} />
            <Kpi label={t.kpi.sellable} value={fmt(kpi.sellable, locale)} tone="success" />
            <Kpi label={t.kpi.incoming} value={fmt(kpi.incoming, locale)} tone="info" />
            <Kpi label={t.kpi.lowStock} value={fmt(kpi.low, locale)} tone={kpi.low > 0 ? "warning" : "neutral"} />
            <Kpi label={t.kpi.outOfStock} value={fmt(kpi.out, locale)} tone={kpi.out > 0 ? "warning" : "neutral"} />
          </div>

          {/* Arama + durum filtresi */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] flex-1">
              <Input
                id="inventory-search"
                type="search"
                placeholder={t.search.placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className={`flex flex-wrap gap-1 rounded-lg border ${pw.line} p-1`}>
              {FILTER_ORDER.map((f) => {
                const active = filter === f;
                const label = f === "ALL" ? t.filter.all : t.stockStatus[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active ? `${pw.selected} ${pw.ink}` : `${pw.muted} ${pw.hover}`
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tablo */}
          {rows.length === 0 ? (
            <p className={`${pw.muted} py-10 text-center text-sm`}>{t.states.empty}</p>
          ) : (
            <>
              <p className={`text-xs ${pw.faint}`}>
                {t.count.replace("{count}", String(visibleRows.length))}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse text-sm">
                  <thead>
                    <tr className={`border-b ${pw.lineStrong} text-left ${pw.faint}`}>
                      <th className="px-2 py-2 font-medium">{t.col.product}</th>
                      <th className="px-2 py-2 font-medium">{t.col.variant}</th>
                      <th className="px-2 py-2 font-medium">{t.col.sku}</th>
                      <th className="px-2 py-2 font-medium">{t.col.onHand}</th>
                      <th className="px-2 py-2 font-medium">{t.col.reserved}</th>
                      <th className="px-2 py-2 font-medium">{t.col.safetyStock}</th>
                      <th className="px-2 py-2 font-medium">{t.col.sellable}</th>
                      <th className="px-2 py-2 font-medium">{t.col.incoming}</th>
                      <th className="px-2 py-2 font-medium">{t.col.reorderPoint}</th>
                      <th className="px-2 py-2 font-medium">{t.col.status}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.col.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className={`px-2 py-8 text-center ${pw.muted}`}>
                          {t.states.filterEmpty}
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((r) => (
                        <GlobalRow
                          key={r.variantId}
                          row={r}
                          locale={locale}
                          labels={t}
                          busy={actingVariantId === r.variantId}
                          disabled={warehouseInactive || actingVariantId !== null}
                          onIncrease={() => void runQuickAdjust(r, r.current.onHand + QUICK_STEP)}
                          onDecrease={() =>
                            void runQuickAdjust(r, Math.max(0, r.current.onHand - QUICK_STEP))
                          }
                          onReset={() => onReset(r)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {resetTarget ? (
        <ResetConfirm
          row={resetTarget}
          labels={t}
          cancelLabel={c.actions.cancel}
          onCancel={() => setResetTarget(null)}
          onConfirm={() => void confirmReset()}
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────────── satır ───────────────────────────── */

type InventoryDict = ReturnType<typeof getDictionary>["storeAdmin"]["inventory"];

function GlobalRow({
  row,
  locale,
  labels,
  busy,
  disabled,
  onIncrease,
  onDecrease,
  onReset,
}: {
  row: InventoryStoreMatrixRow;
  locale: ReturnType<typeof useLocale>;
  labels: InventoryDict;
  busy: boolean;
  disabled: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onReset: () => void;
}) {
  const variantLabel =
    row.attributes.length > 0 ? row.attributes.map((a) => a.label).join(" · ") : row.title;
  const quickDisabled = disabled || busy;
  return (
    <tr className={`border-b ${pw.line}`}>
      <td className="px-2 py-2">
        <Link
          href={`/products/${row.productId}?tab=inventory`}
          className={`font-medium ${pw.ink} underline-offset-2 hover:underline`}
          title={labels.row.openStockTab}
        >
          {row.productTitle}
        </Link>
      </td>
      <td className={`px-2 py-2 ${pw.muted}`}>{variantLabel}</td>
      <td className={`px-2 py-2 font-mono text-xs ${pw.faint}`}>{row.sku}</td>
      <td className={`px-2 py-2 ${pw.ink}`}>{fmt(row.current.onHand, locale)}</td>
      <td className={`px-2 py-2 ${pw.faint}`}>{fmt(row.current.reserved, locale)}</td>
      <td className={`px-2 py-2 ${pw.ink}`}>{fmt(row.current.safetyStock, locale)}</td>
      <td className={`px-2 py-2 font-medium ${pw.success}`}>
        {fmt(row.currentCalc.sellableAvailable, locale)}
      </td>
      <td className={`px-2 py-2 ${pw.ink}`}>{fmt(row.current.incoming, locale)}</td>
      <td className={`px-2 py-2 ${pw.ink}`}>{fmt(row.current.reorderPoint, locale)}</td>
      <td className="px-2 py-2">
        <StatusBadge status={row.currentCalc.status} label={labels.stockStatus[row.currentCalc.status]} />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <QuickButton label={`−${QUICK_STEP}`} title={labels.quick.decrease} onClick={onDecrease} disabled={quickDisabled} />
          <QuickButton label={`+${QUICK_STEP}`} title={labels.quick.increase} onClick={onIncrease} disabled={quickDisabled} />
          <QuickButton label={labels.quick.reset} title={labels.quick.reset} onClick={onReset} disabled={quickDisabled} tone="danger" />
          <Link
            href={`/products/${row.productId}?tab=inventory`}
            className={`ml-1 rounded-md border ${pw.line} px-2 py-1 text-xs font-medium ${pw.accent} ${pw.hover} transition-colors`}
            title={labels.row.openStockTab}
          >
            {labels.row.manage} <span aria-hidden>→</span>
          </Link>
        </div>
      </td>
    </tr>
  );
}

function QuickButton({
  label,
  title,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        tone === "danger" ? `${pw.line} ${pw.danger} ${pw.hover}` : `${pw.line} ${pw.ink} ${pw.hover}`
      }`}
    >
      {label}
    </button>
  );
}

/* ───────────────────────────── sıfırla onayı ───────────────────────────── */

function ResetConfirm({
  row,
  labels,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  row: InventoryStoreMatrixRow;
  labels: InventoryDict;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className={`${PRICING_ROOT} ${pw.ink} w-full max-w-md rounded-xl border ${pw.lineStrong} ${pw.surfaceRaised} p-5`}>
        <h3 className={`text-base font-semibold ${pw.ink}`}>{labels.quick.resetConfirmTitle}</h3>
        <p className={`mt-2 text-sm ${pw.muted}`}>
          {labels.quick.resetConfirmBody
            .replace("{product}", row.productTitle)
            .replace("{variant}", row.attributes.length > 0 ? row.attributes.map((a) => a.label).join(" · ") : row.title)}
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>{labels.quick.reset}</Button>
        </div>
      </div>
    </div>
  );
}

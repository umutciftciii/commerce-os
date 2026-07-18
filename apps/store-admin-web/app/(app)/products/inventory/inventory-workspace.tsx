"use client";

// TODO-152 (ADR-076) — Stok yönetimi çalışma alanı (tam genişlik).
//
// Inventory Engine'in (onHand/reserved/incoming/safetyStock/reorderPoint) kullanıcı dostu, tam
// genişlik sunumu. Motor, availability hesabı, preview, apply, audit, stale-guard ve advisory-lock
// mimarisi DEĞİŞMEDEN api üzerinden tüketilir; burada yalnız SUNUM + dil + yerleşim kurulur. İki mod:
// "Hızlı düzenleme" (varsayılan, hücre-hücre) ve "Toplu işlem" (yönlendirmeli). reserved SALT-OKUNUR.
// Renk anlamı Fiyatlandırma ile aynı semantik token'lardan (pw / .pricing-workspace) gelir — yeni
// dağınık renk sistemi üretilmez. Autosave YOK: Taslak → Önizleme → Uygula.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDictionary, type Locale } from "@commerce-os/i18n";
import type {
  InventoryField,
  InventoryPreviewResponse,
  InventoryPreviewRow,
  InventoryWarehouse,
} from "@commerce-os/api-client";
import { Alert, Badge, Button, Input, useLocale } from "../../../../components/ui";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { pw, PRICING_ROOT } from "../pricing/pricing-tokens";
import { GUIDED_OPS, guidedOpMeta, guidedRuleShape, type GuidedOp } from "./guided-operations";
import { fmt, fmtSigned, Kpi, StatusBadge, WarehouseSelector } from "./shared";

type ProductsDict = ReturnType<typeof getDictionary>["storeAdmin"]["products"];
type InventoryDict = ProductsDict["inventory"];

export interface InventoryWorkspaceProps {
  productId: string;
}

/* ── formatlama + durum semantiği + Kpi + WarehouseSelector: ./shared (global ekranla ortak) ── */

/* ───────────────────────────── editable draft ───────────────────────────── */

type EditableField = "onHand" | "incoming" | "safetyStock" | "reorderPoint";
const EDITABLE_FIELDS: EditableField[] = ["onHand", "incoming", "safetyStock", "reorderPoint"];

type Draft = Record<string, Partial<Record<EditableField, string>>>;

const FIELD_LABELS: Record<InventoryField, EditableField> = {
  ON_HAND: "onHand",
  INCOMING: "incoming",
  SAFETY_STOCK: "safetyStock",
  REORDER_POINT: "reorderPoint",
};

type Mode = "quick" | "bulk";

/* ───────────────────────────── ana bileşen ───────────────────────────── */

export function InventoryWorkspace({ productId }: InventoryWorkspaceProps) {
  const locale = useLocale();
  const t = getDictionary(locale).storeAdmin.products.inventory;

  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<InventoryPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("quick");
  const [draft, setDraft] = useState<Draft>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<GuidedOp | null>(null);
  const [amount, setAmount] = useState("");

  const [preview, setPreview] = useState<InventoryPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (targetWarehouseId?: string) => {
      setLoading(true);
      setError(null);
      setPreview(null);
      setDraft({});
      try {
        const [whList, mat] = await Promise.all([
          warehouses.length === 0 ? storeApi.listWarehouses() : Promise.resolve({ data: warehouses }),
          storeApi.getInventoryMatrix(productId, targetWarehouseId),
        ]);
        if (whList.data.length > 0 && warehouses.length === 0) setWarehouses(whList.data);
        setMatrix(mat);
        setWarehouseId(mat.warehouse.id);
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setLoading(false);
      }
    },
    [productId, locale, warehouses],
  );

  // İlk yükleme + ürün değişiminde matris + depolar tek sefer yüklenir (depo değişimi ayrı
  // switchWarehouse ile yönetilir — effect bilinçli olarak yalnız productId'ye kilitli).
  useEffect(() => {
    void load();
  }, [productId]);

  const rows = matrix?.rows ?? [];
  const activeWarehouse = matrix?.warehouse ?? null;

  /* ── KPI ── */
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

  /* ── depo değiştir ── */
  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    setSelected(new Set());
    setOp(null);
    setAmount("");
    void load(id);
  };

  /* ── quick edit draft ── */
  const setCell = (variantId: string, field: EditableField, value: string) => {
    setPreview(null);
    setDraft((prev) => ({ ...prev, [variantId]: { ...prev[variantId], [field]: value } }));
  };

  const buildEdits = () => {
    const edits: {
      variantId: string;
      onHand?: number;
      incoming?: number;
      safetyStock?: number;
      reorderPoint?: number;
    }[] = [];
    for (const r of rows) {
      const d = draft[r.variantId];
      if (!d) continue;
      const patch: Record<EditableField, number | undefined> = {
        onHand: undefined,
        incoming: undefined,
        safetyStock: undefined,
        reorderPoint: undefined,
      };
      let touched = false;
      for (const f of EDITABLE_FIELDS) {
        const raw = d[f];
        if (raw === undefined || raw === "") continue;
        const n = Number.parseInt(raw, 10);
        if (Number.isNaN(n) || n === r.current[f]) continue;
        patch[f] = n;
        touched = true;
      }
      if (touched) edits.push({ variantId: r.variantId, ...patch });
    }
    return edits;
  };

  /* ── preview ── */
  const runPreview = async () => {
    if (!warehouseId) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "quick") {
        const edits = buildEdits();
        if (edits.length === 0) {
          setNotice(t.apply.noChangeToast);
          setBusy(false);
          return;
        }
        const res = await storeApi.previewInventory(productId, { warehouseId, edits });
        setPreview(res);
      } else {
        if (!op) return;
        const shape = guidedRuleShape(op);
        const meta = guidedOpMeta(op);
        const amt = meta.needsAmount ? Number.parseInt(amount, 10) : (shape.fixedAmount ?? 0);
        if (meta.needsAmount && (Number.isNaN(amt) || amt < 0)) {
          setError(t.issueMessages.INVENTORY_INVALID_AMOUNT);
          setBusy(false);
          return;
        }
        const selectedVariantIds = selected.size > 0 ? [...selected] : undefined;
        if (selectedVariantIds && selectedVariantIds.length === 0) {
          setError(t.selection.noneSelected);
          setBusy(false);
          return;
        }
        const res = await storeApi.previewInventory(productId, {
          warehouseId,
          rule: { targetField: shape.targetField, operation: shape.operation, amount: amt },
          selectedVariantIds,
        });
        setPreview(res);
      }
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  };

  /* ── apply ── */
  const runApply = async () => {
    if (!preview || !warehouseId) return;
    setBusy(true);
    setError(null);
    try {
      const rule = mode === "bulk" && op ? guidedRuleShape(op) : null;
      const meta = op ? guidedOpMeta(op) : null;
      const amt = rule ? (meta?.needsAmount ? Number.parseInt(amount, 10) : (rule.fixedAmount ?? 0)) : 0;
      const res = await storeApi.applyInventory(productId, {
        warehouseId,
        baseFingerprint: preview.fingerprint,
        ...(mode === "quick"
          ? { edits: buildEdits() }
          : {
              rule: rule
                ? { targetField: rule.targetField, operation: rule.operation, amount: amt }
                : undefined,
              selectedVariantIds: selected.size > 0 ? [...selected] : undefined,
            }),
      });
      setNotice(t.apply.successToast.replace("{value}", String(res.updatedVariants)));
      setSelected(new Set());
      setOp(null);
      setAmount("");
      await load(warehouseId);
    } catch (err) {
      setError(messageForError(err, locale));
      setBusy(false);
    }
  };

  /* ── selection ── */
  const toggleSelect = (id: string) => {
    setPreview(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(rows.map((r) => r.variantId)));
  const clearSelection = () => setSelected(new Set());

  /* ───────────────────────────── render ───────────────────────────── */

  if (loading) {
    return <p className={`${PRICING_ROOT} ${pw.muted} py-10 text-center text-sm`}>{t.states.loading}</p>;
  }
  if (error && !matrix) {
    return (
      <div className={PRICING_ROOT}>
        <Alert tone="error" title={t.states.error} action={<Button variant="secondary" size="sm" onClick={() => void load(warehouseId ?? undefined)}>↻</Button>}>
          {error}
        </Alert>
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className={`${PRICING_ROOT} ${pw.muted} py-10 text-center text-sm`}>{t.states.empty}</p>;
  }

  return (
    <div className={`${PRICING_ROOT} ${pw.ink} space-y-5`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t.pageTitle}</h2>
          <p className={`mt-1 text-sm ${pw.muted}`}>{t.pageDescription}</p>
        </div>
      </header>

      {notice ? (
        <Alert tone="success" action={<button type="button" className={pw.accent} onClick={() => setNotice(null)}>×</button>}>
          {notice}
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Depo seçici (global ekranla ortak component) */}
      <WarehouseSelector
        labels={{
          label: t.warehouse.label,
          defaultBadge: t.warehouse.defaultBadge,
          inactiveBadge: t.warehouse.statusInactive,
          none: t.warehouse.none,
        }}
        warehouses={warehouses}
        active={activeWarehouse}
        onSelect={switchWarehouse}
      />

      {activeWarehouse && activeWarehouse.status === "INACTIVE" ? (
        <Alert tone="warning">{t.warehouse.inactiveNote}</Alert>
      ) : null}

      {/* KPI kartları */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t.kpi.onHand} value={fmt(kpi.onHand, locale)} />
        <Kpi label={t.kpi.reserved} value={fmt(kpi.reserved, locale)} />
        <Kpi label={t.kpi.sellable} value={fmt(kpi.sellable, locale)} tone="success" />
        <Kpi label={t.kpi.incoming} value={fmt(kpi.incoming, locale)} tone="info" />
        <Kpi label={t.kpi.lowStock} value={fmt(kpi.low, locale)} tone={kpi.low > 0 ? "warning" : "neutral"} />
        <Kpi label={t.kpi.outOfStock} value={fmt(kpi.out, locale)} tone={kpi.out > 0 ? "warning" : "neutral"} />
      </div>

      {/* Mod seçici */}
      <div className={`flex gap-1 rounded-lg border ${pw.line} p-1`}>
        {(["quick", "bulk"] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setPreview(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? `${pw.selected} ${pw.ink}` : `${pw.muted} ${pw.hover}`
              }`}
            >
              {m === "quick" ? t.mode.quickTitle : t.mode.bulkTitle}
            </button>
          );
        })}
      </div>

      {mode === "bulk" ? (
        <BulkPanel
          t={t}
          op={op}
          amount={amount}
          selectedCount={selected.size}
          onPickOp={(next) => {
            setOp(next);
            setPreview(null);
          }}
          onAmount={(v) => {
            setAmount(v);
            setPreview(null);
          }}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
        />
      ) : null}

      {/* Tablo */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className={`border-b ${pw.lineStrong} text-left ${pw.faint}`}>
              {mode === "bulk" ? <th className="px-2 py-2 font-medium">·</th> : null}
              <th className="px-2 py-2 font-medium">{t.col.variant}</th>
              <th className="px-2 py-2 font-medium">{t.col.sku}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.onHand}>{t.col.onHand}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.reserved}>{t.col.reserved}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.safetyStock}>{t.col.safetyStock}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.sellable}>{t.col.sellable}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.incoming}>{t.col.incoming}</th>
              <th className="px-2 py-2 font-medium" title={t.tooltip.reorderPoint}>{t.col.reorderPoint}</th>
              <th className="px-2 py-2 font-medium">{t.col.stockStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.variantId}
                t={t}
                locale={locale}
                row={r}
                mode={mode}
                selected={selected.has(r.variantId)}
                onToggle={() => toggleSelect(r.variantId)}
                draft={draft[r.variantId]}
                onCell={(f, v) => setCell(r.variantId, f, v)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Aksiyonlar */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="secondary" onClick={() => void runPreview()} disabled={busy}>
          {t.apply.previewAction}
        </Button>
      </div>

      {/* Önizleme paneli */}
      {preview ? (
        <PreviewPanel
          t={t}
          locale={locale}
          preview={preview}
          busy={busy}
          onApply={() => void runApply()}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────────── alt bileşenler ───────────────────────────── */

function BulkPanel({
  t,
  op,
  amount,
  selectedCount,
  onPickOp,
  onAmount,
  onSelectAll,
  onClearSelection,
}: {
  t: InventoryDict;
  op: GuidedOp | null;
  amount: string;
  selectedCount: number;
  onPickOp: (op: GuidedOp) => void;
  onAmount: (v: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const meta = op ? guidedOpMeta(op) : null;
  return (
    <div className={`space-y-4 rounded-lg border ${pw.line} ${pw.surface} p-4`}>
      <div>
        <p className={`mb-2 text-sm font-semibold ${pw.ink}`}>{t.bulk.questionTitle}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDED_OPS.map((g) => {
            const active = op === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onPickOp(g.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active ? `${pw.lineStrong} ${pw.selected}` : `${pw.line} ${pw.hover}`
                }`}
              >
                <span className={`block text-sm font-medium ${pw.ink}`}>{t.bulk.ops[g.id]}</span>
                <span className={`mt-1 block text-xs ${pw.faint}`}>{t.bulk.opDescriptions[g.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {op && meta?.needsAmount ? (
        <div className="max-w-[220px]">
          <label className={`mb-1 block text-xs font-medium ${pw.muted}`}>{t.bulk.amountLabel}</label>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder={t.bulk.amountPlaceholder}
          />
        </div>
      ) : null}

      {op && meta?.highImpact ? <Alert tone="warning">{t.bulk.resetWarning}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={pw.accent} onClick={onSelectAll}>
          {t.selection.selectAll}
        </button>
        <button type="button" className={pw.muted} onClick={onClearSelection}>
          {t.selection.clearSelection}
        </button>
        <span className={pw.faint}>{t.selection.selectedCount.replace("{value}", String(selectedCount))}</span>
      </div>
    </div>
  );
}

function Row({
  t,
  locale,
  row,
  mode,
  selected,
  onToggle,
  draft,
  onCell,
}: {
  t: InventoryDict;
  locale: Locale;
  row: InventoryPreviewRow;
  mode: Mode;
  selected: boolean;
  onToggle: () => void;
  draft: Partial<Record<EditableField, string>> | undefined;
  onCell: (field: EditableField, value: string) => void;
}) {
  const cellValue = (field: EditableField): string => {
    const d = draft?.[field];
    return d !== undefined ? d : String(row.current[field]);
  };
  const editable = mode === "quick";
  return (
    <tr className={`border-b ${pw.line}`}>
      {mode === "bulk" ? (
        <td className="px-2 py-2">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={row.sku} />
        </td>
      ) : null}
      <td className={`px-2 py-2 ${pw.ink}`}>
        {row.attributes.length > 0 ? row.attributes.map((a) => a.label).join(" · ") : row.title}
        {row.status !== "ACTIVE" ? (
          <Badge tone="neutral">{row.status === "ARCHIVED" ? t.stockStatus.NO_BALANCE : "Taslak"}</Badge>
        ) : null}
      </td>
      <td className={`px-2 py-2 font-mono text-xs ${pw.muted}`}>{row.sku}</td>
      <EditCell editable={editable} value={cellValue("onHand")} onChange={(v) => onCell("onHand", v)} />
      {/* Rezerve: SALT-OKUNUR (sistem-kontrollü) */}
      <td className={`px-2 py-2 ${pw.faint}`} title={t.tooltip.reservedReadOnly}>
        {fmt(row.current.reserved, locale)}
      </td>
      <EditCell editable={editable} value={cellValue("safetyStock")} onChange={(v) => onCell("safetyStock", v)} />
      <td className={`px-2 py-2 font-medium ${pw.success}`}>{fmt(row.currentCalc.sellableAvailable, locale)}</td>
      <EditCell editable={editable} value={cellValue("incoming")} onChange={(v) => onCell("incoming", v)} />
      <EditCell editable={editable} value={cellValue("reorderPoint")} onChange={(v) => onCell("reorderPoint", v)} />
      <td className="px-2 py-2">
        <StatusBadge status={row.currentCalc.status} label={t.stockStatus[row.currentCalc.status]} />
      </td>
    </tr>
  );
}

function EditCell({ editable, value, onChange }: { editable: boolean; value: string; onChange: (v: string) => void }) {
  if (!editable) {
    return <td className={`px-2 py-2 ${pw.ink}`}>{value}</td>;
  }
  return (
    <td className="px-2 py-1.5">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-20 rounded-md border ${pw.line} ${pw.inputBg} ${pw.ink} px-2 py-1 text-sm`}
      />
    </td>
  );
}

function PreviewPanel({
  t,
  locale,
  preview,
  busy,
  onApply,
  onCancel,
}: {
  t: InventoryDict;
  locale: Locale;
  preview: InventoryPreviewResponse;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const s = preview.summary;
  const changedRows = preview.rows.filter((r) => r.changed);
  const issueLabel = (code: string): string =>
    (t.issueMessages as Record<string, string>)[code] ?? t.issueMessages.default;

  return (
    <div className={`space-y-4 rounded-lg border ${pw.lineStrong} ${pw.surfaceRaised} p-4`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-base font-semibold ${pw.ink}`}>{t.preview.title}</h3>
        {preview.blocked ? <Badge tone="warning">{t.issue.blockingTitle}</Badge> : null}
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <SummaryItem label={t.preview.summaryAffected} value={fmt(s.changedVariants, locale)} />
        <SummaryItem label={t.preview.summaryUnchanged} value={fmt(s.unchangedVariants, locale)} />
        <SummaryItem label={t.preview.summaryOnHandDelta} value={fmtSigned(s.totalOnHandDelta, locale)} />
        <SummaryItem label={t.preview.summarySellableDelta} value={fmtSigned(s.totalSellableDelta, locale)} />
        <SummaryItem label={t.preview.summaryLowStock} value={fmt(s.lowStockCount, locale)} />
        <SummaryItem label={t.preview.summaryOutOfStock} value={fmt(s.outOfStockCount, locale)} />
        <SummaryItem label={t.preview.summaryWarnings} value={fmt(s.warningCount, locale)} />
        <SummaryItem label={t.preview.summaryBlocking} value={fmt(s.errorCount, locale)} />
      </div>

      {changedRows.length === 0 ? (
        <p className={`text-sm ${pw.muted}`}>{t.preview.empty}</p>
      ) : (
        <ul className={`divide-y ${pw.line} rounded-md border ${pw.line}`}>
          {changedRows.map((r) => (
            <li key={r.variantId} className="space-y-1 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className={`font-medium ${pw.ink}`}>
                  {r.attributes.length > 0 ? r.attributes.map((a) => a.label).join(" · ") : r.title}
                </span>
                <span className={`font-mono text-xs ${pw.faint}`}>{r.sku}</span>
              </div>
              <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${pw.muted}`}>
                {r.changedFields.map((f) => {
                  const key = FIELD_LABELS[f];
                  return (
                    <span key={f}>
                      {t.col[key]}: <span className={pw.faint}>{fmt(r.current[key], locale)}</span> →{" "}
                      <span className={pw.ink}>{fmt(r.target[key], locale)}</span>
                    </span>
                  );
                })}
                <span>
                  {t.col.sellable}: <span className={pw.faint}>{fmt(r.currentCalc.sellableAvailable, locale)}</span> →{" "}
                  <span className={pw.success}>{fmt(r.targetCalc.sellableAvailable, locale)}</span>
                </span>
              </div>
              {r.errors.length > 0 ? (
                <div className={`text-xs ${pw.danger}`}>{r.errors.map(issueLabel).join(" · ")}</div>
              ) : null}
              {r.warnings.length > 0 ? (
                <div className={`text-xs ${pw.warning}`}>{r.warnings.map(issueLabel).join(" · ")}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {preview.blocked ? <Alert tone="error">{t.issue.blockedNote}</Alert> : null}

      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t.apply.cancel}
        </Button>
        <Button onClick={onApply} disabled={busy || preview.blocked || changedRows.length === 0}>
          {t.apply.action}
        </Button>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={`rounded-md border ${pw.line} ${pw.surface} px-3 py-2`}>
      <p className={`text-xs ${pw.faint}`}>{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${pw.ink}`}>{value}</p>
    </div>
  );
}

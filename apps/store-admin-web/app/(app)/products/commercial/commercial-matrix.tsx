"use client";

// TODO-151 (ADR-074) — "Commercial Matrix" bölümü (Price / Compare-at / Cost / VAT).
//
// Mevcut ticari değerleri gösterir; kullanıcı ya hücreleri yerel düzenler (autosave YOK) ya da toplu
// kural kurar. "Önizle" sunucudan deterministik preview çeker; "Uygula" server-authoritative'dir
// (stale-guard + yalnız değişen alanlar). Blocking (errors) iken apply pasiftir; warning apply'ı
// engellemez. Yalnız kaydedilmiş ürün için görünür (product-form `visible` ile kontrol eder).

import { Alert, Badge, Button, Input, Select, Spinner } from "../../../../components/ui";
import type { CommercialMatrixController, MatrixField } from "./use-commercial-matrix";
import type { CommercialField, CommercialPreviewRow } from "@commerce-os/api-client";
import { formatMinor, minorToInput } from "../../../../lib/client/format";

export interface CommercialMatrixLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  priceHint: string;
  // Mod
  modeRule: string;
  modeDirect: string;
  // Kural formu
  targetFieldLabel: string;
  operationLabel: string;
  amountLabelPercent: string;
  amountLabelMoney: string;
  vatLabel: string;
  roundingLabel: string;
  roundingStepLabel: string;
  priceEndingLabel: string;
  fieldLabels: Record<CommercialField, string>;
  operationLabels: Record<string, string>;
  roundingModeLabels: Record<string, string>;
  priceEndingLabels: Record<string, string>;
  vatOptions: { value: number; label: string }[];
  // Tablo
  colSelect: string;
  colVariant: string;
  colStatus: string;
  colPrice: string;
  colCompareAt: string;
  colCost: string;
  colVat: string;
  colMargin: string;
  colMarkup: string;
  colDiscount: string;
  colChange: string;
  statusLabels: Record<string, string>;
  selectAll: string;
  clearSelection: string;
  selectedCount: (n: number) => string;
  changedBadge: string;
  unchangedBadge: string;
  // Aksiyon
  previewButton: string;
  previewing: string;
  applyButton: string;
  applying: string;
  emptyMatrix: string;
  loadError: string;
  // Özet
  summaryTitle: string;
  summaryChanged: (changed: number, total: number) => string;
  summaryPriceRange: (min: string, max: string) => string;
  summaryAvgChange: (pct: string) => string;
  summaryNegativeMargin: (n: number) => string;
  blockedNote: string;
  warningsNote: (n: number) => string;
  appliedSummary: (variants: number, fields: number) => string;
  // Stable kod → mesaj (warning/error rozetleri + preview/apply hataları). `default` fallback.
  issueLabels: Record<string, string> & { default: string };
}

export interface CommercialMatrixProps {
  visible: boolean;
  controller: CommercialMatrixController;
  labels: CommercialMatrixLabels;
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-emerald-500/60" />
        <div>
          <h3 className="text-sm font-semibold text-white/90">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

const pct = (value: number | null) => (value === null ? "—" : `%${value.toFixed(1)}`);

// Preview satırı → ilgili alanın current→target hücresi (üstü çizili + rozet).
function MoneyCell({
  currency,
  current,
  target,
  changed,
  field,
  changedFields,
}: {
  currency: string;
  current: number | null;
  target: number | null;
  changed: boolean;
  field: CommercialField;
  changedFields: CommercialField[];
}) {
  const fieldChanged = changed && changedFields.includes(field);
  const money = (m: number | null) => (m === null ? "—" : formatMinor(m, currency));
  if (!fieldChanged) return <span className="text-white/60">{money(current)}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-white/30 line-through">{money(current)}</span>
      <span className="font-medium text-emerald-200">{money(target)}</span>
    </span>
  );
}

function IssueBadges({ codes, tone, labels }: { codes: string[]; tone: "danger" | "warning"; labels: CommercialMatrixLabels }) {
  if (codes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <Badge key={code} tone={tone}>
          {labels.issueLabels[code] ?? labels.issueLabels.default}
        </Badge>
      ))}
    </div>
  );
}

function MatrixTable({
  rows,
  labels,
  controller,
  editable,
}: {
  rows: CommercialPreviewRow[];
  labels: CommercialMatrixLabels;
  controller: CommercialMatrixController;
  editable: boolean;
}) {
  const { selectedIds, toggleSelect, drafts, setCell } = controller;
  const draftValue = (variantId: string, field: MatrixField, fallback: string) =>
    drafts.get(variantId)?.[field] ?? fallback;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-white/45">
            <th className="px-2 py-2 font-medium">{labels.colSelect}</th>
            <th className="px-3 py-2 font-medium">{labels.colVariant}</th>
            <th className="px-3 py-2 font-medium">{labels.colStatus}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colPrice}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colCompareAt}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colCost}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colVat}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colMargin}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colMarkup}</th>
            <th className="px-3 py-2 text-right font-medium">{labels.colDiscount}</th>
            <th className="px-3 py-2 font-medium">{labels.colChange}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const calc = row.changed ? row.targetCalc : row.currentCalc;
            return (
              <tr key={row.variantId} className="border-b border-white/[0.06] align-top last:border-0">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-emerald-500"
                    checked={selectedIds.has(row.variantId)}
                    onChange={() => toggleSelect(row.variantId)}
                  />
                </td>
                <td className="px-3 py-2 text-white/70">
                  <div className="font-medium text-white/90">{row.title}</div>
                  <div className="font-mono text-[11px] text-white/40">{row.sku}</div>
                </td>
                <td className="px-3 py-2 text-white/50">{labels.statusLabels[row.status] ?? row.status}</td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      inputMode="decimal"
                      value={draftValue(row.variantId, "price", minorToInput(row.current.priceMinor))}
                      onChange={(e) => setCell(row.variantId, "price", e.target.value)}
                      className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-right text-white/80"
                    />
                  ) : (
                    <MoneyCell currency={row.currency} current={row.current.priceMinor} target={row.target.priceMinor} changed={row.changed} field="PRICE" changedFields={row.changedFields} />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      inputMode="decimal"
                      value={draftValue(row.variantId, "compareAt", minorToInput(row.current.compareAtMinor))}
                      onChange={(e) => setCell(row.variantId, "compareAt", e.target.value)}
                      className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-right text-white/80"
                    />
                  ) : (
                    <MoneyCell currency={row.currency} current={row.current.compareAtMinor} target={row.target.compareAtMinor} changed={row.changed} field="COMPARE_AT_PRICE" changedFields={row.changedFields} />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      inputMode="decimal"
                      value={draftValue(row.variantId, "cost", minorToInput(row.current.costMinor))}
                      onChange={(e) => setCell(row.variantId, "cost", e.target.value)}
                      className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-right text-white/80"
                    />
                  ) : (
                    <MoneyCell currency={row.currency} current={row.current.costMinor} target={row.target.costMinor} changed={row.changed} field="COST" changedFields={row.changedFields} />
                  )}
                </td>
                <td className="px-3 py-2 text-right text-white/60">
                  {row.changed && row.changedFields.includes("VAT_RATE") ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="text-white/30 line-through">%{row.current.vatRateBps / 100}</span>
                      <span className="font-medium text-emerald-200">%{row.target.vatRateBps / 100}</span>
                    </span>
                  ) : (
                    `%${row.current.vatRateBps / 100}`
                  )}
                </td>
                <td className="px-3 py-2 text-right text-white/70">{pct(calc.marginPct)}</td>
                <td className="px-3 py-2 text-right text-white/70">{pct(calc.markupPct)}</td>
                <td className="px-3 py-2 text-right text-white/70">{pct(calc.discountPct)}</td>
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    {row.changed ? (
                      <Badge tone="success">{labels.changedBadge}</Badge>
                    ) : (
                      <span className="text-white/30">{labels.unchangedBadge}</span>
                    )}
                    <IssueBadges codes={row.errors} tone="danger" labels={labels} />
                    <IssueBadges codes={row.warnings} tone="warning" labels={labels} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const OPERATIONS_BY_FIELD: Record<CommercialField, string[]> = {
  PRICE: ["SET_FIXED", "INCREASE_PERCENT", "DECREASE_PERCENT", "INCREASE_FIXED", "DECREASE_FIXED", "SET_FROM_COST_MARKUP", "ROUND", "SET_PRICE_ENDING"],
  COMPARE_AT_PRICE: ["SET_FIXED", "INCREASE_PERCENT", "DECREASE_PERCENT", "INCREASE_FIXED", "DECREASE_FIXED", "SET_COMPARE_AT_FROM_PRICE", "ROUND", "SET_PRICE_ENDING"],
  COST: ["SET_FIXED", "INCREASE_PERCENT", "DECREASE_PERCENT", "INCREASE_FIXED", "DECREASE_FIXED", "ROUND"],
  VAT_RATE: ["SET_FIXED"],
};

function RulePanel({ controller, labels }: { controller: CommercialMatrixController; labels: CommercialMatrixLabels }) {
  const { ruleForm, setRuleForm, amountKind } = controller;
  const ops = OPERATIONS_BY_FIELD[ruleForm.targetField];
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={labels.targetFieldLabel}
          value={ruleForm.targetField}
          onChange={(e) => {
            const field = e.target.value as CommercialField;
            const nextOps = OPERATIONS_BY_FIELD[field];
            setRuleForm({ targetField: field, operation: nextOps.includes(ruleForm.operation) ? ruleForm.operation : (nextOps[0] as never) });
          }}
          options={(Object.keys(labels.fieldLabels) as CommercialField[]).map((f) => ({ value: f, label: labels.fieldLabels[f] }))}
        />
        <Select
          label={labels.operationLabel}
          value={ruleForm.operation}
          onChange={(e) => setRuleForm({ operation: e.target.value as never })}
          options={ops.map((op) => ({ value: op, label: labels.operationLabels[op] ?? op }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {amountKind === "percent" ? (
          <Input label={labels.amountLabelPercent} inputMode="decimal" value={ruleForm.amount} onChange={(e) => setRuleForm({ amount: e.target.value })} placeholder="10" />
        ) : null}
        {amountKind === "money" ? (
          <Input label={labels.amountLabelMoney} inputMode="decimal" value={ruleForm.amount} onChange={(e) => setRuleForm({ amount: e.target.value })} placeholder="250,00" />
        ) : null}
        {amountKind === "vat" ? (
          <Select
            label={labels.vatLabel}
            value={String(ruleForm.vatBps)}
            onChange={(e) => setRuleForm({ vatBps: Number.parseInt(e.target.value, 10) })}
            options={labels.vatOptions.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        ) : null}
        {ruleForm.operation === "SET_PRICE_ENDING" ? (
          <Select
            label={labels.priceEndingLabel}
            value={ruleForm.priceEnding}
            onChange={(e) => setRuleForm({ priceEnding: e.target.value as never })}
            options={(Object.keys(labels.priceEndingLabels)).map((k) => ({ value: k, label: labels.priceEndingLabels[k] }))}
          />
        ) : null}
      </div>
      {/* Yuvarlama: ROUND için zorunlu; değer-üreten opsyonlar için opsiyonel son-yuvarlama. */}
      {ruleForm.operation === "ROUND" || amountKind === "money" || amountKind === "percent" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={labels.roundingLabel}
            value={ruleForm.roundingMode}
            onChange={(e) => setRuleForm({ roundingMode: e.target.value as never })}
            options={(Object.keys(labels.roundingModeLabels)).map((k) => ({ value: k, label: labels.roundingModeLabels[k] }))}
          />
          {ruleForm.roundingMode !== "NONE" ? (
            <Select
              label={labels.roundingStepLabel}
              value={String(ruleForm.roundingStep)}
              onChange={(e) => setRuleForm({ roundingStep: Number.parseInt(e.target.value, 10) as never })}
              options={[1, 10, 100, 1000].map((s) => ({ value: String(s), label: minorToInput(s) }))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CommercialMatrix({ visible, controller, labels }: CommercialMatrixProps) {
  if (!visible) return null;
  const {
    matrix,
    matrixLoading,
    matrixError,
    mode,
    setMode,
    selectedIds,
    selectAll,
    clearSelection,
    hasDraft,
    preview,
    previewLoading,
    previewError,
    runPreview,
    applying,
    applyError,
    applySummary,
    apply,
  } = controller;

  const displayRows = preview?.rows ?? matrix?.rows ?? [];
  const summary = preview?.summary;
  const blocked = preview?.blocked ?? false;
  const changed = summary?.changedVariants ?? 0;
  const canPreview = mode === "rule" || hasDraft;
  const applyDisabled = !preview || blocked || changed === 0 || applying;
  const currency = displayRows[0]?.currency ?? "TRY";

  return (
    <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
      {/* Mod anahtarı */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setMode("rule")}
            className={`rounded-md px-3 py-1 text-xs transition ${mode === "rule" ? "bg-white/[0.08] text-white/90" : "text-white/50"}`}
          >
            {labels.modeRule}
          </button>
          <button
            type="button"
            onClick={() => setMode("direct")}
            className={`rounded-md px-3 py-1 text-xs transition ${mode === "direct" ? "bg-white/[0.08] text-white/90" : "text-white/50"}`}
          >
            {labels.modeDirect}
          </button>
        </div>
        <span className="text-xs text-white/40">{labels.priceHint}</span>
      </div>

      {mode === "rule" ? <RulePanel controller={controller} labels={labels} /> : null}

      {/* Seçim kontrolleri */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Button variant="secondary" size="sm" onClick={selectAll}>
          {labels.selectAll}
        </Button>
        <Button variant="secondary" size="sm" onClick={clearSelection}>
          {labels.clearSelection}
        </Button>
        <span className="text-white/45">{labels.selectedCount(selectedIds.size)}</span>
      </div>

      {matrixError ? <Alert tone="error">{labels.loadError}</Alert> : null}
      {matrixLoading ? <Spinner label={labels.previewing} size="sm" /> : null}

      {displayRows.length > 0 ? (
        <MatrixTable rows={displayRows} labels={labels} controller={controller} editable={mode === "direct" && !preview} />
      ) : !matrixLoading ? (
        <p className="text-xs text-white/40">{labels.emptyMatrix}</p>
      ) : null}

      {previewError ? <Alert tone="error">{labels.issueLabels[previewError] ?? labels.issueLabels.default}</Alert> : null}

      {/* Önizleme özeti */}
      {summary ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/60">
          <p className="font-medium text-white/80">{labels.summaryTitle}</p>
          <p>{labels.summaryChanged(summary.changedVariants, summary.totalVariants)}</p>
          {summary.minNewPriceMinor !== null && summary.maxNewPriceMinor !== null ? (
            <p>{labels.summaryPriceRange(formatMinor(summary.minNewPriceMinor, currency), formatMinor(summary.maxNewPriceMinor, currency))}</p>
          ) : null}
          {summary.avgPriceChangePct !== null ? <p>{labels.summaryAvgChange(`%${summary.avgPriceChangePct.toFixed(1)}`)}</p> : null}
          {summary.negativeMarginCount > 0 ? <p className="text-amber-300/80">{labels.summaryNegativeMargin(summary.negativeMarginCount)}</p> : null}
          {summary.warningCount > 0 ? <p className="text-amber-300/80">{labels.warningsNote(summary.warningCount)}</p> : null}
        </div>
      ) : null}

      {blocked ? <Alert tone="error">{labels.blockedNote}</Alert> : null}

      {/* Aksiyon */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={() => void runPreview()} disabled={!canPreview || previewLoading}>
          {previewLoading ? labels.previewing : labels.previewButton}
        </Button>
        <Button variant="primary" size="sm" onClick={() => void apply()} disabled={applyDisabled}>
          {applying ? labels.applying : labels.applyButton}
        </Button>
      </div>

      {applyError ? <Alert tone="error">{labels.issueLabels[applyError] ?? labels.issueLabels.default}</Alert> : null}
      {applySummary ? <Alert tone="success">{labels.appliedSummary(applySummary.updatedVariants, applySummary.updatedFields)}</Alert> : null}
    </SectionShell>
  );
}

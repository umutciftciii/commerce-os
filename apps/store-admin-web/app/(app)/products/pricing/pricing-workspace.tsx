"use client";

// TODO-151A (ADR-075) — Fiyatlandırma çalışma alanı (tam genişlik).
//
// Commercial Engine'in (Price / Compare-at / Cost / VAT) kullanıcı dostu, tam genişlik
// yeniden tasarımı. Motor, hesaplama, preview, apply, audit, stale-guard ve güvenlik
// mimarisi DEĞİŞMEDEN `useCommercialMatrix` üzerinden tüketilir; burada yalnız SUNUM +
// dil + yerleşim yeniden kurulur. İki mod: "Hızlı düzenleme" (varsayılan, hücre-hücre)
// ve "Toplu işlem" (yönlendirmeli kural). Renk anlamı semantik token'lardan gelir.

import { useState } from "react";
import { getDictionary, type Locale } from "@commerce-os/i18n";
import type { CommercialField, CommercialPreviewResponse, CommercialPreviewRow } from "@commerce-os/api-client";
import { useLocale } from "../../../../components/ui";
import { MetricGrid, MetricTile } from "../../../components/premium";
import { formatMinor, minorToInput } from "../../../../lib/client/format";
import { useCommercialMatrix, type MatrixField } from "../commercial/use-commercial-matrix";
import { pw, PRICING_ROOT } from "./pricing-tokens";
import {
  GUIDED_OPS,
  guidedOpMeta,
  guidedRuleShape,
  type ChangeKind,
  type GuidedOp,
} from "./guided-operations";

type ProductsDict = ReturnType<typeof getDictionary>["storeAdmin"]["products"];
type PricingDict = ProductsDict["pricing"];
type CommercialDict = ProductsDict["commercialMatrix"];

export interface PricingWorkspaceProps {
  productId: string;
}

/* ───────────────────────────── formatlama ───────────────────────────── */

function formatPct(value: number | null, locale: Locale): string {
  if (value === null) return "—";
  const n = value.toFixed(1);
  return locale === "en" ? `${n}%` : `%${n.replace(".", ",")}`;
}

function formatVat(bps: number, locale: Locale): string {
  const n = bps / 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return locale === "en" ? `${s}%` : `%${s.replace(".", ",")}`;
}

function fill(template: string, value: string | number, other?: string | number): string {
  let out = template.replace("{value}", String(value));
  if (other !== undefined) out = out.replace("{other}", String(other));
  return out;
}

/* ───────────────────────────── ikonlar ───────────────────────────── */

function InfoGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function WarnGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5 21 19H3L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function BlockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m9 9 6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ───────────────────────────── tooltip ───────────────────────────── */

/** Erişilebilir yardım balonu: "?" ikonu + role=tooltip metni (DOM'da; hover'da görünür). */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <span className={`inline-flex ${pw.faint}`} aria-hidden>
        <InfoGlyph />
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg border p-2 text-[11px] font-normal normal-case leading-relaxed opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 ${pw.lineStrong} ${pw.surfaceRaised} ${pw.muted}`}
      >
        {text}
      </span>
    </span>
  );
}

/* ───────────────────────────── değer hücreleri ───────────────────────────── */

function OldNew({ old: oldText, next }: { old: string; next: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`line-through ${pw.faint}`}>{oldText}</span>
      <span className={pw.faint} aria-hidden>→</span>
      <span className={`font-semibold ${pw.success}`}>{next}</span>
    </span>
  );
}

/* ───────────────────────────── KPI kartları ───────────────────────────── */

function KpiCards({ rows, p, locale }: { rows: CommercialPreviewRow[]; p: PricingDict; locale: Locale }) {
  const currency = rows[0]?.currency ?? "TRY";
  const prices = rows.map((r) => r.current.priceMinor);
  const margins = rows.map((r) => r.currentCalc.marginPct).filter((m): m is number => m !== null);
  const missingCost = rows.filter((r) => r.current.costMinor === null).length;
  const money = (m: number) => formatMinor(m, currency);
  const has = rows.length > 0;
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;

  return (
    <MetricGrid columns={5} className="lg:grid-cols-6">
      <MetricTile label={p.kpi.variantCount} value={has ? rows.length : "—"} tone="brand" />
      <MetricTile label={p.kpi.minPrice} value={has ? money(Math.min(...prices)) : "—"} />
      <MetricTile label={p.kpi.maxPrice} value={has ? money(Math.max(...prices)) : "—"} />
      <MetricTile label={p.kpi.avgPrice} value={avg !== null ? money(avg) : "—"} />
      <MetricTile label={p.kpi.avgMargin} value={formatPct(avgMargin, locale)} tone="success" />
      <MetricTile
        label={p.kpi.missingCost}
        value={has ? missingCost : "—"}
        tone={missingCost > 0 ? "warning" : "neutral"}
      />
    </MetricGrid>
  );
}

/* ───────────────────────────── mod anahtarı ───────────────────────────── */

function ModeCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-2xl border p-4 text-left transition ${
        active
          ? `${pw.lineStrong} ${pw.selected}`
          : `${pw.line} ${pw.surface} ${pw.hover}`
      }`}
    >
      <span className={`flex items-center gap-2 text-sm font-semibold ${active ? pw.ink : pw.muted}`}>
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${active ? "bg-[color:var(--pw-accent)]" : "bg-[color:var(--pw-line-strong)]"}`}
        />
        {title}
      </span>
      <span className={`mt-1 block text-xs leading-relaxed ${pw.faint}`}>{description}</span>
    </button>
  );
}

/* ───────────────────────────── seçim araç çubuğu ───────────────────────────── */

function SelectionToolbar({
  rows,
  controller,
  p,
}: {
  rows: CommercialPreviewRow[];
  controller: ReturnType<typeof useCommercialMatrix>;
  p: PricingDict;
}) {
  const activeIds = rows.filter((r) => r.status !== "ARCHIVED").map((r) => r.variantId);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" onClick={controller.selectAll} className={`rounded-lg border px-2.5 py-1.5 font-medium ${pw.line} ${pw.muted} ${pw.hover}`}>
        {p.selection.selectAll}
      </button>
      <button type="button" onClick={() => controller.setSelection(activeIds)} className={`rounded-lg border px-2.5 py-1.5 font-medium ${pw.line} ${pw.muted} ${pw.hover}`}>
        {p.selection.onlyActive}
      </button>
      <button type="button" onClick={controller.clearSelection} className={`rounded-lg border px-2.5 py-1.5 font-medium ${pw.line} ${pw.muted} ${pw.hover}`}>
        {p.selection.clearSelection}
      </button>
      <span className={`ml-auto font-medium ${pw.muted}`}>
        {fill(p.selection.selectedCount, controller.selectedIds.size)}
      </span>
    </div>
  );
}

/* ───────────────────────────── varyant tablosu ───────────────────────────── */

function VariantTable({
  rows,
  controller,
  editable,
  showSelect,
  p,
  cm,
  locale,
}: {
  rows: CommercialPreviewRow[];
  controller: ReturnType<typeof useCommercialMatrix>;
  editable: boolean;
  showSelect: boolean;
  p: PricingDict;
  cm: CommercialDict;
  locale: Locale;
}) {
  const { selectedIds, toggleSelect, drafts, setCell } = controller;
  const draftValue = (variantId: string, field: MatrixField, fallback: string) =>
    drafts.get(variantId)?.[field] ?? fallback;
  const isEdited = (variantId: string) => {
    const cell = drafts.get(variantId);
    return cell ? Object.values(cell).some((v) => v !== undefined && v.trim() !== "") : false;
  };

  const moneyCell = (row: CommercialPreviewRow, field: CommercialField, cur: number | null, tgt: number | null) => {
    const changed = row.changed && row.changedFields.includes(field);
    const fmt = (m: number | null) => (m === null ? "—" : formatMinor(m, row.currency));
    return changed ? <OldNew old={fmt(cur)} next={fmt(tgt)} /> : <span className={pw.muted}>{fmt(cur)}</span>;
  };

  const editInput = (row: CommercialPreviewRow, mf: MatrixField, cur: number | null, placeholder: string) => (
    <input
      inputMode="decimal"
      aria-label={`${row.title} — ${placeholder}`}
      value={draftValue(row.variantId, mf, minorToInput(cur))}
      onChange={(e) => setCell(row.variantId, mf, e.target.value)}
      placeholder={placeholder}
      className={`w-24 rounded-lg border px-2 py-1 text-right ${pw.line} ${pw.inputBg} ${pw.ink} placeholder:${pw.faint}`}
    />
  );

  return (
    <div className={`overflow-x-auto rounded-xl border ${pw.line}`}>
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead>
          <tr className={`border-b ${pw.line} ${pw.faint}`}>
            {showSelect ? <th className="px-2 py-2.5 font-semibold">{p.col.select}</th> : null}
            <th className="px-3 py-2.5 font-semibold">{p.col.variant}</th>
            <th className="px-3 py-2.5 font-semibold">{p.col.status}</th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.salesPrice}<InfoTip text={p.colTooltip.salesPrice} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.listPrice}<InfoTip text={p.colTooltip.listPrice} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.cost}<InfoTip text={p.colTooltip.cost} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.vat}<InfoTip text={p.colTooltip.vat} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.margin}<InfoTip text={p.colTooltip.margin} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.markup}<InfoTip text={p.colTooltip.markup} /></span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center">{p.col.discount}<InfoTip text={p.colTooltip.discount} /></span>
            </th>
            <th className="px-3 py-2.5 font-semibold">{p.col.change}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const calc = row.changed ? row.targetCalc : row.currentCalc;
            const edited = editable && isEdited(row.variantId);
            const selected = selectedIds.has(row.variantId);
            return (
              <tr
                key={row.variantId}
                className={`border-b align-top last:border-0 ${pw.line} ${selected ? pw.selected : ""}`}
              >
                {showSelect ? (
                  <td className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`${p.col.select} — ${row.title}`}
                      className="h-3.5 w-3.5 accent-indigo-500"
                      checked={selected}
                      onChange={() => toggleSelect(row.variantId)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2.5">
                  <div className={`font-medium ${pw.ink}`}>{row.title}</div>
                  <div className={`font-mono text-[11px] ${pw.faint}`}>{row.sku}</div>
                </td>
                <td className={`px-3 py-2.5 ${pw.faint}`}>{cm.statusLabels[row.status] ?? row.status}</td>
                <td className="px-3 py-2.5 text-right">
                  {editable && !row.changed ? editInput(row, "price", row.current.priceMinor, p.placeholder.salesPrice) : moneyCell(row, "PRICE", row.current.priceMinor, row.target.priceMinor)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {editable && !row.changed ? editInput(row, "compareAt", row.current.compareAtMinor, p.placeholder.listPrice) : moneyCell(row, "COMPARE_AT_PRICE", row.current.compareAtMinor, row.target.compareAtMinor)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {editable && !row.changed ? editInput(row, "cost", row.current.costMinor, p.placeholder.cost) : moneyCell(row, "COST", row.current.costMinor, row.target.costMinor)}
                </td>
                <td className={`px-3 py-2.5 text-right ${pw.muted}`}>
                  {row.changed && row.changedFields.includes("VAT_RATE") ? (
                    <OldNew old={formatVat(row.current.vatRateBps, locale)} next={formatVat(row.target.vatRateBps, locale)} />
                  ) : (
                    formatVat(row.current.vatRateBps, locale)
                  )}
                </td>
                <td className={`px-3 py-2.5 text-right ${pw.muted}`}>{formatPct(calc.marginPct, locale)}</td>
                <td className={`px-3 py-2.5 text-right ${pw.muted}`}>{formatPct(calc.markupPct, locale)}</td>
                <td className={`px-3 py-2.5 text-right ${pw.muted}`}>{formatPct(calc.discountPct, locale)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    {row.changed ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pw.successBg} ${pw.success}`}>
                        {cm.changedBadge}
                      </span>
                    ) : edited ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pw.accentBg} ${pw.accent}`}>
                        {cm.changedBadge}
                      </span>
                    ) : (
                      <span className={pw.faint}>{p.unchanged}</span>
                    )}
                    <IssueChips codes={row.errors} tone="danger" p={p} />
                    <IssueChips codes={row.warnings} tone="warning" p={p} />
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

function IssueChips({ codes, tone, p }: { codes: string[]; tone: "danger" | "warning"; p: PricingDict }) {
  if (codes.length === 0) return null;
  const cls = tone === "danger" ? `${pw.dangerBg} ${pw.danger}` : `${pw.warningBg} ${pw.warning}`;
  const messages = p.issueMessages as Record<string, string>;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span key={code} title={code} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
          <span aria-hidden className="inline-flex">{tone === "danger" ? <BlockGlyph /> : <WarnGlyph />}</span>
          {messages[code] ?? messages.default}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────────── uyarı / hata paneli ───────────────────────────── */

function IssuePanel({
  tone,
  title,
  codes,
  note,
  p,
}: {
  tone: "danger" | "warning";
  title: string;
  codes: string[];
  note?: string;
  p: PricingDict;
}) {
  if (codes.length === 0 && !note) return null;
  const cls = tone === "danger" ? `${pw.dangerBg} ${pw.danger}` : `${pw.warningBg} ${pw.warning}`;
  const messages = p.issueMessages as Record<string, string>;
  return (
    <div className={`space-y-2 rounded-xl p-3 ${cls}`} role={tone === "danger" ? "alert" : "status"}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="inline-flex">{tone === "danger" ? <BlockGlyph /> : <WarnGlyph />}</span>
        {title}
      </div>
      {note ? <p className="text-xs">{note}</p> : null}
      {codes.length > 0 ? (
        <ul className="space-y-1">
          {codes.map((code) => (
            <li key={code} className="text-xs">
              <span>{messages[code] ?? messages.default}</span>
              <span className={`ml-1.5 font-mono text-[10px] ${pw.faint}`}>
                {p.issue.technicalDetail}: {code}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── önizleme özeti ───────────────────────────── */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b py-1.5 last:border-0 ${pw.line}`}>
      <span className={pw.faint}>{label}</span>
      <span className={`text-right ${pw.ink}`}>{children}</span>
    </div>
  );
}

function PreviewSummary({
  preview,
  p,
  locale,
}: {
  preview: CommercialPreviewResponse;
  p: PricingDict;
  locale: Locale;
}) {
  const changed = preview.rows.filter((r) => r.changed);
  const s = preview.summary;
  const currency = preview.rows[0]?.currency ?? "TRY";
  const money = (m: number | null) => (m === null ? "—" : formatMinor(m, currency));

  const fieldCell = (field: CommercialField, cur: number | null, tgt: number | null, changedFields: CommercialField[]) =>
    changedFields.includes(field) ? <OldNew old={money(cur)} next={money(tgt)} /> : <span className={pw.faint}>{p.unchanged}</span>;

  return (
    <div className={`space-y-3 rounded-2xl border p-4 ${pw.line} ${pw.surface}`} data-testid="preview-summary">
      <p className={`text-sm font-semibold ${pw.ink}`}>{p.preview.summaryTitle}</p>
      <p className={`text-xs ${pw.muted}`}>{fill(p.preview.variantsAffected, s.changedVariants)}</p>

      {changed.length === 1 ? (
        (() => {
          const row = changed[0];
          const c = row.targetCalc;
          return (
            <div className="text-xs">
              <FieldRow label={p.preview.fieldSalesPrice}>{fieldCell("PRICE", row.current.priceMinor, row.target.priceMinor, row.changedFields)}</FieldRow>
              <FieldRow label={p.preview.fieldListPrice}>{fieldCell("COMPARE_AT_PRICE", row.current.compareAtMinor, row.target.compareAtMinor, row.changedFields)}</FieldRow>
              <FieldRow label={p.preview.fieldCost}>{fieldCell("COST", row.current.costMinor, row.target.costMinor, row.changedFields)}</FieldRow>
              <FieldRow label={p.preview.fieldVat}>
                {row.changedFields.includes("VAT_RATE") ? (
                  <OldNew old={formatVat(row.current.vatRateBps, locale)} next={formatVat(row.target.vatRateBps, locale)} />
                ) : (
                  <span className={pw.faint}>{p.unchanged}</span>
                )}
              </FieldRow>
              <FieldRow label={p.preview.fieldGrossProfit}>{money(c.grossProfitMinor)}</FieldRow>
              <FieldRow label={p.preview.fieldMargin}>{formatPct(c.marginPct, locale)}</FieldRow>
              <FieldRow label={p.preview.fieldMarkup}>{formatPct(c.markupPct, locale)}</FieldRow>
              <FieldRow label={p.preview.fieldDiscount}>{formatPct(c.discountPct, locale)}</FieldRow>
            </div>
          );
        })()
      ) : (
        <div className={`space-y-1 text-xs ${pw.muted}`}>
          <p>{fill(p.preview.affectedVariants, s.changedVariants)}</p>
          <p>{fill(p.preview.unchangedVariants, s.unchangedVariants)}</p>
          {s.minNewPriceMinor !== null && s.maxNewPriceMinor !== null ? (
            <p>{fill(p.preview.priceRange, money(s.minNewPriceMinor), money(s.maxNewPriceMinor))}</p>
          ) : null}
          {s.avgPriceChangePct !== null ? <p>{fill(p.preview.avgChange, formatPct(s.avgPriceChangePct, locale))}</p> : null}
          {s.negativeMarginCount > 0 ? <p className={pw.warning}>{fill(p.preview.negativeMargin, s.negativeMarginCount)}</p> : null}
        </div>
      )}

      <div className={`flex flex-wrap gap-2 border-t pt-2 text-[11px] ${pw.line}`}>
        {s.warningCount > 0 ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${pw.warningBg} ${pw.warning}`}>
            <WarnGlyph />
            {fill(p.preview.warningCount, s.warningCount)}
          </span>
        ) : null}
        {s.errorCount > 0 ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${pw.dangerBg} ${pw.danger}`}>
            <BlockGlyph />
            {fill(p.preview.blockingCount, s.errorCount)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── yönlendirmeli toplu işlem paneli ───────────────────────────── */

function GuidedOpCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition ${active ? `${pw.lineStrong} ${pw.selected}` : `${pw.line} ${pw.surface} ${pw.hover}`}`}
    >
      <span className={`block text-[13px] font-semibold ${active ? pw.ink : pw.muted}`}>{title}</span>
      <span className={`mt-0.5 block text-[11px] leading-relaxed ${pw.faint}`}>{description}</span>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-medium ${pw.muted}`}>{label}</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${pw.line} ${pw.inputBg} ${pw.ink}`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-medium ${pw.muted}`}>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm ${pw.line} ${pw.inputBg} ${pw.ink}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BulkPanel({
  controller,
  guidedOp,
  setGuidedOp,
  changeKind,
  setChangeKind,
  p,
  cm,
}: {
  controller: ReturnType<typeof useCommercialMatrix>;
  guidedOp: GuidedOp;
  setGuidedOp: (op: GuidedOp) => void;
  changeKind: ChangeKind;
  setChangeKind: (k: ChangeKind) => void;
  p: PricingDict;
  cm: CommercialDict;
}) {
  const { ruleForm, setRuleForm } = controller;
  const meta = guidedOpMeta(guidedOp);

  return (
    <div className={`space-y-4 rounded-2xl border p-4 ${pw.line} ${pw.surface}`}>
      <p className={`text-sm font-semibold ${pw.ink}`}>{p.bulk.questionTitle}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {GUIDED_OPS.map((op) => (
          <GuidedOpCard
            key={op.id}
            active={guidedOp === op.id}
            title={p.bulk.ops[op.id]}
            description={p.bulk.opDescriptions[op.id]}
            onClick={() => setGuidedOp(op.id)}
          />
        ))}
      </div>

      {/* Senaryoya göre dinamik alanlar */}
      <div className="space-y-3">
        {meta.hasChangeKind ? (
          <div className="flex gap-2">
            {(["percent", "fixed"] as ChangeKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={changeKind === k}
                onClick={() => setChangeKind(k)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${changeKind === k ? `${pw.lineStrong} ${pw.selected} ${pw.ink}` : `${pw.line} ${pw.muted} ${pw.hover}`}`}
              >
                {k === "percent" ? p.bulk.changeKindPercent : p.bulk.changeKindFixed}
              </button>
            ))}
          </div>
        ) : null}

        {guidedOp === "CREATE_LIST_PRICE" ? (
          <>
            <TextField
              label={p.bulk.listPriceMarkupLabel}
              value={ruleForm.amount}
              onChange={(v) => setRuleForm({ amount: v })}
              placeholder={p.bulk.placeholderPercent}
            />
            <div className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${pw.line} ${pw.surfaceRaised} ${pw.muted}`}>
              <p>{p.bulk.listPriceHelp}</p>
              <p className="mt-1">{p.bulk.listPriceExample}</p>
            </div>
          </>
        ) : meta.valueKind === "byChangeKind" ? (
          <TextField
            label={changeKind === "percent" ? p.bulk.valueLabelPercent : p.bulk.valueLabelMoney}
            value={ruleForm.amount}
            onChange={(v) => setRuleForm({ amount: v })}
            placeholder={changeKind === "percent" ? p.bulk.placeholderPercent : p.bulk.placeholderMoney}
          />
        ) : meta.valueKind === "money" ? (
          <TextField
            label={guidedOp === "SET_PRICE" ? p.bulk.setPriceLabel : p.bulk.costValueLabel}
            value={ruleForm.amount}
            onChange={(v) => setRuleForm({ amount: v })}
            placeholder={p.bulk.placeholderMoney}
          />
        ) : meta.valueKind === "vat" ? (
          <SelectField
            label={p.bulk.vatNewLabel}
            value={String(ruleForm.vatBps)}
            onChange={(v) => setRuleForm({ vatBps: Number.parseInt(v, 10) })}
            options={cm.vatOptions.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        ) : meta.valueKind === "priceEnding" ? (
          <SelectField
            label={p.bulk.priceEndingLabel}
            value={ruleForm.priceEnding}
            onChange={(v) => setRuleForm({ priceEnding: v as typeof ruleForm.priceEnding })}
            options={Object.entries(cm.priceEndingLabels).map(([value, label]) => ({ value, label }))}
          />
        ) : meta.valueKind === "rounding" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label={p.bulk.roundingLabel}
              value={ruleForm.roundingMode === "NONE" ? "NEAREST" : ruleForm.roundingMode}
              onChange={(v) => setRuleForm({ roundingMode: v as typeof ruleForm.roundingMode })}
              options={Object.entries(cm.roundingModeLabels)
                .filter(([k]) => k !== "NONE")
                .map(([value, label]) => ({ value, label }))}
            />
            <SelectField
              label={p.bulk.roundingStepLabel}
              value={String(ruleForm.roundingStep)}
              onChange={(v) => setRuleForm({ roundingStep: Number.parseInt(v, 10) as typeof ruleForm.roundingStep })}
              options={[1, 10, 100, 1000].map((s) => ({ value: String(s), label: minorToInput(s) }))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── boş / durum kutuları ───────────────────────────── */

function StateBox({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className={`rounded-2xl border p-8 text-center text-sm ${pw.line} ${pw.surface} ${tone === "danger" ? pw.danger : pw.muted}`}>
      {children}
    </div>
  );
}

/* ───────────────────────────── ana bileşen ───────────────────────────── */

export function PricingWorkspace({ productId }: PricingWorkspaceProps) {
  const locale = useLocale();
  const t = getDictionary(locale).storeAdmin.products;
  const p = t.pricing;
  const cm = t.commercialMatrix;

  const controller = useCommercialMatrix(productId);
  const {
    matrix,
    matrixLoading,
    matrixError,
    mode,
    setMode,
    selectedIds,
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

  const [guidedOp, setGuidedOpState] = useState<GuidedOp>("INCREASE_PRICE");
  const [changeKind, setChangeKindState] = useState<ChangeKind>("percent");

  // Yönlendirmeli senaryo → kontrat (targetField/operation). Motor DEĞİŞMEZ.
  const applyGuidedShape = (op: GuidedOp, kind: ChangeKind) => {
    const shape = guidedRuleShape(op, kind);
    controller.setRuleForm({ targetField: shape.targetField, operation: shape.operation });
  };
  const setGuidedOp = (op: GuidedOp) => {
    setGuidedOpState(op);
    applyGuidedShape(op, changeKind);
  };
  const setChangeKind = (k: ChangeKind) => {
    setChangeKindState(k);
    applyGuidedShape(guidedOp, k);
  };

  const rows = preview?.rows ?? matrix?.rows ?? [];
  const isBulk = mode === "rule";
  const allArchived = rows.length > 0 && rows.every((r) => r.status === "ARCHIVED");

  // Önizle koşulları: bulk → seçim zorunlu; quick → en az bir taslak.
  const bulkNeedsSelection = isBulk && selectedIds.size === 0;
  const canPreview = isBulk ? !bulkNeedsSelection : hasDraft;
  const changedVariants = preview?.summary.changedVariants ?? 0;
  const changedFieldCount = preview?.summary.changedFieldCount ?? 0;
  const blocked = preview?.blocked ?? false;
  const applyDisabled = !preview || blocked || changedVariants === 0 || applying;

  const errorCodes = preview ? [...new Set(preview.rows.flatMap((r) => r.errors))] : [];
  const warningCodes = preview ? [...new Set(preview.rows.flatMap((r) => r.warnings))] : [];

  return (
    <div className={`${PRICING_ROOT} space-y-6`}>
      {/* Başlık */}
      <header className="space-y-1.5">
        <h1 className={`text-xl font-bold tracking-tight ${pw.ink}`}>{p.pageTitle}</h1>
        <p className={`text-sm ${pw.muted}`}>{p.pageDescription}</p>
        <p className={`text-xs ${pw.faint}`}>{p.previewNote}</p>
      </header>

      {/* Yükleniyor / hata / boş */}
      {matrixLoading ? <StateBox>{p.state.loading}</StateBox> : null}
      {matrixError ? (
        <StateBox tone="danger">
          <p>{p.state.loadError}</p>
          <button type="button" onClick={controller.reloadMatrix} className={`mt-2 rounded-lg border px-3 py-1.5 text-xs ${pw.line} ${pw.muted} ${pw.hover}`}>
            {p.state.retry}
          </button>
        </StateBox>
      ) : null}
      {!matrixLoading && !matrixError && rows.length === 0 ? <StateBox>{p.state.empty}</StateBox> : null}
      {!matrixLoading && !matrixError && allArchived ? <StateBox>{p.state.allArchived}</StateBox> : null}

      {!matrixLoading && !matrixError && rows.length > 0 ? (
        <>
          {/* KPI */}
          <KpiCards rows={matrix?.rows ?? rows} p={p} locale={locale} />

          {/* Mod anahtarı */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <ModeCard active={!isBulk} title={p.mode.quickTitle} description={p.mode.quickDescription} onClick={() => setMode("direct")} />
            <ModeCard active={isBulk} title={p.mode.bulkTitle} description={p.mode.bulkDescription} onClick={() => setMode("rule")} />
          </div>

          {isBulk ? (
            /* ── Toplu işlem: solda ayarlar, sağda önizleme; altta tam genişlik tablo ── */
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <BulkPanel
                  controller={controller}
                  guidedOp={guidedOp}
                  setGuidedOp={setGuidedOp}
                  changeKind={changeKind}
                  setChangeKind={setChangeKind}
                  p={p}
                  cm={cm}
                />
                <div className="space-y-3">
                  {bulkNeedsSelection ? (
                    <div className={`rounded-2xl border p-4 text-sm ${pw.line} ${pw.surface} ${pw.muted}`}>
                      {p.selection.noneSelected}
                    </div>
                  ) : null}
                  {preview ? <PreviewSummary preview={preview} p={p} locale={locale} /> : null}
                  {previewError ? <IssuePanel tone="danger" title={p.issue.blockingTitle} codes={[previewError]} p={p} /> : null}
                </div>
              </div>

              <SelectionToolbar rows={matrix?.rows ?? rows} controller={controller} p={p} />
              <VariantTable rows={rows} controller={controller} editable={false} showSelect p={p} cm={cm} locale={locale} />
            </div>
          ) : (
            /* ── Hızlı düzenleme: tam genişlik tablo birincil yüzey ── */
            <div className="space-y-5">
              {/* Önizleme varken hücreler salt-okunur old→new gösterir; düzenlemeye dönmek için
                  açık bir çıkış (önizlemeyi temizler, taslak değerler korunur). */}
              {preview ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => controller.clearPreview()}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${pw.line} ${pw.muted} ${pw.hover}`}
                  >
                    <span aria-hidden>←</span>
                    {p.state.backToEdit}
                  </button>
                </div>
              ) : null}
              <VariantTable rows={rows} controller={controller} editable={!preview} showSelect={false} p={p} cm={cm} locale={locale} />
              {preview ? <PreviewSummary preview={preview} p={p} locale={locale} /> : null}
              {!preview && !hasDraft ? <p className={`text-xs ${pw.faint}`}>{p.state.noChanges}</p> : null}
              {previewError ? <IssuePanel tone="danger" title={p.issue.blockingTitle} codes={[previewError]} p={p} /> : null}
            </div>
          )}

          {/* Uyarı / engelleyici */}
          {blocked ? <IssuePanel tone="danger" title={p.issue.blockingTitle} codes={errorCodes} note={p.issue.blockedNote} p={p} /> : null}
          {!blocked && warningCodes.length > 0 ? (
            <IssuePanel
              tone="warning"
              title={p.issue.warningTitle}
              codes={warningCodes}
              note={preview && preview.summary.negativeMarginCount > 0 ? fill(p.issue.warningNote, preview.summary.negativeMarginCount) : undefined}
              p={p}
            />
          ) : null}

          {/* Aksiyon */}
          <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${pw.line} ${pw.surface}`}>
            <div className="min-w-0 text-xs">
              {preview && changedVariants > 0 ? (
                <p className={pw.muted}>{fill(p.apply.changeSummary, changedVariants, changedFieldCount)}</p>
              ) : (
                <p className={pw.faint}>{p.apply.note}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={!canPreview || previewLoading}
                className={`rounded-lg border px-3.5 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 ${pw.lineStrong} ${pw.muted} ${pw.hover}`}
              >
                {previewLoading ? p.preview.previewing : p.preview.button}
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applyDisabled}
                className="rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)] transition hover:from-indigo-400 hover:to-indigo-500 disabled:pointer-events-none disabled:opacity-50"
              >
                {applying ? p.apply.applying : p.apply.button}
              </button>
            </div>
          </div>

          {applyError ? <IssuePanel tone="danger" title={p.issue.blockingTitle} codes={[applyError]} p={p} /> : null}
          {applySummary ? (
            <div className={`flex items-center gap-2 rounded-2xl p-4 text-sm font-medium ${pw.successBg} ${pw.success}`} role="status">
              <CheckGlyph />
              {fill(p.apply.successSummary, applySummary.updatedVariants)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

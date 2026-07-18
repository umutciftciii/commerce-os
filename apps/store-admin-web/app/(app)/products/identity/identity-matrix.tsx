"use client";

// TODO-150 (ADR-073) — "Identity Matrix" bölümü (SKU / Barcode / Variant Title pattern motoru).
//
// Kullanıcı pattern yazar → sunucudan deterministik preview gelir (yalnız-okuma). Tablo her varyantın
// mevcut → yeni değerini, değişim ve çakışma (collision) durumunu gösterir. Apply yalnız değişen
// varyantları yazar (server-authoritative, tek transaction, append-only audit). Blocked iken pasif.
// Yalnız kaydedilmiş ürün + eksen varsa görünür (product-form tarafından `visible` ile kontrol edilir).

import { Alert, Badge, Button, Input, Spinner } from "../../../../components/ui";
import type { IdentityMatrixController } from "./use-identity-matrix";
import type { IdentityPreviewField, IdentityPreviewRow } from "@commerce-os/api-client";

export interface IdentityMatrixLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  tokenHint: string;
  skuLabel: string;
  skuPlaceholder: string;
  barcodeLabel: string;
  barcodePlaceholder: string;
  titleLabel: string;
  titlePlaceholder: string;
  seqStartLabel: string;
  regenerateLabel: string;
  previewLoading: string;
  colVariant: string;
  colSku: string;
  colBarcode: string;
  colTitle: string;
  colStatus: string;
  emptyBarcode: string;
  applyButton: string;
  applying: string;
  blockedNote: string;
  noChangesNote: string;
  changedSummary: (changed: number, skipped: number) => string;
  appliedSummary: (updated: number, skipped: number) => string;
  collisionsTitle: string;
  collisionCount: (n: number) => string;
  statusLabels: Record<string, string>;
  // Stable kod → mesaj (issue rozetleri + pattern/apply hataları). `default` fallback.
  issueLabels: Record<string, string> & { default: string };
}

export interface IdentityMatrixProps {
  visible: boolean;
  controller: IdentityMatrixController;
  labels: IdentityMatrixLabels;
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
        <div>
          <h3 className="text-sm font-semibold text-white/90">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

// Bir alan hücresi: mevcut → yeni + değişim/çakışma rozetleri.
function FieldCell({
  field,
  current,
  emptyLabel,
  issueLabels,
}: {
  field: IdentityPreviewField | null;
  current: string;
  emptyLabel: string;
  issueLabels: Record<string, string> & { default: string };
}) {
  if (!field) {
    return <span className="text-white/30">{current || emptyLabel}</span>;
  }
  const hasCollision = field.issues.includes("SKU_COLLISION") || field.issues.includes("BARCODE_DUPLICATE");
  const otherIssues = field.issues.filter(
    (c) => c !== "SKU_COLLISION" && c !== "BARCODE_DUPLICATE" && c !== "TITLE_PROTECTED",
  );
  const isProtected = field.issues.includes("TITLE_PROTECTED");
  return (
    <div className="space-y-1">
      {field.changed ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-white/30 line-through">{current || emptyLabel}</span>
          <span className={hasCollision ? "font-medium text-rose-300" : "font-medium text-emerald-200"}>
            {field.next}
          </span>
        </div>
      ) : (
        <span className="text-white/60">{field.next || emptyLabel}</span>
      )}
      <div className="flex flex-wrap gap-1">
        {hasCollision ? (
          <Badge tone="danger">{issueLabels.SKU_COLLISION ?? issueLabels.default}</Badge>
        ) : null}
        {isProtected ? (
          <Badge tone="warning">{issueLabels.TITLE_PROTECTED ?? issueLabels.default}</Badge>
        ) : null}
        {otherIssues.map((code) => (
          <Badge key={code} tone="danger">
            {issueLabels[code] ?? issueLabels.default}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PreviewTable({
  rows,
  labels,
}: {
  rows: IdentityPreviewRow[];
  labels: IdentityMatrixLabels;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-white/45">
            <th className="px-3 py-2 font-medium">{labels.colVariant}</th>
            <th className="px-3 py-2 font-medium">{labels.colSku}</th>
            <th className="px-3 py-2 font-medium">{labels.colBarcode}</th>
            <th className="px-3 py-2 font-medium">{labels.colTitle}</th>
            <th className="px-3 py-2 font-medium">{labels.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.variantId} className="border-b border-white/[0.06] align-top last:border-0">
              <td className="px-3 py-2 text-white/70">
                <span className="text-white/40">#{row.seq}</span> {row.current.title}
              </td>
              <td className="px-3 py-2">
                <FieldCell
                  field={row.sku}
                  current={row.current.sku}
                  emptyLabel="—"
                  issueLabels={labels.issueLabels}
                />
              </td>
              <td className="px-3 py-2">
                <FieldCell
                  field={row.barcode}
                  current={row.current.barcode ?? ""}
                  emptyLabel={labels.emptyBarcode}
                  issueLabels={labels.issueLabels}
                />
              </td>
              <td className="px-3 py-2">
                <FieldCell
                  field={row.title}
                  current={row.current.title}
                  emptyLabel="—"
                  issueLabels={labels.issueLabels}
                />
              </td>
              <td className="px-3 py-2 text-white/50">
                {labels.statusLabels[row.status] ?? row.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IdentityMatrix({ visible, controller, labels }: IdentityMatrixProps) {
  if (!visible) return null;
  const {
    patterns,
    setPattern,
    setSeqStart,
    setRegenerateCustomTitles,
    preview,
    previewLoading,
    previewError,
    applying,
    applyError,
    applySummary,
    apply,
    hasPattern,
  } = controller;

  const blocked = preview?.blocked ?? false;
  const changed = preview?.counts.changed ?? 0;
  const applyDisabled = !hasPattern || blocked || changed === 0 || applying || previewLoading;

  return (
    <SectionShell title={labels.sectionTitle} subtitle={labels.sectionSubtitle}>
      {/* Pattern editörü */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label={labels.skuLabel}
          value={patterns.sku}
          onChange={(e) => setPattern("sku", e.target.value)}
          placeholder={labels.skuPlaceholder}
          disabled={applying}
        />
        <Input
          label={labels.barcodeLabel}
          value={patterns.barcode}
          onChange={(e) => setPattern("barcode", e.target.value)}
          placeholder={labels.barcodePlaceholder}
          disabled={applying}
        />
        <Input
          label={labels.titleLabel}
          value={patterns.title}
          onChange={(e) => setPattern("title", e.target.value)}
          placeholder={labels.titlePlaceholder}
          disabled={applying}
        />
      </div>
      <p className="text-xs text-white/40">{labels.tokenHint}</p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <span>{labels.seqStartLabel}</span>
          <input
            type="number"
            min={0}
            value={patterns.seqStart}
            onChange={(e) => setSeqStart(Number(e.target.value))}
            disabled={applying}
            className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-white/80"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-indigo-500"
            checked={patterns.regenerateCustomTitles}
            onChange={(e) => setRegenerateCustomTitles(e.target.checked)}
            disabled={applying}
          />
          {labels.regenerateLabel}
        </label>
      </div>

      {/* Pattern / preview hatası */}
      {previewError ? (
        <Alert tone="error">{labels.issueLabels[previewError] ?? labels.issueLabels.default}</Alert>
      ) : null}

      {previewLoading ? <Spinner label={labels.previewLoading} size="sm" /> : null}

      {/* Collision paneli */}
      {preview && preview.collisions.length > 0 ? (
        <Alert tone={blocked ? "error" : "warning"} title={labels.collisionsTitle}>
          {labels.collisionCount(preview.collisions.length)}
        </Alert>
      ) : null}

      {/* Preview tablosu */}
      {preview && preview.rows.length > 0 ? <PreviewTable rows={preview.rows} labels={labels} /> : null}

      {/* Özet + apply */}
      {preview ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-white/50">
            {changed === 0
              ? labels.noChangesNote
              : labels.changedSummary(changed, preview.counts.skipped)}
          </p>
          <Button variant="primary" size="sm" onClick={() => void apply()} disabled={applyDisabled}>
            {applying ? labels.applying : labels.applyButton}
          </Button>
        </div>
      ) : null}

      {blocked ? <Alert tone="error">{labels.blockedNote}</Alert> : null}

      {applyError ? (
        <Alert tone="error">{labels.issueLabels[applyError] ?? labels.issueLabels.default}</Alert>
      ) : null}
      {applySummary ? (
        <Alert tone="success">
          {labels.appliedSummary(applySummary.updated, applySummary.skipped)}
        </Alert>
      ) : null}
    </SectionShell>
  );
}

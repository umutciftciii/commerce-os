"use client";

/**
 * TODO-165A Tasks 25/26 — Ürün formu "Beden Tablosu" adımı.
 *
 * Eski davranış (bare "/size-charts'a git" bağlantısı) bir bind/change/remove/preview/
 * create YÜZEYİYLE değiştirildi. Kullanıcı HİÇBİR ZAMAN bir Ürün ID'si YAZMAZ: bağlama
 * her zaman `productId` (bu ürün, RHF/kayıtlı kayıttan) + seçilen chart id ile
 * `assignSizeChart(scope=PRODUCT)` çağrısı üzerinden olur.
 *
 * Sunucu GERÇEĞİ tek kaynaktır: `GET .../size-chart-assignment` iki alan döner —
 * `productAssignment` (bu ürüne DOĞRUDAN bağlıysa) ve `effective` (PRODUCT>CATEGORY>
 * STORE önceliğiyle ÇÖZÜLMÜŞ; kategori/mağaza varsayılanı olabilir). Kaldırma yalnız
 * `productAssignment` varken anlamlıdır — kaldırıldığında sunucu önceliği otomatik
 * kategori/mağazaya DÜŞER (ikinci bir "sıradaki chart" hesaplaması istemcide YAPILMAZ).
 *
 * Create modunda (henüz kaydedilmemiş ürün) `productId` yoktur — bağlama arayüzü
 * KAPALIDIR; kullanıcı ilk kayıttan sonra bu adıma dönmeye yönlendirilir.
 */

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@commerce-os/i18n";
import type { SizeChartContract } from "@commerce-os/api-client";
import { Alert, Badge, Button, Modal, SkeletonRows, useLocale } from "../../../../components/ui";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { getSizeSystem, isSizeSystemKey } from "@commerce-os/contracts/size-systems";
import { SizeChartSelectField } from "./size-chart-select-field";
import { SizeChartQuickCreate } from "./size-chart-quick-create";

type ChartSummary = {
  id: string;
  name: string;
  sizeSystemKey: string;
  measurementUnit: string;
  gender: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedRevisionId: string | null;
};
type AssignmentState = {
  productAssignment: { assignmentId: string; chart: ChartSummary } | null;
  effective: { scope: "STORE" | "CATEGORY" | "PRODUCT"; chart: ChartSummary } | null;
};

const SCOPE_LABELS: Record<"STORE" | "CATEGORY" | "PRODUCT", string> = {
  STORE: "Mağaza varsayılanı",
  CATEGORY: "Kategori varsayılanı",
  PRODUCT: "Ürüne özel",
};

function sizeSystemLabel(key: string, locale: Locale): string {
  if (!isSizeSystemKey(key)) return key;
  const def = getSizeSystem(key);
  return locale === "tr" ? def.labelTr : def.labelEn;
}

export interface SizeChartStepProps {
  /** null = create modu (ürün henüz kaydedilmedi); bağlama arayüzü kapalıdır. */
  productId: string | null;
  /** Ürünün ana kategorisi (RHF `primaryCategoryId`) — effective çözüme query olarak gider. */
  categoryId: string | null;
  disabled?: boolean;
}

export function SizeChartStep({ productId, categoryId, disabled }: SizeChartStepProps) {
  const locale = useLocale();

  const [state, setState] = useState<AssignmentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingChartId, setPendingChartId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "bind" | "remove">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewChartId, setPreviewChartId] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await storeApi.getProductSizeChartAssignment(productId, categoryId ?? undefined);
      setState(result.data);
      setPendingChartId(null);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    } finally {
      setLoading(false);
    }
  }, [productId, categoryId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onBind() {
    if (!productId || !pendingChartId) return;
    setBusy("bind");
    setActionError(null);
    setNotice(null);
    try {
      await storeApi.assignSizeChart(pendingChartId, { scope: "PRODUCT", productId });
      await load();
      setNotice("Beden tablosu bu ürüne bağlandı.");
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    if (!state?.productAssignment) return;
    setBusy("remove");
    setActionError(null);
    setNotice(null);
    try {
      await storeApi.unassignSizeChart(state.productAssignment.chart.id, state.productAssignment.assignmentId);
      await load();
      setNotice("Ürüne özel bağlantı kaldırıldı.");
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setBusy(null);
    }
  }

  if (!productId) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
        <StepHeader />
        <Alert tone="info">
          Beden tablosu bağlamak için önce ürünü kaydedin. Ürün oluşturulduktan sonra bu adıma
          dönüp ölçü tablosunu bağlayabilirsiniz.
        </Alert>
      </div>
    );
  }

  const busyOrDisabled = disabled || busy !== null;
  const current = state?.productAssignment?.chart ?? null;
  const effective = state?.effective ?? null;
  const canBind = pendingChartId !== null && pendingChartId !== current?.id;

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <StepHeader />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      {loading ? <SkeletonRows rows={2} /> : null}

      {loadError ? (
        <Alert
          tone="error"
          title="Bağlantı bilgisi yüklenemedi"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Tekrar dene
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      {!loading && !loadError ? (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          {current ? (
            <ChartSummaryRow
              chart={current}
              scope="PRODUCT"
              locale={locale}
              onPreview={() => setPreviewChartId(current.id)}
              action={
                <Button variant="secondary" size="sm" disabled={busyOrDisabled} onClick={() => void onRemove()}>
                  {busy === "remove" ? "…" : "Kaldır"}
                </Button>
              }
            />
          ) : effective ? (
            <ChartSummaryRow
              chart={effective.chart}
              scope={effective.scope}
              locale={locale}
              onPreview={() => setPreviewChartId(effective.chart.id)}
            />
          ) : (
            <p className="text-sm text-white/35">
              Henüz bağlı bir beden tablosu yok (ürün, kategori veya mağaza düzeyinde).
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <SizeChartSelectField
          locale={locale}
          label={current ? "Değiştir" : "Bağla"}
          value={pendingChartId}
          onChange={setPendingChartId}
          disabled={busyOrDisabled}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busyOrDisabled || !canBind} onClick={() => void onBind()}>
            {busy === "bind" ? "Bağlanıyor…" : current ? "Değiştir" : "Bağla"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busyOrDisabled}
            onClick={() => setQuickCreateOpen(true)}
          >
            Yeni beden tablosu oluştur
          </Button>
        </div>
      </div>

      {quickCreateOpen ? (
        <SizeChartQuickCreate
          locale={locale}
          onClose={() => setQuickCreateOpen(false)}
          onCreated={(chart) => {
            setQuickCreateOpen(false);
            // Yeni tablo DRAFT döner (assign yalnız PUBLISHED'ta çalışır) — otomatik SEÇİLİR
            // ama otomatik BAĞLANMAZ; kullanıcı yayınladıktan sonra "Bağla"ya basar.
            setPendingChartId(chart.id);
            setNotice(
              `"${chart.name}" taslak olarak oluşturuldu. Bağlamadan önce Beden Tabloları ekranından yayınlayın.`,
            );
          }}
        />
      ) : null}

      {previewChartId ? (
        <SizeChartPreviewModal chartId={previewChartId} locale={locale} onClose={() => setPreviewChartId(null)} />
      ) : null}
    </div>
  );
}

function StepHeader() {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
      <div>
        <h3 className="text-sm font-semibold text-white/90">Beden Tablosu</h3>
        <p className="mt-0.5 text-xs text-white/45">
          Ürüne özel bir ölçü tablosu bağlayın; bağlamazsanız kategori veya mağaza
          varsayılanı geçerli olur.
        </p>
      </div>
    </div>
  );
}

function ChartSummaryRow({
  chart,
  scope,
  locale,
  onPreview,
  action,
}: {
  chart: ChartSummary;
  scope: "STORE" | "CATEGORY" | "PRODUCT";
  locale: Locale;
  onPreview: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={scope === "PRODUCT" ? "success" : "neutral"}>{SCOPE_LABELS[scope]}</Badge>
          <span className="truncate text-sm font-medium text-white/85">{chart.name}</span>
        </div>
        <p className="mt-0.5 text-xs text-white/40">
          {sizeSystemLabel(chart.sizeSystemKey, locale)}
          {chart.gender ? ` · ${chart.gender}` : ""}
          {chart.measurementUnit ? ` · ${chart.measurementUnit}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onPreview}>
          Önizle
        </Button>
        {action}
      </div>
    </div>
  );
}

function SizeChartPreviewModal({
  chartId,
  locale,
  onClose,
}: {
  chartId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [chart, setChart] = useState<SizeChartContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storeApi
      .getSizeChart(chartId)
      .then((result) => {
        if (!cancelled) setChart(result.data);
      })
      .catch((caught) => {
        if (!cancelled) setError(messageForError(caught, locale));
      });
    return () => {
      cancelled = true;
    };
  }, [chartId, locale]);

  const revision = chart?.publishedRevision ?? null;

  return (
    <Modal open onClose={onClose} title={chart?.name ?? "Beden Tablosu"} closeLabel="Kapat">
      <div className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!chart && !error ? <SkeletonRows rows={3} /> : null}
        {chart && !revision ? (
          <p className="text-sm text-white/40">Bu tablonun henüz yayınlanmış bir revizyonu yok.</p>
        ) : null}
        {revision ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="px-2 py-2 font-medium">Beden</th>
                  {revision.columns.map((col) => (
                    <th key={col.key} className="px-2 py-2 font-medium">
                      {col.label}
                      {col.unit ? <span className="text-white/25"> ({col.unit})</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revision.rows.map((row) => (
                  <tr key={row.size} className="border-b border-white/[0.06]">
                    <td className="px-2 py-1.5 font-medium text-white/80">{row.size}</td>
                    {revision.columns.map((col) => (
                      <td key={col.key} className="px-2 py-1.5 text-white/60">
                        {row.cells[col.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

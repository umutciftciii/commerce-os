"use client";

/**
 * TODO-161 — Sponsorlu performans panosu (tarih aralığı + KPI şeridi + kırılım tabloları + CSV).
 * campaignId verilirse tek kampanyaya kısıtlanır (detay sayfası); yoksa mağaza geneli (liste sayfası).
 * Para minor birim (100'e bölünür); oran 0..1 → yüzde. Filtreler tenant-safe (gateway zorlar).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, SkeletonRows } from "../../../components/ui";
import { SurfaceCard, MetricGrid, MetricTile } from "../../components/premium";
import type { SponsoredAnalyticsResponse } from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import type { Locale, SponsoredLabels } from "./labels";

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(minor / 100);
}
function pct(rate: number): string {
  return `%${(rate * 100).toFixed(1)}`;
}

type Data = SponsoredAnalyticsResponse["data"];

export function SponsoredDashboard({
  t,
  locale,
  campaignId,
}: {
  t: SponsoredLabels;
  locale: Locale;
  campaignId?: string;
}) {
  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(() => isoToday());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const query = useMemo(
    () => ({ dateFrom, dateTo, ...(campaignId ? { campaignId } : {}) }),
    [dateFrom, dateTo, campaignId],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await storeApi.getSponsoredAnalytics(query);
      setData(result.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  }, [query, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCsv = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const csv = await storeApi.exportSponsoredAnalytics(query);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sponsored-performance-${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setCsvBusy(false);
    }
  };

  const s = data?.summary;
  return (
    <SurfaceCard
      title={t.dashTitle}
      description={t.dashDescription}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t.dateFrom} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label={t.dateTo} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button variant="secondary" onClick={() => void downloadCsv()} disabled={csvBusy}>
            {csvBusy ? t.csvBusy : t.csv}
          </Button>
        </div>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {s ? (
        <MetricGrid>
          <MetricTile label={t.metrics.impressions} value={String(s.impressions)} />
          <MetricTile label={t.metrics.uniqueImpressions} value={String(s.uniqueImpressions)} />
          <MetricTile label={t.metrics.clicks} value={String(s.clicks)} />
          <MetricTile label={t.metrics.ctr} value={pct(s.clickThroughRate)} />
          <MetricTile label={t.metrics.carts} value={String(s.carts)} />
          <MetricTile label={t.metrics.orders} value={String(s.orders)} />
          <MetricTile label={t.metrics.conversionRate} value={pct(s.conversionRate)} />
          <MetricTile label={t.metrics.grossRevenue} value={money(s.grossRevenueMinor, s.currency)} />
          <MetricTile label={t.metrics.netRevenue} value={money(s.netRevenueMinor, s.currency)} />
        </MetricGrid>
      ) : (
        <SkeletonRows rows={2} />
      )}
    </SurfaceCard>
  );
}

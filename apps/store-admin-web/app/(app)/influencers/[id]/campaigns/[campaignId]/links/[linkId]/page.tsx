"use client";

/**
 * Link detay dashboard (ADR-174 C seviyesi). Yalnız SEÇİLİ linkin verisi: KPI +
 * UTM + yaşam döngüsü zaman damgaları + son atıflı siparişler + son tıklama/dönüşüm.
 * Gerçek tracking URL/token GÖSTERİLMEZ (ADR-102). Para minor; oran 0..1 → yüzde.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Badge, SkeletonRows, useLocale } from "../../../../../../../../components/ui";
import type { LinkAnalyticsResponse } from "@commerce-os/api-client";
import { storeApi } from "../../../../../../../../lib/client/api";
import { messageForError } from "../../../../../../../../lib/client/messages";
import { formatDate } from "../../../../../../../../lib/client/format";
import { DetailHero, SurfaceCard } from "../../../../../../../components/premium";
import { AttributionMetrics, formatMoneyMinor, type AttributionLabels } from "../../../../../attribution";
import { AnalyticsChart, type ChartLabels } from "../../../../../analytics-chart";
import { DateRangePicker, type DateRangeValue, type RangeLabels } from "../../../../../date-range-picker";

type Locale = "tr" | "en";
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const LINK_TONES: Record<string, Tone> = { ACTIVE: "success", PAUSED: "warning", REVOKED: "danger", INACTIVE: "neutral" };

const L = {
  tr: {
    eyebrow: "Link analizi",
    loadError: "Link analizi yüklenemedi.",
    metricsTitle: "Link özeti",
    metricsDescription: "Yalnız bu linkin performansı.",
    timeSeriesTitle: "Günlük analytics",
    chart: { clicks: "Tıklama", uniqueVisitors: "Tekil", orders: "Sipariş", revenue: "Net ciro", empty: "Bu aralıkta veri yok." } satisfies ChartLabels,
    range: { last7: "7 gün", last30: "30 gün", last90: "90 gün", custom: "Özel", from: "Başlangıç", to: "Bitiş", apply: "Uygula" } satisfies RangeLabels,
    infoTitle: "Link bilgileri",
    window: "Atıf penceresi (gün)",
    created: "Oluşturuldu",
    activated: "Etkinleştirildi",
    paused: "Duraklatıldı",
    revoked: "İptal edildi",
    lastClick: "Son tıklama",
    lastConversion: "Son dönüşüm",
    utm: "UTM",
    label: "Etiket",
    ordersTitle: "Son atıflı siparişler",
    ordersEmpty: "Atıflı sipariş yok.",
    linkStatusLabels: { ACTIVE: "Aktif", PAUSED: "Duraklatıldı", REVOKED: "İptal edildi", INACTIVE: "Pasif" } as Record<string, string>,
    colOrder: "Sipariş",
    colDate: "Tarih",
    colRevenue: "Net ciro",
    none: "—",
    multiCurrency: "Çok para birimli — her biri ayrı gösterilir.",
    metrics: {
      totalClicks: "Toplam tıklama",
      uniqueVisitors: "Tekil ziyaretçi",
      attributedOrders: "Atıflı sipariş",
      conversionRate: "Dönüşüm oranı",
      grossRevenue: "Brüt ciro",
      netRevenue: "Net ciro",
    } satisfies AttributionLabels,
  },
  en: {
    eyebrow: "Link analytics",
    loadError: "Could not load link analytics.",
    metricsTitle: "Link summary",
    metricsDescription: "Performance for this link only.",
    timeSeriesTitle: "Daily analytics",
    chart: { clicks: "Clicks", uniqueVisitors: "Unique", orders: "Orders", revenue: "Net revenue", empty: "No data in this range." } satisfies ChartLabels,
    range: { last7: "7 days", last30: "30 days", last90: "90 days", custom: "Custom", from: "From", to: "To", apply: "Apply" } satisfies RangeLabels,
    infoTitle: "Link details",
    window: "Attribution window (days)",
    created: "Created",
    activated: "Activated",
    paused: "Paused",
    revoked: "Revoked",
    lastClick: "Last click",
    lastConversion: "Last conversion",
    utm: "UTM",
    label: "Label",
    ordersTitle: "Recent attributed orders",
    ordersEmpty: "No attributed orders.",
    linkStatusLabels: { ACTIVE: "Active", PAUSED: "Paused", REVOKED: "Revoked", INACTIVE: "Inactive" } as Record<string, string>,
    colOrder: "Order",
    colDate: "Date",
    colRevenue: "Net revenue",
    none: "—",
    multiCurrency: "Multiple currencies — shown separately.",
    metrics: {
      totalClicks: "Total clicks",
      uniqueVisitors: "Unique visitors",
      attributedOrders: "Attributed orders",
      conversionRate: "Conversion rate",
      grossRevenue: "Gross revenue",
      netRevenue: "Net revenue",
    } satisfies AttributionLabels,
  },
} satisfies Record<Locale, unknown>;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/[0.05] py-2 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className="text-right text-white/85">{value}</span>
    </div>
  );
}

export default function LinkAnalyticsPage() {
  const params = useParams<{ id: string; campaignId: string; linkId: string }>();
  const influencerId = params.id;
  const campaignId = params.campaignId;
  const linkId = params.linkId;
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;

  const [data, setData] = useState<LinkAnalyticsResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeValue>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const query: Record<string, string> = {};
      if (range.dateFrom) query.dateFrom = range.dateFrom;
      if (range.dateTo) query.dateTo = range.dateTo;
      const result = await storeApi.getLinkAnalytics(linkId, query);
      setData(result.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  }, [linkId, locale, range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <SkeletonRows rows={6} />;

  const link = data.link;
  const money = (minor: number, currency: string) => formatMoneyMinor(minor, currency, locale);
  const utm = [link.utmSource, link.utmMedium, link.utmCampaign, link.utmContent, link.utmTerm].filter(Boolean).join(" / ");

  return (
    <div className="space-y-5">
      <DetailHero
        backHref={`/influencers/${influencerId}/campaigns/${campaignId}`}
        backLabel={link.campaignName}
        eyebrow={t.eyebrow}
        title={link.targetPath}
        subtitle={<span className="font-mono text-white/60">{link.targetType}</span>}
        badges={<Badge tone={LINK_TONES[link.status] ?? "neutral"}>{t.linkStatusLabels[link.status] ?? link.status}</Badge>}
      />

      <SurfaceCard title={t.metricsTitle} description={t.metricsDescription}>
        <AttributionMetrics summary={data.summary} labels={t.metrics} locale={locale} />
        {data.summary.hasMultipleCurrencies ? (
          <p className="mt-3 text-xs text-amber-300/80">
            {t.multiCurrency} {data.summary.revenues.map((r) => money(r.netRevenueMinor, r.currency)).join(" · ")}
          </p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title={t.timeSeriesTitle}>
        <div className="mb-4">
          <DateRangePicker labels={t.range} onChange={setRange} />
        </div>
        <AnalyticsChart daily={data.daily} locale={locale} labels={t.chart} />
      </SurfaceCard>

      <SurfaceCard title={t.infoTitle}>
        <InfoRow label={t.window} value={String(link.attributionWindowDays)} />
        <InfoRow label={t.utm} value={utm || t.none} />
        {link.customLabel ? <InfoRow label={t.label} value={link.customLabel} /> : null}
        <InfoRow label={t.created} value={formatDate(link.createdAt)} />
        {link.activatedAt ? <InfoRow label={t.activated} value={formatDate(link.activatedAt)} /> : null}
        {link.pausedAt ? <InfoRow label={t.paused} value={formatDate(link.pausedAt)} /> : null}
        {link.revokedAt ? <InfoRow label={t.revoked} value={formatDate(link.revokedAt)} /> : null}
        <InfoRow label={t.lastClick} value={data.lastClickAt ? formatDate(data.lastClickAt) : t.none} />
        <InfoRow label={t.lastConversion} value={data.lastConversionAt ? formatDate(data.lastConversionAt) : t.none} />
      </SurfaceCard>

      <SurfaceCard title={t.ordersTitle}>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-white/50">{t.ordersEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-3">{t.colOrder}</th>
                  <th className="py-2 pr-3">{t.colDate}</th>
                  <th className="py-2 text-right">{t.colRevenue}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.orderNumber} className="border-t border-white/[0.05]">
                    <td className="py-2 pr-3 font-mono text-white/85">{o.orderNumber}</td>
                    <td className="py-2 pr-3 text-white/60">{formatDate(o.attributedAt)}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{money(o.netRevenueMinor, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
